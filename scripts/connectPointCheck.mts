/**
 * Step 0 of references/connect-point-plan.md § 7: on a real vector sheet, how
 * far do wall devices stand off the wall, and does "the nearest long straight
 * segment" find the wall?
 *
 * Runs the SAME code the plans screen runs (shared/connectPoint.ts on
 * @/lib/vectorGeometry) against the owner's hand count of Weld 1 E-200 — the
 * answer key `scripts/findMatchingCheck.mts` uses. For every mark of a wall
 * family it prints the stand-off found (page points and feet at the sheet's
 * scale), and with --out writes a picture of each: the mark (blue), the foot
 * the run would end on (red) and the line found (red), to be called by eye.
 *
 * Reads only. Local database only.
 *
 *   DATABASE_URL=…/bidrender_local_c pnpm tsx scripts/connectPointCheck.mts [--out <folder>]
 *
 * ── Measured 2026-10-01 (Track B), Weld 1 p5 (E-200), 1/8" = 1'-0" ─────────
 * See references/connect-point-plan.md § 7, "Step 0 — measured".
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const { assertWritableDatabase, OVERRIDE_VAR } = await import(
  "./databaseGuard"
);
assertWritableDatabase(process.env.DATABASE_URL, {
  action: "check connect points",
  env: { ...process.env, [OVERRIDE_VAR]: undefined },
});

const db = await import("../server/db");
const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { extractVectorGeometry } = await import(
  "../client/src/lib/vectorGeometry"
);
const { familyFromName } = await import("../shared/deviceFamily");
const { FAMILY_MOUNTING, findWallFoot, WALL_REACH_POINTS } = await import(
  "../shared/connectPoint"
);
const { splitExistingToRemain } = await import("../shared/existingToRemain");

const out = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const SHEET_ID = 234263;
const PAGE = 5;
// reader-accuracy/ is git-ignored, so a worktree may not have it: --pdf.
const PDF_FILE = (() => {
  const i = process.argv.indexOf("--pdf");
  return i >= 0
    ? process.argv[i + 1]
    : path.join("reader-accuracy", "plans", "Weld 1.pdf");
})();
if (!existsSync(PDF_FILE))
  throw new Error(`${PDF_FILE} not found — pass --pdf <Weld 1.pdf>.`);
/** 1/8" = 1'-0": 72 page points per paper inch, 96 real inches per paper inch. */
const FEET_PER_POINT = 96 / 72 / 12;

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
const geo = extractVectorGeometry(
  list.fnArray,
  list.argsArray,
  OPS as unknown as Record<string, number>,
  viewport.transform,
  viewport.width,
  viewport.height
);

type Row = {
  type: string;
  x: number;
  y: number;
  found: ReturnType<typeof findWallFoot>;
  /** The nearest long segment with no reach limit — what a bigger reach finds. */
  far: ReturnType<typeof findWallFoot>;
};
const rows: Row[] = [];
const families = new Map<string, number>();
for (const m of marks) {
  const family = familyFromName(m.type) ?? "other";
  families.set(
    `${m.type} → ${family}`,
    (families.get(`${m.type} → ${family}`) ?? 0) + 1
  );
  if (FAMILY_MOUNTING[family] !== "wall") continue;
  rows.push({
    ...m,
    found: findWallFoot(geo, m),
    far: findWallFoot(geo, m, 60),
  });
}

console.log(
  `Weld 1 p${PAGE}: ${geo.segs.length / 4} segments, ${marks.length} hand marks.`
);
for (const [k, n] of families) console.log(`  ${n} × ${k}`);
console.log(
  `\nWall-family marks: ${rows.length}, reach ${WALL_REACH_POINTS} pt`
);
const byType = new Map<string, Row[]>();
for (const r of rows) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
for (const [type, rs] of byType) {
  const hit = rs.filter(r => r.found);
  const d = hit.map(r => r.found!.distance).sort((a, b) => a - b);
  const med = d.length ? d[Math.floor(d.length / 2)] : NaN;
  console.log(
    `  ${type}: ${hit.length}/${rs.length} found a wall; stand-off median ${med.toFixed(1)} pt ` +
      `(${(med * FEET_PER_POINT).toFixed(2)} ft), range ${d[0]?.toFixed(1)}–${d[d.length - 1]?.toFixed(1)} pt`
  );
  for (const r of rs.filter(r => !r.found))
    console.log(
      `    none in reach at ${r.x.toFixed(1)}, ${r.y.toFixed(1)}; nearest long line ${r.far ? r.far.distance.toFixed(1) + " pt" : "none within 60"}`
    );
}

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
  let k = 0;
  for (const r of rows) {
    const size = 50 * K;
    const { canvas, context } = factory.create(size, size);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size, size);
    const ox = r.x * K - size / 2;
    const oy = r.y * K - size / 2;
    context.translate(-ox, -oy);
    await page.render({
      canvasContext: context as never,
      viewport: big,
      canvas: canvas as never,
    }).promise;
    context.setTransform(1, 0, 0, 1, 0, 0);
    const dot = (x: number, y: number, c: string) => {
      context.fillStyle = c;
      context.beginPath();
      context.arc(x * K - ox, y * K - oy, 5, 0, Math.PI * 2);
      context.fill();
    };
    dot(r.x, r.y, "#2563eb");
    let tag = "NONE";
    if (r.found) {
      const s = r.found.segment * 4;
      context.strokeStyle = "rgba(225,29,72,0.45)";
      context.lineWidth = 6;
      context.beginPath();
      context.moveTo(geo.segs[s] * K - ox, geo.segs[s + 1] * K - oy);
      context.lineTo(geo.segs[s + 2] * K - ox, geo.segs[s + 3] * K - oy);
      context.stroke();
      dot(r.found.point.x, r.found.point.y, "#e11d48");
      tag = `L${geo.lightness[r.found.segment]}-${r.found.distance.toFixed(1)}`;
    }
    const slug = r.type.replace(/[^A-Za-z]+/g, "_").slice(0, 10);
    writeFileSync(
      path.join(out, `${slug}-${String(++k).padStart(2, "0")}-${tag}.png`),
      canvas.toBuffer("image/png")
    );
  }
  console.log(`\n${k} pictures in ${out}`);
}
process.exit(0);
