/**
 * SPEED LIMITS — a screen's reads under 2 s, a save under 1 s, on whatever
 * machine runs the suite (the Gate's runner, with its own MySQL).
 *
 * What a "screen" is here: the server reads the screen's page fires when it
 * opens, sent together the way the browser sends them (Promise.all), timed
 * wall-clock until the last answers. Taken from each page's `useQuery` calls
 * (2026-10-15); a component's own queries below the page are not all listed,
 * so this is a floor on what the browser waits for, not the whole of it. The
 * network and the browser's drawing are not in it either — the Playwright
 * smoke is where those live.
 *
 * Each screen and save is run once to warm up, then RUNS times; the MEDIAN is
 * held to the limit, so one slow tick on a shared runner does not fail the
 * Gate while a read that got slower does. Every timing is printed, so the
 * Gate log is the measurement.
 *
 * The bid is middling on purpose (owner: keep test data small): 1 sheet,
 * 2 run types, 20 runs with a circuit each, 6 counts of 25 marks, 24 lines.
 *
 * A limit that today's code cannot meet is set just above today's number
 * with a todo.md entry to bring it down (`OVER_TODAY`) — never loosened
 * silently. Fixture user 9908.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { priceWrite } from "../shared/packPricing";
import * as db from "./db";
import {
  as,
  bidWithSheet,
  countOf,
  duplexAssembly,
  emtType,
  freshUser,
  own,
  rate,
  runLaborRate,
  straightRun,
  type Caller,
} from "./bidBuilders.testHelper";

const USER = 9908;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

export const SCREEN_LIMIT_MS = 2000;
export const SAVE_LIMIT_MS = 1000;
/**
 * Limits raised above the standard for something measured slower today, by
 * name, each with its todo.md entry. Empty means everything meets the
 * standard.
 */
const OVER_TODAY: Record<string, number> = {};
const RUNS = 5;

type Fixture = {
  c: Caller;
  bidId: number;
  sheetId: number;
  freeLineId: number;
  lineIds: number[];
  materialId: number;
  runTypeId: number;
  groupId: number;
};

async function build(): Promise<Fixture> {
  await freshUser(USER);
  const c = as(USER);
  const journeyman = await rate(c, "Speed journeyman", 60);
  await runLaborRate(c, USER, journeyman);
  const duplex = await duplexAssembly(c, journeyman);
  const { bidId, sheetId } = await bidWithSheet(c, USER, "Speed limits bid");

  const types = [
    await emtType(c, "Speed EMT A"),
    await emtType(c, "Speed EMT B"),
  ];
  for (let i = 0; i < 20; i++) {
    const run = await straightRun(
      c,
      bidId,
      sheetId,
      types[i % 2].id,
      `Run ${i + 1}`,
      40 + i * 3,
      i * 6
    );
    await c.takeoffRuns.addCircuit({
      runId: run.id,
      name: `C${i + 1}`,
      conductorCount: 2,
      groundCount: 1,
    });
  }
  for (const t of types)
    await c.takeoffRunTypes.sendToBid({ bidId, runTypeId: t.id });

  let groupId = 0;
  for (let k = 0; k < 6; k++) {
    const part = await own(c, `Speed device ${k}`, 4 + k, 0.2);
    const assembly = (await c.assemblies.create({
      name: `Speed device ${k}, complete`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.2,
      laborRateId: journeyman,
      materials: [{ materialId: part, qty: 1 }],
      modifierIds: [],
    }))!;
    groupId = await countOf(c, bidId, sheetId, assembly.id, [
      { n: 25, y: 4000 + k * 600 },
    ]);
    await c.takeoffGroups.sendToBid({ id: groupId });
  }
  const lineIds: number[] = [];
  for (let i = 0; i < 24; i++)
    lineIds.push(
      (await c.bids.addAssembly({ bidId, assemblyId: duplex.id, qty: 1 + i }))
        .line!.id
    );
  const free = await c.takeoffGroups.create({
    bidId,
    label: "Speed free count",
  });
  await c.takeoffStamps.drop({
    bidId,
    sheetId,
    groupId: free.id,
    at: [{ x: 100, y: 9000 }],
  });
  const { lineId: freeLineId } = await c.takeoffGroups.sendToBid({
    id: free.id,
  });
  const materialId = await own(c, "Speed priced part", 2.5, 0.1);
  return {
    c,
    bidId,
    sheetId,
    freeLineId,
    lineIds,
    materialId,
    runTypeId: types[0].id,
    groupId,
  };
}

function screens(f: Fixture): Record<string, () => Promise<unknown>> {
  const { c, bidId, sheetId } = f;
  return {
    Dashboard: () =>
      Promise.all([
        c.bids.dashboard(),
        c.bids.archived(),
        c.onboarding.state(),
      ]),
    "Bid (count screen)": () =>
      Promise.all([
        c.bids.get({ id: bidId }),
        c.takeoffRunTypes.bridgeForBid({ bidId }),
        c.homeruns.forBid({ bidId }),
        c.bids.units({ bidId }),
        c.bids.unitStates({ bidId }),
        c.bids.markupReapplyPreview({ bidId }),
        c.bidPdfs.list({ bidId }),
        c.assemblies.mostUsed(),
        c.assemblies.list(),
      ]),
    Plans: () =>
      Promise.all([
        c.takeoffSummary.forBid({ bidId }),
        c.takeoffStamps.unconfirmedForBid({ bidId }),
        c.takeoffStamps.symbols(),
        c.takeoffStamps.listForSheet({ sheetId }),
        c.takeoffRuns.typeColors({ bidId }),
        c.takeoffRuns.totals({ bidId }),
        c.takeoffRuns.listForSheet({ sheetId }),
        c.takeoffRunTypes.list(),
        c.takeoffRunTypes.bridgeForBid({ bidId }),
        c.takeoffHeights.forBid({ bidId }),
        c.takeoffGroups.list({ bidId }),
        c.materials.list(),
      ]),
    Materials: () => Promise.all([c.materials.list(), c.bids.markupRules()]),
    Assemblies: () =>
      Promise.all([
        c.assemblies.list(),
        c.laborRates.list(),
        c.modifiers.list({}),
        c.laborSteps.list(),
        c.assemblies.mountTypes(),
      ]),
    "Materials list": () => c.materialsList.get({ bidId }),
    Proposal: () => c.proposals.document({ bidId }),
  };
}

function saves(f: Fixture): Record<string, (i: number) => Promise<unknown>> {
  const { c, bidId, sheetId } = f;
  return {
    "Price a material": i =>
      c.materials.update({ id: f.materialId, costPerUnit: 2.5 + i / 100 }),
    "Rename the bid": i =>
      c.bids.update({ id: bidId, name: `Speed limits bid ${i}` }),
    "Type a price on a line": i =>
      c.bids.updateLine({ bidId, id: f.freeLineId, materialCost: 10 + i }),
    "Change a line's quantity": i =>
      c.bids.updateLine({ bidId, id: f.lineIds[0], qty: 5 + i }),
    "Tag a line's scope": i =>
      c.bids.setLineScope({
        bidId,
        lineIds: [f.lineIds[1]],
        scopeTag: i % 2 ? "ofci" : "install",
      }),
    "Place a mark": i =>
      c.takeoffStamps.drop({
        bidId,
        sheetId,
        groupId: f.groupId,
        at: [{ x: 200 + i * 50, y: 12000 }],
      }),
    "Trace a run": i =>
      straightRun(
        c,
        bidId,
        sheetId,
        f.runTypeId,
        `Speed new ${i}`,
        30,
        300 + i
      ),
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function timeIt(fn: (i: number) => Promise<unknown>) {
  await fn(0);
  const ms: number[] = [];
  for (let i = 1; i <= RUNS; i++) {
    const t = performance.now();
    await fn(i);
    ms.push(performance.now() - t);
  }
  return { median: median(ms), max: Math.max(...ms), all: ms };
}

describe.skipIf(!hasDb)("speed limits", () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await build();
  }, 180_000);

  it(`every screen's reads answer under ${SCREEN_LIMIT_MS} ms`, async () => {
    const over: string[] = [];
    for (const [name, fn] of Object.entries(screens(f))) {
      const t = await timeIt(fn);
      const limit = OVER_TODAY[name] ?? SCREEN_LIMIT_MS;
      console.log(
        `[speed] screen ${name}: median ${t.median.toFixed(0)} ms, max ${t.max.toFixed(0)} ms (limit ${limit})`
      );
      if (t.median > limit) over.push(`${name}: ${t.median.toFixed(0)} ms`);
    }
    expect(over, "screens over their limit").toEqual([]);
  }, 180_000);

  it(`every save answers under ${SAVE_LIMIT_MS} ms`, async () => {
    const over: string[] = [];
    for (const [name, fn] of Object.entries(saves(f))) {
      const t = await timeIt(fn);
      const limit = OVER_TODAY[name] ?? SAVE_LIMIT_MS;
      console.log(
        `[speed] save ${name}: median ${t.median.toFixed(0)} ms, max ${t.max.toFixed(0)} ms (limit ${limit})`
      );
      if (t.median > limit) over.push(`${name}: ${t.median.toFixed(0)} ms`);
    }
    expect(over, "saves over their limit").toEqual([]);
  }, 180_000);

  /*
    Diagnostic, not a limit: "Price a material" measured 221 ms in CI against
    6 ms on a laptop (Gate 38855631644; todo.md, "Speed limit outlier"). It
    is three calls, so each is timed on its own here and printed as
    `[speed-detail]` — the next CI log says which one it is.
  */
  it("prints where the material save spends its time", async () => {
    const parts: Record<string, (i: number) => Promise<unknown>> = {
      getMaterialById: () => db.getMaterialById(f.materialId, USER),
      updateMaterial: i =>
        // Through the one price door (track-c: a price reaches the row only
        // as a PricedWrite, shared/packPricing.ts) — what the route does.
        db.updateMaterial(f.materialId, USER, {
          price: {
            write: priceWrite({ typed: "unit", amount: 3 + i / 100 }),
            why: { source: "typed", actorUserId: USER },
          },
        }),
      "materials.update (whole)": i =>
        f.c.materials.update({ id: f.materialId, costPerUnit: 3.5 + i / 100 }),
    };
    for (const [name, fn] of Object.entries(parts)) {
      const t = await timeIt(fn);
      console.log(
        `[speed-detail] ${name}: median ${t.median.toFixed(0)} ms, all ${t.all.map(n => n.toFixed(0)).join("/")}`
      );
    }
  }, 60_000);
});
