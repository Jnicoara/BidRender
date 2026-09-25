/**
 * Reading a sheet's number and title off its TITLE BLOCK, in plain code.
 *
 * The third source (shared/sheetIdentity.ts), used only for a field the PDF's
 * page labels and bookmarks left empty. Ported from the prototype
 * `references/sheet-reader-prototype.mjs`; § 17.4 of
 * references/plan-viewer-overhaul.md has how it was measured.
 *
 * ── What it can do, measured on real bid sets (2026-09-25) ───────────────────
 * Numbers: 82/82 on the six sets it was tuned on, 7/22 on four it had never
 * seen. **Nearly every miss found NOTHING, and no confident reading was
 * wrong.** Titles are weaker. Scans with no text layer, numbers drawn as
 * vector strokes (AutoCAD SHX fonts) and non-US numbering all find nothing.
 *
 * ── So a doubtful reading is thrown away, not stored as a guess ──────────────
 * Only a CONFIDENT number is returned: the tallest number-shaped line in the
 * corner, at least 1.4x the height of any rival. The two wrong answers in the
 * held-out test were both below that bar. A miss is a blank, which somebody
 * types in; a confident-looking wrong number is one somebody has to notice.
 *
 * Everything is in VIEWPORT space (rotation applied, y pointing down), so a
 * `/Rotate 270` sheet's corner is still the bottom-right.
 */
import { asSheetNumber } from "./sheetIdentity";

/** One pdf.js text item, positioned on the page as displayed. */
export type TitleBlockItem = {
  /** The item's text. */
  s: string;
  /** Baseline start, in viewport points. */
  x: number;
  y: number;
  /** Advance width and font height, in points. */
  w: number;
  h: number;
  /** Vertical AS DISPLAYED — the rotated title in a right-hand strip. */
  vert: boolean;
};

/** A run of items on one baseline, merged: `AD` `-` `101` is one number. */
type Line = { s: string; x: number; xe: number; y: number; h: number };

type ZoneLine = Line & { nx: number; ny: number };

/** What one page contributes: its confident number and its title candidates. */
export type TitleBlockPage = {
  number: string | null;
  /** The number's line, to look above it for the title. */
  numberLine: ZoneLine | null;
  /** Horizontal lines in the bottom-right, normalised to page size. */
  zone: ZoneLine[];
  /** Vertical items in the right-hand strip. */
  strip: TitleBlockItem[];
  height: number;
};

/** The corner searched, as a fraction of the page from the top-left. */
const ZONE_FROM = 0.6;
/** Where a vertical title strip starts. */
const STRIP_FROM = 0.85;
/** How much taller than every rival the winner must be to be believed. */
const CONFIDENT_RATIO = 1.4;

/** Title-block cell labels, which are never the title itself. */
const CELL_LABEL =
  /^(SHEET|DRAWING|DWG|TITLE|SHEET TITLE|DRAWING TITLE|SHEET NO|SHEET NUMBER|DRAWING NUMBER|DRAWN BY|CHECKED BY|SCALE|DATE|PROJECT|REVISIONS?|ISSUE|SEAL|JOB)\b/i;

function mergeLines(items: TitleBlockItem[]): Line[] {
  const lines: Line[] = [];
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find(
      l =>
        Math.abs(l.y - it.y) < 0.3 * it.h &&
        Math.abs(l.h - it.h) < 0.3 * it.h &&
        it.x - l.xe < 0.8 * it.h &&
        it.x >= l.x
    );
    if (line) {
      line.s += (it.x - line.xe > 0.15 * it.h ? " " : "") + it.s;
      line.xe = Math.max(line.xe, it.x + it.w);
    } else lines.push({ s: it.s, x: it.x, xe: it.x + it.w, y: it.y, h: it.h });
  }
  for (const l of lines) l.s = l.s.replace(/\s+/g, " ").trim();
  return lines.filter(l => l.s.length > 0);
}

/**
 * Pass one, per page: the confident number, and the lines a title could come
 * from. Titles need every page before they can be chosen (pass two), because
 * the way to tell a title from the project name is that the project name
 * repeats on every sheet.
 */
export function readTitleBlockPage(page: {
  width: number;
  height: number;
  items: TitleBlockItem[];
}): TitleBlockPage {
  const { width, height } = page;
  const items = page.items.filter(i => i.s.trim().length > 0);
  const zone: ZoneLine[] = mergeLines(items.filter(i => !i.vert))
    .map(l => ({ ...l, nx: l.x / width, ny: l.y / height }))
    .filter(l => l.nx > ZONE_FROM && l.ny > ZONE_FROM);
  const strip = items.filter(i => i.vert && i.x / width > STRIP_FROM);

  const score = (l: { h: number; nx: number; ny: number }) =>
    l.h * (1.5 - Math.hypot(1 - l.nx, 1 - l.ny));
  const candidates = zone
    .map(line => ({ line, number: asSheetNumber(line.s) }))
    .filter((c): c is { line: ZoneLine; number: string } => Boolean(c.number))
    .sort((a, b) => score(b.line) - score(a.line));

  const best = candidates[0];
  const rival = candidates.find(c => c.number !== best?.number);
  const confident =
    best !== undefined &&
    (!rival || best.line.h >= CONFIDENT_RATIO * rival.line.h);

  return {
    number: confident ? best.number : null,
    numberLine: confident ? best.line : null,
    zone,
    strip,
    height,
  };
}

/** A line that could be a title, before the repeat test. */
function looksLikeTitle(s: string): boolean {
  return (
    /[A-Z]{3}/i.test(s) &&
    !CELL_LABEL.test(s) &&
    // "PROJ MGR: JHA" — a filled-in cell, not a title. Measured held-out.
    !s.includes(":") &&
    !asSheetNumber(s) &&
    !/\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/.test(s)
  );
}

/**
 * Does this read as the name of a DRAWING?
 *
 * Every real title seen names what kind of sheet it is — LIGHTING PLAN, RISER
 * DIAGRAM, SYMBOL LEGEND, CODE ANALYSIS. What slipped through without such a
 * word was noise: OCR'd cell labels on a scanned set (Old Blueridge,
 * "DRAWNBY", "DRAWINBY", "DRAWIN SET BID SET"), whose misspellings also defeat
 * the repeats-on-every-sheet test. So a title-block title must contain one of
 * these words, or it is dropped.
 *
 * This can only turn a title into a blank, never into a different title — the
 * safe direction. The words are about DRAWING TYPES, not any one trade (see
 * CLAUDE.md: electrical is first, not only). Measured 2026-09-25 against the
 * sets with page labels to check it against: see the test file.
 */
const DRAWING_WORD =
  /\b(PLANS?|SCHEDULES?|DETAILS?|DIAGRAMS?|RISERS?|LEGENDS?|NOTES|SPECIFICATIONS?|SPECS|ELEVATIONS?|SECTIONS?|INDEX|COVER|SHEET|ANALYSIS|LAYOUTS?|SYMBOLS?|ABBREVIATIONS|ONE-LINE|SINGLE-LINE|PHOTOMETRICS?|DEMOLITION|SITE|ROOF|FLOOR|CEILING|LIGHTING|POWER|SYSTEMS|FIXTURES?|PANELS?|PANELBOARDS?|EQUIPMENT|CONTROLS?|GROUNDING|FIRE ALARM|PLUMBING|MECHANICAL|HVAC|DUCTWORK|PIPING|STRUCTURAL|FOUNDATION|FRAMING|ENLARGED|PARTIAL|DEMO)\b/i;

export function looksLikeDrawingTitle(title: string): boolean {
  return DRAWING_WORD.test(title);
}

/**
 * Pass two, across the set: each page's title, or null.
 *
 * Only a page with a confident number gets one — the title is found by where
 * it sits relative to that number. Text repeated on at least half the sheets is
 * project information (the job name, the engineer's address) and is skipped.
 */
export function readTitleBlockTitles(
  pages: TitleBlockPage[]
): (string | null)[] {
  const threshold = Math.max(2, pages.length * 0.5);
  const count = (lists: string[][]) => {
    const seen = new Map<string, number>();
    for (const list of lists)
      for (const s of Array.from(new Set(list)))
        seen.set(s, (seen.get(s) ?? 0) + 1);
    return seen;
  };
  const zoneCounts = count(pages.map(p => p.zone.map(l => l.s)));
  const stripCounts = count(pages.map(p => p.strip.map(i => i.s.trim())));

  return pages.map(page => {
    const anchor = page.numberLine;
    if (!anchor) return null;

    // Lines just above the number, in its column.
    const near = page.zone.filter(
      l =>
        l !== anchor &&
        l.y < anchor.y &&
        anchor.y - l.y < 0.12 * page.height &&
        Math.abs(l.nx - anchor.nx) < 0.1 &&
        looksLikeTitle(l.s) &&
        (zoneCounts.get(l.s) ?? 0) < threshold
    );
    let title: string | null = null;
    if (near.length > 0) {
      const tallest = Math.max(...near.map(l => l.h));
      const chosen = near
        .filter(l => l.h > 0.8 * tallest)
        .sort((a, b) => a.y - b.y || a.x - b.x);
      /*
        A title that CONTINUES above the search window would come out as its
        last line only — "(ALTERNATE)" for "LIGHTING PLAN & LUMINAIRE SCHEDULE
        (ALTERNATE)", seen on a real set (Colusa, 2026-09-25). A fragment is a
        wrong title, so give nothing: blank is the safe miss. Not an accuracy
        fix; the window is unchanged.
      */
      const top = chosen[0];
      const continues = page.zone.some(
        l =>
          !chosen.includes(l) &&
          l !== anchor &&
          l.y < top.y &&
          top.y - l.y < 1.8 * l.h &&
          Math.abs(l.h - tallest) < 0.2 * tallest &&
          Math.abs(l.nx - anchor.nx) < 0.1 &&
          looksLikeTitle(l.s)
      );
      title = continues ? null : chosen.map(l => l.s).join(" ");
    } else {
      // A vertical strip down the right edge carries the title ROTATED.
      const upright = page.strip.filter(
        i =>
          looksLikeTitle(i.s.trim()) &&
          (stripCounts.get(i.s.trim()) ?? 0) < threshold
      );
      if (upright.length > 0) {
        const tallest = Math.max(...upright.map(i => i.h));
        const top = upright.filter(i => i.h > 0.8 * tallest);
        const column = top[0].x;
        title = top
          .filter(i => Math.abs(i.x - column) < 1.5 * tallest)
          .sort((a, b) => b.y - a.y)
          .map(i => i.s.trim())
          .join(" ");
      }
    }
    title = title?.replace(/\s+/g, " ").trim() ?? null;
    return title && title.length >= 4 && looksLikeDrawingTitle(title)
      ? title.slice(0, 255)
      : null;
  });
}
