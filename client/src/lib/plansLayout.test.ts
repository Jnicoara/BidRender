import { describe, expect, it } from "vitest";
import { plansLayout } from "@/lib/plansLayout";
import { visibleTabs } from "@/lib/panelTabs";

describe("which layout the Plans screen is in", () => {
  it("a phone is the phone layout, whichever way it is held", () => {
    expect(
      plansLayout({ width: 390, height: 844, coarse: true, portrait: true })
    ).toBe("phone");
    expect(
      plansLayout({ width: 740, height: 360, coarse: true, portrait: false })
    ).toBe("phone");
    // A big phone on its side is wider than 768 and still has no room for a
    // panel beside the drawing: the SHORT side is what makes it a phone.
    expect(
      plansLayout({ width: 932, height: 430, coarse: true, portrait: false })
    ).toBe("phone");
  });

  it("a narrow window is the phone layout even with a mouse", () => {
    expect(plansLayout({ width: 600, coarse: false, portrait: false })).toBe(
      "phone"
    );
    expect(plansLayout({ width: 767, coarse: false, portrait: true })).toBe(
      "phone"
    );
  });

  it("a tablet is the tablet layout held EITHER way (device brief, 2026-10-01)", () => {
    // Overrides owner's answer 5 of the phone plan, where upright was the
    // phone layout: a tablet now does everything, panel beside the drawing.
    expect(
      plansLayout({ width: 820, height: 1180, coarse: true, portrait: true })
    ).toBe("tablet");
    expect(
      plansLayout({ width: 1180, height: 820, coarse: true, portrait: false })
    ).toBe("tablet");
    // A small Android tablet upright.
    expect(
      plansLayout({ width: 800, height: 1280, coarse: true, portrait: true })
    ).toBe("tablet");
  });

  it("a touch laptop is still judged by its pointer, not its screen", () => {
    expect(
      plansLayout({ width: 1536, height: 864, coarse: false, portrait: false })
    ).toBe("laptop");
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

  it("a tablet has the phone's tabs: its sheets are a tab, not a second panel", () => {
    expect(visibleTabs(true, "tablet")).toEqual(visibleTabs(true, "phone"));
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
