/**
 * Everywhere the navigation helper is allowed to send someone.
 *
 * ── A closed list, enforced on the server ────────────────────────────────────
 * The helper is an LLM, and the thing an LLM will eventually do is name a
 * destination that does not exist — a plausible route, confidently wrong. So it
 * does not get to return a URL. It picks an ID out of this list, and the server
 * looks that ID up here before anything reaches the client; anything unknown is
 * dropped and the answer degrades to plain text.
 *
 * That is the whole security model and it is deliberately boring: the model
 * chooses BETWEEN fixed options, it never constructs one. Adding a destination
 * is adding an entry here — and only here, so there is one list to audit rather
 * than a prompt and a validator that can disagree.
 *
 * `path` values are the app's real hash routes (see pathToRoute in
 * BidRenderShell). Keep them in step; a stale path here is a dead end that looks
 * like a working answer.
 */

export type NavigationTarget = {
  id: string;
  /** What the user sees offered to them. */
  label: string;
  /** The real hash route. */
  path: string;
  /**
   * What this screen is for, in the words a user would use.
   *
   * This text is what the model actually matches against, so it is written for
   * recall rather than accuracy — it names the tasks people ask about, not the
   * features the screen has.
   */
  purpose: string;
};
export const NAVIGATION_TARGETS: NavigationTarget[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "#/dashboard",
    purpose:
      "The overview of every bid and where things stand, and where a new one starts. All your bids and estimates — open an existing bid, check its status, see what you have quoted. The home screen.",
  },
  {
    /**
     * Kept pointing at the Dashboard, which absorbed the Bids list.
     *
     * The id stays `bids` even though the path moved: the id is what the model
     * names, "take me to my bids" is one of the likeliest things a lost user
     * says, and retiring the id would turn the app's most common navigation
     * request into a text-only answer.
     */
    id: "bids",
    label: "Bids",
    path: "#/dashboard",
    purpose:
      "Find one bid out of hundreds by job name, client or address. See what is in draft, out for bid, won or lost.",
  },
  {
    /**
     * Same reasoning as `bids`: the id stays, the path moved.
     *
     * Counting now lives at /bids/:id/count, which needs a bid and so cannot
     * be linked to from here. The Dashboard is where a bid gets picked up or
     * started, and both ways in are the first thing on it.
     */
    id: "quick-bid",
    label: "Quick bid",
    path: "#/dashboard",
    purpose:
      "Build a bid fast by adding assemblies and quantities, with no plan takeoff. The quickest way to price a job or start a new estimate.",
  },
  {
    id: "clients",
    label: "Clients",
    path: "#/clients",
    purpose:
      "The customers you bid for — their contact details, phone number and address. Add a customer, or see which bids belong to one.",
  },
  {
    id: "materials",
    label: "Materials",
    path: "#/library/materials",
    purpose:
      "The material catalog assemblies are built from. Add a material, edit its unit or category, set trade slang so it can be found.",
  },
  {
    id: "supplier-pricing",
    label: "Supplier pricing",
    path: "#/library/materials?view=pricing",
    purpose:
      "Put your supply house's prices on the catalog, import a price list, and find the prices nobody has checked in a while. What a material costs, and how old that figure is.",
  },
  {
    id: "labor-rates",
    label: "Labor rates",
    path: "#/library/labor-rates",
    purpose:
      "Set or edit hourly and salaried labor rates for roles like apprentice, journeyman, foreman. Change what an hour costs. Crew pay rates.",
  },
  {
    id: "assemblies",
    label: "Assemblies",
    path: "#/library/assemblies",
    purpose:
      "Reusable recipes — a receptacle, a switch, a light — combining materials and labor hours. Build, edit or price an assembly.",
  },
  {
    id: "kits",
    label: "Kits",
    path: "#/library/assemblies?view=kits",
    purpose:
      "Groups of assemblies bundled together to drop onto a bid in one go. A bedroom package, a bathroom package.",
  },
  {
    id: "modifiers",
    label: "Modifiers",
    path: "#/library/assemblies?view=modifiers",
    purpose:
      "Percentage adjustments to labor for conditions like working at height, overtime, or difficult access.",
  },
  {
    id: "bid-archive",
    label: "Bid archive",
    path: "#/archive",
    purpose:
      "Archived bids, and where to restore one that was removed by mistake before it is permanently deleted.",
  },
  {
    /**
     * Listed for everybody, even though only owners and admins may open it.
     *
     * The helper has no company scope to filter on — it is `protectedProcedure`
     * and reads nothing, which is what keeps it cheap and unprivileged. Sending
     * an estimator here costs them one click and a sentence explaining that the
     * company's overall figures are the owner's to share; leaving it out would
     * cost the owner — the person this screen is FOR — the only question the
     * helper is likely to be asked about it.
     */
    id: "analytics",
    label: "Performance",
    path: "#/analytics",
    purpose:
      "How the business is doing. Win rate, how many bids were won or lost, hit rate over time, whether jobs are making the margin they were quoted at, profitability by trade, which jobs ran over.",
  },
  {
    id: "crew",
    label: "Crew",
    path: "#/team",
    purpose:
      "Who is in this company and what they are allowed to do. Invite someone, change a role, remove access.",
  },
  {
    /**
     * Settings is six panels now, so the helper names the one that answers the
     * question rather than dropping everyone at the same door. "Where do I
     * change my markup" and "how do I put my logo on a proposal" are different
     * questions and used to get the same answer.
     */
    id: "settings",
    label: "Company defaults",
    path: "#/settings/pricing",
    purpose:
      "Company-wide pricing defaults — overhead, profit, markup, target margin and the productivity factor. What every new bid starts from.",
  },
  {
    id: "branding",
    label: "Branding",
    path: "#/settings/branding",
    purpose:
      "Your company name, address, licence number, phone and logo, as they appear on a proposal and everything else you send out.",
  },
  {
    id: "sales-tax",
    label: "Sales tax",
    path: "#/settings/tax",
    purpose:
      "Turn sales tax on, set the rates for your tax areas, and choose whether materials, labor or both are taxable.",
  },
  {
    id: "proposal-design",
    label: "Proposal design",
    path: "#/settings/proposal",
    purpose:
      "How a proposal looks — layout, accent colour, which sections print, your standard terms and how long a price stands.",
  },
  {
    id: "display",
    label: "Display",
    path: "#/settings/display",
    purpose:
      "Light or dark theme, and how big the text is. Make the app easier to read on a big monitor or at arm's length.",
  },
  {
    id: "account",
    label: "Account",
    path: "#/settings/account",
    purpose: "Who you are signed in as, and how to sign out.",
  },
];

const BY_ID = new Map(NAVIGATION_TARGETS.map(t => [t.id, t]));

/** Every id the helper may name. Used to build the tool's enum. */
export const NAVIGATION_TARGET_IDS = NAVIGATION_TARGETS.map(t => t.id);

/**
 * Resolve an id the model produced, or null if it invented one.
 *
 * The null case is the point of this function. It is expected traffic, not an
 * error: the caller turns it into a text-only answer, which is a worse answer
 * than a working link and a far better one than sending a lost user to a route
 * that does not exist.
 */
export function resolveNavigationTarget(
  id: string | null | undefined
): NavigationTarget | null {
  if (!id) return null;
  return BY_ID.get(id.trim()) ?? null;
}
