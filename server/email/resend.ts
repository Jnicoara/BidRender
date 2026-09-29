/**
 * The provider call, and only that. Reached through `sendEmail` in
 * `./index.ts`, which has already decided the message may go.
 *
 * Resend's HTTP API directly (POST /emails), not its SDK: one request with
 * four fields is not worth a dependency. Every failure — a refusal, a timeout,
 * a network error — comes back as `notSent` with a reason and never throws,
 * so a caller cannot crash on a provider outage.
 */
import type { EmailMessage, EmailResult } from "./index";

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export async function sendViaResend(
  message: EmailMessage,
  config: { apiKey: string; from: string }
): Promise<EmailResult> {
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
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
    } | null;
    if (!res.ok) {
      // Resend's error message says what is wrong with the REQUEST (a domain
      // not verified, a bad key) and does not echo the body back.
      const said = typeof body?.message === "string" ? `: ${body.message}` : "";
      return { status: "notSent", why: `Resend answered ${res.status}${said}` };
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
