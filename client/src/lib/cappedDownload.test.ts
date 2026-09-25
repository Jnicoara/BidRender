/**
 * The whole-file fallback's last line of defence: a download of unknown size
 * that stops at the limit instead of reading a gigabyte and then checking.
 */
import { describe, expect, it } from "vitest";
import {
  DownloadTooLarge,
  contentLength,
  readCapped,
} from "@/lib/cappedDownload";

/** A response that arrives in `pieces` chunks of `size` bytes, counting reads. */
function streamed(pieces: number, size: number) {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= pieces) return controller.close();
      sent++;
      controller.enqueue(new Uint8Array(size).fill(sent));
    },
  });
  return { response: new Response(body), sent: () => sent };
}

describe("readCapped", () => {
  it("returns the whole body when it fits", async () => {
    const { response } = streamed(3, 10);
    const buffer = await readCapped(response, 30);
    expect(buffer.byteLength).toBe(30);
    // Chunks land in order.
    expect(Array.from(new Uint8Array(buffer).slice(9, 11))).toEqual([1, 2]);
  });

  it("stops at the limit rather than reading on", async () => {
    const { response, sent } = streamed(1000, 10);
    await expect(readCapped(response, 25)).rejects.toBeInstanceOf(
      DownloadTooLarge
    );
    // Three chunks is where 30 passed 25 — not a thousand.
    expect(sent()).toBeLessThanOrEqual(4);
  });

  it("treats an empty body as empty", async () => {
    const buffer = await readCapped(new Response(null), 10);
    expect(buffer.byteLength).toBe(0);
  });
});

describe("contentLength", () => {
  it("reads the header", () => {
    const response = new Response("x", {
      headers: { "content-length": "270399531" },
    });
    expect(contentLength(response)).toBe(270399531);
  });

  it("is null when absent or nonsense, never zero", () => {
    // A missing header must not read as "zero bytes, so it fits".
    expect(contentLength(new Response(null))).toBeNull();
    const bad = new Response(null, { headers: { "content-length": "lots" } });
    expect(contentLength(bad)).toBeNull();
  });
});
