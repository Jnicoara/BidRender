import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  /**
   * Compile JSX with the automatic runtime, the way vite.config.ts does.
   *
   * Needed since a test started rendering real components — the landing page's
   * architecture test renders it with renderToStaticMarkup. Without this,
   * esbuild emits classic `React.createElement` calls into files that never
   * import React, and every render fails with "React is not defined". The app
   * build was always fine; only this config lacked the setting.
   */
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Server tests, plus the pure client libs (no DOM, no React) that carry
    // real logic worth pinning — smartSearch ranking in particular.
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/src/lib/**/*.test.ts",
      // One script is in here on purpose: scripts/loadPlansEnv.mts decides
      // which secrets a local dev run may borrow from the production env file,
      // and letting the wrong one through would hand a watching dev server the
      // LIVE database with nothing on screen to say so.
      "scripts/**/*.test.ts",
    ],
    // dotenv first, so vitest.setup.ts fills only what .env did not supply.
    setupFiles: ["dotenv/config", "./vitest.setup.ts"],
    // Refuses the whole run unless DATABASE_URL is a scratch database on this
    // machine — .env points at the real-data copy. See the file.
    globalSetup: ["./vitest.globalSetup.ts"],
    /**
     * One file at a time, because every DB-backed file shares one MySQL.
     *
     * These tests were always racing each other — separate files seed the same
     * baseline tables and write rows concurrently — and the symptom was a test
     * that asserts a specific rejection ("refuses another user's sheet")
     * failing because it got a lock-timeout error instead of the "not found"
     * it expected. Rare enough to look like noise, and it is not: a suite that
     * fails one test in three runs for reasons unrelated to the change under
     * test teaches people to re-run rather than to read.
     *
     * Growing the seeded material catalog from 29 rows to ~600 made it fire
     * often enough to be undeniable, which is the only reason it is fixed here
     * rather than being someone else's intermittent mystery. The cost is a
     * slower wall-clock suite; the benefit is that a red run means something.
     */
    fileParallelism: false,
  },
});
