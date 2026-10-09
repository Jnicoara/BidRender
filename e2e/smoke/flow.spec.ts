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
import { expect, test, type Page, type Route } from "@playwright/test";
import { SYMBOLS } from "./fixturePlan";
import {
  createThrowawayBid,
  discardBid,
  dragBox,
  openPlans,
  placeAt,
  sheetPoint,
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

/** Step 9 holds the first mark list after its reload; step 10 checks it did. */
let stampListDelayed = false;
async function delayFirstStampList(route: Route) {
  if (!stampListDelayed) {
    stampListDelayed = true;
    await new Promise(r => setTimeout(r, 6_000));
  }
  await route.continue();
}

/** The id of this bid's sheet on page `n` of its first plan set. */
async function sheetIdOnPage(n: number): Promise<number> {
  const plans = await trpc<{ id: number }[]>(page.request, "bidPdfs.list", {
    bidId,
  });
  const sheets = await trpc<{ id: number; pageNumber: number }[]>(
    page.request,
    "bidPdfs.sheets",
    { bidPdfId: plans[0].id }
  );
  const sheet = sheets.find(s => s.pageNumber === n);
  if (!sheet) throw new Error(`no sheet on page ${n}`);
  return sheet.id;
}

/** How many marks the SERVER holds on a sheet — what the tally should say. */
async function savedMarks(sheetId: number): Promise<number> {
  const rows = await trpc<unknown[]>(
    page.request,
    "takeoffStamps.listForSheet",
    { sheetId }
  );
  return rows.length;
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
  // VISIBLE first: a mark on the drawing carries the count's name in an SVG
  // <title>, earlier in the page than the legend row. `.first()` alone took
  // that hidden title and waited on it until the test timed out (staging
  // smoke run 37538885610, flow 10, with the row on screen).
  await page
    .getByText(new RegExp(`^${name}$`, "i"))
    .filter({ visible: true })
    .first()
    .click();
  // NO wait for the "Counting …" bar, on purpose. Until 2026-10-01 a by-name
  // count was made on the server first and clicks before that reply were
  // taken as plain clicks — measured 0 of 3 and 2 of 3 marks kept, silently.
  // The tool now arms at once and keeps every click (@/lib/provisionalCount),
  // so clicking straight away is the test of that fix.
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
  // Sheet 1's printed scale is read straight after the upload, with no flip
  // away and back. Until 2026-10-01 a fresh upload sat on "Set scale" here
  // ("0/2 scaled"): the page was read before its sheet row existed and the
  // reading was dropped (@/lib/scaleCatchUp). "1/2" because sheet 2 has not
  // been shown yet, and only a shown page is read.
  await expect(page.getByText(/^1\/2 scaled$/).first()).toBeVisible({
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
  /*
    FORCED: the click that arms CI SWITCH reaches the server BEFORE its link
    has been written. The Legend shows a link the moment it is picked, so
    that order is a real one, and until 2026-10-09 it armed the DUPLEX count
    instead — the switch was dropped as unlinked and the assembly's one count
    taken. Pill stuck on "ci duplex", the race hook below never firing: Gate
    37970377380, smoke attempt 2. Holding the link until `forAssembly` has
    answered makes that order happen every run (server/routers/
    takeoffGroupsRouter.ts, `clickedFrom`). The hold gives up after 15 s so
    a run that never sends `forAssembly` fails on the assertion, not here.
  */
  const linkHeld = async (route: Route) => {
    await page
      .waitForResponse(r => r.url().includes("takeoffGroups.forAssembly"), {
        timeout: 15_000,
      })
      .catch(() => {});
    await route.continue();
  };
  const isLink = (url: URL) =>
    url.pathname.includes("takeoffStamps.linkSymbol");
  await page.route(isLink, linkHeld);

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

  /*
    FORCED: the first click lands AFTER the server made the count but BEFORE
    the page re-armed under its real id. Found locally (this step, 1 run in
    3): that click was queued under the provisional id after the queue had
    been adopted, drawn, and never sent — one mark short, for good, nothing
    said (@/lib/provisionalCount, `settleLateMarks`). The answer's callback
    writes the "Count again" memory just before it flushes, so the click is
    fired from inside that write: the exact moment, every run.
  */
  const first = await sheetPoint(page, SYMBOLS.switch[0]);
  await page.evaluate(
    ({ key, x, y }) => {
      const w = window as unknown as { __raceFired?: boolean };
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        setItem.call(this, k, v);
        if (w.__raceFired !== false || k !== key || !v.includes("CI SWITCH"))
          return;
        w.__raceFired = true;
        const init = {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        };
        const target = document.elementFromPoint(x, y);
        target?.dispatchEvent(new PointerEvent("pointerdown", init));
        target?.dispatchEvent(new PointerEvent("pointerup", init));
      };
      w.__raceFired = false;
    },
    { key: `bidridge:last-count:${bidId}`, ...first }
  );
  await armFromLegend("CI SWITCH");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __raceFired?: boolean }).__raceFired
      )
    )
    .toBe(true)
    .catch(async (error: Error) => {
      // Say which way it failed: the toolbar names the count that IS armed.
      const pill = await page
        .getByText(/^Counting /)
        .first()
        .textContent({ timeout: 1_000 })
        .catch(() => null);
      throw new Error(
        `CI SWITCH never armed under its own name; the toolbar says ` +
          `${pill ? `"${pill}"` : "nothing is armed"}.\n${error.message}`
      );
    });
  await page.unroute(isLink, linkHeld);
  for (const at of SYMBOLS.switch.slice(1)) await placeAt(page, at);
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
  /*
    FORCED: the first read after the reload NEVER answers. This is the one
    failure seen on the 24105ad candidate (run 37512445462 attempt 1): the
    screen sat blank for 60 s on a batch that did not come back, because
    nothing gave up on it. Now a read is abandoned at 20 s and asked again
    (@/lib/queryDeadline), so the screen must still arrive inside 60 s.
  */
  let held = false;
  const holdFirstPlansList = async (route: Route) => {
    if (held) return route.continue();
    held = true; // never continued, fulfilled or aborted: a hung response
  };
  await page.route(/\/api\/trpc\/[^?]*bidPdfs\.list/, holdFirstPlansList);
  /*
    FORCED for step 10: this sheet's marks arrive LATE after the reload, so
    step 10 starts while the tally still reads "0 marks" with a mark on the
    sheet. That window is what made step 10 flaky (2026-10-08, five runs in
    a day); held here it is there every time, and step 10 must not read a
    number from it. Released by time, once — step 10 removes the route.
  */
  stampListDelayed = false;
  await page.route(
    /\/api\/trpc\/[^?]*takeoffStamps\.listForSheet/,
    delayFirstStampList
  );
  await page.reload();
  await expect(page.getByText(/^2\/2$/).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.unroute(/\/api\/trpc\/[^?]*bidPdfs\.list/, holdFirstPlansList);
  expect(held, "the first plans list was not held — nothing was forced").toBe(
    true
  );
  await expect(page.getByText(/^Plans — /).first()).toBeVisible();
  await expect(page.getByText(/^\d+%$/).first()).toHaveText(before);
});

test("10. undo and redo a mark; delete one and Undo brings it back", async () => {
  /*
    FORCED: the request that makes the count is slow. This step failed once
    (run 37416743573) with the mark drawn and the tally stuck — the same
    picture as holding `takeoffGroups.create`. The mark is right to wait; it
    is counted when the answer comes. But until then it lives only in this
    tab, so leaving must ASK: a reload in that window used to lose it with no
    word (@/lib/provisionalCount, `marksOnlyHere`).
  */
  let release: () => void = () => {};
  const released = new Promise<void>(r => (release = r));
  let heldCreate = false;
  const holdCreate = async (route: Route) => {
    if (!heldCreate) {
      heldCreate = true;
      await released;
    }
    await route.continue();
  };
  /*
    WAIT FOR THE SHEET'S MARKS BEFORE READING `start` (2026-10-08). The
    tally counts SAVED marks only, and until this sheet's list arrives after
    step 9's reload it reads "0 marks". Read in that window, `start` was 0
    while step 8's mark was already on this sheet — so the poll for
    `start + 1` was met by that OLD mark loading, Ctrl+Z went in before the
    new mark was saved (no undo step exists until the server confirms), and
    the tally sat at 2. Same picture in every red run that day: "Expected 0,
    Received 2" at the Ctrl+Z poll, two marks drawn, Redo greyed out. Not a
    staging redeploy — none of the five overlapped one. So both numbers come
    from the SERVER, and the screen must agree with it.
  */
  const sheet2 = await sheetIdOnPage(2);
  const start = await savedMarks(sheet2);
  expect(start, "step 8 left a mark on this sheet").toBeGreaterThan(0);
  await expect.poll(marksOnSheet).toBe(start);
  await page.unroute(
    /\/api\/trpc\/[^?]*takeoffStamps\.listForSheet/,
    delayFirstStampList
  );
  expect(
    stampListDelayed,
    "the mark list was not delayed — nothing was forced"
  ).toBe(true);
  await page.route(/\/api\/trpc\/[^?]*takeoffGroups\.create/, holdCreate);
  await armFromLegend("CI DUPLEX");
  await placeAt(page, SYMBOLS.sheet2Duplex[1]);
  await expect.poll(() => heldCreate).toBe(true);

  const asked = page
    .waitForEvent("dialog", { timeout: 10_000 })
    .then(async dialog => {
      const type = dialog.type();
      await dialog.dismiss(); // stay on the page
      return type;
    })
    .catch(() => "no dialog");
  await page.reload({ timeout: 5_000 }).catch(() => {});
  expect(await asked, "leaving with an uncounted mark did not ask").toBe(
    "beforeunload"
  );

  release();
  // Counted once the count exists — exactly once, not lost and not doubled.
  // The server first: the undo step is pushed when the write is confirmed.
  await expect.poll(() => savedMarks(sheet2)).toBe(start + 1);
  await expect.poll(marksOnSheet).toBe(start + 1);
  await page.unroute(/\/api\/trpc\/[^?]*takeoffGroups\.create/, holdCreate);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(marksOnSheet).toBe(start);
  await expect.poll(() => savedMarks(sheet2)).toBe(start);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(marksOnSheet).toBe(start + 1);
  await expect.poll(() => savedMarks(sheet2)).toBe(start + 1);

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
