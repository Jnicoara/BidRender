/**
 * On-disk storage — the stand-in for Forge when LOCAL_STORAGE_DIR is set.
 *
 * Pinned here is what would be dangerous to get wrong: a key cannot reach
 * outside the folder, an upload URL opens exactly one key, a read token cannot
 * be replayed as an upload, and a stream that overruns leaves no file behind.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DISK_UPLOAD_PREFIX,
  diskRelativePath,
  verifyDiskUploadToken,
  writeDiskObjectStream,
} from "./diskStorage";
import { storagePresignPut, storagePut } from "./storage";
import { mintStorageToken } from "./storageTokens";

const onDisk = (root: string, key: string) =>
  path.join(root, ...diskRelativePath(key)!.split("/"));

describe("on-disk storage", () => {
  const previous = process.env.LOCAL_STORAGE_DIR;
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "helixbid-disk-"));
    process.env.LOCAL_STORAGE_DIR = root;
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env.LOCAL_STORAGE_DIR;
    else process.env.LOCAL_STORAGE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  });

  it("refuses a key that could climb out of the folder", () => {
    expect(diskRelativePath("bid-plans/1/../../../secrets")).toBeNull();
    expect(diskRelativePath("bid-plans/1//E1.pdf")).toBeNull();
    expect(diskRelativePath("bid-plans/1/./E1.pdf")).toBeNull();
  });

  it("encodes a filename so it cannot name a drive or a folder", () => {
    expect(diskRelativePath("bid-plans/1/42/C:\\Windows*.pdf")).toBe(
      "bid-plans/1/42/C%3A%5CWindows%2A.pdf"
    );
  });

  it("stores what storagePut is given, at the key it returns", async () => {
    const { key } = await storagePut(
      "bid-plans/1/42/E1.pdf",
      Buffer.from("%PDF-1.4 plan"),
      "application/pdf"
    );
    expect(await readFile(onDisk(root, key), "utf8")).toBe("%PDF-1.4 plan");
  });

  it("hands out an upload URL on this server that opens only its own key", async () => {
    const now = new Date();
    const { key, uploadUrl } = await storagePresignPut(
      "bid-plans/1/42/Electrical Plans.pdf",
      "application/pdf"
    );
    expect(uploadUrl.startsWith(`${DISK_UPLOAD_PREFIX}/`)).toBe(true);
    const token = uploadUrl.slice(DISK_UPLOAD_PREFIX.length + 1).split("/")[0];
    expect(verifyDiskUploadToken(token, key, now)).toBe(true);
    expect(
      verifyDiskUploadToken(
        token,
        "bid-plans/9/1/Someone Elses_deadbeef.pdf",
        now
      )
    ).toBe(false);
  });

  it("does not accept a read token as permission to upload", () => {
    const key = "bid-plans/1/42/E1_a1b2c3d4.pdf";
    const now = new Date();
    expect(verifyDiskUploadToken(mintStorageToken(key, now), key, now)).toBe(
      false
    );
  });

  it("stops a stream that runs past its size and leaves nothing behind", async () => {
    const key = "bid-plans/1/42/Big_a1b2c3d4.pdf";
    await expect(
      writeDiskObjectStream(key, Readable.from([Buffer.alloc(10)]), 5)
    ).rejects.toThrow(/larger/);
    await expect(readFile(onDisk(root, key))).rejects.toThrow();
  });
});
