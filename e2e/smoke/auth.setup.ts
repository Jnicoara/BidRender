/**
 * Sign the smoke account in once, and leave the session for every spec.
 *
 * Done with plain requests rather than by typing into the page, so the
 * passwords never pass through a screenshot. Nothing here prints a
 * credential or a cookie: a failure says WHICH step failed and its HTTP
 * status, never what was sent.
 */
import { expect, test as setup } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AUTH_FILE } from "./authFile";
import { sweepLeftovers, trpc } from "./helpers";

function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set (see e2e/playwright.config.ts).`);
  return value;
}

setup("sign in the smoke account", async ({ request, baseURL }) => {
  // Staging answers every request with its password page until the browser
  // holds the gate cookie (server/stagingGate.ts). A local server has no gate.
  // Posted whenever a staging password is given, so the same path can be
  // proved against a local server started with STAGING_PASSWORD set.
  const gatePassword =
    baseURL === "https://staging.bidridge.com"
      ? required("SMOKE_STAGING_PASSWORD")
      : process.env.SMOKE_STAGING_PASSWORD;
  if (gatePassword) {
    const gate = await request.post("/staging-gate", {
      form: { password: gatePassword },
      maxRedirects: 0,
    });
    expect(
      gate.status(),
      "staging password page refused the password"
    ).toBeLessThan(400);
  }

  const login = await request.post("/api/trpc/auth.login", {
    data: {
      json: {
        email: required("SMOKE_EMAIL"),
        password: required("SMOKE_PASSWORD"),
      },
    },
  });
  expect(login.status(), "sign-in refused the smoke account").toBe(200);

  const me = await trpc<{ id: number } | null>(request, "auth.me");
  expect(me?.id, "signed in, but auth.me has no user").toBeTruthy();

  // A first-run account is sent from the Dashboard to the welcome screen, so
  // the screens check would measure the wrong page. Finish first-run once,
  // as the welcome screen's own button does — the smoke account's state only.
  const onboarding = await trpc<{ isFirstRun: boolean }>(
    request,
    "onboarding.state"
  );
  if (onboarding.isFirstRun)
    await trpc(request, "onboarding.completeFirstRun", undefined, true);

  // A run that crashed half way leaves bids and captured symbols behind.
  await sweepLeftovers(request);

  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  await request.storageState({ path: AUTH_FILE });
});
