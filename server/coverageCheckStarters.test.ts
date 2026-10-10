/**
 * The coverage-check starters (owner, 2026-10-09; references/coverage-check.md
 * on track-c): all 26 missing assemblies from the first check (CK1–CK26) and
 * the wider check's top 15 (CW1–CW15), plus the three changes to starters
 * that already ship — RS12's wire, LT23's hanging kit, and RS6 split from the
 * over-range microwave.
 *
 * Pure: the seed files, no database. That they seed — present, exactly their
 * recipe, hours NULL — is starterAssembliesSeed.test.ts, which counts them;
 * that an older database gets RS12 / LT23 is starterCoverRepair.test.ts.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { BASELINE_MATERIALS } from "./seed/materials";
import { starterPartName } from "./seed/starterParts";

type Tag = "residential" | "commercial" | "both";

/** Ref, name, tag — the names are frozen the day they ship. */
const COVERAGE: Array<[string, string, Tag]> = [
  ["CK1", "Emergency light (bug-eye), standalone", "commercial"],
  ["CK2", "Fire alarm strobe only", "commercial"],
  ["CK3", "Water heater connection, commercial (208V, MC)", "commercial"],
  ["CK4", "Recessed wafer downlight, commercial (MC whip)", "commercial"],
  ["CK5", "Fire alarm control panel connection", "commercial"],
  ["CK6", "208V cooler / freezer receptacle (NEMA 6-20)", "commercial"],
  ["CK7", "Duplex receptacle, EMT", "commercial"],
  ["CK8", "Two switches, one box, MC", "commercial"],
  ["CK9", "Data drop, Cat6 2-port (commercial)", "commercial"],
  ["CK10", "Daylight sensor", "commercial"],
  ["CK11", "Wall TV / display location, commercial", "commercial"],
  ["CK12", "Ceiling receptacle for projector", "commercial"],
  ["CK13", "Mini-split connection, MC", "commercial"],
  ["CK14", "Electric wall heater, fan-forced", "both"],
  ["CK15", "Fire alarm speaker/strobe", "commercial"],
  ["CK16", "Heat detector", "commercial"],
  ["CK17", "Ceiling light, old work", "residential"],
  ["CK18", "Over-range microwave circuit, 20A", "residential"],
  ["CK19", "GFCI receptacle, old work", "residential"],
  ["CK20", "Wall oven or cooktop, hardwired 40A", "residential"],
  ["CK21", "Bath fan / heater combo, 20A", "residential"],
  ["CK22", "Heated bathroom floor", "residential"],
  ["CK23", "Wall TV location (power + HDMI)", "residential"],
  ["CK24", "Island / peninsula pop-up receptacle", "residential"],
  ["CK25", "Pendant or sconce, old work", "residential"],
  ["CK26", "Tandem breaker add", "residential"],
  [
    "CW1",
    "Equipment connection, hardwired (flex whip), 208/240V",
    "commercial",
  ],
  ["CW2", "Commercial Level 2 EV charger, 208V", "commercial"],
  ["CW3", "Outdoor emergency service disconnect (NEC 230.85)", "residential"],
  ["CW4", "Apartment unit panel, 125A main-lug", "residential"],
  ["CW5", "Overhead door operator connection", "commercial"],
  ["CW6", "Air compressor connection, 240V", "both"],
  ["CW7", "Welder / shop receptacle, 50A (NEMA 6-50)", "both"],
  ["CW8", "Wireless access point drop (ceiling)", "commercial"],
  ["CW9", "Bollard light", "commercial"],
  ["CW10", "Manual transfer switch, 6–10 circuit", "residential"],
  ["CW11", "EV-ready conduit stub (EV-capable space)", "both"],
  ["CW12", "Multi-unit meter center", "both"],
  ["CW13", "Hospital-grade receptacle (exam / operatory)", "commercial"],
  ["CW14", "208V kitchen equipment receptacle, 30A (NEMA 6-30)", "commercial"],
  ["CW15", "Recessed clock receptacle", "commercial"],
];

const byRef = new Map(BASELINE_ASSEMBLIES.map(a => [a.ref, a]));
const partsOf = (ref: string) => {
  const spec = byRef.get(ref);
  if (!spec) throw new Error(`no starter ${ref}`);
  return spec.materials.map(l => ({
    name: starterPartName(l.part),
    qty: l.qty,
  }));
};
const namesOf = (ref: string) => partsOf(ref).map(p => p.name);

describe("the coverage-check starters", () => {
  it("ships all 41, by ref, name and tag", () => {
    expect(COVERAGE).toHaveLength(41);
    const shipped = BASELINE_ASSEMBLIES.filter(a => /^C[KW]\d+$/.test(a.ref))
      .map(a => [a.ref, a.name, a.projectType])
      .sort();
    expect(shipped).toEqual([...COVERAGE].sort());
  });

  it.each(COVERAGE)("%s: hours not set, every part a shipped row", ref => {
    const spec = byRef.get(ref)!;
    expect(spec.baseLaborHours).toBeNull();
    expect(spec.missingParts ?? []).toEqual([]);
    const catalog = new Set(BASELINE_MATERIALS.map(m => m.name));
    expect(namesOf(ref).filter(n => !catalog.has(n))).toEqual([]);
  });

  it("uses the rows Track A added for the checks, so none sits unused", () => {
    const used = new Set(
      BASELINE_ASSEMBLIES.flatMap(a =>
        a.materials.map(l => starterPartName(l.part))
      )
    );
    for (const name of [
      "20A 250V receptacle, NEMA 6-20R",
      "30A 250V receptacle, NEMA 6-30R",
      "50A 250V receptacle, NEMA 6-50R",
      "Pop-up countertop receptacle",
      "Fan-forced wall heater, 2000W 240V",
      "Wall heater thermostat",
      "Floor heating mat",
      "Floor heating thermostat, GFCI",
      "4/3 NM-B Copper",
      "12/2 MC cable healthcare (HCF) Copper",
      "Meter center, 4-position",
    ])
      expect(used.has(name), name).toBe(true);
  });
});

describe("the changes to starters that already ship", () => {
  it("keeps their names — a renamed starter seeds a second copy", () => {
    expect(byRef.get("RS6")?.name).toBe("Range hood / microwave circuit");
    expect(byRef.get("RS12")?.name).toBe("EV charger circuit, 48A hardwired");
    expect(byRef.get("LT23")?.name).toBe("8 ft LED strip (sales floor rows)");
  });

  it("RS12 wires the 48A charger with 4/3 NM-B, not 6/3 (owner, 2026-10-09)", () => {
    // NM is held to 60°C: #6 copper is 55A, and 48A continuous needs 60A.
    expect(partsOf("RS12")).toContainEqual({
      name: "4/3 NM-B Copper",
      qty: 40,
    });
    expect(namesOf("RS12")).not.toContain("6/3 NM-B Copper");
  });

  it("LT23 adds the aircraft-cable hanging kit and keeps the support wire", () => {
    expect(partsOf("LT23")).toContainEqual({
      name: "Fixture hanging kit, aircraft cable",
      qty: 2,
    });
    expect(namesOf("LT23")).toContain("12 ga ceiling hanger wire");
  });

  it("RS6 stays the range hood; the over-range microwave is CK18", () => {
    expect(namesOf("RS6")).toContain("Range hood fan");
    expect(namesOf("RS6").some(n => /receptacle/i.test(n))).toBe(false);
    const mw = namesOf("CK18");
    expect(mw).toContain("20A single receptacle");
    expect(mw).toContain("12/2 NM-B Copper");
    expect(mw).toContain("20A 1-Pole breaker");
    expect(mw).not.toContain("Range hood fan");
  });
});
