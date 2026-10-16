/**
 * A-S13, prepared (server/uploadSizeGuard.ts) — against a FAKE store and an
 * offline signer. No bucket: signing a URL is local arithmetic, so the fake
 * credentials below never leave this process, and the store is a Map.
 *
 * What this cannot prove, and the plan says so: that R2 refuses a body whose
 * length does not match a signed `content-length`. That is the staging proof
 * (references/a-s13-upload-size-plan.md § 3).
 */
import { describe, expect, it } from "vitest";
import {
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  boundPartInput,
  boundPartLength,
  boundPutInput,
  uploadSizeProblem,
  verifyUploadedSize,
  type SizedStore,
} from "./uploadSizeGuard";
import { MULTIPART_PART_BYTES, planParts } from "../shared/multipartPlan";

const offline = new S3Client({
  region: "auto",
  endpoint: "https://fake-account.r2.cloudflarestorage.com",
  credentials: { accessKeyId: "AKFAKE", secretAccessKey: "not-a-secret" },
});
const signedHeaders = (url: string) =>
  new URL(url).searchParams.get("X-Amz-SignedHeaders");

describe("binding the declared size into the signed URL", () => {
  it("today's shape signs only host — any body size goes (the finding)", async () => {
    const url = await getSignedUrl(
      offline,
      new PutObjectCommand({
        Bucket: "b",
        Key: "k",
        ContentType: "application/pdf",
      }),
      { expiresIn: 900 }
    );
    expect(signedHeaders(url)).toBe("host");
  });

  it("the bound PUT signs content-length", async () => {
    const url = await getSignedUrl(
      offline,
      new PutObjectCommand(
        boundPutInput({
          bucket: "b",
          key: "k",
          contentType: "application/pdf",
          byteSize: 1234,
        })
      ),
      { expiresIn: 900 }
    );
    expect(signedHeaders(url)).toBe("content-length;host");
  });

  it("each bound piece signs content-length", async () => {
    const url = await getSignedUrl(
      offline,
      new UploadPartCommand(
        boundPartInput({
          bucket: "b",
          key: "k",
          uploadId: "u",
          partNumber: 2,
          byteSize: 40 * 1024 * 1024,
        })
      ),
      { expiresIn: 900 }
    );
    expect(signedHeaders(url)).toBe("content-length;host");
  });

  it("piece lengths are the browser's cut: full pieces, a short last one, summing to the file", () => {
    const size = 3 * MULTIPART_PART_BYTES + 12_345;
    const { partCount } = planParts(size);
    const lengths = Array.from({ length: partCount }, (_, i) =>
      boundPartLength(i + 1, size)
    );
    expect(lengths).toEqual([
      MULTIPART_PART_BYTES,
      MULTIPART_PART_BYTES,
      MULTIPART_PART_BYTES,
      12_345,
    ]);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(size);
  });
});

describe("checking what actually landed", () => {
  function fakeStore(
    objects: Record<string, number>
  ): SizedStore & { keys(): string[] } {
    const map = new Map(Object.entries(objects));
    return {
      sizeOf: async key => map.get(key) ?? null,
      delete: async key => void map.delete(key),
      keys: () => Array.from(map.keys()),
    };
  }

  it("keeps an object exactly the declared size", async () => {
    const store = fakeStore({ "bid-plans/1/2/a.pdf": 5000 });
    expect(
      await verifyUploadedSize(store, "bid-plans/1/2/a.pdf", 5000)
    ).toBeNull();
    expect(store.keys()).toEqual(["bid-plans/1/2/a.pdf"]);
  });

  it("refuses AND deletes a bigger object than declared — the abuse", async () => {
    const store = fakeStore({ "bid-plans/1/2/a.pdf": 900_000_000 });
    expect(
      await verifyUploadedSize(store, "bid-plans/1/2/a.pdf", 1000)
    ).toMatchObject({
      code: "different",
    });
    expect(store.keys()).toEqual([]);
  });

  it("refuses AND deletes a cut-off object — it would open as a broken set", async () => {
    const store = fakeStore({ k: 999 });
    expect(await verifyUploadedSize(store, "k", 1000)).toMatchObject({
      code: "different",
    });
    expect(store.keys()).toEqual([]);
  });

  it("refuses an object over the app's limit even when declared that big", async () => {
    const store = fakeStore({ k: 3000 });
    expect(await verifyUploadedSize(store, "k", 3000, 2000)).toMatchObject({
      code: "overMax",
    });
    expect(store.keys()).toEqual([]);
  });

  it("says plainly when nothing arrived, and deletes nothing", async () => {
    expect(uploadSizeProblem(1000, null)).toMatchObject({ code: "missing" });
    const store = fakeStore({ other: 5 });
    await verifyUploadedSize(store, "k", 1000);
    expect(store.keys()).toEqual(["other"]);
  });
});
