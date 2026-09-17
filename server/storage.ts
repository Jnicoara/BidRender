// The socket the storage backends plug into: a folder on this machine
// (diskStorage.ts) and Cloudflare R2 (r2Storage.ts). `selectStorageBackend`
// says which one is live — see storageBackend.ts for how that is chosen and
// why it is never inferred from the presence of credentials.
//
// Every function returns the same shapes whichever backend answered, which is
// what keeps the routers, the client and the database columns out of it.
//
// Downloads return `/manus-storage/{key}` paths, served by the proxy in
// server/_core/storageProxy.ts. The name is historical — the route long ago
// stopped having anything to do with Manus and now serves disk and R2 — and it
// is deliberately left alone, because it is baked into `bid_pdfs.url` and the
// legacy `projects.pdfUrl` for every file already stored. Renaming it would
// break every existing plan link at once.

import {
  diskObjectExists,
  diskUploadUrl,
  writeDiskObject,
} from "./diskStorage";
import {
  r2ObjectExists,
  r2PresignGet,
  r2PresignPut,
  r2PutObject,
  r2ViewerUrl,
} from "./r2Storage";
import { storageUrl } from "./storageTokens";
import {
  legacyReadBackends,
  selectStorageBackend,
  type StorageBackendName,
} from "./storageBackend";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/**
 * Every backend has to answer every case.
 *
 * `selectStorageBackend` already refuses a name it does not know, so this is
 * unreachable today. It exists so that adding a third backend to
 * `StorageBackendName` fails to compile here rather than falling off the end of
 * a function and returning undefined at runtime.
 */
function unhandledBackend(backend: never): never {
  throw new Error(`Storage backend "${backend}" has no implementation.`);
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const backend = selectStorageBackend();
  if (backend === "disk") {
    await writeDiskObject(key, data);
    return { key, url: `/manus-storage/${key}` };
  }
  if (backend === "r2") {
    await r2PutObject(key, data, contentType);
    return { key, url: `/manus-storage/${key}` };
  }
  return unhandledBackend(backend);
}

/**
 * A presigned PUT the BROWSER uploads to, instead of posting bytes to us.
 *
 * `storagePut` above takes the whole file into this process first, which caps
 * an upload at whatever the request body limit is — and that is well below the
 * sizes a scanned plan set reaches. Handing the signed URL to the client takes
 * this server out of the data path entirely: no body limit applies, nothing is
 * buffered in memory here, and the browser can report real progress because it
 * owns the transfer.
 *
 * The key is generated the same way, hash suffix and all, so two uploads of
 * "E1.pdf" cannot overwrite each other.
 */
export async function storagePresignPut(
  relKey: string,
  contentType = "application/octet-stream"
): Promise<{ key: string; uploadUrl: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const backend = selectStorageBackend();
  // An upload URL on this server — same-origin, so no bucket CORS rule.
  if (backend === "disk") {
    return { key, uploadUrl: diskUploadUrl(key, new Date()) };
  }
  if (backend === "r2") {
    return { key, uploadUrl: await r2PresignPut(key, contentType) };
  }
  return unhandledBackend(backend);
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

/**
 * Which backend actually holds this key.
 *
 * Only interesting when R2 is live, and then it is what stops the switch from
 * being a flag day: a file stored before the switch is not in R2, so the read
 * falls through to whichever older store still has it. New writes go to R2
 * regardless, so the old stores drain rather than needing a migration first.
 *
 * Every answer is now verified. Manus used to be the terminal guess and could
 * not be — there was no cheap way to ask it whether a key existed, so it was
 * returned on faith. With it gone, a null answer means every configured store
 * was actually asked and none of them has the file.
 */
export async function resolveReadBackend(
  relKey: string
): Promise<StorageBackendName | null> {
  const backend = selectStorageBackend();
  if (backend !== "r2") return backend;

  const key = normalizeKey(relKey);
  if (await r2ObjectExists(key)) return "r2";

  for (const legacy of legacyReadBackends()) {
    if (legacy === "disk" && (await diskObjectExists(key))) return "disk";
  }
  return null;
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const backend = await resolveReadBackend(key);

  if (backend === "r2") return r2PresignGet(key);
  if (backend === "disk") {
    throw new Error(
      "Stored files are in LOCAL_STORAGE_DIR on this machine; there is no signed URL to fetch them from."
    );
  }
  throw new Error(`No configured storage holds ${key}.`);
}

/**
 * The URL the plan VIEWER should load a document from.
 *
 * ── Why this is not the same as every other read URL ─────────────────────────
 * Ordinary reads go through `/manus-storage/<token>/<key>`, which verifies the
 * token and redirects. That is one round trip through this server per byte
 * range — and pdf.js asks for a byte range for every slice of every page of a
 * plan somebody is scrolling through. For a 1GB scanned set that is a great
 * many requests to a server that does nothing but sign and redirect.
 *
 * So when the object is genuinely in R2, this hands back a long-lived signed
 * R2 link and takes this server out of the loop. When it is anywhere else —
 * including an old object still on disk while R2 is live — it falls back to the
 * proxy url, which knows how to find it.
 *
 * The returned value is a bearer credential. Give it to the caller that asked
 * and nowhere else: never a log line, never a database column, never the
 * address bar.
 */
export async function planViewerUrl(
  relKey: string,
  now: Date
): Promise<string> {
  const key = normalizeKey(relKey);
  // resolveReadBackend's answer is cached per key, so this costs nothing after
  // the first call for a given plan.
  const backend = await resolveReadBackend(key).catch(() => null);
  if (backend === "r2") return r2ViewerUrl(key, now);
  return storageUrl(key, now);
}
