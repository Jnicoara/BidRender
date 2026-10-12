/**
 * AUTHENTICATOR CODES (TOTP, RFC 6238) for the starter editor's sign-in
 * (baseline-screen-plan.md § 1, owner Q1). Pure: no clock of its own, no
 * database — the caller passes `nowMs` and the last step it accepted.
 *
 * The settings are the ones every authenticator app assumes when the QR code
 * says nothing else: HMAC-SHA1, 6 digits, 30-second steps. One step either
 * side is accepted, so a phone whose clock is a few seconds out still works.
 *
 * ── A code is good ONCE ──────────────────────────────────────────────────────
 * `verifyTotp` refuses any step at or before `lastUsedStep`. The caller then
 * claims the step with a conditional UPDATE (`claimTotpStep`), so two requests
 * racing on the same code cannot both pass.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps accepted either side of now. */
export const TOTP_WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const index = BASE32.indexOf(ch);
    if (index < 0) throw new Error("Not a base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new secret: 20 random bytes (160 bits, RFC 4226's recommendation). */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/** The code for one step (RFC 4226 § 5.3, dynamic truncation). */
export function totpCode(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secretBase32))
    .update(counter)
    .digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export type TotpResult = { ok: true; step: number } | { ok: false };

/**
 * Is `code` right for now, and newer than the last code accepted? Returns the
 * step it matched so the caller can claim it.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null
): TotpResult {
  const typed = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(typed)) return { ok: false };
  const now = stepAt(nowMs);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = now + delta;
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secretBase32, step));
    if (timingSafeEqual(expected, Buffer.from(typed)))
      return { ok: true, step };
  }
  return { ok: false };
}

/** What the QR code holds (the Key Uri Format every authenticator reads). */
export function otpauthUri(
  secretBase32: string,
  account: string,
  issuer = "BidRidge starter"
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
