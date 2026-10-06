/**
 * Find all matching on a SCAN (@/lib/scanMatching): the two promises that
 * do not need opencv to check, both of which would be silent wrong counts
 * if they broke —
 *
 *  - "TOO POOR TO MATCH": a symbol too coarse on the scan is refused, with
 *    its size in pixels, BEFORE anything is rendered or opencv.js is
 *    fetched. Measured (scanned-plans-plan.md § 2): at 50 dpi the switch
 *    matched its 6 and 33 false ones besides.
 *  - THE DEMOLITION SPLIT: on Old Blueridge E1.02 the demolition plan
 *    under the new one holds 37 receptacles drawn exactly like the 11 he
 *    counted. Only the plan the box is on is searched, and a find on a
 *    demolition plan is never "clear".
 *
 * The plan titles are read from the REAL text layers of E1.01 and E1.02
 * (fixture: the OCR layer, raw, as the worker hands it to wordBoxes), and
 * the points are the owner's own hand marks and the whole-sheet finds of
 * 2026-10-01.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { wordBoxes, type PageTextLayer } from "./textSelection";
import {
  DEMOLITION_REASON,
  SCAN_UNREAD_REASON,
  WEAK_REASON,
  SCAN_COARSE_PIXELS,
  SCAN_MIN_PIXELS,
  findOnScan,
  planRegions,
  planTitles,
  regionAt,
  scanMatches,
  scanQuality,
  searchArea,
  type InkMap,
  type ScanPeak,
} from "./scanMatching";
import {
  applyAiAnswers,
  clearOpen,
  itemKind,
  matchItems as matchItemsTrusting,
  summary,
} from "./findMatchingSession";

// No saved looks in these finds, so which looks are trusted cannot matter.
const matchItems = (
  matches: Parameters<typeof matchItemsTrusting>[0],
  marks: Parameters<typeof matchItemsTrusting>[1]
) => matchItemsTrusting(matches, marks, new Set());

type FixturePage = { width: number; height: number; layer: PageTextLayer };
const fixture = JSON.parse(
  readFileSync(
    path.join(__dirname, "__fixtures__", "blueridge-scan-text.json"),
    "utf8"
  )
) as { pages: Record<string, FixturePage> };
const page = (n: 3 | 4) => {
  const p = fixture.pages[n];
  return { ...p, words: wordBoxes(p.layer) };
};

/** The switch box a person drags on E1.01 (scanned-plans-plan.md § 2). */
const SWITCH = { x: 0, y: 0, width: 14, height: 22 };
const dpi = (n: number) => n / 72;

describe("too poor to match", () => {
  it("refuses a symbol under SCAN_MIN_PIXELS, saying its size", () => {
    // 14 pt at 50 dpi is 9.7 pixels: where the switch broke.
    const q = scanQuality(SWITCH, dpi(50));
    expect(q.kind).toBe("tooPoor");
    expect(q.pixels).toBe(10);
    expect(q.kind === "tooPoor" && q.message).toBe(
      "This symbol is 10 pixels across on this scan — too coarse to match. Count it by hand."
    );
  });

  it("matches but flags every find between the two limits", () => {
    // 14 pt at 100 dpi is 19 pixels: it held, but only just.
    const q = scanQuality(SWITCH, dpi(100));
    expect(q).toMatchObject({ kind: "coarse", pixels: 19 });
    expect(19).toBeGreaterThanOrEqual(SCAN_MIN_PIXELS);
    expect(19).toBeLessThan(SCAN_COARSE_PIXELS);
  });

  it("matches plainly at the scan's real 300 dpi", () => {
    expect(scanQuality(SWITCH, dpi(300))).toEqual({ kind: "ok", pixels: 58 });
  });

  it("measures the SHORT side, so a long thin symbol is judged by its width", () => {
    expect(
      scanQuality({ x: 0, y: 0, width: 60, height: 10 }, dpi(100)).kind
    ).toBe("tooPoor");
  });

  it("an unknown resolution is matched with every find flagged, never as clear", () => {
    expect(scanQuality(SWITCH, 0).kind).toBe("coarse");
  });

  it("refuses before rendering anything or fetching opencv.js", async () => {
    let rendered = 0;
    let loaded = 0;
    const p = page(3);
    const r = await findOnScan({
      box: SWITCH,
      pixelsPerPoint: dpi(50),
      words: p.words,
      pageWidth: p.width,
      pageHeight: p.height,
      render: async () => {
        rendered++;
        throw new Error("must not render");
      },
      loadCv: async () => {
        loaded++;
        throw new Error("must not load opencv");
      },
    });
    expect(r).toEqual({
      kind: "tooPoor",
      message:
        "This symbol is 10 pixels across on this scan — too coarse to match. Count it by hand.",
    });
    expect(rendered).toBe(0);
    expect(loaded).toBe(0);
  });

  it("a coarse symbol's finds all need a look, so Confirm all takes none", () => {
    const quality = scanQuality(SWITCH, dpi(100));
    const matches = scanMatches([peak(100, 100, 0.95), peak(200, 100, 0.9)], {
      box: SWITCH,
      quality,
      plan: null,
      regions: [],
    });
    const items = matchItems(matches, []);
    expect(items.every(i => itemKind(i) === "needsLook")).toBe(true);
    expect(clearOpen(items)).toEqual([]);
  });
});

function peak(x: number, y: number, score = 0.9): ScanPeak {
  return {
    x,
    y,
    halfWidth: 10,
    halfHeight: 10,
    score,
    size: 1,
    rotation: 0,
  };
}

describe("which plan — titles from a scan's text layer", () => {
  it("reads both plan titles on E1.01, and which one is the demolition plan", () => {
    const titles = planTitles(page(3).words);
    expect(titles.map(t => [t.text, t.demolition])).toEqual([
      ["MAIN FLOOR - LIGHTING PLAN", false],
      ["MAIN FLOOR - DEMOLITION LIGHTING PLAN", true],
    ]);
  });

  it("reads both on E1.02, and not the notes' DEMOLISH or the title block's PLANS", () => {
    const titles = planTitles(page(4).words);
    expect(titles.map(t => [t.text, t.demolition])).toEqual([
      ["MAIN FLOOR - POWER PLAN", false],
      ["MAIN FLOOR - DEMOLITION POWER PLAN", true],
    ]);
  });
});

/*
  On E1.02 the hand marks (his 11 receptacles and 2 timer switches) are on
  the power plan, and the 37 copies the whole-sheet search found on the
  demolition plan are below it. Three of each, from the 2026-10-01 run.
*/
const HIS_RECEPTACLES: [number, number][] = [
  [878.9, 134.1], // GFCI
  [969.5, 265.5], // duplex
  [1294.7, 646.7], // duplex
];
const DEMOLITION_COPIES: [number, number][] = [
  [1141, 1298.4],
  [1239.8, 1244.6],
  [1070.9, 1537.9],
];
const RECEPTACLE_BOX = (x: number, y: number) => ({
  x: x - 10,
  y: y - 10,
  width: 20,
  height: 20,
});

describe("the demolition split, E1.02", () => {
  const p = page(4);
  const regions = planRegions(planTitles(p.words), p.width, p.height);

  it("puts his receptacles on the power plan and the removed ones on the demolition plan", () => {
    for (const [x, y] of HIS_RECEPTACLES)
      expect(regionAt(regions, x, y)?.title).toBe("MAIN FLOOR - POWER PLAN");
    for (const [x, y] of DEMOLITION_COPIES)
      expect(regionAt(regions, x, y)).toMatchObject({
        title: "MAIN FLOOR - DEMOLITION POWER PLAN",
        demolition: true,
      });
  });

  it("searches only the plan the box is on", () => {
    const [x, y] = HIS_RECEPTACLES[0];
    const area = searchArea(regions, RECEPTACLE_BOX(x, y), p.width, p.height);
    expect(area.plan?.title).toBe("MAIN FLOOR - POWER PLAN");
    for (const [dx, dy] of DEMOLITION_COPIES)
      expect(dy > area.y + area.height || dx > area.x + area.width).toBe(true);
  });

  it("drops a find that strays into the demolition plan from a new-plan search", () => {
    const [x, y] = HIS_RECEPTACLES[0];
    const box = RECEPTACLE_BOX(x, y);
    const plan = searchArea(regions, box, p.width, p.height).plan;
    const matches = scanMatches(
      [
        ...HIS_RECEPTACLES.map(([a, b]) => peak(a, b)),
        ...DEMOLITION_COPIES.map(([a, b]) => peak(a, b)),
      ],
      { box, quality: { kind: "ok", pixels: 83 }, plan, regions }
    );
    expect(matches.map(m => [m.x, m.y])).toEqual(HIS_RECEPTACLES);
    expect(matches.every(m => m.onDemolitionPlan === null)).toBe(true);
  });

  it("boxed on the demolition plan, every find says so and Confirm all counts none", () => {
    const [x, y] = DEMOLITION_COPIES[0];
    const box = RECEPTACLE_BOX(x, y);
    const plan = searchArea(regions, box, p.width, p.height).plan;
    expect(plan?.demolition).toBe(true);
    const matches = scanMatches(
      DEMOLITION_COPIES.map(([a, b]) => peak(a, b)),
      { box, quality: { kind: "ok", pixels: 83 }, plan, regions }
    );
    expect(matches).toHaveLength(3);
    expect(new Set(matches.map(m => m.onDemolitionPlan))).toEqual(
      new Set(["MAIN FLOOR - DEMOLITION POWER PLAN"])
    );
    const items = matchItems(matches, []);
    expect(items.map(itemKind)).toEqual([
      "demolition",
      "demolition",
      "demolition",
    ]);
    expect(clearOpen(items)).toEqual([]);
    expect(summary(items).demolition).toBe(3);
    expect(DEMOLITION_REASON("MAIN FLOOR - DEMOLITION POWER PLAN")).toBe(
      "On the demolition plan (MAIN FLOOR - DEMOLITION POWER PLAN) — not counted unless you count it."
    );
  });

  it("a box on no titled plan searches the whole sheet and flags what is off every plan", () => {
    // The title block, below every plan title.
    const box = RECEPTACLE_BOX(2300, 1700);
    const area = searchArea(regions, box, p.width, p.height);
    expect(area.plan).toBeNull();
    expect(area.width).toBe(p.width);
    const matches = scanMatches(
      [peak(2300, 1700), ...DEMOLITION_COPIES.map(([a, b]) => peak(a, b))],
      {
        box,
        quality: { kind: "ok", pixels: 83 },
        plan: null,
        regions,
      }
    );
    const items = matchItems(matches, []);
    expect(items.map(itemKind)).toEqual([
      "needsLook", // in the title block, on no plan
      "demolition",
      "demolition",
      "demolition",
    ]);
  });
});

describe("a plan ends at the white before the notes column", () => {
  it("trims a region at the first inch of empty columns right of its title", () => {
    // A 400 x 200 pt page in 4 pt cells: drawing from x 0–200, notes 320–400.
    const cell = 4;
    const cols = 100;
    const rows = 50;
    const data = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 50; c++) data[r * cols + c] = 1;
      for (let c = 80; c < 100; c++) data[r * cols + c] = 1;
    }
    const ink: InkMap = { cell, cols, rows, data };
    const titles = [
      {
        text: "FLOOR PLAN",
        x0: 10,
        y0: 180,
        x1: 60,
        y1: 190,
        height: 10,
        demolition: false,
      },
    ];
    const [plain] = planRegions(titles, 400, 200);
    const [trimmed] = planRegions(titles, 400, 200, ink);
    expect(plain.x1).toBe(400);
    expect(trimmed.x1).toBeGreaterThanOrEqual(200);
    expect(trimmed.x1).toBeLessThan(320);
  });
});

describe("Confirm all on a scan", () => {
  const p = page(4);
  const regions = planRegions(planTitles(p.words), p.width, p.height);
  const [x, y] = HIS_RECEPTACLES[0];
  const box = RECEPTACLE_BOX(x, y);
  const plan = searchArea(regions, box, p.width, p.height).plan;
  // His three, and an existing one ("E" beside it) drawn exactly the same.
  const peaks = [...HIS_RECEPTACLES, [970.7, 113.8] as [number, number]].map(
    ([a, b]) => peak(a, b, 0.95)
  );
  const quality = { kind: "ok" as const, pixels: 83 };

  it("takes nothing until the words beside each find are read", () => {
    const items = matchItems(
      scanMatches(peaks, { box, quality, plan, regions }),
      []
    );
    expect(items.every(i => i.needsLook.includes(SCAN_UNREAD_REASON))).toBe(
      true
    );
    expect(clearOpen(items)).toEqual([]);
  });

  it("the AI's answers make his clear and the existing one not", () => {
    const items = matchItems(
      scanMatches(peaks, { box, quality, plan, regions }),
      []
    );
    const answered = applyAiAnswers(
      items,
      new Map([
        [0, "same" as const],
        [1, "same" as const],
        [2, "same" as const],
        [3, "existing" as const],
      ])
    );
    expect(clearOpen(answered).map(i => [i.x, i.y])).toEqual(HIS_RECEPTACLES);
    expect(itemKind(answered[3])).toBe("maybeExisting");
  });

  it("flags a weaker likeness: the halves of 2x4s the 2x2 matched scored 0.71–0.80", () => {
    // Best first, as one-per-spot keeps them.
    const [exact, weak] = scanMatches(
      [peak(1100, 300, 0.8), peak(1300, 300, 0.87)],
      {
        box,
        quality,
        plan,
        regions,
      }
    );
    expect(weak.needsLook).toContain(WEAK_REASON(0.8));
    expect(exact.needsLook).toEqual([SCAN_UNREAD_REASON]);
  });
});
