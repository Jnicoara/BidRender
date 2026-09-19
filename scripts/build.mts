/**
 * The production build — and the one place the build stamp is made.
 *
 * ── Why this replaced a two-command npm script ───────────────────────────────
 * `APP_VERSION` in shared/version.ts is a string a human has to remember to
 * bump, and on 2026-09-18 it was found reading `v6.1` against a `main` that was
 * 33 commits further on. That would be untidy on its own. What made it
 * expensive is that CLAUDE.md and references/deploying.md both ended the deploy
 * with "confirm the version tag moved" — **a check on a number that cannot
 * move**, run five or six times in one day, each time returning a pass it had
 * no way to fail.
 *
 * So the deploy check stops depending on anybody's memory. A build stamp is
 * made here, from the clock and from git, and it is the same value in both
 * bundles because it is computed ONCE, in this process, before either one runs.
 * Two `new Date()` calls in two scripts would differ by the seconds between
 * them, and a stamp that disagrees with itself is worse than no stamp: it looks
 * like a half-finished deploy.
 *
 * ── What it can and cannot tell you ──────────────────────────────────────────
 * `builtAt` always moves, on every build, with nothing to remember. `commit` is
 * best effort: git may not be present in a build container, and a missing SHA
 * must never fail a deploy, so it falls back to null and the timestamp carries
 * the check on its own.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { build as viteBuild } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");

/** The commit being built, or null where git cannot answer. Never throws. */
function commitSha(): string | null {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha.length > 0 ? sha : null;
  } catch {
    // No git, no repository, a shallow checkout without one — all fine.
    return null;
  }
}

const builtAt = new Date().toISOString();
const commit = commitSha();

console.log(`Build stamp: ${builtAt}${commit ? ` (${commit})` : " (no git)"}`);

/**
 * Vite inlines any `VITE_`-prefixed variable at build time, so the CLIENT
 * bundle carries the stamp inside it rather than asking for it later.
 *
 * That difference matters on exactly the day this all went wrong: a browser
 * holding a cached old bundle against a freshly deployed server would show the
 * SERVER's stamp if the page fetched it, and look deployed while running old
 * code. Baked in, the page can only report the build it actually is.
 */
process.env.VITE_BUILD_AT = builtAt;
process.env.VITE_BUILD_COMMIT = commit ?? "";

/*
  Both bundlers are IMPORTED and called, not spawned.

  ── Why not a child process ──────────────────────────────────────────────────
  Three ways of invoking them were tried and two were wrong:

  - `vite build` through a shell is how the npm script used to do it. It needs
    `shell: true` to resolve on Windows, where the thing on PATH is a .CMD
    wrapper, and node deprecates that because it concatenates arguments instead
    of escaping them.
  - `node node_modules/vite/bin/vite.js` fixes the escaping but hard-codes a
    path into node_modules, which is an assumption about the package manager's
    layout — pnpm symlinks, npm hoists, and a build machine is not the place to
    discover a difference.
  - Importing them makes node resolve the package the ordinary way, from this
    file, using the versions in the lockfile. No shell, no PATH, no layout.

  ── These are devDependencies, and that is correct ───────────────────────────
  DigitalOcean's buildpack strips devDependencies **after the build steps and
  before deployment** — the order matters and is the opposite of the worry it
  invites. `vite` and `esbuild` have always been devDependencies and every
  deploy since v5.137 has built with them; `tsx`, which runs this file, is in
  exactly the same position. What genuinely cannot be a devDependency is
  anything the RUN command needs, which is why `cross-env` was moved into
  dependencies in v5.137 — `pnpm start` executes after the pruning.
*/
await viteBuild();

await esbuild.build({
  entryPoints: [path.join(root, "server/_core/index.ts")],
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  outdir: distDir,
});

/**
 * The server's copy, read at startup and served from /api/version.
 *
 * Written after both bundlers rather than before: `vite build` empties its own
 * output directory, and a file written first into a directory something else
 * clears is a file that is sometimes there.
 */
mkdirSync(distDir, { recursive: true });
writeFileSync(
  path.join(distDir, "build-stamp.json"),
  JSON.stringify({ builtAt, commit }, null, 2) + "\n"
);

console.log("Wrote dist/build-stamp.json");
