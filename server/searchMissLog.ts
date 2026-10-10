/**
 * The no-match search log — storage. See shared/searchMiss.ts for what it is.
 *
 * ── Why the table is declared HERE and not in drizzle/schema.ts ─────────────
 * `search_misses` needs a migration, and migrations are Track A's. Until that
 * file is written and applied, declaring the table in drizzle/schema.ts would
 * make `schemaDrift.test.ts` red on every machine and make drizzle-kit queue
 * a CREATE nobody read. So the declaration lives in this module, which
 * neither of those reads, and every query below survives the table being
 * absent:
 *
 *   - `recordSearchMiss` writes nothing and says so (`stored: false`);
 *   - `listSearchMisses` returns `ready: false`, and the admin panel says the
 *     log is not set up on this database yet.
 *
 * So the code is safe in either order: shipped before the migration, it logs
 * nothing; the migration applied before the code, the table sits empty. When
 * Track A writes the migration (track-b-handoff.md has the exact SQL), this
 * declaration moves into drizzle/schema.ts unchanged.
 *
 * ── What is stored, and what never is ────────────────────────────────────────
 * The company (the owner's id, `ctx.scope.dataUserId` — the same id every
 * other company row carries), which picker, the words, the time. Not the
 * person who typed it, not the bid, not a price.
 */
import { and, count, desc, eq, gte, max, min, sql } from "drizzle-orm";
import {
  index,
  int,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { users } from "../drizzle/schema";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { getDb } from "./db";
import { isMissingTable } from "./schemaCheck";
import {
  SEARCH_MISS_MAX_LENGTH,
  normalizeMissWords,
  type SearchMissPicker,
} from "../shared/searchMiss";

export const searchMisses = mysqlTable(
  "search_misses",
  {
    id: int("id").autoincrement().primaryKey(),
    /** The COMPANY (owner's user id), never the person who typed. */
    companyUserId: int("companyUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "assembly" | "material" — shared/searchMiss.ts SEARCH_MISS_PICKERS. */
    picker: varchar("picker", { length: 16 }).notNull(),
    words: varchar("words", { length: SEARCH_MISS_MAX_LENGTH }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("search_misses_company_words_idx").on(
      t.companyUserId,
      t.picker,
      t.words
    ),
    index("search_misses_createdAt_idx").on(t.createdAt),
  ]
);

/**
 * The CREATE that Track A's migration copies, word for word. Kept beside the
 * declaration so `searchMissLog.test.ts` can create the table from THIS text
 * (in a scratch schema of its own) and compare what MySQL built against the
 * declaration above — a mismatch is a red test here, not drift on staging.
 *
 * ADDITIVE, step 1: a new table, nothing existing changes. The code already
 * survives its absence (see the header), so it may go before or after.
 */
export const SEARCH_MISSES_CREATE_SQL = `CREATE TABLE \`search_misses\` (
	\`id\` int AUTO_INCREMENT NOT NULL,
	\`companyUserId\` int NOT NULL,
	\`picker\` varchar(16) NOT NULL,
	\`words\` varchar(120) NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`search_misses_id\` PRIMARY KEY(\`id\`),
	CONSTRAINT \`search_misses_companyUserId_users_id_fk\` FOREIGN KEY (\`companyUserId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE INDEX \`search_misses_company_words_idx\` ON \`search_misses\` (\`companyUserId\`,\`picker\`,\`words\`);
CREATE INDEX \`search_misses_createdAt_idx\` ON \`search_misses\` (\`createdAt\`);`;

/**
 * The same words from the same company inside this window are one search.
 * A picker records once per opening; this catches the same person opening it
 * again a minute later, or two colleagues searching the same thing at once.
 */
export const SEARCH_MISS_REPEAT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Most rows one company can add in a day. Far above any real day of
 * searching; it exists so a stuck client or a script cannot fill the table.
 */
export const SEARCH_MISS_DAILY_CAP = 500;

export type RecordResult =
  | { stored: true }
  | {
      stored: false;
      reason: "empty" | "repeat" | "cap" | "not-set-up" | "no-database";
    };

/**
 * The app's database, unless a caller passes another. Only the test passes
 * one: it works in a scratch schema of its own, because creating, renaming
 * and dropping this table in the SHARED test database raced
 * `backup.test.ts`, which lists every table and then reads each one.
 */
type Database = MySql2Database;
const appDatabase = (): Promise<Database | null> => getDb();

export async function recordSearchMiss(
  input: {
    companyUserId: number;
    picker: SearchMissPicker;
    words: string;
    now: Date;
  },
  database?: Database
): Promise<RecordResult> {
  const words = normalizeMissWords(input.words);
  if (words === null) return { stored: false, reason: "empty" };
  const db = database ?? (await appDatabase());
  if (!db) return { stored: false, reason: "no-database" };
  try {
    const recent = await db
      .select({ id: searchMisses.id })
      .from(searchMisses)
      .where(
        and(
          eq(searchMisses.companyUserId, input.companyUserId),
          eq(searchMisses.picker, input.picker),
          eq(searchMisses.words, words),
          gte(
            searchMisses.createdAt,
            new Date(input.now.getTime() - SEARCH_MISS_REPEAT_WINDOW_MS)
          )
        )
      )
      .limit(1);
    if (recent.length > 0) return { stored: false, reason: "repeat" };

    const [today] = await db
      .select({ n: count() })
      .from(searchMisses)
      .where(
        and(
          eq(searchMisses.companyUserId, input.companyUserId),
          gte(
            searchMisses.createdAt,
            new Date(input.now.getTime() - 24 * 60 * 60 * 1000)
          )
        )
      );
    if ((today?.n ?? 0) >= SEARCH_MISS_DAILY_CAP)
      return { stored: false, reason: "cap" };

    await db.insert(searchMisses).values({
      companyUserId: input.companyUserId,
      picker: input.picker,
      words,
      createdAt: input.now,
    });
    return { stored: true };
  } catch (err) {
    if (isMissingTable(err)) return { stored: false, reason: "not-set-up" };
    throw err;
  }
}

/** One line of the admin list: a search and how often it came up empty. */
export interface SearchMissSummary {
  picker: string;
  words: string;
  /** Every time it was recorded, repeats included. */
  times: number;
  /** How many different companies searched it. */
  companies: number;
  firstAt: Date;
  lastAt: Date;
}

/** The admin list holds this many lines; older ones are still stored. */
export const SEARCH_MISS_LIST_LIMIT = 300;

/**
 * One line per picker and words, repeats counted, NEWEST FIRST by the last
 * time it came up empty. The same words in the two pickers stay two lines: a
 * material nobody can find and an assembly nobody can find are two gaps.
 */
export async function listSearchMisses(
  database?: Database
): Promise<
  { ready: true; rows: SearchMissSummary[] } | { ready: false; rows: [] }
> {
  const db = database ?? (await appDatabase());
  if (!db) return { ready: false, rows: [] };
  try {
    const lastAt = max(searchMisses.createdAt);
    const rows = await db
      .select({
        picker: searchMisses.picker,
        words: searchMisses.words,
        times: count(),
        companies: sql<number>`COUNT(DISTINCT ${searchMisses.companyUserId})`,
        firstAt: min(searchMisses.createdAt),
        lastAt,
      })
      .from(searchMisses)
      .groupBy(searchMisses.picker, searchMisses.words)
      .orderBy(desc(lastAt), desc(count()), searchMisses.words)
      .limit(SEARCH_MISS_LIST_LIMIT);
    return {
      ready: true,
      rows: rows.map(row => ({
        picker: row.picker,
        words: row.words,
        times: Number(row.times),
        companies: Number(row.companies),
        firstAt: new Date(row.firstAt ?? 0),
        lastAt: new Date(row.lastAt ?? 0),
      })),
    };
  } catch (err) {
    if (isMissingTable(err)) return { ready: false, rows: [] };
    throw err;
  }
}
