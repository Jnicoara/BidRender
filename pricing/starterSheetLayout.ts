/**
 * ONE layout for the two starter sheets — what the builder writes
 * (pricing/buildStarterSheets.mts) and what the loader reads back
 * (pricing/loadStarterSheets.mts). Column names live here once, so the two
 * cannot disagree about which column is the price.
 *
 * The sheets are for the SHARED STARTER (every shop) — see
 * references/starter-vs-company-plan.md. They are filled by the owner and
 * loaded by Track A into the seed files. Importing either one through the app
 * would land it in ONE company only, which is not what they are for.
 */
import { BASELINE_MATERIALS } from "../server/seed/materials";
import type { BaselineMaterial } from "../server/seed/materials/types";
import { BASELINE_ASSEMBLIES } from "../server/seed/baselineAssemblies";
import { BASELINE_RUN_TYPES } from "../server/seed/baselineRunTypes";
import { starterPartName } from "../server/seed/starterParts";
import { compareMaterials } from "../shared/materialOrder";
import { proposeMaterialName } from "../shared/materialNaming";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRICES_FILE = "starter-catalog-pricing.xlsx";
export const LABOR_FILE = "labor-units-starter.xlsx";

/** Row 1 is the instruction line; row 2 the headers; data from row 3. */
export const HEADER_ROW = 2;
export const FIRST_DATA_ROW = 3;

/** The filter column on all four sheets (owner, 2026-10-07). */
export const KIND_COLUMN = "Residential / Commercial / Both";

export const PRICE_SHEET = "Starter prices";
export const PRICE_COLUMNS = [
  "#",
  "Used by",
  KIND_COLUMN,
  "Category",
  "Name",
  "Unit of sale",
  "Pack size",
  "Pack qty",
  "Pack price",
  "Price per unit",
  "Notes",
] as const;

export const LABOR_SHEET = "Starter labor units";
export const LABOR_COLUMNS = [
  "#",
  "Used by",
  KIND_COLUMN,
  "Category",
  "Name",
  "Hours per",
  "MY HOURS",
  "Bend hours (raceway only)",
  "Notes",
] as const;

export const BRANDS_FILE = "brand-variants-pricing.xlsx";
export const BRAND_SHEET = "Brand variants";
export const BRAND_COLUMNS = [
  "#",
  "Used by",
  KIND_COLUMN,
  "Category",
  "Brand",
  "Name",
  "Parent (generic item)",
  "Unit of sale",
  "Pack size",
  "Pack qty",
  "Pack price",
  "Price per unit",
] as const;

export const ASSEMBLY_HOURS_FILE = "assembly-hours-starter.xlsx";
export const ASSEMBLY_SHEET = "Starter assembly hours";
export const ASSEMBLY_COLUMNS = [
  "#",
  "New",
  "Top-30 list",
  KIND_COLUMN,
  "Ref",
  "Category",
  "Assembly",
  "Hours now",
  "MY HOURS",
  "Notes",
] as const;

/** "Hours per" for a row: what MY HOURS is counted against. */
export const hoursPer = (m: BaselineMaterial): "each" | "100 ft" =>
  m.unitOfSale === "foot" ? "100 ft" : "each";

// ── Who uses each material: shipped starters and run types ─────────────────
const starterUses = new Map<string, Set<string>>();
for (const assembly of BASELINE_ASSEMBLIES) {
  for (const line of assembly.materials) {
    const name = starterPartName(line.part);
    if (!starterUses.has(name)) starterUses.set(name, new Set());
    starterUses.get(name)!.add(assembly.name);
  }
}
const runTypeUses = new Map<string, number>();
for (const t of BASELINE_RUN_TYPES) {
  for (const name of [
    t.racewayMaterialName,
    t.conductorMaterialName,
    t.groundMaterialName,
  ]) {
    if (name) runTypeUses.set(name, (runTypeUses.get(name) ?? 0) + 1);
  }
}

/** Each shipped starter's Residential / Commercial / Both tag, by name. */
const projectTypeByAssembly = new Map(
  BASELINE_ASSEMBLIES.map(a => [a.name, a.projectType] as const)
);

export type JobKind =
  | "Residential"
  | "Commercial"
  | "Both"
  | "Not in an assembly";

const KIND: Record<string, JobKind> = {
  residential: "Residential",
  commercial: "Commercial",
  both: "Both",
};

/** An assembly's own tag, as the sheets show it. */
export const assemblyKind = (projectType: string | null | undefined): JobKind =>
  (projectType && KIND[projectType]) || "Both";

/**
 * A material's Residential / Commercial / Both — from the starter
 * assemblies that USE it (owner, 2026-10-07): only residential ones ->
 * Residential, only commercial ones -> Commercial, any "both" or a mix ->
 * Both, none -> "Not in an assembly" (a run type alone does not count).
 */
export function materialKind(name: string): JobKind {
  const users = starterUses.get(name);
  if (!users || users.size === 0) return "Not in an assembly";
  // Array.from, not a spread: this file is typechecked through
  // server/starterSheetLayout.test.ts, and tsconfig has no `target` yet.
  const tags = new Set(
    Array.from(users).map(a => projectTypeByAssembly.get(a))
  );
  if (tags.has("both") || (tags.has("residential") && tags.has("commercial")))
    return "Both";
  if (tags.has("residential")) return "Residential";
  if (tags.has("commercial")) return "Commercial";
  return "Both";
}

export function usedBy(name: string): { text: string; count: number } {
  const starters = starterUses.get(name)?.size ?? 0;
  const runTypes = runTypeUses.get(name) ?? 0;
  const parts = [
    starters ? `${starters} starter${starters === 1 ? "" : "s"}` : "",
    runTypes ? `${runTypes} run type${runTypes === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return { text: parts.join(", ") || "", count: starters + runTypes };
}

/**
 * The catalog in sheet order: most USED first (the starters and run types
 * that price from it — price these and the shipped recipes price), then by
 * category, then by size within the category (the Materials screen's order).
 */
export function catalogInSheetOrder(): BaselineMaterial[] {
  return [...BASELINE_MATERIALS].sort((a, b) => {
    const used = usedBy(b.name).count - usedBy(a.name).count;
    return used !== 0 ? used : compareMaterials(a, b);
  });
}

// ── Brand variants (panels and breakers only — CLAUDE.md § Brands) ─────────
export type BrandVariant = {
  brand: string;
  name: string;
  parent: BaselineMaterial;
};

let variantsCache: { kept: BrandVariant[]; dropped: string[] } | null = null;

/**
 * Every panel and breaker brand variant, one per row, under its generic
 * PARENT. The curated list is the one pricing/buildPricingSheet.mts has
 * generated since 2026-09-24 (its "branded" rows) — run here in a child
 * process into a temp folder, so there is ONE list of brands and lines, not
 * a second copy that drifts. On top of it, the naming rules frozen
 * 2026-10-07 (`proposeMaterialName`: "Single-Pole" -> "1-Pole" on breakers).
 *
 * A variant whose parent the catalog does not ship is DROPPED and named in
 * `dropped`: an assembly points at the parent, never a variant, so a variant
 * with no parent can never be reached. On 2026-10-07 that was the 11 brand
 * lines of the QO-only 60A single-pole the owner declined.
 *
 * There is no parent/variant model in the app yet (`materials.parentId`,
 * ASSEMBLIES_PLAN.md); these prices load into their own generated file and
 * stay inert until it exists (server/starterValues.test.ts).
 */
export function brandVariants(): { kept: BrandVariant[]; dropped: string[] } {
  if (variantsCache) return variantsCache;
  const out = path.join(os.tmpdir(), "bidridge-brand-variant-rows");
  // The builder writes into PRICING_OUT_DIR but does not create it.
  mkdirSync(out, { recursive: true });
  execSync("npx tsx pricing/buildPricingSheet.mts", {
    cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
    env: { ...process.env, PRICING_OUT_DIR: out },
    // Its output is noise here; its ERRORS must surface (they did not, the
    // first time: a missing folder read as a bare "Command failed").
    stdio: ["ignore", "ignore", "inherit"],
  });
  const rows = JSON.parse(
    readFileSync(path.join(out, "rows.json"), "utf8")
  ) as {
    branded: {
      brand: string;
      name: string;
      parent: string;
      category: string;
    }[];
  };
  const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
  const kept: BrandVariant[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const v of rows.branded) {
    const parent = byName.get(v.parent);
    if (!parent) {
      dropped.push(`${v.name} (parent "${v.parent}" is not shipped)`);
      continue;
    }
    const name = proposeMaterialName({
      name: v.name,
      category: v.category,
    }).proposed;
    if (seen.has(name)) continue;
    seen.add(name);
    kept.push({ brand: v.brand, name, parent });
  }
  kept.sort(
    (a, b) =>
      usedBy(b.parent.name).count - usedBy(a.parent.name).count ||
      compareMaterials(a.parent, b.parent) ||
      a.brand.localeCompare(b.brand) ||
      a.name.localeCompare(b.name)
  );
  variantsCache = { kept, dropped };
  return variantsCache;
}

// ── Starter assemblies, the owner's top-30 lists first ─────────────────────
export type AssemblyRow = {
  ref: string;
  name: string;
  category: string;
  projectType: string;
  hoursNow: number | null;
  top: string;
  /**
   * Why this starter does not seed yet, or null. A held starter is ON the
   * sheet (so the list is complete) but its MY HOURS cell refuses input, and
   * the loader refuses a value typed there anyway (owner, 2026-10-08).
   */
  held: string | null;
};

/**
 * The note a held starter carries on the sheet. Today only missing parts
 * hold one (DV34, no 700-series device plate in the catalog).
 */
export function heldNote(a: {
  missingParts?: readonly string[];
}): string | null {
  const missing = a.missingParts ?? [];
  if (missing.length === 0) return null;
  // The owner's words for the part, where he has given them (2026-10-08).
  const short = missing.map(m => SHORT_PART_NAME[m] ?? m).join("; ");
  return `HELD - no ${short} yet. Not seeded until the catalog has: ${missing.join("; ")}. Leave MY HOURS blank.`;
}

const SHORT_PART_NAME: Readonly<Record<string, string>> = {
  "Surface raceway device plate, 700 series": "700 plate",
};

/** "| 3 | DR7 | Troffer LED retrofit kit |" rows of one section of the draft. */
function topList(md: string, from: string, to: string): string[] {
  const start = md.indexOf(from);
  const end = md.indexOf(to, start + from.length);
  if (start < 0 || end < 0)
    throw new Error(`top-assemblies-draft.md: no "${from}"`);
  return Array.from(
    md.slice(start, end).matchAll(/^\|\s*(\d+)\s*\|\s*([A-Z]+\d+)\s*\|/gm)
  )
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(m => m[2]);
}

/**
 * Every shipped starter: the commercial top 30, then the residential top 30
 * (references/top-assemblies-draft.md § 1 and § 2 — a ref on both lists says
 * so and appears once), then the rest by category and ref. A ref on a list
 * that is not a shipped starter (a drafted recipe not yet in the seed) is
 * named in `notShipped`.
 */
export function assembliesInSheetOrder(): {
  rows: AssemblyRow[];
  notShipped: string[];
} {
  const md = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "references",
      "top-assemblies-draft.md"
    ),
    "utf8"
  );
  const commercial = topList(md, "## 1. Most used", "## 2. Most used");
  const residential = topList(md, "## 2. Most used", "## 2b.");
  const byRef = new Map(BASELINE_ASSEMBLIES.map(a => [a.ref, a]));
  const label = (ref: string) => {
    const c = commercial.indexOf(ref);
    const r = residential.indexOf(ref);
    return [
      c >= 0 ? `Commercial #${c + 1}` : "",
      r >= 0 ? `Residential #${r + 1}` : "",
    ]
      .filter(Boolean)
      .join(", ");
  };
  const ordered: string[] = [];
  for (const ref of [...commercial, ...residential])
    if (!ordered.includes(ref)) ordered.push(ref);
  const notShipped = ordered.filter(ref => !byRef.has(ref));
  const rest = BASELINE_ASSEMBLIES.filter(a => !ordered.includes(a.ref)).sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.ref.localeCompare(b.ref, "en", { numeric: true })
  );
  const rows = [
    ...ordered.filter(ref => byRef.has(ref)).map(ref => byRef.get(ref)!),
    ...rest,
  ].map(a => ({
    ref: a.ref,
    name: a.name,
    category: a.category,
    projectType: a.projectType,
    hoursNow: a.baseLaborHours,
    top: label(a.ref),
    held: heldNote(a),
  }));
  return { rows, notShipped };
}

/**
 * The pack a row is usually bought in, and the number the per-unit price
 * divides by. A STARTING POINT the owner overwrites when he buys another
 * pack. Ported from pricing/writeWorkbook.cjs (packFor) with patterns for the
 * names frozen 2026-10-07 ("… Copper", "SER Aluminum", "bare stranded").
 */
export function packFor(m: BaselineMaterial): [string, number] {
  const n = m.name;
  if (m.unitOfSale === "foot") {
    if (/NM-B|UF-B|\bSE[RU]\b/i.test(n)) return ["250 ft roll", 250];
    if (/THHN|XHHW|USE-2|\bbare (solid|stranded)\b|tracer wire/i.test(n))
      return ["500 ft spool", 500];
    if (/MC(-AP)? cable|AC cable/i.test(n)) return ["250 ft coil", 250];
    if (
      /Cat5e|Cat6|coax|speaker|thermostat|security|control wire|fire alarm/i.test(
        n
      )
    )
      return ["1000 ft box", 1000];
    if (/EMT|rigid|PVC|IMC|flex|FMC|liquidtight/i.test(n))
      return ["10 ft stick", 10];
    return ["per foot", 1];
  }
  if (
    /wire nut|push-in connector|staple|screw|anchor|washer|nut\b|zip tie|ferrule|clip\b|pin\b/i.test(
      n
    )
  )
    return ["box of 100", 100];
  if (
    /^(1[25]A|20A).*(receptacle|switch)/i.test(n) &&
    !/GFCI|AFCI|dual|smart|USB/i.test(n)
  )
    return ["box of 10", 10];
  if (
    /wall plate|blank plate|mud ring|plaster ring|knockout|bushing|connector|coupling|strap|clamp|nail plate/i.test(
      n
    )
  )
    return ["box of 25", 25];
  return ["each", 1];
}
