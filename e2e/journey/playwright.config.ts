/**
 * The whole-job journey — one NEW account, one bid, from sign-up to the
 * takeoff CSV, at three screen sizes.
 *
 *   SMOKE_BASE_URL=http://127.0.0.1:3018 npx playwright test -c e2e/journey/playwright.config.ts
 *
 * LOCAL ONLY. The journey signs a brand-new account up through the screen,
 * which only works where sign-up is open (a local server), and it writes a
 * bid, prices and marks into that account. The address goes through the
 * same allow-list as the smoke test (scripts/smokeTarget.ts), and then this
 * file refuses staging as well: staging is invite-only and the journey must
 * never leave accounts there.
 *
 * Unlike e2e/playwright.config.ts there is no setup project and no stored
 * session: each project signs its own account up, so the three runs share
 * nothing and a fault in one cannot hide in another.
 *
 * Same leak rules as the smoke config: video off, a trace kept only for a
 * failed test (a trace records the sign-up POST with its password — a
 * throwaway one, generated per run, on a throwaway local account).
 */
import { defineConfig } from "@playwright/test";
import { checkSmokeTarget } from "../../scripts/smokeTarget";

const target = checkSmokeTarget(
  process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3018"
);
if (!target.ok) throw new Error(target.message);
if (target.kind !== "local")
  throw new Error(
    "The journey signs up new accounts and runs against a server on this machine only (http://127.0.0.1:<port>)."
  );

const touch = { hasTouch: true, isMobile: true } as const;

export default defineConfig({
  testDir: ".",
  testMatch: /journey\.spec\.ts/,
  // Inside e2e/.results/, which is git-ignored.
  outputDir: "../.results/journey",
  timeout: 420_000,
  expect: { timeout: 20_000 },
  // One dev server: three projects one after another, never at once.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: target.origin,
    // A control that never appears fails in 30 s, not at the 7-minute
    // test timeout.
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [
    { name: "laptop", use: { viewport: { width: 1366, height: 768 } } },
    {
      name: "ipad",
      use: { viewport: { width: 820, height: 1180 }, ...touch },
    },
    {
      name: "phone",
      use: { viewport: { width: 390, height: 844 }, ...touch },
    },
  ],
});
