/**
 * How well does Find all matching do on a SCANNED sheet with a hand count?
 *
 * Runs the SAME code the plans screen runs on a scan (@/lib/vectorGeometry
 * for the scan's resolution, @/lib/textSelection for its OCR text layer,
 * @/lib/scanMatching's `findOnScan` with opencv.js) in node, on the
 * reader-accuracy answer-key bid, and compares what it finds with the
 * owner's own marks on Old Blueridge E1.01 (page 3) and E1.02 (page 4).
 *
 * For each counted shape one box is drawn round ONE of his marks — the
 * first of that shape — at the size a person would drag round one symbol
 * (the sizes measured in references/scanned-plans-plan.md § 2), and every
 * find is compared with ALL his marks of that shape. Then, per page, one box
 * is put on a copy on the DEMOLITION plan, to check that every find there is
 * labelled "not counted" and nothing from the new plan comes back.
 *
 * Reads only. Local database only. No AI unless --ai.
 *
 *   pnpm tsx scripts/scanMatchingCheck.mts            # ~2 min, prints the scores
 *   ... --scores      every find's score, his marks apart from the rest
 *   ... --profile     every opencv call over 0.5 s, and every render
 *   ... --ai          the AI button's request on every 2x4 and receptacle
 *                     find, scored (about 2 cents; the ANTHROPIC_API_KEY
 *                     line alone is borrowed from .env.production.local)
 *   ... --dump=<dir>  with --ai: write each crop and the raw replies there
 *
 * Measured 2026-10-01 (references/scanned-plans-plan.md § 9): 85 of 86 of
 * his marks found; 8 and 37 demolition-plan finds all labelled. If what this
 * prints does not match, stop and find out why before going on — either this
 * line is stale or the matcher changed, and those want opposite responses.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const { assertWritableDatabase, OVERRIDE_VAR } = await import(
  "./databaseGuard"
);
assertWritableDatabase(process.env.DATABASE_URL, {
  action: "check Find all matching on scans",
  env: { ...process.env, [OVERRIDE_VAR]: undefined },
});

const db = await import("../server/db");
const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { extractVectorGeometry } = await import(
  "../client/src/lib/vectorGeometry"
);
const { isScan } = await import("../client/src/lib/findMatching");
const { wordBoxes } = await import("../client/src/lib/textSelection");
const { findOnScan, scanQuality } = await import(
  "../client/src/lib/scanMatching"
);
type OpenCv = import("../client/src/lib/scanMatching").OpenCv;

const PDF_FILE = path.join(
  "reader-accuracy",
  "plans",
  "Old Blueridge school.pdf"
);
/** A find within this of a mark is that device (points). */
const SAME_DEVICE_POINTS = 12;

/** Shapes as he counted them, and the box a person drags round one. */
const PAGES: {
  page: number;
  sheetId: number;
  shapes: {
    name: string;
    labels: string[];
    box: [number, number];
    /** The mark boxed: the one the 2026-10-01 measurement picked. */
    pick: [number, number];
  }[];
  demolitionProbe: {
    name: string;
    at: [number, number];
    box: [number, number];
  };
}[] = [
  {
    page: 3,
    sheetId: 234273,
    shapes: [
      {
        name: "2x4 rectangle",
        labels: ["LIGHTING FIXTURE, LINEAR TYPE", "EXIT LIGHT FIXTURE"],
        box: [42, 22],
        pick: [1280.2, 432.6],
      },
      {
        name: "2x2 square",
        labels: ["LINEAR FIXTURE - CEILING MOUNTED"],
        box: [22, 22],
        pick: [1351.6, 117.9],
      },
      {
        name: "circle",
        labels: ["LIGHTING FIXTURE, WALL-MOUNTED POINT TYPE"],
        box: [20, 20],
        pick: [1334.5, 153.2],
      },
      {
        name: "switch",
        labels: ["SWITCH, SINGLE POLE"],
        box: [14, 22],
        pick: [1374.7, 109.7],
      },
    ],
    demolitionProbe: { name: "switch", at: [1752.2, 1240.8], box: [14, 22] },
  },
  {
    page: 4,
    sheetId: 234274,
    shapes: [
      {
        name: "receptacle",
        labels: ["DUPLEX RECEPTACLE OUTLET - WALL MOUNTED", "GFCI receptacle"],
        box: [20, 20],
        pick: [969.5, 265.5],
      },
      {
        name: "timer switch",
        labels: ["SWITCH WITH TIMER"],
        box: [16, 22],
        pick: [1353.0, 449.0],
      },
    ],
    demolitionProbe: { name: "receptacle", at: [1141, 1298.4], box: [20, 20] },
  },
];

const require = createRequire(import.meta.url);
let cvLoaded: OpenCv | null = null;
async function loadCv(): Promise<OpenCv> {
  if (cvLoaded) return cvLoaded;
  const t0 = performance.now();
  let cv = require("@techstark/opencv-js");
  if (cv instanceof Promise) cv = await cv;
  else if (!cv.Mat)
    await new Promise<void>(r => (cv.onRuntimeInitialized = () => r()));
  console.log(
    `  (opencv.js loaded in ${Math.round(performance.now() - t0)} ms)`
  );
  // A thenable: returned from this async function as it is, the await never
  // ends. The worker's loader does the same (pdfRenderer.worker.ts).
  delete cv.then;
  if (process.argv.includes("--profile")) {
    // Every opencv call over half a second, named.
    const timed: Record<string, unknown> = Object.create(cv);
    for (const name of Object.keys(cv))
      if (typeof cv[name] === "function" && /^[a-z]/.test(name)) {
        const f = cv[name];
        timed[name] = (...args: unknown[]) => {
          const t = performance.now();
          const r = f.apply(cv, args);
          const ms = performance.now() - t;
          if (ms > 500) console.log(`      cv.${name} ${Math.round(ms)} ms`);
          return r;
        };
      }
    cv = timed;
  }
  cvLoaded = cv as OpenCv;
  return cvLoaded;
}

const user = await db.getUserByEmail("reader-test@local.test");
if (!user) throw new Error("No reader-test account in this database.");

const doc = await getDocument({
  data: new Uint8Array(readFileSync(PDF_FILE)),
  verbosity: 0,
}).promise;
const factory = (
  doc as unknown as {
    canvasFactory: {
      create(
        w: number,
        h: number
      ): {
        canvas: unknown;
        context: {
          fillStyle: string;
          fillRect(x: number, y: number, w: number, h: number): void;
          getImageData(
            x: number,
            y: number,
            w: number,
            h: number
          ): { data: Uint8ClampedArray };
        };
      };
    };
  }
).canvasFactory;

// ── --ai: the AI button, measured ─────────────────────────────────────────
let aiSpent = 0;
const aiTally = { right: 0, wrong: 0, none: 0 };
async function askAi(
  page: Awaited<ReturnType<typeof doc.getPage>>,
  shapeName: string,
  box: { x: number; y: number; width: number; height: number },
  pickedLabel: string,
  matches: import("../client/src/lib/findMatching").Match[],
  marks: { label: string; x: number; y: number }[],
  pageNumber: number
) {
  if (!process.env.ANTHROPIC_API_KEY)
    for (const raw of readFileSync(".env.production.local", "utf8").split(
      /\r?\n/
    )) {
      // That one variable and nothing else: the file also names the LIVE
      // database (CLAUDE.md, "A script that writes REFUSES …").
      const eq = raw.indexOf("=");
      if (eq > 0 && raw.slice(0, eq).trim() === "ANTHROPIC_API_KEY")
        process.env.ANTHROPIC_API_KEY = raw
          .slice(eq + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
    }
  const { invokeLLM } = await import("../server/llm");
  const { scanFindsRequest, parseScanFinds, TIE_BREAK_MODEL } = await import(
    "../server/tieBreak"
  );
  const { costMicros } = await import("../shared/aiPricing");
  const scale = 2.5; // as the screen sends (TakeoffPage askAboutScanFinds)
  const crop = async (x: number, y: number, hw: number, hh: number) => {
    const half = Math.max(26, 1.6 * Math.max(hw, hh));
    const size = Math.ceil(2 * half * scale);
    const vp = page.getViewport({
      scale,
      offsetX: -(x - half) * scale,
      offsetY: -(y - half) * scale,
    });
    const { canvas, context } = factory.create(size, size);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size, size);
    await page.render({ canvasContext: context, viewport: vp, canvas } as never)
      .promise;
    const ctx = context as unknown as {
      strokeStyle: string;
      lineWidth: number;
      strokeRect(x: number, y: number, w: number, h: number): void;
    };
    ctx.strokeStyle = "#e11d48";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      (half - hw - 2) * scale,
      (half - hh - 2) * scale,
      (2 * hw + 4) * scale,
      (2 * hh + 4) * scale
    );
    return (canvas as { toDataURL(type: string, q: number): string }).toDataURL(
      "image/jpeg",
      0.85
    );
  };
  const picked = await crop(
    box.x + box.width / 2,
    box.y + box.height / 2,
    box.width / 2,
    box.height / 2
  );
  const want = (m: (typeof matches)[number]) => {
    const his = marks.find(
      k => Math.hypot(k.x - m.x, k.y - m.y) <= SAME_DEVICE_POINTS
    );
    if (!his) return pageNumber === 4 ? "existing" : "notThis";
    // Duplex and GFCI are drawn and labelled alike on E1.02: either answer.
    if (pageNumber === 4) return "same";
    return his.label === pickedLabel ? "same" : "otherLabel";
  };
  const got: string[] = [];
  for (let i = 0; i < matches.length; i += 12) {
    const batch = matches.slice(i, i + 12);
    const crops = await Promise.all(
      batch.map(async (m, k) => ({
        id: k + 1,
        picture: await crop(m.x, m.y, m.halfWidth, m.halfHeight),
      }))
    );
    const res = await invokeLLM({
      feature: "plan-read",
      user: user!,
      ...scanFindsRequest({ model: TIE_BREAK_MODEL, picked, crops }),
    });
    aiSpent +=
      costMicros(TIE_BREAK_MODEL, {
        inputTokens: Number(res.usage?.prompt_tokens ?? 0),
        outputTokens: Number(res.usage?.completion_tokens ?? 0),
      }) / 1e6;
    const answers = parseScanFinds(res, crops);
    const dump = process.argv.find(a => a.startsWith("--dump="))?.slice(7);
    if (dump) {
      const save = (name: string, url: string) =>
        writeFileSync(
          path.join(dump, name),
          Buffer.from(url.split(",")[1], "base64")
        );
      save(`${shapeName}-picked.jpg`, picked);
      crops.forEach(c =>
        save(
          `${shapeName}-${i + c.id}-${want(batch[c.id - 1])}-${answers.get(c.id) ?? "none"}.jpg`,
          c.picture
        )
      );
      console.log(
        "      reply:",
        JSON.stringify(String(res.choices?.[0]?.message?.content ?? "")).slice(
          0,
          300
        )
      );
    }
    batch.forEach((m, k) => {
      const a = answers.get(k + 1) ?? null;
      const w = want(m);
      if (a === null) aiTally.none++;
      else if (a === w) aiTally.right++;
      else aiTally.wrong++;
      got.push(`${w}->${a ?? "none"}`);
    });
  }
  const counts = got.reduce<Record<string, number>>(
    (o, g) => ((o[g] = (o[g] ?? 0) + 1), o),
    {}
  );
  console.log(
    `      AI on ${matches.length} ${shapeName} finds (picked "${pickedLabel}"): ${JSON.stringify(counts)}; spent so far $${aiSpent.toFixed(4)}`
  );
}

let total = { marks: 0, found: 0, falseInPlan: 0 };
for (const spec of PAGES) {
  const page = await doc.getPage(spec.page);
  const viewport = page.getViewport({ scale: 1 });
  const [list, text] = await Promise.all([
    page.getOperatorList(),
    page.getTextContent(),
  ]);
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
  console.log(
    `\nPage ${spec.page}: scan ${isScan(geo)}, ${geo.imagePixelsPerPoint.toFixed(2)} px/pt (${Math.round(geo.imagePixelsPerPoint * 72)} dpi), ${words.length} words`
  );

  const renderMs: number[] = [];
  const render = async (
    rect: { x: number; y: number; width: number; height: number },
    scale: number
  ) => {
    const t0 = performance.now();
    if (process.argv.includes("--profile"))
      console.log(`      rendering ${JSON.stringify(rect)} at ${scale}`);
    const vp = page.getViewport({
      scale,
      offsetX: -rect.x * scale,
      offsetY: -rect.y * scale,
    });
    const width = Math.ceil(rect.width * scale);
    const height = Math.ceil(rect.height * scale);
    const { canvas, context } = factory.create(width, height);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    await page.render({ canvasContext: context, viewport: vp, canvas } as never)
      .promise;
    const d = context.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    for (let k = 0; k < gray.length; k++)
      gray[k] =
        (d[4 * k] * 0.299 + d[4 * k + 1] * 0.587 + d[4 * k + 2] * 0.114) | 0;
    renderMs.push(Math.round(performance.now() - t0));
    if (process.argv.includes("--profile"))
      console.log(
        `      render ${rect.x.toFixed(0)},${rect.y.toFixed(0)} ${rect.width.toFixed(0)}x${rect.height.toFixed(0)} at ${scale.toFixed(2)}: ${width}x${height}, ${renderMs.at(-1)} ms`
      );
    return { gray, width, height, x0: rect.x, y0: rect.y, scale };
  };

  // Marks the owner has struck in reader-accuracy/answer-key.json (since
  // 2026-10-05: the C fixture on E1.01 is not one of the 7 OS sensors) are
  // left out, as the accuracy report leaves them out.
  const struck = (() => {
    try {
      const key = JSON.parse(
        readFileSync(path.join("reader-accuracy", "answer-key.json"), "utf8")
      );
      return (key.sheets?.[`Old Blueridge school.pdf p${spec.page}`]
        ?.dropMarks ?? []) as { label: string; x: number; y: number }[];
    } catch {
      return [];
    }
  })();
  const marks = (await db.getStampsForSheet(spec.sheetId, user.id))
    .map(m => ({
      label: m.groupLabel ?? "",
      x: Number(m.x),
      y: Number(m.y),
    }))
    .filter(
      m =>
        !struck.some(
          d => d.label === m.label && Math.hypot(d.x - m.x, d.y - m.y) <= 2
        )
    );

  const run = async (box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    renderMs.length = 0;
    const t0 = performance.now();
    const r = await findOnScan({
      box,
      pixelsPerPoint: geo.imagePixelsPerPoint,
      words,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      render,
      loadCv,
    });
    return { r, ms: Math.round(performance.now() - t0), render: [...renderMs] };
  };

  let regionsShown = false;
  for (const shape of spec.shapes) {
    const own = marks.filter(m => shape.labels.includes(m.label));
    const picked = [...own].sort(
      (a, b) =>
        Math.hypot(a.x - shape.pick[0], a.y - shape.pick[1]) -
        Math.hypot(b.x - shape.pick[0], b.y - shape.pick[1])
    )[0];
    const box = {
      x: picked.x - shape.box[0] / 2,
      y: picked.y - shape.box[1] / 2,
      width: shape.box[0],
      height: shape.box[1],
    };
    const { r, ms, render: rms } = await run(box);
    if (r.kind !== "ok") {
      console.log(`  ${shape.name}: ${r.kind} — ${r.message}`);
      continue;
    }
    if (!regionsShown) {
      regionsShown = true;
      for (const g of r.regions)
        console.log(
          `  plan "${g.title}"${g.demolition ? " [DEMOLITION]" : ""}: x ${g.x0.toFixed(0)}–${g.x1.toFixed(0)}, y ${g.y0.toFixed(0)}–${g.y1.toFixed(0)}`
        );
    }
    const used = new Set<number>();
    let onOther = 0;
    let flaggedHis = 0;
    let flaggedOther = 0;
    const hisScores: string[] = [];
    const otherScores: string[] = [];
    const offMark: typeof r.matches = [];
    for (const f of r.matches) {
      const near = marks
        .map((m, i) => ({ m, i, d: Math.hypot(m.x - f.x, m.y - f.y) }))
        .filter(c => c.d <= SAME_DEVICE_POINTS && !used.has(c.i))
        .sort((a, b) => a.d - b.d);
      const mine = near.find(c => shape.labels.includes(c.m.label));
      (mine ? hisScores : otherScores).push(
        f.coverage.toFixed(2) +
          (f.needsLook.some(r => /bigger/.test(r)) ? "j" : "")
      );
      if (mine) {
        used.add(mine.i);
        if (f.needsLook.length) flaggedHis++;
      } else if (near.length) {
        onOther++;
        if (f.needsLook.length) flaggedOther++;
      } else offMark.push(f);
    }
    const found = own.filter((_, k) => used.has(marks.indexOf(own[k]))).length;
    for (const m of own)
      if (!used.has(marks.indexOf(m)))
        console.log(`      missed his: (${m.x.toFixed(1)}, ${m.y.toFixed(1)})`);
    const flagged = r.matches.filter(f => f.needsLook.length).length;
    total.marks += own.length;
    total.found += found;
    total.falseInPlan += offMark.length;
    const scores = r.matches.map(f => f.coverage).sort((a, b) => a - b);
    console.log(
      `  ${shape.name} (${own.length} marks; symbol ${r.pixels} scan px): plan "${r.plan?.title ?? "whole sheet"}", ` +
        `${r.matches.length} finds — ${found}/${own.length} of his, ${onOther} on another type's mark (${flaggedOther} flagged; ${flaggedHis} of his flagged), ` +
        `${offMark.length} on no mark, ${flagged} flagged; scores ${scores[0]?.toFixed(2)}–${scores.at(-1)?.toFixed(2)}; ` +
        `skew ${r.skew.toFixed(2)}°; ${ms} ms (renders ${rms.join(" + ")} ms)`
    );
    if (process.argv.includes("--scores"))
      console.log(`      his: ${hisScores.sort().join(" ")}
      other/none: ${otherScores.sort().join(" ")}`);
    for (const f of offMark)
      console.log(
        `      on no mark: (${f.x.toFixed(1)}, ${f.y.toFixed(1)}) score ${f.coverage.toFixed(2)} ${f.needsLook.join("; ")}`
      );

    // ── --ai: the AI button's request on every find, scored against his
    // marks. What each should come back as: his mark of the PICKED one's
    // label "same"; his mark of a look-alike's label (A2 beside a picked
    // A2EM) "otherLabel"; a find on no mark of his "existing" on E1.02,
    // where those are the E receptacles (scanned-plans-plan.md § 2).
    if (
      process.argv.includes("--ai") &&
      (shape.name === "2x4 rectangle" || shape.name === "receptacle") &&
      (!process.argv.includes("--only-receptacle") ||
        shape.name === "receptacle")
    )
      await askAi(
        page,
        shape.name,
        box,
        picked.label,
        r.matches,
        marks,
        spec.page
      );
  }

  // ── The demolition plan: box a copy there; every find must say so, and
  // nothing from the new plan above may come back. The copy is one the
  // whole-sheet search of 2026-10-01 found there (scanned-plans-plan.md § 2).
  const probe = spec.demolitionProbe;
  const r = await run({
    x: probe.at[0] - probe.box[0] / 2,
    y: probe.at[1] - probe.box[1] / 2,
    width: probe.box[0],
    height: probe.box[1],
  });
  if (r.r.kind !== "ok") {
    console.log(`  demolition check: ${r.r.kind} — ${r.r.message}`);
    continue;
  }
  const ms = r.r.matches;
  const labelled = ms.filter(m => m.onDemolitionPlan).length;
  const onHisMarks = ms.filter(m =>
    marks.some(k => Math.hypot(k.x - m.x, k.y - m.y) <= SAME_DEVICE_POINTS)
  ).length;
  console.log(
    `  demolition check (${probe.name} boxed at ${probe.at.join(", ")}): plan "${r.r.plan?.title}", ` +
      `${ms.length} finds, ${labelled} labelled "demolition — not counted", ${onHisMarks} on his new-plan marks; ${r.ms} ms`
  );
}

// ── Too poor to match: the measured sizes, through the same check ──
console.log(
  "\nToo-poor check on the switch box (14 x 22 pt) at other scan resolutions:"
);
for (const dpi of [50, 72, 100, 150, 300]) {
  const q = scanQuality({ x: 0, y: 0, width: 14, height: 22 }, dpi / 72);
  console.log(
    `  ${dpi} dpi: ${q.kind} (${q.pixels} px)${q.kind === "tooPoor" ? " — " + q.message : ""}`
  );
}
console.log(
  `\nTotal: ${total.found} of ${total.marks} hand marks found; ${total.falseInPlan} finds on no mark inside the searched plan.`
);
await doc.destroy();
process.exit(0);
