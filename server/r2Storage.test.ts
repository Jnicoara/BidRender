/**
 * The signed URLs the R2 backend hands out, and the key they point at.
 *
 * ── Why this can run without a network ───────────────────────────────────────
 * Signing is arithmetic over the credentials, the key and the clock — the SDK
 * does not contact Cloudflare to produce a presigned URL. So the shape of what
 * the browser is given is fully checkable here, with credentials that are not
 * real, and that is most of what can go wrong with it.
 *
 * The one thing that genuinely needs the bucket — whether an object is there —
 * is exercised by hand against the real bucket, not mocked into a false pass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  r2PresignGet,
  r2PresignPut,
  resetR2StorageForTests,
} from "./r2Storage";

const FAKE_ENV = {
  R2_PLANS_ACCOUNT_ID: "acct123",
  R2_PLANS_ACCESS_KEY_ID: "key123",
  R2_PLANS_SECRET_ACCESS_KEY: "secret123",
  R2_PLANS_BUCKET: "bidrender-plans",
};

/** The shape every stored key already has, filename and hash suffix included. */
const KEY = "bid-plans/7/42/Electrical Plans_a1b2c3d4.pdf";

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const [name, value] of Object.entries(FAKE_ENV)) {
    saved[name] = process.env[name];
    process.env[name] = value;
  }
  saved.R2_PLANS_ENDPOINT = process.env.R2_PLANS_ENDPOINT;
  delete process.env.R2_PLANS_ENDPOINT;
  resetR2StorageForTests();
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetR2StorageForTests();
});

describe("the key an object is stored under", () => {
  /**
   * The object key IS the storage key the database already holds — no prefix
   * of any kind.
   *
   * This is pinned because adding one later would look harmless and would
   * orphan every stored file at once: the key recorded against a bid would
   * stop naming the object, and every plan in the app would 404 together. The
   * backup tool prefixes because it shares a bucket; this bucket has one job.
   */
  it("is the storage key itself, with nothing prepended", async () => {
    const url = new URL(await r2PresignGet(KEY));
    expect(url.pathname).toBe(`/${encodePath(KEY)}`);
  });

  it("is the same key for a read and for a write", async () => {
    const read = new URL(await r2PresignGet(KEY));
    const write = new URL(await r2PresignPut(KEY, "application/pdf"));
    expect(write.pathname).toBe(read.pathname);
  });

  it("puts a logo in the same bucket as a plan", async () => {
    // Logos go through the same pipe, deliberately — one storage layer, one
    // set of rules about who may read what.
    const logo = "company-logos/7/letterhead_9f8e7d6c.png";
    const url = new URL(await r2PresignPut(logo, "image/png"));
    expect(url.pathname).toBe(`/${encodePath(logo)}`);
    expect(url.host.startsWith("bidrender-plans.")).toBe(true);
  });
});

describe("the signed URL itself", () => {
  /**
   * Virtual-hosted addressing: the bucket is a hostname label, not the first
   * path segment. That is the SDK's default and it is what the backup tool has
   * been using against R2 in production, so it is known to work — worth
   * pinning because a switch to path-style would move the bucket into the path
   * and make the no-prefix assertions above silently meaningless.
   */
  it("points at the bucket on the account's R2 endpoint", async () => {
    const url = new URL(await r2PresignGet(KEY));
    expect(url.host).toBe("bidrender-plans.acct123.r2.cloudflarestorage.com");
  });

  it("carries a signature and an expiry", async () => {
    const url = new URL(await r2PresignGet(KEY));
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeGreaterThan(0);
  });

  /**
   * An upload link outlives a download link, because it has a slower job: a
   * download link only has to survive one browser following one redirect,
   * while an upload link has to cover a large plan set going up a site
   * connection.
   */
  it("gives an upload longer than a download", async () => {
    const get = new URL(await r2PresignGet(KEY));
    const put = new URL(await r2PresignPut(KEY, "application/pdf"));
    expect(Number(put.searchParams.get("X-Amz-Expires"))).toBeGreaterThan(
      Number(get.searchParams.get("X-Amz-Expires"))
    );
  });

  it("never puts the secret key in the URL", async () => {
    const url = await r2PresignPut(KEY, "application/pdf");
    expect(url).not.toContain("secret123");
  });

  it("honours an explicit endpoint", async () => {
    process.env.R2_PLANS_ENDPOINT = "https://custom.example.com";
    resetR2StorageForTests();
    const url = new URL(await r2PresignGet(KEY));
    expect(url.host).toBe("bidrender-plans.custom.example.com");
  });
});

describe("when the bucket is not configured", () => {
  it("says which variable is missing rather than failing at upload time", async () => {
    delete process.env.R2_PLANS_BUCKET;
    resetR2StorageForTests();
    await expect(r2PresignGet(KEY)).rejects.toThrow(/R2_PLANS_BUCKET/);
  });
});

/** Percent-encode each segment the way the SDK does when it signs a path. */
function encodePath(key: string): string {
  return key
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");
}
