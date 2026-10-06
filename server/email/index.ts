/**
 * THE ONE DOOR every email leaves through — the same idea as `server/llm`.
 *
 * The provider, the from-address, the staging allow-list and the caps live
 * here, so a feature added later cannot forget any of them. Nothing else in
 * `server/` may call the provider directly.
 *
 * ── It never pretends, and it never throws ───────────────────────────────────
 * Every call returns what actually happened: `sent`, or `notSent` with the
 * reason — and every `notSent` is LOGGED (owner, 2026-09-29). A server with no
 * key, an address off the staging list, a used-up cap and a provider refusal
 * all come back the same way. What a CALLER tells the person is the caller's
 * decision; see `emailAvailability` for the part a screen may always say.
 *
 * ── One address per send ─────────────────────────────────────────────────────
 * `to` is ONE address (owner, 2026-09-29). Anything that could be read as a
 * list is refused before the provider sees it (`singleAddress`).
 *
 * ── What is never logged ─────────────────────────────────────────────────────
 * The message body. A reset email carries a link that IS a credential for an
 * hour; a log line is readable by anyone who can read logs and outlives it.
 * Logs name the kind of email, the outcome and the reason — never the text,
 * and never the full address.
 */
import {
  emailConfig,
  mayDeliverTo,
  singleAddress,
  type EmailConfig,
} from "./config";
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
  /** A local or test run: logged, never handed to the provider. */
  | { status: "stubbed" }
  | { status: "notSent"; why: string };

/**
 * Whether this server can send at all, right now — independent of WHO the
 * email is for. So a screen may say it to anybody without revealing anything
 * about an address:
 *
 *   ok      sending is possible
 *   off     this server has no email set up
 *   later   a cap is reached or the provider has paused us — try later
 */
export type EmailAvailability =
  | { status: "ok" }
  | { status: "off"; why: string }
  | { status: "later"; why: string };

/** Sends per UTC day and month on this instance (see config.ts). */
const counts = { day: "", sentToday: 0, month: "", sentThisMonth: 0 };
/** Set when the provider refuses for quota or rate: nobody sends until then. */
let pausedUntil: { at: number; why: string } | null = null;

/** The base every link in an email is built on, or null when email is off. */
export function emailLinkBase(
  env: Record<string, string | undefined> = process.env
): string | null {
  const config = emailConfig(env);
  return config.kind === "off" ? null : config.baseUrl;
}

export function emailAvailability(
  options: { env?: Record<string, string | undefined>; now?: Date } = {}
): EmailAvailability {
  const config = emailConfig(options.env ?? process.env);
  if (config.kind === "off") return { status: "off", why: config.why };
  return quotaState(config, options.now ?? new Date());
}

function quotaState(
  config: Exclude<EmailConfig, { kind: "off" }>,
  now: Date
): EmailAvailability {
  if (config.kind === "stub") return { status: "ok" };
  rollCounts(now);
  if (pausedUntil && now.getTime() < pausedUntil.at)
    return { status: "later", why: pausedUntil.why };
  pausedUntil = null;
  if (counts.sentToday >= config.dailyCap)
    return { status: "later", why: `daily cap of ${config.dailyCap} reached` };
  if (counts.sentThisMonth >= config.monthlyCap)
    return {
      status: "later",
      why: `monthly cap of ${config.monthlyCap} reached`,
    };
  return { status: "ok" };
}

export async function sendEmail(
  message: EmailMessage,
  options: {
    env?: Record<string, string | undefined>;
    now?: Date;
  } = {}
): Promise<EmailResult> {
  const config: EmailConfig = emailConfig(options.env ?? process.env);
  let result: EmailResult;
  try {
    result = await deliver(message, config, options.now ?? new Date());
  } catch (error) {
    // Nothing below throws by design; this is the net under that claim, so a
    // mistake there still becomes a logged `notSent` and not a crash.
    result = {
      status: "notSent",
      why: `unexpected error (${error instanceof Error ? error.name : "error"})`,
    };
  }
  const where = maskAddress(message.to);
  if (result.status === "sent")
    console.log(`[email] ${message.kind} sent to ${where}`);
  else if (result.status === "stubbed")
    console.log(
      `[email] ${message.kind} to ${where} — local run, logged and NOT sent`
    );
  else
    console.error(
      `[email] ${message.kind} NOT sent to ${where}: ${result.why}`
    );
  return result;
}

async function deliver(
  message: EmailMessage,
  config: EmailConfig,
  now: Date
): Promise<EmailResult> {
  if (config.kind === "off") return { status: "notSent", why: config.why };
  const to = singleAddress(message.to);
  if (!to)
    return {
      status: "notSent",
      why: "the recipient is not exactly one address",
    };
  if (!mayDeliverTo(to, config.allowlist))
    return {
      status: "notSent",
      why: "not on STAGING_EMAIL_ALLOWLIST (staging)",
    };

  const state = quotaState(config, now);
  if (state.status !== "ok") return { status: "notSent", why: state.why };
  // Every check above has run, so a local run exercises the same refusals as
  // a live one — and then stops here, before anything leaves the machine.
  if (config.kind === "stub") return { status: "stubbed" };

  // Counted before the call, so a burst of concurrent sends cannot all slip
  // under a cap while the first ones are still in flight. A failed send still
  // counts: the provider may have counted it too, and over-counting only
  // stops us early.
  counts.sentToday += 1;
  counts.sentThisMonth += 1;
  const result = await sendViaResend({ ...message, to }, config);
  if (result.status === "notSent" && result.quota)
    pausedUntil = { at: pauseEnd(result.quota, now), why: result.why };
  return result.status === "sent"
    ? { status: "sent", id: result.id }
    : { status: "notSent", why: result.why };
}

/**
 * How long the provider's refusal holds. A daily quota resets at the next UTC
 * midnight and a monthly one on the 1st; a rate limit (10 a second) clears in
 * a moment, so a minute is plenty and costs nobody much.
 */
function pauseEnd(quota: "daily" | "monthly" | "rate", now: Date): number {
  if (quota === "daily")
    return Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    );
  if (quota === "monthly")
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return now.getTime() + 60_000;
}

function rollCounts(now: Date): void {
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  if (counts.day !== day) {
    counts.day = day;
    counts.sentToday = 0;
  }
  if (counts.month !== month) {
    counts.month = month;
    counts.sentThisMonth = 0;
  }
}

/** "jo…@example.com" — enough to tell two logs apart, not enough to mail. */
export function maskAddress(address: string): string {
  const [name, domain] = address.split("@");
  if (!domain) return "(no address)";
  return `${name.slice(0, 2)}…@${domain}`;
}

/** For tests only: forget every count and pause. */
export function resetEmailCountForTests(): void {
  counts.day = "";
  counts.sentToday = 0;
  counts.month = "";
  counts.sentThisMonth = 0;
  pausedUntil = null;
}
