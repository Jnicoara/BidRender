/**
 * Reading a material's price history (references/price-history-plan.md § 8
 * step 2). Read-only, and read ONLY by `materials.priceHistory` — no pricing
 * path, resolver or total imports this file (plan § 3.6; pinned by
 * server/priceHistoryRead.test.ts).
 *
 * Keyed by `materialItemKey` (the shipped id for a shipped item), so a fork,
 * re-fork or pin never splits one item's history (§ 3.2).
 */
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import {
  materialPriceHistory,
  materials,
  starterChanges,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  shippedOnPage,
  type PriceHistoryEntry,
} from "../shared/priceHistory";

export const PRICE_HISTORY_PAGE = 50;

export type PriceHistoryPage = {
  entries: PriceHistoryEntry[];
  nextCursor: string | null;
  /**
   * The row's current price and its date when that date is OLDER than any
   * recorded change (owner Q7) — read live from the row, never a backfill.
   * Only on the last page.
   */
  beforeHistory: { unitCost: number; changedAt: string } | null;
};

/**
 * One page, newest first. `userId` is the COMPANY (ctx.scope.dataUserId);
 * `materialKey` is `materialItemKey` of the row the panel was opened on.
 */
export async function readPriceHistory(input: {
  userId: number;
  materialKey: number;
  /** The shipped row's id when the item is a shipped one, else null. */
  shippedId: number | null;
  cursor?: string | null;
  limit?: number;
}): Promise<PriceHistoryPage> {
  const db = await getDb();
  if (!db) return { entries: [], nextCursor: null, beforeHistory: null };
  const limit = input.limit ?? PRICE_HISTORY_PAGE;
  const after = decodeHistoryCursor(input.cursor);

  const rows = await db
    .select({
      h: materialPriceHistory,
      who: users.name,
    })
    .from(materialPriceHistory)
    .leftJoin(users, eq(users.id, materialPriceHistory.changedByUserId))
    .where(
      and(
        eq(materialPriceHistory.userId, input.userId),
        eq(materialPriceHistory.materialKey, input.materialKey),
        after
          ? or(
              lt(materialPriceHistory.createdAt, after.at),
              and(
                eq(materialPriceHistory.createdAt, after.at),
                lt(materialPriceHistory.id, after.id)
              )
            )
          : undefined
      )
    )
    .orderBy(
      desc(materialPriceHistory.createdAt),
      desc(materialPriceHistory.id)
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const n = (v: string | null) => (v === null ? null : Number(v));

  const company: PriceHistoryEntry[] = page.map(({ h, who }) => ({
    kind: "company",
    id: h.id,
    at: h.createdAt.toISOString(),
    unitCost: Number(h.unitCost),
    previousUnitCost: n(h.previousUnitCost),
    unitOfSale: h.unitOfSale,
    packQty: n(h.packQty),
    packLabel: h.packLabel,
    packPrice: n(h.packPrice),
    supplierName: h.supplierName,
    priceAsOf:
      h.priceAsOf === null
        ? null
        : new Date(h.priceAsOf).toISOString().slice(0, 10),
    source: h.source,
    isExamplePrice: h.isExamplePrice,
    who: who ?? null,
  }));

  // BidRidge's own example-price changes, from the log that already holds
  // them (§ 3.4) — never copied into the company's table.
  let shipped: PriceHistoryEntry[] = [];
  let ownCopySince: Date | null = null;
  if (input.shippedId !== null) {
    const [own] = await db
      .select({ createdAt: materials.createdAt })
      .from(materials)
      .where(
        and(
          eq(materials.userId, input.userId),
          eq(materials.baselineId, input.shippedId)
        )
      )
      .limit(1);
    ownCopySince = own?.createdAt ?? null;
    const changes = await db
      .select()
      .from(starterChanges)
      .where(
        and(
          eq(starterChanges.targetTable, "materials"),
          eq(starterChanges.targetRowId, input.shippedId),
          eq(starterChanges.kind, "field"),
          eq(starterChanges.field, "costPerUnit")
        )
      )
      .orderBy(desc(starterChanges.createdAt), desc(starterChanges.id));
    shipped = changes.map(c => ({
      kind: "shipped" as const,
      id: c.id,
      at: c.createdAt.toISOString(),
      unitCost: Number(c.newValue),
      previousUnitCost: c.oldValue === null ? null : Number(c.oldValue),
    }));
  }

  const windowTop = after?.at ?? new Date(8.64e15);
  const oldest = page.at(-1)?.h.createdAt ?? null;
  const shippedHere = shippedOnPage(shipped, {
    windowTop,
    windowBottom: hasMore ? oldest : null,
    ownCopySince,
  });

  const entries = [...company, ...shippedHere].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  // "Last changed … before history was kept" (Q7): the row's own date, read
  // live, when nothing recorded is as old as it.
  let beforeHistory: PriceHistoryPage["beforeHistory"] = null;
  if (!hasMore) {
    const [row] = await db
      .select({
        costPerUnit: materials.costPerUnit,
        priceUpdatedAt: materials.priceUpdatedAt,
      })
      .from(materials)
      .where(
        and(
          or(
            eq(materials.id, input.materialKey),
            and(
              eq(materials.baselineId, input.materialKey),
              eq(materials.userId, input.userId)
            )
          ),
          or(isNull(materials.userId), eq(materials.userId, input.userId))
        )
      )
      .orderBy(desc(materials.userId))
      .limit(1);
    const firstRecorded = entries.at(-1)?.at ?? null;
    if (
      row?.priceUpdatedAt &&
      Number(row.costPerUnit) > 0 &&
      (firstRecorded === null ||
        row.priceUpdatedAt.getTime() < new Date(firstRecorded).getTime())
    )
      beforeHistory = {
        unitCost: Number(row.costPerUnit),
        changedAt: row.priceUpdatedAt.toISOString(),
      };
  }

  const last = page.at(-1);
  return {
    entries,
    nextCursor:
      hasMore && last ? encodeHistoryCursor(last.h.createdAt, last.h.id) : null,
    beforeHistory,
  };
}
