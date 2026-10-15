/**
 * DETAIL LINKS — "3/E5", read off a vector sheet by code. Step 5d of
 * references/plan-reading-help-plan.md § 7 (rules in § 6, "Detail links").
 * No AI, nothing saved: the words are the ones the PDF worker already reads
 * for the keyed notes, on every sheet open.
 *
 * Two printed forms, both measured on the sets on hand (2026-10-14,
 * scripts/detailRefsFixture.mts):
 *
 * 1. TEXT — "2/E004." inside a note ("SEE DETAIL 2/E004."), one word. UNCC
 *    E121 prints two, pointing at E004.
 * 2. A SPLIT BUBBLE — the detail's number on top, the sheet's number under it,
 *    two words stacked on one centre line. Every one on hand sits under a
 *    detail's own drawing and names the sheet it is ON: UNCC E004 carries
 *    1/E004, 2/E004, 3/E004; Weld 1 E-200 carries A–D/E-200. That is a
 *    detail TITLE — where a link to it lands — not a link.
 *
 * So a reference is read once, and what it IS depends on where it points:
 *
 * - AT ANOTHER SHEET THAT EXISTS IN THIS SET → a link (`linksOnSheet`).
 * - AT THIS SHEET → a title (`findDetailTitle`), what "Go" zooms to.
 * - AT NO SHEET IN THE SET → nothing. This is the guard that matters: "5/A1",
 *   "1/HE-62", "T5/T8", "1/S201", "D1/V1" are all on the sets on hand and none
 *   is a sheet here. Without it they are links to nowhere.
 * - AT A NUMBER TWO SHEETS SHARE → nothing. Weld 2's title blocks read "E1.0"
 *   on two pages; a link that picks one of them is a guess.
 *
 * Sheet numbers compare ignoring dots, dashes, spaces and case, so "3/E5.01"
 * finds a sheet stored as "E-5.01" (plan § 6).
 */
import { SHEET_NUMBER_PATTERN } from "@shared/sheetIdentity";
import type { NoteWord } from "./keyedNotes";

export type DetailRef = {
  /** The detail: "2", "A", "2B". */
  label: string;
  /** The sheet as printed: "E004", "E-200". */
  sheet: string;
  /** Centre and half-size, page points. */
  x: number;
  y: number;
  r: number;
  form: "text" | "bubble";
};

/** A detail's own number or letter: 1–2 digits with a letter, or a letter. */
const LABEL = /^(?:\d{1,2}[A-Z]?|[A-Z]\d?)$/;

/**
 * "2/E004." — the label, a slash, a sheet; a closing dot or comma allowed.
 * The sheet MUST start with a letter. Plan § 6 allowed a bare "3/4" to link
 * to a sheet named "4"; the sets on hand print breaker sizes — "20/2",
 * "30/2", "60/3" — on every panel schedule, and the app's own sheet-number
 * reader never stores a number without a letter (SHEET_NUMBER_PATTERN), so a
 * bare number is a size, never a sheet (2026-10-14, recorded in the plan).
 */
const TEXT_REF =
  /^(\d{1,2}[A-Z]?|[A-Z]\d?)\/([A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,3})?[A-Z]?)[.,;:)]?$/;

/** How sheet numbers are compared: "E-5.01", "e5.01" and "E501" are one. */
export function sheetKey(number: string): string {
  return number.toUpperCase().replace(/[\s.\-–—]/g, "");
}

function bubbleSheet(text: string): string | null {
  const t = text.replace(/[.,;:]$/, "");
  return SHEET_NUMBER_PATTERN.test(t) ? t : null;
}

/** Every reference on the sheet, whatever it points at. */
export function readDetailRefs(words: readonly NoteWord[]): DetailRef[] {
  const out: DetailRef[] = [];
  for (const w of words) {
    const m = TEXT_REF.exec(w.text.toUpperCase());
    if (m)
      out.push({
        label: m[1],
        sheet: m[2],
        x: w.cx,
        y: w.cy,
        r: Math.max((w.x1 - w.x0) / 2, w.height / 2),
        form: "text",
      });
  }
  /*
    The bubble: a sheet-number word with a label word straight above it —
    centres within 1.2 of the sheet word's height across, 0.6–2.6 heights
    up, and type of about the same size (0.6–1.6x), which is what keeps a
    title block's "BY" over its big sheet number, or a schedule's "1" over a
    column, from reading as one.
  */
  // Only label-shaped words, sorted across, searched by halving: comparing
  // every sheet-shaped word with every word took 1.5 s on Weld 2 E3.1
  // (61,746 words); this takes a few ms (measured in the 5d notes).
  const labels = words
    .filter(w => LABEL.test(w.text))
    .sort((a, b) => a.cx - b.cx);
  const firstAt = (x: number) => {
    let lo = 0;
    let hi = labels.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (labels[mid].cx < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (const s of words) {
    const sheet = bubbleSheet(s.text);
    if (!sheet) continue;
    const h = s.height;
    let above: NoteWord | undefined;
    for (let i = firstAt(s.cx - h * 1.2); i < labels.length; i++) {
      const w = labels[i];
      if (w.cx > s.cx + h * 1.2) break;
      if (
        w !== s &&
        Math.abs(w.cx - s.cx) < h * 1.2 &&
        s.cy - w.cy > h * 0.6 &&
        s.cy - w.cy < h * 2.6 &&
        w.height > h * 0.6 &&
        w.height < h * 1.6
      ) {
        // The nearest label above wins, not the first one across.
        if (
          !above ||
          Math.hypot(w.cx - s.cx, w.cy - s.cy) <
            Math.hypot(above.cx - s.cx, above.cy - s.cy)
        )
          above = w;
      }
    }
    if (!above) continue;
    const half = Math.max((s.x1 - s.x0) / 2, (s.cy - above.cy) / 2 + h / 2);
    out.push({
      label: above.text,
      sheet,
      x: s.cx,
      y: (s.cy + above.cy) / 2,
      r: half,
      form: "bubble",
    });
  }
  return out;
}

/** A sheet in this set: its page and number as stored or read. */
export type SetSheet = { page: number; number: string | null };

/**
 * The page a printed sheet number names in this set, or null: no sheet by
 * that number, or more than one (a guess is not a link).
 */
export function pageForSheet(
  sheet: string,
  sheets: readonly SetSheet[]
): number | null {
  const key = sheetKey(sheet);
  const hits = sheets.filter(s => s.number && sheetKey(s.number) === key);
  return hits.length === 1 ? hits[0].page : null;
}

export type DetailLink = {
  ref: DetailRef;
  /** The page it goes to. */
  page: number;
  /** That sheet's number as the set shows it ("E004"). */
  number: string;
};

/** The references on page `page` that go to ANOTHER sheet of this set. */
export function linksOnSheet(
  refs: readonly DetailRef[],
  page: number,
  sheets: readonly SetSheet[]
): DetailLink[] {
  const out: DetailLink[] = [];
  for (const ref of refs) {
    const to = pageForSheet(ref.sheet, sheets);
    if (to === null || to === page) continue;
    const number = sheets.find(s => s.page === to)?.number ?? ref.sheet;
    out.push({ ref, page: to, number });
  }
  return out;
}

/**
 * Where detail `label` is drawn on page `page`: its title bubble (a
 * reference on that page naming that page), nearest the top-left if a sheet
 * somehow prints it twice. Null = not located; "Go" then opens the whole
 * sheet and says so — it never zooms to a guess (plan § 6).
 */
export function findDetailTitle(
  refs: readonly DetailRef[],
  page: number,
  label: string,
  sheets: readonly SetSheet[]
): DetailRef | null {
  const want = label.toUpperCase();
  const titles = refs.filter(
    r =>
      r.form === "bubble" &&
      r.label.toUpperCase() === want &&
      pageForSheet(r.sheet, sheets) === page
  );
  if (!titles.length) return null;
  return titles.sort((a, b) => a.y - b.y || a.x - b.x)[0];
}
