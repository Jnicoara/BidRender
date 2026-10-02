import { describe, expect, it } from "vitest";
import { isResetAddress, resetTokenFromHash } from "./resetLink";

describe("reset link parsing", () => {
  it("reads the token from the address the email carries", () => {
    const hash = "#/reset-password?token=abc_DEF-123";
    expect(isResetAddress(hash)).toBe(true);
    expect(resetTokenFromHash(hash)).toBe("abc_DEF-123");
  });

  it("recognises the page with no token (after it has been read) and a trailing slash", () => {
    expect(isResetAddress("#/reset-password")).toBe(true);
    expect(isResetAddress("#/reset-password/")).toBe(true);
    expect(resetTokenFromHash("#/reset-password")).toBeNull();
    expect(resetTokenFromHash("#/reset-password?token=")).toBeNull();
  });

  it("is not fooled by other addresses", () => {
    expect(isResetAddress("#/settings/pricing")).toBe(false);
    expect(isResetAddress("#/reset-password-extra?token=x")).toBe(false);
    expect(isResetAddress("")).toBe(false);
    expect(resetTokenFromHash("#/bids/4?token=x")).toBeNull();
  });
});
