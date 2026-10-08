import { describe, expect, it } from "vitest";
import {
  EMPTY_PLAN_CANVAS,
  drawingNextSheet,
  marksMayShow,
  planCanvasStep,
  planLoadState,
} from "./planLoadState";

describe("what the viewer shows while a plan opens", () => {
  it("says it is opening while the file loads", () => {
    expect(
      planLoadState({ documentLoading: true, drawnPage: null, page: 1 }).show
    ).toBe("opening");
  });

  it("does NOT show the sheet when the file has loaded but nothing is drawn", () => {
    // The white square: the old viewer showed the empty canvas here.
    expect(
      planLoadState({ documentLoading: false, drawnPage: null, page: 1 })
    ).toEqual({ show: "drawing", message: "Drawing sheet 1…" });
  });

  it("shows the sheet once it is drawn", () => {
    expect(
      planLoadState({ documentLoading: false, drawnPage: 3, page: 3 }).show
    ).toBe("sheet");
  });
});

describe("a plan that loads AGAIN (link renewed) does not show a blank canvas", () => {
  const drawn = planCanvasStep(EMPTY_PLAN_CANVAS, {
    type: "drawn",
    page: 1,
    width: 4000,
    height: 2600,
  });
  const reloading = planCanvasStep(drawn, { type: "loadStarted" });

  it("forgets the old raster the moment a load starts", () => {
    expect(reloading).toEqual(EMPTY_PLAN_CANVAS);
  });

  it("says opening, then drawing — never 'sheet' — although sheet 1 was drawn before", () => {
    // The white box: the stale size said "sheet" over a new, blank canvas.
    expect(
      planLoadState({
        documentLoading: true,
        drawnPage: reloading.drawnPage,
        page: 1,
      }).show
    ).toBe("opening");
    expect(
      planLoadState({
        documentLoading: false,
        drawnPage: reloading.drawnPage,
        page: 1,
      }).show
    ).toBe("drawing");
  });

  it("keeps the pins off the blank canvas until the sheet is drawn again", () => {
    expect(marksMayShow({ drawnPage: reloading.drawnPage, page: 1 })).toBe(
      false
    );
    const redrawn = planCanvasStep(reloading, {
      type: "drawn",
      page: 1,
      width: 4000,
      height: 2600,
    });
    expect(marksMayShow({ drawnPage: redrawn.drawnPage, page: 1 })).toBe(true);
  });

  it("does not re-render for a raster identical to the one it holds", () => {
    expect(
      planCanvasStep(drawn, {
        type: "drawn",
        page: 1,
        width: 4000,
        height: 2600,
      })
    ).toBe(drawn);
  });
});

describe("marks wait for their own sheet", () => {
  it("are not drawn before any sheet is on the canvas", () => {
    expect(marksMayShow({ drawnPage: null, page: 1 })).toBe(false);
  });

  it("are not drawn over the PREVIOUS sheet while the next one draws", () => {
    // The fault: sheet 2's pins over sheet 1's raster for ~0.7 s.
    expect(marksMayShow({ drawnPage: 1, page: 2 })).toBe(false);
    expect(drawingNextSheet({ drawnPage: 1, page: 2 })).toBe(true);
  });

  it("are drawn once the canvas holds this sheet", () => {
    expect(marksMayShow({ drawnPage: 2, page: 2 })).toBe(true);
    expect(drawingNextSheet({ drawnPage: 2, page: 2 })).toBe(false);
  });

  it("the first sheet uses the full panel, not the bar", () => {
    expect(drawingNextSheet({ drawnPage: null, page: 1 })).toBe(false);
  });
});
