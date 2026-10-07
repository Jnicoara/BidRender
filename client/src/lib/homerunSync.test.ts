import { describe, expect, it } from "vitest";
import {
  confirmableHomeruns,
  homerunKey,
  homerunKeyForCircuit,
  homerunSyncPayload,
  leavingDeviceId,
  syncSignature,
} from "./homerunSync";
import type { CircuitGroup, CircuitReport } from "./circuitGroups";

const device = (id: number) => ({ id, x: id, y: 0, name: "Duplex" });

function group(over: Partial<CircuitGroup>): CircuitGroup {
  return {
    key: "2B-1",
    panel: "2B",
    circuits: [1],
    devices: [device(1), device(2)],
    tags: [],
    schedule: { kind: "noSchedule" },
    offSchedule: false,
    closest: null,
    ...over,
  };
}

const report = (circuits: CircuitGroup[]): CircuitReport => ({
  circuits,
  untagged: [],
  notCircuited: [],
  unmatchedTags: [],
  panels: [],
});

describe("the leaving device", () => {
  it("is the closest when the panel is placed", () => {
    expect(
      leavingDeviceId(group({ closest: { device: device(2), distance: 5 } }))
    ).toBe(2);
  });

  it("is the first device when it is not — Average still has a sheet", () => {
    expect(leavingDeviceId(group({}))).toBe(1);
  });
});

describe("the payload", () => {
  it("one entry per circuit, a two-pole tag kept whole", () => {
    expect(
      homerunSyncPayload(
        report([group({ key: "2B-36,38", circuits: [36, 38] })])
      )
    ).toEqual([{ panel: "2B", circuits: [36, 38], leavingStampId: 1 }]);
  });

  it("a circuit with no device sends nothing", () => {
    expect(homerunSyncPayload(report([group({ devices: [] })]))).toEqual([]);
  });

  it("the signature ignores order and case, and sees a new device", () => {
    const a = [
      { panel: "2B", circuits: [1], leavingStampId: 1 },
      { panel: "2b", circuits: [3], leavingStampId: 4 },
    ];
    const b = [a[1], { ...a[0], panel: "2b" }];
    expect(syncSignature(7, a)).toBe(syncSignature(7, b));
    expect(syncSignature(7, a)).not.toBe(
      syncSignature(7, [{ ...a[0], leavingStampId: 2 }, a[1]])
    );
    expect(syncSignature(7, a)).not.toBe(syncSignature(8, a));
  });
});

describe("Confirm all on this sheet takes only what guessed nothing", () => {
  const row = (
    circuitId: number,
    method: string,
    panelName = "2B",
    over: { sheetId?: number; state?: string; confirmed?: boolean } = {}
  ) => ({
    circuitId,
    panelName,
    sheetId: over.sheetId ?? 7,
    method: { method },
    footage: {
      state: over.state ?? "computed",
      confirmed: over.confirmed ?? false,
    },
  });

  it("Average, and Measured to a LABELLED panel — not a tapped one", () => {
    expect(
      confirmableHomeruns(
        [
          row(1, "average"),
          row(2, "measured", "2B"),
          row(3, "measured", "2HA"),
          row(4, "measuredMin", "2B"),
        ],
        7,
        ["2b"]
      )
    ).toEqual([1, 2]);
  });

  it("not another sheet's, not a refused one, not one already confirmed", () => {
    expect(
      confirmableHomeruns(
        [
          row(1, "average", "2B", { sheetId: 8 }),
          row(2, "average", "2B", { state: "refused" }),
          row(3, "average", "2B", { confirmed: true }),
        ],
        7,
        []
      )
    ).toEqual([]);
  });
});

describe("matching server rows to circuits", () => {
  it("a two-pole circuit matches the row on its first number", () => {
    expect(homerunKeyForCircuit({ panel: "2b", circuits: [38, 36] })).toBe(
      homerunKey("2B", 36)
    );
  });
});
