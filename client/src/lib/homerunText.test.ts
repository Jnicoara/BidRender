import { describe, expect, it } from "vitest";
import {
  bendsWords,
  homerunBreakdown,
  homerunSummaryLine,
  methodText,
  refusalText,
  stepExtraBends,
} from "./homerunText";
import {
  homerunFootage,
  resolveHomerunMethod,
  type HomerunInput,
} from "@shared/homerunFootage";

function input(over: Partial<HomerunInput> = {}): HomerunInput {
  return {
    devices: [{ id: 1, x: 720, y: 0, kind: "receptacle", heightInches: 18 }],
    leavingDeviceId: null,
    panelSpot: { x: 0, y: 0 },
    scaleRatio: 48,
    method: resolveHomerunMethod({ area: null, bid: null }),
    ceiling: { inches: 120, source: "sheet" },
    panelHeightInches: 72,
    routingPct: 0.15,
    wireExtraPct: 0.1,
    conduitExtraPct: 0.05,
    makeupPanelInches: 60,
    conductorCount: 2,
    groundCount: 1,
    overrideFt: null,
    confirmed: false,
    traced: false,
    ...over,
  };
}

function computed(over: Partial<HomerunInput> = {}) {
  const h = homerunFootage(input(over));
  if (h.state !== "computed") throw new Error(h.state);
  return h;
}

describe("the breakdown adds up to its total", () => {
  it("measured: run + up + down", () => {
    expect(homerunBreakdown(computed(), "mark-typed")).toBe(
      "52.5 ft — 40 ft run + 8.5 ft up + 4 ft down at the panel"
    );
  });

  it("a minimum says what was measured", () => {
    const h = computed({
      method: resolveHomerunMethod({
        area: null,
        bid: { method: "measuredMin", averageFt: null, minimumFt: 50 },
      }),
    });
    expect(homerunBreakdown(h, "mark-typed")).toBe(
      "62.5 ft — 50 ft minimum (measured 40 ft) + 8.5 ft up + 4 ft down at the panel"
    );
  });

  it("a drop with no height is SAID, never a zero", () => {
    expect(
      homerunBreakdown(computed({ panelHeightInches: null }), "mark-typed")
    ).toBe("48.5 ft — 40 ft run + 8.5 ft up + down at the panel not counted");
  });

  it("a typed length says so", () => {
    expect(homerunBreakdown(computed({ overrideFt: 75 }), "mark-typed")).toBe(
      "75 ft — typed"
    );
  });
});

describe("refusals name their fix", () => {
  it("panel and scale", () => {
    expect(refusalText("no-panel-spot", "2B")).toBe(
      "Place panel 2B on this sheet to measure it"
    );
    expect(refusalText("no-scale", "2B")).toMatch(/scale/);
  });
});

describe("the summary line (plan § 7)", () => {
  it("method, routing, count and the unconfirmed tally", () => {
    expect(
      homerunSummaryLine({
        method: resolveHomerunMethod({ area: null, bid: null }),
        routing: { pct: 0.15, applied: true },
        counted: 12,
        unconfirmed: 3,
        sheetsDiffering: 2,
      })
    ).toBe(
      "Homeruns: Measured, +15% routing (2 sheets on their own method) · 12 homeruns + 3 unconfirmed"
    );
  });

  it("says when no routing is applied rather than showing 0%", () => {
    expect(
      homerunSummaryLine({
        method: resolveHomerunMethod({
          area: null,
          bid: { method: "average", averageFt: 30, minimumFt: null },
        }),
        routing: { pct: 0, applied: false },
        counted: 1,
        unconfirmed: 0,
        sheetsDiffering: 0,
      })
    ).toBe("Homeruns: Average 30 ft, no routing added · 1 homerun");
  });

  it("an area's own method is labelled", () => {
    expect(
      methodText(
        resolveHomerunMethod({
          area: { method: "average", averageFt: 20, minimumFt: null },
          bid: null,
        })
      )
    ).toBe("Average 20 ft, this sheet");
  });
});

describe("the up-drop says when it is a default height (owner, 2026-10-07)", () => {
  it("a type's height says so; the device's own does not", () => {
    expect(homerunBreakdown(computed(), "shipped")).toBe(
      "52.5 ft — 40 ft run + 8.5 ft up (default height) + 4 ft down at the panel"
    );
    expect(homerunBreakdown(computed(), "company")).toMatch(
      /8\.5 ft up \(default height\)/
    );
    expect(homerunBreakdown(computed(), "mark-typed")).not.toMatch(/default/);
  });

  it("a device nobody has said the type of names that fix", () => {
    const h = computed({
      devices: [{ id: 1, x: 720, y: 0, kind: null, heightInches: null }],
    });
    expect(homerunBreakdown(h, null)).toBe(
      "44 ft — 40 ft run + up not counted — device type not said + 4 ft down at the panel"
    );
  });
});

describe("the extra-bends stepper (0131)", () => {
  it("steps from the starter the bid already counts, never from 0", () => {
    // Unset is counted as 1: "+" means 2 and "−" means 0, not 1 and −1.
    expect(stepExtraBends(null, 1, 1, 4)).toBe(2);
    expect(stepExtraBends(null, 1, -1, 4)).toBe(0);
  });

  it("writes nothing at either end of the range", () => {
    expect(stepExtraBends(0, 1, -1, 4)).toBeNull();
    expect(stepExtraBends(4, 1, 1, 4)).toBeNull();
    expect(stepExtraBends(3, 1, 1, 4)).toBe(4);
  });

  it("says one bend and several", () => {
    expect(bendsWords(1)).toBe("1 extra bend");
    expect(bendsWords(0)).toBe("0 extra bends");
    expect(bendsWords(3)).toBe("3 extra bends");
  });
});
