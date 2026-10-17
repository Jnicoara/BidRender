/**
 * The browser half of the stress harness (.github/workflows/stress.yml,
 * owner's overnight queue 2026-10-16, item 5). Runs against STAGING — the
 * real R2 bucket and the real network are what an upload's and a page's
 * time are made of — on the smoke account, with the smoke's own sign-in
 * (../smoke/auth.setup.ts) and its throwaway-bid prefix, so the smoke's
 * sweep clears anything a crashed run leaves.
 *
 * Same credential rules as e2e/playwright.config.ts: no video, a trace only
 * on failure, sealed by the workflow before upload (the repo is public).
 */
import { defineConfig } from "@playwright/test";
import { checkSmokeTarget } from "../../scripts/smokeTarget";
import { AUTH_FILE } from "../smoke/authFile";

const target = checkSmokeTarget(process.env.SMOKE_BASE_URL);
if (!target.ok) throw new Error(target.message);

export default defineConfig({
  testDir: ".",
  outputDir: "../.results",
  timeout: 45 * 60_000,
  expect: { timeout: 60_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: target.origin,
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
    storageState: AUTH_FILE,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "setup",
      testDir: "../smoke",
      testMatch: /auth\.setup\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: "stress",
      dependencies: ["setup"],
      testMatch: /stress\.spec\.ts/,
    },
  ],
});
