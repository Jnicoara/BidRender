/**
 * Does a white box flash when a plan opens? Measured frame by frame ON
 * STAGING, at laptop and tablet (1180x820, touch) sizes.
 *
 *   PDF=<path> OUT_DIR=<dir> npx tsx scripts/stagingOpenFlash.mts
 *
 * The owner saw it on 2026-10-07: "a white rectangle in the TOP-LEFT corner
 * first, then it expands to the full-screen PDF". A screenshot every few
 * hundred ms cannot see a one-frame fault, so a sampler injected before the
 * app loads records, on EVERY animation frame, what the plan pane shows:
 * - whether the loading panel ("Opening plan set…" / "Drawing sheet N…") is up;
 * - every visible canvas in the pane, its on-screen box and its pixel size.
 * A frame is a FLASH when a sheet canvas is visible and its box does not
 * match where the sheet ends up once it has settled (the fitted box). Only
 * changes are logged, with the time since navigation.
 *
 * Covers: opening the Plans screen on a bid that already has a plan (the
 * owner's case), changing sheet, and zooming in.
 *
 * Leaves: one throwaway example.com account (the app cannot delete one). The
 * plan set is removed from the staging bucket and the bid archived. Never
 * writes to the database directly. The gate password comes from the main
 * checkout's .env.staging.local and is never printed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Browser, Page } from "playwright-core";
import { SIZES, launchChrome } from "./deviceAudit.mts";

/*
  Staging unless BASE says otherwise — `BASE=http://127.0.0.1:<port>` runs
  the same walk against a local dev server, which has no gate (2026-10-08).
*/
const STAGING = "https://staging.bidridge.com";
const BASE = process.env.BASE ?? STAGING;
const behindGate = BASE === STAGING;
const OUT = process.env.OUT_DIR ?? ".";
/*
  How long the renewed plan list is held back. The renewal has to land AFTER
  sheet 1 is drawn or there is nothing stale to show: 5 s on staging; a local
  dev server draws slower, so a local run wants about 12 s (2026-10-08 — at 5 s
  locally the walk printed "No flash" with the fix taken OUT).
*/
const RENEW_HOLD_MS = Number(process.env.RENEW_HOLD_MS ?? 5000);
const PDF = process.env.PDF;
if (!PDF) throw new Error("Set PDF=<path to a plan set>");

const gatePassword = behindGate
  ? (
      readFileSync("C:/dev/BidPhase/.env.staging.local", "utf8")
        .split(/\r?\n/)
        .find(l => l.startsWith("STAGING_PASSWORD="))
        ?.slice("STAGING_PASSWORD=".length) ?? ""
    )
      .replace(/^["']|["']$/g, "")
      .trim()
  : "";
if (behindGate && !gatePassword)
  throw new Error("No STAGING_PASSWORD in .env.staging.local");

const stamp = Date.now();
const email = `track-b-flash-${stamp}@example.com`;
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

/**
 * Runs in the page before the app: one record per CHANGE, every frame.
 *
 * Plain source TEXT, not a function: tsx compiles functions with a `__name`
 * helper that does not exist inside the page, and the first version of this
 * script died there silently and recorded nothing.
 */
const SAMPLER = `
(() => {
  window.__flash = [];
  window.__mark = "";
  let last = "";
  const t0 = performance.now();
  const round = Math.round;
  const tick = () => {
    const pane = document.querySelector("[data-plan-viewport]");
    let state = "no pane";
    if (pane) {
      const p = pane.getBoundingClientRect();
      const m = /Opening plan set|Drawing sheet [0-9]+…/.exec(pane.textContent || "");
      const canvases = Array.from(pane.querySelectorAll("canvas"))
        .filter(c => {
          const s = getComputedStyle(c);
          const r = c.getBoundingClientRect();
          return s.visibility === "visible" && s.display !== "none" &&
            Number(s.opacity) > 0 && r.width > 0 && r.height > 0;
        })
        .map(c => {
          const r = c.getBoundingClientRect();
          return round(r.left - p.left) + "," + round(r.top - p.top) + " " +
            round(r.width) + "x" + round(r.height) +
            " [" + c.width + "x" + c.height + "]";
        });
      state = window.__mark + " | panel=" + (m ? m[0] : "-") +
        " | canvases=" + (canvases.join(" ; ") || "-");
    }
    // Anywhere on the page: a visible WHITE box bigger than a button. The
    // box the owner saw may not be a canvas, or not inside the plan pane.
    const whites = [];
    for (const el of document.body.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      if (s.backgroundColor !== "rgb(255, 255, 255)") continue;
      if (s.visibility !== "visible" || s.display === "none" || Number(s.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
      whites.push(el.tagName.toLowerCase() + "@" + round(r.left) + "," + round(r.top) + " " + round(r.width) + "x" + round(r.height));
    }
    state += " | white=" + (whites.join(" ; ") || "-");
    if (state !== last) {
      window.__flash.push({ t: round(performance.now() - t0), state });
      last = state;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
`;

const browser: Browser = await launchChrome();

// ── One account, one bid, one plan set, uploaded through the screen ──────────
const setupCtx = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  serviceWorkers: "block",
});
const setup = await setupCtx.newPage();
if (behindGate) {
  const gate = await setup.request.post(`${BASE}/staging-gate`, {
    form: { password: gatePassword },
    maxRedirects: 0,
  });
  if (gate.status() >= 400)
    throw new Error(`staging gate refused (${gate.status()})`);
}
if (process.env.CREDS_FILE)
  writeFileSync(process.env.CREDS_FILE, JSON.stringify({ email, password }));
await trpc(setup, "auth.signup", {
  email,
  password,
  name: "Track B flash check (throwaway)",
});
const onboarding = await trpc(setup, "onboarding.state", undefined, false);
if (onboarding.isFirstRun) await trpc(setup, "onboarding.completeFirstRun");
const bid = await trpc(setup, "bids.create", { name: `Flash check ${stamp}` });
await setup.goto(`${BASE}/#/bids/${bid.id}/plans`, {
  waitUntil: "domcontentloaded",
});
await setup.waitForTimeout(3000);
await setup
  .locator('input[type="file"][accept*="pdf"]')
  .first()
  .setInputFiles(PDF);
const uploaded = Date.now();
while (Date.now() - uploaded < 10 * 60 * 1000) {
  const list = await trpc(setup, "bidPdfs.list", { bidId: bid.id }, false);
  if (list.length > 0 && (list[0].pageCount ?? 0) > 0) break;
  await setup.waitForTimeout(1000);
}
await setup.waitForTimeout(3000);
const storage = await setupCtx.storageState();
await setupCtx.close();
console.log("uploaded; plan set attached");

// ── Open it fresh at each size, sampling every frame ─────────────────────────
const report: string[] = [];
const sizes = [
  SIZES.find(s => s.name === "laptop")!,
  SIZES.find(s => s.name === "tablet-landscape")!,
];
for (const size of sizes) {
  const ctx = await browser.newContext({
    storageState: storage,
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr,
    hasTouch: size.touch,
    isMobile: size.mobile,
    serviceWorkers: "block",
  });
  await ctx.addInitScript({ content: SAMPLER });
  const page = await ctx.newPage();
  const mark = (m: string) =>
    page.evaluate(
      v => ((window as unknown as { __mark: string }).__mark = v),
      m
    );

  /** Sheet on screen: the pane exists, no loading panel, a canvas visible. */
  const sheetShown = () =>
    page.waitForFunction(
      `(() => {
        const pane = document.querySelector("[data-plan-viewport]");
        if (!pane) return false;
        if (/Opening plan set|Drawing sheet [0-9]+…/.test(pane.textContent || "")) return false;
        return Array.from(pane.querySelectorAll("canvas")).some(c =>
          getComputedStyle(c).visibility === "visible" && c.getBoundingClientRect().width > 0);
      })()`,
      undefined,
      { timeout: 120000 }
    );

  /*
    What was actually PAINTED, not what layout says: Chrome's screencast
    hands over each composited frame. The sampler reads boxes, and a fault in
    painting (a big canvas uploaded in pieces, say) has a correct box. Frames
    are saved with their time, for looking at around the moment the sheet
    first appears.
  */
  const cdp = await ctx.newCDPSession(page);
  let frameNo = 0;
  let castLabel = "";
  cdp.on("Page.screencastFrame", async f => {
    frameNo += 1;
    writeFileSync(
      `${OUT}/${size.name}-${castLabel}-${String(frameNo).padStart(4, "0")}-${Math.round(f.metadata.timestamp! * 1000) % 100000}.jpg`,
      Buffer.from(f.data, "base64")
    );
    await cdp
      .send("Page.screencastFrameAck", { sessionId: f.sessionId })
      .catch(() => undefined);
  });
  const cast = async (label: string) => {
    castLabel = label;
    frameNo = 0;
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 60,
      everyNthFrame: 1,
    });
  };
  const uncast = () => cdp.send("Page.stopScreencast");

  // A: the address typed or bookmarked — a full page load onto Plans.
  await cast("address");
  await page.goto(`${BASE}/#/bids/${bid.id}/plans`, {
    waitUntil: "domcontentloaded",
  });
  await mark("open by address");
  await sheetShown();
  await page.waitForTimeout(1500);
  await uncast();
  await page.screenshot({ path: `${OUT}/${size.name}-opened.png` });

  // B: the way a person gets there — the bid screen, then into Plans, inside
  // the running app (no reload).
  await mark("bid screen");
  await page.evaluate(id => (location.hash = `#/bids/${id}`), bid.id);
  await page.waitForTimeout(3000);
  await mark("open from bid");
  await cast("frombid");
  await page.evaluate(id => (location.hash = `#/bids/${id}/plans`), bid.id);
  await sheetShown();
  await page.waitForTimeout(1500);
  await uncast();
  await page.screenshot({ path: `${OUT}/${size.name}-from-bid.png` });

  // Zoom well in with the toolbar "+" — far enough for the sharp patch.
  await mark("zoom in");
  await cast("zoom");
  const plus = page.getByRole("button", { name: /zoom in/i }).first();
  for (let i = 0; i < 5; i++) {
    await plus.click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(3000);
  await uncast();
  await page.screenshot({ path: `${OUT}/${size.name}-zoomed.png` });

  // Next sheet while zoomed in, with the toolbar's ">" beside the sheet name.
  await mark("next sheet (zoomed)");
  await cast("nextsheet");
  await page.getByRole("button", { name: "Next sheet" }).first().click();
  await page.waitForTimeout(5000);
  await uncast();
  await page.screenshot({ path: `${OUT}/${size.name}-next-sheet.png` });

  const read = async (label: string) => {
    const samples = await page.evaluate(
      () =>
        (window as unknown as { __flash: { t: number; state: string }[] })
          .__flash
    );
    report.push(`== ${size.name} ${size.width}x${size.height} — ${label}`);
    for (const s of samples)
      report.push(`${String(s.t).padStart(6)} ms  ${s.state}`);
  };
  await read("open, zoom, next sheet");

  // Reload: the screen restores the sheet, zoom and position it was left at
  // (4361397) — the owner's "when a plan opens", on a plan already worked in.
  await cast("reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  await mark("reload (restored view)");
  await sheetShown();
  await page.waitForTimeout(2500);
  await uncast();
  await page.screenshot({ path: `${OUT}/${size.name}-reloaded.png` });
  await read("reload");

  /*
    The link changes under an open plan. It does in life — a signed plan
    link is renewed when it expires, and a re-mint across a time window
    returns a new string — and the viewer reloads the document whenever
    `doc.url` changes. Simulated without touching storage: the plan list's
    answer gets a harmless `#renewed-N` on the link (a fragment is never
    sent, so the same bytes come back), then the list is refetched the way
    a returning tab refetches it.
  */
  /*
    The trigger: leave Plans for the bid screen and come back. The cached
    list opens the plan at once on the OLD link, and the refetch that runs
    on return answers — held 5 s here, a slow connection — with the renewed
    one after sheet 1 is already drawn.
  */
  let renewal = 0;
  await page.route(/\/api\/trpc\/[^?]*bidPdfs\.list/, async route => {
    const res = await route.fetch();
    renewal += 1;
    const body = (await res.text()).replace(
      /("url":"[^"#]+)"/g,
      `$1#renewed-${renewal}"`
    );
    await new Promise(r => setTimeout(r, RENEW_HOLD_MS));
    await route.fulfill({ response: res, body });
  });
  await page.evaluate(id => (location.hash = `#/bids/${id}`), bid.id);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    (window as unknown as { __flash: unknown[] }).__flash = [];
  });
  await mark("link renewed");
  await cast("renewed");
  await page.evaluate(id => (location.hash = `#/bids/${id}/plans`), bid.id);
  await page.waitForTimeout(RENEW_HOLD_MS + 7000);
  await uncast();
  await page.screenshot({ path: `${OUT}/${size.name}-renewed.png` });
  await read(`link renewed (${renewal} list answer(s) changed)`);
  await ctx.close();
}
/*
  The verdict. A FLASH is a frame with no loading panel and a visible canvas
  that holds no raster: [300x150] is the browser's default size for a canvas
  nothing has drawn into, painted white by its `bg-white`. Found 2026-10-07 on
  the "link renewed" step at both sizes; todo.md has the fix, which waits for
  Track C (TakeoffPage.tsx).
*/
const flashes = report.filter(
  l => /panel=- \| canvases=[^|]*\[300x150\]/.test(l) || /^==/.test(l)
);
const found = flashes.some(l => !/^==/.test(l));
report.push(
  found
    ? `\nFLASH: a blank canvas was shown —\n${flashes.join("\n")}`
    : "\nNo flash: no frame showed a canvas without a raster."
);
writeFileSync(`${OUT}/open-flash.log`, report.join("\n") + "\n");
console.log(report.join("\n"));

// ── Clean up ─────────────────────────────────────────────────────────────────
const cleanCtx = await browser.newContext({ storageState: storage });
const clean = await cleanCtx.newPage();
const pdfs = await trpc(clean, "bidPdfs.list", { bidId: bid.id }, false);
for (const p of pdfs as { id: number }[])
  await trpc(clean, "bidPdfs.remove", { id: p.id });
await trpc(clean, "bids.archive", { id: bid.id });
console.log(`cleanup: removed ${pdfs.length} plan set(s), bid archived`);
await browser.close();
