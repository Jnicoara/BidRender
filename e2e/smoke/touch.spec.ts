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

  // A SLOW CONNECTION, on purpose (2026-10-06). On a fast one every query
  // has answered before the first tap, and that is exactly how a fault stayed
  // hidden: the layer that takes taps waited for the sheet's measurability
  // query, and a mark had nowhere to go until the sheet's row arrived — on a
  // fresh upload, three round trips after the drawing. Taps in that window
  // were lost without a word: 0–1 of 3 kept on staging, four runs in a row,
  // while every laptop passed. 300 ms per request reproduces it every time
  // without the fix (TakeoffPage `overlay` + `provisionalSheetFor`,
  // client/src/lib/markBatches.test.ts). Chromium only, which every project is.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 300,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  // AND the sheet rows arriving LATE, after the count exists (2026-10-06).
  // That order is what staging produced and a laptop does not: taps kept
  // for the missing row were mirrored the moment it arrived, the crash
  // recovery for that same sheet read them back as left over from a crash,
  // and every tap was sent twice — 6 marks for 3. Holding back the ONE call
  // that creates the rows (ensureSheets, once) makes that order certain
  // instead of a matter of luck. Not every sheet-list request: delaying the
  // refreshes too starves the mark list itself, and the test then fails for
  // a reason no user can meet.
  let rowsHeld = false;
  await page.route(
    url =>
      url.pathname.includes("/api/trpc/") &&
      url.pathname.includes("bidPdfs.ensureSheets"),
    async route => {
      if (!rowsHeld) {
        rowsHeld = true;
        await new Promise(r => setTimeout(r, 1500));
      }
      await route.continue();
    }
  );
  // AND the sheet's FIRST mark list answering late, with what it read BEFORE
  // the marks were saved (fetched at once, delivered after a pause). That is
  // the moment the held taps go out, and React Query's refresh does not
  // cancel a query still on its first fetch — so the screen kept the empty
  // early answer: "0 marks" with 3 on the server (2026-10-06). Holding the
  // RESPONSE rather than the request is the point: a late request would be
  // answered after the save and hide the fault.
  let firstListHeld = false;
  await page.route(
    url =>
      url.pathname.includes("/api/trpc/") &&
      url.pathname.includes("takeoffStamps.listForSheet"),
    async route => {
      if (firstListHeld) return route.continue();
      firstListHeld = true;
      const early = await route.fetch();
      await new Promise(r => setTimeout(r, 1200));
      await route.fulfill({ response: early });
    }
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
    // Visible: a mark's SVG <title> carries the same words (flow.spec.ts).
    .filter({ visible: true })
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
