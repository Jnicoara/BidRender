/**
 * The rule behind every search list's hover highlight
 * (@/lib/pointerHighlight). The fault it guards — a list growing under a
 * still pointer on a tablet, so Enter took the row that slid under it — was
 * reproduced and checked on screen (820x1180: 4 of 4 wrong before, 4 of 4
 * right after; a real hover still moves the highlight). Components are out
 * of this suite's reach, so this pins the decision they all call.
 */
import { describe, expect, it } from "vitest";
import { pointerMovedHighlight } from "./pointerHighlight";

describe("may the pointer move the highlight", () => {
  it("not when the list moved under a pointer standing still", () => {
    expect(pointerMovedHighlight({ movementX: 0, movementY: 0 })).toBe(false);
  });
  it("yes when the pointer itself moved, in any direction", () => {
    expect(pointerMovedHighlight({ movementX: 3, movementY: 0 })).toBe(true);
    expect(pointerMovedHighlight({ movementX: 0, movementY: -2 })).toBe(true);
  });
});
