/**
 * LINES CROSSING SYMBOLS — measured before anything is built (track-c,
 * 2026-10-06). How does Find all matching do where a wall, a home run, a grid
 * line or a dimension line runs through or touches a symbol?
 *
 * Same sheet, marks and boxes as scripts/findMatchingCheck.mts (Weld 1 E-200,
 * the owner's 46 hand marks), and the same shipped code. For each type it
 * reports:
 *
 *   1. TEMPLATE: template segments COLLINEAR with a line leaving the box.
 *      A wall chopped into pieces inside the box shows here — but so does a
 *      device's own line that its wire continues, which is the symbol. On
 *      E-200 the GFCI's 10 are exactly that (read 2026-10-06). Print them
 *      before calling them a wall.
 *   2. FOUND: copies with a line crossing or touching them, and whether
 *      they were flagged.
 *   3. DROPPED: places where the symbol's line work is there point by point
 *      (>= MIN_COVERAGE of points within tol of SOME line) but the matcher's
 *      segment-by-segment test is below MIN_COVERAGE or never tried the spot
 *      — the copies it drops silently today — with whose hand mark each sits
 *      on and whether a line crosses it. Also the two known misses.
 *
 * "Crossing" = a segment that is not part of the copy, passes into the
 * copy's outline, and has an end outside it. Reads only. Local database only.
 *
 *   pnpm tsx scripts/lineCrossingCheck.mts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";

const { assertWritableDatabase, OVERRIDE_VAR } = await import(
  "./databaseGuard"
);
assertWritableDatabase(process.env.DATABASE_URL, {
  action: "check lines crossing symbols",
  env: { ...process.env, [OVERRIDE_VAR]: undefined },
});

const db = await import("../server/db");
const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { extractVectorGeometry } = await import(
  "../client/src/lib/vectorGeometry"
);
const { findMatching, symbolFromBox, prepareSheet, MIN_COVERAGE } =
  await import("../client/src/lib/findMatching");
const { wordBoxes } = await import("../client/src/lib/textSelection");
const { splitExistingToRemain } = await import("../shared/existingToRemain");

const SHEET_ID = 234263;
const PDF_FILE = path.join("reader-accuracy", "plans", "Weld 1.pdf");
const PAGE = 5;
const SAME_DEVICE_POINTS = 6;
const PLAN_A = { x0: 150, y0: 820, x1: 1200, y1: 1680 };
const inA = (x: number, y: number) =>
  x >= PLAN_A.x0 && x <= PLAN_A.x1 && y >= PLAN_A.y0 && y <= PLAN_A.y1;

const TEMPLATES: Record<string, { at: [number, number]; box: number[] }> = {
  "DUPLEX RECEPTACLE": { at: [636.0, 1334.2], box: [-5.5, -5.5, 10, 5.5] },
  "DOUBLE DUPLEX RECEPTACLE": {
    at: [681.4, 1331.5],
    box: [-7.5, -6.2, 7.8, 9.3],
  },
  "GFCI receptacle": { at: [765.5, 1389.0], box: [-11, -6, 5.5, 6] },
  "Junction Box": { at: [728.4, 1369.1], box: [-5.5, -5.5, 5.5, 5.5] },
  "SWITCH, SINGLE POLE": { at: [622.8, 1249.9], box: [-3.5, -4.5, 3.5, 4.5] },
  "TELECOM CABINET, FLUSH MOUNT": {
    at: [795.4, 1333.0],
    box: [-5, -5, 5, 4],
  },
  "PANELBOARD, SURFACE MOUNT": {
    at: [829.8, 1006.0],
    box: [-8.5, -2.6, 9.5, 4.5],
  },
};

const user = await db.getUserByEmail("reader-test@local.test");
if (!user) throw new Error("No reader-test account in this database.");
const marks = (await db.getStampsForSheet(SHEET_ID, user.id)).map(m => ({
  type: splitExistingToRemain(m.groupLabel ?? "").base,
  x: Number(m.x),
  y: Number(m.y),
}));

const doc = await getDocument({
  data: new Uint8Array(readFileSync(PDF_FILE)),
  verbosity: 0,
}).promise;
const page = await doc.getPage(PAGE);
const viewport = page.getViewport({ scale: 1 });
const list = await page.getOperatorList();
const text = await page.getTextContent();
const geo = extractVectorGeometry(
  list.fnArray,
  list.argsArray,
  OPS as unknown as Record<string, number>,
  viewport.transform,
  viewport.width,
  viewport.height
);
const words = wordBoxes({
  items: text.items.flatMap(item =>
    "str" in item
      ? [{ str: item.str, transform: item.transform, width: item.width }]
      : []
  ),
  viewportTransform: viewport.transform,
});
const sheet = prepareSheet(geo, words);
const segs = geo.segs;
const nSegs = segs.length / 4;
const segLen = (i: number) =>
  Math.hypot(segs[i * 4 + 2] - segs[i * 4], segs[i * 4 + 3] - segs[i * 4 + 1]);

// A coarse grid over every segment, by its bounding box.
const CELL = 20;
const cells = new Map<string, number[]>();
for (let i = 0; i < nSegs; i++) {
  const xa = Math.min(segs[i * 4], segs[i * 4 + 2]);
  const xb = Math.max(segs[i * 4], segs[i * 4 + 2]);
  const ya = Math.min(segs[i * 4 + 1], segs[i * 4 + 3]);
  const yb = Math.max(segs[i * 4 + 1], segs[i * 4 + 3]);
  for (let cx = Math.floor(xa / CELL); cx <= Math.floor(xb / CELL); cx++)
    for (let cy = Math.floor(ya / CELL); cy <= Math.floor(yb / CELL); cy++) {
      const k = `${cx},${cy}`;
      const l = cells.get(k);
      if (l) l.push(i);
      else cells.set(k, [i]);
    }
}
function near(x0: number, y0: number, x1: number, y1: number): number[] {
  const out = new Set<number>();
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++)
      for (const i of cells.get(`${cx},${cy}`) ?? []) out.add(i);
  return Array.from(out);
}

/** Does segment i pass into the rectangle? (Liang–Barsky clip.) */
function entersRect(
  i: number,
  r: { x0: number; y0: number; x1: number; y1: number }
) {
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
const inside = (
  x: number,
  y: number,
  r: { x0: number; y0: number; x1: number; y1: number }
) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

/**
 * Lines crossing or touching a copy at (x, y) with half sizes hw, hh: not
 * wholly inside the outline (those are the symbol), entering it, at least
 * one end outside. "through" = both ends outside; "touch" = one end inside.
 */
function crossings(x: number, y: number, hw: number, hh: number) {
  const r = { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh };
  let through = 0;
  let touch = 0;
  let longest = 0;
  for (const i of near(r.x0 - 1, r.y0 - 1, r.x1 + 1, r.y1 + 1)) {
    const aIn = inside(segs[i * 4], segs[i * 4 + 1], r);
    const bIn = inside(segs[i * 4 + 2], segs[i * 4 + 3], r);
    if (aIn && bIn) continue;
    if (!entersRect(i, r)) continue;
    if (!aIn && !bIn) through++;
    else touch++;
    longest = Math.max(longest, segLen(i));
  }
  return { through, touch, longest };
}

// The eight orientations, as the matcher has them (turns, each mirrored).
const ORIENTS = [0, 90, 180, 270].flatMap(rot => {
  const c = Math.round(Math.cos((rot * Math.PI) / 180));
  const s = Math.round(Math.sin((rot * Math.PI) / 180));
  return [
    { a: c, b: -s, c: s, d: c, rot, mirrored: false },
    { a: -c, b: -s, c: -s, d: c, rot, mirrored: true },
  ];
});

console.log(
  `Weld 1 E-200: ${nSegs} segments, ${words.length} words. MIN_COVERAGE ${MIN_COVERAGE}.\n`
);

for (const [type, t] of Object.entries(TEMPLATES)) {
  // `pnpm tsx scripts/lineCrossingCheck.mts GFCI` runs one type.
  if (process.argv[2] && !type.startsWith(process.argv[2])) continue;
  const box = {
    x: t.at[0] + t.box[0],
    y: t.at[1] + t.box[1],
    width: t.box[2] - t.box[0],
    height: t.box[3] - t.box[1],
  };
  const made = symbolFromBox(sheet, box);
  const result = findMatching(geo, words, box);
  if (made.kind !== "ok" || result.kind !== "ok") {
    console.log(`${type}: not searchable (${made.kind}/${result.kind})`);
    continue;
  }
  const tpl = made.symbol;
  const mine = marks.filter(m => m.type === type);

  // 1. Template purity: a template segment collinear with a line leaving
  //    the box is a piece of something running through it.
  const bx = {
    x0: box.x,
    y0: box.y,
    x1: box.x + box.width,
    y1: box.y + box.height,
  };
  let pieces = 0;
  let piecesLength = 0;
  for (const r of tpl.rel) {
    const ax = r.x1 + tpl.cx;
    const ay = r.y1 + tpl.cy;
    const bxp = r.x2 + tpl.cx;
    const byp = r.y2 + tpl.cy;
    const L = Math.hypot(bxp - ax, byp - ay) || 1;
    const ux = (bxp - ax) / L;
    const uy = (byp - ay) / L;
    const continues = near(bx.x0 - 2, bx.y0 - 2, bx.x1 + 2, bx.y1 + 2).some(
      i => {
        const p = [
          segs[i * 4],
          segs[i * 4 + 1],
          segs[i * 4 + 2],
          segs[i * 4 + 3],
        ];
        if (inside(p[0], p[1], bx) && inside(p[2], p[3], bx)) return false;
        const l = Math.hypot(p[2] - p[0], p[3] - p[1]) || 1;
        const cos = Math.abs(((p[2] - p[0]) * ux + (p[3] - p[1]) * uy) / l);
        if (cos < 0.999) return false;
        // On the same line, and touching one of our ends.
        const off = Math.abs((p[0] - ax) * uy - (p[1] - ay) * ux);
        const touchesEnd = [
          [p[0], p[1]],
          [p[2], p[3]],
        ].some(([x, y]) =>
          [
            [ax, ay],
            [bxp, byp],
          ].some(([ex, ey]) => Math.hypot(x - ex, y - ey) <= tpl.tol)
        );
        return off <= tpl.tol && touchesEnd;
      }
    );
    if (continues) {
      pieces++;
      piecesLength += r.length;
    }
  }

  // 2. Found copies: crossings, flagged or not.
  const hwOf = (m: { halfWidth: number; halfHeight: number }) => [
    m.halfWidth,
    m.halfHeight,
  ];
  let foundCross = 0;
  let foundCrossFlagged = 0;
  for (const m of result.matches) {
    const [hw, hh] = hwOf(m);
    const c = crossings(m.x, m.y, hw, hh);
    if (c.through + c.touch > 0) {
      foundCross++;
      if (m.needsLook.length || m.maybeExisting.length) foundCrossFlagged++;
    }
  }

  // 3. Copies the matcher does not return. At every place ANY template
  //    segment lands whole on a sheet segment of its length (the matcher
  //    uses ONE such anchor; all of them here, so a split anchor cannot hide
  //    a copy), two coverages of the template's length:
  //      segCov   — whole segments, both ends within tol (the matcher's test);
  //      pieceCov — the same lines allowed to be in COLLINEAR PIECES that
  //                 stay within the line's own ends (a line cut where
  //                 something crosses it) — never a longer line through it.
  const tol = tpl.tol;
  const total = tpl.rel.reduce((a, r) => a + r.length, 0);
  const sorted = Array.from({ length: nSegs }, (_, i) => i).sort(
    (a, b) => segLen(a) - segLen(b)
  );
  const lens = sorted.map(segLen);
  const lower = (v: number) => {
    let lo = 0;
    let hi = lens.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lens[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const place = (
    o: (typeof ORIENTS)[number],
    x: number,
    y: number,
    tx: number,
    ty: number
  ) => [o.a * x + o.b * y + tx, o.c * x + o.d * y + ty] as const;
  const covers = (tx: number, ty: number, o: (typeof ORIENTS)[number]) => {
    let seg = 0;
    let piece = 0;
    let split = 0;
    const r0 = Math.max(tpl.halfW, tpl.halfH) + 2;
    const cand = near(tx - r0, ty - r0, tx + r0, ty + r0);
    for (const r of tpl.rel) {
      const [q1x, q1y] = place(o, r.x1, r.y1, tx, ty);
      const [q2x, q2y] = place(o, r.x2, r.y2, tx, ty);
      const L = Math.hypot(q2x - q1x, q2y - q1y) || 1e-9;
      const ux = (q2x - q1x) / L;
      const uy = (q2y - q1y) / L;
      let whole = false;
      const spans: [number, number][] = [];
      for (const i of cand) {
        if (geo.filled[i] !== r.filled) continue;
        const ax = segs[i * 4];
        const ay = segs[i * 4 + 1];
        const bx = segs[i * 4 + 2];
        const by = segs[i * 4 + 3];
        if (
          (Math.hypot(ax - q1x, ay - q1y) <= tol &&
            Math.hypot(bx - q2x, by - q2y) <= tol) ||
          (Math.hypot(ax - q2x, ay - q2y) <= tol &&
            Math.hypot(bx - q1x, by - q1y) <= tol)
        ) {
          whole = true;
          break;
        }
        // A piece: on the line, both ends within the line's own extent.
        const off = (x: number, y: number) =>
          Math.abs((x - q1x) * uy - (y - q1y) * ux);
        const along = (x: number, y: number) => (x - q1x) * ux + (y - q1y) * uy;
        if (off(ax, ay) > tol || off(bx, by) > tol) continue;
        const s = along(ax, ay);
        const e = along(bx, by);
        if (Math.min(s, e) < -tol || Math.max(s, e) > L + tol) continue;
        spans.push([Math.max(0, Math.min(s, e)), Math.min(L, Math.max(s, e))]);
      }
      if (whole) {
        seg += r.length;
        piece += r.length;
        continue;
      }
      spans.sort((p, q) => p[0] - q[0]);
      let got = 0;
      let end = 0;
      for (const [s, e] of spans) {
        if (e <= end) continue;
        got += e - Math.max(s, end);
        end = e;
      }
      if (got >= L - 2 * tol && spans.length > 1) split++;
      piece += Math.min(r.length, got + (spans.length > 1 ? 2 * tol : 0));
    }
    return { seg: seg / total, piece: piece / total, split };
  };
  const tried = new Map<
    string,
    { x: number; y: number; seg: number; piece: number; split: number }
  >();
  for (const a of tpl.rel) {
    if (a.length < Math.max(1, 0.12 * tpl.size)) continue;
    const t2 = Math.max(0.5, 0.04 * a.length);
    for (let s = lower(a.length - t2); s < lower(a.length + t2 + 1e-9); s++) {
      const i = sorted[s];
      if (geo.filled[i] !== a.filled) continue;
      const px1 = segs[i * 4];
      const py1 = segs[i * 4 + 1];
      const px2 = segs[i * 4 + 2];
      const py2 = segs[i * 4 + 3];
      if (!inA(px1, py1)) continue;
      const pl = segLen(i) || 1;
      for (const o of ORIENTS) {
        const [ax1, ay1] = place(o, a.x1, a.y1, 0, 0);
        const [ax2, ay2] = place(o, a.x2, a.y2, 0, 0);
        const al = Math.hypot(ax2 - ax1, ay2 - ay1) || 1;
        const dot =
          ((ax2 - ax1) * (px2 - px1) + (ay2 - ay1) * (py2 - py1)) / (al * pl);
        let tx: number;
        let ty: number;
        if (dot > 0.995) [tx, ty] = [px1 - ax1, py1 - ay1];
        else if (dot < -0.995) [tx, ty] = [px2 - ax1, py2 - ay1];
        else continue;
        const key = `${Math.round(tx * 2)},${Math.round(ty * 2)},${o.rot},${o.mirrored}`;
        if (tried.has(key)) continue;
        tried.set(key, { x: tx, y: ty, ...covers(tx, ty, o) });
      }
    }
  }
  // One per place, best piece coverage first.
  const places: {
    x: number;
    y: number;
    seg: number;
    piece: number;
    split: number;
  }[] = [];
  for (const p of Array.from(tried.values()).sort(
    (a, b) => b.piece - a.piece || b.seg - a.seg
  ))
    if (!places.some(q => Math.hypot(q.x - p.x, q.y - p.y) < tpl.size * 0.5))
      places.push(p);
  const notFound = (p: { x: number; y: number }) =>
    !result.matches.some(
      m => Math.hypot(m.x - p.x, m.y - p.y) <= SAME_DEVICE_POINTS
    );
  const dropped = places.filter(
    p => p.piece >= MIN_COVERAGE && p.seg < MIN_COVERAGE && notFound(p)
  );
  const segOkNotFound = places.filter(
    p => p.seg >= MIN_COVERAGE && notFound(p)
  );

  console.log(
    `── ${type}  (template ${tpl.rel.length} segments, size ${tpl.size.toFixed(1)}, tol ${tol.toFixed(2)})`
  );
  console.log(
    `   1. template segments collinear with a line leaving the box (read before trusting): ${pieces} (${piecesLength.toFixed(1)} of ${tpl.rel.reduce((a, r) => a + r.length, 0).toFixed(1)} pt of line)`
  );
  console.log(
    `   2. found ${result.matches.length} (plan A ${result.matches.filter(m => inA(m.x, m.y)).length}); ` +
      `with a line crossing/touching: ${foundCross}, of which flagged: ${foundCrossFlagged}`
  );
  console.log(
    `   3. places whole-segment >= ${MIN_COVERAGE} yet not returned (the words/flags rules dropped them): ${segOkNotFound.length}`
  );
  console.log(
    `   4. CUT BY A LINE — in pieces >= ${MIN_COVERAGE}, whole < ${MIN_COVERAGE}, not returned: ${dropped.length}`
  );
  for (const p of dropped) {
    const c = crossings(p.x, p.y, tpl.halfW, tpl.halfH);
    const on = marks.find(
      h => Math.hypot(h.x - p.x, h.y - p.y) <= SAME_DEVICE_POINTS
    );
    console.log(
      `      (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) whole ${(p.seg * 100).toFixed(0)}% pieces ${(p.piece * 100).toFixed(0)}% ` +
        `(${p.split} lines split)  crossing ${c.through} through / ${c.touch} touch  on mark: ${on ? on.type : "none"}`
    );
  }
  const missed = mine.filter(
    h =>
      !result.matches.some(
        m => Math.hypot(m.x - h.x, m.y - h.y) <= SAME_DEVICE_POINTS
      )
  );
  for (const h of missed) {
    const best = places
      .filter(p => Math.hypot(p.x - h.x, p.y - h.y) <= SAME_DEVICE_POINTS)
      .reduce((a, p) => (p.piece > a.piece ? p : a), {
        seg: 0,
        piece: 0,
        split: 0,
      });
    const c = crossings(h.x, h.y, tpl.halfW, tpl.halfH);
    console.log(
      `   hand mark MISSED at (${h.x.toFixed(1)}, ${h.y.toFixed(1)}): best there whole ${(best.seg * 100).toFixed(0)}% ` +
        `pieces ${(best.piece * 100).toFixed(0)}% (${best.split} split), crossing ${c.through} through / ${c.touch} touch`
    );
  }
}
