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
import {
  PACK_NOT_CHECKED,
  STARTER_PACKS,
} from "../server/seed/materials/starterPacks";
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

/** Two more tabs in the PRICES workbook (step-based-labor-plan.md § 14). */
export const STEPS_SHEET = "Steps";
export const STEP_TOTALS_SHEET = "Step totals";

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

const materialByName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));

/** An assembly's own tag, as the sheets show it. */
export const assemblyKind = (projectType: string | null | undefined): JobKind =>
  (projectType && KIND[projectType]) || "Both";

/**
 * A material's Residential / Commercial / Both — from the starter
 * assemblies that USE it (owner, 2026-10-07): only residential ones ->
 * Residential, only commercial ones -> Commercial, any "both" or a mix ->
 * Both, none -> the row's own `jobKind` if it has one (the cover family,
 * 2026-10-08), else "Not in an assembly" (a run type alone does not count).
 * The starters win when both exist, so a tag can never contradict the
 * recipes that use the row.
 */
export function materialKind(name: string): JobKind {
  const users = starterUses.get(name);
  if (!users || users.size === 0) {
    const own = materialByName.get(name)?.jobKind;
    return own ? KIND[own] : "Not in an assembly";
  }
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
/**
 * The PRICES sheet's order: the app's own (owner, 2026-10-12) — category,
 * then item type, then real size, by `compareMaterials`, the one comparator
 * the Materials screen uses. Most-used first suited the first pass; pricing
 * the rest means walking a supply-house shelf, one product at a time, and
 * the sheet was re-sorted by hand to this order in 28245633. Without this a
 * rebuild would put it back. The labor and brand sheets keep most-used.
 */
export function catalogInAppOrder(): BaselineMaterial[] {
  return [...BASELINE_MATERIALS].sort(compareMaterials);
}

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
 * The note a held starter carries on the sheet. Only missing parts hold
 * one. None does today: DV34 was the last (no 700-series plate), and it
 * loads since Track B's 7641bb1 — its sheet row unlocked 2026-10-08.
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
 * The pack a row is bought in, and the number the per-unit price divides by.
 * A STARTING POINT the owner overwrites when he buys another pack.
 *
 * ── A pack is WRITTEN DOWN per row, never guessed from words ────────────────
 * Owner, 2026-10-14 (`pricing/pack-label-scan.md` § E). Until then this
 * matched words ANYWHERE in a name — "nut", "pin", "washer", "connector",
 * "strap", "EMT", "flex" — and gave 380 rows a box and 47 a 10 ft stick from
 * them: "Dishwasher whip" was a box of 100 washers, "Pole anchor bolt kit" a
 * box of 100 anchors, every flex coil a stick. A wrong pack divides the
 * owner's typed price by the wrong number, on every bid.
 *
 * So: a pack bigger than one comes ONLY from `STARTER_PACKS`
 * (`server/seed/materials/starterPacks.ts`), keyed by the exact name, with
 * where it came from. A row with nothing written is `each` / 1 — and a
 * per-foot row keeps a per-foot LABEL from the rules below, still qty 1, so
 * a word there changes text, never a price. `server/starterPacks.test.ts`
 * fails if anything else returns a pack above one.
 *
 * ── Per-foot rows: the price is PER FOOT, the pack is only a label ───────────
 * Owner, 2026-10-12: wire and cable are typed per foot (Pack qty 1), figured
 * from the standard contractor pack, and the label says which:
 *   #14–#10 wire, NM, UF and small MC   "per foot (from 250 ft roll)"
 *   THHN #14–#10                        "per foot (from 500 ft spool)"
 *   #8 and bigger, big MC, SER/SEU,
 *   feeder wire                         "per foot (cut to length)"
 *   low voltage                         "per foot (from 1000 ft box)"
 * Conduit is a 10 ft stick (Pack qty 10) — written per row in STARTER_PACKS
 * since 2026-10-14, as is every reel or length the rules below get wrong.
 * Until then wire was a 250 / 500 / 1000 pack the price divided by; the
 * owner had already set 120 of those rows to per foot / 1 by hand.
 */
export const PER_FOOT_ROLL = "per foot (from 250 ft roll)";
export const PER_FOOT_SPOOL = "per foot (from 500 ft spool)";
export const PER_FOOT_CUT = "per foot (cut to length)";
export const PER_FOOT_BOX = "per foot (from 1000 ft box)";

/** #18–#10: the leading gauge of "14/2 …", "#12 …", "10/3 …". Not 1/0. */
const smallGauge = (name: string): boolean => {
  const g = /^#?(\d+)(?=[\/\s-])/.exec(name);
  if (!g || /^#?\d+\/0\b/.test(name)) return false;
  const n = Number(g[1]);
  return n >= 10 && n <= 18;
};

/**
 * The Notes text a row's pack needs in place of its description, or null.
 * A written pack can carry a note; a row nobody could settle says so ON the
 * row, where the owner types, not only in a list somewhere else.
 */
export function packNote(m: BaselineMaterial): string | null {
  const written = STARTER_PACKS[m.name];
  if (written?.sheetNote) return written.sheetNote;
  const unsure = PACK_NOT_CHECKED[m.name];
  if (unsure)
    return `PACK NOT CHECKED — ${unsure}. Type the price of ONE, or set the pack you buy.`;
  return null;
}

/** Where a row's pack came from — the build reports the count of each. */
export type PackSource = "written" | "per-foot label" | "nothing written";

export function packSource(m: BaselineMaterial): PackSource {
  if (STARTER_PACKS[m.name]) return "written";
  return m.unitOfSale === "foot" ? "per-foot label" : "nothing written";
}

export function packFor(m: BaselineMaterial): [string, number] {
  const written = STARTER_PACKS[m.name];
  if (written) return [written.label, written.qty];
  if (m.unitOfSale === "foot") return [perFootLabel(m.name), 1];
  return ["each", 1];
}

/**
 * The LABEL of a per-foot row with no written pack. Text only: the qty is
 * always 1, so a word matched here can never divide a price.
 */
function perFootLabel(n: string): string {
  if (/\bSE[RU]\b|URD/i.test(n)) return PER_FOOT_CUT;
  if (
    /Cat5e|Cat6|coax|speaker|thermostat|security|control wire|fire alarm|fiber optic/i.test(
      n
    )
  )
    return PER_FOOT_BOX;
  // Not wire, though the name says "cable".
  if (/^Cable tray/i.test(n)) return "per foot";
  if (/THHN/i.test(n)) return smallGauge(n) ? PER_FOOT_SPOOL : PER_FOOT_CUT;
  if (/XHHW|USE-2/i.test(n)) return PER_FOOT_CUT; // feeder wire
  if (
    /NM-B|UF-B|MC(-AP)? cable|AC cable|\bbare (solid|stranded)\b|wire|cable/i.test(
      n
    )
  )
    return smallGauge(n) ? PER_FOOT_ROLL : PER_FOOT_CUT;
  return "per foot";
}
