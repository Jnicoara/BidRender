/**
 * THE PLANS SCREEN USES THE STATUS VIEW'S RULES (status-and-scope-plan § 1,
 * § 2a). vitest cannot reach a React component, so — like
 * notUndoableWired.test.ts — this reads the source. Each check names the one
 * line that would let the screen drift from a tested rule.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NOT_UNDOABLE } from "./undoStack";
import { QUERIES_MOVED_BY, sheetsAnUndoMoves } from "./takeoffRefresh";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");
const page = read("../pages/TakeoffPage.tsx");
const layer = read("../components/takeoff/TraceLayer.tsx");

describe("the status view on the Plans screen", () => {
  it("a status change is an undo step, not a change undo skips", () => {
    expect(Object.keys(NOT_UNDOABLE)).not.toContain("markStatus");
    const block = page.slice(
      page.indexOf("const setMarkStatus = trpc.takeoffStamps.setStatus"),
      page.indexOf("const setWorkTag = ")
    );
    expect(block).toMatch(/undo: \{ kind: "markStatus", sets: r\.previous \}/);
    // And the toast carries Undo, like every delete here.
    expect(block).toContain("deletedToast(");
    // The undo sends restoreStatus and keeps what it overwrote for redo.
    expect(page).toMatch(
      /case "markStatus": \{[^}]*undoMarkStatus\.mutateAsync\(\{ bidId, sets: op\.sets \}\)/
    );
    expect(sheetsAnUndoMoves({ kind: "markStatus", sets: [] }, 7)).toBe(7);
  });

  it("the bar reads the count list every mark change refreshes", () => {
    expect(page).toMatch(
      /sumSplits\(\(bidCounts\.data\?\.groups \?\? \[\]\)\.map\(g => g\.split\)\)/
    );
    expect(page).toContain("bySheet: bidCounts.data?.statusBySheet ?? []");
    for (const change of ["markStatus", "undo", "marksPlaced"] as const)
      expect(QUERIES_MOVED_BY[change]).toContain("takeoffGroups.list");
  });

  it("dims marks by the pick, through the tested opacity", () => {
    expect(page).toContain("statusFocus={statusFocus}");
    expect(layer).toContain(
      "opacity={markFocusOpacity(status.status, statusFocus)}"
    );
  });

  it("a demo sheet's default goes through placingOnSheet, and a person's pick through choosePlacing", () => {
    expect(page).toMatch(/placingOnSheet\(activeWorkTag, \{/);
    expect(page).toContain("}, [activeSheet?.id, activeWorkTag]);");
    expect(page).toContain("placingChoices(activeWorkTag, placingStatus)");
    // The toolbar's own buttons must not bypass choosePlacing, or a sheet's
    // default would keep owning a choice the person made.
    expect(page).not.toContain("onClick={() => setPlacingStatus(");
  });

  it("the demo offer changes marks through setStatus — an undo step — and only this sheet's new ones", () => {
    expect(page).toMatch(
      /onMakeRemove=\{\(\) =>\s*setMarkStatus\.mutate\(\{\s*bidId,\s*ids: newMarkIdsHere,\s*status: "remove",/
    );
    expect(page).toMatch(
      /\.filter\(s => markStatusOf\(s\.status\) === "new"\)/
    );
  });

  it("the sheet tag is noted as not undoable, and lives in the sheet's menu", () => {
    expect(page).toContain('notUndoable("sheetWorkTag")');
    expect(page).toContain("More options — this sheet shows");
  });
});

const bidsPage = read("../pages/BidsPage.tsx");
const strip = read("../components/takeoff/StatusStrip.tsx");

describe("the status bar's fix-its (plan § 1c)", () => {
  it("'Check them' answers through Mark as…'s own call — an undo step — and only when the bid is not locked", () => {
    const answer = page.slice(
      page.indexOf("onAnswerCheck={status => {"),
      page.indexOf("onSkipCheck={")
    );
    expect(answer).toContain("if (!checkingMark || quantitiesLocked) return;");
    expect(answer).toMatch(
      /setMarkStatus\.mutate\(\{\s*bidId,\s*ids: \[checkingMark\.id\],\s*status,/
    );
    // The walk's order is the tested one.
    expect(page).toContain("nextMarkToCheck(toCheck,");
    // A locked bid gets no answer buttons in the card.
    expect(strip).toMatch(/\{locked \? \(\s*<span[^>]*>\s*— the bid is locked/);
  });

  it("a mark put back by Undo stops counting as answered once a fresh list says so", () => {
    // Seen on screen 2026-10-10: without it the closing toast said 1 mark
    // stayed unconfirmed while 2 did.
    const prune = page.slice(
      page.indexOf("A FRESH list that still holds"),
      page.indexOf("}, [unconfirmedList.dataUpdatedAt]);")
    );
    expect(prune).toContain("setCheckAnswered(prev =>");
    expect(prune).toContain("filter(id => !present.has(id))");
  });

  it("the walk's list is refreshed by every mark change, not by its own buttons", () => {
    for (const change of [
      "markStatus",
      "marksPlaced",
      "markRemoved",
      "marksMoved",
      "undo",
    ] as const)
      expect(QUERIES_MOVED_BY[change]).toContain(
        "takeoffStamps.unconfirmedForBid"
      );
    expect(page).toContain(
      'case "takeoffStamps.unconfirmedForBid":\n          void utils.takeoffStamps.unconfirmedForBid.invalidate({ bidId });'
    );
  });

  it("the twin warning's button is the bid screen's own fold, through one hook", () => {
    expect(page).toContain(
      "twins: twinCountWarnings(bidCounts.data?.groups ?? [])"
    );
    expect(page).toMatch(/const foldTwin = useFoldTwin\(\s*bidId,/);
    expect(page).toContain('() => notUndoable("twinFold")');
    expect(page).toContain("onFoldTwin={id => foldTwin.mutate({ id })}");
    expect(bidsPage).toContain("const foldTwin = useFoldTwin(bidId, refresh);");
    // Neither screen keeps a copy of the fold or its Undo.
    for (const src of [page, bidsPage]) {
      expect(src).not.toContain("takeoffGroups.foldExistingTwin.useMutation");
      expect(src).not.toContain("unfoldMove");
    }
    expect(Object.keys(NOT_UNDOABLE)).toContain("twinFold");
  });
});
