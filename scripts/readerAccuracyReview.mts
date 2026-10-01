/**
 * Re-score a reader-accuracy run against TODAY's hand count, at no cost, and
 * review every AI find that is not in it.
 *
 * ── Why, 2026-10-01 ──────────────────────────────────────────────────────────
 * An AI find with no hand mark near it is either the AI's mistake or a device
 * the hand count missed, and only the estimator can say which. Until he does,
 * the "extra" column is a guess. This lists each such spot with a picture of
 * it and a link that opens BidRidge on that sheet, zoomed to that spot; he
 * presses "My miss" or "AI wrong", and it is kept in
 * reader-accuracy/answer-key.json.
 *
 * "My miss" is CORRECTED IN THE APP, by placing the mark by hand on the
 * device — the link takes him there. This script never writes a mark: the
 * AI's position is up to ~2 in off (Track A measured it), and an answer key
 * built from AI positions would score the AI against itself. Press "Score
 * again" after placing them and the spot leaves the list as found.
 *
 * The saved readings are re-used, so no AI call is made and nothing is spent.
 * The picked types and data / telecom split: readerAccuracyAnswerKey.ts.
 *
 * ── What it touches ──────────────────────────────────────────────────────────
 * READS the bid's marks and plan files from the LOCAL database and
 * LOCAL_STORAGE_DIR, and a results folder. WRITES only
 * reader-accuracy/answer-key.json (verdicts) and pictures inside the results
 * folder. Local database only, whatever the environment says.
 *
 *   pnpm tsx scripts/readerAccuracyReview.mts --run "reader-accuracy/results/<run>"
 *        [--port 3010] [--app http://localhost:3004] [--no-serve]
 *
 * Open http://127.0.0.1:3010 . Ctrl+C to stop. It is a plain page server,
 * not a dev server: one small node process.
 */
import "dotenv/config";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const { assertWritableDatabase, OVERRIDE_VAR } = await import(
  "./databaseGuard"
);
assertWritableDatabase(process.env.DATABASE_URL, {
  action: "review the reader accuracy test",
  env: { ...process.env, [OVERRIDE_VAR]: undefined },
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const runDir = arg("run");
if (!runDir || !existsSync(path.join(runDir, "results.json"))) {
  console.error(
    'Usage: pnpm tsx scripts/readerAccuracyReview.mts --run "reader-accuracy/results/<run>"\n' +
      "(the folder readerAccuracy.mts printed at the end of its run)"
  );
  process.exit(1);
}
const port = Number(arg("port") ?? 3010);
const appBase = (arg("app") ?? "http://localhost:3004").replace(/\/$/, "");
const serve = !process.argv.includes("--no-serve");

const db = await import("../server/db");
const { getDb } = db;
const { bids } = await import("../drizzle/schema");
const { eq } = await import("drizzle-orm");
const { diskStorageRoot, diskRelativePath } = await import(
  "../server/diskStorage"
);
const { buildReport, formatReport, lineName } = await import(
  "./readerAccuracyReport"
);
const { setVerdict } = await import("./readerAccuracyAnswerKey");
const { readAnswerKeyFile, writeAnswerKeyFile, ANSWER_KEY_PATH } = await import(
  "./readerAccuracyFiles"
);
const { planSpotHash } = await import("../client/src/lib/planSpotLink");
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

type Report = ReturnType<typeof buildReport>;
type Item = Report["items"][number];

/** Same radius the AI run scores with: a third of a paper inch. */
const MATCH_RADIUS_POINTS = 24;
/** Pictures: this many pixels per paper inch, this many inches square. */
const PX_PER_INCH = 100;
const CROP_INCHES = 2;

type Detail = {
  sheet: string;
  sheetKey?: string;
  sheetId?: number;
  pdfId?: number;
  page?: number;
  method: "a" | "b" | "c" | "d";
  positions: string;
  run: number;
  suggestions: {
    label: string | null;
    x: number | null;
    y: number | null;
    unreadable: boolean;
  }[];
};
const results = JSON.parse(
  readFileSync(path.join(runDir, "results.json"), "utf8")
) as { bidId: number; positions: string[]; detail: Detail[] };
const details = results.detail.filter(d => d.sheetId && d.pdfId && d.sheetKey);
if (details.length === 0) {
  console.error(
    "This run was saved before 2026-10-01 and does not say which sheet each " +
      "reading came from, so it cannot be re-scored. Run readerAccuracy.mts again."
  );
  process.exit(1);
}

const handle = await getDb();
if (!handle) {
  console.error("No database connection.");
  process.exit(1);
}
const [bid] = await handle
  .select({ id: bids.id, userId: bids.userId, name: bids.name })
  .from(bids)
  .where(eq(bids.id, results.bidId));
if (!bid) {
  console.error(`Bid ${results.bidId} is not in this database.`);
  process.exit(1);
}
const owner = bid.userId;
const pdfRows = await db.getBidPdfs(bid.id, owner);

// ── Score against the count as it is NOW ───────────────────────────────────
async function score(): Promise<Report> {
  const marksBySheet = new Map<
    number,
    { label: string; x: number; y: number }[]
  >();
  for (const id of new Set(details.map(d => d.sheetId as number))) {
    const rows = await db.getStampsForSheet(id, owner);
    marksBySheet.set(
      id,
      rows.map(m => ({
        label: m.groupLabel ?? "",
        x: Number(m.x),
        y: Number(m.y),
      }))
    );
  }
  const both = new Set(details.map(d => d.positions)).size > 1;
  return buildReport(
    details.map(d => ({
      sheet: d.sheetKey as string,
      sheetLabel: d.sheet,
      pdfId: d.pdfId as number,
      page: d.page as number,
      line: lineName(d.method, d.positions, both),
      run: d.run,
      marks: marksBySheet.get(d.sheetId as number) ?? [],
      suggestions: d.suggestions,
    })),
    readAnswerKeyFile(),
    MATCH_RADIUS_POINTS
  );
}

// ── Pictures of each spot, from the plan file itself ────────────────────────
type Canvas = {
  width: number;
  height: number;
  toBuffer(mime: "image/jpeg", quality: number): Buffer;
};
type Ctx = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(...args: unknown[]): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a: number, b: number): void;
  stroke(): void;
};
type Factory = {
  create(w: number, h: number): { canvas: Canvas; context: Ctx };
};

const pictureDir = path.join(runDir, "review");
mkdirSync(pictureDir, { recursive: true });
const sheetPictures = new Map<string, { canvas: Canvas; factory: Factory }>();

async function sheetPicture(pdfId: number, page: number) {
  const key = `${pdfId}-${page}`;
  const have = sheetPictures.get(key);
  if (have) return have;
  const pdf = pdfRows.find(p => p.id === pdfId);
  const relative = pdf ? diskRelativePath(pdf.storageKey) : null;
  const root = diskStorageRoot();
  if (!pdf || !relative || !root) return null;
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(path.join(root, ...relative.split("/")))),
    verbosity: 0,
  }).promise;
  const factory = (doc as unknown as { canvasFactory: Factory }).canvasFactory;
  const p = await doc.getPage(page);
  const viewport = p.getViewport({ scale: PX_PER_INCH / 72 });
  const { canvas, context } = factory.create(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  );
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({
    canvasContext: context as never,
    viewport,
    canvas: canvas as never,
  }).promise;
  // Only ONE sheet is held at a time: this laptop is short of memory.
  sheetPictures.clear();
  const entry = { canvas, factory };
  sheetPictures.set(key, entry);
  return entry;
}

async function pictureOf(item: Item): Promise<string | null> {
  const name = `${item.pdfId}-${item.page}-${Math.round(item.x)}-${Math.round(item.y)}.jpg`;
  const file = path.join(pictureDir, name);
  if (existsSync(file)) return name;
  const sheet = await sheetPicture(item.pdfId, item.page);
  if (!sheet) return null;
  const s = PX_PER_INCH / 72;
  const size = CROP_INCHES * PX_PER_INCH;
  const { canvas, context } = sheet.factory.create(size, size);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.drawImage(
    sheet.canvas,
    Math.round(item.x * s - size / 2),
    Math.round(item.y * s - size / 2),
    size,
    size,
    0,
    0,
    size,
    size
  );
  // Where the AI put it: a ring the size of the scoring radius.
  context.strokeStyle = "#e11d48";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(size / 2, size / 2, MATCH_RADIUS_POINTS * s, 0, Math.PI * 2);
  context.stroke();
  writeFileSync(file, canvas.toBuffer("image/jpeg", 85));
  return name;
}

// ── The page ────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

async function page(report: Report): Promise<string> {
  const cards: string[] = [];
  for (const item of report.items) {
    const picture = await pictureOf(item);
    const link =
      appBase +
      "/" +
      planSpotHash(bid.id, {
        pdfId: item.pdfId,
        page: item.page,
        x: item.x,
        y: item.y,
      });
    const v = item.verdict?.verdict ?? "";
    cards.push(`
<article class="card ${v}" data-id="${esc(item.id)}">
  ${picture ? `<img src="review/${esc(picture)}" alt="The spot on the sheet">` : `<div class="noimg">no picture</div>`}
  <div class="body">
    <h3>${esc(item.label)}${item.group === "data" ? ' <span class="tag">data</span>' : ""}</h3>
    <p class="where">${esc(item.sheetLabel)}</p>
    <p class="seen">Found by ${item.seenIn.length} reading${item.seenIn.length === 1 ? "" : "s"}: ${esc(item.seenIn.join(", "))}</p>
    <p><a href="${esc(link)}" target="bidridge-app">Open this spot in BidRidge</a></p>
    <div class="buttons">
      <button data-v="my-miss">My miss</button>
      <button data-v="ai-wrong">AI wrong</button>
      <button data-v="" class="quiet">Clear</button>
    </div>
    <p class="state">${
      v === "my-miss"
        ? "Your miss: place the mark on the device in BidRidge, then Score again."
        : v === "ai-wrong"
          ? "AI wrong: nothing there to count."
          : "Not reviewed."
    }</p>
  </div>
</article>`);
  }
  const tables = formatReport(report).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reader accuracy review</title>
<style>
:root{--bg:#f8fafc;--card:#fff;--ink:#0f172a;--mute:#64748b;--line:#e2e8f0;--miss:#f59e0b;--wrong:#e11d48}
@media (prefers-color-scheme: dark){:root{--bg:#0b1220;--card:#111a2e;--ink:#e2e8f0;--mute:#94a3b8;--line:#1f2a44}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;padding:16px}
h1{font-size:20px;margin:0 0 4px} pre{background:var(--card);border:1px solid var(--line);padding:12px;overflow-x:auto;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{display:flex;gap:10px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:8px;padding:10px}
.card.my-miss{border-left-color:var(--miss)} .card.ai-wrong{border-left-color:var(--wrong)}
.card img,.noimg{width:120px;height:120px;flex:none;border-radius:4px;background:#fff;object-fit:contain}
.noimg{display:flex;align-items:center;justify-content:center;color:#64748b}
h3{margin:0;font-size:14px} p{margin:4px 0} .where,.seen,.state{color:var(--mute);font-size:12px}
.tag{font-size:11px;border:1px solid var(--line);border-radius:4px;padding:0 4px;font-weight:400}
button{font:inherit;font-size:12px;padding:3px 8px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer}
.buttons{display:flex;gap:6px;flex-wrap:wrap} .quiet{color:var(--mute)} #again{font-size:14px;padding:6px 12px}
</style></head><body>
<h1>Reader accuracy review — ${esc(bid.name)}</h1>
<p style="color:var(--mute)">Each card is an AI find with no mark of yours within a third of an inch. The ring is where the AI put it.
Your miss? Open the spot, place the mark on the device, then Score again. Verdicts are saved in ${esc(ANSWER_KEY_PATH)}.</p>
<p><button id="again">Score again</button></p>
<pre>${esc(tables)}</pre>
<div class="grid">${cards.join("") || "<p>Nothing to review: every AI find of a picked type is on one of your marks.</p>"}</div>
<script>
document.querySelectorAll(".card button").forEach(b => b.addEventListener("click", async () => {
  const card = b.closest(".card");
  const r = await fetch("/verdict", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: card.dataset.id, verdict: b.dataset.v || null }) });
  if (!r.ok) { card.querySelector(".state").textContent = await r.text(); return; }
  location.reload();
}));
document.getElementById("again").addEventListener("click", async () => {
  await fetch("/rescore", { method: "POST" });
  location.reload();
});
</script></body></html>`;
}

let current = await score();
let html = await page(current);
console.log(
  `Bid ${bid.id} "${bid.name}" — re-scored ${details.length} saved reading(s), no AI calls.`
);
for (const line of formatReport(current)) console.log(line);

if (!serve) process.exit(0);

createServer(async (req, res) => {
  try {
    if (
      req.method === "GET" &&
      (req.url === "/" || req.url === "/index.html")
    ) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    const picture = req.url?.match(/^\/review\/([\w.-]+\.jpg)$/);
    if (req.method === "GET" && picture) {
      const file = path.join(pictureDir, picture[1]);
      if (!existsSync(file)) throw new Error("no such picture");
      res.writeHead(200, { "content-type": "image/jpeg" });
      res.end(readFileSync(file));
      return;
    }
    if (req.method === "POST" && req.url === "/verdict") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { id, verdict } = JSON.parse(body) as {
        id: string;
        verdict: "my-miss" | "ai-wrong" | null;
      };
      const item = current.items.find(i => i.id === id);
      if (!item) {
        res.writeHead(404);
        res.end("That spot is no longer in the list. Press Score again.");
        return;
      }
      writeAnswerKeyFile(
        setVerdict(
          readAnswerKeyFile(),
          { sheet: item.sheet, label: item.label, x: item.x, y: item.y },
          verdict,
          MATCH_RADIUS_POINTS,
          new Date().toISOString()
        )
      );
      current = await score();
      html = await page(current);
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "POST" && req.url === "/rescore") {
      current = await score();
      html = await page(current);
      for (const line of formatReport(current)) console.log(line);
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (error) {
    res.writeHead(500);
    res.end(error instanceof Error ? error.message : String(error));
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`\nReview page: http://127.0.0.1:${port}  (Ctrl+C to stop)`)
);
