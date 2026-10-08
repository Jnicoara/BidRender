/**
 * On-screen check ON STAGING of the never-stuck fixes, gaps 1–7
 * (references/never-stuck-plan.md), at laptop and tablet (1180x820, touch).
 *
 *   OUT_DIR=<dir> npx tsx scripts/stagingNeverStuckCheck.mts
 *
 * Each step clicks (or taps) the warning itself and MEASURES what happened:
 * which field has focus, which text became visible. A screenshot each.
 *
 *  1. Materials: "Needs price" → the price box has focus, the reason shows.
 *  2. Labor rates: "Needs rate" / "Example rate" → the rate box has focus.
 *  3. Bid: "Not priced" / "+ … not priced" → the explanation pops up on a tap.
 *  4. Settings → Heights: rename the account's own height type.
 *  6. A kit with a not-set starter: its name and an hours box in the panel.
 *  7. Analytics: the "not priced" note names the bid; clicking opens it.
 *  (5, the accounting export's customer picker, is behind a feature this
 *   throwaway account does not have — said, not faked.)
 *
 * Leaves one throwaway example.com account (the app cannot delete one), an
 * archived bid and a kit, a forked assembly or two. Never writes to the
 * database directly. The gate password is read from the main checkout's
 * .env.staging.local and never printed.
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
const email = `track-b-stuck-${stamp}@example.com`;
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
  name: "Track B never-stuck check (throwaway)",
});
const onboarding = await trpc(setup, "onboarding.state", undefined, false);
if (onboarding.isFirstRun) await trpc(setup, "onboarding.completeFirstRun");

// A bid with a starter whose hours are not set, so it carries a warning.
const library = (await trpc(
  setup,
  "assemblies.list",
  { status: "active" },
  false
)) as { id: number; name: string; baseLaborHours: unknown }[];
const notSet = library.filter(a => a.baseLaborHours === null).slice(0, 2);
const bid = await trpc(setup, "bids.create", { name: `Never stuck ${stamp}` });
for (const a of notSet)
  await trpc(setup, "bids.addAssembly", { bidId: bid.id, assemblyId: a.id });
// A kit of the same two, for gap 6.
const kit = await trpc(setup, "kits.create", {
  name: `Never stuck kit ${stamp}`,
  items: notSet.map(a => ({ assemblyId: a.id, qty: 1 })),
});
// The account's own height type, for gap 4.
const ownType = `My odd height ${stamp % 1000}`;
await trpc(setup, "takeoffHeights.addType", { label: ownType, inches: 30 });
const storage = await setupCtx.storageState();
await setupCtx.close();

const go = async (page: Page, hash: string) => {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: "domcontentloaded" });
  await page
    .waitForLoadState("networkidle", { timeout: 20000 })
    .catch(() => undefined);
  await page.waitForTimeout(1200);
};
/** The focused element's accessible label, or its tag. */
const focused = (page: Page) =>
  page.evaluate(
    () =>
      document.activeElement?.getAttribute("aria-label") ??
      document.activeElement?.tagName ??
      "none"
  );
const visibleText = (page: Page, text: string) =>
  page
    .getByText(text, { exact: false })
    .first()
    .isVisible()
    .catch(() => false);

const lines: string[] = [];
const say = (s: string) => {
  lines.push(s);
  console.log(s);
};

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
  const press = (loc: ReturnType<Page["locator"]>) =>
    size.touch ? loc.tap() : loc.click();
  say(`\n== ${size.name} ${size.width}x${size.height}`);

  // 1. Materials — Needs price.
  await go(page, "/library/materials");
  const needsPrice = page.getByRole("button", { name: /^Set a price for/ });
  if (await needsPrice.count()) {
    await press(needsPrice.first());
    await page.waitForTimeout(600);
    say(
      `1 materials "Needs price": focus=${await focused(page)}, reason shown=${await visibleText(page, "No price yet")}`
    );
    await page.screenshot({ path: `${OUT}/${size.name}-1-materials.png` });
  } else say("1 materials: no 'Needs price' row on this account");

  // 2. Labor rates — Needs rate or Example rate.
  await go(page, "/library/labor-rates");
  const rateFix = page.getByRole("button", {
    name: /^Set (a|your own) rate for/,
  });
  if (await rateFix.count()) {
    await press(rateFix.first());
    await page.waitForTimeout(600);
    say(
      `2 labor rates: focus=${await focused(page)}, reason shown=${(await visibleText(page, "No rate yet")) || (await visibleText(page, "example loaded rate"))}`
    );
    await page.screenshot({ path: `${OUT}/${size.name}-2-rates.png` });
  } else say("2 labor rates: no rate warning on this account");

  // 3. Bid — tap a line warning, read the explanation.
  await go(page, `/bids/${bid.id}`);
  const lineWarn = page
    .locator("button")
    .filter({
      hasText:
        /^(Not priced|\+ (hours not set|material not priced|\d+ parts? not priced))$/,
    })
    .first();
  if (await lineWarn.count()) {
    const label = (await lineWarn.textContent())?.trim();
    await press(lineWarn);
    await page.waitForTimeout(600);
    const pop = await page
      .locator("[data-radix-popper-content-wrapper]")
      .first()
      .textContent()
      .catch(() => null);
    say(
      `3 bid "${label}": explanation on ${size.touch ? "tap" : "click"} = ${pop ? JSON.stringify(pop.slice(0, 90)) : "NONE"}`
    );
    await page.screenshot({ path: `${OUT}/${size.name}-3-bid.png` });
    await page.keyboard.press("Escape");
  } else say("3 bid: no line warning found");

  // 4. Settings → Heights — rename the account's own type.
  await go(page, "/settings/heights");
  const nameBtn = page.getByRole("button", { name: `Rename ${ownType}` });
  if (await nameBtn.count()) {
    await press(nameBtn);
    const box = page.getByRole("textbox", { name: `New name for ${ownType}` });
    const renamed = `${ownType} (${size.name})`;
    await box.fill(renamed);
    await box.press("Enter");
    await page.waitForTimeout(1500);
    say(`4 heights rename: shows new name=${await visibleText(page, renamed)}`);
    await page.screenshot({ path: `${OUT}/${size.name}-4-heights.png` });
  } else say("4 heights: own type's rename button NOT FOUND");

  // 6. Kit panel — the not-set assemblies with an hours box each.
  await go(page, "/library/assemblies?view=kits");
  await press(page.getByText(`Never stuck kit ${stamp}`).first());
  await page.waitForTimeout(1500);
  const boxes = await page
    .getByRole("textbox", { name: /^Hours for / })
    .count();
  say(`6 kit: hours boxes in the panel = ${boxes} (expected ${notSet.length})`);
  await page.screenshot({ path: `${OUT}/${size.name}-6-kit.png` });

  // 7. Analytics — the note names the bid; clicking opens it.
  await go(page, "/analytics");
  const named = page.getByRole("button", { name: `Never stuck ${stamp}` });
  if (await named.count()) {
    await page.screenshot({ path: `${OUT}/${size.name}-7-analytics.png` });
    await press(named.first());
    await page.waitForTimeout(1500);
    say(
      `7 analytics: bid named=true, opened=${page.url().includes(`/bids/${bid.id}`)}`
    );
  } else {
    say("7 analytics: bid NOT named in the note");
    await page.screenshot({ path: `${OUT}/${size.name}-7-analytics.png` });
  }
  await ctx.close();
}
say(
  "\n5 accounting export: behind the accounting.quickbooks feature, which this account does not have — not checked on screen."
);
writeFileSync(`${OUT}/never-stuck.log`, lines.join("\n") + "\n");

const cleanCtx = await browser.newContext({ storageState: storage });
const clean = await cleanCtx.newPage();
await trpc(clean, "bids.archive", { id: bid.id });
await trpc(clean, "kits.archive", { id: kit.id ?? kit.kit?.id }).catch(
  () => undefined
);
console.log("cleanup: bid archived");
await browser.close();
