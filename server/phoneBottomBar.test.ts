/**
 * THE PHONE'S BOTTOM BAR MUST NOT COVER THE LAST ITEM (owner, 2026-10-13).
 *
 * At 375–425 px the icon bar along the bottom was `position: fixed` over a
 * content area that ran to the bottom of the window, so the last card on
 * the bid page ("Pricing settings") stayed half hidden even scrolled all the
 * way down. Three structural facts in `BidRenderShell.tsx` keep it fixed:
 *
 *   1. the bar is an ordinary `shrink-0` row INSIDE `<main>`'s column, never
 *      fixed or absolute — so the content above ends where the bar starts;
 *   2. the shell root is `relative`, so absolutely placed `sr-only` labels
 *      cannot make the whole document scroll (which dragged the bar away);
 *   3. the Dashboard's backups banner is its own row, so it cannot push the
 *      full-height Dashboard down past the bottom edge.
 *
 * This reads the source because vitest cannot render a React screen here.
 * What a person SEES is measured by `pnpm device:audit --sizes=phone-375,
 * phone-425` ("covered" — the last item of every scroll box, scrolled to the
 * end, must be the thing on top at its own spot). Both went red on the old
 * shell.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const shell = readFileSync(
  path.join(__dirname, "..", "client", "src", "pages", "BidRenderShell.tsx"),
  "utf8"
);

/** The opening tag of the bottom bar, up to its aria-label. */
function bottomBarTag(): { start: number; tag: string } {
  // The LAST one: the laptop sidebar's <nav> carries the same label and
  // comes first in the file.
  const label = shell.lastIndexOf('aria-label="Main"');
  expect(
    label,
    "the bottom bar (aria-label Main) was not found"
  ).toBeGreaterThan(-1);
  const start = shell.lastIndexOf("<nav", label);
  return { start, tag: shell.slice(start, label) };
}

describe("the phone's bottom bar", () => {
  it("is not fixed or absolute over the content", () => {
    const { tag } = bottomBarTag();
    expect(tag).not.toMatch(/\bfixed\b/);
    expect(tag).not.toMatch(/\babsolute\b/);
    expect(tag).toMatch(/\bshrink-0\b/);
    expect(tag).toMatch(/\bmd:hidden\b/);
  });

  it("is a row inside <main>'s column, after the tab content", () => {
    const { start } = bottomBarTag();
    const mainOpen = shell.indexOf("<main");
    const mainClose = shell.indexOf("</main>");
    const content = shell.indexOf("{renderContent()}");
    expect(mainOpen).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(content);
    expect(start).toBeGreaterThan(mainOpen);
    expect(start).toBeLessThan(mainClose);
    expect(shell.slice(mainOpen, shell.indexOf(">", mainOpen))).toMatch(
      /\bflex-col\b/
    );
  });

  it("leaves the tab content free to shrink (min-h-0)", () => {
    const at = shell.indexOf("{renderContent()}");
    const open = shell.lastIndexOf("<div", at);
    expect(shell.slice(open, at)).toMatch(/\bflex-1\b[^"]*\bmin-h-0\b/);
  });
});

describe("nothing else pushes the last item off the bottom", () => {
  it("the shell root is relative, so sr-only labels cannot scroll the page", () => {
    const root = shell.match(/className="([^"]*\bh-dvh\b[^"]*)"/);
    expect(root?.[1]).toMatch(/\brelative\b/);
    expect(root?.[1]).toMatch(/\boverflow-hidden\b/);
  });

  it("the backups banner is its own row above a Dashboard that gives", () => {
    const banner = shell.indexOf("<BackupHealthBanner");
    const page = shell.indexOf("<DashboardPage");
    const bannerWrap = shell.slice(shell.lastIndexOf("<div", banner), banner);
    const pageWrap = shell.slice(shell.lastIndexOf("<div", page), page);
    expect(bannerWrap).toMatch(/\bshrink-0\b/);
    expect(pageWrap).toMatch(/\bflex-1\b/);
    expect(pageWrap).toMatch(/\bmin-h-0\b/);
  });
});
