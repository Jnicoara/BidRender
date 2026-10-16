/**
 * The Unassigned count (references/count-first-plan.md): marks dropped with
 * nothing named yet. It must never reach the bid, never be typed into by
 * accident, and never be shown under its stored label.
 */
import { describe, expect, it } from "vitest";
import {
  countsWaitingToSend,
  laborRolesWaiting,
  sendability,
  type BridgeGroup,
} from "../shared/takeoffBridge";
import {
  UNASSIGNED_COUNT_LABEL,
  countDisplayName,
  isReservedLabel,
  isUnassignedCount,
  unassignedSentence,
} from "../shared/unassignedCount";
import { labelSchema } from "./routers/takeoffGroupsRouter";
import { pinStylesForBid } from "../shared/pinLetters";

const unassigned: BridgeGroup = {
  id: 7,
  label: UNASSIGNED_COUNT_LABEL,
  kind: "plain",
  assemblyId: null,
  materialId: null,
  unitCost: null,
  count: 12,
  roleCounts: { remove: 2, relocate: 1 },
};

describe("the Unassigned count", () => {
  it("never goes to the bid — its marks need a name first", () => {
    expect(sendability(unassigned, [])).toEqual({
      sendable: false,
      reason: "unassigned",
    });
    expect(countsWaitingToSend([unassigned], [])).toBe(0);
    expect(laborRolesWaiting(unassigned, [])).toEqual([]);
  });

  it("a NAMED free count still goes (level 1 is untouched)", () => {
    expect(sendability({ ...unassigned, label: "Exit signs" }, [])).toEqual({
      sendable: true,
    });
  });

  it("the print block says how many, in words", () => {
    expect(unassignedSentence(1)).toBe(
      "1 mark on the plans is unassigned — nothing says what it is."
    );
    expect(unassignedSentence(3)).toMatch(/^3 marks .* they are\.$/);
  });

  it("is shown as Unassigned, never by its stored label", () => {
    expect(countDisplayName(UNASSIGNED_COUNT_LABEL)).toBe("Unassigned");
    expect(countDisplayName("Exit signs")).toBe("Exit signs");
    expect(isUnassignedCount(unassigned)).toBe(true);
    expect(
      isUnassignedCount({ kind: "assembly", label: UNASSIGNED_COUNT_LABEL })
    ).toBe(false);
  });

  it("its pins wear '?' in a circle, and take no letter from anybody", () => {
    const styles = pinStylesForBid([
      { id: 1, label: UNASSIGNED_COUNT_LABEL, unassigned: true },
      { id: 2, label: "Doorbell" },
      { id: 3, label: "Duplex receptacle" },
    ]);
    expect(styles.get(1)).toMatchObject({ letter: "?", shape: "circle" });
    expect(styles.get(2)?.letter).toBe("D");
    expect(styles.get(3)?.letter).not.toBe("?");
  });

  it("cannot be typed: a label starting with __ is refused", () => {
    expect(isReservedLabel(UNASSIGNED_COUNT_LABEL)).toBe(true);
    expect(isReservedLabel("  __mine")).toBe(true);
    expect(isReservedLabel("Exit_signs")).toBe(false);
    expect(labelSchema.safeParse(UNASSIGNED_COUNT_LABEL).success).toBe(false);
    // The word it is SHOWN as, too: two rows reading "Unassigned" would be
    // indistinguishable.
    expect(labelSchema.safeParse(" unassigned ").success).toBe(false);
    expect(labelSchema.safeParse("Unassigned outlets").success).toBe(true);
  });
});
