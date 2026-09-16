/**
 * Which store holds the app's files, and the credentials for the R2 one.
 *
 * ── Three backends behind one socket ─────────────────────────────────────────
 * Plan PDFs, the legacy per-project PDF and company logos all go through
 * `server/storage.ts`, which has always been able to point at two places: the
 * Manus presign proxy, or a folder on this machine (`diskStorage.ts`). R2 is a
 * third, plugged into the same socket, so nothing above the storage layer — no
 * router, no client code, no database column — knows which one is on.
 *
 * ── Chosen explicitly, never inferred from credentials ───────────────────────
 * `PLAN_STORAGE` names the backend. Leave it unset and the answer is exactly
 * what it was before R2 existed: disk when LOCAL_STORAGE_DIR is set, Manus
 * otherwise. So adding this file changed nothing on its own.
 *
 * The tempting alternative — switch to R2 as soon as R2 credentials appear —
 * is the wrong shape. Credentials arriving in an environment is not a decision
 * to move every contractor's plans; it is usually someone adding a secret for a
 * later step. Where files live has to be something a person turned on.
 *
 * ── R2_PLANS_*, never R2_* ───────────────────────────────────────────────────
 * The backup tool (`server/backup/config.ts`) reads R2_* for the bucket the
 * backups live in. These are a DIFFERENT bucket and a different API token, on
 * purpose: this token signs URLs a browser touches, so if it ever leaks the
 * backups must still be untouchable. Nothing here may fall back to an R2_*
 * variable, however convenient — that would quietly re-join the two.
 *
 * Read from `process.env` on the server and nowhere else. No `VITE_` prefix on
 * any of them, which is load-bearing: Vite inlines every `VITE_*` variable into
 * the client bundle, so a secret named that way is published to every visitor.
 */

/** The three places a file can live. */
export type StorageBackendName = "manus" | "disk" | "r2";

export const STORAGE_BACKENDS: readonly StorageBackendName[] = [
  "manus",
  "disk",
  "r2",
] as const;

export type R2PlansConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Full S3-compatible endpoint. Derived from the account id unless given. */
  endpoint: string;
};

/** The variables that must be set. Named once so errors can list them. */
export const R2_PLANS_REQUIRED_VARS = [
  "R2_PLANS_ACCOUNT_ID",
  "R2_PLANS_ACCESS_KEY_ID",
  "R2_PLANS_SECRET_ACCESS_KEY",
  "R2_PLANS_BUCKET",
] as const;

export type R2PlansConfigResult =
  | { ok: true; config: R2PlansConfig }
  | { ok: false; missing: string[] };

/**
 * Read the plan-bucket credentials, or say precisely what is absent.
 *
 * Returns a result rather than throwing, and never returns a partially-filled
 * config. The same reasoning as the backup tool's: a store configured with
 * three of four credentials fails at upload time, holding somebody's plan set,
 * which is the most expensive possible moment to discover a typo.
 */
export function readR2PlansConfig(
  env: NodeJS.ProcessEnv = process.env
): R2PlansConfigResult {
  const missing = R2_PLANS_REQUIRED_VARS.filter(name => !env[name]?.trim());
  if (missing.length > 0) return { ok: false, missing };

  const accountId = env.R2_PLANS_ACCOUNT_ID!.trim();

  return {
    ok: true,
    config: {
      accountId,
      accessKeyId: env.R2_PLANS_ACCESS_KEY_ID!.trim(),
      secretAccessKey: env.R2_PLANS_SECRET_ACCESS_KEY!.trim(),
      bucket: env.R2_PLANS_BUCKET!.trim(),
      endpoint:
        env.R2_PLANS_ENDPOINT?.trim() ||
        `https://${accountId}.r2.cloudflarestorage.com`,
    },
  };
}

/** Is the local folder backend available? */
function diskConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.LOCAL_STORAGE_DIR?.trim());
}

/** Is the Manus presign proxy reachable from here? */
function manusConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.BUILT_IN_FORGE_API_URL?.trim() && env.BUILT_IN_FORGE_API_KEY?.trim()
  );
}

/**
 * The backend in use.
 *
 * Throws, with the reason spelled out, when `PLAN_STORAGE` asks for something
 * this environment cannot do. That is deliberate and it happens at the first
 * read or write rather than silently degrading: a server that was told to use
 * R2 and quietly used a folder instead would scatter a contractor's plans
 * across two stores, and the only symptom would be plans that open today and
 * not after the next deploy.
 */
export function selectStorageBackend(
  env: NodeJS.ProcessEnv = process.env
): StorageBackendName {
  const named = env.PLAN_STORAGE?.trim().toLowerCase();

  if (!named) {
    // Exactly the rule that existed before R2 was an option.
    return diskConfigured(env) ? "disk" : "manus";
  }

  if (!STORAGE_BACKENDS.includes(named as StorageBackendName)) {
    throw new Error(
      `PLAN_STORAGE is set to "${named}", which is not a storage backend. Use one of: ${STORAGE_BACKENDS.join(", ")}.`
    );
  }

  if (named === "r2") {
    const config = readR2PlansConfig(env);
    if (!config.ok) {
      throw new Error(
        `PLAN_STORAGE=r2 but the plan bucket is not configured. Missing: ${config.missing.join(", ")}.`
      );
    }
    return "r2";
  }

  if (named === "disk" && !diskConfigured(env)) {
    throw new Error(
      "PLAN_STORAGE=disk but LOCAL_STORAGE_DIR is not set, so there is no folder to store files in."
    );
  }

  return named as StorageBackendName;
}

/**
 * Where to look for a file that is NOT in the backend now in use, in order.
 *
 * Switching to R2 does not move anything that is already stored, and this is
 * what keeps that from being a flag day: a plan uploaded to Manus last month
 * still opens, because a miss in R2 falls through to whichever older store is
 * still configured. New uploads go to R2 regardless, so the old stores drain
 * over time rather than needing a migration before the switch can happen.
 *
 * Only meaningful when R2 is the backend in use. Disk comes before Manus
 * because a disk hit can be confirmed cheaply and a Manus one cannot — see
 * `resolveReadBackend` in storage.ts, where Manus is the terminal guess.
 */
export function legacyReadBackends(
  env: NodeJS.ProcessEnv = process.env
): StorageBackendName[] {
  if (selectStorageBackend(env) !== "r2") return [];
  const order: StorageBackendName[] = [];
  if (diskConfigured(env)) order.push("disk");
  if (manusConfigured(env)) order.push("manus");
  return order;
}

/**
 * What an operator may be told about the plan bucket.
 *
 * Deliberately not the config itself: whether storage is set up is useful to
 * see, the secret access key is not, and an endpoint echoing the account id
 * identifies the bucket without handing it over.
 */
export function describeR2PlansConfig(result: R2PlansConfigResult): {
  configured: boolean;
  missing: string[];
  bucket: string | null;
} {
  if (!result.ok) {
    return { configured: false, missing: result.missing, bucket: null };
  }
  return { configured: true, missing: [], bucket: result.config.bucket };
}
