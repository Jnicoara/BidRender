/**
 * PAGES LOAD WHEN THEY ARE OPENED — and an old tab survives a deploy.
 *
 * Stress run, 2026-10-15 (references/stress-results.md): every page was in
 * the shell's bundle, so showing the Dashboard meant downloading the plan
 * viewer, the proposal and fifteen other screens first — 834 KB gzipped,
 * about 4.2 s on a weak 4G signal before anything could appear. Loaded on
 * demand it is 217 KB (~1.1 s).
 *
 * ── The trap that comes with it ──────────────────────────────────────────────
 * A tab opened before a deploy still asks for the OLD page files by their
 * old hashed names, which the new build does not have: the import fails and
 * the screen would break. So a failed page import reloads the tab ONCE (the
 * reload fetches the new build), and a second failure inside the window is
 * passed on to the error boundary instead of reloading in a loop.
 */

import { reloadWhenSaved, whenNoPendingWrites } from "./dataReach";

/** How long a reload counts as "just tried" — no second reload inside it. */
export const CHUNK_RELOAD_WINDOW_MS = 30_000;
export const CHUNK_RELOAD_KEY = "bidridge:chunk-reload-at";

/** Reload for this failed import, or let it fail? Pure, for the test. */
export function shouldReloadForChunkError(
  lastReloadAt: number | null,
  now: number
): boolean {
  return lastReloadAt === null || now - lastReloadAt > CHUNK_RELOAD_WINDOW_MS;
}

/**
 * Offline is not a deploy. Drilled 2026-10-15: opening a screen whose file
 * had not arrived yet, with no signal, reloaded the tab into the browser's
 * "no internet" page — the app gone, and a save it was holding to send
 * later gone with it. Chrome also REMEMBERS a failed import (asking again
 * never reaches the network), so only a reload can fetch the file. So: wait
 * for the connection, wait for held saves to go out, THEN reload.
 */
function reloadWhenBackOnline(): Promise<never> {
  const reloadAfterSaves = () =>
    void whenNoPendingWrites().then(() => window.location.reload());
  if (navigator.onLine) reloadAfterSaves();
  else window.addEventListener("online", reloadAfterSaves, { once: true });
  return new Promise<never>(() => {});
}

/** A page module loader that reloads the tab once on a missing chunk. */
export function reloadingImport<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((error: unknown) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false)
        return reloadWhenBackOnline();
      let last: number | null = null;
      try {
        const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
        last = raw === null ? null : Number(raw);
      } catch {
        // Storage blocked: fall through and reload — the window just cannot
        // be remembered, and one reload is still the right first answer.
      }
      if (!shouldReloadForChunkError(last, Date.now())) throw error;
      try {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
      } catch {
        // See above.
      }
      // After any save in flight — a reload would cancel it.
      reloadWhenSaved();
      // Never settles: the page is going away.
      return new Promise<T>(() => {});
    });
}
