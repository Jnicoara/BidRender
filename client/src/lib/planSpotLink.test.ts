import { describe, expect, it } from "vitest";
import { pathToRoute } from "./appRoutes";
import { readPlanAddress } from "./planAddress";
import { planSpotHash, readPlanSpot, withoutPlanSpot } from "./planSpotLink";

describe("a link to one spot on a sheet", () => {
  const spot = { pdfId: 648571, page: 5, x: 636.04, y: 1334.2 };

  it("round-trips", () => {
    const hash = planSpotHash(1728355, spot);
    expect(readPlanSpot(hash)).toEqual({ ...spot, x: 636, y: 1334.2 });
  });

  it("is a Plans address the address code reads as that set and sheet", () => {
    const hash = planSpotHash(1728355, spot);
    expect(readPlanAddress(hash)).toEqual({ setId: 648571, sheet: 5 });
    expect(pathToRoute(hash.replace(/^#/, ""))).toMatchObject({
      route: "takeoff",
      projectId: 1728355,
    });
  });

  it("asks for nothing without all four, and never reads a missing x as 0", () => {
    expect(readPlanSpot("#/bids/1/plans")).toBeNull();
    expect(readPlanSpot("#/bids/1/plans?set=2&sheet=3")).toBeNull();
    expect(readPlanSpot("#/bids/1/plans?set=2&sheet=3&y=4")).toBeNull();
    expect(readPlanSpot("#/bids/1/plans?set=0&sheet=3&x=1&y=4")).toBeNull();
    expect(readPlanSpot("#/bids/1/plans?set=2&sheet=1.5&x=1&y=4")).toBeNull();
    expect(readPlanSpot("#/bids/1/plans?set=2&sheet=3&x=0&y=0")).toEqual({
      pdfId: 2,
      page: 3,
      x: 0,
      y: 0,
    });
  });

  it("drops only the point after the jump, so the set and sheet stay", () => {
    expect(withoutPlanSpot("#/bids/1/plans?set=2&sheet=3&x=1&y=4")).toBe(
      "#/bids/1/plans?set=2&sheet=3"
    );
  });
});
