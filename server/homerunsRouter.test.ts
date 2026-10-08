/**
 * HOMERUNS end to end through the router, on Track A's 0125–0130
 * (references/homerun-footage-plan.md § 10 steps 2–4): the browser syncs the
 * circuits it read, places a panel, and the server computes the footage —
 * the same footage the bid line reads.
 *
 * Each `it` names the rule it holds; each fails on the code before the
 * homerun router existed (there was no `homeruns` router and no column).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9411;
const STRANGER = 9412;
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const callerFor = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-homeruns-${id}`, role: "user" },
  } as unknown as TrpcContext);
const caller = () => callerFor(USER);

/** 1/4" = 1'-0": a foot is 18 page points. */
const ft = (feet: number) => feet * 18;

/**
 * A bid with one sheet at 1/4", a 10'-0" run height, the panel type at
 * 6'-0", and a receptacle count with two marks: one 40 ft from where the
 * panel will go, one 60 ft.
 */
async function aBid() {
  const bid = (await caller().bids.create({
    name: `Homeruns ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E1.pdf",
    storageKey: `test/${bid.id}/e1.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });
  await caller().takeoffHeights.setBidDistribution({
    bidId: bid.id,
    inches: 120,
  });
  await caller().takeoffHeights.setBidHeight({
    bidId: bid.id,
    typeKey: "panel",
    inches: 72,
  });
  const group = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Duplex receptacle",
  });
  await caller().takeoffGroups.setDrop({
    id: group.id,
    dropKind: "receptacle",
  });
  await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId: sheet.id,
    groupId: group.id,
    at: [
      { x: ft(40), y: ft(10) },
      { x: ft(60), y: ft(10) },
    ],
  });
  const marks = (
    await caller().takeoffStamps.listForSheet({ sheetId: sheet.id })
  )
    .map(m => ({ id: m.id, x: Number(m.x) }))
    .sort((a, b) => a.x - b.x);
  return {
    bidId: bid.id,
    sheetId: sheet.id,
    near: marks[0].id,
    far: marks[1].id,
  };
}

async function homeruns(bidId: number) {
  return caller().homeruns.forBid({ bidId });
}

function computed(row: Awaited<ReturnType<typeof homeruns>>["rows"][number]) {
  if (row.footage.state !== "computed")
    throw new Error(`expected computed: ${row.footage.state}`);
  return row.footage;
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  for (const id of [USER, STRANGER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id,
        openId: `test-homeruns-${id}`,
        name: `Homerun user ${id}`,
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER, STRANGER]));
});

describeDb("panel spots and circuits are saved (step 2)", () => {
  it("no panel spot: no number, said — then the spot gives 40 + 12.5 ft", async () => {
    const { bidId, sheetId, near } = await aBid();
    await caller().homeruns.syncSheet({
      bidId,
      sheetId,
      circuits: [{ panel: "2B", circuits: [1], leavingStampId: near }],
    });
    let rows = (await homeruns(bidId)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].footage).toMatchObject({
      state: "refused",
      reason: "no-panel-spot",
    });

    await caller().homeruns.placePanel({
      bidId,
      panel: "2B",
      spot: { sheetId, x: 0, y: ft(10) },
    });
    const result = await homeruns(bidId);
    rows = result.rows;
    expect(result.panels[0]).toMatchObject({
      name: "2B",
      planSheetId: sheetId,
      planX: 0,
      planY: ft(10),
    });
    const f = computed(rows[0]);
    expect(f.pieces.runFt).toBeCloseTo(40, 6);
    expect(f.pieces.installedFt).toBeCloseTo(52.5, 6);
    expect(rows[0].method.method).toBe("measured");
  });

  /*
    VIEWING NEVER CHANGES A SAVED NUMBER (owner, 2026-10-07). The Circuits
    panel sends this on every visit; it used to re-point every unconfirmed
    homerun to whatever the browser now read as closest, so E111's totals
    moved 4,119.31 → 3,987.54 ft from looking. Red before: the re-read below
    moved circuit 1 to `far`.
  */
  it("a re-read (a visit) changes NOTHING — three visits, the same totals", async () => {
    const { bidId, sheetId, near, far } = await aBid();
    const sync = (stamp: number) =>
      caller().homeruns.syncSheet({
        bidId,
        sheetId,
        circuits: [{ panel: "2B", circuits: [1], leavingStampId: stamp }],
      });
    await sync(near);
    await caller().homeruns.placePanel({
      bidId,
      panel: "2B",
      spot: { sheetId, x: 0, y: ft(10) },
    });
    const first = await homeruns(bidId);
    for (let visit = 0; visit < 3; visit++) {
      // The browser reads a different "closest" each time — it must not move.
      const result = await sync(visit % 2 === 0 ? far : near);
      expect(result).toMatchObject({ created: 0, repointed: 0 });
      const now = await homeruns(bidId);
      expect(now.rows[0].leavingStampId).toBe(near);
      expect(now.totals).toEqual(first.totals);
    }
  });

  it("Re-match re-points an UNCONFIRMED homerun and leaves a confirmed one", async () => {
    const { bidId, sheetId, near, far } = await aBid();
    const sync = (stamp: number, rematch: boolean) =>
      caller().homeruns.syncSheet({
        bidId,
        sheetId,
        rematch,
        circuits: [
          { panel: "2B", circuits: [1], leavingStampId: stamp },
          { panel: "2B", circuits: [3], leavingStampId: stamp },
        ],
      });
    expect(await sync(near, false)).toMatchObject({ created: 2 });
    const [first, second] = (await homeruns(bidId)).rows.sort(
      (a, b) => a.circuitNumber - b.circuitNumber
    );
    await caller().homeruns.update({
      circuitId: second.circuitId,
      confirmed: true,
    });
    expect(await sync(far, true)).toMatchObject({ created: 0, repointed: 1 });
    const after = (await homeruns(bidId)).rows.sort(
      (a, b) => a.circuitNumber - b.circuitNumber
    );
    expect(after[0].circuitId).toBe(first.circuitId);
    expect(after[0].leavingStampId).toBe(far);
    expect(after[1].leavingStampId).toBe(near);
    // Asked again with nothing to move: says so.
    expect(await sync(far, true)).toMatchObject({ repointed: 0 });
  });

  it("a two-pole tag is ONE homerun", async () => {
    const { bidId, sheetId, near } = await aBid();
    await caller().homeruns.syncSheet({
      bidId,
      sheetId,
      circuits: [{ panel: "2B", circuits: [36, 38], leavingStampId: near }],
    });
    const rows = (await homeruns(bidId)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ circuitNumber: 36, poles: 2 });
  });

  it("refuses a device that is not a mark on that sheet", async () => {
    const one = await aBid();
    const other = await aBid();
    await expect(
      caller().homeruns.syncSheet({
        bidId: one.bidId,
        sheetId: one.sheetId,
        circuits: [{ panel: "2B", circuits: [1], leavingStampId: other.near }],
      })
    ).rejects.toThrow(/not a mark on this sheet/);
  });
});

describeDb("homerun rows: confirm and override (step 3)", () => {
  async function placed() {
    const b = await aBid();
    await caller().homeruns.syncSheet({
      bidId: b.bidId,
      sheetId: b.sheetId,
      circuits: [{ panel: "2B", circuits: [1], leavingStampId: b.near }],
    });
    await caller().homeruns.placePanel({
      bidId: b.bidId,
      panel: "2B",
      spot: { sheetId: b.sheetId, x: 0, y: ft(10) },
    });
    const [row] = (await homeruns(b.bidId)).rows;
    return { ...b, circuitId: row.circuitId };
  }

  it("starts unconfirmed and COUNTS, with the tally beside it", async () => {
    const { bidId } = await placed();
    const result = await homeruns(bidId);
    expect(computed(result.rows[0]).confirmed).toBe(false);
    expect(result.totals.unconfirmed).toBe(1);
    expect(result.totals.laborFt).toBeGreaterThan(0);
  });

  it("a typed length replaces run + drops, and confirms", async () => {
    const { bidId, circuitId } = await placed();
    await caller().homeruns.update({ circuitId, overrideFt: 75 });
    const f = computed((await homeruns(bidId)).rows[0]);
    expect(f.pieces.installedFt).toBe(75);
    expect(f.confirmed).toBe(true);
  });

  it("its own ceiling is used, and confirms", async () => {
    const { bidId, circuitId } = await placed();
    await caller().homeruns.update({ circuitId, ceilingInches: 216 });
    const row = (await homeruns(bidId)).rows[0];
    expect(row.ceiling).toEqual({ inches: 216, source: "homerun" });
    expect(computed(row).confirmed).toBe(true);
  });

  it("the bid's method and a sheet's override are saved and used", async () => {
    const { bidId, sheetId } = await placed();
    await caller().homeruns.setBidSettings({
      bidId,
      method: "average",
      averageFt: 25,
    });
    expect(computed((await homeruns(bidId)).rows[0]).pieces.runFt).toBe(25);
    await caller().homeruns.setSheetMethod({
      bidId,
      sheetId,
      method: "measuredMin",
      minimumFt: 50,
    });
    const row = (await homeruns(bidId)).rows[0];
    expect(row.method.methodFrom).toBe("area");
    expect(computed(row).pieces.runFt).toBe(50);
  });
});

describeDb(
  "homerun couplings, connectors and straps (owner, 2026-10-07)",
  () => {
    it("the bridge offers them and Send puts them on the bid, from the raceway's own settings", async () => {
      const { bidId, sheetId, near } = await aBid();
      const emt = (await caller().materials.list()).find(
        m => m.name === '1/2" EMT'
      )!;
      const stick = Number(emt.stickLengthFeet);
      const spacing = Number(emt.strapSpacingFeet);
      const fromBox = Number(emt.strapFromBoxFeet);
      expect(stick).toBeGreaterThan(0);
      expect(spacing).toBeGreaterThan(0);
      const type = await caller().takeoffRunTypes.create({
        label: `1/2" EMT homerun ${Date.now()}${Math.random()}`,
        pathType: "conduit",
        racewayMaterialId: emt.id,
        conductorCount: 2,
      });
      await caller().homeruns.setBidSettings({
        bidId,
        runTypeId: type.id,
        routingPct: 0.15,
      });
      await caller().homeruns.syncSheet({
        bidId,
        sheetId,
        circuits: [{ panel: "2B", circuits: [1], leavingStampId: near }],
      });
      await caller().homeruns.placePanel({
        bidId,
        panel: "2B",
        spot: { sheetId, x: 0, y: ft(10) },
      });

      // The pipe a homerun installs: (40 + 8.5 + 4) × 1.15.
      const feet = 52.5 * 1.15;
      const sticks = Math.ceil(feet / stick - 1e-9);
      const straps =
        feet <= 2 * fromBox
          ? 1
          : 2 +
            Math.max(0, Math.ceil((feet - 2 * fromBox) / spacing - 1e-9) - 1);

      const [entry] = (
        await caller().takeoffRunTypes.bridgeForBid({ bidId })
      ).filter(t => t.runTypeId === type.id);
      const byRole = new Map(entry.fittings.map(f => [f.role, f]));
      expect(byRole.get("coupling")).toMatchObject({ qty: sticks - 1 });
      expect(byRole.get("connector")).toMatchObject({ qty: 2 });
      expect(byRole.get("strap")).toMatchObject({ qty: straps });

      const result = await caller().takeoffRunTypes.sendToBid({
        bidId,
        runTypeId: type.id,
      });
      expect(result.sent).toEqual(
        expect.arrayContaining(["raceway", "coupling", "connector", "strap"])
      );
      const { lines } = await caller().bids.get({ id: bidId });
      const qtyOf = (role: string) =>
        Number(lines.find(l => l.runMaterialRole === role)?.qty);
      expect(qtyOf("coupling")).toBe(sticks - 1);
      expect(qtyOf("connector")).toBe(2);
      expect(qtyOf("strap")).toBe(straps);

      // And they follow the drawing: a second homerun moves them.
      await caller().homeruns.syncSheet({
        bidId,
        sheetId,
        circuits: [
          { panel: "2B", circuits: [1], leavingStampId: near },
          { panel: "2B", circuits: [3], leavingStampId: near },
        ],
      });
      const again = (await caller().bids.get({ id: bidId })).lines;
      expect(
        Number(again.find(l => l.runMaterialRole === "connector")?.qty)
      ).toBe(4);
      expect(
        Number(again.find(l => l.runMaterialRole === "coupling")?.qty)
      ).toBe(2 * (sticks - 1));
    });
  }
);

describeDb("extra bends per homerun (0131, owner 2026-10-07)", () => {
  /** One ½" EMT homerun, 40 ft from the panel, ready to read. */
  async function oneHomerun() {
    const b = await aBid();
    const emt = (await caller().materials.list()).find(
      m => m.name === '1/2" EMT'
    )!;
    const type = await caller().takeoffRunTypes.create({
      label: `1/2" EMT bends ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      racewayMaterialId: emt.id,
      conductorCount: 2,
    });
    await caller().homeruns.setBidSettings({
      bidId: b.bidId,
      runTypeId: type.id,
    });
    await caller().homeruns.syncSheet({
      bidId: b.bidId,
      sheetId: b.sheetId,
      circuits: [{ panel: "2B", circuits: [1], leavingStampId: b.near }],
    });
    await caller().homeruns.placePanel({
      bidId: b.bidId,
      panel: "2B",
      spot: { sheetId: b.sheetId, x: 0, y: ft(10) },
    });
    return { ...b, typeId: type.id };
  }

  /** Every number "Send to bid" would carry for the homerun type. */
  async function bridgeOf(bidId: number, typeId: number) {
    const entry = (await caller().takeoffRunTypes.bridgeForBid({ bidId })).find(
      t => t.runTypeId === typeId
    )!;
    // ½" EMT is bent in the field, so the count is the field-bend row (the
    // elbow row says "included"); a factory-elbow raceway would be elbow90.
    const bend = entry.fittings.find(
      f =>
        (f.role === "elbow90" || f.role === "fieldBend") &&
        f.status === "counted"
    )!;
    return {
      numbers: {
        rows: entry.rows.map(r => [r.role, r.feet]),
        fittings: entry.fittings.map(f => [f.role, f.qty]),
      },
      bend,
    };
  }

  it("unset counts the starter 1 and says so; Accept moves NO number, only the label", async () => {
    const { bidId, typeId } = await oneHomerun();
    expect((await homeruns(bidId)).settings.extraBends).toBeNull();
    const before = await bridgeOf(bidId, typeId);
    expect(before.bend.why).toMatch(
      /1 homerun corner set on the bid \(not confirmed\)/
    );

    await caller().homeruns.setBidSettings({ bidId, extraBends: 1 });

    expect((await homeruns(bidId)).settings.extraBends).toBe(1);
    const after = await bridgeOf(bidId, typeId);
    // The owner's rule: the default is already counted, so accepting it
    // changes nothing on the bid — every row and every fitting the same.
    expect(after.numbers).toEqual(before.numbers);
    expect(after.bend.why).toMatch(/1 homerun corner set on the bid/);
    expect(after.bend.why).not.toMatch(/not confirmed/);
  });

  it("3 extra bends adds two bends to the homerun; 0 takes the one away", async () => {
    const { bidId, typeId } = await oneHomerun();
    const starter = Number((await bridgeOf(bidId, typeId)).bend.qty);

    await caller().homeruns.setBidSettings({ bidId, extraBends: 3 });
    const three = await bridgeOf(bidId, typeId);
    expect(Number(three.bend.qty)).toBe(starter + 2);
    expect(three.bend.why).toMatch(/3 homerun corners set on the bid/);

    await caller().homeruns.setBidSettings({ bidId, extraBends: 0 });
    expect(Number((await bridgeOf(bidId, typeId)).bend.qty)).toBe(starter - 1);

    // NULL puts the question back: the starter again, unconfirmed.
    await caller().homeruns.setBidSettings({ bidId, extraBends: null });
    const reset = await bridgeOf(bidId, typeId);
    expect(Number(reset.bend.qty)).toBe(starter);
    expect(reset.bend.why).toMatch(/not confirmed/);
  });

  it("a LOCKED bid refuses it, and none of its numbers move", async () => {
    const { bidId, typeId } = await oneHomerun();
    await caller().bids.lockQuantities({ bidId });
    const before = await bridgeOf(bidId, typeId);
    await expect(
      caller().homeruns.setBidSettings({ bidId, extraBends: 3 })
    ).rejects.toThrow(/locked/i);
    expect((await homeruns(bidId)).settings.extraBends).toBeNull();
    expect((await bridgeOf(bidId, typeId)).numbers).toEqual(before.numbers);
  });

  it("refuses a negative count and more than four", async () => {
    const { bidId } = await aBid();
    await expect(
      caller().homeruns.setBidSettings({ bidId, extraBends: -1 })
    ).rejects.toThrow();
    await expect(
      caller().homeruns.setBidSettings({ bidId, extraBends: 5 })
    ).rejects.toThrow();
  });
});

describeDb("every total the bid line agrees with includes homeruns", () => {
  it("the Totals tab and the materials list carry the homerun pipe", async () => {
    const { bidId, sheetId, near } = await aBid();
    const type = await caller().takeoffRunTypes.create({
      label: `3/4" EMT totals ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      conductorCount: 2,
    });
    await caller().homeruns.setBidSettings({
      bidId,
      runTypeId: type.id,
      routingPct: 0.15,
    });
    await caller().homeruns.syncSheet({
      bidId,
      sheetId,
      circuits: [{ panel: "2B", circuits: [1], leavingStampId: near }],
    });
    await caller().homeruns.placePanel({
      bidId,
      panel: "2B",
      spot: { sheetId, x: 0, y: ft(10) },
    });
    // Seen on screen 2026-10-07: "Conduit 0 ft" beside 4,476 ft of homerun pipe.
    const totals = await caller().takeoffRuns.totals({ bidId });
    expect(totals.homerunCount).toBe(1);
    expect(totals.conduitBoughtFeet).toBeCloseTo(52.5 * 1.15, 1);
    const list = await caller().materialsList.get({ bidId });
    expect(list.notes.join(" ")).toMatch(/Includes 1 homerun/);
  });
});

describeDb("the bid line (step 4)", () => {
  it("homeruns land on the homerun type's line: routing + waste added, makeup at the panel", async () => {
    const { bidId, sheetId, near } = await aBid();
    const type = await caller().takeoffRunTypes.create({
      label: `3/4" EMT 2 #12 ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      conductorCount: 2,
    });
    await caller().homeruns.setBidSettings({
      bidId,
      runTypeId: type.id,
      routingPct: 0.15,
    });
    await caller().homeruns.syncSheet({
      bidId,
      sheetId,
      circuits: [{ panel: "2B", circuits: [1], leavingStampId: near }],
    });
    await caller().homeruns.placePanel({
      bidId,
      panel: "2B",
      spot: { sheetId, x: 0, y: ft(10) },
    });
    // The bridge — what "Send to bid" offers — carries the homerun on the
    // type's raceway row, with no traced run at all on this bid.
    const bridge = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    const raceway = bridge
      .find(t => t.runTypeId === type.id)
      ?.rows.find(r => r.role === "raceway");
    // Nobody set a waste here, so bought = installed = 52.5 × 1.15.
    expect(raceway?.feet).toBeCloseTo(52.5 * 1.15, 1);
    const result = await homeruns(bidId);
    // A waste nobody set counts as 0 — and the screen is told so.
    expect(result.noExtraSet).toBe(true);

    /*
      The company accepts the starter extras (conduit 5%, wire 10%, panel
      makeup 5 ft): routing and waste now ADD on the real line, waste stays
      off the installed footage, and makeup is one panel tail per wire.
    */
    await caller().takeoffHeights.acceptExtraStarters({ accept: true });
    try {
      const priced = await homeruns(bidId);
      expect(priced.noExtraSet).toBe(false);
      const line = priced.rows[0].line!;
      expect(line.conduitInstalledFeet).toBeCloseTo(52.5 * 1.15, 4);
      expect(line.conduitBoughtFeet).toBeCloseTo(52.5 * (1 + 0.15 + 0.05), 4);
      // 2 conductors, no ground on this type: 2 wires.
      expect(line.makeupFeet).toBeCloseTo(2 * 5, 6);
      expect(line.wireInstalledFeet).toBeCloseTo(2 * (52.5 * 1.15 + 5), 4);
      expect(line.wireBoughtFeet).toBeCloseTo(2 * (52.5 * 1.25 + 5), 4);
      const after = await caller().takeoffRunTypes.bridgeForBid({ bidId });
      expect(
        after
          .find(t => t.runTypeId === type.id)
          ?.rows.find(r => r.role === "raceway")?.feet
      ).toBeCloseTo(52.5 * 1.2, 1);
    } finally {
      await caller().takeoffHeights.acceptExtraStarters({ accept: false });
    }
  });
});

describeDb("height areas inside a sheet (0130)", () => {
  async function placed() {
    const b = await aBid();
    await caller().homeruns.syncSheet({
      bidId: b.bidId,
      sheetId: b.sheetId,
      circuits: [{ panel: "2B", circuits: [1], leavingStampId: b.near }],
    });
    await caller().homeruns.placePanel({
      bidId: b.bidId,
      panel: "2B",
      spot: { sheetId: b.sheetId, x: 0, y: ft(10) },
    });
    return b;
  }
  // The leaving device sits at (40 ft, 10 ft) — 720, 180 page points.
  const around = (pad: number) => [
    { x: ft(40) - pad, y: ft(10) - pad },
    { x: ft(40) + pad, y: ft(10) + pad },
  ];

  it("a homerun leaving a device inside an area climbs to its height", async () => {
    const { bidId, sheetId } = await placed();
    await caller().homeruns.createHeightArea({
      bidId,
      sheetId,
      name: "Stockroom",
      outline: around(90),
      heightInches: 216,
    });
    const [row] = (await homeruns(bidId)).rows;
    expect(row.ceiling).toEqual({ inches: 216, source: "area" });
    const f = computed(row);
    // 18'-0" ceiling: 16.5 ft up from the receptacle, 12 ft down to the panel.
    expect(f.pieces.installedFt).toBeCloseTo(40 + 16.5 + 12, 6);
  });

  it("two overlapping: the SMALLER wins, even with the LOWER height, and it warns", async () => {
    const { bidId, sheetId } = await placed();
    await caller().homeruns.createHeightArea({
      bidId,
      sheetId,
      name: "Sales floor",
      outline: around(160),
      heightInches: 216,
    });
    await caller().homeruns.createHeightArea({
      bidId,
      sheetId,
      name: "Office",
      outline: around(60),
      heightInches: 108,
    });
    expect((await homeruns(bidId)).rows[0].ceiling.inches).toBe(108);
    const { warnings } = await caller().homeruns.heightAreas({ bidId });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toMatch(/"Office" is smaller/);
  });

  it("two sharing a wall do not warn", async () => {
    const { bidId, sheetId } = await placed();
    for (const [name, x0, x1] of [
      ["Sales", 0, 400],
      ["Stock", 400, 800],
    ] as const)
      await caller().homeruns.createHeightArea({
        bidId,
        sheetId,
        name,
        outline: [
          { x: x0, y: 0 },
          { x: x1, y: 300 },
        ],
        heightInches: 120,
      });
    expect((await caller().homeruns.heightAreas({ bidId })).warnings).toEqual(
      []
    );
  });

  it("an area with no height follows the sheet; a height set later moves it", async () => {
    const { bidId, sheetId } = await placed();
    const { id } = await caller().homeruns.createHeightArea({
      bidId,
      sheetId,
      name: "Open to deck",
      outline: around(90),
      heightInches: null,
    });
    expect((await homeruns(bidId)).rows[0].ceiling.source).toBe("job");
    await caller().homeruns.updateHeightArea({ id, heightInches: 240 });
    expect((await homeruns(bidId)).rows[0].ceiling).toEqual({
      inches: 240,
      source: "area",
    });
    await caller().homeruns.removeHeightArea({ id });
    expect((await homeruns(bidId)).rows[0].ceiling.source).toBe("job");
  });

  it("refuses a sliver, a locked bid and another company", async () => {
    const { bidId, sheetId } = await placed();
    await expect(
      caller().homeruns.createHeightArea({
        bidId,
        sheetId,
        name: "Sliver",
        outline: [
          { x: 10, y: 10 },
          { x: 12, y: 12 },
        ],
        heightInches: 120,
      })
    ).rejects.toThrow(/too small/);
    await expect(
      callerFor(STRANGER).homeruns.createHeightArea({
        bidId,
        sheetId,
        name: "Theirs",
        outline: around(90),
        heightInches: 120,
      })
    ).rejects.toThrow(/not found/i);
    await caller().bids.lockQuantities({ bidId });
    await expect(
      caller().homeruns.createHeightArea({
        bidId,
        sheetId,
        name: "Late",
        outline: around(90),
        heightInches: 120,
      })
    ).rejects.toThrow(/locked/i);
  });
});

describeDb(
  "regular runs read the area and the sheet ceiling (2026-10-07)",
  () => {
    it("a run ending in an 18'-0\" area drops 16.5 ft; the sheet's 12'-0\" gives 10.5; none gives the job's 8.5", async () => {
      const { bidId, sheetId } = await aBid();
      const type = await caller().takeoffRunTypes.create({
        label: `Run type ${Date.now()}${Math.random()}`,
        pathType: "conduit",
        conductorCount: 2,
      });
      // 40 ft along y = 10 ft, ending at (40 ft, 10 ft) on a receptacle.
      await caller().takeoffRuns.save({
        bidId,
        sheetId,
        name: "Run",
        pathType: "conduit",
        points: [
          { x: 0, y: ft(10) },
          { x: ft(40), y: ft(10) },
        ],
        status: "committed",
        startKind: "distribution",
        endKind: "receptacle",
        runTypeId: type.id,
      });
      const conduit = async () =>
        (await caller().takeoffRuns.totals({ bidId })).conduitBoughtFeet;
      // Job 10'-0": 40 + 8.5 (no waste set here).
      expect(await conduit()).toBeCloseTo(48.5, 2);

      await caller().homeruns.setSheetCeiling({ bidId, sheetId, inches: 144 });
      expect(await conduit()).toBeCloseTo(40 + 10.5, 2);

      await caller().homeruns.createHeightArea({
        bidId,
        sheetId,
        name: "Stockroom",
        outline: [
          { x: ft(35), y: ft(5) },
          { x: ft(45), y: ft(15) },
        ],
        heightInches: 216,
      });
      expect(await conduit()).toBeCloseTo(40 + 16.5, 2);

      // The sheet ceiling cleared: the area still answers for its box.
      await caller().homeruns.setSheetCeiling({ bidId, sheetId, inches: null });
      expect(await conduit()).toBeCloseTo(40 + 16.5, 2);
      const { sheetCeilings } = await caller().homeruns.heightAreas({ bidId });
      expect(sheetCeilings.find(s => s.sheetId === sheetId)?.inches).toBeNull();
    });
  }
);

describeDb("refusals", () => {
  it("a locked bid's homeruns do not move", async () => {
    const { bidId, sheetId, near } = await aBid();
    await caller().bids.lockQuantities({ bidId });
    await expect(
      caller().homeruns.syncSheet({
        bidId,
        sheetId,
        circuits: [{ panel: "2B", circuits: [1], leavingStampId: near }],
      })
    ).rejects.toThrow(/locked/i);
    await expect(
      caller().homeruns.setBidSettings({ bidId, method: "average" })
    ).rejects.toThrow(/locked/i);
  });

  it("another company cannot read or write them", async () => {
    const { bidId, sheetId, near } = await aBid();
    await expect(
      callerFor(STRANGER).homeruns.forBid({ bidId })
    ).rejects.toThrow(/not found/i);
    await expect(
      callerFor(STRANGER).homeruns.syncSheet({
        bidId,
        sheetId,
        circuits: [{ panel: "2B", circuits: [1], leavingStampId: near }],
      })
    ).rejects.toThrow(/not found/i);
  });

  it("refuses a run type that is not this company's", async () => {
    const { bidId } = await aBid();
    await expect(
      caller().homeruns.setBidSettings({ bidId, runTypeId: 987654321 })
    ).rejects.toThrow(/not in this company's list/);
  });
});
