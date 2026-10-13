import { describe, expect, it } from "vitest";
import {
  sheetKindLineDefault,
  sheetKindLineShown,
  sheetKindLineToStore,
  type SheetKindScreen,
} from "./planHelpPrefs";

/*
  The sheet-kind line's default follows the screen (owner, 2026-10-13): OFF
  where it costs a toolbar row — a phone either way round, an iPad held
  sideways — and ON on a laptop and an upright iPad. A person's own "on" or
  "off" wins everywhere.
*/
const laptop: SheetKindScreen = { layout: "laptop", landscape: true };
const ipadUpright: SheetKindScreen = { layout: "tablet", landscape: false };
const ipadSideways: SheetKindScreen = { layout: "tablet", landscape: true };
const phoneUpright: SheetKindScreen = { layout: "phone", landscape: false };
const phoneSideways: SheetKindScreen = { layout: "phone", landscape: true };

describe("sheetKindLineDefault", () => {
  it("is on where the bar has room", () => {
    expect(sheetKindLineDefault(laptop)).toBe(true);
    expect(sheetKindLineDefault({ layout: "laptop", landscape: false })).toBe(
      true
    );
    expect(sheetKindLineDefault(ipadUpright)).toBe(true);
  });

  it("is off where it would add a toolbar row", () => {
    expect(sheetKindLineDefault(ipadSideways)).toBe(false);
    expect(sheetKindLineDefault(phoneUpright)).toBe(false);
    expect(sheetKindLineDefault(phoneSideways)).toBe(false);
  });
});

describe("sheetKindLineShown", () => {
  it("follows the screen when nothing is stored", () => {
    for (const raw of [null, undefined, "", "something-else"]) {
      expect(sheetKindLineShown(raw, laptop)).toBe(true);
      expect(sheetKindLineShown(raw, ipadUpright)).toBe(true);
      expect(sheetKindLineShown(raw, ipadSideways)).toBe(false);
      expect(sheetKindLineShown(raw, phoneUpright)).toBe(false);
    }
  });

  it("a person's choice wins on every screen", () => {
    for (const s of [laptop, ipadUpright, ipadSideways, phoneUpright]) {
      expect(sheetKindLineShown("on", s)).toBe(true);
      expect(sheetKindLineShown("off", s)).toBe(false);
    }
  });
});

describe("sheetKindLineToStore", () => {
  it("stores only a change from the screen's default", () => {
    expect(sheetKindLineToStore(true, phoneUpright)).toBe("on");
    expect(sheetKindLineToStore(false, phoneUpright)).toBeNull();
    expect(sheetKindLineToStore(false, laptop)).toBe("off");
    expect(sheetKindLineToStore(true, laptop)).toBeNull();
  });

  it("off-then-on on an upright iPad does not switch it on sideways", () => {
    const stored = sheetKindLineToStore(true, ipadUpright);
    expect(sheetKindLineShown(stored, ipadSideways)).toBe(false);
  });
});
