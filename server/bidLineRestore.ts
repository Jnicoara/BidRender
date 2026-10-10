/**
 * Remove a bid line with a snapshot, and put that snapshot back — Undo for
 * removing a bid line (owner, 2026-09-30, todo.md; built 2026-10-10).
 *
 * ── The EXACT line, never a re-add ───────────────────────────────────────────
 * A line carries its prices frozen when it was added (`snapshot*`). Adding the
 * same assembly again would price it at TODAY's numbers, so an undo that
 * re-added would quietly re-price last week's bid. This restores the stored
 * row as it was, under the same id, every frozen field included. The row
 * travels to the page in a SIGNED packet (server/restorePacket.ts), exactly as
 * a deleted count does, so a client cannot write a line it was not handed.
 *
 * ── What else the delete touched ─────────────────────────────────────────────
 * - `bid_panels.lineItemId` is `ON DELETE SET NULL`: a panel priced by this
 *   line loses the link. The snapshot keeps which panels pointed here and the
 *   restore points them back — only those still pointing at nothing, so a
 *   panel re-linked since keeps its new line.
 * - `pricing_problem_reports.lineId` cascades. Those are diagnostics; they are
 *   re-filed the next time the line is priced, so nothing is kept.
 * - A linked unit copy is FORKED by a removal (`db.deleteBidLineItem`). The
 *   restore leaves it forked: un-forking would let a later "push to copies"
 *   overwrite anything edited in that unit since, and a fork changes no number.
 *
 * ── What a restore refuses ───────────────────────────────────────────────────
 * The same lock rule as removing: a line from the plans does not come back
 * onto a bid whose quantities were locked since. A count or run type the line
 * followed that is gone (`restrict`) refuses; one sent to the bid again since
 * (the unique per count/role) refuses rather than making two. A provenance
 * link that is gone (assembly, run material, quote — all `set null`) comes
 * back as null, which is what the foreign key would have done had the line
 * stayed.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  assemblies,
  bidLineItems,
  bidPanels,
  bidQuotes,
  materials,
  type BidLineItem,
} from "../drizzle/schema";
import { getDb } from "./db";

export type LineSnapshot = {
  /** The stored row, raw — not the plan-count-resolved one the list shows. */
  line: BidLineItem;
  /** Panels whose `lineItemId` the delete set to null. */
  panelIds: number[];
};

function refuse(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

/** MySQL's duplicate key (1062) — here, the line's per-count unique. */
function isDuplicate(error: unknown): boolean {
  const e = error as { errno?: number; cause?: { errno?: number } };
  return e?.errno === 1062 || e?.cause?.errno === 1062;
}

/** MySQL's "a foreign key points at a row that is not there" (1452). */
function isMissingParent(error: unknown): boolean {
  const e = error as { errno?: number; cause?: { errno?: number } };
  return e?.errno === 1452 || e?.cause?.errno === 1452;
}

/** The raw row and what points at it, read before `db.deleteBidLineItem`. */
export async function snapshotBidLine(
  id: number,
  bidId: number
): Promise<LineSnapshot | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [line] = await db
    .select()
    .from(bidLineItems)
    .where(and(eq(bidLineItems.id, id), eq(bidLineItems.bidId, bidId)))
    .limit(1);
  if (!line) return null;
  const panels = await db
    .select({ id: bidPanels.id })
    .from(bidPanels)
    .where(and(eq(bidPanels.bidId, bidId), eq(bidPanels.lineItemId, id)));
  return { line, panelIds: panels.map(p => p.id) };
}

/** Put a removed line back: same id, same frozen prices, panels re-linked. */
export async function restoreBidLine(snapshot: LineSnapshot): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { line } = snapshot;
  return db.transaction(async tx => {
    const [already] = await tx
      .select({ id: bidLineItems.id })
      .from(bidLineItems)
      .where(eq(bidLineItems.id, line.id))
      .limit(1);
    if (already) refuse("That line is already back.");

    // Provenance only, `set null` on delete: a parent gone since is null here.
    const row = { ...line };
    if (row.assemblyId !== null) {
      const [a] = await tx
        .select({ id: assemblies.id })
        .from(assemblies)
        .where(eq(assemblies.id, row.assemblyId))
        .limit(1);
      if (!a) row.assemblyId = null;
    }
    if (row.runMaterialId !== null) {
      const [m] = await tx
        .select({ id: materials.id })
        .from(materials)
        .where(eq(materials.id, row.runMaterialId))
        .limit(1);
      if (!m) row.runMaterialId = null;
    }
    if (row.quoteId !== null) {
      const [q] = await tx
        .select({ id: bidQuotes.id })
        .from(bidQuotes)
        .where(eq(bidQuotes.id, row.quoteId))
        .limit(1);
      if (!q) row.quoteId = null;
    }

    try {
      await tx.insert(bidLineItems).values(row);
    } catch (error) {
      if (isDuplicate(error))
        refuse(
          "That count is on the bid again since, so this line cannot be put back beside it."
        );
      if (isMissingParent(error))
        refuse(
          "The bid, count or run type that line followed has gone since, so it cannot be put back."
        );
      throw error;
    }

    if (snapshot.panelIds.length > 0)
      await tx
        .update(bidPanels)
        .set({ lineItemId: line.id })
        .where(
          and(
            inArray(bidPanels.id, snapshot.panelIds),
            eq(bidPanels.bidId, line.bidId),
            isNull(bidPanels.lineItemId)
          )
        );
    return line.id;
  });
}
