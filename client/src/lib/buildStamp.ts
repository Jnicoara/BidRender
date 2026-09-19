/**
 * The build stamp as the BROWSER knows it — baked into this bundle at build
 * time by scripts/build.mts.
 *
 * ── Why baked in rather than fetched from /api/version ───────────────────────
 * Both exist and they answer different questions. The endpoint says what the
 * SERVER is running; this says what the page in front of you is running. A
 * browser holding a cached bundle against a freshly deployed server would show
 * a brand-new stamp if the page asked the server for it — and look deployed
 * while running last week's code. Baked in, the page can only report itself.
 *
 * Empty in dev, because `pnpm dev` never runs the build script. That is the
 * honest answer and is rendered as such.
 */
import type { BuildStamp } from "@shared/buildStamp";

/** Vite replaces these at build time; they are undefined under `pnpm dev`. */
const builtAt = import.meta.env.VITE_BUILD_AT;
const commit = import.meta.env.VITE_BUILD_COMMIT;

export const BUILD_STAMP: BuildStamp = {
  builtAt: typeof builtAt === "string" && builtAt.length > 0 ? builtAt : null,
  // An empty string is what the build writes when git could not answer, so it
  // is normalised to null here rather than rendering as a blank separator.
  commit: typeof commit === "string" && commit.length > 0 ? commit : null,
};
