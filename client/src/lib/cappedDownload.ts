/**
 * Read a response body whole, but never more than `limit` bytes of it.
 *
 * The viewer's whole-file fallback uses this when neither the recorded size nor
 * a Content-Length says how big the plan is. Without it, "unknown size" would
 * be the one door left through which a gigabyte could still come down unbounded.
 * It stops reading, and cancels the rest of the transfer, the moment the limit
 * is passed, instead of reading everything and then checking.
 */
export class DownloadTooLarge extends Error {
  constructor(public readonly limit: number) {
    super(`Download passed ${limit} bytes`);
    this.name = "DownloadTooLarge";
  }
}

export async function readCapped(
  response: Response,
  limit: number
): Promise<ArrayBuffer> {
  const body = response.body;
  if (!body) return new ArrayBuffer(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new DownloadTooLarge(limit);
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** The Content-Length header as a number, or null when absent or nonsense. */
export function contentLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
