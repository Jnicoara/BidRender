/**
 * "Capture whole legend" reads a real legend correctly — tested on real data.
 *
 * The fixtures are written by scripts/legendFixture.mts from the reader-
 * accuracy plan sets (git-ignored PDFs): each holds the page's raw text layer
 * and an ink map of the legend, so these tests run the same reader the screen
 * does on what that page actually contains.
 *
 * Measured on the same code by hand, 2026-09-30, and recorded here so a change
 * that makes it worse is visible: Weld 1 E-001 reads 48 of 48 symbols by their
 * exact legend names; UNCC E001 (a paragraph per entry) names 86 of its 103
 * from the library automatically, none wrongly; Old Blueridge E0.01 is a scan
 * whose OCR text names 1 of 22, and is reported as mostly unread.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  matchLibraryName,
  readLegend,
  type LegendReading,
  type LegendRow,
} from "./legendRead";
import { inkBoundsFrom, ruleFrom } from "./legendInkMap";
import type { PageTextLayer } from "./textSelection";
import { READER_TEST_LEGENDS } from "../../../scripts/readerTestLegends";

type Fixture = {
  layer: PageTextLayer;
  ink: {
    x: number;
    y: number;
    cell: number;
    cols: number;
    rows: number;
    bits: string;
  };
};

function load(name: string) {
  const f = JSON.parse(
    readFileSync(path.join(__dirname, "__fixtures__", name), "utf8")
  ) as Fixture;
  const map = {
    ...f.ink,
    bits: Uint8Array.from(Buffer.from(f.ink.bits, "base64")),
  };
  return { layer: f.layer, ink: inkBoundsFrom(map), rule: ruleFrom(map) };
}

const LIBRARY = Object.values(READER_TEST_LEGENDS)
  .flat()
  .map(e => e.name);

function rowsOf(r: LegendReading): LegendRow[] {
  if (r.kind !== "rows") throw new Error(`expected rows, got ${r.kind}`);
  return r.rows;
}

// Weld 1 E-001, "Electrical Symbols List": 21 entries in the left column and
// 27 in the right, in the order readerTestLegends.ts lists them.
const WELD = READER_TEST_LEGENDS["Weld 1"].map(e => e.name);
const WELD_LEFT = WELD.slice(0, 21);
const WELD_RIGHT = WELD.slice(21, 48);
/** Where the two columns' names start on the sheet, page points (measured). */
const LEFT_NAMES_X = 1291;
const RIGHT_NAMES_X = 1542;
const WELD_BOX = { x: 1215, y: 120, width: 510, height: 975 };

describe("readLegend on Weld 1 E-001 (a two-column legend)", () => {
  const weld = load("weld1-legend.json");
  const read = (captured: string[] = []) =>
    readLegend({ ...weld, box: WELD_BOX, library: LIBRARY, captured });

  it("finds every symbol once, by its exact legend name", () => {
    const rows = rowsOf(read());
    for (const name of [...WELD_LEFT, ...WELD_RIGHT]) {
      const hits = rows.filter(r => r.name === name);
      expect(hits, name).toHaveLength(1);
      expect(hits[0].match, name).toBe("exact");
      expect(hits[0].ticked, name).toBe(true);
    }
  });

  it("pairs each symbol with a name in ITS OWN column, in the legend's order", () => {
    const rows = rowsOf(read());
    const byName = new Map(rows.map(r => [r.name, r]));
    for (const name of WELD_LEFT) {
      const s = byName.get(name)!.symbol;
      // Wholly left of the left column's names, inside the legend's frame.
      expect(s.x, name).toBeGreaterThanOrEqual(WELD_BOX.x);
      expect(s.x + s.width, name).toBeLessThan(LEFT_NAMES_X);
    }
    for (const name of WELD_RIGHT) {
      const s = byName.get(name)!.symbol;
      // Between the columns: never reaching back into the left column's text.
      expect(s.x, name).toBeGreaterThan(1450);
      expect(s.x + s.width, name).toBeLessThan(RIGHT_NAMES_X);
    }
    // Top to bottom in each column, exactly as printed — so no symbol is
    // paired with its neighbour's name.
    for (const column of [WELD_LEFT, WELD_RIGHT]) {
      const ys = column.map(n => byName.get(n)!.symbol.y);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    }
  });

  it("leaves out abbreviation rows, which have no symbol", () => {
    const names = rowsOf(read()).map(r => r.read);
    for (const abbreviation of [
      "COUNTER",
      "GROUND",
      "HORSEPOWER",
      "WEATHER-PROOF",
      "OVERHEAD",
      "TYPICAL",
      "UNLESS OTHERWISE NOTED",
      "FURNISHED BY OTHERS",
    ]) {
      expect(names, abbreviation).not.toContain(abbreviation);
    }
  });

  it("never offers to save over a symbol already captured", () => {
    const rows = rowsOf(read(["Junction Box"]));
    const jb = rows.find(r => r.name === "JUNCTION BOX")!;
    expect(jb.alreadyCaptured).toBe(true);
    expect(jb.ticked).toBe(false);
  });

  it("is not reported as mostly unread", () => {
    const r = read();
    expect(r.kind === "rows" && r.mostlyUnread).toBe(false);
  });
});

describe("readLegend falls back on a scanned legend", () => {
  it("says there is no text when the box holds none", () => {
    const weld = load("weld1-legend.json");
    const r = readLegend({
      ...weld,
      layer: { items: [], viewportTransform: weld.layer.viewportTransform },
      box: WELD_BOX,
      library: LIBRARY,
      captured: [],
    });
    expect(r.kind).toBe("no-text");
  });

  it("reports Old Blueridge E0.01, whose text is a scan's OCR, as mostly unread", () => {
    const br = load("blueridge-legend.json");
    const r = readLegend({
      ...br,
      box: { x: 1850, y: 60, width: 520, height: 1200 },
      library: LIBRARY,
      captured: [],
    });
    expect(r.kind === "rows" ? r.mostlyUnread : true).toBe(true);
  });
});

describe("matchLibraryName", () => {
  it("prefers an exact name, punctuation and case aside", () => {
    expect(
      matchLibraryName("Switch,  single pole", [
        "SINGLE POLE SWITCH",
        "SWITCH, SINGLE POLE",
      ])
    ).toEqual({ name: "SWITCH, SINGLE POLE", match: "exact" });
  });

  it("takes the most specific name whose words are all in the text", () => {
    expect(
      matchLibraryName(
        "NEMA 5-20R DUPLEX RECEPTACLE ON EMERGENCY CIRCUIT. USE RED COLOR",
        ["DUPLEX RECEPTACLE", "DUPLEX RECEPTACLE ON EMERGENCY CIRCUIT"]
      )?.name
    ).toBe("DUPLEX RECEPTACLE ON EMERGENCY CIRCUIT");
  });

  it("breaks a tie by the legend's own word order", () => {
    expect(
      matchLibraryName("SINGLE POLE SWITCH - 20A, 120-277V.", [
        "SWITCH, SINGLE POLE",
        "SINGLE POLE SWITCH",
      ])?.name
    ).toBe("SINGLE POLE SWITCH");
  });

  it("returns null when no name's words are all there", () => {
    expect(
      matchLibraryName("CEILING-MOUNTED, SINGLE FACE", ["EXIT SIGN"])
    ).toBeNull();
  });
});
