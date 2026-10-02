/**
 * The sheet check, on drawings built by hand: a "legend" off to the right
 * holds one copy of each symbol (the looks), the "plan" holds devices and the
 * estimator's marks. Real-sheet numbers come from the measurement scripts;
 * these pin each RULE so it goes red when broken.
 */
import { describe, expect, it } from "vitest";
import { prepareSheet, symbolFromBox, type MatchBox } from "./findMatching";
import type { VectorGeometry } from "./vectorGeometry";
import type { WordBox } from "./textSelection";
import {
  checkMarks,
  decideSpot,
  findKeynotes,
  findSpots,
  notesForMarks,
  readHeight,
  settleTie,
  variantsOfCount,
  type CheckMark,
  type Fit,
  type Look,
} from "./sheetCheck";

type Seg = [number, number, number, number];

function geometry(segs: Seg[], filled: number[] = []): VectorGeometry {
  return {
    segs: Float32Array.from(segs.flat()),
    lightness: new Uint8Array(segs.length),
    filled: Uint8Array.from(segs.map((_, i) => filled[i] ?? 0)),
    imageCoverage: 0,
  };
}

function word(text: string, cx: number, cy: number, height = 3): WordBox {
  const half = Math.max(1, text.length * 0.9);
  return {
    text,
    item: 0,
    x0: cx - half,
    x1: cx + half,
    y0: cy - height / 2,
    y1: cy + height / 2,
    cx,
    cy,
    dx: 1,
    dy: 0,
    height,
  };
}

/** A "duplex": a square body and one pair of lines out to the right. */
const duplex = (x: number, y: number): Seg[] => [
  [x - 4, y - 4, x + 4, y - 4],
  [x + 4, y - 4, x + 4, y + 4],
  [x + 4, y + 4, x - 4, y + 4],
  [x - 4, y + 4, x - 4, y - 4],
  [x - 4, y - 1.5, x + 9, y - 1.5],
  [x - 4, y + 1.5, x + 9, y + 1.5],
];
/** A "double duplex": the duplex plus a second pair ACROSS it. */
const doubleDuplex = (x: number, y: number): Seg[] => [
  ...duplex(x, y),
  [x - 1.5, y - 9, x - 1.5, y + 4],
  [x + 1.5, y - 9, x + 1.5, y + 4],
];
/** A "junction box": the square alone (the J is a word, added separately). */
const square = (x: number, y: number, r = 4): Seg[] =>
  duplex(x, y)
    .slice(0, 4)
    .map(
      s =>
        s.map((v, i) =>
          i % 2 ? (v - y) * (r / 4) + y : (v - x) * (r / 4) + x
        ) as Seg
    );

const box = (x: number, y: number, r = 10): MatchBox => ({
  x: x - r,
  y: y - r,
  width: 2 * r,
  height: 2 * r,
});

/** Legend at x 5000: one duplex, one double duplex, one J box. */
function legendLooks(sheet: ReturnType<typeof prepareSheet>): Look[] {
  const make = (item: string, b: MatchBox) => {
    const r = symbolFromBox(sheet, b);
    if (r.kind !== "ok") throw new Error(`no look for ${item}: ${r.kind}`);
    return { item, template: r.symbol };
  };
  return [
    make("DUPLEX", box(5002.5, 100, 9.5)),
    make("DOUBLE DUPLEX", box(5002.5, 200, 11)),
    make("J BOX", box(5000, 300, 6)),
  ];
}

const mark = (
  id: number,
  x: number,
  y: number,
  count: string,
  item: string | null = count
): CheckMark => ({ id, x, y, count, item });

describe("what a spot is", () => {
  const fit = (item: string, clean: boolean): Fit => ({
    item,
    qualifiers: [],
    coverage: 1,
    clean,
    reasons: clean ? [] : ["more lines run through it"],
    maybeExisting: [],
    halfWidth: 5,
    halfHeight: 5,
  });

  it("is clear when one item fits cleanly, a tie when two do, unsure with only flags", () => {
    expect(decideSpot([fit("A", true), fit("B", false)])).toEqual({
      kind: "clear",
      item: "A",
    });
    expect(decideSpot([fit("A", true), fit("B", true)])).toEqual({
      kind: "tie",
      items: ["A", "B"],
    });
    expect(decideSpot([fit("A", false)])).toEqual({
      kind: "unsure",
      items: ["A"],
    });
  });

  it("is still clear when one item fits through two of its looks", () => {
    expect(decideSpot([fit("A", true), fit("A", true)])).toEqual({
      kind: "clear",
      item: "A",
    });
  });
});

describe("checking the estimator's marks", () => {
  const geo = geometry([
    // legend
    ...duplex(5000, 100),
    ...doubleDuplex(5000, 200),
    ...square(5000, 300),
    // plan
    ...duplex(100, 100), // marked as duplex: matches
    ...doubleDuplex(300, 100), // marked as double duplex: matches, though the duplex look is flagged on it
    ...duplex(500, 100), // marked as DOUBLE duplex: drawn as a plain duplex
    ...duplex(900, 100), // not marked: an unmarked candidate
  ]);
  const words = [word("J", 5000, 300)];
  const sheet = prepareSheet(geo, words);
  const looks = legendLooks(sheet);
  const marks = [
    mark(1, 102.5, 100, "DUPLEX"),
    mark(2, 302.5, 100, "DOUBLE DUPLEX"),
    mark(3, 502.5, 100, "DOUBLE DUPLEX"),
    mark(4, 700, 300, "DUPLEX"), // nothing drawn here
    mark(5, 102.5, 100, "Floor box", null), // a count with no legend look
  ];
  const spots = findSpots(sheet, looks, marks);
  const checks = checkMarks(
    marks,
    spots,
    looks.map(l => l.item)
  );
  const of = (id: number) => checks.find(c => c.markId === id)!;

  it("says a mark matches when its own look is drawn there", () => {
    expect(of(1).kind).toBe("matches");
  });

  it("does not let a FLAGGED other look make a right mark unsure", () => {
    // The duplex look also fits inside every double duplex, flagged
    // "more lines run through it". Counted as a rival, all 4 of Weld 1's
    // double duplexes would read "unsure".
    expect(of(2).kind).toBe("matches");
  });

  it("says a mark looks different, and suggests the item that is drawn", () => {
    expect(of(3)).toMatchObject({ kind: "different", suggest: "DUPLEX" });
  });

  it("says when nothing is drawn under a mark", () => {
    expect(of(4).kind).toBe("nothing");
  });

  it("says when a count has no look to compare with, rather than guessing", () => {
    expect(of(5).kind).toBe("noLook");
  });

  it("finds the unmarked copy as a clear spot, and ties two items only when both fit cleanly", () => {
    const unmarked = spots.filter(s => s.markId === null && s.x < 4000);
    expect(unmarked.map(s => [Math.round(s.x), s.decision.kind])).toEqual([
      [903, "clear"],
    ]);
    expect(spots.every(s => s.decision.kind !== "tie")).toBe(true);
  });
});

describe("settling a tie by what is written beside it", () => {
  // UNCC draws the USB outlet and the GFCI as the PLAIN duplex, with "USB" /
  // "GF" written beside: identical looks, so only the words can decide.
  const tied = [
    { item: "DUPLEX 18 IN", qualifiers: [] },
    { item: '"USB" INDICATES DUPLEX WITH USB PORTS', qualifiers: ["USB"] },
    { item: "DATA OUTLET FOR WALL TV", qualifiers: ["TV"] },
  ];

  it("gives it to the item whose label is written there", () => {
    expect(settleTie(tied, ["2B", "-", "27", "USB"])).toEqual({
      item: '"USB" INDICATES DUPLEX WITH USB PORTS',
      word: "USB",
    });
    expect(settleTie(tied, ["TV"])?.item).toBe("DATA OUTLET FOR WALL TV");
  });

  it("gives it to the one plain item when no label is written there", () => {
    expect(settleTie(tied, ["2B", "-", "9"])).toEqual({
      item: "DUPLEX 18 IN",
      word: null,
    });
  });

  it("leaves it a tie when two plain items tie, or two labels are there", () => {
    expect(
      settleTie([...tied, { item: "DUPLEX ON EMERGENCY", qualifiers: [] }], [])
    ).toBeNull();
    expect(settleTie(tied, ["USB", "TV"])).toBeNull();
  });
});

describe("heights", () => {
  it("reads a height only with an inch mark, a foot mark or a plus sign, in range", () => {
    expect(readHeight('54"')?.inches).toBe(54);
    expect(readHeight("+18")?.inches).toBe(18);
    expect(readHeight('48" AFF')?.inches).toBe(48);
    expect(readHeight("4'-0\"")?.inches).toBe(48);
    expect(readHeight("3'6\"")?.inches).toBe(42);
    // A circuit number, a box size, a conduit size: not heights.
    for (const t of ["48", "21", '4"', '1"', "2B"])
      expect(readHeight(t)).toBeNull();
  });
});

describe("keynote tags", () => {
  it("takes a number inside a closed square, and not one beside a round device", () => {
    const geo = geometry([
      // a tag: square round "14"
      [96, 96, 104, 96],
      [104, 96, 104, 104],
      [104, 104, 96, 104],
      [96, 104, 96, 96],
      // "21" beside a device: only a line on one side
      [196, 96, 196, 104],
    ]);
    const sheet = prepareSheet(geo, [
      word("14", 100, 100),
      word("21", 200, 100),
    ]);
    expect(findKeynotes(sheet).map(k => k.number)).toEqual([14]);
  });

  it("gives a tag to its nearest mark only", () => {
    const geo = geometry([
      [96, 96, 104, 96],
      [104, 96, 104, 104],
      [104, 104, 96, 104],
      [96, 104, 96, 96],
    ]);
    const sheet = prepareSheet(geo, [
      word("14", 100, 100),
      word('54"', 210, 100),
    ]);
    const notes = notesForMarks(sheet, [
      mark(1, 115, 100, "A"),
      mark(2, 125, 100, "A"),
      mark(3, 205, 100, "A"),
    ]);
    expect(notes.map(n => n.keynotes)).toEqual([[14], [], []]);
    expect(notes[2].words.heights.map(h => h.inches)).toEqual([54]);
  });
});

describe("variants inside a count, with legend looks", () => {
  it("takes each mark's look from the legend, so marks off the symbol's centre stay one look", () => {
    // Marks on the body, not the middle of the whole symbol (the lines run off
    // to the right) — as a hand count places them. A box round each mark
    // catches a different piece; on Weld 1 that split 9 duplexes into 8 looks.
    const geo = geometry([
      ...duplex(5000, 100),
      ...duplex(100, 100),
      ...duplex(200, 100),
      ...duplex(300, 100),
      ...duplex(400, 100),
    ]);
    const sheet = prepareSheet(geo, []);
    const made = symbolFromBox(sheet, box(5002.5, 100, 9.5));
    if (made.kind !== "ok") throw new Error(made.kind);
    const looks: Look[] = [{ item: "DUPLEX", template: made.symbol }];
    const marks = [100, 200, 300, 400].map((x, i) =>
      mark(i + 1, x + 1, 100, "DUPLEX")
    );
    const spots = findSpots(sheet, looks, marks);
    const groups = variantsOfCount(sheet, marks, { spots });
    expect(groups).toEqual([
      {
        look: 1,
        lookName: "DUPLEX",
        beside: "",
        markIds: [1, 2, 3, 4],
        minor: false,
      },
    ]);
  });
});

describe("variants inside a count", () => {
  it("groups by look and by words beside, main group first and the rest minor", () => {
    const geo = geometry([
      ...duplex(100, 100),
      ...duplex(200, 100),
      ...duplex(300, 100),
      ...doubleDuplex(400, 100), // drawn differently
      ...duplex(500, 100), // same look, 54" beside it
    ]);
    const sheet = prepareSheet(geo, [word('54"', 506, 110)]);
    const marks = [100, 200, 300, 400, 500].map((x, i) =>
      mark(i + 1, x + 2.5, 100, "DUPLEX")
    );
    const groups = variantsOfCount(sheet, marks);
    expect(groups[0]).toMatchObject({
      look: 1,
      beside: "",
      markIds: [1, 2, 3],
      minor: false,
    });
    const rest = groups.slice(1).map(g => ({
      look: g.look,
      beside: g.beside,
      ids: g.markIds,
      minor: g.minor,
    }));
    expect(rest).toEqual(
      expect.arrayContaining([
        { look: 1, beside: '54"', ids: [5], minor: true },
        { look: 2, beside: "", ids: [4], minor: true },
      ])
    );
  });
});
