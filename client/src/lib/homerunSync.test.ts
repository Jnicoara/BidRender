import { describe, expect, it } from "vitest";
import {
  confirmableHomeruns,
  homerunKey,
  homerunKeyForCircuit,
  homerunSyncPayload,
  homerunSyncStep,
  type HomerunSyncState,
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

describe("a hand-placed panel re-matches ITS sheet, never the next one", () => {
  /*
    The fault (baseline-screen-plan.md § 9, F10, 2026-10-10). Placing a
    panel by hand armed "re-match on the next sync". But a sync only goes
    out when the signature changes, and the signature does not carry the
    panel's spot — so a placement that left every circuit's leaving device
    the same sent nothing, the arm stayed set, and the next sync of ANY
    sheet went out as a re-match. Opening another sheet then re-pointed
    that sheet's unconfirmed homeruns, and its homerun feet moved, with
    nobody pressing anything.
  */
  const SHEET_A = 11;
  const SHEET_B = 12;
  const sigA = syncSignature(
    SHEET_A,
    homerunSyncPayload(report([group({ devices: [device(1)] })]))
  );
  const sigB = syncSignature(
    SHEET_B,
    homerunSyncPayload(
      report([group({ key: "2B-3", circuits: [3], devices: [device(7)] })])
    )
  );

  it("opening another sheet after a no-change placement is NOT a re-match", () => {
    // Sheet A is synced; the person places its panel by hand, and the
    // closest device happens to stay the same, so A's signature is equal.
    let state: HomerunSyncState = { lastSignature: sigA, armedSheetId: null };
    state = { ...state, armedSheetId: SHEET_A };
    const onA = homerunSyncStep(state, SHEET_A, sigA);
    if (onA.send) state = onA.next;

    // Then they open sheet B: a visit, nothing pressed.
    const onB = homerunSyncStep(state, SHEET_B, sigB);
    expect(onB.send).toBe(true);
    expect(onB.rematch).toBe(false);
  });

  it("the placement re-matches its own sheet even when nothing else changed", () => {
    const state: HomerunSyncState = {
      lastSignature: sigA,
      armedSheetId: SHEET_A,
    };
    const onA = homerunSyncStep(state, SHEET_A, sigA);
    expect(onA).toMatchObject({ send: true, rematch: true });
    expect(onA.next.armedSheetId).toBeNull();
  });

  it("an equal report with nothing armed sends nothing, as before", () => {
    const state: HomerunSyncState = { lastSignature: sigA, armedSheetId: null };
    expect(homerunSyncStep(state, SHEET_A, sigA).send).toBe(false);
  });

  it("a visit to a new sheet with nothing armed creates, never re-matches", () => {
    const state: HomerunSyncState = { lastSignature: sigA, armedSheetId: null };
    expect(homerunSyncStep(state, SHEET_B, sigB)).toMatchObject({
      send: true,
      rematch: false,
    });
  });
});
