/**
 * Reading price history (references/price-history-plan.md § 7, tests 5, 6, 9
 * and 10). Fixture ids distinct from every other suite.
 *
 * Test 10 (BidRidge example-price changes shown only while the shop used the
 * shipped price) is tested on `shippedOnPage`, the pure rule, rather than by
 * writing fake rows into `starter_changes`: the seed suites read that log in
 * parallel, and a planted change on a shipped row would move their answers.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineMaterials } from "./db";
import { materialPriceHistory, materials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { shippedOnPage } from "../shared/priceHistory";

const USER = 6482;
const OTHER = 6483;
const hasDb = Boolean(process.env.DATABASE_URL);
const SHIPPED = "Wire nut, 22-8 AWG (tan/red)";

const caller = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-phread-${id}`, role: "user" },
  } as unknown as TrpcContext);

async function clean() {
  const db = (await getDb())!;
  for (const id of [USER, OTHER]) {
    await db
      .delete(materialPriceHistory)
      .where(eq(materialPriceHistory.userId, id));
    await db.delete(materials).where(eq(materials.userId, id));
  }
}

let shippedId = 0;
let forkId = 0;

beforeAll(async () => {
  if (!hasDb) return;
  const db = (await getDb())!;
  for (const id of [USER, OTHER])
    await db
      .insert(users)
      .values({
        id,
        openId: `test-phread-${id}`,
        name: `Price reader ${id}`,
        email: `phread-${id}@example.test`,
        loginMethod: "password",
      })
      .onDuplicateKeyUpdate({ set: { name: `Price reader ${id}` } });
  await seedBaselineMaterials();
  await clean();
  const [row] = await db
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.name, SHIPPED))
    .limit(1);
  shippedId = row.id;
  const out = await caller(USER).materials.update({
    id: shippedId,
    costPerUnit: 0.1,
  });
  forkId = out.material!.id;
  // 119 more changes, written straight in: several share one timestamp, so
  // the cursor's tie-break on id is what keeps paging exact.
  const base = Date.now() - 200 * 60_000;
  const rows = Array.from({ length: 119 }, (_, i) => ({
    userId: USER,
    materialKey: shippedId,
    materialId: forkId,
    unitCost: (0.2 + i / 1000).toFixed(4),
    previousUnitCost: null,
    unitOfSale: "each" as const,
    source: "typed" as const,
    isExamplePrice: false,
    changedByUserId: USER,
    createdAt: new Date(base + Math.floor(i / 3) * 60_000),
  }));
  await db.insert(materialPriceHistory).values(rows);
});

afterAll(async () => {
  if (hasDb) await clean();
});

describe.skipIf(!hasDb)("materials.priceHistory", () => {
  it("pages 120 rows 50 at a time with no duplicate and no gap", async () => {
    const seen: number[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<
        ReturnType<ReturnType<typeof caller>["materials"]["priceHistory"]>
      > = await caller(USER).materials.priceHistory({ id: forkId, cursor });
      for (const e of page.entries) if (e.kind === "company") seen.push(e.id);
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
  });

  it("is the same history opened from the shipped row or the company's copy", async () => {
    const fromFork = await caller(USER).materials.priceHistory({ id: forkId });
    const fromShipped = await caller(USER).materials.priceHistory({
      id: shippedId,
    });
    expect(fromShipped.entries.map(e => e.id)).toEqual(
      fromFork.entries.map(e => e.id)
    );
  });

  it("names who changed it", async () => {
    const page = await caller(USER).materials.priceHistory({ id: forkId });
    const first = page.entries.find(e => e.kind === "company");
    expect(first && first.kind === "company" && first.who).toBe(
      `Price reader ${USER}`
    );
  });

  it("shows another company none of it", async () => {
    const page = await caller(OTHER).materials.priceHistory({ id: shippedId });
    expect(page.entries.filter(e => e.kind === "company")).toEqual([]);
  });
});

describe("shippedOnPage (owner Q2)", () => {
  const at = (iso: string) => ({ at: iso });
  const shipped = [
    at("2026-10-10T00:00:00Z"),
    at("2026-09-01T00:00:00Z"),
    at("2026-08-01T00:00:00Z"),
  ];

  it("shows BidRidge's changes only from before the shop had its own copy", () => {
    expect(
      shippedOnPage(shipped, {
        windowTop: new Date("2026-12-01T00:00:00Z"),
        windowBottom: null,
        ownCopySince: new Date("2026-09-15T00:00:00Z"),
      }).map(s => s.at)
    ).toEqual(["2026-09-01T00:00:00Z", "2026-08-01T00:00:00Z"]);
  });

  it("puts each change on the page whose window holds it", () => {
    expect(
      shippedOnPage(shipped, {
        windowTop: new Date("2026-12-01T00:00:00Z"),
        windowBottom: new Date("2026-08-15T00:00:00Z"),
        ownCopySince: null,
      }).map(s => s.at)
    ).toEqual(["2026-10-10T00:00:00Z", "2026-09-01T00:00:00Z"]);
  });
});

describe("never read by pricing (plan § 3.6, test 6)", () => {
  // A source scan: no module that prices a bid may import the history.
  const PRICING =
    /bidTotals|bidPricing|lineNotPriced|materialMarkup|takeoffBridge|takeoffQuantities/;
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap(n => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(n) ? [p] : [];
    });

  it("no pricing module mentions the history table or its reader", () => {
    const root = join(__dirname, "..");
    const offenders = [
      ...files(join(root, "shared")),
      ...files(join(root, "server")),
    ]
      .filter(p => PRICING.test(p) && !/\.test\.ts$/.test(p))
      .filter(p =>
        /materialPriceHistory|material_price_history|priceHistoryRead/.test(
          readFileSync(p, "utf8")
        )
      );
    expect(offenders).toEqual([]);
  });
});
