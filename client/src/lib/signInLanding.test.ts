/**
 * Signing in should land you where you asked to go, and the Dashboard when you
 * did not ask for anything.
 *
 * The bug: signing out from Settings left `#/settings` in the address bar, so
 * signing back in dropped you on Settings — a screen nobody had asked for,
 * reached because that is where you happened to be standing when you left.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_LANDING,
  addressAfterSignOut,
  landingAfterSignIn,
} from "./signInLanding";

describe("after signing out", () => {
  it("forgets the screen you were on", () => {
    // The whole fix in one line: whatever you were looking at, the address no
    // longer says so, so the next sign-in cannot be sent back to it.
    expect(addressAfterSignOut()).toBe(DEFAULT_LANDING);
  });
});

describe("after signing in", () => {
  it("lands on the Dashboard when nothing was asked for", () => {
    expect(landingAfterSignIn("")).toBe(DEFAULT_LANDING);
    expect(landingAfterSignIn("#/")).toBe(DEFAULT_LANDING);
    expect(landingAfterSignIn(null)).toBe(DEFAULT_LANDING);
    expect(landingAfterSignIn(undefined)).toBe(DEFAULT_LANDING);
    expect(landingAfterSignIn("#/dashboard")).toBe(DEFAULT_LANDING);
  });

  it("honours a link to one bid", () => {
    expect(landingAfterSignIn("#/bids/12")).toBe("/bids/12");
  });

  it("honours the surfaces that hang off a bid", () => {
    expect(landingAfterSignIn("#/bids/12/plans")).toBe("/bids/12/plans");
    expect(landingAfterSignIn("#/bids/12/proposal")).toBe("/bids/12/proposal");
    expect(landingAfterSignIn("#/bids/12/count")).toBe("/bids/12/count");
  });

  it("honours a link to a library screen, keeping which lens was asked for", () => {
    expect(landingAfterSignIn("#/library/materials")).toBe(
      "/library/materials"
    );
    expect(landingAfterSignIn("#/library/materials?view=pricing")).toBe(
      "/library/materials?view=pricing"
    );
    expect(landingAfterSignIn("#/library/assemblies?view=kits")).toBe(
      "/library/assemblies?view=kits"
    );
  });

  it("honours a link to a settings panel, naming the section", () => {
    expect(landingAfterSignIn("#/settings/pricing")).toBe("/settings/pricing");
    expect(landingAfterSignIn("#/settings/tax")).toBe("/settings/tax");
    expect(landingAfterSignIn("#/settings/branding")).toBe(
      "/settings/branding"
    );
  });

  /**
   * A settings panel this app does not have falls back to Pricing rather than
   * to nothing — the same rule `pathToRoute` applies everywhere, because the
   * section name reaches a component that switches on it.
   */
  it("falls back to Pricing for a settings panel that does not exist", () => {
    expect(landingAfterSignIn("#/settings/no-such-panel")).toBe(
      "/settings/pricing"
    );
    expect(landingAfterSignIn("#/settings")).toBe("/settings/pricing");
  });

  /**
   * A retired address is still a request — it just points at a screen that
   * moved. Sending it to the Dashboard would lose the intent; pathToRoute
   * already knows where each one went.
   */
  it("follows a retired address to the screen that took over", () => {
    expect(landingAfterSignIn("#/library/kits")).toBe(
      "/library/assemblies?view=kits"
    );
    expect(landingAfterSignIn("#/quickbid")).toBe(DEFAULT_LANDING);
  });

  it("lands an address that never existed on the Dashboard", () => {
    expect(landingAfterSignIn("#/no-such-screen")).toBe(DEFAULT_LANDING);
    expect(landingAfterSignIn("#/bids/not-a-number")).toBe(DEFAULT_LANDING);
  });
});
