/**
 * Every address the app answers to, and where the retired ones now go.
 *
 * ── Why this is a module and not just code in the shell ──────────────────────
 * The nav went from fourteen top-level items to eight by folding screens into
 * each other: Kits and Modifiers became views of Assemblies, Supplier Pricing
 * became a view of Materials, and the Bids LIST became the Dashboard, which
 * already carried its search, its New bid and its archive entry.
 *
 * Folding a screen retires its address, and a retired address is the part of a
 * restructure that breaks quietly. A bookmark, a link in an email, an
 * onboarding href and every `path` in `shared/navigationTargets.ts` all point
 * at the old spelling; if any of them lands on the Dashboard with no
 * explanation, the user is told nothing and the AI navigation helper has
 * confidently sent them nowhere. So the mapping is a table with a test against
 * it, rather than comments in a switch statement.
 *
 * Pure and DOM-free on purpose — it takes a path string and returns a state, so
 * the redirects can be asserted without a browser.
 */

export type Route =
  | "dashboard"
  | "settings"
  | "library-materials"
  | "library-labor-rates"
  | "library-assemblies"
  | "bids"
  | "clients"
  | "team"
  | "analytics"
  | "count"
  | "takeoff"
  | "proposal"
  | "bid-archive"
  | "welcome"
  | "admin";

/**
 * Which lens a library screen is showing.
 *
 * These were nav items, and they are views because that is what they always
 * were: a kit contains assemblies and nothing else, a modifier adjusts an
 * assembly's labor, and Supplier Pricing reads and writes the SAME `materials`
 * rows the catalog does — it only shows different columns. Five entries for
 * three screens meant an estimator had to know which of two addresses owned the
 * field they wanted to edit.
 *
 * The view lives in the URL rather than in component state so the retired
 * addresses have somewhere real to land, and so browser Back still works when
 * moving between tabs inside one screen.
 */
export const MATERIALS_VIEWS = ["catalog", "pricing"] as const;
export type MaterialsView = (typeof MATERIALS_VIEWS)[number];

export const ASSEMBLY_VIEWS = ["assemblies", "kits", "modifiers"] as const;
export type AssemblyView = (typeof ASSEMBLY_VIEWS)[number];

/**
 * Settings, one panel at a time.
 *
 * Eight sections used to stack in a single `max-w-lg` column — theme, font
 * size, pricing defaults, branding, sales tax, proposal design, account, and a
 * permanently-disabled "Units — coming soon". The three biggest are the ones
 * that reach every bid, and the pricing defaults carry the yellow-triangle
 * warning saying so. A warning three sections down a very long scroll is a
 * warning nobody reads.
 *
 * These take a path segment (`/settings/branding`) rather than the `?view=`
 * the library tabs use, because they are genuinely separate panels rather than
 * lenses on one list — and because they get linked to: the Proposal screen
 * sends people straight to the branding and proposal panels when a document
 * still has placeholders in it.
 *
 * Pricing is first and is the default, because it is the one that moves money.
 */
export const SETTINGS_SECTIONS = [
  "pricing",
  "heights",
  "branding",
  "tax",
  "proposal",
  "display",
  "account",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export type RouteState = {
  route: Route;
  /** The bid a per-bid screen is about. Only set for bids/takeoff/proposal. */
  projectId?: number;
  /** The active tab on a screen that has them. */
  view?: string;
};

/**
 * Addresses that no longer exist, and the ones that took the job over.
 *
 * Kept explicit rather than left to the unrecognised-path fallthrough, because
 * "somewhere real" is a much weaker promise than "the right place". Following
 * one of these rewrites the address bar, so a bookmark heals itself instead of
 * staying on a URL that silently means something else.
 */
export const RETIRED_PATHS: Record<string, string> = {
  matdb: "/library/materials?view=pricing",
  "library/kits": "/library/assemblies?view=kits",
  "library/modifiers": "/library/assemblies?view=modifiers",
  // The bids LIST, not a bid. Everything it held — the search, New bid, the way
  // into the archive — is on the Dashboard already. /bids/:id is untouched.
  bids: "/dashboard",
  projects: "/dashboard",
  home: "/dashboard",
  // Quick bid's CHOOSER. Counting itself moved to /bids/:id/count, where it has
  // a bid and never has to ask which one. The Dashboard is where you pick up a
  // bid or start one, so that is where this lands.
  quickbid: "/dashboard",
};

/** Split a hash or path into its path part and its query params. */
function splitPath(path: string): { full: string; query: URLSearchParams } {
  const cleaned = path.replace(/^#\/?/, "").replace(/^\//, "");
  const [beforeQuery, ...rest] = cleaned.split("?");
  return {
    full: beforeQuery.split("#")[0].replace(/\/$/, ""),
    query: new URLSearchParams(rest.join("?")),
  };
}

/** The one value a view param may take, or the default for that screen. */
function pickView<T extends string>(
  query: URLSearchParams,
  allowed: readonly T[],
  fallback: T
): T {
  const asked = query.get("view");
  return (allowed as readonly string[]).includes(asked ?? "")
    ? (asked as T)
    : fallback;
}

/**
 * The canonical address for a retired path, or null if the path is current.
 *
 * Matched against the WHOLE path, not its first segment: `/bids` is retired but
 * `/bids/12` is a live bid, and treating them the same would make every bid
 * unreachable.
 */
export function retiredAddress(path: string): string | null {
  const { full } = splitPath(path);
  return RETIRED_PATHS[full] ?? null;
}

/** Resolve any address — current or retired — to the screen it should show. */
export function pathToRoute(path: string): RouteState {
  const { full, query } = splitPath(path);

  // Resolved first so a retired address renders the right screen on the first
  // paint, whether or not the URL has been rewritten yet.
  const retired = RETIRED_PATHS[full];
  if (retired) return pathToRoute(retired);

  const parts = full.split("/");
  const p = parts[0];

  if (p === "" || p === "dashboard") return { route: "dashboard" };
  if (p === "settings") {
    // A section this app does not have resolves to Pricing rather than to
    // nothing — same rule as an unknown ?view=, for the same reason: the value
    // reaches a component that switches on it.
    const asked = parts[1] ?? "";
    const section = (SETTINGS_SECTIONS as readonly string[]).includes(asked)
      ? asked
      : "pricing";
    return { route: "settings", view: section };
  }
  // The archive of soft-deleted BIDS. The legacy projects system had its own
  // "trash" for soft-deleted projects; that screen and its route are gone, and
  // this is the only archive left.
  if (p === "archive") return { route: "bid-archive" };
  if (p === "bids") {
    // /bids/:id opens straight into one bid, which is what the Dashboard links
    // to. The bare "/bids" case is handled by RETIRED_PATHS above; an id that
    // is not a number is an address that never existed.
    const id = parts[1] ? parseInt(parts[1], 10) : NaN;
    if (isNaN(id)) return { route: "dashboard" };
    // /bids/:id/plans is the takeoff surface for that bid.
    if (parts[2] === "plans") return { route: "takeoff", projectId: id };
    // /bids/:id/proposal is the client-facing document for that bid.
    if (parts[2] === "proposal") return { route: "proposal", projectId: id };
    // /bids/:id/count is the keyboard counting surface. Deliberately shaped
    // like /plans: both are ways of putting quantities on a bid, both need a
    // bid to mean anything, and neither is a destination on its own.
    if (parts[2] === "count") return { route: "count", projectId: id };
    return { route: "bids", projectId: id };
  }
  if (p === "clients") return { route: "clients" };
  if (p === "team") return { route: "team" };
  if (p === "analytics") return { route: "analytics" };
  if (p === "welcome") return { route: "welcome" };
  // Library § …. Bare /library lands on Materials.
  if (p === "library") {
    if (parts[1] === "labor-rates") return { route: "library-labor-rates" };
    if (parts[1] === "assemblies")
      return {
        route: "library-assemblies",
        view: pickView(query, ASSEMBLY_VIEWS, "assemblies"),
      };
    if (!parts[1] || parts[1] === "materials")
      return {
        route: "library-materials",
        view: pickView(query, MATERIALS_VIEWS, "catalog"),
      };
  }
  if (p === "admin") return { route: "admin" };
  // Anything unrecognised lands on the Dashboard — the honest destination for
  // an address that no longer exists.
  return { route: "dashboard" };
}

/** The address a given screen lives at. The inverse of pathToRoute. */
export function routeToPath(
  route: Route,
  options: { id?: number; view?: string } = {}
): string {
  const { id, view } = options;
  switch (route) {
    case "dashboard":
      return "/dashboard";
    case "bids":
      return id ? `/bids/${id}` : "/dashboard";
    case "takeoff":
      return id ? `/bids/${id}/plans` : "/dashboard";
    case "proposal":
      return id ? `/bids/${id}/proposal` : "/dashboard";
    case "count":
      return id ? `/bids/${id}/count` : "/dashboard";
    case "bid-archive":
      return "/archive";
    case "library-materials":
      // The default view is left off the address, so the catalog keeps the
      // short, memorable URL and only the pricing lens has to say so.
      return view && view !== "catalog"
        ? `/library/materials?view=${view}`
        : "/library/materials";
    case "library-labor-rates":
      return "/library/labor-rates";
    case "library-assemblies":
      return view && view !== "assemblies"
        ? `/library/assemblies?view=${view}`
        : "/library/assemblies";
    // Unlike the library tabs, the default section IS spelled out. A settings
    // panel is a place you link someone to, and "/settings" alone does not say
    // which one they will land on.
    case "settings":
      return `/settings/${view ?? "pricing"}`;
    default:
      return `/${route}`;
  }
}
