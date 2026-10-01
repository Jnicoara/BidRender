/**
 * How well does Find all matching do on a sheet that has a hand count?
 *
 * Runs the SAME code the plans screen runs (@/lib/vectorGeometry,
 * @/lib/findMatching) in node, on the reader-accuracy answer-key bid, and
 * compares what it finds with the owner's own marks. For each counted type
 * one box is drawn round ONE of his marked symbols — snugly, the way a person
 * boxes a symbol; the boxes were checked by eye against renders of each one
 * (2026-10-01) — and every copy on the sheet is compared with ALL his marks
 * of that type.
 *
 * Reads only. Local database only. Writes pictures of every disagreement to
 * the scratch folder given with --out, so each can be looked at and called.
 *
 *   pnpm tsx scripts/findMatchingCheck.mts [--out <folder>]
 *
 * Weld 1, page 5 (E-200), sheet 234263 on bidrender_local_c. The boxes are in
 * page points relative to the mark they were drawn round.
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const { assertWritableDatabase, OVERRIDE_VAR } = await import(
  "./databaseGuard"
);
assertWritableDatabase(process.env.DATABASE_URL, {
  action: "check Find all matching",
  env: { ...process.env, [OVERRIDE_VAR]: undefined },
});

const db = await import("../server/db");
const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { extractVectorGeometry } = await import(
  "../client/src/lib/vectorGeometry"
);
const { findMatching } = await import("../client/src/lib/findMatching");
const { wordBoxes } = await import("../client/src/lib/textSelection");
const { splitExistingToRemain } = await import("../shared/existingToRemain");

const out = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const SHEET_ID = 234263;
const PDF_FILE = path.join("reader-accuracy", "plans", "Weld 1.pdf");
const PAGE = 5;
/** A match within this of a mark is the same device: a symbol's half-width. */
const SAME_DEVICE_POINTS = 6;

/*
  E-200 holds THREE plans, and the hand count is of one. Read off a render of
  the whole sheet with his marks on it (2026-10-01): every mark is in A.
  Copies found in B and C are reported apart — they are devices he did not
  count, not matches on nothing, and scoring them as "false" would be wrong.
*/
const PLANS: {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}[] = [
  { name: "A Power plan", x0: 150, y0: 820, x1: 1200, y1: 1680 },
  { name: "B Demolition power plan", x0: 1350, y0: 820, x1: 2300, y1: 1680 },
  { name: "C Security raceway plan", x0: 150, y0: 0, x1: 1200, y1: 800 },
];
const planOf = (x: number, y: number) =>
  PLANS.find(p => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1)?.name ??
  "elsewhere";

/** [x0, y0, x1, y1] relative to `at`, page points. */
const TEMPLATES: Record<string, { at: [number, number]; box: number[] }> = {
  "DUPLEX RECEPTACLE": { at: [636.0, 1334.2], box: [-5.5, -5.5, 10, 5.5] },
  // The whole "#": both pairs of lines. A first try boxed only the circle and
  // one pair (-6..6, -6..9), which IS a duplex, and found every duplex.
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

let t0 = performance.now();
const list = await page.getOperatorList();
const tOps = performance.now() - t0;
t0 = performance.now();
const text = await page.getTextContent();
const tText = performance.now() - t0;
t0 = performance.now();
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
const tExtract = performance.now() - t0;
console.log(
  `Weld 1 p${PAGE}: ${geo.segs.length / 4} segments, ${words.length} words, ` +
    `image coverage ${(geo.imageCoverage * 100).toFixed(1)}%. ` +
    `pdf.js ${tOps.toFixed(0)} ms + text ${tText.toFixed(0)} ms, reading ${tExtract.toFixed(0)} ms (once per sheet).`
);

type Row = {
  type: string;
  byHand: number;
  found: number;
  found2: number;
  /** In plan A, on no mark of this type. `other` = on his mark of that type. */
  falseMatches: { x: number; y: number; flags: string; other: string | null }[];
  missed: { x: number; y: number }[];
  needsLook: number;
  maybeExisting: number;
  /** Copies in the plans he did not count, by plan. */
  elsewhere: Map<string, number>;
  /** And where they are, for pictures. */
  elsewhereAt: { x: number; y: number; flags: string }[];
  ms: number;
  note: string;
};
const rows: Row[] = [];
for (const [type, t] of Object.entries(TEMPLATES)) {
  const box = {
    x: t.at[0] + t.box[0],
    y: t.at[1] + t.box[1],
    width: t.box[2] - t.box[0],
    height: t.box[3] - t.box[1],
  };
  const started = performance.now();
  const result = findMatching(geo, words, box);
  const ms = performance.now() - started;
  const mine = marks.filter(m => m.type === type);
  if (result.kind !== "ok") {
    rows.push({
      type,
      byHand: mine.length,
      found: 0,
      found2: 0,
      falseMatches: [],
      missed: mine,
      needsLook: 0,
      maybeExisting: 0,
      elsewhere: new Map(),
      elsewhereAt: [],
      ms,
      note: result.message,
    });
    continue;
  }
  const used = new Set<number>();
  const falseMatches: Row["falseMatches"] = [];
  const elsewhere = new Map<string, number>();
  const elsewhereAt: Row["elsewhereAt"] = [];
  let found = 0;
  let clean = 0;
  const inA = result.matches.filter(m => {
    const plan = planOf(m.x, m.y);
    if (plan === PLANS[0].name) return true;
    elsewhere.set(plan, (elsewhere.get(plan) ?? 0) + 1);
    elsewhereAt.push({
      x: m.x,
      y: m.y,
      flags: [...m.needsLook, ...m.maybeExisting].join("; "),
    });
    return false;
  });
  for (const m of inA) {
    let best = -1;
    let bestD = SAME_DEVICE_POINTS;
    mine.forEach((h, i) => {
      const d = Math.hypot(h.x - m.x, h.y - m.y);
      if (!used.has(i) && d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    const flags = [...m.needsLook, ...m.maybeExisting].join("; ");
    if (best >= 0) {
      used.add(best);
      found += 1;
      if (!flags) clean += 1;
    } else {
      const other = marks.find(
        h =>
          h.type !== type &&
          Math.hypot(h.x - m.x, h.y - m.y) <= SAME_DEVICE_POINTS
      );
      falseMatches.push({ x: m.x, y: m.y, flags, other: other?.type ?? null });
    }
  }
  rows.push({
    type,
    byHand: mine.length,
    found,
    found2: clean,
    falseMatches,
    missed: mine.filter((_, i) => !used.has(i)),
    needsLook: inA.filter(m => m.needsLook.length).length,
    maybeExisting: inA.filter(m => m.maybeExisting.length).length,
    elsewhere,
    elsewhereAt,
    ms,
    note: `symbol: ${result.symbol.segments} segments${result.symbol.words.length ? `, words ${result.symbol.words.join(" ")}` : ""}`,
  });
}

console.log(`\n${PLANS[0].name} — where every one of his marks is:`);
console.log(
  "| Type | By hand | Matches | On his marks | of which unflagged | On his mark of ANOTHER type: flagged / SILENT | On no mark | His marks missed | Needs a look | Maybe existing | ms |"
);
console.log(
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
);
for (const r of rows) {
  const cross = r.falseMatches.filter(f => f.other);
  const silent = cross.filter(f => !f.flags).length;
  console.log(
    `| ${r.type} | ${r.byHand} | ${r.found + r.falseMatches.length} | ${r.found} | ${r.found2} | ` +
      `${cross.length - silent} / ${silent} | ${r.falseMatches.length - cross.length} | ` +
      `${r.missed.length} | ${r.needsLook} | ${r.maybeExisting} | ${r.ms.toFixed(0)} |`
  );
}
console.log("\nIn the plans he did not count (not scored):");
for (const r of rows)
  console.log(
    `  ${r.type}: ` +
      (Array.from(r.elsewhere)
        .map(([plan, n]) => `${n} in ${plan}`)
        .join(", ") || "none")
  );
for (const r of rows) {
  console.log(`\n${r.type} — ${r.note}`);
  for (const f of r.falseMatches)
    console.log(
      `  ${f.other ? `on his ${f.other} mark` : "on no mark"}: ${f.x.toFixed(1)}, ${f.y.toFixed(1)}` +
        (f.flags ? `  [${f.flags}]` : "  [NO FLAG]")
    );
  for (const m of r.missed)
    console.log(`  his mark missed: ${m.x.toFixed(1)}, ${m.y.toFixed(1)}`);
}

// Pictures of every disagreement, for calling by eye.
if (out) {
  mkdirSync(out, { recursive: true });
  const factory = (
    doc as unknown as {
      canvasFactory: {
        create(
          w: number,
          h: number
        ): {
          canvas: { toBuffer(m: string): Buffer };
          context: CanvasRenderingContext2D;
        };
      };
    }
  ).canvasFactory;
  const K = 6;
  const big = page.getViewport({ scale: K });
  const shot = async (name: string, x: number, y: number) => {
    const size = 40 * K;
    const { canvas, context } = factory.create(size, size);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size, size);
    context.translate(-(x * K - size / 2), -(y * K - size / 2));
    await page.render({
      canvasContext: context as never,
      viewport: big,
      canvas: canvas as never,
    }).promise;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.strokeStyle = "#e11d48";
    context.lineWidth = 2;
    context.strokeRect(size / 2 - 6 * K, size / 2 - 6 * K, 12 * K, 12 * K);
    writeFileSync(path.join(out, name), canvas.toBuffer("image/png"));
  };
  for (const r of rows) {
    const slug = r.type.replace(/[^A-Za-z]+/g, "_").slice(0, 14);
    let k = 0;
    for (const f of r.falseMatches)
      await shot(`${slug}-notmarked-${++k}.png`, f.x, f.y);
    k = 0;
    for (const m of r.missed) await shot(`${slug}-missed-${++k}.png`, m.x, m.y);
    k = 0;
    for (const m of r.elsewhereAt)
      await shot(`${slug}-otherplan-${++k}.png`, m.x, m.y);
  }
  console.log(`\nPictures: ${out}`);
}

await doc.destroy();
process.exit(0);
