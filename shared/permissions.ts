/**
 * Who may do what, as data rather than as scattered `if` statements.
 *
 * ── Read this before adding a check anywhere else ────────────────────────────
 * There are exactly two questions this app asks about permission, and they are
 * different questions with different answers:
 *
 *   1. WHOSE DATA IS THIS?  Answered by the request scope, not by this file.
 *      Every row in the app is filed under a single user id — the company
 *      owner's — and a member of that company reads and writes under that same
 *      id. That is `scope.dataUserId`, resolved once per request in
 *      `server/_core/companyScope.ts`. Nothing here can substitute for it: a
 *      capability says what an action IS, never which company's rows it
 *      touches.
 *
 *   2. MAY THIS PERSON DO IT?  Answered here, by capability.
 *
 * Conflating the two is the classic access-control bug, and this codebase has
 * had its own version of it: a health check found procedures that checked
 * whether you were logged in but not whether the row was yours. A capability
 * check alone would not have caught that, which is why scoping is enforced
 * separately and mechanically rather than by remembering.
 *
 * ── Capabilities are a list, and roles are a mapping onto it ─────────────────
 * Adding a permission means adding a string to CAPABILITIES and naming it in
 * the roles that should have it. It never means writing a new kind of check.
 * `ROLE_CAPABILITIES` is exhaustive by type: a new role will not compile until
 * every capability has been considered for it.
 *
 * ── Access tier is a different axis from company role ────────────────────────
 * A role says what you may do inside your company. A tier says which of the
 * product's features exist for you at all. They are orthogonal on purpose: a
 * tester is internal whichever company they belong to, and an owner is an owner
 * whether or not they see unreleased work. Folding the two into one enum is
 * what forces a rebuild the first time an internal user is a viewer somewhere.
 */

// ─── Company roles ────────────────────────────────────────────────────────────

/**
 * What someone is within one company.
 *
 * Ordered from most to least privileged, and that order is load-bearing:
 * `outranks` uses it to stop an admin removing an owner, which is the one
 * privilege-escalation shape this model actually has.
 */
export const COMPANY_ROLES = ["owner", "admin", "estimator", "viewer"] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

/** Whether `a` sits strictly above `b`. Equal roles do not outrank each other. */
export function outranks(a: CompanyRole, b: CompanyRole): boolean {
  return COMPANY_ROLES.indexOf(a) < COMPANY_ROLES.indexOf(b);
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

/**
 * Every distinct thing a member can be allowed to do.
 *
 * Split view/edit rather than one capability per screen, because the real
 * question a contractor asks is "can the new guy change my prices", not "can
 * he open the pricing page". Adding a screen usually needs no new capability.
 */
export const CAPABILITIES = [
  /** Open bids, their line items, totals and proposals. */
  "bids.view",
  /** Create, price, edit and archive bids; run takeoff; export. */
  "bids.edit",
  /** Permanently delete an archived bid. Separated from edit: unrecoverable. */
  "bids.delete",

  /** Read the material, assembly, kit, modifier and labor-rate library. */
  "library.view",
  /** Change the library — the shared inputs every future bid is built from. */
  "library.edit",

  /** See what things cost and what the company charges. */
  "pricing.view",
  /**
   * Change company-level pricing: overhead, profit, productivity, tax rules and
   * areas, labor rates. Deliberately NOT bundled with library.edit — an
   * estimator adding a material is routine, an estimator changing the company's
   * margin is not, and CLAUDE.md § Company defaults is explicit that one of
   * these moves every existing bid.
   */
  "pricing.edit",

  /**
   * See the company's own performance: win rate, and what finished jobs
   * actually earned against what they were quoted at.
   *
   * ── Deliberately not implied by bids.view ────────────────────────────────
   * Anyone who can open a bid can already see that bid's price, so it is
   * tempting to treat the aggregate as free. It is not the same disclosure.
   * One bid is a job somebody worked on; the whole book of business is how
   * well the company is doing — the figure a contractor would show an
   * accountant, a lender or a buyer, and would not hand to a subcontractor
   * they added as a viewer last week or to a client contact reading their own
   * quote.
   *
   * The estimator case is the one worth being explicit about, because it is
   * arguable in the other direction: an estimator's own hit rate is genuinely
   * useful feedback for them. It is withheld anyway, because this figure is
   * not scoped per person — it is the company's, across every estimator — and
   * a company-wide margin is not a working tool for building a bid. If a
   * contractor decides otherwise, adding "analytics.view" to the estimator
   * list below is the whole change.
   */
  "analytics.view",

  "clients.view",
  "clients.edit",

  /** Company branding, proposal defaults — what a customer sees. */
  "settings.edit",

  /** Invite, remove, and change the role of other members. */
  "members.manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * What each role may do.
 *
 * Exhaustive by construction: `Record<CompanyRole, ...>` will not compile with
 * a role missing, so a new role cannot be added without deciding this.
 *
 * The starting set, and the reasoning:
 *
 *   owner      everything, including handing the company to someone else.
 *   admin      everything except that they cannot act on the owner.
 *   estimator  the working role. Builds bids, edits the library, manages
 *              clients, and can SEE pricing because a bid cannot be built
 *              without costs — but cannot change the company's margin, its
 *              settings, or who is in it, and cannot see how the company is
 *              performing overall. See "analytics.view" for why that last one
 *              sits with the money settings rather than with the bid work.
 *   viewer     reads. For a customer contact, a partner, or a new hire.
 */
export const ROLE_CAPABILITIES: Record<CompanyRole, readonly Capability[]> = {
  owner: CAPABILITIES,
  admin: CAPABILITIES,
  estimator: [
    "bids.view",
    "bids.edit",
    "library.view",
    "library.edit",
    "pricing.view",
    "clients.view",
    "clients.edit",
  ],
  viewer: ["bids.view", "library.view", "pricing.view", "clients.view"],
};

/** May this role do this? The only question callers should be asking. */
export function can(role: CompanyRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Everything a role may do, for showing a member what their access covers. */
export function capabilitiesFor(role: CompanyRole): readonly Capability[] {
  return ROLE_CAPABILITIES[role];
}

// ─── Access tier ──────────────────────────────────────────────────────────────

/**
 * Which build of the product a person sees.
 *
 * `internal` is the author and close testers. It is a property of the PERSON,
 * not of their membership, because a tester who joins a customer's company to
 * help them debug something is still a tester.
 */
export const ACCESS_TIERS = ["standard", "internal"] as const;
export type AccessTier = (typeof ACCESS_TIERS)[number];

/**
 * Features that can be restricted to internal accounts.
 *
 * ── Adding an internal-only feature is one line here plus one tag ────────────
 * Add the id with `availability: "internal"`, then tag the procedure with
 * `internalProcedure("your.feature")` (server) or `useInternalFeature`
 * (client). Nothing about roles, scoping or middleware changes. Flipping it to
 * everyone later is changing one word in this table — no migration, no deploy
 * dance, no code moved.
 *
 * Ids are stable strings rather than an enum of screens on purpose: a feature
 * outlives the screen it first appeared on, and renaming a component should not
 * silently un-gate it.
 */
export const FEATURES = {
  /**
   * QuickBooks CSV export. Internal while the column format is confirmed
   * against a real QuickBooks company file — the format was verified from
   * documentation rather than by importing into a live account, and a
   * mis-mapped column reaches somebody's books.
   */
  "accounting.quickbooks": { availability: "internal" },
  /**
   * The business analytics dashboard. Shipped to everyone.
   *
   * Tagged even though it is released, because the two axes answer different
   * questions here and both are live: "analytics.view" decides WHO inside a
   * company sees it (owners and admins), and this decides WHETHER the screen
   * exists in the build at all. Withdrawing it — to rework the profitability
   * basis, say — is changing one word here, with no change to any role.
   */
  "analytics.dashboard": { availability: "everyone" },
  /** The supplier materials list. Shipped to everyone. */
  "materials.supplierList": { availability: "everyone" },
  /** AI plan reading in Takeoff. Shipped to everyone. */
  "takeoff.copilot": { availability: "everyone" },
} as const satisfies Record<string, { availability: "internal" | "everyone" }>;

export type FeatureId = keyof typeof FEATURES;

/** Every feature id, for the settings screen and for tests. */
export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[];

/**
 * May this tier use this feature?
 *
 * An unknown id returns FALSE rather than true. A typo in a tag then hides a
 * feature, which someone notices immediately, instead of exposing an unreleased
 * one, which nobody notices at all. Fail closed.
 */
export function hasFeature(tier: AccessTier, feature: string): boolean {
  const entry = (FEATURES as Record<string, { availability: string }>)[feature];
  if (!entry) return false;
  return entry.availability === "everyone" || tier === "internal";
}

/** The features this tier can see, for handing to the client in one payload. */
export function featuresFor(tier: AccessTier): FeatureId[] {
  return FEATURE_IDS.filter(id => hasFeature(tier, id));
}

// ─── Invitations ──────────────────────────────────────────────────────────────

/**
 * Roles that may be handed out in an invitation.
 *
 * `owner` is absent deliberately. A company has exactly one owner and the seat
 * moves by transfer, not by invitation — an invite that could mint a second
 * owner is a privilege-escalation path wearing an ordinary feature's clothes.
 */
export const INVITABLE_ROLES = COMPANY_ROLES.filter(
  (role): role is Exclude<CompanyRole, "owner"> => role !== "owner"
);

/** How long an unaccepted invitation stays usable. */
export const INVITE_TTL_DAYS = 14;

export function inviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Is this invitation still usable?
 *
 * Takes the clock as a parameter for the same reason `shared/retention.ts`
 * does: an expiry rule that reads the clock internally can only be tested by
 * agreeing with itself, and this one decides whether a stranger gets into a
 * contractor's books.
 */
export function inviteUsable(
  invite: {
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
  },
  now: Date
): boolean {
  if (invite.acceptedAt !== null) return false;
  if (invite.revokedAt !== null) return false;
  return invite.expiresAt.getTime() > now.getTime();
}

/** What the Crew page says about an invitation. */
export type InviteStatus = "joined" | "revoked" | "expired" | "pending";

/**
 * Which of those an invitation is, in the order that decides a conflict.
 *
 * Exists because "not usable" is three different facts, and the Crew page
 * used to report all three as "expired" — so a code revoked a second ago read
 * as one that had merely run out, which is false rather than vague. Revoked
 * outranks expired: an owner who revoked a code did something, and that is
 * what the list should say, however long ago the date then passed.
 *
 * Joined outranks both, matching inviteUsable, which refuses a used code
 * before it looks at anything else.
 */
export function inviteStatus(
  invite: {
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
  },
  now: Date
): InviteStatus {
  if (invite.acceptedAt !== null) return "joined";
  if (invite.revokedAt !== null) return "revoked";
  return inviteUsable(invite, now) ? "pending" : "expired";
}

/**
 * Why an invitation cannot be used, in words a person can act on.
 *
 * Deliberately the same message for "no such code" and "wrong code": telling a
 * stranger that a code exists but has expired confirms the company exists.
 */
export function inviteRejection(
  invite: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null },
  now: Date
): string | null {
  if (inviteUsable(invite, now)) return null;
  if (invite.acceptedAt !== null)
    return "That invitation has already been used.";
  return "That invitation is no longer valid. Ask for a new one.";
}
