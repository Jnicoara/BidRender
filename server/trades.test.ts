/**
 * The trade axis: does multi-trade support actually hold, and did adding it
 * leave the electrical-only app exactly as it was?
 *
 * ── The two claims being tested ──────────────────────────────────────────────
 * 1. Every record carries a trade, and the migration gave the existing ones the
 *    right one. Two different right ones, in fact: the trade-gated library
 *    (materials, assemblies, kits) is `electrical`, while the tables
 *    ASSEMBLIES_PLAN.md § MULTI-TRADE STRUCTURE calls shared across all trades
 *    regardless of unlock (labor rates, pricing defaults, branding, proposal
 *    settings) are `all`. Stamping the second group `electrical` would read as
 *    correct today and hide a contractor's rates and licence details the day a
 *    second trade unlocked — so the distinction is asserted, not assumed.
 *
 * 2. Nothing changed for anyone. Only electrical exists right now, so every
 *    creation path that never mentions a trade must still produce exactly what
 *    it produced before, and every settings read must still find the one row
 *    the user already had. That is most of this file, and it is the half that
 *    would catch a regression in a screen nobody touched.
 *
 * The registry itself (shared/trades.ts) is pure, so its behaviour is tested
 * without a database and runs even when DATABASE_URL is unset.
 *
 * Fixture ids are distinct from every other suite — shared ids delete each
 * other's rows.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
} from "./db";
import * as db from "./db";
import {
  TRADE_DEFAULT_SHARED,
  TRADE_DEFAULT_TRADE_GATED,
  assemblies,
  companyBranding,
  kits,
  laborRates,
  materials,
  pricingDefaults,
  proposalSettings,
  users,
} from "../drizzle/schema";
import {
  DEFAULT_TRADE,
  TRADE_ALL,
  TRADES,
  isKnownTrade,
  labelForTrade,
  normalizeTradeId,
  resolveForTrade,
  shippedTrades,
  tradeApplies,
} from "../shared/trades";
import type { TrpcContext } from "./_core/context";

const USER = 8801;
const OTHER_USER = 8802;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-trades-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

const unique = (label: string) =>
  `${label} ${Date.now()}${Math.round(Math.random() * 1e6)}`;

// ══════════════════════════════════════════════════════════════════════════════
// The registry — pure, no database
// ══════════════════════════════════════════════════════════════════════════════

describe("trade registry", () => {
  it("agrees with the literals the schema had to restate", () => {
    // drizzle/schema.ts cannot import from shared/ — it is parsed by
    // drizzle-kit too — so it restates these. This is the assertion that stops
    // the copy and the original drifting apart, exactly as
    // planCopilot.test.ts does for CONFIDENCE_TIER_VALUES.
    expect(TRADE_DEFAULT_TRADE_GATED).toBe(DEFAULT_TRADE);
    expect(TRADE_DEFAULT_SHARED).toBe(TRADE_ALL);
  });

  it("names electrical as the default and ships it", () => {
    expect(DEFAULT_TRADE).toBe("electrical");
    expect(shippedTrades().map(t => t.id)).toContain("electrical");
  });

  it("knows low-voltage, which the shipped catalog already uses", () => {
    // server/seed/materials/lowVoltage.ts tags its rows with this today, so it
    // is a live second value on the axis rather than a hypothetical.
    expect(isKnownTrade("low-voltage")).toBe(true);
  });

  it("does not reject an unrecognised trade", () => {
    // The columns are varchar precisely so a new trade is content, not a
    // migration. A registry that refused unknown ids would put the migration
    // back — so normalising must preserve, never coerce to the default.
    expect(normalizeTradeId("solar-thermal")).toBe("solar-thermal");
    expect(labelForTrade("solar-thermal")).toBe("Solar Thermal");
  });

  it("normalises case and whitespace but keeps blank meaning default", () => {
    expect(normalizeTradeId("  Electrical ")).toBe("electrical");
    expect(normalizeTradeId("")).toBe(DEFAULT_TRADE);
    expect(normalizeTradeId(null)).toBe(DEFAULT_TRADE);
    expect(normalizeTradeId(undefined)).toBe(DEFAULT_TRADE);
  });

  it("matches the `all` sentinel against every trade, both directions", () => {
    expect(tradeApplies(TRADE_ALL, "plumbing")).toBe(true);
    expect(tradeApplies("electrical", TRADE_ALL)).toBe(true);
    expect(tradeApplies("electrical", "electrical")).toBe(true);
    expect(tradeApplies("electrical", "plumbing")).toBe(false);
  });

  it("resolves a trade's own row ahead of the shared one", () => {
    const rows = [
      { trade: TRADE_ALL, id: "shared" },
      { trade: "plumbing", id: "plumbing-specific" },
    ];
    expect(resolveForTrade(rows, "plumbing")?.id).toBe("plumbing-specific");
    // No electrical row, so the company-wide one governs — the fallback that
    // makes a single-trade contractor's single row keep working.
    expect(resolveForTrade(rows, "electrical")?.id).toBe("shared");
    expect(resolveForTrade(rows, TRADE_ALL)?.id).toBe("shared");
  });

  it("returns nothing rather than inventing a row", () => {
    // getCompanyBranding's callers distinguish "no settings yet" from
    // "settings still blank", and needsBranding depends on that.
    expect(resolveForTrade([{ trade: "plumbing" }], "electrical")).toBe(
      undefined
    );
  });

  it("gives every registered trade a distinct id and a label", () => {
    const ids = TRADES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const trade of TRADES) {
      expect(trade.id).toBe(trade.id.toLowerCase().trim());
      expect(trade.label.length).toBeGreaterThan(0);
    }
    // The sentinel is reserved and must never be a real trade.
    expect(ids).not.toContain(TRADE_ALL);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// The columns — against the real database
// ══════════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  if (!hasDb) return;
  const dbc = await getDb();
  if (!dbc) return;

  for (const id of [USER, OTHER_USER]) {
    const [existing] = await dbc
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await dbc.insert(users).values({
        id,
        openId: `test-trades-${id}`,
        name: `Trade test user ${id}`,
      });
    }
  }

  await seedBaselineMaterials();
  await seedBaselineLaborRates();
  await seedBaselineModifiers();
  await seedBaselineAssemblies();
});

beforeEach(async () => {
  if (!hasDb) return;
  const dbc = await getDb();
  if (!dbc) return;
  const ours = [USER, OTHER_USER];
  await dbc.delete(kits).where(inArray(kits.userId, ours));
  await dbc.delete(assemblies).where(inArray(assemblies.userId, ours));
  await dbc.delete(materials).where(inArray(materials.userId, ours));
  await dbc.delete(laborRates).where(inArray(laborRates.userId, ours));
  await dbc
    .delete(pricingDefaults)
    .where(inArray(pricingDefaults.userId, ours));
  await dbc
    .delete(companyBranding)
    .where(inArray(companyBranding.userId, ours));
  await dbc
    .delete(proposalSettings)
    .where(inArray(proposalSettings.userId, ours));
});

describe.skipIf(!hasDb)("the migration's backfill", () => {
  it("left every shipped material and assembly on a real trade", async () => {
    const dbc = await getDb();
    const materialRows = await dbc!
      .select({ trade: materials.trade })
      .from(materials);
    const assemblyRows = await dbc!
      .select({ trade: assemblies.trade })
      .from(assemblies);

    expect(materialRows.length).toBeGreaterThan(0);
    expect(assemblyRows.length).toBeGreaterThan(0);
    // Nothing blank, nothing null — the column is NOT NULL and the backfill in
    // 0035 exists to guarantee it even on a database that got here another way.
    for (const row of [...materialRows, ...assemblyRows]) {
      expect(row.trade?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("filed the shipped catalog under electrical, bar low-voltage", async () => {
    const dbc = await getDb();
    const rows = await dbc!.select({ trade: materials.trade }).from(materials);
    const seen = new Set(rows.map(r => r.trade));
    expect(seen).toContain("electrical");
    // The only other value the seed uses. Anything else appearing here means a
    // trade got introduced without going through the registry.
    for (const trade of Array.from(seen)) {
      expect(["electrical", "low-voltage"]).toContain(trade);
    }
  });

  it("put every shipped labor rate on `all`, not on electrical", async () => {
    // The claim from ASSEMBLIES_PLAN.md, asserted: the labor rate structure is
    // shared across trades regardless of unlock. A starter role tagged
    // `electrical` would vanish from a plumbing estimator's list.
    const dbc = await getDb();
    const starters = await dbc!
      .select({ trade: laborRates.trade })
      .from(laborRates);
    expect(starters.length).toBeGreaterThan(0);
    for (const row of starters) expect(row.trade).toBe(TRADE_ALL);
  });
});

describe.skipIf(!hasDb)(
  "defaults on create, with nothing said about trade",
  () => {
    it("files a new material under electrical", async () => {
      const created = await caller().materials.create({
        name: unique("Trade probe material"),
        unitOfSale: "each",
        costPerUnit: 1.25,
        category: "Receptacles",
      });
      expect(created!.trade).toBe("electrical");
    });

    it("files a new assembly under electrical", async () => {
      const created = await caller().assemblies.create({
        name: unique("Trade probe assembly"),
        category: "Devices",
        baseLaborHours: 0.5,
      });
      expect(created!.trade).toBe("electrical");
    });

    it("files a new kit under electrical", async () => {
      const created = await caller().kits.create({
        name: unique("Trade probe kit"),
        description: null,
        items: [],
      });
      expect(created!.trade).toBe("electrical");
    });

    it("leaves a new labor rate on `all` — shared, not electrical", async () => {
      const created = await caller().laborRates.create({
        name: unique("Trade probe role"),
        rateType: "hourly",
        hourlyCost: 42,
      });
      expect(created!.trade).toBe(TRADE_ALL);
    });
  }
);

describe.skipIf(!hasDb)("tagging a record with a trade", () => {
  it("stores a kit against the trade it was given", async () => {
    const created = await caller().kits.create({
      name: unique("Plumbing probe kit"),
      description: null,
      trade: "plumbing",
      items: [],
    });
    expect(created!.trade).toBe("plumbing");

    // And it survives a round trip rather than being normalised away.
    const fetched = await caller().kits.get({ id: created!.id });
    expect(fetched.trade).toBe("plumbing");
  });

  it("stores an assembly against a trade with no migration involved", async () => {
    // The whole point of the varchar: a second trade is tagged content.
    const created = await caller().assemblies.create({
      name: unique("Plumbing probe assembly"),
      category: "Devices",
      baseLaborHours: 1,
      trade: "plumbing",
    });
    expect(created!.trade).toBe("plumbing");
  });

  it("moves a labor rate onto one trade when asked", async () => {
    const created = await caller().laborRates.create({
      name: unique("Plumbing journeyman"),
      rateType: "hourly",
      hourlyCost: 55,
      trade: "plumbing",
    });
    expect(created!.trade).toBe("plumbing");

    const updated = await caller().laborRates.update({
      id: created!.id,
      trade: TRADE_ALL,
    });
    expect(updated.laborRate!.trade).toBe(TRADE_ALL);
  });
});

describe.skipIf(!hasDb)("existing screens are untouched", () => {
  it("still lists every starter labor rate for an electrical user", async () => {
    // The regression this guards: filtering the library by `electrical` would
    // drop every shared (`all`) role and empty the Labor Rates screen.
    const rows = await caller().laborRates.list();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(r => r.name === "Journeyman")).toBe(true);
  });

  it("still lists starter assemblies and kits", async () => {
    const assemblyRows = await caller().assemblies.list();
    expect(assemblyRows.length).toBeGreaterThan(0);

    const kitRows = await caller().kits.list();
    expect(Array.isArray(kitRows)).toBe(true);
  });

  it("returns the one settings row a user already had", async () => {
    // Reads pass no trade, so they resolve to `all` — the single row that
    // existed before the column. A `limit(1)` on userId alone would pass this
    // today and break silently the moment a second trade row appeared, which
    // is why the resolution is by trade rather than by luck.
    const defaults = await db.getPricingDefaults(USER);
    expect(defaults).toBeDefined();
    expect(defaults!.trade).toBe(TRADE_ALL);

    const branding = await db.getCompanyBranding(USER);
    expect(branding!.trade).toBe(TRADE_ALL);

    const proposal = await db.getProposalSettings(USER);
    expect(proposal!.trade).toBe(TRADE_ALL);
  });

  it("keeps company pricing defaults working through the router", async () => {
    await caller().bids.setPricingDefaults({
      profitMethod: "markup",
      profitValue: 0.2,
    });
    const saved = await caller().bids.pricingDefaults();
    expect(Number(saved!.profitValue)).toBeCloseTo(0.2, 4);
    expect(saved!.trade).toBe(TRADE_ALL);
  });
});

describe.skipIf(!hasDb)("per-trade settings rows", () => {
  it("falls back to the company-wide row for a trade with none of its own", async () => {
    await db.updateCompanyBranding(USER, { companyName: "Shared Electric Co" });

    // Asking as a plumbing user finds the `all` row, because that is what
    // "shared across all trades regardless of unlock" has to mean.
    const asPlumbing = await db.getCompanyBranding(USER, "plumbing");
    expect(asPlumbing!.companyName).toBe("Shared Electric Co");
    expect(asPlumbing!.trade).toBe(TRADE_ALL);
  });

  it("writes a per-trade row without disturbing the shared one", async () => {
    await db.updateCompanyBranding(USER, {
      companyName: "Shared Electric Co",
      licenseNumber: "EL-1234",
    });
    // The real case: a second licence from a second board.
    await db.updateCompanyBranding(
      USER,
      { companyName: "Shared Plumbing Co", licenseNumber: "PL-9876" },
      "plumbing"
    );

    const shared = await db.getCompanyBranding(USER);
    const plumbing = await db.getCompanyBranding(USER, "plumbing");

    expect(shared!.licenseNumber).toBe("EL-1234");
    expect(plumbing!.licenseNumber).toBe("PL-9876");
    // Two distinct rows, and editing plumbing did not move the shared one —
    // the failure that would print the wrong licence on a proposal.
    expect(shared!.id).not.toBe(plumbing!.id);
    expect(shared!.trade).toBe(TRADE_ALL);
    expect(plumbing!.trade).toBe("plumbing");
  });

  it("allows only one row per user per trade", async () => {
    // unique(userId, trade) replaced unique(userId). Repeated writes must
    // update, never accumulate a second contradictory company-wide row.
    await db.updateCompanyBranding(USER, { companyName: "First" });
    await db.updateCompanyBranding(USER, { companyName: "Second" });
    await db.updateCompanyBranding(USER, { companyName: "Third" });

    const dbc = await getDb();
    const rows = await dbc!
      .select()
      .from(companyBranding)
      .where(eq(companyBranding.userId, USER));
    expect(rows).toHaveLength(1);
    expect(rows[0].companyName).toBe("Third");
  });

  it("keeps one user's per-trade settings out of another's", async () => {
    await db.updateCompanyBranding(USER, { companyName: "Mine" }, "plumbing");
    const theirs = await db.getCompanyBranding(OTHER_USER, "plumbing");
    // Falls back to their own blank `all` row, never to another account's.
    expect(theirs!.companyName).toBe("");
    expect(theirs!.userId).toBe(OTHER_USER);
  });
});
