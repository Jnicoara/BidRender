/**
 * Reader-accuracy test account only: give every captured legend symbol an
 * assembly of the SAME NAME and link it, so one click on the symbol in the
 * Legend panel arms Count.
 *
 * ── Why this exists, 2026-09-30 ──────────────────────────────────────────────
 * Clicking an unlinked symbol in the Legend panel asks for an assembly first.
 * The hand count for the reader-accuracy test has dozens of symbols and needs
 * no assembly at all: scripts/readerAccuracy.mts reads only each count's name
 * (`takeoff_groups.label`) and its marks' positions. A count armed from an
 * assembly is labelled with the ASSEMBLY's name (server/assemblyGroup.ts), so
 * an assembly named exactly like the symbol gives the count exactly the name
 * the test pairs on. The real fix — count first, link later — is item 8a in
 * Track B's plan; this is a local stand-in for one account, not that.
 *
 * ── What it touches ──────────────────────────────────────────────────────────
 * ONE account (reader-test@local.test), ONE database (bidrender_local_c on
 * this machine). Refuses anything else, including with ALLOW_REMOTE_DATABASE.
 * For each of that account's symbols with no assembly:
 *   - an assembly with the same name (case ignored, as the app's own duplicate
 *     check does) already in the library -> link to it;
 *   - otherwise create an empty one (no materials, 0 hours, category Devices)
 *     with exactly the symbol's name, and link to it.
 * A symbol already linked is left alone, and reported if its assembly's name
 * differs — that count would NOT pair with the legend.
 * Safe to run again after capturing more symbols: the second run finds them
 * linked and does nothing.
 *
 *   pnpm tsx scripts/readerTestAssemblies.mts           # dry run, writes nothing
 *   pnpm tsx scripts/readerTestAssemblies.mts --apply   # do it
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { assertWritableDatabase, LOCAL_HOSTS } from "./databaseGuard";
import * as db from "../server/db";
import { companies, takeoffGroups } from "../drizzle/schema";
import { symbolLookupKey } from "../shared/takeoffCounts";

const ACCOUNT_EMAIL = "reader-test@local.test";
const DATABASE_NAME = "bidrender_local_c";
const apply = process.argv.includes("--apply");

// ── Where this would land: one local database, by name, and nothing else ───
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
assertWritableDatabase(url, { action: "link reader-test legend symbols" });

const conn = await db.getDb();
if (!conn) {
  console.error("Could not connect to the database.");
  process.exit(1);
}

// ── The account, and the company whose library it reads ────────────────────
const user = await db.getUserByEmail(ACCOUNT_EMAIL);
if (!user) {
  console.error(`No account ${ACCOUNT_EMAIL} in ${DATABASE_NAME}.`);
  process.exit(1);
}
// Library rows are keyed by the company OWNER's id (CLAUDE.md, data model).
// The test account owns its own company; anything else and this stops.
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

const measure = async () => {
  const symbols = await db.getSymbolLinks(userId);
  const library = await db.getLibraryAssemblies(userId);
  return {
    symbols,
    library,
    linked: symbols.filter(s => s.assemblyId !== null).length,
    ownAssemblies: library.filter(a => a.userId === userId).length,
  };
};

const before = await measure();
const byName = new Map(
  before.library.map(a => [symbolLookupKey(a.name), a] as const)
);
const byId = new Map(before.library.map(a => [a.id, a] as const));

type Step =
  | { kind: "create"; symbolId: number; label: string }
  | { kind: "link"; symbolId: number; label: string; assemblyId: number }
  | { kind: "ok"; label: string }
  | { kind: "mismatch"; label: string; assemblyName: string };

const steps: Step[] = before.symbols.map(symbol => {
  if (symbol.assemblyId !== null) {
    const linked = byId.get(symbol.assemblyId);
    if (
      linked &&
      symbolLookupKey(linked.name) !== symbolLookupKey(symbol.label)
    ) {
      return {
        kind: "mismatch",
        label: symbol.label,
        assemblyName: linked.name,
      };
    }
    return { kind: "ok", label: symbol.label };
  }
  const same = byName.get(symbolLookupKey(symbol.label));
  return same
    ? {
        kind: "link",
        symbolId: symbol.id,
        label: symbol.label,
        assemblyId: same.id,
      }
    : { kind: "create", symbolId: symbol.id, label: symbol.label };
});

// A plain count already named like a symbol would sit beside the new
// assembly count under the same name. Said, not changed.
const plainNames = await conn
  .select({ label: takeoffGroups.label })
  .from(takeoffGroups)
  .where(
    and(eq(takeoffGroups.userId, userId), eq(takeoffGroups.kind, "plain"))
  );
const plainKeys = new Set(plainNames.map(g => symbolLookupKey(g.label)));

console.log(
  `${ACCOUNT_EMAIL} (user ${userId}) in ${DATABASE_NAME} — ${apply ? "APPLYING" : "dry run, nothing written"}\n`
);
for (const step of steps) {
  const line =
    step.kind === "create"
      ? `create assembly "${step.label}" and link it`
      : step.kind === "link"
        ? `link to existing assembly "${byId.get(step.assemblyId)?.name}"`
        : step.kind === "ok"
          ? "already linked, same name"
          : `already linked to "${step.assemblyName}" — NAME DIFFERS, will not pair; left alone`;
  console.log(`  ${step.label.padEnd(32)} ${line}`);
  if (plainKeys.has(symbolLookupKey(step.label))) {
    console.log(
      `  ${"".padEnd(32)} note: a plain count with this name already exists`
    );
  }
}
const toDo = steps.filter(s => s.kind === "create" || s.kind === "link");
console.log(
  `\n${before.symbols.length} symbol(s): ${toDo.length} to link ` +
    `(${steps.filter(s => s.kind === "create").length} new assemblies), ` +
    `${steps.filter(s => s.kind === "ok").length} already done, ` +
    `${steps.filter(s => s.kind === "mismatch").length} name mismatch.`
);

if (!apply) {
  if (toDo.length) console.log("Run again with --apply to do it.");
  process.exit(0);
}

for (const step of toDo) {
  let assemblyId: number;
  if (step.kind === "create") {
    // The same row assembliesRouter.create writes, minus materials and
    // modifiers, which an empty assembly has none of.
    assemblyId = await db.createAssembly({
      userId,
      name: step.label,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: "0.0000",
      overheadLaborHours: "0.0000",
      laborRateId: null,
    });
  } else {
    assemblyId = step.assemblyId;
  }
  await db.updateSymbolLink(step.symbolId, userId, { assemblyId });
}

// ── Outcome: the same measurement, read again after the writes ─────────────
const after = await measure();
console.log(
  `\nLinked symbols ${before.linked} -> ${after.linked} of ${after.symbols.length}; ` +
    `own assemblies ${before.ownAssemblies} -> ${after.ownAssemblies}.`
);
process.exit(0);
