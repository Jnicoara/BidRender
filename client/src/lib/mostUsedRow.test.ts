/**
 * When the "Most used" row shows (@/lib/mostUsedRow) — and that BOTH
 * assembly pickers render it through the one component, so Quick bid and
 * the bid screen cannot drift (owner, 2026-10-07: "the same row").
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { showMostUsed } from "./mostUsedRow";

const item = [{ id: 1, name: "Duplex", bids: 3 }];

describe("showMostUsed", () => {
  it("shows when the search box is empty and there is something to show", () => {
    expect(showMostUsed("", item)).toBe(true);
    expect(showMostUsed("   ", item)).toBe(true);
  });
  it("hides while the person is typing", () => {
    expect(showMostUsed("dup", item)).toBe(false);
  });
  it("shows NOTHING when there is nothing — the under-3-bids case", () => {
    expect(showMostUsed("", [])).toBe(false);
  });
});

describe("both assembly pickers use the one row", () => {
  const page = (name: string) =>
    readFileSync(resolve(__dirname, "../pages", name), "utf8");
  for (const name of ["BidsPage.tsx", "QuickBidPage.tsx"]) {
    it(`${name} renders <MostUsedRow> from the shared component`, () => {
      const src = page(name);
      expect(src).toMatch(
        /import \{ MostUsedRow \} from "@\/components\/MostUsedRow"/
      );
      expect(src).toMatch(/<MostUsedRow\b/);
      expect(src).toMatch(/assemblies\.mostUsed\.useQuery\(/);
      // Never a second hand-built copy of the row.
      expect(src).not.toMatch(/>\s*Most used\s*</);
    });
  }
});
