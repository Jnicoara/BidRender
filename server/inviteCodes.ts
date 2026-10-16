/**
 * Invitation codes — one generator and one hash for both kinds of invite:
 * joining a company (`company_invites`) and creating a new company
 * (`signup_invites`, invite-gate-plan.md § 7). Moved out of companyRouter.ts
 * on 2026-10-14 when the second kind arrived, so the two cannot drift into
 * hashing the same code differently.
 *
 * A code is generated server-side, returned exactly once, and stored only as
 * a SHA-256. Nothing can read a code back out afterwards.
 */
import { createHash, randomBytes } from "node:crypto";

/** A shared secret with 160 bits of entropy, in a shape a person can retype. */
export function generateInviteCode(): string {
  // Crockford-ish: no I, L, O, U — the characters people mistype when reading
  // a code off a phone screen to someone on a job site.
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(20);
  let code = "";
  for (let i = 0; i < bytes.length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
    if (i % 5 === 4 && i !== bytes.length - 1) code += "-";
  }
  return code;
}

/** Codes are compared by hash; the plaintext is never stored. */
export function hashInviteCode(code: string): string {
  return createHash("sha256")
    .update(code.trim().toUpperCase().replace(/-/g, ""))
    .digest("hex");
}
