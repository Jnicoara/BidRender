/**
 * THE CEILING AT A BOX — one rule for every drop on a bid (owner,
 * 2026-10-07: "regular runs, count drops and homeruns all read the ceiling
 * height of the area each box sits in").
 *
 *   the height area the box sits in (smaller outline wins, 0130)
 *   → the sheet's (`bid_pdf_sheets.distributionHeightInches`, 0109)
 *   → the job's → the company's → unset.
 *
 * Above all of these sits whatever is the caller's own override — a run's
 * "This run sits at", a homerun's own ceiling — which the caller applies
 * first, because it is a person's answer about THAT run.
 *
 * Until 2026-10-07 runs and count drops read job → company only; the sheet
 * height and the areas reached homeruns and nothing else, so one box under
 * an 18'-0" stockroom ceiling was a 16'-6" drop on its homerun and an
 * 8'-6" drop on the run beside it.
 *
 * Unset stays unset — no shipped ceiling. That absence is the gate every
 * drop already keys off (`verticalAtEnd`).
 */
import { heightAreaAt, type HeightArea } from "./homerunFootage";

type Pt = { x: number; y: number };

export type CeilingSource = "area" | "sheet" | "job" | "company" | "unset";

export type ResolvedCeiling = {
  inches: number | null;
  source: CeilingSource;
  /** The area's name, when an area answered. */
  areaName: string | null;
};

/** What a bid knows about ceilings, loaded once. */
export type CeilingLayers = {
  company: number | null;
  job: number | null;
  /** Sheet id → its own ceiling; absent or NULL follows the job. */
  sheets: ReadonlyMap<number, number | null>;
  /** Areas WITH a height; an area with none follows the sheet. */
  areas: readonly (HeightArea & { sheetId: number; name: string })[];
};

export const NO_CEILINGS: CeilingLayers = {
  company: null,
  job: null,
  sheets: new Map(),
  areas: [],
};

const usable = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * The ceiling for a box at `at` on sheet `sheetId`. Either may be NULL —
 * a box with no known spot or sheet skips the area or sheet layer rather
 * than guessing one.
 */
export function ceilingAt(
  layers: CeilingLayers,
  sheetId: number | null,
  at: Pt | null
): ResolvedCeiling {
  if (sheetId !== null && at !== null) {
    const area = heightAreaAt(
      at,
      layers.areas.filter(a => a.sheetId === sheetId)
    );
    if (area)
      return {
        inches: area.ceilingInches,
        source: "area",
        areaName: area.name,
      };
  }
  const sheet = sheetId === null ? null : layers.sheets.get(sheetId);
  if (usable(sheet)) return { inches: sheet, source: "sheet", areaName: null };
  if (usable(layers.job))
    return { inches: layers.job, source: "job", areaName: null };
  if (usable(layers.company))
    return { inches: layers.company, source: "company", areaName: null };
  return { inches: null, source: "unset", areaName: null };
}
