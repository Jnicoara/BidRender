/**
 * MARKS NEVER MOVE OR VANISH (owner, 2026-10-15) — references/plans-test-map.md
 * § "Marks never move or vanish".
 *
 * Place marks on two sheets and trace a run, write down where the SERVER
 * says they are, and then do everything a working day does to a screen:
 * zoom, turn the device, switch sheets, reload, lose the connection, lose an
 * ANSWER (the server saved, the reply never came), undo and redo, and have a
 * second session edit the same sheet at the same time. After every step:
 *
 *   - the server holds exactly what it should — same marks, same points,
 *     not one more and not one fewer;
 *   - every mark drawn on the screen sits on the drawing point it was saved
 *     at (checked against the drawing's own position on the screen, so a
 *     zoom or a turn that left the marks behind fails here).
 *
 * Runs at laptop (mouse) and iPad both ways and phone (finger).
 */
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { DEEP, DEEP_PAGE, buildDeepPlan } from "./deepPlan";
import { AUTH_FILE } from "./authFile";
import {
  createThrowawayBid,
  discardBid,
  openPlans,
  thisSheetLine,
  trpc,
} from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 15_000 });

let page: Page;
let context: BrowserContext;
let bidId: number;
let touch = false;
let phone = false;

type P = { x: number; y: number };
type Mark = { id: number; x: number | string; y: number | string };
type Run = { id: number; points: P[] };

/** What the server should hold: marks per page, run points on page 1. */
const expected: { marks: Record<number, P[]>; run: P[] } = {
  marks: { 1: [], 2: [] },
  run: [],
};

async function act(target: Locator) {
  if (touch) await target.tap();
  else await target.click();
}
function canvas() {
  return page.locator("canvas.bg-white").first();
}
async function box() {
  const b = await canvas().boundingBox();
  if (!b) throw new Error("the sheet is not drawn");
  return b;
}
/** Screen point of a PDF point (origin bottom-left). */
async function screenOf(at: P) {
  const b = await box();
  const s = b.width / DEEP_PAGE.width;
  return { x: b.x + at.x * s, y: b.y + (DEEP_PAGE.height - at.y) * s };
}
/** The stored form of a tap: PDF points, y measured DOWN from the top. */
const stored = (at: P): P => ({ x: at.x, y: DEEP_PAGE.height - at.y });
async function placeAt(at: P) {
  const p = await screenOf(at);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function again() {
  await act(page.getByRole("button", { name: /^Again: |again$/ }).first());
  await expect(
    page.getByRole("button", { name: /^Counting / }).first()
  ).toBeVisible();
}
/** Put an armed count down; nothing when none is armed. */
async function countDown() {
  const armed = page.getByRole("button", { name: /^Counting / }).first();
  if (await armed.isVisible().catch(() => false)) await act(armed);
}
async function fit() {
  await act(page.getByRole("button", { name: "Fit" }).first());
  await page.waitForTimeout(400);
}

async function sheetIds(): Promise<Record<number, number>> {
  const plans = await trpc<{ id: number }[]>(page.request, "bidPdfs.list", {
    bidId,
  });
  const sheets = await trpc<{ id: number; pageNumber: number }[]>(
    page.request,
    "bidPdfs.sheets",
    { bidPdfId: plans[0].id }
  );
  return Object.fromEntries(sheets.map(s => [s.pageNumber, s.id]));
}
let ids: Record<number, number> = {};
async function serverMarks(pageNo: number): Promise<P[]> {
  const rows = await trpc<Mark[]>(page.request, "takeoffStamps.listForSheet", {
    sheetId: ids[pageNo],
  });
  return rows.map(r => ({ x: Number(r.x), y: Number(r.y) }));
}
async function serverRuns(): Promise<Run[]> {
  return trpc<Run[]>(page.request, "takeoffRuns.listForSheet", {
    sheetId: ids[1],
  });
}

const key = (p: P) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
const sorted = (ps: P[]) => ps.map(key).sort();

/** The page number on screen, from the sheet chip "… 1/3". */
async function onPage(): Promise<number> {
  const t = await page
    .getByRole("button", { name: /\d+\/3/ })
    .first()
    .innerText();
  return Number(t.match(/(\d+)\/3/)?.[1]);
}
async function goToPage(n: number) {
  for (let i = 0; i < 4 && (await onPage()) !== n; i++) {
    await act(
      page
        .getByRole("button", {
          name: (await onPage()) < n ? "Next sheet" : "Previous sheet",
        })
        .first()
    );
    await page.waitForTimeout(1200);
  }
  expect(await onPage()).toBe(n);
}

/**
 * THE CHECK, after every step: the server holds exactly what is expected,
 * and every saved mark on the open sheet is drawn on its own point.
 */
async function holdsExactly(step: string) {
  for (const n of [1, 2]) {
    await expect
      .poll(async () => sorted(await serverMarks(n)), {
        message: `${step}: page ${n}'s marks on the server`,
      })
      .toEqual(sorted(expected.marks[n].map(stored)));
  }
  // Polled like the marks: a run is saved a moment after Finish.
  await expect
    .poll(async () => (await serverRuns()).map(r => sorted(r.points)), {
      message: `${step}: exactly one run, at its points`,
    })
    .toEqual([sorted(expected.run.map(stored))]);

  // On screen: each drawn mark's centre, read back as a drawing point.
  const open = await onPage();
  const want = expected.marks[open].map(stored);
  await expect
    .poll(
      async () => page.locator("[data-mark]:not([data-mark=pending])").count(),
      {
        message: `${step}: marks drawn on page ${open}`,
      }
    )
    .toBe(want.length);
  const b = await box();
  const s = b.width / DEEP_PAGE.width;
  const drawn = await page
    .locator("[data-mark]:not([data-mark=pending])")
    .evaluateAll(els =>
      els.map(el => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })
    );
  // Half a screen pixel of rounding, in drawing points, plus 1 pt.
  const tol = 1 + 1.5 / s;
  for (const d of drawn) {
    const at = { x: (d.x - b.x) / s, y: (d.y - b.y) / s };
    const near = want.some(
      w => Math.abs(w.x - at.x) <= tol && Math.abs(w.y - at.y) <= tol
    );
    expect(
      near,
      `${step}: a mark drawn at ${key(at)} is on no saved point`
    ).toBe(true);
  }
  await expect(thisSheetLine(page)).toContainText(
    new RegExp(`^This sheet: ${want.length} marks?`)
  );
}

test.beforeAll(async ({ browser }, info) => {
  touch = Boolean(info.project.use.hasTouch);
  phone = (info.project.use.viewport?.width ?? 1440) <= 768;
  context = await browser.newContext({
    ...info.project.use,
    storageState: AUTH_FILE,
  } as Parameters<typeof browser.newContext>[0]);
  page = await context.newPage();
  bidId = await createThrowawayBid(page.request, `marks ${info.project.name}`);
  await openPlans(page, bidId);
  const attached = page.waitForResponse(
    r => r.url().includes("bidPdfs.confirmAttach") && r.ok(),
    { timeout: 120_000 }
  );
  await page.locator("input[type=file][accept*='pdf']").setInputFiles({
    name: "ci-marks-plan.pdf",
    mimeType: "application/pdf",
    buffer: buildDeepPlan(),
  });
  await attached;
  await expect(canvas()).toBeVisible({ timeout: 90_000 });
  await expect.poll(async () => Object.keys(await sheetIds()).length).toBe(3);
  ids = await sheetIds();
  // A scale, so a run can be traced (the scale tools are plans.spec.ts's).
  await trpc(
    page.request,
    "bidPdfs.setSheetScale",
    { id: ids[1], scaleText: `1/4" = 1'-0"` },
    true
  );
});

test.afterAll(async () => {
  if (bidId) await discardBid(page.request, bidId).catch(() => {});
  await context.close();
});

test("marks on two sheets and a run, saved where they were put", async () => {
  await page.reload();
  await expect(canvas()).toBeVisible({ timeout: 90_000 });
  await fit();
  await act(page.getByRole("button", { name: /^Count/ }).first());
  await page
    .getByPlaceholder("Search, or type anything to count it…")
    .fill("Kept receptacle");
  await page.keyboard.press("Enter");
  for (const at of DEEP.sheet1) await placeAt(at);
  expected.marks[1].push(...DEEP.sheet1);
  await goToPage(2);
  await fit();
  // A sheet change puts the count down (by design); pick it back up.
  await again();
  for (const at of DEEP.sheet2) await placeAt(at);
  expected.marks[2].push(...DEEP.sheet2);
  await goToPage(1);
  await fit();
  // Put the count down, then trace.
  await countDown();
  if (phone) {
    await act(page.getByRole("button", { name: /More tools|Tools/ }).first());
    await act(page.getByRole("menuitem", { name: /^Trace/ }).first());
  } else {
    await act(page.getByRole("button", { name: /^Trace conduit/ }).first());
  }
  await placeAt(DEEP.traceFrom);
  await placeAt({ x: 1500, y: 600 });
  await placeAt(DEEP.traceTo);
  await act(page.getByRole("button", { name: /^Finish/ }).first());
  expected.run.push(DEEP.traceFrom, { x: 1500, y: 600 }, DEEP.traceTo);
  await holdsExactly("placed");
});

test("zoom in and out: every mark stays on its point", async () => {
  const c = await box();
  const mid = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  if (touch) {
    // Two fingers spreading, through the browser's own touch input.
    const cdp = await context.newCDPSession(page);
    const pts = (d: number) => [
      { x: mid.x - d, y: mid.y, id: 1 },
      { x: mid.x + d, y: mid.y, id: 2 },
    ];
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: pts(20),
    });
    for (let d = 30; d <= 120; d += 10)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: pts(d),
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } else {
    await page.mouse.move(mid.x, mid.y);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(80);
    }
  }
  // Past the 200 ms in which marks settle to their size.
  await page.waitForTimeout(800);
  expect((await box()).width, "the zoom happened").toBeGreaterThan(
    c.width * 1.2
  );
  await holdsExactly("zoomed in");
  await fit();
  await holdsExactly("zoomed back out");
});

test("turn the device (portrait ⇄ landscape): every mark stays on its point", async () => {
  const v = page.viewportSize()!;
  await page.setViewportSize({ width: v.height, height: v.width });
  await page.waitForTimeout(1500);
  await holdsExactly("turned");
  await page.setViewportSize(v);
  await page.waitForTimeout(1500);
  await holdsExactly("turned back");
});

test("switch sheets and back: each sheet keeps its own marks", async () => {
  await goToPage(2);
  await holdsExactly("on page 2");
  await goToPage(1);
  await holdsExactly("back on page 1");
});

test("reload: everything comes back", async () => {
  await page.reload();
  await expect(canvas()).toBeVisible({ timeout: 90_000 });
  await holdsExactly("reloaded");
});

test("offline, then online: marks placed offline are saved once", async () => {
  await fit();
  await again();
  await context.setOffline(true);
  const a = { x: 700, y: 500 };
  const b = { x: 800, y: 500 };
  await placeAt(a);
  await placeAt(b);
  await page.waitForTimeout(1500);
  // Nothing reached the server — read it through a second, online request.
  expect(sorted(await serverMarks(1))).toEqual(
    sorted(expected.marks[1].map(stored))
  );
  await context.setOffline(false);
  expected.marks[1].push(a, b);
  await holdsExactly("back online");
  // And it stays that way: no second copy arrives later.
  await page.waitForTimeout(4000);
  await holdsExactly("back online, later");
});

test("a LOST ANSWER (saved, reply never came): the resend counts once", async () => {
  let lost = false;
  await page.route(
    url => url.pathname.includes("takeoffStamps.drop"),
    async route => {
      if (lost) return route.continue();
      lost = true;
      // The server writes the mark; the screen never hears back.
      await route.fetch();
      await route.abort("connectionreset");
    }
  );
  const c = { x: 900, y: 500 };
  await placeAt(c);
  expected.marks[1].push(c);
  await holdsExactly("after the lost answer");
  await page.waitForTimeout(5000);
  await holdsExactly("after the lost answer, later");
  await page.unroute(url => url.pathname.includes("takeoffStamps.drop"));
});

test("undo and redo: the marks go and come back to the same points", async () => {
  await countDown();
  const last = expected.marks[1].pop()!;
  await act(page.getByRole("button", { name: /^Undo: / }).first());
  await holdsExactly("undone");
  if (phone) {
    await act(page.getByRole("button", { name: /More tools|Tools/ }).first());
    await act(page.getByRole("menuitem", { name: /^Redo/ }).first());
  } else {
    await act(page.getByRole("button", { name: /^Redo: / }).first());
  }
  expected.marks[1].push(last);
  await holdsExactly("redone");
});

test("RELOAD while a batch is in flight: recovery does not save it twice", async () => {
  // Found by the "second person" step below on its first run (2026-10-16):
  // a mark placed just before a reload was saved, then recovered from the
  // crash queue and sent again with no key — on the bid twice. Made certain
  // here: the server saves the batch, the reply is held, the page reloads.
  await fit();
  await again();
  let held = false;
  await page.route(
    url => url.pathname.includes("takeoffStamps.drop"),
    async route => {
      if (held) return route.continue();
      held = true;
      await route.fetch(); // saved on the server
      await new Promise(r => setTimeout(r, 30_000)); // the reply never comes
      await route.abort("connectionreset").catch(() => {});
    }
  );
  const d = { x: 1000, y: 400 };
  await placeAt(d);
  await expect.poll(() => held).toBe(true);
  await page.waitForTimeout(500);
  await page.unroute(url => url.pathname.includes("takeoffStamps.drop"));
  await page.reload();
  await expect(canvas()).toBeVisible({ timeout: 90_000 });
  expected.marks[1].push(d);
  await holdsExactly("reloaded mid-send");
  await page.waitForTimeout(4000);
  await holdsExactly("reloaded mid-send, later");
});

test("a second person edits the same sheet at the same time: nothing is lost", async ({
  browser,
}) => {
  const other = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1440, height: 900 },
  });
  const them = await other.newPage();
  try {
    // They add a mark and delete one of ours, through the same server.
    const groups = await trpc<{ groups: { id: number; label: string }[] }>(
      them.request,
      "takeoffGroups.list",
      { bidId }
    );
    const kept = groups.groups.find(g => g.label === "Kept receptacle")!;
    const theirs = { x: 1000, y: 800 };
    await trpc(
      them.request,
      "takeoffStamps.drop",
      { bidId, sheetId: ids[1], groupId: kept.id, at: [stored(theirs)] },
      true
    );
    const ours = await trpc<(Mark & { id: number })[]>(
      them.request,
      "takeoffStamps.listForSheet",
      { sheetId: ids[1] }
    );
    const gone = expected.marks[1][0];
    const victim = ours.find(
      m => key({ x: Number(m.x), y: Number(m.y) }) === key(stored(gone))
    )!;
    await trpc(them.request, "takeoffStamps.remove", { id: victim.id }, true);

    // Meanwhile we place one of our own.
    await fit();
    await again();
    const mine = { x: 1100, y: 800 };
    await placeAt(mine);
    await countDown();

    expected.marks[1] = expected.marks[1].filter(p => p !== gone);
    expected.marks[1].push(theirs, mine);
    // Our screen catches up when it next looks (a focus or a reload).
    await page.reload();
    await expect(canvas()).toBeVisible({ timeout: 90_000 });
    await holdsExactly("after two people edited");
  } finally {
    await other.close();
  }
});
