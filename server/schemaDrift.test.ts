/**
 * The rule that no ordinary test catches: the database has the columns the code
 * declares.
 *
 * ── Why this is a test rather than only a script ─────────────────────────────
 * Every read in this app is a bare `select()`, which drizzle expands to every
 * column in drizzle/schema.ts. So adding a column to the schema and forgetting
 * to generate or apply its migration does not break the feature being built —
 * it breaks every UNRELATED screen that reads the same table, at runtime, on
 * whichever environment is behind. The bid archive is the case that prompted
 * this: `getArchivedBids` names `isSample` and the four tax columns whether or
 * not a bid uses them, so a database without migration 0043 failed the whole
 * archive query while everything the author was working on looked fine.
 *
 * A test cannot fix a deployed database. What it can do is make the mistake
 * visible at the moment it is made, on the machine of the person who made it,
 * instead of days later in somebody else's console.
 *
 * Same genre as server/scopeDiscipline.test.ts — a mechanical rule that happens
 * to live in the suite because there is nowhere better to put it.
 *
 * ── A failure here is not flaky ──────────────────────────────────────────────
 * It is deterministic and it names the fix. If it fails, this machine's
 * database is behind: run `pnpm db:push`. That is the good kind of red — it
 * tells you something true that you needed to know.
 */
import { describe, it, expect } from "vitest";
import {
  compareTable,
  declaredTables,
  describeDrift,
  findSchemaDrift,
  type LiveColumn,
} from "./schemaCheck";

/** The declared table, from drizzle/schema.ts itself — not a hand-made copy. */
function declared(name: string) {
  const table = declaredTables().find(t => t.name === name);
  if (!table) throw new Error(`${name} is not declared`);
  return table;
}

/**
 * What information_schema would return for a database that agrees with the
 * schema on everything — except the columns named in `overrides`.
 */
function liveColumnsFor(
  name: string,
  overrides: Record<string, "YES" | "NO" | null> = {}
): LiveColumn[] {
  const rows: LiveColumn[] = [];
  for (const column of declared(name).columns) {
    const override = overrides[column.name];
    if (override === null) continue; // absent from the database
    rows.push({
      COLUMN_NAME: column.name,
      IS_NULLABLE: override ?? (column.nullable ? "YES" : "NO"),
    });
  }
  return rows;
}

describe("nullability drift — the gap found deploying 0074/0075", () => {
  /*
    Production on 2026-09-25, measured before the migrations ran: both columns
    present, both NOT NULL. The code about to ship writes NULL into both when a
    free count is sent. The presence-only check said "Database matches the
    schema." This is that database, column for column.
  */
  const beforeMigration = liveColumnsFor("bid_line_items", {
    snapshotMaterialCost: "NO",
    snapshotLaborHours: "NO",
  });

  it("reports a column the schema allows NULL in and the database does not", () => {
    const drift = compareTable(declared("bid_line_items"), beforeMigration);
    expect(drift).not.toBeNull();
    // Every column is present — which is exactly why presence alone passed.
    expect(drift!.missingColumns).toEqual([]);
    expect(drift!.nullability).toEqual([
      {
        column: "snapshotMaterialCost",
        schemaNullable: true,
        databaseNullable: false,
      },
      {
        column: "snapshotLaborHours",
        schemaNullable: true,
        databaseNullable: false,
      },
    ]);
    expect(describeDrift([drift!])).toContain(
      "bid_line_items.snapshotMaterialCost — schema allows NULL, database NOT NULL"
    );
  });

  it("stops reporting once the migration has run", () => {
    const afterMigration = liveColumnsFor("bid_line_items", {
      snapshotMaterialCost: "YES",
      snapshotLaborHours: "YES",
    });
    expect(compareTable(declared("bid_line_items"), afterMigration)).toBeNull();
  });

  it("reports the other direction too — schema NOT NULL, database allows NULL", () => {
    // `bids.name` is NOT NULL in the schema. A database letting NULL in hands
    // the code a value its types say cannot exist.
    const drift = compareTable(
      declared("bids"),
      liveColumnsFor("bids", { name: "YES" })
    );
    expect(drift!.nullability).toEqual([
      { column: "name", schemaNullable: false, databaseNullable: true },
    ]);
    expect(describeDrift([drift!])).toContain(
      "bids.name — schema NOT NULL, database allows NULL"
    );
  });

  it("reports a missing column as missing, not also as a nullability mismatch", () => {
    const drift = compareTable(
      declared("bids"),
      liveColumnsFor("bids", { quantitiesLockedAt: null })
    );
    expect(drift!.missingColumns).toEqual(["quantitiesLockedAt"]);
    expect(drift!.nullability).toEqual([]);
  });

  it("still reports a missing table exactly as before", () => {
    const drift = compareTable(declared("bids"), []);
    expect(drift!.missingTable).toBe(true);
    expect(describeDrift([drift!])).toContain("bids — table missing entirely");
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("the database matches the schema", () => {
  it("has every column the code declares", async () => {
    const drift = await findSchemaDrift();
    // The message carries the whole diagnosis, so a failure reads as
    // instructions rather than as a bare length mismatch.
    expect(describeDrift(drift)).toBe("Database matches the schema.");
    expect(drift).toEqual([]);
  });

  it("names the missing columns when something is adrift", () => {
    // The reporting itself, without needing a broken database to see it.
    const message = describeDrift([
      {
        table: "bids",
        missingTable: false,
        missingColumns: ["isSample"],
        nullability: [],
      },
    ]);
    expect(message).toContain("bids — missing isSample");
    expect(message).toContain("pnpm db:push");
  });
});
