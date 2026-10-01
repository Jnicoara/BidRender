import { describe, it, expect } from "vitest";
import {
  isChunkLoadError,
  markPageOutOfDate,
  newBuildAvailable,
  pageIsOutOfDate,
  readServerVersion,
  subscribeOutOfDate,
} from "./versionCheck";

const built = (
  commit: string | null,
  builtAt: string | null = "2026-09-30T10:00:00.000Z"
) => ({
  commit,
  builtAt,
});

describe("newBuildAvailable", () => {
  it("says yes when the server runs a different commit", () => {
    expect(newBuildAvailable(built("aaa1111"), built("bbb2222"))).toBe(true);
  });

  it("says no for the same commit, even rebuilt at another time", () => {
    expect(
      newBuildAvailable(
        built("aaa1111", "2026-09-30T10:00:00.000Z"),
        built("aaa1111", "2026-09-30T11:00:00.000Z")
      )
    ).toBe(false);
  });

  it("never says yes when the server could not be read", () => {
    expect(newBuildAvailable(built("aaa1111"), null)).toBe(false);
  });

  it("never says yes in dev, where the page has no stamp", () => {
    expect(newBuildAvailable(built(null, null), built("bbb2222"))).toBe(false);
  });

  it("falls back to the build time when a commit is missing on either side", () => {
    expect(
      newBuildAvailable(
        built(null, "2026-09-30T10:00:00.000Z"),
        built("bbb2222", "2026-09-30T11:00:00.000Z")
      )
    ).toBe(true);
    expect(
      newBuildAvailable(
        built(null, "2026-09-30T10:00:00.000Z"),
        built(null, "2026-09-30T10:00:00.000Z")
      )
    ).toBe(false);
  });
});

describe("readServerVersion", () => {
  it("reads the endpoint's shape", () => {
    expect(
      readServerVersion({
        version: "v6.1",
        builtAt: "2026-09-30T10:00:00.000Z",
        commit: "abc1234",
        mode: "production",
        now: "x",
      })
    ).toEqual({ builtAt: "2026-09-30T10:00:00.000Z", commit: "abc1234" });
  });

  it("treats anything else as unknown, never as a new version", () => {
    for (const body of [
      null,
      undefined,
      "<!doctype html>",
      42,
      {},
      { commit: "" },
    ]) {
      expect(readServerVersion(body)).toBeNull();
      expect(newBuildAvailable(built("aaa1111"), readServerVersion(body))).toBe(
        false
      );
    }
  });

  it("dev server (no stamp) reads as unknown", () => {
    expect(readServerVersion({ builtAt: null, commit: null })).toBeNull();
  });
});

describe("isChunkLoadError", () => {
  it("recognises each browser's wording", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: https://bidridge.com/assets/BidRenderShell-abc.js",
      "error loading dynamically imported module: https://bidridge.com/assets/x.js",
      "Importing a module script failed.",
      "Unable to preload CSS for /assets/index-abc.css",
    ]) {
      expect(isChunkLoadError(new TypeError(message))).toBe(true);
    }
  });

  it("does not claim ordinary crashes", () => {
    expect(
      isChunkLoadError(new TypeError("Cannot read properties of undefined"))
    ).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("the out-of-date flag", () => {
  it("starts false, flips once, and tells subscribers once", () => {
    expect(pageIsOutOfDate()).toBe(false);
    let calls = 0;
    const stop = subscribeOutOfDate(() => calls++);
    markPageOutOfDate();
    markPageOutOfDate();
    expect(pageIsOutOfDate()).toBe(true);
    expect(calls).toBe(1);
    stop();
  });
});
