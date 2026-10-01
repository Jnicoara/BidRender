import { describe, expect, it } from "vitest";
import { planLoadState } from "./planLoadState";

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
