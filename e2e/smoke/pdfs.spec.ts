/**
 * HARD PLAN FILES (owner, 2026-10-15, item 4): scanned, turned pages, mixed
 * sizes, a huge vector sheet, one page, 500 pages, a password, a damaged
 * file, garbage behind a PDF header, a picture named .pdf — and an upload
 * that dies half way. Each either OPENS, or says in plain words what is
 * wrong and what to do; nothing spins for ever.
 */
import { expect, test, type Page } from "@playwright/test";
import { HARD } from "./hardPdfs";
import { createThrowawayBid, discardBid, openPlans, trpc } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 15_000 });

const bids: number[] = [];
test.afterAll(async ({ request }) => {
  for (const id of bids) await discardBid(request, id).catch(() => {});
});

async function upload(page: Page, name: string, buffer: Buffer) {
  const bidId = await createThrowawayBid(page.request, `pdf ${name}`);
  bids.push(bidId);
  await openPlans(page, bidId);
  await page.locator("input[type=file][accept*='pdf']").setInputFiles({
    name: `${name}.pdf`,
    mimeType: "application/pdf",
    buffer,
  });
  return bidId;
}

/** What the screen settles on: the drawing, or the words it shows. */
async function outcome(page: Page) {
  const drawn = page.locator("canvas.bg-white").first();
  const said = page
    .getByText(
      /could not|couldn't|can't|cannot|not a PDF|password|damaged|isn't|unreadable|failed/i
    )
    .filter({ visible: true })
    .first();
  await expect(drawn.or(said)).toBeVisible({ timeout: 60_000 });
  if (await drawn.isVisible()) return { opened: true, text: "" };
  return { opened: false, text: (await said.innerText()).trim() };
}

async function attachedSets(bidId: number, page: Page) {
  return trpc<{ id: number; pageCount: number }[]>(
    page.request,
    "bidPdfs.list",
    {
      bidId,
    }
  );
}
async function sheetCount(bidId: number, page: Page) {
  const sets = await attachedSets(bidId, page);
  if (sets.length === 0) return 0;
  const sheets = await trpc<unknown[]>(page.request, "bidPdfs.sheets", {
    bidPdfId: sets[0].id,
  });
  return sheets.length;
}
async function canvasShape(page: Page) {
  const b = await page.locator("canvas.bg-white").first().boundingBox();
  return b ? (b.width > b.height ? "wide" : "tall") : "none";
}

/** Opens: drawn, attached, every page a sheet. */
const OPENS: Array<[keyof typeof HARD, number, string]> = [
  ["onePage", 1, "wide"],
  ["rotated", 2, "tall"], // /Rotate 90: drawn turned, as a PDF app shows it
  ["mixedSizes", 4, "wide"],
  ["scanned", 1, "wide"],
  ["hugeVector", 1, "wide"],
  ["fiveHundred", 500, "wide"],
];
for (const [name, sheets, shape] of OPENS) {
  test(`opens: ${name} (${sheets} sheet${sheets === 1 ? "" : "s"})`, async ({
    page,
  }) => {
    const bidId = await upload(page, name, HARD[name]());
    const o = await outcome(page);
    expect(o, `${name} should open`).toEqual({ opened: true, text: "" });
    await expect
      .poll(() => sheetCount(bidId, page), { timeout: 60_000 })
      .toBe(sheets);
    expect(await canvasShape(page)).toBe(shape);
    if (name === "mixedSizes") {
      // Page 2 is letter, upright: drawn tall, not stretched to page 1's shape.
      await page.getByRole("button", { name: "Next sheet" }).first().click();
      await expect.poll(() => canvasShape(page)).toBe("tall");
    }
  });
}

/** Refused before upload: says what and what to do; nothing attaches. */
const REFUSED: Array<[keyof typeof HARD, RegExp, RegExp]> = [
  ["password", /is password-protected/, /without a password/],
  ["truncated", /is damaged or incomplete/, /print it to a new PDF/],
  ["garbage", /is damaged or incomplete/, /ask whoever sent it/],
  ["notPdf", /is not a PDF inside/, /Export a real PDF/],
];
for (const [name, title, fix] of REFUSED) {
  test(`refused, honestly: ${name}`, async ({ page }) => {
    const bidId = await upload(page, name, HARD[name]());
    await expect(
      page.getByText(title).filter({ visible: true }).first()
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(fix).filter({ visible: true }).first()
    ).toBeVisible();
    // Never "Retry": the same file would fail the same way.
    await expect(
      page.getByRole("button", { name: `Retry ${name}.pdf` })
    ).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(await attachedSets(bidId, page), "nothing was attached").toEqual([]);
  });
}

test("an upload whose direct send dies part way finishes by itself, once", async ({
  page,
}) => {
  // The direct PUT to storage drops; the screen falls back to sending
  // through our own server (planUploadTransport.postViaServer).
  let cut = false;
  await page.route(
    url => url.pathname.includes("bid-plans/"),
    async route => {
      if (route.request().method() === "PUT" && !cut) {
        cut = true;
        return route.abort("connectionreset");
      }
      return route.continue();
    }
  );
  const bidId = await upload(page, "cut", HARD.onePage());
  await expect(page.locator("canvas.bg-white").first()).toBeVisible({
    timeout: 60_000,
  });
  expect(cut, "the send really was cut").toBe(true);
  await expect
    .poll(() => attachedSets(bidId, page).then(s => s.length))
    .toBe(1);
  await page.waitForTimeout(2000);
  expect((await attachedSets(bidId, page)).length, "attached once").toBe(1);
});

test("an upload that fails both ways says so; Retry finishes it, once", async ({
  page,
}) => {
  let cuts = 0;
  const failBoth = async (route: import("@playwright/test").Route) => {
    const r = route.request();
    const isSend =
      (r.method() === "PUT" && r.url().includes("bid-plans/")) ||
      (r.method() === "POST" && r.url().includes("/api/plan-upload"));
    if (isSend && cuts < 2) {
      cuts += 1;
      return route.abort("connectionreset");
    }
    return route.continue();
  };
  await page.route("**/*", failBoth);
  const bidId = await upload(page, "cut2", HARD.onePage());
  const retry = page.getByRole("button", { name: "Retry cut2.pdf" });
  await expect(retry).toBeVisible({ timeout: 30_000 });
  expect(await attachedSets(bidId, page), "nothing attached yet").toEqual([]);
  await retry.click();
  await expect
    .poll(() => attachedSets(bidId, page).then(s => s.length), {
      timeout: 60_000,
    })
    .toBe(1);
  await page.waitForTimeout(2000);
  expect((await attachedSets(bidId, page)).length, "attached once").toBe(1);
  await page.unroute("**/*", failBoth);
});
