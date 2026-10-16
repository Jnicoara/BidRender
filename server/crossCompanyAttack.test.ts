/**
 * AN ATTACKER WITH A NORMAL LOGIN, AGAINST EVERY ROUTE THE SERVER HAS.
 *
 * Written 2026-10-14, the day an outside person first signed up on live.
 * The route-by-route isolation tests elsewhere prove the routes somebody
 * thought to test. This one does not depend on anybody thinking: it walks
 * `appRouter`'s own procedure list (403 on the day it was written), builds a
 * valid input for each from the procedure's own zod schema with the VICTIM
 * company's ids planted in every id field (`server/attack/inputs.ts`), calls
 * it, and judges the result two ways:
 *
 *   • READ — the reply must not carry the victim's marker text, and must not
 *     carry a victim row (`userId` = the victim) the attacker did not name.
 *   • WRITE — every row of every table is read before and after
 *     (`server/attack/snapshot.ts`); any row the attacker had no right to
 *     move, add under, or point at is a finding.
 *
 * Three attackers:
 *   1. a STRANGER — another company's owner, internal tier (sees every
 *      unreleased route too), every route;
 *   2. a VIEWER of the victim's own company — every mutation must leave the
 *      company's data alone;
 *   3. SIGNED OUT — every route that is not deliberately public must refuse.
 *
 * Each finding has to be fixed in the app or listed in an allowlist below
 * with the reason it is not a hole. The lists are the interesting part.
 *
 * ── The victim's data ────────────────────────────────────────────────────────
 * Built two ways: a coherent bid by hand (plan set, sheets, counts, a run, a
 * line), then EVERY create-shaped mutation run as the victim with the same
 * generator, twice, so the second pass can use what the first one made. The
 * harvest that follows reads what the victim really owns from the database.
 *
 * Fixture ids 9473 (victim owner), 9474 (victim viewer), 9475 (victim
 * estimator), 9476 (stranger) are this file's alone.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, or } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { resolveScope } from "./_core/companyScope";
import {
  bidPdfs,
  bidPdfSheets,
  companies,
  companyMembers,
  users,
  type User,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { inputsFor, type Pool } from "./attack/inputs";
import {
  Db,
  idsOwnedBy,
  judge,
  plantRow,
  touched,
  type Finding,
} from "./attack/snapshot";

const VICTIM = 9473;
const VIEWER = 9474;
const ESTIMATOR = 9475;
const STRANGER = 9476;
const ALL = [VICTIM, VIEWER, ESTIMATOR, STRANGER];

const MARKER = "VICTIMSECRET";
/** The victim's planted number (prices, quantities, points). See inputs.ts. */
const NUMBER = 87654.321;
const NUMBER_TEXT = "87654.32";
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

type Proc = {
  _def: { type: "query" | "mutation"; inputs: unknown[] };
};
const PROCS = (
  appRouter as unknown as { _def: { procedures: Record<string, Proc> } }
)._def.procedures;

/**
 * Routes that are public on purpose. Signed out, these may answer; every other
 * route must refuse. Each with the reason it has no session.
 */
const PUBLIC: Record<string, string> = {
  "system.health": "Uptime check.",
  "auth.me": "Answers null when signed out — that IS the answer.",
  "auth.logout": "Clears a cookie; harmless without one.",
  "auth.signup":
    "Creating an account cannot need one. Rate limited (authRouter).",
  "auth.login": "Signing in cannot need a session. Wrong attempts limited.",
  "auth.signupMode":
    "Whether sign-up is invite-only, for the sign-in page; says nothing else (Track A, 2026-10-14).",
  "auth.inviteInfo":
    "What an invite code is, for the page its link opens; whoever holds the code already holds the way in. Limited per sender (Track A).",
  "auth.requestPasswordReset":
    "A person who forgot a password has no session. Limited per sender and per address.",
  "auth.checkResetToken":
    "Asks whether an emailed reset link still works; the token is the secret.",
  "auth.resetPassword":
    "The second half of a reset; guarded by the emailed token. Limited.",
  "earlyAccess.join": "The landing page's waitlist form. Limited per sender.",
  "starterAuth.signIn":
    "The starter editor's own sign-in. Wrong attempts limited.",
  "starterAuth.verifyCode": "Its second step.",
  "starterAuth.signOut": "Clears its cookie.",
};

/**
 * Database changes a caller may make that the judge cannot tell from a hole,
 * each with why. Keyed "procedure table".
 */
const EXPLAINED: Record<string, string> = {
  "auth.signup users":
    "A public route that makes a NEW account (a row owned by nobody in this test). The sweep's own sign-up; nobody else's row is touched.",
  "auth.requestPasswordReset password_reset_tokens":
    "A reset token for the account auth.signup just made (the marker address). Public by design; the token is emailed, never returned.",
  "searchMisses.record search_misses":
    "Any member, viewer included, records a picker search that found nothing, under the company — that is what the route is for (searchMissesRouter). It stores the words typed, never touches another row.",
};

/**
 * Procedures the sweep does not call, with why. Kept tiny: everything else is
 * attacked.
 */
const SKIPPED: Record<string, string> = {
  "backup.run":
    "Platform-admin only (adminProcedure — the stranger is role 'user'), and it would stream the whole database to R2. Its gate is the same middleware as backup.status, which IS called.",
};

/**
 * What an estimator's role leaves out, as the tables it would change:
 * pricing.edit (company defaults, markup bands, tax areas, labor rates, the
 * company's heights and extras), settings.edit (branding, proposal
 * defaults), members.manage (members, invites, the company row).
 */
const OWNER_ONLY_TABLES = [
  "pricing_defaults",
  "markup_rules",
  "tax_jurisdictions",
  "labor_rates",
  "takeoff_height_defaults",
  "takeoff_extra_defaults",
  "takeoff_bend_defaults",
  "takeoff_mounting_heights",
  "company_branding",
  "proposal_settings",
  "companies",
  "company_members",
  "company_invites",
];

/** Estimator changes to those tables that are not a role hole, with why. */
const ESTIMATOR_EXPLAINED: Record<string, string> = {
  "sample.remove bids":
    "Removes the shipped EXAMPLE bid (isSample) and nothing else — a hard delete by design (sampleRouter: a finished-with sample should leave no trace). Not a real job, so not bids.delete.",
};

/** Tables a victim row is planted in when its flows did not make one. */
const PLANTED = [
  "assembly_hour_suggestions",
  "assembly_modifiers",
  "bid_closeout_lines",
  "bid_height_areas",
  "bid_math_changes",
  "bid_panel_circuits",
  "bid_pdf_legend_entries",
  "bid_quotes",
  "bid_unit_links",
  "company_invites",
  "master_assembly_items",
  "plan_copilot_runs",
  "plan_copilot_findings",
  "plan_copilot_corrections",
  "ai_correction_log",
  "price_imports",
  "price_import_rows",
  "pricing_problem_reports",
  "project_assembly_items",
  "symbol_looks",
  "takeoff_pull_points",
  "takeoff_run_tees",
  "user_materials_db",
];

/** Mutations that destroy: run LAST, so the victim's data is there for the rest. */
const DESTRUCTIVE =
  /(delete|remove|archive|purge|reset|revert|clear|dismiss|drop|discard|undo|leave|suspend|setStatus|cancel|revoke)/i;

async function userRow(id: number): Promise<User> {
  const database = (await getDb())!;
  const [row] = await database.select().from(users).where(eq(users.id, id));
  return row;
}

function ctxFor(user: User | null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: { "x-forwarded-for": `10.9.${user?.id ?? 0}.1` },
      socket: { remoteAddress: "127.0.0.1" },
      ip: "127.0.0.1",
      get: () => undefined,
    } as unknown as TrpcContext["req"],
    res: {
      cookie: () => undefined,
      clearCookie: () => undefined,
      setHeader: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

/** Call `path` with `input` as `user`; resolves to the reply or the error. */
async function call(
  user: User | null,
  path: string,
  input: unknown
): Promise<
  { ok: true; value: unknown } | { ok: false; code: string; message: string }
> {
  const caller = appRouter.createCaller(ctxFor(user)) as unknown as Record<
    string,
    unknown
  >;
  let fn: unknown = caller;
  for (const part of path.split("."))
    fn = (fn as Record<string, unknown>)[part];
  try {
    const value = await (fn as (i: unknown) => Promise<unknown>)(input);
    return { ok: true, value };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { ok: false, code: e.code ?? "ERROR", message: e.message ?? "" };
  }
}

/** Every victim row the reply carries that the caller did not name itself. */
function leaks(
  reply: unknown,
  input: unknown,
  victimUsers: Set<number>
): string[] {
  const found: string[] = [];
  let text: string;
  try {
    text = JSON.stringify(reply) ?? "";
  } catch {
    text = String(reply);
  }
  if (text.includes(NUMBER_TEXT)) {
    const at = text.indexOf(NUMBER_TEXT);
    found.push(
      `planted number: …${text.slice(Math.max(0, at - 80), at + 20)}…`
    );
  }
  if (text.toUpperCase().includes(MARKER)) {
    const at = text.toUpperCase().indexOf(MARKER);
    found.push(`marker text: …${text.slice(Math.max(0, at - 80), at + 40)}…`);
  }
  const named = JSON.stringify(input) ?? "";
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 12) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>
    )) {
      if (
        (key === "userId" || key === "ownerUserId" || key === "dataUserId") &&
        typeof value === "number" &&
        victimUsers.has(value) &&
        !named.includes(String(value))
      )
        found.push(`${key}=${value} in reply`);
      walk(value, depth + 1);
    }
  };
  walk(reply, 0);
  return found;
}

let db: Db;
let pool: Pool;
let sprayTables: string[] = [];
let victimCompanyId = 0;
const report: Record<string, unknown> = {};

async function clean() {
  const database = await getDb();
  if (!database) return;
  // The companies these users own, and their memberships, before the users:
  // companies.ownerUserId is not a cascade everywhere.
  const owned = await database
    .select({ id: companies.id })
    .from(companies)
    .where(inArray(companies.ownerUserId, ALL));
  if (owned.length) {
    await database.delete(companyMembers).where(
      inArray(
        companyMembers.companyId,
        owned.map(c => c.id)
      )
    );
    await database.delete(companies).where(
      inArray(
        companies.id,
        owned.map(c => c.id)
      )
    );
  }
  await database
    .delete(companyMembers)
    .where(inArray(companyMembers.userId, ALL));
  await database.delete(bidPdfSheets).where(inArray(bidPdfSheets.userId, ALL));
  await database.delete(users).where(inArray(users.id, ALL));
  // Accounts a sweep created through auth.signup with the marker address.
  await database
    .delete(users)
    .where(
      or(
        eq(users.email, `${MARKER.toLowerCase()}@example.com`),
        eq(users.email, "attacker@example.com")
      )
    );
}

/** The hand-built half of the victim's data: one coherent bid. */
async function buildVictimBid(victim: User) {
  const as = appRouter.createCaller(ctxFor(victim));
  const bid = (await as.bids.create({ name: `${MARKER} bid` }))!;
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId: bid.id,
    userId: VICTIM,
    filename: `${MARKER}.pdf`,
    storageKey: `test/${bid.id}/${MARKER}.pdf`,
    byteSize: 1024,
    pageCount: 2,
    sortOrder: 0,
  });
  const { sheets } = await as.bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 2,
    outline: [],
  });
  const sheetId = sheets[0].id;
  await as.bidPdfs.setSheetScale({ id: sheetId, scaleText: `1/4" = 1'-0"` });
  const group = await as.takeoffGroups.create({
    bidId: bid.id,
    label: `${MARKER} duplex`,
  });
  await as.takeoffStamps.drop({
    bidId: bid.id,
    sheetId,
    groupId: group.id,
    at: [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ],
  });
  await as.takeoffRuns.save({
    bidId: bid.id,
    sheetId,
    name: `${MARKER} run`,
    pathType: "conduit",
    status: "committed",
    isSuggestion: false,
    points: [
      { x: 0, y: 0 },
      { x: 480, y: 0 },
    ],
  });
  const { lineId } = await as.takeoffGroups.sendToBid({ id: group.id });
  await as.bids.updateLine({ bidId: bid.id, id: lineId, materialCost: 10 });
  return bid.id;
}

describeDb("an attacker with a normal login, against every route", () => {
  beforeAll(async () => {
    await clean();
    const database = (await getDb())!;
    for (const [id, name] of [
      [VICTIM, `${MARKER} owner`],
      [VIEWER, `${MARKER} viewer`],
      [ESTIMATOR, `${MARKER} estimator`],
      [STRANGER, "Stranger"],
    ] as const) {
      await database.insert(users).values({
        id,
        openId: `test-attack-${id}`,
        name,
        email:
          id === STRANGER
            ? `stranger-${id}@example.com`
            : `victim-${id}@example.com`,
        role: "user",
        accessTier: "internal",
        loginMethod: "email",
      });
    }
    // Two companies: the victim's (with a viewer and an estimator in it) and
    // the stranger's own.
    const scope = await resolveScope(await userRow(VICTIM));
    victimCompanyId = scope.companyId;
    for (const [userId, role] of [
      [VIEWER, "viewer"],
      [ESTIMATOR, "estimator"],
    ] as const)
      await database
        .insert(companyMembers)
        .values({ companyId: victimCompanyId, userId, role, status: "active" });
    await resolveScope(await userRow(STRANGER));

    db = await Db.open(process.env.DATABASE_URL!);
    const victim = await userRow(VICTIM);
    await buildVictimBid(victim);

    // The generated half: every create-shaped mutation, as the victim, twice.
    let made = 0;
    for (let pass = 0; pass < 2; pass++) {
      const snap = await db.snapshot();
      const seedPool: Pool = {
        ids: {
          ...idsOwnedBy(db, snap, VICTIM),
          users: [VICTIM],
          companies: [victimCompanyId],
        },
        marker: MARKER,
        number: NUMBER,
      };
      for (const [path, proc] of Object.entries(PROCS)) {
        if (proc._def.type !== "mutation") continue;
        if (DESTRUCTIVE.test(path) || SKIPPED[path]) continue;
        if (/^(auth|starterAuth|earlyAccess|seatLimits|backup)\./.test(path))
          continue;
        if (/company\.(switchCompany|setRole|setAccessTier)/.test(path))
          continue;
        const { inputs } = inputsFor(proc._def.inputs[0], seedPool, []);
        for (const input of inputs.slice(0, 2)) {
          const result = await call(victim, path, input);
          if (result.ok) made++;
        }
      }
    }
    // Tables the flows above did not reach get one planted row each, so
    // nothing is out of the attack's reach just because the victim never
    // used it. Twice, so a child can point at a parent planted first.
    const planted: Record<string, string | null> = {};
    for (let pass = 0; pass < 2; pass++) {
      const now = idsOwnedBy(db, await db.snapshot(), VICTIM);
      for (const table of PLANTED) {
        if (now[table]?.length || planted[table] === null) continue;
        planted[table] = await plantRow(db, table, VICTIM, now, MARKER, NUMBER);
      }
    }
    report.planted = planted;
    const snap = await db.snapshot();
    const owned = idsOwnedBy(db, snap, VICTIM);
    pool = {
      ids: {
        ...owned,
        users: [VICTIM, VIEWER, ESTIMATOR],
        companies: [victimCompanyId],
      },
      marker: "ATTACKER",
    };
    sprayTables = Object.keys(pool.ids);
    report.victimSeedCalls = made;
    report.victimRows = Object.fromEntries(
      Object.entries(owned).map(([t, ids]) => [t, ids.length])
    );
  }, 600_000);

  afterAll(async () => {
    if (process.env.ATTACK_REPORT)
      writeFileSync(process.env.ATTACK_REPORT, JSON.stringify(report, null, 2));
    await db?.close();
    await clean();
  }, 120_000);

  it("has a victim worth attacking", () => {
    // A thin victim makes every later pass meaningless: no ids, no holes.
    const tables = Object.keys(pool.ids);
    for (const t of [
      "bids",
      "bid_pdfs",
      "bid_pdf_sheets",
      "takeoff_groups",
      "takeoff_stamps",
      "takeoff_runs",
      "bid_line_items",
      "clients",
      "materials",
      "assemblies",
      "labor_rates",
    ])
      expect({ table: t, owned: tables.includes(t) }).toEqual({
        table: t,
        owned: true,
      });
  });

  /**
   * One attacker against a list of procedures. Returns what leaked and what
   * moved, per procedure.
   */
  async function sweep(
    attacker: User | null,
    allowed: Set<number>,
    paths: string[],
    label: string
  ) {
    const reads: Record<string, string[]> = {};
    const writes: Record<string, Finding[]> = {};
    const unreachable: string[] = [];
    let calls = 0;
    let before = await db.snapshot();
    const victimUsers = new Set(
      [VICTIM, VIEWER, ESTIMATOR].filter(u => !allowed.has(u))
    );
    for (const path of paths) {
      const proc = PROCS[path];
      const { inputs } = inputsFor(proc._def.inputs[0], pool, sprayTables);
      if (inputs.length === 0) {
        unreachable.push(path);
        continue;
      }
      for (const input of inputs) {
        calls++;
        const result = await call(attacker, path, input);
        if (!result.ok) continue;
        const found = leaks(result.value, input, victimUsers);
        if (found.length) (reads[path] ??= []).push(...found.slice(0, 3));
      }
      if (proc._def.type === "mutation") {
        const after = await db.snapshot();
        const moved = judge(db, before, after, allowed).filter(
          f => !EXPLAINED[`${path} ${f.table}`]
        );
        if (moved.length) writes[path] = moved;
        before = after;
      }
    }
    report[label] = { calls, reads, writes, unreachable };
    return { reads, writes, unreachable, calls };
  }

  const ordered = (filter: (path: string, proc: Proc) => boolean) =>
    Object.entries(PROCS)
      .filter(([p, proc]) => !SKIPPED[p] && filter(p, proc))
      .sort(([a, pa], [b, pb]) => {
        const rank = (p: string, proc: Proc) =>
          proc._def.type === "query" ? 0 : DESTRUCTIVE.test(p) ? 2 : 1;
        return rank(a, pa) - rank(b, pb) || a.localeCompare(b);
      })
      .map(([p]) => p);

  it("a stranger can read nothing and change nothing of another company's", async () => {
    const result = await sweep(
      await userRow(STRANGER),
      new Set([STRANGER]),
      ordered(() => true),
      "stranger"
    );
    expect({ reads: result.reads, writes: result.writes }).toEqual({
      reads: {},
      writes: {},
    });
  }, 1_800_000);

  it("a viewer of the company changes nothing in it", async () => {
    const result = await sweep(
      await userRow(VIEWER),
      new Set([VIEWER]),
      ordered((_, proc) => proc._def.type === "mutation"),
      "viewer"
    );
    expect(result.writes).toEqual({});
  }, 1_800_000);

  /**
   * An estimator builds bids and edits the library, and may NOT change the
   * company's pricing, branding or members, or delete a bid for good
   * (shared/permissions.ts). Their own edits are expected, so this judges
   * only the tables those capabilities guard.
   */
  it("an estimator cannot reach what their role leaves out", async () => {
    const estimator = await userRow(ESTIMATOR);
    const found: Record<string, string[]> = {};
    let before = await db.snapshot();
    for (const path of ordered((_, proc) => proc._def.type === "mutation")) {
      const { inputs } = inputsFor(
        PROCS[path]._def.inputs[0],
        pool,
        sprayTables
      );
      for (const input of inputs) await call(estimator, path, input);
      const after = await db.snapshot();
      const moved = touched(before, after, OWNER_ONLY_TABLES, ["bids"]).filter(
        f => !ESTIMATOR_EXPLAINED[`${path} ${f.table}`]
      );
      if (moved.length)
        found[path] = moved.slice(0, 3).map(f => `${f.table} ${f.change}`);
      before = after;
    }
    report.estimator = found;
    expect(found).toEqual({});
  }, 1_800_000);

  it("signed out, only the deliberately public routes answer", async () => {
    const answered: string[] = [];
    for (const path of ordered(() => true)) {
      if (PUBLIC[path]) continue;
      const { inputs } = inputsFor(PROCS[path]._def.inputs[0], pool, []);
      for (const input of inputs.slice(0, 1)) {
        const result = await call(null, path, input);
        // FORBIDDEN is adminProcedure's answer to nobody, and is a refusal.
        if (result.ok || !/^(UNAUTHORIZED|FORBIDDEN)$/.test(result.code))
          answered.push(`${path}: ${result.ok ? "answered" : result.code}`);
      }
    }
    report.signedOut = answered;
    expect(answered).toEqual([]);
  }, 600_000);
});
