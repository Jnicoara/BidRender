/**
 * THE STARTER EDITOR'S SECRETS AT REST (baseline-screen-plan.md § 1).
 *
 * The authenticator secret is stored AES-256-GCM-encrypted and the recovery
 * codes as HMAC-SHA256, both under `STARTER_TOTP_KEY` — a setting, never a
 * database value — so a copy of the database (a backup, a restored scratch
 * copy) gives nobody a code.
 *
 * No key, no sign-in: `starterKey` throws naming the variable rather than
 * falling back to anything. A server without the key cannot sign a starter
 * editor in, which is the safe direction.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

export const STARTER_KEY_VARIABLE = "STARTER_TOTP_KEY";

/** The 32-byte key from the environment (64 hex characters). */
export function starterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env[STARTER_KEY_VARIABLE]?.trim() ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw))
    throw new Error(
      `${STARTER_KEY_VARIABLE} is not set to 64 hex characters, so the starter editor cannot sign in. Make one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  return Buffer.from(raw, "hex");
}

/** `v1.<iv>.<tag>.<ciphertext>`, each base64url. */
export function sealSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, body]
    .map(p => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Throws on a wrong key or an altered value (GCM checks both). */
export function openSecret(sealed: string, key: Buffer): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body)
    throw new Error("Not a sealed starter secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// ─── Recovery codes ──────────────────────────────────────────────────────────

export const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

/** `XXXX-XXXX-XXXX-XXXX`: 16 characters from 31, about 79 bits. */
export function newRecoveryCode(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) out += "-";
    out += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }
  return out;
}

/** Spaces, dashes and case do not matter when typed. */
export function normaliseRecoveryCode(typed: string): string {
  return typed.replace(/[\s-]/g, "").toUpperCase();
}

export function looksLikeRecoveryCode(typed: string): boolean {
  return normaliseRecoveryCode(typed).length === 16;
}

export function hashRecoveryCode(typed: string, key: Buffer): string {
  return createHmac("sha256", key)
    .update(`recovery:${normaliseRecoveryCode(typed)}`)
    .digest("hex");
}
