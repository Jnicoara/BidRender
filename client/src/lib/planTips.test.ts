import { describe, expect, it } from "vitest";
import {
  NO_TIPS_SEEN,
  PLAN_TIP_IDS,
  markTipSeen,
  nextTip,
  parseTipsSeen,
  placeTip,
  showTipsAgain,
  tipText,
  turnTipsOff,
  type TipSheetState,
} from "./planTips";

/*
  Tips the first time the Plans screen opens (plan-reading-help-plan.md § 5).
  The sequence, the skips and the placement are the rules; the component only
  shows what these return.
*/
const everything: TipSheetState = {
  hasNotesSheet: true,
  sheetKindShown: true,
  tappable: true,
  // A mouse: the finger tip is a touch screen's alone (its own test below).
  touch: false,
};

describe("nextTip", () => {
  it("on a touch screen, tells the finger's gestures first; never with a mouse", () => {
    expect(nextTip(NO_TIPS_SEEN, { ...everything, touch: true })).toBe(
      "touchGestures"
    );
    const seen = markTipSeen(NO_TIPS_SEEN, "touchGestures");
    expect(nextTip(seen, { ...everything, touch: true })).toBe("notesSheet");
    expect(nextTip(NO_TIPS_SEEN, everything)).toBe("notesSheet");
    expect(tipText("touchGestures", null).body).toMatch(
      /Tap to drop a point.*drag to move the sheet.*pinch to zoom/
    );
  });

  it("goes through the four in order, one at a time", () => {
    let seen = NO_TIPS_SEEN;
    const shown: string[] = [];
    for (let tip = nextTip(seen, everything); tip; ) {
      shown.push(tip);
      seen = markTipSeen(seen, tip);
      tip = nextTip(seen, everything);
    }
    expect(shown).toEqual(["notesSheet", "sheetKind", "drawingTaps", "lookUp"]);
  });

  it("skips the notes tip when the set has no notes sheet", () => {
    expect(nextTip(NO_TIPS_SEEN, { ...everything, hasNotesSheet: false })).toBe(
      "sheetKind"
    );
  });

  it("skips the line tip where the line is not on screen", () => {
    const seen = markTipSeen(NO_TIPS_SEEN, "notesSheet");
    expect(nextTip(seen, { ...everything, sheetKindShown: false })).toBe(
      "drawingTaps"
    );
  });

  it("skips the tap tip on a sheet with nothing tappable", () => {
    const seen = ["notesSheet", "sheetKind"].reduce(
      (s, id) => markTipSeen(s, id as never),
      NO_TIPS_SEEN
    );
    expect(nextTip(seen, { ...everything, tappable: false })).toBe("lookUp");
  });

  it("a skipped tip is not seen: it still comes on a sheet that has it", () => {
    const bare: TipSheetState = {
      hasNotesSheet: false,
      sheetKindShown: false,
      tappable: false,
      touch: false,
    };
    const seen = markTipSeen(NO_TIPS_SEEN, nextTip(NO_TIPS_SEEN, bare)!);
    expect(seen.seen).toEqual(["lookUp"]);
    expect(nextTip(seen, bare)).toBeNull();
    expect(nextTip(seen, everything)).toBe("notesSheet");
  });

  it("shows nothing at all after No more tips", () => {
    expect(nextTip(turnTipsOff(NO_TIPS_SEEN), everything)).toBeNull();
    const partway = turnTipsOff(markTipSeen(NO_TIPS_SEEN, "notesSheet"));
    expect(nextTip(partway, everything)).toBeNull();
  });

  it("Show tips again starts from the first", () => {
    const done = turnTipsOff(
      PLAN_TIP_IDS.reduce((s, id) => markTipSeen(s, id), NO_TIPS_SEEN)
    );
    expect(nextTip(done, everything)).toBeNull();
    expect(nextTip(showTipsAgain(), everything)).toBe("notesSheet");
  });
});

describe("parseTipsSeen", () => {
  it("round-trips what is stored", () => {
    const seen = turnTipsOff(markTipSeen(NO_TIPS_SEEN, "sheetKind"));
    expect(parseTipsSeen(JSON.stringify(seen))).toEqual(seen);
  });

  it("reads anything unreadable as nothing seen", () => {
    for (const raw of [null, undefined, "", "{", "7", "null", '"x"', "[]"])
      expect(parseTipsSeen(raw)).toEqual(NO_TIPS_SEEN);
  });

  it("drops ids it does not know, and only true turns tips off", () => {
    expect(
      parseTipsSeen(JSON.stringify({ seen: ["lookUp", "later"], off: "yes" }))
    ).toEqual({ seen: ["lookUp"], off: false });
  });
});

describe("tipText", () => {
  it("names the notes sheet when there is one", () => {
    expect(tipText("notesSheet", "E0.01").body).toMatch(/^E0\.01 has/);
    expect(tipText("notesSheet", null).body).toMatch(/^This set has/);
  });
});

describe("placeTip", () => {
  const win = { width: 1200, height: 800 };
  const card = { width: 280, height: 120 };
  const drawing = { left: 0, top: 100, width: 900, height: 700 };

  it("goes under a control at the top of the screen, inside the drawing", () => {
    // Straight under the control would be y 76 — still in the toolbar band
    // above the drawing (top 100). It slides down into the drawing instead.
    const anchor = { left: 300, top: 40, width: 200, height: 28 };
    expect(placeTip(anchor, card, win, drawing)).toEqual({
      left: 260,
      top: 108,
    });
  });

  it("never covers the side panel: a tab in it gets a card over the drawing", () => {
    // The Legend tab case from smoke run 38595716662: the tab sits at the top
    // of a panel to the right of the drawing, and under it are Capture and
    // the legend's rows. The card must not land on any of that.
    const panel = { left: 900, top: 100, width: 300, height: 700 };
    const legendTab = { left: 1060, top: 105, width: 80, height: 30 };
    const at = placeTip(legendTab, card, win, drawing);
    expect(at.left + card.width).toBeLessThanOrEqual(panel.left);
    expect(at.top).toBeGreaterThanOrEqual(drawing.top);
    // And as near the tab as the drawing allows: against the drawing's right
    // edge, at the height "just under the tab" would have had.
    expect(at).toEqual({ left: 900 - 8 - 280, top: 105 + 30 + 8 });
  });

  it("stays inside the drawing for any control around it", () => {
    for (const anchor of [
      { left: 0, top: 0, width: 1200, height: 60 },
      { left: 950, top: 400, width: 200, height: 30 },
      { left: 20, top: 300, width: 150, height: 30 },
      { left: 100, top: 760, width: 100, height: 30 },
    ]) {
      const at = placeTip(anchor, card, win, drawing);
      expect(at.left).toBeGreaterThanOrEqual(drawing.left);
      expect(at.top).toBeGreaterThanOrEqual(drawing.top);
      expect(at.left + card.width).toBeLessThanOrEqual(
        drawing.left + drawing.width
      );
      expect(at.top + card.height).toBeLessThanOrEqual(
        drawing.top + drawing.height
      );
    }
  });

  it("stays inside the window at its edge", () => {
    const anchor = { left: 1150, top: 40, width: 40, height: 28 };
    const at = placeTip(anchor, card, win, drawing);
    expect(at.left + card.width).toBeLessThanOrEqual(win.width);
  });

  it("never covers the middle of the drawing", () => {
    // A control just above the drawing's middle: below it would cover the
    // centre (450, 450), so the card goes above.
    const anchor = { left: 400, top: 300, width: 100, height: 28 };
    const at = placeTip(anchor, card, win, drawing);
    const centre = { x: 450, y: 450 };
    const covers =
      centre.x >= at.left &&
      centre.x <= at.left + card.width &&
      centre.y >= at.top &&
      centre.y <= at.top + card.height;
    expect(covers).toBe(false);
    expect(at.top).toBe(300 - 120 - 8);
  });

  it("falls back to a window corner when the drawing cannot hold the card", () => {
    // A drawing narrower than the card, and a control covering the whole
    // window: no side fits, the bottom-left corner does and is clear of the
    // middle.
    const narrow = { left: 0, top: 100, width: 200, height: 700 };
    const anchor = { left: 0, top: 0, width: 1200, height: 800 };
    expect(placeTip(anchor, card, win, narrow)).toEqual({
      left: 8,
      top: 800 - 120 - 8,
    });
  });
});
