/**
 * Find — and with --apply, delete — stored files that no row names any more.
 *
 * Plan PDFs and logos left behind before 2026-09-27, when deleting a bid began
 * deleting its files, plus anything a delete since then could not remove (a
 * store refusing mid-delete leaves the file for this). See server/storedFiles.ts.
 *
 *   pnpm tsx scripts/sweepOrphanPlans.mts            # report only (default)
 *   pnpm tsx scripts/sweepOrphanPlans.mts --apply    # delete what it reports
 *
 * Against production — by hand, dry run first, for the first month (owner,
 * 2026-09-27):
 *
 *   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/sweepOrphanPlans.mts
 *   ALLOW_REMOTE_DATABASE=yes DOTENV_CONFIG_PATH=.env.production.local \
 *     pnpm tsx scripts/sweepOrphanPlans.mts --apply
 *
 * The list of files to KEEP comes from the database, so --apply is gated by
 * the same guard as every script that writes (scripts/databaseGuard.ts): the
 * word is what stands between this and deleting every contractor's drawings on
 * the strength of a wrong DATABASE_URL.
 *
 * Refuses — see server/orphanSweep.ts — when the database names nothing, or
 * when more than half of what is stored looks orphaned. The second refusal
 * still prints the list, and `--allow-majority` lifts it once somebody has
 * read that list and agrees; the first cannot be lifted. Leaves any file newer
 * than 7 days, which may be an upload not yet attached.
 *
 * Measured 2026-09-27 on a developer's `.local-storage`: 49 of 58 files
 * orphaned, all test-suite uploads under a fixture user, and the share refusal
 * fired — correctly, and a reason the override exists.
 *
 * Reports an OUTCOME: with --apply it lists storage again afterwards and
 * prints both counts, because "N to delete" printed in the past tense is
 * indistinguishable from a sweep that did nothing (CLAUDE.md § "a count taken
 * before the change").
 */
import "dotenv/config";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { collectFiles } from "../server/backup/collectFiles";
import { diskStorageRoot } from "../server/diskStorage";
import { r2Client } from "../server/r2Storage";
import { storageDelete } from "../server/storage";
import {
  legacyReadBackends,
  selectStorageBackend,
} from "../server/storageBackend";
import { planOrphanSweep, type StoredObject } from "../server/orphanSweep";
import { assertWritableDatabase } from "./databaseGuard";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (apply)
  assertWritableDatabase(databaseUrl, { action: "delete stored files" });

function human(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

async function listR2(): Promise<StoredObject[]> {
  const { client, config } = r2Client();
  const out: StoredObject[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        ContinuationToken: token,
      })
    );
    for (const object of page.Contents ?? []) {
      if (!object.Key) continue;
      out.push({
        key: object.Key,
        size: object.Size ?? 0,
        modified: object.LastModified ?? new Date(0),
        store: "r2",
      });
    }
    token = page.NextContinuationToken;
  } while (token);
  return out;
}

/** The disk folder, with each path turned back into the key it encodes. */
async function listDisk(): Promise<StoredObject[]> {
  const root = diskStorageRoot();
  if (!root) return [];
  const out: StoredObject[] = [];
  async function walk(dir: string, segments: string[]) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const next = [...segments, decodeURIComponent(entry.name)];
      if (entry.isDirectory()) await walk(full, next);
      else if (entry.isFile()) {
        const info = await stat(full);
        out.push({
          key: next.join("/"),
          size: info.size,
          modified: info.mtime,
          store: "disk",
        });
      }
    }
  }
  await walk(root, []);
  return out;
}

async function listStores(): Promise<StoredObject[]> {
  const backend = selectStorageBackend();
  const stores = [backend, ...legacyReadBackends()];
  const out: StoredObject[] = [];
  if (stores.includes("r2")) out.push(...(await listR2()));
  if (stores.includes("disk")) out.push(...(await listDisk()));
  return out;
}

const named = await collectFiles(databaseUrl);
for (const warning of named.warnings) console.warn(`  ! ${warning}`);
const namedKeys = new Set(named.files.map(f => f.key));

const allowMajority = process.argv.includes("--allow-majority");
const before = await listStores();
const checked = planOrphanSweep({
  objects: before,
  namedKeys,
  now: new Date(),
  allowMajority,
});
// Refused on share: still show the list, because reading it is exactly what
// --allow-majority asks of the person running this. Nothing is deleted.
const plan = checked.ok
  ? checked
  : planOrphanSweep({
      objects: before,
      namedKeys,
      now: new Date(),
      allowMajority: true,
    });
if (!plan.ok) {
  console.error(plan.reason);
  process.exit(1);
}

const bytes = plan.orphans.reduce((sum, o) => sum + o.size, 0);
console.log(
  `${before.length} stored file(s), ${plan.named} named by a row, ` +
    `${plan.orphans.length} orphaned (${human(bytes)}), ` +
    `${plan.tooNew.length} unnamed but under 7 days old (left alone).\n`
);
for (const o of plan.orphans) {
  const age = Math.floor((Date.now() - o.modified.getTime()) / 86_400_000);
  console.log(
    `  ${o.store.padEnd(4)} ${String(age).padStart(4)}d ${human(o.size).padStart(9)}  ${o.key}`
  );
}

if (!checked.ok) {
  console.error(`\nREFUSED: ${checked.reason}`);
  process.exit(1);
}
if (allowMajority)
  console.log("\n--allow-majority: the share refusal is lifted.");

if (!apply) {
  if (plan.orphans.length > 0)
    console.log("\nDry run. Nothing deleted; --apply to delete.");
  process.exit(0);
}

let failed = 0;
for (const key of new Set(plan.orphans.map(o => o.key))) {
  try {
    await storageDelete(key);
  } catch (error) {
    failed++;
    console.error(`  could not delete ${key}:`, error);
  }
}

const after = await listStores();
const afterPlan = planOrphanSweep({
  objects: after,
  namedKeys,
  now: new Date(),
  allowMajority: true,
});
const orphansAfter = afterPlan.ok ? afterPlan.orphans.length : "?";
console.log(
  `\nstored files ${before.length} -> ${after.length}, ` +
    `orphans ${plan.orphans.length} -> ${orphansAfter}` +
    (failed > 0 ? `, ${failed} could not be deleted` : "")
);
if (failed > 0) process.exit(1);
