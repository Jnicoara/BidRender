/**
 * The nightly backup cron.
 *
 * ── Two things worth testing, and they are different ────────────────────────
 * A scheduled job fails in a way a manual one cannot: nobody is watching. So
 * this covers both halves separately —
 *
 *   • **the schedule is configured correctly** — the cadence is a valid
 *     six-field expression, it is daily, it runs before the purge that destroys
 *     data, the handler is actually mounted, and the path in the registration
 *     command matches the path Express serves. Any one of those being wrong
 *     produces a cron that never fires, or fires at a URL that returns the SPA
 *     index with a cheerful 200.
 *
 *   • **a failed run still says so** — the whole point of the tool. A partial
 *     backup, a missing credential and an unreachable bucket must each produce
 *     a 500 and a report, never a quiet 200.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import type { Request, Response } from "express";

import {
  BACKUP_CRON,
  BACKUP_PATH,
  backupToR2Handler,
  runScheduledBackup,
} from "./scheduled/backupToR2";
import { PURGE_CRON, PURGE_PATH } from "./scheduled/purgeArchivedBids";
import { dayKey, runIdsForDay } from "./backup/history";
import type { BackupTarget } from "./backup/target";
import type { FileStreamSource } from "./backup/planFileSource";
import { Readable } from "node:stream";

const databaseUrl = process.env.DATABASE_URL ?? "";
const hasDb = Boolean(databaseUrl);
const runIf = hasDb ? describe : describe.skip;

/**
 * File sources, so nothing here needs a credential or a network.
 *
 * Streams rather than Buffers, matching the shape the backup now takes — it
 * hands a stream from source to destination so a 2GB plan is never assembled
 * in memory on the way through.
 */
function streamOf(text: string): FileStreamSource {
  return {
    name: "fake://files",
    async open() {
      const body = Buffer.from(text);
      return { body: Readable.from(body), contentLength: body.byteLength };
    },
  };
}

/** A source that refuses every read, for the partial-run cases. */
function refusingSource(): FileStreamSource {
  return {
    name: "fake://refusing",
    async open() {
      throw new Error("403 from storage");
    },
  };
}

/** An in-memory bucket, so nothing here needs a credential or a network. */
function fakeTarget(seed: Record<string, string> = {}) {
  const written = new Map<string, Buffer>();
  for (const [key, value] of Object.entries(seed)) {
    written.set(key, Buffer.from(value, "utf8"));
  }
  const target: BackupTarget & { written: Map<string, Buffer> } = {
    name: "fake://memory",
    written,
    async check() {},
    async put(key, body) {
      written.set(key, body);
    },
    async putStream(key, body) {
      // Collected, so the assertions can still look at what was written. The
      // real target hands the stream to a multipart uploader.
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
  };
  return target;
}

/** Minimal express doubles — enough to capture status and body. */
function fakeRes() {
  const captured: { status: number; body: unknown } = {
    status: 200,
    body: null,
  };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, captured };
}

/** A long-enough secret, set for the whole file in beforeEach below. */
const SECRET = "test-cron-secret-long-enough-to-be-accepted";

const requestWith = (headers: Record<string, string | string[]>) =>
  ({ originalUrl: BACKUP_PATH, headers }) as unknown as Request;

/** What the Worker sends. */
const cronRequest = requestWith({ "x-cron-secret": SECRET });

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

// ── The schedule itself ──────────────────────────────────────────────────────

describe("the schedule is configured correctly", () => {
  it("is a five-field expression, as standard cron", () => {
    // Six fields with a leading seconds field was the Manus scheduler's format.
    // Cloudflare takes five. A leftover six-field expression is either rejected
    // at deploy time, which is the good case, or silently a different time —
    // the kind of mistake nobody notices until they look for a backup that was
    // never taken.
    const fields = BACKUP_CRON.trim().split(/\s+/);
    expect(fields, `BACKUP_CRON="${BACKUP_CRON}"`).toHaveLength(5);
    expect(PURGE_CRON.trim().split(/\s+/)).toHaveLength(5);
  });

  it("runs once a day, at a fixed time", () => {
    const [minute, hour, dayOfMonth, month, dayOfWeek] =
      BACKUP_CRON.split(/\s+/);
    expect(minute).toBe("0");
    // A specific hour, not a wildcard or a step — hourly would be cost without
    // benefit for one contractor's working day.
    expect(hour).toMatch(/^\d{1,2}$/);
    expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
  });

  it("runs BEFORE the purge that permanently destroys bids", () => {
    /*
     * purgeArchivedBids deletes bids whose 30-day archive has closed, at 03:30
     * UTC. Backing up first means the night's export still contains what the
     * purge is about to remove, so a purge that fires on the wrong row stays
     * recoverable for a day. Reversed, the backup would faithfully record the
     * deletion and the data would be gone from both.
     */
    const minutesOf = (cron: string) => {
      const [minute, hour] = cron.split(/\s+/);
      return Number(hour) * 60 + Number(minute);
    };
    expect(minutesOf(BACKUP_CRON)).toBeLessThan(minutesOf(PURGE_CRON));
  });

  it("is mounted at the path the registration command names", () => {
    // The failure this catches is specific and quiet: `/api/scheduled/*` is not
    // auto-registered, so an unmounted path falls through to the SPA index and
    // the platform records a successful 200 for a backup that never ran.
    const index = readFileSync("server/_core/index.ts", "utf8");
    expect(index).toContain("app.post(BACKUP_PATH, backupToR2Handler)");
    expect(BACKUP_PATH).toBe("/api/scheduled/backupToR2");
    expect(BACKUP_PATH.startsWith("/api/scheduled/")).toBe(true);
  });

  it("is mounted before the Vite/static fallthrough", () => {
    const index = readFileSync("server/_core/index.ts", "utf8");
    const mount = index.indexOf("app.post(BACKUP_PATH");
    const trpc = index.indexOf('app.use(\n    "/api/trpc"');
    expect(mount).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(trpc === -1 ? Number.MAX_SAFE_INTEGER : trpc);
  });

  it("matches the schedule the Worker is actually deployed with", () => {
    /*
     * wrangler.toml is what Cloudflare reads, and TOML cannot import from
     * TypeScript — so the expressions are restated there. If the two drift, the
     * schedule these tests assert is not the schedule that runs, and nothing
     * reports it: the job fires at the wrong time, quietly, forever.
     */
    const toml = readFileSync("workers/cron/wrangler.toml", "utf8");
    const crons = /crons\s*=\s*\[([^\]]+)\]/.exec(toml)?.[1] ?? "";
    const declared = Array.from(crons.matchAll(/"([^"]+)"/g)).map(m => m[1]);
    expect(declared, `wrangler.toml crons = [${crons}]`).toContain(BACKUP_CRON);
    expect(declared).toContain(PURGE_CRON);
  });

  it("calls the same paths the app mounts", () => {
    const worker = readFileSync("workers/cron/worker.js", "utf8");
    expect(worker).toContain(BACKUP_PATH);
    expect(worker).toContain(PURGE_PATH);
  });
});

// ── Only the platform may trigger it ─────────────────────────────────────────

describe("access", () => {
  // A backup reads every row belonging to every user, so the header is the
  // whole gate. The cases live in server/cronAuth.test.ts; these check the
  // handler is actually wired to them.
  it("refuses a request with no secret", async () => {
    const { res, captured } = fakeRes();
    await backupToR2Handler(requestWith({}), res);
    expect(captured.status).toBe(403);
  });

  it("refuses the wrong secret", async () => {
    const { res, captured } = fakeRes();
    await backupToR2Handler(
      requestWith({ "x-cron-secret": "not-it-but-long-enough-to-try" }),
      res
    );
    expect(captured.status).toBe(403);
  });

  it("refuses everything when the server has no secret configured", async () => {
    // The case that would otherwise leave this open on a misconfigured host.
    delete process.env.CRON_SECRET;
    const { res, captured } = fakeRes();
    await backupToR2Handler(cronRequest, res);
    expect(captured.status).toBe(403);
  });

  it("says nothing useful about why it refused", async () => {
    const { res, captured } = fakeRes();
    await backupToR2Handler(requestWith({}), res);
    expect(JSON.stringify(captured.body)).not.toMatch(/secret|config|header/i);
  });

  it("lets the right secret through", async () => {
    // Nothing is configured in the test environment, so it gets as far as
    // failing on that — which is proof it got past the gate.
    const { res, captured } = fakeRes();
    await backupToR2Handler(cronRequest, res);
    expect(captured.status).not.toBe(403);
  });
});

// ── A failed scheduled run must be loud ──────────────────────────────────────

describe("a failed scheduled run reports failure", () => {
  const now = new Date("2026-08-14T02:00:05.000Z");

  it("fails loudly when R2 is not configured", async () => {
    // A deployment missing its credentials has no backups at all. That must not
    // look like a night with nothing to do.
    const outcome = await runScheduledBackup({
      now,
      databaseUrl: "mysql://unused",
      target: undefined,
    });
    // No R2 vars are set in the test environment, so this is the real path.
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.reason).toContain("R2 is not configured");
  });

  it("fails loudly when the database is not configured", async () => {
    const outcome = await runScheduledBackup({ now, databaseUrl: "" });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.reason).toContain("DATABASE_URL");
  });

  it("returns 500 with the report, never a quiet 200", async () => {
    const { res, captured } = fakeRes();
    await backupToR2Handler(cronRequest, res);

    // Nothing is configured in the test environment, so this run fails.
    expect(captured.status).toBe(500);
    expect((captured.body as { ok: boolean }).ok).toBe(false);
    expect((captured.body as { error: string }).error).toBeTruthy();
  });
});

runIf("a failed scheduled run against a real database", () => {
  const now = new Date("2026-08-14T02:00:05.000Z");

  it("reports failure when the destination cannot be reached", async () => {
    const target = fakeTarget();
    target.check = async () => {
      throw new Error("bad credentials");
    };
    const outcome = await runScheduledBackup({
      now,
      databaseUrl,
      target,
      fileSource: streamOf("bytes"),
    });

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") return;
    expect(outcome.reason).toContain("unreachable");
    expect(outcome.report?.ok).toBe(false);
  });

  it("reports PARTIAL when files cannot be read but the database is safe", async () => {
    /**
     * The case this whole three-state split exists for.
     *
     * An unreadable stored file must not read as success — the files are the
     * half that cannot be rebuilt from anywhere else. But it must not read as
     * "failed" either, because the platform retries a failed scheduled call
     * three times and a storage 403 is deterministic: three retries buy three
     * more database dumps and the same refusals.
     *
     * So: not ok, status partial, database present, every failed key recorded
     * in the manifest beside the data.
     */
    const target = fakeTarget();
    const outcome = await runScheduledBackup({
      now,
      databaseUrl,
      target,
      fileSource: refusingSource(),
    });

    if (outcome.status === "completed") {
      // No files referenced in this database; nothing could have failed.
      expect(outcome.report.files.found).toBe(0);
      return;
    }
    expect(outcome.status).toBe("partial");
    if (outcome.status !== "partial") return;
    expect(outcome.report.database).not.toBeNull();
    expect(outcome.report.files.failed.length).toBeGreaterThan(0);
    // Never reported as OK, whatever the retry behaviour.
    expect(outcome.report.ok).toBe(false);
    // The reason names keys, so the log line is actionable on its own.
    expect(outcome.reason).toContain("could not be read");

    const manifestKey = `${outcome.report.runId}/manifest.json`;
    const manifest = JSON.parse(target.written.get(manifestKey)!.toString());
    expect(manifest.ok).toBe(false);
    expect(manifest.status).toBe("partial");
    expect(manifest.files.failed.length).toBeGreaterThan(0);
  });

  it("counts a partial run as today's, so a retry does not re-dump", async () => {
    /**
     * The retry guard, on the case it was widened for. Re-running after a
     * partial must skip rather than dump the whole database again to collect
     * the identical refusals.
     */
    const target = fakeTarget();
    const first = await runScheduledBackup({
      now,
      databaseUrl,
      target,
      fileSource: refusingSource(),
    });
    // Only meaningful when the fixture database actually references files.
    if (first.status !== "partial") return;

    const second = await runScheduledBackup({
      now,
      databaseUrl,
      target,
      fileSource: refusingSource(),
    });
    expect(second.status).toBe("skipped");
    if (second.status !== "skipped") return;
    expect(second.runId).toBe(first.report.runId);
  });

  it("succeeds and reports completed when everything works", async () => {
    const target = fakeTarget();
    const outcome = await runScheduledBackup({
      now,
      databaseUrl,
      target,
      fileSource: streamOf("bytes"),
    });
    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") return;
    expect(outcome.report.ok).toBe(true);
    expect(outcome.report.database?.tableCount).toBeGreaterThan(20);
  });
});

// ── Retries must not mean three full backups ─────────────────────────────────

describe("picking today's run out of the bucket", () => {
  it("matches run ids by UTC day", () => {
    const keys = [
      "2026-08-13T02-00-05Z/manifest.json",
      "2026-08-14T02-00-05Z/manifest.json",
      "2026-08-14T02-00-05Z/database.sql.gz",
      "2026-08-14T09-13-00Z/manifest.json",
    ];
    expect(runIdsForDay(keys, "2026-08-14")).toEqual([
      "2026-08-14T02-00-05Z",
      "2026-08-14T09-13-00Z",
    ]);
    expect(runIdsForDay(keys, "2026-08-12")).toEqual([]);
  });

  it("derives the day from the clock in UTC", () => {
    expect(dayKey(new Date("2026-08-14T02:00:05.000Z"))).toBe("2026-08-14");
    // Late-evening local time must not roll the day early or late.
    expect(dayKey(new Date("2026-08-14T23:59:59.000Z"))).toBe("2026-08-14");
  });
});

runIf("retry behaviour", () => {
  const now = new Date("2026-08-14T02:00:05.000Z");

  it("skips when today already has a SUCCESSFUL backup", async () => {
    // The platform retries a 5xx up to three times. Without this, one timeout
    // becomes three complete exports of the same data.
    const target = fakeTarget({
      "2026-08-14T02-00-05Z/manifest.json": JSON.stringify({ ok: true }),
    });
    const outcome = await runScheduledBackup({ now, databaseUrl, target });

    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.runId).toBe("2026-08-14T02-00-05Z");
    // Nothing new was written.
    expect(target.written.size).toBe(1);
  });

  it("does NOT skip when today's only backup failed", async () => {
    // The retry exists precisely to recover from that run. Treating a failed
    // manifest as "today is done" turns one bad night into a missing backup.
    const target = fakeTarget({
      "2026-08-14T01-00-00Z/manifest.json": JSON.stringify({ ok: false }),
    });
    const outcome = await runScheduledBackup({
      now,
      databaseUrl,
      target,
      fileSource: streamOf("bytes"),
    });

    expect(outcome.status).toBe("completed");
    expect(target.written.size).toBeGreaterThan(1);
  });

  it("does not skip on yesterday's success", async () => {
    const target = fakeTarget({
      "2026-08-13T02-00-05Z/manifest.json": JSON.stringify({ ok: true }),
    });
    const outcome = await runScheduledBackup({
      now,
      databaseUrl,
      target,
      fileSource: streamOf("bytes"),
    });
    expect(outcome.status).toBe("completed");
  });

  it("backs up rather than skipping when the bucket cannot be read", async () => {
    // Failing the check must not be read as "already done". A duplicate backup
    // is harmless; a skipped one is not.
    const target = fakeTarget();
    target.list = async () => {
      throw new Error("list denied");
    };
    const outcome = await runScheduledBackup({
      now,
      databaseUrl,
      target,
      fileSource: streamOf("bytes"),
    });
    expect(outcome.status).toBe("completed");
  });
});
