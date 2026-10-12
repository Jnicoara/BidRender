/**
 * THE STARTER EDITOR'S SESSION (baseline-screen-plan.md § 1): its own cookie,
 * its own signing key, its own audience — never a company session.
 *
 * ── Kept apart from the ordinary session three ways ─────────────────────────
 * 1. A different cookie, `STARTER_COOKIE`, so neither login overwrites the
 *    other and `sdk.authenticateRequest` never reads this one.
 * 2. A different key, derived from `JWT_SECRET` for this purpose only, so a
 *    token signed for an ordinary session cannot verify here and a starter
 *    token cannot verify there.
 * 3. A different audience, `STARTER_AUDIENCE`, which `sdk.verifySession`
 *    refuses by name — so even a token signed with the ORDINARY key that
 *    claims this audience is not an ordinary session.
 * Each is tested on its own in `server/starterEditorLogin.test.ts`.
 *
 * ── Two stages, and short ────────────────────────────────────────────────────
 * - `password`: the password was right; good for 5 minutes, for typing the
 *   authenticator code and nothing else.
 * - `done`: both steps passed. 30 minutes idle — every request re-issues it —
 *   and never past 8 hours from the sign-in (`authAt`), however busy.
 */
import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const STARTER_COOKIE = "bidridge_starter_session";
export const STARTER_AUDIENCE = "bidridge:starter-editor";

export const PASSWORD_STAGE_MS = 5 * 60 * 1000;
export const STARTER_IDLE_MS = 30 * 60 * 1000;
export const STARTER_MAX_MS = 8 * 60 * 60 * 1000;

export type StarterStage = "password" | "done";

export type StarterClaims = {
  userId: number;
  stage: StarterStage;
  /** When the password step passed, ms. The 8-hour cap counts from here. */
  authAt: number;
  /** Whole seconds, for `sessionsValidAfter`. */
  issuedAt: number;
  /** When this token stops, ms. */
  expiresAt: number;
};

/** The key for starter tokens only. Refuses an empty `JWT_SECRET`. */
export function starterSigningKey(jwtSecret: string): Uint8Array {
  if (!jwtSecret) throw new Error("JWT_SECRET is not set");
  return new Uint8Array(
    createHmac("sha256", jwtSecret)
      .update("bidridge starter-editor session v1")
      .digest()
  );
}

/** When a token issued at `nowMs` for this stage must stop. */
export function starterExpiry(
  stage: StarterStage,
  authAt: number,
  nowMs: number
): number {
  if (stage === "password") return nowMs + PASSWORD_STAGE_MS;
  return Math.min(nowMs + STARTER_IDLE_MS, authAt + STARTER_MAX_MS);
}

export async function signStarterToken(
  claims: { userId: number; stage: StarterStage; authAt: number },
  nowMs: number,
  jwtSecret: string
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = starterExpiry(claims.stage, claims.authAt, nowMs);
  const token = await new SignJWT({
    uid: claims.userId,
    stage: claims.stage,
    authAt: claims.authAt,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience(STARTER_AUDIENCE)
    .setIssuedAt(Math.floor(nowMs / 1000))
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(starterSigningKey(jwtSecret));
  return { token, expiresAt };
}

/** The claims, or null for anything expired, altered, or not ours. */
export async function verifyStarterToken(
  token: string | undefined | null,
  nowMs: number,
  jwtSecret: string
): Promise<StarterClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, starterSigningKey(jwtSecret), {
      algorithms: ["HS256"],
      audience: STARTER_AUDIENCE,
      currentDate: new Date(nowMs),
    });
    const { uid, stage, authAt, iat, exp } = payload as Record<string, unknown>;
    if (
      typeof uid !== "number" ||
      (stage !== "password" && stage !== "done") ||
      typeof authAt !== "number" ||
      typeof iat !== "number" ||
      typeof exp !== "number"
    )
      return null;
    // The cap again, here, so a token can never outlive 8 hours even if the
    // expiry it was signed with were wrong.
    if (stage === "done" && nowMs >= authAt + STARTER_MAX_MS) return null;
    return {
      userId: uid,
      stage,
      authAt,
      issuedAt: iat,
      expiresAt: exp * 1000,
    };
  } catch {
    return null;
  }
}
