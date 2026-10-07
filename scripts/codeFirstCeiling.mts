/**
 * CODE-FIRST CEILING — how far plain code (no AI) gets on VECTOR plans.
 * Measurement only: nothing here is product code. Results and the ranked
 * plan are in references/code-first-ceiling.md (track-c, 2026-10-06).
 *
 * Sheets: Weld 1 E-200 (the owner's 46 hand marks, reader-test account in
 * the local database), UNCC E111 (no hand count — scored against what the
 * sheet itself says: its USB/GF labels, its own schedules), and the Old
 * Blueridge scans for what changes when there is no line work.
 *
 *   pnpm tsx scripts/codeFirstCeiling.mts <section>
 *   sections: layers | text | homeruns | schedules | addenda | scale
 *
 * Reads only. Local database only (for the hand marks). AI spend: $0.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";

const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { extractVectorGeometry } = await import(
  "../client/src/lib/vectorGeometry"
);
const { wordBoxes } = await import("../client/src/lib/textSelection");

const PLANS = path.join("reader-accuracy", "plans");
const ops = OPS as unknown as Record<string, number>;

export type Loaded = Awaited<ReturnType<typeof load>>;

/** One page: its operator list, geometry, words, and layer names by id. */
async function load(file: string, pageNo: number) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(path.join(PLANS, file))),
    verbosity: 0,
  }).promise;
  const page = await doc.getPage(pageNo);
  const viewport = page.getViewport({ scale: 1 });
  const list = await page.getOperatorList();
  const text = await page.getTextContent();
  const geo = extractVectorGeometry(
    list.fnArray,
    list.argsArray,
    ops,
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
  const layerName = new Map<string, string>();
  const oc = await doc.getOptionalContentConfig();
  for (const [id, g] of oc) layerName.set(id, (g as { name: string }).name);
  return { doc, page, viewport, list, geo, words, layerName };
}

/**
 * The page's geometry drawn by ONE layer: every path outside it dropped.
 * A path is one `constructPath`; the layer is the innermost OC marked
 * content around it.
 */
function layerGeometry(p: Loaded, keep: (layer: string | null) => boolean) {
  const fn: number[] = [];
  const args: unknown[] = [];
  const stack: (string | null)[] = [];
  const current = () => [...stack].reverse().find(s => s !== null) ?? null;
  p.list.fnArray.forEach((f, i) => {
    const a = p.list.argsArray[i] as unknown[] | null;
    if (f === ops.beginMarkedContentProps)
      stack.push(
        a?.[0] === "OC"
          ? String((a[1] as { id?: string } | null)?.id ?? a[1])
          : null
      );
    else if (f === ops.beginMarkedContent) stack.push(null);
    else if (f === ops.endMarkedContent) stack.pop();
    if (f === ops.constructPath) {
      const id = current();
      if (!keep(id === null ? null : (p.layerName.get(id) ?? id))) return;
    }
    fn.push(f);
    args.push(a);
  });
  return extractVectorGeometry(
    fn,
    args,
    ops,
    p.viewport.transform,
    p.viewport.width,
    p.viewport.height
  );
}

/** Hand marks on Weld 1 E-200 (sheet 234263, reader-test account). */
async function weldMarks() {
  const db = await import("../server/db");
  const { splitExistingToRemain } = await import("../shared/existingToRemain");
  const user = await db.getUserByEmail("reader-test@local.test");
  if (!user) throw new Error("No reader-test account in this database.");
  return (await db.getStampsForSheet(234263, user.id)).map(m => ({
    type: splitExistingToRemain(m.groupLabel ?? "").base,
    x: Number(m.x),
    y: Number(m.y),
  }));
}

/** Segments with a point within r of (x, y). */
function segsNear(segs: Float32Array, x: number, y: number, r: number): number {
  let n = 0;
  for (let i = 0; i < segs.length / 4; i++) {
    const ax = segs[i * 4];
    const ay = segs[i * 4 + 1];
    const dx = segs[i * 4 + 2] - ax;
    const dy = segs[i * 4 + 3] - ay;
    const l2 = dx * dx + dy * dy;
    const t =
      l2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= r) n++;
  }
  return n;
}

// ── c. Layers ───────────────────────────────────────────────────────────────
async function layers() {
  const p = await load("Weld 1.pdf", 5);
  const marks = await weldMarks();
  const counts = new Map<string, number>();
  const names = Array.from(new Set(p.layerName.values()));
  const perLayer = new Map<string, Float32Array>();
  for (const n of [...names, "(no layer)"]) {
    const g = layerGeometry(p, l => (l ?? "(no layer)") === n);
    perLayer.set(n, g.segs);
    counts.set(n, g.segs.length / 4);
  }
  console.log(
    `Weld 1 E-200: ${p.geo.segs.length / 4} segments; by layer:`,
    JSON.stringify(
      Array.from(counts)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])
    )
  );
  // Which layer draws each hand-marked device (line work within 4 pt).
  const byType = new Map<string, Map<string, number>>();
  for (const m of marks) {
    let best = "(none)";
    let most = 0;
    perLayer.forEach((segs, n) => {
      const k = segsNear(segs, m.x, m.y, 7);
      if (k > most) {
        most = k;
        best = n;
      }
    });
    const t = byType.get(m.type) ?? new Map<string, number>();
    t.set(best, (t.get(best) ?? 0) + 1);
    byType.set(m.type, t);
  }
  console.log(
    "\nLayer drawing each of his 46 marks (most line work within 7 pt):"
  );
  byType.forEach((t, type) =>
    console.log(`  ${type}: ${JSON.stringify(Array.from(t))}`)
  );
  // The three plans on the sheet, by layer: power plan A, demolition plan B,
  // security plan C (regions as in scripts/findMatchingCheck.mts).
  const regions = [
    { name: "A power", x0: 150, y0: 820, x1: 1200, y1: 1680 },
    { name: "B demolition", x0: 1350, y0: 820, x1: 2300, y1: 1680 },
    { name: "C security", x0: 150, y0: 0, x1: 1200, y1: 800 },
  ];
  console.log("\nElectrical layers' line work by plan region (segments):");
  for (const n of ["E-POWR", "E-POWR-D", "E-TLCM", "E-LITE", "ES"]) {
    const segs = perLayer.get(n);
    if (!segs) continue;
    const tally = regions.map(r => {
      let k = 0;
      for (let i = 0; i < segs.length / 4; i++) {
        const x = (segs[i * 4] + segs[i * 4 + 2]) / 2;
        const y = (segs[i * 4 + 1] + segs[i * 4 + 3]) / 2;
        if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) k++;
      }
      return `${r.name} ${k}`;
    });
    console.log(`  ${n}: ${tally.join(", ")}`);
  }
}

// ── a. Symbol finding, today and on the electrical layers alone ────────────
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
const PLAN_A = { x0: 150, y0: 820, x1: 1200, y1: 1680 };
const inA = (x: number, y: number) =>
  x >= PLAN_A.x0 && x <= PLAN_A.x1 && y >= PLAN_A.y0 && y <= PLAN_A.y1;

async function matching() {
  const { findMatching } = await import("../client/src/lib/findMatching");
  const p = await load("Weld 1.pdf", 5);
  const marks = await weldMarks();
  const electrical = layerGeometry(
    p,
    l => l !== null && /^E-|^ES$/.test(l) && !/ANNO/.test(l)
  );
  console.log(
    `Weld 1 E-200: all ${p.geo.segs.length / 4} segments; electrical layers only ${electrical.segs.length / 4}`
  );
  for (const [label, geo] of [
    ["ALL LINE WORK (today)", p.geo],
    ["ELECTRICAL LAYERS ONLY", electrical],
  ] as const) {
    let hand = 0;
    let found = 0;
    let onOther = 0;
    let onOtherSilent = 0;
    let onNothing = 0;
    let ms = 0;
    for (const [type, t] of Object.entries(TEMPLATES)) {
      const box = {
        x: t.at[0] + t.box[0],
        y: t.at[1] + t.box[1],
        width: t.box[2] - t.box[0],
        height: t.box[3] - t.box[1],
      };
      const started = performance.now();
      const r = findMatching(geo, p.words, box);
      ms += performance.now() - started;
      const mine = marks.filter(m => m.type === type);
      hand += mine.length;
      if (r.kind !== "ok") {
        console.log(`  ${type}: ${r.kind}`);
        continue;
      }
      const used = new Set<number>();
      for (const m of r.matches.filter(m => inA(m.x, m.y))) {
        const i = mine.findIndex(
          (h, k) => !used.has(k) && Math.hypot(h.x - m.x, h.y - m.y) <= 6
        );
        if (i >= 0) {
          used.add(i);
          found++;
          continue;
        }
        const other = marks.some(
          h => h.type !== type && Math.hypot(h.x - m.x, h.y - m.y) <= 6
        );
        if (other) {
          onOther++;
          if (!m.needsLook.length && !m.maybeExisting.length) onOtherSilent++;
        } else onNothing++;
      }
    }
    console.log(
      `  ${label}: ${found}/${hand} found; on another type's mark ${onOther} (${onOtherSilent} silent); on no mark ${onNothing}; ${ms.toFixed(0)} ms for 7 searches`
    );
  }

  // UNCC E111: no hand count. The sheet labels USB receptacles in words, so
  // "is there a receptacle found beside each USB label" is a recall proxy.
  const u = await load("UNCC.pdf", 5);
  const box = { x: 1229.6, y: 969, width: 12, height: 12 }; // beside a USB label
  const r = findMatching(u.geo, u.words, box);
  if (r.kind === "ok") {
    const usb = u.words.filter(w => w.text === "USB");
    const near = (d: number) =>
      usb.filter(w =>
        r.matches.some(m => Math.hypot(m.x - w.cx, m.y - w.cy) <= d)
      ).length;
    console.log(
      `\nUNCC E111 (${u.geo.segs.length / 4} segments): receptacle box finds ${r.matches.length}; ` +
        `USB labels with a find within 16 / 24 / 32 pt: ${near(16)} / ${near(24)} / ${near(32)} of ${usb.length}`
    );
  }
}

/** Hand marks on one sheet of the reader-test account. */
async function marksOn(sheetId: number) {
  const db = await import("../server/db");
  const { splitExistingToRemain } = await import("../shared/existingToRemain");
  const user = await db.getUserByEmail("reader-test@local.test");
  if (!user) throw new Error("No reader-test account in this database.");
  return (await db.getStampsForSheet(sheetId, user.id)).map(m => ({
    type: splitExistingToRemain(m.groupLabel ?? "").base,
    x: Number(m.x),
    y: Number(m.y),
  }));
}

/**
 * UNCC E111 against its hand count (sheet 234268, 243 marks). One box per
 * type, chosen as the BEST of 9 tries (3 sizes round each of the type's
 * first 3 marks) — an upper bound on one person's box, said as such.
 * A USB duplex is drawn exactly like a duplex, so the two are scored as
 * one shape here; telling them apart is section "text".
 */
async function uncc() {
  const { findMatching } = await import("../client/src/lib/findMatching");
  const u = await load("UNCC.pdf", 5);
  const marks = await marksOn(234268);
  const shape = (t: string) =>
    t === "USB DUPLEX CONVENIENCE OUTLET" ? "DUPLEX RECEPTACLE" : t;
  const types = Array.from(new Set(marks.map(m => shape(m.type))));
  let allHand = 0;
  let allFound = 0;
  for (const type of types) {
    const mine = marks.filter(m => shape(m.type) === type);
    allHand += mine.length;
    let best: {
      found: number;
      other: number;
      silent: number;
      nothing: number;
      box: string;
      n: number;
    } | null = null;
    for (const seed of mine.slice(0, 3))
      for (const s of [9, 12, 15]) {
        const box = {
          x: seed.x - s / 2,
          y: seed.y - s / 2,
          width: s,
          height: s,
        };
        const r = findMatching(u.geo, u.words, box);
        if (r.kind !== "ok") continue;
        const used = new Set<number>();
        let found = 0;
        let other = 0;
        let silent = 0;
        let nothing = 0;
        for (const m of r.matches) {
          const i = mine.findIndex(
            (h, k) => !used.has(k) && Math.hypot(h.x - m.x, h.y - m.y) <= 8
          );
          if (i >= 0) {
            used.add(i);
            found++;
          } else if (
            marks.some(
              h =>
                shape(h.type) !== type && Math.hypot(h.x - m.x, h.y - m.y) <= 8
            )
          ) {
            other++;
            if (!m.needsLook.length && !m.maybeExisting.length) silent++;
          } else nothing++;
        }
        const score = found - other - nothing;
        if (!best || score > best.found - best.other - best.nothing)
          best = {
            found,
            other,
            silent,
            nothing,
            n: r.matches.length,
            box: `${s} pt round (${seed.x.toFixed(0)}, ${seed.y.toFixed(0)})`,
          };
      }
    if (!best) {
      console.log(`  ${type} (${mine.length}): no box searchable`);
      continue;
    }
    allFound += best.found;
    console.log(
      `  ${type}: ${best.found}/${mine.length} found; on another type's mark ${best.other} (${best.silent} silent); on no mark ${best.nothing} [${best.box}]`
    );
  }
  console.log(`  ALL: ${allFound}/${allHand}`);
}

// ── b. Text near symbols: can code tie each label to the right device? ────
/**
 * The TIE step alone: devices are the hand marks (true positions), so this
 * measures tying, not finding. For each label: its nearest device d1 and
 * second-nearest d2. Rules scored:
 *   today  — the matcher's ring: within ~12.6 pt of a small device's centre;
 *   R      — nearest device within R pt;
 *   mutual — nearest within R AND that device's nearest label is this one.
 */
function tie(
  words: { cx: number; cy: number }[],
  devices: { x: number; y: number; type: string }[],
  R: number,
  mutual: boolean
): Map<number, number> {
  const out = new Map<number, number>(); // device index -> word index
  const nearestDevice = (w: { cx: number; cy: number }) => {
    let best = -1;
    let d = Infinity;
    devices.forEach((v, i) => {
      const e = Math.hypot(v.x - w.cx, v.y - w.cy);
      if (e < d) {
        d = e;
        best = i;
      }
    });
    return { i: best, d };
  };
  const nearestWord = (v: { x: number; y: number }) => {
    let best = -1;
    let d = Infinity;
    words.forEach((w, i) => {
      const e = Math.hypot(v.x - w.cx, v.y - w.cy);
      if (e < d) {
        d = e;
        best = i;
      }
    });
    return best;
  };
  words.forEach((w, wi) => {
    const { i, d } = nearestDevice(w);
    if (i < 0 || d > R) return;
    if (mutual && nearestWord(devices[i]) !== wi) return;
    out.set(i, wi);
  });
  return out;
}

function scoreTie(
  label: string,
  words: { cx: number; cy: number }[],
  devices: { x: number; y: number; type: string }[],
  isTruth: (type: string) => boolean
) {
  const truth = devices.filter(d => isTruth(d.type)).length;
  const rows: string[] = [];
  for (const [rule, R, mutual] of [
    ["today ~12.6", 12.6, false],
    ["nearest 16", 16, false],
    ["nearest 24", 24, false],
    ["nearest 36", 36, false],
    ["mutual 24", 24, true],
    ["mutual 36", 36, true],
  ] as const) {
    const t = tie(words, devices, R, mutual);
    let right = 0;
    let wrong = 0;
    t.forEach((_, i) => (isTruth(devices[i].type) ? right++ : wrong++));
    rows.push(`${rule}: ${right}/${truth} right, ${wrong} wrong`);
  }
  console.log(
    `  ${label} (${words.length} labels, ${truth} true devices): ${rows.join(" | ")}`
  );
}

async function text() {
  // UNCC E111: "USB" and "GF" decide USB duplex / GFCI vs plain duplex.
  const u = await load("UNCC.pdf", 5);
  const um = await marksOn(234268);
  const receptacles = um.filter(m => /DUPLEX|GFCI|USB/.test(m.type));
  console.log(
    `UNCC E111 — ${receptacles.length} receptacle-shaped devices (hand marks):`
  );
  scoreTie(
    "USB",
    u.words.filter(w => w.text === "USB"),
    receptacles,
    t => /USB/.test(t)
  );
  scoreTie(
    "GF",
    u.words.filter(w => /^GF(CI|I)?$/.test(w.text)),
    receptacles,
    t => /GFCI/.test(t)
  );
  // How far each label sits from its true device.
  const dist = (ws: { cx: number; cy: number }[], ok: (t: string) => boolean) =>
    ws
      .map(w =>
        Math.min(
          ...receptacles
            .filter(d => ok(d.type))
            .map(d => Math.hypot(d.x - w.cx, d.y - w.cy))
        )
      )
      .sort((a, b) => a - b);
  const du = dist(
    u.words.filter(w => w.text === "USB"),
    t => /USB/.test(t)
  );
  console.log(
    `  USB label -> nearest USB device: median ${du[du.length >> 1].toFixed(1)} pt, 90% ${du[Math.floor(du.length * 0.9)].toFixed(1)} pt, max ${du[du.length - 1].toFixed(1)} pt`
  );
  // Circuit tags beside devices: "2B-27" is three words here ("2B" "-" "27").
  const tags = u.words.filter(w => /^\d[A-Z]$/.test(w.text));
  const withTag = um.filter(m =>
    tags.some(t => Math.hypot(t.cx - m.x, t.cy - m.y) <= 24)
  ).length;
  console.log(
    `  circuit tags ("2B" + number): ${tags.length} found as words; devices with one within 24 pt: ${withTag}/${um.length}`
  );

  // Weld 1 E-200: heights and (E) beside the 10 telecom outlets.
  const w = await load("Weld 1.pdf", 5);
  const wm = await weldMarks();
  const telecom = wm.filter(m => /TELECOM/.test(m.type));
  const allDev = wm;
  console.log(
    `\nWeld 1 E-200 — truth for the 10 telecom outlets: 2 x 54", 1 x 36", 2 x (E):`
  );
  const heights = w.words.filter(x => /^\d{2}"$/.test(x.text));
  const existing = w.words.filter(x => /^\(E\)$/i.test(x.text));
  console.log(
    `  words: ${heights.length} heights (${heights.map(h => h.text).join(" ")}), ${existing.length} "(E)"`
  );
  for (const [name, ws] of [
    ["heights", heights],
    ["(E)", existing],
  ] as const) {
    for (const R of [16, 24, 36]) {
      const t = tie(ws, allDev, R, false);
      const onTelecom = Array.from(t.keys()).filter(i =>
        /TELECOM/.test(allDev[i].type)
      ).length;
      console.log(
        `  ${name} nearest within ${R}: tied ${t.size} (${onTelecom} to telecom outlets, ${t.size - onTelecom} to other devices)`
      );
      if (R === 16) {
        const types = new Map<string, number>();
        t.forEach((_, i) =>
          types.set(allDev[i].type, (types.get(allDev[i].type) ?? 0) + 1)
        );
        console.log(`    tied to: ${JSON.stringify(Array.from(types))}`);
      }
    }
  }
  console.log(`  telecom outlets: ${telecom.length}`);
  // Circuit labels on E-200 ("SL-24", "15").
  const ckt = w.words.filter(x => /^[A-Z]{1,3}-\d+$/.test(x.text));
  console.log(
    `  circuit-like tags (e.g. SL-24): ${ckt.length}; devices with one within 24 pt: ${wm.filter(m => ckt.some(t => Math.hypot(t.cx - m.x, t.cy - m.y) <= 24)).length}/${wm.length}`
  );
}

// ── d. Home runs: arrowheads, tick marks, circuit tags ─────────────────────
/** Filled triangles 1–8 pt across, from the filled segments (arrowheads). */
function arrowheads(geo: Loaded["geo"]) {
  const s = geo.segs;
  const idx: number[] = [];
  for (let i = 0; i < s.length / 4; i++) {
    const l = Math.hypot(s[i * 4 + 2] - s[i * 4], s[i * 4 + 3] - s[i * 4 + 1]);
    if (geo.filled[i] && l >= 0.8 && l <= 8) idx.push(i);
  }
  const key = (x: number, y: number) =>
    `${Math.round(x * 4)},${Math.round(y * 4)}`;
  const byEnd = new Map<string, number[]>();
  for (const i of idx)
    for (const a of [0, 2]) {
      const k = key(s[i * 4 + a], s[i * 4 + a + 1]);
      byEnd.set(k, [...(byEnd.get(k) ?? []), i]);
    }
  const found: { x: number; y: number }[] = [];
  const used = new Set<number>();
  for (const i of idx) {
    if (used.has(i)) continue;
    const a = key(s[i * 4], s[i * 4 + 1]);
    const b = key(s[i * 4 + 2], s[i * 4 + 3]);
    // j shares b; k joins j's other end back to a.
    for (const j of byEnd.get(b) ?? []) {
      if (j === i || used.has(j)) continue;
      const jo = key(s[j * 4], s[j * 4 + 1]) === b ? 2 : 0;
      const c = key(s[j * 4 + jo], s[j * 4 + jo + 1]);
      const k = (byEnd.get(c) ?? []).find(
        k =>
          k !== i &&
          k !== j &&
          !used.has(k) &&
          [
            key(s[k * 4], s[k * 4 + 1]),
            key(s[k * 4 + 2], s[k * 4 + 3]),
          ].includes(a)
      );
      if (k === undefined) continue;
      [i, j, k].forEach(q => used.add(q));
      found.push({
        x: (s[i * 4] + s[i * 4 + 2] + s[j * 4 + jo]) / 3,
        y: (s[i * 4 + 1] + s[i * 4 + 3] + s[j * 4 + jo + 1]) / 3,
      });
      break;
    }
  }
  return found;
}

/** Short strokes (1–5 pt) crossing a longer stroked line at their middle. */
function ticks(geo: Loaded["geo"]) {
  const s = geo.segs;
  const n = s.length / 4;
  const CELL = 10;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(s[i * 4 + 2] - s[i * 4], s[i * 4 + 3] - s[i * 4 + 1]);
    if (geo.filled[i] || l < 8) continue;
    const mx = (s[i * 4] + s[i * 4 + 2]) / 2;
    const my = (s[i * 4 + 1] + s[i * 4 + 3]) / 2;
    const k = `${Math.floor(mx / CELL)},${Math.floor(my / CELL)}`;
    grid.set(k, [...(grid.get(k) ?? []), i]);
  }
  let count = 0;
  const at: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(s[i * 4 + 2] - s[i * 4], s[i * 4 + 3] - s[i * 4 + 1]);
    if (geo.filled[i] || l < 1 || l > 5) continue;
    const mx = (s[i * 4] + s[i * 4 + 2]) / 2;
    const my = (s[i * 4 + 1] + s[i * 4 + 3]) / 2;
    const ux = (s[i * 4 + 2] - s[i * 4]) / l;
    const uy = (s[i * 4 + 3] - s[i * 4 + 1]) / l;
    let crosses = false;
    for (let cx = -3; cx <= 3 && !crosses; cx++)
      for (let cy = -3; cy <= 3 && !crosses; cy++)
        for (const j of grid.get(
          `${Math.floor(mx / CELL) + cx},${Math.floor(my / CELL) + cy}`
        ) ?? []) {
          const ax = s[j * 4];
          const ay = s[j * 4 + 1];
          const dx = s[j * 4 + 2] - ax;
          const dy = s[j * 4 + 3] - ay;
          const L = Math.hypot(dx, dy);
          if (Math.abs((dx * ux + dy * uy) / L) > 0.8) continue; // across it
          const t = ((mx - ax) * dx + (my - ay) * dy) / (L * L);
          if (t < 0 || t > 1) continue;
          if (Math.hypot(ax + t * dx - mx, ay + t * dy - my) <= 0.6) {
            crosses = true;
            break;
          }
        }
    if (crosses) {
      count++;
      at.push({ x: mx, y: my });
    }
  }
  return { count, at };
}

async function homeruns() {
  for (const [file, pageNo, tagRe, joined] of [
    ["Weld 1.pdf", 5, /^[A-Z]{1,3}-\d+(,\d+)*$/, false],
    ["UNCC.pdf", 5, /^\d[A-Z]$/, true],
  ] as const) {
    const p = await load(file, pageNo);
    const arrows = arrowheads(p.geo);
    const t = ticks(p.geo);
    const tags = p.words.filter(w => tagRe.test(w.text));
    const near = (pts: { x: number; y: number }[], d: number) =>
      tags.filter(w => pts.some(a => Math.hypot(a.x - w.cx, a.y - w.cy) <= d))
        .length;
    // Ticks grouped into runs of parallel strokes within 3 pt of each other.
    const groups: { x: number; y: number; n: number }[] = [];
    for (const a of t.at) {
      const g = groups.find(g => Math.hypot(g.x - a.x, g.y - a.y) <= 3);
      if (g) g.n++;
      else groups.push({ ...a, n: 1 });
    }
    const sizes = new Map<number, number>();
    groups.forEach(g => sizes.set(g.n, (sizes.get(g.n) ?? 0) + 1));
    console.log(
      `${file} p${pageNo}: ${arrows.length} filled-triangle arrowheads; ${t.count} tick strokes in ${groups.length} groups ` +
        `(by size ${JSON.stringify(Array.from(sizes).sort((a, b) => a[0] - b[0]))}); ` +
        `${tags.length} circuit tags${joined ? " (panel part, e.g. 2B)" : ""}; ` +
        `tags with an arrowhead within 15 / 30 pt: ${near(arrows, 15)} / ${near(arrows, 30)}; ` +
        `with a tick group within 30 pt: ${near(groups, 30)}`
    );
  }
}

// ── e. Schedules straight from the PDF text ─────────────────────────────────
/**
 * Rows = text items sharing a baseline (within 1.5 pt); a panel schedule is
 * found by a header row holding CKT / CIRCUIT and a load or breaker word.
 * Scored without a hand key by what a schedule must satisfy: circuit
 * numbers 1..N with none missing, and every circuit tag ON THE PLAN for that
 * panel present in it.
 */
async function schedules() {
  type W = Loaded["words"][number];
  const rowsOf = (words: readonly W[]) => {
    const rows: { y: number; items: W[] }[] = [];
    for (const w of [...words].sort((a, b) => a.cy - b.cy)) {
      const r = rows.find(r => Math.abs(r.y - w.cy) <= 2);
      if (r) r.items.push(w);
      else rows.push({ y: w.cy, items: [w] });
    }
    rows.forEach(r => r.items.sort((a, b) => a.cx - b.cx));
    return rows;
  };
  /** Every panel table on a page: a header row with two "CKT." columns. */
  const tables = (p: Loaded) => {
    const rows = rowsOf(p.words);
    const out: {
      name: string;
      circuits: Map<number, { desc: string; breaker: string }>;
    }[] = [];
    for (const h of rows) {
      const ckts = h.items.filter(i => /^CKT\.?$/i.test(i.text));
      if (ckts.length < 2) continue;
      for (let k = 0; k + 1 < ckts.length; k += 2) {
        const odd = ckts[k];
        const even = ckts[k + 1];
        if (even.cx - odd.cx > 80) continue;
        const brkrL = h.items
          .filter(i => /^BRKR$/i.test(i.text) && i.cx < odd.cx)
          .pop();
        const brkrR = h.items.find(
          i => /^BRKR$/i.test(i.text) && i.cx > even.cx
        );
        const circuits = new Map<number, { desc: string; breaker: string }>();
        let misses = 0;
        for (const r of rows.filter(r => r.y > h.y + 5)) {
          const at = (x: number) =>
            r.items.find(
              i => Math.abs(i.cx - x) <= 6 && /^\d{1,3}$/.test(i.text)
            );
          const a = at(odd.cx);
          const b = at(even.cx);
          if (!a && !b) {
            if (++misses > 3) break; // past the table
            continue;
          }
          misses = 0;
          const textOn = (from: number, to: number) =>
            r.items
              .filter(i => i.cx > from && i.cx < to && /[A-Z]/i.test(i.text))
              .map(i => i.text)
              .join(" ");
          const brk = (x: number | undefined) =>
            x === undefined
              ? ""
              : (r.items.find(i => Math.abs(i.cx - x) <= 8)?.text ?? "");
          if (a)
            circuits.set(Number(a.text), {
              desc: textOn(odd.cx - 340, odd.cx - 160),
              breaker: brk(brkrL?.cx),
            });
          if (b)
            circuits.set(Number(b.text), {
              desc: textOn(even.cx + 160, even.cx + 340),
              breaker: brk(brkrR?.cx),
            });
        }
        // The panel's name: a short code like "2B" or "LP-1" just above.
        const above = p.words
          .filter(
            w =>
              w.cy < h.y &&
              w.cy > h.y - 90 &&
              Math.abs(w.cx - (odd.cx + even.cx) / 2) < 400 &&
              /^[0-9]?[A-Z]{1,3}(-?\d{0,2})?$/.test(w.text) &&
              !/^(CKT|NO|A|B|C|IN|KVA|VA)$/i.test(w.text)
          )
          .sort((x, y) => y.height - x.height);
        out.push({ name: above[0]?.text ?? "?", circuits });
      }
    }
    return out;
  };
  const allTables: {
    file: string;
    name: string;
    circuits: Map<number, { desc: string; breaker: string }>;
  }[] = [];
  for (const [file, pageNo] of [
    ["Weld 1.pdf", 3],
    ["UNCC.pdf", 3],
  ] as const) {
    const p = await load(file, pageNo);
    const ts = tables(p);
    console.log(
      `${file} p${pageNo}: ${ts.length} panel tables found by their CKT. columns`
    );
    for (const t of ts) {
      const nums = Array.from(t.circuits.keys());
      const max = nums.length ? Math.max(...nums) : 0;
      const missing = Array.from({ length: max }, (_, k) => k + 1).filter(
        k => !t.circuits.has(k)
      );
      const withBreaker = Array.from(t.circuits.values()).filter(c =>
        /^\d+\/\d$/.test(c.breaker)
      ).length;
      const withDesc = Array.from(t.circuits.values()).filter(
        c => c.desc
      ).length;
      console.log(
        `   panel "${t.name}": ${nums.length} circuits (max ${max}, missing ${missing.length ? missing.join(",") : "none"}); breaker read ${withBreaker}; description read ${withDesc}; e.g. ${JSON.stringify(t.circuits.get(1) ?? null)}`
      );
      allTables.push({ file, ...t });
    }
  }
  // Cross-check: E111's circuit tags ("2B" "-" "27", three words on a line)
  // against the schedule read above.
  const e = await load("UNCC.pdf", 5);
  const rows = rowsOf(e.words);
  const tags: { panel: string; n: number }[] = [];
  for (const r of rows)
    r.items.forEach((w, i) => {
      if (!/^\d[A-Z]{1,2}$/.test(w.text)) return;
      const dash = r.items[i + 1];
      const num = r.items[i + 2];
      if (dash?.text === "-" && num && /^\d{1,3}(,\d{1,3})*$/.test(num.text))
        num.text
          .split(",")
          .forEach(n => tags.push({ panel: w.text, n: Number(n) }));
    });
  const byPanel = new Map(
    allTables.filter(t => t.file === "UNCC.pdf").map(t => [t.name, t])
  );
  const inSchedule = tags.filter(t =>
    byPanel.get(t.panel)?.circuits.has(t.n)
  ).length;
  const panelsNamed = Array.from(new Set(tags.map(t => t.panel)));
  console.log(
    `UNCC E111 circuit tags read: ${tags.length} (panels ${panelsNamed.join(", ")}); found in that panel's schedule: ${inSchedule}/${tags.length}; schedules read for: ${Array.from(byPanel.keys()).join(", ")}`
  );
}

// ── f. Addenda: what changed between two versions of a sheet ───────────────
/**
 * Line-by-line: every segment quantised to 0.25 pt (both directions), and
 * the two sheets' sets compared. Two real versions of one sheet are not in
 * the test set, so: (1) the same sheet twice must show NOTHING; (2) E-200
 * with 3 devices deleted and 1 moved 20 pt (an addendum made on purpose)
 * must show exactly those; (3) UNCC E111 vs ED111 — new vs demolition of
 * the same floor — shows how much shared background cancels.
 */
async function addenda() {
  const q = (v: number) => Math.round(v * 4);
  const sig = (s: Float32Array, i: number) => {
    const a = `${q(s[i * 4])},${q(s[i * 4 + 1])}`;
    const b = `${q(s[i * 4 + 2])},${q(s[i * 4 + 3])}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  const diff = (s1: Float32Array, s2: Float32Array) => {
    const A = new Map<string, number>();
    for (let i = 0; i < s1.length / 4; i++)
      A.set(sig(s1, i), (A.get(sig(s1, i)) ?? 0) + 1);
    let added = 0;
    const addedAt: { x: number; y: number }[] = [];
    for (let i = 0; i < s2.length / 4; i++) {
      const k = sig(s2, i);
      const c = A.get(k) ?? 0;
      if (c > 0) A.set(k, c - 1);
      else {
        added++;
        addedAt.push({
          x: (s2[i * 4] + s2[i * 4 + 2]) / 2,
          y: (s2[i * 4 + 1] + s2[i * 4 + 3]) / 2,
        });
      }
    }
    let removed = 0;
    A.forEach(c => (removed += c));
    // Cluster the changes into places, 20 pt apart.
    const places: { x: number; y: number }[] = [];
    for (const a of addedAt)
      if (!places.some(p => Math.hypot(p.x - a.x, p.y - a.y) <= 20))
        places.push(a);
    return { added, removed, addedPlaces: places.length };
  };
  const w = await load("Weld 1.pdf", 5);
  console.log(
    `Same sheet twice: ${JSON.stringify(diff(w.geo.segs, w.geo.segs))}`
  );
  // The made-up addendum: delete the line work of 3 duplexes, move 1 by 20 pt.
  const marks = (await weldMarks()).filter(m => m.type === "DUPLEX RECEPTACLE");
  const s = w.geo.segs;
  const out: number[] = [];
  const del = marks.slice(0, 3);
  const mv = marks[3];
  for (let i = 0; i < s.length / 4; i++) {
    const mx = (s[i * 4] + s[i * 4 + 2]) / 2;
    const my = (s[i * 4 + 1] + s[i * 4 + 3]) / 2;
    const l = Math.hypot(s[i * 4 + 2] - s[i * 4], s[i * 4 + 3] - s[i * 4 + 1]);
    if (l < 12 && del.some(d => Math.hypot(d.x - mx, d.y - my) <= 7)) continue;
    if (l < 12 && Math.hypot(mv.x - mx, mv.y - my) <= 7) {
      out.push(s[i * 4] + 20, s[i * 4 + 1], s[i * 4 + 2] + 20, s[i * 4 + 3]);
      continue;
    }
    out.push(s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3]);
  }
  const d2 = diff(s, Float32Array.from(out));
  console.log(
    `E-200 with 3 duplexes deleted and 1 moved 20 pt: ${JSON.stringify(d2)} (expect removed at 4 places, added at 1)`
  );
  const e = await load("UNCC.pdf", 5);
  const ed = await load("UNCC.pdf", 7);
  const d3 = diff(ed.geo.segs, e.geo.segs);
  console.log(
    `UNCC ED111 -> E111 (${ed.geo.segs.length / 4} -> ${e.geo.segs.length / 4} segments): ${JSON.stringify(d3)}; ` +
      `shared ${(100 * (1 - d3.added / (e.geo.segs.length / 4))).toFixed(1)}% of E111`
  );
  // Are they merely OFFSET? The most common shift between long horizontal
  // lines of equal length, then the diff again after shifting.
  const longs = (s: Float32Array) => {
    const out: { x: number; y: number; l: number }[] = [];
    for (let i = 0; i < s.length / 4; i++) {
      const l = Math.hypot(
        s[i * 4 + 2] - s[i * 4],
        s[i * 4 + 3] - s[i * 4 + 1]
      );
      if (l > 80 && Math.abs(s[i * 4 + 3] - s[i * 4 + 1]) < 0.01)
        out.push({ x: Math.min(s[i * 4], s[i * 4 + 2]), y: s[i * 4 + 1], l });
    }
    return out;
  };
  const la = longs(ed.geo.segs);
  const lb = longs(e.geo.segs);
  const votes = new Map<string, number>();
  for (const a of la.slice(0, 1500))
    for (const b of lb)
      if (Math.abs(a.l - b.l) < 0.05) {
        const k = `${(b.x - a.x).toFixed(1)},${(b.y - a.y).toFixed(1)}`;
        votes.set(k, (votes.get(k) ?? 0) + 1);
      }
  const top = Array.from(votes)
    .sort((p, q) => q[1] - p[1])
    .slice(0, 3);
  console.log(
    `  most common shift ED111 -> E111 (long horizontal lines): ${JSON.stringify(top)}`
  );
  if (top.length) {
    const [dx, dy] = top[0][0].split(",").map(Number);
    const shifted = Float32Array.from(ed.geo.segs, (v, i) =>
      i % 2 === 0 ? v + dx : v + dy
    );
    const d4 = diff(shifted, e.geo.segs);
    console.log(
      `  after shifting by (${dx}, ${dy}): ${JSON.stringify(d4)}; shared ${(100 * (1 - d4.added / (e.geo.segs.length / 4))).toFixed(1)}% of E111`
    );
  }
}

// ── g. Scale: the title block's words, checked against a dimension ─────────
async function scale() {
  const { detectScaleFromText } = await import("../shared/planScale");
  for (const [file, pageNo] of [
    ["Weld 1.pdf", 4],
    ["Weld 1.pdf", 5],
    ["UNCC.pdf", 5],
    ["UNCC.pdf", 6],
    ["Old Blueridge school.pdf", 3],
  ] as const) {
    const p = await load(file, pageNo);
    const all = p.words.map(w => w.text).join(" ");
    const det = detectScaleFromText(all);
    const scales = (all.match(/SCALE:?\s*[^A-Z]{3,25}/gi) ?? []).slice(0, 6);
    // Dimension strings like 12'-6" or 24'-0".
    const dims = p.words.filter(w =>
      /^\d{1,3}'-\d{1,2}(\s?\d\/\d)?"$/.test(w.text)
    );
    console.log(
      `${file} p${pageNo}: detect ${JSON.stringify(det).slice(0, 140)}; "SCALE" strings ${JSON.stringify(scales)}; dimension strings ${dims.length}${
        dims.length
          ? ` e.g. ${dims
              .slice(0, 4)
              .map(d => d.text)
              .join(" ")}`
          : ""
      }`
    );
  }
}

// ── labels: the find's flags and labels, scored (before/after the tie) ─────
/** Everything a find says in words: flags, and labels where it has them. */
const said = (m: {
  needsLook: string[];
  maybeExisting: string[];
  labels?: string[];
}) => [...m.needsLook, ...m.maybeExisting, ...(m.labels ?? [])].join(" | ");

async function labels() {
  const { findMatching } = await import("../client/src/lib/findMatching");
  const u = await load("UNCC.pdf", 5);
  const um = await marksOn(234268);
  const usbWords = u.words.filter(w => w.text === "USB");
  const onMark = (m: { x: number; y: number }) =>
    um.find(h => Math.hypot(h.x - m.x, h.y - m.y) <= 8);
  // A PLAIN duplex to box: no USB/GF label within 30 pt.
  const seed = um.find(
    h =>
      h.type === "DUPLEX RECEPTACLE" &&
      !u.words.some(
        w =>
          /^(USB|GF|GFI|GFCI)$/.test(w.text) &&
          Math.hypot(w.cx - h.x, w.cy - h.y) <= 30
      )
  )!;
  const r = findMatching(u.geo, u.words, {
    x: seed.x - 4.5,
    y: seed.y - 4.5,
    width: 9,
    height: 9,
  });
  if (r.kind !== "ok") throw new Error(`duplex box: ${r.kind}`);
  let usbFound = 0;
  let usbSaid = 0;
  let plainFound = 0;
  let plainSaidUsb = 0;
  let gfFound = 0;
  let gfSaid = 0;
  for (const m of r.matches) {
    const h = onMark(m);
    if (!h) continue;
    const s = said(m);
    if (h.type === "USB DUPLEX CONVENIENCE OUTLET") {
      usbFound++;
      if (/USB/.test(s)) usbSaid++;
    } else if (h.type === "DUPLEX RECEPTACLE") {
      plainFound++;
      if (/USB/.test(s)) plainSaidUsb++;
    } else if (h.type === "GFCI receptacle") {
      gfFound++;
      if (/GF/.test(s)) gfSaid++;
    }
  }
  console.log(
    `UNCC E111, plain-duplex box at (${seed.x.toFixed(0)}, ${seed.y.toFixed(0)}): ` +
      `USB devices found ${usbFound}, saying USB ${usbSaid}; plain found ${plainFound}, wrongly saying USB ${plainSaidUsb}; ` +
      `GFCI found ${gfFound}, saying GF ${gfSaid}  (${usbWords.length} USB labels on the sheet)`
  );
  // The GFCI box: duplexes it finds must not come back silent.
  const g = um.find(h => h.type === "GFCI receptacle")!;
  const rg = findMatching(u.geo, u.words, {
    x: g.x - 4.5,
    y: g.y - 4.5,
    width: 9,
    height: 9,
  });
  if (rg.kind === "ok") {
    let onDuplex = 0;
    let silent = 0;
    let gfcis = 0;
    for (const m of rg.matches) {
      const h = onMark(m);
      if (h?.type === "GFCI receptacle") gfcis++;
      else if (h && /DUPLEX/.test(h.type)) {
        onDuplex++;
        if (!m.needsLook.length) silent++;
      }
    }
    console.log(
      `UNCC E111, GFCI box: GFCIs found ${gfcis}/4; duplexes found ${onDuplex}, of them SILENT ${silent}`
    );
  }

  // Weld 1 E-200.
  const w = await load("Weld 1.pdf", 5);
  const wm = await weldMarks();
  let flags = 0;
  for (const [type, t] of Object.entries(TEMPLATES)) {
    const box = {
      x: t.at[0] + t.box[0],
      y: t.at[1] + t.box[1],
      width: t.box[2] - t.box[0],
      height: t.box[3] - t.box[1],
    };
    const rr = findMatching(w.geo, w.words, box);
    if (rr.kind !== "ok") continue;
    const mine = wm.filter(h => h.type === type);
    const on = rr.matches.filter(m =>
      mine.some(h => Math.hypot(h.x - m.x, h.y - m.y) <= 6)
    );
    flags += rr.matches.filter(m => m.needsLook.length).length;
    if (type === "TELECOM CABINET, FLUSH MOUNT")
      console.log(
        `Weld 1 E-200 telecom (truth 2 x 54", 1 x 36", 2 x (E)): found ${on.length}/10; saying a height ${on.filter(m => /\d{2}"/.test(said(m))).length}; saying (E) ${on.filter(m => /\(E\)/.test(said(m))).length}`
      );
    if (type === "DUPLEX RECEPTACLE")
      console.log(
        `Weld 1 E-200 duplex: found ${on.length}/9; saying (E) ${on.filter(m => /\(E\)/.test(said(m))).length}`
      );
  }
  console.log(
    `Weld 1 E-200: finds with a needs-a-look flag, all 7 types: ${flags}`
  );
}

// ── layered: Find all matching with the PDF's layers passed in (b, built) ──
async function layered() {
  const { findMatching } = await import("../client/src/lib/findMatching");
  const regionB = { x0: 1350, y0: 820, x1: 2300, y1: 1680 };
  const inB = (x: number, y: number) =>
    x >= regionB.x0 && x <= regionB.x1 && y >= regionB.y0 && y <= regionB.y1;
  const p = await load("Weld 1.pdf", 5);
  const marks = await weldMarks();
  const withLayers = extractVectorGeometry(
    p.list.fnArray,
    p.list.argsArray,
    ops,
    p.viewport.transform,
    p.viewport.width,
    p.viewport.height,
    p.layerName
  );
  for (const [label, geo] of [
    ["WITHOUT layers (before)", p.geo],
    ["WITH layers (after)", withLayers],
  ] as const) {
    let found = 0;
    let other = 0;
    let silent = 0;
    let nothing = 0;
    let ms = 0;
    let bFinds = 0;
    let bDemolition = 0;
    let bClear = 0;
    let aMarkedDemolition = 0;
    let existingSaid = 0;
    for (const [type, t] of Object.entries(TEMPLATES)) {
      const box = {
        x: t.at[0] + t.box[0],
        y: t.at[1] + t.box[1],
        width: t.box[2] - t.box[0],
        height: t.box[3] - t.box[1],
      };
      const started = performance.now();
      const r = findMatching(geo, p.words, box);
      ms += performance.now() - started;
      if (r.kind !== "ok") continue;
      const mine = marks.filter(m => m.type === type);
      const used = new Set<number>();
      for (const m of r.matches) {
        if (inB(m.x, m.y)) {
          bFinds++;
          if (m.onDemolitionPlan) bDemolition++;
          if (
            !m.onDemolitionPlan &&
            !m.needsLook.length &&
            !m.maybeExisting.length
          ) {
            bClear++;
            if (geo === withLayers)
              console.log(
                `    clear in plan B: ${type} at (${m.x.toFixed(0)}, ${m.y.toFixed(0)})`
              );
          }
          continue;
        }
        if (!inA(m.x, m.y)) continue;
        if (m.onDemolitionPlan) aMarkedDemolition++;
        if (m.maybeExisting.some(x => /existing layer/.test(x))) existingSaid++;
        const i = mine.findIndex(
          (h, k) => !used.has(k) && Math.hypot(h.x - m.x, h.y - m.y) <= 6
        );
        if (i >= 0) {
          used.add(i);
          found++;
        } else if (
          marks.some(
            h => h.type !== type && Math.hypot(h.x - m.x, h.y - m.y) <= 6
          )
        ) {
          other++;
          if (
            !m.needsLook.length &&
            !m.maybeExisting.length &&
            !m.onDemolitionPlan
          )
            silent++;
        } else nothing++;
      }
    }
    console.log(
      `Weld 1 E-200 ${label}: ${found}/46 found; on another type's mark ${other} (${silent} silent); on no mark ${nothing}; ` +
        `${ms.toFixed(0)} ms for 7 searches; demolition plan B finds ${bFinds}, marked demolition ${bDemolition}, CLEAR (Confirm all would take as new) ${bClear}; ` +
        `plan A finds wrongly marked demolition ${aMarkedDemolition}; plan A finds saying "existing layer" ${existingSaid}`
    );
  }
  // UNCC declares layers and tags nothing: must fall back, identical.
  const u = await load("UNCC.pdf", 5);
  const uWith = extractVectorGeometry(
    u.list.fnArray,
    u.list.argsArray,
    ops,
    u.viewport.transform,
    u.viewport.width,
    u.viewport.height,
    u.layerName
  );
  const box = { x: 1229.6, y: 969, width: 12, height: 12 };
  for (const [label, geo] of [
    ["without layers", u.geo],
    ["with layers", uWith],
  ] as const) {
    const started = performance.now();
    const r = findMatching(geo, u.words, box);
    const ms = performance.now() - started;
    console.log(
      `UNCC E111 ${label}: ${r.kind === "ok" ? r.matches.length : r.kind} finds, ${ms.toFixed(0)} ms (layers tagged on ${uWith.layer ? Array.from(uWith.layer).filter(l => l >= 0).length : 0} segments)`
    );
  }
}

// ── demotitles: demolition plans on vector sheets, by their printed title ──
/**
 * Known answer (owner, 2026-10-06): every device in Weld 1 E-200's plan B
 * ("B DEMOLITION POWER PLAN") is demolition, so no find there may be
 * CLEAR; and nothing in plan A (the power plan) may be called demolition.
 * Scored for the matcher as shipped (`findMatching` — layers and, once
 * built, titles), plus title-region variants measured by hand here.
 */
async function demotitles() {
  const { findMatching } = await import("../client/src/lib/findMatching");
  const { planTitles, planRegions, regionAt } = await import(
    "../client/src/lib/scanMatching"
  );
  const p = await load("Weld 1.pdf", 5);
  const geo = extractVectorGeometry(
    p.list.fnArray,
    p.list.argsArray,
    ops,
    p.viewport.transform,
    p.viewport.width,
    p.viewport.height,
    p.layerName
  );
  const regionB = { x0: 1350, y0: 820, x1: 2300, y1: 1680 };
  const inB = (x: number, y: number) =>
    x >= regionB.x0 && x <= regionB.x1 && y >= regionB.y0 && y <= regionB.y1;
  const titles = planTitles(p.words);
  const raw = planRegions(titles, p.viewport.width, p.viewport.height);
  // An ink map from the line work, as the scan path makes one from pixels.
  const cell = 8;
  const cols = Math.ceil(p.viewport.width / cell);
  const rows = Math.ceil(p.viewport.height / cell);
  const data = new Uint8Array(cols * rows);
  for (let i = 0; i < p.geo.segs.length / 4; i++) {
    const x = (p.geo.segs[i * 4] + p.geo.segs[i * 4 + 2]) / 2;
    const y = (p.geo.segs[i * 4 + 1] + p.geo.segs[i * 4 + 3]) / 2;
    const c = Math.floor(x / cell);
    const r = Math.floor(y / cell);
    if (c >= 0 && c < cols && r >= 0 && r < rows) data[r * cols + c] = 1;
  }
  const inked = planRegions(titles, p.viewport.width, p.viewport.height, {
    cell,
    cols,
    rows,
    data,
  });
  let finds: {
    x: number;
    y: number;
    type: string;
    m: import("../client/src/lib/findMatching").Match;
  }[] = [];
  for (const [type, t] of Object.entries(TEMPLATES)) {
    const r = findMatching(geo, p.words, {
      x: t.at[0] + t.box[0],
      y: t.at[1] + t.box[1],
      width: t.box[2] - t.box[0],
      height: t.box[3] - t.box[1],
    });
    if (r.kind === "ok")
      finds = finds.concat(r.matches.map(m => ({ x: m.x, y: m.y, type, m })));
  }
  const clear = (m: import("../client/src/lib/findMatching").Match) =>
    !m.onDemolitionPlan && !m.needsLook.length && !m.maybeExisting.length;
  const b = finds.filter(f => inB(f.x, f.y));
  const a = finds.filter(f => inA(f.x, f.y));
  console.log(
    `Weld 1 E-200 as shipped: plan B finds ${b.length}, CLEAR ${b.filter(f => clear(f.m)).length}, marked demolition ${b.filter(f => f.m.onDemolitionPlan).length}; ` +
      `plan A finds ${a.length}, marked demolition ${a.filter(f => f.m.onDemolitionPlan).length}`
  );
  for (const [label, regions] of [
    ["titles, raw regions", raw],
    ["titles, ink-trimmed regions", inked],
  ] as const) {
    const demo = (f: {
      x: number;
      y: number;
      m: { onDemolitionPlan: string | null };
    }) =>
      Boolean(f.m.onDemolitionPlan) ||
      Boolean(regionAt(regions, f.x, f.y)?.demolition);
    console.log(
      `  + ${label}: plan B CLEAR ${b.filter(f => !demo(f) && !f.m.needsLook.length && !f.m.maybeExisting.length).length}, ` +
        `plan B not demolition ${b.filter(f => !demo(f)).length}/${b.length}; plan A called demolition ${a.filter(demo).length}/${a.length}`
    );
    regions.forEach(r =>
      console.log(
        `      ${r.demolition ? "DEMO" : "    "} "${r.title}" x ${r.x0.toFixed(0)}-${r.x1.toFixed(0)} y ${r.y0.toFixed(0)}-${r.y1.toFixed(0)}`
      )
    );
  }
}

// ── scalecheck: the wrong-length guard, at true and deliberately wrong scales ─
async function scalecheck() {
  const { quarterArcRadii, checkScale, doorsAt } = await import(
    "../client/src/lib/scaleCheck"
  );
  const { detectScaleFromText, parseScaleText } = await import(
    "../shared/planScale"
  );
  const { isScan } = await import("../client/src/lib/findMatching");
  const cases: [string, number, string][] = [
    ["Weld 1.pdf", 5, '1/8" = 1\'-0"'],
    // Our own generated test set: its notes said 1/4" until 2026-10-06,
    // when the doors caught the typo and the file was fixed to 1/8".
    ["Weld 1.pdf", 4, '1/8" = 1\'-0"'],
    ["UNCC.pdf", 5, '1/4" = 1\'-0"'],
    ["UNCC.pdf", 6, '1/4" = 1\'-0"'],
    ["UNCC.pdf", 7, '1/8" = 1\'-0"'],
    ["Old Blueridge school.pdf", 3, '1/4" = 1\'-0"'],
  ];
  for (const [file, pageNo, trueText] of cases) {
    const p = await load(file, pageNo);
    const scan = isScan(p.geo);
    const radii = scan ? null : quarterArcRadii(p.geo.segs);
    const titleScales = detectScaleFromText(
      p.words.map(w => w.text).join(" ")
    ).candidates;
    const trueRatio = parseScaleText(trueText)!.ratio;
    for (const [label, ratio] of [
      ["as stated", trueRatio],
      ["set 2x too fine", trueRatio / 2],
      ["set 2x too coarse", trueRatio * 2],
    ] as const) {
      const r = checkScale({
        ratio,
        text: `${ratio}`,
        arcRadii: radii,
        titleScales,
      });
      console.log(
        `${file} p${pageNo} ${label} (1:${ratio}): ${r.kind}` +
          (r.kind === "mayBeWrong"
            ? ` -> suggests ${r.suggest.text} — "${r.message}"`
            : "") +
          (radii
            ? `  [door-sized arcs at this scale: ${doorsAt(radii, ratio)} of ${radii.length}]`
            : "")
      );
    }
  }
}

// ── e, built: the shipped reader (@/lib/panelSchedules) on every page ──────
/**
 * Every page of all three sets through `readSchedules`, the product code —
 * text only, so this is quick. Then UNCC E111's circuit tags ("2B-27")
 * against the schedule read for that panel, which needs the NAME.
 */
async function schedreader() {
  const { readSchedules } = await import("../client/src/lib/panelSchedules");
  const wordsOf = async (doc: any, pageNo: number) => {
    const page = await doc.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    return wordBoxes({
      items: text.items.flatMap((item: any) =>
        "str" in item
          ? [{ str: item.str, transform: item.transform, width: item.width }]
          : []
      ),
      viewportTransform: viewport.transform,
    });
  };
  const read: Record<string, ReturnType<typeof readSchedules>[]> = {};
  for (const file of ["Weld 1.pdf", "UNCC.pdf", "Old Blueridge school.pdf"]) {
    const doc = await getDocument({
      data: new Uint8Array(readFileSync(path.join(PLANS, file))),
      verbosity: 0,
    }).promise;
    read[file] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const words = await wordsOf(doc, n);
      const s = readSchedules(words);
      read[file].push(s);
      if (!s.panels.length && !s.fixtures.length) {
        console.log(`${file} p${n}: none (${words.length} words of text)`);
        continue;
      }
      for (const p of s.panels) {
        const nums = p.circuits.map(c => c.number);
        const max = Math.max(...nums);
        const missing = Array.from({ length: max }, (_, k) => k + 1).filter(
          k => !nums.includes(k)
        );
        console.log(
          `${file} p${n}: PANEL ${p.name ?? "(no name)"}${p.existing ? " (existing)" : ""} — ${p.circuits.length} circuits, max ${max}, missing ${missing.join(",") || "none"}; breakers ${p.circuits.filter(c => c.amps !== null).length}, descriptions ${p.circuits.filter(c => c.description).length}, loads ${p.circuits.filter(c => c.loadKva !== null).length}; supply "${p.supply}", mains "${p.mains}" (${p.mainsAmps} A), fed from "${p.fedFrom}", connected ${p.connectedKva} kVA, demand ${p.demandKva} kVA; ckt 1 ${JSON.stringify(p.circuits[0])}`
        );
      }
      for (const f of s.fixtures)
        console.log(
          `${file} p${n}: FIXTURES "${f.title}" — ${f.fixtures.map(x => `${x.mark} (${x.watts ?? "-"} W)`).join(", ")}; ${JSON.stringify(f.fixtures[0])}`
        );
    }
  }
  // E111's circuit tags against the schedule for the panel they name.
  const e = await load("UNCC.pdf", 5);
  const rows: { y: number; items: typeof e.words }[] = [];
  for (const w of [...e.words].sort((a, b) => a.cy - b.cy)) {
    const r = rows.find(r => Math.abs(r.y - w.cy) <= 2);
    if (r) r.items.push(w);
    else rows.push({ y: w.cy, items: [w] });
  }
  rows.forEach(r => r.items.sort((a, b) => a.cx - b.cx));
  const tags: { panel: string; n: number }[] = [];
  for (const r of rows)
    r.items.forEach((w, i) => {
      if (!/^\d[A-Z]{1,2}$/.test(w.text)) return;
      const dash = r.items[i + 1];
      const num = r.items[i + 2];
      if (dash?.text === "-" && num && /^\d{1,3}(,\d{1,3})*$/.test(num.text))
        num.text
          .split(",")
          .forEach(n => tags.push({ panel: w.text, n: Number(n) }));
    });
  const panels = read["UNCC.pdf"].flatMap(s => s.panels);
  const found = tags.filter(t =>
    panels
      .find(p => p.name === t.panel)
      ?.circuits.some(c => c.number === t.n && c.description)
  ).length;
  console.log(
    `UNCC E111: ${tags.length} circuit tags; ${found} land on a described circuit of the panel they name`
  );
}

// ── d, built: the shipped homerun reader (@/lib/homeruns) ──────────────────
/**
 * Every homerun the product code reads on the sheets that draw wiring, and
 * the false-positive check: UNCC draws none, so every find there is wrong.
 * weld2 is not in reader-accuracy/plans; it is read from the local upload
 * (bid 1728350) when that copy is on this machine.
 *
 * The hand check (2026-10-06, by eye on rendered crops, before reading this
 * output) is in references/code-first-ceiling.md § d.
 */
async function homerunreader() {
  const { readHomeruns, homerunLabel, tieLines, tieToSchedule } = await import(
    "../client/src/lib/homeruns"
  );
  const weld2 = path.join(
    "..",
    "..",
    ".local-storage",
    "bid-plans",
    "1",
    "1728350",
    "weld2_bd573a7d.pdf"
  );
  const sets: [string, number[]][] = [
    ["Weld 1.pdf", [4, 5]],
    ["UNCC.pdf", [1, 3, 4, 5, 6, 7]],
  ];
  try {
    readFileSync(path.join(PLANS, weld2));
    sets.push([weld2, [8, 12, 13, 14]]);
  } catch {
    console.log("weld2 not on this machine — skipped");
  }
  for (const [file, pages] of sets)
    for (const pageNo of pages) {
      const p = await load(file, pageNo);
      const found = readHomeruns(p.words, p.geo);
      console.log(
        `${path.basename(file)} p${pageNo}: ${found.length} homeruns`
      );
      for (const h of found)
        console.log(
          `  @${Math.round(h.arrow.x)},${Math.round(h.arrow.y)} heads ${h.arrow.heads}: ${homerunLabel(h)} | ${tieLines(tieToSchedule(h.tag, []), h.tag).join("; ")}`
        );
    }
}

// ── Circuits from device tags (@/lib/circuitGroups), UNCC E111 ─────────────
/**
 * The owner's 243 hand marks on E111 grouped by the "2B - n" tag beside
 * each, with E003's schedules. The hand check of circuits 2B-1..2B-21
 * (2026-10-06, by eye on tiles with every tag-to-mark link drawn) is in
 * references/track-c-handoff.md.
 */
async function circuits() {
  const { groupByCircuit } = await import("../client/src/lib/circuitGroups");
  const { readSchedules } = await import("../client/src/lib/panelSchedules");
  const db = await import("../server/db");
  const user = await db.getUserByEmail("reader-test@local.test");
  if (!user) throw new Error("No reader-test account in this database.");
  const marks = (await db.getStampsForSheet(234268, user.id)).map(m => ({
    id: m.id,
    x: Number(m.x),
    y: Number(m.y),
    name: m.groupLabel ?? "?",
  }));
  const r = groupByCircuit({
    words: (await load("UNCC.pdf", 5)).words,
    devices: marks,
    panels: readSchedules((await load("UNCC.pdf", 3)).words).panels,
    placed: {},
  });
  const byItem = new Map<string, [number, number]>();
  for (const m of marks) {
    const s = byItem.get(m.name) ?? [0, 0];
    s[1]++;
    if (r.circuits.some(c => c.devices.includes(m))) s[0]++;
    byItem.set(m.name, s);
  }
  console.log(
    `UNCC E111: ${marks.length} marks, ${r.circuits.length} circuits; grouped by item ${JSON.stringify(Array.from(byItem))}`
  );
  console.log(
    `untagged (flagged) ${r.untagged.length}; not circuited ${JSON.stringify(r.notCircuited)}; tags with no mark ${r.unmatchedTags.length}; off schedule ${r.circuits.filter(c => c.offSchedule).length}`
  );
}

// ── Homerun footage worked example, UNCC E111 circuit 2B-1 ─────────────────
/**
 * The coordinates behind the E111 case in server/homerunFootage.test.ts:
 * circuit 2B-1's devices (the owner's hand marks, grouped by their tags)
 * and the panel spot, a tap on the "EXISTING ELECTRICAL ROOM" note —
 * E111 draws no panel. Reads the marks with plain SQL so a local database
 * a migration behind can still answer.
 */
async function homerunexample() {
  const { groupByCircuit } = await import("../client/src/lib/circuitGroups");
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.query(
    "select s.id, s.x, s.y, g.label from takeoff_stamps s left join takeoff_groups g on g.id = s.groupId where s.sheetId = 234268 order by s.id"
  );
  await conn.end();
  const marks = (
    rows as { id: number; x: string; y: string; label: string | null }[]
  ).map(m => ({
    id: m.id,
    x: Number(m.x),
    y: Number(m.y),
    name: m.label ?? "?",
  }));
  const e = await load("UNCC.pdf", 5);
  const note = e.words.find(w => w.text === "ELECTRICAL" && w.cy < 300);
  console.log(
    `"ELECTRICAL" in the note at ${note?.cx.toFixed(2)}, ${note?.cy.toFixed(2)}; panel spot used: 443, 186`
  );
  const r = groupByCircuit({
    words: e.words,
    devices: marks,
    panels: [],
    placed: { "2B": { x: 443, y: 186 } },
  });
  const c = r.circuits.find(g => g.key === "2B-1");
  for (const d of c?.devices ?? [])
    console.log(
      `  ${d.id} ${d.name} @ ${d.x}, ${d.y}: right angle ${(Math.abs(d.x - 443) + Math.abs(d.y - 186)).toFixed(4)} pt`
    );
  console.log(
    `closest ${c?.closest?.device.id} at ${c?.closest?.distance.toFixed(4)} pt = ${((c?.closest?.distance ?? 0) / 18).toFixed(5)} ft at 1/4" = 1'-0"`
  );
}

const sections: Record<string, () => Promise<void>> = {
  homerunexample,
  circuits,
  homerunreader,
  schedreader,
  scalecheck,
  demotitles,
  layered,
  labels,
  layers,
  matching,
  uncc,
  text,
  homeruns,
  schedules,
  addenda,
  scale,
};
const which = process.argv[2];
if (!which || !sections[which])
  throw new Error(`Say a section: ${Object.keys(sections).join(" | ")}`);
await sections[which]();
process.exit(0);
