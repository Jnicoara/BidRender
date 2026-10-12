/**
 * The starter editor's rows (0150–0151): making the account, resetting its
 * authenticator, and the second-step checks. Every write that decides
 * "accepted" is ONE conditional UPDATE, so two requests racing on the same
 * code or the same recovery code cannot both pass.
 *
 * Only `scripts/createStarterEditor.mts` calls `createStarterEditor` and
 * `resetStarterEditorFactor`. No route does.
 */
import bcrypt from "bcryptjs";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  starterEditorFactors,
  starterEditorRecoveryCodes,
  users,
  type User,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { sessionCutoff } from "@shared/sessionValidity";
import { toSqlTimestamp } from "@shared/bidSearch";
import {
  RECOVERY_CODE_COUNT,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  newRecoveryCode,
  openSecret,
  sealSecret,
} from "./secretBox";
import { newTotpSecret, verifyTotp } from "./totp";
import { STARTER_ROLE, isStarterEditor } from "./role";

export const MAX_WRONG_CODES = 5;
export const CODE_LOCK_MS = 15 * 60 * 1000;
const SALT_ROUNDS = 12;

async function needDb() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db;
}

export type NewStarterEditor = {
  userId: number;
  totpSecret: string;
  recoveryCodes: string[];
};

/** A fresh secret and ten codes, stored sealed / hashed. Returns the plain ones once. */
async function writeFactor(
  userId: number,
  key: Buffer
): Promise<Omit<NewStarterEditor, "userId">> {
  const db = await needDb();
  const totpSecret = newTotpSecret();
  const recoveryCodes = Array.from(
    { length: RECOVERY_CODE_COUNT },
    newRecoveryCode
  );
  await db.transaction(async tx => {
    await tx
      .delete(starterEditorFactors)
      .where(eq(starterEditorFactors.userId, userId));
    await tx.insert(starterEditorFactors).values({
      userId,
      totpSecretEnc: sealSecret(totpSecret, key),
    });
    await tx
      .delete(starterEditorRecoveryCodes)
      .where(eq(starterEditorRecoveryCodes.userId, userId));
    await tx.insert(starterEditorRecoveryCodes).values(
      recoveryCodes.map(code => ({
        userId,
        codeHash: hashRecoveryCode(code, key),
      }))
    );
  });
  return { totpSecret, recoveryCodes };
}

/**
 * Make the starter editor. Refuses an email ANY account already uses, so the
 * master login can never be a company login's address — and so `auth.login`,
 * which looks an address up and takes the first match, can never be pointed
 * at it by accident.
 */
export async function createStarterEditor(
  input: { email: string; name: string; password: string },
  key: Buffer
): Promise<NewStarterEditor> {
  const db = await needDb();
  const email = input.email.trim().toLowerCase();
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);
  if (taken)
    throw new Error(
      `An account already uses ${email}. The starter editor needs an address no company login uses.`
    );
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const [inserted] = await db.insert(users).values({
    openId: `starter_${nanoid(24)}`,
    name: input.name,
    email,
    passwordHash,
    loginMethod: "starter_editor",
    emailVerified: true,
    role: STARTER_ROLE,
    // Never shown the first-run flow: it has no company to set up.
    onboardingCompletedAt: new Date(),
  });
  const userId = Number(inserted.insertId);
  return { userId, ...(await writeFactor(userId, key)) };
}

async function starterEditorByEmail(email: string) {
  const db = await needDb();
  const [row] = await db
    .select()
    .from(users)
    .where(
      and(
        sql`LOWER(${users.email}) = ${email.trim().toLowerCase()}`,
        eq(users.role, STARTER_ROLE)
      )
    )
    .limit(1);
  return row;
}

/**
 * Lost phone: a new secret and new recovery codes, the lock cleared, and
 * every session issued before now ended (`sessionsValidAfter`).
 */
export async function resetStarterEditorFactor(
  email: string,
  key: Buffer,
  now: Date = new Date()
): Promise<NewStarterEditor> {
  const user = await starterEditorByEmail(email);
  if (!user) throw new Error(`No starter editor uses ${email}.`);
  const fresh = await writeFactor(user.id, key);
  const db = await needDb();
  await db
    .update(users)
    .set({ sessionsValidAfter: sessionCutoff(now) })
    .where(eq(users.id, user.id));
  return { userId: user.id, ...fresh };
}

/** A new password, set by the script only; ends every session. */
export async function resetStarterEditorPassword(
  email: string,
  password: string,
  now: Date = new Date()
): Promise<void> {
  const user = await starterEditorByEmail(email);
  if (!user) throw new Error(`No starter editor uses ${email}.`);
  const db = await needDb();
  await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
      sessionsValidAfter: sessionCutoff(now),
    })
    .where(eq(users.id, user.id));
}

// ─── Sign-in ─────────────────────────────────────────────────────────────────

/**
 * Step one. The account only if it IS a starter editor and the password is
 * right; a company login's right password gets null here, the same as a
 * wrong one.
 */
export async function checkStarterPassword(
  email: string,
  password: string
): Promise<User | null> {
  const user = await starterEditorByEmail(email);
  if (!user?.passwordHash) {
    await bcrypt.hash("dummy_timing_guard", SALT_ROUNDS);
    return null;
  }
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}

export type SecondStep =
  | { ok: true; via: "authenticator" | "recovery" }
  | { ok: false; why: "wrong" }
  | { ok: false; why: "locked"; until: Date };

/**
 * Count one wrong code; the fifth locks for 15 minutes.
 *
 * Read under a row lock and written in JS, NOT as one UPDATE whose SET
 * expressions read each other. That was the first version, and its comment
 * said "MySQL applies SET left to right" — true, but drizzle writes the SET
 * in the TABLE's column order, not the object's, so the lock read the count
 * after it had moved and locked on the fourth miss. Found by
 * `starterEditorLogin.test.ts`; nothing here depends on an order now.
 */
async function recordWrongCode(userId: number, now: Date) {
  const db = await needDb();
  await db.transaction(async tx => {
    const [row] = await tx
      .select({ failedAttempts: starterEditorFactors.failedAttempts })
      .from(starterEditorFactors)
      .where(eq(starterEditorFactors.userId, userId))
      .for("update");
    if (!row) return;
    const misses = row.failedAttempts + 1;
    await tx
      .update(starterEditorFactors)
      .set(
        misses >= MAX_WRONG_CODES
          ? {
              failedAttempts: 0,
              lockedUntil: new Date(now.getTime() + CODE_LOCK_MS),
            }
          : { failedAttempts: misses }
      )
      .where(eq(starterEditorFactors.userId, userId));
  });
}

/**
 * Step two: an authenticator code, or one recovery code. Refused while
 * locked, whatever is typed — a right code during a lock is still refused.
 */
export async function checkStarterSecondStep(
  userId: number,
  typed: string,
  key: Buffer,
  now: Date = new Date()
): Promise<SecondStep> {
  const db = await needDb();
  const [factor] = await db
    .select()
    .from(starterEditorFactors)
    .where(eq(starterEditorFactors.userId, userId))
    .limit(1);
  if (!factor) return { ok: false, why: "wrong" };
  if (factor.lockedUntil && factor.lockedUntil.getTime() > now.getTime())
    return { ok: false, why: "locked", until: factor.lockedUntil };

  if (looksLikeRecoveryCode(typed)) {
    const [claim] = await db
      .update(starterEditorRecoveryCodes)
      .set({ usedAt: now })
      .where(
        and(
          eq(starterEditorRecoveryCodes.userId, userId),
          eq(starterEditorRecoveryCodes.codeHash, hashRecoveryCode(typed, key)),
          isNull(starterEditorRecoveryCodes.usedAt)
        )
      );
    if (claim.affectedRows === 1) {
      await db
        .update(starterEditorFactors)
        .set({ failedAttempts: 0 })
        .where(eq(starterEditorFactors.userId, userId));
      return { ok: true, via: "recovery" };
    }
    await recordWrongCode(userId, now);
    return { ok: false, why: "wrong" };
  }

  const secret = openSecret(factor.totpSecretEnc, key);
  const result = verifyTotp(secret, typed, now.getTime(), factor.lastUsedStep);
  if (result.ok) {
    // Claimed only if no code from this step or later was accepted first —
    // the read above can be stale when two requests race on one code.
    const [claim] = await db
      .update(starterEditorFactors)
      .set({
        lastUsedStep: result.step,
        failedAttempts: 0,
        enrolledAt: sql`COALESCE(${starterEditorFactors.enrolledAt}, ${toSqlTimestamp(now)})`,
      })
      .where(
        and(
          eq(starterEditorFactors.userId, userId),
          or(
            isNull(starterEditorFactors.lastUsedStep),
            lt(starterEditorFactors.lastUsedStep, result.step)
          )
        )
      );
    if (claim.affectedRows === 1) return { ok: true, via: "authenticator" };
  }
  await recordWrongCode(userId, now);
  return { ok: false, why: "wrong" };
}

/** The account a `done` session names, if it may still use the screen. */
export async function starterEditorForSession(userId: number) {
  const db = await needDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!isStarterEditor(user)) return null;
  return user;
}
