// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.
//
// This file is the socket the three storage backends plug into: the Forge
// presign proxy, a folder on this machine (diskStorage.ts) and Cloudflare R2
// (r2Storage.ts). `selectStorageBackend` says which one is live — see
// storageBackend.ts for how that is chosen and why it is never inferred.
//
// Every function returns the same shapes whichever backend answered, which is
// what keeps the routers, the client and the database columns out of it.

import { ENV } from "./_core/env";
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
} from "./r2Storage";
import {
  legacyReadBackends,
  selectStorageBackend,
  type StorageBackendName,
} from "./storageBackend";

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
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
  const { forgeUrl, forgeKey } = getForgeConfig();

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

/**
 * A presigned PUT the BROWSER uploads to, instead of posting bytes to us.
 *
 * `storagePut` above takes the whole file into this process first, which caps
 * an upload at whatever the request body limit is — and on Cloud Run that is
 * 32 MiB, well below the sizes a scanned plan set reaches. Handing the signed
 * URL to the client takes this server out of the data path entirely: no body
 * limit applies, nothing is buffered in memory here, and the browser can report
 * real progress because it owns the transfer.
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
  const { forgeUrl, forgeKey } = getForgeConfig();

  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  presignUrl.searchParams.set("content_type", contentType);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url } = (await presignResp.json()) as { url: string };
  if (!url) throw new Error("Forge returned empty presign URL");

  return { key, uploadUrl: url };
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
 * Manus is always the terminal guess and is never verified. There is no cheap
 * way to ask it whether a key exists — the presign endpoint signs first and
 * discovers nothing is there when the browser follows the URL — and a wrong
 * guess there costs a 404 on a file that was missing anyway.
 *
 * Returns null only when R2 is live, the object is not in it, and there is no
 * older store configured to have kept it.
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
    if (legacy === "manus") return "manus";
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
  if (backend === null) {
    throw new Error(`No configured storage holds ${key}.`);
  }
  const { forgeUrl, forgeKey } = getForgeConfig();

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
