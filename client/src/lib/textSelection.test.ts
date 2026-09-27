/**
 * The "Select text" tool's arithmetic: which words a dragged box picks, and in
 * what order they come out.
 *
 * The viewport transforms are pdf.js's own, read off a real 2592x1728 sheet
 * (`page.getViewport({ scale: 1, rotation })`) on 2026-09-27, and the text
 * matrices are shaped like items from the same sheet — a level note
 * `[8.52, 0, 0, 8.52, x, y]` and a sideways one `[0, 8.52, -8.52, 0, x, y]`.
 * Hand-made transforms would test the arithmetic against the author's idea of
 * pdf.js rather than against pdf.js.
 *
 * The page is deliberately NOT the viewport's shape and not square, so a
 * rotation that swapped the axes wrongly cannot land on the right answer by
 * symmetry (CLAUDE.md § "A test fixture shaped like its container").
 */
import { describe, expect, it } from "vitest";
import {
  hasText,
  wordBoxes,
  wordsInBox,
  wordsToText,
  type PageTextLayer,
  type RawTextItem,
} from "./textSelection";

const H = 1728;
const W = 2592;
const VIEWPORT = {
  0: [1, 0, 0, -1, 0, H],
  90: [0, 1, 1, 0, 0, 0],
  180: [-1, 0, 0, 1, W, 0],
  270: [0, -1, -1, 0, H, W],
} as const;

const SIZE = 8.52;
/** Level text starting at (x, y) in PDF space, ~0.55 em per character. */
const level = (str: string, x: number, y: number): RawTextItem => ({
  str,
  transform: [SIZE, 0, 0, SIZE, x, y],
  width: str.length * SIZE * 0.55,
});
/** Text reading UP the page in PDF space, as on the real sheet. */
const upward = (str: string, x: number, y: number): RawTextItem => ({
  str,
  transform: [0, SIZE, -SIZE, 0, x, y],
  width: str.length * SIZE * 0.55,
});

const layer = (
  items: RawTextItem[],
  rotation: keyof typeof VIEWPORT = 0
): PageTextLayer => ({ items, viewportTransform: [...VIEWPORT[rotation]] });

/** A box around the displayed page area where a word should be. */
const around = (x: number, y: number, w: number, h: number) => ({
  x,
  y,
  width: w,
  height: h,
});

describe("where a word is drawn", () => {
  it("puts level text below the baseline flip, where the eye sees it", () => {
    const [word] = wordBoxes(layer([level("RTU-2", 100, 1000)]));
    // PDF y 1000 on a 1728 page is displayed 728 from the top; the glyphs
    // stand ABOVE the baseline, so the box spans 728 - 8.52 .. 728.
    expect(word.x0).toBeCloseTo(100);
    expect(word.y1).toBeCloseTo(728);
    expect(word.y0).toBeCloseTo(728 - SIZE);
    expect(word.dx).toBeCloseTo(1);
    expect(word.dy).toBeCloseTo(0);
  });

  it("splits an item into words at their share of its width", () => {
    const words = wordBoxes(layer([level("PROVIDE 20A CKT", 0, 1000)]));
    expect(words.map(w => w.text)).toEqual(["PROVIDE", "20A", "CKT"]);
    const [provide, amps] = words;
    expect(amps.x0).toBeGreaterThan(provide.x1);
  });

  it("reads sideways text as running UP the displayed page", () => {
    const [word] = wordBoxes(layer([upward("EXTERIOR", 1435.76, 325.64)]));
    expect(word.dx).toBeCloseTo(0);
    expect(word.dy).toBeCloseTo(-1);
    // Tall and thin on screen, not wide and flat.
    expect(word.y1 - word.y0).toBeGreaterThan(word.x1 - word.x0);
  });

  it("follows the page's own rotation — a level note on a /Rotate 90 sheet runs down", () => {
    const [word] = wordBoxes(layer([level("PANEL", 100, 1000)], 90));
    expect(word.dx).toBeCloseTo(0);
    expect(word.dy).toBeCloseTo(1);
    // (x, y) = (100, 1000) in PDF space is displayed at (1000, 100).
    expect(word.cx).toBeGreaterThan(990);
    expect(word.cx).toBeLessThan(1010);
  });
});

describe("what a box picks", () => {
  const page = layer([
    level("PROVIDE 20A CKT TO RTU-2", 100, 1000),
    level("SEE E4.01", 100, 985),
  ]);
  const words = wordBoxes(page);
  const byText = (t: string) => words.find(w => w.text === t)!;

  it("picks only the words whose middle is inside, never half a word", () => {
    const rtu = byText("RTU-2");
    // A box clipping the left third of RTU-2 and all of TO.
    const box = around(
      byText("TO").x0 - 1,
      rtu.y0 - 1,
      byText("TO").x1 - byText("TO").x0 + 1 + (rtu.x1 - rtu.x0) / 3,
      rtu.y1 - rtu.y0 + 2
    );
    expect(wordsInBox(words, box).map(w => w.text)).toEqual(["TO"]);
  });

  it("takes a box dragged right-to-left or bottom-to-top the same", () => {
    const rtu = byText("RTU-2");
    const forward = around(rtu.x0 - 1, rtu.y0 - 1, rtu.x1 - rtu.x0 + 2, 20);
    const backward = around(
      forward.x + forward.width,
      forward.y + forward.height,
      -forward.width,
      -forward.height
    );
    expect(wordsInBox(words, backward)).toEqual(wordsInBox(words, forward));
  });

  it("reads two lines top line first, words left to right", () => {
    const text = wordsToText(
      wordsInBox(words, around(0, 0, 2592, 1728)).reverse()
    );
    expect(text).toBe("PROVIDE 20A CKT TO RTU-2\nSEE E4.01");
  });
});

describe("turning picked words into text", () => {
  it("joins two items that touch into one word, and spaces ones that do not", () => {
    // A drawing program often splits a part number into two items.
    const split = [
      level("QO1", 100, 1000),
      level("20", 100 + 3 * SIZE * 0.55, 1000),
      level("AFCI", 300, 1000),
    ];
    const words = wordBoxes(layer(split));
    expect(wordsToText(words)).toBe("QO120 AFCI");
  });

  it("reads upward text with its first line on the LEFT, as the reader turns the page", () => {
    // Two lines of sideways text: the one further along +x in PDF space is
    // displayed further right, and is the SECOND line when read.
    const words = wordBoxes(
      layer([upward("FIRST LINE", 500, 300), upward("SECOND", 500 + 12, 300)])
    );
    expect(wordsToText(words)).toBe("FIRST LINE\nSECOND");
  });

  it("puts level text before sideways text when a box holds both", () => {
    const words = wordBoxes(
      layer([upward("WALL", 900, 300), level("NOTE 3", 100, 1000)])
    );
    expect(wordsToText(words)).toBe("NOTE 3\nWALL");
  });
});

describe("a scanned sheet", () => {
  it("has no text when every item is blank or there are none", () => {
    expect(hasText(layer([]))).toBe(false);
    expect(hasText(layer([level("   ", 0, 0)]))).toBe(false);
    expect(hasText(layer([level("E1", 0, 0)]))).toBe(true);
  });
});
