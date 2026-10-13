/**
 * BID PROTECTION — what happens to a bid's numbers when it leaves Draft, and
 * how a Draft takes a newer math (owner Q14, Q15, Q16, Q22, 2026-10-12;
 * references/baseline-screen-plan.md § 8 and § 9 F1 / F8).
 *
 * Three things, each exported for Track A's release step as well as used by
 * `bids.create` / `bids.update` / the "Update to the current math" button:
 *
 *   leaveDraft          lock the quantities (Q15) and freeze the settings
 *                       (Q16), the moment a bid stops being a Draft;
 *   freezeBidSettings   write the overhead, profit, productivity and tax in
 *                       effect onto the bid. `dryRun` returns the patch and
 *                       writes nothing — for bids that were already
 *                       non-Draft before this shipped;
 *   priceBidAtVersion / moveBidToMathVersion
 *                       price one bid at a given math version, and bring a
 *                       Draft forward, recording a `bid_math_changes` row
 *                       when its total moved.
 *
 * ── Nothing here moves a number by itself ────────────────────────────────────
 * The lock writes the quantities the bid already shows (`lockBidQuantities`).
 * The freeze writes the values already in effect. Moving a version is only
 * ever called for a Draft. `server/bidProtection.test.ts` prices bids before
 * and after each of the three and asserts the total is unchanged.
 */
import {
  CURRENT_MATH_VERSION,
  mathVersionOf,
  reasonsBetween,
} from "../shared/mathVersion";
import type { Bid } from "../drizzle/schema";
import {
  bidRollup,
  companyDefaultsFor,
  resolveTaxRate,
  taxRulesFor,
  toTaxJurisdiction,
  type FrozenTaxDetail,
} from "./bidPricing";
import * as db from "./db";
import { lockBid } from "./bidWarnings";

const toDecimal4 = (value: number) => value.toFixed(4);

// ─── Pricing at a version ──────────────────────────────────────────────────────

/**
 * One bid's totals, priced as the bid screen prices it (`bidRollup`, with its
 * charges and tax), at math version `version` instead of the one it holds.
 *
 * The version is applied by pricing a COPY of the row with `mathVersion` set,
 * so every `atLeast(bid, n)` branch the rollup reaches takes the branch that
 * version would. Nothing is written.
 *
 * Today no PRICING branch reads the version: version 1 decides whether remove
 * and relocate marks can be SENT as labor (shared/roleLines.ts
 * `roleCountsOnBid`), and a bid below 1 has no such lines to price. So a bid
 * prices the same at 0 and at 1 — which is why moving Drafts to 1 writes no
 * change rows. A later version that changes a price branches in the rollup,
 * and this function then returns two different numbers with no change here.
 */
export async function priceBidAtVersion(
  bid: Bid,
  userId: number,
  version: number
) {
  const [lines, expenses, company, rules, jurisdictions] = await Promise.all([
    db.getRollupLines(bid.id, userId),
    db.getBidExpenseLines(bid.id),
    companyDefaultsFor(userId),
    taxRulesFor(userId),
    db.getTaxJurisdictions(userId),
  ]);
  const { totals, notPriced, incomplete } = bidRollup(
    { ...bid, mathVersion: version },
    lines,
    company,
    { rules, jurisdictions: jurisdictions.map(toTaxJurisdiction) },
    expenses
  );
  return {
    totalDue: totals.totalDue,
    workPrice: totals.workPrice,
    notPriced,
    incomplete,
  };
}

/**
 * Bring ONE bid to math version `to` (default: current).
 *
 * Refuses anything but an unlocked Draft (owner Q14: Active, Won, Lost and
 * locked bids never move), and a move backwards. Prices the bid at its own
 * version and at `to`; sets the version; and, only when "Total due" moved,
 * writes a `bid_math_changes` row with both totals and the registry's reasons
 * — which is what the "Total changed because…" strip reads.
 *
 * `seen`: the person pressed "Update to the current math" and was shown old →
 * new before applying, so their row is born seen. The release step passes
 * false, so the estimator is told on their next visit.
 *
 * `dryRun`: price both and return them; write nothing. The release step runs
 * this first and prints every moved Draft for the owner (plan § 8 item 4).
 */
export async function moveBidToMathVersion(input: {
  bid: Bid;
  userId: number;
  at: Date;
  to?: number;
  seen: boolean;
  dryRun?: boolean;
}): Promise<
  | {
      moved: true;
      from: number;
      to: number;
      totalBefore: number;
      totalAfter: number;
      changeRecorded: boolean;
    }
  | { moved: false; reason: "not-draft" | "locked" | "already-there" }
> {
  const { bid, userId, at } = input;
  const to = input.to ?? CURRENT_MATH_VERSION;
  const from = mathVersionOf(bid);
  if (bid.status !== "Draft") return { moved: false, reason: "not-draft" };
  if (bid.quantitiesLockedAt !== null)
    return { moved: false, reason: "locked" };
  if (from >= to) return { moved: false, reason: "already-there" };

  const [before, after] = await Promise.all([
    priceBidAtVersion(bid, userId, from),
    priceBidAtVersion(bid, userId, to),
  ]);
  const changed = before.totalDue !== after.totalDue;
  if (!input.dryRun) {
    await db.updateBid(bid.id, userId, { mathVersion: to });
    if (changed) {
      await db.insertBidMathChange({
        bidId: bid.id,
        fromVersion: bid.mathVersion,
        toVersion: to,
        totalBefore: toDecimal4(before.totalDue),
        totalAfter: toDecimal4(after.totalDue),
        reason: reasonsBetween(from, to),
        seenAt: input.seen ? at : null,
      });
    }
  }
  return {
    moved: true,
    from,
    to,
    totalBefore: before.totalDue,
    totalAfter: after.totalDue,
    changeRecorded: changed && !input.dryRun,
  };
}

// ─── Freezing the settings (Q16) ───────────────────────────────────────────────

/** The columns the freeze writes. Every one was NULL, or is the tax group. */
export type FreezePatch = Partial<
  Pick<
    Bid,
    | "overheadEnabled"
    | "overheadMode"
    | "overheadValue"
    | "profitMethod"
    | "profitValue"
    | "productivityPct"
    | "salesTaxEnabled"
    | "taxMaterials"
    | "taxLabor"
    | "taxApplyTo"
    | "taxRateFrozenPct"
    | "taxRateFrozenDetail"
    | "settingsFrozenAt"
  >
>;

/**
 * The frozen rate: what the bid would bill at with nothing TYPED on it.
 *
 * Resolved without `taxRateOverridePct` on purpose. A typed rate keeps winning
 * (`taxRateForBid`), so the frozen one only matters if somebody clears it —
 * and then the bid must fall back to the area it was sent under, not to
 * whatever the area says today.
 */
function frozenRateOf(
  bid: Bid,
  jurisdictions: Parameters<typeof resolveTaxRate>[1]
): Pick<FreezePatch, "taxRateFrozenPct" | "taxRateFrozenDetail"> {
  const { ratePct, ...detail } = resolveTaxRate(
    { ...bid, taxRateOverridePct: null },
    jurisdictions
  );
  return {
    taxRateFrozenPct: ratePct === null ? null : toDecimal4(ratePct),
    taxRateFrozenDetail: detail satisfies FrozenTaxDetail,
  };
}

/**
 * Write the values IN EFFECT onto a bid, so it stops following the company
 * (owner Q16). Pure arithmetic over what the pricing already reads:
 *
 * - **A group the bid inherits** (its switch column NULL) gets the company's
 *   values written into it — overhead (enabled, mode, value), profit (method,
 *   value), productivity.
 * - **A group a person overrode is KEPT.** Only a piece of it that still reads
 *   the company is filled: an overhead override with no mode follows the
 *   company's mode (`resolveBidPricingSettings`), so the mode is written.
 * - **Tax:** the four switches as one group when `salesTaxEnabled` is NULL,
 *   and the rate in effect (`taxRateFrozenPct` + its detail).
 * - `settingsFrozenAt = at`.
 *
 * The total cannot move: every value written is the one already being read.
 * `server/bidProtection.test.ts` prices before and after to prove it.
 *
 * `dryRun` returns the patch and writes nothing — the release step's first
 * pass over bids that were already Active / Won / Lost before this shipped.
 */
export async function freezeBidSettings(input: {
  bid: Bid;
  userId: number;
  at: Date;
  dryRun?: boolean;
}): Promise<FreezePatch> {
  const { bid, userId, at } = input;
  const [company, rules, jurisdictionRows] = await Promise.all([
    companyDefaultsFor(userId),
    taxRulesFor(userId),
    db.getTaxJurisdictions(userId),
  ]);
  const patch: FreezePatch = {};

  if (bid.overheadEnabled === null) {
    patch.overheadEnabled = company.overheadEnabled;
    patch.overheadMode = company.overheadMode;
    patch.overheadValue = toDecimal4(company.overheadValue);
  } else if (bid.overheadEnabled && bid.overheadMode === null) {
    patch.overheadMode = company.overheadMode;
  }

  if (bid.profitMethod === null) {
    patch.profitMethod = company.profitMethod;
    patch.profitValue = toDecimal4(company.profitValue);
  }

  if (bid.productivityPct === null) {
    patch.productivityPct = toDecimal4(company.productivityPct);
  }

  if (bid.salesTaxEnabled === null) {
    patch.salesTaxEnabled = rules.enabled;
    patch.taxMaterials = rules.taxMaterials;
    patch.taxLabor = rules.taxLabor;
    patch.taxApplyTo = rules.applyTo;
  }

  Object.assign(
    patch,
    frozenRateOf(bid, jurisdictionRows.map(toTaxJurisdiction))
  );
  patch.settingsFrozenAt = at;

  if (!input.dryRun) await db.updateBid(bid.id, userId, patch);
  return patch;
}

/**
 * A frozen bid whose tax AREA or ADDRESS a person just changed: re-freeze the
 * rate from the new answer. Without this, pinning a different area on a sent
 * bid would change nothing on screen — a control that silently does nothing.
 * A person's own edit, so it may move the number; nothing else calls this.
 */
export async function refreezeTaxRate(bid: Bid, userId: number): Promise<void> {
  if (bid.settingsFrozenAt === null) return;
  const jurisdictions = (await db.getTaxJurisdictions(userId)).map(
    toTaxJurisdiction
  );
  await db.updateBid(bid.id, userId, frozenRateOf(bid, jurisdictions));
}

// ─── Leaving Draft (Q15 + Q16) ─────────────────────────────────────────────────

/**
 * The bid just stopped being a Draft — `bids.update` moved it, or
 * `bids.create` made it non-Draft. Lock its quantities through the same path
 * the Lock button uses (`db.lockBidQuantities`), unless a person already
 * locked it, and freeze its settings.
 *
 * Unlock works as before: one click, and nothing here runs again unless the
 * bid goes back to Draft and leaves it once more.
 */
export async function leaveDraft(bid: Bid, userId: number, at: Date) {
  const locked =
    bid.quantitiesLockedAt === null ? await lockBid(bid.id, userId, at) : null;
  // Read again: the lock may have rewritten the bid's row.
  const current = (await db.getBidById(bid.id, userId)) ?? bid;
  const frozen = await freezeBidSettings({ bid: current, userId, at });
  return { locked, frozen };
}
