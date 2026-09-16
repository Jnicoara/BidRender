/**
 * Which store the app writes to, and what it refuses to guess.
 *
 * ── Why this is worth pinning ────────────────────────────────────────────────
 * Getting this wrong is not a visible failure. A server told to use R2 that
 * quietly used a folder instead would scatter one contractor's plans across two
 * stores, and the symptom would be plans that open today and not after the next
 * deploy — discovered by an estimator with a bid due, not by a test.
 *
 * So the cases below are mostly about REFUSING: an unknown name, a backend
 * without its credentials, a switch that was never thrown. Every one of them
 * has a loud answer here rather than a quiet one later.
 *
 * `process.env` is passed in explicitly rather than mutated, so these run in
 * any order and cannot leak into the DB-backed suites sharing this process.
 */
import { describe, it, expect } from "vitest";
import {
  legacyReadBackends,
  readR2PlansConfig,
  describeR2PlansConfig,
  selectStorageBackend,
  R2_PLANS_REQUIRED_VARS,
} from "./storageBackend";

/** A complete set of plan-bucket credentials. */
const R2_VARS = {
  R2_PLANS_ACCOUNT_ID: "acct123",
  R2_PLANS_ACCESS_KEY_ID: "key123",
  R2_PLANS_SECRET_ACCESS_KEY: "secret123",
  R2_PLANS_BUCKET: "bidrender-plans",
};

const env = (vars: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  vars as NodeJS.ProcessEnv;

describe("reading the plan bucket credentials", () => {
  it("accepts a complete set", () => {
    const result = readR2PlansConfig(env(R2_VARS));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.bucket).toBe("bidrender-plans");
    expect(result.config.accessKeyId).toBe("key123");
  });

  it("derives the endpoint from the account id", () => {
    const result = readR2PlansConfig(env(R2_VARS));
    expect(result.ok && result.config.endpoint).toBe(
      "https://acct123.r2.cloudflarestorage.com"
    );
  });

  it("lets an explicit endpoint win", () => {
    const result = readR2PlansConfig(
      env({ ...R2_VARS, R2_PLANS_ENDPOINT: "https://custom.example.com" })
    );
    expect(result.ok && result.config.endpoint).toBe(
      "https://custom.example.com"
    );
  });

  it("names exactly what is missing, rather than half-configuring", () => {
    const result = readR2PlansConfig(
      env({ ...R2_VARS, R2_PLANS_SECRET_ACCESS_KEY: undefined })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(["R2_PLANS_SECRET_ACCESS_KEY"]);
  });

  it("treats an empty value as missing", () => {
    // A variable set to "" is how a half-filled .env file usually looks, and
    // it must not read as configured.
    const result = readR2PlansConfig(
      env({ ...R2_VARS, R2_PLANS_BUCKET: "  " })
    );
    expect(result.ok).toBe(false);
  });

  /**
   * The load-bearing separation: the backup bucket's credentials are R2_*, this
   * bucket's are R2_PLANS_*. This token signs URLs a browser touches, so if it
   * leaks the backups must still be untouchable. Falling back to the backup
   * credentials would be a convenience that quietly re-joins the two.
   */
  it("never falls back to the backup bucket's credentials", () => {
    const result = readR2PlansConfig(
      env({
        R2_ACCOUNT_ID: "backup-acct",
        R2_ACCESS_KEY_ID: "backup-key",
        R2_SECRET_ACCESS_KEY: "backup-secret",
        R2_BUCKET: "bidsoftware",
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual([...R2_PLANS_REQUIRED_VARS]);
  });
});

describe("choosing a backend", () => {
  it("is disk when LOCAL_STORAGE_DIR is set and nothing was named", () => {
    expect(selectStorageBackend(env({ LOCAL_STORAGE_DIR: "/tmp/files" }))).toBe(
      "disk"
    );
  });

  it("is manus when nothing is set at all", () => {
    expect(selectStorageBackend(env({}))).toBe("manus");
  });

  /**
   * The safety property of this whole change: adding these files did not move
   * anybody's plans. With PLAN_STORAGE unset the answer is the rule that
   * existed before R2 was an option, credentials present or not.
   */
  it("does not switch to R2 just because R2 credentials exist", () => {
    expect(
      selectStorageBackend(env({ ...R2_VARS, LOCAL_STORAGE_DIR: "/tmp/files" }))
    ).toBe("disk");
    expect(selectStorageBackend(env(R2_VARS))).toBe("manus");
  });

  it("is r2 when asked for and configured", () => {
    expect(selectStorageBackend(env({ ...R2_VARS, PLAN_STORAGE: "r2" }))).toBe(
      "r2"
    );
  });

  it("lets an explicit choice beat LOCAL_STORAGE_DIR", () => {
    // What `pnpm dev:r2` relies on: .env sets LOCAL_STORAGE_DIR, and the
    // named backend still wins.
    expect(
      selectStorageBackend(
        env({ ...R2_VARS, LOCAL_STORAGE_DIR: "/tmp/files", PLAN_STORAGE: "r2" })
      )
    ).toBe("r2");
  });

  it("ignores case and stray spacing", () => {
    expect(
      selectStorageBackend(env({ ...R2_VARS, PLAN_STORAGE: " R2 " }))
    ).toBe("r2");
  });

  it("refuses r2 without credentials, naming them", () => {
    expect(() => selectStorageBackend(env({ PLAN_STORAGE: "r2" }))).toThrow(
      /R2_PLANS_ACCOUNT_ID/
    );
  });

  it("refuses disk without a folder to write to", () => {
    expect(() => selectStorageBackend(env({ PLAN_STORAGE: "disk" }))).toThrow(
      /LOCAL_STORAGE_DIR/
    );
  });

  it("refuses a name that is not a backend, and lists the real ones", () => {
    expect(() => selectStorageBackend(env({ PLAN_STORAGE: "s3" }))).toThrow(
      /manus, disk, r2/
    );
  });
});

describe("falling back to an older store", () => {
  /**
   * Switching to R2 moves nothing that is already stored. This is what keeps
   * that from being a flag day — a file from before the switch still has a
   * store that holds it, so it still opens.
   */
  it("looks in disk then manus when R2 is live", () => {
    expect(
      legacyReadBackends(
        env({
          ...R2_VARS,
          PLAN_STORAGE: "r2",
          LOCAL_STORAGE_DIR: "/tmp/files",
          BUILT_IN_FORGE_API_URL: "https://forge.example.com",
          BUILT_IN_FORGE_API_KEY: "forge-key",
        })
      )
    ).toEqual(["disk", "manus"]);
  });

  it("offers only the stores that are actually configured", () => {
    expect(legacyReadBackends(env({ ...R2_VARS, PLAN_STORAGE: "r2" }))).toEqual(
      []
    );
    expect(
      legacyReadBackends(
        env({ ...R2_VARS, PLAN_STORAGE: "r2", LOCAL_STORAGE_DIR: "/tmp/files" })
      )
    ).toEqual(["disk"]);
  });

  it("has nothing to fall back to when R2 is not the backend", () => {
    // Disk and Manus are not each other's fallback and never were. Only the
    // new store has anything to be behind it.
    expect(
      legacyReadBackends(
        env({
          LOCAL_STORAGE_DIR: "/tmp/files",
          BUILT_IN_FORGE_API_URL: "https://forge.example.com",
          BUILT_IN_FORGE_API_KEY: "forge-key",
        })
      )
    ).toEqual([]);
  });
});

describe("what may be said about the configuration", () => {
  it("reports the bucket but never the secret", () => {
    const described = describeR2PlansConfig(readR2PlansConfig(env(R2_VARS)));
    expect(described).toEqual({
      configured: true,
      missing: [],
      bucket: "bidrender-plans",
    });
    expect(JSON.stringify(described)).not.toContain("secret123");
  });

  it("says what is absent when it is not set up", () => {
    const described = describeR2PlansConfig(readR2PlansConfig(env({})));
    expect(described.configured).toBe(false);
    expect(described.missing).toEqual([...R2_PLANS_REQUIRED_VARS]);
  });
});
