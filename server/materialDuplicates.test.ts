import { describe, expect, it } from "vitest";
import {
  findPossibleDuplicates,
  signature,
  sizeTokens,
} from "../shared/materialDuplicates";

const pairsOf = (...names: (string | { name: string; aliases: string })[]) =>
  findPossibleDuplicates(
    names.map(n => (typeof n === "string" ? { name: n } : n))
  ).map(p => [p.a, p.b]);

describe("finds one part under two names", () => {
  it("1-pole and single-pole, in any order", () => {
    expect(pairsOf("20A Single-Pole breaker", "Breaker, 20A 1P")).toEqual([
      ["20A Single-Pole breaker", "Breaker, 20A 1P"],
    ]);
  });

  it("set screw spelled SS, and words in another order", () => {
    expect(
      pairsOf('1/2" EMT set-screw connector', 'EMT connector 1/2" SS')
    ).toHaveLength(1);
  });

  it("a size written before or after the name — the real case found", () => {
    expect(pairsOf('2" riser strap', 'Riser strap, 2"')).toHaveLength(1);
  });

  it("one name states more of the size — the owner's catch, 2026-10-07", () => {
    expect(pairsOf("Ground rod, 10 ft", 'Ground rod, 3/4" x 10 ft')).toEqual([
      ["Ground rod, 10 ft", 'Ground rod, 3/4" x 10 ft'],
    ]);
    // ...but a DIFFERENT length is a different rod.
    expect(pairsOf("Ground rod, 8 ft", 'Ground rod, 3/4" x 10 ft')).toEqual([]);
  });

  it("a waiting new row written without its size, against the shipped one", () => {
    expect(
      findPossibleDuplicates([
        { name: '2" mast roof flashing' },
        { name: "Mast roof flashing", isNew: true },
      ])
    ).toHaveLength(1);
    // Two SHIPPED rows that differ only by a stated size are two parts.
    expect(pairsOf("Duplex receptacle", "20A duplex receptacle")).toEqual([]);
  });

  it("canless and wafer are one fixture", () => {
    expect(
      pairsOf('4" canless LED downlight', '4" wafer LED downlight')
    ).toHaveLength(1);
  });

  it("never pairs two strut channels of different depths (a repeated size is two sizes)", () => {
    expect(
      pairsOf(
        '1-5/8" x 1-5/8" strut channel, 10 ft',
        '1-5/8" x 13/16" strut channel, 10 ft'
      )
    ).toEqual([]);
  });

  it("a name that only adds qualifiers", () => {
    expect(
      pairsOf(
        "20A duplex receptacle",
        "20A duplex receptacle, commercial grade"
      )
    ).toHaveLength(1);
  });

  it("two names the catalog's own search words tie together", () => {
    expect(
      pairsOf(
        { name: "Twist-on wire connector", aliases: "wire nuts wirenut" },
        { name: "Wire nuts", aliases: "twist-on connector" }
      )
    ).toHaveLength(1);
  });
});

describe("keeps different parts apart", () => {
  it.each([
    ['1/2" EMT set-screw connector', '1/2" EMT compression connector'],
    ["20A Single-Pole breaker", "20A 2-Pole breaker"],
    ["15A Single-Pole breaker", "20A Single-Pole breaker"],
    ["#2 XHHW AL", "#2 XHHW CU"],
    ['1/2" EMT connector', '1/2" PVC Sch 40 connector'],
    ['1/2" EMT', '1/2" EMT connector'],
    ["Single-gang box", "Single-gang box, deep"],
    ["Attic fan", "Attic fan thermostat"],
    ["30A fused disconnect, NEMA 1", "30A non-fused disconnect, NEMA 1"],
    ["Wall plate", "2-gang wall plate"],
  ])("%s / %s", (a, b) => {
    expect(pairsOf(a, b)).toEqual([]);
  });

  it("a conduit and its fitting even when the fitting's slang names the conduit", () => {
    expect(
      pairsOf(
        { name: '1/2" EMT', aliases: "thinwall" },
        { name: '1/2" EMT connector', aliases: "emt thinwall" }
      )
    ).toEqual([]);
  });
});

describe("reading a name", () => {
  it("separates size from words", () => {
    expect(sizeTokens('1-1/4" EMT')).toEqual(['1-1/4"']);
    expect(signature("20A Single-Pole breaker")).toEqual({
      words: ["1pole", "breaker"],
      sizes: ["20a"],
    });
  });
});
