/**
 * Stored files (plan PDFs, logos) in a folder on this machine, instead of
 * behind the Forge presign proxy.
 *
 * ── When it is used ──────────────────────────────────────────────────────────
 * Only when LOCAL_STORAGE_DIR is set. `storage.ts` checks for it first in each
 * function, and the storage proxy checks for it after verifying the token, so a
 * server without it behaves exactly as before.
 *
 * ── The shape mirrors a presigned bucket, on purpose ─────────────────────────
 * Keys, the tokenized `/manus-storage/<token>/<key>` read URLs and the two-step
 * upload (ticket, then confirm) are unchanged, so nothing above the storage
 * layer knows the difference. The browser still PUTs to the upload URL it is
 * handed; that URL simply points at this server instead of at S3, and being
 * same-origin it needs no CORS rule.
 *
 * One process, one disk, no replication: for running locally, not for hosting.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Express, Response } from "express";
import { MAX_PDF_BYTES } from "../shared/uploadLimits";

/** Where browsers PUT uploads. Deliberately not under /api/scheduled/. */
export const DISK_UPLOAD_PREFIX = "/local-storage";

/**
 * How long an upload URL stays good. It is minted with the ticket and used
 * straight away; an hour covers a large plan set on a slow site connection.
 */
const UPLOAD_WINDOW_MS = 60 * 60 * 1000;

/** The storage folder, or null when disk storage is off. Read at call time. */
export function diskStorageRoot(): string | null {
  const dir = process.env.LOCAL_STORAGE_DIR?.trim();
  return dir ? path.resolve(dir) : null;
}

/**
 * A key's path inside the storage folder, "/"-separated, or null for a key
 * that could escape it.
 *
 * Keys carry the uploader's own filename, so every segment is percent-encoded:
 * nothing in a filename can then name a drive, a parent folder or a character
 * Windows refuses in a path.
 */
export function diskRelativePath(key: string): string | null {
  const segments = key.split("/");
  if (segments.some(s => s === "" || s === "." || s === "..")) return null;
  return segments
    .map(s => encodeURIComponent(s).replace(/\*/g, "%2A"))
    .join("/");
}

function absolutePath(key: string): string {
  const root = diskStorageRoot();
  if (!root) {
    throw new Error("Disk storage is off: LOCAL_STORAGE_DIR is not set.");
  }
  const relative = diskRelativePath(key);
  const full = relative ? path.resolve(root, ...relative.split("/")) : null;
  if (!full || !full.startsWith(root + path.sep)) {
    throw new Error(`Not a storable key: ${key}`);
  }
  return full;
}

/** Write a whole object at once — the server-side `storagePut` path. */
export async function writeDiskObject(
  key: string,
  data: Buffer | Uint8Array | string
): Promise<void> {
  const full = absolutePath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

/**
 * Write an object from a stream, refusing to go past `maxBytes`.
 *
 * The cap is counted on the bytes actually received rather than trusted from a
 * header. A partial file is removed on any failure: a half-written plan that
 * later opens as a truncated drawing is worse than one that is plainly missing.
 */
export async function writeDiskObjectStream(
  key: string,
  body: Readable,
  maxBytes: number
): Promise<number> {
  const full = absolutePath(key);
  await mkdir(path.dirname(full), { recursive: true });
  let received = 0;
  try {
    await pipeline(
      body,
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          received += chunk.length;
          if (received > maxBytes) {
            throw new Error(
              `Upload is larger than the ${maxBytes} bytes it was allowed.`
            );
          }
          yield chunk;
        }
      },
      createWriteStream(full)
    );
  } catch (error) {
    await unlink(full).catch(() => {});
    throw error;
  }
  return received;
}

function secret(): string {
  return process.env.JWT_SECRET ?? "";
}

/**
 * Signed over "upload", the key and the expiry. The "upload" prefix is what
 * stops a READ token — storageTokens.ts signs key and expiry with the same
 * secret — being replayed here to overwrite the file it was minted to show.
 */
function sign(key: string, expiresAt: number): string {
  return createHmac("sha256", secret())
    .update(`upload\n${key}\n${expiresAt}`)
    .digest("base64url");
}

/** An upload URL on this server for exactly one key. */
export function diskUploadUrl(key: string, now: Date): string {
  if (!secret()) {
    throw new Error("Cannot sign an upload URL: JWT_SECRET is not set.");
  }
  const expiresAt = now.getTime() + UPLOAD_WINDOW_MS;
  const encoded = key
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");
  return `${DISK_UPLOAD_PREFIX}/${expiresAt}.${sign(key, expiresAt)}/${encoded}`;
}

/** Is this upload token good for this key, right now? */
export function verifyDiskUploadToken(
  token: string,
  key: string,
  now: Date
): boolean {
  if (!secret()) return false;
  const split = token.indexOf(".");
  if (split <= 0) return false;
  const expiresAt = Number(token.slice(0, split));
  const provided = token.slice(split + 1);
  if (!Number.isSafeInteger(expiresAt) || !provided) return false;
  if (expiresAt <= now.getTime()) return false;
  const a = Buffer.from(provided, "base64url");
  const b = Buffer.from(sign(key, expiresAt), "base64url");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The PUT target behind every upload URL. Mount before the body parsers, so the
 * file arrives as a stream to write out rather than something already read.
 */
export function registerDiskStorageUploads(app: Express) {
  app.put(`${DISK_UPLOAD_PREFIX}/:token/*`, async (req, res) => {
    if (!diskStorageRoot()) {
      res.status(404).send("Disk storage is off on this server.");
      return;
    }
    const params = req.params as Record<string, string>;
    const token = params.token;
    const key = params[0];
    if (!token || !key || !verifyDiskUploadToken(token, key, new Date())) {
      res.status(403).send("This upload link is not valid, or has expired.");
      return;
    }
    try {
      // The largest thing the app issues a ticket for; logos are far smaller.
      await writeDiskObjectStream(key, req, MAX_PDF_BYTES);
      res.status(200).end();
    } catch (error) {
      console.error(`[DiskStorage] upload to ${key} failed:`, error);
      if (!res.headersSent) {
        res.status(500).send("The file could not be saved.");
      }
    }
  });
}

/**
 * Send a stored object. The caller has already verified the read token.
 *
 * `sendFile` answers Range requests, which is what pdf.js makes for every part
 * of a plan it draws — so a large set streams in pieces here as it did from S3.
 */
export function serveDiskObject(key: string, res: Response): void {
  const root = diskStorageRoot();
  const relative = diskRelativePath(key);
  if (!root || !relative) {
    res.status(404).send("Not found");
    return;
  }
  res.sendFile(
    relative,
    { root, dotfiles: "allow", headers: { "Cache-Control": "no-store" } },
    error => {
      if (!error || res.headersSent) return;
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404) {
        res.status(404).send("Not found");
      } else {
        console.error(`[DiskStorage] could not read ${key}:`, error);
        res.status(500).send("Could not read the stored file.");
      }
    }
  );
}
