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

export const PRICES_FILE = "starter-catalog-pricing.xlsx";
export const LABOR_FILE = "labor-units-starter.xlsx";

/** Row 1 is the instruction line; row 2 the headers; data from row 3. */
export const HEADER_ROW = 2;
export const FIRST_DATA_ROW = 3;

export const PRICE_SHEET = "Starter prices";
export const PRICE_COLUMNS = [
  "#",
  "Used by",
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
  "Category",
  "Name",
  "Hours per",
  "MY HOURS",
  "Bend hours (raceway only)",
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
