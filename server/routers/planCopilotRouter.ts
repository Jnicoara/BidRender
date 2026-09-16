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
import type { Tool } from "../_core/llm";
import { AiLimitReached, invokeLLM } from "../llm";
import { aiFeaturesEnabled } from "../aiFeatures";
import {
  COPILOT_ACTIONS,
  MODEL_INVOCABLE_ACTIONS,
  MODEL_INVOCABLE_ACTION_IDS,
  canPerform,
} from "../../shared/copilotActions";
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

/** Ceiling on extracted sheet text handed to the model. */
const MAX_TEXT_CHARS = 12_000;

const imageSchema = z
  .string()
  .max(MAX_IMAGE_CHARS, "That page image is too large to read.")
  .refine(
    v => v.startsWith("data:image/"),
    "Page image must be an image data URL"
  );

/**
 * The one thing the model may return.
 *
 * A single tool with an enum on every item, so the closed action set is real at
 * the model layer as well as in the validation below — exactly the shape the
 * navigation helper uses. There is no output that expresses "place these on the
 * bid": `confirm_stamps` is not in MODEL_INVOCABLE_ACTION_IDS, so it is not in
 * the enum, so it cannot be asked for.
 */
function reportTool(): Tool {
  return {
    type: "function",
    function: {
      name: "report_sheet",
      description:
        "Report what this plan sheet contains. Call this exactly once, after reading the whole sheet.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description:
              "Two to five sentences describing the scope of work this sheet asks of the electrical trade. Plain language, no pricing, no hours, no totals.",
          },
          items: {
            type: "array",
            description:
              "One entry per device symbol you find on the drawing. Do not merge repeats — a symbol appearing twelve times is twelve entries.",
            items: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: MODEL_INVOCABLE_ACTION_IDS,
                  description:
                    "propose_stamp when you can read the mark; flag_for_review when you cannot make it out and want a person to check that spot.",
                },
                symbol: {
                  type: "string",
                  description:
                    "The legend label this mark matches, copied from the legend list you were given. Leave empty if it matches none of them.",
                },
                x: {
                  type: "number",
                  description:
                    "Horizontal position, 0 at the left edge of the image to 1 at the right.",
                },
                y: {
                  type: "number",
                  description:
                    "Vertical position, 0 at the top edge of the image to 1 at the bottom.",
                },
                confidence: {
                  type: "number",
                  description:
                    "How sure you are about this one, 0 to 1. Be honest and be harsh — a wrong count costs the contractor a job.",
                },
                legible: {
                  type: "boolean",
                  description:
                    "False if you cannot actually make the mark out. Say false rather than guessing; a guess is worse than a gap here.",
                },
                note: {
                  type: "string",
                  description:
                    "Optional, short: why this one is uncertain or unreadable.",
                },
              },
              required: ["action"],
            },
          },
        },
        required: ["summary", "items"],
      },
    },
  };
}

/**
 * The prompt.
 *
 * The legend list is the substance of it. Handing the model the user's OWN
 * symbol labels and telling it to choose among them is what stops it applying
 * a generic idea of what an electrical symbol means to a set of drawings whose
 * author had their own idea.
 */
function readingPrompt(symbols: LegendSymbol[], sheetName: string): string {
  const legend =
    symbols.length === 0
      ? "(This user has not captured any legend symbols yet. You may still report marks you see, naming them as they appear on the drawing — they will be offered to the user to link.)"
      : symbols
          .map(
            s =>
              `- "${s.label}"${s.assemblyName ? ` — the user has linked this to: ${s.assemblyName}` : " — captured but not yet linked to anything"}`
          )
          .join("\n");

  return [
    "You are reading one sheet of a set of construction drawings for an electrical estimator.",
    `The sheet is called "${sheetName}".`,
    "",
    "This user's legend symbols — the ONLY names you may put in the `symbol` field:",
    legend,
    "",
    "How to work:",
    "- Find every device symbol on the drawing and report each occurrence separately.",
    "- Match each one to a legend label above. If it matches none of them, still report it and describe it in `symbol` as it appears; the user will link it.",
    "- Give a position for every item, as a fraction of the image width and height.",
    "- If you cannot actually make a mark out — it is smudged, overlapped, cut off, too small — use flag_for_review and set legible to false. Do NOT report it as a low-confidence guess. A gap the user fills in themselves is fine; a wrong count that looks confident is not.",
    "- Ignore anything that is not a device on this sheet: title blocks, revision clouds, legends, schedules, north arrows, keynote bubbles.",
    "",
    "Do not calculate anything. No prices, no labor hours, no totals, no material lists.",
    "Counts and locations only — the estimating software does the arithmetic.",
    "",
    "Call report_sheet exactly once with everything you found.",
  ].join("\n");
}

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

/** The user's legend, in the shape the resolver wants. */
async function legendFor(userId: number): Promise<LegendSymbol[]> {
  const [links, assemblies] = await Promise.all([
    db.getSymbolLinks(userId),
    db.getLibraryAssemblies(userId),
  ]);
  const names = new Map(assemblies.map(a => [a.id, a.name]));
  return links.map(link => ({
    id: link.id,
    label: link.label,
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

      let result;
      try {
        result = await invokeLLM({
          feature: "plan-read",
          user: ctx.user,
          model: PLAN_COPILOT_MODEL,
          messages: [
            { role: "system", content: readingPrompt(symbols, sheet.name) },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: [
                    "Here is the sheet. Read it and call report_sheet.",
                    input.pageText.trim()
                      ? `\nText extracted from this sheet (may be partial or garbled):\n${input.pageText.slice(0, MAX_TEXT_CHARS)}`
                      : "\n(No text could be extracted from this sheet — it is likely a scan.)",
                  ].join("\n"),
                },
                { type: "image_url", image_url: { url: input.pageImage } },
              ],
            },
          ],
          tools: [reportTool()],
          toolChoice: "auto",
          /**
           * Halved from 8000. A dense sheet's findings run 1,500-2,500 tokens,
           * so this keeps roughly double the headroom while cutting the worst
           * case per sheet from about 9.5c to 5.5c.
           *
           * Not lower, and the reason is worth stating: hitting this cap
           * truncates the JSON, parsing fails, and the user gets nothing for a
           * call that was still paid for. A cap tight enough to save real money
           * is a cap tight enough to turn readings into failures — the daily
           * limit in shared/aiLimits.ts is what actually controls spend.
           */
          maxTokens: 4000,
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
          "The plan reader could not be reached. Nothing was changed — carry on stamping by hand and try again later.",
          []
        );
      }

      const choice = result.choices?.[0]?.message;
      const call = choice?.tool_calls?.find(
        c => c.function?.name === "report_sheet"
      );

      if (!call) {
        const text =
          typeof choice?.content === "string" ? choice.content.trim() : "";
        noteFailure("model returned no report_sheet call");
        return record(
          "degraded",
          text || null,
          "The plan reader looked at this sheet but did not identify any symbols on it. Nothing was proposed.",
          []
        );
      }

      let args: { summary?: unknown; items?: unknown } = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        noteFailure(
          "tool arguments were not valid JSON",
          call.function.arguments
        );
        return record(
          "degraded",
          null,
          "The plan reader's answer could not be understood, so nothing was proposed for this sheet.",
          []
        );
      }

      // ── The guardrail, at the model layer ─────────────────────────────────
      // Every item states an action, and every action goes through canPerform
      // before it becomes anything. An item naming something outside the
      // model-invocable set — including any attempt at a writing action — is
      // dropped and counted, never honoured and never quietly ignored.
      const rawItems = Array.isArray(args.items) ? args.items : [];
      let refused = 0;
      const detections = rawItems.flatMap(item => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        const actionId =
          typeof entry.action === "string"
            ? entry.action
            : "propose_stamp"; /* an item with no action is a proposal */

        const verdict = canPerform({
          actionId,
          confirmed: false,
          fromModel: true,
        });
        if (!verdict.allowed) {
          refused += 1;
          return [];
        }

        return [
          {
            symbol: entry.symbol,
            x: entry.x,
            y: entry.y,
            confidence: entry.confidence,
            // flag_for_review means "I could not read this", so legibility is
            // decided by the action rather than by a field the model may not
            // have set consistently with it. This is what guarantees a flagged
            // mark lands in the unreadable tier however sure the model claimed
            // to be — see shared/copilotConfidence.ts.
            legible:
              verdict.action.id === "flag_for_review" ? false : entry.legible,
            note: entry.note,
          },
        ];
      });

      if (refused > 0) {
        noteFailure(
          `dropped ${refused} item(s) naming an action the model may not take`
        );
      }

      const findings = buildFindings(detections, {
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

      const summary =
        typeof args.summary === "string" && args.summary.trim()
          ? args.summary.trim().slice(0, 4000)
          : null;
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
            : "This sheet could not be read. Nothing was proposed; stamp it by hand as usual.",
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

      if (placeable.length === 0) {
        return { placed: 0, refused: refusals };
      }

      // The same rows the manual stamp tool writes, through the same snapshot
      // rules — the assembly's Category frozen at drop time so the System layer
      // keeps working after the library assembly is archived or renamed.
      const categories = new Map<number, string | null>();
      for (const row of placeable) {
        if (row.assemblyId === null || categories.has(row.assemblyId)) continue;
        const assembly = await db.getAssemblyById(
          row.assemblyId,
          ctx.scope.dataUserId
        );
        categories.set(row.assemblyId, assembly?.category ?? null);
      }

      const stampIds = await db.createStampsReturningIds(
        placeable.map(row => ({
          bidId: run.bidId,
          sheetId: sheet.id,
          userId: ctx.scope.dataUserId,
          assemblyId: row.assemblyId,
          assemblyName: row.assemblyName ?? row.rawLabel,
          assemblyCategory:
            row.assemblyId === null
              ? null
              : (categories.get(row.assemblyId) ?? null),
          location: null,
          x: Number(row.x).toFixed(4),
          y: Number(row.y).toFixed(4),
        }))
      );

      await Promise.all(
        placeable.map((row, index) =>
          db.setCopilotFindingStatus(
            row.id,
            ctx.scope.dataUserId,
            "confirmed",
            stampIds[index] ?? null
          )
        )
      );

      return { placed: placeable.length, refused: refusals };
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
