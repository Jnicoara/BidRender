/**
 * THE AI TIE-BREAK — the only AI in the sheet check. 2026-10-01.
 *
 * Code finds and names every symbol it can (client/src/lib/sheetCheck.ts).
 * What is left is a TIE: two legend items whose looks both fit a spot
 * cleanly and whose labels did not settle it. Only those spots are sent, as
 * small crops (never a page), with the legend's own pictures of the tied
 * items, and the answer is one of those items or "none" — a closed set
 * (CLAUDE.md, "closed action sets").
 *
 * Measured before it was built (references/legend-and-notes-automation-plan.md
 * § 7a): on Weld 1 E-200 the AI picked 4 of 4 ties right, one call, ~$0.003;
 * labelling EVERY crop it got 35 of 46 — worse than code (40 + 4 ties). So
 * it is asked about ties and nothing else.
 *
 * Pure: builds the request and reads the reply. The router sends it through
 * server/llm (the one door: daily allowance, cost line).
 */
import type { InvokeParams, InvokeResult } from "./_core/llm";

/** Env-overridable, like every model id here. Sonnet: 4 of 4 ties on Weld. */
export const TIE_BREAK_MODEL =
  process.env.TIE_BREAK_MODEL?.trim() || "claude-sonnet-5";

/** Crops per call: one call per sheet is the normal case. */
export const TIE_BREAK_MAX_CROPS = 12;
/** A crop or a legend picture, as a data URL: small by construction. */
export const TIE_BREAK_MAX_IMAGE_CHARS = 120_000;
const MAX_TOKENS = 400;

export type TieItem = { id: number; label: string; picture: string };
export type TieCrop = {
  id: number;
  picture: string;
  /** The ids of the tied items for THIS crop (a subset of the items). */
  itemIds: number[];
};

export function tieBreakRequest(opts: {
  model: string;
  items: readonly TieItem[];
  crops: readonly TieCrop[];
}): Pick<InvokeParams, "model" | "messages" | "maxTokens" | "thinking"> {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: "Legend items, each with its legend picture. Numbers are the item ids.",
    },
  ];
  for (const it of opts.items) {
    parts.push({ type: "text", text: `Item ${it.id}: ${it.label.slice(0, 120)}` });
    parts.push({ type: "image_url", image_url: { url: it.picture } });
  }
  parts.push({
    type: "text",
    text:
      "Pictures cut from the floor plan. In each, identify ONLY the symbol at the centre, inside the red square. " +
      "Each picture says which items it could be; answer with one of those ids, or 0 if it is none of them. " +
      "Symbols on the plan may be turned or mirrored.",
  });
  for (const c of opts.crops) {
    parts.push({
      type: "text",
      text: `Picture ${c.id} — one of items ${c.itemIds.join(", ")}`,
    });
    parts.push({ type: "image_url", image_url: { url: c.picture } });
  }
  parts.push({
    type: "text",
    text: 'Reply with one line per picture, exactly "Picture N: ID", nothing else.',
  });
  return {
    model: opts.model,
    maxTokens: MAX_TOKENS,
    // Thinking costs output tokens and is not needed to pick from two
    // pictures; off explicitly (CLAUDE.md, AI cost controls).
    thinking: { type: "disabled" },
    messages: [
      {
        role: "system",
        content:
          "You identify electrical plan symbols by comparing them with a legend. Be exact; when two items look alike, pick the one whose details match.",
      },
      { role: "user", content: parts },
    ],
  };
}

/**
 * The pick for each crop: an item id from THAT crop's own tied set, or null
 * for "none" and for anything else — an id outside the set, no line, a
 * reply cut off. A wrong answer is worse than no answer, so nothing outside
 * the closed set is ever accepted.
 */
export function parseTieBreak(
  result: InvokeResult,
  crops: readonly TieCrop[]
): Map<number, number | null> {
  const message = result.choices?.[0]?.message;
  const text =
    typeof message?.content === "string"
      ? message.content
      : Array.isArray(message?.content)
        ? message.content
            .map(p => ("text" in p && typeof p.text === "string" ? p.text : ""))
            .join("\n")
        : "";
  const picks = new Map<number, number | null>();
  for (const c of crops) {
    const m = text.match(new RegExp(`Picture\\s+${c.id}\\s*:\\s*(\\d+)`));
    const id = m ? Number(m[1]) : NaN;
    picks.set(c.id, c.itemIds.includes(id) ? id : null);
  }
  return picks;
}
