import { describe, expect, it } from "vitest";
import { MARK_STATUSES } from "../drizzle/schema";
import { markCountsAsQuantity, markIsSnapTarget } from "../shared/markStatus";

describe("what a mark's status lets it do", () => {
  it("counts a NEW mark, and a mark with no status (placed before the column), as a quantity", () => {
    expect(markCountsAsQuantity(null)).toBe(true);
    expect(markCountsAsQuantity("new")).toBe(true);
  });

  it("never prices an existing device as new — nor anything else that is not a new part", () => {
    for (const status of [
      "existing",
      "remove",
      "relocate",
      "unconfirmed",
    ] as const) {
      expect(markCountsAsQuantity(status), status).toBe(false);
    }
  });

  it("never lets a run snap to an unconfirmed mark", () => {
    expect(markIsSnapTarget("unconfirmed")).toBe(false);
  });

  it("lets a run snap to every CONFIRMED mark, whatever it is", () => {
    // An existing device to remain is still a device on the wall a run can
    // meet; only an unchecked position is unsafe to copy.
    for (const status of [
      null,
      "new",
      "existing",
      "remove",
      "relocate",
    ] as const) {
      expect(markIsSnapTarget(status), String(status)).toBe(true);
    }
  });

  it("has an answer for every status the database can hold", () => {
    // A status added to the schema must be decided here, not fall through.
    for (const status of MARK_STATUSES) {
      expect(typeof markCountsAsQuantity(status)).toBe("boolean");
      expect(typeof markIsSnapTarget(status)).toBe("boolean");
    }
    expect(MARK_STATUSES).toContain("unconfirmed");
  });
});
