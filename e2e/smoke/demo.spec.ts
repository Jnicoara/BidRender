/**
 * DEMO vs NEW, made clear (owner item 6, 2026-10-15; status-and-scope-plan
 * § 1, § 2a): a set whose title says DEMOLITION is OFFERED its tag after
 * upload; the tag shows as a banner and makes marks there start as Remove;
 * the strip says "N new · N removed" and tapping a status highlights it.
 * View only: nothing on the bid moves when a sheet is tagged.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { buildPdf } from "./hardPdfs";
import { createThrowawayBid, discardBid, openPlans, trpc } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 15_000 });

const W = 2592;
const H = 1728;
const page1 = [
  { x: 600, y: 900 },
  { x: 900, y: 900 },
];
const page2 = [
  { x: 600, y: 900 },
  { x: 900, y: 900 },
  { x: 1200, y: 900 },
];
const sheet = (
  title: string,
  number: string,
  at: { x: number; y: number }[]
) => ({
  w: W,
  h: H,
  ops: [
    // In the title block (bottom right), where a sheet's title is read
    // from (shared/sheetTitleBlock.ts) — the project name repeats on every
    // sheet, the title does not.
    `BT /F1 14 Tf 2100 260 Td (CI DEMO PROJECT) Tj ET`,
    `BT /F1 20 Tf 2100 200 Td (${title.replace(/^E-\d+ /, "")}) Tj ET`,
    `BT /F1 48 Tf 2300 100 Td (${number}) Tj ET`,
    ...at.map(p => `${p.x - 14} ${p.y - 14} 28 28 re f`),
  ].join("\n"),
});

let page: Page;
let bidId: number;
let touch = false;

async function act(t: Locator) {
  if (touch) await t.tap();
  else await t.click();
}
async function placeAt(at: { x: number; y: number }) {
  const b = (await page.locator("canvas.bg-white").first().boundingBox())!;
  const s = b.width / W;
  const p = { x: b.x + at.x * s, y: b.y + (H - at.y) * s };
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function sheetsOf() {
  const plans = await trpc<{ id: number }[]>(page.request, "bidPdfs.list", {
    bidId,
  });
  return trpc<{ id: number; pageNumber: number; workTag: string | null }[]>(
    page.request,
    "bidPdfs.sheets",
    { bidPdfId: plans[0].id }
  );
}
async function statuses(pageNumber: number) {
  const s = (await sheetsOf()).find(x => x.pageNumber === pageNumber)!;
  const marks = await trpc<{ status: string | null }[]>(
    page.request,
    "takeoffStamps.listForSheet",
    { sheetId: s.id }
  );
  return marks.map(m => m.status ?? "new").sort();
}

test.beforeAll(async ({ browser }, info) => {
  touch = Boolean(info.project.use.hasTouch);
  page = await browser.newPage();
  bidId = await createThrowawayBid(page.request, `demo ${info.project.name}`);
  await openPlans(page, bidId);
});
test.afterAll(async () => {
  if (bidId) await discardBid(page.request, bidId).catch(() => {});
  await page.close();
});

test("a demolition title is OFFERED its tag after upload; nothing is tagged until tapped", async () => {
  await page.locator("input[type=file][accept*='pdf']").setInputFiles({
    name: "demo-set.pdf",
    mimeType: "application/pdf",
    buffer: buildPdf([
      sheet("E-101 DEMOLITION PLAN", "E-101", page1),
      sheet("E-201 POWER PLAN", "E-201", page2),
    ]),
  });
  const offer = page.getByText(/is a demolition sheet\. Tag it/).first();
  await expect(offer).toBeVisible({ timeout: 60_000 });
  await expect(offer).toContainText("E-101");
  expect((await sheetsOf()).map(s => s.workTag)).toEqual([null, null]);
  const linesBefore = await trpc<{ lines: unknown[] }>(
    page.request,
    "bids.get",
    {
      id: bidId,
    }
  );
  await act(page.getByRole("button", { name: "Use these tags" }));
  await expect
    .poll(async () => (await sheetsOf()).map(s => s.workTag))
    .toEqual(["demo", null]);
  await expect(offer).toBeHidden();
  // The banner says what the sheet is.
  await expect(
    page.getByText(/DEMO SHEET — marks placed here start as Remove/).first()
  ).toBeVisible();
  // View only: the bid did not move.
  const linesAfter = await trpc<{ lines: unknown[] }>(
    page.request,
    "bids.get",
    {
      id: bidId,
    }
  );
  expect(linesAfter.lines).toEqual(linesBefore.lines);
});

test("marks on the demo sheet start as Remove; on new work, as new", async () => {
  // The toolbar's Count tool by its exact name — `/^Count/` also matched the
  // step bar's "Count" above it, which came first (2026-10-16).
  await act(page.getByRole("button", { name: "Count", exact: true }).first());
  await page
    .getByPlaceholder("Search, or type anything to count it…")
    .fill("Demo receptacle");
  await page.keyboard.press("Enter");
  for (const at of page1) await placeAt(at);
  await expect.poll(() => statuses(1)).toEqual(["remove", "remove"]);
  await act(page.getByRole("button", { name: "Next sheet" }).first());
  await page.waitForTimeout(1500);
  await act(page.getByRole("button", { name: /^Again: |again$/ }).first());
  for (const at of page2) await placeAt(at);
  await expect.poll(() => statuses(2)).toEqual(["new", "new", "new"]);
});

test("the strip says '3 new · 2 removed'; tapping removed highlights it", async () => {
  const armed = page.getByRole("button", { name: /^Counting / }).first();
  if (await armed.isVisible().catch(() => false)) await act(armed);
  await expect(page.getByText(/3 new/).first()).toBeVisible();
  await expect(page.getByText(/2 removed/).first()).toBeVisible();
  // On this (new-work) sheet, tapping "removed" dims its new marks.
  const opacityOfNew = () =>
    page
      .locator("[data-mark]:not([data-mark=pending])")
      .first()
      .getAttribute("opacity");
  const before = Number((await opacityOfNew()) ?? 1);
  await act(page.getByRole("button", { name: /removed/ }).first());
  await expect
    .poll(async () => Number((await opacityOfNew()) ?? 1))
    .toBeLessThan(before);
});
