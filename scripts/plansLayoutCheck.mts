/**
 * Plans screen at laptop, iPad portrait and phone, on the "Bar layout check"
 * fixture bid (user 1): sheet 1 (E0.01, no scale) and sheet 2 (a drawing).
 * Prints how many pixels sit above the drawing and what the scale control
 * says. Screenshots → OUT_DIR.  OUT_DIR=<dir> npx tsx scripts/plansLayoutCheck.mts
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
const OPEN_ID = process.env.OPEN_ID ?? "e5mSTU8bQbySZsknSun5f4";
const TAG = process.env.TAG ?? "now";

async function trpcGet(page: Page, proc: string, input: unknown) {
  return page.evaluate(
    async ({ proc, input, base }) => {
      const url = `${base}/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: input } }))}`;
      const body = await (await fetch(url)).json();
      if (body[0]?.error) throw new Error(JSON.stringify(body[0].error));
      return body[0].result.data.json;
    },
    { proc, input, base: baseUrl() }
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
  const first = await openAt(browser, laptop, OPEN_ID);
  await gotoRoute(first, "/");
  const found = await trpcGet(first, "bids.search", {
    text: "Bar layout check",
    archive: "live",
  });
  const bidId = found.items[0]?.id;
  if (!bidId) throw new Error("no Bar layout check bid");
  await first.context().close();
  for (const size of sizes) {
    const page = await openAt(browser, size, OPEN_ID);
    await gotoRoute(page, `/bids/${bidId}/plans`);
    await page.waitForTimeout(4000);
    const above = await page.evaluate(() => {
      const c = document.querySelector("[data-testid=plans-toolbar]");
      return c
        ? Math.round((c as HTMLElement).getBoundingClientRect().bottom)
        : -1;
    });
    const scale = await page
      .getByRole("button", { name: /scale/i })
      .first()
      .innerText()
      .catch(() => "(none)");
    console.log(
      `${size.name}: toolbar bottom ${above}px; scale control "${scale.replace(/\s+/g, " ")}"`
    );
    const tipTitle = await page
      .locator("[role=dialog], [data-plan-tip-card]")
      .first()
      .innerText()
      .catch(() => "(no tip)");
    console.log(
      `${size.name}: tip "${tipTitle.replace(/\s+/g, " ").slice(0, 90)}"`
    );
    await page.screenshot({ path: `${OUT}/${TAG}-plans-${size.name}.png` });
    const slim = page.getByTestId("slim-toolbar");
    if (await slim.isVisible().catch(() => false)) {
      await slim.click();
      await page.waitForTimeout(500);
      const top = await page.evaluate(() => {
        const c = document.querySelector("[data-testid=plans-toolbar]");
        return c
          ? Math.round((c as HTMLElement).getBoundingClientRect().bottom)
          : -1;
      });
      console.log(`${size.name}: SLIM toolbar bottom ${top}px`);
      await page.screenshot({
        path: `${OUT}/${TAG}-plans-slim-${size.name}.png`,
      });
      await slim.click();
    }
    await page.context().close();
  }
} finally {
  await browser.close();
}
