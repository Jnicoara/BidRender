/**
 * The browser smoke test — references/build-pipeline-plan.md § 4 (piece 3).
 *
 *   SMOKE_BASE_URL=https://staging.bidridge.com SMOKE_EMAIL=… SMOKE_PASSWORD=… \
 *     SMOKE_STAGING_PASSWORD=… pnpm smoke
 *
 * Locally, put SMOKE_BASE_URL / SMOKE_EMAIL / SMOKE_PASSWORD for a LOCAL test
 * account in .env.test.local (git-ignored) and run `pnpm smoke`.
 *
 * ── Nothing here may leak a credential, and the repo is PUBLIC ──────────────
 * A failed run's files are uploaded as a workflow artifact, which anyone can
 * download from a public repo. A Playwright TRACE records every request with
 * its headers and body — the staging password POST, the login POST and the
 * session cookie on every call after it. So videos are OFF, a TRACE is kept
 * for a FAILED test only, and CI uploads that trace ENCRYPTED, never as it
 * is: `.github/workflows/gate.yml` seals each trace.zip with the smoke
 * secrets as the passphrase — anyone able to open it already holds every
 * credential inside it — and the upload's patterns cannot match a plain
 * trace.zip. How to open one: references/deploying.md § 12. The session
 * file the setup writes (e2e/.auth/) is git-ignored and never uploaded.
 *
 * Why a trace at all (2026-10-09): flow test 5 failed once with a screenshot
 * as the only evidence, and the cause took a session to find — the click
 * had armed the WRONG count, which a picture cannot show and a trace's
 * network tab shows at once.
 */
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import { checkSmokeTarget } from "../scripts/smokeTarget";
import { AUTH_FILE } from "./smoke/authFile";

// Local runs read a local account from .env.test.local; CI passes env vars.
dotenv.config({ path: ".env.test.local", quiet: true });

const target = checkSmokeTarget(process.env.SMOKE_BASE_URL);
if (!target.ok) throw new Error(target.message);

const touch = { hasTouch: true, isMobile: true } as const;

export default defineConfig({
  testDir: "./smoke",
  outputDir: "./.results",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // One account, one set of throwaway bids: never run two specs at once.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // Failures only: `dot` prints a character per test and the failures in
  // full; `github` turns each failure into an annotation on the run.
  reporter: process.env.CI ? [["dot"], ["github"]] : [["dot"]],
  use: {
    baseURL: target.origin,
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
    storageState: AUTH_FILE,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: "desktop",
      dependencies: ["setup"],
      testMatch: /(flow|screens|version)\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone",
      dependencies: ["setup"],
      testMatch: /screens\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 }, ...touch },
    },
    {
      name: "tablet-portrait",
      dependencies: ["setup"],
      testMatch: /(screens|touch)\.spec\.ts/,
      use: { viewport: { width: 820, height: 1180 }, ...touch },
    },
    {
      name: "tablet-landscape",
      dependencies: ["setup"],
      testMatch: /(screens|touch)\.spec\.ts/,
      use: { viewport: { width: 1180, height: 820 }, ...touch },
    },
  ],
});
