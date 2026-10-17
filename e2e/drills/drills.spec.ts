/**
 * FAILURE DRILLS — the database and the plan store taken away under a
 * running app (owner's overnight queue, 2026-10-16, item 6). What must hold:
 *
 *   - while it is down the screen SAYS so, and never states a number it
 *     could not read: no "$0.00", no total at all, never a blank page;
 *   - nothing saved is lost;
 *   - when it comes back the app recovers ON ITS OWN, with no restart and
 *     no reload.
 *
 * The AI drill is server-side (server/failureDrills.test.ts: the reader
 * mocked to fail, then answer) — this setup runs with AI off, and an AI
 * call is a button, so no screen depends on it being up.
 *
 * Runs on the CI runner only (playwright.config.ts here): it stops MySQL
 * with `sudo systemctl` and locks the plan folder with chmod.
 */
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { buildFixturePlan } from "../smoke/fixturePlan";
import { sheetCanvas } from "../smoke/helpers";

test.describe.configure({ mode: "serial" });

const STORAGE = process.env.LOCAL_STORAGE_DIR ?? "";
let page: Page;
let bidId = 0;
let bidName = "";
let total = "";
/** Every dollar figure on the bid page before anything was taken away. */
let figuresBefore: string[] = [];

async function trpc<T>(proc: string, input?: unknown, mutation = false) {
  const body = { json: input ?? null };
  const res = mutation
    ? await page.request.post(`/api/trpc/${proc}`, { data: body })
    : await page.request.get(
        `/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(body))}`
      );
  const json = await res.json();
  if (json.error)
    throw new Error(`${proc}: ${json.error.json?.message ?? res.status()}`);
  return json.result.data.json as T;
}

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A real page load at `address`. Changing only the `#` part does not reload
 * the app, so a screen would keep what it read before — signed out before
 * the sign-up, or the figures read before the database went down.
 */
async function open(address: string) {
  await page.goto(address);
  await page.reload();
}

/** Every dollar figure on the screen right now. */
async function dollars(): Promise<string[]> {
  const text = await page.locator("body").innerText();
  return text.match(/\$\s?[\d,]+\.\d\d/g) ?? [];
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(() => {
  // Whatever happened, leave the runner's database and folder as found.
  try {
    execSync("sudo systemctl start mysql.service");
  } catch {}
  if (STORAGE)
    try {
      execSync(`chmod -R u+rwX "${STORAGE}"`);
    } catch {}
});

test("a priced bid, seen on screen", async () => {
  const stamp = Date.now();
  await page.goto("/");
  await trpc(
    "auth.signup",
    { email: `drill-${stamp}@test.invalid`, password: `Dr#${stamp}aA` },
    true
  );
  const onboarding = await trpc<{ isFirstRun: boolean }>("onboarding.state");
  if (onboarding.isFirstRun)
    await trpc("onboarding.completeFirstRun", undefined, true);

  const rate = await trpc<{ id?: number; laborRate?: { id: number } }>(
    "laborRates.create",
    { name: "Drill electrician", rateType: "hourly", hourlyCost: 60 },
    true
  );
  const rateId = rate.laborRate?.id ?? rate.id!;
  const part = await trpc<{ id: number }>(
    "materials.create",
    { name: "Drill part", costPerUnit: 10, unitOfSale: "each", category: null },
    true
  );
  const assembly = await trpc<{ id: number }>(
    "assemblies.create",
    {
      name: "Drill assembly",
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 1,
      laborRateId: rateId,
      materials: [{ materialId: part.id, qty: 1 }],
      modifierIds: [],
    },
    true
  );
  bidName = `Drill bid ${stamp}`;
  bidId = (await trpc<{ id: number }>("bids.create", { name: bidName }, true))
    .id;
  await trpc(
    "bids.addAssembly",
    { bidId, assemblyId: assembly.id, qty: 2 },
    true
  );
  const cards =
    await trpc<{ id: number; totalDue: number }[]>("bids.dashboard");
  const due = cards.find(c => c.id === bidId)!.totalDue;
  expect(due).toBeGreaterThan(0);
  total = usd(due);

  await open(`/#/bids/${bidId}`);
  await expect(page.getByText(total).first()).toBeVisible();
  // Settled: the same figures twice in a row.
  await expect
    .poll(async () => {
      const now = await dollars();
      const same = JSON.stringify(now) === JSON.stringify(figuresBefore);
      figuresBefore = now;
      return same && now.length > 0;
    })
    .toBe(true);
});

test("database DOWN: every screen says so, and states no number", async () => {
  execSync("sudo systemctl stop mysql.service");
  for (const address of [
    "/#/",
    `/#/bids/${bidId}`,
    `/#/bids/${bidId}/proposal`,
    "/#/bids",
  ]) {
    await open(address);
    await expect(
      page
        .getByText(/Can't reach BidRidge|couldn't load|Could not load/i)
        .first()
    ).toBeVisible({ timeout: 60_000 });
    expect(await dollars(), `${address} while the database is down`).toEqual(
      []
    );
    expect(
      (await page.locator("body").innerText()).trim().length
    ).toBeGreaterThan(20);
  }
});

test("database BACK: the open screen recovers by itself, the total unchanged", async () => {
  await open(`/#/bids/${bidId}`);
  await expect(page.getByText(/Can't reach BidRidge/i).first()).toBeVisible({
    timeout: 60_000,
  });
  execSync("sudo systemctl start mysql.service");
  // No reload, no click: it retries by itself every few seconds.
  await expect(page.getByText(total).first()).toBeVisible({ timeout: 90_000 });
  // Every figure exactly as before the outage — a real $0.00 line (overhead
  // left off, no tax) is fine; a figure that MOVED is not.
  await expect.poll(dollars, { timeout: 30_000 }).toEqual(figuresBefore);
});

test("plan store DOWN: the plan says it cannot open, the bid's money is untouched; BACK: it opens", async () => {
  test.skip(!STORAGE, "LOCAL_STORAGE_DIR is not set");
  await open(`/#/bids/${bidId}/plans`);
  const attached = page.waitForResponse(
    r => r.url().includes("bidPdfs.confirmAttach") && r.ok(),
    { timeout: 120_000 }
  );
  await page.locator("input[type=file][accept*='pdf']").setInputFiles({
    name: "drill-plan.pdf",
    mimeType: "application/pdf",
    buffer: buildFixturePlan(),
  });
  await attached;
  await expect(sheetCanvas(page)).toBeVisible({ timeout: 90_000 });

  execSync(`chmod -R a-rwx "${STORAGE}"`);
  try {
    await page.reload();
    await expect(
      page
        .getByText(/couldn't|could not|can't|cannot|unavailable|try again/i)
        .first()
    ).toBeVisible({ timeout: 90_000 });
    await expect(sheetCanvas(page)).toHaveCount(0);
    // The money does not live in the plan store.
    await page.goto(`/#/bids/${bidId}`);
    await expect(page.getByText(total).first()).toBeVisible();
  } finally {
    execSync(`chmod -R u+rwX "${STORAGE}"`);
  }
  await open(`/#/bids/${bidId}/plans`);
  await expect(sheetCanvas(page)).toBeVisible({ timeout: 90_000 });
});
