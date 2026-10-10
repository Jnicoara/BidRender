/**
 * A sheet's WORK TAG — demo / new work / both (status-and-scope-plan § 2a,
 * owner answers § 8 Q4 and Q5, 2026-10-10).
 *
 * What a tag changes, and ALL it changes: what "Placing as" starts at when the
 * sheet is opened. Demo starts at Remove; New work at New; Both asks (the
 * banner shows the choice). It never re-statuses a mark already placed — that
 * is a separate offer with its own button and Undo — and NULL (not said)
 * behaves exactly as the screen did before the column existed.
 *
 * Demo and new on ONE sheet first (Q5): there is no pairing of a demo sheet
 * with a new-work sheet here; the status bar's "removed" view is what shows
 * the demo marks over the new ones on a shared sheet.
 */
import type { SHEET_WORK_TAGS } from "../drizzle/schema";
import type { UserMarkStatus } from "./markStatus";

export type SheetWorkTag = (typeof SHEET_WORK_TAGS)[number];

export const SHEET_WORK_TAG_LABEL: Record<SheetWorkTag, string> = {
  demo: "Demo",
  new: "New work",
  both: "Demo and new",
};

/** "Placing as", and whether the SHEET chose it (so leaving the sheet undoes it). */
export type Placing = { status: UserMarkStatus; fromSheet: boolean };

/**
 * What "Placing as" becomes when a sheet is OPENED. Called on a sheet change
 * only, never on a re-render, so a choice made on the sheet stands.
 *
 * A Remove that a demo sheet chose does not follow the estimator out of it:
 * on an untagged sheet it goes back to New. A little high beats low (owner,
 * 2026-10-09) — a device placed as new by mistake is visible and priced; one
 * placed as a removal by a default nobody noticed drops out of the bid.
 */
export function placingOnSheet(
  tag: SheetWorkTag | null,
  current: Placing
): Placing {
  switch (tag) {
    case "demo":
      return { status: "remove", fromSheet: true };
    case "new":
      return { status: "new", fromSheet: false };
    case "both":
    case null:
      return current.fromSheet ? { status: "new", fromSheet: false } : current;
    default: {
      const unhandled: never = tag;
      return unhandled;
    }
  }
}

/**
 * Which "Placing as" buttons show. New and Existing always (the basic path);
 * Remove only where it is the point — a demo or demo-and-new sheet — or while
 * it is the choice, so the active one is never hidden.
 */
export function placingChoices(
  tag: SheetWorkTag | null,
  current: UserMarkStatus
): UserMarkStatus[] {
  return tag === "demo" || tag === "both" || current === "remove"
    ? ["new", "existing", "remove"]
    : ["new", "existing"];
}

/**
 * A SUGGESTION from the sheet's title, never applied by itself: the sheet's
 * menu shows it beside the tag it would pick, and the estimator clicks it or
 * not (plan § 2a, "Nothing is tagged until confirmed"). Uses the words
 * shared/sheetTitleBlock.ts already reads as a drawing title.
 */
export function suggestedWorkTag(
  title: string | null | undefined
): SheetWorkTag | null {
  if (!title) return null;
  const demo = /\b(DEMOLITION|DEMO)\b/i.test(title);
  if (!demo) return null;
  return /\b(NEW|PROPOSED|RENOVATION|REMODEL)\b/i.test(title) ? "both" : "demo";
}
