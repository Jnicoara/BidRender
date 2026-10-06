/**
 * HOMERUNS, read from a vector sheet by code — no AI. Read-only.
 *
 * A homerun is drawn as a wire that ends in an ARROWHEAD (pointing "to the
 * panel") with a CIRCUIT TAG beside the tip: "3LP-23,25", "GL-22",
 * "(E) L1-14", "EXISTING / 1S-9,11". This reads the tag, finds the arrow it
 * belongs to, counts the arrowheads (one per circuit on these sets), reads
 * the wire count where the drawing marks one, and ties each circuit to the
 * panel schedule read off the set (@/lib/panelSchedules).
 *
 * ── Measured 2026-10-06 (track-c, `codeFirstCeiling.mts homerunreader`) ────
 * - The arrowheads are long thin FILLED triangles: two 9 pt sides on a
 *   3 pt base, on Weld 1 and weld2 alike. The 2026-10-06 ceiling study capped
 *   a side at 8 pt and so found no tag near any arrow — that, not the
 *   drawings, is why it called homeruns inconclusive.
 * - Several circuits stack their heads tip-to-base along the wire:
 *   "3LP-23,25" carries two. `heads` reports the count as drawn.
 * - UNCC draws NO wiring on any sheet: every device carries its own "2B-1"
 *   tag, and its only arrows are keynote leaders. There is no homerun to
 *   read there, and the reader must find none (it is the false-positive
 *   test).
 * - No test sheet draws tick marks; wire size and count appear only as a
 *   written note under a few tags ("(3) #12 THWN CU & 1 #12 CU GRD").
 *
 * WIRE COUNTS ARE NEVER INFERRED. Whether two circuits share a neutral is
 * something the estimator knows and the drawing may not say; guessing it puts
 * a wrong wire quantity on a bid (the same rule as `conductorCount` in
 * drizzle/schema.ts). With no ticks and no note, the answer is "not marked".
 */
import type { PanelCircuit, PanelSchedule } from "./panelSchedules";

/** A word on the page: text, bounds and centre in page points, y down. */
export type HomerunWord = {
  text: string;
  x0: number;
  x1: number;
  cx: number;
  cy: number;
  height: number;
};

/** The two geometry arrays this needs (@/lib/vectorGeometry). */
export type HomerunGeometry = {
  /** x1, y1, x2, y2 per segment, page points. */
  segs: Float32Array;
  /** 1 when the segment's path is filled. */
  filled: Uint8Array;
  /** 0 (black) … 255 (white) per segment. */
  lightness: Uint8Array;
};

export type CircuitTag = {
  /** As printed, words joined: "3LP-23,25", "(E) L1-14". */
  text: string;
  panel: string;
  circuits: number[];
  /** "(E)" or EXISTING beside it. */
  existing: boolean;
  /** "PART OF (E) L1-2": the run carries part of a circuit. */
  partOf: boolean;
  /** The tag's bounds, page points. */
  box: { x0: number; y0: number; x1: number; y1: number };
};

export type ArrowTip = {
  /** The frontmost tip, page points. */
  x: number;
  y: number;
  /** Unit vector the arrow points along. */
  dx: number;
  dy: number;
  /** Arrowheads stacked tip-to-base on this wire. */
  heads: number;
  /** The base of the hindmost head — where the wire meets the arrow. */
  baseX: number;
  baseY: number;
};

export type WireCount = {
  /** Current-carrying conductors (hots + neutrals), null when not marked. */
  wires: number | null;
  /** Grounds, null when not marked. */
  grounds: number | null;
  /** Where the numbers came from; null = the drawing does not mark them. */
  source: "ticks" | "note" | null;
  /** The note as printed, when that is the source. */
  note: string | null;
};

export type Homerun = {
  tag: CircuitTag;
  arrow: ArrowTip;
  wire: WireCount;
};

const PANEL = /^[A-Z0-9]{1,4}$/;
const HAS_LETTER = /[A-Z]/;
/**
 * Circuit numbers: one or two digits each, comma-separated, maybe in
 * parentheses ("(20,22)"). Three digits are not circuits on these sheets —
 * "E-100" is a sheet, "X-12,172" a fault current — and a letter after the
 * number ("1S-11c") is a switch leg, not a homerun.
 */
const NUMBERS = /^\(?(\d{1,2}(?:,\d{1,2})*)\)?$/;

/** Words on one baseline, left to right. */
function rowsOf(words: readonly HomerunWord[]) {
  const rows: { y: number; items: HomerunWord[] }[] = [];
  for (const w of [...words].sort((a, b) => a.cy - b.cy)) {
    const r = rows.find(r => Math.abs(r.y - w.cy) <= Math.max(2, w.height / 3));
    if (r) r.items.push(w);
    else rows.push({ y: w.cy, items: [w] });
  }
  rows.forEach(r => r.items.sort((a, b) => a.cx - b.cx));
  return rows;
}

const near = (a: HomerunWord, b: HomerunWord) =>
  b.x0 - a.x1 <= Math.max(a.height, b.height) * 1.2;

/**
 * Every circuit tag on the page: one word ("3LP-23,25") or three
 * ("2B", "-", "14"), with "(E)", "EXISTING" and "PART OF" read beside it.
 */
export function readCircuitTags(words: readonly HomerunWord[]): CircuitTag[] {
  const rows = rowsOf(words);
  const out: CircuitTag[] = [];
  rows.forEach((r, ri) => {
    const items = r.items;
    for (let i = 0; i < items.length; i++) {
      let panel: string | null = null;
      let nums: string | null = null;
      let used: HomerunWord[] = [];
      const one = /^([A-Z0-9]{1,4})-(.+)$/.exec(items[i].text);
      if (one && NUMBERS.test(one[2])) {
        panel = one[1];
        nums = NUMBERS.exec(one[2])![1];
        used = [items[i]];
      } else if (
        PANEL.test(items[i].text) &&
        items[i + 1]?.text === "-" &&
        items[i + 2] &&
        NUMBERS.test(items[i + 2].text) &&
        near(items[i], items[i + 1]) &&
        near(items[i + 1], items[i + 2])
      ) {
        panel = items[i].text;
        nums = NUMBERS.exec(items[i + 2].text)![1];
        used = items.slice(i, i + 3);
      }
      if (!panel || !nums || !HAS_LETTER.test(panel)) continue;
      const first = used[0];
      const before = items.slice(0, i).reverse();
      const prev = before[0] && near(before[0], first) ? before[0] : undefined;
      const prev2 =
        prev && before[1] && near(before[1], prev) ? before[1] : undefined;
      const prev3 =
        prev2 && before[2] && near(before[2], prev2) ? before[2] : undefined;
      const lead = [prev3, prev2, prev].filter(Boolean) as HomerunWord[];
      const leadText = lead.map(w => w.text).join(" ");
      // "EXISTING" on the line just above, over the tag (Weld 1 E-100).
      const above = rows[ri - 1];
      const existingAbove =
        !!above &&
        r.y - above.y <= first.height * 1.8 &&
        above.items.some(
          w =>
            /^EXISTING$/i.test(w.text) &&
            w.x0 <= used[used.length - 1].x1 &&
            w.x1 >= first.x0
        );
      const prefix = lead.filter(w =>
        /^(\(E\)|PART|OF|EXISTING)$/i.test(w.text)
      );
      const all = [...prefix, ...used];
      // The EXISTING over it is part of the label, and of where it sits.
      const overWord = existingAbove
        ? above.items.find(w => /^EXISTING$/i.test(w.text))
        : undefined;
      const span = overWord ? [overWord, ...all] : all;
      out.push({
        text: all.map(w => w.text).join(" "),
        panel,
        circuits: nums.split(",").map(Number),
        existing: /\(E\)|EXISTING/i.test(leadText) || existingAbove,
        partOf: /PART OF/i.test(leadText),
        box: {
          x0: Math.min(...span.map(w => w.x0)),
          x1: Math.max(...span.map(w => w.x1)),
          y0: Math.min(...span.map(w => w.cy - w.height / 2)),
          y1: Math.max(...span.map(w => w.cy + w.height / 2)),
        },
      });
      i += used.length - 1;
    }
  });
  return out;
}

/**
 * Every arrowhead on the page: two FILLED sides of near-equal length (4–15
 * pt) meeting at the tip, their far ends close together — a narrow
 * triangle. The base is not required: a filled path closes itself, and on
 * Weld 1 E-100 the rear head of a stacked pair has no base segment at all.
 * Heads stacked tip-to-base along one direction merge into one arrow.
 */
export function arrowTips(geo: HomerunGeometry): ArrowTip[] {
  const s = geo.segs;
  const n = s.length / 4;
  const len = (i: number) =>
    Math.hypot(s[i * 4 + 2] - s[i * 4], s[i * 4 + 3] - s[i * 4 + 1]);
  const key = (x: number, y: number) =>
    `${Math.round(x * 4)},${Math.round(y * 4)}`;
  const byEnd = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    if (!geo.filled[i]) continue;
    const l = len(i);
    if (l < 4 || l > 15) continue;
    for (const a of [0, 2]) {
      const k = key(s[i * 4 + a], s[i * 4 + a + 1]);
      const list = byEnd.get(k);
      if (list) list.push(i);
      else byEnd.set(k, [i]);
    }
  }
  type Head = { tx: number; ty: number; bx: number; by: number };
  const heads: Head[] = [];
  const seen = new Set<string>();
  byEnd.forEach(list => {
    for (let p = 0; p < list.length; p++)
      for (let q = p + 1; q < list.length; q++) {
        const i = list[p];
        const j = list[q];
        if (i === j) continue;
        const li = len(i);
        const lj = len(j);
        if (Math.abs(li - lj) > 0.25 * Math.max(li, lj)) continue;
        // The shared end is the tip; the other ends are the base corners.
        const far = (k: number, tipKey: string) =>
          key(s[k * 4], s[k * 4 + 1]) === tipKey
            ? { x: s[k * 4 + 2], y: s[k * 4 + 3] }
            : { x: s[k * 4], y: s[k * 4 + 1] };
        const tipKey = key(s[i * 4], s[i * 4 + 1]);
        const shared =
          tipKey === key(s[j * 4], s[j * 4 + 1]) ||
          tipKey === key(s[j * 4 + 2], s[j * 4 + 3])
            ? tipKey
            : key(s[i * 4 + 2], s[i * 4 + 3]);
        const [tx, ty] = shared.split(",").map(v => Number(v) / 4);
        const a = far(i, shared);
        const b = far(j, shared);
        const base = Math.hypot(a.x - b.x, a.y - b.y);
        // Narrow: an arrowhead, not a filled corner or a symbol's wedge.
        if (base < 0.3 || base > 0.6 * Math.min(li, lj)) continue;
        if (seen.has(shared)) continue;
        seen.add(shared);
        heads.push({ tx, ty, bx: (a.x + b.x) / 2, by: (a.y + b.y) / 2 });
      }
  });
  // Chain heads whose tip sits on another's base, pointing the same way.
  const dir = (h: Head) => {
    const l = Math.hypot(h.tx - h.bx, h.ty - h.by) || 1;
    return { dx: (h.tx - h.bx) / l, dy: (h.ty - h.by) / l };
  };
  const behind = new Map<Head, Head>();
  const hasFront = new Set<Head>();
  for (const h of heads)
    for (const g of heads) {
      if (g === h || behind.has(h) || hasFront.has(g)) continue;
      const dh = dir(h);
      const dg = dir(g);
      if (
        Math.hypot(g.tx - h.bx, g.ty - h.by) <= 1.5 &&
        dh.dx * dg.dx + dh.dy * dg.dy > 0.95
      ) {
        behind.set(h, g);
        hasFront.add(g);
      }
    }
  const out: ArrowTip[] = [];
  for (const h of heads) {
    if (hasFront.has(h)) continue; // not the frontmost
    let last = h;
    let count = 1;
    while (behind.has(last) && count < 12) {
      last = behind.get(last)!;
      count++;
    }
    const d = dir(h);
    out.push({
      x: h.tx,
      y: h.ty,
      dx: d.dx,
      dy: d.dy,
      heads: count,
      baseX: last.bx,
      baseY: last.by,
    });
  }
  return out;
}

/** Distance from a point to a box, 0 inside. */
function toBox(x: number, y: number, b: CircuitTag["box"]) {
  const ddx = Math.max(b.x0 - x, 0, x - b.x1);
  const ddy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.hypot(ddx, ddy);
}

/**
 * How far a tag may sit from its arrow, page points. Measured on Weld 1 and
 * weld2: the tag's nearest edge is 1–27 pt from the tip. Distance alone
 * does NOT keep UNCC's device tags out — 28 of its keynote arrows land
 * within reach of one; `tipClearance` and the text check do that.
 */
export const TAG_REACH = 32;

/**
 * Wire count written beside a tag: "(3) #12 THWN CU & 1 #12 CU GRD". Read
 * from the text within a few lines under or over the tag.
 */
export function wireNote(
  tag: CircuitTag,
  words: readonly HomerunWord[]
): WireCount | null {
  const h = tag.box.y1 - tag.box.y0;
  const line = words
    .filter(
      w =>
        w.cy > tag.box.y0 - 3 * h &&
        w.cy < tag.box.y1 + 3 * h &&
        w.x1 > tag.box.x0 - 20 &&
        w.x0 < tag.box.x1 + 200
    )
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx)
    .map(w => w.text)
    .join(" ");
  // "(3) #12 …" and "(3 #6 THWN CU & 1 #10 CU GRD)" — Weld 1 E-200 writes
  // the second.
  const m =
    /\(?(\d+)\)?\s*#\s?(\d+)\S*(?:\s+\S+){0,3}?\s*(?:&|AND)\s*(\d+)\s*#\s?(\d+)\s*(?:CU\s*)?(?:GRD|GND|GROUND)/i.exec(
      line
    );
  if (!m) return null;
  return {
    wires: Number(m[1]),
    grounds: Number(m[3]),
    source: "note",
    note: m[0],
  };
}

/** Shortest distance from a point to segment i. */
function segDistance(s: Float32Array, i: number, px: number, py: number) {
  const x1 = s[i * 4];
  const y1 = s[i * 4 + 1];
  const dx = s[i * 4 + 2] - x1;
  const dy = s[i * 4 + 3] - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2
    ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2))
    : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * The wire behind an arrow: a stroked segment reaching the hindmost base
 * (within 3 pt — a dashed wire's last dash can stop short) and running
 * roughly along the arrow. Unit vector pointing AWAY from the tip, or null
 * when nothing joins the arrow — then it is a symbol's wedge, not an arrow
 * on a wire (UNCC's 6-30R receptacle).
 */
export function wireBehind(
  arrow: ArrowTip,
  geo: HomerunGeometry
): { ux: number; uy: number; length: number } | null {
  const s = geo.segs;
  let best: { ux: number; uy: number; length: number } | null = null;
  for (let i = 0; i < s.length / 4; i++) {
    if (geo.filled[i]) continue;
    if (segDistance(s, i, arrow.baseX, arrow.baseY) > 3) continue;
    const dx = s[i * 4 + 2] - s[i * 4];
    const dy = s[i * 4 + 3] - s[i * 4 + 1];
    const l = Math.hypot(dx, dy);
    if (l < 0.5) continue;
    const cos = (dx * -arrow.dx + dy * -arrow.dy) / l;
    if (Math.abs(cos) < 0.6) continue;
    const sign = cos >= 0 ? 1 : -1;
    if (!best || l > best.length)
      best = { ux: (sign * dx) / l, uy: (sign * dy) / l, length: l };
  }
  return best;
}

/**
 * How much empty paper is around the tip, page points: the nearest DARK
 * stroked line to it. A leader POINTS AT a symbol; a homerun points off
 * toward a panel. Measured:
 * - UNCC's keynote leaders and Weld 1's security-plan leaders onto J-boxes
 *   touch a black line (lightness 0): 0.0–2.0 pt.
 * - Weld 1 E-200's homerun tips: 4.4–13.7 pt from anything.
 * - weld2's lighting-plan homerun tips often land ON a line, but only ever
 *   the grey background or the light ceiling grid (lightness 128 / 204) —
 *   which is why only lines drawn dark count.
 */
export function tipClearance(arrow: ArrowTip, geo: HomerunGeometry): number {
  const s = geo.segs;
  let best = Infinity;
  for (let i = 0; i < s.length / 4; i++) {
    if (geo.filled[i] || geo.lightness[i] > DARK) continue;
    best = Math.min(best, segDistance(s, i, arrow.x, arrow.y));
  }
  return best;
}

/** Lightness (0 black … 255 white) at or under which a line counts as drawn dark. */
export const DARK = 100;

/** Tip clearance a homerun needs, page points (see tipClearance). */
export const TIP_CLEAR = 3;
/** The same from any word but the tag's own (see readHomeruns). */
export const TEXT_CLEAR = 1.5;

/** True when segments i and j cross. */
function crosses(s: Float32Array, i: number, j: number) {
  const o = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number
  ) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  const [p1x, p1y, p2x, p2y] = [
    s[i * 4],
    s[i * 4 + 1],
    s[i * 4 + 2],
    s[i * 4 + 3],
  ];
  const [q1x, q1y, q2x, q2y] = [
    s[j * 4],
    s[j * 4 + 1],
    s[j * 4 + 2],
    s[j * 4 + 3],
  ];
  return (
    o(p1x, p1y, p2x, p2y, q1x, q1y) !== o(p1x, p1y, p2x, p2y, q2x, q2y) &&
    o(q1x, q1y, q2x, q2y, p1x, p1y) !== o(q1x, q1y, q2x, q2y, p2x, p2y)
  );
}

/**
 * Tick marks across the wire behind the arrow: two to eight short PARALLEL
 * strokes crossing it within 60 pt of the base, evenly spaced, near
 * perpendicular. A tick clearly longer than the rest is a ground by the
 * usual convention. No test sheet draws ticks, so this is fixture-tested
 * (homeruns.test.ts) — and on the real sheets it must find NONE, which the
 * regular-spacing rule is for: hatching and walls crossing a wire gave
 * "1 wire + 2 grounds" before it.
 */
export function tickCount(
  arrow: ArrowTip,
  geo: HomerunGeometry
): WireCount | null {
  const wire = wireBehind(arrow, geo);
  if (!wire) return null;
  const s = geo.segs;
  const { ux, uy } = wire;
  const ticks: { along: number; l: number; ang: number }[] = [];
  // The wire's own pieces near the base: stroked, running with the wire.
  const wirePieces: number[] = [];
  for (let j = 0; j < s.length / 4; j++) {
    if (geo.filled[j]) continue;
    const dx = s[j * 4 + 2] - s[j * 4];
    const dy = s[j * 4 + 3] - s[j * 4 + 1];
    const l = Math.hypot(dx, dy);
    if (l < 1 || Math.abs((dx * ux + dy * uy) / l) < 0.8) continue;
    if (segDistance(s, j, arrow.baseX, arrow.baseY) > 65) continue;
    wirePieces.push(j);
  }
  for (let i = 0; i < s.length / 4; i++) {
    if (geo.filled[i]) continue;
    const x1 = s[i * 4] - arrow.baseX;
    const y1 = s[i * 4 + 1] - arrow.baseY;
    const x2 = s[i * 4 + 2] - arrow.baseX;
    const y2 = s[i * 4 + 3] - arrow.baseY;
    const l = Math.hypot(x2 - x1, y2 - y1);
    if (l < 3 || l > 14) continue;
    const a1 = x1 * ux + y1 * uy;
    const a2 = x2 * ux + y2 * uy;
    const c1 = -x1 * uy + y1 * ux;
    const c2 = -x2 * uy + y2 * ux;
    const along = (a1 + a2) / 2;
    if (along < 2 || along > 60) continue;
    if (Math.sign(c1) === Math.sign(c2)) continue; // does not cross
    if (Math.abs((a2 - a1) / l) > 0.75) continue; // runs with the wire
    // Centred on the wire, as a tick is drawn — not a dash or a wall that
    // merely crosses it (E-200's dashed 3LP-19,21 read "3 wires" without).
    if (Math.abs(c1 + c2) > 0.4 * l) continue;
    // And it really crosses a piece of the wire — a curved wire's own
    // dashes bend across the base's straight line without crossing anything.
    if (!wirePieces.some(j => j !== i && crosses(s, i, j))) continue;
    ticks.push({ along, l, ang: Math.atan2(y2 - y1, x2 - x1) });
  }
  if (ticks.length < 2 || ticks.length > 8) return null;
  ticks.sort((a, b) => a.along - b.along);
  const parallel = ticks.every(t => {
    const d = Math.abs(t.ang - ticks[0].ang) % Math.PI;
    return Math.min(d, Math.PI - d) < 0.15;
  });
  const gaps = ticks.slice(1).map((t, k) => t.along - ticks[k].along);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const even =
    mean >= 1 && mean <= 8 && gaps.every(g => Math.abs(g - mean) <= 0.4 * mean);
  if (!parallel || !even) return null;
  const short = Math.min(...ticks.map(t => t.l));
  const grounds = ticks.filter(t => t.l > short * 1.4).length;
  return {
    wires: ticks.length - grounds,
    grounds,
    source: "ticks",
    note: null,
  };
}

const NOT_MARKED: WireCount = {
  wires: null,
  grounds: null,
  source: null,
  note: null,
};

/**
 * Every homerun on the page: each circuit tag paired with the nearest
 * arrow tip within TAG_REACH, each arrow used once, nearest pairs first. A
 * tag with no arrow is a device's own tag, not a homerun, and is left out.
 */
export function readHomeruns(
  words: readonly HomerunWord[],
  geo: HomerunGeometry
): Homerun[] {
  const tags = readCircuitTags(words);
  const tips = arrowTips(geo);
  // Only an arrow on a wire, pointing off into clear paper (see above).
  // Asked only of arrows near a tag: each asks every segment on the page.
  const ok = new Map<number, boolean>();
  const onWire = (a: number) => {
    if (!ok.has(a))
      ok.set(
        a,
        wireBehind(tips[a], geo) !== null &&
          tipClearance(tips[a], geo) >= TIP_CLEAR
      );
    return ok.get(a)!;
  };
  /*
    Text counts as something to point at too: switches on Weld 1 E-100 are
    "$" glyphs, and a keynote leader onto one passed the line-only check —
    its tip sits INSIDE the glyph's box (0.0 pt). Every word but the tag's
    own, and tighter than for lines: E-200's (E) GL-17 homerun ends 2.6 pt
    short of an unrelated "CTR" label.
  */
  const textAtTip = (tip: ArrowTip, tag: CircuitTag) =>
    words.some(
      w =>
        !(
          w.cx >= tag.box.x0 &&
          w.cx <= tag.box.x1 &&
          w.cy >= tag.box.y0 &&
          w.cy <= tag.box.y1
        ) &&
        toBox(tip.x, tip.y, {
          x0: w.x0,
          x1: w.x1,
          y0: w.cy - w.height / 2,
          y1: w.cy + w.height / 2,
        }) < TEXT_CLEAR
    );
  const pairs: { t: number; a: number; d: number }[] = [];
  tags.forEach((tag, t) =>
    tips.forEach((tip, a) => {
      const d = toBox(tip.x, tip.y, tag.box);
      if (d > TAG_REACH || !onWire(a) || textAtTip(tip, tag)) return;
      // Stacked heads count circuits: three heads are not "GL-22" alone
      // (E-200: the 3-head arrow is GL-22,24,26's, by a leader line).
      if (tip.heads > 1 && tip.heads !== tag.circuits.length) return;
      pairs.push({ t, a, d });
    })
  );
  pairs.sort((p, q) => p.d - q.d);
  const tagDone = new Set<number>();
  const tipDone = new Set<number>();
  const out: Homerun[] = [];
  const take = (t: number, a: number) => {
    tagDone.add(t);
    tipDone.add(a);
    const tag = tags[t];
    const arrow = tips[a];
    out.push({
      tag,
      arrow,
      wire: tickCount(arrow, geo) ?? wireNote(tag, words) ?? NOT_MARKED,
    });
  };
  for (const p of pairs)
    if (!tagDone.has(p.t) && !tipDone.has(p.a)) take(p.t, p.a);

  /*
    A tag set away from its arrow and joined to it by a LEADER: a dark
    straight line from the tag to the arrow or its wire. Weld 1 E-200 draws
    two: "3LP-(20,22)" 42 pt off, and "GL-22,24,26" 85 pt off (whose leader
    has its own little arrowhead — which touches the homerun, so it is never
    taken for a homerun itself). Only tags and arrows left over above.
  */
  const s = geo.segs;
  tags.forEach((tag, t) => {
    if (tagDone.has(t)) return;
    let best: { a: number; d: number } | null = null;
    for (let i = 0; i < s.length / 4; i++) {
      if (geo.filled[i] || geo.lightness[i] > DARK) continue;
      const ends = [
        { x: s[i * 4], y: s[i * 4 + 1] },
        { x: s[i * 4 + 2], y: s[i * 4 + 3] },
      ];
      const l = Math.hypot(ends[1].x - ends[0].x, ends[1].y - ends[0].y);
      if (l < 8 || l > 200) continue;
      for (const [near, far] of [ends, [ends[1], ends[0]]]) {
        if (toBox(near.x, near.y, tag.box) > 6) continue;
        tips.forEach((tip, a) => {
          if (tipDone.has(a)) return;
          if (Math.hypot(tip.x - far.x, tip.y - far.y) > 60) return;
          // The arrow and 40 pt of its wire behind it, as one line.
          const wire = wireBehind(tip, geo);
          if (!wire) return;
          const bx = tip.baseX + wire.ux * 40;
          const by = tip.baseY + wire.uy * 40;
          const dx = bx - tip.x;
          const dy = by - tip.y;
          const l2 = dx * dx + dy * dy;
          const k = Math.max(
            0,
            Math.min(1, ((far.x - tip.x) * dx + (far.y - tip.y) * dy) / l2)
          );
          const d = Math.hypot(
            far.x - (tip.x + k * dx),
            far.y - (tip.y + k * dy)
          );
          if (d > 6 || !onWire(a) || textAtTip(tip, tag)) return;
          if (tip.heads > 1 && tip.heads !== tag.circuits.length) return;
          if (!best || d < best.d) best = { a, d };
        });
      }
    }
    if (best) take(t, (best as { a: number }).a);
  });
  return out.sort((p, q) => p.arrow.y - q.arrow.y || p.arrow.x - q.arrow.x);
}

export type CircuitTie = {
  number: number;
  /** The schedule's row, null when the panel has no such circuit. */
  circuit: PanelCircuit | null;
};

export type HomerunTie =
  /** The panel was read on this set: each circuit, found or not. */
  | { kind: "panel"; panel: PanelSchedule; circuits: CircuitTie[] }
  /** No schedule for this panel was read on this set. */
  | { kind: "noSchedule" };

/** The tag's circuits, looked up in the schedules read off the set. */
export function tieToSchedule(
  tag: Pick<CircuitTag, "panel" | "circuits">,
  panels: readonly PanelSchedule[]
): HomerunTie {
  const panel = panels.find(
    p => p.name !== null && p.name.toUpperCase() === tag.panel.toUpperCase()
  );
  if (!panel) return { kind: "noSchedule" };
  return {
    kind: "panel",
    panel,
    circuits: tag.circuits.map(number => ({
      number,
      circuit: panel.circuits.find(c => c.number === number) ?? null,
    })),
  };
}

/** "3 wires + ground", "2 wires + 2 grounds", "wires not marked". */
export function wireText(w: WireCount): string {
  if (w.wires === null) return "wires not marked";
  const wires = `${w.wires} wire${w.wires === 1 ? "" : "s"}`;
  if (!w.grounds) return wires;
  return `${wires} + ${w.grounds === 1 ? "ground" : `${w.grounds} grounds`}`;
}

/**
 * The one line shown on the sheet:
 * "Homerun to 3LP-23,25, 3 wires + ground (from the note)".
 */
export function homerunLabel(h: Homerun): string {
  const t = h.tag;
  const to = `${t.panel}-${t.circuits.join(",")}`;
  const how =
    h.wire.source === "note"
      ? " (from the note)"
      : h.wire.source === "ticks"
        ? " (tick marks)"
        : "";
  return `Homerun to ${to}${t.existing ? " (existing)" : ""}, ${wireText(h.wire)}${how}`;
}

/** One line per circuit for the schedule tie, as the view shows it. */
export function tieLines(tie: HomerunTie, tag: CircuitTag): string[] {
  if (tie.kind === "noSchedule")
    return [`Panel ${tag.panel}: no schedule read on this set`];
  return tie.circuits.map(({ number, circuit }) => {
    if (!circuit)
      return `${tag.panel}-${number}: not on panel ${tag.panel}'s schedule`;
    const parts = [
      circuit.description || "no description",
      circuit.breaker,
      circuit.wire ? `#${circuit.wire}` : null,
    ].filter(Boolean);
    return `${tag.panel}-${number}: ${parts.join(", ")}`;
  });
}
