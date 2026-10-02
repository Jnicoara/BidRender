/**
 * Pin SHAPE by device family (shared/deviceFamily.ts), and the case it was
 * built for: several items sharing one assembly must not look alike
 * (references/track-b-count-pin-styles-plan.md §§ 2, 11.4).
 */
import { describe, expect, it } from "vitest";
import {
  CATEGORY_FAMILY,
  FAMILY_SHAPE,
  deviceFamily,
  familyFromName,
} from "@shared/deviceFamily";
import { pinStylesForBid, tableLetter } from "@shared/pinLetters";
import { MARK_SHAPES, markAppearance, markPath } from "@shared/takeoffMarks";

const shapeOf = (label: string, extra: object = {}) =>
  FAMILY_SHAPE[deviceFamily({ label, ...extra })];

describe("default shape from the name", () => {
  it("draws each family as plans draw it", () => {
    expect(shapeOf("Duplex receptacle")).toBe("circle");
    expect(shapeOf("GFCI")).toBe("circle");
    expect(shapeOf("Junction box")).toBe("circle");
    expect(shapeOf("2x4 troffer")).toBe("square");
    expect(shapeOf("Exit sign")).toBe("square");
    expect(shapeOf("Data outlet")).toBe("triangle");
    expect(shapeOf("Single pole switch")).toBe("diamond");
    expect(shapeOf("Dimmer")).toBe("diamond");
    expect(shapeOf("Thermostat")).toBe("diamond");
    expect(shapeOf("200A panel")).toBe("rect");
    expect(shapeOf("Smoke detector")).toBe("hexagon");
    expect(shapeOf("Widget")).toBe("hexagon");
  });

  it("does not let a shared word pick the wrong family", () => {
    // Each pair is one word apart, and the order of the rules is what decides.
    expect(familyFromName("Light switch")).toBe("switch");
    expect(familyFromName("Safety switch 60A")).toBe("equipment");
    expect(familyFromName("Disconnect switch")).toBe("equipment");
    expect(familyFromName("LED flat panel 2x4")).toBe("lighting");
    expect(familyFromName("Lighting panel LP-1")).toBe("equipment");
    expect(familyFromName("Data outlet")).toBe("data");
    expect(familyFromName("Switchboard")).toBe("equipment");
  });

  it("falls back to the assembly's name, then its category", () => {
    expect(shapeOf("Kitchen", { assemblyName: "Duplex receptacle" })).toBe(
      "circle"
    );
    expect(shapeOf("Type 4", { assemblyCategory: "Lighting" })).toBe("square");
    expect(shapeOf("Type 4", { assemblyCategory: "Panels" })).toBe("rect");
    // The item's own name wins over the category it is filed under.
    expect(
      shapeOf("Occupancy sensor", { assemblyCategory: "Low Voltage/EMS" })
    ).toBe("diamond");
  });

  it("covers every assembly category and draws every family", () => {
    for (const family of Object.values(CATEGORY_FAMILY))
      expect(MARK_SHAPES).toContain(FAMILY_SHAPE[family]);
    for (const shape of Object.values(FAMILY_SHAPE))
      expect(markPath(shape, 0, 0, 10)).not.toContain("NaN");
  });
});

describe("letters agree with the family", () => {
  it("a safety switch is DS, not S", () => {
    // Fixed 2026-10-01 (pin plan decision 4): `/\bswitch/` came first.
    expect(tableLetter("Safety switch")).toBe("DS");
    expect(tableLetter("60A fused disconnect")).toBe("DS");
    expect(tableLetter("Single pole switch")).toBe("S");
  });

  it("the letter and the shape never name different families", () => {
    // Found on screen 2026-10-01: "Data outlet" drew a data triangle wearing
    // R2, because the letter table matched "outlet" before "data". Two tables
    // ordering the same words, so this checks them against each other.
    const LETTER_FAMILY: Record<string, string> = {
      R: "receptacle",
      G: "receptacle",
      Q: "receptacle",
      W: "receptacle",
      U: "receptacle",
      I: "receptacle",
      FB: "receptacle",
      P: "receptacle",
      J: "box",
      S: "switch",
      S3: "switch",
      S4: "switch",
      SD: "switch",
      O: "switch",
      SK: "switch",
      T: "switch",
      L: "lighting",
      X: "lighting",
      E: "lighting",
      D: "data",
      V: "data",
      DV: "data",
      WA: "data",
      TV: "data",
      PN: "equipment",
      DS: "equipment",
      M: "equipment",
      ME: "equipment",
      SM: "other",
      H: "other",
      HS: "other",
      F: "other",
      C: "other",
      K: "other",
    };
    const names = [
      "Data outlet",
      "TV outlet",
      "Phone jack",
      "Wireless access point",
      "Duplex receptacle",
      "GFCI receptacle",
      "USB receptacle",
      "Floor box",
      "Junction box",
      "Light switch",
      "3-way switch",
      "Dimmer",
      "Thermostat",
      "Occupancy sensor",
      "Safety switch",
      "Fused disconnect",
      "200A panel",
      "Lighting panel LP-1",
      "LED flat panel 2x4",
      "Exit sign",
      "2x4 troffer",
      "Emergency light",
      "Smoke detector",
      "Horn strobe",
      "Pull station",
      "Camera",
      "Card reader",
      "Motor connection",
      "RTU",
    ];
    for (const name of names) {
      const letter = tableLetter(name);
      expect({ name, family: LETTER_FAMILY[letter ?? ""] }).toEqual({
        name,
        family: familyFromName(name),
      });
    }
  });

  it("a lighting panel is a panel and a flat panel is a light", () => {
    expect(tableLetter("Lighting panel LP-1")).toBe("PN");
    expect(tableLetter("LED flat panel 2x4")).toBe("L");
  });
});

describe("several items on ONE assembly look different", () => {
  // The owner's case: items captured from the legend, each its own count
  // (shared/assemblyCounts.ts), all linked to one assembly — so the same
  // category, which is all the shape used to read.
  const shared = {
    assemblyName: "Device rough-in",
    assemblyCategory: "Devices",
  };

  it("a duplex and a switch on one Devices assembly differ in SHAPE", () => {
    // Red before the fix: shape came from the category, so both were circles.
    const styles = pinStylesForBid([
      { id: 1, label: "Duplex receptacle", ...shared },
      { id: 2, label: "Single pole switch", ...shared },
    ]);
    const look = (groupId: number) =>
      markAppearance(
        { groupId, assemblyId: 40, assemblyCategory: "Devices" },
        styles
      );
    expect(look(1).shape).toBe("circle");
    expect(look(2).shape).toBe("diamond");
  });

  it("three lights on one assembly share a shape and differ in letter and colour", () => {
    const lights = {
      assemblyName: "Linear fixture",
      assemblyCategory: "Lighting",
    };
    const styles = pinStylesForBid([
      { id: 10, label: "Linear 8ft", ...lights },
      { id: 11, label: "Linear 4ft", ...lights },
      { id: 12, label: "Linear type (A-7)", ...lights },
    ]);
    const looks = [10, 11, 12].map(id =>
      markAppearance(
        { groupId: id, assemblyId: 5, assemblyCategory: "Lighting" },
        styles
      )
    );
    // Shape says "lighting" for all three (plan § 11.4) ...
    expect(new Set(looks.map(l => l.shape))).toEqual(new Set(["square"]));
    // ... and no two pins are the same picture.
    const pictures = looks.map(l => `${l.shape}|${l.letter}|${l.color}`);
    expect(new Set(pictures).size).toBe(3);
  });
});
