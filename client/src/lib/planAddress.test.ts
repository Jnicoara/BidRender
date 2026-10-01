import { describe, expect, it } from "vitest";
import {
  isPlansAddressFor,
  planAddressHash,
  readPlanAddress,
  rememberView,
  resolvePlanAddress,
  restoreView,
} from "@/lib/planAddress";
import { pathToRoute } from "@/lib/appRoutes";

const sets = [
  { id: 11, pageCount: 4 },
  { id: 12, pageCount: null },
  { id: 13, pageCount: 9 },
];

describe("the Plans screen's address", () => {
  it("round-trips the set and sheet through the hash", () => {
    const hash = planAddressHash(7, 13, 5);
    expect(hash).toBe("#/bids/7/plans?set=13&sheet=5");
    expect(readPlanAddress(hash)).toEqual({ setId: 13, sheet: 5 });
  });

  it("still routes to the Plans screen with the query on it", () => {
    expect(pathToRoute("#/bids/7/plans?set=13&sheet=5")).toEqual({
      route: "takeoff",
      projectId: 7,
    });
  });

  it("reads nothing from an address without them, or with junk", () => {
    expect(readPlanAddress("#/bids/7/plans")).toEqual({
      setId: null,
      sheet: null,
    });
    expect(readPlanAddress("#/bids/7/plans?set=abc&sheet=-2")).toEqual({
      setId: null,
      sheet: null,
    });
    expect(readPlanAddress("#/bids/7/plans?set=3.5&sheet=0")).toEqual({
      setId: null,
      sheet: null,
    });
  });

  it("is rewritten only while it is still this bid's Plans screen", () => {
    expect(isPlansAddressFor("#/bids/7/plans?set=1&sheet=2", 7)).toBe(true);
    expect(isPlansAddressFor("#/bids/7/plans", 7)).toBe(true);
    expect(isPlansAddressFor("#/bids/7", 7)).toBe(false);
    expect(isPlansAddressFor("#/bids/70/plans", 7)).toBe(false);
    expect(isPlansAddressFor("#/dashboard", 7)).toBe(false);
  });
});

describe("which sheet a refresh opens", () => {
  it("page 5 of the third set comes back as page 5 of the third set", () => {
    expect(resolvePlanAddress({ setId: 13, sheet: 5 }, sets)).toEqual({
      setId: 13,
      page: 5,
    });
  });

  it("a deleted set falls back to the first sheet of the first set", () => {
    expect(resolvePlanAddress({ setId: 99, sheet: 5 }, sets)).toEqual({
      setId: 11,
      page: 1,
    });
  });

  it("a page past the end of its set falls back to page 1 of that set", () => {
    expect(resolvePlanAddress({ setId: 11, sheet: 5 }, sets)).toEqual({
      setId: 11,
      page: 1,
    });
  });

  it("keeps the page when the set's page count is not known yet", () => {
    expect(resolvePlanAddress({ setId: 12, sheet: 30 }, sets)).toEqual({
      setId: 12,
      page: 30,
    });
  });

  it("no address opens the first set, and no sets opens nothing", () => {
    expect(resolvePlanAddress({ setId: null, sheet: null }, sets)).toEqual({
      setId: 11,
      page: 1,
    });
    expect(resolvePlanAddress({ setId: 13, sheet: 2 }, [])).toEqual({
      setId: null,
      page: 1,
    });
  });
});

describe("zoom and position across a refresh", () => {
  const bounds = {
    viewportWidth: 800,
    viewportHeight: 600,
    contentWidth: 3000,
    contentHeight: 2000,
  };
  const view = { zoom: 1.5, x: -900, y: -500 };

  it("comes back to the same view on the same pane", () => {
    const saved = rememberView(13, 5, view, bounds);
    const back = restoreView(saved, 13, 5, bounds)!;
    expect(back.zoom).toBe(1.5);
    expect(back.x).toBeCloseTo(-900);
    expect(back.y).toBeCloseTo(-500);
  });

  it("keeps the same drawing point centred when the pane is resized", () => {
    const saved = rememberView(13, 5, view, bounds);
    const wider = { ...bounds, viewportWidth: 1000 };
    const back = restoreView(saved, 13, 5, wider)!;
    const centreX = (wider.viewportWidth / 2 - back.x) / back.zoom;
    expect(centreX).toBeCloseTo(saved.cx);
  });

  it("is ignored on another sheet, another set, or another raster", () => {
    const saved = rememberView(13, 5, view, bounds);
    expect(restoreView(saved, 13, 6, bounds)).toBeNull();
    expect(restoreView(saved, 12, 5, bounds)).toBeNull();
    expect(
      restoreView(saved, 13, 5, { ...bounds, contentWidth: 2999 })
    ).toBeNull();
  });

  it("ignores anything that is not a stored view", () => {
    expect(restoreView(null, 13, 5, bounds)).toBeNull();
    expect(restoreView("junk", 13, 5, bounds)).toBeNull();
    expect(
      restoreView({ setId: 13, page: 5, zoom: "2" }, 13, 5, bounds)
    ).toBeNull();
    expect(
      restoreView(
        { ...rememberView(13, 5, view, bounds), zoom: 0 },
        13,
        5,
        bounds
      )
    ).toBeNull();
  });
});
