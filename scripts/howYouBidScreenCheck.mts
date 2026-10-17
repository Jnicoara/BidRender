/**
 * On-screen check for "How do you bid?" (owner Q8, 2026-10-16): a shop with
 * material markup that never chose a method — the Dashboard question, a new
 * bid's Pricing settings (Old math · company standard), Settings › Pricing
 * ("Not chosen yet"); then the answer, and one job switched on its own
 * ("This job only"). Laptop, iPad portrait and phone. Screenshots → OUT_DIR.
 *
 *   OUT_DIR=<dir> npx tsx scripts/howYouBidScreenCheck.mts
 *
 * Local only (databaseGuard): makes a throwaway user, and deletes it (and,
 * by cascade, everything it made) at the end.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import type { Page } from "playwright-core";
import { assertWritableDatabase } from "./databaseGuard";
import {
  SIZES,
  baseUrl,
  gotoRoute,
  launchChrome,
  openAt,
} from "./deviceAudit.mts";

const OUT = process.env.OUT_DIR ?? ".";
const USER_ID = 990_401;
const OPEN_ID = `screen-check-${USER_ID}`;

assertWritableDatabase(process.env.DATABASE_URL, {
  action: "make and delete a throwaway screen-check user",
});
const conn = await mysql.createConnection(process.env.DATABASE_URL!);
await conn.query("DELETE FROM users WHERE id = ?", [USER_ID]);
await conn.query(
  "INSERT INTO users (id, openId, name, email, onboardingCompletedAt) VALUES (?, ?, ?, ?, NOW())",
  [USER_ID, OPEN_ID, "Screen check shop", `screen-${USER_ID}@example.test`]
);

async function trpc(page: Page, proc: string, input: unknown, mutate = true) {
  return page.evaluate(
    async ({ proc, input, mutate, base }) => {
      const url = `${base}/api/trpc/${proc}?batch=1${
        mutate
          ? ""
          : `&input=${encodeURIComponent(JSON.stringify({ 0: { json: input } }))}`
      }`;
      const res = await fetch(url, {
        method: mutate ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        body: mutate ? JSON.stringify({ 0: { json: input } }) : undefined,
      });
      const body = await res.json();
      if (body[0]?.error) throw new Error(JSON.stringify(body[0].error));
      return body[0].result.data.json;
    },
    { proc, input, mutate, base: baseUrl() }
  );
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
const sizes = [
  laptop,
  SIZES.find(s => s.name === "tablet-portrait")!,
  SIZES.find(s => s.name === "phone")!,
];

try {
  const setup = await openAt(browser, laptop, OPEN_ID);
  await gotoRoute(setup, "/");
  await trpc(setup, "bids.setPricingDefaults", {
    overheadEnabled: true,
    overheadMode: "percentage",
    overheadValue: 0.12,
    profitMethod: "markup",
    profitValue: 0.15,
    materialMarkupPct: 0.1,
  });
  const before = await trpc(setup, "bids.create", { name: "Q8 new bid" });
  console.log("new bid method before answer:", before.pricingMethod);
  console.log(
    "howYouBid:",
    JSON.stringify(await trpc(setup, "bids.howYouBid", {}, false))
  );

  async function shoot(tag: string, after?: (p: Page) => Promise<void>) {
    for (const size of sizes) {
      const page = await openAt(browser, size, OPEN_ID);
      await gotoRoute(page, "/");
      await page.screenshot({
        path: `${OUT}/${tag}-dashboard-${size.name}.png`,
        fullPage: true,
      });
      await gotoRoute(page, `/bids/${before.id}`);
      const panel = page.getByRole("button", { name: /Pricing settings/ });
      await panel
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => undefined);
      const summary = await panel
        .first()
        .innerText()
        .catch(() => "(no panel)");
      console.log(`${tag} ${size.name} panel:`, summary.replace(/\s+/g, " "));
      await panel
        .first()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(600);
      const method = page.getByTestId("bid-method");
      await method.scrollIntoViewIfNeeded().catch(() => undefined);
      await page.screenshot({ path: `${OUT}/${tag}-bid-${size.name}.png` });
      console.log(
        `${tag} ${size.name} method row:`,
        (await method.innerText().catch(() => "(none)")).replace(/\s+/g, " ")
      );
      await gotoRoute(page, "/settings/pricing");
      const how = page.getByTestId("company-method");
      await how.scrollIntoViewIfNeeded().catch(() => undefined);
      await page.screenshot({
        path: `${OUT}/${tag}-settings-${size.name}.png`,
      });
      console.log(
        `${tag} ${size.name} settings:`,
        (await how.innerText().catch(() => "(none)")).replace(/\s+/g, " ")
      );
      if (after) await after(page);
      await page.context().close();
    }
  }

  await shoot("1-open");

  // Answer from the Dashboard card, as a person would.
  const answerPage = await openAt(browser, laptop, OPEN_ID);
  await gotoRoute(answerPage, "/");
  await answerPage
    .getByTestId("how-you-bid")
    .getByRole("button", { name: /Cost \+ O&P/ })
    .click();
  await answerPage.waitForTimeout(1500);
  console.log(
    "card after answer visible:",
    await answerPage
      .getByTestId("how-you-bid")
      .isVisible()
      .catch(() => false)
  );
  await answerPage.screenshot({
    path: `${OUT}/2-answered-dashboard-laptop.png`,
  });
  await answerPage.context().close();
  console.log(
    "howYouBid after:",
    JSON.stringify(await trpc(setup, "bids.howYouBid", {}, false))
  );

  // Switch the earlier bid on its own (it is a Draft on the old math).
  await trpc(setup, "bids.setPricingMethod", {
    id: before.id,
    method: "markup_rate",
  });
  await shoot("3-job-only");
  console.log(
    "howYouBid after job switch:",
    JSON.stringify(await trpc(setup, "bids.howYouBid", {}, false))
  );
} finally {
  await browser.close();
  await conn.query("DELETE FROM users WHERE id = ?", [USER_ID]);
  await conn.end();
}
