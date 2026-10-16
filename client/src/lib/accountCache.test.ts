import { describe, expect, it } from "vitest";
import { isSignInQuery, shouldDropAccountCache } from "./accountCache";

describe("shouldDropAccountCache", () => {
  it("drops on sign-out and on a different person", () => {
    expect(shouldDropAccountCache(7, null)).toBe(true);
    expect(shouldDropAccountCache(7, 9)).toBe(true);
  });

  it("keeps the cache for the same person, and on first sign-in", () => {
    expect(shouldDropAccountCache(7, 7)).toBe(false);
    expect(shouldDropAccountCache(null, 7)).toBe(false);
    expect(shouldDropAccountCache(null, null)).toBe(false);
  });
});

describe("isSignInQuery", () => {
  it("knows tRPC's key for auth.me, and nothing else", () => {
    expect(isSignInQuery([["auth", "me"], { type: "query" }])).toBe(true);
    expect(
      isSignInQuery([["bids", "list"], { input: {}, type: "query" }])
    ).toBe(false);
    expect(isSignInQuery([["auth", "signupMode"], { type: "query" }])).toBe(
      false
    );
  });
});
