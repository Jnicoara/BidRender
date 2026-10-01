/**
 * TOUCH CHECK — the plan viewer's key actions done with FINGERS, in a real
 * Chrome with touch emulation, against the running dev server.
 *
 *   pnpm device:touch                      # tablet both ways round + phone
 *   pnpm device:touch --bid=1728369        # which bid (a THROWAWAY one)
 *
 * Every event here is a real touch (CDP Input.dispatchTouchEvent), so it goes
 * through the browser's own touch → pointer pipeline exactly as an iPad's
 * would, and reaches TakeoffPage's touch router the way a finger does.
 *
 * What it asserts, per size — the rules in references/device-audit.md § Touch:
 *  1. A TAP with Count armed places exactly one mark.
 *  2. A one-finger DRAG with Count armed pans and places nothing.
 *  3. A two-finger PINCH zooms and places nothing.
 *  4. A two-finger PAN with Count armed places nothing.
 *  5. The on-screen UNDO takes the last mark back.
 *  6. SELECT (the finger's Shift): tap two marks, the pill says 2, its
 *     Delete removes both.
 *  7. The page never scrolls sideways.
 *  On the phone, also: the bar under the drawing opens the bottom sheet and
 *  its Done closes it, with the drawing still on screen above it.
 *
 * It WRITES: it creates one plain count per run, named "Touch check <time>",
 * on the bid it is given, places and deletes marks, and deletes the count at
 * the end. Point it only at a throwaway bid.
 */
import type { CDPSession, Page } from "playwright-core";
import {
  SIZES,
  gotoRoute,
  launchChrome,
  openAt,
  type DeviceSize,
} from "./deviceAudit.mts";

type Pt = { x: number; y: number };

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const bidId = Number(args.bid ?? process.env.TOUCH_BID ?? 1728369);
const openId = args.user ?? process.env.OPEN_ID ?? "e5mSTU8bQbySZsknSun5f4";
const sizeNames = String(
  args.sizes ?? "tablet-landscape,tablet-portrait,phone"
).split(",");

let failures = 0;
function check(ok: boolean, what: string, detail = "") {
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`
  );
  if (!ok) failures++;
}

async function touch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  points: Pt[]
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })),
  });
}

async function tapAt(cdp: CDPSession, p: Pt) {
  await touch(cdp, "touchStart", [p]);
  await touch(cdp, "touchEnd", []);
}

async function dragOne(cdp: CDPSession, from: Pt, dx: number, dy: number) {
  await touch(cdp, "touchStart", [from]);
  for (let i = 1; i <= 8; i++)
    await touch(cdp, "touchMove", [
      { x: from.x + (dx * i) / 8, y: from.y + (dy * i) / 8 },
    ]);
  await touch(cdp, "touchEnd", []);
}

async function twoFinger(
  cdp: CDPSession,
  a: Pt,
  b: Pt,
  to: (t: number) => [Pt, Pt]
) {
  await touch(cdp, "touchStart", [a, b]);
  for (let i = 1; i <= 8; i++) await touch(cdp, "touchMove", to(i / 8));
  await touch(cdp, "touchEnd", []);
}

/** "This sheet: N marks · …" — the pinned line, on screen in every layout. */
async function marksOnSheet(page: Page): Promise<number> {
  const text = await page
    .locator("text=/This sheet: \\d+ marks?/")
    .first()
    .textContent();
  const m = text?.match(/This sheet: (\d+) marks?/);
  return m ? Number(m[1]) : NaN;
}

/**
 * Wait for the marks to reach the server and come back (they batch).
 *
 * With no expected number, it waits the whole batch delay (FLUSH_AFTER_MS,
 * 700 ms, plus the round trip) before reading. Reading sooner is how "a drag
 * places nothing" first passed with the touch router switched OFF: the stray
 * mark was real, it just had not been sent yet.
 */
async function settle(page: Page, expect?: number) {
  if (expect === undefined) {
    await page.waitForTimeout(2500);
    return marksOnSheet(page);
  }
  const until = Date.now() + 8000;
  let n = await marksOnSheet(page);
  while (Date.now() < until) {
    await page.waitForTimeout(400);
    n = await marksOnSheet(page);
    if (expect === undefined || n === expect) break;
  }
  return n;
}

/** The drawing's transform, to tell a pan or a zoom happened. */
async function viewTransform(page: Page): Promise<string> {
  return page.evaluate(() => {
    const vp = document.querySelector("[data-plan-viewport]");
    const moved = vp?.querySelector<HTMLElement>("[style*='transform']");
    return moved?.style.transform ?? "";
  });
}

async function canvasBox(page: Page) {
  const box = await page
    .locator("[data-plan-viewport] canvas")
    .first()
    .boundingBox();
  if (!box) throw new Error("No drawing on screen");
  return box;
}

async function tapButton(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).first().tap();
}

async function runAt(size: DeviceSize) {
  console.log(`\n${size.name} (${size.width}x${size.height})`);
  const browser = await launchChrome();
  try {
    const page = await openAt(browser, size, openId);
    const cdp = await page.context().newCDPSession(page);
    await gotoRoute(page, `/bids/${bidId}/plans`);
    await page.waitForSelector("[data-plan-viewport] canvas", {
      timeout: 30000,
    });
    // The first raster is drawn in a worker; wait for the loading panel to go.
    await page
      .waitForFunction(
        () =>
          !document
            .querySelector("[data-plan-viewport]")
            ?.textContent?.includes("Opening"),
        null,
        { timeout: 30000 }
      )
      .catch(() => undefined);
    await page.waitForTimeout(1500);

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    check(!sideways, "no sideways scroll on the plan viewer");

    if (size.name === "phone") {
      // The bar under the drawing opens the bottom sheet; Done closes it.
      await page
        .getByRole("button", { name: /Open the panel/ })
        .first()
        .tap();
      await page.waitForTimeout(400);
      const sheet = page.getByRole("dialog", { name: /counted items/ });
      const box = await sheet.boundingBox();
      const canvasStill = await page
        .locator("[data-plan-viewport]")
        .boundingBox();
      check(
        !!box &&
          box.y > size.height * 0.3 &&
          box.y + box.height <= size.height + 1,
        "the panel is a bottom sheet",
        box ? `top at ${Math.round(box.y)} of ${size.height}` : "not found"
      );
      check(
        !!canvasStill && canvasStill.y < (box?.y ?? 0),
        "the drawing is still on screen above it"
      );
      await sheet.getByRole("button", { name: "Done" }).tap();
      await page.waitForTimeout(300);
      check(
        (await page.getByRole("dialog", { name: /counted items/ }).count()) ===
          0,
        "Done closes it"
      );
    }

    // ── Arm a plain count, by finger ───────────────────────────────────────
    const label = `Touch check ${Date.now() % 1e7}`;
    await tapButton(page, /^Count$/);
    const input = page.getByPlaceholder(
      "Search, or type anything to count it…"
    );
    await input.fill(label);
    await input.press("Enter");
    await page.waitForSelector(`text=Counting ${label}`, { timeout: 8000 });

    const before = await settle(page);
    const c = await canvasBox(page);
    const p1 = { x: c.x + c.width * 0.42, y: c.y + c.height * 0.45 };
    const p2 = { x: c.x + c.width * 0.58, y: c.y + c.height * 0.55 };

    // 1. Tap places one.
    await tapAt(cdp, p1);
    let n = await settle(page, before + 1);
    check(
      n === before + 1,
      "a tap places exactly one mark",
      `${before} → ${n}`
    );

    // 2. One-finger drag pans, places nothing.
    const t0 = await viewTransform(page);
    await dragOne(
      cdp,
      { x: c.x + c.width * 0.5, y: c.y + c.height * 0.3 },
      60,
      40
    );
    n = await settle(page);
    const t1 = await viewTransform(page);
    check(n === before + 1, "a one-finger drag places nothing", `${n} marks`);
    check(t1 !== t0, "a one-finger drag pans the sheet");

    // 3. Pinch zooms, places nothing.
    const mid = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
    await twoFinger(
      cdp,
      { x: mid.x - 40, y: mid.y },
      { x: mid.x + 40, y: mid.y },
      t => [
        { x: mid.x - 40 - 60 * t, y: mid.y },
        { x: mid.x + 40 + 60 * t, y: mid.y },
      ]
    );
    n = await settle(page);
    const t2 = await viewTransform(page);
    check(n === before + 1, "a pinch places nothing", `${n} marks`);
    check(
      /scale\(([\d.]+)\)/.exec(t2)?.[1] !== /scale\(([\d.]+)\)/.exec(t1)?.[1],
      "a pinch zooms"
    );

    // 4. Two-finger pan, still armed, places nothing.
    await twoFinger(
      cdp,
      { x: mid.x - 50, y: mid.y },
      { x: mid.x + 50, y: mid.y },
      t => [
        { x: mid.x - 50 + 70 * t, y: mid.y + 30 * t },
        { x: mid.x + 50 + 70 * t, y: mid.y + 30 * t },
      ]
    );
    n = await settle(page);
    check(n === before + 1, "a two-finger pan places nothing", `${n} marks`);

    // Back to the fitted view, where p1 is the mark again.
    await tapButton(page, /^Fit$/);
    await page.waitForTimeout(500);

    // 5. Undo, by its button.
    await tapAt(cdp, p2);
    n = await settle(page, before + 2);
    check(n === before + 2, "a second tap places a second mark", `${n}`);
    await page.getByRole("button", { name: /^Undo/ }).first().tap();
    n = await settle(page, before + 1);
    check(n === before + 1, "the Undo button takes it back", `${n}`);
    await tapAt(cdp, p2);
    n = await settle(page, before + 2);

    // 6. Put the tool down, Select, tap both, Delete from the pill.
    await page
      .getByRole("button", { name: new RegExp(`Counting ${label}`) })
      .tap();
    await page.waitForTimeout(300);
    if (size.name === "phone") {
      await tapButton(page, /More tools/);
      await page.getByRole("menuitem", { name: /Select several marks/ }).tap();
    } else {
      await tapButton(page, /^Select$/);
    }
    await page.waitForTimeout(300);
    await tapAt(cdp, p1);
    await page.waitForTimeout(250);
    await tapAt(cdp, p2);
    await page.waitForTimeout(400);
    const pill = await page
      .locator("text=/\\d+ marks? selected/")
      .first()
      .textContent()
      .catch(() => null);
    check(
      pill?.startsWith("2 marks") === true,
      "Select + two taps picks two",
      pill ?? "no pill"
    );
    await page
      .getByRole("status")
      .getByRole("button", { name: "Delete" })
      .first()
      .tap()
      .catch(() => undefined);
    n = await settle(page, before);
    check(n === before, "Delete in the pill removes them", `${n}`);

    const sidewaysAfter = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    check(!sidewaysAfter, "still no sideways scroll after all of it");

    // Tidy: remove the count this run created, through the app's own API.
    const removed = await page.evaluate(
      async ({ name, bid }) => {
        const list = await fetch(
          `/api/trpc/takeoffGroups.list?input=${encodeURIComponent(
            JSON.stringify({ json: { bidId: bid } })
          )}`
        ).then(r => r.json());
        const groups: { groupId?: number; id?: number; label: string }[] =
          list?.result?.data?.json?.groups ?? [];
        const mine = groups.find(g => g.label === name);
        const id = mine?.groupId ?? mine?.id;
        if (!id) return false;
        const res = await fetch("/api/trpc/takeoffGroups.remove", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ json: { id } }),
        });
        return res.ok;
      },
      { name: label, bid: bidId }
    );
    if (!removed)
      console.log(`  note: could not remove "${label}" — tidy by hand`);
  } finally {
    await browser.close();
  }
}

for (const name of sizeNames) {
  const size = SIZES.find(s => s.name === name);
  if (!size) throw new Error(`No size called ${name}`);
  await runAt(size).catch(e => {
    failures++;
    console.log(`  FAIL ${size.name}: ${(e as Error).message.split("\n")[0]}`);
  });
}
console.log(
  `\n${failures === 0 ? "Touch check OK" : `${failures} failure(s)`}`
);
process.exit(failures === 0 ? 0 : 1);
