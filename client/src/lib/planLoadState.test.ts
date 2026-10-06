import { describe, expect, it } from "vitest";
import { drawingNextSheet, marksMayShow, planLoadState } from "./planLoadState";

describe("what the viewer shows while a plan opens", () => {
  it("says it is opening while the file loads", () => {
    expect(
      planLoadState({ documentLoading: true, drawn: false, page: 1 }).show
    ).toBe("opening");
  });

  it("does NOT show the sheet when the file has loaded but nothing is drawn", () => {
    // The white square: the old viewer showed the empty canvas here.
    expect(
      planLoadState({ documentLoading: false, drawn: false, page: 1 })
    ).toEqual({ show: "drawing", message: "Drawing sheet 1…" });
  });

  it("shows the sheet once it is drawn", () => {
    expect(
      planLoadState({ documentLoading: false, drawn: true, page: 3 }).show
    ).toBe("sheet");
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
