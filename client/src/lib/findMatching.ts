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
      };
    }
  | { kind: "scan" | "empty" | "tooBig"; message: string };

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

export function findMatching(
  geo: VectorGeometry,
  words: readonly WordBox[],
  boxIn: MatchBox
): FindResult {
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
  const boxed: number[] = [];
  for (let i = 0; i < n; i++) {
    if (
      inBox(segs[i * 4], segs[i * 4 + 1]) &&
      inBox(segs[i * 4 + 2], segs[i * 4 + 3])
    )
      boxed.push(i);
  }
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
  const symbolWords = words.filter(w => inBox(w.cx, w.cy));

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

  const grid = new SegmentGrid(segs, Math.max(4, size / 2));
  const lengthOf = lengthAt;

  // ── The anchor: the symbol's rarest part on this sheet ──────────────────
  const byLength = Array.from({ length: n }, (_, i) => i).sort(
    (p, q) => lengthOf(p) - lengthOf(q)
  );
  const lengths = Float64Array.from(byLength.map(lengthOf));
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

  // ── Candidate places and orientations ───────────────────────────────────
  const candidates: { tx: number; ty: number; o: Orient }[] = [];
  if (chosen.kind === "seg") {
    const a = rel[chosen.k];
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
  } else {
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
  };
  const found: Found[] = [];
  const seen = new Set<string>();
  const wordIndex = new Map<string, number[]>();
  words.forEach((w, i) => {
    const k = wordKey(w.text);
    const list = wordIndex.get(k);
    if (list) list.push(i);
    else wordIndex.set(k, [i]);
  });

  for (const cand of candidates) {
    const sig = `${Math.round(cand.tx * 2)},${Math.round(cand.ty * 2)},${cand.o.rotation},${cand.o.mirrored}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const { tx, ty, o } = cand;

    let matchedLength = 0;
    let missingLength = 0;
    const matched = new Set<number>();
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
      } else {
        missingLength += r.length;
        if (totalLength > 0 && missingLength / totalLength > 1 - MIN_COVERAGE) {
          failed = true;
          break;
        }
      }
    }
    if (failed) continue;

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
      coverage: totalLength > 0 ? matchedLength / totalLength : 1,
      matched,
      usedWords,
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
  /*
    Short line work JOINED onto a copy, of its shade. On Weld 1 the telecom
    triangle is also half of a bow-tie symbol (two triangles tip to tip and a
    "+"): the other half touches this one and runs nowhere near its middle,
    so "lines through it" cannot see it. Wires join every device too, so the
    count is compared with the boxed one's, not with zero.
  */
  const joinedCount = (
    matched: ReadonlySet<number>,
    x: number,
    y: number,
    hw: number,
    hh: number
  ) => {
    const ends: number[] = [];
    matched.forEach(i => ends.push(i * 4, i * 4 + 2));
    let count = 0;
    grid.near(x, y, 2 * size, i => {
      if (matched.has(i) || lengthOf(i) > 1.5 * size) return;
      if (Math.abs(geo.lightness[i] - symbolLightness) > LIGHTNESS_STEP) return;
      // Joined from OUTSIDE: a piece of the symbol itself that happened not
      // to match exactly lies inside, and is not "more" of anything.
      const mx = (segs[i * 4] + segs[i * 4 + 2]) / 2;
      const my = (segs[i * 4 + 1] + segs[i * 4 + 3]) / 2;
      if (Math.abs(mx - x) <= hw && Math.abs(my - y) <= hh) return;
      for (const p of [i * 4, i * 4 + 2])
        for (const e of ends)
          if (Math.hypot(segs[p] - segs[e], segs[p + 1] - segs[e + 1]) <= tol) {
            count += 1;
            return;
          }
    });
    return count;
  };
  const boxedJoined = joinedCount(new Set(symbolSegs), cx, cy, halfW, halfH);
  const ringPad = Math.max(8, 0.9 * size);
  const symbolUsedWords = new Set(
    symbolWords.map(w => words.indexOf(w)).filter(i => i >= 0)
  );
  const ringWords = (
    x: number,
    y: number,
    hw: number,
    hh: number,
    exclude: Set<number>
  ) =>
    words.filter(
      (w, i) =>
        !exclude.has(i) &&
        Math.abs(w.cx - x) <= hw + ringPad &&
        Math.abs(w.cy - y) <= hh + ringPad
    );
  const boxedQ = qualifiers(ringWords(cx, cy, halfW, halfH, symbolUsedWords));

  const matches: Match[] = kept.map(f => {
    const turned = f.o.rotation === 90 || f.o.rotation === 270;
    const hw = turned ? halfH : halfW;
    const hh = turned ? halfW : halfH;
    const needsLook: string[] = [];
    const maybeExisting: string[] = [];

    // Lighter or darker than the boxed one.
    if (f.matched.size > 0 && symbolSegs.length > 0) {
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
      let extra = 0;
      grid.near(f.tx, f.ty, Math.max(hw, hh) + size, i => {
        if (f.matched.has(i)) return;
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
      else if (joinedCount(f.matched, f.tx, f.ty, hw, hh) - boxedJoined >= 2)
        needsLook.push(
          "more lines are joined onto it than the one you boxed — it may be part of a bigger symbol"
        );
    }

    // Words beside it.
    const q = qualifiers(ringWords(f.tx, f.ty, hw, hh, f.usedWords));
    q.device.forEach(w => {
      if (!boxedQ.device.has(w))
        needsLook.push(
          `"${w}" is written beside it — the one you boxed has no "${w}"`
        );
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

    return {
      x: f.tx,
      y: f.ty,
      halfWidth: hw,
      halfHeight: hh,
      rotation: f.o.rotation,
      mirrored: f.o.mirrored,
      coverage: f.coverage,
      needsLook,
      maybeExisting,
      isBoxed: Math.hypot(f.tx - cx, f.ty - cy) <= 2 * tol,
    };
  });

  matches.sort((p, q) => p.y - q.y || p.x - q.x);
  return {
    kind: "ok",
    matches,
    symbol: {
      segments: symbolSegs.length,
      words: symbolWords.map(w => w.text),
      width: halfW * 2,
      height: halfH * 2,
    },
  };
}
