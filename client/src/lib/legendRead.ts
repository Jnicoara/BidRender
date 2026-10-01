/**
 * Read a whole legend out of a box: each symbol's NAME from the PDF's own
 * text, and WHERE its picture is — the drawing just left of that name.
 * "Capture whole legend" on the takeoff screen. No AI: text and ink only.
 *
 * Here rather than in the component because vitest reaches `client/src/lib`
 * and cannot reach a React component. Everything that decides which rows a
 * legend has, what each is called and where its symbol sits is in this file,
 * tested against a real legend (Weld 1 E-001) in legendRead.test.ts.
 *
 * ── How a row is found ───────────────────────────────────────────────────────
 * 1. LINES. Level words in the box are grouped into lines: same height on the
 *    page, and no gap wider than a word space allows. A wide gap splits a row
 *    into its parts — "S   SINGLE POLE SWITCH" is two lines, a symbol label
 *    and a name — and splits a two-column legend into its two columns.
 * 2. LABELS. A short line with another line starting just to its right is a
 *    label inside a symbol ("S", "OC") or an abbreviation ("TYP"), not a name.
 * 3. ENTRIES. A remaining line starts an entry when there is DRAWING in the
 *    strip just left of it — ink that is not text. An abbreviation row
 *    ("TYP  TYPICAL") has only text there, so it is left out. A line tucked
 *    directly under an entry's text, at the same left edge, continues that
 *    entry's name instead.
 * 4. THE PICTURE is that strip, bounded by the other column's text on the
 *    left and by the neighbouring entries above and below, then tightened to
 *    the ink inside it.
 *
 * ── Names that line up with a library ────────────────────────────────────────
 * A legend's words are often a paragraph ("CONVENIENCE RECEPTACLE, 120V, NEMA
 * 5-20R DUPLEX. MOUNT 18" AFF …"). Each entry is matched to the user's
 * assembly names: an EXACT name (case and punctuation ignored) first, else
 * the most specific assembly whose every word appears in the entry's text.
 * A matched entry is named exactly like the assembly — so a capture and the
 * count made from that assembly carry one name, which is what the reader-
 * accuracy test pairs on. An unmatched entry keeps the words as read and
 * starts UNticked, for the user to name or skip.
 */
import { symbolLookupKey } from "@shared/takeoffCounts";
import { type PageTextLayer, type WordBox, wordBoxes } from "./textSelection";

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The ink inside `rect`, ignoring anything under `exclude` (the text), as a
 * tight bounding box — or null when there is none. The caller owns the
 * pixels: the app samples a render of the box, the test a stored ink map.
 */
export type InkBounds = (rect: Rect, exclude: Rect[]) => Rect | null;

export type LegendRow = {
  /** The legend's words for this entry, as read. */
  read: string;
  /** The name to save — the library's spelling when one matched. */
  name: string;
  /** How the name was decided. */
  match: "exact" | "words" | "none";
  /** Where the symbol's picture is, in page points. */
  symbol: Rect;
  /** A symbol with this name is already captured: never saved over. */
  alreadyCaptured: boolean;
  /** Ticked to start with. */
  ticked: boolean;
};

export type LegendReading =
  | {
      kind: "rows";
      rows: LegendRow[];
      /**
       * Fewer than half the rows read as a library name. On a legend whose
       * text is a scan's OCR — words missing, letters wrong — this is what
       * happens, and the screen says so and points to single Capture rather
       * than presenting a list of garbled names as a reading.
       */
      mostlyUnread: boolean;
    }
  /** The box holds no readable text — a scanned legend. */
  | { kind: "no-text" }
  /** Text, but nothing that reads as a symbol and its name. */
  | { kind: "no-rows" };

/** How far left of a name a symbol may sit, in points (about 1.4 in). */
export const SYMBOL_REACH = 100;

type Line = {
  words: WordBox[];
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cy: number;
  h: number;
};

function makeLine(words: WordBox[]): Line {
  const x0 = Math.min(...words.map(w => w.x0));
  const x1 = Math.max(...words.map(w => w.x1));
  const y0 = Math.min(...words.map(w => w.y0));
  const y1 = Math.max(...words.map(w => w.y1));
  const h = Math.max(...words.map(w => w.height));
  return {
    words,
    text: words.map(w => w.text).join(" "),
    x0,
    x1,
    y0,
    y1,
    cy: (y0 + y1) / 2,
    h,
  };
}

function rectOf(l: { x0: number; y0: number; x1: number; y1: number }): Rect {
  return { x: l.x0, y: l.y0, width: l.x1 - l.x0, height: l.y1 - l.y0 };
}

function normalise(box: Rect): Rect {
  return {
    x: Math.min(box.x, box.x + box.width),
    y: Math.min(box.y, box.y + box.height),
    width: Math.abs(box.width),
    height: Math.abs(box.height),
  };
}

/** Group level words into lines: same row, word-sized gaps only. */
export function legendLines(words: WordBox[]): Line[] {
  const level = words
    .filter(w => Math.abs(w.dy) < 0.2 && w.dx > 0)
    .sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  const open: WordBox[][] = [];
  for (const w of level) {
    const line = open.find(ws => {
      const last = ws[ws.length - 1];
      const h = Math.max(last.height, w.height);
      return (
        Math.abs(last.cy - w.cy) < h * 0.5 &&
        w.x0 >= last.x0 &&
        w.x0 - last.x1 <= h * 1.2
      );
    });
    if (line) line.push(w);
    else open.push([w]);
  }
  return open.map(makeLine).sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
}

function overlapsBand(l: Line, top: number, bottom: number): boolean {
  return l.y1 > top && l.y0 < bottom;
}

/** Lower-case alphanumeric words — punctuation and hyphens split. */
export function nameTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * The library name an entry's text stands for, or null.
 *
 * Exact (same words in the same order) wins. Otherwise the assembly whose
 * every word is in the text, with the most words — so "DUPLEX RECEPTACLE ON
 * EMERGENCY CIRCUIT" beats "DUPLEX RECEPTACLE" for a row that says both.
 */
export function matchLibraryName(
  read: string,
  library: readonly string[]
): { name: string; match: "exact" | "words" } | null {
  const readTokens = nameTokens(read);
  const readKey = readTokens.join(" ");
  const exact = library.find(n => nameTokens(n).join(" ") === readKey);
  if (exact) return { name: exact, match: "exact" };

  const have = new Set(readTokens);
  // Ties on word count go to the name that reads like the legend: its words
  // in the legend's order (2), and from the legend's first word (+1). Without
  // this, Weld's "SWITCH, SINGLE POLE" took UNCC's "SINGLE POLE SWITCH - 20A"
  // row from UNCC's own "SINGLE POLE SWITCH" — same three words.
  const order = (tokens: string[]): number => {
    let at = -1;
    for (const t of tokens) {
      const next = readTokens.indexOf(t, at + 1);
      if (next < 0) return 0;
      at = next;
    }
    return readTokens[0] === tokens[0] ? 3 : 2;
  };
  let best: { name: string; size: number; order: number } | null = null;
  for (const name of library) {
    const tokens = nameTokens(name);
    if (tokens.length === 0 || !tokens.every(t => have.has(t))) continue;
    const o = order(tokens);
    if (
      !best ||
      tokens.length > best.size ||
      (tokens.length === best.size && o > best.order) ||
      (tokens.length === best.size &&
        o === best.order &&
        name.length > best.name.length)
    ) {
      best = { name, size: tokens.length, order: o };
    }
  }
  return best ? { name: best.name, match: "words" } : null;
}

export function readLegend(opts: {
  layer: PageTextLayer;
  box: Rect;
  ink: InkBounds;
  /** Is there a ruled line inside this rect? (`ruleFrom` in legendInkMap.) */
  rule: (rect: Rect) => boolean;
  /** The user's assembly names. */
  library: readonly string[];
  /** Names already captured, compared the way the app keys them. */
  captured: readonly string[];
}): LegendReading {
  const box = normalise(opts.box);
  const inBox = wordBoxes(opts.layer).filter(
    w =>
      w.cx >= box.x &&
      w.cx <= box.x + box.width &&
      w.cy >= box.y &&
      w.cy <= box.y + box.height
  );
  if (inBox.length === 0) return { kind: "no-text" };

  const lines = legendLines(inBox);
  const textRects = lines.map(rectOf);

  // 2. Labels: short, with a line starting just to their right on the row.
  const isLabel = (l: Line) =>
    l.x1 - l.x0 < SYMBOL_REACH * 0.8 &&
    lines.some(
      r =>
        r !== l &&
        Math.abs(r.cy - l.cy) < Math.max(r.h, l.h) &&
        r.x0 > l.x1 &&
        r.x0 - l.x1 < SYMBOL_REACH
    );

  /** The strip just left of a line, bounded by other columns' text. */
  const stripLeftOf = (l: Line, top: number, bottom: number): Rect | null => {
    const right = l.x0 - l.h * 0.3;
    let left = Math.max(box.x, l.x0 - SYMBOL_REACH);
    for (const o of lines) {
      if (o === l || !overlapsBand(o, top, bottom)) continue;
      // Another column's text: it starts further left than the strip does.
      if (o.x1 < right && o.x0 < l.x0 - SYMBOL_REACH) {
        left = Math.max(left, o.x1 + l.h * 0.3);
      }
    }
    return right - left > 1
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : null;
  };

  /** Text standing inside a strip: a symbol drawn as letters ("S", "$", "OC"). */
  const textIn = (strip: Rect) =>
    lines.filter(
      o =>
        o.x0 >= strip.x - 0.5 &&
        o.x1 <= strip.x + strip.width + 0.5 &&
        o.cy >= strip.y &&
        o.cy <= strip.y + strip.height
    );

  // 3. Entries, column by column, top to bottom. A name has at least three
  // letters: a lone "S" or a superscript "a" is part of a symbol.
  type Entry = { lines: Line[]; drawn: boolean };
  const entries: Entry[] = [];
  const letters = (s: string) => (s.match(/[a-z]/gi) ?? []).length;
  const candidates = lines
    .filter(l => !isLabel(l) && letters(l.text) >= 3)
    .sort((a, b) => a.x0 - b.x0 || a.cy - b.cy);
  const byColumn = new Map<number, Line[]>();
  for (const l of candidates) {
    const key = Array.from(byColumn.keys()).find(
      x => Math.abs(x - l.x0) < l.h * 1.5
    );
    const list = byColumn.get(key ?? l.x0) ?? [];
    list.push(l);
    byColumn.set(key ?? l.x0, list);
  }
  for (const column of Array.from(byColumn.values())) {
    column.sort((a, b) => a.cy - b.cy);
    let current: Entry | null = null;
    for (const l of column) {
      const prev = current?.lines[current.lines.length - 1];
      // Tucked under the entry's text — a line's worth of gap or less — the
      // name goes on. Measured as the GAP, not the pitch: the pitch rule
      // joined four exit-sign rows into one on Weld 1.
      // And no table rule between them: a schedule's rows sit as close as
      // one entry's lines, and the rule is what separates them (UNCC E001).
      if (
        prev &&
        l.y0 - prev.y1 < Math.max(l.h, prev.h) * 0.6 &&
        !opts.rule({
          x: Math.min(prev.x0, l.x0),
          // The gap between the two lines, and nothing of either line.
          y: prev.y1,
          width: Math.max(prev.x1, l.x1) - Math.min(prev.x0, l.x0),
          height: Math.max(0, l.y0 - prev.y1),
        })
      ) {
        current!.lines.push(l);
        continue;
      }
      const strip = stripLeftOf(l, l.y0 - l.h * 0.6, l.y1 + l.h * 0.6);
      const drawn = Boolean(strip && opts.ink(strip, textRects));
      if (strip && (drawn || textIn(strip).length > 0)) {
        current = { lines: [l], drawn };
        entries.push(current);
      } else {
        current = null;
      }
    }
  }
  if (entries.length === 0) return { kind: "no-rows" };

  // 4. Pictures: the strip over the entry's whole height, reaching halfway
  // to the neighbouring entries in its column, tightened to the ink.
  const captured = new Set(opts.captured.map(symbolLookupKey));
  const rows: LegendRow[] = [];
  const spans = entries.map(e => ({
    e,
    x0: e.lines[0].x0,
    y0: Math.min(...e.lines.map(l => l.y0)),
    y1: Math.max(...e.lines.map(l => l.y1)),
    h: Math.max(...e.lines.map(l => l.h)),
  }));
  for (const s of spans) {
    const sameColumn = spans.filter(
      o => o !== s && Math.abs(o.x0 - s.x0) < s.h * 1.5
    );
    const above = sameColumn
      .filter(o => o.y1 <= s.y0)
      .reduce((m, o) => Math.max(m, o.y1), -Infinity);
    const below = sameColumn
      .filter(o => o.y0 >= s.y1)
      .reduce((m, o) => Math.min(m, o.y0), Infinity);
    const reach = s.h * 2.5;
    const top = Math.max(
      box.y,
      Number.isFinite(above) ? (above + s.y0) / 2 : s.y0 - reach,
      s.y0 - reach
    );
    const bottom = Math.min(
      box.y + box.height,
      Number.isFinite(below) ? (below + s.y1) / 2 : s.y1 + reach,
      s.y1 + reach
    );
    const strip = stripLeftOf(s.e.lines[0], top, bottom);
    if (!strip) continue;
    const read = s.e.lines.map(l => l.text).join(" ");
    const matched = matchLibraryName(read, opts.library);
    // A symbol drawn only as letters is indistinguishable from an
    // abbreviation row ("S  SINGLE POLE SWITCH" vs "TYP  TYPICAL"). The
    // library decides: kept when its name matches an assembly, else dropped.
    if (!s.e.drawn && !matched) continue;
    const parts = [
      opts.ink(strip, textRects),
      ...textIn(strip).map(rectOf),
    ].filter((r): r is Rect => r !== null);
    if (parts.length === 0) continue;
    const tight = {
      x: Math.min(...parts.map(p => p.x)),
      y: Math.min(...parts.map(p => p.y)),
      width: 0,
      height: 0,
    };
    tight.width = Math.max(...parts.map(p => p.x + p.width)) - tight.x;
    tight.height = Math.max(...parts.map(p => p.y + p.height)) - tight.y;
    const pad = 2;
    const symbol = {
      x: Math.max(strip.x, tight.x - pad),
      y: Math.max(strip.y, tight.y - pad),
      width: 0,
      height: 0,
    };
    symbol.width =
      Math.min(strip.x + strip.width, tight.x + tight.width + pad) - symbol.x;
    symbol.height =
      Math.min(strip.y + strip.height, tight.y + tight.height + pad) - symbol.y;

    const name = matched?.name ?? read;
    const alreadyCaptured = captured.has(symbolLookupKey(name));
    rows.push({
      read,
      name,
      match: matched?.match ?? "none",
      symbol,
      alreadyCaptured,
      // A user with no library at all gets every row; otherwise the rows
      // that line up with an assembly. Never one already captured.
      ticked:
        !alreadyCaptured && (opts.library.length === 0 || matched !== null),
    });
  }
  // Already in reading order: entries were built column by column, left to
  // right, each top to bottom.
  if (rows.length === 0) return { kind: "no-rows" };
  const read = rows.filter(r => r.match !== "none").length;
  return {
    kind: "rows",
    rows,
    mostlyUnread: opts.library.length > 0 && read < rows.length / 2,
  };
}
