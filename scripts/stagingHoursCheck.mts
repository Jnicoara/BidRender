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

/**
 * After opening an editor: wait for its queries (roles, modifiers) to land.
 * A fixed 0.9 s on staging caught the role picker still empty and the
 * preview pricing labor at $0 — a screenshot of loading, not of the screen.
 */
async function settled(page: Page) {
  await page
    .waitForLoadState("networkidle", { timeout: 15000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
}

/**
 * MEASURED, not eyeballed: how many lines each totals label renders on (1 =
 * no wrap — "Direct cost" and "Bid price" wrapped on laptop, 2026-10-07),
 * and the text of the Materials and Labor rows (hours belong on Labor only).
 */
async function labelLines(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, unknown> = {};
    // Only inside the totals card — the sidebar also says "Materials" and
    // "Labor rates", and the first version of this read those.
    const heading = Array.from(
      document.querySelectorAll("div, h2, h3, p")
    ).find(el =>
      /^(bid total|your figures)$/i.test((el.textContent ?? "").trim())
    );
    let card: Element | null | undefined = heading?.parentElement;
    while (card && !/Direct cost/.test(card.textContent ?? ""))
      card = card.parentElement;
    if (!card) return { error: "no totals card found" };
    const labels = ["Materials", "Direct cost", "Bid price", "Total due"];
    for (const el of Array.from(card.querySelectorAll("span"))) {
      const text = (el.textContent ?? "").trim();
      const label = labels.find(l => text === l || text.startsWith(`${l} `));
      if (!label || out[label] !== undefined) continue;
      if (el.children.length > 1) continue;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
      out[label] = Math.round(el.getBoundingClientRect().height / lh);
      if (label === "Materials")
        out.materialsRow = el.parentElement?.textContent?.trim();
    }
    const labor = Array.from(card.querySelectorAll("span")).find(s =>
      (s.textContent ?? "").trim().startsWith("Labor")
    );
    out.laborRow = labor?.parentElement?.textContent?.trim();
    return out;
  });
}

/**
 * The "Most used" row, MEASURED: absent, or present with its chips in order
 * and the height of the first chip (44 px on touch, the tap-target rule).
 */
async function mostUsedRow(page: Page) {
  return page.evaluate(() => {
    const label = Array.from(document.querySelectorAll("div")).find(
      d => (d.textContent ?? "").trim() === "Most used"
    );
    if (!label) return { present: false };
    const chips = Array.from(
      label.parentElement?.querySelectorAll("button") ?? []
    );
    return {
      present: true,
      chips: chips.map(c => (c.textContent ?? "").trim()),
      chipHeight: Math.round(chips[0]?.getBoundingClientRect().height ?? 0),
    };
  });
}

/** Bids the "Most used" phase adds — archived in cleanup with the first. */
const extraBids: number[] = [];

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
    // ONE bid so far: the "Most used" row must not exist at all (< 3 bids).
    console.log(
      `${size.name} most used before 3 bids: ${JSON.stringify(await mostUsedRow(page))}`
    );
    // "Bid price" is always there; "Total due" only once sales tax is set up.
    await page.getByText("Bid price").first().scrollIntoViewIfNeeded();
    await shot("bid-totals");
    console.log(
      `${size.name} bid totals: ${JSON.stringify(await labelLines(page))}`
    );

    await page.getByRole("button", { name: /^Send/ }).click();
    // "quoteapp.panel" is an INTERNAL-tier feature: a fresh account does not
    // have it, so the item is absent and the panel cannot be shot from here.
    const quoteItem = page.getByText("For your quote app");
    if ((await quoteItem.count()) > 0) {
      await quoteItem.click();
      await page.waitForTimeout(1200);
      await shot("quote-panel");
    } else {
      console.log(
        `${size.name}: quote panel not shown (internal-tier feature)`
      );
    }
    await page.keyboard.press("Escape");

    await go(page, "/");
    await page
      .getByText(`Track B check ${stamp}`)
      .first()
      .scrollIntoViewIfNeeded();
    await shot("dashboard");

    await go(page, `/bids/${bid.id}/proposal`);
    await shot("proposal");
    console.log(
      `${size.name} proposal figures: ${JSON.stringify(await labelLines(page))}`
    );

    await go(page, "/library/assemblies");
    await page.getByPlaceholder("Search assemblies…").fill(`${stamp}`);
    await page.waitForTimeout(800);
    await shot("library");
    await page.getByText(NOT_SET, { exact: true }).first().click();
    await settled(page);
    await page.getByLabel("Base labor hours").scrollIntoViewIfNeeded();
    await shot("editor-not-set");

    await go(page, "/library/assemblies");
    await page.getByPlaceholder("Search assemblies…").fill(`${stamp}`);
    await page.waitForTimeout(800);
    await page.getByText(LABOR_ONLY, { exact: true }).first().click();
    await settled(page);
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

  // ── "Most used": two more bids make three, and the row appears ───────────
  const api = await (
    await browser.newContext({ storageState: state })
  ).newPage();
  await api.goto(`${BASE}/`);
  for (const assemblyIds of [[laborOnly.id, unsaid.id], [laborOnly.id]]) {
    const b = await trpc(api, "bids.create", {
      name: `Track B check ${stamp} more`,
    });
    extraBids.push(b.id);
    for (const assemblyId of assemblyIds)
      await trpc(api, "bids.addAssembly", { bidId: b.id, assemblyId });
  }
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
    await go(page, `/bids/${bid.id}`);
    console.log(
      `${size.name} most used after 3 bids: ${JSON.stringify(await mostUsedRow(page))}`
    );
    await page.screenshot({ path: `${OUT}/${size.name}-most-used.png` });
    if (size === laptop) {
      // One click on the top chip adds that assembly as a line.
      const before = (await trpc(api, "bids.get", { id: bid.id }, false)).lines
        .length;
      await page.getByRole("button", { name: LABOR_ONLY }).first().click();
      await page.waitForTimeout(1500);
      const after = (await trpc(api, "bids.get", { id: bid.id }, false)).lines
        .length;
      console.log(`laptop chip click: lines ${before} -> ${after}`);
    }

    // Quick bid ("Count"): the same row, the same rules.
    await go(page, `/bids/${bid.id}/count`);
    console.log(
      `${size.name} quick bid most used: ${JSON.stringify(await mostUsedRow(page))}`
    );
    await page.screenshot({ path: `${OUT}/${size.name}-quick-bid.png` });
    await page.getByLabel("Search assemblies to count").fill("x");
    await page.waitForTimeout(400);
    console.log(
      `${size.name} quick bid while typing: ${JSON.stringify(await mostUsedRow(page))}`
    );
    await page.getByLabel("Search assemblies to count").fill("");
    await page.waitForTimeout(400);
    if (size === laptop) {
      // Quick bid MERGES a repeat into its line, so the quantity rises.
      const qtyOf = async () =>
        (await trpc(api, "bids.get", { id: bid.id }, false)).lines.reduce(
          (s: number, l: { qty: string }) => s + Number(l.qty),
          0
        );
      const before = await qtyOf();
      await page.getByRole("button", { name: LABOR_ONLY }).first().click();
      await page.waitForTimeout(1500);
      console.log(
        `laptop quick bid chip click: total qty ${before} -> ${await qtyOf()}`
      );
    }
    await ctx.close();
  }
} finally {
  // Clean up through the app, in the throwaway account only.
  const ctx = await browser.newContext({ storageState: state });
  const page = await ctx.newPage();
  await trpc(page, "bids.archive", { id: bid.id });
  for (const id of extraBids) await trpc(page, "bids.archive", { id });
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
