import { describe, expect, it } from "vitest";
import { plansLayout } from "@/lib/plansLayout";
import { visibleTabs } from "@/lib/panelTabs";

describe("which layout the Plans screen is in", () => {
  it("a phone is the phone layout, whichever way it is held", () => {
    expect(plansLayout({ width: 390, coarse: true, portrait: true })).toBe(
      "phone"
    );
    expect(plansLayout({ width: 740, coarse: true, portrait: false })).toBe(
      "phone"
    );
  });

  it("a narrow window is the phone layout even with a mouse", () => {
    expect(plansLayout({ width: 600, coarse: false, portrait: false })).toBe(
      "phone"
    );
    expect(plansLayout({ width: 767, coarse: false, portrait: true })).toBe(
      "phone"
    );
  });

  it("a tablet held upright is the phone layout, held sideways the laptop", () => {
    // An upright iPad sits on Tailwind's md breakpoint — width alone is wrong.
    expect(plansLayout({ width: 820, coarse: true, portrait: true })).toBe(
      "phone"
    );
    expect(plansLayout({ width: 1180, coarse: true, portrait: false })).toBe(
      "laptop"
    );
  });

  it("a laptop is the laptop layout, even in a tall window", () => {
    expect(plansLayout({ width: 1536, coarse: false, portrait: false })).toBe(
      "laptop"
    );
    expect(plansLayout({ width: 900, coarse: false, portrait: true })).toBe(
      "laptop"
    );
  });
});

describe("the panel's tabs on a phone", () => {
  it("adds Sheets first, and keeps Totals before Legend and Reader", () => {
    // Totals carries the warning mark; the tabs past the edge of a 360px
    // strip are the ones scrolled out of sight, so it must not be one.
    expect(visibleTabs(true, "phone")).toEqual([
      "sheets",
      "counts",
      "runs",
      "totals",
      "legend",
      "reader",
    ]);
    expect(visibleTabs(false, "phone")).toEqual([
      "sheets",
      "counts",
      "runs",
      "totals",
      "legend",
    ]);
  });

  it("has no Sheets tab on a laptop, where the sheets have their own panel", () => {
    expect(visibleTabs(true, "laptop")).toEqual([
      "counts",
      "runs",
      "legend",
      "reader",
      "totals",
    ]);
    expect(visibleTabs(true)).not.toContain("sheets");
  });
});
