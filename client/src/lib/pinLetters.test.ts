/**
 * Pin letters and colours per bid (shared/pinLetters.ts).
 *
 * The fault this guards: three lights linked to one assembly, each now its own
 * count, drew as the same shape (one category) and a colour hashed from the id
 * — which could repeat. Nothing on the pin said which was which.
 */
import { describe, expect, it } from "vitest";
import {
  RESERVED_LETTERS,
  fixtureTag,
  pinStylesForBid,
  tableLetter,
} from "@shared/pinLetters";
import { MARK_COLORS, colorFor, markAppearance } from "@shared/takeoffMarks";

const letters = (counts: Parameters<typeof pinStylesForBid>[0]) => {
  const styles = pinStylesForBid(counts);
  return counts.map(c => styles.get(c.id)?.letter);
};

describe("where a letter comes from", () => {
  it("reads a fixture tag first — trailing in brackets, or leading with a digit", () => {
    expect(fixtureTag("Linear type (A-7)")).toBe("A7");
    expect(fixtureTag("Troffer (F3a)")).toBe("F3A");
    expect(fixtureTag("A1 luminaire")).toBe("A1");
    // A word is not a tag.
    expect(fixtureTag("A light")).toBeNull();
    expect(fixtureTag("Duplex receptacle")).toBeNull();
  });

  it("then the table, most specific first", () => {
    expect(tableLetter("3-way switch")).toBe("S3");
    expect(tableLetter("Single pole switch")).toBe("S");
    expect(tableLetter("GFCI receptacle")).toBe("G");
    expect(tableLetter("Duplex receptacle")).toBe("R");
    expect(tableLetter("Exit sign")).toBe("X");
    expect(tableLetter("Linear 8ft")).toBe("L");
    expect(tableLetter("Smoke detector")).toBe("SM");
    expect(tableLetter("Something else")).toBeNull();
  });

  it("the item's own name before the assembly's, the assembly as a default", () => {
    expect(
      letters([
        { id: 1, label: "GFCI kitchen", assemblyName: "Receptacle assy" },
        { id: 2, label: "Kitchen", assemblyName: "Duplex receptacle" },
        { id: 3, label: "Widget" },
      ])
    ).toEqual(["G", "R", "W"]);
  });
});

describe("two counts on one bid never share a letter", () => {
  it("three lights on one assembly: the tag where there is one, else L, L2", () => {
    expect(
      letters([
        { id: 10, label: "Linear 8ft", assemblyName: "Linear fixture" },
        { id: 11, label: "Linear 4ft", assemblyName: "Linear fixture" },
        { id: 12, label: "Linear type (A-7)", assemblyName: "Linear fixture" },
      ])
    ).toEqual(["L", "L2", "A7"]);
  });

  it("first use keeps the plain letter, whatever order they arrive in", () => {
    expect(
      letters([
        { id: 9, label: "Duplex receptacle" },
        { id: 3, label: "Duplex receptacle" },
      ])
    ).toEqual(["R2", "R"]);
  });

  it("a bump never lands on a code the table gives a meaning to", () => {
    const switches = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      label: `Switch ${i}`,
    }));
    const got = letters(switches);
    expect(got).toEqual(["S", "S2", "S5", "S6", "S7", "S8"]);
    // The property, for every table code: no automatic bump produces one.
    for (const code of Array.from(RESERVED_LETTERS)) {
      const many = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        label: code === "S" ? "switch" : `x${code}`,
      }));
      const assigned = letters(many).slice(1);
      for (const letter of assigned)
        expect(RESERVED_LETTERS.has(letter ?? "")).toBe(false);
    }
  });

  it("an automatic letter never takes a tag the drawing prints", () => {
    expect(
      letters([
        { id: 1, label: "Alarm thing" },
        { id: 2, label: "Linear (A)" },
      ])
    ).toEqual(["A2", "A"]);
  });

  it("a repeated tag still differs", () => {
    expect(
      letters([
        { id: 1, label: "Linear (A-7)" },
        { id: 2, label: "Troffer (A-7)" },
      ])
    ).toEqual(["A7", "A7.2"]);
  });

  it("every letter on a crowded bid is distinct", () => {
    const labels = [
      "Duplex receptacle",
      "GFCI",
      "Duplex receptacle",
      "Switch",
      "3-way switch",
      "Switch",
      "Linear 8ft",
      "Linear 4ft",
      "Exit sign",
      "Exit sign",
    ];
    const got = letters(labels.map((label, i) => ({ id: i + 1, label })));
    expect(new Set(got).size).toBe(labels.length);
  });
});

describe("colours: first use per bid", () => {
  it("the first six counts never share a colour, whatever their ids", () => {
    // Ids 1 and 7 hash to the SAME colour — the fault this replaces.
    expect(colorFor({ id: 1 })).toBe(colorFor({ id: 7 }));
    const counts = [1, 7, 13, 19, 25, 31].map(id => ({ id, label: "x" }));
    const styles = pinStylesForBid(counts);
    const colors = counts.map(c => styles.get(c.id)?.color);
    expect(new Set(colors).size).toBe(6);
    expect(colors).toEqual([...MARK_COLORS]);
  });

  it("the drawing and the panel read the same answer from the same map", () => {
    const styles = pinStylesForBid([
      { id: 1, label: "Linear 8ft" },
      { id: 7, label: "Linear 4ft" },
    ]);
    const mark = markAppearance(
      { groupId: 7, assemblyId: 5, assemblyCategory: "Lighting" },
      styles
    );
    expect(mark.letter).toBe("L2");
    expect(mark.color).toBe(MARK_COLORS[1]);
    // A count the map does not know keeps the old answer and no letter.
    expect(
      markAppearance({ groupId: 99, assemblyId: null }, styles).letter
    ).toBeNull();
  });
});
