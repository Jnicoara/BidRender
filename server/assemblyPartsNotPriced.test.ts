/**
 * An assembly line with a $0 part in it says so — "$25.00 + 1 part not priced"
 * — and the part counts toward the bid's not-priced totals (owner, 2026-09-26;
 * todo.md, migration 0087).
 *
 * ── The fault this pins ──────────────────────────────────────────────────────
 * An assembly of two lugs and 0.5 h read "$25.00" — the labor — with nothing
 * saying the lugs in it were unpriced, because a line is "Not priced" only
 * when its WHOLE cost is $0 (a labor-only assembly is legitimate). The total
 * was short by the lugs and read exactly like a finished one.
 *
 * ── Why the count is FROZEN ──────────────────────────────────────────────────
 * A line freezes one material figure, not the recipe it came from. Reading the
 * recipe now would say "priced" the moment the lug is priced in the library,
 * while the frozen total still lacks it. So the count is frozen beside the
 * cost (`snapshotUnpricedParts`), and only a line from before the column
 * (NULL) reads the recipe live — the best answer there is for it.
 *
 * Fixture ids are distinct from every other suite — vitest shares one database.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineLaborRates } from "./db";
import {
  assemblies,
  bidLineItems,
  bids,
  materials,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { countNotPriced } from "../shared/lineNotPriced";

const hasDb = Boolean(process.env.DATABASE_URL);
const USER = 9851;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-parts-not-priced-${USER}`, role: "user" },
  } as unknown as TrpcContext);

// ─── The rule, without a database ─────────────────────────────────────────────

describe("counting unpriced parts", () => {
  const line = (over: Record<string, unknown> = {}) => ({
    qty: 1,
    assemblyId: 1,
    takeoffRunTypeId: null,
    runMaterialRole: null,
    snapshotMaterialCost: "10",
    snapshotLaborHours: "0.5",
    snapshotLaborOnly: null,
    unpricedParts: 0,
    ...over,
  });

  it("counts the parts of a line that is otherwise priced", () => {
    expect(
      countNotPriced([{ line: line({ unpricedParts: 2 }), directCost: 35 }])
    ).toEqual({ lines: 0, parts: 2 });
  });

  it("does not count parts twice on a line that is already Not priced", () => {
    // The whole line is $0 — it is one line not priced, and its parts are in
    // that already. Counting both would say the bid is short by more than it is.
    expect(
      countNotPriced([
        {
          line: line({ snapshotMaterialCost: "0", unpricedParts: 2 }),
          directCost: 0,
        },
      ])
    ).toEqual({ lines: 1, parts: 0 });
  });

  it("counts nothing on a line with no quantity", () => {
    expect(
      countNotPriced([
        { line: line({ qty: 0, unpricedParts: 3 }), directCost: 0 },
      ])
    ).toEqual({ lines: 0, parts: 0 });
  });
});

// ─── Against a live database ──────────────────────────────────────────────────

describe.skipIf(!hasDb)("an assembly line with a $0 part, end to end", () => {
  let lugId: number;
  let assemblyId: number;
  let bidId: number;

  beforeAll(async () => {
    const db = await getDb();
    const [existing] = await db!
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing) {
      await db!.insert(users).values({
        id: USER,
        openId: `test-parts-not-priced-${USER}`,
        name: "Parts not priced test user",
      });
    }
    await seedBaselineLaborRates();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db!.delete(bids).where(eq(bids.userId, USER));
    await db!.delete(assemblies).where(eq(assemblies.userId, USER));
    await db!.delete(materials).where(eq(materials.userId, USER));

    // Fixture prices, never shipped ones.
    const lug = await caller().materials.create({
      name: `Parts probe lug ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 0,
      category: "Connectors & Terminations",
    });
    lugId = lug!.id;
    const strap = await caller().materials.create({
      name: `Parts probe strap ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 3,
      category: "Connectors & Terminations",
    });

    const rates = await caller().laborRates.list();
    const rate = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 50,
    });

    const assembly = await caller().assemblies.create({
      name: `Parts probe assembly ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.5,
      laborRateId: rate.laborRate!.id,
      materials: [
        { materialId: lugId, qty: 2 },
        { materialId: strap!.id, qty: 1 },
      ],
      modifierIds: [],
    });
    assemblyId = assembly!.id;

    const bid = await caller().bids.create({ name: "Parts probe bid" });
    bidId = bid!.id;
    await caller().bids.addAssembly({ bidId, assemblyId });
  });

  const theLine = async () => (await caller().bids.get({ id: bidId })).lines[0];

  it("freezes how many parts were $0 when the line was added", async () => {
    const line = await theLine();
    expect(line.snapshotUnpricedParts).toBe(1);
    expect(line.unpricedParts).toBe(1);
    // Priced — the strap and the labor are real money — so not "Not priced".
    expect(line.breakdown!.directCost).toBeGreaterThan(0);
  });

  it("keeps saying so after the part is priced in the library", async () => {
    // The frozen material cost still lacks the lug, so the line must still
    // admit it. Reading the recipe now would call it priced — a wrong number.
    await caller().materials.update({ id: lugId, costPerUnit: 12.5 });
    expect((await theLine()).unpricedParts).toBe(1);
  });

  it("reads the recipe live for a line from before the count was frozen", async () => {
    const db = await getDb();
    await db!
      .update(bidLineItems)
      .set({ snapshotUnpricedParts: null })
      .where(eq(bidLineItems.bidId, bidId));
    expect((await theLine()).unpricedParts).toBe(1);

    await caller().materials.update({ id: lugId, costPerUnit: 12.5 });
    expect((await theLine()).unpricedParts).toBe(0);
  });

  it("counts toward the bid's not-priced total", async () => {
    const page = await caller().bids.search({ text: "Parts probe bid" });
    const row = page.items.find(b => b.id === bidId)!;
    expect(row.notPriced).toEqual({ lines: 0, parts: 1 });
  });
});
