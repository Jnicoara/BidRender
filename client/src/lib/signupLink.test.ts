import { describe, expect, it } from "vitest";
import {
  INVALID_INVITE,
  inviteCodeFromHash,
  isSignupAddress,
  signupView,
} from "./signupLink";

describe("the sign-up address", () => {
  it("recognises #/signup with or without a code or trailing slash", () => {
    expect(isSignupAddress("#/signup")).toBe(true);
    expect(isSignupAddress("#/signup/")).toBe(true);
    expect(isSignupAddress("#/signup?invite=abc")).toBe(true);
    expect(isSignupAddress("#/signups")).toBe(false);
    expect(isSignupAddress("#/settings")).toBe(false);
    expect(isSignupAddress("")).toBe(false);
  });

  it("reads the invite code, trimmed, and nothing from another page", () => {
    expect(inviteCodeFromHash("#/signup?invite=AbC123xyz")).toBe("AbC123xyz");
    expect(inviteCodeFromHash("#/signup?invite=%20AbC%20")).toBe("AbC");
    expect(inviteCodeFromHash("#/signup")).toBeNull();
    expect(inviteCodeFromHash("#/signup?invite=")).toBeNull();
    expect(inviteCodeFromHash("#/reset-password?invite=AbC")).toBeNull();
  });
});

describe("what the Create account side shows", () => {
  it("waits for the server before choosing — never flashes a form that may vanish", () => {
    expect(
      signupView({ inviteOnly: undefined, code: null, info: undefined })
    ).toEqual({
      kind: "waiting",
    });
    expect(
      signupView({ inviteOnly: true, code: "abcd", info: undefined })
    ).toEqual({
      kind: "waiting",
    });
  });

  it("is the open form when the gate is off and there is no code", () => {
    expect(
      signupView({ inviteOnly: false, code: null, info: undefined })
    ).toEqual({
      kind: "open",
    });
  });

  it("is one line, nothing to fill in, when the gate is on and there is no code", () => {
    expect(
      signupView({ inviteOnly: true, code: null, info: undefined })
    ).toEqual({
      kind: "closed",
    });
  });

  it("says the server's reason for a refused code, or the plain invalid line", () => {
    expect(
      signupView({
        inviteOnly: true,
        code: "abcd",
        info: {
          ok: false,
          message: "This invite has expired — ask Ann for a new one.",
        },
      })
    ).toEqual({
      kind: "refused",
      message: "This invite has expired — ask Ann for a new one.",
    });
    expect(
      signupView({
        inviteOnly: true,
        code: "abcd",
        info: { ok: false, message: null },
      })
    ).toEqual({ kind: "refused", message: INVALID_INVITE });
    expect(
      signupView({
        inviteOnly: true,
        code: "abcd",
        info: undefined,
        infoError: "Too many attempts. Wait an hour and try again.",
      })
    ).toMatchObject({ kind: "refused" });
  });

  it("locks the address on a new-company invite — the account must use it", () => {
    expect(
      signupView({
        inviteOnly: true,
        code: "abcd",
        info: {
          ok: true,
          kind: "newCompany",
          email: "ann@shop.com",
          companyName: null,
        },
      })
    ).toMatchObject({
      kind: "invited",
      lockedEmail: "ann@shop.com",
      suggestedEmail: null,
    });
  });

  it("only suggests the address on a company code, and names the company", () => {
    expect(
      signupView({
        inviteOnly: false,
        code: "abcd",
        info: {
          ok: true,
          kind: "company",
          email: "bo@shop.com",
          companyName: "Volt Bros",
        },
      })
    ).toEqual({
      kind: "invited",
      heading: "You're invited to join Volt Bros on BidRidge.",
      lockedEmail: null,
      suggestedEmail: "bo@shop.com",
    });
  });

  it("uses a code even when the gate is off", () => {
    expect(
      signupView({
        inviteOnly: false,
        code: "abcd",
        info: { ok: true, kind: "company", email: null, companyName: null },
      })
    ).toMatchObject({ kind: "invited" });
  });
});
