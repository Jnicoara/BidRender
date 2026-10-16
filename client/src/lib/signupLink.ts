/**
 * THE SIGN-UP ADDRESS AND WHAT THE FORM SHOWS (invite-gate-plan.md § 4,
 * § 8.7; the server half is § 12).
 *
 * An invite link is `#/signup?invite=<code>`. The code is in the HASH, like
 * the reset token (`resetLink.ts`), so it never reaches a server log as part
 * of a URL — the page sends it only in the `auth.inviteInfo` and
 * `auth.signup` calls that need it.
 *
 * `signupView` decides what the "Create account" side of the sign-in card
 * shows. Pure and in `lib` so the cases have tests; the component cannot.
 * The SERVER is the gate (`SIGNUP_INVITE_ONLY`, `auth.signup` refuses with no
 * code): this only stops a stranger filling in a form that will be refused.
 */
export const SIGNUP_ADDRESS = "#/signup";

/** Whether this address is the sign-up page, with or without a code. */
export function isSignupAddress(hash: string): boolean {
  const path = hash.split("?")[0].replace(/\/+$/, "");
  return path === SIGNUP_ADDRESS;
}

/** The invite code in a sign-up address, or null when there is none. */
export function inviteCodeFromHash(hash: string): string | null {
  if (!isSignupAddress(hash)) return null;
  const query = hash.split("?")[1];
  if (!query) return null;
  const code = new URLSearchParams(query).get("invite")?.trim();
  return code ? code : null;
}

/** What `auth.inviteInfo` answers. */
export type InviteInfo =
  | {
      ok: true;
      kind: "newCompany" | "company";
      email: string | null;
      companyName: string | null;
    }
  | { ok: false; message: string | null };

export type SignupView =
  /** Still asking the server — show nothing rather than a form that may vanish. */
  | { kind: "waiting" }
  /** Open sign-up, as before the gate. */
  | { kind: "open" }
  /** Invite-only and no code: the one line pointing at the early-access list. */
  | { kind: "closed" }
  /** A code the server refused: its reason, and nothing to fill in. */
  | { kind: "refused"; message: string }
  /**
   * A good code. `lockedEmail` is set when the account MUST use the invited
   * address (a new-company invite, owner Q2); a company code copied by hand
   * works with any address, so its address is only a suggestion.
   */
  | {
      kind: "invited";
      heading: string;
      lockedEmail: string | null;
      suggestedEmail: string | null;
    };

export const CLOSED_LINE = "BidRidge is invite-only for now.";

/** Used when the server refuses a code without saying why. */
export const INVALID_INVITE =
  "This invite link isn't valid. Check you used the whole link, or ask whoever invited you for a new one.";

export function signupView(input: {
  /** `auth.signupMode`, or undefined while it loads. */
  inviteOnly: boolean | undefined;
  code: string | null;
  /** `auth.inviteInfo` for the code, or undefined while it loads / when no code. */
  info: InviteInfo | undefined;
  /** The `auth.inviteInfo` call failed outright (rate limit, network). */
  infoError?: string | null;
}): SignupView {
  if (input.code) {
    if (input.infoError) return { kind: "refused", message: input.infoError };
    if (!input.info) return { kind: "waiting" };
    if (!input.info.ok)
      return { kind: "refused", message: input.info.message || INVALID_INVITE };
    if (input.info.kind === "newCompany")
      return {
        kind: "invited",
        heading: "You're invited to start your company on BidRidge.",
        lockedEmail: input.info.email,
        suggestedEmail: null,
      };
    return {
      kind: "invited",
      heading: input.info.companyName
        ? `You're invited to join ${input.info.companyName} on BidRidge.`
        : "You're invited to join a company on BidRidge.",
      lockedEmail: null,
      suggestedEmail: input.info.email,
    };
  }
  if (input.inviteOnly === undefined) return { kind: "waiting" };
  return input.inviteOnly ? { kind: "closed" } : { kind: "open" };
}
