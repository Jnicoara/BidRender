/**
 * The nav restructure's blast radius, pinned.
 *
 * Folding five screens into three retires five addresses, and a retired address
 * is the thing that breaks silently: nobody notices a bookmark landing on the
 * Dashboard until they wonder where their kits went. These tests exist so the
 * next person to move a screen has to say so out loud.
 */
import { describe, it, expect } from "vitest";
import {
  pathToRoute,
  retiredAddress,
  routeToPath,
  RETIRED_PATHS,
  ASSEMBLY_VIEWS,
  MATERIALS_VIEWS,
  SETTINGS_SECTIONS,
} from "./appRoutes";
import { NAVIGATION_TARGETS } from "@shared/navigationTargets";
import { buildChecklist } from "@shared/onboarding";

describe("current addresses", () => {
  it("lands the bare address on the Dashboard", () => {
    expect(pathToRoute("").route).toBe("dashboard");
    expect(pathToRoute("#/").route).toBe("dashboard");
    expect(pathToRoute("/dashboard").route).toBe("dashboard");
  });

  it("opens a bid by id, and its three per-bid surfaces", () => {
    expect(pathToRoute("#/bids/12")).toEqual({ route: "bids", projectId: 12 });
    expect(pathToRoute("#/bids/12/plans")).toEqual({
      route: "takeoff",
      projectId: 12,
    });
    expect(pathToRoute("#/bids/12/proposal")).toEqual({
      route: "proposal",
      projectId: 12,
    });
    expect(pathToRoute("#/bids/12/count")).toEqual({
      route: "count",
      projectId: 12,
    });
  });

  it("resolves canonical browser paths when a user refreshes or opens a shared link", () => {
    expect(pathToRoute("/settings/pricing")).toEqual({
      route: "settings",
      view: "pricing",
    });
    expect(pathToRoute("/bids/12")).toEqual({ route: "bids", projectId: 12 });
    expect(pathToRoute("/bids/12/count")).toEqual({
      route: "count",
      projectId: 12,
    });
    expect(pathToRoute("/bids/12/proposal")).toEqual({
      route: "proposal",
      projectId: 12,
    });
  });

  it("keeps the screens that stayed top-level", () => {
    expect(pathToRoute("#/clients").route).toBe("clients");
    expect(pathToRoute("#/team").route).toBe("team");
    expect(pathToRoute("#/analytics").route).toBe("analytics");
    expect(pathToRoute("#/settings").route).toBe("settings");
    expect(pathToRoute("#/settings/branding").route).toBe("settings");
    expect(pathToRoute("#/archive").route).toBe("bid-archive");
    expect(pathToRoute("#/admin").route).toBe("admin");
    expect(pathToRoute("#/library/labor-rates").route).toBe(
      "library-labor-rates"
    );
  });

  it("sends an unrecognised address to the Dashboard", () => {
    expect(pathToRoute("#/nope").route).toBe("dashboard");
    expect(pathToRoute("#/bids/not-a-number").route).toBe("dashboard");
  });

  it("ignores a trailing slash", () => {
    expect(pathToRoute("#/clients/").route).toBe("clients");
  });
});

describe("views", () => {
  it("defaults Materials to the catalog and Assemblies to assemblies", () => {
    expect(pathToRoute("#/library/materials")).toEqual({
      route: "library-materials",
      view: "catalog",
    });
    expect(pathToRoute("#/library/assemblies")).toEqual({
      route: "library-assemblies",
      view: "assemblies",
    });
  });

  it("reads every declared view off the query", () => {
    for (const view of MATERIALS_VIEWS) {
      expect(pathToRoute(`#/library/materials?view=${view}`).view).toBe(view);
    }
    for (const view of ASSEMBLY_VIEWS) {
      expect(pathToRoute(`#/library/assemblies?view=${view}`).view).toBe(view);
    }
  });

  it("falls back rather than trusting an invented view", () => {
    // The view reaches a component that switches on it. An unknown value must
    // resolve to a real tab, not render nothing.
    expect(pathToRoute("#/library/assemblies?view=wat").view).toBe(
      "assemblies"
    );
    expect(pathToRoute("#/library/materials?view=../etc").view).toBe("catalog");
  });
});

describe("retired addresses", () => {
  it("sends every folded screen somewhere real", () => {
    expect(pathToRoute("#/matdb")).toEqual({
      route: "library-materials",
      view: "pricing",
    });
    expect(pathToRoute("#/library/kits")).toEqual({
      route: "library-assemblies",
      view: "kits",
    });
    expect(pathToRoute("#/library/modifiers")).toEqual({
      route: "library-assemblies",
      view: "modifiers",
    });
    expect(pathToRoute("#/bids").route).toBe("dashboard");
  });

  it("names the canonical address so the URL can be rewritten", () => {
    expect(retiredAddress("#/matdb")).toBe("/library/materials?view=pricing");
    expect(retiredAddress("#/library/kits")).toBe(
      "/library/assemblies?view=kits"
    );
    expect(retiredAddress("#/bids")).toBe("/dashboard");
  });

  it("does not mistake a bid for the retired bids list", () => {
    // The bug this guards: matching on the first segment instead of the whole
    // path would redirect /bids/12 to the Dashboard and make every bid
    // unreachable.
    expect(retiredAddress("#/bids/12")).toBeNull();
    expect(retiredAddress("#/bids/12/plans")).toBeNull();
    expect(pathToRoute("#/bids/12").route).toBe("bids");
  });

  it("leaves a current address alone", () => {
    expect(retiredAddress("#/dashboard")).toBeNull();
    expect(retiredAddress("#/library/materials")).toBeNull();
    expect(retiredAddress("#/clients")).toBeNull();
  });

  it("resolves every retired path to a live screen, never back to itself", () => {
    for (const [from, to] of Object.entries(RETIRED_PATHS)) {
      expect(
        retiredAddress(to),
        `${from} → ${to} is itself retired`
      ).toBeNull();
      // And the destination has to parse into something other than the
      // catch-all, unless the Dashboard is genuinely where it belongs.
      expect(pathToRoute(to)).toBeTruthy();
    }
  });
});

describe("a bid opened on one line's fix (never-stuck gap 10)", () => {
  it("the print block's link opens the bid with that line's panel", () => {
    const path = routeToPath("bids", { id: 12, fixLineId: 340 });
    expect(path).toBe("/bids/12?fix=340");
    expect(pathToRoute(path)).toEqual({
      route: "bids",
      projectId: 12,
      fixLineId: 340,
    });
  });

  it("a fix id that is not a line id still opens the bid, with no panel", () => {
    for (const bad of ["", "abc", "0", "-3", "1.5"])
      expect(pathToRoute(`/bids/12?fix=${bad}`)).toEqual({
        route: "bids",
        projectId: 12,
      });
  });

  it("only the bid screen takes it", () => {
    expect(pathToRoute("/bids/12/proposal?fix=340")).toEqual({
      route: "proposal",
      projectId: 12,
    });
  });
});

describe("routeToPath", () => {
  it("round-trips every screen back to the same route", () => {
    const cases: Array<[Parameters<typeof routeToPath>[0], number?, string?]> =
      [
        ["dashboard"],
        ["clients"],
        ["team"],
        ["analytics"],
        ["settings"],
        ["admin"],
        ["bid-archive"],
        ["welcome"],
        ["library-labor-rates"],
        ["library-materials", undefined, "catalog"],
        ["library-materials", undefined, "pricing"],
        ["library-assemblies", undefined, "assemblies"],
        ["library-assemblies", undefined, "kits"],
        ["library-assemblies", undefined, "modifiers"],
        ["bids", 7],
        ["takeoff", 7],
        ["proposal", 7],
        ["count", 7],
      ];

    for (const [route, id, view] of cases) {
      const path = routeToPath(route, { id, view });
      const parsed = pathToRoute(path);
      expect(parsed.route, `${route} → ${path}`).toBe(route);
      if (id !== undefined) expect(parsed.projectId).toBe(id);
      if (view !== undefined) expect(parsed.view).toBe(view);
    }
  });

  it("keeps the default view out of the address", () => {
    // A tab strip writes the URL on every click. If the default carried a query
    // param, landing on Materials and clicking Catalog would change the address
    // without changing the screen.
    expect(routeToPath("library-materials", { view: "catalog" })).toBe(
      "/library/materials"
    );
    expect(routeToPath("library-assemblies", { view: "assemblies" })).toBe(
      "/library/assemblies"
    );
    expect(routeToPath("library-assemblies", { view: "kits" })).toBe(
      "/library/assemblies?view=kits"
    );
  });

  it("will not build a per-bid address without a bid", () => {
    expect(routeToPath("bids")).toBe("/dashboard");
    expect(routeToPath("takeoff")).toBe("/dashboard");
    expect(routeToPath("count")).toBe("/dashboard");
  });
});

/**
 * The addresses other modules advertise have to be addresses this one answers.
 *
 * `shared/navigationTargets.ts` says it in its own header: "a stale path here
 * is a dead end that looks like a working answer." The AI helper hands the user
 * a link it got from that list, and the onboarding checklist does the same with
 * hard-coded hrefs. Neither module can see the router, so nothing but a test
 * connects them — and the failure is silent, because an unrecognised address
 * lands on the Dashboard rather than erroring.
 */
describe("advertised addresses resolve", () => {
  it("sends every navigation target somewhere that is not the fallthrough", () => {
    for (const target of NAVIGATION_TARGETS) {
      const state = pathToRoute(target.path);
      // The Dashboard is a legitimate destination for the entries that name it,
      // and the catch-all for everything broken. Told apart by asking whether
      // the path was one that MEANT to go there.
      const meantForDashboard =
        target.path === "#/dashboard" || target.path === "#/";
      if (!meantForDashboard) {
        expect(
          state.route,
          `${target.id} (${target.path}) fell through to the Dashboard`
        ).not.toBe("dashboard");
      }
    }
  });

  it("keeps the view on targets that name one", () => {
    const byId = new Map(NAVIGATION_TARGETS.map(t => [t.id, t]));
    expect(pathToRoute(byId.get("kits")!.path).view).toBe("kits");
    expect(pathToRoute(byId.get("modifiers")!.path).view).toBe("modifiers");
    expect(pathToRoute(byId.get("supplier-pricing")!.path).view).toBe(
      "pricing"
    );
    expect(pathToRoute(byId.get("materials")!.path).view).toBe("catalog");
  });

  it("sends every onboarding step to a live screen", () => {
    const steps = buildChecklist({
      hasRealLaborRate: false,
      hasPricedMaterial: false,
      hasOwnAssembly: false,
      hasBidWithLines: false,
    });
    for (const step of steps) {
      // "Complete your first bid" genuinely belongs on the Dashboard — starting
      // a bid needs a bid to exist, so it is the one step whose screen cannot
      // be linked to directly. Every other step names a screen, and landing on
      // the Dashboard would mean its address had gone stale.
      if (step.href === "#/dashboard") continue;
      expect(
        pathToRoute(step.href).route,
        `${step.id} (${step.href}) fell through to the Dashboard`
      ).not.toBe("dashboard");
    }
  });

  it("keeps counting reachable, given a bid", () => {
    // /bids/:id/count replaced the Quick bid chooser. Nothing advertises it,
    // because it needs a bid — so this is the only thing pinning it down.
    expect(routeToPath("count", { id: 7 })).toBe("/bids/7/count");
    expect(pathToRoute("#/bids/7/count")).toEqual({
      route: "count",
      projectId: 7,
    });
    expect(retiredAddress("#/quickbid")).toBe("/dashboard");
  });
});

describe("settings sections", () => {
  it("defaults a bare /settings to Pricing", () => {
    // Pricing rather than whatever comes first alphabetically: it is the panel
    // that moves money, and the one carrying the "this reaches every bid"
    // warning that used to sit three sections down a very long scroll.
    expect(pathToRoute("#/settings")).toEqual({
      route: "settings",
      view: "pricing",
    });
  });

  it("reads every declared section off the path", () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(pathToRoute(`#/settings/${section}`)).toEqual({
        route: "settings",
        view: section,
      });
    }
  });

  it("falls back rather than trusting an invented section", () => {
    // The value reaches a component that switches on it, so an unknown section
    // has to resolve to a real panel rather than rendering an empty page.
    expect(pathToRoute("#/settings/nope").view).toBe("pricing");
    expect(pathToRoute("#/settings/../admin").view).toBe("pricing");
  });

  it("always spells the section out in the address", () => {
    // Unlike the library tabs, where the default view is left off. A settings
    // panel is a thing you link someone TO — the Proposal screen sends people
    // straight to branding and to tax — so "/settings" alone would not say
    // where they were going to land.
    for (const section of SETTINGS_SECTIONS) {
      expect(routeToPath("settings", { view: section })).toBe(
        `/settings/${section}`
      );
    }
    expect(routeToPath("settings")).toBe("/settings/pricing");
  });

  it("round-trips every section", () => {
    for (const section of SETTINGS_SECTIONS) {
      const path = routeToPath("settings", { view: section });
      expect(pathToRoute(path).view).toBe(section);
    }
  });
});
