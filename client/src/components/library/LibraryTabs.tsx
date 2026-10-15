/**
 * The tab strip that replaced three nav items.
 *
 * Kits, Modifiers and Supplier Pricing each had a top-level entry in a sidebar
 * that had grown to fourteen. None of them is a separate place: a kit contains
 * assemblies and nothing else, a modifier adjusts an assembly's labor, and
 * Supplier Pricing reads and writes the SAME `materials` rows the catalog does.
 * They are lenses, so they are tabs.
 *
 * ── Order is build order, not alphabetical ───────────────────────────────────
 * Assemblies, then the bundles of them, then the thing that tunes them. A
 * modifier only means anything once you know what an assembly is, so it cannot
 * come first. Materials reads the same way: what a material IS, then what it
 * COSTS.
 *
 * Navigation is a hash write rather than a callback so the tab lands in browser
 * history — Back out of Kits returns to Assemblies, and a tab can be linked to
 * and bookmarked. The active view is passed in rather than read from the URL
 * here, so the strip re-renders with the shell instead of holding its own copy
 * of the route.
 */
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { routeToPath, type Route } from "@/lib/appRoutes";

type Tab = { view: string; label: string; title: string };

const GROUPS: Record<string, { route: Route; tabs: Tab[] }> = {
  assemblies: {
    route: "library-assemblies",
    tabs: [
      {
        view: "assemblies",
        label: "Assemblies",
        title: "Reusable recipes of materials and labor",
      },
      {
        view: "kits",
        label: "Kits",
        title: "Groups of assemblies added together",
      },
      {
        view: "modifiers",
        label: "Modifiers",
        title: "Labor adjustments for job conditions",
      },
    ],
  },
  laborRates: {
    route: "library-labor-rates",
    tabs: [
      {
        view: "rates",
        label: "Rates",
        title: "What each role costs you per hour",
      },
    ],
  },
  materials: {
    route: "library-materials",
    tabs: [
      {
        view: "catalog",
        label: "Catalog",
        title: "What a material is — name, category, unit, trade slang",
      },
      {
        view: "pricing",
        label: "Supplier pricing",
        title:
          "What a material costs — your supply house's prices, and how old",
      },
    ],
  },
};

export function LibraryTabs({
  group,
  current,
}: {
  group: keyof typeof GROUPS;
  current: string;
}) {
  const config = GROUPS[group];
  /*
    "Updates" (BidRidge starter updates, starter-offers-plan.md § 2.3) is a
    tab only while there is something in it, or while it is open: an empty
    tab on every library screen would be the nag CLAUDE.md rules out. The
    count is the server list's own length (`starterOffers.count`).
  */
  const updates = trpc.starterOffers.count.useQuery(undefined, {
    staleTime: 60_000,
  });
  if (!config) return null;
  const count = updates.data?.count ?? 0;
  const tabs: Tab[] =
    count > 0 || current === "updates"
      ? [
          ...config.tabs,
          {
            view: "updates",
            label: count > 0 ? `Updates ${count}` : "Updates",
            title: "Changes BidRidge made to starter items you use",
          },
        ]
      : config.tabs;
  // One tab is not a choice: Labor rates shows no strip until it has two.
  if (tabs.length < 2) return null;

  return (
    <div
      className="inline-flex rounded-lg border border-border p-0.5 mb-3"
      role="tablist"
      aria-label={group === "materials" ? "Material views" : "Library sections"}
    >
      {tabs.map(tab => {
        const active = tab.view === current;
        return (
          <button
            key={tab.view}
            role="tab"
            aria-selected={active}
            title={tab.title}
            onClick={() => {
              if (active) return;
              window.location.hash = routeToPath(config.route, {
                view: tab.view,
              });
            }}
            className={cn(
              "px-3 py-1 rounded-md text-xs transition-colors",
              active
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
