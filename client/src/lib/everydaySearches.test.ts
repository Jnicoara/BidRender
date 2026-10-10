/**
 * The TOP HIT for the searches a contractor types every day.
 *
 * The top hit matters more than the rest of the list: Enter takes it, so a
 * fast type-and-Enter puts it on the bid. "4 square box" + Enter adding the
 * 4x4x4 pull box (seen 2026-10-09) is the failure this file is for.
 *
 * Runs the app's own pipeline (@/lib/materialSearch — the one the hook and
 * every search box call) over the shipped catalog, so a ranking change, a
 * catalog rename or an alias change that moves a top hit goes red here.
 *
 * Two catalogs, because the app shows two:
 *   • the shipped catalog alone — a new company;
 *   • a company that priced some rows BEFORE they were renamed. Their copy
 *     keeps the old name ("Duplex receptacle") and the library shows it IN
 *     PLACE of the shipped row (db.getLibraryMaterials). Most working
 *     companies look like this, and it is where "recep" sank to 30th.
 *
 * No usage: every company starts with none, and usage only breaks ties.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_MATERIALS } from "../../../server/seed/baselineMaterials";
import { renamedTo } from "@shared/renamedMaterials";
import {
  materialSearchIndex,
  searchMaterials,
  type SearchableCatalogRow,
} from "./materialSearch";

const NOW = new Date("2026-10-09T12:00:00Z");
const NO_USAGE = new Map();

const shipped: SearchableCatalogRow[] = BASELINE_MATERIALS.map((m, i) => ({
  id: i + 1,
  name: m.name,
  category: m.category,
  searchAliases: m.searchAliases,
  isSpecialty: m.isSpecialty === true,
}));

function topHit(rows: SearchableCatalogRow[], query: string): string | null {
  const index = materialSearchIndex(rows);
  return searchMaterials(index, query, 80, NO_USAGE, NOW).rows[0]?.name ?? null;
}

/** Query → the row Enter must take. Exact shipped names. */
const EVERYDAY: [string, string][] = [
  ["4 square box", '4" square box, 1-1/2" deep'],
  ["1900 box", '4" square box, 1-1/2" deep'],
  ["1g box", "Single-gang new work box, plastic, 18 cu in"],
  ["2 gang box", "Double-gang new work box, plastic, 32 cu in"],
  ["old work box", "Single-gang old work box, plastic, 20 cu in"],
  ["mud ring", '4" square mud ring'],
  ["blank cover", '4" square blank cover'],
  ["gfi", "15A GFCI receptacle"],
  ["recep", "15A duplex receptacle"],
  ["single pole switch", "15A single-pole switch"],
  ["20a breaker", "20A 1-Pole breaker"],
  ["1/2 emt", '1/2" EMT'],
  ["3/4 emt connector", '3/4" EMT set-screw connector'],
  ["1/2 strap", '1/2" EMT one-hole strap'],
  ["pvc 2", '2" PVC Sch 40'],
  ["12/2 mc", "12/2 MC cable Copper"],
  ["romex 12/2", "12/2 NM-B Copper"],
  ["12 thhn", "#12 THHN solid Copper"],
  ["wafer 6", '6" canless wafer LED downlight'],
  ["wire nut", "Wire nut, 22-8 AWG (tan/red)"],
];

describe("everyday searches: the top hit is the everyday item (shipped catalog)", () => {
  it("every expected row is a shipped name (a rename must update this list)", () => {
    const names = new Set(shipped.map(r => r.name));
    expect(EVERYDAY.filter(([, name]) => !names.has(name))).toEqual([]);
  });
  for (const [query, expected] of EVERYDAY)
    it(`"${query}" → ${expected}`, () => {
      expect(topHit(shipped, query)).toBe(expected);
    });
});

/*
  A company's own copies, made before the shipped rows were renamed — the
  names user 1's local library actually holds. Each REPLACES its shipped row,
  as the library list does, and keeps the shipped row's aliases, as a fork
  does.
*/
const FORKED_BEFORE_RENAME = [
  "Duplex receptacle",
  "12-2 MC cable",
  "12-2 NM-B",
  "Single-gang box",
  "#12 THHN",
];

function companyCatalog(): SearchableCatalogRow[] {
  const replaced = new Map<string, string>();
  for (const old of FORKED_BEFORE_RENAME) {
    const now = renamedTo(old);
    if (now === null) throw new Error(`${old} is not a renamed shipped row`);
    replaced.set(now, old);
  }
  return shipped.map(row =>
    replaced.has(row.name)
      ? { ...row, id: row.id + 100_000, name: replaced.get(row.name)! }
      : row
  );
}

describe("everyday searches: a company's own copy made before a rename still wins", () => {
  const company = companyCatalog();
  const cases: [string, string][] = [
    ["recep", "Duplex receptacle"],
    ["12/2 mc", "12-2 MC cable"],
    ["romex 12/2", "12-2 NM-B"],
    ["1g box", "Single-gang box"],
    ["12 thhn", "#12 THHN"],
  ];
  for (const [query, expected] of cases)
    it(`"${query}" → their "${expected}"`, () => {
      expect(topHit(company, query)).toBe(expected);
    });
});
