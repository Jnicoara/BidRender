/**
 * On-screen check ON STAGING of "hours not set" and "Labor only", at laptop
 * and tablet size (todo.md, "ON-SCREEN CHECK of every hours not set screen").
 *
 *   OUT_DIR=<dir> npx tsx scripts/stagingHoursCheck.mts
 *
 * What it does, and what it leaves:
 * - Reads STAGING_PASSWORD from the main checkout's .env.staging.local and
 *   never prints it. Passes the staging gate the way the smoke test does.
 * - Signs up a THROWAWAY staging account (an example.com address — reserved,
 *   can never receive mail; signup sends none anyway). The account stays on
 *   staging; the app has no way to delete one.
 * - Makes, in that account only: a priced test material and role, three
 *   assemblies (hours not set / labor only / labor with no material, not
 *   said) and a throwaway bid with one line of each.
 * - Screenshots: bid lines and totals, dashboard card, quote-app panel,
 *   proposal, assembly editor (the not-set one, a new one, the ticked one),
 *   the library list, and the labor-sheet import preview.
 * - Then ARCHIVES the bid (the app's delete: purged after 30 days) and
 *   deletes the assemblies, material and role for good.
 * Never touches another account, never writes to the database directly.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "playwright-core";
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
const email = `track-b-check-${stamp}@example.com`;
const password = `Tb!${stamp}x${Math.random().toString(36).slice(2, 12)}`;
const NOT_SET = `Hours not set check ${stamp}`;
const LABOR_ONLY = `Labor only check ${stamp}`;
const UNSAID = `No material, not said ${stamp}`;

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

async function context(browser: Browser, size: (typeof SIZES)[number]) {
  return browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr,
    hasTouch: size.touch,
    isMobile: size.mobile,
    serviceWorkers: "block",
  });
}

async function go(page: Page, hash: string) {
  await page.goto("about:blank");
  await page.goto(`${BASE}/#${hash}`, { waitUntil: "domcontentloaded" });
  await page
    .waitForLoadState("networkidle", { timeout: 20000 })
    .catch(() => undefined);
  await page.waitForTimeout(900);
}

const browser = await launchChrome();
const laptop = {
  name: "laptop",
  width: 1366,
  height: 768,
  dpr: 1,
  touch: false,
  mobile: false,
};
const tablet = SIZES.find(s => s.name === "tablet-portrait")!;

// ── Account and data, once ──────────────────────────────────────────────────
const first = await context(browser, laptop);
const setup = await first.newPage();
const gate = await setup.request.post(`${BASE}/staging-gate`, {
  form: { password: gatePassword },
  maxRedirects: 0,
});
if (gate.status() >= 400)
  throw new Error(`staging gate refused (${gate.status()})`);
// The throwaway login, kept OUTSIDE the repo so a run that fails half-way
// can still be signed back into and cleaned up. Never printed.
if (process.env.CREDS_FILE)
  writeFileSync(process.env.CREDS_FILE, JSON.stringify({ email, password }));
await trpc(setup, "auth.signup", {
  email,
  password,
  name: "Track B check (throwaway)",
});
const onboarding = await trpc(setup, "onboarding.state", undefined, false);
if (onboarding.isFirstRun) await trpc(setup, "onboarding.completeFirstRun");

const role = await trpc(setup, "laborRates.create", {
  name: `Check role ${stamp}`,
  rateType: "hourly",
  hourlyCost: 80,
});
const part = await trpc(setup, "materials.create", {
  name: `Check part ${stamp}`,
  unitOfSale: "each",
  costPerUnit: 10,
});
const partId = part.id ?? part.material?.id;
const notSet = await trpc(setup, "assemblies.create", {
  name: NOT_SET,
  category: "Devices",
  baseLaborHours: null,
  laborRateId: role.id,
  materials: [{ materialId: partId, qty: 1 }],
});
const laborOnly = await trpc(setup, "assemblies.create", {
  name: LABOR_ONLY,
  category: "Devices",
  baseLaborHours: 1.5,
  laborRateId: role.id,
  laborOnly: true,
});
const unsaid = await trpc(setup, "assemblies.create", {
  name: UNSAID,
  category: "Devices",
  baseLaborHours: 1,
  laborRateId: role.id,
});
const bid = await trpc(setup, "bids.create", {
  name: `Track B check ${stamp}`,
});
for (const a of [notSet, laborOnly, unsaid])
  await trpc(setup, "bids.addAssembly", { bidId: bid.id, assemblyId: a.id });
const state = await first.storageState();
await first.close();
console.log(JSON.stringify({ account: email, bidId: bid.id }));

try {
  for (const size of [laptop, tablet]) {
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.dpr,
      hasTouch: size.touch,
      isMobile: size.mobile,
      serviceWorkers: "block",
      storageState: state,
    });
    const page = await ctx.newPage();
    const shot = (name: string) =>
      page.screenshot({ path: `${OUT}/${size.name}-${name}.png` });

    await go(page, `/bids/${bid.id}`);
    await shot("bid");
    // "Bid price" is always there; "Total due" only once sales tax is set up.
    await page.getByText("Bid price").first().scrollIntoViewIfNeeded();
    await shot("bid-totals");

    await page.getByRole("button", { name: /^Send/ }).click();
    await page.getByText("For your quote app").click();
    await page.waitForTimeout(1200);
    await shot("quote-panel");
    await page.keyboard.press("Escape");

    await go(page, "/");
    await page
      .getByText(`Track B check ${stamp}`)
      .first()
      .scrollIntoViewIfNeeded();
    await shot("dashboard");

    await go(page, `/bids/${bid.id}/proposal`);
    await shot("proposal");

    await go(page, "/library/assemblies");
    await page.getByPlaceholder("Search assemblies…").fill(`${stamp}`);
    await page.waitForTimeout(800);
    await shot("library");
    await page.getByText(NOT_SET, { exact: true }).first().click();
    await page.waitForTimeout(900);
    await page.getByLabel("Base labor hours").scrollIntoViewIfNeeded();
    await shot("editor-not-set");

    await go(page, "/library/assemblies");
    await page.getByPlaceholder("Search assemblies…").fill(`${stamp}`);
    await page.waitForTimeout(800);
    await page.getByText(LABOR_ONLY, { exact: true }).first().click();
    await page.waitForTimeout(900);
    await page
      .getByText("Labor only", { exact: true })
      .first()
      .scrollIntoViewIfNeeded();
    await shot("editor-labor-only");

    await go(page, "/library/assemblies");
    await page
      .getByRole("button", { name: /New assembly/ })
      .first()
      .click();
    await page.waitForTimeout(800);
    await page.getByLabel("Base labor hours").scrollIntoViewIfNeeded();
    await shot("editor-new");

    await go(page, "/library/materials?view=pricing");
    await page.getByText("Import labor sheet").first().click();
    await page.waitForTimeout(600);
    await page
      .locator("textarea")
      .first()
      .fill(`Assembly ID\tAssembly\tMY HOURS\n${notSet.id}\t${NOT_SET}\t0.5`);
    await page.getByRole("button", { name: "Preview" }).click();
    await page.waitForTimeout(1500);
    await shot("import-preview");
    await ctx.close();
  }
} finally {
  // Clean up through the app, in the throwaway account only.
  const ctx = await browser.newContext({ storageState: state });
  const page = await ctx.newPage();
  await trpc(page, "bids.archive", { id: bid.id });
  for (const a of [notSet, laborOnly, unsaid]) {
    await trpc(page, "assemblies.archive", { id: a.id }).catch(() => undefined);
    await trpc(page, "assemblies.deleteForever", { id: a.id }).catch(e =>
      console.log(`assembly ${a.id} not deleted: ${e.message}`)
    );
  }
  await trpc(page, "materials.archive", { id: partId }).catch(() => undefined);
  await trpc(page, "materials.deleteForever", { id: partId }).catch(e =>
    console.log(`material not deleted: ${e.message}`)
  );
  await trpc(page, "laborRates.remove", { id: role.id }).catch(e =>
    console.log(`role not removed: ${e.message}`)
  );
  const left = await trpc(page, "bids.archived", undefined, false);
  console.log(
    `cleanup: bid archived=${left.some((b: { id: number }) => b.id === bid.id)}`
  );
  await ctx.close();
  await browser.close();
}
