/**
 * DEVICE AUDIT — every main screen at a phone, a tablet both ways round, and a
 * laptop, in a real Chrome with real touch emulation.
 *
 *   pnpm device:audit                       # report + screenshots, never fails
 *   pnpm device:audit --check               # same, exits 1 on a hard fault
 *   pnpm device:audit --only=plans,bid      # a subset of screens
 *   pnpm device:audit --sizes=phone,tablet-portrait
 *   pnpm device:audit --out=some/dir        # where the PNGs and report go
 *
 * Needs the dev server running (`pnpm dev`; the port comes from .env PORT, or
 * BASE_URL) and the installed Google Chrome. It drives Chrome through
 * playwright-core, which ships no browser of its own, so nothing is downloaded.
 *
 * WHY NOT THE CHROME EXTENSION: the window it drives is hidden and cannot be
 * resized (references/device-audit.md § How this is measured), so every
 * "checked at phone width" made through it was a same-origin iframe with no
 * touch, no `pointer: coarse` and no real viewport. Here the viewport, the
 * device pixel ratio, `hasTouch` and `isMobile` are the real thing — the app's
 * media queries and `plansLayout()` see exactly what a tablet would report.
 *
 * The session is minted in-process from .env's JWT_SECRET and set as a cookie
 * on 127.0.0.1. It is never printed and never written to disk.
 *
 * A HARD FAULT (what --check fails on):
 * - the page scrolls sideways (documentElement.scrollWidth > innerWidth);
 * - text sits below the bottom edge with no scrollable ancestor to reach it;
 * - a tab is not wholly inside its tab strip and the window (`cutTabs`).
 * Small tap targets are REPORTED, not failed: a dense laptop table is allowed
 * 28 px rows, and the touch sizes list theirs for the reader to judge.
 */
import {
  chromium,
  type Browser,
  type Locator,
  type Page,
} from "playwright-core";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
// @ts-expect-error — plain .mjs helper, no types
import { mintToken } from "../.claude/skills/run-bidrender/devsession.mjs";

export type DeviceSize = {
  name: string;
  width: number;
  height: number;
  touch: boolean;
  mobile: boolean;
  dpr: number;
};

export const SIZES: DeviceSize[] = [
  { name: "phone", width: 390, height: 844, touch: true, mobile: true, dpr: 3 },
  {
    name: "tablet-portrait",
    width: 820,
    height: 1180,
    touch: true,
    mobile: true,
    dpr: 2,
  },
  {
    name: "tablet-landscape",
    width: 1180,
    height: 820,
    touch: true,
    mobile: true,
    dpr: 2,
  },
  {
    name: "laptop",
    width: 1536,
    height: 864,
    touch: false,
    mobile: false,
    dpr: 1,
  },
];

export const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
];

export function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env — BASE_URL and JWT_SECRET must come from the environment
  }
  return out;
}

export function baseUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  const port = process.env.PORT || readEnv().PORT || "3000";
  // 127.0.0.1, not localhost: cookies ignore the port, so another checkout's
  // server on localhost can overwrite the session mid-run.
  return `http://127.0.0.1:${port}`;
}

export async function launchChrome(): Promise<Browser> {
  const executablePath =
    process.env.CHROME_PATH ?? CHROME_PATHS.find(p => existsSync(p));
  if (!executablePath)
    throw new Error("No Chrome found. Set CHROME_PATH to a Chrome binary.");
  return chromium.launch({ executablePath, headless: true });
}

/**
 * tsx compiles this file with esbuild's keepNames, which wraps nested
 * functions in `__name(...)`. A function handed to page.evaluate is serialised
 * as source and runs in the page, where `__name` does not exist.
 */
const KEEP_NAMES_SHIM = "globalThis.__name = globalThis.__name || (f => f);";

/** A browser context at one size, with no session. */
export async function deviceContext(browser: Browser, size: DeviceSize) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr,
    hasTouch: size.touch,
    isMobile: size.mobile,
    // The service worker serves stale modules across restarts (run-bidrender
    // skill, "three ways a screenshot lies"). An audit must see the source.
    serviceWorkers: "block",
  });
  await ctx.addInitScript({ content: KEEP_NAMES_SHIM });
  return ctx;
}

/** A page at one size, signed in as `openId`, service worker blocked. */
export async function openAt(
  browser: Browser,
  size: DeviceSize,
  openId: string
): Promise<Page> {
  const ctx = await deviceContext(browser, size);
  const token: string = await mintToken(openId);
  const url = new URL(baseUrl());
  await ctx.addCookies([
    {
      name: "app_session_id",
      value: token,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
    },
  ]);
  return ctx.newPage();
}

/** Go to a hash route and wait until the app has painted something real. */
export async function gotoRoute(page: Page, hash: string): Promise<void> {
  // Through a blank page first: going to the SAME hash address again is not
  // a navigation, so the screen kept whatever the last state opened (a panel
  // left open made the next "open the panel" step find no button).
  await page.goto("about:blank");
  await page.goto(`${baseUrl()}/#${hash}`, { waitUntil: "domcontentloaded" });
  await page
    .waitForLoadState("networkidle", { timeout: 15000 })
    .catch(() => undefined);
  // The shell fades each screen in with `.tab-enter`; let it finish so a
  // screenshot is not of a half-transparent page.
  await page.waitForTimeout(700);
}

export type Measure = {
  innerWidth: number;
  innerHeight: number;
  scrollWidth: number;
  sidewaysScroll: boolean;
  /** Scroll boxes inside the page that scroll sideways. */
  innerSideways: string[];
  /** What MAKES a page too wide: wider than the window, no wider child. */
  tooWide: string[];
  /** Pieces of text printed over each other, on screen. */
  overlaps: string[];
  /** Text whose right edge is past the window (scrolled to, or cut off). */
  overflowRight: string[];
  /** Text below the bottom edge with no scrollable ancestor. */
  cutOffBelow: string[];
  /**
   * A TAB not wholly inside its strip, or the window. The sideways-strip
   * exemption above hides a strip's text from `overflowRight`, which is how
   * "Legend" sat 20 px off an upright tablet's edge with every check passing
   * (2026-10-08): a tab you cannot see is a tab nobody opens, and a warning
   * mark on it is unseen.
   */
  cutTabs: string[];
  /** Visible controls smaller than 44 px on either side. */
  smallTargets: { label: string; w: number; h: number }[];
  controls: number;
};

/** Runs in the page. Kept self-contained: it is serialised by playwright. */
export function measureInPage(): Measure {
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  const de = document.documentElement;
  const describe = (el: Element) => {
    const label =
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) ||
      (el as HTMLInputElement).placeholder ||
      el.tagName.toLowerCase();
    const cls = (el.getAttribute("class") || "").split(/\s+/).slice(0, 3);
    return `${el.tagName.toLowerCase()}${cls.length && cls[0] ? "." + cls.join(".") : ""} «${label}»`;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    // 1 px or less is `sr-only` — there for a screen reader, not a finger.
    if (r.width <= 1 || r.height <= 1) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") return false;
    if (Number(s.opacity) === 0) return false;
    return true;
  };
  const clippedBy = (el: Element, axis: "x" | "y") => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const s = getComputedStyle(p);
      const o = axis === "x" ? s.overflowX : s.overflowY;
      if (o !== "visible") return true;
      p = p.parentElement;
    }
    return false;
  };

  // Inside a deliberately sideways strip (a tab row marked
  // data-sideways-ok), or inside the drawing itself, nothing counts.
  const exempt = (el: Element) =>
    !!el.closest("[data-sideways-ok], svg, canvas");

  const overflowRight: string[] = [];
  const cutOffBelow: string[] = [];
  const innerSideways: string[] = [];
  const tooWide: string[] = [];
  const all = Array.from(document.body.querySelectorAll("*"));
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // A box that scrolls sideways inside the page is still sideways scroll
    // to the person holding the phone: the page "fits" and the table does not.
    if (
      (s.overflowX === "auto" || s.overflowX === "scroll") &&
      el.scrollWidth > el.clientWidth + 1 &&
      !el.hasAttribute("data-sideways-ok") &&
      !exempt(el.parentElement ?? el)
    ) {
      innerSideways.push(
        `${describe(el).slice(0, 60)} (${el.scrollWidth} in ${el.clientWidth})`
      );
    }
    const isLeafText =
      el.children.length === 0 && (el.textContent || "").trim().length > 0;
    // Text whose right edge is past the window: either the page scrolls to it
    // or, far more often here, an overflow-hidden shell simply cuts it off.
    if (
      isLeafText &&
      r.right > iw + 1 &&
      r.left < iw &&
      r.bottom > 0 &&
      r.top < ih &&
      !exempt(el)
    ) {
      overflowRight.push(describe(el));
    }
    // The ROOT of a too-wide page: wider than the window, with no child that
    // is. Its parents are only wide because it is.
    if (
      r.width > iw + 1 &&
      !exempt(el) &&
      !Array.from(el.children).some(
        c => c.getBoundingClientRect().width > iw + 1
      )
    ) {
      tooWide.push(`${describe(el).slice(0, 70)} (${Math.round(r.width)} px)`);
    }
    if (isLeafText && r.top >= ih && !clippedBy(el, "y")) {
      // Below the window AND the page itself cannot scroll to it.
      if (de.scrollHeight <= ih + 1) cutOffBelow.push(describe(el));
    }
  }

  /*
    OVERLAPPING TEXT — two pieces of text printed over each other, which is
    what a squeezed table looks like on a phone ("names printed over the qty
    boxes"). None of the numbers above saw it on the Count screen; only a
    screenshot did. On screen only, neither inside the other, inside the
    drawing never, and more than a sliver of overlap each way.
  */
  const texts = all.filter(el => {
    if (!visible(el) || exempt(el)) return false;
    if (el.children.length !== 0 || !(el.textContent || "").trim())
      return false;
    const r = el.getBoundingClientRect();
    if (!(r.bottom > 0 && r.top < ih && r.right > 0 && r.left < iw))
      return false;
    // Only text a person can SEE: whatever is on top at its middle must be it
    // or inside it. Text under an open dialog is covered, not overlapping.
    const top = document.elementFromPoint(
      Math.min(iw - 1, Math.max(0, r.left + r.width / 2)),
      Math.min(ih - 1, Math.max(0, r.top + r.height / 2))
    );
    return !!top && (top === el || el.contains(top) || top.contains(el));
  });
  const overlaps: string[] = [];
  for (let i = 0; i < texts.length && overlaps.length < 12; i++) {
    const a = texts[i].getBoundingClientRect();
    for (let j = i + 1; j < texts.length; j++) {
      const ej = texts[j];
      if (texts[i].contains(ej) || ej.contains(texts[i])) continue;
      const b = ej.getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4) {
        overlaps.push(
          `${describe(texts[i]).slice(0, 40)} × ${describe(ej).slice(0, 40)}`
        );
        break;
      }
    }
  }

  const sel =
    'button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="combobox"]';
  const smallTargets: Measure["smallTargets"] = [];
  let controls = 0;
  for (const el of Array.from(document.querySelectorAll(sel))) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > ih || r.right < 0 || r.left > iw) continue;
    controls++;
    // A switch or checkbox keeps its look and gets a 44 px invisible ring
    // (index.css, ::after). Measure the ring — it is what a finger hits.
    const ring = getComputedStyle(el, "::after");
    const w =
      ring.content !== "none" && ring.position === "absolute"
        ? Math.max(r.width, parseFloat(ring.width) || 0)
        : r.width;
    const h =
      ring.content !== "none" && ring.position === "absolute"
        ? Math.max(r.height, parseFloat(ring.height) || 0)
        : r.height;
    if (w < 43.5 || h < 43.5)
      smallTargets.push({
        label: describe(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
  }

  const cutTabs: string[] = [];
  for (const list of Array.from(
    document.querySelectorAll('[role="tablist"]')
  )) {
    if (!visible(list)) continue;
    const lr = list.getBoundingClientRect();
    const left = Math.max(0, lr.left);
    const right = Math.min(iw, lr.right);
    for (const tab of Array.from(list.querySelectorAll('[role="tab"]'))) {
      if (!visible(tab)) continue;
      const r = tab.getBoundingClientRect();
      if (r.right > right + 1 || r.left < left - 1)
        cutTabs.push(
          `${describe(tab).slice(0, 60)} (${Math.round(r.left)}–${Math.round(r.right)} in ${Math.round(left)}–${Math.round(right)})`
        );
    }
  }

  return {
    innerWidth: iw,
    innerHeight: ih,
    scrollWidth: de.scrollWidth,
    sidewaysScroll: de.scrollWidth > iw + 1 || innerSideways.length > 0,
    innerSideways: innerSideways.slice(0, 12),
    tooWide: tooWide.slice(0, 12),
    overlaps,
    overflowRight: overflowRight.slice(0, 12),
    cutOffBelow: cutOffBelow.slice(0, 12),
    cutTabs,
    smallTargets,
    controls,
  };
}

export type Screen = {
  key: string;
  hash: string;
  /** Reach a state of the screen that is not its first paint (a panel open). */
  open?: (page: Page, size: DeviceSize) => Promise<void>;
};

/** A finger taps; a mouse clicks. Either way, through the real input path. */
async function press(page: Page, size: DeviceSize, locator: Locator) {
  await locator.first().waitFor({ state: "visible", timeout: 8000 });
  if (size.touch) await locator.first().tap();
  else await locator.first().click();
  await page.waitForTimeout(400);
}

/** The plan viewer's right panel, open on a tab, in whatever layout. */
async function openPlanTab(page: Page, size: DeviceSize, tab: RegExp) {
  if (size.name === "phone")
    await press(
      page,
      size,
      page.getByRole("button", { name: /Open the panel/ })
    );
  await press(page, size, page.getByRole("tab", { name: tab }));
}

export function screensFor(bidId: number): Screen[] {
  return [
    { key: "dashboard", hash: "/dashboard" },
    { key: "bid", hash: `/bids/${bidId}` },
    {
      key: "quoteapp",
      hash: `/bids/${bidId}`,
      open: async (page, size) => {
        await press(page, size, page.getByRole("button", { name: /^Send/ }));
        await press(
          page,
          size,
          page.getByRole("menuitem", { name: /For your quote app/ })
        );
      },
    },
    { key: "assemblies", hash: "/library/assemblies" },
    { key: "materials", hash: "/library/materials" },
    { key: "pricing", hash: "/library/materials?view=pricing" },
    { key: "labor", hash: "/library/labor-rates" },
    { key: "plans", hash: `/bids/${bidId}/plans` },
    {
      key: "plans-totals",
      hash: `/bids/${bidId}/plans`,
      open: (page, size) => openPlanTab(page, size, /^Totals/),
    },
    {
      key: "capture",
      hash: `/bids/${bidId}/plans`,
      open: async (page, size) => {
        await openPlanTab(page, size, /^Legend/);
        await press(
          page,
          size,
          page.locator('button:visible:text-is("Capture")')
        );
      },
    },
    { key: "count", hash: `/bids/${bidId}/count` },
    { key: "proposal", hash: `/bids/${bidId}/proposal` },
    {
      key: "proposal-print",
      hash: `/bids/${bidId}/proposal`,
      // What the printer gets: the page's own print stylesheet, applied.
      open: async page => {
        await page.emulateMedia({ media: "print" });
        await page.waitForTimeout(300);
      },
    },
    { key: "settings", hash: "/settings/pricing" },
    { key: "clients", hash: "/clients" },
  ];
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
  );
  const bidId = Number(args.bid ?? process.env.AUDIT_BID ?? 1164558);
  const openId = args.user ?? process.env.OPEN_ID ?? "e5mSTU8bQbySZsknSun5f4";
  const outDir = args.out ?? "references/device-audit";
  const only = args.only ? String(args.only).split(",") : null;
  const sizes = args.sizes
    ? SIZES.filter(s => String(args.sizes).split(",").includes(s.name))
    : SIZES;
  mkdirSync(outDir, { recursive: true });

  const browser = await launchChrome();
  const report: Record<string, Record<string, Measure & { shot: string }>> = {};
  let hard = 0;
  try {
    for (const size of sizes) {
      const page = await openAt(browser, size, openId);
      // Login screen first, on a context with no session.
      if (!only || only.includes("login")) {
        const anon = await deviceContext(browser, size);
        const lp = await anon.newPage();
        await gotoRoute(lp, "/dashboard");
        const m = await lp.evaluate(measureInPage);
        const shot = `${size.name}-login.jpg`;
        await lp.screenshot({
          path: path.join(outDir, shot),
          type: "jpeg",
          quality: 60,
          scale: "css",
        });
        (report.login ??= {})[size.name] = { ...m, shot };
        if (
          m.sidewaysScroll ||
          m.overflowRight.length ||
          m.cutOffBelow.length ||
          m.cutTabs.length
        )
          hard++;
        await anon.close();
      }
      for (const screen of screensFor(bidId)) {
        if (only && !only.includes(screen.key)) continue;
        await page.emulateMedia({ media: "screen" });
        await gotoRoute(page, screen.hash);
        if (screen.hash.endsWith("/plans")) await page.waitForTimeout(2500);
        if (screen.open) {
          const opened = await screen
            .open(page, size)
            .then(() => true)
            .catch(e => {
              console.log(
                `${size.name.padEnd(17)} ${screen.key.padEnd(11)} could not open: ${(e as Error).message.split("\n")[0]}`
              );
              return false;
            });
          if (!opened) continue;
        }
        const m = await page.evaluate(measureInPage);
        const shot = `${size.name}-${screen.key}.jpg`;
        await page.screenshot({
          path: path.join(outDir, shot),
          type: "jpeg",
          quality: 60,
          scale: "css",
        });
        // A second picture one screen further down the main scroller, since
        // a list's rows usually start below the first screen — and the rows
        // are what turns into cards on a phone.
        const scrolled = await page.evaluate(() => {
          const boxes = Array.from(document.querySelectorAll("*")).filter(
            el => {
              const s = getComputedStyle(el);
              return (
                (s.overflowY === "auto" || s.overflowY === "scroll") &&
                el.scrollHeight > el.clientHeight + 80 &&
                !el.closest("[role=dialog]")
              );
            }
          );
          const main = boxes.sort(
            (a, b) =>
              b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight
          )[0];
          if (!main) return false;
          main.scrollTop += Math.round(main.clientHeight * 0.8);
          return true;
        });
        if (scrolled) {
          await page.waitForTimeout(300);
          await page.screenshot({
            path: path.join(outDir, shot.replace(".jpg", "-2.jpg")),
            type: "jpeg",
            quality: 60,
            scale: "css",
          });
        }
        (report[screen.key] ??= {})[size.name] = { ...m, shot };
        if (
          m.sidewaysScroll ||
          m.overflowRight.length ||
          m.cutOffBelow.length ||
          m.cutTabs.length
        )
          hard++;
        const small = size.touch ? ` small=${m.smallTargets.length}` : "";
        console.log(
          `${size.name.padEnd(17)} ${screen.key.padEnd(11)} sideways=${m.sidewaysScroll ? "YES" : "no"} offRight=${m.overflowRight.length} overlap=${m.overlaps.length} cut=${m.cutOffBelow.length} tabsCut=${m.cutTabs.length}${small}/${m.controls}`
        );
      }
      await page.context().close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(`\n${hard} hard fault(s). Report: ${outDir}/report.json`);
  if (args.check && hard > 0) process.exit(1);
}

if (process.argv[1] && /deviceAudit\.mts$/.test(process.argv[1])) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
