import { describe, expect, it } from "vitest";
import { countAgainOffer, lastCountKey, parseLastCount } from "./countAgain";

const groups = [
  { id: 4, label: "Linear 8ft", assemblyId: 50 },
  { id: 5, label: "Linear 4ft", assemblyId: 50 },
];

describe("count again", () => {
  it("offers the last count back, under its current name", () => {
    expect(
      countAgainOffer({ groupId: 5, label: "old name" }, groups, false)
    ).toEqual(groups[1]);
  });

  it("offers nothing while a tool is in hand — it never re-arms by itself", () => {
    expect(
      countAgainOffer({ groupId: 5, label: "x" }, groups, true)
    ).toBeNull();
  });

  it("offers nothing once the count has been deleted, or before the list loads", () => {
    expect(
      countAgainOffer({ groupId: 9, label: "x" }, groups, false)
    ).toBeNull();
    expect(
      countAgainOffer({ groupId: 5, label: "x" }, undefined, false)
    ).toBeNull();
    expect(countAgainOffer(null, groups, false)).toBeNull();
  });

  it("is kept per bid, and ignores anything it did not write", () => {
    expect(lastCountKey(12)).not.toBe(lastCountKey(13));
    expect(parseLastCount('{"groupId":4,"label":"Linear 8ft"}')).toEqual({
      groupId: 4,
      label: "Linear 8ft",
    });
    expect(parseLastCount("not json")).toBeNull();
    expect(parseLastCount('{"groupId":"4"}')).toBeNull();
    expect(parseLastCount(null)).toBeNull();
  });
});
