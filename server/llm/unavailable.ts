/**
 * "AI is unavailable right now" — a failure that will NOT pass on its own.
 *
 * ── Why this is told apart from every other failure ─────────────────────────
 * A timeout, an overloaded model or a reply that would not parse passes: try
 * again later and it works. A missing key, or a key Anthropic refuses
 * (expired, disabled, revoked), does not — it fails on every call until
 * somebody changes a setting. Until 2026-10-09 both landed in the same catch,
 * so a dead key told users "try again later" and the navigation helper told
 * them "I'm not sure which screen you want", blaming the question. Found while
 * preparing a key rotation (references/deploying.md § 8a, todo.md).
 *
 * Classified by the SDK's own error type and HTTP status, never by matching
 * the words of a message: Anthropic rewording an error must not turn a dead
 * key back into "try again later".
 *
 *   401 authentication_error — the key is wrong, expired or disabled.
 *   403 permission_error     — the key exists but may not do this.
 *
 * Nothing here holds or logs a key.
 */
import Anthropic from "@anthropic-ai/sdk";

/** Why AI is unavailable: no key on this server, or the key was refused. */
export type AiRefusal = "no-key" | "key-refused";

/** The sentence every feature starts with; each adds its own next step. */
export const AI_UNAVAILABLE = "AI is unavailable right now.";

/** Raised by `invokeLLM` when no call can succeed until a setting changes. */
export class AiUnavailable extends Error {
  readonly reason: AiRefusal;
  constructor(reason: AiRefusal) {
    super(AI_UNAVAILABLE);
    this.name = "AiUnavailable";
    this.reason = reason;
  }
}

/** `key-refused` for a 401 or 403 from Anthropic; null for anything else. */
export function keyRefusal(error: unknown): AiRefusal | null {
  if (
    error instanceof Anthropic.APIError &&
    (error.status === 401 || error.status === 403)
  )
    return "key-refused";
  return null;
}
