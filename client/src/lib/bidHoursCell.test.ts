import { describe, expect, it } from "vitest";
import { bidHoursCell } from "./bidHoursCell";

/** A line priced by hand (no assembly, no run type), a free count. */
const freeCount = {
  breakdown: { totalLaborHours: 0 },
  qty: "14",
  assemblyId: null,
  takeoffRunTypeId: null,
  runMaterialRole: null,
  snapshotMaterialCost: "12.50",
  snapshotLaborHours: null,
};

describe("bidHoursCell — unset hours never read 0 h", () => {
  it("a free count with no hours typed says hours not set, not 0 h", () => {
    expect(bidHoursCell(freeCount)).toBe("handHoursNotSet");
  });

  it("a free count with a TYPED 0 shows its hours — 0 is an answer", () => {
    expect(bidHoursCell({ ...freeCount, snapshotLaborHours: "0" })).toBe(
      "hours"
    );
  });

  it("a remove line with no hours is the same case (no assembly)", () => {
    expect(bidHoursCell({ ...freeCount, snapshotMaterialCost: "0" })).toBe(
      "handHoursNotSet"
    );
  });

  it("keeps the other kinds apart", () => {
    expect(bidHoursCell({ ...freeCount, breakdown: null })).toBe("cannotPrice");
    expect(bidHoursCell({ ...freeCount, assemblyId: 7 })).toBe(
      "assemblyHoursNotSet"
    );
    expect(
      bidHoursCell({ ...freeCount, takeoffRunTypeId: 3, runMaterialRole: null })
    ).toBe("runLaborUnset");
    expect(
      bidHoursCell({
        ...freeCount,
        takeoffRunTypeId: 3,
        runMaterialRole: "coupling",
        snapshotLaborHours: "0",
      })
    ).toBe("inRunRate");
  });
});
