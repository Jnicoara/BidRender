/**
 * The only shape of a user record allowed to leave the server.
 *
 * ── The failure this exists to prevent ───────────────────────────────────────
 * `auth.me` used to return the `users` row exactly as the database hands it
 * over, which meant every signed-in browser received the bcrypt hash of that
 * account's password — and `useAuth` writes what it receives into
 * `localStorage`, so it was also saved to disk on the machine. Nothing in the
 * interface has ever read that field; it went along for the ride because the
 * row went along for the ride.
 *
 * ── Why an allowlist rather than deleting the one bad field ──────────────────
 * Deleting `passwordHash` fixes today and nothing else: the next column that
 * holds a token, a recovery code or an API key inherits the same free ride, and
 * nobody finds out until it is in someone's browser storage. Listing what MAY
 * leave inverts that — a new column is private until a person decides
 * otherwise, and `server/userPrivacy.test.ts` fails the moment one appears that
 * has not been classified.
 *
 * `openId` is withheld as well. It is the identifier a session token is minted
 * against, and no screen uses it — the interface reads exactly three fields
 * (`role`, `email`, `name`) plus whether a user exists at all.
 */

/** Fields the browser may see. Anything not listed here never leaves. */
export const PUBLIC_USER_FIELDS = [
  "id",
  "name",
  "email",
  "role",
  "accessTier",
  "loginMethod",
  "emailVerified",
  "activeCompanyId",
  "onboardingCompletedAt",
  "checklistDismissedAt",
  "createdAt",
  "updatedAt",
  "lastSignedIn",
] as const;

/**
 * Fields deliberately kept server-side, named so the drift test can tell
 * "considered and withheld" apart from "nobody has looked at this yet".
 */
export const NEVER_SENT_USER_FIELDS = ["passwordHash", "openId"] as const;

export type PublicUserField = (typeof PUBLIC_USER_FIELDS)[number];

/** A user as the browser receives it. */
export type PublicUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  accessTier: string;
  loginMethod: string | null;
  emailVerified: boolean;
  activeCompanyId: number | null;
  onboardingCompletedAt: Date | null;
  checklistDismissedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastSignedIn: Date | null;
};

/**
 * Copy across the allowed fields and nothing else.
 *
 * Built by picking from the list rather than by deleting from the row, so a
 * column added to `users` tomorrow is absent from the result by construction
 * rather than by somebody remembering to exclude it.
 *
 * `null` in, `null` out: a signed-out caller is a normal answer here.
 */
export function toPublicUser<T extends Record<string, unknown>>(
  user: T | null | undefined
): PublicUser | null {
  if (!user) return null;
  const out: Record<string, unknown> = {};
  for (const field of PUBLIC_USER_FIELDS) {
    out[field] = user[field] ?? null;
  }
  return out as PublicUser;
}
