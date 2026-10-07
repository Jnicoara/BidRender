/**
 * Time a REAL plan upload on staging (R2), phase by phase, and record what the
 * screen says during each phase.
 *
 *   PDF=<path> OUT_DIR=<dir> npx tsx scripts/stagingUploadTiming.mts
 *
 * Why staging: the 2026-09-29 measurement (track-b-plans-screen-edits-plan.md,
 * "Part 4 § 2 — MEASURED") was localhost disk storage, which says nothing
 * about the network — and the network is where the wait is. `pnpm dev:r2`
 * would write into the LIVE plans bucket; staging has its own
 * (`bidrender-plans-staging`, references/deploying.md).
 *
 * What it does, and what it leaves:
 * - Passes the staging gate (password from the main checkout's
 *   .env.staging.local, never printed) and signs up a THROWAWAY example.com
 *   account. The account stays (the app cannot delete one).
 * - Makes one bid, opens its Plans screen at laptop size, and picks the file.
 * - Logs: the app's own `[upload]` console lines (client/src/lib/uploadTiming.ts),
 *   every distinct thing the upload row / loading panel / sheet list SAYS with
 *   the time it first appeared, the request timings for ticket, PUT, attach,
 *   and the bytes the viewer pulled back down before sheet 1 was drawn.
 * - Screenshots each new on-screen state.
 * - Then REMOVES the plan set (deletes the object from the staging bucket) and
 *   archives the bid. Never writes to the database directly.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import type { Page } from "playwright-core";
import { SIZES, launchChrome } from "./deviceAudit.mts";

const BASE = "https://staging.bidridge.com";
const OUT = process.env.OUT_DIR ?? ".";
const PDF = process.env.PDF;
if (!PDF) throw new Error("Set PDF=<path to the plan set>");
const bytes = statSync(PDF).size;

const gatePassword = (
  readFileSync("C:/dev/BidPhase/.env.staging.local", "utf8")
    .split(/\r?\n/)
    .find(l => l.startsWith("STAGING_PASSWORD="))
    ?.slice("STAGING_PASSWORD=".length) ?? ""
)
  .replace(/^["']|["']$/g, "")
  .trim();
if (!gatePassword) throw new Error("No STAGING_PASSWORD in .env.staging.local");

const stamp = Date.now();
const email = `track-b-upload-${stamp}@example.com`;
const password = `Tb!${stamp}x${Math.random().toString(36).slice(2, 12)}`;

async function trpc(page: Page, proc: string, input?: unknown, mutate = true) {
  const res = mutate
    ? await page.request.post(`${BASE}/api/trpc/${proc}?batch=1`, {
        data: { 0: { json: input ?? null } },
      })
    : await page.request.get(
        `${BASE}/api/trpc/${proc}?batch=1&input=${encodeURIComponent(
          JSON.stringify({ 0: { json: input ?? null } })
        )}`
      );
  const body = await res.json();
  if (body[0]?.error)
    throw new Error(
      `${proc}: ${JSON.stringify(body[0].error.json?.message ?? body[0].error)}`
    );
  return body[0].result.data.json;
}

// SIZE=tablet-portrait (any name in deviceAudit's SIZES) for a touch tablet;
// laptop 1366x768 otherwise.
const size = SIZES.find(s => s.name === process.env.SIZE);
const browser = await launchChrome();
const ctx = await browser.newContext({
  viewport: size
    ? { width: size.width, height: size.height }
    : { width: 1366, height: 768 },
  deviceScaleFactor: size?.dpr ?? 1,
  hasTouch: size?.touch ?? false,
  isMobile: size?.mobile ?? false,
  serviceWorkers: "block",
});
const page = await ctx.newPage();
const gate = await page.request.post(`${BASE}/staging-gate`, {
  form: { password: gatePassword },
  maxRedirects: 0,
});
if (gate.status() >= 400)
  throw new Error(`staging gate refused (${gate.status()})`);
if (process.env.CREDS_FILE)
  writeFileSync(process.env.CREDS_FILE, JSON.stringify({ email, password }));
await trpc(page, "auth.signup", {
  email,
  password,
  name: "Track B upload timing (throwaway)",
});
const onboarding = await trpc(page, "onboarding.state", undefined, false);
if (onboarding.isFirstRun) await trpc(page, "onboarding.completeFirstRun");
const bid = await trpc(page, "bids.create", {
  name: `Upload timing ${stamp}`,
});

// ── Instruments ───────────────────────────────────────────────────────────────
let t0 = 0;
const since = () => ((performance.now() - t0) / 1000).toFixed(2);
const log: string[] = [];
const note = (line: string) => {
  const l = `t+${since()} s  ${line}`;
  log.push(l);
  console.log(l);
};

page.on("console", m => {
  const text = m.text();
  if (text.startsWith("[upload]") || /whole|range/i.test(text))
    note(`console: ${text}`);
});

// Requests: what each phase cost on the wire. The signed PUT url is a bearer
// credential (CLAUDE.md), so only its host and method are logged.
let downBytes = 0;
let countingDown = false;
page.on("requestfinished", async req => {
  const url = new URL(req.url());
  const timing = req.timing();
  const took =
    timing.responseEnd > 0 ? Math.round(timing.responseEnd) : undefined;
  if (
    url.pathname.startsWith("/api/trpc/") &&
    /bidPdfs|upload/i.test(url.pathname)
  )
    note(
      `request ${req.method()} ${url.pathname.split("?")[0]} ${took ?? "?"} ms`
    );
  else if (req.method() === "PUT")
    note(`request PUT ${url.host} ${took ?? "?"} ms`);
  else if (
    countingDown &&
    req.method() === "GET" &&
    /r2|manus-storage/.test(url.href)
  ) {
    const size = (await req.sizes().catch(() => null))?.responseBodySize ?? 0;
    const range = (await req.allHeaders())["range"];
    const status = (await req.response())?.status();
    downBytes += size;
    downRequests += 1;
    if (!range) wholeFetches += 1;
    if (downRequests <= 6 || !range)
      note(
        `down GET ${url.host.split(".")[0]} ${status} range=${range ?? "NONE"} ${(size / 1e6).toFixed(2)} MB ${took ?? "?"} ms`
      );
  }
});
let downRequests = 0;
let wholeFetches = 0;
page.on("console", m => {
  if (m.type() === "warning" || m.type() === "error")
    note(`console ${m.type()}: ${m.text().slice(0, 200)}`);
});

/** Everything the upload row, loading panel and sheet list say right now. */
async function sayings() {
  return page.evaluate(() => {
    const out: string[] = [];
    const bar = document.querySelector(
      '[role="progressbar"][aria-label^="Uploading"]'
    );
    const row = bar?.parentElement;
    if (row) {
      const line = (
        row.querySelector("span.font-mono") ?? row
      ).textContent?.trim();
      if (line)
        out.push(
          `upload row: ${line.replace(/\d+(\.\d+)? ?(MB|KB|GB)\/s.*$/, "").replace(/\d+%.*$/, "N%…")}`
        );
    }
    for (const el of Array.from(
      document.querySelectorAll("[role=status], p, span, div")
    )) {
      const t = (el.textContent ?? "").trim();
      if (el.children.length > 2) continue;
      if (
        /^(Opening plan set…|Drawing sheet \d+…|Reading sheet numbers…|Finishing…)/.test(
          t
        )
      )
        out.push(`screen: ${t.replace(/\d+ of \d+/, "N of M")}`);
    }
    return Array.from(new Set(out));
  });
}

// ── The upload ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/#/bids/${bid.id}/plans`, {
  waitUntil: "domcontentloaded",
});
await page
  .waitForLoadState("networkidle", { timeout: 20000 })
  .catch(() => undefined);
await page.waitForTimeout(1500);

const input = page.locator('input[type="file"][accept*="pdf"]').first();
note(`picking ${PDF.split(/[\\/]/).pop()} (${(bytes / 1e6).toFixed(1)} MB)`);
t0 = performance.now();
countingDown = false;
await input.setInputFiles(PDF);

const seen = new Set<string>();
let shot = 0;
let drawn = false;
const deadline = Date.now() + 15 * 60 * 1000;
while (Date.now() < deadline) {
  for (const s of await sayings()) {
    if (seen.has(s)) continue;
    seen.add(s);
    note(s);
    if (/upload row: Finishing/.test(s)) countingDown = true;
    await page.screenshot({ path: `${OUT}/upload-${++shot}.png` });
  }
  if (log.some(l => /sheet \d+ drawn/.test(l))) {
    if (!drawn) {
      drawn = true;
      note(
        `pulled back down before sheet 1 was drawn: ${(downBytes / 1e6).toFixed(1)} MB in ${downRequests} request(s), ${wholeFetches} without a Range header`
      );
      await page.screenshot({ path: `${OUT}/upload-drawn.png` });
    }
    // Keep watching briefly for the sheet-number read to finish.
    if (
      !Array.from(seen).some(s => /Reading sheet numbers/.test(s)) ||
      (await sayings()).every(s => !/Reading sheet numbers/.test(s))
    ) {
      // Ten seconds more, still counting: the whole-file stream this measured
      // on 2026-10-07 arrived up to a second AFTER sheet 1 on one run.
      const before = { bytes: downBytes, whole: wholeFetches };
      await page.waitForTimeout(10000);
      note(
        `in the 10 s after sheet 1: ${((downBytes - before.bytes) / 1e6).toFixed(1)} MB more, ${wholeFetches - before.whole} without a Range header`
      );
      break;
    }
  }
  await page.waitForTimeout(150);
}
writeFileSync(`${OUT}/upload-timing.log`, log.join("\n") + "\n");

// ── Clean up: the object out of the staging bucket, the bid archived ─────────
const pdfs = await trpc(page, "bidPdfs.list", { bidId: bid.id }, false).catch(
  () => []
);
for (const p of pdfs as { id: number }[])
  await trpc(page, "bidPdfs.remove", { id: p.id });
await trpc(page, "bids.archive", { id: bid.id });
console.log(
  `cleanup: removed ${(pdfs as unknown[]).length} plan set(s), bid archived`
);
await browser.close();
