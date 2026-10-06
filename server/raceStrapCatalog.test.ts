/**
 * EVERY SHIPPED RACEWAY'S STRAP IS A ROW THE CATALOG SHIPS (retail catalog
 * plan § R7, 2026-09-29).
 *
 * Flex had no strap: `strapFamily` returned null for it, so every FMC and
 * liquidtight run said "No catalog strap" — honest, but a part the estimator
 * had to add by hand at every rooftop unit and cooler. Two things had to
 * agree to fix it, the strap rows and the family that names them, and a
 * change to either alone would pass every other test. This one fails on
 * both: a name with no row, and a flex raceway with no name.
 *
 * Pure: the seed and the naming function, no database.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_MATERIALS } from "./seed/materials";
import {
  fittingMaterialName,
  parseRacewayName,
} from "../shared/runFittingMaterials";

const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));
const raceways = BASELINE_MATERIALS.filter(
  m => m.category === "Conduit" && parseRacewayName(m.name) !== null
);

describe("the strap each shipped raceway counts against", () => {
  it("is a shipped row whenever a name is given", () => {
    expect(raceways.length).toBeGreaterThan(40);
    const missing = raceways
      .map(r => fittingMaterialName(r.name, "strap", null))
      .filter((name): name is string => name !== null)
      .filter(name => !shipped.has(name));
    expect(missing).toEqual([]);
  });

  it("exists for flexible metal and liquidtight conduit, every size", () => {
    const flex = raceways.filter(r =>
      /flexible metal conduit|liquidtight flexible conduit/.test(r.name)
    );
    expect(flex.length).toBe(8);
    for (const r of flex) {
      const size = parseRacewayName(r.name)!.size;
      expect(fittingMaterialName(r.name, "strap", null), r.name).toBe(
        `${size} flexible conduit one-hole strap`
      );
    }
  });
});
