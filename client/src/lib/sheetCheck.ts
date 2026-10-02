/**
 * CHECK A SHEET against its legend — code only, no AI. 2026-10-01.
 *
 * One pass over a vector sheet that answers four questions, each a plan on
 * track-c and each decided there (`references/check-my-marks-plan.md`,
 * `references/legend-and-notes-automation-plan.md`):
 *
 *   1. SPOTS — where is every legend symbol drawn, and which one is it?
 *      Every look is searched (@/lib/findMatching); a spot one look fits
 *      cleanly is CLEAR, one two or more fit cleanly is a TIE (the only thing
 *      an AI may later be asked about, as a small crop), and one only flagged
 *      fits reach is UNSURE.
 *   2. MARK CHECK — does the drawing agree with each of your marks?
 *      matches / looks different / unsure / nothing under it / no look.
 *   3. VARIANTS — inside one count, which marks are drawn differently or
 *      have different words beside them?
 *   4. NOTES — heights, (E)/(X) and keynote numbers beside each mark.
 *
 * Every answer is a SUGGESTION. Nothing here changes a mark, a count or a bid;
 * the screen offers buttons and the estimator presses them.
 *
 * Pure: geometry and words in, plain objects out — the worker runs it, the
 * suite tests it, and a script can measure it on a real sheet.
 */
import {
  isDeviceWord,
  scaleTemplate,
  searchSymbol,
  symbolFromBox,
  wordKinds,
  type Match,
  type MatchBox,
  type PreparedSheet,
  type SymbolTemplate,
} from "./findMatching";
import type { WordBox } from "./textSelection";

/** A legend item and the symbol(s) that draw it. */
export type Look = {
  item: string;
  template: SymbolTemplate;
  /**
   * Labels the legend writes BESIDE this symbol ("USB", "GF", "TV"), upper
   * case. Not required to match — the plan may draw the same symbol for
   * several items — but when looks tie, the label written beside the spot on
   * the plan decides (`settleTie`).
   */
  qualifiers?: string[];
};

/** A mark on the sheet, with the legend item its count stands for (if any). */
export type CheckMark = {
  id: number;
  x: number;
  y: number;
  /** The count's name, as shown. */
  count: string;
  /** The legend item this count is, or null when no legend name matches. */
  item: string | null;
};

export type Fit = {
  item: string;
  coverage: number;
  /** Clean: no needs-a-look reason. "Maybe existing" is not a doubt about WHAT it is. */
  clean: boolean;
  reasons: string[];
  maybeExisting: string[];
  halfWidth: number;
  halfHeight: number;
  /** The look's legend labels (`Look.qualifiers`). */
  qualifiers: string[];
};

export type SpotDecision =
  /** `byWords`: a tie the words beside it settled, said so on screen. */
  | { kind: "clear"; item: string; byWords?: string }
  /**
   * `sameOnLegend`: every tied look is drawn the SAME on the legend (UNCC
   * draws three telecom items as one triangle; only their notes differ). No
   * picture can tell them apart — not code, not an AI — so it is said, and
   * never sent to the AI tie-break.
   */
  | { kind: "tie"; items: string[]; sameOnLegend?: boolean }
  | { kind: "unsure"; items: string[] };

export type Spot = {
  id: number;
  x: number;
  y: number;
  fits: Fit[];
  decision: SpotDecision;
  /** The mark sitting on this spot, if any. */
  markId: number | null;
};

export type MarkCheck =
  | { markId: number; kind: "matches"; notes: string[] }
  | { markId: number; kind: "different"; suggest: string; reasons: string[] }
  | { markId: number; kind: "unsure"; items: string[]; reasons: string[] }
  | { markId: number; kind: "nothing" }
  | { markId: number; kind: "noLook" };

/** Spots closer than this are one spot (half a symbol on the test sheets). */
export const SAME_SPOT_POINTS = 6;

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Looks from a legend read by "Whole legend" (@/lib/legendRead): each row's
 * symbol box, taken as a symbol on the legend sheet. The reader's box is the
 * symbol's INK with the legend's text left out, measured in 2-point cells, so
 * it is grown by a point to be sure every stroke lies wholly inside. A row
 * whose box holds nothing usable is reported, never silently dropped.
 */
export function looksFromLegend(
  legendSheet: PreparedSheet,
  rows: readonly { name: string; symbol: MatchBox }[],
  grow = 1
): { looks: Look[]; skipped: { name: string; why: string }[] } {
  const looks: Look[] = [];
  const skipped: { name: string; why: string }[] = [];
  for (const row of rows) {
    const b = {
      x: row.symbol.x - grow,
      y: row.symbol.y - grow,
      width: row.symbol.width + 2 * grow,
      height: row.symbol.height + 2 * grow,
    };
    /*
      "(J) OR [J]": one legend row, two ways of drawing it, the word OR
      between. Taken as one symbol it matches neither (UNCC E111: 0 of 20
      junction boxes), so it is cut at the OR into a look for each side.
    */
    const or = legendSheet.words.find(
      w =>
        w.text.trim().toUpperCase() === "OR" &&
        w.cx > b.x &&
        w.cx < b.x + b.width &&
        w.cy > b.y &&
        w.cy < b.y + b.height
    );
    const parts = or
      ? [
          { ...b, width: or.x0 - b.x },
          { ...b, x: or.x1, width: b.x + b.width - or.x1 },
        ].filter(p => p.width > 1)
      : [b];
    let madeAny = false;
    let why = "";
    for (const part of parts) {
      const made = symbolFromBox(legendSheet, part, {
        // A lone lowercase letter is a switching leg ("a") or a circuit
        // note, never what the symbol IS. Capitals and digits stay: "S",
        // the dimmer's "D", the three-way "3" are the symbol.
        ignoreWord: t => /^[a-z]$/.test(t.trim()),
        // Labels BESIDE a legend symbol ("TV", "OR") are not drawn on plans.
        wordsInsideLineWork: true,
      });
      if (made.kind === "ok") {
        // Every other word in this part of the legend box is a qualifier.
        const kept = new Set(
          made.symbol.words.map(w => w.trim().toUpperCase())
        );
        const qualifiers = Array.from(
          new Set(
            legendSheet.words
              .filter(
                w =>
                  w.cx >= part.x &&
                  w.cx <= part.x + part.width &&
                  w.cy >= part.y &&
                  w.cy <= part.y + part.height
              )
              .map(w => w.text.trim())
              .filter(t => t && !/^[a-z]$/.test(t))
              .map(t => t.toUpperCase().replace(/^"|"$/g, ""))
              .filter(t => t !== "OR" && !kept.has(t))
          )
        );
        looks.push({ item: row.name, template: made.symbol, qualifiers });
        madeAny = true;
      } else why = made.kind;
    }
    if (!madeAny) skipped.push({ name: row.name, why });
  }
  return { looks, skipped };
}

/**
 * The legend item a count stands for: the count's own name when the legend
 * has it, else the name of a captured symbol linked to the same assembly that
 * the legend has. Null when neither — the check then says "no look", it does
 * not guess.
 */
export function legendItemForCount(
  count: { label: string; assemblyId: number | null },
  legendNames: readonly string[],
  symbols: readonly { label: string; assemblyId: number | null }[]
): string | null {
  const byKey = new Map(legendNames.map(n => [key(n), n] as const));
  const own = byKey.get(key(count.label));
  if (own) return own;
  if (count.assemblyId === null) return null;
  const linked = symbols
    .filter(s => s.assemblyId === count.assemblyId)
    .map(s => byKey.get(key(s.label)))
    .filter((n): n is string => Boolean(n));
  const unique = Array.from(new Set(linked));
  // Two legend items on one assembly (B's § 11): which one is not knowable here.
  return unique.length === 1 ? unique[0] : null;
}

function fitOf(look: Look, m: Match): Fit {
  return {
    item: look.item,
    coverage: m.coverage,
    clean: m.needsLook.length === 0,
    reasons: m.needsLook,
    maybeExisting: m.maybeExisting,
    halfWidth: m.halfWidth,
    halfHeight: m.halfHeight,
    qualifiers: look.qualifiers ?? [],
  };
}

/** Decide what a spot is from the looks that fit it. */
export function decideSpot(fits: readonly Fit[]): SpotDecision {
  // One item may fit through two of its looks; that is still one item.
  const cleanItems = Array.from(
    new Set(fits.filter(f => f.clean).map(f => f.item))
  );
  if (cleanItems.length === 1) return { kind: "clear", item: cleanItems[0] };
  if (cleanItems.length > 1) return { kind: "tie", items: cleanItems };
  return {
    kind: "unsure",
    items: Array.from(new Set(fits.map(f => f.item))),
  };
}

/** Search every look over the sheet and merge the finds into spots. */
/** The sizes a look is retried at when it misses most of its count's marks. */
export const RETRY_SCALES = [0.77, 0.87, 1.15, 1.3] as const;

/**
 * Settle a tie by the words beside the spot (no AI). UNCC's legend draws a
 * USB outlet and a GFCI as the PLAIN duplex symbol and says the word beside
 * it makes the difference ('"USB" indicates…', '"GF" indicates…'): the looks
 * are identical, so code ties them — and the words decide. With a device
 * word beside the spot, the one tied item whose NAME has that word wins;
 * with none beside it, the one tied item whose name has no device word wins.
 * Anything else stays a tie.
 */
export function settleTie(
  tied: readonly { item: string; qualifiers: readonly string[] }[],
  wordsAtSpot: readonly string[]
): { item: string; word: string | null } | null {
  // An item's labels: its legend qualifiers, and device words in its name.
  const labels = tied.map(t => ({
    item: t.item,
    words: new Set([
      ...t.qualifiers.map(q => q.toUpperCase()),
      ...t.item
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter(w => w && isDeviceWord(w)),
    ]),
  }));
  const here = new Set(
    wordsAtSpot.map(w => w.trim().toUpperCase().replace(/^"|"$/g, ""))
  );
  const withWord = labels
    .map(l => ({ l, w: Array.from(l.words).find(w => here.has(w)) }))
    .filter(o => o.w !== undefined);
  if (withWord.length === 1)
    return { item: withWord[0].l.item, word: withWord[0].w ?? null };
  if (withWord.length > 1) return null;
  // No label of any tied item is written here: the one plain item, if one.
  const plain = labels.filter(l => l.words.size === 0);
  return plain.length === 1 ? { item: plain[0].item, word: null } : null;
}

/**
 * True when every item's looks are drawn alike on the legend: the same
 * number of strokes (±1), the same total line length (±5%), the same words.
 * Two legend rows that pass this differ only in the words of their notes.
 */
export function drawnTheSame(templates: readonly SymbolTemplate[][]): boolean {
  const sig = (t: SymbolTemplate) => ({
    n: t.rel.length,
    len: t.totalLength,
    words: t.words
      .map(w => w.trim().toUpperCase())
      .sort()
      .join(" "),
  });
  const first = templates[0]?.[0];
  if (!first) return false;
  const a = sig(first);
  return templates.every(list =>
    list.some(t => {
      const b = sig(t);
      return (
        Math.abs(a.n - b.n) <= 1 &&
        Math.abs(a.len - b.len) <= 0.05 * Math.max(a.len, b.len) &&
        a.words === b.words
      );
    })
  );
}

export function findSpots(
  sheet: PreparedSheet,
  looks: readonly Look[],
  marks: readonly CheckMark[],
  opts: { retryScales?: readonly number[] } = {}
): Spot[] {
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y) <= SAME_SPOT_POINTS;
  const search = (t: SymbolTemplate): Match[] => {
    const r = searchSymbol(t, sheet);
    return r.kind === "ok" ? r.matches : [];
  };
  const found = looks.map(l => search(l.template));

  /*
    A legend is not always drawn at the plan's size. For an item the
    estimator has counted, when its looks explain fewer than half his marks,
    try them at a few other sizes and keep the size that explains most.
    Bounded on purpose: only counted items, only when they mostly miss.
  */
  const scales = opts.retryScales ?? RETRY_SCALES;
  const counted = new Set(
    marks
      .map(m => m.item)
      .filter((i): i is string => i !== null)
      .map(key)
  );
  counted.forEach(item => {
    const mine = marks.filter(m => m.item !== null && key(m.item) === item);
    const idx = looks
      .map((l, i) => ({ l, i }))
      .filter(o => key(o.l.item) === item);
    if (idx.length === 0) return;
    const explained = (lists: Match[][]) =>
      mine.filter(m => lists.some(list => list.some(h => near(h, m)))).length;
    let best = {
      n: explained(idx.map(o => found[o.i])),
      lists: idx.map(o => found[o.i]),
    };
    if (best.n * 2 >= mine.length) return;
    for (const s of scales) {
      const lists = idx.map(o => search(scaleTemplate(o.l.template, s)));
      const n = explained(lists);
      if (n > best.n) best = { n, lists };
    }
    idx.forEach((o, k) => (found[o.i] = best.lists[k]));
  });

  const spots: Spot[] = [];
  looks.forEach((look, li) => {
    for (const m of found[li]) {
      const at = spots.find(
        s => Math.hypot(s.x - m.x, s.y - m.y) <= SAME_SPOT_POINTS
      );
      if (at) at.fits.push(fitOf(look, m));
      else
        spots.push({
          id: spots.length + 1,
          x: m.x,
          y: m.y,
          fits: [fitOf(look, m)],
          decision: { kind: "unsure", items: [] },
          markId: null,
        });
    }
  });
  for (const s of spots) {
    s.decision = decideSpot(s.fits);
    if (s.decision.kind === "tie") {
      const tiedItems = s.decision.items;
      const tied = tiedItems.map(item => ({
        item,
        qualifiers: Array.from(
          new Set(
            s.fits.filter(f => f.item === item).flatMap(f => f.qualifiers)
          )
        ),
      }));
      const here = sheet.words
        .filter(w => Math.hypot(w.cx - s.x, w.cy - s.y) <= WORD_REACH)
        .map(w => w.text);
      const won = settleTie(tied, here);
      if (won)
        s.decision = {
          kind: "clear",
          item: won.item,
          byWords: won.word
            ? `"${won.word}" is written beside it`
            : "none of the look-alikes' labels is written beside it",
        };
      else {
        const templates = tiedItems.map(item =>
          looks.filter(l => l.item === item).map(l => l.template)
        );
        s.decision = {
          kind: "tie",
          items: tiedItems,
          sameOnLegend: drawnTheSame(templates),
        };
      }
    }
    const on = marks
      .map(m => ({ m, d: Math.hypot(m.x - s.x, m.y - s.y) }))
      .filter(o => o.d <= SAME_SPOT_POINTS)
      .sort((a, b) => a.d - b.d)[0];
    s.markId = on?.m.id ?? null;
  }
  return spots.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Does the drawing agree with each mark? (check-my-marks-plan § 2.)
 *
 * The mark's own item counts as matching through ANY fit, clean or flagged:
 * measured on Weld 1, a flagged own fit is "lines joined on" (wires), not a
 * different device. Another item counts against it only when it fits
 * CLEANLY — a duplex look flagged "more lines run through it" on a double
 * duplex mark must not make that mark unsure (4 of 4 on Weld 1 would be).
 */
export function checkMarks(
  marks: readonly CheckMark[],
  spots: readonly Spot[],
  /** The items that have a look to compare with. */
  lookItems: readonly string[]
): MarkCheck[] {
  const withLook = new Set(lookItems.map(key));
  return marks.map(mark => {
    if (mark.item === null || !withLook.has(key(mark.item)))
      return { markId: mark.id, kind: "noLook" };
    const spot = spots
      .map(s => ({ s, d: Math.hypot(s.x - mark.x, s.y - mark.y) }))
      .filter(o => o.d <= SAME_SPOT_POINTS)
      .sort((a, b) => a.d - b.d)[0]?.s;
    if (!spot) return { markId: mark.id, kind: "nothing" };
    const own = spot.fits.filter(f => key(f.item) === key(mark.item as string));
    // A clear spot (one clean look, or a tie the words beside it settled)
    // answers directly.
    if (spot.decision.kind === "clear") {
      const d = spot.decision;
      if (key(d.item) === key(mark.item))
        return {
          markId: mark.id,
          kind: "matches",
          notes: Array.from(
            new Set(own.flatMap(f => [...f.reasons, ...f.maybeExisting]))
          ),
        };
      return {
        markId: mark.id,
        kind: "different",
        suggest: d.item,
        reasons: [
          ...(d.byWords
            ? [`decided by the words beside it: ${d.byWords}`]
            : []),
          ...Array.from(new Set(spot.fits.flatMap(f => f.reasons))),
        ],
      };
    }
    const others = Array.from(
      new Set(
        spot.fits
          .filter(f => f.clean && key(f.item) !== key(mark.item as string))
          .map(f => f.item)
      )
    );
    const reasons = Array.from(new Set(spot.fits.flatMap(f => f.reasons)));
    if (own.length > 0 && others.length === 0)
      return {
        markId: mark.id,
        kind: "matches",
        notes: Array.from(
          new Set(own.flatMap(f => [...f.reasons, ...f.maybeExisting]))
        ),
      };
    if (own.length > 0)
      return {
        markId: mark.id,
        kind: "unsure",
        items: [mark.item as string, ...others],
        reasons,
      };
    if (others.length === 1)
      return {
        markId: mark.id,
        kind: "different",
        suggest: others[0],
        reasons,
      };
    return {
      markId: mark.id,
      kind: "unsure",
      items: others.length
        ? others
        : Array.from(new Set(spot.fits.map(f => f.item))),
      reasons,
    };
  });
}

// ── Words beside a mark ──────────────────────────────────────────────────────

export type HeightRead = { text: string; inches: number };

/**
 * A mounting height, read from one word: `54"`, `+18`, `48" AFF`, `4'-0"`,
 * `3'6"`. Only with an inch mark, a foot mark or a plus sign — a bare `48`
 * beside a device is a circuit number as often as a height (measured: UNCC
 * E111's bare numbers are its "2B - 21" circuits), and the owner has not said
 * his engineers write bare heights (legend-and-notes § 8 Q5, left open).
 * Range 6–120 in: below is a box or conduit size (`4"`, `1"` on Weld 1 E-200).
 */
export function readHeight(text: string): HeightRead | null {
  const t = text
    .trim()
    .toUpperCase()
    .replace(/\s*AFF$/, "")
    .replace(/”/g, '"');
  let inches: number | null = null;
  let m = t.match(/^\+?(\d{1,3}(?:\.\d+)?)"$/);
  if (m) inches = Number(m[1]);
  m = t.match(/^\+(\d{1,3}(?:\.\d+)?)$/);
  if (m) inches = Number(m[1]);
  m = t.match(/^\+?(\d{1,2})'\s*-?\s*(\d{1,2}(?:\.\d+)?)?"?$/);
  if (m) inches = Number(m[1]) * 12 + (m[2] ? Number(m[2]) : 0);
  if (inches === null || inches < 6 || inches > 120) return null;
  return { text: text.trim(), inches };
}

export type WordsBeside = {
  heights: HeightRead[];
  /** Device words: GF, WP, USB … (the matcher's own list). */
  device: string[];
  existing: string[];
  remove: string[];
  relocate: string[];
  /** A fixture tag such as "(A-7)" — count-by-tag's, read here only to show. */
  tags: string[];
};

/** How far from a mark its words are read, in points (a symbol's reach). */
export const WORD_REACH = 16;

export function wordsBeside(
  words: readonly WordBox[],
  x: number,
  y: number,
  reach = WORD_REACH
): WordsBeside {
  const near = words.filter(w => Math.hypot(w.cx - x, w.cy - y) <= reach);
  const kinds = wordKinds(near);
  return {
    heights: near.flatMap(w => readHeight(w.text) ?? []),
    device: Array.from(kinds.device).sort(),
    existing: kinds.status.existing,
    remove: kinds.status.remove,
    relocate: kinds.status.relocate,
    tags: near
      .map(w => w.text.trim())
      .filter(t => /^\([A-Z]{1,2}-?\d{1,3}[A-Z]?\)$/i.test(t)),
  };
}

// ── Keynote tags ─────────────────────────────────────────────────────────────

export type Keynote = { number: number; x: number; y: number };

/**
 * A keynote tag: a 1–2 digit number with line work on ALL FOUR sides close
 * round it — a small closed square. Measured 2026-10-01: a rule that only
 * counted short segments near a number found 69 on Weld 1 E-200, including
 * circuit numbers beside round devices (19–26, when the sheet's notes stop
 * at 18). Requiring a side above, below, left and right, each spanning the
 * number, is what tells a tag from a number beside a circle.
 */
export function findKeynotes(sheet: PreparedSheet): Keynote[] {
  const segs = sheet.geo.segs;
  const out: Keynote[] = [];
  for (const w of sheet.words) {
    if (!/^\d{1,2}$/.test(w.text.trim())) continue;
    const h = Math.max(2, w.y1 - w.y0);
    const span = Math.max(h * 2.2, w.x1 - w.x0 + h * 1.2); // how far a side may sit
    let top = false;
    let bottom = false;
    let left = false;
    let right = false;
    sheet.grid(8).near(w.cx, w.cy, span + 8, i => {
      const x1 = segs[i * 4];
      const y1 = segs[i * 4 + 1];
      const x2 = segs[i * 4 + 2];
      const y2 = segs[i * 4 + 3];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < h || len > span * 3) return;
      const horizontal = Math.abs(y2 - y1) < 0.15 * len;
      const vertical = Math.abs(x2 - x1) < 0.15 * len;
      if (horizontal && Math.min(x1, x2) <= w.cx && Math.max(x1, x2) >= w.cx) {
        const yy = (y1 + y2) / 2;
        if (yy < w.y0 && w.cy - yy <= span) top = true;
        if (yy > w.y1 && yy - w.cy <= span) bottom = true;
      }
      if (vertical && Math.min(y1, y2) <= w.cy && Math.max(y1, y2) >= w.cy) {
        const xx = (x1 + x2) / 2;
        if (xx < w.x0 && w.cx - xx <= span) left = true;
        if (xx > w.x1 && xx - w.cx <= span) right = true;
      }
    });
    if (top && bottom && left && right)
      out.push({ number: Number(w.text.trim()), x: w.cx, y: w.cy });
  }
  return out;
}

/** How far a keynote tag may sit from the device it is about, in points. */
export const KEYNOTE_REACH = 30;

export type MarkNotes = {
  markId: number;
  words: WordsBeside;
  /** Keynote numbers whose tag is nearest THIS mark and within reach. */
  keynotes: number[];
};

export function notesForMarks(
  sheet: PreparedSheet,
  marks: readonly CheckMark[],
  keynotes: readonly Keynote[] = findKeynotes(sheet)
): MarkNotes[] {
  // A tag belongs to its nearest mark only, so one tag is never two marks' note.
  const owner = new Map<Keynote, number>();
  for (const k of keynotes) {
    const near = marks
      .map(m => ({ m, d: Math.hypot(m.x - k.x, m.y - k.y) }))
      .filter(o => o.d <= KEYNOTE_REACH)
      .sort((a, b) => a.d - b.d)[0];
    if (near) owner.set(k, near.m.id);
  }
  return marks.map(m => ({
    markId: m.id,
    words: wordsBeside(sheet.words, m.x, m.y),
    keynotes: keynotes
      .filter(k => owner.get(k) === m.id)
      .map(k => k.number)
      .sort((a, b) => a - b),
  }));
}

// ── Variants inside a count ──────────────────────────────────────────────────

export type VariantGroup = {
  /** Which look: 1 is the count's main look, 2… the others, 0 "can't tell". */
  look: number;
  /** The legend item that draws this look, when a legend look explains it. */
  lookName: string | null;
  /** What sits beside them, in words: `54"`, "WP", "(E)", or "" for nothing. */
  beside: string;
  markIds: number[];
  /** True for every group smaller than the count's main one. */
  minor: boolean;
};

/** Half the box drawn round a mark to take its symbol as a look, points. */
export const LOOK_HALF = 6;

function besideLabel(w: WordsBeside): string {
  // One "(E)" is as existing as two; the label says what, not how many.
  return Array.from(
    new Set(
      [
        ...w.heights.map(h => h.text),
        ...w.device,
        ...w.existing,
        ...w.remove,
        ...w.relocate,
        ...w.tags,
      ].map(s => s.toUpperCase())
    )
  )
    .sort()
    .join(" ");
}

/**
 * Group one count's marks by the look under them and the words beside them
 * (check-my-marks-plan § 10). Looks: the first ungrouped mark's symbol is
 * searched for; every mark it lands on is that look; repeat (measured on
 * UNCC E111: 66 + 2 + 3 + 1 + 1 of 73 data outlets). A mark whose own box
 * holds no symbol is look 0, "can't tell".
 */
export function variantsOfCount(
  sheet: PreparedSheet,
  marks: readonly CheckMark[],
  opts: {
    /**
     * The sheet's spots from the legend looks (`findSpots`). When given, a
     * mark's look is the legend look that fits it CLEANLY — measured on
     * Weld 1, a box round each duplex mark caught a different piece of the
     * symbol each time (the mark sits on the circle, the lines run off to one
     * side) and split 9 duplexes into 8 "looks". Only marks no legend look
     * explains fall back to the box round the mark.
     */
    spots?: readonly Spot[];
    maxLooks?: number;
  } = {}
): VariantGroup[] {
  const maxLooks = opts.maxLooks ?? 8;
  // Look identity as a string first: "legend:<item>" or "seed:<n>"; numbered after.
  const lookKey = new Map<number, string>();
  const named = new Map<string, string>();
  for (const m of marks) {
    const spot = (opts.spots ?? [])
      .map(s => ({ s, d: Math.hypot(s.x - m.x, s.y - m.y) }))
      .filter(o => o.d <= SAME_SPOT_POINTS)
      .sort((a, b) => a.d - b.d)[0]?.s;
    // The mark's own item fitting with only a NOTE (wires joined on) is still
    // its look — the same rule `checkMarks` uses for "matches".
    const ownFit =
      spot &&
      m.item !== null &&
      spot.fits.some(f => key(f.item) === key(m.item as string));
    if (spot && (spot.decision.kind !== "unsure" || ownFit)) {
      const items =
        spot.decision.kind === "clear"
          ? [spot.decision.item]
          : spot.decision.kind === "tie"
            ? spot.decision.items
            : [m.item as string];
      const k = `legend:${items.slice().sort().join(" | ")}`;
      lookKey.set(m.id, k);
      named.set(k, items.join(" or "));
    }
  }
  const lookOf = new Map<number, number>();
  let left = marks.filter(m => !lookKey.has(m.id));
  let look = 0;
  while (left.length && look < maxLooks) {
    const seed = left[0];
    const box: MatchBox = {
      x: seed.x - LOOK_HALF,
      y: seed.y - LOOK_HALF,
      width: 2 * LOOK_HALF,
      height: 2 * LOOK_HALF,
    };
    const made = symbolFromBox(sheet, box);
    if (made.kind !== "ok") {
      lookOf.set(seed.id, 0);
      left = left.slice(1);
      continue;
    }
    look += 1;
    const r = searchSymbol(made.symbol, sheet);
    // Clean fits only: a duplex look also fits INSIDE a double duplex
    // (flagged "more lines run through it"), and counting that as the same
    // look hides exactly the variant this exists to find.
    const hits =
      r.kind === "ok" ? r.matches.filter(h => h.needsLook.length === 0) : [];
    const covered = left.filter(
      m =>
        m === seed ||
        hits.some(h => Math.hypot(h.x - m.x, h.y - m.y) <= LOOK_HALF)
    );
    covered.forEach(m => lookOf.set(m.id, look));
    left = left.filter(m => !covered.includes(m));
  }
  left.forEach(m => lookOf.set(m.id, 0));
  lookOf.forEach((l, id) => lookKey.set(id, l > 0 ? `seed:${l}` : "none"));

  // Number the looks by size, so look 1 is the count's main one; 0 is "can't tell".
  const sizes = new Map<string, number>();
  lookKey.forEach(k => {
    if (k !== "none") sizes.set(k, (sizes.get(k) ?? 0) + 1);
  });
  const number = new Map(
    Array.from(sizes.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k], i) => [k, i + 1] as const)
  );

  const groups = new Map<string, VariantGroup>();
  for (const m of marks) {
    const k0 = lookKey.get(m.id) ?? "none";
    const lk = number.get(k0) ?? 0;
    const beside = besideLabel(wordsBeside(sheet.words, m.x, m.y));
    const k = `${lk}|${beside}`;
    const g = groups.get(k) ?? {
      look: lk,
      lookName: named.get(k0) ?? null,
      beside,
      markIds: [],
      minor: true,
    };
    g.markIds.push(m.id);
    groups.set(k, g);
  }
  const list = Array.from(groups.values()).sort(
    (a, b) => b.markIds.length - a.markIds.length
  );
  if (list[0]) list[0].minor = false;
  return list;
}

// ── The whole check, as the screen runs it ───────────────────────────────────

/** A mark as the page knows it: the count's name and its assembly. */
export type MarkIn = {
  id: number;
  x: number;
  y: number;
  count: string;
  assemblyId: number | null;
};

export type SheetCheckInput = {
  legendRows: readonly { name: string; symbol: MatchBox }[];
  marks: readonly MarkIn[];
  /** Captured legend symbols, for a count named differently from its row. */
  symbols: readonly { label: string; assemblyId: number | null }[];
  /**
   * The "compare with" picker: count name -> legend item, chosen by hand for
   * a count whose name the legend does not use. Wins over every guess.
   */
  picks?: Readonly<Record<string, string>>;
};

export type SheetCheckResult = {
  looks: string[];
  skipped: { name: string; why: string }[];
  marks: CheckMark[];
  spots: Spot[];
  checks: MarkCheck[];
  notes: MarkNotes[];
  /** Only counts that split into more than one group. */
  variants: { count: string; groups: VariantGroup[] }[];
};

/**
 * Legend sheet + plan sheet + marks in, every suggestion out. The same
 * composition `scripts/sheetCheckMeasure.mts` measured, so a number measured
 * there is a number this produces.
 */
export function runSheetCheck(
  legendSheet: PreparedSheet,
  planSheet: PreparedSheet,
  input: SheetCheckInput
): SheetCheckResult {
  const { looks, skipped } = looksFromLegend(legendSheet, input.legendRows);
  const names = Array.from(new Set(looks.map(l => l.item)));
  const picks = new Map(
    Object.entries(input.picks ?? {}).map(([c, item]) => [key(c), item])
  );
  const itemFor = (m: MarkIn): string | null => {
    const picked = picks.get(key(m.count));
    if (picked && names.includes(picked)) return picked;
    return legendItemForCount(
      { label: m.count, assemblyId: m.assemblyId },
      names,
      input.symbols
    );
  };
  const marks: CheckMark[] = input.marks.map(m => ({
    id: m.id,
    x: m.x,
    y: m.y,
    count: m.count,
    item: itemFor(m),
  }));
  const spots = findSpots(planSheet, looks, marks);
  const checks = checkMarks(marks, spots, names);
  const notes = notesForMarks(planSheet, marks);

  const byCount = new Map<string, CheckMark[]>();
  marks.forEach(m => {
    const list = byCount.get(m.count) ?? [];
    list.push(m);
    byCount.set(m.count, list);
  });
  const variants: SheetCheckResult["variants"] = [];
  byCount.forEach((list, count) => {
    if (list.length < 2) return;
    const groups = variantsOfCount(planSheet, list, { spots });
    if (groups.length > 1) variants.push({ count, groups });
  });
  return { looks: names, skipped, marks, spots, checks, notes, variants };
}
