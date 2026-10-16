/**
 * BACKUP + RESTORE DRILL, LOCAL ONLY (owner's queue, 2026-10-16).
 *
 * The REAL backup (`runBackup`) and the REAL restore check (`verifyBackup`) —
 * the code the nightly job and `scripts/verifyBackup.mts` run — with the R2
 * bucket swapped for a folder on this machine and the plan files read from
 * the local storage folder. Then every bid is priced on both sides
 * (scripts/bidTotalsDump.mts, the bid screen's own maths) and compared.
 *
 *   pnpm tsx scripts/backupDrill.mts --out <folder> [--keep]
 *
 * Source: DATABASE_URL (read only — a backup reads). Restored into
 * `bidrender_test_restore_drill` on the same local MySQL server, which is
 * dropped afterwards unless --keep. Refuses a non-local server for the
 * restore (scripts/databaseGuard.ts). Writes nothing to R2.
 */
import "dotenv/config";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { execFileSync } from "node:child_process";
import type { Readable } from "node:stream";

const { assertWritableDatabase, OVERRIDE_VAR } = await import(
  "./databaseGuard"
);
const { runBackup, summarise } = await import("../server/backup/runBackup");
const { verifyBackup, summariseVerify } = await import(
  "../server/backup/verifyBackup"
);
const { diskRelativePath, diskStorageRoot } = await import(
  "../server/diskStorage"
);
type BackupTarget = import("../server/backup/target").BackupTarget;
type FileStreamSource =
  import("../server/backup/planFileSource").FileStreamSource;

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const out = arg("--out");
if (!out) throw new Error("--out <folder> is required");
const keep = process.argv.includes("--keep");
const source = process.env.DATABASE_URL?.trim();
if (!source) throw new Error("DATABASE_URL is not set");
const SCHEMA = "bidrender_test_restore_drill";
const serverUrl = (() => {
  // The server, no database: the local login may not open `mysql` itself
  // (measured: access denied), and the restore makes its own schema.
  const u = new URL(source);
  u.pathname = "/";
  return u.toString();
})();
assertWritableDatabase(serverUrl, {
  action: "restore the backup drill",
  env: { ...process.env, [OVERRIDE_VAR]: undefined },
});

// ── A folder standing in for the bucket ─────────────────────────────────────
const root = path.resolve(out);
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
const fileOf = (key: string) => path.join(root, ...key.split("/"));
const target: BackupTarget = {
  name: `local folder ${root}`,
  async put(key, body) {
    await mkdir(path.dirname(fileOf(key)), { recursive: true });
    await writeFile(fileOf(key), body);
  },
  async putStream(key, body) {
    await mkdir(path.dirname(fileOf(key)), { recursive: true });
    await pipeline(body, createWriteStream(fileOf(key)));
  },
  async check() {},
  async get(key) {
    return readFile(fileOf(key));
  },
  async list(prefix) {
    const keys: string[] = [];
    const walk = async (dir: string, rel: string) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(path.join(dir, e.name), r);
        else keys.push(r);
      }
    };
    await walk(root, "");
    return keys.filter(k => k.startsWith(prefix));
  },
  async deleteMany(keys) {
    for (const k of keys) await rm(fileOf(k), { force: true });
  },
};

// ── Plan files from the local storage folder ───────────────────────────────
const storage = diskStorageRoot();
if (!storage) throw new Error("LOCAL_STORAGE_DIR is not set");
const fileSource: FileStreamSource = {
  name: `local storage ${storage}`,
  async open(key) {
    const rel = diskRelativePath(key);
    if (!rel) throw new Error(`not a storage key: ${key}`);
    const file = path.join(storage, ...rel.split("/"));
    const size = (await stat(file)).size;
    return { body: createReadStream(file) as Readable, contentLength: size };
  },
};

const t0 = Date.now();
const report = await runBackup({
  databaseUrl: source,
  target,
  fileSource,
  onProgress: m => console.log(`  backup: ${m}`),
});
console.log(summarise(report));
const backupSeconds = (Date.now() - t0) / 1000;

const t1 = Date.now();
const verified = await verifyBackup({
  target,
  scratchDatabaseUrl: serverUrl,
  runId: report.runId,
  scratchSchema: SCHEMA,
  keepScratch: true,
  onProgress: m => console.log(`  restore: ${m}`),
});
console.log(summariseVerify(verified));
const restoreSeconds = (Date.now() - t1) / 1000;

// ── Every bid's totals, source vs restored ─────────────────────────────────
const restoredUrl = (() => {
  const u = new URL(source);
  u.pathname = `/${SCHEMA}`;
  return u.toString();
})();
const dump = (url: string) =>
  JSON.parse(
    execFileSync("npx", ["tsx", "scripts/bidTotalsDump.mts"], {
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
    })
  ) as Record<string, { totalDue: number; directCost: number; lines: number }>;
const before = dump(source);
const after = dump(restoredUrl);
const ids = Object.keys(before);
const differ = ids.filter(
  id => JSON.stringify(before[id]) !== JSON.stringify(after[id])
);
const missing = ids.filter(id => !(id in after));
const sum = (m: typeof before) =>
  Object.values(m).reduce((s, v) => s + v.totalDue, 0);
console.log(
  JSON.stringify(
    {
      backup: {
        status: report.status,
        seconds: backupSeconds,
        files: report.files.copied,
        bytes: report.files.bytes,
      },
      restore: { ok: verified.ok, seconds: restoreSeconds },
      bids: {
        compared: ids.length,
        differ: differ.length,
        missing: missing.length,
      },
      totalDueSum: {
        source: Math.round(sum(before) * 100) / 100,
        restored: Math.round(sum(after) * 100) / 100,
      },
      firstDifferences: differ
        .slice(0, 5)
        .map(id => ({ id, before: before[id], after: after[id] })),
    },
    null,
    2
  )
);

if (!keep) {
  const mysql = await import("mysql2/promise");
  const c = await mysql.createConnection(serverUrl);
  await c.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\``);
  await c.end();
  console.log(`dropped ${SCHEMA}`);
}
process.exit(
  report.ok && verified.ok && differ.length === 0 && missing.length === 0
    ? 0
    : 1
);
