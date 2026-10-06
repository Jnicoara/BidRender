/**
 * FIND ALL MATCHING — box one symbol, find every copy of it on the sheet.
 * No AI. 2026-10-01.
 *
 * Works on the drawing's own line work (@/lib/vectorGeometry) and its text
 * (@/lib/textSelection's word boxes), so it only works on a sheet drawn by
 * CAD. A SCAN has neither, and is answered with a sentence saying so — never
 * with a guess.
 *
 * ── How a copy is recognised ─────────────────────────────────────────────────
 * The boxed symbol is every segment lying wholly inside the box, plus every
 * word whose centre is inside it (a junction box is a circle AND a "J"; a
 * switch is mostly an "S"). A copy is the same segments, in the same places
 * relative to each other, in one of EIGHT orientations — four turns, each
 * also mirrored — with the same filled / stroked state, covering at least
 * MIN_COVERAGE of the boxed symbol's length; and the same words in the same
 * places, upright or turned with it. Arbitrary angles are not tried: plans
 * draw devices square to the sheet, and every angle tried is a chance to
 * match something that is not a device.
 *
 * A wire through the symbol crosses the box edge and so is not part of it,
 * which is why a box drawn snugly round the symbol works and a loose one
 * picks up whatever else it holds.
 *
 * ── It never decides what it is not sure of ──────────────────────────────────
 * Every copy comes back UNCONFIRMED; the screen confirms. And it FLAGS, rather
 * than drops or silently keeps:
 *   - needs a look: a device word beside it (GF, WP, USB…) that the boxed one
 *     does not have, or the reverse — the duplex / GFCI case, same shape,
 *     different words; extra lines inside it (a bigger symbol containing
 *     this one); drawn darker than the boxed one; "(X)" or "(R)" beside it.
 *   - maybe existing: drawn lighter than the boxed one, or "(E)" beside it.
 * Which device a word beside two devices belongs to cannot be known from the
 * drawing, so a word near a copy flags it even when it may belong to the
 * neighbour. A flag costs one look; a silent wrong answer costs a bid.
 */
import type { VectorGeometry } from "./vectorGeometry";
import type { WordBox } from "./textSelection";

export type MatchBox = { x: number; y: number; width: number; height: number };

export type Match = {
  /** Centre of the copy, page points — where a mark goes. */
  x: number;
  y: number;
  /** Half its width and height on the page (turned with it). */
  halfWidth: number;
  halfHeight: number;
  rotation: 0 | 90 | 180 | 270;
  mirrored: boolean;
  /** Share of the boxed symbol's line length found here, 0 … 1. */
  coverage: number;
  needsLook: string[];
  maybeExisting: string[];
  /** The very one that was boxed. Still a device to count. */
  isBoxed: boolean;
  /**
   * The title of the DEMOLITION plan this copy is on, or null. Read from a
   * scan's text layer (@/lib/scanMatching); such a copy is shown "not
   * counted" and "Confirm all" leaves it. Null on vector sheets, which
   * search the whole sheet as before.
   */
  onDemolitionPlan: string | null;
  /**
   * How many sources found it — the box drawn now and each saved look
   * (@/lib/lookMatching). Absent when only the box was searched.
   */
  foundBy?: number;
  /** The box drawn now found it. Absent when only the box was searched. */
  foundByBox?: boolean;
  /**
   * The saved looks that found it, by id — so removing a look mid-search
   * can drop what only it found (multiple-looks-plan.md § 7).
   */
  foundByLooks?: number[];
  /**
   * The labels tied to this copy (`tieLabels`): device words, (E)/(X)/(R),
   * mounting heights, fixture tags — as SUGGESTIONS shown on the find. A
   * device word that differs from the boxed one's is also a needs-a-look
   * flag. Absent where nothing is read (scans).
   */
  labels?: string[];
};

export type FindResult =
  | {
      kind: "ok";
      matches: Match[];
      /** What was taken as the symbol. */
      symbol: {
        segments: number;
        words: string[];
        width: number;
        height: number;
        /**
         * The BOXED symbol's device words (GF, WP…: DEVICE_WORDS only, so a
         * circuit number never counts). Absent when no box was searched.
         */
        device?: string[];
      };
      /**
       * Present when the sheet is a scan and the picture matcher ran: the
       * plan searched (null = the whole sheet) and the symbol's size in the
       * scan's own pixels.
       */
      scan?: { plan: string | null; pixels: number };
      /**
       * Present when the item's saved looks were searched too
       * (@/lib/lookMatching): how many, and what was left out and why.
       */
      looks?: {
        searched: number;
        notes: string[];
        /**
         * Each saved look's device words (GF, WP…) as rebuilt here, vector
         * only — what "Your other look has 'GF' beside it" compares
         * (@/lib/lookMatching, `lookWordNotes`). Absent on a scan.
         */
        device?: { id: number; device: string[] }[];
      };
    }
  | { kind: "scan" | "empty" | "tooBig" | "tooPoor"; message: string };

/** A copy must hold at least this share of the symbol's line length. */
export const MIN_COVERAGE = 0.8;
/** More segments than this in the box is a region, not a symbol. */
const MAX_SYMBOL_SEGMENTS = 600;
/**
 * A page mostly covered by a picture with fewer segments than this is a
 * scan. Weld 1 E-200 has 96,540 and UNCC E111 87,186; the Blueridge scans 0.
 */
const SCAN_MAX_SEGMENTS = 500;
const SCAN_MESSAGE =
  "This sheet is a scanned picture, so Find all matching can't see the symbols on it. Count these by hand.";
/** Lightness 0–255 apart that counts as "drawn lighter / darker". */
const LIGHTNESS_STEP = 40;

/** Words that make one device a different device. Compared, never ignored. */
const DEVICE_WORDS = new Set([
  "GF",
  "GFI",
  "GFCI",
  "WP",
  "WR",
  "IG",
  "USB",
  "TR",
  "AF",
  "AFCI",
  "EM",
  "NL",
]);
/** True for a word that makes one device a different device (GF, WP, USB…). */
export function isDeviceWord(text: string): boolean {
  return DEVICE_WORDS.has(text.trim().toUpperCase().replace(/^"|"$/g, ""));
}

/** Words that say what is happening to a device. */
const EXISTING_WORDS = new Set([
  "(E)",
  "EX",
  "(EX)",
  "ETR",
  "(ETR)",
  "ER",
  "(ER)",
]);
const REMOVE_WORDS = new Set(["(X)", "(D)", "(RE)"]);
const RELOCATE_WORDS = new Set(["(R)", "(RL)", "RL"]);

/*
  LABELS TIED TO DEVICES (code-first-ceiling.md § b, measured 2026-10-06).
  The ring this matcher used reached ~12.6 pt from a small symbol's centre.
  On UNCC E111 the USB labels sit a median 14.3 pt out, so it read 0 of 41
  and a USB duplex was a plain duplex to it; "GF" was read on 1 of 4. Tied
  to the NEAREST copy within 24 pt instead: USB 38/38, GF 4/4, heights 3/3
  on Weld 1 E-200 — scored against the owner's hand counts.
*/
/** How far a label may sit from its device, in page points. Measured. */
export const LABEL_REACH = 24;
/**
 * A label nearly as close to a second copy (within this factor) belongs to
 * neither for certain: it is shown on BOTH, flagged, never given to one.
 */
export const LABEL_SHARED = 1.25;

/** A mounting height: 54", 18", 48"AFF. */
const HEIGHT_RE = /^\d{1,3}"(\s?AFF)?$/;
/**
 * A fixture or device tag: A2, B12, (A-8), C3a. ONE letter only — two-letter
 * forms (SL-24 on Weld 1) are circuit numbers, which every device has a
 * different one of and which must not flag anything.
 */
const FIXTURE_TAG_RE = /^\(?[A-Z]-?\d{1,2}[A-Z]?\)?$/;

export type LabelKind =
  | "device"
  | "existing"
  | "remove"
  | "relocate"
  | "height"
  | "fixtureTag";

/** What kind of label a word is, or null when it is not one. */
export function labelKind(text: string): LabelKind | null {
  const k = wordKey(text);
  if (isDeviceWord(k)) return "device";
  if (EXISTING_WORDS.has(k)) return "existing";
  if (REMOVE_WORDS.has(k)) return "remove";
  if (RELOCATE_WORDS.has(k)) return "relocate";
  if (HEIGHT_RE.test(k)) return "height";
  if (FIXTURE_TAG_RE.test(k)) return "fixtureTag";
  return null;
}

/**
 * Tie each label word to the copy it belongs to: the NEAREST copy within
 * LABEL_REACH. A label within LABEL_SHARED of its nearest distance from a
 * second copy goes to both, marked shared. Words that ARE part of a symbol
 * (`symbolWords`, the J in a junction box) are never labels.
 */
export function tieLabels(
  words: readonly { text: string; cx: number; cy: number }[],
  copies: readonly { x: number; y: number }[],
  symbolWords: ReadonlySet<number>
): { word: number; shared: boolean }[][] {
  const out = copies.map(() => [] as { word: number; shared: boolean }[]);
  words.forEach((w, i) => {
    if (symbolWords.has(i) || labelKind(w.text) === null) return;
    const near = copies
      .map((c, k) => ({ k, d: Math.hypot(c.x - w.cx, c.y - w.cy) }))
      .filter(c => c.d <= LABEL_REACH)
      .sort((a, b) => a.d - b.d);
    if (!near.length) return;
    const takers = near.filter(c => c.d <= LABEL_SHARED * near[0].d);
    for (const c of takers)
      out[c.k].push({ word: i, shared: takers.length > 1 });
  });
  return out;
}

/** The flag for a device word the boxed one lacks, named where it matters. */
function deviceWordFlag(w: string): string {
  if (/^GF(I|CI)?$/.test(w))
    return `"${w}" is written beside it — it may be a GFCI, not the one you boxed`;
  if (w === "USB")
    return `"USB" is written beside it — it may be a USB receptacle, not the one you boxed`;
  return `"${w}" is written beside it — the one you boxed has no "${w}"`;
}

type Orient = {
  a: number;
  b: number;
  c: number;
  d: number;
  rotation: Match["rotation"];
  mirrored: boolean;
};

/** p' = (a x + b y, c x + d y). The 4 turns, then each mirrored. */
const ORIENTS: Orient[] = (() => {
  const turns: [number, number, number, number, Match["rotation"]][] = [
    [1, 0, 0, 1, 0],
    [0, -1, 1, 0, 90],
    [-1, 0, 0, -1, 180],
    [0, 1, -1, 0, 270],
  ];
  const out: Orient[] = [];
  for (const mirrored of [false, true])
    for (const [a, b, c, d, rotation] of turns) {
      // Mirror x first, then turn.
      out.push(
        mirrored
          ? { a: -a, b, c: -c, d, rotation, mirrored }
          : { a, b, c, d, rotation, mirrored }
      );
    }
  return out;
})();

function normaliseBox(box: MatchBox): MatchBox {
  return {
    x: Math.min(box.x, box.x + box.width),
    y: Math.min(box.y, box.y + box.height),
    width: Math.abs(box.width),
    height: Math.abs(box.height),
  };
}

const wordKey = (w: string) => w.trim().toUpperCase();

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Why a find cut by a crossing line needs a look (`cutAcross`). */
export const CUT_THROUGH_REASON =
  "maybe — a line crosses it and cuts part of it; check it is the same symbol";

/**
 * Is the symbol line from q1 to q2 there, but CUT where something crosses it?
 * (Lines crossing symbols, track-c 2026-10-06.) Some CAD exports break a
 * device's own line where a wall or wire runs over it, so no whole segment
 * matches and the copy fell under MIN_COVERAGE with nothing said.
 *
 * Strict, so a merely MISSING line never passes: two or more collinear
 * pieces, each within the line's own ends (never a longer line), reaching
 * both ends; every gap between them short; and a line that is NOT this one
 * running through every gap. Returns the pieces, or null.
 */
function cutAcross(
  sheet: PreparedSheet,
  q1x: number,
  q1y: number,
  q2x: number,
  q2y: number,
  filled: number,
  tol: number,
  taken: ReadonlySet<number>
): number[] | null {
  const segs = sheet.geo.segs;
  const L = Math.hypot(q2x - q1x, q2y - q1y);
  if (L < 3 * tol) return null;
  const ux = (q2x - q1x) / L;
  const uy = (q2y - q1y) / L;
  const off = (x: number, y: number) =>
    Math.abs((x - q1x) * uy - (y - q1y) * ux);
  const along = (x: number, y: number) => (x - q1x) * ux + (y - q1y) * uy;
  const pieces: { i: number; s: number; e: number }[] = [];
  sheet.spans().near(
    {
      x0: Math.min(q1x, q2x) - tol,
      y0: Math.min(q1y, q2y) - tol,
      x1: Math.max(q1x, q2x) + tol,
      y1: Math.max(q1y, q2y) + tol,
    },
    i => {
      if (taken.has(i) || sheet.geo.filled[i] !== filled) return;
      const ax = segs[i * 4];
      const ay = segs[i * 4 + 1];
      const bx = segs[i * 4 + 2];
      const by = segs[i * 4 + 3];
      if (off(ax, ay) > tol || off(bx, by) > tol) return;
      const s = Math.min(along(ax, ay), along(bx, by));
      const e = Math.max(along(ax, ay), along(bx, by));
      if (s < -tol || e > L + tol || e - s <= 0) return;
      pieces.push({ i, s, e });
    }
  );
  if (pieces.length < 2) return null;
  pieces.sort((p, q) => p.s - q.s);
  if (pieces[0].s > tol) return null;
  const gaps: [number, number][] = [];
  let end = pieces[0].e;
  for (const p of pieces.slice(1)) {
    if (p.s > end) gaps.push([end, p.s]);
    end = Math.max(end, p.e);
  }
  if (end < L - tol || gaps.length === 0) return null;
  const maxGap = Math.max(3 * tol, 0.25 * L);
  const used = new Set(pieces.map(p => p.i));
  for (const [g0, g1] of gaps) {
    const w = g1 - g0;
    if (w > maxGap) return null;
    const mx = q1x + ux * ((g0 + g1) / 2);
    const my = q1y + uy * ((g0 + g1) / 2);
    const reach = w / 2 + tol;
    let crossed = false;
    sheet
      .spans()
      .near(
        { x0: mx - reach, y0: my - reach, x1: mx + reach, y1: my + reach },
        j => {
          if (crossed || used.has(j)) return;
          const ax = segs[j * 4];
          const ay = segs[j * 4 + 1];
          const dx = segs[j * 4 + 2] - ax;
          const dy = segs[j * 4 + 3] - ay;
          const l2 = dx * dx + dy * dy;
          if (l2 === 0) return;
          // Across the line, not along it.
          if (Math.abs((dx * ux + dy * uy) / Math.sqrt(l2)) > 0.95) return;
          // It must CROSS the line — ends on opposite sides — and do so in
          // the gap itself. A neighbour that merely comes near (the symbol's
          // own outline ending 1 pt from the gap) is not what cut it.
          const sa = (ax - q1x) * uy - (ay - q1y) * ux;
          const sb = (ax + dx - q1x) * uy - (ay + dy - q1y) * ux;
          if (sa * sb > 0) return;
          const t = sa / (sa - sb || 1e-9);
          const at = along(ax + t * dx, ay + t * dy);
          if (at >= g0 - 0.5 * tol && at <= g1 + 0.5 * tol) crossed = true;
        }
      );
    if (!crossed) return null;
  }
  return pieces.map(p => p.i);
}

/** Does segment i pass into the rectangle at all? (Liang–Barsky.) */
function segEntersRect(segs: Float32Array, i: number, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const ax = segs[i * 4];
  const ay = segs[i * 4 + 1];
  const dx = segs[i * 4 + 2] - ax;
  const dy = segs[i * 4 + 3] - ay;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, ax - r.x0) &&
    clip(dx, r.x1 - ax) &&
    clip(-dy, ay - r.y0) &&
    clip(dy, r.y1 - ay)
  );
}

/**
 * LINES RUNNING THROUGH an outline — a wall, a home run, a grid or dimension
 * line — as opposed to the symbol drawn inside it. A through-line is one or
 * more COLLINEAR pieces, end to end, that go in one side and out the other:
 * both of its extreme ends lie outside the outline.
 *
 * Why: "wholly inside the box" keeps any piece of a wall or wire that a CAD
 * export chopped up inside the box, and those pieces then become part of
 * "the symbol" that no other copy has. NOT seen on Weld 1 E-200, where no
 * template holds such a line (scripts/lineCrossingCheck.mts); the fixture in
 * findMatching.test.ts makes it happen. A line that ENDS at or inside the
 * outline — a double duplex's second pair, a receptacle's own lines that a
 * home run continues (the GFCI on E-200) — is not a through-line and stays.
 *
 * `candidates` must include the pieces crossing the outline's edge, wherever
 * their midpoints are; the caller knows how to find those.
 */
function throughLinePieces(
  segs: Float32Array,
  candidates: readonly number[],
  r: Rect,
  tol: number,
  /**
   * How far past the outline BOTH ends must reach. At a copy this is half
   * the symbol's size: on Weld 1 a double duplex's second pair pokes 1 and
   * 4 pt out of the duplex's outline, and is the very thing the "more lines
   * run through it" flag exists to see; a wall or wire runs on well past.
   * For the box the person drew, the box edge is the boundary (tol).
   */
  beyond: number = tol
): Set<number> {
  const grown = {
    x0: r.x0 - tol,
    y0: r.y0 - tol,
    x1: r.x1 + tol,
    y1: r.y1 + tol,
  };
  const list = candidates.filter(i => segEntersRect(segs, i, grown));
  const parent = list.map((_, k) => k);
  const find = (k: number): number =>
    parent[k] === k ? k : (parent[k] = find(parent[k]));
  const len = (i: number) =>
    Math.hypot(
      segs[i * 4 + 2] - segs[i * 4],
      segs[i * 4 + 3] - segs[i * 4 + 1]
    );
  for (let p = 0; p < list.length; p++)
    for (let q = p + 1; q < list.length; q++) {
      const i = list[p];
      const j = list[q];
      const li = len(i) || 1e-9;
      const ux = (segs[i * 4 + 2] - segs[i * 4]) / li;
      const uy = (segs[i * 4 + 3] - segs[i * 4 + 1]) / li;
      const lj = len(j) || 1e-9;
      const cos = Math.abs(
        (ux * (segs[j * 4 + 2] - segs[j * 4]) +
          uy * (segs[j * 4 + 3] - segs[j * 4 + 1])) /
          lj
      );
      if (cos < 0.999) continue;
      const off = (x: number, y: number) =>
        Math.abs((x - segs[i * 4]) * uy - (y - segs[i * 4 + 1]) * ux);
      if (off(segs[j * 4], segs[j * 4 + 1]) > tol) continue;
      if (off(segs[j * 4 + 2], segs[j * 4 + 3]) > tol) continue;
      const touch = [0, 2].some(a =>
        [0, 2].some(
          b =>
            Math.hypot(
              segs[i * 4 + a] - segs[j * 4 + b],
              segs[i * 4 + a + 1] - segs[j * 4 + b + 1]
            ) <= tol
        )
      );
      if (touch) parent[find(p)] = find(q);
    }
  const groups = new Map<number, number[]>();
  list.forEach((i, k) => {
    const g = groups.get(find(k));
    if (g) g.push(i);
    else groups.set(find(k), [i]);
  });
  const outside = (x: number, y: number) =>
    x < r.x0 - beyond ||
    x > r.x1 + beyond ||
    y < r.y0 - beyond ||
    y > r.y1 + beyond;
  const out = new Set<number>();
  groups.forEach(members => {
    // The extreme ends along the line's direction.
    const i0 = members.reduce((a, i) => (len(i) > len(a) ? i : a));
    const l0 = len(i0) || 1e-9;
    const ux = (segs[i0 * 4 + 2] - segs[i0 * 4]) / l0;
    const uy = (segs[i0 * 4 + 3] - segs[i0 * 4 + 1]) / l0;
    let lo: [number, number, number] = [Infinity, 0, 0];
    let hi: [number, number, number] = [-Infinity, 0, 0];
    for (const i of members)
      for (const a of [0, 2]) {
        const x = segs[i * 4 + a];
        const y = segs[i * 4 + a + 1];
        const t = x * ux + y * uy;
        if (t < lo[0]) lo = [t, x, y];
        if (t > hi[0]) hi = [t, x, y];
      }
    if (outside(lo[1], lo[2]) && outside(hi[1], hi[2]))
      members.forEach(i => out.add(i));
  });
  return out;
}

/** A grid of segment indices by midpoint, for "what is near here". */
class SegmentGrid {
  private cells = new Map<number, number[]>();
  constructor(
    private segs: Float32Array,
    private cell: number
  ) {
    const n = segs.length / 4;
    for (let i = 0; i < n; i++) {
      const mx = (segs[i * 4] + segs[i * 4 + 2]) / 2;
      const my = (segs[i * 4 + 1] + segs[i * 4 + 3]) / 2;
      const key = this.key(Math.floor(mx / cell), Math.floor(my / cell));
      const list = this.cells.get(key);
      if (list) list.push(i);
      else this.cells.set(key, [i]);
    }
  }
  private key(cx: number, cy: number) {
    return cx * 100003 + cy;
  }
  /** Every segment whose midpoint may lie within `r` of (x, y). */
  near(x: number, y: number, r: number, visit: (i: number) => void) {
    const x0 = Math.floor((x - r) / this.cell);
    const x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell);
    const y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(this.key(cx, cy));
        if (list) for (const i of list) visit(i);
      }
  }
}

type RelSeg = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  filled: number;
};
type RelWord = { text: string; dx: number; dy: number; height: number };

function qualifiers(words: readonly WordBox[]) {
  const device = new Set<string>();
  const status = {
    existing: [] as string[],
    remove: [] as string[],
    relocate: [] as string[],
  };
  for (const w of words) {
    const k = wordKey(w.text);
    if (DEVICE_WORDS.has(k)) device.add(k);
    if (EXISTING_WORDS.has(k)) status.existing.push(k);
    if (REMOVE_WORDS.has(k)) status.remove.push(k);
    if (RELOCATE_WORDS.has(k)) status.relocate.push(k);
  }
  return { device, status };
}

/**
 * The boxed symbol, ready to be searched for on any sheet: its line work and
 * words relative to its centre, plus what the look-alike flags compare with
 * (its shade, its device words, how much line work is joined onto it). Built
 * on the sheet it was boxed on — a legend sheet, or the plan itself.
 */
export type SymbolTemplate = {
  rel: RelSeg[];
  relWords: RelWord[];
  totalLength: number;
  symbolLightness: number;
  halfW: number;
  halfH: number;
  size: number;
  tol: number;
  /** Short line work joined onto the boxed one from outside (§ flags). */
  boxedJoined: number;
  /** Device words beside the boxed one (GF, WP…). */
  boxedDevice: ReadonlySet<string>;
  /** Where it was boxed, on its own sheet. */
  cx: number;
  cy: number;
  segments: number;
  words: string[];
};

export type SymbolFromBox =
  | { kind: "ok"; symbol: SymbolTemplate }
  | { kind: "scan" | "empty" | "tooBig"; message: string };

/**
 * A sheet indexed once for searching: segments by length, words by text, and
 * grids by cell size built on first use. Checking a sheet against a whole
 * legend searches it once per legend symbol; re-sorting ~100,000 segments for
 * each would be most of the time.
 */
export type PreparedSheet = {
  geo: VectorGeometry;
  words: readonly WordBox[];
  byLength: number[];
  lengths: Float64Array;
  wordIndex: Map<string, number[]>;
  grid: (cell: number) => SegmentGrid;
  /**
   * Segments by the cells their EXTENT covers, built on first use. The
   * midpoint grid cannot see a long wall crossing a symbol whose middle is
   * far away; this can. Used only by the cut-line test.
   */
  spans: () => SpanGrid;
  lengthOf: (i: number) => number;
};

/** Segments indexed by every cell their bounding box covers. */
class SpanGrid {
  private cells = new Map<number, number[]>();
  private static CELL = 16;
  constructor(segs: Float32Array) {
    const c = SpanGrid.CELL;
    const n = segs.length / 4;
    for (let i = 0; i < n; i++) {
      const x0 = Math.floor(Math.min(segs[i * 4], segs[i * 4 + 2]) / c);
      const x1 = Math.floor(Math.max(segs[i * 4], segs[i * 4 + 2]) / c);
      const y0 = Math.floor(Math.min(segs[i * 4 + 1], segs[i * 4 + 3]) / c);
      const y1 = Math.floor(Math.max(segs[i * 4 + 1], segs[i * 4 + 3]) / c);
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) {
          const k = cx * 100003 + cy;
          const l = this.cells.get(k);
          if (l) l.push(i);
          else this.cells.set(k, [i]);
        }
    }
  }
  /** Every segment whose extent's cells meet the rectangle, once each. */
  near(r: Rect, visit: (i: number) => void) {
    const c = SpanGrid.CELL;
    const seen = new Set<number>();
    for (let cx = Math.floor(r.x0 / c); cx <= Math.floor(r.x1 / c); cx++)
      for (let cy = Math.floor(r.y0 / c); cy <= Math.floor(r.y1 / c); cy++)
        for (const i of this.cells.get(cx * 100003 + cy) ?? [])
          if (!seen.has(i)) {
            seen.add(i);
            visit(i);
          }
  }
}

export function prepareSheet(
  geo: VectorGeometry,
  words: readonly WordBox[]
): PreparedSheet {
  const segs = geo.segs;
  const n = segs.length / 4;
  const lengthOf = (i: number) =>
    Math.hypot(
      segs[i * 4 + 2] - segs[i * 4],
      segs[i * 4 + 3] - segs[i * 4 + 1]
    );
  const byLength = Array.from({ length: n }, (_, i) => i).sort(
    (p, q) => lengthOf(p) - lengthOf(q)
  );
  const wordIndex = new Map<string, number[]>();
  words.forEach((w, i) => {
    const k = wordKey(w.text);
    const list = wordIndex.get(k);
    if (list) list.push(i);
    else wordIndex.set(k, [i]);
  });
  const grids = new Map<number, SegmentGrid>();
  let spanGrid: SpanGrid | null = null;
  return {
    spans: () => (spanGrid ??= new SpanGrid(segs)),
    geo,
    words,
    byLength,
    lengths: Float64Array.from(byLength.map(lengthOf)),
    wordIndex,
    lengthOf,
    grid: cell => {
      // Rounded so symbols of nearly one size share a grid.
      const key = Math.max(4, Math.round(cell));
      let g = grids.get(key);
      if (!g) {
        g = new SegmentGrid(segs, key);
        grids.set(key, g);
      }
      return g;
    },
  };
}

/** True when the page is a scanned picture: nothing here can see symbols. */
export function isScan(geo: VectorGeometry): boolean {
  return geo.imageCoverage > 0.4 && geo.segs.length / 4 < SCAN_MAX_SEGMENTS;
}

/**
 * Short line work JOINED onto a symbol from outside, of its shade. On Weld 1
 * the telecom triangle is also half of a bow-tie symbol (two triangles tip to
 * tip and a "+"): the other half touches this one and runs nowhere near its
 * middle, so "lines through it" cannot see it. Wires join every device too,
 * so a copy's count is compared with the boxed one's, not with zero.
 */
function joinedCount(
  sheet: PreparedSheet,
  t: Pick<SymbolTemplate, "size" | "tol" | "symbolLightness">,
  matched: ReadonlySet<number>,
  x: number,
  y: number,
  hw: number,
  hh: number
): number {
  const segs = sheet.geo.segs;
  const ends: number[] = [];
  matched.forEach(i => ends.push(i * 4, i * 4 + 2));
  let count = 0;
  sheet.grid(t.size / 2).near(x, y, 2 * t.size, i => {
    if (matched.has(i) || sheet.lengthOf(i) > 1.5 * t.size) return;
    if (Math.abs(sheet.geo.lightness[i] - t.symbolLightness) > LIGHTNESS_STEP)
      return;
    // Joined from OUTSIDE: a piece of the symbol itself that happened not to
    // match exactly lies inside, and is not "more" of anything.
    const mx = (segs[i * 4] + segs[i * 4 + 2]) / 2;
    const my = (segs[i * 4 + 1] + segs[i * 4 + 3]) / 2;
    if (Math.abs(mx - x) <= hw && Math.abs(my - y) <= hh) return;
    for (const p of [i * 4, i * 4 + 2])
      for (const e of ends)
        if (Math.hypot(segs[p] - segs[e], segs[p + 1] - segs[e + 1]) <= t.tol) {
          count += 1;
          return;
        }
  });
  return count;
}

/**
 * How much of a symbol's SHAPE is drawn at a place, whatever pieces it is
 * drawn in: points every `step` along each of its lines (turned by `o`,
 * moved to tx, ty), each counted when some line work no longer than three
 * symbols lies within `tol` of it (walls and long wires are not shape). The
 * line work touched is returned, for the look-alike flags.
 */
function shapeCoverage(
  sheet: PreparedSheet,
  rel: readonly RelSeg[],
  o: Orient,
  tx: number,
  ty: number,
  tol: number,
  size: number
): { coverage: number; touched: Set<number> } {
  const segs = sheet.geo.segs;
  const step = Math.max(0.35, size / 40);
  const points: [number, number][] = [];
  for (const r of rel) {
    const n = Math.max(1, Math.ceil(r.length / step));
    for (let k = 0; k <= n; k++) {
      const x = r.x1 + ((r.x2 - r.x1) * k) / n;
      const y = r.y1 + ((r.y2 - r.y1) * k) / n;
      points.push([o.a * x + o.b * y + tx, o.c * x + o.d * y + ty]);
    }
  }
  if (points.length === 0) return { coverage: 0, touched: new Set() };
  const grid = sheet.grid(size / 2);
  const touched = new Set<number>();
  const hits = (p: [number, number]) => {
    let hit = -1;
    grid.near(p[0], p[1], size, i => {
      if (hit >= 0) return;
      const ax = segs[i * 4];
      const ay = segs[i * 4 + 1];
      const bx = segs[i * 4 + 2];
      const by = segs[i * 4 + 3];
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
      if (len2 > (3 * size) ** 2) return;
      const t =
        len2 === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / len2
              )
            );
      const d = Math.hypot(
        ax + t * (bx - ax) - p[0],
        ay + t * (by - ay) - p[1]
      );
      if (d <= tol) hit = i;
    });
    if (hit >= 0) touched.add(hit);
    return hit >= 0;
  };
  // A cheap look first: 8 points spread over the symbol.
  const sample = Array.from(
    { length: 8 },
    (_, k) => points[Math.floor((k * points.length) / 8)]
  );
  if (sample.filter(hits).length < 6)
    return { coverage: 0, touched: new Set() };
  touched.clear();
  const found = points.filter(hits).length;
  return { coverage: found / points.length, touched };
}

/** Words within a symbol's reach of (x, y), less the ones that ARE it. */
function ringWords(
  words: readonly WordBox[],
  x: number,
  y: number,
  hw: number,
  hh: number,
  size: number,
  exclude: ReadonlySet<number>
): WordBox[] {
  const ringPad = Math.max(8, 0.9 * size);
  return words.filter(
    (w, i) =>
      !exclude.has(i) &&
      Math.abs(w.cx - x) <= hw + ringPad &&
      Math.abs(w.cy - y) <= hh + ringPad
  );
}

/** Box one symbol on a sheet, and every copy of it on the SAME sheet. */
export function findMatching(
  geo: VectorGeometry,
  words: readonly WordBox[],
  boxIn: MatchBox
): FindResult {
  const sheet = prepareSheet(geo, words);
  const made = symbolFromBox(sheet, boxIn);
  if (made.kind !== "ok") return made;
  const t = made.symbol;
  const found = searchSymbol(t, sheet, { boxedHere: true });
  if (found.kind !== "ok") return found;
  return {
    kind: "ok",
    matches: found.matches,
    symbol: {
      segments: t.segments,
      words: t.words,
      width: t.halfW * 2,
      height: t.halfH * 2,
    },
  };
}

/** The symbol inside `boxIn`, on the sheet it was drawn on. */
export function symbolFromBox(
  sheet: PreparedSheet,
  boxIn: MatchBox,
  opts: {
    /**
     * Words in the box that are NOT part of the symbol. A legend writes a
     * switching leg ("a") beside every switch; taken in, every plan switch
     * (legs a, b, c…) fails to match — measured: 0 of 4 on Weld 1 E-200.
     */
    ignoreWord?: (text: string) => boolean;
    /**
     * Keep only words that sit inside the symbol's own line work. A legend
     * writes labels BESIDE its symbols — "TV" beside UNCC's data-outlet
     * triangle, "OR" between two alternatives — and none of them is drawn on
     * the plan. A "J" inside a circle is inside, and stays.
     */
    wordsInsideLineWork?: boolean;
  } = {}
): SymbolFromBox {
  const geo = sheet.geo;
  const words = sheet.words;
  const box = normaliseBox(boxIn);
  const segs = geo.segs;
  const n = segs.length / 4;
  const pad = 0.5;
  const inBox = (x: number, y: number) =>
    x >= box.x - pad &&
    x <= box.x + box.width + pad &&
    y >= box.y - pad &&
    y <= box.y + box.height + pad;

  /*
    A SCAN is refused whatever is in the box. Measured on Old Blueridge
    (2026-10-01): its sheets are one picture and 0 segments, but carry an
    OCR text layer (184 words on E1.01) — and a box that landed on an OCR'd
    word was "matched" as a words-only symbol, 2 boxes in 64. A guess on a
    scan is exactly what this must never give, so the page decides first.
  */
  if (geo.imageCoverage > 0.4 && n < SCAN_MAX_SEGMENTS)
    return { kind: "scan", message: SCAN_MESSAGE };

  // ── The symbol ──────────────────────────────────────────────────────────
  const wholly: number[] = [];
  const boxRect: Rect = {
    x0: box.x - pad,
    y0: box.y - pad,
    x1: box.x + box.width + pad,
    y1: box.y + box.height + pad,
  };
  const crossingEdge: number[] = [];
  for (let i = 0; i < n; i++) {
    if (
      inBox(segs[i * 4], segs[i * 4 + 1]) &&
      inBox(segs[i * 4 + 2], segs[i * 4 + 3])
    )
      wholly.push(i);
    else if (segEntersRect(segs, i, boxRect)) crossingEdge.push(i);
  }
  // Pieces of a line running THROUGH the box are not the symbol, however
  // short (throughLinePieces). Only when something crosses the edge at all.
  const through =
    crossingEdge.length > 0 && wholly.length <= MAX_SYMBOL_SEGMENTS
      ? throughLinePieces(segs, [...wholly, ...crossingEdge], boxRect, 0.5)
      : new Set<number>();
  const boxed = wholly.filter(i => !through.has(i));
  if (boxed.length > MAX_SYMBOL_SEGMENTS)
    return {
      kind: "tooBig",
      message:
        "That box holds much more than one symbol. Draw it snugly round just one.",
    };
  /*
    A snug box still holds whatever is drawn BEHIND the symbol — on Weld 1
    the GFCI sits on a gray outline of the wall it is in. Kept in, that
    outline becomes part of "the symbol" and no other GFCI has it. So when
    the box holds clearly different shades, the symbol is the shade with the
    most line length in it, and the rest is background.
  */
  const lengthAt = (i: number) =>
    Math.hypot(
      segs[i * 4 + 2] - segs[i * 4],
      segs[i * 4 + 3] - segs[i * 4 + 1]
    );
  const byShade = new Map<number, number>();
  for (const i of boxed) {
    const shade = Math.round(geo.lightness[i] / LIGHTNESS_STEP);
    byShade.set(shade, (byShade.get(shade) ?? 0) + lengthAt(i));
  }
  let symbolShade = 0;
  let mostLength = -1;
  byShade.forEach((len, shade) => {
    if (len > mostLength) {
      mostLength = len;
      symbolShade = shade;
    }
  });
  const symbolSegs = boxed.filter(
    i => Math.round(geo.lightness[i] / LIGHTNESS_STEP) === symbolShade
  );
  let symbolWords = words.filter(
    w => inBox(w.cx, w.cy) && !opts.ignoreWord?.(w.text)
  );
  if (opts.wordsInsideLineWork && symbolSegs.length > 0) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const i of symbolSegs) {
      x0 = Math.min(x0, segs[i * 4], segs[i * 4 + 2]);
      x1 = Math.max(x1, segs[i * 4], segs[i * 4 + 2]);
      y0 = Math.min(y0, segs[i * 4 + 1], segs[i * 4 + 3]);
      y1 = Math.max(y1, segs[i * 4 + 1], segs[i * 4 + 3]);
    }
    symbolWords = symbolWords.filter(
      w => w.cx >= x0 - 1 && w.cx <= x1 + 1 && w.cy >= y0 - 1 && w.cy <= y1 + 1
    );
  }

  if (symbolSegs.length === 0 && symbolWords.length === 0) {
    if (geo.imageCoverage > 0.4) return { kind: "scan", message: SCAN_MESSAGE };
    return {
      kind: "empty",
      message:
        "Nothing is drawn inside that box. Draw it snugly round one symbol.",
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const i of symbolSegs) {
    grow(segs[i * 4], segs[i * 4 + 1]);
    grow(segs[i * 4 + 2], segs[i * 4 + 3]);
  }
  for (const w of symbolWords) {
    grow(w.x0, w.y0);
    grow(w.x1, w.y1);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfW = Math.max(0.5, (maxX - minX) / 2);
  const halfH = Math.max(0.5, (maxY - minY) / 2);
  const size = Math.max(halfW, halfH) * 2;
  const tol = Math.max(0.75, 0.06 * size);

  const rel: RelSeg[] = symbolSegs.map(i => {
    const x1 = segs[i * 4] - cx;
    const y1 = segs[i * 4 + 1] - cy;
    const x2 = segs[i * 4 + 2] - cx;
    const y2 = segs[i * 4 + 3] - cy;
    return {
      x1,
      y1,
      x2,
      y2,
      length: Math.hypot(x2 - x1, y2 - y1),
      filled: geo.filled[i],
    };
  });
  const totalLength = rel.reduce((s, r) => s + r.length, 0);
  const symbolLightness = symbolSegs.length
    ? symbolSegs.reduce((s, i, k) => s + geo.lightness[i] * rel[k].length, 0) /
      Math.max(1e-9, totalLength)
    : 0;
  const relWords: RelWord[] = symbolWords.map(w => ({
    text: wordKey(w.text),
    dx: w.cx - cx,
    dy: w.cy - cy,
    height: w.height,
  }));

  // What the flags compare a copy with, measured where it was boxed.
  const shape = { size, tol, symbolLightness };
  const boxedJoined = joinedCount(
    sheet,
    shape,
    new Set(symbolSegs),
    cx,
    cy,
    halfW,
    halfH
  );
  const symbolUsedWords = new Set(
    symbolWords.map(w => words.indexOf(w)).filter(i => i >= 0)
  );
  const boxedDevice = qualifiers(
    ringWords(words, cx, cy, halfW, halfH, size, symbolUsedWords)
  ).device;

  return {
    kind: "ok",
    symbol: {
      rel,
      relWords,
      totalLength,
      symbolLightness,
      halfW,
      halfH,
      size,
      tol,
      boxedJoined,
      boxedDevice,
      cx,
      cy,
      segments: symbolSegs.length,
      words: symbolWords.map(w => w.text),
    },
  };
}

/**
 * The same symbol drawn `scale` times as big. A legend is not always drawn
 * at the plan's size: UNCC's data-outlet triangle is about 15% smaller on its
 * legend than on E111, beyond the matcher's tolerance. Searching at a few
 * sizes is the caller's choice (and its cost); see `sheetCheck.findSpots`.
 */
export function scaleTemplate(
  t: SymbolTemplate,
  scale: number
): SymbolTemplate {
  const size = t.size * scale;
  return {
    ...t,
    rel: t.rel.map(r => ({
      ...r,
      x1: r.x1 * scale,
      y1: r.y1 * scale,
      x2: r.x2 * scale,
      y2: r.y2 * scale,
      length: r.length * scale,
    })),
    relWords: t.relWords.map(w => ({
      ...w,
      dx: w.dx * scale,
      dy: w.dy * scale,
      height: w.height * scale,
    })),
    totalLength: t.totalLength * scale,
    halfW: t.halfW * scale,
    halfH: t.halfH * scale,
    size,
    tol: Math.max(0.75, 0.06 * size),
  };
}

export type SearchResult =
  | { kind: "ok"; matches: Match[] }
  | { kind: "scan" | "empty"; message: string };

/**
 * Every copy of `t` on `sheet` — the sheet it was boxed on, or another one
 * (a legend symbol searched for on a plan). `boxedHere` marks the copy that
 * IS the boxed one; only meaningful on the sheet it was boxed on.
 */
export function searchSymbol(
  t: SymbolTemplate,
  sheet: PreparedSheet,
  opts: { boxedHere?: boolean } = {}
): SearchResult {
  const geo = sheet.geo;
  const words = sheet.words;
  const segs = geo.segs;
  if (isScan(geo)) return { kind: "scan", message: SCAN_MESSAGE };
  const {
    rel,
    relWords,
    totalLength,
    symbolLightness,
    halfW,
    halfH,
    size,
    tol,
    boxedJoined,
    cx,
    cy,
  } = t;
  const grid = sheet.grid(size / 2);
  const lengthOf = sheet.lengthOf;

  // ── The anchor: the symbol's rarest part on this sheet ──────────────────
  const { byLength, lengths } = sheet;
  const lowerBound = (v: number) => {
    let lo = 0;
    let hi = lengths.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const lengthRange = (len: number) => {
    const t = Math.max(0.5, 0.04 * len);
    return [lowerBound(len - t), lowerBound(len + t + 1e-9)] as const;
  };

  type Anchor = { kind: "seg"; k: number } | { kind: "word"; k: number };
  let anchor: Anchor | null = null;
  let anchorCount = Infinity;
  rel.forEach((r, k) => {
    if (r.length < Math.max(1, 0.12 * size)) return;
    const [lo, hi] = lengthRange(r.length);
    const count = hi - lo;
    if (
      count < anchorCount ||
      (count === anchorCount &&
        anchor?.kind === "seg" &&
        r.length > rel[anchor.k].length)
    ) {
      anchor = { kind: "seg", k };
      anchorCount = count;
    }
  });
  relWords.forEach((w, k) => {
    const count = words.filter(
      p =>
        wordKey(p.text) === w.text &&
        Math.abs(p.height - w.height) <= 0.25 * w.height
    ).length;
    if (count < anchorCount) {
      anchor = { kind: "word", k };
      anchorCount = count;
    }
  });
  if (!anchor)
    return {
      kind: "empty",
      message:
        "That box holds only tiny pieces of line work. Draw it round the whole symbol.",
    };
  const chosen = anchor as Anchor;

  /*
    A SECOND anchor, of another length. A copy whose anchor line is cut in
    two where a wall crosses it has no whole segment of that length, and was
    never even tried (track-c 2026-10-06, lines crossing symbols). The next
    rarest line, if the copy still has it whole, gives it a chance.
  */
  let second: number | null = null;
  if (chosen.kind === "seg") {
    const [clo, chi] = lengthRange(rel[chosen.k].length);
    let secondCount = Infinity;
    rel.forEach((r, k) => {
      if (r.length < Math.max(1, 0.12 * size)) return;
      const [lo, hi] = lengthRange(r.length);
      if (lo < chi && hi > clo) return; // the same length band as the first
      if (hi - lo < secondCount) {
        second = k;
        secondCount = hi - lo;
      }
    });
  }

  // ── Candidate places and orientations ───────────────────────────────────
  const candidates: { tx: number; ty: number; o: Orient }[] = [];
  const anchorSegs =
    chosen.kind === "seg"
      ? second === null
        ? [chosen.k]
        : [chosen.k, second as number]
      : [];
  for (const k of anchorSegs) {
    const a = rel[k];
    const [lo, hi] = lengthRange(a.length);
    for (let s = lo; s < hi; s++) {
      const i = byLength[s];
      if (geo.filled[i] !== a.filled) continue;
      const px1 = segs[i * 4];
      const py1 = segs[i * 4 + 1];
      const px2 = segs[i * 4 + 2];
      const py2 = segs[i * 4 + 3];
      const pl = lengthOf(i) || 1;
      const vx = (px2 - px1) / pl;
      const vy = (py2 - py1) / pl;
      for (const o of ORIENTS) {
        const ax1 = o.a * a.x1 + o.b * a.y1;
        const ay1 = o.c * a.x1 + o.d * a.y1;
        const ax2 = o.a * a.x2 + o.b * a.y2;
        const ay2 = o.c * a.x2 + o.d * a.y2;
        const al = Math.hypot(ax2 - ax1, ay2 - ay1) || 1;
        const dot = ((ax2 - ax1) * vx + (ay2 - ay1) * vy) / al;
        if (dot > 0.995) candidates.push({ tx: px1 - ax1, ty: py1 - ay1, o });
        else if (dot < -0.995)
          candidates.push({ tx: px2 - ax1, ty: py2 - ay1, o });
      }
    }
  }
  if (chosen.kind === "word") {
    const w = relWords[chosen.k];
    for (const p of words) {
      if (wordKey(p.text) !== w.text) continue;
      if (Math.abs(p.height - w.height) > 0.25 * w.height) continue;
      for (const o of ORIENTS) {
        candidates.push({
          tx: p.cx - (o.a * w.dx + o.b * w.dy),
          ty: p.cy - (o.c * w.dx + o.d * w.dy),
          o,
        });
        // Text that stays upright while the block turns.
        candidates.push({ tx: p.cx - w.dx, ty: p.cy - w.dy, o });
      }
    }
  }

  // ── Check each one ──────────────────────────────────────────────────────
  type Found = {
    tx: number;
    ty: number;
    o: Orient;
    coverage: number;
    matched: Set<number>;
    usedWords: Set<number>;
    /** Only there once lines cut by a crossing line are counted. */
    cutThrough: boolean;
  };
  const found: Found[] = [];
  const seen = new Set<string>();
  const wordIndex = sheet.wordIndex;

  for (const cand of candidates) {
    const sig = `${Math.round(cand.tx * 2)},${Math.round(cand.ty * 2)},${cand.o.rotation},${cand.o.mirrored}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const { tx, ty, o } = cand;

    let matchedLength = 0;
    let missingLength = 0;
    let cutLength = 0;
    const matched = new Set<number>();
    const cutPieces = new Set<number>();
    let failed = false;
    for (const r of rel) {
      const q1x = o.a * r.x1 + o.b * r.y1 + tx;
      const q1y = o.c * r.x1 + o.d * r.y1 + ty;
      const q2x = o.a * r.x2 + o.b * r.y2 + tx;
      const q2y = o.c * r.x2 + o.d * r.y2 + ty;
      let hit = -1;
      grid.near((q1x + q2x) / 2, (q1y + q2y) / 2, tol + 0.5, i => {
        if (hit >= 0 || matched.has(i) || geo.filled[i] !== r.filled) return;
        const ax = segs[i * 4];
        const ay = segs[i * 4 + 1];
        const bx = segs[i * 4 + 2];
        const by = segs[i * 4 + 3];
        const same =
          Math.hypot(ax - q1x, ay - q1y) <= tol &&
          Math.hypot(bx - q2x, by - q2y) <= tol;
        const swapped =
          Math.hypot(ax - q2x, ay - q2y) <= tol &&
          Math.hypot(bx - q1x, by - q1y) <= tol;
        if (same || swapped) hit = i;
      });
      if (hit >= 0) {
        matched.add(hit);
        matchedLength += r.length;
        continue;
      }
      // Not whole — but maybe CUT where a line crosses it (cutAcross). Only
      // asked once something here has matched, which keeps the search fast.
      const cut =
        matchedLength > 0
          ? cutAcross(sheet, q1x, q1y, q2x, q2y, r.filled, tol, matched)
          : null;
      if (cut) {
        cutLength += r.length;
        cut.forEach(i => cutPieces.add(i));
        continue;
      }
      missingLength += r.length;
      if (totalLength > 0 && missingLength / totalLength > 1 - MIN_COVERAGE) {
        failed = true;
        break;
      }
    }
    let coverage = totalLength > 0 ? matchedLength / totalLength : 1;
    /*
      A copy that is only there once its cut lines are counted is OFFERED,
      flagged — never clear, never silently dropped (track-c, 2026-10-06):
      the person decides whether the line through it hides the same device.
      One that reaches MIN_COVERAGE whole is an ordinary find; its cut
      pieces are its own line work either way.
    */
    let cutThrough = false;
    if (!failed) {
      cutPieces.forEach(i => matched.add(i));
      if (totalLength > 0 && coverage < MIN_COVERAGE) {
        cutThrough = true;
        coverage = (matchedLength + cutLength) / totalLength;
      }
    }
    if (failed) {
      /*
        The same symbol, cut into different pieces. UNCC's legend draws the
        junction box's circle as 14 short segments and E111 draws it as 7 —
        two CAD blocks — so segment-to-segment never matches (0 of 20, at any
        size). Fallback: points along the symbol's lines, each needing some
        short line work within `tol`, after a cheap 8-point look.

        ONLY for a look with a WORD in it (the J), which the word check below
        then has to find. Shape alone ignores filled-or-not (all that tells a
        GFCI from a duplex on Weld 1) and a duplex's shape lies wholly inside
        a double duplex: tried without the word rule, Weld 1 E-200 went from
        0 to 12 duplex "copies" on no mark and gained a silent mix-up.
      */
      if (relWords.length === 0) continue;
      const shape = shapeCoverage(sheet, rel, o, tx, ty, tol, size);
      if (shape.coverage < MIN_COVERAGE) continue;
      shape.touched.forEach(i => matched.add(i));
      coverage = shape.coverage;
    }

    const usedWords = new Set<number>();
    let wordsOk = true;
    for (const w of relWords) {
      const turned = {
        x: o.a * w.dx + o.b * w.dy + tx,
        y: o.c * w.dx + o.d * w.dy + ty,
      };
      const upright = { x: w.dx + tx, y: w.dy + ty };
      const reach = Math.max(tol, 0.4 * w.height);
      const hit = (wordIndex.get(w.text) ?? []).find(
        i =>
          !usedWords.has(i) &&
          (Math.hypot(words[i].cx - turned.x, words[i].cy - turned.y) <=
            reach ||
            Math.hypot(words[i].cx - upright.x, words[i].cy - upright.y) <=
              reach)
      );
      if (hit === undefined) {
        wordsOk = false;
        break;
      }
      usedWords.add(hit);
    }
    if (!wordsOk) continue;

    found.push({
      tx,
      ty,
      o,
      coverage,
      matched,
      usedWords,
      cutThrough,
    });
  }

  // One answer per place: the best-covered orientation wins.
  found.sort((p, q) => q.coverage - p.coverage);
  const kept: Found[] = [];
  for (const f of found) {
    if (kept.some(k => Math.hypot(k.tx - f.tx, k.ty - f.ty) < 0.5 * size))
      continue;
    kept.push(f);
  }

  // ── Flags ───────────────────────────────────────────────────────────────
  // Joined line work and device words, compared with the boxed one's
  // (measured where it was boxed — `symbolFromBox`).
  // Labels: each tied to its nearest copy (tieLabels). The boxed one's own
  // words come from the same rule when it is on this sheet, so it is never
  // compared with a different reading of itself; a template from a legend
  // keeps the words read round it there.
  const symbolWords = new Set<number>();
  kept.forEach(f => f.usedWords.forEach(i => symbolWords.add(i)));
  const ties = tieLabels(
    words,
    kept.map(f => ({ x: f.tx, y: f.ty })),
    symbolWords
  );
  const boxedAt =
    opts.boxedHere === true
      ? kept.findIndex(f => Math.hypot(f.tx - cx, f.ty - cy) <= 2 * tol)
      : -1;
  const tiedWords = (k: number) => ties[k].map(t => words[t.word]);
  const boxedQ = {
    device:
      boxedAt >= 0 ? qualifiers(tiedWords(boxedAt)).device : t.boxedDevice,
    tags:
      boxedAt >= 0
        ? tiedWords(boxedAt)
            .filter(w => labelKind(w.text) === "fixtureTag")
            .map(w => wordKey(w.text))
        : [],
  };

  const matches: Match[] = kept.map((f, k) => {
    const turned = f.o.rotation === 90 || f.o.rotation === 270;
    const hw = turned ? halfH : halfW;
    const hh = turned ? halfW : halfH;
    const needsLook: string[] = [];
    const maybeExisting: string[] = [];
    if (f.cutThrough) needsLook.push(CUT_THROUGH_REASON);

    // Lighter or darker than the boxed one.
    if (f.matched.size > 0 && rel.length > 0) {
      let sum = 0;
      let len = 0;
      f.matched.forEach(i => {
        const l = lengthOf(i);
        sum += geo.lightness[i] * l;
        len += l;
      });
      const lightness = sum / Math.max(1e-9, len);
      if (lightness - symbolLightness > LIGHTNESS_STEP)
        maybeExisting.push("drawn lighter than the one you boxed");
      else if (symbolLightness - lightness > LIGHTNESS_STEP)
        needsLook.push("drawn darker than the one you boxed");
    }

    /*
      Line work running THROUGH it that the boxed one does not have — the
      sign of a bigger symbol that contains this one. On Weld 1 a duplex is a
      circle and one pair of lines, a double duplex the same circle with a
      second pair across it, so every double duplex holds a perfect duplex.
      The second pair reaches past the duplex's outline, so "wholly inside"
      never saw it (measured: 1 of 5 flagged); its MIDDLE is inside, and a
      wire that only ends at the circle has its middle outside.
    */
    if (totalLength > 0) {
      // A wall or wire running right through, well past it on both sides,
      // is not "more symbol" (throughLinePieces). A second pair that only
      // just pokes out — the double duplex — still is.
      const near: number[] = [];
      grid.near(f.tx, f.ty, Math.max(hw, hh) + 3 * size, i => {
        if (!f.matched.has(i)) near.push(i);
      });
      const through = throughLinePieces(
        segs,
        near,
        { x0: f.tx - hw, y0: f.ty - hh, x1: f.tx + hw, y1: f.ty + hh },
        tol,
        Math.max(tol, 0.5 * size)
      );
      let extra = 0;
      grid.near(f.tx, f.ty, Math.max(hw, hh) + size, i => {
        if (f.matched.has(i) || through.has(i)) return;
        const l = lengthOf(i);
        if (l > 1.5 * size) return;
        const mx = (segs[i * 4] + segs[i * 4 + 2]) / 2;
        const my = (segs[i * 4 + 1] + segs[i * 4 + 3]) / 2;
        if (
          Math.abs(mx - f.tx) <= hw &&
          Math.abs(my - f.ty) <= hh &&
          Math.abs(geo.lightness[i] - symbolLightness) <= LIGHTNESS_STEP
        )
          extra += l;
      });
      if (extra > 0.2 * totalLength)
        needsLook.push(
          "more lines run through it than the one you boxed — it may be a different symbol"
        );
      else if (
        joinedCount(sheet, t, f.matched, f.tx, f.ty, hw, hh) - boxedJoined >=
        2
      )
        needsLook.push(
          "more lines are joined onto it than the one you boxed — it may be part of a bigger symbol"
        );
    }

    /*
      A word INSIDE it that the boxed one does not have: a letter in a circle
      is a different symbol from the circle. On Weld 1 the legend's "open
      downlight" is a plain circle, which fits inside every junction box's
      circle-with-a-J — 5 junction boxes tied with a downlight until this.
    */
    const inside = words.filter(
      (w, i) =>
        !f.usedWords.has(i) &&
        Math.abs(w.cx - f.tx) <= 0.8 * hw &&
        Math.abs(w.cy - f.ty) <= 0.8 * hh
    );
    if (inside.length)
      needsLook.push(
        `"${inside[0].text.trim()}" is written inside it — the one you boxed has no "${inside[0].text.trim()}"`
      );

    // Words beside it: the labels tied to THIS copy.
    const mine = tiedWords(k);
    const q = qualifiers(mine);
    q.device.forEach(w => {
      if (!boxedQ.device.has(w)) needsLook.push(deviceWordFlag(w));
    });
    boxedQ.device.forEach(w => {
      if (!q.device.has(w))
        needsLook.push(`no "${w}" beside it, unlike the one you boxed`);
    });
    // Said of each copy on its own. Comparing with the boxed one's "(E)"
    // flagged 8 of 9 new duplexes on Weld 1 because the one boxed was
    // existing — noise, and noise teaches people to skip the flags.
    if (q.status.existing.length)
      maybeExisting.push(`"${q.status.existing[0]}" is written beside it`);
    if (q.status.remove.length)
      needsLook.push(`"${q.status.remove[0]}" beside it — maybe to be removed`);
    if (q.status.relocate.length)
      needsLook.push(`"${q.status.relocate[0]}" beside it — maybe relocated`);
    // A different fixture tag is a different fixture type, drawn alike.
    const tags = mine
      .filter(w => labelKind(w.text) === "fixtureTag")
      .map(w => wordKey(w.text));
    if (
      boxedQ.tags.length &&
      tags.length &&
      !tags.some(x => boxedQ.tags.includes(x))
    )
      needsLook.push(
        `tag "${tags[0]}" beside it — the one you boxed has "${boxedQ.tags[0]}"`
      );
    const shared = ties[k].filter(t => t.shared).map(t => words[t.word].text);
    if (shared.length)
      needsLook.push(
        `"${shared[0]}" sits between this and another find — it may belong to the other`
      );

    return {
      labels: mine.map(w => w.text.trim()),
      x: f.tx,
      y: f.ty,
      halfWidth: hw,
      halfHeight: hh,
      rotation: f.o.rotation,
      mirrored: f.o.mirrored,
      coverage: f.coverage,
      needsLook,
      maybeExisting,
      isBoxed:
        opts.boxedHere === true && Math.hypot(f.tx - cx, f.ty - cy) <= 2 * tol,
      onDemolitionPlan: null,
    };
  });

  matches.sort((p, q) => p.y - q.y || p.x - q.x);
  return { kind: "ok", matches };
}

/**
 * The words beside a point, sorted into the kinds the flags use. Exported
 * for the sheet check (@/lib/sheetCheck), so "a device word" means one thing
 * in both.
 */
export function wordKinds(words: readonly WordBox[]) {
  return qualifiers(words);
}
