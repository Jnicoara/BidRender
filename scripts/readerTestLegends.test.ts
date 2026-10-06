import { describe, it, expect } from "vitest";
import { READER_TEST_LEGENDS } from "./readerTestLegends";
import { symbolLookupKey } from "../shared/takeoffCounts";

describe("READER_TEST_LEGENDS", () => {
  it("covers the three plan sets the hand count uses", () => {
    expect(Object.keys(READER_TEST_LEGENDS).sort()).toEqual([
      "Old Blueridge school",
      "UNCC",
      "Weld 1",
    ]);
  });

  it("has no two entries in one set that the app would treat as one name", () => {
    // Counts and legend names are compared with symbolLookupKey, so two
    // entries differing only in case or spacing would be the same count.
    for (const [set, entries] of Object.entries(READER_TEST_LEGENDS)) {
      const keys = entries.map(e => symbolLookupKey(e.name));
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      expect(dupes, set).toEqual([]);
    }
  });

  it("keeps every name trimmed and short enough to type when capturing", () => {
    for (const entries of Object.values(READER_TEST_LEGENDS)) {
      for (const { name } of entries) {
        expect(name).toBe(name.trim());
        expect(name.length, name).toBeLessThanOrEqual(80);
      }
    }
  });

  it("includes the three Weld 1 symbols already captured, by their exact words", () => {
    // Captured on reader-test@local.test before this list existed. If these
    // names drift, those captures stop pairing with their counts.
    const weld = READER_TEST_LEGENDS["Weld 1"].map(e => e.name);
    for (const captured of [
      "JUNCTION BOX",
      "DUPLEX RECEPTACLE",
      "DOUBLE DUPLEX RECEPTACLE",
    ]) {
      expect(weld).toContain(captured);
    }
  });
});
