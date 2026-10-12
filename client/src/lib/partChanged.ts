/**
 * "PART CHANGED — Send again" on a run line (baseline-screen-plan.md § 9,
 * F12; owner Q19 family, 2026-10-12).
 *
 * A run type re-pointed to a new part (a different coupling style, an
 * override) keeps pricing its bid line at the OLD part's frozen price until
 * Send again re-snapshots it. That freeze is right (R4, nothing re-prices
 * itself), but the line said nothing, so the bid showed the new part's
 * quantity at the old part's price with no hint it was stale.
 *
 * The decision "this line would swap" is NOT made here. It is the server's
 * `resendPlans` (`takeoffRunTypes.bridgeForBid`, shared/resendLine.ts), the
 * same plan Send again applies, so the bid screen and the Plans screen cannot
 * disagree. This only matches those plans to bid lines, by run type and slot
 * (`runLineSlot`, one line per material role, per extra).
 *
 * Pure, so the suite can reach it.
 */
import { runLineSlot } from "@shared/runExtrasPerFoot";

type Resend = { kind: "swap"; text: string } | { kind: string } | null;

export type BridgeForPartChange = readonly {
  runTypeId: number;
  rows: readonly { role: string; extraKey: number; resend: Resend }[];
  fittings: readonly { role: string; resend: Resend }[];
}[];

export type LineForPartChange = {
  id: number;
  takeoffRunTypeId: number | null;
  runMaterialRole: string | null;
  runExtraKey: number;
  archivedAt: Date | string | null;
};

/**
 * Bid line id → the swap Send again would make, e.g. "set-screw coupling →
 * compression coupling, 9". Only live run lines whose plan is a SWAP; a
 * refill or a keep is not a changed part.
 */
export function partChangedByLine(
  bridge: BridgeForPartChange,
  lines: readonly LineForPartChange[]
): Map<number, string> {
  const swaps = new Map<string, string>();
  for (const type of bridge) {
    for (const row of type.rows)
      if (row.resend?.kind === "swap" && "text" in row.resend)
        swaps.set(
          `${type.runTypeId}:${runLineSlot(row.role, row.extraKey)}`,
          row.resend.text
        );
    for (const f of type.fittings)
      if (f.resend?.kind === "swap" && "text" in f.resend)
        swaps.set(`${type.runTypeId}:${runLineSlot(f.role, 0)}`, f.resend.text);
  }
  const out = new Map<number, string>();
  for (const line of lines) {
    if (line.archivedAt !== null || line.takeoffRunTypeId === null) continue;
    const text = swaps.get(
      `${line.takeoffRunTypeId}:${runLineSlot(line.runMaterialRole, line.runExtraKey)}`
    );
    if (text) out.set(line.id, text);
  }
  return out;
}

/** The warning strip's sentence for N such lines. */
export function partChangedStripText(count: number): string {
  return count === 1
    ? "1 run line's part has changed — it is still priced at the old part."
    : `${count} run lines' parts have changed — they are still priced at the old parts.`;
}
