/**
 * STARTER UPDATES for a shop (server/starterOffers.ts) — references/starter-
 * offers-plan.md § 6, tests 1–12, against a real database.
 *
 * The starter rows changed here are THIS FILE'S OWN shared rows (names start
 * "Starter offer probe"), never shipped ones. Other files change their own
 * probes in parallel and `applyStarterChange` pins EVERY company, so a shop
 * here can hold offers about other files' probes: every assertion filters to
 * this file's probe rows (`mine`).
 *
 * Shops, by owner:
 *   A (9852) exists before every change, has no copy: pinned, offered.
 *            Holds four bids using the probe run type: an unlocked Draft, a
 *            locked Draft, an Active and a Won (both locked on leaving Draft).
 *   B (9853) priced the probe material itself: own-value, never Accept all.
 *   L (9854) created after the changes: reads the latest, no offer.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import { appRouter } from "./routers";
import { forkMaterial, getDb } from "./db";
import {
  assemblies,
  assemblyMaterials,
  bidPdfs,
  bids,
  materials,
  starterChangeBatches,
  starterOfferAnswers,
  takeoffRuns,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { applyStarterChange, undoStarterChange } from "./starterChanges";
import {
  StarterOfferRefused,
  acceptStarterOffers,
  draftsRecounted,
  ignoreStarterOffers,
  starterOffersFor,
  unignoreStarterOffers,
  type StarterOffer,
} from "./starterOffers";

const A = 9852;
const B = 9853;
const L = 9854;
dropFixtureUsersAfterAll([A, B, L]);
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const caller = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-starter-offers-${id}`, role: "user" },
  } as unknown as TrpcContext);

const PROBE = `Starter offer probe ${Date.now()}`;
const probe = { material: 0, raceway: 0, assembly: 0, runType: 0 };
const batches: number[] = [];
const bidsOf: Record<string, number> = {};

async function makeCompany(id: number) {
  const database = (await getDb())!;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id,
      openId: `test-starter-offers-${id}`,
      name: `Starter offers fixture ${id}`,
    });
  await caller(id).bids.list();
}

async function change(
  table: "materials" | "runTypes" | "assemblies",
  rowId: number,
  field: string,
  newValue: unknown
) {
  const result = await applyStarterChange({
    editorUserId: null,
    source: "screen",
    changes: [{ table, rowId, kind: "field", field, newValue }],
  });
  if (result.batchId !== null) batches.push(result.batchId);
  return result.applied[0]?.changeId;
}

const probeRows = () =>
  new Set([probe.material, probe.raceway, probe.assembly, probe.runType]);

/** This file's offers only (see the header). */
async function mine(owner: number) {
  const read = await starterOffersFor(owner);
  const ours = (o: StarterOffer) => probeRows().has(o.rowId);
  return {
    offers: read.offers.filter(ours),
    ignored: read.ignored.filter(ours),
  };
}

const pick = (o: StarterOffer) => ({
  key: o.key,
  latestChangeId: o.latestChangeId,
});

async function copyOf(owner: number, sharedId: number) {
  const [row] = await (await getDb())!
    .select()
    .from(materials)
    .where(
      and(eq(materials.userId, owner), eq(materials.baselineId, sharedId))
    );
  return row;
}

async function totals(owner: number) {
  const out: Record<string, number> = {};
  for (const [name, id] of Object.entries(bidsOf))
    out[name] = (await caller(owner).bids.get({ id })).totals.directCost;
  return out;
}

describeDb("starter updates for a shop (starter-offers-plan.md § 6)", () => {
  beforeAll(async () => {
    const database = (await getDb())!;
    const [m] = await database.insert(materials).values({
      name: `${PROBE} material`,
      unitOfSale: "each",
      costPerUnit: "0.4800",
      laborHours: "0.2000",
      isExamplePrice: true,
      isExampleLaborHours: true,
      category: "Receptacles",
      trade: "electrical",
    });
    probe.material = m.insertId;
    const [r] = await database.insert(materials).values({
      name: `${PROBE} raceway`,
      unitOfSale: "foot",
      costPerUnit: "1.0000",
      stickLengthFeet: "10.00",
      category: "Conduit",
      trade: "electrical",
    });
    probe.raceway = r.insertId;
    const [a] = await database.insert(assemblies).values({
      name: `${PROBE} assembly`,
      category: "Devices",
      trade: "electrical",
      baseLaborHours: "1.0000",
      overheadLaborHours: "0.0000",
    });
    probe.assembly = a.insertId;
    await database.insert(assemblyMaterials).values({
      assemblyId: probe.assembly,
      materialId: probe.material,
      qty: "2.0000",
      isBranchWhip: false,
      sortOrder: 0,
    });
    const [t] = await database.insert(takeoffRunTypes).values({
      label: `${PROBE} run type`,
      pathType: "conduit",
      trade: "electrical",
      racewayMaterialId: probe.raceway,
      wireExtraPct: "5.00",
    });
    probe.runType = t.insertId;

    await makeCompany(A);
    await makeCompany(B);
    // B priced the material itself: its own copy, its own value.
    const bCopy = await forkMaterial(probe.material, B);
    await caller(B).materials.update({ id: bCopy, costPerUnit: 0.6 });

    // A's four bids, each with the probe assembly on a line and one run of
    // the probe run type on a sheet.
    for (const name of ["draft", "lockedDraft", "active", "won"]) {
      const bid = (await caller(A).bids.create({
        name: `${PROBE} ${name}`,
        trades: ["electrical"],
      }))!;
      bidsOf[name] = bid.id;
      await caller(A).bids.addAssembly({
        bidId: bid.id,
        assemblyId: probe.assembly,
        qty: 3,
      });
      const [pdf] = await database.insert(bidPdfs).values({
        bidId: bid.id,
        userId: A,
        filename: "E.pdf",
        storageKey: `test/${bid.id}/e.pdf`,
        byteSize: 1024,
        pageCount: 1,
        sortOrder: 0,
      });
      await caller(A).bidPdfs.ensureSheets({
        bidPdfId: pdf.insertId,
        pageCount: 1,
      });
      const [sheet] = await caller(A).bidPdfs.sheets({
        bidPdfId: pdf.insertId,
      });
      await database.insert(takeoffRuns).values({
        bidId: bid.id,
        sheetId: sheet.id,
        userId: A,
        name: "Run 1",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        runTypeId: probe.runType,
      });
    }
    await caller(A).bids.update({ id: bidsOf.active, status: "Active" });
    await caller(A).bids.update({ id: bidsOf.won, status: "Won" });
    await database
      .update(bids)
      .set({ quantitiesLockedAt: new Date() })
      .where(eq(bids.id, bidsOf.lockedDraft));
  });

  afterAll(async () => {
    if (!hasDb) return;
    const database = (await getDb())!;
    if (batches.length > 0)
      await database
        .delete(starterChangeBatches)
        .where(inArray(starterChangeBatches.id, batches));
    const asmIds = [
      probe.assembly,
      ...(
        await database
          .select({ id: assemblies.id })
          .from(assemblies)
          .where(eq(assemblies.baselineId, probe.assembly))
      ).map(r => r.id),
    ];
    await database
      .delete(assemblyMaterials)
      .where(inArray(assemblyMaterials.assemblyId, asmIds));
    await database.delete(assemblies).where(inArray(assemblies.id, asmIds));
    await database
      .delete(takeoffRunTypes)
      .where(
        or(
          eq(takeoffRunTypes.baselineId, probe.runType),
          eq(takeoffRunTypes.id, probe.runType)
        )
      );
    const matIds = [probe.material, probe.raceway];
    await database
      .delete(materials)
      .where(inArray(materials.baselineId, matIds));
    await database.delete(materials).where(inArray(materials.id, matIds));
  });

  it("tests 1–3: pinned shop offered, own value apart, a later shop reads the latest", async () => {
    await change("materials", probe.material, "costPerUnit", "0.52");

    const a = await mine(A);
    const price = a.offers.find(o => o.field === "costPerUnit")!;
    expect(price).toMatchObject({
      bucket: "offer",
      table: "materials",
      rowId: probe.material,
      latest: "0.5200",
      latestExample: true,
    });
    expect(Number(price.yours)).toBe(0.48);
    // A is pinned: it still reads the old price.
    expect(Number((await copyOf(A, probe.material)).costPerUnit)).toBe(0.48);

    const b = await mine(B);
    expect(b.offers.find(o => o.field === "costPerUnit")?.bucket).toBe(
      "own-value"
    );

    await makeCompany(L);
    expect((await mine(L)).offers).toEqual([]);
    const lList = await caller(L).materials.list();
    expect(
      Number(lList.find(m => m.name === `${PROBE} material`)?.costPerUnit)
    ).toBe(0.52);
  });

  it("test 5: a field changed twice is ONE offer, base → latest, still an offer", async () => {
    await change("materials", probe.material, "costPerUnit", "0.55");
    const prices = (await mine(A)).offers.filter(
      o => o.rowId === probe.material && o.field === "costPerUnit"
    );
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ bucket: "offer", latest: "0.5500" });
    expect(Number(prices[0].base)).toBe(0.48);
    expect(prices[0].steps).toHaveLength(2);
  });

  it("test 4: accepting hours leaves the price offer listed", async () => {
    await change("materials", probe.material, "laborHours", "0.25");
    const before = await mine(A);
    const hours = before.offers.find(o => o.field === "laborHours")!;
    await acceptStarterOffers({
      ownerUserId: A,
      actorUserId: A,
      picks: [pick(hours)],
      allowOwnValue: false,
    });
    const after = await mine(A);
    expect(after.offers.find(o => o.field === "laborHours")).toBeUndefined();
    expect(after.offers.find(o => o.field === "costPerUnit")?.bucket).toBe(
      "offer"
    );
    expect(Number((await copyOf(A, probe.material)).laborHours)).toBe(0.25);
  });

  it("test 7: Accept writes the price WITH its Example tag; never a tag offer of its own", async () => {
    // A edits its own price first, which clears its tag (owner rule).
    const copy = await copyOf(A, probe.material);
    expect(copy.isExamplePrice).toBe(true); // copied from the starter by the pin
    const priceOffer = (await mine(A)).offers.find(
      o => o.field === "costPerUnit"
    )!;
    expect(
      (await mine(A)).offers.some(o => (o.field ?? "").startsWith("isExample"))
    ).toBe(false);
    await acceptStarterOffers({
      ownerUserId: A,
      actorUserId: A,
      picks: [pick(priceOffer)],
      allowOwnValue: false,
    });
    const after = await copyOf(A, probe.material);
    expect(Number(after.costPerUnit)).toBe(0.55);
    expect(after.isExamplePrice).toBe(true);
    // Accept does not turn a pin into "my change".
    expect(after.isPinnedCopy).toBe(true);
    // B's own edit cleared its tag; B is untouched by A's Accept (test 11).
    const bCopy = await copyOf(B, probe.material);
    expect(Number(bCopy.costPerUnit)).toBe(0.6);
    expect(bCopy.isExamplePrice).toBe(false);
  });

  it("test 3: Accept all refuses a shop's own value; one at a time takes it", async () => {
    const own = (await mine(B)).offers.find(o => o.field === "costPerUnit")!;
    await expect(
      acceptStarterOffers({
        ownerUserId: B,
        actorUserId: B,
        picks: [pick(own)],
        allowOwnValue: false,
      })
    ).rejects.toBeInstanceOf(StarterOfferRefused);
    expect(Number((await copyOf(B, probe.material)).costPerUnit)).toBe(0.6);
  });

  it("test 6 and Q7: ignore, a newer change re-offers; undo reaches only a shop that accepted", async () => {
    const own = (await mine(B)).offers.find(o => o.field === "costPerUnit")!;
    await ignoreStarterOffers({
      ownerUserId: B,
      actorUserId: B,
      picks: [pick(own)],
    });
    let b = await mine(B);
    expect(b.offers.find(o => o.field === "costPerUnit")).toBeUndefined();
    expect(b.ignored.find(o => o.field === "costPerUnit")?.answer).toBe(
      "ignored"
    );
    // Un-ignore puts it back; ignore again.
    await unignoreStarterOffers({
      ownerUserId: B,
      picks: [pick(b.ignored.find(o => o.field === "costPerUnit")!)],
    });
    b = await mine(B);
    const back = b.offers.find(o => o.field === "costPerUnit")!;
    expect(back).toBeDefined();
    await ignoreStarterOffers({
      ownerUserId: B,
      actorUserId: B,
      picks: [pick(back)],
    });

    // The admin changes the price again: a new offer for B (Q7).
    const third = await change(
      "materials",
      probe.material,
      "costPerUnit",
      "0.58"
    );
    b = await mine(B);
    expect(b.offers.find(o => o.field === "costPerUnit")?.latestChangeId).toBe(
      third
    );

    // Undo the 0.58: A accepted 0.55 earlier, now holds it — it equals the
    // undo's target, so nothing to offer. Take the 0.58 first, then undo.
    const a58 = (await mine(A)).offers.find(o => o.field === "costPerUnit")!;
    await acceptStarterOffers({
      ownerUserId: A,
      actorUserId: A,
      picks: [pick(a58)],
      allowOwnValue: false,
    });
    const undo = await undoStarterChange({
      changeId: third!,
      editorUserId: null,
    });
    if (undo.batchId !== null) batches.push(undo.batchId);
    const aUndo = (await mine(A)).offers.find(o => o.field === "costPerUnit");
    expect(aUndo).toMatchObject({ bucket: "offer", latest: "0.5500" });
    // L was created after the FIRST change, so the later ones pinned it at
    // 0.52 like anyone: its single price row is 0.52 → BidRidge's latest.
    // (A shop that never answered and already holds the undo's target sees
    // nothing — the pure half, server/starterOfferRules.test.ts.)
    const lPrice = (await mine(L)).offers.filter(
      o => o.field === "costPerUnit"
    );
    expect(lPrice).toHaveLength(1);
    expect(Number(lPrice[0].yours)).toBe(0.52);
    expect(lPrice[0].latest).toBe("0.5500");
  });

  it("tests 8–10: a raceway offer re-counts ONLY the unlocked Draft, and only after Accept", async () => {
    await change("runTypes", probe.runType, "wireExtraPct", "10");
    const offer = (await mine(A)).offers.find(
      o => o.table === "runTypes" && o.field === "wireExtraPct"
    )!;
    expect(offer.recountsDrafts).toBe(true);
    expect(offer.draftBidIds).toEqual([bidsOf.draft]);
    expect(draftsRecounted([offer])).toEqual([bidsOf.draft]);

    // Before Accept, A's copy still holds 5% (test 9).
    const [copyBefore] = await (await getDb())!
      .select()
      .from(takeoffRunTypes)
      .where(
        and(
          eq(takeoffRunTypes.userId, A),
          eq(takeoffRunTypes.baselineId, probe.runType)
        )
      );
    expect(Number(copyBefore.wireExtraPct)).toBe(5);

    const result = await acceptStarterOffers({
      ownerUserId: A,
      actorUserId: A,
      picks: [pick(offer)],
      allowOwnValue: false,
    });
    expect(result.draftsRecounted).toEqual([bidsOf.draft]);

    // The raceway material's stick length, read through the run type.
    await change("materials", probe.raceway, "stickLengthFeet", "20");
    const stick = (await mine(A)).offers.find(
      o => o.rowId === probe.raceway && o.field === "stickLengthFeet"
    )!;
    expect(stick.draftBidIds).toEqual([bidsOf.draft]);

    // A price offer re-counts nothing, and accepting one moves no bid total.
    const before = await totals(A);
    await change("materials", probe.material, "costPerUnit", "0.70");
    const priceOffer = (await mine(A)).offers.find(
      o => o.field === "costPerUnit"
    )!;
    expect(priceOffer.recountsDrafts).toBe(false);
    expect(priceOffer.draftBidIds).toEqual([]);
    await acceptStarterOffers({
      ownerUserId: A,
      actorUserId: A,
      picks: [pick(priceOffer)],
      allowOwnValue: false,
    });
    expect(await totals(A)).toEqual(before);
  });

  it("test 12: a stale pick refuses the whole Accept all and writes nothing", async () => {
    await change("materials", probe.material, "laborHours", "0.30");
    const hours = (await mine(A)).offers.find(o => o.field === "laborHours")!;
    const answersBefore = await (await getDb())!
      .select()
      .from(starterOfferAnswers)
      .where(eq(starterOfferAnswers.companyOwnerUserId, A));
    await expect(
      acceptStarterOffers({
        ownerUserId: A,
        actorUserId: A,
        picks: [pick(hours), { key: hours.key + ":nope", latestChangeId: 1 }],
        allowOwnValue: false,
      })
    ).rejects.toBeInstanceOf(StarterOfferRefused);
    expect(Number((await copyOf(A, probe.material)).laborHours)).toBe(0.25);
    const answersAfter = await (await getDb())!
      .select()
      .from(starterOfferAnswers)
      .where(eq(starterOfferAnswers.companyOwnerUserId, A));
    expect(answersAfter.length).toBe(answersBefore.length);
    // And a pick that BidRidge has moved past since is refused too.
    await change("materials", probe.material, "laborHours", "0.35");
    await expect(
      acceptStarterOffers({
        ownerUserId: A,
        actorUserId: A,
        picks: [pick(hours)],
        allowOwnValue: false,
      })
    ).rejects.toThrow(/changed .* again/);
  });

  it("a recipe part change is a per-part offer, and Accept edits the shop's own recipe", async () => {
    const result = await applyStarterChange({
      editorUserId: null,
      source: "screen",
      changes: [
        {
          table: "assemblies",
          rowId: probe.assembly,
          kind: "part_field",
          childTable: "assembly_materials",
          childRefId: probe.material,
          field: "qty",
          newValue: 3,
        },
      ],
    });
    if (result.batchId !== null) batches.push(result.batchId);
    const qty = (await mine(A)).offers.find(
      o => o.table === "assemblies" && o.kind === "partField"
    )!;
    expect(qty).toMatchObject({
      field: "qty",
      childRefId: probe.material,
      childName: `${PROBE} material`,
      bucket: "offer",
    });
    await acceptStarterOffers({
      ownerUserId: A,
      actorUserId: A,
      picks: [pick(qty)],
      allowOwnValue: false,
    });
    const database = (await getDb())!;
    const [asmCopy] = await database
      .select()
      .from(assemblies)
      .where(
        and(eq(assemblies.userId, A), eq(assemblies.baselineId, probe.assembly))
      );
    const [line] = await database
      .select()
      .from(assemblyMaterials)
      .where(eq(assemblyMaterials.assemblyId, asmCopy.id));
    expect(Number(line.qty)).toBe(3);
    // The starter itself still lists exactly one line.
    const shared = await database
      .select()
      .from(assemblyMaterials)
      .where(eq(assemblyMaterials.assemblyId, probe.assembly));
    expect(shared).toHaveLength(1);
  });
});
