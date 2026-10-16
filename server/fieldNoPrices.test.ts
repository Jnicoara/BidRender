/**
 * A FIELD member gets no price through ANY route
 * (references/field-and-coowner-plan.md § 1; owner, 2026-10-16: "NO prices
 * anywhere incl. print/CSV/API … Test that a Field user can't get a price
 * through any route").
 *
 * Two halves:
 *
 *  1. EVERY procedure in `appRouter` is called as a Field member. It must
 *     refuse (FORBIDDEN), unless it is on `FIELD_REACHABLE` below. So a route
 *     added later is checked the day it exists: it either refuses a Field
 *     member, or somebody adds it here — with an answer that is checked.
 *  2. Every reachable READ is called on a bid priced with this test's own odd
 *     prices, and its answer must contain none of those figures and no
 *     money-named field holding a number.
 *
 * Field is not storable yet (FR-M1 is Track A's), so the member is stored as
 * a viewer and `capabilitiesFor` answers for "viewer" with the FIELD list —
 * the same list `resolveScope` will read once the column holds "field".
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

vi.mock("../shared/permissions", async importOriginal => {
  const real = await importOriginal<typeof import("../shared/permissions")>();
  return {
    ...real,
    capabilitiesFor: (role: Parameters<typeof real.capabilitiesFor>[0]) =>
      role === "viewer"
        ? real.ROLE_CAPABILITIES.field
        : real.capabilitiesFor(role),
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { companies, companyMembers } from "../drizzle/schema";
import {
  as,
  bidWithSheet,
  countOf,
  duplexAssembly,
  emtType,
  freshUser,
  rate,
  runLaborRate,
  straightRun,
} from "./bidBuilders.testHelper";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const OWNER = 9959;
const FIELD = 9960;
dropFixtureUsersAfterAll([OWNER, FIELD]);

const owner = as(OWNER);
/*
  The Field member's caller carries an empty request, as a real browser
  session would: the starter editor's routes read their own cookie off it
  and answer UNAUTHORIZED, rather than failing on a missing request.
*/
const field = appRouter.createCaller({
  user: { id: FIELD, openId: `test-fixture-${FIELD}`, role: "user" },
  req: { headers: {}, cookies: {} },
  res: { cookie: () => undefined, clearCookie: () => undefined },
} as unknown as TrpcContext);
let bidId = 0;
let sheetId = 0;
let bidPdfId = 0;

/**
 * Routes a Field member may reach, and how to call each for the money scan.
 * `null` = reachable, carries no bid data at all (who am I, sign out…), so
 * there is nothing to scan; the reason is beside it.
 */
const FIELD_REACHABLE: Record<string, (() => unknown) | null> = {
  // ── Signing in and out, before any company: no bid data exists here. ──
  "system.health": null,
  "auth.me": () => ({}),
  "auth.signupMode": null,
  "auth.inviteInfo": null,
  "auth.signup": null,
  "auth.login": null,
  "auth.logout": null,
  "auth.changePassword": null,
  "auth.requestPasswordReset": null,
  "auth.checkResetToken": null,
  "auth.resetPassword": null,
  "earlyAccess.join": null,
  // The starter editor's own two-step sign-in; any company session is refused
  // by everything behind it (starterEditorProcedure).
  "starterAuth.signIn": null,
  "starterAuth.verifyCode": null,
  "starterAuth.signOut": null,
  // ── Who am I, in which company — every member reads these. ──
  "company.me": () => ({}),
  "company.members": () => ({}),
  "company.seats": () => ({}),
  "company.memberships": () => ({}),
  "company.roles": () => ({}),
  "company.acceptInvite": null,
  "company.switchCompany": null,
  "onboarding.state": () => ({}),
  // The first-run flags are the member's own; they hold no number.
  "onboarding.completeFirstRun": null,
  "onboarding.dismissChecklist": null,
  "onboarding.restoreChecklist": null,
  // Answers with a screen to go to, from a closed list
  // (shared/navigationTargets.ts) — never data.
  "navigation.ask": null,

  // ── The job's PLANS, opened to `plans.view` on purpose. ──
  "bidPdfs.list": () => ({ bidId }),
  "bidPdfs.sheets": () => ({ bidPdfId }),
  "bidPdfs.sheetIdentities": () => ({ bidPdfId }),
  "bidPdfs.sheetJumpList": () => ({ bidId }),
  "bidPdfs.searchText": () => ({ bidId, q: "panel" }),
  "bidPdfs.schedulePages": () => ({ bidPdfId }),
  "takeoffStamps.listForSheet": () => ({ sheetId }),
  "takeoffGroups.list": () => ({ bidId }),
  "takeoffRuns.measurability": () => ({ sheetId }),
  "takeoffRuns.listForSheet": () => ({ sheetId }),
  "takeoffRuns.totals": () => ({ bidId }),
  "takeoffRuns.drops": () => ({ bidId }),
  "takeoffRuns.typeColors": () => ({ bidId }),
  "takeoffHeights.forBid": () => ({ bidId }),
  "homeruns.forBid": () => ({ bidId }),
  "homeruns.heightAreas": () => ({ bidId }),
  "materialsList.get": () => ({ bidId }),
  "bids.fieldList": () => undefined,
  "bids.basics": () => ({ id: bidId }),
};

beforeAll(async () => {
  await freshUser(OWNER);
  await freshUser(FIELD);
  // The owner's company comes into being on its first request.
  await owner.company.me();
  const database = (await getDb())!;
  const [company] = await database
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.ownerUserId, OWNER));
  await database.insert(companyMembers).values({
    companyId: company.id,
    userId: FIELD,
    role: "viewer",
    status: "active",
  });

  // A bid priced at odd figures nothing else would print.
  const made = await bidWithSheet(owner, OWNER, "Field check");
  bidId = made.bidId;
  sheetId = made.sheetId;
  bidPdfId = (await owner.bidPdfs.list({ bidId }))[0].id;
  const rateId = await rate(owner, "Field check journeyman", 61.17);
  await runLaborRate(owner, OWNER, rateId);
  const assembly = await duplexAssembly(owner, rateId);
  const g = await countOf(owner, bidId, sheetId, assembly.id, [
    { n: 3, y: 900 },
  ]);
  await owner.takeoffGroups.sendToBid({ id: g });
  const type = await emtType(owner, "Field check EMT");
  await straightRun(owner, bidId, sheetId, type.id, "Field run", 40);
  await owner.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
});

/** Every procedure path in the app, from the router itself. */
function allPaths(): { path: string; type: string }[] {
  const procedures = (
    appRouter as unknown as {
      _def: { procedures: Record<string, { _def: { type: string } }> };
    }
  )._def.procedures;
  return Object.entries(procedures).map(([path, p]) => ({
    path,
    type: p._def.type,
  }));
}

function call(path: string, input: unknown): Promise<unknown> {
  let fn: unknown = field;
  for (const part of path.split("."))
    fn = (fn as Record<string, unknown>)[part];
  return (fn as (i: unknown) => Promise<unknown>)(input);
}

describe("a Field member is refused by every route not opened to plans", () => {
  it("refuses everything except the routes on FIELD_REACHABLE", async () => {
    const reachable: string[] = [];
    for (const { path } of allPaths()) {
      // A value no input schema accepts: a route that passes the role check
      // stops at validation instead of running.
      const outcome = await call(path, Symbol("not an input")).then(
        () => "ran",
        (e: unknown) => (e instanceof TRPCError ? e.code : `threw ${String(e)}`)
      );
      if (outcome !== "FORBIDDEN" && outcome !== "UNAUTHORIZED")
        reachable.push(`${path} → ${outcome}`);
    }
    const unexpected = reachable.filter(
      r => !(r.split(" → ")[0] in FIELD_REACHABLE)
    );
    expect(unexpected).toEqual([]);
  });
});

/** Any key that names money. The materials-list test's list, unchanged. */
const MONEY_KEY =
  /cost|price|pricing|rate|markup|overhead|profit|margin|tax|total|amount|subtotal|charge|dollar|usd/i;

/** Money-named keys that hold something else, each with its reason. */
const NOT_MONEY: Record<string, string> = {
  notPricedDrops: "how MANY drops lack a drop material — a count",
  countedWithNoPrice: "how MANY counts have no price yet — a count",
  totalCount: "grounds in a run: conductors, not dollars",
  separateCount: "grounds pulled separately: conductors, not dollars",
};

function moneyFields(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value))
    return value.flatMap((v, i) => moneyFields(v, `${path}[${i}]`));
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const numeric =
      typeof child === "number" ||
      (typeof child === "string" && /^-?\d+(\.\d+)?$/.test(child));
    if (MONEY_KEY.test(key) && numeric && !(key in NOT_MONEY))
      found.push(`${path}.${key}=${String(child)}`);
    found.push(...moneyFields(child, `${path}.${key}`));
  }
  return found;
}

/** A figure as a standalone number in the text (materialsList.test.ts). */
function asAFigure(n: number): RegExp {
  const fixed = n.toFixed(2).replace(".", "\.");
  return new RegExp(`(?<![\d.])${fixed}0*(?!\d)`);
}

describe("every route a Field member reaches answers without a price", () => {
  it("has no money-named number and none of this bid's figures", async () => {
    // What this bid costs and charges, read as its owner sees it.
    const priced = await owner.bids.get({ id: bidId });
    const figures = new Set<number>([61.17]);
    for (const p of priced.lines) {
      for (const v of [
        p.snapshotMaterialCost,
        p.snapshotLaborRate,
        p.breakdown?.directCost,
      ])
        if (v !== null && v !== undefined && distinctive(Number(v)))
          figures.add(Number(v));
    }
    for (const v of [
      priced.totals.finalPrice,
      priced.totals.directCost,
      priced.totals.materialCost,
      priced.totals.laborCost,
      priced.totals.totalDue,
    ])
      if (distinctive(v)) figures.add(v);
    expect(figures.size).toBeGreaterThan(4);

    const problems: string[] = [];
    let scanned = 0;
    for (const [path, input] of Object.entries(FIELD_REACHABLE)) {
      if (!input) continue;
      const answer = await call(path, input());
      scanned += 1;
      for (const f of moneyFields(answer)) problems.push(`${path}: ${f}`);
      const text = JSON.stringify(answer);
      for (const n of Array.from(figures))
        if (asAFigure(n).test(text)) problems.push(`${path}: contains ${n}`);
    }
    expect(problems).toEqual([]);
    expect(scanned).toBeGreaterThan(5);
  });
});

/**
 * A figure worth searching the text for: not a whole number. "3" is the
 * marks on the sheet as often as it is $3.00 of parts, and a JSON number
 * prints $3.00 as 3; the money-named-field check covers those.
 */
function distinctive(n: number): boolean {
  return n >= 1 && Math.round(n * 100) % 100 !== 0;
}
