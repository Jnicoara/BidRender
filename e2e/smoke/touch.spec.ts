/**
 * The core flow on a tablet, by touch — runs in the tablet projects only
 * (820x1180 and 1180x820, hasTouch). Every action is a TAP, the way a finger
 * does it: count, link, send. Mouse clicks would pass on a screen a finger
 * cannot use.
 *
 * The legend symbol is made through the API: capturing one is a drag, which
 * the desktop flow covers, and this test is about the counting path.
 */
import { expect, test } from "@playwright/test";
import { SYMBOLS } from "./fixturePlan";
import {
  createThrowawayBid,
  discardBid,
  openPlans,
  placeAt,
  sweepLeftovers,
  thisSheetLine,
  trpc,
  uploadFixturePlan,
} from "./helpers";

const ASSEMBLY = "Duplex receptacle standard";

let bidId: number;

test.afterEach(async ({ request }) => {
  if (bidId) await discardBid(request, bidId).catch(() => {});
  await sweepLeftovers(request);
});

test("count, link and send by touch", async ({ page }, info) => {
  // History: on 2026-10-01 this test found the app's sidebar covering the
  // full-screen panel's "← Plan" on an upright tablet, and carried it as an
  // expected failure. Track B's device work fixed it the same day; the test
  // reported "expected to fail, but passed" and the marker came out.
  bidId = await createThrowawayBid(page.request, `touch ${info.project.name}`);
  await trpc(
    page.request,
    "takeoffStamps.captureSymbol",
    { label: "CI TOUCH" },
    true
  );

  await openPlans(page, bidId);
  await uploadFixturePlan(page);

  // On an upright tablet the panel is a full-screen sheet behind the bar;
  // on a sideways one it is docked. Either way the Legend tab is one tap away.
  const openPanel = page.getByRole("button", {
    name: "Open the panel: counts, runs, sheets and totals",
  });
  const backToPlan = page.getByRole("button", { name: /^Plan$/ });
  const showPanel = async () => {
    if (await openPanel.isVisible()) await openPanel.tap();
  };

  const legendTab = page.getByRole("tab", { name: "Legend" });
  await showPanel();
  await legendTab.tap();
  await page
    .getByText(/^CI TOUCH$/)
    .first()
    .tap();

  // Upright, the panel covers the drawing: "← Plan" goes back to it.
  // 10 s, not the test's 3 min: when something covers it, say so quickly.
  if (await backToPlan.isVisible()) await backToPlan.tap({ timeout: 10_000 });
  await expect(page.getByText(/^Counting CI TOUCH/i).first()).toBeVisible();

  for (const at of SYMBOLS.duplex) await placeAt(page, at, true);
  await expect
    .poll(async () =>
      Number((await thisSheetLine(page).innerText()).match(/(\d+) marks?/)?.[1])
    )
    .toBe(3);

  // Link and send from the count card, by touch.
  await showPanel();
  await page.getByRole("tab", { name: "Counts" }).tap();
  await page.getByRole("button", { name: "Link assembly…" }).first().tap();
  await page
    .getByPlaceholder("Search assemblies…")
    .fill(ASSEMBLY.toLowerCase());
  await page
    .getByRole("button", { name: new RegExp(ASSEMBLY) })
    .first()
    .tap();
  await page
    .getByRole("button", { name: /^Send 3 to bid/ })
    .first()
    .tap();

  await expect
    .poll(async () => {
      const bid = await trpc<{ lines: { qty: string }[] }>(
        page.request,
        "bids.get",
        { id: bidId }
      );
      return bid.lines.map(l => Number(l.qty));
    })
    .toEqual([3]);
});
