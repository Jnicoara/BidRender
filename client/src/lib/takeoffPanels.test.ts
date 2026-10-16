import { describe, it, expect } from "vitest";
import {
  PANELS_DEFAULT,
  openingPanels,
  PANEL_LIMITS,
  setPanelWidth,
  isFocusMode,
  parsePanelState,
  serialisePanelState,
  toggleFocus,
  togglePanel,
} from "./takeoffPanels";

describe("panel defaults", () => {
  it("shows a new user everything there is", () => {
    // The first impression has to teach what the screen holds. Hiding is a
    // thing you learn once you know what you are hiding.
    expect(PANELS_DEFAULT.sheets).toBe(true);
    expect(PANELS_DEFAULT.work).toBe(true);
    expect(isFocusMode(PANELS_DEFAULT)).toBe(false);
  });
});

describe("togglePanel", () => {
  it("opens and closes one panel without touching the other", () => {
    const closed = togglePanel(PANELS_DEFAULT, "sheets");
    expect(closed.sheets).toBe(false);
    expect(closed.work).toBe(true);
    expect(togglePanel(closed, "sheets").sheets).toBe(true);
  });

  it("leaves focus mode, so the focus key cannot restore a stale arrangement", () => {
    const focused = toggleFocus(PANELS_DEFAULT);
    const reopened = togglePanel(focused, "work");
    expect(isFocusMode(reopened)).toBe(false);
    expect(reopened.work).toBe(true);
    expect(reopened.sheets).toBe(false);
  });
});

describe("toggleFocus", () => {
  it("collapses both, then puts back exactly what was there", () => {
    const oneClosed = togglePanel(PANELS_DEFAULT, "sheets");
    const focused = toggleFocus(oneClosed);
    expect(focused.sheets).toBe(false);
    expect(focused.work).toBe(false);
    expect(isFocusMode(focused)).toBe(true);

    const back = toggleFocus(focused);
    expect(back).toEqual(oneClosed);
  });

  it("is the same key on and off, even from both-collapsed", () => {
    const bothClosed = togglePanel(
      togglePanel(PANELS_DEFAULT, "sheets"),
      "work"
    );
    const focused = toggleFocus(bothClosed);
    expect(isFocusMode(focused)).toBe(true);
    expect(toggleFocus(focused)).toEqual(bothClosed);
  });
});

describe("remembering the choice", () => {
  it("survives a round trip through storage", () => {
    const state = toggleFocus(togglePanel(PANELS_DEFAULT, "work"));
    expect(parsePanelState(serialisePanelState(state))).toEqual(state);
  });

  it("falls back to everything open rather than to a state nobody chose", () => {
    expect(parsePanelState(null)).toEqual(PANELS_DEFAULT);
    expect(parsePanelState("not json")).toEqual(PANELS_DEFAULT);
    expect(parsePanelState("42")).toEqual(PANELS_DEFAULT);
    expect(parsePanelState("{}")).toEqual(PANELS_DEFAULT);
  });
});

describe("panel widths", () => {
  it("clamps a drag to something usable", () => {
    const tiny = setPanelWidth(PANELS_DEFAULT, "sheets", 10);
    expect(tiny.sheetsWidth).toBe(PANEL_LIMITS.sheets.min);
    const huge = setPanelWidth(PANELS_DEFAULT, "work", 5000);
    expect(huge.workWidth).toBe(PANEL_LIMITS.work.max);
  });

  it("keeps a width through folding and focus mode", () => {
    const widened = setPanelWidth(PANELS_DEFAULT, "work", 500);
    const folded = togglePanel(widened, "work");
    expect(folded.workWidth).toBe(500);
    expect(toggleFocus(folded).workWidth).toBe(500);
    expect(toggleFocus(toggleFocus(folded))).toEqual(folded);
  });

  it("repairs a width stored under limits that no longer exist", () => {
    const stored = JSON.stringify({
      sheets: true,
      work: true,
      workWidth: 9999,
    });
    expect(parsePanelState(stored).workWidth).toBe(PANEL_LIMITS.work.max);
  });
});

describe("a narrow laptop window opens with the sheet list folded", () => {
  const laptop = (width: number) => ({ width, layout: "laptop" as const });

  it("folds the sheet list at 820 and 900 px and keeps the counted-items panel", () => {
    for (const width of [820, 900, 1100])
      expect(openingPanels(PANELS_DEFAULT, laptop(width))).toEqual({
        ...PANELS_DEFAULT,
        sheets: false,
      });
  });

  it("leaves a window with room for the drawing as stored", () => {
    // 1140 − 100 − 240 − 400 = 400 px of drawing: enough.
    expect(openingPanels(PANELS_DEFAULT, laptop(1140))).toBe(PANELS_DEFAULT);
    expect(openingPanels(PANELS_DEFAULT, laptop(1440))).toBe(PANELS_DEFAULT);
    // Narrower panels make room too: 1000 − 100 − 180 − 280 = 440.
    const slim = { ...PANELS_DEFAULT, sheetsWidth: 180, workWidth: 280 };
    expect(openingPanels(slim, laptop(1000))).toBe(slim);
  });

  it("leaves a tablet, a phone and focus mode as stored", () => {
    expect(
      openingPanels(PANELS_DEFAULT, { width: 820, layout: "tablet" })
    ).toBe(PANELS_DEFAULT);
    expect(openingPanels(PANELS_DEFAULT, { width: 390, layout: "phone" })).toBe(
      PANELS_DEFAULT
    );
    const focused = toggleFocus(PANELS_DEFAULT);
    expect(openingPanels(focused, laptop(820))).toBe(focused);
  });
});
