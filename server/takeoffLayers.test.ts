/**
 * Layer filtering: System and Location, independently and together.
 *
 * The behaviour worth pinning is the COMBINATION. Two filters that each work
 * alone but AND incorrectly give a count that looks plausible and is wrong —
 * the estimator sees 14 receptacles instead of 22 and has no way to tell the
 * filter is at fault rather than the takeoff. So every combination of on and
 * off across both axes is checked, not just the happy path.
 */
import { describe, expect, it } from "vitest";
import {
  allLayersOn,
  filterByLayers,
  isFiltered,
  isVisible,
  layerLabel,
  layersPresent,
  locationKeyOf,
  RUN_SYSTEM_KEYS,
  setAxis,
  systemKeyForRun,
  systemKeyForStamp,
  toggleLayer,
  UNASSIGNED_LOCATION,
  type LayerState,
} from "../shared/takeoffLayers";

const item = (systemKey: string, location: string | null) => ({
  systemKey,
  location,
});

/** A representative sheet: two systems, three locations, one untagged. */
const SHEET = [
  item("Devices", "Wall"),
  item("Devices", "Wall"),
  item("Devices", "Ceiling/Overhead"),
  item("Lighting", "Ceiling/Overhead"),
  item(RUN_SYSTEM_KEYS.conduit, "Underground"),
  item(RUN_SYSTEM_KEYS.cable, null),
];

describe("which layer a thing belongs to", () => {
  it("puts a stamp in its assembly's Category", () => {
    expect(systemKeyForStamp("Devices")).toBe("Devices");
  });

  it("gives an uncategorised stamp a VISIBLE band rather than hiding it", () => {
    // Somewhere it can be switched off deliberately, instead of vanishing with
    // nothing on the checklist to explain where it went.
    expect(systemKeyForStamp(null)).toBe("Uncategorised");
    expect(systemKeyForStamp("   ")).toBe("Uncategorised");
  });

  it("gives traced runs their own System keys", () => {
    // A run has no assembly and so no Category, but still has to be reachable
    // from the same checklist as everything else on the sheet.
    expect(systemKeyForRun("conduit")).toBe("Conduit runs");
    expect(systemKeyForRun("cable")).toBe("Cable runs");
  });

  it("treats an untagged Location as its own band", () => {
    expect(locationKeyOf(null)).toBe(UNASSIGNED_LOCATION);
    expect(locationKeyOf("")).toBe(UNASSIGNED_LOCATION);
    expect(locationKeyOf("Wall")).toBe("Wall");
  });

  it("labels the untagged band in plain words", () => {
    expect(layerLabel(UNASSIGNED_LOCATION)).toBe("Not tagged");
    expect(layerLabel("Wall")).toBe("Wall");
  });
});

describe("what the checklist offers", () => {
  it("lists only layers actually on the sheet, with counts", () => {
    // Offering six Locations when two are used is four rows of noise that make
    // the two that matter harder to find.
    const present = layersPresent(SHEET);
    expect(present.systems.map(s => s.key).sort()).toEqual([
      "Cable runs",
      "Conduit runs",
      "Devices",
      "Lighting",
    ]);
    expect(present.systems.find(s => s.key === "Devices")!.count).toBe(3);
  });

  it("includes the untagged band when something is untagged", () => {
    const present = layersPresent(SHEET);
    expect(present.locations.map(l => l.key)).toContain(UNASSIGNED_LOCATION);
  });

  it("offers nothing for an empty sheet", () => {
    expect(layersPresent([])).toEqual({ systems: [], locations: [] });
  });

  it("starts with everything on", () => {
    const state = allLayersOn(SHEET);
    expect(filterByLayers(SHEET, state)).toHaveLength(SHEET.length);
    expect(isFiltered(SHEET, state)).toBe(false);
  });
});

describe("filtering by System alone", () => {
  it("hides one system and keeps the rest", () => {
    let state = allLayersOn(SHEET);
    state = toggleLayer(state, "systems", "Devices");

    const shown = filterByLayers(SHEET, state);
    expect(shown).toHaveLength(3);
    expect(shown.every(i => i.systemKey !== "Devices")).toBe(true);
  });

  it("files a run under its TYPE, so a sheet filters by what it is", () => {
    // The point of the change: "show me the half-inch homeruns" is a question
    // an estimator asks, and "show me the conduit" is not.
    expect(systemKeyForRun("conduit", '1/2" EMT, 2 #12 + ground')).toBe(
      '1/2" EMT, 2 #12 + ground'
    );
    expect(systemKeyForRun("cable", "12-2 MC cable")).toBe("12-2 MC cable");
  });

  it("keeps a run traced before types in the checklist, not out of it", () => {
    // It has no type, and a band it cannot reach is work that disappears.
    expect(systemKeyForRun("conduit")).toBe(RUN_SYSTEM_KEYS.conduit);
    expect(systemKeyForRun("cable", null)).toBe(RUN_SYSTEM_KEYS.cable);
    expect(systemKeyForRun("conduit", "   ")).toBe(RUN_SYSTEM_KEYS.conduit);
  });

  it("gathers two runs of ONE type into one band", () => {
    const present = layersPresent([
      { systemKey: systemKeyForRun("conduit", "EMT"), location: null },
      { systemKey: systemKeyForRun("conduit", "EMT"), location: null },
      { systemKey: systemKeyForRun("cable", "MC"), location: null },
    ]);
    expect(present.systems).toHaveLength(2);
    expect(present.systems.find(s => s.key === "EMT")?.count).toBe(2);
  });

  it("carries the colour a run is DRAWN in onto its band", () => {
    // A swatch is a legend. One that disagreed with the line would teach a
    // colour code the drawing does not use — which is the fault CLAUDE.md
    // § "a fix can manufacture the fault another fix was for" is about.
    const present = layersPresent([
      { systemKey: "EMT", location: null, systemColor: "#F472B6" },
      { systemKey: "EMT", location: null, systemColor: "#F472B6" },
    ]);
    expect(present.systems[0].color).toBe("#F472B6");
  });

  it("gives a band with no colour on the drawing no colour here either", () => {
    // A mark Category is not drawn in one colour, so the panel shows a neutral
    // chip. The hash that used to invent one is gone: it handed
    // "Uncategorised" the same pink as a real run type, which is a legend
    // saying two different things at once.
    const present = layersPresent([{ systemKey: "Devices", location: null }]);
    expect(present.systems[0].color).toBe(null);
  });

  it("hides traced runs independently of stamps", () => {
    let state = allLayersOn(SHEET);
    state = toggleLayer(state, "systems", RUN_SYSTEM_KEYS.conduit);
    const shown = filterByLayers(SHEET, state);
    expect(shown.some(i => i.systemKey === RUN_SYSTEM_KEYS.conduit)).toBe(
      false
    );
    expect(shown.some(i => i.systemKey === "Devices")).toBe(true);
  });

  it("shows nothing when every system is off", () => {
    const present = layersPresent(SHEET);
    const state = setAxis(
      allLayersOn(SHEET),
      "systems",
      present.systems.map(s => s.key),
      false
    );
    expect(filterByLayers(SHEET, state)).toHaveLength(0);
  });
});

describe("filtering by Location alone", () => {
  it("hides one location and keeps the rest", () => {
    let state = allLayersOn(SHEET);
    state = toggleLayer(state, "locations", "Wall");

    const shown = filterByLayers(SHEET, state);
    expect(shown).toHaveLength(4);
    expect(shown.every(i => i.location !== "Wall")).toBe(true);
  });

  it("can hide the untagged band without touching anything tagged", () => {
    let state = allLayersOn(SHEET);
    state = toggleLayer(state, "locations", UNASSIGNED_LOCATION);

    const shown = filterByLayers(SHEET, state);
    expect(shown.every(i => i.location !== null)).toBe(true);
    expect(shown).toHaveLength(5);
  });
});

describe("the two axes combining", () => {
  it("shows only what passes BOTH", () => {
    // The headline case from the plan: "only Electrical AND only Underground".
    let state = allLayersOn(SHEET);
    const present = layersPresent(SHEET);
    state = setAxis(state, "systems", ["Devices"], true);
    state = setAxis(state, "locations", ["Wall"], true);

    const shown = filterByLayers(SHEET, state);
    expect(shown).toHaveLength(2);
    expect(
      shown.every(i => i.systemKey === "Devices" && i.location === "Wall")
    ).toBe(true);
    expect(present.systems.length).toBeGreaterThan(1);
  });

  it("hides an item whose System is off even when its Location is on", () => {
    let state = allLayersOn(SHEET);
    state = toggleLayer(state, "systems", "Devices");
    // Wall is still on, but every Wall item is a Device.
    expect(filterByLayers(SHEET, state).some(i => i.location === "Wall")).toBe(
      false
    );
  });

  it("hides an item whose Location is off even when its System is on", () => {
    let state = allLayersOn(SHEET);
    state = toggleLayer(state, "locations", "Ceiling/Overhead");
    const shown = filterByLayers(SHEET, state);
    // Devices survive via their Wall instances; the ceiling one is gone.
    expect(shown.some(i => i.systemKey === "Devices")).toBe(true);
    expect(shown.some(i => i.location === "Ceiling/Overhead")).toBe(false);
  });

  it("gives the same answer for every combination of the two axes", () => {
    // Exhaustive over this sheet: each item is visible exactly when both of
    // its layers are on. An AND implemented as an OR passes the single-axis
    // tests above and fails here.
    const present = layersPresent(SHEET);
    for (const systemOff of present.systems) {
      for (const locationOff of present.locations) {
        let state = allLayersOn(SHEET);
        state = toggleLayer(state, "systems", systemOff.key);
        state = toggleLayer(state, "locations", locationOff.key);

        for (const entry of SHEET) {
          const expected =
            entry.systemKey !== systemOff.key &&
            locationKeyOf(entry.location) !== locationOff.key;
          expect(
            isVisible(entry, state),
            `${entry.systemKey}/${entry.location} with ${systemOff.key} and ${locationOff.key} off`
          ).toBe(expected);
        }
      }
    }
  });

  it("reports that a subset is showing", () => {
    let state = allLayersOn(SHEET);
    expect(isFiltered(SHEET, state)).toBe(false);
    state = toggleLayer(state, "systems", "Devices");
    expect(isFiltered(SHEET, state)).toBe(true);
  });
});

describe("toggling", () => {
  it("returns a NEW state rather than mutating", () => {
    // A mutated Set is the same object, so React re-renders nothing and the
    // checkbox reads as broken.
    const before = allLayersOn(SHEET);
    const after = toggleLayer(before, "systems", "Devices");
    expect(after.systems).not.toBe(before.systems);
    expect(before.systems.has("Devices")).toBe(true);
    expect(after.systems.has("Devices")).toBe(false);
  });

  it("leaves the other axis untouched", () => {
    const before = allLayersOn(SHEET);
    const after = toggleLayer(before, "systems", "Devices");
    expect(after.locations).toBe(before.locations);
  });

  it("toggles back on", () => {
    let state = allLayersOn(SHEET);
    state = toggleLayer(state, "locations", "Wall");
    state = toggleLayer(state, "locations", "Wall");
    expect(filterByLayers(SHEET, state)).toHaveLength(SHEET.length);
  });

  it("turns a whole axis on and off", () => {
    const keys = layersPresent(SHEET).locations.map(l => l.key);
    let state = setAxis(allLayersOn(SHEET), "locations", keys, false);
    expect(filterByLayers(SHEET, state)).toHaveLength(0);
    state = setAxis(state, "locations", keys, true);
    expect(filterByLayers(SHEET, state)).toHaveLength(SHEET.length);
  });
});

describe("layer colours — a swatch is a legend or it is nothing", () => {
  /*
    These replace two tests about a per-key colour HASH, which is gone.

    The hash gave every band a stable colour, and the tests checked exactly
    that. What neither could see is that stability is not the property that
    matters: a swatch next to "1/2\" EMT" says "this is what those lines look
    like on the sheet", and the same swatch next to "Uncategorised" says
    nothing of the kind. Measured in the running app, the hash handed those two
    bands the SAME pink — stable, and wrong.
  */

  it("shows a run type in the colour its lines are drawn in", () => {
    const present = layersPresent([
      { systemKey: "EMT", location: null, systemColor: "#F472B6" },
    ]);
    expect(present.systems[0].color).toBe("#F472B6");
  });

  it("keeps a band's colour stable as other bands come and go", () => {
    // The one property worth keeping from the hash, now got honestly: it comes
    // from the run itself, so it cannot depend on what else is on the sheet.
    const alone = layersPresent([
      { systemKey: "EMT", location: null, systemColor: "#F472B6" },
    ]);
    const crowded = layersPresent([
      { systemKey: "Devices", location: null },
      { systemKey: "EMT", location: null, systemColor: "#F472B6" },
      { systemKey: "MC", location: null, systemColor: "#22D3EE" },
    ]);
    expect(crowded.systems.find(s => s.key === "EMT")?.color).toBe(
      alone.systems[0].color
    );
  });

  it("invents nothing for a band that is not a colour on the sheet", () => {
    for (const key of ["Devices", "", UNASSIGNED_LOCATION]) {
      expect(
        layersPresent([{ systemKey: key, location: null }])["systems"][0].color
      ).toBe(null);
    }
  });
});
