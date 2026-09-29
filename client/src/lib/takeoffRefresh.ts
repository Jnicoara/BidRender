/**
 * Which cached queries on the Plans screen each kind of change must move.
 *
 * ── Why this is data, and not four hand-kept helpers ─────────────────────────
 * The screen used to keep these lists inside `refreshRuns`, `refreshStamps`
 * and `refreshSheets`, and in a component of its own for heights. They
 * drifted, and each gap left a number on screen that was confidently wrong
 * rather than blank — CLAUDE.md § "a test that calls the server cannot see a
 * screen showing yesterday's answer". Three were found by reading on
 * 2026-09-27 (references/track-b-next-batch-plan.md § 1):
 *
 *   - removing a mark at a run's end left that run's drops, connectors and
 *     Send preview as they were, because a run's end mark is `ON DELETE SET
 *     NULL` and nothing told the run queries;
 *   - removing a plan set left its quantities in every bid-wide figure while
 *     another set stayed open;
 *   - changing a job height moved the runs panel and not the Send preview.
 *
 * The screen cannot be tested here — `vitest` reaches `client/src/lib`, not a
 * React component — so the RULE lives here, where a test can go red, and the
 * screen only iterates it. What this cannot prove is that the screen calls it;
 * that is a look at the running app.
 */

/** A cached query the Plans screen shows a quantity, a sheet or a mark from. */
export type TakeoffQuery =
  // Per sheet.
  | "takeoffRuns.listForSheet"
  | "takeoffStamps.listForSheet"
  | "bidPdfs.sheets"
  | "bidPdfs.sheetIdentities"
  // Per bid: marks or runs on ANY sheet move these.
  | "takeoffRuns.totals"
  | "takeoffRuns.drops"
  | "takeoffRuns.typeColors"
  | "takeoffRunTypes.bridgeForBid"
  | "takeoffGroups.list"
  | "takeoffHeights.forBid"
  | "bidPdfs.list"
  | "bidPdfs.sheetJumpList"
  // Not keyed by bid on the server, so invalidated whole.
  | "bidPdfs.searchText"
  | "takeoffRuns.measurability";

/** The figures a bid is priced from, or that say what it will be priced at. */
export const BID_QUANTITY_QUERIES = [
  "takeoffRuns.totals",
  "takeoffRuns.drops",
  "takeoffRunTypes.bridgeForBid",
  "takeoffGroups.list",
] as const satisfies readonly TakeoffQuery[];

const RUN_QUERIES = [
  "takeoffRuns.listForSheet",
  "takeoffRuns.totals",
  "takeoffRuns.drops",
  "takeoffRuns.typeColors",
  "takeoffRunTypes.bridgeForBid",
  /*
    The count list carries the bid's quantity lock (`quantitiesLockedAt`),
    and the screen reads it from there on the understanding that a run
    change refreshes it. It did not until 2026-09-27; now it does, so that
    reading is true by construction.
  */
  "takeoffGroups.list",
] as const satisfies readonly TakeoffQuery[];

const MARK_QUERIES = [
  "takeoffStamps.listForSheet",
  /*
    Bid-wide, because the send control's "Send 14 to bid" has to be the
    number that will actually go over, and marks on another sheet move it.
  */
  "takeoffGroups.list",
] as const satisfies readonly TakeoffQuery[];

const SHEET_QUERIES = [
  "bidPdfs.sheets",
  "bidPdfs.sheetIdentities",
  "bidPdfs.sheetJumpList",
  "bidPdfs.searchText",
  // Derived from the sheet's scale but cached apart from it.
  "takeoffRuns.measurability",
  // A sheet's scale is what every traced length on it is worked out from.
  ...RUN_QUERIES,
] as const satisfies readonly TakeoffQuery[];

export type TakeoffChange =
  /** A run traced, edited, answered, typed or deleted. */
  | "run"
  /** Marks placed. Placing a mark does not move a run's ends. */
  | "marksPlaced"
  /**
   * A mark removed. A run that ended on it loses that end (`SET NULL`), so
   * its drops, its connectors and what Send would put on the bid all move.
   */
  | "markRemoved"
  /** A sheet's row: its scale, its number, its title. */
  | "sheet"
  /**
   * A whole plan set removed. Its sheets, marks and runs cascade away, so
   * every bid-wide figure moves while another set stays on screen.
   */
  | "planRemoved"
  /** A job height. Heights decide vertical footage, which Send puts on the bid. */
  | "heights"
  /**
   * A counted group's DROP set or changed (held-migrations plan § 3). Its
   * footage lands on run-type lines, so every bid quantity moves, and the
   * group row shows the result.
   */
  | "groupDrop";

function unique(list: readonly TakeoffQuery[]): readonly TakeoffQuery[] {
  return Array.from(new Set(list));
}

export const QUERIES_MOVED_BY: Readonly<
  Record<TakeoffChange, readonly TakeoffQuery[]>
> = {
  run: unique(RUN_QUERIES),
  /*
    Marks placed move BID QUANTITIES since 2026-09-29: a mark in a count with
    a drop (§ 3) adds that drop's pipe and wire to the totals, the Send
    preview and the drops readout. Refreshing only the mark queries left those
    showing the old footage — the staleness CLAUDE.md warns about, and the
    server tests cannot see it.
  */
  marksPlaced: unique([...MARK_QUERIES, ...BID_QUANTITY_QUERIES]),
  markRemoved: unique([...MARK_QUERIES, ...RUN_QUERIES]),
  sheet: unique(SHEET_QUERIES),
  planRemoved: unique([
    "bidPdfs.list",
    ...SHEET_QUERIES,
    ...MARK_QUERIES,
    ...RUN_QUERIES,
  ]),
  heights: unique(["takeoffHeights.forBid", ...RUN_QUERIES]),
  groupDrop: unique([...MARK_QUERIES, ...RUN_QUERIES]),
};
