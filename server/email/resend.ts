/**
 * The provider call, and only that. Reached through `sendEmail` in
 * `./index.ts`, which has already decided the message may go.
 *
 * Resend's HTTP API directly (POST /emails), not its SDK: one request with
 * four fields is not worth a dependency. Every failure — a refusal, a timeout,
 * a network error — comes back as `notSent` with a reason and never throws,
 * so a caller cannot crash on a provider outage.
 *
 * ── Quota refusals ───────────────────────────────────────────────────────────
 * With pay-as-you-go off, a send past the free tier is refused with 429
 * (owner, 2026-09-29). Which quota it was is read from Resend's error text
 * ("daily" / "monthly"); anything else at 429 is taken as the per-second rate
 * limit. The exact wording was NOT measured against a real refusal — an
 * unrecognised one falls to "rate", the shortest pause, so a wrong guess
 * costs a minute of retries that the provider refuses anyway, and each is
 * logged.
 */
import type { EmailMessage } from "./index";

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export type ResendResult =
  | { status: "sent"; id: string }
  | {
      status: "notSent";
      why: string;
      /** Set when the refusal was a quota or rate limit, which holds for everybody. */
      quota?: "daily" | "monthly" | "rate";
    };

export async function sendViaResend(
  message: EmailMessage,
  config: { apiKey: string; from: string }
): Promise<ResendResult> {
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        // One address, always — ./index.ts has checked it is exactly one.
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as {
      id?: unknown;
      message?: unknown;
      name?: unknown;
    } | null;
    if (!res.ok) {
      // Resend's error message says what is wrong with the REQUEST (a domain
      // not verified, a bad key, a quota) and does not echo the body back.
      const said = typeof body?.message === "string" ? body.message : "";
      const why = `Resend answered ${res.status}${said ? `: ${said}` : ""}`;
      if (res.status !== 429) return { status: "notSent", why };
      const words = `${said} ${typeof body?.name === "string" ? body.name : ""}`;
      const quota = /month/i.test(words)
        ? "monthly"
        : /dai|day/i.test(words)
          ? "daily"
          : "rate";
      return { status: "notSent", why, quota };
    }
    if (typeof body?.id !== "string")
      return { status: "notSent", why: "Resend answered without an id" };
    return { status: "sent", id: body.id };
  } catch (error) {
    return {
      status: "notSent",
      why: `could not reach Resend (${error instanceof Error ? error.name : "error"})`,
    };
  }
}
