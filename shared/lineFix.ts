/**
 * "FIX THIS LINE" — the rules behind the panel that fixes an assembly or run
 * line from the bid, in place (references/never-stuck-plan.md, gap 11, as
 * amended by the owner 2026-10-07).
 *
 * ── What it is for ───────────────────────────────────────────────────────────
 * An assembly line that says "Not priced", "+ 1 part not priced", "+ hours not
 * set" or "+ material not priced" could only be fixed by leaving the bid,
 * editing the library, removing the line and adding it again — eight clicks
 * and a lost place. The panel puts the missing number on THIS line, and, with
 * "Also save to my library" (ON by default), on the library row too.
 *
 * ── What it never does ───────────────────────────────────────────────────────
 *   • GUESS. Every number written to the line is one the person typed or
 *     picked on the panel. A part's quantity comes from the recipe and is
 *     shown beside the box before Save; nothing is filled in on their behalf.
 *   • MOVE ANYTHING ELSE. Other lines on this bid, and every other bid, keep
 *     their frozen numbers (the snapshot rule, CLAUDE.md § Architecture).
 *     Bringing other lines here up to date is its own, offered, action.
 *   • CHANGE A FIXED BID. A bid whose quantities are locked, or that is Won
 *     or Lost, refuses the line change and still takes the library change
 *     (`lineFixRefusal`).
 *
 * Pure, so the screen and the suite read one rule.
 */
import { lineHoursNotSet, lineHoursUnset } from "./lineNotPriced";
import { lineHasUnpricedLabor } from "./laborRatePricing";
import { needsPricing } from "./materialPricing";
import { laborInRunRate } from "./runFittings";

// ─── When the line may not change ────────────────────────────────────────────

/**
 * Why this bid's lines cannot be fixed in place, or null when they can.
 *
 * TWO reasons, and they are the two the app already treats as "this bid is
 * history": the QUANTITY LOCK (the estimator's own "this is what I sent",
 * `shared/quantityLock.ts`) and a Won or Lost status (the same test
 * `bids.get` uses to stop flagging older labor rates — "on a Won or Lost bid
 * an older rate is history, not a mistake"). There is no separate "sent"
 * status in the schema; Draft and Active are both still being priced.
 *
 * Each sentence says what still works, so the person is not stuck: the
 * library half is still offered.
 */
export function lineFixRefusal(bid: {
  status: string;
  quantitiesLockedAt: Date | string | null;
}): string | null {
  if (bid.quantitiesLockedAt !== null) {
    return "This bid is locked, so its lines don't change. Fix it in your library for next time — or unlock the bid first.";
  }
  if (bid.status === "Won" || bid.status === "Lost") {
    return `This bid is marked ${bid.status}, so its prices are fixed. Fix it in your library for next time.`;
  }
  return null;
}

// ─── What is missing from a line ─────────────────────────────────────────────

export type FixableLineLike = {
  qty: string | number;
  assemblyId: number | null;
  takeoffRunTypeId: number | null;
  runMaterialRole: string | null;
  runMaterialId: number | null;
  snapshotMaterialCost: string | number | null;
  snapshotLaborHours: string | number | null;
  snapshotLaborRate: string | number | null;
  snapshotLaborOnly: boolean | null;
  /** The line's unpriced-part count, resolved (`withUnpricedParts`). */
  unpricedParts: number;
};

/**
 * What the panel can fix on this line. Every flag maps to one box on the
 * panel, so a line with none of them shows no Fix button at all.
 *
 *   parts     an assembly line with $0 parts frozen in it
 *   material  an assembly line with NO material at all (and not "Labor only")
 *   hours     an assembly line whose hours were not set when it was added
 *   rate      an assembly line with hours priced at a $0 rate
 *   runPrice  a run line whose part had no price when it was sent
 *   runHours  a run line whose part had no labor unit when it was sent
 *
 * A hand-priced line has none: its own fields are already on the line
 * (`HandPricedLineFields`).
 */
export type LineFixGaps = {
  parts: boolean;
  material: boolean;
  hours: boolean;
  rate: boolean;
  runPrice: boolean;
  runHours: boolean;
};

export const NO_GAPS: LineFixGaps = {
  parts: false,
  material: false,
  hours: false,
  rate: false,
  runPrice: false,
  runHours: false,
};

export function lineFixGaps(line: FixableLineLike): LineFixGaps {
  const qty = Number(line.qty);
  // Nothing on the line to price: $0 for nothing is true (lineNotPriced).
  if (!Number.isFinite(qty) || qty <= 0) return NO_GAPS;

  if (line.assemblyId !== null) {
    const parts = Math.floor(line.unpricedParts) > 0;
    return {
      ...NO_GAPS,
      parts,
      material:
        !parts &&
        line.snapshotLaborOnly !== true &&
        Number(line.snapshotMaterialCost ?? 0) === 0,
      hours: lineHoursNotSet(line),
      rate: lineHasUnpricedLabor(line),
    };
  }

  if (line.takeoffRunTypeId !== null && line.runMaterialId !== null) {
    return {
      ...NO_GAPS,
      // A field bend is labor on a part that is $0 by nature; never a price.
      runPrice:
        line.runMaterialRole !== "fieldBend" &&
        needsPricing(line.snapshotMaterialCost),
      runHours: lineHoursUnset(line) && !laborInRunRate(line.runMaterialRole),
    };
  }

  return NO_GAPS;
}

export function hasLineFixGap(gaps: LineFixGaps): boolean {
  return Object.values(gaps).some(Boolean);
}

// ─── The arithmetic of putting a price on a frozen line ──────────────────────

/** One part as the line froze it (`snapshotMarkupSource.parts`). */
export type FrozenPart = { materialId: number | null; cost: number };

/** The material half of a line, as the fix reads and writes it. */
export type LineMaterialState = {
  /** `snapshotMaterialCost` — material for ONE of the line. */
  materialCost: number;
  /** `snapshotUnpricedParts`; null on a line from before 0087. */
  unpricedParts: number | null;
  /** `snapshotMarkupPct`; null on a line from before markup rules (0%). */
  markupPct: number | null;
  /** The parts and cost weights the line was frozen from. */
  frozenParts: FrozenPart[];
};

/** A part the person priced, with what it adds to ONE of the line. */
export type PricedPart = {
  materialId: number;
  /** From the recipe, shown beside the box before Save. */
  qtyPerOne: number;
  /** Typed: the price for one unit of sale. */
  price: number;
  /** This part's markup under the rules in force (`resolvePartMarkup`). */
  markupPct: number;
};

export type LineMaterialResult =
  | { ok: true; state: LineMaterialState }
  | { ok: false; message: string };

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * The line's markup once these parts carry a cost.
 *
 * The parts already priced keep the share they had: their dollars of markup
 * are `oldPct × oldTotal`, unchanged. Only the newly priced parts add their
 * own. That is exactly the blend `resolveLineMarkup` would have produced had
 * the parts been priced when the line was frozen — with the new parts read
 * under today's rules, as Send-again's refill already does for a run line.
 *
 * A line whose every part was $0 stored a plain average that only served as
 * a label; it carries no weight, so the new parts set the blend alone. A
 * line from before markup rules stays at its 0% (null).
 */
export function blendedMarkup(
  oldPct: number | null,
  oldTotal: number,
  added: readonly { cost: number; pct: number }[]
): number | null {
  if (oldPct === null) return null;
  const addedTotal = added.reduce((s, a) => s + Math.max(0, a.cost), 0);
  const total = Math.max(0, oldTotal) + addedTotal;
  if (total <= 0) return oldPct;
  const kept = oldTotal > 0 ? oldPct * oldTotal : 0;
  const fresh = added.reduce((s, a) => s + Math.max(0, a.cost) * a.pct, 0);
  return round6((kept + fresh) / total);
}

/**
 * Put typed prices on $0 parts frozen in an assembly line.
 *
 * Refused unless every part named was frozen at $0 on THIS line — a part the
 * line already carries a cost for is not missing from it, and adding it again
 * would count it twice.
 */
export function pricePartsOnLine(
  state: LineMaterialState,
  priced: readonly PricedPart[]
): LineMaterialResult {
  if (priced.length === 0) return { ok: true, state };
  const seen = new Set<number>();
  const parts = state.frozenParts.map(p => ({ ...p }));
  const added: { cost: number; pct: number }[] = [];
  for (const part of priced) {
    if (seen.has(part.materialId))
      return { ok: false, message: "The same part was priced twice." };
    seen.add(part.materialId);
    if (!(part.price > 0))
      return { ok: false, message: "Type a price above $0 for each part." };
    if (!(part.qtyPerOne > 0))
      return {
        ok: false,
        message: "That part has no quantity in the recipe, so it adds nothing.",
      };
    const frozen = parts.find(
      p => p.materialId === part.materialId && p.cost === 0
    );
    if (!frozen)
      return {
        ok: false,
        message:
          "That part was not missing from this line when it was added, so pricing it here would count it twice.",
      };
    frozen.cost = round4(part.price * part.qtyPerOne);
    added.push({ cost: frozen.cost, pct: part.markupPct });
  }
  const oldTotal = state.frozenParts.reduce((s, p) => s + p.cost, 0);
  return {
    ok: true,
    state: {
      materialCost: round4(
        state.materialCost + added.reduce((s, a) => s + a.cost, 0)
      ),
      unpricedParts:
        state.unpricedParts === null
          ? parts.filter(p => p.cost === 0).length
          : Math.max(0, state.unpricedParts - priced.length),
      markupPct: blendedMarkup(state.markupPct, oldTotal, added),
      frozenParts: parts,
    },
  };
}

/**
 * Add a picked material to an assembly line that has none.
 *
 * The price is the person's: typed, or the picked material's own library
 * price that they saw on the panel. Never a $0 — that would turn "material
 * not priced" into a silent zero (the reason `bids.linkLine` refuses one).
 */
export function addMaterialToLine(
  state: LineMaterialState,
  add: PricedPart
): LineMaterialResult {
  if (!(add.price > 0))
    return {
      ok: false,
      message: "That material has no price yet. Type one to add it.",
    };
  if (!(add.qtyPerOne > 0))
    return { ok: false, message: "Type how many go on one." };
  const cost = round4(add.price * add.qtyPerOne);
  const oldTotal = state.frozenParts.reduce((s, p) => s + p.cost, 0);
  return {
    ok: true,
    state: {
      materialCost: round4(state.materialCost + cost),
      unpricedParts: state.unpricedParts,
      markupPct: blendedMarkup(state.markupPct, oldTotal, [
        { cost, pct: add.markupPct },
      ]),
      frozenParts: [...state.frozenParts, { materialId: add.materialId, cost }],
    },
  };
}

// ─── What the panel says ─────────────────────────────────────────────────────

/** The note under the tick box (plan § 11, step 3). */
export const LIBRARY_NOTE = "Other bids keep their prices. New lines use this.";

/** The offer afterwards, only when there are some (plan § 11, step 3). */
export function otherLinesOffer(count: number): string {
  return count === 1
    ? "Update 1 other line on this bid to the new figure?"
    : `Update ${count} other lines on this bid to the new figure?`;
}
