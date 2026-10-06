/**
 * Reader-accuracy test account only: make an "<name> - EXISTING TO REMAIN"
 * assembly beside each symbol you count, so an existing device can be counted
 * apart from new work with no migration.
 *
 * ── Why, 2026-10-01 ──────────────────────────────────────────────────────────
 * Many devices on the test sheets are drawn as existing to remain, and some
 * hand counts mixed them with new ones. A mark has no status yet (handed to
 * Track A as a migration — todo.md). Until then the status lives in the COUNT
 * NAME, spelled by shared/existingToRemain.ts, which the accuracy scorer also
 * reads: it folds "X - EXISTING TO REMAIN" back into X when scoring the AI,
 * which is not asked to tell them apart, and reports existing separately.
 *
 * ── Which names ──────────────────────────────────────────────────────────────
 *   --names "DUPLEX RECEPTACLE,GFCI receptacle"   exactly these
 *   (none)   every count already on the answer-key bid, so the twins match
 *            the names you are already counting under
 *
 * Each twin is an empty assembly (no materials, 0 hours) in the same Category
 * as the assembly it twins, so its marks sit on the same layer. An existing
 * twin is left alone. It never reads or writes a count or a mark.
 *
 * Moving marks you already counted: select them on the sheet (click, or
 * Shift-drag a box), then "Move to…" in the bar that appears. Same places,
 * same ids, one Undo.
 *
 * Same guard as readerTestAssemblies.mts: ONE account, ONE local database.
 *
 *   pnpm tsx scripts/readerTestExisting.mts            # dry run
 *   pnpm tsx scripts/readerTestExisting.mts --apply    # do it
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { assertWritableDatabase, LOCAL_HOSTS } from "./databaseGuard";
import * as db from "../server/db";
import { bids, companies, takeoffGroups } from "../drizzle/schema";
import { symbolLookupKey } from "../shared/takeoffCounts";
import {
  existingToRemainName,
  splitExistingToRemain,
} from "../shared/existingToRemain";

const ACCOUNT_EMAIL = "reader-test@local.test";
const DATABASE_NAME = "bidrender_local_c";
const ANSWER_KEY_BID = /^reader accuracy\s*[-–—]\s*answer key$/i;
const apply = process.argv.includes("--apply");
const namesArg = (() => {
  const i = process.argv.indexOf("--names");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

const url = process.env.DATABASE_URL;
let parsed: URL;
try {
  parsed = new URL(url ?? "");
} catch {
  console.error("No readable DATABASE_URL. Refusing.");
  process.exit(1);
}
const dbName = parsed.pathname.replace(/^\//, "");
if (
  !(LOCAL_HOSTS as readonly string[]).includes(parsed.hostname) ||
  dbName !== DATABASE_NAME
) {
  console.error(
    `This script only runs against ${DATABASE_NAME} on this machine. ` +
      `DATABASE_URL names "${dbName}" on ${parsed.hostname}. Refusing.`
  );
  process.exit(1);
}
assertWritableDatabase(url, { action: "make existing-to-remain assemblies" });

const conn = await db.getDb();
if (!conn) {
  console.error("Could not connect to the database.");
  process.exit(1);
}
const user = await db.getUserByEmail(ACCOUNT_EMAIL);
if (!user) {
  console.error(`No account ${ACCOUNT_EMAIL} in ${DATABASE_NAME}.`);
  process.exit(1);
}
const owned = await conn
  .select({ ownerUserId: companies.ownerUserId })
  .from(companies)
  .where(eq(companies.ownerUserId, user.id));
if (owned.length === 0) {
  console.error(
    `${ACCOUNT_EMAIL} owns no company, so its library is someone else's. Refusing.`
  );
  process.exit(1);
}
const userId = user.id;

// ── Which names ─────────────────────────────────────────────────────────────
let wanted: string[];
if (namesArg) {
  wanted = namesArg
    .split(",")
    .map(n => n.trim())
    .filter(Boolean);
} else {
  const answerKey = (
    await conn
      .select({ id: bids.id, name: bids.name })
      .from(bids)
      .where(eq(bids.userId, userId))
  ).filter(b => ANSWER_KEY_BID.test(b.name.trim()));
  if (answerKey.length !== 1) {
    console.error(
      `Expected one "Reader accuracy - answer key" bid, found ${answerKey.length}. ` +
        `Pass --names instead.`
    );
    process.exit(1);
  }
  const counts = await conn
    .select({ label: takeoffGroups.label })
    .from(takeoffGroups)
    .where(
      and(
        eq(takeoffGroups.userId, userId),
        eq(takeoffGroups.bidId, answerKey[0].id)
      )
    );
  wanted = counts.map(c => c.label);
}
// A twin of a twin is not a thing; the base name is what is meant.
const bases = Array.from(
  new Map(
    wanted
      .map(n => splitExistingToRemain(n).base)
      .map(n => [symbolLookupKey(n), n] as const)
  ).values()
);

// The library as the account sees it — its own rows AND shared starters,
// because a count can be armed from either ("GFCI receptacle" is a starter).
const library = await db.getLibraryAssemblies(userId);
const measure = async () =>
  (await db.getLibraryAssemblies(userId)).filter(a => a.userId === userId);
const before = await measure();
const byKey = new Map(library.map(a => [symbolLookupKey(a.name), a] as const));

type Plan = {
  base: string;
  twin: string;
  status: string;
  category: (typeof library)[number]["category"];
};
const plans: Plan[] = bases.map(base => {
  const twin = existingToRemainName(base);
  const original = byKey.get(symbolLookupKey(base));
  const category = original?.category ?? "Devices";
  if (byKey.has(symbolLookupKey(twin)))
    return { base, twin, category, status: "already there" };
  return {
    base,
    twin,
    category,
    status: original
      ? `create (Category ${category}, like "${original.name}")`
      : `create (Category Devices — no assembly named "${base}" to copy it from)`,
  };
});

console.log(
  `${ACCOUNT_EMAIL} (user ${userId}) in ${DATABASE_NAME} — ` +
    `${apply ? "APPLYING" : "dry run, nothing written"}\n`
);
for (const p of plans) console.log(`  ${p.twin.padEnd(60)} ${p.status}`);
const toCreate = plans.filter(p => p.status.startsWith("create"));
console.log(
  `\n${toCreate.length} to create, ${plans.length - toCreate.length} already there.`
);

if (!apply) {
  if (toCreate.length) console.log("Run again with --apply to do it.");
  process.exit(0);
}

for (const p of toCreate) {
  await db.createAssembly({
    userId,
    name: p.twin,
    category: p.category,
    trade: "electrical",
    projectType: null,
    baseLaborHours: "0.0000",
    overheadLaborHours: "0.0000",
    laborRateId: null,
  });
}

// Outcome, read again after the writes rather than echoed from the plan.
const after = await measure();
const twinsAfter = after.filter(a => splitExistingToRemain(a.name).existing);
console.log(
  `\nOwn assemblies ${before.length} -> ${after.length}; ` +
    `existing-to-remain assemblies now ${twinsAfter.length}.`
);
process.exit(0);
