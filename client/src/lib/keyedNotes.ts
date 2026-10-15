/**
 * KEYED NOTES, read from a vector sheet by code — no AI, nothing saved.
 * (references/plan-reading-help-plan.md § 6 and § 7 step 5a/5b, built to
 * legend-and-notes-automation-plan.md § 7 steps 3–4.)
 *
 * Two readers, both pure, both run in the PDF worker on the page read it
 * already caches for schedules and homeruns (words + line work):
 *
 * 1. THE NOTE LIST (5b). A heading ending in NOTES ("WORK NOTES:", "KEYED
 *    NOTES", "SHEET NOTES", "KEYNOTES", "GENERAL NOTES") with numbered notes
 *    under it. Each printed LINE is its own text piece, so a note is the
 *    number's line plus every line under it, at the same left edge, down to
 *    the next number. The numbers must run 1, 2, 3… in one column: the first
 *    one that is missing ends the list, so a stray number further down the
 *    sheet never joins it.
 *
 * 2. THE TAGS (5a). A number inside a SMALL CLOSED shape — square, hexagon,
 *    circle — drawn in dark line work. Tested by casting eight rays from the
 *    number's centre: every one must hit a dark segment close by, each hit
 *    segment must be short (a table's long border is not a tag's side), and
 *    left and right must be about equal. A circuit number beside a round
 *    device hits it on one side only and fails.
 *
 * A TAG IS ONLY OFFERED IF ITS NUMBER IS IN A KEYED LIST ON THE SHEET. A "7"
 * in a box with no note 7 is a room, a grid bubble or a circuit, and is
 * dropped. General notes are listed but never tagged: they apply to the whole
 * sheet, and a boxed "3" beside a device is not general note 3.
 *
 * ── Measured on Weld 1 E-200 (2026-10-13, scripts/keyedNotesFixture.mts) ───
 * - WORK NOTES 1–18 at x ≈ 1907, text at x ≈ 1934, 9.4 pt type, lines 11 pt
 *   apart and notes 22–45 pt apart. The list's own numbers carry no shape.
 * - Every keyed tag on the plans reads the same: dark sides 6.7 left, 6.8
 *   right, 8.1 down, 5.4 up from the number's centre — a 13.5 pt square (seen at
 *   212% on screen, 2026-10-13).
 * - Circuit numbers 19–26 beside devices hit gray architecture or one side
 *   of a device: the quick rule this replaces found 69 "tags" on the sheet;
 *   any tag above 18 is a fault (the legend plan's red test).
 * - Time, both readers, in node: 4 ms on E-200; 80 ms on the densest sheet
 *   on hand (weld2 p10, 61,746 words, 194,824 segments). Cheap enough to
 *   run on every sheet open, beside the page read it shares.
 * Numbers in the test: ./keyedNotes.test.ts (fixtures from the real pages).
 *
 * Numbers only, not letters, in this first version: a lettered hexagon is
 * usually a FIXTURE TYPE ("A", "B1"), and a lettered general note A would
 * claim every one of them.
 */

/** A word on the page: text, bounds and centre in page points, y down. */
export type NoteWord = {
  text: string;
  x0: number;
  x1: number;
  cx: number;
  cy: number;
  height: number;
};

/** The sheet's line work, as @/lib/vectorGeometry reads it. */
export type NoteGeometry = {
  /** x1, y1, x2, y2 per segment, page points. */
  segs: Float32Array;
  /** 0 (black) … 255 (white). */
  lightness: Uint8Array;
};

export type SheetNote = {
  /** "7", as printed without its dot. */
  label: string;
  /** The note's lines joined, as printed. */
  text: string;
  /** Where its number sits, page points — to take the drawing there. */
  at: { x: number; y: number };
};

export type NoteList = {
  /** "WORK NOTES", as printed, without the colon. */
  heading: string;
  /** Not GENERAL NOTES: its numbers are what a tag on the plan points at. */
  keyed: boolean;
  notes: SheetNote[];
  /** The list's bounds, page points: its own numbers are not tags. */
  box: { x0: number; y0: number; x1: number; y1: number };
};

export type NoteTag = {
  label: string;
  /** The shape's centre and half-size, page points. */
  x: number;
  y: number;
  r: number;
};

export type SheetKeyedNotes = {
  lists: NoteList[];
  /** Only tags whose number is a note in a keyed list on this sheet. */
  tags: NoteTag[];
};

/** What the worker hands back for one page: `scan` = no text to read. */
export type SheetNotesRead = SheetKeyedNotes & { scan: boolean };

// ── 5b: the note list ───────────────────────────────────────────────────────

const HEADING_WORD = /^(KEY)?NOTES?:?$/;
const QUALIFIER = /^[A-Z][A-Z/-]*$/;
const NUMBER = /^(\d{1,2})[.)]?$/;

/** Words on one printed line as `w`: same height, centres within a third. */
function sameLine(a: NoteWord, b: NoteWord): boolean {
  const h = Math.min(a.height, b.height);
  return (
    Math.abs(a.cy - b.cy) <= h * 0.35 &&
    Math.abs(a.height - b.height) <= h * 0.25
  );
}

/**
 * The words sorted top to bottom, so a line or a strip of the sheet is a
 * binary search rather than a pass over every word — a dense sheet holds
 * 60,000 (weld2 p10).
 */
type WordIndex = {
  all: readonly NoteWord[];
  /** Words whose centre is in [y0, y1]. */
  band(y0: number, y1: number): NoteWord[];
  /** Words that are a bare note number, "7" or "7." or "7)". */
  numbers: readonly NoteWord[];
};

function indexWords(words: readonly NoteWord[]): WordIndex {
  const sorted = [...words].sort((a, b) => a.cy - b.cy);
  const first = (y: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].cy < y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return {
    all: words,
    band(y0, y1) {
      const out: NoteWord[] = [];
      for (let i = first(y0); i < sorted.length && sorted[i].cy <= y1; i++)
        out.push(sorted[i]);
      return out;
    },
    numbers: sorted.filter(w => NUMBER.test(w.text)),
  };
}

function lineOf(index: WordIndex, w: NoteWord): NoteWord[] {
  return index
    .band(w.cy - w.height * 0.35, w.cy + w.height * 0.35)
    .filter(o => o === w || sameLine(o, w));
}

/**
 * The heading's words, left to right: "NOTES" and the capitalised words
 * just before it on its line ("KEYED", "WORK", "SHEET").
 */
function headingAt(index: WordIndex, w: NoteWord): NoteWord[] {
  const line = lineOf(index, w)
    .filter(o => o === w || o.x1 <= w.x0 + 0.1)
    .sort((a, b) => b.x0 - a.x0);
  const out = [w];
  let left = w;
  for (const o of line) {
    if (o === w) continue;
    if (left.x0 - o.x1 > w.height * 1.2 || !QUALIFIER.test(o.text)) break;
    out.unshift(o);
    left = o;
  }
  return out;
}

/** The note's text column: the words right of the number on its line. */
function lineFrom(
  index: WordIndex,
  anchor: NoteWord,
  fromX: number
): NoteWord[] {
  const line = lineOf(index, anchor)
    .filter(o => o.x0 >= fromX - 0.1)
    .sort((a, b) => a.x0 - b.x0);
  const out: NoteWord[] = [];
  let right = fromX;
  for (const o of line) {
    // A wide gap is the next column of the sheet, not this note.
    if (out.length && o.x0 - right > anchor.height * 3) break;
    out.push(o);
    right = Math.max(right, o.x1);
  }
  return out;
}

function joinLines(lines: string[]): string {
  let text = "";
  for (const line of lines) {
    if (!text) text = line;
    else if (text.endsWith("-") && !text.endsWith(" -")) text += line;
    else text += ` ${line}`;
  }
  return text;
}

/** Every numbered note list on the sheet. */
export function readNoteLists(words: readonly NoteWord[]): NoteList[] {
  const lists: NoteList[] = [];
  const index = indexWords(words);
  words.forEach(w => {
    if (!HEADING_WORD.test(w.text)) return;
    const heading = headingAt(index, w);
    const hx0 = heading[0].x0;
    const hx1 = w.x1;
    // Note 1: the nearest "1" below the heading, under its left part.
    const firsts = index.numbers
      .filter(
        o =>
          NUMBER.exec(o.text)?.[1] === "1" &&
          o.cy > w.cy &&
          o.cy - w.cy <= Math.max(w.height, o.height) * 6 &&
          o.x0 >= hx0 - o.height * 4 &&
          o.x0 <= hx1
      )
      .sort((a, b) => a.cy - b.cy);
    const first = firsts[0];
    if (!first) return;
    const h = first.height;
    const numbers: NoteWord[] = [first];
    for (let n = 2; n < 100; n++) {
      const prev = numbers[numbers.length - 1];
      const next = index.numbers
        .filter(
          o =>
            NUMBER.exec(o.text)?.[1] === String(n) &&
            o.cy > prev.cy + h * 0.5 &&
            // Right-aligned or left-aligned, the column is the same.
            (Math.abs(o.x1 - prev.x1) <= h * 0.8 ||
              Math.abs(o.x0 - prev.x0) <= h * 0.8) &&
            o.cy - prev.cy <= h * 20
        )
        .sort((a, b) => a.cy - b.cy)[0];
      if (!next) break;
      numbers.push(next);
    }
    const colRight = Math.max(...numbers.map(o => o.x1));
    const notes: SheetNote[] = [];
    let box = {
      x0: Math.min(hx0, ...numbers.map(o => o.x0)),
      y0: Math.min(...heading.map(o => o.cy - o.height / 2)),
      x1: hx1,
      y1: 0,
    };
    numbers.forEach((num, k) => {
      const first = lineFrom(index, num, colRight + 0.5);
      if (!first.length) return;
      const textX = first[0].x0;
      const lines = [first];
      const until = numbers[k + 1]?.cy ?? Infinity;
      // Lines under it at the same left edge, close enough to be this note.
      for (;;) {
        const last = lines[lines.length - 1][0];
        const below = index
          .band(last.cy + h * 0.5, last.cy + h * 1.9)
          .filter(
            o =>
              o.cy > last.cy + h * 0.5 &&
              o.cy < until - h * 0.5 &&
              Math.abs(o.x0 - textX) <= h * 0.8 &&
              Math.abs(o.height - h) <= h * 0.25
          )
          .sort((a, b) => a.cy - b.cy)[0];
        if (!below) break;
        lines.push(lineFrom(index, below, below.x0));
      }
      const all = lines.flat();
      box = {
        x0: box.x0,
        y0: box.y0,
        x1: Math.max(box.x1, ...all.map(o => o.x1)),
        y1: Math.max(box.y1, ...all.map(o => o.cy + o.height / 2)),
      };
      notes.push({
        label: NUMBER.exec(num.text)![1],
        text: joinLines(lines.map(l => l.map(o => o.text).join(" "))),
        at: { x: num.cx, y: num.cy },
      });
    });
    if (!notes.length) return;
    const name = heading.map(o => o.text.replace(/:$/, "")).join(" ");
    lists.push({
      heading: name,
      keyed: !/^GENERAL\b/.test(name),
      notes,
      box,
    });
  });
  return lists;
}

// ── 5a: the tags ────────────────────────────────────────────────────────────

/** Line work this dark or darker is drawn work; the gray is architecture. */
const DARK = 100;
/** A ray must hit within this many glyph heights. Measured hits: 0.57–0.86. */
const REACH = 1.6;
/** Each side's ends lie within this many glyph heights: a SMALL shape. */
const SIDE_REACH = 2.4;
/** Left and right may differ by this factor; up and down by the second. */
const ACROSS_RATIO = 1.6;
const UPDOWN_RATIO = 2.2;
const RAYS: [number, number][] = [0, 1, 2, 3, 4, 5, 6, 7].map(k => [
  Math.cos((k * Math.PI) / 4),
  Math.sin((k * Math.PI) / 4),
]);

/** Dark segments bucketed by a coarse grid, so each ray reads a few. */
function darkIndex(geo: NoteGeometry, cell: number) {
  const buckets = new Map<string, number[]>();
  const s = geo.segs;
  const n = s.length / 4;
  for (let i = 0; i < n; i++) {
    if (geo.lightness[i] > DARK) continue;
    const gx0 = Math.floor(Math.min(s[i * 4], s[i * 4 + 2]) / cell);
    const gx1 = Math.floor(Math.max(s[i * 4], s[i * 4 + 2]) / cell);
    const gy0 = Math.floor(Math.min(s[i * 4 + 1], s[i * 4 + 3]) / cell);
    const gy1 = Math.floor(Math.max(s[i * 4 + 1], s[i * 4 + 3]) / cell);
    // A long line spans many cells and can never be a tag's side. Skipping
    // it here is for SPEED only — the side-reach filter in findTagShapes is
    // what refuses it, and the tests go red on that, not on this.
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 4) continue;
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gy = gy0; gy <= gy1; gy++) {
        const key = `${gx}:${gy}`;
        const list = buckets.get(key);
        if (list) list.push(i);
        else buckets.set(key, [i]);
      }
  }
  return (x: number, y: number, reach: number): number[] => {
    const out = new Set<number>();
    for (
      let gx = Math.floor((x - reach) / cell);
      gx <= Math.floor((x + reach) / cell);
      gx++
    )
      for (
        let gy = Math.floor((y - reach) / cell);
        gy <= Math.floor((y + reach) / cell);
        gy++
      )
        for (const i of buckets.get(`${gx}:${gy}`) ?? []) out.add(i);
    return Array.from(out);
  };
}

/**
 * Every number on the sheet sitting inside a small closed dark shape — the
 * closed-square test. Not yet checked against any note list.
 */
export function findTagShapes(
  words: readonly NoteWord[],
  geo: NoteGeometry
): NoteTag[] {
  const candidates = words.filter(w => /^\d{1,2}$/.test(w.text));
  if (!candidates.length) return [];
  const maxH = Math.max(...candidates.map(w => w.height));
  const near = darkIndex(geo, Math.max(8, maxH * SIDE_REACH));
  const s = geo.segs;
  const tags: NoteTag[] = [];
  for (const w of candidates) {
    const reach = w.height * REACH;
    const sideReach = w.height * SIDE_REACH;
    const segs = near(w.cx, w.cy, sideReach).filter(i => {
      for (const k of [0, 2]) {
        const ex = s[i * 4 + k] - w.cx;
        const ey = s[i * 4 + k + 1] - w.cy;
        if (Math.hypot(ex, ey) > sideReach) return false;
      }
      return true;
    });
    const hits: number[] = [];
    for (const [dx, dy] of RAYS) {
      let best = Infinity;
      for (const i of segs) {
        const x1 = s[i * 4];
        const y1 = s[i * 4 + 1];
        const ex = s[i * 4 + 2] - x1;
        const ey = s[i * 4 + 3] - y1;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((x1 - w.cx) * ey - (y1 - w.cy) * ex) / den;
        const u = ((x1 - w.cx) * dy - (y1 - w.cy) * dx) / den;
        if (t > 0 && t < best && u >= -1e-6 && u <= 1 + 1e-6) best = t;
      }
      if (best > reach) break;
      hits.push(best);
    }
    if (hits.length < RAYS.length) continue;
    const [right, , down, , left, , up] = hits;
    // The shape clears the number itself.
    if (Math.min(left, right) < (w.x1 - w.x0) / 2 - 0.5) continue;
    if (Math.max(left, right) / Math.min(left, right) > ACROSS_RATIO) continue;
    if (Math.max(up, down) / Math.min(up, down) > UPDOWN_RATIO) continue;
    tags.push({
      label: w.text,
      x: w.cx + (right - left) / 2,
      y: w.cy + (down - up) / 2,
      r: Math.max(...hits),
    });
  }
  return tags;
}

/** The sheet's note lists and the tags that point at them. */
export function readKeyedNotes(
  words: readonly NoteWord[],
  geo: NoteGeometry
): SheetKeyedNotes {
  const lists = readNoteLists(words);
  const keyed = lists.filter(l => l.keyed);
  if (!keyed.length) return { lists, tags: [] };
  const labels = new Set(keyed.flatMap(l => l.notes.map(n => n.label)));
  const inList = (t: NoteTag) =>
    lists.some(
      l =>
        t.x >= l.box.x0 && t.x <= l.box.x1 && t.y >= l.box.y0 && t.y <= l.box.y1
    );
  const tags = findTagShapes(words, geo).filter(
    t => labels.has(t.label) && !inList(t)
  );
  return { lists, tags };
}
