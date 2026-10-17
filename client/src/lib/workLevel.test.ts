import { describe, expect, it } from "vitest";
import { pathToRoute } from "@/lib/appRoutes";
import {
  WORK_LEVELS,
  levelFor,
  levelLists,
  levelOf,
  type WorkLevel,
} from "@/lib/workLevel";

describe("user levels hide menu entries, never a bid's totals or print", () => {
  it("every level reaches a bid, its count, its plans and its proposal", () => {
    for (const level of WORK_LEVELS)
      for (const route of ["bids", "count", "takeoff", "proposal"] as const)
        expect([level, route, levelLists(level, route)]).toEqual([
          level,
          route,
          true,
        ]);
  });

  it("the real per-bid addresses resolve to screens every level lists", () => {
    for (const path of [
      "/bids/7",
      "/bids/7/count",
      "/bids/7/plans",
      "/bids/7/proposal",
    ]) {
      const { route } = pathToRoute(path);
      for (const level of WORK_LEVELS)
        expect([path, level, levelLists(level, route)]).toEqual([
          path,
          level,
          true,
        ]);
    }
  });

  it("Takeoff lists no clients, labor rates or performance; Estimate no performance", () => {
    const hidden = (level: WorkLevel) =>
      (["clients", "library-labor-rates", "analytics"] as const).filter(
        route => !levelLists(level, route)
      );
    expect(hidden("takeoff")).toEqual([
      "clients",
      "library-labor-rates",
      "analytics",
    ]);
    expect(hidden("estimate")).toEqual(["analytics"]);
    expect(hidden("pro")).toEqual([]);
  });

  it("names the level a hidden screen belongs to", () => {
    expect(levelFor("clients")).toBe("estimate");
    expect(levelFor("analytics")).toBe("pro");
  });

  it("unset, unknown or switched off is Pro — today's menu, unchanged", () => {
    expect(levelOf(null, true)).toBe("pro");
    expect(levelOf(undefined, true)).toBe("pro");
    expect(levelOf("wizard", true)).toBe("pro");
    expect(levelOf("takeoff", false)).toBe("pro");
    expect(levelOf("takeoff", true)).toBe("takeoff");
  });
});
