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
};

describe("nextTip", () => {
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

  it("goes under a control at the top of the screen", () => {
    const anchor = { left: 300, top: 40, width: 200, height: 28 };
    expect(placeTip(anchor, card, win, drawing)).toEqual({
      left: 260,
      top: 76,
    });
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

  it("falls back to a corner that keeps the middle clear", () => {
    // A control covering the whole window: no side fits, the bottom-left
    // corner does and is clear of the middle.
    const anchor = { left: 0, top: 0, width: 1200, height: 800 };
    expect(placeTip(anchor, card, win, drawing)).toEqual({
      left: 8,
      top: 800 - 120 - 8,
    });
  });
});
