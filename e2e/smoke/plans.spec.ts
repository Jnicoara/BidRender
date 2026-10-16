/**
 * THE PLANS SCREEN, TOOL BY TOOL — references/plans-test-map.md.
 *
 * One throwaway bid per project, with its own generated plan set
 * (deepPlan.ts), and every tool on it driven the way a person drives it:
 * with a MOUSE on the laptop project and with a FINGER (taps) on the phone
 * and both iPad projects. Each step reads its answer back from the server
 * where there is one — a screen can look right and have saved nothing.
 *
 * Every test here was run once against a deliberately broken app and seen
 * to fail; the map names the break.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DEEP,
  DEEP_DIMENSION,
  DEEP_PAGE,
  DEEP_TEXT,
  TRACE_FEET,
  buildDeepPlan,
} from "./deepPlan";
import {
  createThrowawayBid,
  discardBid,
  openPlans,
  sweepLeftovers,
  thisSheetLine,
  trpc,
} from "./helpers";

test.describe.configure({ mode: "serial" });
// A missing control fails in 15 s with its name, not after the 3-minute test.
test.use({ actionTimeout: 15_000 });

let page: Page;
let bidId: number;
let touch = false;
/** The phone layout: one bar under the drawing, panels in a bottom sheet. */
let phone = false;

type Sheet = {
  id: number;
  pageNumber: number;
  scaleText: string | null;
  scaleSource: string | null;
};
type Mark = {
  id: number;
  x: number | string;
  y: number | string;
  groupId: number | null;
};

/** Click with a mouse, tap with a finger. */
async function act(target: Locator) {
  if (touch) await target.tap();
  else await target.click();
}

/** The open sheet's drawing, and a PDF point on it. */
function canvas() {
  return page.locator("canvas.bg-white").first();
}
async function point(at: { x: number; y: number }) {
  const box = await canvas().boundingBox();
  if (!box) throw new Error("the sheet is not drawn");
  const s = box.width / DEEP_PAGE.width;
  return { x: box.x + at.x * s, y: box.y + (DEEP_PAGE.height - at.y) * s };
}
async function placeAt(at: { x: number; y: number }) {
  const p = await point(at);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

async function sheets(): Promise<Sheet[]> {
  const plans = await trpc<{ id: number }[]>(page.request, "bidPdfs.list", {
    bidId,
  });
  return trpc<Sheet[]>(page.request, "bidPdfs.sheets", {
    bidPdfId: plans[0].id,
  });
}
async function sheetOn(n: number) {
  const s = (await sheets()).find(x => x.pageNumber === n);
  if (!s) throw new Error(`no sheet on page ${n}`);
  return s;
}
async function marksOn(n: number): Promise<Mark[]> {
  return trpc<Mark[]>(page.request, "takeoffStamps.listForSheet", {
    sheetId: (await sheetOn(n)).id,
  });
}
async function marksOnLine(): Promise<number> {
  const t = await thisSheetLine(page).innerText();
  return Number(t.match(/(\d+) marks?/)?.[1] ?? NaN);
}

/** The phone keeps panels in a bottom sheet; open it when asked for. */
const openPanelButton = () =>
  page.getByRole("button", {
    name: "Open the panel: counts, runs, sheets and totals",
  });
async function showPanel() {
  if (await openPanelButton().isVisible()) await act(openPanelButton());
}
async function hidePanel() {
  const done = page.getByRole("button", { name: "Done" });
  if (await done.isVisible().catch(() => false)) await act(done);
  const back = page.getByRole("button", { name: /^Plan$/ });
  if (await back.isVisible().catch(() => false)) await act(back);
}
async function tab(name: string) {
  await showPanel();
  await act(page.getByRole("tab", { name }));
}

/** Go to a page by the Next / Previous buttons. */
async function goToPage(n: number) {
  for (let i = 0; i < 5; i++) {
    const chip = await page
      .getByRole("button", { name: /\d+\/3/ })
      .first()
      .innerText();
    const at = Number(chip.match(/(\d+)\/3/)?.[1]);
    if (at === n) return;
    await act(
      page
        .getByRole("button", {
          name: at < n ? "Next sheet" : "Previous sheet",
        })
        .first()
    );
    await page.waitForTimeout(800);
  }
  throw new Error(`could not reach page ${n}`);
}

test.beforeAll(async ({ browser }, info) => {
  const use = info.project.use;
  touch = Boolean(use.hasTouch);
  phone = (use.viewport?.width ?? 1440) <= 768;
  page = await browser.newPage();
  await sweepLeftovers(page.request);
  bidId = await createThrowawayBid(page.request, `plans ${info.project.name}`);
  await openPlans(page, bidId);
  const attached = page.waitForResponse(
    r => r.url().includes("bidPdfs.confirmAttach") && r.ok(),
    { timeout: 120_000 }
  );
  await page.locator("input[type=file][accept*='pdf']").setInputFiles({
    name: "ci-deep-plan.pdf",
    mimeType: "application/pdf",
    buffer: buildDeepPlan(),
  });
  await attached;
  await expect(canvas()).toBeVisible({ timeout: 90_000 });
});

test.afterAll(async () => {
  if (bidId) await discardBid(page.request, bidId).catch(() => {});
  await page.close();
});

/** Put the armed count down, so a click on the drawing selects. */
async function putCountDown() {
  const armed = page.getByRole("button", { name: /^Counting / }).first();
  if (await armed.isVisible().catch(() => false)) await act(armed);
  await expect(armed).toBeHidden();
}

test("sheets: three, numbered from their title blocks; Next and Previous switch", async () => {
  await expect
    .poll(async () => (await sheets()).length, { timeout: 30_000 })
    .toBe(3);
  await goToPage(2);
  await expect(page.getByText(/E-202/).first()).toBeVisible();
  await goToPage(1);
  await expect(page.getByText(/E-201/).first()).toBeVisible();
});

test("scale: the printed scale is OFFERED, never applied; Use it sets it", async () => {
  // Viewing applies nothing (owner Q19).
  expect((await sheetOn(1)).scaleText).toBeNull();
  if (phone) {
    // The phone shows the scale only while tracing.
    await act(page.getByRole("button", { name: /More tools|Tools/ }).first());
    await act(page.getByRole("menuitem", { name: /^Trace/ }).first());
  }
  const offer = page.getByRole("button", { name: /Use 1\/4" = 1'-0"/ }).first();
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await act(offer);
  await expect
    .poll(async () => (await sheetOn(1)).scaleText)
    .toBe(`1/4" = 1'-0"`);
  if (phone) await page.keyboard.press("Escape");
});

test("count: type a name, mark three, the server holds three where they were put", async () => {
  await act(page.getByRole("button", { name: /^Count/ }).first());
  await page
    .getByPlaceholder("Search, or type anything to count it…")
    .fill("Deep receptacle");
  await page.keyboard.press("Enter");
  for (const at of DEEP.sheet1) await placeAt(at);
  await expect.poll(async () => (await marksOn(1)).length).toBe(3);
  const saved = (await marksOn(1))
    .map(m => ({ x: Number(m.x), y: Number(m.y) }))
    .sort((a, b) => a.x - b.x);
  // Stored in PDF points, y down from the top: within 2 pt of the symbols.
  DEEP.sheet1.forEach((s, i) => {
    expect(Math.abs(saved[i].x - s.x)).toBeLessThan(2);
    expect(Math.abs(saved[i].y - (DEEP_PAGE.height - s.y))).toBeLessThan(2);
  });
  await expect.poll(marksOnLine).toBe(3);
  await putCountDown();
});

test("undo and redo a mark", async () => {
  // Back into the same count: "Again" (a typed name already in use is
  // refused on purpose — StampPicker).
  await act(
    page
      .getByRole("button", { name: /Again|Count Deep receptacle again/ })
      .first()
  );
  await placeAt({ x: 1000, y: 700 });
  await expect.poll(async () => (await marksOn(1)).length).toBe(4);
  await putCountDown();
  await act(page.getByRole("button", { name: /^Undo: / }).first());
  await expect.poll(async () => (await marksOn(1)).length).toBe(3);
  if (phone) {
    await act(page.getByRole("button", { name: /More tools|Tools/ }).first());
    await act(page.getByRole("menuitem", { name: /^Redo/ }).first());
  } else {
    await act(page.getByRole("button", { name: /^Redo: / }).first());
  }
  await expect.poll(async () => (await marksOn(1)).length).toBe(4);
  // Back to three for the steps after this one.
  await act(page.getByRole("button", { name: /^Undo: / }).first());
  await expect.poll(async () => (await marksOn(1)).length).toBe(3);
});

test("select two marks and delete them; Undo puts both back where they were", async () => {
  const before = (await marksOn(1)).map(m => `${m.x},${m.y}`).sort();
  if (touch) {
    if (phone) {
      await act(page.getByRole("button", { name: /More tools|Tools/ }).first());
      await act(
        page.getByRole("menuitem", { name: "Select several marks" }).first()
      );
    } else {
      await act(page.getByRole("button", { name: /^Select$/ }).first());
    }
    await placeAt(DEEP.sheet1[0]);
    await placeAt(DEEP.sheet1[1]);
  } else {
    await placeAt(DEEP.sheet1[0]);
    const p = await point(DEEP.sheet1[1]);
    await page.keyboard.down("Shift");
    await page.mouse.click(p.x, p.y);
    await page.keyboard.up("Shift");
  }
  await expect(page.getByText(/^2 marks selected/).first()).toBeVisible();
  await act(
    page
      .getByRole("status")
      .getByRole("button", { name: /^Delete/ })
      .first()
  );
  await expect.poll(async () => (await marksOn(1)).length).toBe(1);
  await act(page.getByRole("button", { name: /^Undo: / }).first());
  await expect
    .poll(async () => (await marksOn(1)).map(m => `${m.x},${m.y}`).sort())
    .toEqual(before);
  await page.keyboard.press("Escape");
});

test("Just count: marks land in Unassigned; Pick what they are names them all", async () => {
  await act(page.getByRole("button", { name: /^Count/ }).first());
  await act(page.getByRole("button", { name: /Just count/ }).first());
  await placeAt({ x: 1000, y: 500 });
  await placeAt({ x: 1100, y: 500 });
  await expect.poll(async () => (await marksOn(1)).length).toBe(5);
  await putCountDown();
  await tab("Counts");
  await expect(page.getByText(/^Unassigned$/).first()).toBeVisible();
  await act(page.getByRole("button", { name: /Pick what they are/ }).first());
  await page.getByPlaceholder("Search assemblies…").first().fill("Deep switch");
  await act(page.getByRole("button", { name: /Call them/ }).first());
  await expect(page.getByText(/^Deep switch$/).first()).toBeVisible();
  const proposal = await trpc<{ unassignedMarks: number }>(
    page.request,
    "proposals.document",
    { bidId }
  );
  expect(proposal.unassignedMarks).toBe(0);
  await hidePanel();
});

test("drops: a count's marks get a drop, saved on the count", async () => {
  await tab("Counts");
  const card = page
    .locator("[data-count-card]")
    .filter({ hasText: "Deep receptacle" })
    .first();
  await act(card.getByRole("button", { name: "Add a drop to each one" }));
  // The first height type after "no drop" and "at run height".
  const pick = card.getByLabel("What each mark drops to");
  const value = await pick.locator("option").nth(2).getAttribute("value");
  await pick.selectOption(value!);
  await expect
    .poll(async () => {
      const { groups } = await trpc<{
        groups: { label: string; drop: { dropKind: string | null } }[];
      }>(page.request, "takeoffGroups.list", { bidId });
      return groups.find(g => g.label === "Deep receptacle")?.drop.dropKind;
    })
    .toBe(value);
  await hidePanel();
});

test("trace: two points and Finish make one run of the right length", async () => {
  if (phone) {
    await act(page.getByRole("button", { name: /More tools|Tools/ }).first());
    await act(page.getByRole("menuitem", { name: /^Trace/ }).first());
  } else {
    await act(page.getByRole("button", { name: /^Trace conduit/ }).first());
  }
  await placeAt(DEEP.traceFrom);
  await placeAt(DEEP.traceTo);
  await act(page.getByRole("button", { name: /^Finish/ }).first());
  await expect
    .poll(async () => {
      const t = await thisSheetLine(page).innerText();
      return Number(t.match(/([\d.]+) ft of runs?/)?.[1] ?? NaN);
    })
    .toBeCloseTo(TRACE_FEET, 0);
});

test("layers: None hides this sheet's marks, All shows them again", async () => {
  await showPanel();
  await act(page.getByRole("button", { name: /^Layers/ }).first());
  await act(page.getByRole("button", { name: /^None$/ }).first());
  await expect(page.getByText(/\d+ hidden/).first()).toBeVisible();
  await expect(
    page.getByText(/Showing part of this sheet/).first()
  ).toBeVisible();
  await act(page.getByRole("button", { name: /^All$/ }).first());
  await expect(page.getByText(/\d+ hidden/)).toHaveCount(0);
  await act(page.getByRole("button", { name: /^Layers/ }).first());
  await hidePanel();
});

test("detail link: tap 2/E-202, go to it, and Back returns", async () => {
  const link = page.getByRole("button", {
    name: /^Detail 2 on E-?202: go to it/,
  });
  await expect(link.first()).toBeAttached({ timeout: 30_000 });
  await act(link.first());
  await act(page.getByRole("button", { name: /^Go to detail 2/ }).first());
  await expect
    .poll(
      async () =>
        (
          await page
            .getByRole("button", { name: /\d+\/3/ })
            .first()
            .innerText()
        ).match(/(\d+)\/3/)?.[1]
    )
    .toBe("2");
  await act(page.getByRole("button", { name: /^Back to / }).first());
  await expect
    .poll(
      async () =>
        (
          await page
            .getByRole("button", { name: /\d+\/3/ })
            .first()
            .innerText()
        ).match(/(\d+)\/3/)?.[1]
    )
    .toBe("1");
});

test("note tag: tap the boxed 1 and read note 1", async () => {
  const tag = page.getByRole("button", { name: /^Note 1: read it/ });
  await expect(tag.first()).toBeAttached({ timeout: 30_000 });
  await act(tag.first());
  await expect(page.getByRole("dialog", { name: /Note 1/ })).toContainText(
    DEEP_TEXT.noteOne
  );
  await page.keyboard.press("Escape");
});

test("Look up: an abbreviation and the symbol guide", async () => {
  await tab("Legend");
  const box = page.getByPlaceholder(/Look up a word or symbol/).first();
  await box.fill("WP");
  await expect(page.getByText(/Usually means/).first()).toBeVisible();
  await expect(page.getByText(/weatherproof/i).first()).toBeVisible();
  await box.fill("duplex");
  await expect(page.getByText(/What it looks like/).first()).toBeVisible();
  await box.fill("");
  await hidePanel();
});

test("homeruns: the arrow tagged A-1,3 is read off the sheet (not on a phone)", async () => {
  test.skip(phone, "Homeruns are not offered on a phone");
  const toggle = page.getByRole("button", { name: /^Homeruns/ }).first();
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await act(toggle);
  await expect(
    page.locator('[aria-label="Homeruns"]').getByText(/A-1,3/).first()
  ).toBeAttached();
  await act(toggle);
});

test("heights: set the job's run height (not on a phone)", async () => {
  test.skip(phone, "The heights chip is not on a phone");
  await act(
    page.getByRole("button", { name: /Drop heights not set|Runs at/ }).first()
  );
  await act(page.getByRole("button", { name: /^Set$/ }).first());
  await page.getByLabel("Distribution height feet").first().fill("10");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: /Runs at 10/ }).first()
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test('scale may be wrong: 1/8" against a 1/4" title and 36" doors; Use it puts it back', async () => {
  test.skip(phone, "The scale chip shows on a phone only while tracing");
  const sheet = await sheetOn(1);
  await trpc(
    page.request,
    "bidPdfs.setSheetScale",
    { id: sheet.id, scaleText: `1/8" = 1'-0"` },
    true
  );
  await page.reload();
  await expect(canvas()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Scale may be wrong/).first()).toBeVisible({
    timeout: 30_000,
  });
  await act(page.getByRole("button", { name: /^Use it$/ }).first());
  await expect
    .poll(async () => (await sheetOn(1)).scaleText)
    .toBe(`1/4" = 1'-0"`);
});

test("scale check: a printed 20' dimension finds a wrong scale; the offer fixes it", async () => {
  // Sheet 2 set WRONG (1/8") on purpose; its 20'-0" dimension says 1/4".
  await goToPage(2);
  const sheet = await sheetOn(2);
  await trpc(
    page.request,
    "bidPdfs.setSheetScale",
    { id: sheet.id, scaleText: `1/8" = 1'-0"` },
    true
  );
  await page.reload();
  await expect(canvas()).toBeVisible({ timeout: 90_000 });
  await goToPage(2);
  if (phone) {
    // The phone shows the scale only while tracing.
    await act(page.getByRole("button", { name: /More tools|Tools/ }).first());
    await act(page.getByRole("menuitem", { name: /^Trace/ }).first());
  }
  await act(page.getByRole("button", { name: /^Check it$/ }).first());
  await placeAt(DEEP_DIMENSION.from);
  await placeAt(DEEP_DIMENSION.to);
  await page.locator("#calibrate-check").fill(DEEP_DIMENSION.says);
  // Warned, and offered — nothing changed yet.
  await expect(
    page.getByText(/Off by|too (long|short)|half|double/i).first()
  ).toBeVisible();
  expect((await sheetOn(2)).scaleText).toBe(`1/8" = 1'-0"`);
  const offer = page.getByRole("button", {
    name: /Use 1\/4" = 1'-0" — what this dimension says/,
  });
  await act(offer.first());
  await expect
    .poll(async () => {
      const s = (await sheets()).find(x => x.pageNumber === 2) as Sheet & {
        scaleRatio?: number | string | null;
      };
      return Math.round(Number(s.scaleRatio) * 1000) / 1000;
    })
    .toBe(48);
  // The same dimension, checked again at the new scale: it agrees now.
  await expect(
    page.getByText(/Agrees — the scale checks out/).first()
  ).toBeVisible();
  await page.keyboard.press("Escape");
  if (phone) await page.keyboard.press("Escape");
  await goToPage(1);
});

test("sheet cards: each page shows its number and title", async () => {
  if (phone || touch) await tab("Sheets").catch(() => undefined);
  for (const n of ["E-201", "E-202", "E-001"])
    await expect(
      page.getByRole("button").filter({ hasText: n }).first()
    ).toBeVisible();
  await hidePanel();
});
