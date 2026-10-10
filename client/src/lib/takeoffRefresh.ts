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

import type { UndoOp } from "./undoStack";

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
  | "takeoffStamps.unconfirmedForBid"
  | "takeoffSummary.forBid"
  | "takeoffHeights.forBid"
  | "homeruns.forBid"
  | "bidPdfs.list"
  | "bidPdfs.sheetJumpList"
  // The bid's own lines, and the materials list built from them.
  | "bids.get"
  | "materialsList.get"
  // Not keyed by bid on the server, so invalidated whole.
  | "bidPdfs.searchText"
  | "takeoffRuns.measurability";

/** The figures a bid is priced from, or that say what it will be priced at. */
export const BID_QUANTITY_QUERIES = [
  "takeoffRuns.totals",
  "takeoffRuns.drops",
  "takeoffRunTypes.bridgeForBid",
  "takeoffGroups.list",
  /*
    ADDED 2026-09-29, with deleting a selection of marks and "Undo drops". A
    line that follows the plans takes its quantity from the marks, so the
    BID's cached lines and the materials list move with every change here.
    Neither was refreshed: the materials list, opened again after a delete,
    showed its last answer until the refetch landed, and the bid screen kept
    the page it had cached. The owner's rule is that bid lines and the
    materials list update right after any delete or undo.
  */
  "bids.get",
  "materialsList.get",
  /*
    ADDED 2026-09-29 with the whole-set summary. It states every quantity on
    the plan set as on the bid or not, so anything that moves a quantity or a
    line moves it — which is why it lives in this list and not beside one
    mutation (CLAUDE.md, the staleness class).
  */
  "takeoffSummary.forBid",
  /*
    ADDED 2026-10-07 with homerun footage (homerun-footage-plan § 10). A
    homerun leaves from a MARK and is measured on the sheet's SCALE to a
    ceiling HEIGHT, so a moved mark, a new scale or a new height all move
    it — and every one of those changes already refreshes this list.
  */
  "homeruns.forBid",
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
  // Everything a run moves on the bid, so a new bid figure is added once.
  ...BID_QUANTITY_QUERIES,
] as const satisfies readonly TakeoffQuery[];

const MARK_QUERIES = [
  "takeoffStamps.listForSheet",
  /*
    Bid-wide, because the send control's "Send 14 to bid" has to be the
    number that will actually go over, and marks on another sheet move it.
  */
  "takeoffGroups.list",
  /*
    ADDED 2026-10-10 with the status bar's "Check them": the list of
    unconfirmed marks it walks. A mark answered, deleted, moved, put back by
    Undo or placed by the reader changes it, and every one of those already
    refreshes this list — so it is here, not beside the walk's own buttons.
  */
  "takeoffStamps.unconfirmedForBid",
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
  /**
   * Marks put under another count (takeoffStamps.moveToGroup). Two counts'
   * quantities move at once, each with its drop, and a run ending on a moved
   * mark now ends on a different thing.
   */
  | "marksMoved"
  /**
   * Marks marked new, existing, remove or relocate (shared/markStatus.ts).
   * Only a new mark is a quantity, so every bid figure the marks feed moves —
   * the count's number, its line, its drop's footage on the run-type lines,
   * the materials list — exactly as a move between counts does.
   */
  | "markStatus"
  /**
   * A mark's own height set, or its drop left off or given back
   * (vertical-drops-plan § 2). It moves that mark's drop — the count's row,
   * a run end linked to it, the run-type lines and the materials list —
   * so the same queries as a status change, keyed by BID: a drop placed on
   * one sheet moves the totals every sheet shows.
   */
  | "markDrop"
  /**
   * A count's pin look chosen (shape, letter, colour). No number moves; the
   * count list carries the look. The legend's `symbols` and the assemblies
   * list are not per bid and are the caller's to drop.
   */
  | "pinLook"
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
  | "groupDrop"
  /**
   * An undo or redo (@/lib/undoStack). It can put back or take away marks
   * AND runs at once, so it moves everything either can. Its per-sheet lists
   * are the STEP's sheet, which may not be the open one — see
   * `sheetsToRefresh`.
   */
  | "undo"
  /** Every mark and run on one sheet removed (or put back) in one step. */
  | "sheetCleared"
  /**
   * What sits at a run's end, or its height: the DROP. Until 2026-09-29 the
   * ends editor refreshed `takeoffRuns` only, so the Send preview, the bid's
   * lines and the materials list kept the old drop footage on screen.
   */
  | "runEnds"
  /**
   * A count or run type sent to the bid, singly or by Send all. Until
   * 2026-09-29 the single count send refetched the count list only, so the
   * bid's cached lines and the materials list kept the old answer.
   */
  | "sentToBid"
  /**
   * An assembly linked to a count, or taken off it (legend plan § 8a). Every
   * mark of the count changes what it counts — its colour, what the
   * materials list itemises and what Send would price — on every sheet.
   * The other sheets' cached marks are the caller's to drop, as for a whole
   * count deleted: this table knows the open sheet only.
   */
  | "countSource"
  /**
   * A legend symbol renamed (2026-10-01). Its plain count on this bid takes
   * the new name, and that name is read live by the count card, the marks'
   * tooltips, the bid line, the materials list and the summary — so all of
   * them move, though no number does. The legend's own `symbols` query is not
   * per bid and is the caller's to drop.
   */
  | "countRenamed"
  /**
   * A homerun synced, placed, confirmed or overridden, or the bid's homerun
   * settings changed. Its footage lands on the homerun type's bid lines, so
   * every bid quantity moves with it.
   */
  | "homerun";

/**
 * Which sheets' own lists (marks, runs) a change must refresh.
 *
 * The screen invalidated per-sheet lists for the OPEN sheet only. An undo
 * pressed after switching sheets changes the sheet the step was on, and that
 * sheet's cached marks would have shown the old answer on return — the
 * staleness class in CLAUDE.md. So both, when they differ.
 */
export function sheetsToRefresh(
  openSheetId: number | null | undefined,
  stepSheetId: number | "every" | null | undefined
): number[] | "every" {
  if (stepSheetId === "every") return "every";
  const ids = [openSheetId, stepSheetId].filter(
    (id): id is number => typeof id === "number"
  );
  return Array.from(new Set(ids));
}

/**
 * Which sheets an undo or redo step changes: the sheet it was taken on, or
 * EVERY sheet (never-stuck gap 4b, 2026-10-08).
 *
 * A count deleted takes its marks off every sheet, and the delete itself
 * refreshes them all. Its undo refreshed only the open sheet and the step's,
 * so another sheet showed the count's marks still gone until its own
 * refetch landed. A switch over every kind, so a new step has to say.
 */
/**
 * How an "every sheet" refresh invalidates: REFETCHING the sheets not on
 * screen, not only marking them stale. React Query's default
 * (`refetchType: "active"`) leaves another sheet's cached marks in place
 * until it is opened, and opening it paints that stale copy first — batch 1
 * of Gap 4b did exactly that, and it was seen on screen on 2026-10-08:
 * "0 marks" then "2 marks" on a sheet whose count had just been put back.
 * The cached sheets are the few this bid has visited, so it is cheap.
 */
export const EVERY_SHEET_REFETCH = { refetchType: "all" } as const;

export function sheetsAnUndoMoves(
  op: UndoOp,
  stepSheetId: number
): number | "every" {
  switch (op.kind) {
    case "restoreGroup":
    case "removeGroup":
      return "every";
    case "removeMarks":
    case "restoreMarks":
    case "removeRun":
    case "restoreRun":
    case "setPoints":
    case "restorePoints":
    case "setEnds":
    case "restoreEnds":
    case "restoreSheet":
    case "clearSheet":
    // Marks moved between counts are a selection on the step's sheet.
    case "moveMarks":
    // A status is set on a selection, or by the demo offer, on one sheet.
    case "markStatus":
    // A run's type, length, circuits and legs (Gap 4c) are on its own sheet;
    // the bid-wide figures they move are refreshed whichever sheet it is.
    case "runEdit":
    case "restoreRunEdit":
      return stepSheetId;
    default: {
      const unhandled: never = op;
      return unhandled;
    }
  }
}

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
  marksMoved: unique([
    ...MARK_QUERIES,
    ...RUN_QUERIES,
    ...BID_QUANTITY_QUERIES,
  ]),
  markStatus: unique([
    ...MARK_QUERIES,
    ...RUN_QUERIES,
    ...BID_QUANTITY_QUERIES,
  ]),
  markDrop: unique([...MARK_QUERIES, ...RUN_QUERIES, ...BID_QUANTITY_QUERIES]),
  // The summary lists every count with its swatch, so it follows too.
  pinLook: unique([...MARK_QUERIES, "takeoffSummary.forBid"]),
  sheet: unique(SHEET_QUERIES),
  planRemoved: unique([
    "bidPdfs.list",
    ...SHEET_QUERIES,
    ...MARK_QUERIES,
    ...RUN_QUERIES,
  ]),
  heights: unique(["takeoffHeights.forBid", ...RUN_QUERIES]),
  groupDrop: unique([...MARK_QUERIES, ...RUN_QUERIES]),
  undo: unique([...MARK_QUERIES, ...RUN_QUERIES]),
  sheetCleared: unique([...MARK_QUERIES, ...RUN_QUERIES]),
  runEnds: unique(RUN_QUERIES),
  sentToBid: unique([...MARK_QUERIES, ...BID_QUANTITY_QUERIES]),
  countSource: unique([...MARK_QUERIES, ...BID_QUANTITY_QUERIES]),
  countRenamed: unique([...MARK_QUERIES, ...BID_QUANTITY_QUERIES]),
  homerun: unique(BID_QUANTITY_QUERIES),
};
