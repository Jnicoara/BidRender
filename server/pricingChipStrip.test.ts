/**
 * SUPPLIER PRICING'S FILTER CHIPS MUST NOT SCROLL SIDEWAYS (2026-10-13).
 *
 * At phone width the price-age chips sat in an `overflow-x-auto` strip with a
 * negative side margin: 596 px of chips in a 375-425 px window, measured by
 * `pnpm device:audit --only=pricing --sizes=phone-375,phone,phone-425`
 * (sideways=YES at all three). The last chip, "No price", is the filter that
 * finds every unpriced material, and it was past the edge.
 *
 * Now the chips wrap at every width. This reads the source because vitest
 * cannot render a React screen here; what a person sees is measured by the
 * device audit, which reported sideways=no at all three after the change.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.join(
    __dirname,
    "..",
    "client",
    "src",
    "pages",
    "MaterialDatabasePage.tsx"
  ),
  "utf8"
);

/** The className of the element that holds the AGE_FILTERS chips. */
function stripClass(): string {
  const chips = page.indexOf("{AGE_FILTERS.map(");
  expect(chips, "the price-age chips were not found").toBeGreaterThan(-1);
  const open = page.lastIndexOf("<div", chips);
  const tag = page.slice(open, chips);
  const cls = tag.match(/className="([^"]*)"/);
  expect(cls, "the chip strip has no className").not.toBeNull();
  return cls![1];
}

describe("the supplier pricing chip strip", () => {
  it("wraps at every width, not only from md: up", () => {
    const cls = stripClass().split(/\s+/);
    expect(cls).toContain("flex-wrap");
  });

  it("never scrolls sideways or bleeds past the page's gutter", () => {
    const cls = stripClass();
    expect(cls).not.toMatch(/(^|\s)overflow-x-(auto|scroll)\b/);
    expect(cls).not.toMatch(/(^|\s)-mx-/);
    expect(cls).not.toMatch(/(^|\s)(whitespace-nowrap|flex-nowrap)\b/);
  });
});
