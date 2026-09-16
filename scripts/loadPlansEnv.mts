/**
 * Lend the plan-bucket credentials to a local process, without copying them.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 * The R2_PLANS_* values live in `.env.production.local`, which is gitignored
 * and is NOT loaded by `pnpm dev` — deliberately, because the same file holds
 * the LIVE database URL. `import "dotenv/config"` reads `.env` and nothing
 * else, and that gap is a safety feature: no local run can point itself at
 * production by accident.
 *
 * Copying the five R2_PLANS_* values into `.env` would work and is the wrong
 * trade: a secret in two files is a secret in two places to rotate, to leak and
 * to forget about.
 *
 * ── What this does instead ───────────────────────────────────────────────────
 * Reads that file and takes ONLY the lines whose name begins `R2_PLANS_`.
 * Everything else in it — DATABASE_URL above all, but also the Forge keys and
 * the backup bucket's R2_* credentials — is dropped before anything is
 * returned, so a process started this way cannot reach production even by
 * asking. The filter is by name, not by position, so re-ordering the file or
 * adding to it cannot widen what escapes.
 *
 * Nothing is written anywhere. The values exist only in the child process.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/** The one file these secrets live in. */
export const PLANS_ENV_FILE = ".env.production.local";

/** The only prefix allowed out of that file. */
const ALLOWED_PREFIX = "R2_PLANS_";

/**
 * Parse `KEY=value` lines, keeping only the allowed prefix.
 *
 * Deliberately small rather than handing the file to dotenv: dotenv's job is
 * to load everything, and everything is exactly what must not happen here.
 * Quotes are stripped because a pasted secret often arrives wrapped in them.
 */
export function pickPlansVars(contents: string): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    if (!name.startsWith(ALLOWED_PREFIX)) continue;
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (value) picked[name] = value;
  }
  return picked;
}

/**
 * The plan-bucket variables, read from the repo root.
 *
 * Throws with an actionable message rather than returning an empty object: a
 * silently unconfigured run would fall back to disk storage and look like it
 * worked, which is the failure this whole exercise is trying to avoid.
 */
export function loadPlansEnv(repoRoot = process.cwd()): Record<string, string> {
  const file = path.resolve(repoRoot, PLANS_ENV_FILE);
  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `Could not read ${PLANS_ENV_FILE}. It holds the R2_PLANS_* credentials and is not committed, so it has to exist on this machine.`
    );
  }

  const picked = pickPlansVars(contents);
  if (Object.keys(picked).length === 0) {
    throw new Error(
      `${PLANS_ENV_FILE} has no R2_PLANS_* lines with values in it.`
    );
  }
  return picked;
}
