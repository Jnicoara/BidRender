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
  //
  // TRIMMED, because the server trims ITS copy (server/stagingGate.ts reads
  // STAGING_PASSWORD with .trim()) and compares what is posted as sent — so a
  // secret pasted with a trailing space or newline was refused (401, the
  // first staging run, 2026-10-02). The account password is NOT trimmed:
  // there a space could be real, and the server does not trim it either.
  const gatePassword = (
    baseURL === "https://staging.bidridge.com"
      ? required("SMOKE_STAGING_PASSWORD")
      : (process.env.SMOKE_STAGING_PASSWORD ?? "")
  ).trim();
  if (gatePassword) {
    const gate = await request.post("/staging-gate", {
      form: { password: gatePassword },
      maxRedirects: 0,
    });
    expect(
      gate.status(),
      "staging password page refused SMOKE_STAGING_PASSWORD — re-enter that secret (it cannot be read back, only replaced)"
    ).toBeLessThan(400);
  }

  const login = await request.post("/api/trpc/auth.login", {
    data: {
      json: {
        email: required("SMOKE_EMAIL").trim(),
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
