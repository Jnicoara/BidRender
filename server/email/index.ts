/**
 * THE ONE DOOR every email leaves through — the same idea as `server/llm`.
 *
 * The provider, the from-address, the staging allow-list and the daily cap
 * live here, so a feature added later cannot forget any of them. Nothing else
 * in `server/` may call the provider directly.
 *
 * ── It never pretends ────────────────────────────────────────────────────────
 * Every call returns what actually happened: `sent`, or `notSent` with the
 * reason. A server with no key, an address off the staging list, a used-up
 * cap and a provider refusal all come back as `notSent` and are logged. What
 * a CALLER then tells the person is the caller's decision — the reset form,
 * for one, must not say whether an address has an account.
 *
 * ── What is never logged ─────────────────────────────────────────────────────
 * The message body. A reset email carries a link that IS a credential for an
 * hour; a log line is readable by anyone who can read logs and outlives it.
 * Logs name the kind of email, the outcome and the reason — never the text,
 * and never the full address.
 */
import { emailConfig, mayDeliverTo, type EmailConfig } from "./config";
import { sendViaResend } from "./resend";

export type EmailMessage = {
  /** A short name for logs: "password-reset". Never the subject or body. */
  kind: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailResult =
  | { status: "sent"; id: string }
  | { status: "notSent"; why: string };

/** Sends per UTC day on this instance. Per instance: see `EMAIL_DAILY_CAP`. */
const sentToday = { day: "", count: 0 };

/** Whether this server can send email at all — for a screen to say so. */
export function emailEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return emailConfig(env).kind === "resend";
}

/** The base every link in an email is built on, or null when email is off. */
export function emailLinkBase(
  env: Record<string, string | undefined> = process.env
): string | null {
  const config = emailConfig(env);
  return config.kind === "resend" ? config.baseUrl : null;
}

export async function sendEmail(
  message: EmailMessage,
  options: {
    env?: Record<string, string | undefined>;
    now?: Date;
  } = {}
): Promise<EmailResult> {
  const config: EmailConfig = emailConfig(options.env ?? process.env);
  const result = await deliver(message, config, options.now ?? new Date());
  const where = maskAddress(message.to);
  if (result.status === "sent")
    console.log(`[email] ${message.kind} sent to ${where}`);
  else
    console.warn(`[email] ${message.kind} NOT sent to ${where}: ${result.why}`);
  return result;
}

async function deliver(
  message: EmailMessage,
  config: EmailConfig,
  now: Date
): Promise<EmailResult> {
  if (config.kind === "off") return { status: "notSent", why: config.why };
  if (!mayDeliverTo(message.to, config.allowlist))
    return {
      status: "notSent",
      why: "not on STAGING_EMAIL_ALLOWLIST (staging)",
    };

  const day = now.toISOString().slice(0, 10);
  if (sentToday.day !== day) {
    sentToday.day = day;
    sentToday.count = 0;
  }
  if (sentToday.count >= config.dailyCap)
    return {
      status: "notSent",
      why: `daily cap of ${config.dailyCap} reached`,
    };

  // Counted before the call, so a burst of concurrent sends cannot all slip
  // under the cap while the first ones are still in flight.
  sentToday.count += 1;
  return sendViaResend(message, config);
}

/** "jo…@example.com" — enough to tell two logs apart, not enough to mail. */
export function maskAddress(address: string): string {
  const [name, domain] = address.split("@");
  if (!domain) return "(no address)";
  return `${name.slice(0, 2)}…@${domain}`;
}

/** For tests only: start the daily count again. */
export function resetEmailCountForTests(): void {
  sentToday.day = "";
  sentToday.count = 0;
}
