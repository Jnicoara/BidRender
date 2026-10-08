/**
 * The size reader must understand the catalog's NEW names before any row is
 * renamed (naming plan § 1.3; owner review sheet, 2026-10-07): the slash
 * cable spec ("12/2 NM-B Copper"), the hashed "#3/4" (a #3 four-wire, never
 * 3/4 inch), bare aughts ("1/0 THHN Copper") — while every OLD name keeps
 * reading exactly as it did, because both live side by side until the rename
 * lands and old bid lines keep their old names forever.
 *
 * Each "new form" case here was measured failing on the code before this
 * change (materialTypeName("12/2 NM-B Copper") was null; 10/2, 12/2, 14/2
 * sorted as amps; mcFittingNames("12/2 MC cable Copper") was null).
 */
import { describe, expect, it } from "vitest";
import {
  compareBySize,
  hasSize,
  materialTypeName,
} from "../shared/materialSizeOrder";
import { mcFittingNames } from "../shared/runFittingMaterials";

const sorted = (...names: string[]) => [...names].sort(compareBySize);

describe("the slash cable spec", () => {
  it("is a gauge and a count, not an amperage", () => {
    expect(
      sorted("10/2 NM-B Copper", "14/2 NM-B Copper", "12/2 NM-B Copper")
    ).toEqual(["14/2 NM-B Copper", "12/2 NM-B Copper", "10/2 NM-B Copper"]);
    expect(sorted("12/3 NM-B Copper", "12/2 NM-B Copper")).toEqual([
      "12/2 NM-B Copper",
      "12/3 NM-B Copper",
    ]);
  });

  it("groups by its type, as the dash form does", () => {
    expect(materialTypeName("12/2 NM-B Copper")).toBe("NM-B Copper");
    expect(materialTypeName("8/3 SER Copper")).toBe("SER Copper");
    expect(materialTypeName("18/2 control wire")).toBe("control wire");
    expect(materialTypeName("22/2 security cable")).toBe("security cable");
    // the old form, unchanged
    expect(materialTypeName("12-2 NM-B")).toBe("NM-B");
  });

  it("sorts alongside the dash form by the same gauge", () => {
    expect(sorted("10-2 NM-B", "14/2 NM-B Copper", "12-2 NM-B")).toEqual([
      "14/2 NM-B Copper",
      "12-2 NM-B",
      "10-2 NM-B",
    ]);
  });
});

describe('"#3/4" — a #3 four-wire (Q2d)', () => {
  it("reads as gauge 3 with four conductors, among the MC cables", () => {
    expect(hasSize("#3/4 MC cable Copper")).toBe(true);
    expect(materialTypeName("#3/4 MC cable Copper")).toBe("MC cable Copper");
    expect(
      sorted(
        "2/3 MC cable Copper",
        "#3/4 MC cable Copper",
        "4/3 MC cable Copper"
      )
    ).toEqual([
      "4/3 MC cable Copper",
      "#3/4 MC cable Copper",
      "2/3 MC cable Copper",
    ]);
  });
});

describe("aughts without #", () => {
  it("read and sort as before", () => {
    expect(
      sorted(
        "2/0 THHN Copper",
        "#1 THHN Copper",
        "1/0 THHN Copper",
        "250 kcmil THHN Copper"
      )
    ).toEqual([
      "#1 THHN Copper",
      "1/0 THHN Copper",
      "2/0 THHN Copper",
      "250 kcmil THHN Copper",
    ]);
    expect(materialTypeName("1/0 THHN Copper")).toBe("THHN Copper");
    expect(materialTypeName("1/0-3 SER Aluminum")).toBe("SER Aluminum");
  });
});

describe('ground rods — "5/8\\" x 8 ft" (owner, 2026-10-07)', () => {
  it("read their length, with the diameter breaking a tie", () => {
    expect(hasSize('Ground rod, 5/8" x 8 ft')).toBe(true);
    expect(materialTypeName('Ground rod, 5/8" x 8 ft')).toBe("Ground rod");
    expect(
      sorted(
        'Ground rod, 3/4" x 10 ft',
        'Ground rod, 5/8" x 10 ft',
        'Ground rod, 5/8" x 8 ft'
      )
    ).toEqual([
      'Ground rod, 5/8" x 8 ft',
      'Ground rod, 5/8" x 10 ft',
      'Ground rod, 3/4" x 10 ft',
    ]);
    // the old names, unchanged
    expect(sorted("Ground rod, 10 ft", "Ground rod, 8 ft")).toEqual([
      "Ground rod, 8 ft",
      "Ground rod, 10 ft",
    ]);
    expect(materialTypeName("Bath exhaust fan, 50 CFM")).toBe(
      "Bath exhaust fan"
    );
  });
});

describe("SER with the full conductor set (owner, 2026-10-07)", () => {
  it("groups by type and orders by gauge, copper and aluminum", () => {
    expect(materialTypeName("4/0-4/0-4/0-2/0 SER Aluminum")).toBe(
      "SER Aluminum"
    );
    expect(materialTypeName("8-8-8-8 SER Copper")).toBe("SER Copper");
    expect(
      sorted(
        "2/0-2/0-2/0-1 SER Aluminum",
        "4-4-4-6 SER Aluminum",
        "4/0-4/0-4/0-2/0 SER Aluminum",
        "2-2-2-4 SER Aluminum"
      )
    ).toEqual([
      "4-4-4-6 SER Aluminum",
      "2-2-2-4 SER Aluminum",
      "2/0-2/0-2/0-1 SER Aluminum",
      "4/0-4/0-4/0-2/0 SER Aluminum",
    ]);
  });
});

describe("what must NOT change", () => {
  it("a tandem breaker is still not a size", () => {
    expect(materialTypeName("15/20 tandem breaker")).toBeNull();
  });

  it('"20/2 breaker" is still 20 amps', () => {
    expect(sorted("30A 2-Pole breaker", "20/2 breaker", "15A breaker")).toEqual(
      ["15A breaker", "20/2 breaker", "30A 2-Pole breaker"]
    );
  });

  it("a trade size with an inch mark is still a trade size", () => {
    expect(materialTypeName('1/2" EMT')).toBe("EMT");
    expect(sorted('3/4" EMT', '1/2" EMT', '1-1/4" EMT')).toEqual([
      '1/2" EMT',
      '3/4" EMT',
      '1-1/4" EMT',
    ]);
  });
});

describe("MC connector and strap from the cable name", () => {
  it.each([
    ["12-2 MC cable", '3/8" MC connector'],
    ["12/2 MC cable Copper", '3/8" MC connector'],
    ["12/2 MC cable isolated ground Copper", '3/8" MC connector'],
    ["10/4 MC cable Copper", '1/2" MC connector'],
    ["6/3 MC cable Copper", '3/4" MC connector'],
    ["#3/4 MC cable Copper", '1" MC connector'],
    ["3-4 MC cable", '1" MC connector'],
  ])("%s -> %s", (cable, connector) => {
    expect(mcFittingNames(cable)?.connector).toBe(connector);
  });

  it("is still null for a cable that is not MC", () => {
    expect(mcFittingNames("12/2 NM-B Copper")).toBeNull();
    expect(
      mcFittingNames("18/2 shielded fire alarm cable, FPLP Copper")
    ).toBeNull();
  });

  it("reads the MC adds of 2026-10-07 — MC-AP and the dimming MC — as MC", () => {
    expect(mcFittingNames("12/2 MC-AP cable Copper")?.connector).toBe(
      '3/8" MC connector'
    );
    expect(
      mcFittingNames("12/2 MC cable with 16/2 dimming Copper")?.connector
    ).toBe('3/8" MC connector');
  });
});
