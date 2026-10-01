import { describe, expect, it } from "vitest";
import {
  EXISTING_TO_REMAIN_SUFFIX,
  existingToRemainName,
  splitExistingToRemain,
  symbolKeyIgnoringExisting,
} from "../shared/existingToRemain";

describe("existing-to-remain count names", () => {
  it("writes one spelling", () => {
    expect(existingToRemainName("DUPLEX RECEPTACLE")).toBe(
      "DUPLEX RECEPTACLE - EXISTING TO REMAIN"
    );
    expect(EXISTING_TO_REMAIN_SUFFIX).toBe(" - EXISTING TO REMAIN");
  });

  it("does not double the suffix on a name that already has it", () => {
    const once = existingToRemainName("Junction Box");
    expect(existingToRemainName(once)).toBe(once);
  });

  it("reads what a person types: case, spacing, en and em dashes", () => {
    for (const typed of [
      "Duplex receptacle - existing to remain",
      "Duplex receptacle-EXISTING TO REMAIN",
      "Duplex receptacle – Existing To Remain",
      "Duplex receptacle—existing  to remain ",
    ])
      expect(splitExistingToRemain(typed)).toEqual({
        base: "Duplex receptacle",
        existing: true,
      });
  });

  it("leaves a new-work name alone, including one that merely mentions existing", () => {
    expect(splitExistingToRemain("DUPLEX RECEPTACLE")).toEqual({
      base: "DUPLEX RECEPTACLE",
      existing: false,
    });
    // The word alone is not the suffix: this is a real legend entry's shape.
    expect(splitExistingToRemain("EXISTING PANEL TO REMAIN").existing).toBe(
      false
    );
  });

  it("keys new and existing of one symbol the same, and different symbols apart", () => {
    expect(
      symbolKeyIgnoringExisting("DUPLEX RECEPTACLE - EXISTING TO REMAIN")
    ).toBe(symbolKeyIgnoringExisting("Duplex  receptacle"));
    expect(symbolKeyIgnoringExisting("GFCI receptacle")).not.toBe(
      symbolKeyIgnoringExisting("DUPLEX RECEPTACLE - EXISTING TO REMAIN")
    );
  });
});
