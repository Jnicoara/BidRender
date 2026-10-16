/**
 * A form number box hands its parent a number only when the TEXT is one
 * (DraftNumberInput). Before 2026-10-15 the component quantity boxes rendered
 * String(qty), so "2." snapped to "2" and typing 2.25 stored 225.
 */
import { describe, expect, it } from "vitest";
import {
  commitPercentEdit,
  draftNumber,
  parseTypedPercent,
} from "./inlineEdit";
import { otherPercentCaption } from "./percentKind";

/** Every prefix a person passes through while typing `text`, key by key. */
const keyByKey = (text: string) =>
  Array.from(text, (_, i) => draftNumber(text.slice(0, i + 1)));

describe("draftNumber — what a half-typed box means", () => {
  it("typing 2.25 never passes through a number other than 2, 2.2, 2.25", () => {
    // "2." is 2 — the same number — so the box keeps the dot and nothing
    // moves; the old box re-rendered it as "2" and the next key made 22.
    expect(keyByKey("2.25")).toEqual([2, 2, 2.2, 2.25]);
    expect(keyByKey("0.5")).toEqual([0, 0, 0.5]);
    expect(keyByKey(".5")).toEqual([null, 0.5]);
  });

  it("blank is not zero", () => {
    expect(draftNumber("")).toBe(null);
    expect(draftNumber("   ")).toBe(null);
  });

  it("refuses what is not a number the person meant", () => {
    expect(draftNumber("0x10")).toBe(null);
    expect(draftNumber("1,5")).toBe(null);
    expect(draftNumber("abc")).toBe(null);
    expect(draftNumber("-1")).toBe(null);
  });

  it("reads grouped thousands and a dollar sign as typed", () => {
    expect(draftNumber("1,500")).toBe(1500);
    expect(draftNumber("$2.50")).toBe(2.5);
  });

  it("honours the box's own rule", () => {
    const positive = (n: number) => n > 0;
    expect(draftNumber("0", positive)).toBe(null);
    expect(draftNumber("3", positive)).toBe(3);
  });
});

describe("parseTypedPercent — a percent box", () => {
  it("takes a trailing % and nothing else extra", () => {
    expect(parseTypedPercent("15%")).toBe(15);
    expect(parseTypedPercent(" 12.5% ")).toBe(12.5);
    expect(parseTypedPercent("0x10")).toBeNaN();
    expect(parseTypedPercent("15%%")).toBeNaN();
  });
});

describe("commitPercentEdit — a percent box over a stored fraction", () => {
  it("reads '15%' as 15 and stores 0.15", () => {
    expect(commitPercentEdit("15%", 0.1)).toEqual({
      action: "save",
      value: 0.15,
    });
  });

  it("never turns blank or a typo into 0% (it used to, company-wide)", () => {
    expect(commitPercentEdit("", 0.15).action).toBe("revert");
    expect(commitPercentEdit("1,5", 0.15).action).toBe("revert");
    expect(commitPercentEdit("abc", 0.15).action).toBe("revert");
  });

  it("sends nothing when the number did not move", () => {
    expect(commitPercentEdit("15", 0.15)).toEqual({ action: "none" });
    expect(commitPercentEdit("12.5%", 0.125)).toEqual({ action: "none" });
  });

  it("takes a negative where the box allows it (productivity)", () => {
    expect(commitPercentEdit("-5", 0)).toEqual({
      action: "save",
      value: -0.05,
    });
  });
});

describe("otherPercentCaption reads the box the way the save does", () => {
  it("captions '20%' and not '0x10'", () => {
    expect(otherPercentCaption("markup", "20%")).toBe("= 16.7% margin");
    expect(otherPercentCaption("markup", "0x10")).toBe(null);
  });
});
