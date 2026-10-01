/**
 * "Is the page in front of me older than what the server is now running?"
 *
 * ── Why this exists (2026-09-30) ─────────────────────────────────────────────
 * A tab opened before a deploy keeps the old JavaScript in memory until it is
 * reloaded, and nothing told it a new build existed. So a fix like "a
 * proposal never shows the client $0" did not reach anybody who already had
 * BidRidge open — they kept printing $0 until they happened to refresh. On a
 * screen whose job is money, old code is a wrong-number risk, not a cosmetic
 * one. See todo.md, "Open tabs keep running the OLD code".
 *
 * The answer is a bar that says a new version is available, with a Refresh
 * button. **Never an automatic reload**: a reload can drop a typed draft, an
 * unsent batch of marks or an open dialog, and the person knows when they are
 * between things; the app does not.
 *
 * Pure decisions here, so vitest can reach them. The polling and the bar live
 * in `@/components/NewVersionBar`.
 */
import type { BuildStamp } from "@shared/buildStamp";

/** How often an open tab asks. Also asked whenever the tab comes back into view. */
export const VERSION_POLL_MS = 5 * 60_000;

/**
 * Read `/api/version`'s body defensively. Anything that is not the expected
 * shape — an HTML error page, a proxy's JSON, a network failure turned into
 * `null` — is `null`, which means "do not know", never "different".
 */
export function readServerVersion(body: unknown): BuildStamp | null {
  if (typeof body !== "object" || body === null) return null;
  const { builtAt, commit } = body as Record<string, unknown>;
  const text = (v: unknown) =>
    typeof v === "string" && v.length > 0 ? v : null;
  const stamp = { builtAt: text(builtAt), commit: text(commit) };
  return stamp.builtAt === null && stamp.commit === null ? null : stamp;
}

/**
 * True only when BOTH sides are known and they name different builds.
 *
 * - The page has no stamp (`pnpm dev`, which never runs the build script):
 *   false. Dev reloads itself.
 * - The server could not be read: false. An unreachable server is not a new
 *   version, and a bar that appears whenever the wifi drops teaches people to
 *   ignore it.
 * - Commit on both sides: compare commits. A rebuild of the same commit is the
 *   same code and must not nag.
 * - Otherwise (git was unavailable to one build): compare `builtAt`, which the
 *   build writes identically into the bundle and into the server's stamp file
 *   (scripts/build.mts).
 */
export function newBuildAvailable(
  own: BuildStamp,
  server: BuildStamp | null
): boolean {
  if (server === null) return false;
  if (own.builtAt === null && own.commit === null) return false;
  if (own.commit !== null && server.commit !== null) {
    return own.commit !== server.commit;
  }
  if (own.builtAt !== null && server.builtAt !== null) {
    return own.builtAt !== server.builtAt;
  }
  return false;
}

/**
 * Did loading a piece of the app's code fail — the signature of a page that
 * outlived its deploy?
 *
 * After a deploy the old build's hashed files are gone from the server, so a
 * tab still running the old build fails the moment it lazily asks for one.
 * Each browser words it differently; Vite's CSS preload has its own. These are
 * the messages, not a guess at a type: a dynamic `import()` rejects with a
 * plain TypeError everywhere.
 */
const CHUNK_LOAD_MESSAGES = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite's own CSS preload
];

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return CHUNK_LOAD_MESSAGES.some(pattern => pattern.test(message));
}

// ── "This page is out of date", as a tiny store ──────────────────────────────
//
// Set by Vite's `vite:preloadError` (main.tsx), read by the bar and by the
// error screen. A store rather than React state because the event fires
// outside React, and possibly before the bar has mounted.

let outOfDate = false;
const listeners = new Set<() => void>();

export function markPageOutOfDate(): void {
  if (outOfDate) return;
  outOfDate = true;
  listeners.forEach(listener => listener());
}

export function pageIsOutOfDate(): boolean {
  return outOfDate;
}

export function subscribeOutOfDate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
