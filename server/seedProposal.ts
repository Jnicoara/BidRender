/**
 * THE SEED PROPOSAL — what the seed files say that the shared starter does not
 * (references/boot-seed-plan.md § 3.1).
 *
 * Until 2026-10-13 every server start wrote these differences straight onto
 * the shared rows: prices, hours, rates, run-type parts, fills, renames,
 * retirements (baseline-screen-plan.md § 9 F2–F6). That changed what every
 * company without its own copy read on each deploy, and it wrote a seed value
 * back over any change logged through `applyStarterChange`, with no log.
 *
 * Now the start computes them here and writes NONE of the numbers. One diff,
 * three readers:
 *
 *   1. the boot (server/seedShippedLibrary.ts) applies only `findingFields`
 *      — search words, shelf, description, Specialty, the project-type tag —
 *      as ONE logged `seed` batch (owner Q3, 2026-10-13), and logs a line;
 *   2. `scripts/starterDrift.mts` prints all of it, and with `--apply` sends
 *      `changes` through `applyStarterChange` (source `seed`) as one batch —
 *      pin, change, log, so no existing company's numbers move;
 *   3. later, the baseline screen ("Seed file proposes N changes").
 *
 * `held` are differences with no door yet (hide, run-type extras, labor
 * steps, an Example tag that would split from its number, a zero the sheet
 * refuses). They stay in the seed file and in this list until there is one.
 * `liveAhead` are fields a person changed through the screen / sheet / copy:
 * the seed is BEHIND there, and "Export to seed" closes it — never the boot.
 *
 * Read-only. Every field's fate is decided by `starterFieldKind`, not by a
 * list here (`server/bootLeavesStarterNumbers.test.ts`, T8).
 */
import { and, eq, isNull } from "drizzle-orm";
import {
  assemblies,
  assemblyLaborSteps,
  assemblyMaterials,
  laborRates,
  laborSteps,
  materials,
  takeoffRunTypeExtras,
  takeoffRunTypes,
} from "../drizzle/schema";
import * as db from "./db";
import { isMissingTable } from "./schemaCheck";
import {
  applyStarterChange,
  starterTableName,
  type ApplyStarterResult,
  type StarterChangeInput,
} from "./starterChanges";
import {
  sameStarterValue,
  starterFieldKind,
  type StarterTable,
} from "../shared/starterChange";
import { ABOVE_ZERO_FIELDS } from "../shared/starterSheetChecks";
import {
  BASELINE_MATERIALS,
  RENAMED_BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
  type BaselineMaterial,
} from "./seed/baselineMaterials";
import { BASELINE_LABOR_RATES } from "./seed/baselineLaborRates";
import {
  BASELINE_RUN_TYPES,
  RETIRED_BASELINE_RUN_TYPES,
  RUN_TYPE_MATERIAL_SWAPS,
} from "./seed/baselineRunTypes";
import {
  BASELINE_ASSEMBLIES,
  RENAMED_BASELINE_ASSEMBLIES,
  DEFAULT_ASSEMBLY_ROLE,
} from "./seed/baselineAssemblies";
import type { BaselineAssembly } from "./seed/assemblyRecipe";
import { starterPartName } from "./seed/starterParts";
import { STARTER_ASSEMBLY_HOURS } from "./seed/starterAssemblyHours";
import {
  STARTER_ASSEMBLY_OVERHEAD,
  STARTER_HOURS_CLEARED,
} from "./seed/starterAssemblyOverhead";
import { STARTER_LABOR_STEPS } from "./seed/starterLaborSteps";

// ─── Shapes ──────────────────────────────────────────────────────────────────

export type SeedHeld = { row: string; what: string; why: string };
export type SeedLiveAhead = {
  row: string;
  field: string;
  live: unknown;
  seed: unknown;
};
export type SeedProposal = {
  /** Finding fields: the boot applies these itself, logged (owner Q3). */
  findingFields: StarterChangeInput[];
  /** Numbers and names: applied only when somebody confirms them. */
  changes: StarterChangeInput[];
  /** One readable line per entry of `findingFields` then `changes`. */
  lines: string[];
  held: SeedHeld[];
  liveAhead: SeedLiveAhead[];
};

/** What to compare against. A test passes probe lists; the default ships. */
export type SeedSource = {
  materials?: readonly BaselineMaterial[];
  assemblies?: readonly BaselineAssembly[];
  /** Old shared assembly name -> seed name; a test passes a probe map. */
  assemblyRenames?: Readonly<Record<string, string>>;
};

/** Held, with this reason, because the tag must travel with its number. */
/*
  applyStarterChange DOES write the tag with its number now (Track B,
  2026-10-14: `exampleTagAfter`, shared/starterChange.ts), so this hold can
  be lifted where the tag the change would write equals the seed's. Lifting
  it is `starterDrift --apply`'s call — Track A's (starter-offers-plan.md § 4
  step 1). Until then a logged change a person made is reported live-ahead
  BEFORE this hold is considered (`isLiveAhead`).
*/
const TAG_SPLIT =
  "its Example tag would change too; applyStarterChange now writes the tag with the number, but starterDrift --apply has not been switched over yet (Track A)";
const NO_DOOR_HIDE =
  "a retire is a hide; hideStarterItem is not built yet (Track C)";
const NO_DOOR_EXTRAS = "run-type extras are not in applyStarterChange yet";
const NO_DOOR_STEPS = "labor steps are not in applyStarterChange yet";

// ─── The collector ───────────────────────────────────────────────────────────

class Collector {
  readonly findingFields: StarterChangeInput[] = [];
  readonly changes: StarterChangeInput[] = [];
  private readonly findingLines: string[] = [];
  private readonly changeLines: string[] = [];
  readonly held: SeedHeld[] = [];
  readonly liveAhead: SeedLiveAhead[] = [];
  private readonly logged = new Map<
    string,
    Awaited<ReturnType<typeof db.latestLoggedChanges>>[number]
  >();

  async loadLog(table: StarterTable) {
    for (const entry of await db.latestLoggedChanges(starterTableName(table)))
      this.logged.set(`${table}|${entry.rowId}|${entry.field}`, entry);
  }

  /**
   * One field that differs from the seed. Its kind decides where it goes;
   * a field a person changed on the screen and still holds is live-ahead.
   */
  /**
   * A person changed this field (screen, sheet, copy) and the row still holds
   * it. Asked BEFORE any tag-split hold: since applyStarterChange writes the
   * Example tag with its number (Track B, 2026-10-14), a logged price also
   * moved its tag, so the tag differing from the seed is that same change,
   * not a split.
   */
  isLiveAhead(table: StarterTable, rowId: number, field: string): boolean {
    const entry = this.logged.get(`${table}|${rowId}|${field}`);
    return Boolean(entry && entry.source !== "seed" && entry.rowHoldsNew);
  }

  field(
    table: StarterTable,
    rowId: number,
    row: string,
    field: string,
    live: unknown,
    seed: unknown
  ) {
    if (sameStarterValue(live, seed)) return;
    if (this.isLiveAhead(table, rowId, field)) {
      this.liveAhead.push({ row, field, live, seed });
      return;
    }
    const kind = starterFieldKind(table, field);
    const line = `${row}: ${field} ${JSON.stringify(live ?? null)} -> ${JSON.stringify(seed ?? null)}`;
    if (kind === "everyone") {
      this.findingFields.push({
        table,
        rowId,
        kind: "field",
        field,
        newValue: seed,
      });
      this.findingLines.push(line);
      return;
    }
    if (kind !== "offer") {
      this.held.push({
        row,
        what: `${field} ${JSON.stringify(live ?? null)} -> ${JSON.stringify(seed ?? null)}`,
        why:
          kind === "unit"
            ? "a unit is never changed on an existing item"
            : `"${field}" is not a field a starter change may set`,
      });
      return;
    }
    const aboveZero = (ABOVE_ZERO_FIELDS[table] ?? []).includes(field);
    if (aboveZero && seed !== null && seed !== undefined && Number(seed) <= 0) {
      this.held.push({
        row,
        what: `${field} ${JSON.stringify(live ?? null)} -> ${JSON.stringify(seed)}`,
        why: "the seed says 0, and a starter number must be above 0 (blank = not set)",
      });
      return;
    }
    this.changes.push({ table, rowId, kind: "field", field, newValue: seed });
    this.changeLines.push(line);
  }

  part(change: StarterChangeInput, line: string) {
    this.changes.push(change);
    this.changeLines.push(line);
  }

  hold(row: string, what: string, why: string) {
    this.held.push({ row, what, why });
  }

  result(): SeedProposal {
    return {
      findingFields: this.findingFields,
      changes: this.changes,
      lines: [...this.findingLines, ...this.changeLines],
      held: this.held,
      liveAhead: this.liveAhead,
    };
  }
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ─── Materials ───────────────────────────────────────────────────────────────

const MATERIAL_NUMBER_FIELDS = [
  "costPerUnit",
  "laborHours",
  "fieldBendLaborHours",
  "stickLengthFeet",
  "strapSpacingFeet",
  "strapFromBoxFeet",
  "defaultQty",
] as const;

async function materialDiff(
  c: Collector,
  catalog: readonly BaselineMaterial[]
) {
  const handle = (await db.getDb())!;
  await c.loadLog("materials");
  const rows = await handle
    .select()
    .from(materials)
    .where(isNull(materials.userId));
  const seedByName = new Map(catalog.map(m => [m.name, m]));
  const shared = new Set(rows.map(r => r.name));
  const retired = new Set(RETIRED_BASELINE_MATERIALS);

  for (const row of rows) {
    const label = `material #${row.id} "${row.name}"`;
    if (retired.has(row.name) && row.isActive) {
      c.hold(label, "retire (isActive -> false)", NO_DOOR_HIDE);
      continue;
    }
    let intended = seedByName.get(row.name);
    // A rename the seed says and this database has not had (Q17: an offer).
    const renamedTo = RENAMED_BASELINE_MATERIALS[row.name];
    if (
      !intended &&
      renamedTo !== undefined &&
      seedByName.has(renamedTo) &&
      !shared.has(renamedTo)
    ) {
      intended = seedByName.get(renamedTo)!;
      c.field("materials", row.id, label, "name", row.name, renamedTo);
    }
    if (!intended) continue;

    // Finding fields.
    c.field(
      "materials",
      row.id,
      label,
      "category",
      row.category,
      intended.category
    );
    c.field(
      "materials",
      row.id,
      label,
      "searchAliases",
      row.searchAliases,
      intended.searchAliases
    );
    c.field(
      "materials",
      row.id,
      label,
      "description",
      row.description,
      intended.description ?? null
    );
    c.field(
      "materials",
      row.id,
      label,
      "isSpecialty",
      row.isSpecialty ?? null,
      intended.isSpecialty ?? null
    );

    // Numbers, each with the Example tag that travels with it.
    const raceway = db.racewayColumns(intended);
    const seedValue: Record<(typeof MATERIAL_NUMBER_FIELDS)[number], unknown> =
      {
        costPerUnit: intended.costPerUnit,
        laborHours: intended.laborHours ?? null,
        fieldBendLaborHours: intended.fieldBendLaborHours ?? null,
        stickLengthFeet: raceway.stickLengthFeet,
        strapSpacingFeet: raceway.strapSpacingFeet,
        strapFromBoxFeet: raceway.strapFromBoxFeet,
        defaultQty:
          intended.defaultQty != null ? intended.defaultQty.toFixed(4) : null,
      };
    const priceTagSplits =
      (row.isExamplePrice ?? null) !== (intended.isExamplePrice ?? null);
    const hoursTagSplits =
      (row.isExampleLaborHours ?? null) !==
      (intended.isExampleLaborHours ?? null);
    for (const field of MATERIAL_NUMBER_FIELDS) {
      const live = row[field];
      const seed = seedValue[field];
      if (sameStarterValue(n(live), n(seed))) continue;
      const splits =
        !c.isLiveAhead("materials", row.id, field) &&
        ((field === "costPerUnit" && priceTagSplits) ||
          ((field === "laborHours" || field === "fieldBendLaborHours") &&
            hoursTagSplits));
      if (splits) {
        c.hold(label, `${field} ${String(live)} -> ${String(seed)}`, TAG_SPLIT);
        continue;
      }
      c.field("materials", row.id, label, field, live, seed);
    }
    c.field(
      "materials",
      row.id,
      label,
      "stickJoint",
      row.stickJoint,
      raceway.stickJoint
    );
    // A tag that differs with its number already equal: held on its own.
    if (
      priceTagSplits &&
      sameStarterValue(n(row.costPerUnit), n(seedValue.costPerUnit))
    )
      c.hold(
        label,
        `isExamplePrice ${String(row.isExamplePrice)} -> ${String(intended.isExamplePrice ?? null)}`,
        TAG_SPLIT
      );
    if (
      hoursTagSplits &&
      sameStarterValue(n(row.laborHours), n(seedValue.laborHours)) &&
      sameStarterValue(
        n(row.fieldBendLaborHours),
        n(seedValue.fieldBendLaborHours)
      )
    )
      c.hold(
        label,
        `isExampleLaborHours ${String(row.isExampleLaborHours)} -> ${String(intended.isExampleLaborHours ?? null)}`,
        TAG_SPLIT
      );
  }
}

// ─── Labor rates ─────────────────────────────────────────────────────────────

async function laborRateDiff(c: Collector) {
  const handle = (await db.getDb())!;
  await c.loadLog("laborRates");
  const rows = await handle
    .select()
    .from(laborRates)
    .where(isNull(laborRates.userId));
  const intended = new Map(BASELINE_LABOR_RATES.map(r => [r.name, r]));
  for (const row of rows) {
    const want = intended.get(row.name);
    if (!want) continue;
    const label = `labor rate #${row.id} "${row.name}"`;
    const cols = db.laborRateSeedColumns(want);
    const tagSplits = (row.isExampleRate ?? null) !== cols.isExampleRate;
    if (row.rateType !== want.rateType)
      c.field(
        "laborRates",
        row.id,
        label,
        "rateType",
        row.rateType,
        want.rateType
      );
    // Compared as the old re-stamp compared them — salary and hours with a
    // blank read as 0 — so a database the old boot left converged proposes
    // nothing.
    const diffs: Array<[string, unknown, unknown, boolean]> = [
      [
        "hourlyCost",
        row.hourlyCost,
        want.hourlyCost,
        Number(row.hourlyCost) !== Number(want.hourlyCost),
      ],
      [
        "annualSalary",
        row.annualSalary,
        want.annualSalary,
        Number(row.annualSalary ?? 0) !== Number(want.annualSalary ?? 0),
      ],
      [
        "annualHours",
        row.annualHours,
        want.annualHours,
        Number(row.annualHours ?? 0) !== Number(want.annualHours ?? 0),
      ],
      ...(
        [
          "baseWage",
          "payrollTaxPct",
          "workersCompPct",
          "insurancePct",
          "benefitsPct",
        ] as const
      ).map(
        key =>
          [key, row[key], cols[key], n(row[key]) !== n(cols[key])] as [
            string,
            unknown,
            unknown,
            boolean,
          ]
      ),
    ];
    // A field a person changed and still holds is live-ahead, tag and all.
    for (const d of diffs.filter(
      d => d[3] && c.isLiveAhead("laborRates", row.id, d[0])
    ))
      c.field("laborRates", row.id, label, d[0], d[1], d[2] ?? null);
    const differing = diffs.filter(
      d => d[3] && !c.isLiveAhead("laborRates", row.id, d[0])
    );
    const aheadOnly =
      differing.length === 0 &&
      diffs.some(d => d[3] && c.isLiveAhead("laborRates", row.id, d[0]));
    if (tagSplits && !aheadOnly) {
      c.hold(
        label,
        [
          `isExampleRate ${String(row.isExampleRate)} -> ${String(cols.isExampleRate)}`,
          ...differing.map(d => `${d[0]} ${String(d[1])} -> ${String(d[2])}`),
        ].join("; "),
        TAG_SPLIT
      );
      continue;
    }
    for (const [field, live, seed] of differing)
      c.field("laborRates", row.id, label, field, live, seed ?? null);
  }
}

// ─── Assemblies ──────────────────────────────────────────────────────────────

async function assemblyDiff(
  c: Collector,
  specs: readonly BaselineAssembly[],
  materialIdByName: Map<string, number>,
  renames: Readonly<Record<string, string>> = RENAMED_BASELINE_ASSEMBLIES
) {
  const handle = (await db.getDb())!;
  await c.loadLog("assemblies");
  const rows = await handle
    .select()
    .from(assemblies)
    .where(isNull(assemblies.userId));
  const byName = new Map(rows.map(r => [r.name, r]));
  const label = (r: { id: number; name: string }) =>
    `assembly #${r.id} "${r.name}"`;

  // A rename the seed says and this database has not had (Q17: an offer),
  // as materialDiff does. The row then answers to its seed name below, so
  // the rest of its diff is read against the right spec.
  const seedNames = new Set(specs.map(s => s.name));
  for (const [from, to] of Object.entries(renames)) {
    const row = byName.get(from);
    if (!row || !seedNames.has(to) || byName.has(to)) continue;
    c.field("assemblies", row.id, label(row), "name", row.name, to);
    byName.set(to, row);
  }

  // The role every starter is costed against, filled where none (F6).
  const [defaultRole] = await handle
    .select({ id: laborRates.id })
    .from(laborRates)
    .where(
      and(isNull(laborRates.userId), eq(laborRates.name, DEFAULT_ASSEMBLY_ROLE))
    )
    .limit(1);
  if (defaultRole)
    for (const row of rows)
      if (row.laborRateId === null)
        c.field(
          "assemblies",
          row.id,
          label(row),
          "laborRateId",
          null,
          defaultRole.id
        );

  for (const spec of specs) {
    const row = byName.get(spec.name);
    if (!row) continue;
    if (spec.projectType !== null)
      c.field(
        "assemblies",
        row.id,
        label(row),
        "projectType",
        row.projectType,
        spec.projectType
      );
    if (spec.laborOnly === true && row.laborOnly === null)
      c.field("assemblies", row.id, label(row), "laborOnly", null, true);
    if (spec.mountsAt && row.mountHeightTypeKey === null)
      c.field(
        "assemblies",
        row.id,
        label(row),
        "mountHeightTypeKey",
        null,
        spec.mountsAt
      );
    // Hours from the owner's sheet, overhead (Q2) and cleared hours (Q7):
    // each a number with its "Example hours" tag (0133).
    const hours = STARTER_ASSEMBLY_HOURS[spec.name];
    if (hours !== undefined) hoursWithTag(c, row, "baseLaborHours", hours);
    const overhead = STARTER_ASSEMBLY_OVERHEAD[spec.name];
    if (overhead !== undefined)
      hoursWithTag(c, row, "overheadLaborHours", Number(overhead).toFixed(4));
    if (
      STARTER_HOURS_CLEARED.includes(spec.name) &&
      row.baseLaborHours !== null
    )
      hoursWithTag(c, row, "baseLaborHours", null);
  }

  // Branch whips the seed declares, on lines not marked (D18): a part field.
  const lines = await handle
    .select({
      assemblyId: assemblyMaterials.assemblyId,
      materialId: assemblyMaterials.materialId,
      isBranchWhip: assemblyMaterials.isBranchWhip,
    })
    .from(assemblyMaterials)
    .innerJoin(assemblies, eq(assemblies.id, assemblyMaterials.assemblyId))
    .where(isNull(assemblies.userId));
  for (const spec of specs) {
    const row = byName.get(spec.name);
    if (!row) continue;
    for (const part of spec.materials) {
      if (!part.branchWhip) continue;
      const materialId = materialIdByName.get(starterPartName(part.part));
      if (materialId === undefined) continue;
      for (const line of lines)
        if (
          line.assemblyId === row.id &&
          line.materialId === materialId &&
          !line.isBranchWhip
        )
          c.part(
            {
              table: "assemblies",
              rowId: row.id,
              kind: "part_field",
              childTable: "assembly_materials",
              childRefId: materialId,
              field: "isBranchWhip",
              newValue: true,
            },
            `${label(row)}: part ${materialId} isBranchWhip false -> true`
          );
    }
  }
}

function hoursWithTag(
  c: Collector,
  row: typeof assemblies.$inferSelect,
  field: "baseLaborHours" | "overheadLaborHours",
  seed: string | null
) {
  const label = `assembly #${row.id} "${row.name}"`;
  if (sameStarterValue(n(row[field]), n(seed))) {
    if (row.isExampleHours !== true)
      c.hold(
        label,
        `isExampleHours ${String(row.isExampleHours)} -> true`,
        TAG_SPLIT
      );
    return;
  }
  if (
    row.isExampleHours !== true &&
    !c.isLiveAhead("assemblies", row.id, field)
  ) {
    c.hold(
      label,
      `${field} ${String(row[field])} -> ${String(seed)}`,
      TAG_SPLIT
    );
    return;
  }
  c.field("assemblies", row.id, label, field, row[field], seed);
}

// ─── Run types ───────────────────────────────────────────────────────────────

const LINKS = [
  ["racewayMaterialId", "racewayMaterialName"],
  ["conductorMaterialId", "conductorMaterialName"],
  ["groundMaterialId", "groundMaterialName"],
] as const;

async function runTypeDiff(
  c: Collector,
  materialIdByName: Map<string, number>
) {
  const handle = (await db.getDb())!;
  await c.loadLog("runTypes");
  const rows = await handle
    .select()
    .from(takeoffRunTypes)
    .where(isNull(takeoffRunTypes.userId));
  const key = (pathType: string, label: string) => `${pathType}:${label}`;
  const byKey = new Map(rows.map(r => [key(r.pathType, r.label), r]));
  const label = (r: { id: number; label: string }) =>
    `run type #${r.id} "${r.label}"`;
  const idOf = (name: string | null) =>
    name === null ? null : (materialIdByName.get(name) ?? null);

  // Planned per (row, link), so a NULL fill and a swap cannot both land.
  const planned = new Map<
    string,
    { row: (typeof rows)[number]; field: string; to: number }
  >();
  for (const t of BASELINE_RUN_TYPES) {
    const row = byKey.get(key(t.pathType, t.label));
    if (!row) continue;
    for (const [field, nameKey] of LINKS) {
      const want = idOf(t[nameKey]);
      if (row[field] === null && want !== null)
        planned.set(`${row.id}|${field}`, { row, field, to: want });
    }
  }
  for (const { from, to } of RUN_TYPE_MATERIAL_SWAPS) {
    const fromId = idOf(from);
    const toId = idOf(to);
    if (fromId === null || toId === null) continue;
    for (const row of rows)
      for (const [field] of LINKS)
        if (row[field] === fromId)
          planned.set(`${row.id}|${field}`, { row, field, to: toId });
  }
  for (const { row, field, to } of Array.from(planned.values()))
    c.field(
      "runTypes",
      row.id,
      label(row),
      field,
      row[field as (typeof LINKS)[number][0]],
      to
    );

  // Extras missing on an existing type, and retired types: no door yet.
  const extras = await handle
    .select({
      runTypeId: takeoffRunTypeExtras.runTypeId,
      materialId: takeoffRunTypeExtras.materialId,
    })
    .from(takeoffRunTypeExtras)
    .where(isNull(takeoffRunTypeExtras.userId));
  const have = new Set(extras.map(e => `${e.runTypeId}:${e.materialId}`));
  for (const t of BASELINE_RUN_TYPES) {
    const row = byKey.get(key(t.pathType, t.label));
    if (!row) continue;
    for (const extra of t.extras ?? []) {
      const materialId = idOf(extra.materialName);
      if (materialId === null || have.has(`${row.id}:${materialId}`)) continue;
      c.hold(label(row), `add extra "${extra.materialName}"`, NO_DOOR_EXTRAS);
    }
  }
  for (const { pathType, label: name } of RETIRED_BASELINE_RUN_TYPES) {
    const row = byKey.get(key(pathType, name));
    if (row && row.status === "active")
      c.hold(label(row), "retire (status -> archived)", NO_DOOR_HIDE);
  }
}

// ─── Labor steps (all held: no door yet) ─────────────────────────────────────

async function laborStepDiff(c: Collector, specs: readonly BaselineAssembly[]) {
  const handle = (await db.getDb())!;
  await db.stepsTablesMissing(async () => {
    const shipped = await handle
      .select()
      .from(laborSteps)
      .where(isNull(laborSteps.userId));
    const byKey = new Map(shipped.map(r => [r.stepKey, r]));
    const wanted = new Set(STARTER_LABOR_STEPS.map(s => s.key));
    for (const step of STARTER_LABOR_STEPS) {
      const row = byKey.get(step.key);
      if (!row) continue;
      const want = db.starterStepFields(step);
      const differs = (Object.keys(want) as Array<keyof typeof want>).filter(
        f => !sameStarterValue(row[f] ?? null, want[f])
      );
      if (differs.length > 0)
        c.hold(`labor step "${step.key}"`, differs.join(", "), NO_DOOR_STEPS);
    }
    for (const row of shipped)
      if (row.stepKey !== null && !wanted.has(row.stepKey) && row.isActive)
        c.hold(`labor step "${row.stepKey}"`, "retire", NO_DOOR_STEPS);

    const starters = await handle
      .select({ id: assemblies.id, name: assemblies.name })
      .from(assemblies)
      .where(isNull(assemblies.userId));
    const specNames = new Set(specs.map(s => s.name));
    for (const starter of starters) {
      if (!specNames.has(starter.name)) continue;
      const want = await db.starterStepListLines(starter.name);
      if (want === null) continue;
      const current = await handle
        .select()
        .from(assemblyLaborSteps)
        .where(eq(assemblyLaborSteps.assemblyId, starter.id));
      current.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      const same =
        current.length === want.length &&
        current.every(
          (row, i) =>
            row.kind === want[i].kind &&
            (row.laborStepId ?? null) === want[i].laborStepId &&
            Number(row.count).toFixed(2) === want[i].count
        );
      if (!same)
        c.hold(
          `assembly #${starter.id} "${starter.name}"`,
          "step list",
          NO_DOOR_STEPS
        );
    }
  }, undefined);
}

// ─── The three readers ───────────────────────────────────────────────────────

/** Everything the seed says that the shared starter does not. Read-only. */
export async function seedProposal(
  source: SeedSource = {}
): Promise<SeedProposal> {
  const c = new Collector();
  if (!(await db.getDb())) return c.result();
  const catalog = source.materials ?? BASELINE_MATERIALS;
  const specs = source.assemblies ?? BASELINE_ASSEMBLIES;
  const materialIdByName = await db.shippedMaterialIdsByName();
  await materialDiff(c, catalog);
  await laborRateDiff(c);
  await assemblyDiff(c, specs, materialIdByName, source.assemblyRenames);
  await runTypeDiff(c, materialIdByName);
  await laborStepDiff(c, specs);
  return c.result();
}

/**
 * The boot's one write from the proposal: the finding fields, as ONE logged
 * `seed` batch (owner Q3). Nothing when nothing differs. Before 0152 there is
 * no log to write to, so it writes nothing and says so — the finding fields
 * then wait for the next start, which is "keeps too little", never "writes
 * unlogged".
 */
export async function applySeedFindingFields(
  proposal: SeedProposal
): Promise<ApplyStarterResult | "no-log" | null> {
  if (proposal.findingFields.length === 0) return null;
  try {
    return await applyStarterChange({
      editorUserId: null,
      source: "seed",
      note: "Server start: finding fields from the seed files (search words, shelf, description, Specialty, project type).",
      changes: proposal.findingFields,
    });
  } catch (err) {
    if (isMissingTable(err)) return "no-log";
    throw err;
  }
}

/**
 * `starterDrift.mts --apply`: the proposed numbers and names, confirmed by a
 * person, through `applyStarterChange` as one `seed` batch — pin every
 * company without a copy, change, log. Held entries are never in it.
 */
export async function applySeedProposal(
  proposal: SeedProposal,
  note: string
): Promise<ApplyStarterResult | null> {
  if (proposal.changes.length === 0) return null;
  return applyStarterChange({
    editorUserId: null,
    source: "seed",
    note,
    changes: proposal.changes,
  });
}

/** The boot's log line. */
export function seedProposalSummary(
  proposal: SeedProposal,
  applied: number
): string {
  return `[seed] starter: finding fields applied ${applied}; proposed ${proposal.changes.length} (not applied), held ${proposal.held.length}, live ahead ${proposal.liveAhead.length}${
    proposal.changes.length + proposal.held.length > 0
      ? " — scripts/starterDrift.mts lists them"
      : ""
  }`;
}
