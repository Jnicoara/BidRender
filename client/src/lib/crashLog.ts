/**
 * What happens to a crash after the screen apologises for it.
 *
 * ── The user must not read this; somebody must be able to ────────────────────
 * A stack trace on screen tells a contractor nothing they can act on, and the
 * old error screen printed the whole thing — so the one person who could not
 * use it was the only person looking at it. But throwing the error away is
 * worse: "it broke, I clicked reload, it went away" is not a bug report anyone
 * can act on either.
 *
 * So the detail goes three places, none of them the visible screen:
 *
 *   1. `console.error`, tagged, for anyone with devtools open at the time.
 *   2. localStorage, so it survives the reload that follows — the crash is
 *      still there tomorrow, which is the whole point of writing it down.
 *   3. The clipboard, on request, formatted as something pasteable into a
 *      message. This is the one that actually reaches a developer, because it
 *      is the only one a contractor will ever use.
 *
 * ── Why the logic is in here and not in the component ────────────────────────
 * Everything below is pure except the two storage wrappers at the bottom, so
 * the capping, the formatting and the "somebody threw a string" case can be
 * tested without a DOM. See crashLog.test.ts.
 */
import { APP_VERSION_LABEL } from "@shared/version";

export type CrashRecord = {
  /** ISO timestamp. Absolute, because "2 hours ago" is useless in a bug report. */
  at: string;
  message: string;
  stack: string;
  /** React's component stack, when the boundary supplied one. */
  componentStack: string;
  /** The address the user was on, which is usually the first question asked. */
  where: string;
  version: string;
};

// The product's old name, kept on purpose: renaming the key would lose crash
// reports a browser has already saved.
export const CRASH_LOG_KEY = "helixbid.crashes";

/**
 * How many crashes to keep.
 *
 * Enough to show a pattern — the same screen failing four times says something
 * one failure does not — and few enough that a repeating crash in a render loop
 * cannot fill the origin's storage quota and start throwing a SECOND error from
 * inside the error handler.
 */
export const MAX_CRASHES = 10;

/**
 * Pull a message and stack out of whatever was thrown.
 *
 * `throw "nope"` is legal JavaScript and does reach an error boundary, so this
 * cannot assume an Error. A crash log that itself crashes on an unusual throw
 * is the least useful thing in the codebase.
 */
export function describeError(error: unknown): {
  message: string;
  stack: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Unknown error",
      stack: error.stack ?? "",
    };
  }
  if (typeof error === "string") return { message: error, stack: "" };
  try {
    return { message: JSON.stringify(error) ?? "Unknown error", stack: "" };
  } catch {
    // Circular, or something with a throwing getter.
    return { message: String(error), stack: "" };
  }
}

/** Newest first, capped. Pure — the caller owns the storage. */
export function addCrash(
  existing: readonly CrashRecord[],
  crash: CrashRecord
): CrashRecord[] {
  return [crash, ...existing].slice(0, MAX_CRASHES);
}

/**
 * The block of text the Copy button puts on the clipboard.
 *
 * Written to be pasted into a message and read by a person: labelled lines
 * first, then the stacks, and an empty section left out rather than printed as
 * a heading with nothing under it.
 */
export function formatCrash(crash: CrashRecord): string {
  const lines = [
    `BidRender crash report`,
    `When:    ${crash.at}`,
    `Screen:  ${crash.where}`,
    `Version: ${crash.version}`,
    ``,
    `Error:   ${crash.message}`,
  ];
  if (crash.stack) lines.push(``, crash.stack.trim());
  if (crash.componentStack) {
    lines.push(``, `Component stack:`, crash.componentStack.trim());
  }
  return lines.join("\n");
}

/** Everything known about a crash, at the moment it is caught. */
export function buildCrash(
  error: unknown,
  componentStack: string,
  where: string,
  now: Date
): CrashRecord {
  const { message, stack } = describeError(error);
  return {
    at: now.toISOString(),
    message,
    stack,
    componentStack,
    where,
    version: APP_VERSION_LABEL,
  };
}

// ── Storage. Everything above this line is pure. ─────────────────────────────

/**
 * Read the log back.
 *
 * Every failure returns an empty list rather than throwing: private browsing
 * denies localStorage outright, and a half-written or hand-edited value parses
 * to nonsense. Neither is worth breaking a screen over — least of all the error
 * screen, which is already the last line of defence.
 */
export function readCrashes(): CrashRecord[] {
  try {
    const raw = window.localStorage.getItem(CRASH_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CrashRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Write a crash down, and say so in the console.
 *
 * Never throws. It is called from inside `componentDidCatch`, where a second
 * error would take out the error boundary itself and leave the user with a
 * blank page instead of an apology.
 */
export function recordCrash(crash: CrashRecord): void {
  // First, because it is the one that works when storage does not.
  console.error(
    `[BidRender crash] ${crash.message} — on ${crash.where} (${crash.version})`,
    crash.stack || crash
  );
  try {
    const next = addCrash(readCrashes(), crash);
    window.localStorage.setItem(CRASH_LOG_KEY, JSON.stringify(next));
  } catch {
    // Storage full, or denied. The console line above still happened.
  }
}
