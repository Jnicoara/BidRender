/**
 * THE STARTER EDITOR'S LOGIN — the parts with no database
 * (baseline-screen-plan.md § 1): the authenticator arithmetic, the sealed
 * secret, and the session that is never an ordinary one.
 *
 * The database-backed guards (refused at auth.login, at authenticateRequest,
 * at resolveScope; the lock, the used-once rules) are in
 * `starterEditorLogin.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  base32Decode,
  base32Encode,
  otpauthUri,
  stepAt,
  totpCode,
  verifyTotp,
} from "./starterEditor/totp";
import {
  hashRecoveryCode,
  newRecoveryCode,
  openSecret,
  sealSecret,
  starterKey,
} from "./starterEditor/secretBox";
import {
  PASSWORD_STAGE_MS,
  STARTER_AUDIENCE,
  STARTER_IDLE_MS,
  STARTER_MAX_MS,
  signStarterToken,
  starterExpiry,
  starterSigningKey,
  verifyStarterToken,
} from "./starterEditor/session";
import { sdk } from "./_core/sdk";

const SECRET = "test-jwt-secret-for-starter";

describe("authenticator codes (RFC 6238)", () => {
  // RFC 6238 Appendix B, SHA-1, the seed "12345678901234567890". The RFC
  // prints 8 digits; an authenticator shows the last 6.
  const seed = base32Encode(Buffer.from("12345678901234567890"));
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];
  it.each(vectors)("at %i seconds the code is %s", (seconds, code) => {
    expect(totpCode(seed, stepAt(seconds * 1000))).toBe(code);
  });

  it("base32 round-trips", () => {
    const bytes = Buffer.from("any twenty bytes!!!!");
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it("accepts one step either side, and no further", () => {
    const now = 1_800_000_000_000;
    const step = stepAt(now);
    for (const [delta, ok] of [
      [-2, false],
      [-1, true],
      [0, true],
      [1, true],
      [2, false],
    ] as const)
      expect(verifyTotp(seed, totpCode(seed, step + delta), now, null).ok).toBe(
        ok
      );
  });

  it("a code is good ONCE: nothing at or before the last step used", () => {
    const now = 1_800_000_000_000;
    const step = stepAt(now);
    const code = totpCode(seed, step);
    expect(verifyTotp(seed, code, now, null)).toEqual({ ok: true, step });
    expect(verifyTotp(seed, code, now, step).ok).toBe(false);
    expect(verifyTotp(seed, code, now, step - 1)).toEqual({ ok: true, step });
  });

  it("refuses anything but six digits", () => {
    expect(verifyTotp(seed, "28708", 59_000, null).ok).toBe(false);
    expect(verifyTotp(seed, "2870822", 59_000, null).ok).toBe(false);
    expect(verifyTotp(seed, "28708a", 59_000, null).ok).toBe(false);
  });

  it("the QR code says SHA1, 6 digits, 30 seconds", () => {
    const uri = otpauthUri(seed, "ed@example.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    const params = new URL(uri).searchParams;
    expect(params.get("secret")).toBe(seed);
    expect(params.get("digits")).toBe("6");
    expect(params.get("period")).toBe("30");
    expect(params.get("algorithm")).toBe("SHA1");
  });
});

describe("the secret at rest", () => {
  const key = Buffer.alloc(32, 7);
  const other = Buffer.alloc(32, 8);

  it("is sealed, not stored in the clear, and opens with its key", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP", key);
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(openSecret(sealed, key)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("does not open with another key, or once altered", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP", key);
    expect(() => openSecret(sealed, other)).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => openSecret(parts.join("."), key)).toThrow();
  });

  it("no key, no sign-in: a missing or short STARTER_TOTP_KEY is refused", () => {
    expect(() => starterKey({})).toThrow(/STARTER_TOTP_KEY/);
    expect(() => starterKey({ STARTER_TOTP_KEY: "abc" })).toThrow();
    expect(starterKey({ STARTER_TOTP_KEY: "ab".repeat(32) })).toHaveLength(32);
  });

  it("a recovery code is stored as a keyed hash, and typing is forgiving", () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    const hash = hashRecoveryCode(code, key);
    expect(hash).not.toContain(code.replace(/-/g, ""));
    expect(hashRecoveryCode(code.toLowerCase().replace(/-/g, " "), key)).toBe(
      hash
    );
    expect(hashRecoveryCode(code, other)).not.toBe(hash);
  });
});

describe("the starter session", () => {
  const t0 = 1_800_000_000_000;

  it("the password stage lasts 5 minutes", () => {
    expect(starterExpiry("password", t0, t0)).toBe(t0 + PASSWORD_STAGE_MS);
  });

  it("30 minutes idle, never past 8 hours from sign-in", () => {
    expect(starterExpiry("done", t0, t0)).toBe(t0 + STARTER_IDLE_MS);
    const late = t0 + STARTER_MAX_MS - 10 * 60 * 1000;
    expect(starterExpiry("done", t0, late)).toBe(t0 + STARTER_MAX_MS);
  });

  it("a busy session still ends at 8 hours", async () => {
    // Re-issued every 20 minutes, as a request would.
    let at = t0;
    let token = (
      await signStarterToken(
        { userId: 1, stage: "done", authAt: t0 },
        at,
        SECRET
      )
    ).token;
    while (at + 20 * 60 * 1000 < t0 + STARTER_MAX_MS) {
      at += 20 * 60 * 1000;
      expect(await verifyStarterToken(token, at, SECRET)).not.toBeNull();
      token = (
        await signStarterToken(
          { userId: 1, stage: "done", authAt: t0 },
          at,
          SECRET
        )
      ).token;
    }
    expect(
      await verifyStarterToken(token, t0 + STARTER_MAX_MS + 1000, SECRET)
    ).toBeNull();
  });

  it("verify refuses past 8 hours even if a token were signed longer", async () => {
    const token = await new SignJWT({ uid: 1, stage: "done", authAt: t0 })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(STARTER_AUDIENCE)
      .setIssuedAt(Math.floor(t0 / 1000))
      .setExpirationTime(Math.floor((t0 + 2 * STARTER_MAX_MS) / 1000))
      .sign(starterSigningKey(SECRET));
    expect(await verifyStarterToken(token, t0 + 60_000, SECRET)).not.toBeNull();
    expect(
      await verifyStarterToken(token, t0 + STARTER_MAX_MS + 1000, SECRET)
    ).toBeNull();
  });

  it("idle for 30 minutes ends it", async () => {
    const { token } = await signStarterToken(
      { userId: 1, stage: "done", authAt: t0 },
      t0,
      SECRET
    );
    expect(
      await verifyStarterToken(token, t0 + STARTER_IDLE_MS - 1000, SECRET)
    ).not.toBeNull();
    expect(
      await verifyStarterToken(token, t0 + STARTER_IDLE_MS + 1000, SECRET)
    ).toBeNull();
  });

  it("a token signed with the ORDINARY key is not a starter session", async () => {
    // Right claims, right audience, wrong key: the derived key is the guard.
    const token = await new SignJWT({ uid: 1, stage: "done", authAt: t0 })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(STARTER_AUDIENCE)
      .setIssuedAt(Math.floor(t0 / 1000))
      .setExpirationTime(Math.floor((t0 + 60_000) / 1000))
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifyStarterToken(token, t0, SECRET)).toBeNull();
  });

  it("a starter token without the starter audience is refused", async () => {
    const token = await new SignJWT({ uid: 1, stage: "done", authAt: t0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(t0 / 1000))
      .setExpirationTime(Math.floor((t0 + 60_000) / 1000))
      .sign(starterSigningKey(SECRET));
    expect(await verifyStarterToken(token, t0, SECRET)).toBeNull();
  });

  it("an ordinary session refuses a token claiming the starter audience", async () => {
    // Signed with the ORDINARY key and carrying every ordinary field, so the
    // only thing that can refuse it is the audience check in verifySession.
    const key = new TextEncoder().encode(process.env.JWT_SECRET ?? "");
    const base = () =>
      new SignJWT({ openId: "starter_x", appId: "app", name: "x" })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuedAt()
        .setExpirationTime("1h");
    const plain = await base().sign(key);
    expect(await sdk.verifySession(plain)).not.toBeNull();
    const starter = await base().setAudience(STARTER_AUDIENCE).sign(key);
    expect(await sdk.verifySession(starter)).toBeNull();
  });
});
