/**
 * On-screen check ON STAGING of the starters added 2026-10-07: the twelve
 * top-30 gap starters, the wafers at 2", 4", 6", 8" and the can lights at 4"
 * and 6" (new construction and remodel), at laptop and tablet sizes.
 *
 *   OUT_DIR=<dir> npx tsx scripts/stagingStartersCheck.mts
 *
 * - The DATA, through the API the screens read: every new starter present
 *   with its tag and hours not set; no 3" or 5" wafer starter.
 * - The Assemblies screen: search "wafer", "recessed can", "service" — the
 *   rows on screen, their tags, a screenshot each.
 * - A bid's assembly picker: search "wafer" and "recessed can" — what it
 *   offers, a screenshot each.
 *
 * Leaves one throwaway example.com account (the app cannot delete one) and
 * one archived bid. Never writes to the database directly. The gate password
 * comes from the main checkout's .env.staging.local and is never printed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Page } from "playwright-core";
import { SIZES, launchChrome } from "./deviceAudit.mts";

const BASE = "https://staging.bidridge.com";
const OUT = process.env.OUT_DIR ?? ".";
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
const email = `track-b-starters-${stamp}@example.com`;
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

/** What should be on staging after this change, and how it is tagged. */
const EXPECTED: Array<[string, string]> = [
  ['Wafer LED downlight, 2" (canless)', "both"],
  ['Wafer LED downlight, 4" (canless)', "both"],
  ['Wafer LED downlight, 6" (canless)', "both"],
  ['Wafer LED downlight, 8" (canless)', "both"],
  ['Recessed can new construction, 4"', "both"],
  ['Recessed can retrofit, 4"', "both"],
  ['Recessed can new construction, 6"', "both"],
  ['Recessed can retrofit, 6"', "both"],
  ["Emergency battery pack added to a troffer", "commercial"],
  ["Panelboard replacement, 3-phase, existing feeders", "commercial"],
  ["Site / parking lot pole light", "commercial"],
  ["Emergency light, remote head", "commercial"],
  ["120V feed for door hardware / access control", "commercial"],
  ["Single-pole switch, old work", "residential"],
  ["Service upgrade 200A, underground", "residential"],
  ["Service 320A / 400A residential (two 200A panels)", "residential"],
  ["Generator inlet and interlock, 50A", "residential"],
  ["Detached garage / shop feeder and panel", "residential"],
  ["Kitchen countertop 20A circuit", "residential"],
  ["Bathroom 20A circuit", "residential"],
];
const NOT_WANTED = [
  'Wafer LED downlight, 3" (canless)',
  'Wafer LED downlight, 5" (canless)',
  'Wafer LED downlight, 7" (canless)',
];

const browser = await launchChrome();
const setupCtx = await browser.newContext({ serviceWorkers: "block" });
const setup = await setupCtx.newPage();
const gate = await setup.request.post(`${BASE}/staging-gate`, {
  form: { password: gatePassword },
  maxRedirects: 0,
});
if (gate.status() >= 400)
  throw new Error(`staging gate refused (${gate.status()})`);
if (process.env.CREDS_FILE)
  writeFileSync(process.env.CREDS_FILE, JSON.stringify({ email, password }));
await trpc(setup, "auth.signup", {
  email,
  password,
  name: "Track B starters check (throwaway)",
});
const onboarding = await trpc(setup, "onboarding.state", undefined, false);
if (onboarding.isFirstRun) await trpc(setup, "onboarding.completeFirstRun");

// ── The data ─────────────────────────────────────────────────────────────────
const library = (await trpc(setup, "assemblies.list", undefined, false)) as {
  name: string;
  projectType: string | null;
  baseLaborHours: string | number | null;
}[];
const byName = new Map(library.map(a => [a.name, a]));
const report: string[] = [`library: ${library.length} assemblies`];
let bad = 0;
for (const [name, type] of EXPECTED) {
  const a = byName.get(name);
  const ok = a && a.projectType === type && a.baseLaborHours === null;
  if (!ok) bad += 1;
  report.push(
    `${ok ? "OK " : "BAD"} ${name} — ${a ? `${a.projectType}, hours ${a.baseLaborHours ?? "not set"}` : "MISSING"}`
  );
}
for (const name of NOT_WANTED) {
  if (byName.has(name)) bad += 1;
  report.push(`${byName.has(name) ? "BAD present" : "OK  absent"}: ${name}`);
}
report.push(bad === 0 ? "DATA: all as expected" : `DATA: ${bad} wrong`);
console.log(report.join("\n"));

const bid = await trpc(setup, "bids.create", {
  name: `Starters check ${stamp}`,
});
const storage = await setupCtx.storageState();
await setupCtx.close();

/** The names of the assembly rows visible on screen right now. */
const visibleNames = (page: Page, candidates: string[]) =>
  page.evaluate(names => {
    const out: string[] = [];
    for (const n of names) {
      const el = Array.from(
        document.querySelectorAll("span, button, div, li")
      ).find(
        e => e.children.length === 0 && (e.textContent ?? "").trim() === n
      );
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const tag = el.parentElement?.textContent?.replace(n, "").trim() ?? "";
        out.push(tag ? `${n} [${tag.slice(0, 40)}]` : n);
      }
    }
    return out;
  }, candidates);

const allNames = [...EXPECTED.map(e => e[0]), ...NOT_WANTED];
for (const size of [
  SIZES.find(s => s.name === "laptop")!,
  SIZES.find(s => s.name === "tablet-landscape")!,
]) {
  const ctx = await browser.newContext({
    storageState: storage,
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr,
    hasTouch: size.touch,
    isMobile: size.mobile,
    serviceWorkers: "block",
  });
  const page = await ctx.newPage();
  console.log(`\n== ${size.name} ${size.width}x${size.height}`);

  // The Assemblies screen.
  await page.goto(`${BASE}/#/assemblies`, { waitUntil: "domcontentloaded" });
  await page
    .waitForLoadState("networkidle", { timeout: 20000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
  const search = page.getByPlaceholder("Search assemblies…").first();
  for (const q of ["wafer", "recessed can", "service", "circuit"]) {
    await search.fill(q);
    await page.waitForTimeout(1200);
    console.log(
      `assemblies "${q}": ${JSON.stringify(await visibleNames(page, allNames))}`
    );
    await page.screenshot({
      path: `${OUT}/${size.name}-assemblies-${q.replace(/ /g, "-")}.png`,
    });
  }

  // The bid's assembly picker.
  await page.goto(`${BASE}/#/bids/${bid.id}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .waitForLoadState("networkidle", { timeout: 20000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
  const picker = page.getByPlaceholder(/Search the assembly library/).first();
  for (const q of ["wafer", "recessed can"]) {
    await picker.fill(q);
    await page.waitForTimeout(1200);
    console.log(
      `bid picker "${q}": ${JSON.stringify(await visibleNames(page, allNames))}`
    );
    await page.screenshot({
      path: `${OUT}/${size.name}-picker-${q.replace(/ /g, "-")}.png`,
    });
  }
  await ctx.close();
}

// ── Clean up ─────────────────────────────────────────────────────────────────
const cleanCtx = await browser.newContext({ storageState: storage });
const clean = await cleanCtx.newPage();
await trpc(clean, "bids.archive", { id: bid.id });
console.log("\ncleanup: bid archived");
await browser.close();
