import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { buildFixturePlan, PAGE } from "./fixturePlan";

/**
 * Every bid the smoke test makes is named with this prefix, so the sweep can
 * find what a crashed run left behind — and nothing else.
 */
export const THROWAWAY_PREFIX = "CI smoke";

/** Captured symbols the test makes, also swept. */
export const SYMBOL_PREFIX = "CI ";

/** Call a tRPC procedure as the signed-in smoke account. */
export async function trpc<T = unknown>(
  request: APIRequestContext,
  proc: string,
  input?: unknown,
  mutation = false
): Promise<T> {
  const body = { json: input ?? null };
  const response = mutation
    ? await request.post(`/api/trpc/${proc}`, { data: body })
    : await request.get(
        `/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(body))}`
      );
  const json = await response.json();
  if (json.error) {
    throw new Error(
      `${proc} failed: ${json.error.json?.message ?? response.status()}`
    );
  }
  return json.result.data.json as T;
}

/** A bid named for this run, so a sweep can tell it apart. */
export async function createThrowawayBid(
  request: APIRequestContext,
  label: string
): Promise<number> {
  const name = `${THROWAWAY_PREFIX} ${label} ${new Date().toISOString().slice(0, 19)}`;
  const bid = await trpc<{ id: number }>(
    request,
    "bids.create",
    { name },
    true
  );
  return bid.id;
}

/** Unlock if locked, then archive — the app's own delete. */
export async function discardBid(request: APIRequestContext, bidId: number) {
  await trpc(request, "bids.unlockQuantities", { bidId }, true).catch(() => {});
  await trpc(request, "bids.archive", { id: bidId }, true);
}

type BidSummary = { id: number; name: string };

/**
 * Archive every live "CI smoke…" bid and remove every "CI …" captured symbol
 * on this account. Only this account's rows, only the prefixes this test
 * writes; runs never overlap (one worker, one workflow at a time).
 */
export async function sweepLeftovers(request: APIRequestContext) {
  const listed = await trpc<BidSummary[] | { items: BidSummary[] }>(
    request,
    "bids.list"
  ).catch(() => [] as BidSummary[]);
  const bids = Array.isArray(listed) ? listed : (listed.items ?? []);
  for (const bid of bids) {
    if (bid.name?.startsWith(THROWAWAY_PREFIX))
      await discardBid(request, bid.id);
  }
  const symbols = await trpc<{ id: number; label: string }[]>(
    request,
    "takeoffStamps.symbols"
  ).catch(() => []);
  for (const symbol of symbols) {
    // Any case: "Reset to original" can leave "ci duplex" in lower case.
    if (symbol.label?.toUpperCase().startsWith(SYMBOL_PREFIX)) {
      await trpc(
        request,
        "takeoffStamps.removeSymbol",
        { id: symbol.id },
        true
      );
    }
  }
}

/** Open a bid's Plans screen and wait for the sheet to be drawn. */
export async function openPlans(page: Page, bidId: number) {
  await page.goto(`/#/bids/${bidId}/plans`);
  // The title is there with or without a plan; the tabs only come with one.
  await expect(page.getByText(/^Plans — /).first()).toBeVisible({
    timeout: 90_000,
  });
}

/** Upload the two-sheet fixture through the screen's own file input. */
export async function uploadFixturePlan(page: Page) {
  await page.locator("input[type=file][accept*='pdf']").setInputFiles({
    name: "ci-smoke-plan.pdf",
    mimeType: "application/pdf",
    buffer: buildFixturePlan(),
  });
  await expect(sheetCanvas(page)).toBeVisible({ timeout: 90_000 });
}

/** The rendered drawing of the open sheet. */
export function sheetCanvas(page: Page) {
  return page.locator("canvas.bg-white").first();
}

/** Screen position of a PDF point (origin bottom-left) on the open sheet. */
export async function sheetPoint(page: Page, at: { x: number; y: number }) {
  const box = await sheetCanvas(page).boundingBox();
  if (!box) throw new Error("the sheet is not drawn");
  const scale = box.width / PAGE.width;
  return { x: box.x + at.x * scale, y: box.y + (PAGE.height - at.y) * scale };
}

/** Click (or tap, on a touch project) a point on the drawing. */
export async function placeAt(
  page: Page,
  at: { x: number; y: number },
  touch = false
) {
  const p = await sheetPoint(page, at);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

/** Drag a box between two PDF points, as Capture asks for. */
export async function dragBox(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  const a = await sheetPoint(page, from);
  const b = await sheetPoint(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

/** The "This sheet: N marks · N items" line pinned above every tab. */
export function thisSheetLine(page: Page) {
  return page.getByText(/^This sheet: \d+ marks?/).first();
}

/**
 * What a person would LOSE on this screen: text pushed below the bottom edge
 * with nothing to scroll to it, or a page that scrolls sideways.
 *
 * The rule CLAUDE.md describes ("Nothing important may sit under the bottom
 * edge"): walk every element that holds text; flag it when its bottom is past
 * the window and no ancestor, and not the page itself, can scroll down to it.
 * Plus a sideways page scroll, which on a phone hides the right edge.
 *
 * ── Measured against the SCREEN, not `innerWidth` ──────────────────────────
 * On a phone, content wider than the screen does not clip: the browser
 * widens the layout and zooms the whole page out to fit. `innerWidth` follows
 * that widening (726px on a 390px screen, measured 2026-10-01), so a check
 * against it can never see the fault. `documentElement.clientWidth` stays the
 * width the page asked for in its viewport tag — the screen.
 */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.scrollingElement ?? document.documentElement;
    const screenW = document.documentElement.clientWidth;
    const screenH = document.documentElement.clientHeight;
    if (root.scrollWidth > screenW + 1) {
      problems.push(
        `page is wider than the screen: ${root.scrollWidth}px on a ${screenW}px screen (a phone zooms out or scrolls sideways)`
      );
    }
    const pageScrolls = root.scrollHeight > screenH + 1;
    const canScrollY = (el: Element) => {
      const style = getComputedStyle(el);
      return (
        /(auto|scroll)/.test(style.overflowY) &&
        el.scrollHeight > el.clientHeight + 1
      );
    };
    const canScrollX = (el: Element) => {
      const style = getComputedStyle(el);
      return (
        /(auto|scroll)/.test(style.overflowX) &&
        el.scrollWidth > el.clientWidth + 1
      );
    };
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const el = node.parentElement;
      if (!text || !el || seen.has(el)) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (el.closest("[aria-hidden='true'], [hidden], .sr-only")) continue;
      // Cut off at the RIGHT edge. The shell clips sideways overflow, so the
      // page never scrolls sideways — the text past the edge is simply gone.
      // A truncating label (text-overflow: ellipsis) is clipped on purpose.
      if (
        rect.left < screenW &&
        rect.right > screenW + 1 &&
        style.textOverflow !== "ellipsis"
      ) {
        let reachableX = false;
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (canScrollX(a)) {
            reachableX = true;
            break;
          }
        }
        if (!reachableX) {
          problems.push(
            `"${text.slice(0, 40)}" runs ${Math.round(rect.right - screenW)}px past the right edge with nothing to scroll to it`
          );
        }
      }
      if (rect.bottom <= screenH + 1) continue;
      if (pageScrolls) continue;
      let reachable = false;
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (canScrollY(a)) {
          reachable = true;
          break;
        }
      }
      if (!reachable) {
        problems.push(
          `"${text.slice(0, 40)}" sits ${Math.round(rect.bottom - screenH)}px below the bottom edge with nothing to scroll to it`
        );
      }
    }
    return problems.slice(0, 10);
  });
}
