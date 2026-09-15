/**
 * The session cookie has to be one the browser will actually keep.
 *
 * Browsers discard a SameSite=None cookie that is not also Secure. Over https
 * that never bites, but over plain http — a local run — it meant sign-in
 * "succeeded" and then bounced straight back to the form, because the cookie
 * was thrown away before it was ever sent back.
 */
import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { getSessionCookieOptions } from "./_core/cookies";

const request = (protocol: string, headers: Record<string, string> = {}) =>
  ({ protocol, headers }) as unknown as Request;

describe("session cookie options", () => {
  it("keeps SameSite=None, with Secure, over https", () => {
    expect(getSessionCookieOptions(request("https"))).toMatchObject({
      sameSite: "none",
      secure: true,
    });
  });

  it("trusts a proxy that says the original request was https", () => {
    expect(
      getSessionCookieOptions(request("http", { "x-forwarded-proto": "https" }))
    ).toMatchObject({ sameSite: "none", secure: true });
  });

  it("uses SameSite=Lax over plain http, so the browser keeps it", () => {
    expect(getSessionCookieOptions(request("http"))).toMatchObject({
      sameSite: "lax",
      secure: false,
    });
  });
});
