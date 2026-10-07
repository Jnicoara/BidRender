/**
 * On-screen check for "Labor only" (0105–0106): the assembly editor's tick
 * box, a bid holding one ticked and one unticked labor-only line, and the
 * proposal — at laptop and tablet sizes. Screenshots go to OUT_DIR.
 *
 *   OUT_DIR=<dir> npx tsx scripts/laborOnlyScreenCheck.mts
 *
 * Local only: it creates two assemblies and a bid for user 1 through the
 * app's own API, and prints their names so they can be deleted afterwards.
 * Lives in scripts/ so playwright-core resolves (track-b-handoff.md).
 */
import type { Page } from "playwright-core";
import {
  SIZES,
  baseUrl,
  gotoRoute,
  launchChrome,
  openAt,
} from "./deviceAudit.mts";

const OUT = process.env.OUT_DIR ?? ".";
const OPEN_ID = "e5mSTU8bQbySZsknSun5f4"; // user 1, local
const stamp = Date.now();
const TICKED = `Pull wire in existing conduit (check ${stamp})`;
const UNSAID = `Trouble-shoot hour (check ${stamp})`;

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
const tablet = SIZES.find(s => s.name === "tablet-portrait")!;

const setup = await openAt(browser, laptop, OPEN_ID);
await gotoRoute(setup, "/");
// A priced role of its own: with the local starter rate at $0, every labor
// line would be $0 as a whole and read "Not priced" for that reason instead.
const role = await trpc(setup, "laborRates.create", {
  name: `Check role ${stamp}`,
  rateType: "hourly",
  hourlyCost: 80,
});
const ticked = await trpc(setup, "assemblies.create", {
  name: TICKED,
  category: "Devices",
  baseLaborHours: 1.5,
  laborRateId: role.id,
  laborOnly: true,
});
const unsaid = await trpc(setup, "assemblies.create", {
  name: UNSAID,
  category: "Devices",
  baseLaborHours: 1,
  laborRateId: role.id,
});
const bid = await trpc(setup, "bids.create", {
  name: `Labor only check ${stamp}`,
});
await trpc(setup, "bids.addAssembly", { bidId: bid.id, assemblyId: ticked.id });
await trpc(setup, "bids.addAssembly", { bidId: bid.id, assemblyId: unsaid.id });
// A bid holding ONLY the ticked line: its print must show a price.
const clean = await trpc(setup, "bids.create", {
  name: `Labor only clean ${stamp}`,
});
await trpc(setup, "bids.addAssembly", {
  bidId: clean.id,
  assemblyId: ticked.id,
});
await setup.context().close();
console.log(
  JSON.stringify({
    bidId: bid.id,
    cleanBidId: clean.id,
    ticked: ticked.id,
    unsaid: unsaid.id,
  })
);

for (const size of [laptop, tablet]) {
  const page = await openAt(browser, size, OPEN_ID);
  const shot = async (name: string) =>
    page.screenshot({
      path: `${OUT}/${size.name}-${name}.png`,
      fullPage: false,
    });

  // The editor, opened on the ticked assembly.
  await gotoRoute(page, "/library/assemblies");
  await page.getByPlaceholder("Search assemblies…").fill(`check ${stamp}`);
  await page.waitForTimeout(600);
  await page.getByText(TICKED, { exact: true }).first().click();
  await page.waitForTimeout(800);
  const box = page.getByText("Labor only", { exact: true }).first();
  await box.scrollIntoViewIfNeeded();
  await shot("editor-ticked");
  const preview = page.getByText("Cost preview").first();
  await preview.scrollIntoViewIfNeeded();
  await shot("editor-preview");

  // The bid: the ticked line is priced, the unsaid one is not.
  await gotoRoute(page, `/bids/${bid.id}`);
  await page.getByText(UNSAID).first().scrollIntoViewIfNeeded();
  await shot("bid");

  // The proposal.
  await gotoRoute(page, `/bids/${bid.id}/proposal`);
  await shot("proposal");
  await gotoRoute(page, `/bids/${clean.id}/proposal`);
  await shot("proposal-labor-only");
  await page.context().close();
}
await browser.close();
