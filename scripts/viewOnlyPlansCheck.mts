/**
 * The Plans screen as a VIEW-ONLY member (a `viewer`, which has no
 * `bids.edit` — the same screen Field gets after FR-M1): count rows show no
 * undo and no bin, and the panel says "View only". Laptop and iPad, on the
 * "Bar layout check" fixture (user 1). Local only: a throwaway member of
 * user 1's company, deleted at the end. Screenshots → OUT_DIR.
 *
 *   OUT_DIR=<dir> npx tsx scripts/viewOnlyPlansCheck.mts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { assertWritableDatabase } from "./databaseGuard";
import { SIZES, gotoRoute, launchChrome, openAt } from "./deviceAudit.mts";

const OUT = process.env.OUT_DIR ?? ".";
const USER_ID = 990_403;
const OPEN_ID = `screen-check-${USER_ID}`;
assertWritableDatabase(process.env.DATABASE_URL, {
  action: "add and remove a throwaway view-only member",
});
const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const [[owner]] = (await conn.query(
  "SELECT c.id AS companyId FROM companies c WHERE c.ownerUserId = 1 LIMIT 1"
)) as unknown as [[{ companyId: number }]];
const [[bid]] = (await conn.query(
  "SELECT id FROM bids WHERE userId = 1 AND name = 'Bar layout check' LIMIT 1"
)) as unknown as [[{ id: number }]];
await conn.query("DELETE FROM users WHERE id = ?", [USER_ID]);
await conn.query(
  "INSERT INTO users (id, openId, name, email, onboardingCompletedAt) VALUES (?, ?, 'View-only check', ?, NOW())",
  [USER_ID, OPEN_ID, `screen-${USER_ID}@example.test`]
);
await conn.query(
  "INSERT INTO company_members (companyId, userId, role, status) VALUES (?, ?, 'viewer', 'active')",
  [owner.companyId, USER_ID]
);
const browser = await launchChrome();
const laptop = {
  name: "laptop",
  width: 1366,
  height: 768,
  dpr: 1,
  touch: false,
  mobile: false,
};
try {
  for (const size of [laptop, SIZES.find(s => s.name === "tablet-portrait")!]) {
    const page = await openAt(browser, size, OPEN_ID);
    await gotoRoute(page, `/bids/${bid.id}/plans`);
    await page.waitForTimeout(4000);
    const viewOnly = await page
      .getByText(/View only/)
      .first()
      .isVisible()
      .catch(() => false);
    const bins = await page
      .getByRole("button", { name: /delete count|undo the last/i })
      .count();
    console.log(
      `${size.name}: "View only" shown ${viewOnly}; undo/bin buttons on count rows ${bins}`
    );
    await page.screenshot({ path: `${OUT}/viewonly-plans-${size.name}.png` });
    await page.context().close();
  }
} finally {
  await browser.close();
  await conn.query("DELETE FROM users WHERE id = ?", [USER_ID]);
  await conn.end();
}
