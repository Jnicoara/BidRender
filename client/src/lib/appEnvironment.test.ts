/**
 * Whether this browser is looking at the staging site — the one decision
 * behind the STAGING band. See appEnvironment.ts for why it reads a cookie.
 */
import { describe, expect, it } from "vitest";
import { isStagingFromCookies } from "./appEnvironment";

describe("isStagingFromCookies", () => {
  it("is staging only when the gate's env cookie says so", () => {
    expect(isStagingFromCookies("bidridge_env=staging")).toBe(true);
    expect(
      isStagingFromCookies("app_session_id=abc; bidridge_env=staging; x=1")
    ).toBe(true);
  });

  it("is NOT staging on the live site, which never sets the cookie", () => {
    expect(isStagingFromCookies("")).toBe(false);
    expect(isStagingFromCookies("app_session_id=abc")).toBe(false);
  });

  it("does not match a lookalike name or value", () => {
    expect(isStagingFromCookies("xbidridge_env=staging")).toBe(false);
    expect(isStagingFromCookies("bidridge_env=stagingx")).toBe(false);
    expect(isStagingFromCookies("bidridge_env=production")).toBe(false);
  });
});
