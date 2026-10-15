/**
 * INPUTS FOR AN ATTACKER: a valid input for every procedure, with somebody
 * else's ids planted in every id field.
 *
 * Used by `server/crossCompanyAttack.test.ts`. The point is coverage that does
 * not depend on anybody remembering a route: the generator reads each
 * procedure's own zod schema (through `z.toJSONSchema`), so a route added
 * tomorrow is attacked tomorrow with no test written for it.
 *
 * ── What "an id field" means here ─────────────────────────────────────────────
 * A numeric field whose NAME says which table it points at (`bidId`,
 * `racewayMaterialId`, `sheetId` …) gets an id from that table. A bare `id` /
 * `ids` cannot say, so it is SPRAYED: one variant per table the victim owns
 * rows in. A wrong guess only produces a "not found"; a missing guess hides a
 * hole, so the generator guesses wide.
 */
import { z } from "zod";

/** Field name → the table its number points into. */
export const FIELD_TABLE: Record<string, string> = {
  bidId: "bids",
  bidPdfId: "bid_pdfs",
  sheetId: "bid_pdf_sheets",
  capturedFromSheetId: "bid_pdf_sheets",
  assemblyId: "assemblies",
  materialId: "materials",
  clientId: "clients",
  kitId: "kits",
  laborRateId: "labor_rates",
  laborStepId: "labor_steps",
  modifierIds: "modifiers",
  groupId: "takeoff_groups",
  runId: "takeoff_runs",
  hostRunId: "takeoff_runs",
  rootRunId: "takeoff_runs",
  runTypeId: "takeoff_run_types",
  stampId: "takeoff_stamps",
  startStampId: "takeoff_stamps",
  endStampId: "takeoff_stamps",
  leavingStampId: "takeoff_stamps",
  symbolId: "symbol_links",
  toSymbolId: "symbol_links",
  lookId: "symbol_looks",
  symbolLinkId: "symbol_links",
  findingId: "plan_copilot_findings",
  findingIds: "plan_copilot_findings",
  circuitId: "bid_panel_circuits",
  circuitIds: "bid_panel_circuits",
  lineId: "bid_line_items",
  lineIds: "bid_line_items",
  noteId: "scope_notes",
  itemId: "expense_items",
  taxJurisdictionId: "tax_jurisdictions",
  userId: "users",
  companyId: "companies",
  projectId: "projects",
  projectAssemblyId: "project_assemblies",
  masterItemId: "master_items",
  masterAssemblyId: "master_assemblies",
  defaultLaborRateId: "master_labor_rates",
  itemIds: "plan_copilot_findings",
};

/** `racewayMaterialId`, `conductorMaterialId` … all point at materials. */
export function tableForField(name: string): string | undefined {
  if (FIELD_TABLE[name]) return FIELD_TABLE[name];
  if (/MaterialId$/.test(name)) return "materials";
  if (/RunTypeId$/.test(name)) return "takeoff_run_types";
  if (/StampId$/.test(name)) return "takeoff_stamps";
  if (/SheetId$/.test(name)) return "bid_pdf_sheets";
  return undefined;
}

/** A field that names no table: sprayed across every table. */
export const SPRAYED = new Set(["id", "ids"]);

type Json = Record<string, unknown>;

/** Where the values come from: whose ids, and what to write in a string. */
export type Pool = {
  /** table → ids to try, first one used unless sprayed. */
  ids: Record<string, number[]>;
  /** Written into every free-text string, so a reply carrying it is a leak. */
  marker: string;
  /**
   * Written into every non-integer number that is not an id, when it fits the
   * field — a price, a quantity, a coordinate. A reply carrying it is a leak
   * even when no name came with it.
   */
  number?: number;
};

type Choice = { spray?: { field: string; table: string } };
type Optional = "all" | "none" | "refs";

/** A plain string with no enum — the kind of field "refs" leaves out. */
function isFreeText(schema: Json, root: Json): boolean {
  const s = resolveRef(schema, root);
  const union = (s.anyOf ?? s.oneOf) as Json[] | undefined;
  if (union)
    return union.every(o => {
      const r = resolveRef(o, root);
      return r.type === "null" || isFreeText(r, root);
    });
  const type = Array.isArray(s.type)
    ? (s.type as string[]).find(t => t !== "null")
    : s.type;
  return type === "string" && !Array.isArray(s.enum) && !("const" in s);
}

/** Make every marker string in an input unique, so a name clash cannot stop a call. */
function uniqueNames(value: unknown, marker: string, n: number): unknown {
  if (typeof value === "string")
    return value.startsWith(marker) && value.length < 190
      ? `${value} ${n}`
      : value;
  if (Array.isArray(value)) return value.map(v => uniqueNames(v, marker, n));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, uniqueNames(v, marker, n)])
    );
  return value;
}
let serial = 0;

/** JSON Schema for a procedure's first input, or null when it takes none. */
export function inputSchema(parser: unknown): Json | null {
  if (!parser) return null;
  return z.toJSONSchema(parser as z.ZodType, {
    io: "input",
    unrepresentable: "any",
  }) as Json;
}

function resolveRef(schema: Json, root: Json): Json {
  const ref = schema.$ref as string | undefined;
  if (!ref) return schema;
  const parts = ref.replace(/^#\//, "").split("/");
  let node: unknown = root;
  for (const p of parts) node = (node as Json)?.[p];
  return (node as Json) ?? {};
}

function stringFor(schema: Json, name: string, pool: Pool): string {
  const min = (schema.minLength as number | undefined) ?? 0;
  const max = (schema.maxLength as number | undefined) ?? 200;
  const fmt = schema.format as string | undefined;
  if (fmt === "email" || /email/i.test(name))
    return `${pool.marker.toLowerCase()}@example.com`;
  if (fmt === "date-time") return "2026-01-02T03:04:05.000Z";
  // A picture field is refined to a data URL in code, which JSON Schema
  // cannot carry — without this the plan reader's four routes got no input.
  if (/image|picture|thumbnail/i.test(name))
    return "data:image/png;base64,iVBORw0KGgo=";
  if (fmt === "date") return "2026-01-02";
  if (fmt === "uri" || fmt === "url" || /url$/i.test(name))
    return "https://example.com/x";
  if (schema.pattern) {
    const pattern = new RegExp(schema.pattern as string);
    for (const guess of [
      `${pool.marker} ${name}`,
      "abc",
      "ABC123",
      '1/4" = 1\'-0"',
      "123456",
      "#ffffff",
      "a-b",
      "2026-01-02",
      "E1",
    ])
      if (pattern.test(guess)) return guess.slice(0, max);
  }
  let text = `${pool.marker} ${name}`;
  while (text.length < min) text += "x";
  return text.slice(0, max);
}

function numberFor(
  schema: Json,
  name: string,
  pool: Pool,
  choice: Choice,
  integer: boolean
): number {
  const table =
    choice.spray && choice.spray.field === name
      ? choice.spray.table
      : tableForField(name);
  if (table && pool.ids[table]?.length) return pool.ids[table][0];
  const hi0 = (schema.maximum as number | undefined) ?? Number.MAX_SAFE_INTEGER;
  if (pool.number !== undefined && !integer && !table && pool.number <= hi0)
    return pool.number;
  let lo = (schema.minimum as number | undefined) ?? 1;
  const exclusive = schema.exclusiveMinimum as number | undefined;
  if (exclusive !== undefined) lo = exclusive + (integer ? 1 : 0.5);
  const hi = (schema.maximum as number | undefined) ?? Number.MAX_SAFE_INTEGER;
  const value = Math.min(Math.max(1, lo), hi);
  return integer ? Math.ceil(value) : value;
}

function sprayIdsFor(
  name: string,
  pool: Pool,
  choice: Choice
): number[] | null {
  const table =
    choice.spray && choice.spray.field === name
      ? choice.spray.table
      : tableForField(name);
  if (table && pool.ids[table]?.length) return pool.ids[table].slice(0, 3);
  return null;
}

/**
 * One value for a schema. `optional` decides which optional properties are
 * filled: all of them, none, or only the ones that can carry a reference
 * ("refs" — everything but free text). All three are tried: an optional id is
 * a hole as often as a required one, and filling every optional string can get
 * the whole input refused for a reason that has nothing to do with the id
 * (`assemblies.create` refuses an unknown mount-height key before it ever
 * looks at its materials — which hid a hole on the first run).
 */
export function generate(
  schema: Json,
  root: Json,
  pool: Pool,
  options: { optional: Optional; choice: Choice; branch?: number },
  name = "input",
  depth = 0
): unknown {
  schema = resolveRef(schema, root);
  if (depth > 8) return undefined;
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum)) return schema.enum[0];
  const union = (schema.anyOf ?? schema.oneOf) as Json[] | undefined;
  if (union) {
    const options2 = union.filter(o => resolveRef(o, root).type !== "null");
    const pick =
      depth === 0 && options.branch !== undefined
        ? options2[options.branch % options2.length]
        : options2[0];
    return generate(pick ?? {}, root, pool, options, name, depth + 1);
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length)
    return generate(
      schema.allOf[0] as Json,
      root,
      pool,
      options,
      name,
      depth + 1
    );
  const type = Array.isArray(schema.type)
    ? (schema.type as string[]).find(t => t !== "null")
    : (schema.type as string | undefined);
  switch (type) {
    case "object": {
      const out: Json = {};
      const props = (schema.properties ?? {}) as Record<string, Json>;
      const required = new Set((schema.required as string[]) ?? []);
      for (const [key, sub] of Object.entries(props)) {
        if (!required.has(key)) {
          if (options.optional === "none") continue;
          if (options.optional === "refs" && isFreeText(sub, root)) continue;
        }
        const value = generate(sub, root, pool, options, key, depth + 1);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    case "array": {
      const items = (schema.items ?? {}) as Json;
      const itemType = resolveRef(items, root).type;
      if (itemType === "integer" || itemType === "number") {
        const ids = sprayIdsFor(name, pool, options.choice);
        if (ids) {
          // Padded to the schema's minimum with the ids the pool has, so a
          // route that wants "at least two" is still reached with one row.
          const least = (schema.minItems as number | undefined) ?? 1;
          const padded = [...ids];
          for (let i = 0; padded.length < least; i++)
            padded.push(ids[i % ids.length]);
          return padded;
        }
      }
      const min = (schema.minItems as number | undefined) ?? 1;
      const max = (schema.maxItems as number | undefined) ?? 3;
      const count = Math.min(Math.max(min, 1), max);
      return Array.from({ length: count }, () =>
        generate(items, root, pool, options, name, depth + 1)
      );
    }
    case "string":
      return stringFor(schema, name, pool);
    case "integer":
      return numberFor(schema, name, pool, options.choice, true);
    case "number":
      return numberFor(schema, name, pool, options.choice, false);
    case "boolean":
      return true;
    case "null":
      return null;
    default:
      return undefined;
  }
}

/** Every field name in a schema that SPRAY applies to. */
export function sprayFields(schema: Json, root: Json, depth = 0): string[] {
  schema = resolveRef(schema, root);
  if (depth > 8) return [];
  const found = new Set<string>();
  const props = (schema.properties ?? {}) as Record<string, Json>;
  for (const [key, sub] of Object.entries(props)) {
    if (SPRAYED.has(key)) found.add(key);
    for (const f of sprayFields(sub, root, depth + 1)) found.add(f);
  }
  for (const k of ["anyOf", "oneOf", "allOf"])
    for (const sub of (schema[k] as Json[] | undefined) ?? [])
      for (const f of sprayFields(sub, root, depth + 1)) found.add(f);
  if (schema.items)
    for (const f of sprayFields(schema.items as Json, root, depth + 1))
      found.add(f);
  return Array.from(found);
}

/** How many top-level union branches a schema has (1 when it is not one). */
export function branchCount(schema: Json, root: Json): number {
  schema = resolveRef(schema, root);
  const union = (schema.anyOf ?? schema.oneOf) as Json[] | undefined;
  return union
    ? Math.max(1, union.filter(o => resolveRef(o, root).type !== "null").length)
    : 1;
}

/**
 * All the inputs worth trying for one procedure, each checked against the
 * procedure's real parser so nothing is "tried" that zod would have refused
 * before the route ran. Returns the ones that parse, plus how many did not.
 */
export function inputsFor(
  parser: unknown,
  pool: Pool,
  sprayTables: readonly string[]
): { inputs: unknown[]; refused: number } {
  const schema = inputSchema(parser);
  if (!schema) return { inputs: [undefined], refused: 0 };
  const candidates: unknown[] = [];
  const branches = branchCount(schema, schema);
  for (let branch = 0; branch < branches; branch++)
    for (const optional of ["all", "none", "refs"] as const) {
      candidates.push(
        generate(schema, schema, pool, { optional, choice: {}, branch })
      );
      for (const field of sprayFields(schema, schema))
        for (const table of sprayTables)
          candidates.push(
            generate(schema, schema, pool, {
              optional,
              choice: { spray: { field, table } },
              branch,
            })
          );
    }
  const seen = new Set<string>();
  const inputs: unknown[] = [];
  let refused = 0;
  for (const candidate of candidates) {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    const named = uniqueNames(candidate, pool.marker, ++serial);
    const ok = (parser as z.ZodType).safeParse(named).success;
    if (ok) inputs.push(named);
    else refused++;
  }
  // Nothing parsed: a string refined in code (a picture's data URL) is the
  // usual reason, and JSON Schema cannot say so. One retry with every free
  // string as a tiny image.
  if (inputs.length === 0)
    for (const candidate of candidates) {
      const pictured = asPictures(candidate, pool.marker);
      if ((parser as z.ZodType).safeParse(pictured).success)
        inputs.push(pictured);
    }
  return { inputs, refused };
}

function asPictures(value: unknown, marker: string): unknown {
  if (typeof value === "string" && value.startsWith(marker))
    return "data:image/png;base64,iVBORw0KGgo=";
  if (Array.isArray(value)) return value.map(v => asPictures(v, marker));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, asPictures(v, marker)])
    );
  return value;
}
