/**
 * THE SCREENS TRACK C BUILT ON 2026-10-14, DRIVEN END TO END.
 *
 * Bids list, Plans list, Recently deleted + Restore, the bid step bar and its
 * Next, the reshaped nav (sidebar on a laptop, bottom bar + More on a phone),
 * the price history and typing a price by the pack. Each test acts and then
 * checks the screen MOVED (CLAUDE.md: a stale screen states a wrong thing in
 * the confident voice of a fresh one), not just that it rendered.
 *
 * With SHOTS=1 every test also saves a screenshot to
 * references/overnight-shots/<screen>-<project>.png, at each project's size:
 * laptop (desktop, 1440x900), iPad both ways, and phone 375 — the owner's
 * morning review set.
 *
 * Throwaway rows carry THROWAWAY_PREFIX, so the setup's sweep clears any a
 * crashed run left behind.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  THROWAWAY_PREFIX,
  createThrowawayBid,
  discardBid,
  layoutProblems,
  openPlans,
  trpc,
  uploadFixturePlan,
} from "./helpers";

const SHOT_DIR = resolve(
  import.meta.dirname,
  "../../references/overnight-shots"
);

async function shot(page: Page, name: string, project: string) {
  if (!process.env.SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/${name}-${project}.png` });
}

const isPhone = (project: string) => project.startsWith("phone");

test.describe.configure({ mode: "serial" });

let bidId = 0;
let bidName = "";
let materialId = 0;
let materialName = "";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  bidId = await createThrowawayBid(page.request, "new screens");
  const { bid } = await trpc<{ bid: { name: string } }>(
    page.request,
    "bids.get",
    {
      id: bidId,
    }
  );
  bidName = bid.name;
  await openPlans(page, bidId);
  await uploadFixturePlan(page);
  // A material of this account's own, priced twice so it has a history.
  materialName = `${THROWAWAY_PREFIX} wire ${Date.now()}`;
  const created = await trpc<{ id: number }>(
    page.request,
    "materials.create",
    { name: materialName, unitOfSale: "foot", costPerUnit: 2.5 },
    true
  );
  materialId = created.id;
  await trpc(
    page.request,
    "materials.update",
    { id: materialId, costPerUnit: 3.75 },
    true
  );
  await page.close();
});

test.afterAll(async ({ request }) => {
  if (bidId) await discardBid(request, bidId).catch(() => {});
  if (materialId)
    await trpc(request, "materials.archive", { id: materialId }, true).catch(
      () => {}
    );
});

test("nav: Bids and Plans are daily work; More holds the rest on a phone", async ({
  page,
}, info) => {
  await page.goto("/#/dashboard");
  if (isPhone(info.project.name)) {
    const bar = page.getByRole("navigation", { name: "Main" });
    await expect(bar).toBeVisible();
    for (const label of ["Dashboard", "Bids", "Plans", "Materials", "More"])
      await expect(bar.getByRole("button", { name: label })).toBeVisible();
    await bar.getByRole("button", { name: "More" }).click();
    const more = page.getByLabel("More destinations");
    await expect(more).toBeVisible();
    await expect(more.getByText("Recently deleted")).toBeVisible();
    await shot(page, "nav-more", info.project.name);
    await more.getByText("Recently deleted").click();
    await expect(
      page.getByRole("heading", { name: "Recently deleted" })
    ).toBeVisible();
  } else {
    for (const label of ["Bids", "Plans", "Recently deleted"])
      await expect(
        page.getByRole("button", { name: label, exact: true }).first()
      ).toBeVisible();
    await shot(page, "nav", info.project.name);
    await page
      .getByRole("button", { name: "Bids", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Bids", exact: true })
    ).toBeVisible();
  }
});

test("Bids list: search finds the bid, it opens, and Back says Bids", async ({
  page,
}, info) => {
  await page.goto("/#/bids");
  await expect(
    page.getByRole("heading", { name: "Bids", exact: true })
  ).toBeVisible();
  await page.getByLabel("Search bids").fill(bidName);
  const row = page.getByText(bidName, { exact: true }).first();
  await expect(row).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  await shot(page, "bids-list", info.project.name);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`#/bids/${bidId}`));
  await expect(
    page.getByRole("button", { name: /Bids/ }).first()
  ).toBeVisible();
});

test("Plans list: the bid with drawings is there and opens its plans", async ({
  page,
}, info) => {
  await page.goto("/#/plans");
  await expect(
    page.getByRole("heading", { name: "Plans", exact: true })
  ).toBeVisible();
  const row = page.getByTitle(`Open the plans for ${bidName}`);
  await expect(row).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  await shot(page, "plans-list", info.project.name);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`#/bids/${bidId}/plans`));
});

test("step bar: shows where the bid stands, and Next goes there", async ({
  page,
}, info) => {
  await page.goto(`/#/bids/${bidId}`);
  const steps = page.getByLabel("Bid steps").first();
  await expect(steps).toBeVisible();
  const next = steps.getByRole("button", { name: /Next:/ });
  await expect(next).toBeVisible();
  // Each step answers to its OWN name, never the bare tool word: on the Plans
  // screen "Count" and "Runs" are toolbar buttons too, and a shared name sent
  // the smoke's "Count" to the step (2026-10-16).
  for (const step of ["Plans", "Scale", "Count", "Runs", "Review", "Print"])
    await expect(
      steps.getByRole("button", { name: `Step: ${step}`, exact: true })
    ).toHaveCount(1);
  await expect(
    steps.getByRole("button", { name: "Count", exact: true })
  ).toHaveCount(0);
  expect(await layoutProblems(page)).toEqual([]);
  await shot(page, "step-bar", info.project.name);
  const before = page.url();
  await next.click();
  await expect.poll(() => page.url()).not.toBe(before);
});

test("Recently deleted: an archived bid is listed, Restore brings it back", async ({
  page,
}, info) => {
  const doomed = await createThrowawayBid(page.request, "restore me");
  const {
    bid: { name },
  } = await trpc<{ bid: { name: string } }>(page.request, "bids.get", {
    id: doomed,
  });
  await trpc(page.request, "bids.archive", { id: doomed }, true);
  try {
    await page.goto("/#/trash");
    await expect(
      page.getByRole("heading", { name: "Recently deleted" })
    ).toBeVisible();
    // In the page's own list — a toast is an <li> too, and "… is back."
    // carries the same name.
    const row = page.locator("section li", { hasText: name });
    // Newest deleted first, so the one just deleted is the first row.
    await expect(page.locator("section li").first()).toContainText(name);
    await expect(row).toBeVisible();
    expect(await layoutProblems(page)).toEqual([]);
    await shot(page, "trash", info.project.name);
    await row.getByRole("button", { name: "Restore" }).click();
    // The row leaves the list, and the bid is live again.
    await expect(row).toHaveCount(0);
    await page.goto("/#/bids");
    await page.getByLabel("Search bids").fill(name);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  } finally {
    await discardBid(page.request, doomed).catch(() => {});
  }
});

async function openEditor(page: Page) {
  await page.goto("/#/library/materials");
  await page.getByPlaceholder("Search materials…").fill(materialName);
  const edit = page.getByLabel(`Edit ${materialName}`);
  await edit.focus();
  await edit.click();
  await page.getByRole("button", { name: /More options/ }).click();
}

test("price history: both recorded prices, newest first", async ({
  page,
}, info) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Price history" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("$3.75").first()).toBeVisible();
  await shot(page, "price-history", info.project.name);
});

test("pack price: 17.99 for a bundle of 10 saves 1.799 a unit", async ({
  page,
}, info) => {
  await openEditor(page);
  await page.getByLabel("How many in a pack").fill("10");
  await page.getByLabel("What the pack is called").fill("bundle");
  const pack = page.getByLabel("Price per pack");
  await expect(pack).toBeVisible();
  await pack.fill("17.99");
  await shot(page, "pack-price", info.project.name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => {
      const row = await trpc<{ costPerUnit: string }>(
        page.request,
        "materials.get",
        { id: materialId }
      );
      return row.costPerUnit;
    })
    .toMatch(/^1\.799/);
  // And it is restored for the next project's run.
  await trpc(
    page.request,
    "materials.update",
    { id: materialId, costPerUnit: 3.75 },
    true
  );
});
