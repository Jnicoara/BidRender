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
  EXPECTED_COLLATION,
  NO_DEFAULT,
  canonicalDefault,
  compareTable,
  declaredTables,
  describeDrift,
  findSchemaDrift,
  liveDefault,
  normalizeColumnType,
  type LiveColumn,
} from "./schemaCheck";

/** The declared table, from drizzle/schema.ts itself — not a hand-made copy. */
function declared(name: string) {
  const table = declaredTables().find(t => t.name === name);
  if (!table) throw new Error(`${name} is not declared`);
  return table;
}

/**
 * The COLUMN_TYPE MySQL 8 actually reports for a declared type — measured
 * 2026-09-25, and identical to drizzle's DDL for every column except
 * `boolean`, which MySQL stores and reports as `tinyint(1)`. Spelled the way
 * the database spells it on purpose, so a helper that agreed with the schema
 * by construction cannot hide a false alarm.
 */
function asMysqlReports(type: string): string {
  return type === "boolean" ? "tinyint(1)" : type;
}

/**
 * COLUMN_DEFAULT and EXTRA as MySQL 8 reports a declared default — in
 * MySQL's spelling, NOT the check's canonical one, for the same reason as
 * above. Measured 2026-09-25 on production: a decimal default comes back at
 * the column's scale (`0.0000`), the current time as `now()` flagged
 * DEFAULT_GENERATED, and "no default" as NULL.
 */
function defaultAsMysqlReports(
  type: string,
  canonical: string
): { COLUMN_DEFAULT: string | null; EXTRA: string } {
  const onUpdate = canonical.endsWith(", on update current_timestamp");
  const value = canonical.replace(", on update current_timestamp", "");
  const extraOnUpdate = onUpdate ? "on update CURRENT_TIMESTAMP" : "";
  if (value === NO_DEFAULT)
    return { COLUMN_DEFAULT: null, EXTRA: extraOnUpdate };
  if (value === "current_timestamp") {
    return {
      COLUMN_DEFAULT: "now()",
      EXTRA: ("DEFAULT_GENERATED " + extraOnUpdate).trim(),
    };
  }
  const scale = /^decimal\(\d+,(\d+)\)/.exec(type);
  return {
    COLUMN_DEFAULT: scale ? Number(value).toFixed(Number(scale[1])) : value,
    EXTRA: extraOnUpdate,
  };
}

/** A string type carries a collation; numbers, dates and json do not. */
function collationFor(type: string): string | null {
  return /^(varchar|char|text|tinytext|mediumtext|longtext|enum|set)\b/.test(
    type
  )
    ? EXPECTED_COLLATION
    : null;
}

type Override =
  | "YES"
  | "NO"
  | {
      type?: string;
      default?: string | null;
      extra?: string;
      collation?: string;
    }
  | null;

/**
 * What information_schema would return for a database that agrees with the
 * schema on everything — except the columns named in `overrides`, which set
 * nullability ("YES"/"NO"), any of type / default / extra / collation, or
 * absence (null).
 */
function liveColumnsFor(
  name: string,
  overrides: Record<string, Override> = {}
): LiveColumn[] {
  const rows: LiveColumn[] = [];
  for (const column of declared(name).columns) {
    const override = overrides[column.name];
    if (override === null) continue; // absent from the database
    const set = typeof override === "object" ? override : {};
    const reported = defaultAsMysqlReports(column.type, column.default);
    rows.push({
      COLUMN_NAME: column.name,
      IS_NULLABLE:
        typeof override === "string"
          ? override
          : column.nullable
            ? "YES"
            : "NO",
      COLUMN_TYPE: set.type ?? asMysqlReports(column.type),
      COLUMN_DEFAULT:
        set.default !== undefined ? set.default : reported.COLUMN_DEFAULT,
      EXTRA: set.extra ?? reported.EXTRA,
      COLLATION_NAME: set.collation ?? collationFor(column.type),
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

describe("type drift — the column exists, allows the right NULLs, and is the wrong type", () => {
  it("does not false-alarm on a whole real table as MySQL reports it", () => {
    // Every declared table, with booleans spelled tinyint(1) the way MySQL 8
    // reports them. This is the guard against the check being noisy — a check
    // that cries wolf on a healthy database gets ignored on a broken one.
    for (const table of declaredTables()) {
      expect(compareTable(table, liveColumnsFor(table.name))).toBeNull();
    }
  });

  it("catches an integer where the schema says bigint", () => {
    // bid_pdfs.byteSize was an int, which tops out one byte under 2GB — a 2GB
    // plan set uploaded perfectly and then failed to attach (CLAUDE.md § Large
    // plan sets). A database still holding the old type is exactly this.
    const drift = compareTable(
      declared("bid_pdfs"),
      liveColumnsFor("bid_pdfs", { byteSize: { type: "int" } })
    );
    expect(drift!.types).toEqual([
      { column: "byteSize", schemaType: "bigint", databaseType: "int" },
    ]);
    expect(drift!.missingColumns).toEqual([]);
    expect(drift!.nullability).toEqual([]);
    expect(describeDrift([drift!])).toContain(
      "bid_pdfs.byteSize — schema bigint, database int"
    );
  });

  it("catches text where the schema says varchar", () => {
    const drift = compareTable(
      declared("takeoff_groups"),
      liveColumnsFor("takeoff_groups", { label: { type: "text" } })
    );
    expect(drift!.types).toEqual([
      { column: "label", schemaType: "varchar(255)", databaseType: "text" },
    ]);
  });

  it("catches a WIDTH — the same type, narrower", () => {
    const drift = compareTable(
      declared("bid_line_items"),
      liveColumnsFor("bid_line_items", { unitLabel: { type: "varchar(64)" } })
    );
    expect(drift!.types).toEqual([
      {
        column: "unitLabel",
        schemaType: "varchar(128)",
        databaseType: "varchar(64)",
      },
    ]);
  });

  it("catches a decimal whose precision or scale moved", () => {
    const drift = compareTable(
      declared("bid_line_items"),
      liveColumnsFor("bid_line_items", {
        snapshotMaterialCost: { type: "decimal(10,4)" },
        snapshotLaborRate: { type: "decimal(10,2)" },
      })
    );
    expect(drift!.types.map(t => t.column)).toEqual([
      "snapshotMaterialCost",
      "snapshotLaborRate",
    ]);
  });

  it("catches an enum whose values differ — including only by case", () => {
    // An enum's values are data. 'won' is not 'Won', and a database holding the
    // other spelling refuses what the code writes.
    const drift = compareTable(
      declared("bids"),
      liveColumnsFor("bids", {
        status: { type: "enum('Draft','Active','won','Lost')" },
      })
    );
    expect(drift!.types.map(t => t.column)).toEqual(["status"]);
  });

  it("reports a type mismatch and a nullability mismatch on one column separately", () => {
    const live = liveColumnsFor("bid_line_items").map(row =>
      row.COLUMN_NAME === "snapshotMaterialCost"
        ? { ...row, IS_NULLABLE: "NO", COLUMN_TYPE: "decimal(10,4)" }
        : row
    );
    const drift = compareTable(declared("bid_line_items"), live);
    expect(drift!.nullability.map(n => n.column)).toEqual([
      "snapshotMaterialCost",
    ]);
    expect(drift!.types.map(t => t.column)).toEqual(["snapshotMaterialCost"]);
  });
});

describe("the equivalent spellings MySQL uses for one type", () => {
  it("treats boolean and tinyint(1) as the same type", () => {
    expect(normalizeColumnType("boolean")).toBe(
      normalizeColumnType("tinyint(1)")
    );
    expect(normalizeColumnType("bool")).toBe(normalizeColumnType("tinyint"));
  });

  it("ignores integer DISPLAY widths, which older servers print", () => {
    expect(normalizeColumnType("int(11)")).toBe("int");
    expect(normalizeColumnType("bigint(20)")).toBe("bigint");
    expect(normalizeColumnType("integer")).toBe("int");
  });

  it("keeps unsigned, which is storage rather than formatting", () => {
    expect(normalizeColumnType("int(10) unsigned")).toBe("int unsigned");
    expect(normalizeColumnType("int unsigned")).not.toBe(
      normalizeColumnType("int")
    );
  });

  it("ignores keyword case, but never the case of an enum's values", () => {
    expect(normalizeColumnType("VARCHAR(255)")).toBe("varchar(255)");
    expect(normalizeColumnType("ENUM('Won','Lost')")).toBe(
      "enum('Won','Lost')"
    );
    expect(normalizeColumnType("enum('Won')")).not.toBe(
      normalizeColumnType("enum('won')")
    );
  });

  it("does not treat a width as an alias — varchar(64) is not varchar(128)", () => {
    expect(normalizeColumnType("varchar(64)")).not.toBe(
      normalizeColumnType("varchar(128)")
    );
    expect(normalizeColumnType("decimal(10,4)")).not.toBe(
      normalizeColumnType("decimal(12,4)")
    );
  });
});

describe("default drift — the column is right and its default is not", () => {
  it("catches a default whose VALUE changed", () => {
    // bid_line_items.qty defaults to 1: a line added without a quantity is
    // one of the thing. A database defaulting to 2 doubles it, silently.
    const drift = compareTable(
      declared("bid_line_items"),
      liveColumnsFor("bid_line_items", { qty: { default: "2.0000" } })
    );
    expect(drift!.defaults).toEqual([
      { column: "qty", schemaDefault: "1", databaseDefault: "2" },
    ]);
    expect(drift!.types).toEqual([]);
    expect(describeDrift([drift!])).toContain(
      "bid_line_items.qty — schema default 1, database default 2"
    );
  });

  it("catches a default that is MISSING from the database", () => {
    // An insert that leaves `kind` out relies on 'plain'. With no default on a
    // NOT NULL column, MySQL refuses the row.
    const drift = compareTable(
      declared("takeoff_groups"),
      liveColumnsFor("takeoff_groups", { kind: { default: null } })
    );
    expect(drift!.defaults).toEqual([
      { column: "kind", schemaDefault: "plain", databaseDefault: NO_DEFAULT },
    ]);
  });

  it("catches a default the database has and the schema does not", () => {
    const drift = compareTable(
      declared("takeoff_groups"),
      liveColumnsFor("takeoff_groups", { label: { default: "Untitled" } })
    );
    expect(drift!.defaults).toEqual([
      {
        column: "label",
        schemaDefault: NO_DEFAULT,
        databaseDefault: "Untitled",
      },
    ]);
  });

  it("catches a lost ON UPDATE — updatedAt stops moving", () => {
    const drift = compareTable(
      declared("bids"),
      liveColumnsFor("bids", {
        updatedAt: { default: "now()", extra: "DEFAULT_GENERATED" },
      })
    );
    expect(drift!.defaults.map(d => d.column)).toEqual(["updatedAt"]);
  });

  it("compares a string default exactly — 'draft' is not 'Draft'", () => {
    const drift = compareTable(
      declared("bids"),
      liveColumnsFor("bids", { status: { default: "draft" } })
    );
    expect(drift!.defaults).toEqual([
      { column: "status", schemaDefault: "Draft", databaseDefault: "draft" },
    ]);
  });
});

describe("the equivalent spellings of one default", () => {
  const decimal = { type: "decimal(10,4)", expression: false };

  it("reads a decimal default at the column's scale as the same number", () => {
    // 31 columns on production report `.default("0")` as 0.0000.
    expect(canonicalDefault("0.0000", decimal)).toBe(
      canonicalDefault("0", decimal)
    );
    expect(canonicalDefault("1.0000", decimal)).toBe("1");
    expect(canonicalDefault("1.5000", decimal)).not.toBe(
      canonicalDefault("1", decimal)
    );
  });

  it("reads drizzle's boolean as MySQL's 0/1", () => {
    const bool = { type: "boolean", expression: false };
    expect(canonicalDefault(false, bool)).toBe(canonicalDefault("0", bool));
    expect(canonicalDefault(true, bool)).toBe(canonicalDefault("1", bool));
  });

  it("reads every name MySQL keeps for the current time as one", () => {
    const row = (d: string, extra = "DEFAULT_GENERATED"): LiveColumn => ({
      COLUMN_NAME: "createdAt",
      IS_NULLABLE: "NO",
      COLUMN_TYPE: "timestamp",
      COLUMN_DEFAULT: d,
      EXTRA: extra,
      COLLATION_NAME: null,
    });
    const drizzle = canonicalDefault("(now())", {
      type: "timestamp",
      expression: true,
    });
    for (const spelling of [
      "now()",
      "CURRENT_TIMESTAMP",
      "current_timestamp()",
    ]) {
      expect(liveDefault(row(spelling))).toBe(drizzle);
    }
    // MySQL 5.7 reports it with no DEFAULT_GENERATED marker.
    expect(liveDefault(row("CURRENT_TIMESTAMP", ""))).toBe(drizzle);
  });

  it("does not read the WORD 'now' on a text column as a time", () => {
    expect(
      canonicalDefault("now", { type: "varchar(32)", expression: false })
    ).toBe("now");
  });

  it("strips one layer of the quotes MariaDB and older MySQL put round a literal", () => {
    const v = { type: "varchar(32)", expression: false };
    expect(canonicalDefault("'Draft'", v)).toBe(canonicalDefault("Draft", v));
  });

  it("treats no default and DEFAULT NULL as the same, as MySQL does", () => {
    const v = { type: "varchar(32)", expression: false };
    expect(canonicalDefault(null, v)).toBe(NO_DEFAULT);
    expect(canonicalDefault(undefined, v)).toBe(NO_DEFAULT);
  });
});

describe("collation drift — against the project's rule, since the schema cannot state one", () => {
  it("catches a string column on the database's other collation", () => {
    // The ER_CANT_AGGREGATE_2COLLATIONS failure of 2026-09-18 in one column:
    // joining this label to an older table's strings is refused outright.
    const drift = compareTable(
      declared("takeoff_groups"),
      liveColumnsFor("takeoff_groups", {
        label: { collation: "utf8mb4_0900_ai_ci" },
      })
    );
    expect(drift!.collations).toEqual([
      {
        column: "label",
        expected: EXPECTED_COLLATION,
        database: "utf8mb4_0900_ai_ci",
      },
    ]);
    const message = describeDrift([drift!]);
    expect(message).toContain(
      "takeoff_groups.label — collation utf8mb4_0900_ai_ci, expected utf8mb4_unicode_ci"
    );
    // db:push cannot fix a collation, so the advice must not stop there.
    expect(message).toContain(
      "ALTER TABLE `takeoff_groups` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    );
    expect(message).not.toContain("pnpm db:push");
  });

  it("ignores columns that have no collation at all", () => {
    // Numbers, dates and json report NULL; there is nothing to compare.
    const drift = compareTable(
      declared("bid_line_items"),
      liveColumnsFor("bid_line_items")
    );
    expect(drift).toBeNull();
  });
});

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
        types: [],
        defaults: [],
        collations: [],
      },
    ]);
    expect(message).toContain("bids — missing isSample");
    expect(message).toContain("pnpm db:push");
  });
});
