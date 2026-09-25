// PROTOTYPE, NOT WIRED IN — kept as the record behind
// references/plan-viewer-overhaul.md § 17.4 (2026-09-25).
//
// A plain-code reader for a sheet's number and title, scored against the PDF's
// own page labels, or its bookmarks when there are no labels. It was tuned on
// six public bid sets, so its score on those six flatters it; § 17.4 has the
// held-out result, which is the honest one. Piece 2 should rebuild this as a
// tested module in shared/ rather than lift this file.
//
//   node references/sheet-reader-prototype.mjs <file.pdf> [v]
//
// `v` prints every page. Without it, only mismatches print.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";

// A discipline-shaped sheet number: E101, E-101, E1.01, E1.1A, ED-101B.
const NUM = /^[A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,3})?[A-Z]?$/;
// Title-block cell labels, which are never the title itself.
const LABELS =
  /^(SHEET|DRAWING|DWG|TITLE|SHEET TITLE|DRAWING TITLE|SHEET NO|SHEET NUMBER|DRAWING NUMBER|DRAWN BY|CHECKED BY|SCALE|DATE|PROJECT|REVISIONS?|ISSUE|SEAL|JOB)\b/i;

const file = process.argv[2];
const doc = await getDocument({
  data: new Uint8Array(fs.readFileSync(file)),
  verbosity: 0,
}).promise;

// Ground truth: page labels such as "E-001 - ELECTRICAL SPECIFICATIONS" or
// "[1] E-001 INDEX", falling back to bookmark titles of the same shape.
const truth = {};
const parseTruth = s => {
  const m = s
    .replace(/^\[\d+\]\s*/, "")
    .match(/^([A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,3})?[A-Z]?)\s*(?:-\s*)?(.*)$/);
  return m ? { n: m[1], t: m[2].trim() } : null;
};
const labels = await doc.getPageLabels();
if (labels)
  labels.forEach((l, i) => {
    const g = parseTruth(l);
    if (g) truth[i + 1] = g;
  });
if (!Object.keys(truth).length) {
  const walk = async items => {
    for (const o of items || []) {
      try {
        const d =
          typeof o.dest === "string"
            ? await doc.getDestination(o.dest)
            : o.dest;
        if (d) {
          const p = (await doc.getPageIndex(d[0])) + 1;
          const g = parseTruth(o.title);
          if (g && !truth[p]) truth[p] = g;
        }
      } catch {}
      await walk(o.items);
    }
  };
  await walk(await doc.getOutline());
}

const pages = [];
const t0 = performance.now();
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  // Positions in VIEWPORT space, so a /Rotate 270 sheet's corner is still the
  // bottom-right. "vert" means vertical AS DISPLAYED, not as stored.
  const raw = tc.items
    .filter(i => i.str?.trim())
    .map(i => {
      const [x, y] = vp.convertToViewportPoint(i.transform[4], i.transform[5]);
      return {
        s: i.str,
        x,
        y,
        w: i.width,
        h: Math.hypot(i.transform[2], i.transform[3]),
        vert:
          Math.abs(i.transform[1]) > Math.abs(i.transform[0]) !==
          (page.rotate % 180 !== 0),
      };
    });

  // Merge items on one baseline into lines: "AD" "-" "101" is one number.
  const lines = [];
  for (const it of raw
    .filter(i => !i.vert)
    .sort((a, b) => a.y - b.y || a.x - b.x)) {
    const L = lines.find(
      l =>
        Math.abs(l.y - it.y) < 0.3 * it.h &&
        Math.abs(l.h - it.h) < 0.3 * it.h &&
        it.x - l.xe < 0.8 * it.h &&
        it.x >= l.x
    );
    if (L) {
      L.s += (it.x - L.xe > 0.15 * it.h ? " " : "") + it.s;
      L.xe = Math.max(L.xe, it.x + it.w);
    } else lines.push({ s: it.s, x: it.x, xe: it.x + it.w, y: it.y, h: it.h });
  }
  for (const l of lines) {
    l.s = l.s.replace(/\s+/g, " ").trim();
    l.nx = l.x / vp.width;
    l.ny = l.y / vp.height;
  }

  // The number: the tallest number-shaped line in the bottom-right, nudged
  // toward the corner. High confidence only when it clearly out-sizes rivals.
  const zone = lines.filter(l => l.nx > 0.6 && l.ny > 0.6);
  const score = o => o.l.h * (1.5 - Math.hypot(1 - o.l.nx, 1 - o.l.ny));
  const cands = zone
    .map(l => ({ l, c: l.s.replace(/\s+/g, "").replace(/–/g, "-") }))
    .filter(o => NUM.test(o.c))
    .sort((a, b) => score(b) - score(a));
  const best = cands[0];
  const rival = cands.find(o => o.c !== best?.c);
  const conf = !best
    ? "none"
    : !rival || best.l.h >= 1.4 * rival.l.h
      ? "high"
      : "low";
  const vitems = raw.filter(i => i.vert && i.x / vp.width > 0.85);
  pages.push({ p, best, conf, zone, vitems, H: vp.height });
}
const ms = performance.now() - t0;

// Text that repeats on most sheets is project information, never a title.
const freq = new Map();
for (const pg of pages)
  for (const s of new Set(pg.zone.map(l => l.s)))
    freq.set(s, (freq.get(s) || 0) + 1);
const vfreq = new Map();
for (const pg of pages)
  for (const s of new Set(pg.vitems.map(v => v.s.trim())))
    vfreq.set(s, (vfreq.get(s) || 0) + 1);
const rare = (map, s) => (map.get(s) || 0) < Math.max(2, pages.length * 0.5);

let nOk = 0,
  nTot = 0,
  tOk = 0,
  highWrong = 0,
  none = 0;
const tokens = s =>
  new Set(
    s
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1)
  );
for (const pg of pages) {
  let title = "";
  if (pg.best) {
    const b = pg.best.l;
    // The title: the largest non-label, non-repeating lines just above it.
    const near = pg.zone.filter(
      l =>
        l !== b &&
        l.y < b.y &&
        b.y - l.y < 0.12 * pg.H &&
        Math.abs(l.nx - b.nx) < 0.1 &&
        !LABELS.test(l.s) &&
        !NUM.test(l.s.replace(/\s/g, "")) &&
        /[A-Z]{3}/i.test(l.s) &&
        !/\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/.test(l.s) &&
        rare(freq, l.s)
    );
    if (near.length) {
      const hMax = Math.max(...near.map(l => l.h));
      title = near
        .filter(l => l.h > 0.8 * hMax)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map(l => l.s)
        .join(" ");
    } else {
      // A vertical strip down the right edge carries the title ROTATED.
      const vs = pg.vitems.filter(
        v =>
          /[A-Z]{3}/i.test(v.s) &&
          !LABELS.test(v.s.trim()) &&
          rare(vfreq, v.s.trim())
      );
      if (vs.length) {
        const hMax = Math.max(...vs.map(v => v.h));
        const top = vs.filter(v => v.h > 0.8 * hMax);
        const col = top[0].x;
        title = top
          .filter(v => Math.abs(v.x - col) < 1.5 * hMax)
          .sort((a, b) => b.y - a.y)
          .map(v => v.s.trim())
          .join(" ");
      }
    }
  }
  const g = truth[pg.p];
  const nMatch =
    g && pg.best
      ? pg.best.c === g.n
        ? "ok"
        : pg.best.c.replace(/[-.]/g, "") === g.n.replace(/[-.]/g, "")
          ? "ok~"
          : "WRONG"
      : pg.best
        ? "?"
        : "none";
  let tj = "";
  if (g && g.t) {
    const a = tokens(title);
    const b = tokens(g.t);
    const inter = [...a].filter(x => b.has(x)).length;
    const j = inter / Math.max(1, new Set([...a, ...b]).size);
    tj = j >= 0.5 ? "T-ok" : "T-bad";
    if (j >= 0.5) tOk++;
  }
  if (g) {
    nTot++;
    if (nMatch.startsWith("ok")) nOk++;
    if (nMatch === "WRONG" && pg.conf === "high") highWrong++;
  }
  if (!pg.best) none++;
  if (process.argv[3] === "v" || nMatch === "WRONG" || tj === "T-bad")
    console.log(
      `p${pg.p} [${pg.conf}] ${pg.best?.c ?? "-"} | "${title.slice(0, 60)}" || truth: ${g ? g.n + " | " + g.t : "-"}  ${nMatch} ${tj}`
    );
}
console.log(
  `${file.split(/[/\\]/).pop()}: pages ${pages.length}, text ${ms.toFixed(0)}ms; ` +
    `truth for ${nTot}; number right ${nOk}/${nTot}; high-confidence wrong ${highWrong}; ` +
    `no number ${none}; title right ${tOk}/${nTot}`
);
