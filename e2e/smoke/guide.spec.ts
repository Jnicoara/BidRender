/**
 * GUIDE MODE, DRIVEN (client/src/lib/guide.ts, GuideStrip, HelpSearch).
 *
 * The strip names the bid's next step from its real data and MOVES when the
 * data does; it waits on the Plans screen until Track B's first-open tips are
 * done; it never covers the screen above it; "Where do I…?" opens the screen
 * it names; and switching the guide off in Settings hides it at once — no
 * reload (the same-tab sync useLocalStorage gained for it).
 *
 * SHOTS=1 saves references/overnight-shots/guide-*-<project>.png.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
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
  await page.screenshot({ path: `${SHOT_DIR}/guide-${name}-${project}.png` });
}

const strip = (page: Page) =>
  page.getByRole("complementary", { name: "Guide" });

test.describe.configure({ mode: "serial" });

let bidId = 0;

test.beforeAll(async ({ request }) => {
  bidId = await createThrowawayBid(request, "guide");
});
test.afterAll(async ({ request }) => {
  if (bidId) await discardBid(request, bidId).catch(() => {});
});

/** Guide on, nothing closed, B's Plans tips not yet seen — a new person. */
async function freshGuide(page: Page) {
  await page.goto("/#/dashboard");
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("bp_guide:") || key === "bidrender.plans.tipsSeen")
        localStorage.removeItem(key);
  });
}

test("on a new bid it says step 1, and the screen above is not covered", async ({
  page,
}, info) => {
  await freshGuide(page);
  await page.goto(`/#/bids/${bidId}`);
  await expect(strip(page)).toContainText("Step 1 of 6");
  await expect(strip(page)).toContainText("Get the drawings in");
  expect(await layoutProblems(page)).toEqual([]);
  await shot(page, "bid", info.project.name);
});

test("on the Plans screen it waits for the first-open tips, then moves with the data", async ({
  page,
}, info) => {
  await freshGuide(page);
  await openPlans(page, bidId);
  await uploadFixturePlan(page);
  // Track B's first-open tip is up (its "Look up" tip always has something
  // to point at): the strip stays out of the way while it is…
  const noMore = page.getByRole("button", { name: "No more tips" });
  await expect(noMore).toBeVisible({ timeout: 30_000 });
  await expect(strip(page)).toHaveCount(0);
  await noMore.click();
  // …and comes in once it is gone, whichever of B's tips were ever shown.
  // Now it speaks — and from the DATA: drawings in, no scale yet.
  await expect(strip(page)).toContainText("Set the scale");
  expect(await layoutProblems(page)).toEqual([]);
  await shot(page, "plans", info.project.name);

  // Set a scale through the API; the strip must move on without a reload.
  const pdfs = await trpc<{ id: number }[]>(page.request, "bidPdfs.list", {
    bidId,
  });
  const sheets = await trpc<{ id: number }[]>(page.request, "bidPdfs.sheets", {
    bidPdfId: pdfs[0].id,
  });
  expect(sheets.length).toBeGreaterThan(0);
  {
    await trpc(
      page.request,
      "bidPdfs.setSheetScale",
      { id: sheets[0].id, scaleText: `1/8" = 1'-0"` },
      true
    );
    await page.goto(`/#/bids/${bidId}`);
    await expect(strip(page)).toContainText("Count the devices");
  }
});

test("Where do I…? finds a screen and opens it", async ({ page }, info) => {
  await freshGuide(page);
  await page.goto(`/#/bids/${bidId}`);
  await strip(page)
    .getByRole("button", { name: /Where do I/ })
    .click();
  await page.getByLabel("What do you want to do?").fill("labor rate");
  await expect(page.getByText("Set my labor rates")).toBeVisible();
  await shot(page, "help", info.project.name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/library\/labor-rates/);
});

test("closing a tip keeps it closed; turning the guide off hides it at once", async ({
  page,
}) => {
  await freshGuide(page);
  await page.goto(`/#/bids/${bidId}`);
  await expect(strip(page)).toBeVisible();
  const before = await strip(page).textContent();
  await strip(page).getByRole("button", { name: "Close this tip" }).click();
  // That tip is gone for good on this browser; a reload does not bring it back.
  await page.reload();
  await page.waitForLoadState("networkidle");
  const after = (await strip(page).count())
    ? await strip(page).textContent()
    : "";
  expect(after).not.toBe(before);

  // Settings › Display: the switch, while the strip's own shell is mounted.
  await page.goto("/#/settings/display");
  await page.getByLabel("Guide mode").click();
  await page.goto(`/#/bids/${bidId}`);
  await expect(strip(page)).toHaveCount(0);
  // And back on, for the next project's run.
  await page.goto("/#/settings/display");
  await page.getByLabel("Guide mode").click();
});
