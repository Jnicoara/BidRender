/** client/src/lib/lazyPage.ts — a stale tab reloads once, never in a loop. */
import { describe, expect, it } from "vitest";
import { CHUNK_RELOAD_WINDOW_MS, shouldReloadForChunkError } from "./lazyPage";

describe("a page file that is gone after a deploy", () => {
  it("reloads the first time", () => {
    expect(shouldReloadForChunkError(null, 1_000_000)).toBe(true);
  });

  it("does not reload again inside the window — the error is shown instead", () => {
    const now = 1_000_000;
    expect(shouldReloadForChunkError(now - 5_000, now)).toBe(false);
    expect(shouldReloadForChunkError(now - CHUNK_RELOAD_WINDOW_MS, now)).toBe(
      false
    );
  });

  it("reloads again for a later deploy, once the window has passed", () => {
    const now = 1_000_000;
    expect(
      shouldReloadForChunkError(now - CHUNK_RELOAD_WINDOW_MS - 1, now)
    ).toBe(true);
  });
});

describe("a page file that failed because the browser is OFFLINE", () => {
  it("does not reload until the connection is back AND held saves are sent", async () => {
    const { vi } = await import("vitest");
    const { reloadingImport } = await import("./lazyPage");
    const { setPendingWrites } = await import("./dataReach");
    const listeners: Record<string, (() => void)[]> = {};
    const reload = vi.fn();
    const nav = { onLine: false };
    vi.stubGlobal("navigator", nav);
    vi.stubGlobal("window", {
      addEventListener: (type: string, fn: () => void) =>
        (listeners[type] ??= []).push(fn),
      location: { reload },
    });
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {},
    });
    try {
      setPendingWrites(1); // a save made offline, waiting to be sent
      const load = reloadingImport(() =>
        Promise.reject(
          new TypeError("Failed to fetch dynamically imported module")
        )
      );
      let settled = false;
      void load().then(
        () => (settled = true),
        () => (settled = true)
      );
      await new Promise(r => setTimeout(r, 0));
      // Offline: no reload — that would land on the browser's "no internet"
      // page and drop the held save.
      expect(reload).not.toHaveBeenCalled();
      // Back online, but the save is still going out: still no reload.
      nav.onLine = true;
      for (const fn of listeners.online ?? []) fn();
      await new Promise(r => setTimeout(r, 0));
      expect(reload).not.toHaveBeenCalled();
      // The save is sent: now the tab reloads to fetch the file, once.
      setPendingWrites(0);
      await new Promise(r => setTimeout(r, 0));
      expect(reload).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false); // the page is going away; nothing renders
    } finally {
      setPendingWrites(0);
      vi.unstubAllGlobals();
    }
  });
});
