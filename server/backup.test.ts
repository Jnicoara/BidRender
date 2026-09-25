/**
 * The backup tool.
 *
 * ── What this has to prove ──────────────────────────────────────────────────
 * This is a safety net, which means its failure mode is unique among the things
 * in this repo: nobody finds out it is broken until the day they need it, and
 * on that day the original is already gone. Every other test in this suite
 * guards something a user would eventually notice. This one guards something
 * nobody will.
 *
 * So the assertions are about completeness and honesty rather than behaviour:
 *
 *   • Every table is in the dump — compared against MySQL's own list, not
 *     against drizzle/schema.ts, because agreeing with the schema file is
 *     exactly the mistake that loses a table nobody declared.
 *   • Empty tables survive. They are the common case on a fresh install and the
 *     easiest thing to crash on.
 *   • A file column added later cannot go unbacked without failing a test.
 *   • Failure is reported, never swallowed, and never dressed up as success.
 *
 * The destination is faked throughout, so the whole pipeline is exercised with
 * no credential, no network and no Cloudflare account.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { gunzipSync, gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { dumpDatabase, listTables } from "./backup/dumpDatabase";
import { collectFiles, FILE_SOURCES } from "./backup/collectFiles";
import { runBackup, runIdFor, summarise } from "./backup/runBackup";
import { readR2Config, describeConfig, REQUIRED_VARS } from "./backup/config";
import type { BackupTarget } from "./backup/target";
import type { FileStreamSource } from "./backup/planFileSource";
import { Readable } from "node:stream";
import {
  newestRunId,
  summariseVerify,
  verifyBackup,
} from "./backup/verifyBackup";

const databaseUrl = process.env.DATABASE_URL ?? "";
const hasDb = Boolean(databaseUrl);
const runIf = hasDb ? describe : describe.skip;

/** A destination that keeps everything in memory, so tests need no cloud. */
function fakeTarget(
  options: { failOn?: RegExp; failCheck?: boolean } = {}
): BackupTarget & { written: Map<string, Buffer> } {
  const written = new Map<string, Buffer>();
  return {
    name: "fake://memory",
    written,
    async check() {
      if (options.failCheck) throw new Error("no credentials");
    },
    async put(key, body) {
      if (options.failOn?.test(key)) throw new Error(`refused ${key}`);
      written.set(key, body);
    },
    async putStream(key, body) {
      if (options.failOn?.test(key)) throw new Error(`refused ${key}`);
      // Collected so the assertions can still look at what was written. The
      // real target hands the stream to a multipart uploader instead; what
      // matters to these tests is that the same bytes arrive under the same key.
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
}

/**
 * A file source that hands back the same bytes for every key.
 *
 * A stream rather than a Buffer, because that is the shape the backup now
 * takes — a 2GB plan must never be assembled in memory on its way through.
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

/** A file source driven by a function, for the ones that fail on purpose. */
function sourceThat(read: (key: string) => Promise<Buffer>): FileStreamSource {
  return {
    name: "fake://files",
    async open(key: string) {
      const body = await read(key);
      return { body: Readable.from(body), contentLength: body.byteLength };
    },
  };
}

/** A table that exists in MySQL but in no TypeScript file anywhere. */
const ORPHAN_TABLE = "backup_test_undeclared";
/** A table with a schema and deliberately no rows. */
const EMPTY_TABLE = "backup_test_empty";

beforeAll(async () => {
  if (!hasDb) return;
  const connection = await mysql.createConnection({ uri: databaseUrl });
  await connection.query(`DROP TABLE IF EXISTS \`${ORPHAN_TABLE}\``);
  await connection.query(
    `CREATE TABLE \`${ORPHAN_TABLE}\` (
       id INT AUTO_INCREMENT PRIMARY KEY,
       note VARCHAR(64),
       payload BLOB,
       -- The column that broke the dump. mysql2 parses JSON into real JS
       -- values, and the driver's escaper expands an array into a value list.
       shape JSON,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );
  await connection.query(
    `INSERT INTO \`${ORPHAN_TABLE}\` (note, payload, shape) VALUES
       ('plain', NULL, ?),
       ('quote''s and \\\\ backslash', NULL, ?),
       (NULL, NULL, NULL)`,
    [
      // An array and an object — the two shapes escape() mishandles differently.
      JSON.stringify([
        { x: 1.5, y: 2.5 },
        { x: 3, y: 4 },
      ]),
      JSON.stringify({ nested: { note: 'it\'s "quoted"' }, list: [1, 2, 3] }),
    ]
  );
  await connection.query(
    `CREATE TABLE IF NOT EXISTS \`${EMPTY_TABLE}\` (
       id INT AUTO_INCREMENT PRIMARY KEY,
       label VARCHAR(32)
     )`
  );
  await connection.query(`DELETE FROM \`${EMPTY_TABLE}\``);
  await connection.end();
});

afterAll(async () => {
  if (!hasDb) return;
  const connection = await mysql.createConnection({ uri: databaseUrl });
  await connection.query(`DROP TABLE IF EXISTS \`${ORPHAN_TABLE}\``);
  await connection.query(`DROP TABLE IF EXISTS \`${EMPTY_TABLE}\``);
  await connection.end();
});

// ── Completeness ─────────────────────────────────────────────────────────────

runIf("the dump covers every table", () => {
  it("dumps exactly the tables MySQL reports, with none missing", async () => {
    // The assertion the whole tool rests on. Both sides are asked
    // independently: the dump reports what it wrote, MySQL reports what exists.
    const [dump, live] = await Promise.all([
      dumpDatabase(databaseUrl),
      listTables(databaseUrl),
    ]);
    const dumped = dump.tables.map(t => t.table).sort();
    expect(dumped).toEqual([...live].sort());
    expect(dumped.length).toBeGreaterThan(20);
  });

  it("includes a table that exists in the database but in no schema file", async () => {
    // The specific failure enumerating from drizzle/schema.ts would cause.
    // ORPHAN_TABLE is declared nowhere in TypeScript.
    const dump = await dumpDatabase(databaseUrl);
    expect(dump.tables.map(t => t.table)).toContain(ORPHAN_TABLE);
    expect(dump.sql).toContain(`CREATE TABLE \`${ORPHAN_TABLE}\``);
  });

  /**
   * ── The dialect the dump is WRITTEN in has to match the one it is READ in ──
   * SHOW CREATE TABLE answers in the server's own quoting style, and the header
   * this dump writes restores under NO_AUTO_VALUE_ON_ZERO, which does not
   * include ANSI_QUOTES. DigitalOcean runs with ANSI_QUOTES by default, so
   * without pinning the session (dumpDatabase does) every name would come back
   * as "table" instead of `table`, and on restore each one would be read as a
   * string literal and the file would not load.
   *
   * Asserted here rather than trusted to the host, because a dump that cannot
   * be restored looks exactly like a good one until the day it is needed.
   */
  it("quotes names with backticks whatever the server's quoting mode", async () => {
    const dump = await dumpDatabase(databaseUrl);
    expect(dump.sql).toContain("CREATE TABLE `");
    expect(dump.sql).not.toContain('CREATE TABLE "');
  });

  it("backs up drizzle's own migration ledger", async () => {
    // Restoring without it leaves a database that looks unmigrated and invites
    // someone to re-run every migration over live data.
    const dump = await dumpDatabase(databaseUrl);
    expect(dump.tables.map(t => t.table)).toContain("__drizzle_migrations");
  });

  it("writes schema and data for a table with rows", async () => {
    const dump = await dumpDatabase(databaseUrl);
    expect(dump.sql).toContain(`DROP TABLE IF EXISTS \`${ORPHAN_TABLE}\``);
    expect(dump.sql).toMatch(new RegExp(`INSERT INTO \`${ORPHAN_TABLE}\``));
    const entry = dump.tables.find(t => t.table === ORPHAN_TABLE);
    expect(entry?.rows).toBe(3);
  });

  it("escapes quotes and backslashes rather than producing broken SQL", async () => {
    // A dump that will not load is worse than no dump: it looks like a backup.
    const dump = await dumpDatabase(databaseUrl);
    expect(dump.sql).toContain("quote\\'s");
  });

  it("produces a dump that can be restored in any order", async () => {
    // Foreign keys mean table order matters on restore unless checks are off.
    const dump = await dumpDatabase(databaseUrl);
    expect(dump.sql).toContain("SET FOREIGN_KEY_CHECKS = 0;");
    expect(dump.sql.trimEnd().endsWith("SET FOREIGN_KEY_CHECKS = 1;")).toBe(
      true
    );
  });
});

// ── The dump has to actually load ────────────────────────────────────────────

runIf("restoring the dump", () => {
  /**
   * The test that matters most, and the only one that would have caught the
   * bug this tool shipped with in its first hour.
   *
   * Everything above checks the dump CONTAINS the right things. This checks a
   * MySQL server will accept it — which is the only claim a backup actually
   * makes. A dump of exactly the right shape that no server can parse is the
   * worst outcome available: it looks like a backup until the day it is needed.
   *
   * Restores into a scratch schema and drops it again, so it never touches the
   * database it read from.
   */
  const SCRATCH = "bidrender_backup_restore_test";

  it("restores into an empty database, table for table and row for row", async () => {
    const dump = await dumpDatabase(databaseUrl);

    const connection = await mysql.createConnection({
      uri: databaseUrl,
      multipleStatements: true,
    });

    try {
      const [dbRow] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT DATABASE() AS db"
      );
      const original = dbRow[0].db as string;

      await connection.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
      await connection.query(`CREATE DATABASE \`${SCRATCH}\``);
      await connection.query(`USE \`${SCRATCH}\``);

      // If this throws, the dump is not restorable — which is the whole point.
      await connection.query(dump.sql);

      const rowsIn = async (schema: string, table: string) => {
        const [r] = await connection.query<mysql.RowDataPacket[]>(
          `SELECT COUNT(*) AS n FROM \`${schema}\`.\`${table}\``
        );
        return Number(r[0].n);
      };

      const [restoredTables] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
        [SCRATCH]
      );

      expect(restoredTables.map(t => t.TABLE_NAME).sort()).toEqual(
        dump.tables.map(t => t.table).sort()
      );

      for (const table of dump.tables) {
        expect(
          await rowsIn(SCRATCH, table.table),
          `row count differs for ${table.table}`
        ).toBe(await rowsIn(original, table.table));
      }

      await connection.query(`USE \`${original}\``);
      await connection.query(`DROP DATABASE \`${SCRATCH}\``);
    } finally {
      await connection.end();
    }
  }, 120_000);

  it("round-trips a JSON column without corrupting the statement", async () => {
    /*
     * The regression guard for the shipped bug. mysql2 hands back JSON columns
     * as parsed arrays/objects; the driver's escape() turns an array into a
     * comma-separated value list, which splices extra values into the middle of
     * the row and makes the whole INSERT unparseable.
     *
     * takeoff_runs.points is a real JSON array of vertices, so this was not
     * hypothetical — it corrupted every dump of a database with a traced run.
     */
    const dump = await dumpDatabase(databaseUrl);

    // The array must appear as ONE quoted JSON string, not as loose values.
    expect(dump.sql).toMatch(/'\[\{\\"x\\":1\.5|'\[\{"x": ?1\.5/);
    // And the object likewise, with its inner quotes intact.
    expect(dump.sql).toContain("nested");

    // Belt and braces: no INSERT for the orphan table may contain a bare `[{`,
    // which is what an unserialised array leaks into the SQL.
    const inserts = dump.sql
      .split("\n")
      .filter(
        line => line.includes(ORPHAN_TABLE) || line.trimStart().startsWith("(")
      );
    for (const line of inserts) {
      expect(line).not.toMatch(/,\s*\[\{/);
    }
  });
});

// ── Empty tables ─────────────────────────────────────────────────────────────

runIf("empty tables", () => {
  it("keeps an empty table's schema and emits no INSERT for it", async () => {
    // The crash this guards: building `INSERT ... VALUES;` with no rows, or
    // reading columns off `rows[0]` when there is no row zero.
    const dump = await dumpDatabase(databaseUrl);

    const entry = dump.tables.find(t => t.table === EMPTY_TABLE);
    expect(entry, "the empty table was dropped from the dump").toBeDefined();
    expect(entry?.rows).toBe(0);

    expect(dump.sql).toContain(`CREATE TABLE \`${EMPTY_TABLE}\``);
    expect(dump.sql).not.toMatch(new RegExp(`INSERT INTO \`${EMPTY_TABLE}\``));
  });

  it("does not fail the run because a table is empty", async () => {
    const target = fakeTarget();
    const report = await runBackup({
      databaseUrl,
      target,
      fileSource: streamOf("x"),
    });
    expect(report.ok).toBe(true);
    expect(report.database?.tableCount).toBeGreaterThan(20);
  });
});

// ── Files ────────────────────────────────────────────────────────────────────

describe("stored files", () => {
  it("lists every column in the schema that holds a storage key", () => {
    /*
     * The guard that keeps FILE_SOURCES honest. It reads drizzle/schema.ts for
     * column names that look like storage keys and fails if one is not covered
     * — so a file-bearing column added next year breaks this test rather than
     * silently going unbacked for a year.
     *
     * `*Url` columns are excluded: they are display paths derived from the key
     * beside them, not separate objects.
     */
    const schema = readFileSync("drizzle/schema.ts", "utf8");
    const declared = new Set(FILE_SOURCES.map(s => s.column));

    const suspicious = new Set<string>();
    for (const match of schema.matchAll(/^\s+(\w*(?:K|k)ey)\w*:\s/gm)) {
      const column = match[1];
      // Lookup/grouping keys are not files. Named explicitly so that adding a
      // real file column cannot hide behind a broad pattern.
      if (
        [
          "lookupKey",
          "sourceKey",
          "rawLabelKey",
          "flagKey",
          // A mounting-height TYPE key — "receptacle", "exit-sign". An
          // identifier for a row, not a file in storage.
          "typeKey",
          // markup_rules.itemKey — the material an item markup override is
          // for (`materialItemKey`). An id, not a file.
          "itemKey",
        ].includes(column)
      ) {
        continue;
      }
      suspicious.add(column);
    }

    for (const column of suspicious) {
      expect(
        declared.has(column),
        `drizzle/schema.ts has a storage-key column "${column}" that FILE_SOURCES does not back up`
      ).toBe(true);
    }
    expect(suspicious.size).toBeGreaterThan(0);
  });

  it("covers plan PDFs, legacy project PDFs and the company logo", () => {
    expect(FILE_SOURCES.map(s => `${s.table}.${s.column}`).sort()).toEqual([
      "bid_pdfs.storageKey",
      "company_branding.logoKey",
      "projects.pdfKey",
    ]);
  });
});

runIf("collecting file keys", () => {
  it("returns keys without failing on a database that has none", async () => {
    const { files, warnings } = await collectFiles(databaseUrl);
    expect(Array.isArray(files)).toBe(true);
    expect(Array.isArray(warnings)).toBe(true);
    // Every key is a non-empty string with no leading slash.
    for (const file of files) {
      expect(file.key.length).toBeGreaterThan(0);
      expect(file.key.startsWith("/")).toBe(false);
    }
  });

  it("does not download the same object twice", async () => {
    const { files } = await collectFiles(databaseUrl);
    expect(new Set(files.map(f => f.key)).size).toBe(files.length);
  });
});

// ── Reporting: success and failure both have to be unmistakable ──────────────

runIf("the report says what actually happened", () => {
  it("writes the dump, the files and a manifest on a clean run", async () => {
    const target = fakeTarget();
    const report = await runBackup({
      databaseUrl,
      target,
      fileSource: streamOf("pdf bytes"),
      now: new Date("2026-08-13T22:41:07.000Z"),
    });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.runId).toBe("2026-08-13T22-41-07Z");

    const keys = Array.from(target.written.keys());
    expect(keys).toContain("2026-08-13T22-41-07Z/database.sql.gz");
    expect(keys).toContain("2026-08-13T22-41-07Z/manifest.json");

    // The dump really is in there, not an empty placeholder.
    const dumped = gunzipSync(
      target.written.get("2026-08-13T22-41-07Z/database.sql.gz")!
    ).toString("utf8");
    expect(dumped).toContain("CREATE TABLE");
    expect(dumped).toContain("BidRidge database backup");
  });

  it("puts the outcome in the manifest, beside the data", async () => {
    const target = fakeTarget();
    await runBackup({
      databaseUrl,
      target,
      fileSource: streamOf("x"),
      now: new Date("2026-08-13T22:41:07.000Z"),
    });
    const manifest = JSON.parse(
      target.written.get("2026-08-13T22-41-07Z/manifest.json")!.toString("utf8")
    );
    expect(manifest.ok).toBe(true);
    expect(manifest.database.tableCount).toBeGreaterThan(20);
    expect(manifest.appVersion).toBeTruthy();
    // Which columns were considered file sources, so a future restorer knows
    // what this backup believed it was covering.
    expect(manifest.fileSources.length).toBe(FILE_SOURCES.length);
  });

  it("reports a failed file instead of swallowing it or aborting the rest", async () => {
    // The core anti-silent-failure assertion.
    const target = fakeTarget();
    let call = 0;
    const report = await runBackup({
      databaseUrl,
      target,
      fileSource: sourceThat(async key => {
        call += 1;
        if (call === 1) throw new Error("403 from storage");
        return Buffer.from(`bytes for ${key}`);
      }),
    });

    const { files } = await collectFiles(databaseUrl);
    if (files.length === 0) {
      // Nothing to fail on in this database; the assertion below is vacuous.
      expect(report.ok).toBe(true);
      return;
    }

    expect(report.ok, "a failed file must not report success").toBe(false);
    expect(report.files.failed).toHaveLength(1);
    expect(report.files.failed[0].reason).toContain("403 from storage");
    // And everything else still got copied.
    expect(report.files.copied).toBe(files.length - 1);
    expect(summarise(report)).toContain("FAILED FILE");
  });

  it("stops before reading anything when the destination is unreachable", async () => {
    // Discovering a bad credential after an hour of reading is the expensive
    // way to find a typo.
    const target = fakeTarget({ failCheck: true });
    const report = await runBackup({
      databaseUrl,
      target,
      fileSource: streamOf("x"),
    });

    expect(report.ok).toBe(false);
    expect(report.database).toBeNull();
    expect(target.written.size).toBe(0);
    expect(report.errors[0]).toContain("unreachable");
    expect(report.errors[0]).toContain("Nothing was read");
    expect(summarise(report)).toContain("NOT BACKED UP");
  });

  it("fails loudly when the dump itself cannot be uploaded", async () => {
    const target = fakeTarget({ failOn: /database\.sql\.gz$/ });
    const report = await runBackup({
      databaseUrl,
      target,
      fileSource: streamOf("x"),
    });

    expect(report.ok).toBe(false);
    expect(report.database).toBeNull();
    expect(report.errors.join(" ")).toContain("Database dump failed");
    expect(summarise(report)).toContain("Backup FAILED");
  });

  it("never reports ok when anything at all went wrong", async () => {
    // Belt and braces over the whole shape: `ok` is derived, not set by hand
    // in each branch, so it cannot drift out of step with the failures list.
    const target = fakeTarget({ failCheck: true });
    const report = await runBackup({
      databaseUrl,
      target,
      fileSource: streamOf("x"),
    });
    expect(report.ok).toBe(
      report.errors.length === 0 && report.files.failed.length === 0
    );
  });
});

// ── Reading the backup back ──────────────────────────────────────────────────

describe("finding the newest run", () => {
  it("picks the latest by run id, ignoring other objects", () => {
    expect(
      newestRunId([
        "2026-08-01T00-00-00Z/manifest.json",
        "2026-08-14T06-12-33Z/manifest.json",
        "2026-08-14T06-12-33Z/database.sql.gz",
        "2026-08-03T09-30-00Z/manifest.json",
        "stray-object.txt",
      ])
    ).toBe("2026-08-14T06-12-33Z");
  });

  it("returns null rather than guessing when the bucket is empty", () => {
    expect(newestRunId([])).toBeNull();
    expect(newestRunId(["notes.txt"])).toBeNull();
  });
});

runIf("verifying a backup end to end", () => {
  /**
   * Back up, then read it back and restore it — the full loop, with the bucket
   * faked but the dump, the gzip, the manifest and the restore all real.
   *
   * This is the loop that would have caught the JSON corruption bug on day one,
   * so it is worth having as a test and not only as a script.
   */
  it("verifies a backup it just took", async () => {
    const target = fakeTarget();
    const report = await runBackup({
      databaseUrl,
      target,
      fileSource: streamOf("file bytes"),
    });
    expect(report.ok).toBe(true);

    const result = await verifyBackup({
      target,
      scratchDatabaseUrl: databaseUrl,
      scratchSchema: "bidrender_verify_selftest",
    });

    expect(result.errors).toEqual([]);
    expect(result.mismatches).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.runId).toBe(report.runId);
    // The restore reproduced exactly what the manifest claimed.
    expect(result.restored).toEqual(result.claimed);
    expect(result.restored!.tables).toBe(report.database!.tableCount);
  }, 120_000);

  it("REFUSES to verify a dump that has been corrupted", async () => {
    /*
     * The assertion that makes the verifier worth running. A checker that
     * cannot fail is theatre — so this takes a real backup, damages the SQL
     * inside the gzip the way the JSON bug did, and requires the verifier to
     * notice.
     */
    const target = fakeTarget();
    const report = await runBackup({
      databaseUrl,
      target,
      fileSource: streamOf("x"),
    });

    const key = `${report.runId}/database.sql.gz`;
    const sql = gunzipSync(target.written.get(key)!).toString("utf8");
    // Exactly the shape of the original bug: an array spliced in as loose
    // values, making the INSERT unparseable.
    const damaged = sql.replace(
      /INSERT INTO `assemblies`/,
      'INSERT INTO `assemblies` (bogus, [{"x":1}])'
    );
    target.written.set(key, gzipSync(Buffer.from(damaged, "utf8")));

    const result = await verifyBackup({
      target,
      scratchDatabaseUrl: databaseUrl,
      scratchSchema: "bidrender_verify_corrupt",
    });

    expect(result.ok, "a corrupted dump must not verify").toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(summariseVerify(result)).toContain("NOT VERIFIED");
  }, 120_000);

  it("notices when the restore does not match the manifest", async () => {
    // A dump that loads but produces different data than claimed is the subtler
    // failure — silent partial loss rather than a parse error.
    const target = fakeTarget();
    const report = await runBackup({
      databaseUrl,
      target,
      fileSource: streamOf("x"),
    });

    const manifestKey = `${report.runId}/manifest.json`;
    const manifest = JSON.parse(
      target.written.get(manifestKey)!.toString("utf8")
    );
    // Claim a table has more rows than it does.
    manifest.database.tables[0].rows += 999;
    target.written.set(
      manifestKey,
      Buffer.from(JSON.stringify(manifest), "utf8")
    );

    const result = await verifyBackup({
      target,
      scratchDatabaseUrl: databaseUrl,
      scratchSchema: "bidrender_verify_mismatch",
    });

    expect(result.ok).toBe(false);
    expect(result.mismatches.join(" ")).toContain("manifest");
  }, 120_000);
});

// ── Summaries a human reads at 2am ───────────────────────────────────────────

describe("the summary line", () => {
  it("leads with the verdict, not the detail", () => {
    const base = {
      runId: "2026-08-13T22-41-07Z",
      target: "fake://memory",
      startedAt: "",
      finishedAt: "",
      appVersion: "v5.97",
      database: { tables: [], tableCount: 34, rowCount: 100, dumpBytes: 2048 },
      files: { found: 2, copied: 2, bytes: 10, failed: [] },
      warnings: [],
      errors: [],
    };
    expect(
      summarise({ ...base, ok: true, status: "clean" as const }).split("\n")[0]
    ).toContain("Backup OK");
    expect(
      summarise({
        ...base,
        ok: false,
        status: "failed" as const,
        errors: ["boom"],
      }).split("\n")[0]
    ).toContain("Backup FAILED");

    /**
     * Partial names the shortfall on the first line. Anyone skimming a log at
     * 2am reads only that line, and a bare "PARTIAL" gets filed as a synonym
     * for OK — which is the exact misreading the third state exists to prevent.
     */
    const partial = summarise({
      ...base,
      ok: false,
      status: "partial" as const,
      files: {
        found: 2,
        copied: 1,
        bytes: 10,
        failed: [
          { key: "bid-plans/1/9/E1.pdf", reason: "storage returned 403" },
        ],
      },
    }).split("\n");
    expect(partial[0]).toContain("Backup PARTIAL");
    expect(partial[0]).toContain("database safe");
    expect(partial.join("\n")).toContain("bid-plans/1/9/E1.pdf");

    /**
     * A manifest written before `status` existed carries only `ok`. This is the
     * tool someone points at a run to find out what happened, so an unknown
     * status must degrade to a real verdict rather than a blank first line.
     */
    const legacy = summarise({
      ...base,
      ok: true,
      status: undefined as unknown as "clean",
    }).split("\n")[0];
    expect(legacy).toContain("Backup OK");
  });
});

// ── The run id ───────────────────────────────────────────────────────────────

describe("run ids", () => {
  it("sorts chronologically and is legal in an object key", () => {
    const early = runIdFor(new Date("2026-01-02T03:04:05.000Z"));
    const late = runIdFor(new Date("2026-11-02T03:04:05.000Z"));
    expect(early < late).toBe(true);
    // Colons are legal in S3 keys but awkward everywhere else they get copied.
    expect(early).not.toContain(":");
    expect(early).toBe("2026-01-02T03-04-05Z");
  });
});

// ── Secrets ──────────────────────────────────────────────────────────────────

describe("credentials never leave the server", () => {
  const full = {
    R2_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "public-id",
    R2_SECRET_ACCESS_KEY: "SUPER-SECRET-VALUE",
    R2_BUCKET: "bidrender-backups",
  } as unknown as NodeJS.ProcessEnv;

  it("reads config from the environment, with a derived endpoint", () => {
    const result = readR2Config(full);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.endpoint).toBe(
      "https://acct.r2.cloudflarestorage.com"
    );
    expect(result.config.prefix).toBe("helixbid");
  });

  it("names what is missing rather than half-configuring itself", () => {
    // A config that half-loads fails at upload time, after everything has been
    // read — the most expensive moment to learn about a typo.
    const result = readR2Config({ R2_ACCOUNT_ID: "acct" } as NodeJS.ProcessEnv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual([
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
    ]);
  });

  it("keeps the secret out of anything the client could see", () => {
    const described = describeConfig(readR2Config(full));
    const serialised = JSON.stringify(described);
    expect(serialised).not.toContain("SUPER-SECRET-VALUE");
    expect(serialised).not.toContain("public-id");
    expect(described.configured).toBe(true);
    expect(described.bucket).toBe("bidrender-backups");
  });

  it("uses no VITE_-prefixed variable, which would be bundled to the browser", () => {
    // Vite inlines every VITE_* var into the client bundle at build time.
    for (const name of REQUIRED_VARS) {
      expect(name.startsWith("VITE_")).toBe(false);
    }
    const config = readFileSync("server/backup/config.ts", "utf8");
    expect(config).not.toMatch(/VITE_[A-Z_]*(KEY|SECRET|TOKEN)/);
  });
});
