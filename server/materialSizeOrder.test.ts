/**
 * Size ordering — the AWG table above all.
 *
 * These assertions are written as whole sequences rather than pairs, because
 * the failure mode this guards against is not "two rows swapped" but "the
 * scale is inverted", and only a full ordering shows that.
 */
import { describe, it, expect } from "vitest";
import {
  compareBySize,
  CONDUCTOR_SIZES,
  hasSize,
  materialSizeKey,
  materialTypeName,
} from "../shared/materialSizeOrder";
import { sortMaterialsForDisplay } from "../shared/materialOrder";
import { BASELINE_MATERIALS } from "./seed/baselineMaterials";

const sorted = (names: string[]) => [...names].sort(compareBySize);

describe("conductor sizes", () => {
  it("runs thinnest to thickest across the AWG inversion and into kcmil", () => {
    // The whole point of the explicit table: a numeric sort gives
    // 1,2,3,4,10,12,14,18 and a text sort puts 4/0 between 4 and 6.
    const scrambled = [
      "#250 kcmil THHN",
      "#12 THHN",
      "#4/0 THHN",
      "#1 THHN",
      "#18 fixture wire",
      "#2/0 THHN",
      "#6 THHN",
      "#1/0 THHN",
      "#14 THHN",
      "500 kcmil THHN",
      "#3 THHN",
      "#8 THHN",
      "#2 THHN",
      "#10 THHN",
      "#3/0 THHN",
      "#4 THHN",
      "#16 fixture wire",
    ];
    expect(sorted(scrambled)).toEqual([
      "#18 fixture wire",
      "#16 fixture wire",
      "#14 THHN",
      "#12 THHN",
      "#10 THHN",
      "#8 THHN",
      "#6 THHN",
      "#4 THHN",
      "#3 THHN",
      "#2 THHN",
      "#1 THHN",
      "#1/0 THHN",
      "#2/0 THHN",
      "#3/0 THHN",
      "#4/0 THHN",
      "#250 kcmil THHN",
      "500 kcmil THHN",
    ]);
  });

  it("puts 1/0 above 1, not below it — the flip a numeric sort gets backwards", () => {
    expect(compareBySize("#1 THHN", "#1/0 THHN")).toBeLessThan(0);
    expect(compareBySize("#1/0 THHN", "#2/0 THHN")).toBeLessThan(0);
    expect(compareBySize("#2 THHN", "#1 THHN")).toBeLessThan(0);
  });

  it("puts every aught size above every plain gauge", () => {
    for (const aught of ["#1/0 THHN", "#2/0 THHN", "#3/0 THHN", "#4/0 THHN"]) {
      for (const gauge of ["#14 THHN", "#6 THHN", "#2 THHN", "#1 THHN"]) {
        expect(
          compareBySize(gauge, aught),
          `${gauge} vs ${aught}`
        ).toBeLessThan(0);
      }
    }
  });

  it("orders cable by gauge first, then by conductor count", () => {
    expect(
      sorted(["12-3 NM-B", "14-2 NM-B", "12-2 NM-B", "14-3 NM-B", "10-2 NM-B"])
    ).toEqual([
      "14-2 NM-B",
      "14-3 NM-B",
      "12-2 NM-B",
      "12-3 NM-B",
      "10-2 NM-B",
    ]);
  });

  it("keeps the declared table thinnest-first", () => {
    // Guards the data itself: a size inserted at the end rather than in
    // position would silently sort as the largest wire in the catalog.
    const awg = CONDUCTOR_SIZES.filter(
      s => !s.includes("/0") && Number(s) < 100
    ).map(Number);
    expect(awg).toEqual([...awg].sort((a, b) => b - a));

    const kcmil = CONDUCTOR_SIZES.filter(s => Number(s) >= 100).map(Number);
    expect(kcmil).toEqual([...kcmil].sort((a, b) => a - b));
  });
});

/**
 * Lugs are sold by the RANGE of conductor the barrel accepts — "14-10 AWG" —
 * rather than per gauge, so their size is a pair rather than a number. See
 * LUG_RANGES in server/seed/materials/connectors.ts for why the catalog names
 * them that way.
 */
describe("conductor ranges", () => {
  it("reads a size off every lug range, including the two with an aught", () => {
    // "1-1/0" and "14-10" were the two that read as sizeless: neither is a
    // cable spec, and no other branch claimed them. A sizeless row sorts to
    // the end of its category, which put two of one family of five somewhere
    // else entirely.
    for (const name of [
      "14-10 AWG crimp lug",
      "8-6 AWG crimp lug",
      "4-2 AWG crimp lug",
      "1-1/0 AWG crimp lug",
      "2/0-4/0 AWG crimp lug",
    ]) {
      expect(hasSize(name), name).toBe(true);
    }
  });

  it("orders a range by the smallest conductor it accepts", () => {
    expect(
      sorted([
        "2/0-4/0 AWG crimp lug",
        "8-6 AWG crimp lug",
        "14-10 AWG crimp lug",
        "1-1/0 AWG crimp lug",
        "4-2 AWG crimp lug",
      ])
    ).toEqual([
      "14-10 AWG crimp lug",
      "8-6 AWG crimp lug",
      "4-2 AWG crimp lug",
      "1-1/0 AWG crimp lug",
      "2/0-4/0 AWG crimp lug",
    ]);
  });

  it("sorts a range among the conductors, not after them", () => {
    // The range shares the AWG scale with a plain gauge, so a #10 lands
    // between the 14-10 and 8-6 ranges rather than in a group of its own.
    expect(
      sorted(["8-6 AWG crimp lug", "#10 THHN", "14-10 AWG crimp lug"])
    ).toEqual(["14-10 AWG crimp lug", "#10 THHN", "8-6 AWG crimp lug"]);
  });

  it("still needs the AWG to call a hyphenated pair a range", () => {
    // Without the marker "14-10" is a cable spec and nothing else. This is the
    // rule the whole module runs on — a bare number is never a size — and a
    // range is no exception to it.
    expect(hasSize("14-10 crimp lug")).toBe(false);
    // And the cable branch keeps the specs that ARE cable specs.
    expect(sorted(["12-3 NM-B", "12-2 NM-B", "14-2 NM-B"])).toEqual([
      "14-2 NM-B",
      "12-2 NM-B",
      "12-3 NM-B",
    ]);
  });

  it("does not read the range's second element as a conductor count", () => {
    // "8-6 AWG" used to match the cable branch and come out as a #8 with SIX
    // conductors in it. The order it produced was right by luck — a range
    // starts at its own first element — but the count was fiction, and a
    // fiction that sorts correctly is the kind that survives. The count slot
    // is the third element of the key.
    expect(materialSizeKey("8-6 AWG crimp lug")[2]).toBe(0);
    expect(materialSizeKey("2/0-4/0 AWG crimp lug")[2]).toBe(0);
    // A real cable spec still carries its count.
    expect(materialSizeKey("12-3 NM-B")[2]).toBe(3);
  });

  it("covers every lug range the catalog actually ships", () => {
    const lugs = BASELINE_MATERIALS.filter(m => /AWG crimp lug$/.test(m.name));
    expect(lugs.length).toBeGreaterThan(0);
    const unread = lugs.filter(m => !hasSize(m.name)).map(m => m.name);
    expect(unread).toEqual([]);
  });
});

describe("trade sizes", () => {
  it("runs smallest to largest, not alphabetically", () => {
    const scrambled = [
      '2" EMT',
      '1/2" EMT',
      '1-1/4" EMT',
      '3/4" EMT',
      '4" EMT',
      '1" EMT',
      '2-1/2" EMT',
      '1-1/2" EMT',
      '3" EMT',
    ];
    expect(sorted(scrambled)).toEqual([
      '1/2" EMT',
      '3/4" EMT',
      '1" EMT',
      '1-1/4" EMT',
      '1-1/2" EMT',
      '2" EMT',
      '2-1/2" EMT',
      '3" EMT',
      '4" EMT',
    ]);
  });

  it("puts the fractional sizes below 1 inch, where a text sort would not", () => {
    expect(compareBySize('1/2" EMT', '1" EMT')).toBeLessThan(0);
    expect(compareBySize('3/4" EMT', '1" EMT')).toBeLessThan(0);
    expect(compareBySize('1" EMT', '1-1/4" EMT')).toBeLessThan(0);
  });
});

describe("amperages and lengths", () => {
  it("orders breakers by amps", () => {
    expect(
      sorted(["100/2 breaker", "15A breaker", "30A breaker", "20A breaker"])
    ).toEqual(["15A breaker", "20A breaker", "30A breaker", "100/2 breaker"]);
  });

  it("orders panels by amps", () => {
    expect(
      sorted([
        "200A main panel",
        "100A main panel",
        "400A main panel",
        "125A main panel",
      ])
    ).toEqual([
      "100A main panel",
      "125A main panel",
      "200A main panel",
      "400A main panel",
    ]);
  });

  it("compares feet and inches on the same scale", () => {
    expect(
      sorted([
        '24" under-cabinet light',
        "4 ft LED strip fixture",
        '12" under-cabinet light',
      ])
    ).toEqual([
      '12" under-cabinet light',
      '24" under-cabinet light',
      "4 ft LED strip fixture",
    ]);
  });
});

/**
 * Two shapes the parser used to miss entirely, found 2026-09-25 in the pricing
 * sheet's Boxes and Equipment shelves. A name it cannot read falls back to
 * alphabetical, which looks sorted and is wrong the moment a number gains a
 * digit: "12x12" before "4x4", "110 CFM" before "50 CFM".
 */
describe("dimensions and trailing sizes", () => {
  it("orders a WxH box by its dimensions, not alphabetically", () => {
    expect(
      sorted([
        "12x12 pull box",
        "4x4 pull box",
        "24x24 pull box",
        "6x6 pull box",
        "16x16 pull box",
        "8x8 pull box",
      ])
    ).toEqual([
      "4x4 pull box",
      "6x6 pull box",
      "8x8 pull box",
      "12x12 pull box",
      "16x16 pull box",
      "24x24 pull box",
    ]);
  });

  it("breaks a tie on the first dimension with the second", () => {
    expect(
      sorted(["2x4 LED troffer", "2x2 LED troffer", "1x4 LED troffer"])
    ).toEqual(["1x4 LED troffer", "2x2 LED troffer", "2x4 LED troffer"]);
  });

  it("derives the type from a dimensioned name, so the family groups", () => {
    expect(materialTypeName("12x12 pull box")).toBe("pull box");
    expect(materialTypeName("4x4 wireway")).toBe("wireway");
  });

  it("orders airflow stated after the comma", () => {
    expect(
      sorted([
        "Bath exhaust fan, 150 CFM",
        "Bath exhaust fan, 50 CFM",
        "Bath exhaust fan, 110 CFM",
        "Bath exhaust fan, 80 CFM",
      ])
    ).toEqual([
      "Bath exhaust fan, 50 CFM",
      "Bath exhaust fan, 80 CFM",
      "Bath exhaust fan, 110 CFM",
      "Bath exhaust fan, 150 CFM",
    ]);
  });

  it("orders a length stated after the comma", () => {
    expect(
      sorted(["Modular furniture whip, 10 ft", "Modular furniture whip, 6 ft"])
    ).toEqual([
      "Modular furniture whip, 6 ft",
      "Modular furniture whip, 10 ft",
    ]);
  });

  it("derives the type from a trailing size by dropping it", () => {
    expect(materialTypeName("Bath exhaust fan, 50 CFM")).toBe(
      "Bath exhaust fan"
    );
    expect(materialTypeName("Ground rod, 8 ft")).toBe("Ground rod");
  });

  it("does not read a size that is only PART of the text after the comma", () => {
    // "3/4\" x 10 ft" is a diameter and a length. Reading only the length would
    // file a different product as the 10 ft rod; leaving it unsized keeps it
    // labelled by its whole name, which sorts it straight after the family.
    expect(hasSize('Ground rod, 3/4" x 10 ft')).toBe(false);
  });

  it("puts the real catalog's pull boxes and fans in size order on screen", () => {
    // Through compareMaterials, which is what the Materials screen calls — the
    // type label has to agree across the family or the size never gets a say.
    const shelf = (pattern: RegExp) =>
      sortMaterialsForDisplay(
        BASELINE_MATERIALS.filter(m => pattern.test(m.name))
      ).map(m => m.name);
    expect(shelf(/^\d+x\d+ pull box$/)).toEqual([
      "4x4 pull box",
      "6x6 pull box",
      "8x8 pull box",
      "12x12 pull box",
      "16x16 pull box",
      "24x24 pull box",
    ]);
    expect(shelf(/^Bath exhaust fan, \d+ CFM$/)).toEqual([
      "Bath exhaust fan, 50 CFM",
      "Bath exhaust fan, 80 CFM",
      "Bath exhaust fan, 110 CFM",
      "Bath exhaust fan, 150 CFM",
    ]);
  });
});

describe("materials with no size", () => {
  it("sorts after everything that has one, rather than interleaving", () => {
    const out = sorted([
      "Wire nuts",
      "#12 THHN",
      "Electrical tape",
      "#4/0 THHN",
    ]);
    expect(out).toEqual([
      "#12 THHN",
      "#4/0 THHN",
      "Electrical tape",
      "Wire nuts",
    ]);
  });

  it("is stable and alphabetical among themselves", () => {
    expect(sorted(["Zip ties", "Duct seal", "PVC cement"])).toEqual([
      "Duct seal",
      "PVC cement",
      "Zip ties",
    ]);
  });
});

describe("the real catalog", () => {
  it("reads a size off every row in the size-named families", () => {
    // A regression guard on the parsing rather than the ordering. If a naming
    // convention changes so that sizes stop being recognised, the screen
    // quietly falls back to alphabetical within the category and nobody
    // notices — the list still looks sorted.
    // "EMT strap" is the plain wall strap and is genuinely one-size-fits-most,
    // unlike the strut straps which are sized per trade size. It sorts to the
    // end of its category by name, which is right. "Reducing washer set"
    // (2026-09-25) is a mixed set of step-downs, not one size.
    const GENUINELY_UNSIZED = new Set(["EMT strap", "Reducing washer set"]);

    const sizeNamed = BASELINE_MATERIALS.filter(
      m =>
        (m.category === "Wire & Cable" ||
          m.category === "Conduit" ||
          m.category === "Conduit Fittings") &&
        !GENUINELY_UNSIZED.has(m.name)
    );
    const unread = sizeNamed.filter(m => !hasSize(m.name)).map(m => m.name);
    expect(
      unread.slice(0, 20),
      `${unread.length} of ${sizeNamed.length} unreadable`
    ).toEqual([]);
  });

  it("orders the real THHN family thinnest to thickest", () => {
    const thhn = BASELINE_MATERIALS.filter(
      m => /^#?\d.* THHN$/.test(m.name) || /kcmil THHN$/.test(m.name)
    )
      .map(m => m.name)
      .sort(compareBySize);
    expect(thhn[0]).toBe("#14 THHN");
    expect(thhn[thhn.length - 1]).toBe("500 kcmil THHN");
    expect(thhn.indexOf("#1 THHN")).toBeLessThan(thhn.indexOf("#1/0 THHN"));
  });

  it("orders the real EMT family smallest to largest", () => {
    const emt = BASELINE_MATERIALS.filter(m => /^\S+ EMT$/.test(m.name))
      .map(m => m.name)
      .sort(compareBySize);
    expect(emt).toEqual([
      '1/2" EMT',
      '3/4" EMT',
      '1" EMT',
      '1-1/4" EMT',
      '1-1/2" EMT',
      '2" EMT',
      '2-1/2" EMT',
      '3" EMT',
      '4" EMT',
    ]);
  });
});
