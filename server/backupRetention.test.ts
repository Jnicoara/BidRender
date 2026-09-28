/**
 * Backups are kept 30 days, and the newest 7 good ones always (owner,
 * 2026-09-27). That is how long a deleted contractor's drawings can outlive
 * the deletion, so it is a promise to customers — and the two protections
 * below are what stop it costing the last good backup.
 */
import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import {
  BACKUP_KEEP_DAYS,
  KEEP_NEWEST_GOOD,
  runFolders,
  runsToPrune,
} from "./backup/retention";
import { runScheduledBackup } from "./scheduled/backupToR2";
import type { BackupTarget } from "./backup/target";
import type { FileStreamSource } from "./backup/planFileSource";

const NOW = new Date("2026-09-27T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

/** A run id `days` before NOW, in the shape the backup writes. */
function runId(days: number): string {
  return new Date(NOW.getTime() - days * DAY)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
}

describe("which runs are pruned", () => {
  it("keeps everything inside 30 days", () => {
    const runs = [1, 10, 29].map(d => ({ runId: runId(d), good: true }));
    expect(runsToPrune({ runs, now: NOW })).toEqual([]);
  });

  it("prunes a run past 30 days once 7 newer good ones exist", () => {
    const recent = [1, 2, 3, 4, 5, 6, 7].map(d => ({
      runId: runId(d),
      good: true,
    }));
    const old = { runId: runId(BACKUP_KEEP_DAYS + 1), good: true };
    expect(runsToPrune({ runs: [...recent, old], now: NOW })).toEqual([
      old.runId,
    ]);
  });

  it("never prunes one of the newest 7 GOOD runs, however old", () => {
    // A month of failed nights, then the last three good ones, all old.
    const failed = Array.from({ length: 40 }, (_, i) => ({
      runId: runId(i + 1),
      good: false,
    }));
    const lastGood = [45, 50, 60].map(d => ({ runId: runId(d), good: true }));
    const pruned = runsToPrune({ runs: [...failed, ...lastGood], now: NOW });
    for (const good of lastGood) expect(pruned).not.toContain(good.runId);
    expect(KEEP_NEWEST_GOOD).toBe(7);
  });

  it("prunes an old failed run — it may still hold drawings", () => {
    const recent = [1, 2, 3, 4, 5, 6, 7].map(d => ({
      runId: runId(d),
      good: true,
    }));
    const oldFailed = { runId: runId(40), good: false };
    expect(runsToPrune({ runs: [...recent, oldFailed], now: NOW })).toEqual([
      oldFailed.runId,
    ]);
  });

  it("leaves a folder whose name is not a run id alone", () => {
    expect(
      runsToPrune({ runs: [{ runId: "notes", good: false }], now: NOW })
    ).toEqual([]);
  });

  it("finds a run that died before writing its manifest", () => {
    const id = runId(40);
    expect(runFolders([`${id}/files/bid-plans/1/2/a.pdf`])).toEqual([id]);
  });
});

// ── End to end through the nightly job ──────────────────────────────────────

const databaseUrl = process.env.DATABASE_URL ?? "";
const runIf = databaseUrl ? describe : describe.skip;

function memoryTarget(seed: string[], options: { failOn?: RegExp } = {}) {
  const written = new Map<string, Buffer>();
  for (const key of seed) {
    written.set(
      key,
      Buffer.from(
        key.endsWith("manifest.json")
          ? JSON.stringify({ status: "clean" })
          : "x"
      )
    );
  }
  const target: BackupTarget & { written: Map<string, Buffer> } = {
    name: "fake://memory",
    written,
    async check() {},
    async put(key, body) {
      if (options.failOn?.test(key)) throw new Error(`refused ${key}`);
      written.set(key, body);
    },
    async putStream(key, body) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) chunks.push(Buffer.from(chunk));
      written.set(key, Buffer.concat(chunks));
    },
    async get(key) {
      const body = written.get(key);
      if (!body) throw new Error(`no such object: ${key}`);
      return body;
    },
    async list(prefix) {
      return Array.from(written.keys()).filter(k => k.startsWith(prefix));
    },
    async deleteMany(keys) {
      for (const key of keys) written.delete(key);
    },
  };
  return target;
}

const files: FileStreamSource = {
  name: "fake://files",
  async open() {
    return { body: Readable.from(Buffer.from("pdf")), contentLength: 3 };
  },
};

/** Seven recent good runs and one 40-day-old run holding a drawing. */
function seededBucket() {
  const recent = [1, 2, 3, 4, 5, 6, 7].map(d => `${runId(d)}/manifest.json`);
  const old = runId(40);
  return {
    old,
    keys: [
      ...recent,
      `${old}/manifest.json`,
      `${old}/database.sql.gz`,
      `${old}/files/bid-plans/9/9/deleted-long-ago.pdf`,
    ],
  };
}

runIf("the nightly backup applies retention", () => {
  it("removes the old run's drawing after a good night", async () => {
    const { old, keys } = seededBucket();
    const target = memoryTarget(keys);
    const outcome = await runScheduledBackup({
      now: NOW,
      databaseUrl,
      target,
      fileSource: files,
    });
    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;
    expect(outcome.retention.pruned).toEqual([old]);
    expect(
      Array.from(target.written.keys()).some(k => k.startsWith(`${old}/`))
    ).toBe(false);
  });

  it("prunes nothing on a night the backup itself failed", async () => {
    const { old, keys } = seededBucket();
    const target = memoryTarget(keys, { failOn: /database\.sql\.gz$/ });
    const outcome = await runScheduledBackup({
      now: NOW,
      databaseUrl,
      target,
      fileSource: files,
    });
    expect(outcome.status).toBe("failed");
    expect(
      target.written.has(`${old}/files/bid-plans/9/9/deleted-long-ago.pdf`)
    ).toBe(true);
  });
});
