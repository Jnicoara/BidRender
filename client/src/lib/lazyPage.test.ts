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
