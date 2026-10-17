/**
 * FAILURE DRILLS in the browser (owner's overnight queue, 2026-10-16, item
 * 6) — run by .github/workflows/regression.yml after the journey, against
 * the app started ON THE RUNNER, because a drill STOPS the database and
 * locks the plan folder. LOCAL ONLY, like the journey: a drill against
 * staging would take staging down for everybody.
 */
import { defineConfig } from "@playwright/test";
import { checkSmokeTarget } from "../../scripts/smokeTarget";

const target = checkSmokeTarget(
  process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3018"
);
if (!target.ok) throw new Error(target.message);
if (target.kind !== "local")
  throw new Error(
    "The drills stop the database and run against a server on this machine only (http://127.0.0.1:<port>)."
  );

export default defineConfig({
  testDir: ".",
  testMatch: /drills\.spec\.ts/,
  outputDir: "../.results/drills",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: target.origin,
    actionTimeout: 30_000,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    viewport: { width: 1366, height: 768 },
  },
});
