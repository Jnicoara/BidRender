/**
 * The staging recheck list, run by a browser instead of a person.
 *
 * One throwaway bid, walked through in order; each `test` is one recheck
 * item, so a red run names the item that broke. Serial on purpose: later
 * steps stand on what earlier ones made, and a failure stops the walk rather
 * than reporting ten consequences of one fault.
 *
 * Never presses an AI button — staging spends real money on every call.
 */
import { expect, test, type Page } from "@playwright/test";
import { SYMBOLS } from "./fixturePlan";
import {
  createThrowawayBid,
  discardBid,
  dragBox,
  openPlans,
  placeAt,
  sweepLeftovers,
  thisSheetLine,
  trpc,
  uploadFixturePlan,
} from "./helpers";

const ASSEMBLY = "Duplex receptacle standard";

type BidLine = {
  name?: string;
  qty?: string | number;
  snapshotMaterialCost?: string | number | null;
  snapshotLaborHours?: string | number | null;
};

test.describe.configure({ mode: "serial" });

let page: Page;
let bidId: number;
let emptyBidId: number;

/** "This sheet: N marks · …" → N */
async function marksOnSheet(): Promise<number> {
  const text = await thisSheetLine(page).innerText();
  return Number(text.match(/(\d+) marks?/)?.[1] ?? NaN);
}

async function bidLines(): Promise<BidLine[]> {
  const bid = await trpc<{ lines: BidLine[] }>(page.request, "bids.get", {
    id: bidId,
  });
  return bid.lines;
}

async function armFromLegend(name: string) {
  await page.getByRole("tab", { name: "Legend" }).click();
  // Case-insensitive: after "Reset to original" CI DUPLEX reads "ci duplex".
  await page
    .getByText(new RegExp(`^${name}$`, "i"))
    .first()
    .click();
  // KNOWN GAP (found by this test, 2026-10-01): a by-name count is created on
  // the server first, and clicks on the drawing before that reply are taken
  // as plain clicks — measured, 0 of 3 and 2 of 3 marks kept, nothing said.
  // Wait for the "Counting …" bar a person would see before clicking.
  await expect(
    page.getByText(new RegExp(`^Counting ${name}`, "i")).first()
  ).toBeVisible();
}

/** A bid line by name, ignoring case for the same reason. */
function lineNamed(lines: BidLine[], name: string) {
  return lines.find(l => l.name?.toLowerCase() === name.toLowerCase());
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // Count print() calls instead of opening a print dialog.
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: number; print: () => void };
    w.__printed = 0;
    w.print = () => {
      w.__printed += 1;
    };
  });
  bidId = await createThrowawayBid(page.request, "flow");
  emptyBidId = await createThrowawayBid(page.request, "empty");
});

test.afterAll(async () => {
  for (const id of [bidId, emptyBidId]) {
    if (id) await discardBid(page.request, id).catch(() => {});
  }
  await sweepLeftovers(page.request);
  await page.close();
});

test("1. an empty bid's proposal says so, and Print is blocked", async () => {
  await page.goto(`/#/bids/${emptyBidId}/proposal`);
  await expect(page.getByText("No work added yet").first()).toBeVisible({
    timeout: 60_000,
  });
  await page.keyboard.press("Control+p");
  await expect(page.getByText("Add work before sending").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __printed: number }).__printed
    )
  ).toBe(0);
});

test("2. a plan uploads; the right panel is tabs; the scale is read off the sheet", async () => {
  await openPlans(page, bidId);
  await uploadFixturePlan(page);
  for (const tab of ["Counts", "Runs", "Legend", "Totals"]) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  }
  await expect(page.getByText(/^1\/2$/).first()).toBeVisible(); // sheet 1 of 2
  // KNOWN GAP (found by this test, 2026-10-01): a fresh upload shows sheet 1
  // before its sheet rows exist, so `handleSheetVisible` (TakeoffPage.tsx)
  // skips scale detection and waits for "the next time it is shown". A person
  // sees "Set scale" on a sheet with a printed scale until they flip away and
  // back. This walks the same way round; when the gap is fixed, delete the
  // two flips and the scale must still appear.
  await page.getByRole("button", { name: "Next sheet" }).click();
  await expect(page.getByText(/^2\/2$/).first()).toBeVisible();
  await page.getByRole("button", { name: "Previous sheet" }).click();
  await expect(page.getByText(`1/4" = 1'-0"`).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("3. symbols capture; a rename sticks and can be reset", async () => {
  await page.getByRole("tab", { name: "Legend" }).click();
  for (const [name, at] of [
    ["CI DUPLEX", SYMBOLS.legendDuplex],
    ["CI SWITCH", SYMBOLS.legendSwitch],
  ] as const) {
    await page
      .getByRole("button", { name: /Capture/ })
      .first()
      .click();
    await dragBox(
      page,
      { x: at.x - 30, y: at.y + 30 },
      { x: at.x + 30, y: at.y - 30 }
    );
    const nameBox = page.locator("input:visible").last();
    await nameBox.fill(name);
    await page.getByRole("button", { name: "Save symbol" }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "Rename CI DUPLEX" }).click();
  const box = page.locator("input:visible").last();
  await box.fill("CI DUPLEX RENAMED");
  await box.press("Enter");
  await expect(
    page.getByText("CI DUPLEX RENAMED", { exact: true })
  ).toBeVisible();
  // "Reset to original" lives inside the rename box, under the field.
  await page.getByRole("button", { name: "Rename CI DUPLEX RENAMED" }).click();
  await page.getByRole("button", { name: /Reset to original/ }).click();
  await expect(
    page.getByText("CI DUPLEX RENAMED", { exact: true })
  ).toHaveCount(0);
  // Reset restores the captured name's KEY, so capitals may differ (todo.md).
  await expect(page.getByText(/^ci duplex$/i).first()).toBeVisible();
});

test("4. 8a: a legend click counts with no assembly; Link assembly keeps every mark", async () => {
  await armFromLegend("CI DUPLEX");
  for (const at of SYMBOLS.duplex) await placeAt(page, at);
  await expect.poll(marksOnSheet).toBe(3);

  await page.getByRole("tab", { name: "Counts" }).click();
  await expect(page.getByText("3 placed").first()).toBeVisible();
  await page.getByRole("button", { name: "Link assembly…" }).first().click();
  await page
    .getByPlaceholder("Search assemblies…")
    .fill(ASSEMBLY.toLowerCase());
  await page
    .getByRole("button", { name: new RegExp(ASSEMBLY) })
    .first()
    .click();
  await expect.poll(marksOnSheet).toBe(3);
});

test("5. a second symbol on the SAME assembly keeps its own count", async () => {
  await page.getByRole("tab", { name: "Legend" }).click();
  await page
    .getByRole("button", { name: "Link CI SWITCH to an assembly" })
    .click();
  await page
    .getByPlaceholder("Search assemblies…")
    .fill(ASSEMBLY.toLowerCase());
  await page
    .getByRole("button", { name: new RegExp(ASSEMBLY) })
    .first()
    .click();

  await armFromLegend("CI SWITCH");
  for (const at of SYMBOLS.switch) await placeAt(page, at);
  await expect.poll(marksOnSheet).toBe(6);
  await expect(thisSheetLine(page)).toContainText("2 items");
});

test("6. 'not on the bid yet' is amber and grouped; Send all sends once", async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Totals" }).click();
  const notOnBid = page.getByText(/^Not on the bid yet — \d+$/).first();
  await expect(notOnBid).toBeVisible();
  await expect(notOnBid).toHaveText("Not on the bid yet — 2");
  await expect(page.getByText("Counted, not sent yet").first()).toBeVisible();

  await page.getByRole("button", { name: /^Send 2 to bid…$/ }).click();
  await expect(page.getByText("Send 2 to the bid?")).toBeVisible();
  await page.getByRole("button", { name: /^Send 2 to bid$/ }).click();
  await expect.poll(async () => (await bidLines()).length).toBe(2);

  const lines = await bidLines();
  const duplex = lineNamed(lines, "CI DUPLEX");
  const sw = lineNamed(lines, "CI SWITCH");
  expect(Number(duplex?.qty)).toBe(3);
  expect(Number(sw?.qty)).toBe(3);
  // Same assembly, so the same frozen unit price on both lines.
  expect(duplex?.snapshotLaborHours).toEqual(sw?.snapshotLaborHours);
  expect(duplex?.snapshotMaterialCost).toEqual(sw?.snapshotMaterialCost);

  // Nothing left to send, and sending again adds no line.
  await expect(page.getByText(/^Not on the bid yet/)).toHaveCount(0);
  const { groups } = await trpc<{ groups: { id: number }[] }>(
    page.request,
    "takeoffGroups.list",
    {
      bidId,
    }
  );
  for (const g of groups) {
    // A second send is refused in words ("…is already on the bid"), not doubled.
    const again = await trpc(
      page.request,
      "takeoffGroups.sendToBid",
      { id: g.id },
      true
    ).then(
      () => null,
      (e: Error) => e
    );
    expect(again?.message ?? "sent a second time").toMatch(
      /already on the bid/
    );
  }
  expect((await bidLines()).length).toBe(2);
});

test("7. a sheet switch puts the count down; pins wait for their own page", async () => {
  await armFromLegend("CI DUPLEX");

  // Slow the CPU so the switch is wide enough to watch, then record every
  // frame: the "Drawing sheet" bar must show, and marks must never be drawn
  // while it does — that would be sheet 1's pins over sheet 2.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  await page.evaluate(() => {
    const w = window as unknown as {
      __frames: { bar: boolean; marks: number }[];
      __stop: boolean;
    };
    w.__frames = [];
    w.__stop = false;
    const tick = () => {
      const bar = !!document.querySelector(
        '[role="status"][aria-label^="Drawing sheet"]'
      );
      const canvas = document.querySelector("canvas.bg-white");
      const marks = canvas?.parentElement
        ? canvas.parentElement.querySelectorAll("svg").length
        : 0;
      w.__frames.push({ bar, marks });
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole("button", { name: "Next sheet" }).click();
  await expect(page.getByText(/^2\/2$/).first()).toBeVisible();
  await expect(
    page.locator('[role="status"][aria-label^="Drawing sheet"]')
  ).toHaveCount(0, {
    timeout: 60_000,
  });
  const frames = await page.evaluate(() => {
    const w = window as unknown as {
      __frames: { bar: boolean; marks: number }[];
      __stop: boolean;
    };
    w.__stop = true;
    return w.__frames;
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(
    frames.some(f => f.bar),
    "the loading bar never showed"
  ).toBe(true);
  expect(
    frames.filter(f => f.bar && f.marks > 0).length,
    "marks were drawn while the next sheet was still drawing"
  ).toBe(0);

  // The count was put down: a click on the drawing adds nothing.
  await expect(
    page.getByRole("button", { name: /^Count .* again$/ })
  ).toBeVisible();
  await placeAt(page, SYMBOLS.sheet2Duplex[0]);
  await page.waitForTimeout(800);
  expect(await marksOnSheet()).toBe(0);
});

test("8. R and the Again button put the last count back", async () => {
  await page.keyboard.press("r");
  await placeAt(page, SYMBOLS.sheet2Duplex[0]);
  await expect.poll(marksOnSheet).toBe(1);

  await page.getByRole("button", { name: "Previous sheet" }).click();
  await expect(page.getByText(/^1\/2$/).first()).toBeVisible();
  await page.getByRole("button", { name: /^Count .* again$/ }).click();
  await placeAt(page, { x: 1350, y: 900 }); // an empty spot
  await expect.poll(marksOnSheet).toBe(7);
  await page.keyboard.press("Escape");
});

test("9. a refresh keeps the sheet and the zoom", async () => {
  await page.getByRole("button", { name: "Next sheet" }).click();
  await expect(page.getByText(/^2\/2$/).first()).toBeVisible();
  const zoomIn = page
    .locator("button")
    .filter({ has: page.locator("svg.lucide-plus") })
    .first();
  await zoomIn.click();
  await zoomIn.click();
  const zoomText = page.getByText(/^\d+%$/).first();
  const before = await zoomText.innerText();
  await page.reload();
  await expect(page.getByText(/^2\/2$/).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/^\d+%$/).first()).toHaveText(before);
});

test("10. undo and redo a mark; delete one and Undo brings it back", async () => {
  await armFromLegend("CI DUPLEX");
  const start = await marksOnSheet();
  await placeAt(page, SYMBOLS.sheet2Duplex[1]);
  await expect.poll(marksOnSheet).toBe(start + 1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(marksOnSheet).toBe(start);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(marksOnSheet).toBe(start + 1);

  // Select the mark just placed and delete it from the toolbar.
  await placeAt(page, SYMBOLS.sheet2Duplex[1]);
  await page
    .getByRole("button", { name: /^Delete$/ })
    .first()
    .click();
  await expect.poll(marksOnSheet).toBe(start);
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect.poll(marksOnSheet).toBe(start + 1);
});

test("11. a traced run measures right; deleting it asks first and Enter does not delete", async () => {
  await page.getByRole("button", { name: "Previous sheet" }).click();
  await expect(page.getByText(/^1\/2$/).first()).toBeVisible();
  // Labelled "Trace conduit: <run type>" since the device work (2026-10-01).
  await page.getByRole("button", { name: /^Trace conduit/ }).click();
  await placeAt(page, { x: 450, y: 1000 });
  await placeAt(page, { x: 1450, y: 1000 });
  const end = await (
    await import("./helpers")
  ).sheetPoint(page, { x: 1450, y: 600 });
  await page.mouse.dblclick(end.x, end.y);
  // 1,000 pt + 400 pt = 1,400 pt = 19.444 in on paper; at 1/4" = 1'-0", 77.78 ft.
  await page.getByRole("tab", { name: "Runs" }).click();
  await expect(page.getByText("77.78 ft").first()).toBeVisible();

  // Finishing a trace selects the run; the toolbar's Delete then reads
  // "Delete run". Only if it is not selected, click its line to select it —
  // a click on a selected run would toggle it off.
  // The Escape and the selection settle asynchronously, so check-and-click
  // until "Delete run" is offered rather than reading the state once.
  await page.keyboard.press("Escape");
  const deleteRun = page.getByRole("button", { name: /^Delete run$/ }).first();
  await expect(async () => {
    if (!(await deleteRun.isVisible()))
      await placeAt(page, { x: 950, y: 1000 });
    await expect(deleteRun).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await deleteRun.click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText(/Delete run .*ft\?/);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await expect(page.getByText("77.78 ft").first()).toBeVisible();
  if (await ask.isVisible())
    await ask.getByRole("button", { name: "Cancel" }).click();
});

test("12. Clear this sheet names the feet, and one Ctrl+Z puts it all back", async () => {
  await page.keyboard.press("Escape");
  const marks = await marksOnSheet();
  await page.getByRole("button", { name: "More for this sheet" }).click();
  await page
    .getByRole("menuitem", { name: /Clear all marks and runs/ })
    .click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText(/ft/);
  // The one button names what goes: "Remove 9 items".
  await ask.getByRole("button", { name: /^Remove \d+ items?$/ }).click();
  await expect.poll(marksOnSheet).toBe(0);
  await page.keyboard.press("Control+z");
  await expect.poll(marksOnSheet).toBe(marks);
  await expect(page.getByText("77.78 ft").first()).toBeVisible();
});

test("13. a locked bid refuses Send, a scale change, a mark delete and a plan removal", async () => {
  await page.goto(`/#/bids/${bidId}`);
  await page.getByRole("button", { name: "Lock quantities" }).click();
  await expect(
    page.getByRole("button", { name: "Unlock quantities" }).first()
  ).toBeVisible();

  const { groups } = await trpc<{ groups: { id: number }[] }>(
    page.request,
    "takeoffGroups.list",
    {
      bidId,
    }
  );
  // Some lists come wrapped ({ groups: [...] }); take the first array either way.
  const rows = (x: unknown): { id: number }[] =>
    Array.isArray(x)
      ? x
      : ((Object.values(x as object).find(Array.isArray) as { id: number }[]) ??
        []);
  const plans = rows(await trpc(page.request, "bidPdfs.list", { bidId }));
  const sheets = rows(
    await trpc(page.request, "bidPdfs.sheets", { bidPdfId: plans[0].id })
  );
  const stamps = rows(
    await trpc(page.request, "takeoffStamps.listForSheet", {
      sheetId: sheets[0].id,
    })
  );
  // Thunks, run one at a time: each refusal is awaited as it is made.
  const attempts: [string, () => Promise<unknown>][] = [
    [
      "Send",
      () =>
        trpc(
          page.request,
          "takeoffGroups.sendToBid",
          { id: groups[0].id },
          true
        ),
    ],
    [
      "scale change",
      () =>
        trpc(
          page.request,
          "bidPdfs.setSheetScale",
          { id: sheets[0].id, scaleText: `1/8" = 1'-0"` },
          true
        ),
    ],
    [
      "mark delete",
      () =>
        trpc(page.request, "takeoffStamps.remove", { id: stamps[0].id }, true),
    ],
    [
      "plan removal",
      () => trpc(page.request, "bidPdfs.remove", { id: plans[0].id }, true),
    ],
  ];
  for (const [what, attempt] of attempts) {
    const error = await attempt().then(
      () => null,
      (e: Error) => e
    );
    expect(error, `${what} was allowed on a locked bid`).not.toBeNull();
    // One plain sentence: a message, not a stack or an error code.
    expect(error!.message, `${what}: refusal`).toMatch(/lock/i);
  }

  await openPlans(page, bidId);
  await page.getByRole("button", { name: "More for this sheet" }).click();
  await expect(
    page.getByRole("menuitem", { name: /unlock the bid first/ })
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("14. the proposal for a bid with work is no longer blocked as empty", async () => {
  await page.goto(`/#/bids/${bidId}/proposal`);
  await expect(page.getByText(/CI DUPLEX/i).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("No work added yet")).toHaveCount(0);
  await page.keyboard.press("Control+p");
  await page.waitForTimeout(800);
  await expect(page.getByText("Add work before sending")).toHaveCount(0);
});
