/**
 * The invite gate — only someone with an invitation can create an account,
 * once it is switched on (references/invite-gate-plan.md, owner's answers
 * 2026-09-29; built server-side 2026-10-14 on track-a-night).
 *
 * ── OFF by default, and how it is switched ───────────────────────────────────
 * `SIGNUP_INVITE_ONLY=on` in the environment closes open signup. Anything
 * else — unset, "off", "true", "1" — leaves signup exactly as it was, so a
 * deploy that carries this code changes nothing until somebody sets the
 * variable on purpose. One exact word, the same reasoning as
 * `ALLOW_REMOTE_DATABASE=yes`: a loose truthy check is easy to trip by
 * accident, and this one locks strangers out.
 *
 * Codes are honoured whether or not the gate is on: a signup that carries a
 * valid code joins the company or creates the company the code says, either
 * way. The switch only decides whether a signup WITHOUT a code is refused.
 *
 * ── Two kinds of code, one door ──────────────────────────────────────────────
 *   • company   — `company_invites`, made by a company owner or admin. Creates
 *                 the account and the membership. The seat was held from the
 *                 moment the invite was made; `acceptInviteWithinSeats`
 *                 re-checks it under the company's lock.
 *   • new company — `signup_invites` (0107), made by a platform admin only.
 *                 Creates the account AND its company, with the invite's seat
 *                 limit, in ONE transaction. The account must use the invited
 *                 address (owner Q2).
 *
 * In both, the membership exists before the session cookie is issued, so no
 * request can reach `resolveScope` while the new user has no membership —
 * otherwise `createPersonalCompany` would hand them an empty company of one
 * as well (invite-gate-plan.md § 9, "the sharpest one").
 */
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  companies,
  companyMembers,
  signupInvites,
  users,
  type CompanyInvite,
  type SignupInvite,
  type User,
} from "../drizzle/schema";
import { inviteExpiresAt, inviteRejection } from "../shared/permissions";
import * as db from "./db";
import { generateInviteCode, hashInviteCode } from "./inviteCodes";

export const SIGNUP_INVITE_ONLY_VAR = "SIGNUP_INVITE_ONLY";

/** Is open signup closed? Only the exact word "on" closes it. */
export function signupInviteOnly(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[SIGNUP_INVITE_ONLY_VAR] === "on";
}

/** Said to a signup with no code while the gate is on. */
export const INVITE_ONLY_MESSAGE =
  "BidRidge is invite-only for now. Join the early-access list on bidridge.com and we'll send you an invite.";
export const INVITE_NOT_VALID =
  "This invite link isn't valid. Check you used the whole link, or ask whoever invited you for a new one.";
export const INVITE_WRONG_ADDRESS =
  "This invite was sent to a different email address. Sign up with that address, or ask for a new invite.";

export type InviteLookup =
  | { kind: "company"; invite: CompanyInvite; companyName: string }
  | { kind: "newCompany"; invite: SignupInvite };

/** What a code is, checking the new-company table first (plan § 8.2). */
export async function findInvite(code: string): Promise<InviteLookup | null> {
  const codeHash = hashInviteCode(code);
  const database = await db.getDb();
  if (!database) return null;
  const [signup] = await database
    .select()
    .from(signupInvites)
    .where(eq(signupInvites.codeHash, codeHash))
    .limit(1);
  if (signup) return { kind: "newCompany", invite: signup };
  const company = await db.getInviteByCodeHash(codeHash);
  if (!company) return null;
  const row = await db.getCompanyById(company.companyId);
  return { kind: "company", invite: company, companyName: row?.name ?? "" };
}

/** Why this code cannot be used for this address now, or null if it can. */
export function inviteProblem(
  found: InviteLookup | null,
  email: string | null,
  now: Date
): string | null {
  if (!found) return INVITE_NOT_VALID;
  const rejected = inviteRejection(found.invite, now);
  if (rejected) return rejected;
  if (
    found.kind === "newCompany" &&
    email !== null &&
    found.invite.email.trim().toLowerCase() !== email.trim().toLowerCase()
  )
    return INVITE_WRONG_ADDRESS;
  return null;
}

/** A new-company invite. Returns the code ONCE; only its hash is stored. */
export async function createSignupInvite(input: {
  email: string;
  seatLimit: number;
  note?: string | null;
  earlyAccessId?: number | null;
  createdByUserId: number;
  now: Date;
}): Promise<{ id: number; code: string; expiresAt: Date }> {
  const database = await db.getDb();
  if (!database) throw new Error("DB unavailable");
  const code = generateInviteCode();
  const expiresAt = inviteExpiresAt(input.now);
  const [result] = await database.insert(signupInvites).values({
    codeHash: hashInviteCode(code),
    email: input.email.trim().toLowerCase(),
    seatLimit: input.seatLimit,
    note: input.note ?? null,
    earlyAccessId: input.earlyAccessId ?? null,
    expiresAt,
    createdByUserId: input.createdByUserId,
  });
  return { id: result.insertId, code, expiresAt };
}

/** Every new-company invite, newest first. Never the code. */
export async function listSignupInvites() {
  const database = await db.getDb();
  if (!database) return [];
  return database
    .select({
      id: signupInvites.id,
      email: signupInvites.email,
      seatLimit: signupInvites.seatLimit,
      note: signupInvites.note,
      expiresAt: signupInvites.expiresAt,
      acceptedAt: signupInvites.acceptedAt,
      acceptedByUserId: signupInvites.acceptedByUserId,
      revokedAt: signupInvites.revokedAt,
      createdAt: signupInvites.createdAt,
    })
    .from(signupInvites)
    .orderBy(desc(signupInvites.id))
    .limit(500);
}

/** Revoke a pending new-company invite. A used one is left as it was. */
export async function revokeSignupInvite(id: number, now: Date) {
  const database = await db.getDb();
  if (!database) return;
  await database
    .update(signupInvites)
    .set({ revokedAt: now })
    .where(
      and(
        eq(signupInvites.id, id),
        isNull(signupInvites.acceptedAt),
        isNull(signupInvites.revokedAt)
      )
    );
}

type NewAccount = {
  email: string;
  name: string;
  passwordHash: string;
  openId: string;
  now: Date;
};

async function insertAccount(account: NewAccount): Promise<User> {
  await db.upsertUser({
    openId: account.openId,
    email: account.email,
    name: account.name,
    passwordHash: account.passwordHash,
    loginMethod: "email_password",
    emailVerified: false,
    lastSignedIn: account.now,
  });
  const user = await db.getUserByOpenId(account.openId);
  if (!user) throw new Error("Failed to create account.");
  return user;
}

/**
 * Create the account a valid code allows, with its membership, before any
 * session exists. Throws FORBIDDEN with words a person can act on, having
 * written nothing, when the code cannot be used.
 */
export async function signUpWithInvite(
  found: InviteLookup,
  account: NewAccount
): Promise<User> {
  if (found.kind === "newCompany") {
    // One transaction: claim the code, create the user, the company and the
    // owner membership — all or nothing. The claim is a conditional UPDATE,
    // so two tabs racing on one link produce one account.
    return db.inOneTransaction(async () => {
      const tx = (await db.getDb())!;
      const [claim] = await tx
        .update(signupInvites)
        .set({ acceptedAt: account.now })
        .where(
          and(
            eq(signupInvites.id, found.invite.id),
            isNull(signupInvites.acceptedAt),
            isNull(signupInvites.revokedAt),
            gt(signupInvites.expiresAt, account.now)
          )
        );
      if (claim.affectedRows !== 1)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "That invitation has already been used.",
        });
      const user = await insertAccount(account);
      await tx
        .update(signupInvites)
        .set({ acceptedByUserId: user.id })
        .where(eq(signupInvites.id, found.invite.id));
      const [company] = await tx.insert(companies).values({
        name: account.name,
        ownerUserId: user.id,
        seatLimit: found.invite.seatLimit,
      });
      await tx.insert(companyMembers).values({
        companyId: company.insertId,
        userId: user.id,
        role: "owner",
        status: "active",
      });
      return user;
    });
  }

  // A company invite: the seat lock lives in acceptInviteWithinSeats, which
  // runs its own transaction, so the account is created first and REMOVED if
  // the invite is refused there (spent a moment ago, or seats cut). No
  // session exists yet and nothing else points at the row, so the delete
  // leaves nothing behind.
  const user = await insertAccount(account);
  const accepted = await db.acceptInviteWithinSeats(found.invite.id, user.id);
  if (!accepted.ok) {
    const database = (await db.getDb())!;
    await database.delete(users).where(eq(users.id, user.id));
    throw new TRPCError({ code: "FORBIDDEN", message: accepted.message });
  }
  return user;
}
