/**
 * EVERY STORED ID POINTING AT A FORKABLE ROW MUST BE ACCOUNTED FOR.
 *
 * ── Why this test exists, and why it is a REGISTRY rather than advice ────────
 * Editing a row this app ships does not change it — it FORKS: a new row, a new
 * id, a `baselineId` pointing back, and `mergeLibraryRows` then hides the
 * baseline. Anything still holding the old id is now pointing at the row the
 * fork replaced. Nothing errors. The symptom is always a number: a $0 material
 * inside a priced assembly, a modifier that stopped applying, footage missing
 * from a bid.
 *
 * **It has now happened four times**, and every one was found by accident —
 * labour rates, materials, modifiers, and on 2026-09-20 run types, where two
 * 1/2" EMT homeruns and a 12-2 MC run quietly fell out of a bid. Four means
 * there will be a fifth, so the point of this file is that the fifth goes RED
 * instead of being noticed a year later by somebody pricing a job.
 *
 * ── How it works ─────────────────────────────────────────────────────────────
 * The list of references is read from the SCHEMA, not written by hand: a
 * forkable table is one carrying a `baselineId`, and every foreign key into one
 * is a reference that has to be accounted for. So a new column cannot be missed
 * by forgetting to add it here — adding the column IS what makes this test
 * demand an answer.
 *
 * Each reference must be declared exactly one of three ways:
 *
 *   resolver   read through a named resolver, in a named file. The file is
 *              checked for that resolver's name, so the claim cannot be a
 *              sentence somebody typed once and stopped meaning.
 *   exempt     does not need resolving, with the reason. Ownership links are
 *              the honest case: a forked row's children are COPIED to the fork,
 *              so they already point at it.
 *   unreviewed nobody has traced this one yet, with the date. It is not a
 *              verdict and must not be read as one — it is a to-do that this
 *              file keeps visible instead of letting it look settled.
 *
 * ── What it does NOT prove ───────────────────────────────────────────────────
 * That the resolver is reached on every path. A registry cannot know that. What
 * it makes impossible is the thing that actually happened four times: a new
 * reference appearing with nobody having asked the question at all.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";

type Entry =
  | { kind: "resolver"; resolver: string; readBy: string; note?: string }
  | { kind: "exempt"; why: string }
  | { kind: "unreviewed"; since: string; why: string };

/**
 * Every column that stores an id into a forkable table.
 *
 * Keyed `table.column`. The value says how the app turns that stored id into
 * the row the user actually means — or admits that nobody has checked.
 */
const REGISTRY: Record<string, Entry> = {
  // ── Ownership: the fork's children are copied to it, so they already point
  //    at the fork. `copyAssemblyChildren` is what makes this true. ──────────
  "assembly_materials.assemblyId": {
    kind: "exempt",
    why: "Ownership. Forking an assembly copies its component lines to the new row, so a line already points at the fork it belongs to — it is not a reference to somebody else's library row.",
  },
  "assembly_modifiers.assemblyId": {
    kind: "exempt",
    why: "Ownership, exactly as assembly_materials.assemblyId.",
  },
  "kit_assemblies.kitId": {
    kind: "exempt",
    why: "Ownership. A kit's member rows belong to that kit and are copied when it forks.",
  },

  // ── Resolved ─────────────────────────────────────────────────────────────
  "assembly_materials.materialId": {
    kind: "resolver",
    resolver: "resolveMaterial",
    readBy: "server/db.ts",
    note: "getAssemblyMaterialLines. Fixed 2026-09-20: pricing a starter material did nothing for any assembly built from it.",
  },
  "assemblies.laborRateId": {
    kind: "resolver",
    resolver: "resolveLaborRate",
    readBy: "server/routers/assembliesRouter.ts",
    note: "And hourlyCostFor in server/db.ts, which delegates to the same resolver.",
  },
  "assembly_modifiers.modifierId": {
    kind: "resolver",
    resolver: "appliedModifiers",
    readBy: "server/db.ts",
    note: "appliedModifiers resolves each id through resolveModifier before summing. Fixed 2026-09-20: a forked modifier stopped applying.",
  },
  "pricing_defaults.defaultLaborRateId": {
    kind: "resolver",
    resolver: "hourlyCostFor",
    readBy: "server/db.ts",
  },
  "takeoff_run_types.racewayMaterialId": {
    kind: "resolver",
    resolver: "resolveMaterial",
    readBy: "server/routers/takeoffRunTypesRouter.ts",
  },
  "takeoff_run_types.conductorMaterialId": {
    kind: "resolver",
    resolver: "resolveMaterial",
    readBy: "server/routers/takeoffRunTypesRouter.ts",
  },
  "takeoff_run_types.groundMaterialId": {
    kind: "resolver",
    resolver: "resolveMaterial",
    readBy: "server/routers/takeoffRunTypesRouter.ts",
  },
  // The named-fitting overrides (0082). Resolved with the raceway in
  // fittingRowsByRunType, so a company's fork of the part it named wins.
  "takeoff_run_types.couplingMaterialId": {
    kind: "resolver",
    resolver: "resolveMaterial",
    readBy: "server/db.ts",
  },
  "takeoff_run_types.connectorMaterialId": {
    kind: "resolver",
    resolver: "resolveMaterial",
    readBy: "server/db.ts",
  },
  "takeoff_run_types.strapMaterialId": {
    kind: "resolver",
    resolver: "resolveMaterial",
    readBy: "server/db.ts",
  },
  // The bend overrides (0084). Nothing reads them in the commit that adds the
  // columns; the bridge that does (bends step 4) resolves them with the other
  // overrides and turns these into resolvers.
  "takeoff_run_types.elbow90MaterialId": {
    kind: "unreviewed",
    since: "2026-09-26",
    why: "Column added by 0084; the bend bridge that reads it lands next.",
  },
  "takeoff_run_types.elbow45MaterialId": {
    kind: "unreviewed",
    since: "2026-09-26",
    why: "Column added by 0084; the bend bridge that reads it lands next.",
  },
  "takeoff_run_types.lbMaterialId": {
    kind: "unreviewed",
    since: "2026-09-26",
    why: "Column added by 0084; the bend bridge that reads it lands next.",
  },
  "takeoff_run_types.pullBoxMaterialId": {
    kind: "unreviewed",
    since: "2026-09-26",
    why: "Column added by 0084; the bend bridge that reads it lands next.",
  },
  // Which part a run-type line holds (0083). Resolved in resendPlans and
  // compared by materialItemKey, so a fork of the same part is not a swap.
  "bid_line_items.runMaterialId": {
    kind: "resolver",
    resolver: "resolveMaterial",
    readBy: "server/routers/takeoffRunTypesRouter.ts",
  },
  "takeoff_runs.runTypeId": {
    kind: "resolver",
    resolver: "resolveRunType",
    readBy: "server/routers/takeoffRunTypesRouter.ts",
    note: "The fourth instance, 2026-09-20: the bridge lost two homeruns and a cable run because runs store the baseline's id.",
  },
  "bid_line_items.takeoffRunTypeId": {
    kind: "resolver",
    resolver: "resolveRunType",
    readBy: "server/routers/takeoffRunTypesRouter.ts",
    note: "A line records the id the RUNS use, so line and runs match; the fork supplies the label and the materials.",
  },

  // ── Not traced yet. NOT a verdict — see the header. ───────────────────────
  //
  // `takeoff_groups.assemblyId` is the one to look at first and is very likely
  // the FIFTH instance: `getAssemblyDetail` reaches it through
  // `getAssemblyById`, which is a direct id lookup, so counting with a shipped
  // assembly and then pricing it would snapshot the SHIPPED row's $0 onto the
  // bid rather than the fork the user priced. Found by writing this file,
  // 2026-09-21, and not yet fixed.
  "takeoff_groups.assemblyId": {
    kind: "resolver",
    resolver: "getAssemblyForStoredReference",
    readBy: "server/db.ts",
    note: "THE FIFTH INSTANCE, and the first found on purpose rather than by accident — this file found it on 2026-09-21. addCountToBid used the literal lookup, so counting with a shipped assembly and then pricing it froze the SHIPPED row onto the bid line, permanently, because a snapshot is never re-priced. server/takeoffBridgeFlow.test.ts is the red: 0.5 h instead of 1.25 h.",
  },
  "takeoff_groups.materialId": {
    kind: "unreviewed",
    since: "2026-09-21",
    why: "Level 3 counts price from a material directly; not traced.",
  },
  "takeoff_groups.laborRateId": {
    kind: "unreviewed",
    since: "2026-09-21",
    why: "Not traced.",
  },
  "takeoff_stamps.assemblyId": {
    kind: "unreviewed",
    since: "2026-09-21",
    why: "Same family as takeoff_groups.assemblyId; not traced.",
  },
  "bid_line_items.assemblyId": {
    kind: "unreviewed",
    since: "2026-09-21",
    why: "Pricing is snapshotted so money is safe, but doubleCountedAssemblies matches on this id — a hand-added line on a fork and a plan line on the baseline would not be seen as the same thing.",
  },
  "kit_assemblies.assemblyId": {
    kind: "resolver",
    resolver: "getAssemblyForStoredReference",
    readBy: "server/routers/kitsRouter.ts, server/db.ts",
    note: "The SIXTH instance, and the second this file caught. priceAssemblyAt used getAssemblyDetail and getKitItems joined on the literal id, so a kit holding an assembly the user had priced showed the shipped row's $0 and hours. Measured before the fix: 1.2 hours where the user had typed 3 x 2. Fixed 2026-09-21; both the total and the rows it is made of, because fixing one would have made them disagree.",
  },
  "symbol_links.assemblyId": {
    kind: "unreviewed",
    since: "2026-09-21",
    why: "Loads an assembly for stamping; not traced.",
  },
  "assembly_hour_suggestions.assemblyId": {
    kind: "unreviewed",
    since: "2026-09-21",
    why: "Looks like provenance only; not traced.",
  },
  "bid_closeout_lines.assemblyId": {
    kind: "unreviewed",
    since: "2026-09-21",
    why: "Looks like provenance only; not traced.",
  },
  "plan_copilot_findings.assemblyId": {
    kind: "unreviewed",
    since: "2026-09-21",
    why: "Looks like provenance only; not traced.",
  },
};

/** Every table in the schema, with its drizzle config. */
function allTables() {
  /*
    `unknown[]`, because that is what this really is: every export of the
    schema module — tables, enum arrays, helpers — to be narrowed by the
    runtime check below. Typed as the module's own union, the guard's target
    was not assignable to it (TS2677). An annotation, not a cast: anything is
    assignable to unknown, and the compiler checks that it is.
  */
  const values: unknown[] = Object.values(schema);
  return values
    .filter(
      (value): value is Parameters<typeof getTableConfig>[0] =>
        Boolean(value) &&
        typeof value === "object" &&
        Symbol.for("drizzle:Name") in (value as object)
    )
    .map(table => getTableConfig(table));
}

/** A table is forkable when it carries a `baselineId`. */
function forkableTableNames(): Set<string> {
  return new Set(
    allTables()
      .filter(cfg => cfg.columns.some(column => column.name === "baselineId"))
      .map(cfg => cfg.name)
  );
}

/** Every `table.column` storing an id into a forkable table. */
function referencesIntoForkables(): string[] {
  const forkable = forkableTableNames();
  const found: string[] = [];
  for (const cfg of allTables()) {
    for (const key of cfg.foreignKeys) {
      const reference = key.reference();
      const target = getTableConfig(reference.foreignTable).name;
      if (!forkable.has(target)) continue;
      for (const column of reference.columns) {
        found.push(`${cfg.name}.${column.name}`);
      }
    }
  }
  return Array.from(new Set(found)).sort();
}

describe("every stored id into a forkable row is accounted for", () => {
  it("knows which tables are forkable, read from the schema", () => {
    /*
      Guards the guard. If `baselineId` were ever renamed, this file would
      quietly find no forkable tables, no references, and pass — the worst
      possible failure for a test whose whole job is noticing.
    */
    const forkable = forkableTableNames();
    expect(forkable.size).toBeGreaterThanOrEqual(6);
    for (const table of [
      "materials",
      "labor_rates",
      "modifiers",
      "assemblies",
      "kits",
      "takeoff_run_types",
    ]) {
      expect(Array.from(forkable)).toContain(table);
    }
  });

  it("finds references to check, so a silent pass is impossible", () => {
    expect(referencesIntoForkables().length).toBeGreaterThanOrEqual(20);
  });

  it("HAS A DECISION FOR EVERY REFERENCE — a new one goes red here", () => {
    /*
      THE POINT OF THE FILE. Add a column pointing at a forkable table and this
      fails until somebody says how that id gets resolved, or why it does not
      need to be. Four instances of this bug reached production because nobody
      was asked the question; the answer may still be "exempt", but it has to be
      an answer.
    */
    const missing = referencesIntoForkables().filter(ref => !REGISTRY[ref]);
    expect(
      missing,
      missing.length
        ? `New reference(s) into a forkable table with no decision recorded:\n` +
            missing.map(m => `  ${m}`).join("\n") +
            `\n\nAdd each to REGISTRY in this file as { kind: "resolver" }, ` +
            `{ kind: "exempt" } or { kind: "unreviewed" }. See the header.`
        : undefined
    ).toEqual([]);
  });

  it("has no stale entries for references that no longer exist", () => {
    // A registry that outlives its column starts describing a shape the schema
    // has stopped having, which is how a file like this becomes fiction.
    const live = new Set(referencesIntoForkables());
    const stale = Object.keys(REGISTRY).filter(ref => !live.has(ref));
    expect(stale).toEqual([]);
  });

  it("checks that each claimed resolver is actually named in the file it cites", () => {
    /*
      A registry entry is a claim about code somewhere else, which CLAUDE.md
      names as the dangerous kind of comment. This is the cheapest thing that
      can falsify one: the named file must at least mention the resolver. It
      does not prove the resolver is reached on every path — nothing here can —
      but it does mean an entry cannot survive the resolver being deleted.
    */
    const root = path.resolve(__dirname, "..");
    const broken: string[] = [];
    for (const [ref, entry] of Object.entries(REGISTRY)) {
      if (entry.kind !== "resolver") continue;
      /*
        readBy may name SEVERAL files, comma separated, and every one of them
        is checked. A reference read in two places — kit_assemblies.assemblyId
        is priced in the router and displayed from db.ts — has to be resolved
        in both, and listing only the one that happens to pass would make this
        check weaker exactly where the risk is highest.
      */
      for (const cited of entry.readBy.split(",").map(part => part.trim())) {
        const file = path.join(root, cited);
        if (!fs.existsSync(file)) {
          broken.push(`${ref}: ${cited} does not exist`);
          continue;
        }
        if (!fs.readFileSync(file, "utf8").includes(entry.resolver)) {
          broken.push(`${ref}: ${cited} never mentions ${entry.resolver}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("keeps the unreviewed list from growing quietly", () => {
    /*
      `unreviewed` is an admission, not a resting place. Pinning the count means
      adding another one is a deliberate edit somebody sees in review, and
      working through them makes this number fall.

      If this fails because the number went DOWN, that is the good direction —
      lower the expectation. If it went up, say why in the entry.
    */
    const unreviewed = Object.entries(REGISTRY).filter(
      ([, entry]) => entry.kind === "unreviewed"
    );
    // 9 -> 13 on 2026-09-26 for the four bend overrides 0084 adds before the
    // bridge that reads them; bends step 4 resolves them and puts this back
    // to 9.
    expect(unreviewed.length).toBeLessThanOrEqual(13);
  });
});
