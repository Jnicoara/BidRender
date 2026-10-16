/** client/src/lib/sessionExpiry.ts — signed out mid-work. */
import { describe, expect, it } from "vitest";
import { addressAfterExpiry, expiryNote, expiryNotice } from "./sessionExpiry";

describe("signed out in the middle of work", () => {
  it("says a change was lost only when it was a save that failed", () => {
    expect(expiryNotice(expiryNote(true))).toMatch(/last change wasn't saved/);
    expect(expiryNotice(expiryNote(false))).not.toMatch(/change/);
    expect(expiryNotice(expiryNote(false))).toMatch(/signed out/);
  });

  it("says nothing without a note, and the plain half for a garbled one", () => {
    expect(expiryNotice(null)).toBeNull();
    expect(expiryNotice("")).toBeNull();
    expect(expiryNotice("{oops")).toMatch(/^You were signed out\./);
  });

  it("keeps the address on the app's own sign-in, and only there", () => {
    expect(
      addressAfterExpiry("/", { pathname: "/", hash: "#/bids/42/plans" })
    ).toBe("/#/bids/42/plans");
    expect(
      addressAfterExpiry("https://portal.example/login", {
        pathname: "/",
        hash: "#/bids/42",
      })
    ).toBe("https://portal.example/login");
  });
});
