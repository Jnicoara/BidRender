import { describe, expect, it } from "vitest";
import {
  findTagShapes,
  readKeyedNotes,
  readNoteLists,
  type NoteGeometry,
  type NoteWord,
} from "./keyedNotes";
import weld1E200 from "./__fixtures__/weld1-e200-notes.json";
import unccP3 from "./__fixtures__/uncc-p3-notes.json";

/*
  Real sheets, written by scripts/keyedNotesFixture.mts from the PDFs on
  the fixture bid "Sheet numbers check" (2026-10-13): every word, and the
  line work near every short number. Nothing here is typed from memory.
*/
type Fixture = {
  words: NoteWord[];
  segs: number[];
  lightness: number[];
};
function sheet(f: Fixture): [NoteWord[], NoteGeometry] {
  return [
    f.words,
    {
      segs: Float32Array.from(f.segs),
      lightness: Uint8Array.from(f.lightness),
    },
  ];
}

describe("the note list (5b) — Weld 1 E-200", () => {
  const [words] = sheet(weld1E200);
  const lists = readNoteLists(words);

  it("finds WORK NOTES 1–18 and nothing else", () => {
    expect(lists.map(l => [l.heading, l.keyed])).toEqual([
      ["WORK NOTES", true],
    ]);
    expect(lists[0].notes.map(n => n.label)).toEqual(
      Array.from({ length: 18 }, (_, i) => String(i + 1))
    );
  });

  it("joins each note's printed lines into one text", () => {
    const note = (label: string) =>
      lists[0].notes.find(n => n.label === label)?.text;
    expect(note("1")).toBe(
      "PROVIDE 240V. 30/2 N.F. HEAVY DUTY DISCONNECT FOR BODY SCANNER CONNECTION. COORDINATE WITH EQUIPMENT SUPPLIER."
    );
    // Four printed lines.
    expect(note("2")).toBe(
      'STUB (2) 1"C TO INTERIOR OF SHOP SPACE FROM UNDERGROUND TO NEW 4" SQ. STEEL BOLLARD FOR FUTURE POWER AND SECURITY WIRING. 42" BOLLARD AND CONCRETE BASE BY ELECTRICAL CONTRACTOR REFER TO ARCHITECTURAL DETAIL.'
    );
    // The last note ends where its lines do, not at the sheet's edge.
    expect(note("18")).toBe(
      "EXTEND 120V CIRCUIT FROM EMERGENCY PANEL GL TO 120V SOLENOID CONTROL FOR SECURITY CONTROL OF WATER SHUT-OFF."
    );
  });
});

describe("the tags (5a) — the closed-square test on Weld 1 E-200", () => {
  const [words, geo] = sheet(weld1E200);

  it("finds no boxed number above 18 — BEFORE any list is consulted", () => {
    // The legend plan's red test: the notes stop at 18, so a tag above 18
    // is a circuit or room number the shape test let through. A quick rule
    // found 69 such "tags" here.
    const shapes = findTagShapes(words, geo);
    expect(shapes.length).toBe(55);
    expect(shapes.filter(t => Number(t.label) > 18)).toEqual([]);
  });

  it("offers 55 tags, each pointing at a note on the sheet", () => {
    const { lists, tags } = readKeyedNotes(words, geo);
    const labels = new Set(lists[0].notes.map(n => n.label));
    expect(tags.length).toBe(55);
    expect(tags.every(t => labels.has(t.label))).toBe(true);
    // Every note but 12 is tagged somewhere on the plans.
    expect(new Set(tags.map(t => t.label)).size).toBe(17);
  });

  it("centres a tag on its shape, about the 13.5 pt square measured", () => {
    const { tags } = readKeyedNotes(words, geo);
    for (const t of tags) {
      expect(t.r).toBeGreaterThan(4);
      expect(t.r).toBeLessThan(12);
    }
  });
});

describe("a second set — UNCC page 3 (ELECTRICAL NOTES)", () => {
  const [words, geo] = sheet(unccP3);
  const { lists, tags } = readKeyedNotes(words, geo);

  it("reads the numbered list and only its numbers as tags", () => {
    const keyed = lists.filter(l => l.keyed);
    expect(keyed.map(l => [l.heading, l.notes.length])).toEqual([
      ["ELECTRICAL NOTES", 9],
    ]);
    expect(keyed[0].notes[2].text).toBe(
      "IF AN ADDITIONAL DISCONNECT IS REQUIRED BY NEC IT SHALL BE PROVIDED AND INSTALLED BY THE ELECTRICAL CONTRACTOR."
    );
    expect(tags.length).toBe(36);
    expect(tags.every(t => Number(t.label) >= 1 && Number(t.label) <= 9)).toBe(
      true
    );
  });
});

// ── The rules, one at a time, on small drawn cases ──────────────────────────

const H = 9.4;
function word(text: string, x0: number, cy: number, h = H): NoteWord {
  const x1 = x0 + text.length * h * 0.5;
  return { text, x0, x1, cx: (x0 + x1) / 2, cy, height: h };
}
/** A closed polygon of `sides` around (x, y), radius r. */
function shape(x: number, y: number, r: number, sides: number, light = 0) {
  const segs: number[] = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 + Math.PI / sides;
    const b = ((k + 1) / sides) * Math.PI * 2 + Math.PI / sides;
    segs.push(
      x + r * Math.cos(a),
      y + r * Math.sin(a),
      x + r * Math.cos(b),
      y + r * Math.sin(b)
    );
  }
  return { segs, lightness: Array(sides).fill(light) as number[] };
}
function geometry(...parts: { segs: number[]; lightness: number[] }[]) {
  return {
    segs: Float32Array.from(parts.flatMap(p => p.segs)),
    lightness: Uint8Array.from(parts.flatMap(p => p.lightness)),
  };
}
/** A keyed list: heading at (1000, 100), notes 1..n under it. */
function list(n: number, heading = ["KEYED", "NOTES:"]): NoteWord[] {
  const out = [word(heading[0], 1000, 100)];
  if (heading[1]) out.push(word(heading[1], out[0].x1 + 5, 100));
  for (let i = 1; i <= n; i++) {
    out.push(word(String(i), 1003, 100 + i * 24));
    out.push(word(`NOTE ${i} TEXT`, 1030, 100 + i * 24));
  }
  return out;
}

describe("the closed-square test, case by case", () => {
  it("takes a number in a small dark hexagon", () => {
    const tag = word("3", 200, 200);
    const tags = findTagShapes([tag], geometry(shape(tag.cx, 200, 7, 6)));
    expect(tags.map(t => t.label)).toEqual(["3"]);
  });

  it("refuses a number beside a round device (one side only)", () => {
    const tag = word("3", 200, 200);
    // A device circle to the right of the number, not around it.
    const device = shape(tag.x1 + 10, 200, 6, 16);
    expect(findTagShapes([tag], geometry(device))).toEqual([]);
  });

  it("refuses a number in a table cell — long sides are not a tag's", () => {
    const tag = word("3", 200, 200);
    const cell = {
      // A row 14 pt tall across a 300 pt table, and two 10 pt cell walls.
      segs: [
        100, 193, 400, 193, 100, 207, 400, 207, 192, 193, 192, 207, 210, 193,
        210, 207,
      ],
      lightness: [0, 0, 0, 0],
    };
    expect(findTagShapes([tag], geometry(cell))).toEqual([]);
  });

  it("refuses a narrow table's cell — sides longer than a tag's", () => {
    const tag = word("3", 200, 200);
    // Cell walls 12 pt either side, within ray reach; the row's top and
    // bottom lines run 60 pt — past any tag's side, short of a long line.
    const [a, b] = [tag.cx - 30, tag.cx + 30];
    const [l, r] = [tag.cx - 12, tag.cx + 12];
    const cell = {
      segs: [a, 193, b, 193, a, 207, b, 207, l, 193, l, 207, r, 193, r, 207],
      lightness: [0, 0, 0, 0],
    };
    expect(findTagShapes([tag], geometry(cell))).toEqual([]);
  });

  it("refuses a number in a big bubble (a detail or room tag)", () => {
    const tag = word("3", 200, 200);
    expect(findTagShapes([tag], geometry(shape(tag.cx, 200, 20, 16)))).toEqual(
      []
    );
  });

  it("refuses a shape drawn in the gray of the architecture", () => {
    const tag = word("3", 200, 200);
    expect(
      findTagShapes([tag], geometry(shape(tag.cx, 200, 7, 6, 128)))
    ).toEqual([]);
  });

  it("refuses a lopsided enclosure (the number at one end of a long box)", () => {
    const tag = word("3", 200, 200);
    const box = {
      segs: [
        tag.cx - 4,
        193,
        tag.cx + 14,
        193,
        tag.cx + 14,
        193,
        tag.cx + 14,
        207,
        tag.cx + 14,
        207,
        tag.cx - 4,
        207,
        tag.cx - 4,
        207,
        tag.cx - 4,
        193,
      ],
      lightness: [0, 0, 0, 0],
    };
    expect(findTagShapes([tag], geometry(box))).toEqual([]);
  });
});

describe("tags and lists together, case by case", () => {
  it("drops a boxed number with no note of that number", () => {
    const words = [...list(3), word("3", 200, 200), word("7", 300, 200)];
    const geo = geometry(
      shape(words.at(-2)!.cx, 200, 7, 6),
      shape(words.at(-1)!.cx, 200, 7, 6)
    );
    expect(readKeyedNotes(words, geo).tags.map(t => t.label)).toEqual(["3"]);
  });

  it("never tags against GENERAL NOTES", () => {
    const words = [...list(3, ["GENERAL", "NOTES:"]), word("3", 200, 200)];
    const geo = geometry(shape(words.at(-1)!.cx, 200, 7, 6));
    const read = readKeyedNotes(words, geo);
    expect(read.lists.map(l => [l.heading, l.keyed])).toEqual([
      ["GENERAL NOTES", false],
    ]);
    expect(read.tags).toEqual([]);
  });

  it("does not take the list's own boxed numbers as tags on the plan", () => {
    const words = list(2);
    const geo = geometry(
      shape(words[2].cx, words[2].cy, 7, 6),
      shape(words[4].cx, words[4].cy, 7, 6)
    );
    expect(readKeyedNotes(words, geo).tags).toEqual([]);
  });

  it("ends a list at the first missing number", () => {
    const words = list(4).filter(w => w.text !== "3");
    expect(readNoteLists(words)[0].notes.map(n => n.label)).toEqual(["1", "2"]);
  });

  it("reads KEYNOTES as one word", () => {
    const words = list(2, ["KEYNOTES:", ""]);
    expect(readNoteLists(words).map(l => l.heading)).toEqual(["KEYNOTES"]);
  });
});
