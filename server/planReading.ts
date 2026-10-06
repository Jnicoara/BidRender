/**
 * What "Read sheet" sends the model, and how its answer is taken apart.
 *
 * ── Why this is its own file ────────────────────────────────────────────────
 * It used to live inside `routers/planCopilotRouter.ts`. It moved out on
 * 2026-09-29 so `scripts/readerAccuracy.mts` can measure THE reader rather than
 * a copy of it (references/reader-accuracy-test-plan.md). A copied prompt is a
 * different reader the day somebody edits one of the two, and an accuracy
 * number measured on it would be quietly about the wrong thing.
 *
 * So this file holds everything that decides what the model sees and how its
 * reply becomes detections: the instructions, the one tool, the request, and
 * the parse. The router keeps what is about the APP — which bid, which sheet,
 * what gets stored, and what the panel says when it goes wrong.
 *
 * Nothing here writes anything, reads the database, or calls the model.
 */
import type { InvokeParams, InvokeResult, Tool } from "./_core/llm";
import {
  MODEL_INVOCABLE_ACTION_IDS,
  canPerform,
} from "../shared/copilotActions";
import type { LegendSymbol } from "../shared/copilotDetection";

/** Ceiling on extracted sheet text handed to the model. */
export const MAX_TEXT_CHARS = 12_000;

/**
 * Ceiling on one sheet reading's reply. See `sheetReadingRequest` for the
 * arithmetic.
 *
 * Named rather than inlined because the router's truncation message has to
 * name it, and a truncation check comparing against a different number than
 * the request used is a check that silently stops working.
 */
export const PLAN_READ_MAX_TOKENS = 16_000;

/**
 * The one thing the model may return.
 *
 * A single tool with an enum on every item, so the closed action set is real at
 * the model layer as well as in the validation below — exactly the shape the
 * navigation helper uses. There is no output that expresses "place these on the
 * bid": `confirm_stamps` is not in MODEL_INVOCABLE_ACTION_IDS, so it is not in
 * the enum, so it cannot be asked for.
 */
export function reportTool(): Tool {
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
export function readingPrompt(
  symbols: LegendSymbol[],
  sheetName: string
): string {
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

/** What one sheet reading needs to know, and nothing about who asked. */
export type SheetReadingInput = {
  model: string;
  symbols: LegendSymbol[];
  sheetName: string;
  /** Extracted text, for the title block and the sheet's notes. */
  pageText: string;
  /** The rasterised page, as a data URL. */
  pageImage: string;
};

/**
 * The request, exactly as Read sheet sends it — minus `feature` and `user`,
 * which the caller adds because they are about metering, not reading.
 */
export function sheetReadingRequest(input: SheetReadingInput): InvokeParams & {
  model: string;
  messages: InvokeParams["messages"];
  maxTokens: number;
} {
  return {
    model: input.model,
    messages: [
      {
        role: "system",
        content: readingPrompt(input.symbols, input.sheetName),
      },
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
     * No thinking, explicitly.
     *
     * Leaving this out does not mean "off" on the current models — it
     * means adaptive thinking runs and bills at the output rate, folded
     * invisibly into `output_tokens`. Measured on a real 36x24 sheet that
     * was about three cents a sheet nobody had chosen.
     *
     * Counting symbols against a legend the user supplied is recognition,
     * not reasoning, so there is little here for thinking to buy. If
     * findings ever get noticeably worse, the replacement is NOT to
     * delete this line — it is `output_config: { effort: "low" }` with
     * adaptive thinking, which keeps a little reasoning at a fraction of
     * the spend. Deleting the line returns to paying an unknown amount.
     */
    thinking: { type: "disabled" },
    /**
     * MEASURED, not guessed. Counted on the real Old Blueridge sheets:
     * one finding serialises to a 117-character JSON object, which is
     * about 40 output tokens, and sheet E1.02 carries 78 device symbols.
     * So a real sheet's answer is roughly 3,270 tokens — 82% of the old
     * 4,000 cap, on a small school remodel.
     *
     * That cap was therefore already one dense commercial sheet away from
     * truncating every read, and truncation here is the worst shape of
     * failure available: the tool arguments are cut mid-JSON, the parse
     * fails, the user gets nothing, and the call is paid for in full.
     *
     * 16,000 covers about 380 findings — denser than any single E-sheet
     * in either sample set — and is the documented default ceiling for a
     * non-streaming request, so it cannot collide with an HTTP timeout.
     * It raises the WORST case to about 16c of output on a sheet that
     * would have failed outright before; it does not raise the typical
     * cost at all, because the model stops when it has finished.
     *
     * Spend is controlled by the daily allowance in shared/aiLimits.ts,
     * not by this number. A cap tight enough to save real money is a cap
     * tight enough to turn readings into failures.
     */
    maxTokens: PLAN_READ_MAX_TOKENS,
  };
}

/** One mark the model reported, before it is resolved against the legend. */
export type SheetDetection = {
  symbol: unknown;
  x: unknown;
  y: unknown;
  confidence: unknown;
  legible: unknown;
  note: unknown;
};

/**
 * What came back, taken apart. Every way a reply can fail is its own case,
 * because each one gets its own sentence in the panel — see the router.
 */
export type SheetReading =
  /** The reply hit PLAN_READ_MAX_TOKENS and its tool arguments were cut off. */
  | { kind: "truncated" }
  /** No report_sheet call. `text` is whatever prose came back instead. */
  | { kind: "no-report"; text: string }
  /** A report_sheet call whose arguments were not valid JSON. */
  | { kind: "unparseable"; raw: string }
  | {
      kind: "ok";
      summary: string | null;
      detections: SheetDetection[];
      /** Items naming an action the model may not take, dropped and counted. */
      refused: number;
    };

/** Turn a reply into detections. Pure: no storage, no logging. */
export function parseSheetReading(result: InvokeResult): SheetReading {
  /**
   * ── Ran out of room. Checked first, and separately ────────────────────────
   * A reply stopped by the token ceiling comes back with its tool arguments
   * cut off mid-JSON, which would otherwise fall through to "unparseable" and
   * blame the answer rather than the ceiling.
   */
  if (result.choices?.[0]?.finish_reason === "max_tokens") {
    return { kind: "truncated" };
  }

  const choice = result.choices?.[0]?.message;
  const call = choice?.tool_calls?.find(
    c => c.function?.name === "report_sheet"
  );

  if (!call) {
    const text =
      typeof choice?.content === "string" ? choice.content.trim() : "";
    return { kind: "no-report", text };
  }

  let args: { summary?: unknown; items?: unknown } = {};
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    return { kind: "unparseable", raw: call.function.arguments };
  }

  // ── The guardrail, at the model layer ─────────────────────────────────────
  // Every item states an action, and every action goes through canPerform
  // before it becomes anything. An item naming something outside the
  // model-invocable set — including any attempt at a writing action — is
  // dropped and counted, never honoured and never quietly ignored.
  const rawItems = Array.isArray(args.items) ? args.items : [];
  let refused = 0;
  const detections = rawItems.flatMap((item): SheetDetection[] => {
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

  const summary =
    typeof args.summary === "string" && args.summary.trim()
      ? args.summary.trim().slice(0, 4000)
      : null;

  return { kind: "ok", summary, detections, refused };
}
