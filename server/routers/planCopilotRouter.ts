/**
 * The plan-reading co-pilot: read a sheet, propose what is on it, answer
 * questions about it — and write nothing until a person says so.
 *
 * ── A separate tool from the navigation helper, deliberately ─────────────────
 * Different scope, different action list, different model call, different file.
 * They are not merged and should not be: the navigation helper picks one of
 * eleven screens and the worst it can do is open the wrong one. This reads a
 * drawing and its output ends up as quantities on a bid. Sharing an action list
 * between them would mean one permission surface covering both, and the union
 * of two action sets is always the more dangerous of the two.
 *
 * ── The safety boundary, in one sentence ────────────────────────────────────
 * `read` and `ask` write nothing to the bid. `confirm` is the only procedure
 * that puts a mark on a sheet, it takes ids a user ticked, and it goes through
 * the same stamp rows the manual tool writes — so a confirmed finding and a
 * hand-placed stamp are the same thing to everything downstream. Every one of
 * those checks is a lookup in shared/copilotActions.ts rather than a branch
 * here, which is what makes a new action a new row rather than a new audit.
 *
 * ── Symbol meaning is the user's, not the model's ───────────────────────────
 * The model is asked which LEGEND ENTRY a mark resembles and where it sits. It
 * never names an assembly. The label is resolved against this user's own
 * symbol_links table — the one the legend panel writes — so an invented symbol
 * resolves to nothing and is offered at low confidence for the user to link,
 * which is the existing manual flow rather than a second one.
 *
 * ── Counts only. The pricing engine does the arithmetic ─────────────────────
 * Nothing here returns a cost, an hour or a total, and the prompt does not ask
 * for one. A confirmed finding becomes a stamp; stamps become counted items;
 * counted items are priced by the engine that prices everything else. An AI
 * doing its own cost reasoning is an AI that can be confidently wrong about a
 * number nobody re-derives.
 *
 * ── Cost control ────────────────────────────────────────────────────────────
 * One page is read when the user opens it, never the whole plan set up front,
 * and the result is stored. Paging back to a sheet returns the stored run;
 * re-reading is an explicit button that passes `force`.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import { AiLimitReached, invokeLLM } from "../llm";
import { aiFeaturesEnabled } from "../aiFeatures";
import { COPILOT_ACTIONS, canPerform } from "../../shared/copilotActions";
import {
  buildFindings,
  isAcceptable,
  summariseFindings,
  type CorrectionHint,
  type Finding,
  type LegendSymbol,
} from "../../shared/copilotDetection";
import { CONFIDENCE_TIERS } from "../../shared/copilotConfidence";
import { extractPlanIssuer, planSourceKey } from "../../shared/planSource";
import { symbolLookupKey } from "../../shared/takeoffCounts";
import type { CopilotRunStatus } from "../../drizzle/schema";
import * as db from "../db";
import { groupForAssembly } from "../assemblyGroup";
import {
  MAX_TEXT_CHARS,
  PLAN_READ_MAX_TOKENS,
  parseSheetReading,
  sheetReadingRequest,
} from "../planReading";

/**
 * This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("bids.view", "bids.edit");

/** Refused outright while AI is switched off; the panel is hidden then too. */
const readerSwitchedOff = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "The plan reader is switched off on this server.",
  });

/**
 * The heavier tier, because this one is actually reading something.
 *
 * The navigation helper runs on the fast tier because "which of eleven screens"
 * is matching a sentence against a list. This is the case CLAUDE.md reserves the
 * heavier tier FOR: looking at a dense electrical drawing and saying what is on
 * it. Spending the cheap tier here would produce a plan reader that is wrong
 * often enough to be worse than not having one, which is the expensive kind of
 * cheap.
 *
 * As with NAVIGATION_MODEL, this id is the current Sonnet-class id and is not
 * verified against the live gateway from a local checkout — prefer the env
 * override to editing it. See server/navigationModel.test.ts for the probe that
 * asks the gateway directly wherever a key exists.
 */
export const PLAN_COPILOT_MODEL =
  process.env.PLAN_COPILOT_MODEL?.trim() || "claude-sonnet-5";

/** Ceiling on the rasterised page the client sends. See the client for the size it targets. */
const MAX_IMAGE_CHARS = 4_000_000;

const imageSchema = z
  .string()
  .max(MAX_IMAGE_CHARS, "That page image is too large to read.")
  .refine(
    v => v.startsWith("data:image/"),
    "Page image must be an image data URL"
  );

async function requireSheet(sheetId: number, userId: number) {
  const sheet = await db.getBidPdfSheet(sheetId, userId);
  if (!sheet)
    throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
  return sheet;
}

async function requireBid(bidId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  return bid;
}

/**
 * The user's legend, in the shape the resolver wants.
 *
 * Exported for scripts/readerAccuracy.mts, so the test's method (a) hands the
 * model the same list of names Read sheet does.
 */
export async function legendFor(userId: number): Promise<LegendSymbol[]> {
  const [links, assemblies] = await Promise.all([
    db.getSymbolLinks(userId),
    db.getLibraryAssemblies(userId),
  ]);
  const names = new Map(assemblies.map(a => [a.id, a.name]));
  return links.map(link => ({
    id: link.id,
    label: link.label,
    lookupKey: link.lookupKey,
    assemblyId: link.assemblyId,
    assemblyName:
      link.assemblyId === null ? null : (names.get(link.assemblyId) ?? null),
  }));
}

/** What a stored finding looks like on the wire. Never carries a price. */
export type CopilotFindingView = {
  id: number;
  rawLabel: string;
  symbolLinkId: number | null;
  assemblyId: number | null;
  assemblyName: string | null;
  confidence: (typeof CONFIDENCE_TIERS)[number];
  score: number;
  reason: string | null;
  note: string | null;
  x: number | null;
  y: number | null;
  status: "proposed" | "confirmed" | "dismissed" | "needs_review";
  /** True when this one can be ticked and placed. False on every unreadable. */
  acceptable: boolean;
  /** Read but unlinked — the "which assembly is this?" prompt. */
  needsLink: boolean;
};

export type CopilotSheetState = {
  runId: number | null;
  status: CopilotRunStatus | null;
  summary: string | null;
  message: string | null;
  model: string | null;
  /**
   * The model the NEXT read would use, as opposed to `model` above, which is
   * the one a past run happened to use and is null before the first read.
   *
   * The client needs this before it can send anything: the size of image worth
   * sending is a property of the model (`shared/visionImageLimits.ts`), the
   * model is chosen by a server environment variable, and an image sized for
   * the wrong one is silently shrunk on arrival with nothing reporting it. So
   * the server says which model it will call rather than the client assuming.
   */
  readerModel: string;
  sourceKey: string | null;
  readAt: Date | null;
  findings: CopilotFindingView[];
  counts: { high: number; low: number; unreadable: number; acceptable: number };
};

const EMPTY_STATE: CopilotSheetState = {
  runId: null,
  status: null,
  summary: null,
  message: null,
  model: null,
  readerModel: PLAN_COPILOT_MODEL,
  sourceKey: null,
  readAt: null,
  findings: [],
  counts: { high: 0, low: 0, unreadable: 0, acceptable: 0 },
};

function viewFinding(
  row: Awaited<ReturnType<typeof db.getCopilotFindings>>[number]
): CopilotFindingView {
  const confidence = row.confidence as (typeof CONFIDENCE_TIERS)[number];
  const x = row.x === null ? null : Number(row.x);
  const y = row.y === null ? null : Number(row.y);
  return {
    id: row.id,
    rawLabel: row.rawLabel,
    symbolLinkId: row.symbolLinkId,
    assemblyId: row.assemblyId,
    assemblyName: row.assemblyName,
    confidence,
    score: Number(row.score),
    reason: row.reason,
    note: row.note,
    status: row.status,
    x,
    y,
    // Recomputed from the stored row through the same predicate the detection
    // module uses, rather than stored: one definition of "can be accepted",
    // used by the router, the panel and the tests alike.
    acceptable: isAcceptable({ confidence, x, y, assemblyId: row.assemblyId }),
    needsLink:
      confidence !== "unreadable" &&
      row.assemblyId === null &&
      row.status === "proposed",
  };
}

async function stateForRun(
  run: Awaited<ReturnType<typeof db.getLatestCopilotRun>>,
  userId: number
): Promise<CopilotSheetState> {
  if (!run) return EMPTY_STATE;
  const rows = await db.getCopilotFindings(run.id, userId);
  const findings = rows.map(viewFinding);
  return {
    runId: run.id,
    status: run.status,
    summary: run.summary,
    message: run.message,
    model: run.model,
    readerModel: PLAN_COPILOT_MODEL,
    sourceKey: run.sourceKey,
    readAt: run.createdAt,
    findings,
    counts: {
      high: findings.filter(f => f.confidence === "high").length,
      low: findings.filter(f => f.confidence === "low").length,
      unreadable: findings.filter(f => f.confidence === "unreadable").length,
      acceptable: findings.filter(f => f.acceptable).length,
    },
  };
}

/** Log a giving-up, loudly in the log and never on screen as an error banner. */
function noteFailure(reason: string, detail?: unknown) {
  console.warn(
    `[plan-copilot] ${reason} (model: ${PLAN_COPILOT_MODEL})`,
    detail ?? ""
  );
}

export const planCopilotRouter = router({
  /**
   * The action list, as the client renders it.
   *
   * Served from the same table the server enforces, so the panel cannot offer a
   * button for something the guardrail will refuse — and a new action appears
   * in the UI's "what this can do" without a second edit.
   */
  allowedActions: procedure.query(() =>
    COPILOT_ACTIONS.map(a => ({
      id: a.id,
      label: a.label,
      purpose: a.purpose,
      writes: a.writes,
      requiresConfirmation: a.requiresConfirmation,
    }))
  ),

  /**
   * What has already been read for this sheet. No model call, ever.
   *
   * The panel calls this on every sheet change. It is the half of the cost
   * control that costs nothing: opening a sheet that was read yesterday shows
   * yesterday's findings rather than buying them again.
   */
  state: procedure
    .input(z.object({ sheetId: z.number().int().positive() }))
    .query(async ({ input, ctx }): Promise<CopilotSheetState> => {
      await requireSheet(input.sheetId, ctx.scope.dataUserId);
      const run = await db.getLatestCopilotRun(
        input.sheetId,
        ctx.scope.dataUserId
      );
      return stateForRun(run, ctx.scope.dataUserId);
    }),

  /**
   * Read one sheet.
   *
   * Writes findings, and nothing else — no stamp, no bid line, no quantity. A
   * finding is a proposal sitting in its own table until someone confirms it.
   */
  read: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        sheetId: z.number().int().positive(),
        /** The rasterised page, as the viewer already drew it. */
        pageImage: imageSchema,
        /** Extracted text, for the title block and the sheet's notes. */
        pageText: z.string().max(200_000).default(""),
        /** The page's real size, so 0–1 positions become PDF page points. */
        pageWidthPoints: z.number().finite().positive().max(100_000),
        pageHeightPoints: z.number().finite().positive().max(100_000),
        /** Re-read a sheet that already has a run. The explicit, paid path. */
        force: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }): Promise<CopilotSheetState> => {
      if (!aiFeaturesEnabled()) throw readerSwitchedOff();
      await requireBid(input.bidId, ctx.scope.dataUserId);
      const sheet = await requireSheet(input.sheetId, ctx.scope.dataUserId);

      // Cost control: a sheet already read is not read again unless asked.
      if (!input.force) {
        const existing = await db.getLatestCopilotRun(
          input.sheetId,
          ctx.scope.dataUserId
        );
        if (existing) return stateForRun(existing, ctx.scope.dataUserId);
      }

      const pdf = await db.getBidPdf(sheet.bidPdfId, ctx.scope.dataUserId);
      const sourceKey = planSourceKey({
        issuer: extractPlanIssuer(input.pageText),
        filename: pdf?.filename ?? null,
      });

      const [symbols, corrections] = await Promise.all([
        legendFor(ctx.scope.dataUserId),
        db.getCopilotCorrections(ctx.scope.dataUserId, sourceKey),
      ]);

      const record = async (
        status: CopilotRunStatus,
        summary: string | null,
        message: string | null,
        findings: Finding[]
      ): Promise<CopilotSheetState> => {
        const runId = await db.createCopilotRun({
          bidId: input.bidId,
          sheetId: input.sheetId,
          userId: ctx.scope.dataUserId,
          status,
          summary,
          message,
          model: PLAN_COPILOT_MODEL,
          sourceKey,
        });
        await db.createCopilotFindings(
          findings.map(f => ({
            runId,
            userId: ctx.scope.dataUserId,
            rawLabel: f.rawLabel.slice(0, 255),
            symbolLinkId: f.symbolLinkId,
            assemblyId: f.assemblyId,
            assemblyName: f.assemblyName?.slice(0, 255) ?? null,
            confidence: f.confidence,
            score: f.score.toFixed(4),
            reason: f.reason.slice(0, 512),
            note: f.note?.slice(0, 512) ?? null,
            x: f.x === null ? null : f.x.toFixed(4),
            y: f.y === null ? null : f.y.toFixed(4),
            // An unreadable finding is filed as needing review from the moment
            // it is stored, so nothing downstream has to remember to treat it
            // differently from a proposal.
            status:
              f.confidence === "unreadable"
                ? ("needs_review" as const)
                : ("proposed" as const),
          }))
        );
        const run = await db.getCopilotRunById(runId, ctx.scope.dataUserId);
        return stateForRun(run, ctx.scope.dataUserId);
      };

      // The request is built in server/planReading.ts, where the reasons for
      // thinking-off and the token ceiling are written down, so the accuracy
      // test (scripts/readerAccuracy.mts) sends exactly what this sends.
      let result;
      try {
        result = await invokeLLM({
          feature: "plan-read",
          user: ctx.user,
          ...sheetReadingRequest({
            model: PLAN_COPILOT_MODEL,
            symbols,
            sheetName: sheet.name,
            pageText: input.pageText,
            pageImage: input.pageImage,
          }),
        });
      } catch (error) {
        // Out of allowance is not a failure to hide behind a generic message —
        // it has its own sentence, and it is the one case the user can act on.
        if (error instanceof AiLimitReached) {
          return record("failed", null, error.message, []);
        }
        // No key, a bad model id, a timeout and a refusal all land here and are
        // indistinguishable on screen. The run is still stored so the panel can
        // say what happened instead of looking like it never ran.
        noteFailure(
          "request rejected",
          error instanceof Error ? error.message : error
        );
        return record(
          "failed",
          null,
          "The plan reader could not be reached. Nothing was changed — carry on marking by hand and try again later.",
          []
        );
      }

      const reading = parseSheetReading(result);

      /**
       * ── Ran out of room. Say so, rather than blaming the answer ───────────
       * A reply stopped by the token ceiling comes back with its tool arguments
       * cut off mid-JSON. Without this check that falls through to the parse
       * failure below, which tells the user the reader's answer "could not be
       * understood" — a sentence that is true, useless, and points at the wrong
       * thing. They would re-read the sheet, hit the same ceiling, and get the
       * same sentence.
       *
       * So it is its own case and its own message that names the cause, and a
       * `console.error` rather than the usual warn, because the fix is a
       * constant and nobody will go looking for it unless something shouts.
       * This should be unreachable at 16,000 tokens on any single E-sheet — if
       * it ever fires, a sheet denser than either sample set exists and
       * PLAN_READ_MAX_TOKENS needs revisiting.
       */
      if (reading.kind === "truncated") {
        console.error(
          `[plan-copilot] reply hit the ${PLAN_READ_MAX_TOKENS}-token ceiling ` +
            `on sheet=${sheet.id} — the reading was truncated and discarded. ` +
            `Raise PLAN_READ_MAX_TOKENS in server/planReading.ts.`
        );
        return record(
          "failed",
          null,
          "There was more on this sheet than the reader could report in one go, so nothing was proposed for it — a partial list would have looked complete. Count this one by hand, and tell us about it so the limit can be raised.",
          []
        );
      }

      if (reading.kind === "no-report") {
        noteFailure("model returned no report_sheet call");
        return record(
          "degraded",
          reading.text || null,
          "The plan reader looked at this sheet but did not identify any symbols on it. Nothing was proposed.",
          []
        );
      }

      if (reading.kind === "unparseable") {
        noteFailure("tool arguments were not valid JSON", reading.raw);
        return record(
          "degraded",
          null,
          "The plan reader's answer could not be understood, so nothing was proposed for this sheet.",
          []
        );
      }

      if (reading.refused > 0) {
        noteFailure(
          `dropped ${reading.refused} item(s) naming an action the model may not take`
        );
      }

      const findings = buildFindings(reading.detections, {
        symbols,
        corrections: corrections.map(
          (c): CorrectionHint => ({
            rawLabel: c.rawLabel,
            symbolLinkId: c.symbolLinkId,
            timesApplied: c.timesApplied,
          })
        ),
        pageWidthPoints: input.pageWidthPoints,
        pageHeightPoints: input.pageHeightPoints,
      });

      const summary = reading.summary;
      const totals = summariseFindings(findings);

      // Reached the model, got a well-formed answer with nothing usable in it.
      // Stored as degraded rather than ok, because "read, found nothing" and
      // "read, found twelve" must not look the same in the panel.
      if (findings.length === 0) {
        return record(
          "degraded",
          summary,
          summary
            ? "No device symbols could be picked out of this sheet — it may be a detail, a schedule, or too low-quality to read. Nothing was proposed."
            : "This sheet could not be read. Nothing was proposed; mark it by hand as usual.",
          []
        );
      }

      // Everything unreadable is also a degraded read, however many there are:
      // the user gets a list of places to look and no proposals at all, and the
      // panel should say so rather than presenting an empty accept-all.
      const status: CopilotRunStatus =
        totals.acceptable === 0 && totals.unreadable > 0 ? "degraded" : "ok";

      return record(
        status,
        summary,
        status === "degraded"
          ? "Marks were found but none could be read confidently enough to propose. They are listed as needing your eyes."
          : null,
        findings
      );
    }),

  /**
   * Ask a question about the sheet on screen.
   *
   * Prose in, prose out, no tools, nothing stored, nothing written. Deliberately
   * NOT given the report tool: a question is a question, and a model that can
   * answer by proposing forty stamps is one that will.
   */
  ask: procedure
    .input(
      z.object({
        sheetId: z.number().int().positive(),
        question: z.string().trim().min(1).max(500),
        pageImage: imageSchema,
        pageText: z.string().max(200_000).default(""),
      })
    )
    .mutation(async ({ input, ctx }): Promise<{ answer: string }> => {
      if (!aiFeaturesEnabled()) throw readerSwitchedOff();
      const sheet = await requireSheet(input.sheetId, ctx.scope.dataUserId);

      try {
        const result = await invokeLLM({
          feature: "plan-ask",
          user: ctx.user,
          model: PLAN_COPILOT_MODEL,
          messages: [
            {
              role: "system",
              content: [
                "You are helping an electrical estimator read one sheet of a set of construction drawings.",
                `The sheet on screen is "${sheet.name}".`,
                "",
                "Answer only from what is on this sheet. If the sheet does not say, say that it does not say — do not fill the gap from general knowledge of how buildings are usually wired.",
                "Never give prices, labor hours or totals; the estimating software works those out from the counts.",
                "Be brief and concrete. Two or three sentences unless the question genuinely needs more.",
              ].join("\n"),
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: input.pageText.trim()
                    ? `${input.question}\n\nText extracted from this sheet:\n${input.pageText.slice(0, MAX_TEXT_CHARS)}`
                    : input.question,
                },
                { type: "image_url", image_url: { url: input.pageImage } },
              ],
            },
          ],
          maxTokens: 600,
        });

        const choice = result.choices?.[0]?.message;
        const text =
          typeof choice?.content === "string" ? choice.content.trim() : "";
        if (text) return { answer: text };
        noteFailure("ask returned no text");
      } catch (error) {
        // The allowance has its own sentence. Everything else gets the generic
        // one, because the difference is not the user's to act on.
        if (error instanceof AiLimitReached) return { answer: error.message };
        noteFailure(
          "ask request rejected",
          error instanceof Error ? error.message : error
        );
      }

      return {
        answer:
          "I couldn't read the sheet just now. Nothing was changed — try again, or zoom in and check that spot yourself.",
      };
    }),

  /**
   * Place the findings the user ticked. **The only procedure here that touches
   * a bid.**
   *
   * Every id is re-checked server-side rather than trusted: a finding that was
   * unreadable, already confirmed, unplaceable or someone else's is refused
   * here even though the panel would not have offered it. The client deciding
   * what is acceptable is a convenience; this is the rule.
   */
  confirm: procedure
    .input(
      z.object({
        runId: z.number().int().positive(),
        findingIds: z.array(z.number().int().positive()).min(1).max(500),
        /**
         * The user's explicit yes, sent by the confirm button and nothing else.
         *
         * Belt and braces on top of "this procedure is only called from a
         * click": the guardrail asks whether a person confirmed, so a person
         * has to have confirmed, and a caller that forgets to say so is refused
         * rather than defaulted to yes.
         */
        confirmed: z.literal(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const run = await db.getCopilotRunById(input.runId, ctx.scope.dataUserId);
      if (!run)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That reading no longer exists.",
        });

      const sheet = await requireSheet(run.sheetId, ctx.scope.dataUserId);
      const rows = await db.getCopilotFindingsByIds(
        input.findingIds,
        ctx.scope.dataUserId
      );

      const placeable: typeof rows = [];
      const refusals: string[] = [];

      for (const row of rows) {
        if (row.runId !== run.id) {
          refusals.push(`${row.rawLabel}: belongs to a different reading.`);
          continue;
        }
        if (row.status === "confirmed") continue; // Already placed; not an error.

        const view = viewFinding(row);
        // The gate. Reads the action table — there is no branch here that
        // could be updated for a new action and miss this one.
        const verdict = canPerform({
          actionId: "confirm_stamps",
          confirmed: input.confirmed,
          confidence: view.confidence,
        });
        if (!verdict.allowed) {
          refusals.push(`${row.rawLabel}: ${verdict.reason}`);
          continue;
        }
        if (!view.acceptable) {
          refusals.push(
            `${row.rawLabel}: no assembly or no position, so there is nothing to place.`
          );
          continue;
        }
        placeable.push(row);
      }

      // The same rows the manual stamp tool writes, through the same rules: the
      // mark joins the assembly's COUNT on this bid (found or made by the one
      // function the stamp tool uses), its name comes from that count, and the
      // assembly's Category is frozen at drop time so the System layer keeps
      // working after the library assembly is archived or renamed.
      //
      // Until 2026-09-29 this wrote no groupId, and this comment claimed "the
      // same rows the manual stamp tool writes" regardless. Every counter skips
      // a NULL group, so a placed mark was drawn, priced by the materials list,
      // and counted on no bid line. A finding whose assembly cannot be found
      // is now refused rather than placed outside a count.
      type Target = { groupId: number; label: string; category: string | null };
      //
      // Keyed by assembly AND legend symbol (2026-10-01, track-b-count-pin-
      // styles-plan.md § 11.2.4): two symbols linked to one assembly are two
      // items, each with its own count. Until then this passed no symbol and
      // every finding of the assembly merged into the first count.
      const targets = new Map<string, Target | string>();
      const placing: { row: (typeof placeable)[number]; target: Target }[] = [];
      const missing =
        "its assembly is no longer in your library, so there is nothing to count it as.";
      for (const row of placeable) {
        // `acceptable` already refused a finding with no assembly; this is the
        // same check restated so the type carries it rather than a `!`.
        if (row.assemblyId === null) continue;
        const key = `${row.assemblyId}:${row.symbolLinkId ?? "-"}`;
        if (!targets.has(key)) {
          const assembly = await db.getAssemblyById(
            row.assemblyId,
            ctx.scope.dataUserId
          );
          const symbol =
            row.symbolLinkId !== null
              ? await db.getSymbolLinkById(
                  row.symbolLinkId,
                  ctx.scope.dataUserId
                )
              : undefined;
          if (!assembly) {
            targets.set(key, missing);
          } else {
            try {
              const group = await groupForAssembly(
                run.bidId,
                ctx.scope.dataUserId,
                assembly,
                {
                  symbol: symbol?.assemblyId === assembly.id ? symbol : null,
                  // No symbol means nobody can say which item; Place keeps
                  // the old answer (the first count) rather than failing.
                  ifSeveral: "first",
                }
              );
              targets.set(key, {
                groupId: group.id,
                label: group.label,
                category: assembly.category ?? null,
              });
            } catch (e) {
              targets.set(
                key,
                e instanceof TRPCError ? e.message : "it could not be counted."
              );
            }
          }
        }
        const target = targets.get(key) ?? missing;
        if (typeof target === "string") {
          refusals.push(`${row.rawLabel}: ${target}`);
          continue;
        }
        placing.push({ row, target });
      }

      if (placing.length === 0) {
        return { placed: 0, refused: refusals };
      }

      const stampIds = await db.createStampsReturningIds(
        placing.map(({ row, target }) => ({
          bidId: run.bidId,
          sheetId: sheet.id,
          userId: ctx.scope.dataUserId,
          groupId: target.groupId,
          assemblyId: row.assemblyId,
          assemblyName: target.label,
          assemblyCategory: target.category,
          location: null,
          x: Number(row.x).toFixed(4),
          y: Number(row.y).toFixed(4),
        }))
      );

      await Promise.all(
        placing.map(({ row }, index) =>
          db.setCopilotFindingStatus(
            row.id,
            ctx.scope.dataUserId,
            "confirmed",
            stampIds[index] ?? null
          )
        )
      );

      return { placed: placing.length, refused: refusals };
    }),

  /** Put a proposal aside. Touches the co-pilot's own row and nothing else. */
  dismiss: procedure
    .input(
      z.object({
        findingIds: z.array(z.number().int().positive()).min(1).max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const rows = await db.getCopilotFindingsByIds(
        input.findingIds,
        ctx.scope.dataUserId
      );
      await Promise.all(
        rows
          .filter(row => row.status !== "confirmed")
          .map(row =>
            db.setCopilotFindingStatus(
              row.id,
              ctx.scope.dataUserId,
              "dismissed",
              null
            )
          )
      );
      return { dismissed: rows.length };
    }),

  /**
   * "That's not what that is — it's this."
   *
   * Two effects, both scoped to this user: the finding is re-pointed at the
   * right symbol so it can be confirmed, and the correction is remembered
   * against this plan set so the next sheet from the same drawings reads it
   * correctly without being told again.
   *
   * The memory is per account, exactly as materials, labor rates and assemblies
   * are. Two estimators can read the same ambiguous mark differently and both
   * be right about their own job.
   */
  correct: procedure
    .input(
      z.object({
        findingId: z.number().int().positive(),
        symbolLinkId: z.number().int().positive(),
        confirmed: z.literal(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [finding] = await db.getCopilotFindingsByIds(
        [input.findingId],
        ctx.scope.dataUserId
      );
      if (!finding)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That finding no longer exists.",
        });

      const verdict = canPerform({
        actionId: "record_correction",
        confirmed: input.confirmed,
      });
      if (!verdict.allowed)
        throw new TRPCError({ code: "FORBIDDEN", message: verdict.reason });

      const link = await db.getSymbolLinkById(
        input.symbolLinkId,
        ctx.scope.dataUserId
      );
      if (!link)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That legend symbol was not found.",
        });

      const run = await db.getCopilotRunById(
        finding.runId,
        ctx.scope.dataUserId
      );
      const assembly =
        link.assemblyId === null
          ? null
          : await db.getAssemblyById(link.assemblyId, ctx.scope.dataUserId);

      await db.upsertCopilotCorrection({
        userId: ctx.scope.dataUserId,
        sourceKey: run?.sourceKey ?? "unknown",
        rawLabel: finding.rawLabel,
        rawLabelKey: symbolLookupKey(finding.rawLabel),
        symbolLinkId: link.id,
      });

      await db.updateCopilotFinding(finding.id, ctx.scope.dataUserId, {
        symbolLinkId: link.id,
        assemblyId: link.assemblyId,
        assemblyName: assembly?.name ?? null,
        // A corrected finding is one the user has personally vouched for, so it
        // is no longer uncertain — but it is still a PROPOSAL. Correcting is
        // not confirming: the mark does not land on the sheet until they tick
        // it, same as every other finding.
        confidence: link.assemblyId === null ? "low" : "high",
        status: "proposed",
        reason:
          "You corrected this one — it will be read this way from now on.",
      });

      return {
        symbolLabel: link.label,
        assemblyName: assembly?.name ?? null,
        sourceKey: run?.sourceKey ?? "unknown",
      };
    }),
});
