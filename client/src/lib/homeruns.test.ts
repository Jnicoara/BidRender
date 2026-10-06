/**
 * Homeruns read off a vector sheet (@/lib/homeruns). The real sheets are
 * git-ignored test sets, so each case here is the SHAPE measured on one of
 * them, drawn by hand — and each would pass a reader without the rule it
 * names. The measured numbers are in the module header and in
 * references/code-first-ceiling.md § d.
 */
import { describe, expect, it } from "vitest";
import {
  arrowTips,
  homerunLabel,
  readCircuitTags,
  readHomeruns,
  tickCount,
  tieLines,
  tieToSchedule,
  wireNote,
  type HomerunGeometry,
  type HomerunWord,
} from "./homeruns";
import type { PanelSchedule } from "./panelSchedules";

type Seg = [number, number, number, number, { fill?: 1; light?: number }?];

function geometry(segs: Seg[]): HomerunGeometry {
  return {
    segs: Float32Array.from(segs.flatMap(s => s.slice(0, 4) as number[])),
    filled: Uint8Array.from(segs.map(s => s[4]?.fill ?? 0)),
    lightness: Uint8Array.from(segs.map(s => s[4]?.light ?? 0)),
  };
}

/** A word laid out the way wordBoxes gives it, 9.4 pt type as on Weld 1. */
function word(text: string, x0: number, cy: number): HomerunWord {
  const w = text.length * 5;
  return { text, x0, x1: x0 + w, cx: x0 + w / 2, cy, height: 9.4 };
}

/**
 * An upward arrowhead as Weld 1 draws it: two FILLED 9 pt sides meeting at
 * the tip, a 3 pt base — optionally without the base segment, as E-100's
 * rear head has none.
 */
function head(tx: number, ty: number, withBase = true): Seg[] {
  const out: Seg[] = [
    [tx - 1.5, ty + 8.9, tx, ty, { fill: 1 }],
    [tx, ty, tx + 1.5, ty + 8.9, { fill: 1 }],
  ];
  if (withBase) out.push([tx + 1.5, ty + 8.9, tx - 1.5, ty + 8.9, { fill: 1 }]);
  return out;
}

/** A homerun: wire up from (x, y0) to an arrow whose tip is at (x, tip). */
function homerun(x: number, tip: number, y0: number, heads = 1): Seg[] {
  const out: Seg[] = [];
  for (let h = 0; h < heads; h++) out.push(...head(x, tip + h * 8.9, h === 0));
  out.push([x, y0, x, tip + heads * 8.9]);
  return out;
}

describe("arrowheads", () => {
  it("finds a head with 9 pt sides — the study's 8 pt cap found none", () => {
    const tips = arrowTips(geometry(head(100, 100)));
    expect(tips).toHaveLength(1);
    expect(tips[0].x).toBeCloseTo(100, 0);
    expect(tips[0].dy).toBeLessThan(-0.9); // points up
  });

  it("finds a head with no base segment (E-100's rear head)", () => {
    expect(arrowTips(geometry(head(100, 100, false)))).toHaveLength(1);
  });

  it("counts stacked heads as one arrow, one head per circuit", () => {
    const tips = arrowTips(geometry(homerun(100, 100, 200, 2)));
    expect(tips).toHaveLength(1);
    expect(tips[0].heads).toBe(2);
  });

  it("does not take a wide filled wedge (a symbol) for a head", () => {
    const wedge: Seg[] = [
      [90, 110, 100, 100, { fill: 1 }],
      [100, 100, 110, 110, { fill: 1 }],
      [110, 110, 90, 110, { fill: 1 }],
    ];
    expect(arrowTips(geometry(wedge))).toHaveLength(0);
  });
});

describe("circuit tags", () => {
  const tags = (words: HomerunWord[]) =>
    readCircuitTags(words).map(t => `${t.panel}-${t.circuits.join(",")}`);

  it("reads one-word and three-word tags", () => {
    expect(tags([word("3LP-23,25", 0, 10)])).toEqual(["3LP-23,25"]);
    expect(
      tags([word("2B", 0, 10), word("-", 11, 10), word("14", 17, 10)])
    ).toEqual(["2B-14"]);
    expect(tags([word("3LP-(20,22)", 0, 10)])).toEqual(["3LP-20,22"]);
  });

  it("leaves out sheet numbers, fault currents and switch legs", () => {
    expect(
      tags([
        word("E-100", 0, 10),
        word("X-12,172", 0, 40),
        word("1S-11c", 0, 70),
      ])
    ).toEqual([]);
  });

  it("reads (E), PART OF, and EXISTING on the line above", () => {
    const [e] = readCircuitTags([word("(E)", 0, 10), word("L1-14", 17, 10)]);
    expect(e.existing).toBe(true);
    const [p] = readCircuitTags([
      word("PART", 0, 10),
      word("OF", 22, 10),
      word("(E)", 34, 10),
      word("L1-2", 51, 10),
    ]);
    expect(p.partOf).toBe(true);
    const [x] = readCircuitTags([
      word("EXISTING", 0, 10),
      word("1S-9,11", 0, 21),
    ]);
    expect(x.existing).toBe(true);
    expect(x.box.y0).toBeLessThan(10); // the EXISTING is part of where it sits
  });
});

describe("homeruns: a tag, an arrow on a wire, pointing into clear paper", () => {
  it("pairs a tag beside the tip", () => {
    const geo = geometry(homerun(100, 100, 200, 2));
    const found = readHomeruns([word("3LP-23,25", 104, 95)], geo);
    expect(found.map(h => h.tag.text)).toEqual(["3LP-23,25"]);
    expect(found[0].arrow.heads).toBe(2);
  });

  it("finds none where tags have no arrow (UNCC's device tags)", () => {
    const words = [word("2B", 0, 10), word("-", 11, 10), word("1", 17, 10)];
    expect(readHomeruns(words, geometry([[0, 30, 50, 30]]))).toEqual([]);
  });

  it("refuses a leader whose tip touches a BLACK line (a symbol)", () => {
    const geo = geometry([
      ...homerun(100, 100, 200),
      [90, 99, 110, 99], // the symbol's edge the leader points at, black
    ]);
    expect(readHomeruns([word("2B-34", 104, 95)], geo)).toEqual([]);
  });

  it("but not one whose tip lands on a GREY line (weld2's ceiling grid)", () => {
    const geo = geometry([
      ...homerun(100, 100, 200),
      [90, 99, 110, 99, { light: 128 }],
    ]);
    expect(readHomeruns([word("L1-14", 104, 95)], geo)).toHaveLength(1);
  });

  it("refuses a tip inside a word — a switch drawn as a '$' glyph", () => {
    const geo = geometry(homerun(100, 100, 200));
    const words = [word("1S-11", 110, 110), word("$", 98, 99)];
    expect(readHomeruns(words, geo)).toEqual([]);
  });

  it("keeps a tip 2.6 pt short of an unrelated word (E-200's GL-17)", () => {
    const geo = geometry(homerun(100, 100, 200));
    const words = [word("GL-17", 104, 106), word("CTR", 95, 92.7)];
    expect(readHomeruns(words, geo)).toHaveLength(1);
  });

  it("refuses a symbol's wedge with no wire behind it (UNCC's 6-30R)", () => {
    const geo = geometry(head(100, 100));
    expect(readHomeruns([word("2B-36,38", 104, 95)], geo)).toEqual([]);
  });

  it("does not give three heads to a one-circuit tag (GL-22 vs GL-22,24,26)", () => {
    const geo = geometry(homerun(100, 100, 200, 3));
    expect(readHomeruns([word("GL-22", 104, 95)], geo)).toEqual([]);
  });

  it("follows a leader from a tag set away from its arrow", () => {
    const geo = geometry([
      ...homerun(100, 100, 200),
      [140, 125, 101, 125], // leader from the tag to the wire
    ]);
    const words = [word("3LP-(20,22)", 141, 125)];
    expect(readHomeruns(words, geo).map(h => h.tag.text)).toEqual([
      "3LP-(20,22)",
    ]);
  });
});

describe("wire counts are read, never inferred", () => {
  it("says 'wires not marked' with no ticks and no note", () => {
    const geo = geometry(homerun(100, 100, 200, 2));
    const [h] = readHomeruns([word("3LP-23,25", 104, 95)], geo);
    expect(h.wire.wires).toBeNull();
    expect(homerunLabel(h)).toBe("Homerun to 3LP-23,25, wires not marked");
  });

  it("reads both ways Weld 1 writes a wire note", () => {
    for (const note of [
      ["(3)", "#12", "THWN", "CU", "&", "1", "#12", "CU", "GRD"],
      ["(3", "#6", "THWN", "CU", "&", "1", "#10", "CU", "GRD)"],
    ]) {
      const tag = readCircuitTags([word("3LP-(24,26)", 0, 20)])[0];
      const words = note.map((t, i) => word(t, i * 20, 10));
      const w = wireNote(tag, words);
      expect(w).toMatchObject({ wires: 3, grounds: 1, source: "note" });
    }
  });

  it("counts regular ticks across the wire, a longer one as the ground", () => {
    const ticks: Seg[] = [20, 24, 28].map(dy => [96, 109 + dy, 104, 109 + dy]);
    ticks.push([94, 141, 106, 141]); // longer: the ground
    const geo = geometry([...homerun(100, 100, 200), ...ticks]);
    const [arrow] = arrowTips(geo);
    expect(tickCount(arrow, geo)).toMatchObject({
      wires: 3,
      grounds: 1,
      source: "ticks",
    });
  });

  it("does not count a curved wire's own dashes as ticks (E-200 3LP-19,21)", () => {
    // The wire leaves the arrow as a 3 pt stub, then bends: its next dashes
    // cross the stub's line centred, parallel and evenly spaced — exactly
    // like ticks — but they ARE the wire and cross nothing. Read "2 wires"
    // on the real sheet until a tick had to cross a piece of the wire.
    const dashes: Seg[] = [120, 124, 128].map(y => [97, y - 3, 103, y + 3]);
    const geo = geometry([...head(100, 100), [100, 109, 100, 112], ...dashes]);
    const [arrow] = arrowTips(geo);
    expect(tickCount(arrow, geo)).toBeNull();
  });

  it("does not count hatching that crosses the wire off-centre", () => {
    // Parallel, evenly spaced, crossing the wire — but from one side: a
    // tick is drawn centred on its wire.
    const hatch: Seg[] = [130, 134, 138].map(y => [99, y, 109, y]);
    const geo = geometry([...homerun(100, 100, 200), ...hatch]);
    const [arrow] = arrowTips(geo);
    expect(tickCount(arrow, geo)).toBeNull();
  });

  it("does not take hatching or a wall crossing the wire for ticks", () => {
    const geo = geometry([
      ...homerun(100, 100, 200),
      [90, 130, 110, 130], // a wall, 20 pt long: too long to be a tick
      [95, 150, 105, 158], // one stray stroke: ticks come two or more
    ]);
    const [arrow] = arrowTips(geo);
    expect(tickCount(arrow, geo)).toBeNull();
  });
});

describe("tying a homerun to the panel schedule", () => {
  const panel: PanelSchedule = {
    name: "2B",
    existing: true,
    supply: null,
    mains: null,
    mainsAmps: null,
    fedFrom: null,
    connectedKva: null,
    demandKva: null,
    circuits: [
      {
        number: 14,
        breaker: "20/1",
        amps: 20,
        poles: 1,
        wire: "12",
        description: "REC - OFFICE 213",
        loadKva: 0.9,
      },
    ],
    at: { x: 0, y: 0 },
  };
  const tag = readCircuitTags([word("2B-14,16", 0, 10)])[0];

  it("names each circuit's row, and says when one is not on the schedule", () => {
    const tie = tieToSchedule(tag, [panel]);
    expect(tieLines(tie, tag)).toEqual([
      "2B-14: REC - OFFICE 213, 20/1, #12",
      "2B-16: not on panel 2B's schedule",
    ]);
  });

  it("says plainly when the set has no schedule for that panel", () => {
    const other = readCircuitTags([word("3LP-23,25", 0, 10)])[0];
    expect(tieLines(tieToSchedule(other, [panel]), other)).toEqual([
      "Panel 3LP: no schedule read on this set",
    ]);
  });
});
