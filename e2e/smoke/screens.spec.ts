/**
 * Every main screen, at every size the projects define — desktop, phone
 * (390x844) and tablet both ways (820x1180, 1180x820) — checked for what a
 * person would LOSE: text below the bottom edge with nothing to scroll to it,
 * and a page that scrolls sideways (helpers.ts `layoutProblems`).
 *
 * Paths come from the route model (client/src/lib/appRoutes.ts) as it stands;
 * a screen moved there without updating this list is an address the app
 * would redirect, which shows up here as the wrong screen.
 */
import { expect, test } from "@playwright/test";
import {
  createThrowawayBid,
  discardBid,
  layoutProblems,
  openPlans,
  uploadFixturePlan,
} from "./helpers";

const SETTINGS = [
  "pricing",
  "heights",
  "branding",
  "tax",
  "proposal",
  "display",
  "account",
];

const APP_SCREENS = [
  "/dashboard",
  "/clients",
  "/analytics",
  "/team",
  "/archive",
  "/library/materials",
  "/library/labor-rates",
  "/library/assemblies",
  ...SETTINGS.map(s => `/settings/${s}`),
];

test.describe.configure({ mode: "serial" });

let bidId: number;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  bidId = await createThrowawayBid(page.request, "screens");
  await openPlans(page, bidId);
  await uploadFixturePlan(page);
  await page.close();
});

test.afterAll(async ({ request }) => {
  if (bidId) await discardBid(request, bidId).catch(() => {});
});

async function expectNothingLost(
  page: import("@playwright/test").Page,
  where: string
) {
  // Let the screen finish its first load before measuring it.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  const problems = await layoutProblems(page);
  expect(problems, `${where}: ${problems.join("; ")}`).toEqual([]);
}

/**
 * KNOWN layout faults, by screen, then by project: shown as expected failures
 * (`test.fail`), never skipped. Each stays visible on every run, and the day
 * it is fixed the test goes red with "expected to fail, but passed" — so the
 * entry gets removed rather than outliving the fault. Add one only with the
 * date it was found.
 *
 * All three found 2026-10-01 are one family: a page HEADER row that does not
 * wrap on a 390px phone, so its subtitle stacks a word per line and the
 * buttons at its right run off the screen. They predate the responsiveness
 * rules (CLAUDE.md), so they are reported, not retrofitted as a side effect.
 */
const KNOWN_FAULTS: Record<string, string[]> = {
  // "+ Empty bid" runs 35px past the right edge; "Out for bid" overlaps.
  "/dashboard": ["phone"],
  // The bid screen is 497px wide on a 390px phone; cards run off the right.
  "/bids/:id": ["phone"],
  // "Print / Save PDF" sits 103px past the right edge, out of reach; the zoom
  // controls overlap "Design".
  "/bids/:id/proposal": ["phone"],
};

function expectKnownFault(screen: string, project: string) {
  test.fail(
    (KNOWN_FAULTS[screen] ?? []).includes(project),
    `known layout fault on ${project}: see KNOWN_FAULTS in screens.spec.ts`
  );
}

for (const path of APP_SCREENS) {
  test(`${path} — nothing cut off, no sideways scroll`, async ({
    page,
  }, info) => {
    expectKnownFault(path, info.project.name);
    await page.goto(`/#${path}`);
    await expect(
      page.locator("main, [role='main'], body").first()
    ).toBeVisible();
    await expectNothingLost(page, path);
  });
}

for (const [label, suffix] of [
  ["the bid", ""],
  ["its Plans", "/plans"],
  ["its Count", "/count"],
  ["its Proposal", "/proposal"],
] as const) {
  test(`${label} screen — nothing cut off`, async ({ page }, info) => {
    expectKnownFault(`/bids/:id${suffix}`, info.project.name);
    const path = `/bids/${bidId}${suffix}`;
    await page.goto(`/#${path}`);
    await page.waitForTimeout(1500);
    await expectNothingLost(page, path);
  });
}

test("Plans on a phone or upright tablet opens the panel full-screen with a Sheets tab", async ({
  page,
  viewport,
}) => {
  const upright = (viewport?.height ?? 0) > (viewport?.width ?? 0);
  test.skip(
    !(viewport && (viewport.width < 768 || upright)),
    "laptop layout at this size (shared/plansLayout: phone below 768px, or a finger held upright)"
  );
  await openPlans(page, bidId);
  // On the phone layout the panel opens from the bar under the drawing.
  const sheets = page.getByRole("tab", { name: "Sheets" });
  if (!(await sheets.isVisible())) {
    await page
      .getByRole("button", { name: /This sheet|Counts|Panel|Open/ })
      .first()
      .click();
  }
  await expect(sheets).toBeVisible();
  await expectNothingLost(page, "Plans panel, phone layout");
});
