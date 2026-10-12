/**
 * THE STATUS STRIP'S DECISIONS — what the bar above the drawing shows, and
 * when (status-and-scope-plan § 1a / 1b / 2a, owner answers § 8).
 *
 * Here rather than in the component because vitest reaches `client/src/lib`
 * and not a React component (CLAUDE.md, "a rule with no red to go to").
 *
 * The standing rules it keeps:
 *
 * - **The basic path is untouched.** A bid that never set a status, on a
 *   sheet nobody tagged, shows NO strip. The strip appears when there is
 *   something to say.
 * - **Viewing never moves a number.** Picking a status only dims the other
 *   marks (`markFocusOpacity`). The one control here that changes anything —
 *   "Make them Remove" on a demo sheet — is an offer with a button, goes
 *   through `takeoffStamps.setStatus`, and is an Undo step like every status
 *   change.
 * - **A locked bid never moves.** The offer is never made on one.
 */
import {
  statusViewParts,
  statusViewWanted,
  type MarkStatus,
  type StatusSplit,
} from "@shared/markStatus";
import type { SheetWorkTag } from "@shared/sheetWorkTag";
import type { TwinWarning } from "@shared/twinFold";

export type StatusStripInput = {
  /** The whole bid, summed from the count cards' splits. */
  total: StatusSplit;
  /** Per sheet, from the same rows. */
  bySheet: readonly { sheetId: number; split: StatusSplit }[];
  activeSheetId: number | null;
  focus: MarkStatus | null;
  /** The OPEN sheet's tag; null = not said. */
  workTag: SheetWorkTag | null;
  /** Marks on the open sheet that are NEW — what the demo offer would change. */
  newMarksHere: number;
  locked: boolean;
  /** "… - EXISTING TO REMAIN" counts still holding new marks (shared/twinFold). */
  twins: readonly TwinWarning[];
};

export type StatusStripModel = {
  visible: boolean;
  /** The status chips, or null when the bid has nothing but new marks. */
  parts: ReturnType<typeof statusViewParts> | null;
  /** With a status picked: how many of it are on the open sheet. */
  here: number | null;
  /** …and on which OTHER sheets, most first, so "12 removed" can be found. */
  elsewhere: { sheetId: number; count: number }[];
  /** The open sheet's tag banner, or null. */
  banner: SheetWorkTag | null;
  /** "N placed as new here — make them Remove?", or null. */
  offerRemove: number | null;
  /**
   * The twin counts to warn about, each with its fix. `fixable` is false on a
   * locked bid: the warning still shows (the estimator should know), the
   * button does not, and the words say unlocking is the way through.
   */
  twins: (TwinWarning & { fixable: boolean })[];
  /** "Check them" is offered: there are unconfirmed marks to step through. */
  offerCheck: number | null;
};

export function statusStripModel(input: StatusStripInput): StatusStripModel {
  const wanted = statusViewWanted(input.total) || input.focus !== null;
  const parts = wanted ? statusViewParts(input.total) : null;

  let here: number | null = null;
  const elsewhere: { sheetId: number; count: number }[] = [];
  if (input.focus !== null) {
    const focus = input.focus;
    here = 0;
    for (const { sheetId, split } of input.bySheet) {
      const count = split[focus];
      if (count === 0) continue;
      if (sheetId === input.activeSheetId) here = count;
      else elsewhere.push({ sheetId, count });
    }
    elsewhere.sort((a, b) => b.count - a.count || a.sheetId - b.sheetId);
  }

  const offerRemove =
    input.workTag === "demo" && !input.locked && input.newMarksHere > 0
      ? input.newMarksHere
      : null;

  const twins = input.twins.map(t => ({ ...t, fixable: !input.locked }));
  // Offered on a locked bid too: stepping through is looking, and the walk
  // itself refuses the answers there (StatusStrip).
  const offerCheck =
    input.total.unconfirmed > 0 ? input.total.unconfirmed : null;

  return {
    visible: parts !== null || input.workTag !== null || twins.length > 0,
    twins,
    offerCheck,
    parts,
    here,
    elsewhere,
    banner: input.workTag,
    offerRemove,
  };
}
