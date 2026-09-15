/**
 * Where the backup goes, and the credentials to get it there.
 *
 * ── Same secret pattern as the LLM gateway key ──────────────────────────────
 * Read from `process.env` on the server and nowhere else. No `VITE_` prefix on
 * any of these, which is the load-bearing detail: Vite inlines every `VITE_*`
 * variable into the client bundle at build time, so a secret named that way is
 * published to every visitor. `.env` is gitignored, so nothing here reaches
 * GitHub either.
 *
 * Deliberately app-level rather than an addition to `server/_core/env.ts`.
 * `_core` is Manus template scaffolding (CLAUDE.md § Architecture), and the
 * whole point of this tool is that it keeps working when Manus does not — so
 * its configuration does not live in Manus's file.
 *
 * ── Why the destination is not Manus ────────────────────────────────────────
 * references/deploying.md § 8 lists four Manus services the app cannot run
 * without, one of which is the S3 presign proxy holding every plan PDF. A
 * backup that lands anywhere Manus controls is not a backup of that risk. R2
 * is reachable with nothing but these four values and the public internet.
 */

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Full S3 endpoint. Derived from the account id unless overridden. */
  endpoint: string;
  /** Everything is written under this prefix, so one bucket can hold more. */
  prefix: string;
};

/** The variables that must be set. Named here once so errors can list them. */
export const REQUIRED_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

export type ConfigResult =
  | { ok: true; config: R2Config }
  | { ok: false; missing: string[] };

/**
 * Read the R2 configuration, or say precisely what is absent.
 *
 * Returns a result rather than throwing, and never returns a partially-filled
 * config: a backup that runs with three of four credentials fails at upload
 * time, after reading the whole database, which is the most expensive possible
 * moment to discover a typo.
 */
export function readR2Config(
  env: NodeJS.ProcessEnv = process.env
): ConfigResult {
  const missing = REQUIRED_VARS.filter(name => !env[name]?.trim());
  if (missing.length > 0) return { ok: false, missing };

  const accountId = env.R2_ACCOUNT_ID!.trim();

  return {
    ok: true,
    config: {
      accountId,
      accessKeyId: env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim(),
      bucket: env.R2_BUCKET!.trim(),
      endpoint:
        env.R2_ENDPOINT?.trim() ||
        `https://${accountId}.r2.cloudflarestorage.com`,
      // `helixbid` is the product's old name and stays: it is the folder the
      // existing backups live in, and a new default would start an empty one.
      prefix: (env.R2_BACKUP_PREFIX?.trim() || "helixbid").replace(
        /^\/+|\/+$/g,
        ""
      ),
    },
  };
}

/**
 * What the admin screen may be told about the configuration.
 *
 * Deliberately not the config itself. Whether the backup is set up is a useful
 * thing to see; the secret access key is not, and an endpoint that echoes the
 * account id is enough to identify the bucket without handing it over.
 */
export function describeConfig(result: ConfigResult): {
  configured: boolean;
  missing: string[];
  bucket: string | null;
  prefix: string | null;
} {
  if (!result.ok) {
    return {
      configured: false,
      missing: result.missing,
      bucket: null,
      prefix: null,
    };
  }
  return {
    configured: true,
    missing: [],
    bucket: result.config.bucket,
    prefix: result.config.prefix,
  };
}
