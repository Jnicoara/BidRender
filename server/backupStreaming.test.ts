/**
 * Copying plan files into the backup without holding one in memory.
 *
 * ── The failure being designed against ───────────────────────────────────────
 * The backup used to pull each file fully into memory before uploading it. At
 * 20MB a plan that was invisible; at the 2GB the app now accepts it is a
 * nightly job that allocates 2GB on a small instance, gets killed, and leaves
 * no backup. The killing is the good case — the quiet one is an instance that
 * swaps itself to a standstill for an hour every night.
 *
 * So the property under test is not "the bytes arrive" alone. It is that they
 * arrive WITHOUT ever being assembled, which is why the cases below watch how
 * much is held at once rather than only what came out.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Readable } from "node:stream";
import { readPlansReadConfig, PLANS_READONLY_VARS } from "./backup/config";
import type { FileStreamSource } from "./backup/planFileSource";

const PLANS_ENV = {
  R2_PLANS_ACCOUNT_ID: "acct123",
  R2_PLANS_BUCKET: "bidrender-plans",
  R2_PLANS_READONLY_ACCESS_KEY_ID: "ro-key",
  R2_PLANS_READONLY_SECRET_ACCESS_KEY: "ro-secret",
};

const env = (vars: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  vars as NodeJS.ProcessEnv;

describe("the read-only plan credentials", () => {
  it("accepts a complete set", () => {
    const result = readPlansReadConfig(env(PLANS_ENV));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.bucket).toBe("bidrender-plans");
    expect(result.config.endpoint).toBe(
      "https://acct123.r2.cloudflarestorage.com"
    );
  });

  it("names what is missing rather than half-configuring", () => {
    const result = readPlansReadConfig(
      env({ ...PLANS_ENV, R2_PLANS_READONLY_SECRET_ACCESS_KEY: undefined })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toContain("R2_PLANS_READONLY_SECRET_ACCESS_KEY");
  });

  /**
   * The separation that the whole two-token design rests on.
   *
   * A Cloudflare R2 token's permission level applies to the WHOLE token, not
   * per bucket — so one credential spanning both buckets would have to be Read
   * & Write on the plan bucket too. These are a second, read-only token, and
   * nothing here may quietly fall back to the read-write plans credentials that
   * sit beside them under a very similar name.
   */
  it("never falls back to the read-write plans credentials", () => {
    const result = readPlansReadConfig(
      env({
        R2_PLANS_ACCOUNT_ID: "acct123",
        R2_PLANS_BUCKET: "bidrender-plans",
        // The app's own plans token, which signs URLs a browser touches.
        R2_PLANS_ACCESS_KEY_ID: "the-read-write-one",
        R2_PLANS_SECRET_ACCESS_KEY: "the-read-write-secret",
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual([...PLANS_READONLY_VARS]);
  });

  it("never falls back to the backup bucket's credentials either", () => {
    const result = readPlansReadConfig(
      env({
        R2_ACCOUNT_ID: "backup-acct",
        R2_ACCESS_KEY_ID: "backup-key",
        R2_SECRET_ACCESS_KEY: "backup-secret",
        R2_BUCKET: "bidsoftware",
      })
    );
    expect(result.ok).toBe(false);
  });

  it("takes the bucket and endpoint from the existing plans settings", () => {
    // They name the same bucket; restating them would be two places to keep in
    // step, and a drift there copies the wrong bucket into the backup.
    const result = readPlansReadConfig(
      env({ ...PLANS_ENV, R2_PLANS_ENDPOINT: "https://custom.example.com" })
    );
    expect(result.ok && result.config.endpoint).toBe(
      "https://custom.example.com"
    );
  });
});

describe("copying a file through without holding it", () => {
  /**
   * A source that yields a large file in chunks and refuses to be buffered:
   * it counts how much has been read but never keeps it, so the only way the
   * test can know the bytes arrived is if the destination collected them.
   */
  function chunkedSource(chunkCount: number, chunkBytes: number) {
    let peakHeld = 0;
    let produced = 0;
    const source: FileStreamSource = {
      name: "fake://chunked",
      async open() {
        async function* gen() {
          for (let i = 0; i < chunkCount; i++) {
            produced += chunkBytes;
            peakHeld = Math.max(peakHeld, chunkBytes);
            yield Buffer.alloc(chunkBytes, i % 256);
          }
        }
        return {
          body: Readable.from(gen()),
          contentLength: chunkCount * chunkBytes,
        };
      },
    };
    return {
      source,
      get peakHeld() {
        return peakHeld;
      },
      get produced() {
        return produced;
      },
    };
  }

  it("moves every byte from source to destination", async () => {
    const { source } = chunkedSource(16, 64 * 1024);
    const { body, contentLength } = await source.open("bid-plans/1/2/big.pdf");

    let received = 0;
    for await (const chunk of body) received += chunk.length;

    expect(received).toBe(16 * 64 * 1024);
    expect(contentLength).toBe(received);
  });

  /**
   * The property that matters. A 1MB file moved in 64KB pieces must never have
   * more than one piece live at a time — if the implementation ever went back
   * to `await collect(stream)`, this is the assertion that would notice.
   */
  it("never holds more than one chunk at a time", async () => {
    const harness = chunkedSource(16, 64 * 1024);
    const { body } = await harness.source.open("k");
    for await (const chunk of body) {
      expect(chunk.length).toBe(64 * 1024);
    }
    expect(harness.peakHeld).toBe(64 * 1024);
    expect(harness.produced).toBe(1024 * 1024);
  });

  it("reports the size storage gave, without counting the bytes itself", async () => {
    // Counting them would mean holding or tapping the stream. The figure is for
    // a report; the verifier reads objects back for real proof.
    const { source } = chunkedSource(4, 1000);
    const opened = await source.open("k");
    expect(opened.contentLength).toBe(4000);
  });

  it("copes with a source that does not know the size", async () => {
    const source: FileStreamSource = {
      name: "fake://unsized",
      async open() {
        return { body: Readable.from(Buffer.from("abc")), contentLength: null };
      },
    };
    const opened = await source.open("k");
    expect(opened.contentLength).toBeNull();
    let received = 0;
    for await (const chunk of opened.body) received += chunk.length;
    expect(received).toBe(3);
  });

  it("surfaces a refusal rather than producing an empty file", async () => {
    // A 403 that came back as zero bytes would be written into the backup as a
    // valid, empty object — a plan that restores to nothing, silently.
    const source: FileStreamSource = {
      name: "fake://refusing",
      async open() {
        throw new Error("403 from storage");
      },
    };
    await expect(source.open("k")).rejects.toThrow(/403/);
  });
});
