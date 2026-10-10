/**
 * The no-match search log (todo.md § "Before beta: when the picker finds
 * nothing", item a). What must hold:
 *
 *   • only the words are kept, normalised, under the company's id;
 *   • the same words from one company within ten minutes are one search;
 *   • the admin list folds repeats into one line with a count, newest first,
 *     and keeps the two pickers apart;
 *   • only an admin can read it;
 *   • with the table ABSENT — the state until Track A's migration runs —
 *     recording writes nothing and throws nothing, and the list says it is
 *     not set up. That is what makes the code safe to ship first.
 *
 * ── A scratch schema of its own, on purpose ──────────────────────────────────
 * The table is declared outside drizzle/schema.ts until its migration exists
 * (server/searchMissLog.ts says why), so these tests have to create it. They
 * do that in `<test db>__search_miss`, never in the shared test database:
 * creating, renaming and dropping a table there raced `backup.test.ts`, which
 * lists every table and then reads each one, so a table vanishing between
 * the two would fail a suite that has nothing to do with this one.
 *
 * The router checks at the bottom use the app's own database, whatever state
 * it is in — before the migration that is "absent", and `record` must still
 * answer normally.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  SEARCH_MISSES_CREATE_SQL,
  SEARCH_MISS_REPEAT_WINDOW_MS,
  listSearchMisses,
  recordSearchMiss,
  searchMisses,
} from "./searchMissLog";
import {
  compareTable,
  declaredTable,
  isMissingTable,
  type LiveColumn,
} from "./schemaCheck";
import { mysqlConnection } from "./databaseConnection";
import { scratchSchemaFor } from "../scripts/testSuiteLock";
import { normalizeMissWords } from "../shared/searchMiss";

const databaseUrl = process.env.DATABASE_URL ?? "";
const hasDb = Boolean(databaseUrl);
const COMPANY = 9868;
const OTHER_COMPANY = 9869;

describe("which words are kept", () => {
  it("trims, collapses spaces and lower-cases", () => {
    expect(normalizeMissWords("  Sealtite   90  ")).toBe("sealtite 90");
  });
  it("keeps nothing for an empty box or one letter", () => {
    expect(normalizeMissWords("")).toBe(null);
    expect(normalizeMissWords("   ")).toBe(null);
    expect(normalizeMissWords(" q ")).toBe(null);
  });
  it("drops control characters a paste can carry", () => {
    expect(normalizeMissWords(`gem${String.fromCharCode(9)}box`)).toBe(
      "gem box"
    );
    expect(normalizeMissWords(`gem${String.fromCharCode(0)}box`)).toBe(
      "gem box"
    );
  });
  it("cuts a paste down to the column's length", () => {
    expect(normalizeMissWords("a".repeat(500))?.length).toBe(120);
  });
});

describe.skipIf(!hasDb)("the search-miss table, in a scratch schema", () => {
  const SCRATCH = hasDb ? scratchSchemaFor(databaseUrl, "search_miss") : "";
  let admin: mysql.Connection;
  let pool: mysql.Pool;
  let db: MySql2Database;

  const createTable = async () => {
    for (const statement of SEARCH_MISSES_CREATE_SQL.split(/;\s*\n/)) {
      if (statement.trim()) await db.execute(sql.raw(statement));
    }
  };

  beforeAll(async () => {
    admin = await mysql.createConnection(mysqlConnection(databaseUrl));
    const [[{ main }]] = (await admin.query(
      "SELECT DATABASE() AS main"
    )) as unknown as [{ main: string }[]];
    await admin.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
    await admin.query(
      `CREATE DATABASE \`${SCRATCH}\` COLLATE utf8mb4_unicode_ci`
    );
    // The foreign key needs a users table to point at; its rows are ours.
    await admin.query(
      `CREATE TABLE \`${SCRATCH}\`.\`users\` LIKE \`${main}\`.\`users\``
    );
    for (const id of [COMPANY, OTHER_COMPANY])
      await admin.query(
        `INSERT INTO \`${SCRATCH}\`.\`users\` (id, openId, name) VALUES (?, ?, ?)`,
        [id, `test-search-miss-${id}`, "Search miss test user"]
      );

    const url = new URL(databaseUrl);
    url.pathname = `/${SCRATCH}`;
    pool = mysql.createPool(mysqlConnection(url.toString()));
    db = drizzle(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
    await admin?.end();
  });

  // First, while the scratch schema has no search_misses at all.
  it("with the table ABSENT, records nothing, throws nothing, and the list says so", async () => {
    expect(
      await recordSearchMiss(
        {
          companyUserId: COMPANY,
          picker: "assembly",
          words: "absent words",
          now: new Date(),
        },
        db
      )
    ).toEqual({ stored: false, reason: "not-set-up" });
    expect(await listSearchMisses(db)).toEqual({ ready: false, rows: [] });
  });

  it("the migration's SQL builds exactly what the code declares", async () => {
    await createTable();
    const [live] = (await db.execute(
      sql`SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLUMN_DEFAULT, EXTRA, COLLATION_NAME
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'search_misses'`
    )) as unknown as [LiveColumn[]];
    expect(live.length).toBeGreaterThan(0);
    expect(compareTable(declaredTable(searchMisses)!, live)).toBe(null);
  });

  it("stores the words, normalised, and once per ten minutes", async () => {
    const at = new Date("2026-10-09T12:00:00Z");
    const record = (words: string, now: Date, company = COMPANY) =>
      recordSearchMiss(
        { companyUserId: company, picker: "assembly", words, now },
        db
      );

    expect(await record("  CEILING Fan  ", at)).toEqual({ stored: true });
    expect(
      await record("ceiling fan", new Date(at.getTime() + 60_000))
    ).toEqual({ stored: false, reason: "repeat" });
    // Another company searching the same thing is a second search.
    expect(await record("ceiling fan", at, OTHER_COMPANY)).toEqual({
      stored: true,
    });
    // Past the window, the same company again counts again.
    expect(
      await record(
        "ceiling fan",
        new Date(at.getTime() + SEARCH_MISS_REPEAT_WINDOW_MS + 1000)
      )
    ).toEqual({ stored: true });
    expect(await record(" ", at)).toEqual({ stored: false, reason: "empty" });

    const rows = await db.select().from(searchMisses);
    expect(rows.map(r => r.words)).toEqual([
      "ceiling fan",
      "ceiling fan",
      "ceiling fan",
    ]);
    expect(rows.filter(r => r.companyUserId === COMPANY)).toHaveLength(2);
  });

  it("lists one line per search, repeats counted, newest first, pickers apart", async () => {
    await recordSearchMiss(
      {
        companyUserId: COMPANY,
        picker: "material",
        words: "ceiling fan",
        now: new Date("2026-10-09T13:00:00Z"),
      },
      db
    );
    await recordSearchMiss(
      {
        companyUserId: COMPANY,
        picker: "assembly",
        words: "older search",
        now: new Date("2026-10-01T09:00:00Z"),
      },
      db
    );

    const list = await listSearchMisses(db);
    expect(list.ready).toBe(true);
    expect(
      list.rows.map(({ picker, words, times, companies }) => ({
        picker,
        words,
        times,
        companies,
      }))
    ).toEqual([
      // 13:00 — the newest miss of all, so first.
      { picker: "material", words: "ceiling fan", times: 1, companies: 1 },
      // Last seen 12:10, three times, by two companies.
      { picker: "assembly", words: "ceiling fan", times: 3, companies: 2 },
      { picker: "assembly", words: "older search", times: 1, companies: 1 },
    ]);
  });
});

describe.skipIf(!hasDb)("the router, on the app's own database", () => {
  beforeAll(async () => {
    const appDb = await getDb();
    const [existing] = await appDb!
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing)
      await appDb!.insert(users).values({
        id: COMPANY,
        openId: `test-search-miss-${COMPANY}`,
        name: "Search miss test user",
      });
  });

  afterAll(async () => {
    // Once the migration has run here, `record` really stores; take it back.
    const appDb = await getDb();
    try {
      await appDb!
        .delete(searchMisses)
        .where(eq(searchMisses.companyUserId, COMPANY));
    } catch (err) {
      if (!isMissingTable(err)) throw err;
    }
  });

  const ctxFor = (role: "user" | "admin") =>
    ({
      user: { id: COMPANY, openId: `test-search-miss-${COMPANY}`, role },
    }) as unknown as TrpcContext;

  it("record answers normally whether or not the table exists yet", async () => {
    await expect(
      appRouter
        .createCaller(ctxFor("user"))
        .searchMisses.record({ picker: "material", words: "router probe" })
    ).resolves.toEqual({ ok: true });
  });

  it("only an admin can read the list", async () => {
    await expect(
      appRouter.createCaller(ctxFor("user")).searchMisses.list()
    ).rejects.toThrow();
    const list = await appRouter
      .createCaller(ctxFor("admin"))
      .searchMisses.list();
    expect(typeof list.ready).toBe("boolean");
  });
});
