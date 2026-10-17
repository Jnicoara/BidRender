/**
 * On-screen check for the rest of bid methods (bid-methods-plan.md § 3, § 5):
 * Settings › Pricing price brackets (starter filled, an overlap refused),
 * Labor rates › prevailing wage sets (a set past re-check), a bid on that
 * set (apprentice question, comparison), and the print warning on its
 * proposal. Laptop, iPad portrait, phone. Screenshots → OUT_DIR.
 *
 *   OUT_DIR=<dir> npx tsx scripts/bidMethodsScreenCheck.mts
 *
 * Local only (databaseGuard): a throwaway user, deleted at the end.
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
const USER_ID = 990_402;
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

const text = async (p: Page, testId: string) =>
  (
    await p
      .getByTestId(testId)
      .first()
      .innerText()
      .catch(() => "(none)")
  ).replace(/\s+/g, " ");

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
  const role = await trpc(setup, "laborRates.create", {
    name: "PW Journeyman",
    rateType: "hourly",
    hourlyCost: 50,
  });
  const roleId = role.id ?? role.laborRate?.id;
  const appr = await trpc(setup, "laborRates.create", {
    name: "PW Apprentice",
    rateType: "hourly",
    hourlyCost: 30,
  });
  await trpc(setup, "wageSets.save", {
    id: null,
    name: "Pierce County public works 2026",
    wageDeterminationNumber: "2026-0123",
    dateSet: "2026-03-01",
    fringePaidAsCash: false,
    rates: [
      {
        classification: "journeyman",
        label: "Journeyman",
        laborRateId: roleId,
        baseWage: 48,
        fringe: 18,
      },
      {
        classification: "apprentice",
        label: "Apprentice",
        laborRateId: appr.id ?? appr.laborRate?.id,
        baseWage: 26,
        fringe: 9,
      },
    ],
  });
  const sets = await trpc(
    setup,
    "wageSets.list",
    { today: "2026-10-16" },
    false
  );
  const bid = await trpc(setup, "bids.create", { name: "PW school job" });
  await trpc(setup, "bids.setWageSet", {
    id: bid.id,
    wageRateSetId: sets[0].id,
  });
  await conn.query(
    "INSERT INTO bid_line_items (bidId, name, qty, snapshotMaterialCost, snapshotLaborHours, snapshotLaborRate, snapshotModifierPct, snapshotMarkupPct, snapshotUnpricedParts) VALUES (?, ?, 1, 100, 1, 50, 0, 0, 0)",
    [bid.id, "Panel swap"]
  );
  // Work on the bid, so Print reaches its warnings rather than "nothing to print".
  await trpc(setup, "bidExtras.expenses.addToBid", {
    bidId: bid.id,
    name: "Permit",
    amount: 185,
    taxable: false,
    markedUp: false,
  });

  for (const size of process.env.PRINT_ONLY ? [] : sizes) {
    const page = await openAt(browser, size, OPEN_ID);

    await gotoRoute(page, "/settings/pricing");
    const more = page.getByRole("button", { name: /price brackets/ });
    await more.scrollIntoViewIfNeeded();
    await more.click();
    await page.getByRole("button", { name: /starter brackets/ }).click();
    await page.getByTestId("markup-brackets").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/brackets-starter-${size.name}.png` });
    console.log(`${size.name} brackets:`, await text(page, "markup-brackets"));
    await page.getByLabel("Bracket 2 from").fill("0.5");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/brackets-overlap-${size.name}.png` });
    console.log(`${size.name} overlap:`, await text(page, "markup-brackets"));
    console.log(
      `${size.name} save disabled on overlap:`,
      await page.getByRole("button", { name: "Save brackets" }).isDisabled()
    );

    await gotoRoute(page, "/library/labor-rates");
    await page.getByTestId("wage-sets").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/wage-sets-${size.name}.png` });
    console.log(`${size.name} wage sets:`, await text(page, "wage-sets"));

    await gotoRoute(page, `/bids/${bid.id}`);
    const panel = page.getByRole("button", { name: /Pricing settings/ });
    await panel.first().scrollIntoViewIfNeeded();
    await panel.first().click();
    await page.waitForTimeout(600);
    await page.getByTestId("bid-wage").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/bid-wage-${size.name}.png` });
    console.log(`${size.name} bid wage:`, await text(page, "bid-wage"));

    await page.context().close();
  }

  // The print warning: a bid with work on it, past re-check.
  const p = await openAt(browser, laptop, OPEN_ID);
  await gotoRoute(p, `/bids/${bid.id}/proposal`);
  await p.waitForTimeout(800);
  await p.keyboard.press("Control+p").catch(() => undefined);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/proposal-print-laptop.png` });
  console.log(
    "print warning:",
    await p
      .getByTestId("wage-recheck-warning")
      .innerText()
      .catch(() => "(none)")
  );
} finally {
  await browser.close();
  await conn.query("DELETE FROM users WHERE id = ?", [USER_ID]);
  await conn.end();
}
