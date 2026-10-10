/**
 * "Build it from parts here" — `bids.buildFromParts` (todo.md § "Before
 * beta: when the picker finds nothing", item b). What must hold:
 *
 *   • it puts a line on the bid, priced from the parts like any assembly line;
 *   • ticked (the default), the assembly is in the library afterwards, an
 *     ORDINARY assembly — the same picker, the same recipe;
 *   • unticked, the line still works and the library list does NOT show it,
 *     but it is in the Archived view and comes back with Restore;
 *   • a part from another company's catalog, or another company's role, is
 *     refused before anything is written;
 *   • a name the library already has is refused, and nothing is written.
 *
 * Fixture prices only, never shipped ones. Fixture ids are distinct from
 * every other suite — vitest shares one database.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineLaborRates } from "./db";
import { assemblies, bids, materials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { mergeParts } from "./buildFromParts";

const hasDb = Boolean(process.env.DATABASE_URL);
const USER = 9866;
const OTHER = 9867;

const callerFor = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-build-parts-${id}`, role: "user" },
  } as unknown as TrpcContext);
const caller = () => callerFor(USER);

describe("parts chosen twice", () => {
  it("are summed into one recipe line, in the order first chosen", () => {
    expect(
      mergeParts([
        { materialId: 5, qty: 1 },
        { materialId: 3, qty: 2 },
        { materialId: 5, qty: 0.5 },
      ])
    ).toEqual([
      { materialId: 5, qty: 1.5 },
      { materialId: 3, qty: 2 },
    ]);
  });
});

describe.skipIf(!hasDb)("building an assembly from parts on the bid", () => {
  let boxId: number;
  let deviceId: number;
  let rateId: number;
  let bidId: number;
  let otherCompanyPartId: number;

  const clear = async () => {
    const db = await getDb();
    for (const id of [USER, OTHER]) {
      await db!.delete(bids).where(eq(bids.userId, id));
      await db!.delete(assemblies).where(eq(assemblies.userId, id));
      await db!.delete(materials).where(eq(materials.userId, id));
    }
  };

  beforeAll(async () => {
    const db = await getDb();
    for (const id of [USER, OTHER]) {
      const [existing] = await db!
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing)
        await db!.insert(users).values({
          id,
          openId: `test-build-parts-${id}`,
          name: "Build from parts test user",
        });
    }
    await seedBaselineLaborRates();
  });

  afterAll(clear);

  beforeEach(async () => {
    await clear();
    const box = await caller().materials.create({
      name: `Build-parts probe box ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 4,
      category: "Boxes",
    });
    const device = await caller().materials.create({
      name: `Build-parts probe device ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 10,
      category: "Receptacles",
    });
    boxId = box!.id;
    deviceId = device!.id;
    const other = await callerFor(OTHER).materials.create({
      name: `Build-parts other company part ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 1,
      category: "Boxes",
    });
    otherCompanyPartId = other!.id;

    const rates = await caller().laborRates.list();
    const rate = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 50,
    });
    rateId = rate.laborRate!.id;
    bidId = (await caller().bids.create({ name: "Build-parts probe bid" }))!.id;
  });

  const build = (over: Record<string, unknown> = {}) =>
    caller().bids.buildFromParts({
      bidId,
      name: "Ceiling fan on box, probe",
      category: "Devices",
      parts: [
        { materialId: boxId, qty: 1 },
        { materialId: deviceId, qty: 2 },
      ],
      baseLaborHours: 1,
      laborRateId: rateId,
      qty: 3,
      unitLabel: null,
      saveToLibrary: true,
      ...over,
    });

  it("puts a priced line on the bid from the parts", async () => {
    const result = await build();
    const { lines } = await caller().bids.get({ id: bidId });
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line.id).toBe(result.line!.id);
    expect(line.assemblyId).toBe(result.assemblyId);
    expect(Number(line.qty)).toBe(3);
    // $4 box + 2 × $10 device, per one.
    expect(Number(line.snapshotMaterialCost)).toBe(24);
    expect(Number(line.snapshotLaborHours)).toBe(1);
    expect(Number(line.snapshotLaborRate)).toBe(50);
  });

  it("ticked: an ordinary assembly in the library, same recipe", async () => {
    const result = await build();
    const library = await caller().assemblies.list();
    const saved = library.find(a => a.id === result.assemblyId);
    expect(saved?.name).toBe("Ceiling fan on box, probe");
    const detail = await caller().assemblies.get({ id: result.assemblyId });
    expect(
      detail.materials
        .map(m => [m.materialId, Number(m.qty)])
        .sort((a, b) => a[0] - b[0])
    ).toEqual(
      [
        [boxId, 1],
        [deviceId, 2],
      ].sort((a, b) => a[0] - b[0])
    );
  });

  it("unticked: the line works, the library list does not show it, and Restore brings it back", async () => {
    const result = await build({ saveToLibrary: false });
    expect(result.savedToLibrary).toBe(false);

    const { lines } = await caller().bids.get({ id: bidId });
    expect(Number(lines[0].snapshotMaterialCost)).toBe(24);

    const library = await caller().assemblies.list();
    expect(library.some(a => a.id === result.assemblyId)).toBe(false);
    const archived = await caller().assemblies.list({ status: "archived" });
    expect(archived.some(a => a.id === result.assemblyId)).toBe(true);

    await caller().assemblies.restore({ id: result.assemblyId });
    expect(
      (await caller().assemblies.list()).some(a => a.id === result.assemblyId)
    ).toBe(true);
  });

  it("refuses another company's part, and writes nothing", async () => {
    await expect(
      build({
        parts: [
          { materialId: boxId, qty: 1 },
          { materialId: otherCompanyPartId, qty: 1 },
        ],
      })
    ).rejects.toThrow(/not in your catalog/);
    expect((await caller().bids.get({ id: bidId })).lines).toHaveLength(0);
    expect(
      (await caller().assemblies.list()).some(
        a => a.name === "Ceiling fan on box, probe"
      )
    ).toBe(false);
  });

  it("refuses a name the library already has, and writes nothing", async () => {
    await build();
    await expect(build()).rejects.toThrow(/already exists/);
    expect((await caller().bids.get({ id: bidId })).lines).toHaveLength(1);
  });

  it("keeps hours NOT SET as not set, never 0", async () => {
    await build({ baseLaborHours: null, laborRateId: null });
    const { lines } = await caller().bids.get({ id: bidId });
    expect(lines[0].snapshotLaborHours).toBe(null);
  });
});

/*
  From the plan viewer (stamp picker, Legend/Runs link list): the assembly is
  armed or linked there, and its count reaches the bid through the marks — so
  the build must add NO line, and must not leave an archived row nothing
  points at.
*/
describe.skipIf(!hasDb)("building from parts in the plan viewer", () => {
  let partId: number;
  let bidId: number;

  const clear = async () => {
    const db = await getDb();
    await db!.delete(bids).where(eq(bids.userId, USER));
    await db!.delete(assemblies).where(eq(assemblies.userId, USER));
    await db!.delete(materials).where(eq(materials.userId, USER));
  };

  beforeAll(async () => {
    const db = await getDb();
    const [existing] = await db!
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing)
      await db!.insert(users).values({
        id: USER,
        openId: `test-build-parts-${USER}`,
        name: "Build from parts test user",
      });
  });
  afterAll(clear);
  beforeEach(async () => {
    await clear();
    const part = await caller().materials.create({
      name: `Build-parts viewer probe ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 7,
      category: "Boxes",
    });
    partId = part!.id;
    bidId = (await caller().bids.create({ name: "Build-parts viewer bid" }))!
      .id;
  });

  const build = (over: Record<string, unknown> = {}) =>
    caller().bids.buildFromParts({
      bidId,
      name: "Pole bracket, viewer probe",
      category: "Devices",
      parts: [{ materialId: partId, qty: 1 }],
      baseLaborHours: null,
      laborRateId: null,
      saveToLibrary: true,
      addLine: false,
      ...over,
    });

  it("makes the library assembly and puts NO line on the bid", async () => {
    const result = await build();
    expect(result.line).toBe(null);
    expect((await caller().bids.get({ id: bidId })).lines).toHaveLength(0);
    const library = await caller().assemblies.list();
    expect(library.find(a => a.id === result.assemblyId)?.name).toBe(
      "Pole bracket, viewer probe"
    );
  });

  it("refuses 'do not save' with no line, and writes nothing", async () => {
    await expect(build({ saveToLibrary: false })).rejects.toThrow(
      /saved to your library/
    );
    const all = [
      ...(await caller().assemblies.list()),
      ...(await caller().assemblies.list({ status: "archived" })),
    ];
    expect(all.some(a => a.name === "Pole bracket, viewer probe")).toBe(false);
  });

  it("the bid screen's call still adds its line (addLine defaults on)", async () => {
    const result = await caller().bids.buildFromParts({
      bidId,
      name: "Pole bracket, bid probe",
      category: "Devices",
      parts: [{ materialId: partId, qty: 1 }],
      baseLaborHours: null,
      laborRateId: null,
      qty: 2,
      saveToLibrary: true,
    });
    expect(result.line).not.toBe(null);
    expect((await caller().bids.get({ id: bidId })).lines).toHaveLength(1);
  });
});
