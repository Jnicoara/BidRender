/**
 * shared/takeoffSummary.ts — the sorting rule, with no database.
 * The router half is server/sendAll.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  foldNotOnBid,
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
      {
        key: "noWire",
        name: "1 conduit run with no wire picked",
        send: null,
      },
    ]);
    expect(s.sendable).toEqual([]);
  });

  it("names both answers, and says where to give them (never stuck)", () => {
    // 2026-10-08: on an underground run the old sentence ("conduit with
    // nothing pulled through it") read as a fault, offered nothing to press,
    // and never mentioned that an empty pipe is a real answer.
    const place = { runId: 5, bidPdfId: 2, pageNumber: 3, x: 10, y: 20 };
    const s = takeoffSummary({
      locked: false,
      counts: [],
      runTypes: [],
      untypedRuns: 0,
      runsWithNoWire: 2,
      firstRunWithNoWire: place,
    });
    const item = s.notOnBid.find(i => i.key === "noWire")!;
    expect(item.why).toMatch(/Pick the wire/);
    expect(item.why).toMatch(/empty pipe/);
    expect(item.fixAt).toEqual(place);
  });
});

describe("an extra says how its feet were reached, in the preview", () => {
  it("carries the tape's 'how' and nothing on the pipe", () => {
    // Seen 2026-10-08: tape at 211.12 ft beside pipe at 211.12 ft, and no
    // word in the Send dialog on why they match.
    const s = takeoffSummary({
      locked: false,
      counts: [],
      runTypes: [
        runType({
          rows: [
            {
              role: "raceway",
              materialName: '2" PVC Sch 40',
              feet: 211.12,
              onBid: false,
              sendable: { ok: true },
            },
            {
              role: "extra",
              materialName: "Underground warning tape",
              feet: 211.12,
              onBid: false,
              sendable: { ok: true },
              how: "211.12 ft over 2 runs, the flat length only, not the risers",
            },
          ],
        }),
      ],
      untypedRuns: 0,
    });
    const byName = new Map(s.notOnBid.map(i => [i.name, i]));
    expect(byName.get("Underground warning tape")?.note).toBe(
      "211.12 ft over 2 runs, the flat length only, not the risers"
    );
    expect(byName.get('2" PVC Sch 40')?.note).toBeUndefined();
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

describe('"Not on the bid yet", folded by reason', () => {
  const s = takeoffSummary({
    locked: false,
    counts: [count(1, 3), count(2, 1, "no-price")],
    runTypes: [
      runType({
        unmeasurableCount: 2,
        rows: [
          {
            role: "raceway",
            materialName: '1/2" EMT',
            feet: 100,
            onBid: false,
            sendable: { ok: true },
          },
          {
            role: "conductor",
            materialName: "#12 THHN",
            feet: 200,
            onBid: false,
            sendable: { ok: true },
          },
          {
            role: "ground",
            materialName: null,
            feet: 100,
            onBid: false,
            sendable: { ok: false, message: "This type names no ground." },
          },
        ],
        fittings: [
          {
            role: "lb",
            status: "unknown",
            qty: 0,
            why: "",
            materialName: null,
            onBid: false,
            sendable: { ok: false, message: "Say whether this run has LBs." },
            priced: null,
          },
        ],
      }),
    ],
    untypedRuns: 4,
  });
  const folds = foldNotOnBid(s.notOnBid);

  it("is one line per reason, with a count, traced and counted apart", () => {
    expect(folds.map(f => [f.label, f.count])).toEqual([
      ["Traced, not sent yet", 2],
      ["Counted, not sent yet", 1],
      ["No run type", 1],
      ["No scale", 1],
      ["Can't go on the bid as it stands", 2],
      ["Assembly no longer in your library", 1],
    ]);
  });

  it("covers every row exactly once — folding hides nothing", () => {
    const keys = folds.flatMap(f => f.items.map(i => i.key));
    expect(keys.sort()).toEqual(s.notOnBid.map(i => i.key).sort());
    expect(folds.reduce((n, f) => n + f.count, 0)).toBe(s.notOnBid.length);
  });

  it("says a shared reason once on the line, not under each row", () => {
    const noScale = folds.find(f => f.id === "noScale")!;
    expect(noScale.why).toBe("On a sheet with no scale, so it has no length.");
    const traced = folds.find(f => f.id === "notSent:run")!;
    expect(traced.items.map(i => i.ownWhy)).toEqual([null, null]);
  });

  it("does not repeat a sentence that only restates the line", () => {
    const traced = folds.find(f => f.id === "notSent:run")!;
    expect(traced.label).toBe("Traced, not sent yet");
    expect(traced.why).toBeNull();
    expect(folds.find(f => f.id === "notSent:count")!.why).toBeNull();
  });

  it("keeps a row's own reason when the rows in a fold differ", () => {
    const cannot = folds.find(f => f.id === "cannotSend")!;
    expect(cannot.why).toBeNull();
    expect(cannot.items.map(i => i.ownWhy)).toEqual([
      "This type names no ground.",
      "Say whether this run has LBs.",
    ]);
  });

  it("marks only the folds Send all would send", () => {
    expect(folds.filter(f => f.sendable).map(f => f.id)).toEqual([
      "notSent:run",
      "notSent:count",
    ]);
  });

  it("folds nothing when everything is on the bid", () => {
    expect(foldNotOnBid([])).toEqual([]);
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
