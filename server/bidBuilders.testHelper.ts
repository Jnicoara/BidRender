/**
 * Building a fixture bid through the real routers — shared by the golden
 * bids (server/goldenBids.test.ts) and the speed limits
 * (server/speedLimits.test.ts), so both build bids the same way.
 *
 * Every price is the caller's own (CLAUDE.md § Starter content). A shipped
 * material is used only where the run maths reads its trade size (1/2" EMT,
 * #12 THHN), and is priced first, which forks it. Fittings point at the
 * test's own materials for the same reason.
 *
 * Not a test file (no `.test.`), so vitest does not run it on its own.
 */
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

export const as = (user: number) =>
  appRouter.createCaller({
    user: { id: user, openId: `test-fixture-${user}`, role: "user" },
  } as unknown as TrpcContext);

export type Caller = ReturnType<typeof as>;

/** At 1/4" = 1'-0", one real foot is 18 page points. */
export const ft = (n: number) => n * 18;
export const at = (n: number, y: number) =>
  Array.from({ length: n }, (_, i) => ({ x: 3000 + i * 400, y }));

export async function freshUser(id: number) {
  const database = (await getDb())!;
  // Deleting the user cascades to everything it owns (testFixtureUsers.ts),
  // so each run starts from nothing even if the last one died part-way.
  await database.delete(users).where(eq(users.id, id));
  await database
    .insert(users)
    .values({ id, openId: `test-fixture-${id}`, name: `Fixture ${id}` });
}

export async function bidWithSheet(c: Caller, user: number, name: string) {
  const bid = (await c.bids.create({ name, trades: ["electrical"] }))!;
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId: bid.id,
    userId: user,
    filename: "E1.pdf",
    storageKey: `test/golden/${bid.id}/e1.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await c.bidPdfs.ensureSheets({ bidPdfId: pdf.insertId, pageCount: 1 });
  const [sheet] = await c.bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await c.bidPdfs.setSheetScale({ id: sheet.id, scaleText: `1/4" = 1'-0"` });
  return { bidId: bid.id, sheetId: sheet.id };
}

/**
 * Put a bid on the OLD stacked math — `pricingMethod` NULL, what every bid
 * made before methods existed holds (bid-methods-plan.md § 7). A new bid
 * takes its company's method (Cost + O&P by default), so a test that pins
 * the old math's numbers says so here rather than inheriting a method it
 * was never about. Line snapshots do not depend on the method, so nothing
 * else about the bid differs.
 */
export async function onOldMath(bidId: number) {
  await (await getDb())!
    .update(bids)
    .set({ pricingMethod: null })
    .where(eq(bids.id, bidId));
}

/** `bidWithSheet`, on the old math (`onOldMath`). */
export async function oldMathBidWithSheet(
  c: Caller,
  user: number,
  name: string
) {
  const made = await bidWithSheet(c, user, name);
  await onOldMath(made.bidId);
  return made;
}

/** A material of the test's own, at the test's own price. */
export async function own(
  c: Caller,
  name: string,
  costPerUnit: number,
  laborHours?: number,
  unitOfSale: "each" | "foot" | "box" = "each"
) {
  // Several bids share a part; the first one makes it.
  const existing = (await c.materials.list()).find(m => m.name === name);
  if (existing) return existing.id;
  const row = await c.materials.create({
    name,
    costPerUnit,
    laborHours,
    unitOfSale,
    category: null,
  });
  return row!.id;
}

/** A shipped material, priced here (which forks it). */
export async function shippedPriced(
  c: Caller,
  name: string,
  costPerUnit: number,
  laborHours: number
) {
  const row = (await c.materials.list()).find(m => m.name === name);
  if (!row) throw new Error(`No shipped material named ${name}`);
  const updated = await c.materials.update({
    id: row.id,
    costPerUnit,
    laborHours,
  });
  return updated?.material?.id ?? row.id;
}

export async function rate(c: Caller, name: string, hourlyCost: number) {
  const made = await c.laborRates.create({
    name,
    rateType: "hourly",
    hourlyCost,
  });
  return (
    (made as { id?: number; laborRate?: { id: number } }).laborRate?.id ??
    (made as { id: number }).id
  );
}

/**
 * Point the company's run-line labor at `rateId`, through the app since
 * 2026-10-16 (`bids.setPricingDefaults` `defaultLaborRateId`). Until then
 * nothing could set it and this wrote the column directly.
 */
export async function runLaborRate(c: Caller, _user: number, rateId: number) {
  await c.bids.setPricingDefaults({ defaultLaborRateId: rateId });
}

/** 1/2" EMT with 2 #12 + ground, fittings on the test's own materials. */
export async function emtType(c: Caller, label: string) {
  return c.takeoffRunTypes.create({
    label,
    pathType: "conduit",
    racewayMaterialId: await shippedPriced(c, '1/2" EMT', 0.85, 0.04),
    conductorMaterialId: await shippedPriced(
      c,
      "#12 THHN solid Copper",
      0.21,
      0.006
    ),
    conductorCount: 2,
    groundMaterialId: await shippedPriced(
      c,
      "#12 THHN green solid Copper",
      0.19,
      0.006
    ),
    groundCount: 1,
    couplingMaterialId: await own(c, "Golden 1/2 coupling", 0.42, 0.02),
    connectorMaterialId: await own(c, "Golden 1/2 connector", 0.37, 0.05),
    strapMaterialId: await own(c, "Golden 1/2 strap", 0.11, 0.03),
  });
}

/** The receptacle assembly most bids use: three parts and a rate. */
export async function duplexAssembly(c: Caller, rateId: number) {
  const box = await own(c, "Golden 1-gang box", 0.89, 0.1);
  const recep = await own(c, "Golden duplex receptacle", 1.64, 0.2);
  const plate = await own(c, "Golden duplex plate", 0.47);
  return (await c.assemblies.create({
    name: "Golden duplex receptacle, complete",
    category: "Devices",
    trade: "electrical",
    projectType: null,
    baseLaborHours: 0.15,
    laborRateId: rateId,
    materials: [
      { materialId: box, qty: 1 },
      { materialId: recep, qty: 1 },
      { materialId: plate, qty: 1 },
    ],
    modifierIds: [],
  }))!;
}

export async function countOf(
  c: Caller,
  bidId: number,
  sheetId: number,
  assemblyId: number,
  marks: { n: number; y: number; status?: "remove" | "relocate" }[]
) {
  const group = await c.takeoffGroups.forAssembly({ bidId, assemblyId });
  if (!("id" in group)) throw new Error("expected one count");
  const groupId = group.id as number;
  for (const m of marks)
    await c.takeoffStamps.drop({
      bidId,
      sheetId,
      groupId,
      at: at(m.n, m.y),
      ...(m.status ? { status: m.status } : {}),
    });
  return groupId;
}

export async function straightRun(
  c: Caller,
  bidId: number,
  sheetId: number,
  runTypeId: number,
  name: string,
  feet: number,
  y = 0
) {
  return c.takeoffRuns.save({
    bidId,
    sheetId,
    name,
    pathType: "conduit",
    runTypeId,
    status: "committed",
    points: [
      { x: 0, y: ft(y) },
      { x: ft(feet), y: ft(y) },
    ],
  });
}
