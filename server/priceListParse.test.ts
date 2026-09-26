/**
 * Reading a supply-house price sheet.
 *
 * ── The bug this suite exists because of ─────────────────────────────────────
 * `4" square box,$1,250.00` was imported as $250.00 and reported as a success.
 * The old parser split on commas and took the last field, so the thousands
 * separator quietly divided the price. Nothing on screen distinguished that
 * from a price the contractor had checked, so it could be bid and won on.
 *
 * The tests are therefore weighted toward one question: does anything here
 * produce a number that is wrong rather than refusing? `describe("never
 * produces a wrong number")` is the important block, and it asserts refusals
 * as loudly as it asserts values.
 *
 * ── Tested against the catalog's own names, not invented ones ────────────────
 * The fixtures in server/fixtures are generated from BASELINE_MATERIALS by
 * scripts/makePriceSheetFixture.mts, so the names under test are the real ones,
 * with the real awkward characters: `#10 bare CU, stranded` has a comma in
 * it, `1/2" EMT` has an inch mark, and both go through the quoting rules. Three
 * formats are covered because supply houses export all three — a properly
 * quoted CSV, one from an exporter that quotes nothing, and cells pasted out of
 * Excel as TSV.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  delimiterLabel,
  detectDelimiter,
  parseMoney,
  parsePriceList,
  readHeader,
  repairSplitThousands,
  splitDelimited,
} from "../shared/priceListParse";

const fixture = (file: string) =>
  readFileSync(resolve(import.meta.dirname, "fixtures", file), "utf8");

// ── The bug, first ───────────────────────────────────────────────────────────

describe("the thousands separator", () => {
  it("reads a quoted grouped price at its real value", () => {
    const { rows, problems } = parsePriceList(
      'Description,Price\n4" square box,"$1,250.00"'
    );
    expect(problems).toEqual([]);
    expect(rows).toEqual([{ name: '4" square box', costPerUnit: 1250 }]);
  });

  it("reads an UNQUOTED grouped price at its real value — the original bug", () => {
    // Under RFC 4180 this row genuinely has three fields: `4" square box`,
    // `$1`, `250.00`. Correct splitting alone does not recover it.
    const { rows, problems } = parsePriceList(
      'Description,Price\n4" square box,$1,250.00'
    );
    expect(problems).toEqual([]);
    expect(rows).toEqual([{ name: '4" square box', costPerUnit: 1250 }]);
    // The exact failure being guarded: not 250.
    expect(rows[0].costPerUnit).not.toBe(250);
  });

  it("does not read the trailing group as the price on any magnitude", () => {
    for (const [written, expected] of [
      ["$1,250.00", 1250],
      ["$12,500.00", 12500],
      ["$999,999.99", 999999.99],
      ["$1,234,567.89", 1234567.89],
      ["$2,500", 2500],
    ] as const) {
      const { rows } = parsePriceList(`Widget,${written}`);
      expect({ written, got: rows[0]?.costPerUnit }).toEqual({
        written,
        got: expected,
      });
    }
  });

  it("only rejoins fields that have the shape of a split group", () => {
    expect(repairSplitThousands(["$1", "250.00"])).toBe(1250);
    expect(repairSplitThousands(["12", "500"])).toBe(12500);
    expect(repairSplitThousands(["1", "234", "567.89"])).toBe(1234567.89);
    // Not a group: too few digits after, so this is two real columns.
    expect(repairSplitThousands(["100", "0.05"])).toBeNull();
    expect(repairSplitThousands(["4", "EA"])).toBeNull();
    expect(repairSplitThousands(["1234", "500.00"])).toBeNull();
    // A middle part that is not a whole group breaks the chain.
    expect(repairSplitThousands(["1", "23", "567.89"])).toBeNull();
  });

  it("does not merge a quantity column into the price", () => {
    // `Wire nuts, 100, 0.05` is name/qty/price, not a split thousand.
    const { rows } = parsePriceList("Wire nuts,100,0.05");
    expect(rows[0].costPerUnit).toBe(0.05);
  });
});

// ── RFC 4180 ─────────────────────────────────────────────────────────────────

describe("RFC 4180 field splitting", () => {
  it("keeps a comma inside a quoted field", () => {
    expect(splitDelimited('"#10 bare CU, stranded",3.75', ",")).toEqual([
      ["#10 bare CU, stranded", "3.75"],
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(splitDelimited('"He said ""big""",1', ",")).toEqual([
      ['He said "big"', "1"],
    ]);
  });

  it("keeps a bare inch mark in an unquoted field", () => {
    // Not RFC-legal, and everywhere in this catalog.
    expect(splitDelimited('1/2" EMT,1.18', ",")).toEqual([
      ['1/2" EMT', "1.18"],
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    expect(splitDelimited('"two\nlines",5', ",")).toEqual([
      ["two\nlines", "5"],
    ]);
  });

  it("treats CRLF as one break and skips blank lines", () => {
    expect(splitDelimited("a,1\r\n\r\nb,2\r\n", ",")).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("returns fields exactly as written, padding included", () => {
    // Not trimmed here on purpose: rejoining an unquoted name that was split
    // at its own comma has to put back the space in `bare CU, stranded`.
    // Callers trim individual fields.
    expect(splitDelimited('  padded  ,"  kept  "', ",")).toEqual([
      ["  padded  ", "  kept  "],
    ]);
  });

  it("strips a byte-order mark rather than gluing it to the first name", () => {
    const [row] = splitDelimited("﻿#12 THHN,0.42", ",");
    expect(row[0]).toBe("#12 THHN");
  });

  it("closes an unterminated quote instead of throwing", () => {
    expect(() => splitDelimited('"never closed,1', ",")).not.toThrow();
  });
});

// ── Delimiters ───────────────────────────────────────────────────────────────

describe("finding the separator", () => {
  it("detects a tab, which is what pasting from Excel produces", () => {
    // The old parser split on commas, found one field and skipped every row,
    // so a pasted spreadsheet imported nothing at all.
    expect(detectDelimiter('#12 THHN\t0.42\n1/2" EMT\t1.18')).toBe("\t");
  });

  it("prefers the tab even when names contain commas", () => {
    const text = "#10 bare CU, stranded\t3.75\n#8 bare CU, solid\t2.10";
    expect(detectDelimiter(text)).toBe("\t");
    const { rows } = parsePriceList(text);
    expect(rows[0]).toEqual({
      name: "#10 bare CU, stranded",
      costPerUnit: 3.75,
    });
  });

  it("detects a semicolon", () => {
    expect(detectDelimiter("a;1\nb;2")).toBe(";");
  });

  it("falls back to a comma when nothing splits", () => {
    expect(detectDelimiter("just one line")).toBe(",");
  });

  it("describes itself for the user", () => {
    expect(delimiterLabel("\t")).toBe("tab-separated");
    expect(delimiterLabel(",")).toBe("comma-separated");
  });
});

// ── Money ────────────────────────────────────────────────────────────────────

describe("reading a price", () => {
  it("reads the shapes a supply house writes", () => {
    expect(parseMoney("0.42")).toBe(0.42);
    expect(parseMoney("$1.18")).toBe(1.18);
    expect(parseMoney(".42")).toBe(0.42);
    expect(parseMoney("1250")).toBe(1250);
    expect(parseMoney("  $ 26.74  ")).toBe(26.74);
    expect(parseMoney("USD 12.00")).toBe(12);
    expect(parseMoney("£4.50")).toBe(4.5);
    expect(parseMoney("1 250.00")).toBe(1250);
  });

  it("strips a per-unit suffix", () => {
    expect(parseMoney("$0.42/FT")).toBe(0.42);
    expect(parseMoney("1.18 / ea")).toBe(1.18);
    expect(parseMoney("$3.00 per M")).toBe(3);
  });

  it("refuses a negative, however it is written", () => {
    expect(parseMoney("-5.00")).toBeNull();
    expect(parseMoney("($5.00)")).toBeNull();
  });

  it("refuses text that is not a price at all", () => {
    for (const text of ["", "  ", "Price", "N/A", "CALL", "EA", "—", "TBD"]) {
      expect({ text, got: parseMoney(text) }).toEqual({ text, got: null });
    }
  });
});

// ── The rule that matters ────────────────────────────────────────────────────

describe("never produces a wrong number", () => {
  it("refuses a European decimal comma rather than reading it 100x wrong", () => {
    // 1,25 is 1.25 in Germany and a broken thousands group in the US, and
    // nothing in the text says which. Either guess is wrong somewhere.
    expect(parseMoney("1,25")).toBeNull();
    // The realistic shape: a European sheet is semicolon-delimited, so the
    // comma stays inside the price field where the refusal can be seen.
    const { rows, problems } = parsePriceList("Widget;1,25");
    expect(rows).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toMatch(/without guessing/i);
  });

  it("refuses an ambiguous decimal comma pasted from Excel too", () => {
    const { rows, problems } = parsePriceList("Widget\t1,25");
    expect(rows).toEqual([]);
    expect(problems).toHaveLength(1);
  });

  it("refuses a European thousands point", () => {
    expect(parseMoney("1.250,00")).toBeNull();
  });

  it("refuses a malformed group instead of dropping a digit", () => {
    expect(parseMoney("1,2500")).toBeNull();
    expect(parseMoney("12,34")).toBeNull();
  });

  it("reports the line it skipped, by number and text", () => {
    const { rows, problems } = parsePriceList(
      ["Description,Price", "#12 THHN,0.42", "Broken widget,CALL"].join("\n")
    );
    expect(rows).toHaveLength(1);
    expect(problems).toEqual([
      {
        line: 3,
        text: "Broken widget,CALL",
        reason: "No price found on this line.",
      },
    ]);
  });

  it("refuses a misaligned row under a multi-column header", () => {
    // With three or more columns there is no way to tell which field moved.
    const { rows, problems } = parsePriceList(
      ["Catalog,Description,Price", "SKU1,Unquoted, name,5.00"].join("\n")
    );
    expect(rows).toEqual([]);
    expect(problems[0].reason).toMatch(/needs quoting/i);
  });
});

// ── Headers ──────────────────────────────────────────────────────────────────

describe("reading the header", () => {
  it("prefers a description column over a catalog number", () => {
    expect(
      readHeader(["Catalog #", "Description", "UOM", "List Price", "Net Price"])
    ).toEqual({ name: 1, price: 4 });
  });

  it("takes the rightmost price column, which is what is actually paid", () => {
    expect(readHeader(["Item", "List", "Net"])).toEqual({ name: 0, price: 2 });
  });

  it("is not fooled by a data row whose name contains a price word", () => {
    // "Price tag hanger" is a material, and this row has a number in it.
    expect(readHeader(["Price tag hanger", "4.50"])).toBeNull();
  });

  it("treats a sheet with no header as all data", () => {
    const { header, rows } = parsePriceList('#12 THHN,0.42\n1/2" EMT,1.18');
    expect(header).toBeNull();
    expect(rows).toHaveLength(2);
  });
});

// ── Against the real sheets ──────────────────────────────────────────────────

/**
 * These read the generated fixtures, whose names come from BASELINE_MATERIALS.
 * The assertions are about the whole file rather than individual rows: a parser
 * that is right on the six cases someone thought of and wrong on the 199th row
 * is not fixed.
 */
describe("a real supply-house sheet", () => {
  const EXPECTED_ROWS = 199;

  it("reads a properly quoted export with no losses", () => {
    const { rows, problems, header, delimiter } = parsePriceList(
      fixture("supplyHousePriceSheet.csv")
    );
    expect(delimiter).toBe(",");
    expect(header).toEqual([
      "Catalog #",
      "Description",
      "UOM",
      "List Price",
      "Net Price",
    ]);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(EXPECTED_ROWS);
    // The description, not the SKU — matching is by the contractor's name.
    expect(rows.every(r => !r.name.startsWith("SKU-"))).toBe(true);
    expect(rows.every(r => r.costPerUnit > 0)).toBe(true);
  });

  it("takes Net rather than List off that sheet", () => {
    const { rows } = parsePriceList(fixture("supplyHousePriceSheet.csv"));
    const line = fixture("supplyHousePriceSheet.csv")
      .split(/\r?\n/)
      .find(l => l.includes("100A main panel"))!;
    const net = Number(
      /"\$([\d,]+\.\d\d)"\s*$/.exec(line)![1].replace(/,/g, "")
    );
    expect(rows.find(r => r.name === "100A main panel")!.costPerUnit).toBe(net);
  });

  it("reads the same sheet from an exporter that quotes nothing", () => {
    const { rows, problems } = parsePriceList(
      fixture("supplyHouseUnquoted.csv")
    );
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(EXPECTED_ROWS);

    // Names whose own comma was never quoted come back whole.
    const stranded = rows.find(r => r.name === "#10 bare CU, stranded");
    expect(stranded).toBeDefined();
    expect(stranded!.costPerUnit).toBeGreaterThan(0);
  });

  it("gives the same prices quoted and unquoted", () => {
    const quoted = parsePriceList(fixture("supplyHousePriceSheet.csv")).rows;
    const bare = parsePriceList(fixture("supplyHouseUnquoted.csv")).rows;
    const byName = new Map(bare.map(r => [r.name, r.costPerUnit]));
    for (const row of quoted) {
      expect({ name: row.name, cost: byName.get(row.name) }).toEqual({
        name: row.name,
        cost: row.costPerUnit,
      });
    }
  });

  it("prices every grouped-thousands line in the thousands, not the hundreds", () => {
    // The regression in its natural habitat, and the expectation is read off
    // the FILE rather than from a name pattern repeated here — a test that
    // guesses which rows are expensive tests the guess, not the parser.
    const raw = fixture("supplyHouseUnquoted.csv");
    const { rows } = parsePriceList(raw);
    const byName = new Map(rows.map(r => [r.name, r.costPerUnit]));

    const grouped = raw
      .split(/\r?\n/)
      .map(line => /^(.*),\$(\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null);

    expect(grouped.length).toBeGreaterThan(20);
    for (const [, name, written] of grouped) {
      const expected = Number(written.replace(/,/g, ""));
      expect({ name, got: byName.get(name) }).toEqual({ name, got: expected });
      // And specifically not the tail group, which is what the old parser gave.
      expect(byName.get(name)).not.toBe(
        Number(written.slice(written.indexOf(",") + 1).replace(/,/g, ""))
      );
    }
  });

  it("reads cells pasted out of Excel", () => {
    const { rows, problems, delimiter } = parsePriceList(
      fixture("excelPaste.tsv")
    );
    expect(delimiter).toBe("\t");
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(60);
    expect(rows.every(r => r.costPerUnit > 0)).toBe(true);
    expect(rows.some(r => r.name.includes(","))).toBe(true);
  });

  it("keeps every name matchable — none truncated at a comma", () => {
    for (const file of [
      "supplyHousePriceSheet.csv",
      "supplyHouseUnquoted.csv",
      "excelPaste.tsv",
    ]) {
      const { rows } = parsePriceList(fixture(file));
      // A truncated name is the tell: it ends mid-phrase where a comma was.
      const truncated = rows.filter(r =>
        /\b(solid|stranded)$/.test(r.name) ? false : /,\s*$/.test(r.name)
      );
      expect({ file, truncated }).toEqual({ file, truncated: [] });
    }
  });
});
