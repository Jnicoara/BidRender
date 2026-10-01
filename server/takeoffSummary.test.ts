/**
 * shared/takeoffSummary.ts — the sorting rule, with no database.
 * The router half is server/sendAll.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  sameSendList,
  takeoffSummary,
  type SummaryRunType,
} from "../shared/takeoffSummary";

const count = (id: number, n: number, reason?: string) => ({
  id,
  label: `Count ${id}`,
  kind: "assembly",
  count: n,
  sendability: reason
    ? ({ sendable: false, reason } as never)
    : ({ sendable: true } as const),
});

const runType = (over: Partial<SummaryRunType> = {}): SummaryRunType => ({
  runTypeId: 7,
  label: "EMT homeruns",
  unmeasurableCount: 0,
  rows: [
    {
      role: "raceway",
      materialName: '1/2" EMT',
      feet: 100,
      onBid: false,
      sendable: { ok: true },
    },
  ],
  fittings: [],
  ...over,
});

describe("sorting the plan set into on the bid and not yet", () => {
  it("puts a sent count on the bid and an unsent one under 'not sent', sendable", () => {
    const s = takeoffSummary({
      locked: false,
      counts: [count(1, 3, "already-on-bid"), count(2, 2)],
      runTypes: [],
      untypedRuns: 0,
    });
    expect(s.onBid.map(i => i.key)).toEqual(["count:1"]);
    expect(s.notOnBid.map(i => [i.key, i.reason])).toEqual([
      ["count:2", "notSent"],
    ]);
    expect(s.sendable).toEqual(["count:2"]);
  });

  it("leaves out a count with nothing marked — nothing is missing", () => {
    const s = takeoffSummary({
      locked: false,
      counts: [count(1, 0, "nothing-counted"), count(2, 0)],
      runTypes: [],
      untypedRuns: 0,
    });
    expect(s.onBid).toEqual([]);
    expect(s.notOnBid).toEqual([]);
  });

  it("names why a count cannot go, and never makes it sendable", () => {
    const s = takeoffSummary({
      locked: false,
      counts: [count(1, 3, "no-price"), count(2, 4, "unsupported-level")],
      runTypes: [],
      untypedRuns: 0,
    });
    expect(s.notOnBid.map(i => i.reason)).toEqual([
      "assemblyGone",
      "unsupported",
    ]);
    expect(s.sendable).toEqual([]);
  });

  it("on a locked bid, lists what would go as locked, and sends nothing", () => {
    const s = takeoffSummary({
      locked: true,
      counts: [count(2, 2)],
      runTypes: [runType()],
      untypedRuns: 0,
    });
    expect(s.notOnBid.map(i => i.reason)).toEqual(["locked", "locked"]);
    expect(s.sendable).toEqual([]);
  });

  it("lists a run row that cannot go with its own message", () => {
    const s = takeoffSummary({
      locked: false,
      counts: [],
      runTypes: [
        runType({
          rows: [
            {
              role: "conductor",
              materialName: null,
              feet: 300,
              onBid: false,
              sendable: { ok: false, message: "Say what it is made of first." },
            },
          ],
        }),
      ],
      untypedRuns: 0,
    });
    expect(s.notOnBid[0]).toMatchObject({
      reason: "cannotSend",
      why: "Say what it is made of first.",
      name: "Wire",
      send: null,
    });
  });

  it("does not list a fitting that is an answer rather than a gap", () => {
    const s = takeoffSummary({
      locked: false,
      counts: [],
      runTypes: [
        runType({
          rows: [],
          fittings: [
            {
              role: "coupling",
              status: "included",
              qty: 0,
              why: "Belled end — sticks join without couplings.",
              materialName: null,
              onBid: false,
              sendable: { ok: false, message: "Belled end" },
              priced: false,
            },
            {
              role: "lb",
              status: "unknown",
              qty: 0,
              why: "Pull points not answered.",
              materialName: null,
              onBid: false,
              sendable: { ok: false, message: "Pull points not answered." },
              priced: false,
            },
          ],
        }),
      ],
      untypedRuns: 0,
    });
    expect(s.notOnBid.map(i => i.key)).toEqual(["run:7:lb"]);
  });

  it("says runs with no scale and runs with no type, and sends neither", () => {
    const s = takeoffSummary({
      locked: false,
      counts: [],
      runTypes: [runType({ rows: [], unmeasurableCount: 2 })],
      untypedRuns: 1,
    });
    expect(s.notOnBid.map(i => [i.reason, i.name])).toEqual([
      ["noScale", "2 runs"],
      ["noType", "1 traced run"],
    ]);
    expect(s.sendable).toEqual([]);
  });
});

describe("wording and wire", () => {
  it("says a traced run is traced, not counted", () => {
    const s = takeoffSummary({
      locked: false,
      counts: [count(2, 2)],
      runTypes: [runType()],
      untypedRuns: 0,
    });
    expect(s.notOnBid.map(i => i.why)).toEqual([
      "Counted, not sent yet.",
      "Traced, not sent yet.",
    ]);
  });

  it("names conduit with no wire in it, and never offers to send it", () => {
    // Seen on screen 2026-09-29: a type reading "2 #12 + ground" put pipe on
    // the bid and 0 ft of wire, and the summary said nothing about it.
    const s = takeoffSummary({
      locked: false,
      counts: [],
      runTypes: [],
      untypedRuns: 0,
      runsWithNoWire: 1,
    });
    expect(s.notOnBid).toMatchObject([
      { key: "noWire", name: "Wire for 1 conduit run", send: null },
    ]);
    expect(s.sendable).toEqual([]);
  });
});

describe("what the preview says about price", () => {
  it("says a free count and a $0 fitting are not priced, and claims nothing else", () => {
    const s = takeoffSummary({
      locked: false,
      counts: [{ ...count(1, 2), kind: "plain" }, count(2, 3)],
      runTypes: [
        runType({
          fittings: [
            {
              role: "strap",
              status: "counted",
              qty: 12,
              why: "",
              materialName: "1/2 strap",
              onBid: false,
              sendable: { ok: true },
              priced: false,
            },
          ],
        }),
      ],
      untypedRuns: 0,
    });
    expect(s.notOnBid.map(i => [i.key, i.notPriced])).toEqual([
      ["count:1", true],
      ["count:2", false],
      ["run:7:raceway", false],
      ["run:7:strap", true],
    ]);
  });
});

describe("the list the preview showed is the list sent", () => {
  it("matches regardless of order, and not when one is added or missing", () => {
    expect(sameSendList(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameSendList(["a"], ["a", "b"])).toBe(false);
    expect(sameSendList(["a", "b"], ["a"])).toBe(false);
    expect(sameSendList(["a", "a"], ["a", "b"])).toBe(false);
    expect(sameSendList([], [])).toBe(true);
  });
});
