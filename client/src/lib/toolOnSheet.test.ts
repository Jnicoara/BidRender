import { describe, expect, it } from "vitest";
import {
  heldElsewhere,
  heldOnSheet,
  markForClick,
  sheetKeyOf,
} from "./toolOnSheet";

const legend = sheetKeyOf(7, 1);
const drawing = sheetKeyOf(7, 2);
const otherPlanSamePage = sheetKeyOf(8, 2);

const count = { groupId: 3, label: "Duplex", sheetKey: drawing };

describe("a tool belongs to the sheet it was picked up on", () => {
  it("counts on the sheet the tool was picked up on", () => {
    expect(markForClick(count, drawing, 42, { x: 10, y: 20 })).toEqual({
      group: count,
      sheetId: 42,
      x: 10,
      y: 20,
    });
  });

  it("switch sheets while armed, click: no mark", () => {
    // The reported fault: armed on a drawing, over to the legend, click.
    expect(markForClick(count, legend, 41, { x: 10, y: 20 })).toBeNull();
  });

  it("the same page number on another plan set is another sheet", () => {
    expect(sheetKeyOf(7, 2)).not.toBe(otherPlanSamePage);
    expect(
      markForClick(count, otherPlanSamePage, 99, { x: 1, y: 1 })
    ).toBeNull();
  });

  it("reads as put down elsewhere, and asks to be cleared", () => {
    expect(heldOnSheet(count, legend)).toBeNull();
    expect(heldElsewhere(count, legend)).toBe(true);
    expect(heldElsewhere(count, drawing)).toBe(false);
    expect(heldElsewhere(null, drawing)).toBe(false);
  });

  it("nothing held, nothing placed", () => {
    expect(markForClick(null, drawing, 42, { x: 0, y: 0 })).toBeNull();
  });

  it("no sheet row yet, nothing placed", () => {
    expect(markForClick(count, drawing, null, { x: 0, y: 0 })).toBeNull();
  });

  it("a plan with no id yet still keys by page", () => {
    expect(sheetKeyOf(null, 1)).toBe("none:1");
    expect(sheetKeyOf(null, 1)).not.toBe(sheetKeyOf(null, 2));
  });
});
