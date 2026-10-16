/**
 * applyStarterChange — HOW A CHANGE TO THE SHIPPED STARTER IS STORED, PINNED
 * AND UNDONE (references/baseline-screen-plan.md § 10a.3, Track C).
 *
 * One function for every door a starter change comes through: the baseline
 * screen, the sheet upload, "Copy from my company", the boot's seed proposal
 * (once Track A's boot change routes through it) and undo. One batch per
 * call, ONE transaction (`inOneTransaction`): a refusal or a failure anywhere
 * writes nothing — not the change, not a pin, not the log.
 *
 * For each change, in order:
 *   1. REFUSE before writing anything — a table not in this build, a row that
 *      is not shared, a field `starterChangeRefusal` says no to, a value its
 *      column cannot hold or the sheet would refuse, a reference or part that
 *      is not a shared, active row. Any refusal stops the WHOLE batch and
 *      lists every bad change (owner Q4).
 *   2. SKIP a change whose new value equals the current one: no log, no pin,
 *      no version bump.
 *   3. An "everyone" field (search words, shelf, the mark's look) changes the
 *      shared row with no pins: every company reads it (Q21).
 *   4. Anything else PINS first: every company with no copy of the row gets
 *      one, forked AS IT IS NOW and marked `isPinnedCopy = TRUE`, so the
 *      change cannot reach it. A part change pins the ASSEMBLY.
 *   5. CHANGE the shared row (or its part) and bump its version by 1. A
 *      number that carries an Example tag writes the tag in the SAME change
 *      (`exampleTagAfter`; starter-offers-plan.md § 2.6, Track B 2026-10-14):
 *      a price above 0 is an example, a blank or $0 is not.
 *   6. LOG it: append-only, values wrapped `{"v": …}` so a column that WAS
 *      NULL is not mistaken for "not applicable" (SQL NULL).
 *
 * ── Not in this file yet ────────────────────────────────────────────────────
 * Hide / unhide / item_add (`hideStarterItem`), and run-type EXTRAS, kits
 * and labor steps (§ 10a.1 #1). Offers, Accept and Ignore are
 * `server/starterOffers.ts` (Track B, 2026-10-14), read per FIELD
 * (starter-offers-plan.md § 3a), not by `baselineVersion`.
 *
 * ── The boot no longer undoes a change here (Track A, 2026-10-13) ───────────
 * Until then `seedBaselineMaterials` re-stamped shared rows from the seed files
 * on every start, so a change logged here to, say, a shipped price was written
 * back over by the next boot with no log — and this header said nothing may
 * call this on a shared database until that changed. It has: a start now only
 * INSERTS missing rows and applies finding fields as a logged `seed` batch;
 * every other seed difference is proposed (server/seedProposal.ts) and a field
 * logged here and still held is reported "live ahead", never overwritten
 * (references/boot-seed-plan.md; server/bootLeavesStarterNumbers.test.ts T1).
 * The boot change reaches LIVE one release after the end-of-pricing load
 * (owner Q1) — until that release, live still re-stamps.
 */
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  sql,
} from "drizzle-orm";
import type { MySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import {
  assemblies,
  assemblyMaterials,
  assemblyModifiers,
  companies,
  laborRates,
  materials,
  modifiers,
  starterChangeBatches,
  starterChangePins,
  starterChanges,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import * as db from "./db";
import {
  STARTER_REFERENCES,
  exampleTagAfter,
  sameStarterValue,
  starterChangeRefusal,
  starterFieldKind,
  type StarterTable,
} from "../shared/starterChange";
import { ABOVE_ZERO_FIELDS } from "../shared/starterSheetChecks";

// ─── The five tables ─────────────────────────────────────────────────────────

type Registry = {
  table: MySqlTable;
  /**
   * Fork the shared row for every owner listed, in one pass: owner → the
   * copy's id, and whether this call made it (db.ts `forkForOwners`).
   */
  forkFor: (
    rowId: number,
    owners: readonly number[]
  ) => Promise<Map<number, { id: number; made: boolean }>>;
};

/*
  Each fork is looked up when CALLED, not when this module loads: the routers
  import this file now, and a test that mocks ./db without the fork functions
  (server/auth.email.test.ts) failed to load the whole router tree on
  `db.forkMaterial` (Gate 38686356758, 2026-10-15).
*/
const TABLES: Record<StarterTable, Registry> = {
  materials: {
    table: materials,
    forkFor: (id, owners) => db.forkMaterialFor(id, owners),
  },
  assemblies: {
    table: assemblies,
    forkFor: (id, owners) => db.forkAssemblyFor(id, owners),
  },
  laborRates: {
    table: laborRates,
    forkFor: (id, owners) => db.forkLaborRateFor(id, owners),
  },
  modifiers: {
    table: modifiers,
    forkFor: (id, owners) => db.forkModifierFor(id, owners),
  },
  runTypes: {
    table: takeoffRunTypes,
    forkFor: (id, owners) => db.forkRunTypeFor(id, owners),
  },
};

/** The drizzle table behind a starter table name: ONE registry for both files. */
export function starterTableOf(table: StarterTable): MySqlTable {
  return TABLES[table].table;
}

/** Its columns by name (the offer read reads fields by name). */
export function starterColumnsOf(
  table: StarterTable
): Record<string, MySqlColumn> {
  return columnsOf(table);
}

/** What `targetTable` stores: the SQL name, as `childTable` does. */
export function starterTableName(table: StarterTable): string {
  return getTableName(TABLES[table].table);
}

export function tableFromName(name: string): StarterTable | null {
  for (const key of Object.keys(TABLES) as StarterTable[])
    if (starterTableName(key) === name) return key;
  return null;
}

function columnsOf(table: StarterTable): Record<string, MySqlColumn> {
  return getTableColumns(TABLES[table].table) as Record<string, MySqlColumn>;
}

/** A recipe line's fields a part change may set (`assemblyMaterialLine`'s). */
export const PART_LINE_FIELDS = [
  "qty",
  "overrideLaborHours",
  "isBranchWhip",
] as const;
type PartLineField = (typeof PART_LINE_FIELDS)[number];
export type PartLine = {
  qty: string | number;
  overrideLaborHours?: string | number | null;
  isBranchWhip?: boolean;
};

// ─── Input ───────────────────────────────────────────────────────────────────

export type StarterChangeInput =
  | {
      table: StarterTable;
      rowId: number;
      kind: "field";
      field: string;
      newValue: unknown;
    }
  | {
      table: "assemblies";
      rowId: number;
      kind: "part_add";
      childTable: "assembly_materials";
      /** The PART's id (the material), not the child row's (§ 10a.1 #4). */
      childRefId: number;
      newValue: PartLine;
    }
  | {
      table: "assemblies";
      rowId: number;
      kind: "part_add" | "part_remove";
      childTable: "assembly_modifiers";
      childRefId: number;
    }
  | {
      table: "assemblies";
      rowId: number;
      kind: "part_remove";
      childTable: "assembly_materials";
      childRefId: number;
    }
  | {
      table: "assemblies";
      rowId: number;
      kind: "part_field";
      childTable: "assembly_materials";
      childRefId: number;
      field: PartLineField;
      newValue: unknown;
    };

export type ApplyStarterInput = {
  /** The person; NULL for the seed boot. History outlives the account. */
  editorUserId: number | null;
  source: "screen" | "sheet" | "copy" | "seed";
  fileName?: string;
  fileSha256?: string;
  note?: string;
  changes: StarterChangeInput[];
};

export type ApplyStarterResult = {
  /** NULL when every change was already in effect: nothing was written. */
  batchId: number | null;
  applied: Array<{ changeId: number; pins: number }>;
  /** Changes whose new value was already the current one (step 2). */
  skipped: number;
};

/** Every reason a batch was refused, one line per bad change (owner Q4). */
export class StarterChangeRefused extends Error {
  constructor(readonly problems: string[]) {
    super(`Starter change refused:\n${problems.join("\n")}`);
    this.name = "StarterChangeRefused";
  }
}

// ─── Values ──────────────────────────────────────────────────────────────────

/**
 * The value as the column stores it, or the reason it cannot. Read off the
 * column itself, so a column's type and nullability are not restated here.
 * BLANK IS NOT ZERO: null is refused on a column that cannot hold it, and is
 * never turned into 0.
 */
function storedValue(
  column: MySqlColumn,
  value: unknown,
  aboveZero: boolean
): { value: unknown } | { refused: string } {
  if (value === null || value === undefined || value === "") {
    return column.notNull ? { refused: "cannot be blank" } : { value: null };
  }
  switch (column.columnType) {
    case "MySqlDecimal": {
      const n = typeof value === "number" ? value : Number(value);
      if (typeof value === "boolean" || !Number.isFinite(n))
        return { refused: `"${String(value)}" is not a number` };
      if (aboveZero && n <= 0)
        return { refused: "must be a number above 0 (blank = not set)" };
      const scale = (column as MySqlColumn & { scale?: number }).scale ?? 4;
      return { value: n.toFixed(scale) };
    }
    case "MySqlInt": {
      const n = typeof value === "number" ? value : Number(value);
      if (typeof value === "boolean" || !Number.isInteger(n))
        return { refused: `"${String(value)}" is not a whole number` };
      if (n < 0) return { refused: "cannot be below 0" };
      return { value: n };
    }
    case "MySqlBoolean":
      return typeof value === "boolean"
        ? { value }
        : { refused: "must be yes or no" };
    case "MySqlEnumColumn": {
      const allowed = column.enumValues ?? [];
      return typeof value === "string" && allowed.includes(value)
        ? { value }
        : { refused: `must be one of ${allowed.join(", ")}` };
    }
    case "MySqlVarChar":
    case "MySqlText": {
      if (typeof value !== "string") return { refused: "must be text" };
      const text = value.trim();
      if (text === "")
        return column.notNull
          ? { refused: "cannot be blank" }
          : { value: null };
      const length = (column as MySqlColumn & { length?: number }).length;
      if (length !== undefined && text.length > length)
        return { refused: `is longer than ${length} characters` };
      return { value: text };
    }
    case "MySqlJson":
      return typeof value === "object"
        ? { value }
        : { refused: "must be a list of values" };
    default:
      return { refused: `a ${column.columnType} column is not edited here` };
  }
}

/**
 * The log's wrapper: `{"v": null}` is "was NULL"; SQL NULL is "n/a". A number
 * that carries an Example tag logs it beside the value, `{"v": "0.5500",
 * "example": true}`, so the tag is part of the same change and an Accept
 * writes both (§ 2.6). `sameStarterValue` compares `v` only.
 */
const wrap = (v: unknown, example?: boolean) =>
  example === undefined ? { v: v ?? null } : { v: v ?? null, example };

// ─── Reading rows inside the transaction ─────────────────────────────────────

async function database() {
  const handle = await db.getDb();
  if (!handle) throw new Error("DB unavailable");
  return handle;
}

/** One row of a starter table, locked for the rest of the transaction. */
async function lockedRow(
  table: StarterTable,
  id: number
): Promise<Record<string, unknown> | undefined> {
  const cols = columnsOf(table);
  const [row] = await (await database())
    .select()
    .from(TABLES[table].table)
    .where(eq(cols.id, id))
    .for("update");
  return row as Record<string, unknown> | undefined;
}

/** Shared, and still offered in a picker: what a part or reference may name. */
function isLiveShared(row: Record<string, unknown> | undefined): boolean {
  if (!row || row.userId !== null) return false;
  if ("isActive" in row && row.isActive === false) return false;
  if ("status" in row && row.status !== "active") return false;
  return row.hiddenAt === null || row.hiddenAt === undefined;
}

async function partLine(assemblyId: number, materialId: number) {
  return (await database())
    .select()
    .from(assemblyMaterials)
    .where(
      and(
        eq(assemblyMaterials.assemblyId, assemblyId),
        eq(assemblyMaterials.materialId, materialId)
      )
    )
    .for("update");
}

async function modifierLink(assemblyId: number, modifierId: number) {
  return (await database())
    .select()
    .from(assemblyModifiers)
    .where(
      and(
        eq(assemblyModifiers.assemblyId, assemblyId),
        eq(assemblyModifiers.modifierId, modifierId)
      )
    )
    .for("update");
}

/** A recipe line as the log holds it: exactly the fields a fork copies. */
function lineValue(row: {
  qty: string;
  overrideLaborHours: string | null;
  isBranchWhip: boolean;
}) {
  return {
    qty: row.qty,
    overrideLaborHours: row.overrideLaborHours,
    isBranchWhip: row.isBranchWhip,
  };
}

// ─── Planning: refuse, then decide what each change writes ────────────────────

type Planned = {
  input: StarterChangeInput;
  undoesChangeId: number | null;
  /** Does it pin (offer / part) or reach everyone? */
  pins: boolean;
  oldValue: unknown;
  newValue: unknown;
  /** SQL NULL in the log: a part added has no old value, a removed none new. */
  oldApplies: boolean;
  newApplies: boolean;
  /** The Example tag before and after, for a number that carries one. */
  example?: { old: boolean; new: boolean } | null;
  write: () => Promise<void>;
};

async function plan(
  input: StarterChangeInput,
  at: string,
  /**
   * An undo putting back a value the row HELD. The above-zero rule is for new
   * numbers (the sheet refuses a $0 price); an undo restores an old one
   * exactly, and a $0 "not priced" price was a real old value. Without this,
   * pricing an unpriced item could never be undone (found 2026-10-14).
   */
  restoring = false
): Promise<{ planned?: Planned; skip?: true; problems: string[] }> {
  const problems: string[] = [];
  const refuse = (why: string) => {
    problems.push(`${at}: ${why}`);
    return { problems };
  };
  if (!(input.table in TABLES))
    return refuse(`"${input.table}" is not a starter table in this build`);
  const row = await lockedRow(input.table, input.rowId);
  if (!row) return refuse(`${input.table} ${input.rowId} does not exist`);
  if (row.userId !== null)
    return refuse(
      `${input.table} ${input.rowId} is a company's own row, not the starter`
    );
  const handle = await database();

  if (input.kind === "field") {
    const why = starterChangeRefusal(input.table, input.field);
    if (why) return refuse(why);
    const column = columnsOf(input.table)[input.field];
    const aboveZero =
      !restoring &&
      (ABOVE_ZERO_FIELDS[input.table] ?? []).includes(input.field);
    const stored = storedValue(column, input.newValue, aboveZero);
    if ("refused" in stored) return refuse(`${input.field} ${stored.refused}`);
    const refTable = STARTER_REFERENCES[input.table]?.[input.field];
    if (refTable && stored.value !== null) {
      const ref = await lockedRow(refTable, stored.value as number);
      if (!isLiveShared(ref))
        return refuse(
          `${input.field} must name a shipped, active ${refTable} row (${String(stored.value)} is not one)`
        );
    }
    const current = row[input.field];
    if (sameStarterValue(current, stored.value))
      return { skip: true, problems };
    const { table } = TABLES[input.table];
    const cols = columnsOf(input.table);
    // The Example tag goes WITH its number, in this same change (§ 2.6 of
    // references/starter-offers-plan.md): never a change of its own.
    const companion = exampleTagAfter(
      input.table,
      input.field,
      stored.value,
      row
    );
    return {
      problems,
      planned: {
        input,
        undoesChangeId: null,
        pins: starterFieldKind(input.table, input.field) === "offer",
        oldValue: current,
        newValue: stored.value,
        oldApplies: true,
        newApplies: true,
        example: companion
          ? { old: row[companion.tag] === true, new: companion.value }
          : null,
        write: async () => {
          await handle
            .update(table)
            .set({
              [input.field]: stored.value,
              ...(companion ? { [companion.tag]: companion.value } : {}),
              version: sql`${cols.version} + 1`,
            })
            .where(eq(cols.id, input.rowId));
        },
      },
    };
  }

  // ── Parts: the assembly's recipe ──
  if (input.table !== "assemblies")
    return refuse(`a part change is only for an assembly's recipe`);
  const bumpAssembly = () =>
    handle
      .update(assemblies)
      .set({ version: sql`${assemblies.version} + 1` })
      .where(eq(assemblies.id, input.rowId));

  if (input.childTable === "assembly_modifiers") {
    const modifier = await lockedRow("modifiers", input.childRefId);
    const links = await modifierLink(input.rowId, input.childRefId);
    if (input.kind === "part_add") {
      if (!isLiveShared(modifier))
        return refuse(
          `modifier ${input.childRefId} is not a shipped, active modifier`
        );
      if (links.length > 0) return { skip: true, problems };
      return {
        problems,
        planned: {
          input,
          undoesChangeId: null,
          pins: true,
          oldValue: null,
          newValue: true,
          oldApplies: false,
          newApplies: true,
          write: async () => {
            const [last] = await handle
              .select({ sortOrder: assemblyModifiers.sortOrder })
              .from(assemblyModifiers)
              .where(eq(assemblyModifiers.assemblyId, input.rowId))
              .orderBy(desc(assemblyModifiers.sortOrder))
              .limit(1);
            await handle.insert(assemblyModifiers).values({
              assemblyId: input.rowId,
              modifierId: input.childRefId,
              sortOrder: (last?.sortOrder ?? -1) + 1,
            });
            await bumpAssembly();
          },
        },
      };
    }
    if (links.length === 0) return { skip: true, problems };
    return {
      problems,
      planned: {
        input,
        undoesChangeId: null,
        pins: true,
        oldValue: true,
        newValue: null,
        oldApplies: true,
        newApplies: false,
        write: async () => {
          await handle
            .delete(assemblyModifiers)
            .where(
              and(
                eq(assemblyModifiers.assemblyId, input.rowId),
                eq(assemblyModifiers.modifierId, input.childRefId)
              )
            );
          await bumpAssembly();
        },
      },
    };
  }

  // assembly_materials, keyed by the material id
  const lines = await partLine(input.rowId, input.childRefId);
  if (lines.length > 1)
    return refuse(
      `assembly ${input.rowId} lists material ${input.childRefId} ${lines.length} times; a part change cannot say which line`
    );
  const line = lines[0];
  const lineCols = getTableColumns(assemblyMaterials) as Record<
    string,
    MySqlColumn
  >;

  if (input.kind === "part_add") {
    const material = await lockedRow("materials", input.childRefId);
    if (!isLiveShared(material))
      return refuse(
        `material ${input.childRefId} is not a shipped, active material`
      );
    if (line)
      return refuse(
        `material ${input.childRefId} is already in assembly ${input.rowId}; change its line instead`
      );
    const fields: Record<string, unknown> = {};
    for (const f of PART_LINE_FIELDS) {
      const raw =
        input.newValue[f] ?? (f === "isBranchWhip" ? false : undefined);
      const stored = storedValue(lineCols[f], raw, false);
      if ("refused" in stored) return refuse(`${f} ${stored.refused}`);
      fields[f] = stored.value;
    }
    if (Number(fields.qty) <= 0) return refuse("qty must be above 0");
    const value = lineValue(
      fields as {
        qty: string;
        overrideLaborHours: string | null;
        isBranchWhip: boolean;
      }
    );
    return {
      problems,
      planned: {
        input,
        undoesChangeId: null,
        pins: true,
        oldValue: null,
        newValue: value,
        oldApplies: false,
        newApplies: true,
        write: async () => {
          const [last] = await handle
            .select({ sortOrder: assemblyMaterials.sortOrder })
            .from(assemblyMaterials)
            .where(eq(assemblyMaterials.assemblyId, input.rowId))
            .orderBy(desc(assemblyMaterials.sortOrder))
            .limit(1);
          await handle.insert(assemblyMaterials).values({
            assemblyId: input.rowId,
            materialId: input.childRefId,
            ...value,
            sortOrder: (last?.sortOrder ?? -1) + 1,
          });
          await bumpAssembly();
        },
      },
    };
  }

  if (!line)
    return input.kind === "part_remove"
      ? { skip: true, problems }
      : refuse(
          `material ${input.childRefId} is not in assembly ${input.rowId}`
        );

  if (input.kind === "part_remove")
    return {
      problems,
      planned: {
        input,
        undoesChangeId: null,
        pins: true,
        oldValue: lineValue(line),
        newValue: null,
        oldApplies: true,
        newApplies: false,
        write: async () => {
          await handle
            .delete(assemblyMaterials)
            .where(eq(assemblyMaterials.id, line.id));
          await bumpAssembly();
        },
      },
    };

  // part_field
  if (!PART_LINE_FIELDS.includes(input.field))
    return refuse(`"${input.field}" is not a recipe line field`);
  const stored = storedValue(lineCols[input.field], input.newValue, false);
  if ("refused" in stored) return refuse(`${input.field} ${stored.refused}`);
  if (input.field === "qty" && Number(stored.value) <= 0)
    return refuse("qty must be above 0");
  const current = line[input.field];
  if (sameStarterValue(current, stored.value)) return { skip: true, problems };
  return {
    problems,
    planned: {
      input,
      undoesChangeId: null,
      pins: true,
      oldValue: current,
      newValue: stored.value,
      oldApplies: true,
      newApplies: true,
      write: async () => {
        await handle
          .update(assemblyMaterials)
          .set({ [input.field]: stored.value })
          .where(eq(assemblyMaterials.id, line.id));
        await bumpAssembly();
      },
    },
  };
}

// ─── Pinning ─────────────────────────────────────────────────────────────────

/**
 * Give every company with no copy of this row one, AS IT IS NOW (§ 10a.3
 * step 4). Returns the pins made: { owner, forkId }.
 *
 * "Has a copy" is whatever the table's own fork function says it is: the
 * fork returns an existing copy rather than make a second, and says so
 * (`made: false`), so a reused copy is no pin. That keeps the rule in ONE
 * place per table (run types reuse only an ACTIVE fork, the others any),
 * instead of restating it here.
 *
 * All the shops at once (`forkFor`, db.ts `forkForOwners`), and one UPDATE
 * for the pin flag: one shop at a time was five round trips a shop, 6.2 s
 * for a material and 18.8 s for an assembly at 2,006 shops (2026-10-15,
 * stress-results-b.md round 9).
 */
async function pinCompanies(
  table: StarterTable,
  rowId: number
): Promise<Array<{ owner: number; forkId: number }>> {
  const handle = await database();
  const { table: t, forkFor } = TABLES[table];
  const cols = columnsOf(table);
  const owners = await unpinnedOwners(table, rowId);
  if (owners.length === 0) return [];
  const forks = await forkFor(rowId, owners);
  const pins: Array<{ owner: number; forkId: number }> = [];
  for (const owner of owners) {
    const fork = forks.get(owner);
    if (fork?.made) pins.push({ owner, forkId: fork.id });
  }
  for (let i = 0; i < pins.length; i += 500)
    await handle
      .update(t)
      .set({ isPinnedCopy: true })
      .where(
        inArray(
          cols.id,
          pins.slice(i, i + 500).map(p => p.forkId)
        )
      );
  return pins;
}

/**
 * Every shop with no copy the fork would REUSE — the shops a pin reaches.
 * One query instead of two per shop: measured 2026-10-15 (Track B stress
 * pass), a change to a row every shop already held took 414 ms at 306 shops
 * (~4 s at 3,000; an hour for a 1,000-row sheet), and 10 ms after. The fork
 * stays the authority for every shop listed here (`pinCompanies` still asks
 * it): this only leaves out copies the fork reuses — any copy, and for run
 * types an ACTIVE one (`forkRunType`) — so a shop is never wrongly skipped.
 * The preview counts the same list (`countPins`), so its number is this one.
 */
async function unpinnedOwners(
  table: StarterTable,
  rowId: number
): Promise<number[]> {
  const handle = await database();
  const cols = columnsOf(table);
  const reuses =
    table === "runTypes"
      ? and(eq(cols.baselineId, rowId), eq(takeoffRunTypes.status, "active"))
      : eq(cols.baselineId, rowId);
  const covered = new Set(
    (
      await handle
        .select({ owner: cols.userId })
        .from(TABLES[table].table)
        .where(reuses)
    ).map(r => r.owner as number)
  );
  return (
    await handle
      .select({ owner: companies.ownerUserId })
      .from(companies)
      .orderBy(asc(companies.ownerUserId))
  )
    .map(r => r.owner)
    .filter(o => !covered.has(o));
}

/**
 * The preview's pins: the shops `pinCompanies` would fork, named by the SAME
 * filter (`unpinnedOwners`) and not forked. A batch that changes one row
 * twice (a rate's wage and rate) pins once, as the real call does: the first
 * change's pins are remembered in `counted`.
 */
async function countPins(
  table: StarterTable,
  rowId: number,
  counted: Map<string, Set<number>>
): Promise<Array<{ owner: number; forkId: number }>> {
  const key = `${table}:${rowId}`;
  const already = counted.get(key) ?? new Set<number>();
  const owners = (await unpinnedOwners(table, rowId)).filter(
    o => !already.has(o)
  );
  for (const o of owners) already.add(o);
  counted.set(key, already);
  return owners.map(owner => ({ owner, forkId: 0 }));
}

// ─── The function ────────────────────────────────────────────────────────────

async function applyPlanned(
  header: {
    editorUserId: number | null;
    source: "screen" | "sheet" | "copy" | "seed" | "undo";
    fileName?: string;
    fileSha256?: string;
    note?: string;
  },
  plans: Array<{ input: StarterChangeInput; undoesChangeId: number | null }>,
  /**
   * "count" is the PREVIEW: it counts the shops a pin would reach, with the
   * same filter, and forks nobody (2,006 forks made a preview take 7.3 s,
   * measured 2026-10-15). Only `previewStarterChanges` passes it, inside a
   * transaction it rolls back.
   */
  pinMode: "pin" | "count" = "pin"
): Promise<ApplyStarterResult> {
  const counted = new Map<string, Set<number>>();
  return db.inOneTransaction(async () => {
    const handle = await database();
    const problems: string[] = [];
    const planned: Planned[] = [];
    let skipped = 0;
    // Step 1 for EVERY change before step 4 for any: one bad change stops all.
    // Each is planned against the rows as they stand, so two changes to the
    // same thing in one batch would log a stale old value: refused, as the
    // sheet refuses a name listed twice.
    const seen = new Set<string>();
    for (let i = 0; i < plans.length; i += 1) {
      const p = plans[i];
      const c = p.input;
      const key = [
        c.table,
        c.rowId,
        "childTable" in c ? c.childTable : "",
        "childRefId" in c ? c.childRefId : "",
        "field" in c ? c.field : "",
      ].join("|");
      if (seen.has(key)) {
        problems.push(`change ${i + 1}: changes the same thing twice`);
        continue;
      }
      seen.add(key);
      const result = await plan(
        c,
        `change ${i + 1}`,
        p.undoesChangeId !== null
      );
      problems.push(...result.problems);
      if (result.skip) skipped += 1;
      if (result.planned)
        planned.push({ ...result.planned, undoesChangeId: p.undoesChangeId });
    }
    if (problems.length > 0) throw new StarterChangeRefused(problems);
    if (planned.length === 0) return { batchId: null, applied: [], skipped };

    const [batch] = await handle.insert(starterChangeBatches).values({
      editorUserId: header.editorUserId,
      source: header.source,
      fileName: header.fileName ?? null,
      fileSha256: header.fileSha256 ?? null,
      note: header.note ?? null,
    });
    const batchId = batch.insertId;

    const applied: ApplyStarterResult["applied"] = [];
    for (const change of planned) {
      const { input } = change;
      const pins = !change.pins
        ? []
        : pinMode === "pin"
          ? await pinCompanies(input.table, input.rowId)
          : await countPins(input.table, input.rowId, counted);
      await change.write();
      const after = await lockedRow(input.table, input.rowId);
      const [logged] = await handle.insert(starterChanges).values({
        batchId,
        targetTable: starterTableName(input.table),
        targetRowId: input.rowId,
        kind: input.kind,
        field: "field" in input ? input.field : null,
        childTable: "childTable" in input ? input.childTable : null,
        childRefId: "childRefId" in input ? input.childRefId : null,
        oldValue: change.oldApplies
          ? wrap(change.oldValue, change.example?.old)
          : null,
        newValue: change.newApplies
          ? wrap(change.newValue, change.example?.new)
          : null,
        version: after!.version as number,
        undoesChangeId: change.undoesChangeId,
      });
      if (pins.length > 0 && pinMode === "pin")
        await handle.insert(starterChangePins).values(
          pins.map(pin => ({
            changeId: logged.insertId,
            companyOwnerUserId: pin.owner,
            forkId: pin.forkId,
          }))
        );
      applied.push({ changeId: logged.insertId, pins: pins.length });
    }
    await handle
      .update(starterChangeBatches)
      .set({ changeCount: applied.length })
      .where(eq(starterChangeBatches.id, batchId));
    return { batchId, applied, skipped };
  });
}

/** Store, pin and log a batch of starter changes. See the top of this file. */
export function applyStarterChange(
  input: ApplyStarterInput
): Promise<ApplyStarterResult> {
  return applyPlanned(
    input,
    input.changes.map(c => ({ input: c, undoesChangeId: null }))
  );
}

// ─── Undo ────────────────────────────────────────────────────────────────────

type LoggedChange = typeof starterChanges.$inferSelect;

const unwrap = (v: unknown): unknown =>
  v && typeof v === "object" && "v" in v ? (v as { v: unknown }).v : null;

/**
 * The change that puts a logged change back, or why it cannot: allowed only
 * while the shared row (or part) STILL holds that change's new value
 * (owner Q6). Read inside the caller's transaction.
 */
async function reverseOf(
  change: LoggedChange
): Promise<{ input: StarterChangeInput } | { refused: string }> {
  const table = tableFromName(change.targetTable);
  if (!table) return { refused: `"${change.targetTable}" is not undone here` };
  const label = `change ${change.id}`;
  const newValue = unwrap(change.newValue);
  const oldValue = unwrap(change.oldValue);

  if (change.kind === "field") {
    const row = await lockedRow(table, change.targetRowId);
    const current = row?.[change.field!];
    if (!row || !sameStarterValue(current, newValue))
      return {
        refused: `${label}: changed again since — ${change.field} is now ${JSON.stringify(current ?? null)}`,
      };
    return {
      input: {
        table,
        rowId: change.targetRowId,
        kind: "field",
        field: change.field!,
        newValue: oldValue,
      },
    };
  }
  if (table !== "assemblies" || change.childRefId === null)
    return { refused: `${label}: a ${change.kind} change is not undone here` };
  const rowId = change.targetRowId;
  const ref = change.childRefId;

  if (change.childTable === "assembly_modifiers") {
    const present = (await modifierLink(rowId, ref)).length > 0;
    const added = change.kind === "part_add";
    if (present !== added)
      return {
        refused: `${label}: changed again since — the modifier is ${present ? "on" : "off"} the recipe`,
      };
    return {
      input: {
        table,
        rowId,
        kind: added ? "part_remove" : "part_add",
        childTable: "assembly_modifiers",
        childRefId: ref,
      },
    };
  }

  const [line] = await partLine(rowId, ref);
  if (change.kind === "part_add") {
    if (!line || !sameLine(lineValue(line), newValue))
      return {
        refused: `${label}: changed again since — the added line is not as it was added`,
      };
    return {
      input: {
        table,
        rowId,
        kind: "part_remove",
        childTable: "assembly_materials",
        childRefId: ref,
      },
    };
  }
  if (change.kind === "part_remove") {
    if (line)
      return {
        refused: `${label}: changed again since — the material is back on the recipe`,
      };
    return {
      input: {
        table,
        rowId,
        kind: "part_add",
        childTable: "assembly_materials",
        childRefId: ref,
        newValue: oldValue as PartLine,
      },
    };
  }
  // part_field
  const field = change.field as PartLineField;
  if (!line || !sameStarterValue(line[field], newValue))
    return {
      refused: `${label}: changed again since — ${field} is now ${JSON.stringify(line?.[field] ?? null)}`,
    };
  return {
    input: {
      table,
      rowId,
      kind: "part_field",
      childTable: "assembly_materials",
      childRefId: ref,
      field,
      newValue: oldValue,
    },
  };
}

export function sameLine(a: unknown, b: unknown): boolean {
  const x = a as Record<string, unknown> | null;
  const y = b as Record<string, unknown> | null;
  if (!x || !y) return x === y;
  return PART_LINE_FIELDS.every(f => sameStarterValue(x[f], y[f]));
}

/**
 * Undo ONE logged change: a new change in a new `undo` batch, carrying
 * `undoesChangeId` and the values reversed. It pins any company created since,
 * exactly like any change; pins already made stay. Refused, writing nothing,
 * if the row has changed again since.
 */
export async function undoStarterChange(input: {
  changeId: number;
  editorUserId: number | null;
  note?: string;
}): Promise<ApplyStarterResult> {
  return db.inOneTransaction(async () => {
    const handle = await database();
    const [change] = await handle
      .select()
      .from(starterChanges)
      .where(eq(starterChanges.id, input.changeId));
    if (!change)
      throw new StarterChangeRefused([
        `change ${input.changeId} does not exist`,
      ]);
    const reverse = await reverseOf(change);
    if ("refused" in reverse) throw new StarterChangeRefused([reverse.refused]);
    return applyPlanned(
      { editorUserId: input.editorUserId, source: "undo", note: input.note },
      [{ input: reverse.input, undoesChangeId: change.id }]
    );
  });
}

/**
 * Undo a whole BATCH (owner Q6): the changes still undoable go back in one
 * undo batch, newest first; the rest are listed with why. `preview: true`
 * writes nothing and answers the same question.
 */
export async function undoStarterBatch(input: {
  batchId: number;
  editorUserId: number | null;
  preview: boolean;
  note?: string;
}): Promise<{
  undoable: number[];
  notUndone: Array<{ changeId: number; why: string }>;
  result: ApplyStarterResult | null;
}> {
  return db.inOneTransaction(async () => {
    const handle = await database();
    const changes = await handle
      .select()
      .from(starterChanges)
      .where(eq(starterChanges.batchId, input.batchId))
      .orderBy(desc(starterChanges.id));
    const undoable: Array<{
      input: StarterChangeInput;
      undoesChangeId: number;
    }> = [];
    const notUndone: Array<{ changeId: number; why: string }> = [];
    for (const change of changes) {
      const reverse = await reverseOf(change);
      if ("refused" in reverse)
        notUndone.push({ changeId: change.id, why: reverse.refused });
      else undoable.push({ input: reverse.input, undoesChangeId: change.id });
    }
    const ids = undoable.map(u => u.undoesChangeId);
    if (input.preview || undoable.length === 0)
      return { undoable: ids, notUndone, result: null };
    const result = await applyPlanned(
      { editorUserId: input.editorUserId, source: "undo", note: input.note },
      undoable
    );
    return { undoable: ids, notUndone, result };
  });
}

/** The pins a change made, for a test or the log screen. */
export async function pinsOf(changeIds: readonly number[]) {
  if (changeIds.length === 0) return [];
  return (await database())
    .select()
    .from(starterChangePins)
    .where(inArray(starterChangePins.changeId, [...changeIds]));
}

/** Changes logged against one shared row, oldest first. */
export async function changesFor(table: StarterTable, rowId: number) {
  return (await database())
    .select()
    .from(starterChanges)
    .where(
      and(
        eq(starterChanges.targetTable, starterTableName(table)),
        eq(starterChanges.targetRowId, rowId)
      )
    )
    .orderBy(asc(starterChanges.id));
}

// ─── The admin screen's preview and change log (Track B, 2026-10-14) ─────────

/** Thrown inside the preview's transaction so nothing it wrote is kept. */
class PreviewRollback extends Error {
  constructor(readonly outcome: StarterPreview) {
    super("preview: rolled back");
  }
}

export type StarterPreview = {
  /** "offer" pins and offers; "everyone" reaches every shop now. */
  reach: "offer" | "everyone" | "unchanged";
  /** Shops that get a pinned copy holding today's value. */
  pins: number;
  /** Shops whose copy will NOT already hold the new value: they get an offer. */
  offered: number;
  /** The value as it would be stored, for the "Old → New" line. */
  oldValue: unknown;
  newValue: unknown;
  /** Every field the Confirm writes, old → new (a rate: wage and rate). */
  lines: Array<{ field: string | null; oldValue: unknown; newValue: unknown }>;
};

/**
 * What `applyStarterChange` WOULD do with ONE change, measured by doing it in
 * a transaction and rolling it back — so the preview's numbers are the
 * function's own, and cannot drift from what Confirm then does
 * (starter-offers-plan.md § 6 test 14). Refusals throw `StarterChangeRefused`
 * exactly as the real call would.
 */
export async function previewStarterChange(
  change: StarterChangeInput
): Promise<StarterPreview> {
  return previewStarterChanges([change]);
}

/**
 * The same for one Confirm that writes several fields of ONE row together —
 * a labor rate's wage and the rate it makes (owner Q5: one Confirm, one
 * batch). Pins are the batch's (only the first change can pin: after it every
 * shop has a copy). A shop is "offered" when its copy differs from ANY of the
 * new values. `lines` lists each field, old → new.
 */
export async function previewStarterChanges(
  changes: StarterChangeInput[]
): Promise<StarterPreview> {
  try {
    await db.inOneTransaction(async () => {
      // The shops a pin would reach, read BEFORE the change (count mode forks
      // nobody, so they still have no copy afterwards either).
      const willPin = new Set(
        await unpinnedOwners(changes[0].table, changes[0].rowId)
      );
      const result = await applyPlanned(
        { editorUserId: null, source: "screen", note: "preview" },
        changes.map(input => ({ input, undoesChangeId: null })),
        "count"
      );
      const handle = await database();
      if (result.applied.length === 0)
        throw new PreviewRollback({
          reach: "unchanged",
          pins: 0,
          offered: 0,
          oldValue: null,
          newValue: null,
          lines: [],
        });
      const logged = await handle
        .select()
        .from(starterChanges)
        .where(
          inArray(
            starterChanges.id,
            result.applied.map(a => a.changeId)
          )
        )
        .orderBy(asc(starterChanges.id));
      const first = changes[0];
      const everyone = changes.every(
        c =>
          c.kind === "field" &&
          starterFieldKind(c.table, c.field) === "everyone"
      );
      // A pinned shop holds today's value, which the change differs from.
      let offered = 0;
      if (!everyone) {
        offered = result.applied.some(a => a.pins > 0) ? willPin.size : 0;
        const cols = columnsOf(first.table);
        const copies = (await handle
          .select()
          .from(TABLES[first.table].table)
          .where(eq(cols.baselineId, first.rowId))) as Array<
          Record<string, unknown>
        >;
        const owners = new Map<number, Record<string, unknown>[]>();
        for (const c of copies) {
          if (c.userId === null) continue;
          const o = c.userId as number;
          if (!owners.has(o)) owners.set(o, []);
          owners.get(o)!.push(c);
        }
        for (const [owner, list] of Array.from(owners)) {
          if (willPin.has(owner) && offered > 0) continue;
          const live =
            list.find(
              c =>
                c.isActive !== false &&
                (c.status == null || c.status === "active")
            ) ?? list[0];
          const differs = logged.some(l =>
            l.kind !== "field"
              ? true
              : !sameStarterValue(live[l.field!], unwrap(l.newValue))
          );
          if (differs) offered += 1;
        }
      }
      throw new PreviewRollback({
        reach: everyone ? "everyone" : "offer",
        pins: result.applied.reduce((n, a) => n + a.pins, 0),
        offered,
        oldValue: unwrap(logged[0].oldValue),
        newValue: unwrap(logged[0].newValue),
        lines: logged.map(l => ({
          field: l.field,
          oldValue: unwrap(l.oldValue),
          newValue: unwrap(l.newValue),
        })),
      });
    });
  } catch (err) {
    if (err instanceof PreviewRollback) return err.outcome;
    throw err;
  }
  throw new Error("preview: the transaction did not roll back");
}

export type StarterLogEntry = {
  batchId: number;
  source: string;
  note: string | null;
  editorName: string | null;
  at: Date;
  changes: Array<{
    changeId: number;
    table: StarterTable | null;
    rowId: number;
    itemName: string;
    kind: string;
    field: string | null;
    childRefId: number | null;
    childName: string | null;
    oldValue: unknown;
    newValue: unknown;
    pins: number;
    undoesChangeId: number | null;
    /** The undo that put this one back, if any. */
    undoneByChangeId: number | null;
  }>;
};

/**
 * The change log, newest batch first (the admin screen's Change log tab).
 * The SEED's finding-field batches are left out unless asked for: a start
 * writes one whenever search words differ, and they would bury the edits a
 * person made.
 */
export async function starterChangeLog(input: {
  limit: number;
  includeSeed: boolean;
}): Promise<StarterLogEntry[]> {
  const handle = await database();
  const batchRows = await handle
    .select()
    .from(starterChangeBatches)
    .where(
      input.includeSeed
        ? sql`1 = 1`
        : sql`${starterChangeBatches.source} <> 'seed'`
    )
    .orderBy(desc(starterChangeBatches.id))
    .limit(input.limit);
  if (batchRows.length === 0) return [];
  const changes = await handle
    .select()
    .from(starterChanges)
    .where(
      inArray(
        starterChanges.batchId,
        batchRows.map(b => b.id)
      )
    )
    .orderBy(asc(starterChanges.id));
  const ids = changes.map(c => c.id);
  const pinRows = ids.length
    ? await handle
        .select({
          changeId: starterChangePins.changeId,
          n: sql<number>`count(*)`,
        })
        .from(starterChangePins)
        .where(inArray(starterChangePins.changeId, ids))
        .groupBy(starterChangePins.changeId)
    : [];
  const undoRows = ids.length
    ? await handle
        .select({
          id: starterChanges.id,
          undoes: starterChanges.undoesChangeId,
        })
        .from(starterChanges)
        .where(inArray(starterChanges.undoesChangeId, ids))
    : [];
  const editorIds = batchRows
    .map(b => b.editorUserId)
    .filter((id): id is number => id !== null);
  const editors = editorIds.length
    ? await handle
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, editorIds))
    : [];
  const pins = new Map(pinRows.map(p => [p.changeId, Number(p.n)]));
  const undoneBy = new Map(
    undoRows.map(u => [u.undoes as number, u.id] as const)
  );
  const editorName = new Map(editors.map(e => [e.id, e.name || e.email]));

  // Names: the target rows, and the parts a recipe change names.
  const names = new Map<string, string>();
  const byTable = new Map<StarterTable, Set<number>>();
  const want = (t: StarterTable, id: number) => {
    if (!byTable.has(t)) byTable.set(t, new Set());
    byTable.get(t)!.add(id);
  };
  for (const c of changes) {
    const t = tableFromName(c.targetTable);
    if (!t) continue;
    want(t, c.targetRowId);
    if (c.childRefId !== null)
      want(
        c.childTable === "assembly_modifiers" ? "modifiers" : "materials",
        c.childRefId
      );
  }
  for (const [t, set] of Array.from(byTable)) {
    const cols = columnsOf(t);
    const nameCol = t === "runTypes" ? cols.label : cols.name;
    const rows = (await handle
      .select({ id: cols.id, name: nameCol })
      .from(TABLES[t].table)
      .where(inArray(cols.id, Array.from(set)))) as Array<{
      id: number;
      name: string;
    }>;
    for (const r of rows) names.set(`${t}:${r.id}`, r.name);
  }

  return batchRows.map(b => ({
    batchId: b.id,
    source: b.source,
    note: b.note,
    editorName:
      b.editorUserId === null ? null : (editorName.get(b.editorUserId) ?? null),
    at: b.createdAt,
    changes: changes
      .filter(c => c.batchId === b.id)
      .map(c => {
        const table = tableFromName(c.targetTable);
        const childTable =
          c.childTable === "assembly_modifiers" ? "modifiers" : "materials";
        return {
          changeId: c.id,
          table,
          rowId: c.targetRowId,
          itemName:
            names.get(`${table}:${c.targetRowId}`) ?? `#${c.targetRowId}`,
          kind: c.kind,
          field: c.field,
          childRefId: c.childRefId,
          childName:
            c.childRefId === null
              ? null
              : (names.get(`${childTable}:${c.childRefId}`) ?? null),
          oldValue: c.oldValue === null ? null : unwrap(c.oldValue),
          newValue: c.newValue === null ? null : unwrap(c.newValue),
          pins: pins.get(c.id) ?? 0,
          undoesChangeId: c.undoesChangeId,
          undoneByChangeId: undoneBy.get(c.id) ?? null,
        };
      }),
  }));
}
