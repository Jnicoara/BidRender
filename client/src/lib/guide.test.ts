/** client/src/lib/guide.ts — which one tip guide mode shows. */
import { describe, expect, it } from "vitest";
import type { BidProgress } from "@shared/bidSteps";
import { GUIDE_DEFAULT, guideTip, parseGuideState } from "./guide";

const fresh: BidProgress = {
  sheets: 0,
  scaledSheets: 0,
  marks: 0,
  runs: 0,
  lines: 0,
  status: "Draft",
};
const base = {
  progress: fresh,
  hasBids: true,
  state: GUIDE_DEFAULT,
  planTipShowing: false,
};

describe("guideTip", () => {
  it("walks a bid through the six steps in order, from the data", () => {
    const at = (p: Partial<BidProgress>, screen: "bid" | "plans" = "bid") =>
      guideTip({ ...base, screen, progress: { ...fresh, ...p } })?.id;
    expect(at({})).toBe("step:plans");
    expect(at({ sheets: 4 })).toBe("step:scale");
    expect(at({ sheets: 4, scaledSheets: 1 })).toBe("step:count");
    // Counted on the plans, nothing sent to the bid yet: Review.
    expect(at({ sheets: 4, scaledSheets: 1, marks: 9 })).toBe("step:review");
    // Lines on the bid: Review counts as done (the step bar's rule), so Print.
    expect(at({ sheets: 4, scaledSheets: 1, marks: 9, lines: 3 })).toBe(
      "step:print"
    );
  });

  it("agrees with the step bar: a bid counted by hand is not behind", () => {
    const tip = guideTip({
      ...base,
      screen: "bid",
      progress: { ...fresh, lines: 5 },
    });
    // Plans and Scale are skipped, Count is done by hand: next is Review —
    // and REVIEW is done too once there are lines, so it is Print.
    expect(tip?.id).toBe("step:print");
    expect(tip?.action).toEqual({
      label: "Open the proposal",
      place: "proposal",
    });
  });

  it("offers a button only when the step is done somewhere else", () => {
    const onPlans = guideTip({
      ...base,
      screen: "plans",
      progress: { ...fresh, sheets: 2 },
    });
    expect(onPlans?.id).toBe("step:scale");
    expect(onPlans?.action).toBeNull();
    const onBid = guideTip({
      ...base,
      screen: "bid",
      progress: { ...fresh, sheets: 2 },
    });
    expect(onBid?.action).toEqual({ label: "Open the plans", place: "plans" });
  });

  it("does not repeat the step bar's Next button right under it", () => {
    const tip = guideTip({
      ...base,
      screen: "bid",
      progress: { ...fresh, sheets: 2 },
      stepBarShown: true,
    });
    expect(tip?.id).toBe("step:scale");
    expect(tip?.action).toBeNull();
    // Step bar turned off: the strip's button is the only way there.
    expect(
      guideTip({
        ...base,
        screen: "bid",
        progress: { ...fresh, sheets: 2 },
        stepBarShown: false,
      })?.action
    ).toEqual({ label: "Open the plans", place: "plans" });
  });

  it("mentions runs once, on the Plans screen, as optional", () => {
    const counted = { ...fresh, sheets: 2, scaledSheets: 2, marks: 4 };
    const plans = guideTip({ ...base, screen: "plans", progress: counted });
    expect(plans?.id).toBe("step:runs");
    expect(plans?.stepLabel).toMatch(/optional/);
    // Closed, it moves on to the review rather than nagging.
    const after = guideTip({
      ...base,
      screen: "plans",
      progress: counted,
      state: { off: false, hidden: ["step:runs"] },
    });
    expect(after?.id).toBe("step:review");
    // And never on the bid page, where it would be a detour.
    expect(guideTip({ ...base, screen: "bid", progress: counted })?.id).toBe(
      "step:review"
    );
  });

  it("steps aside on the Plans screen while one of Track B's tips is up", () => {
    expect(
      guideTip({ ...base, screen: "plans", planTipShowing: true })
    ).toBeNull();
    // Only there: a B tip cannot be up on another screen.
    expect(guideTip({ ...base, screen: "bid", planTipShowing: true })?.id).toBe(
      "step:plans"
    );
  });

  it("says nothing when off, and nothing for a tip closed with ×", () => {
    expect(
      guideTip({ ...base, screen: "bid", state: { off: true, hidden: [] } })
    ).toBeNull();
    expect(
      guideTip({
        ...base,
        screen: "bid",
        state: { off: false, hidden: ["step:plans"] },
      })
    ).toBeNull();
  });

  it("on the Dashboard, speaks only before the first bid", () => {
    expect(
      guideTip({ ...base, screen: "dashboard", progress: null, hasBids: false })
        ?.id
    ).toBe("start");
    expect(
      guideTip({ ...base, screen: "dashboard", progress: null, hasBids: true })
    ).toBeNull();
    // Still loading is not "no bids".
    expect(
      guideTip({ ...base, screen: "dashboard", progress: null, hasBids: null })
    ).toBeNull();
  });

  it("on the Count screen with nothing counted, talks about counting by hand", () => {
    const tip = guideTip({ ...base, screen: "count" });
    expect(tip?.id).toBe("count-by-hand");
    expect(tip?.body).not.toMatch(/upload/i);
    // Once something is counted, the usual next step (Print here).
    expect(
      guideTip({ ...base, screen: "count", progress: { ...fresh, lines: 2 } })
        ?.id
    ).toBe("step:print");
  });

  it("tells a viewer nothing: every step is one they cannot take", () => {
    expect(guideTip({ ...base, screen: "bid", canEdit: false })).toBeNull();
    expect(
      guideTip({
        ...base,
        screen: "dashboard",
        progress: null,
        hasBids: false,
        canEdit: false,
      })
    ).toBeNull();
  });

  it("is quiet off the bid screens and while a bid is loading", () => {
    expect(guideTip({ ...base, screen: "other" })).toBeNull();
    expect(guideTip({ ...base, screen: "bid", progress: null })).toBeNull();
  });

  it("after it has gone out, says what to do when the answer comes back", () => {
    const sent = {
      ...fresh,
      sheets: 1,
      scaledSheets: 1,
      marks: 1,
      lines: 1,
      status: "Submitted",
    };
    expect(guideTip({ ...base, screen: "bid", progress: sent })?.id).toBe(
      "sent"
    );
  });

  it("uses plain words: no internal names on screen", () => {
    const words = ["step:plans", "step:scale", "step:count"].map(() => "");
    for (const p of [
      fresh,
      { ...fresh, sheets: 1 },
      { ...fresh, sheets: 1, scaledSheets: 1 },
    ]) {
      const tip = guideTip({ ...base, screen: "bid", progress: p })!;
      words.push(tip.title, tip.body);
    }
    const text = words.join(" ");
    for (const jargon of [
      "takeoff",
      "stamp",
      "group",
      "snapshot",
      "route",
      "procedure",
    ])
      expect(text.toLowerCase()).not.toContain(jargon);
  });
});

describe("parseGuideState", () => {
  it("reads anything unreadable as on, with nothing closed", () => {
    for (const raw of [null, undefined, "x", 7, [], { off: "yes" }])
      expect(parseGuideState(raw)).toEqual(GUIDE_DEFAULT);
    expect(parseGuideState({ off: true, hidden: ["a", 3, "b"] })).toEqual({
      off: true,
      hidden: ["a", "b"],
    });
  });
});
