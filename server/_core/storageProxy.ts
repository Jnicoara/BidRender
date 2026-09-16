import type { Express } from "express";
import { ENV } from "./env";
import { verifyStorageToken } from "../storageTokens";
import { serveDiskObject } from "../diskStorage";
import { resolveReadBackend } from "../storage";
import { r2PresignGet } from "../r2Storage";

/**
 * Serve a stored object, to a caller holding a token for it.
 *
 * ── The token is the authorization ───────────────────────────────────────────
 * This route used to presign and redirect for any key anyone asked for, with no
 * session check of any kind. It could not simply start checking one: the things
 * that fetch these URLs are pdf.js loading a document and `<img src>` loading a
 * logo, and neither can attach an `Authorization` header. See
 * server/storageTokens.ts for the full reasoning.
 *
 * Ownership is enforced where the URL is MINTED — in routers that have already
 * resolved the company scope and checked the row belongs to it. This end only
 * has to answer one question: was this URL issued by us, for this key, recently.
 *
 * ── Old-shape URLs land here too, and are refused ────────────────────────────
 * A key always has at least two segments, so a pre-token URL still matches this
 * route with the first segment read as a token. It fails verification and gets
 * a 403 — which is the correct answer for a link that used to work and should
 * not any more, and is far better than falling through to the SPA and answering
 * an HTML page to something expecting a PDF.
 */
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/:token/*", async (req, res) => {
    const token = (req.params as Record<string, string>).token;
    const key = (req.params as Record<string, string>)[0];
    if (!key || !token) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Before anything is signed, and before the backend is even contacted: an
    // unauthorised caller must not be able to make this server do work, and
    // must learn nothing about whether the key exists.
    if (!verifyStorageToken(token, key, new Date())) {
      res.status(403).send("This link is not valid, or has expired.");
      return;
    }

    // Which store actually has it. With R2 live this can fall back to an older
    // one for a file stored before the switch — see resolveReadBackend.
    let backend: Awaited<ReturnType<typeof resolveReadBackend>>;
    try {
      backend = await resolveReadBackend(key);
    } catch (err) {
      console.error("[StorageProxy] could not resolve a backend:", err);
      res.status(502).send("Storage backend error");
      return;
    }

    if (backend === null) {
      res.status(404).send("Not found");
      return;
    }

    // On-disk storage (LOCAL_STORAGE_DIR): serve the file itself. sendFile
    // answers the byte-range requests pdf.js makes, so nothing is redirected.
    if (backend === "disk") {
      serveDiskObject(key, res);
      return;
    }

    // R2: redirect to a signed URL, the same shape as the Forge path below.
    // Range requests survive the redirect, so a plan set still streams.
    if (backend === "r2") {
      try {
        const signed = await r2PresignGet(key);
        res.set("Cache-Control", "no-store");
        res.redirect(307, signed);
      } catch (err) {
        console.error("[StorageProxy] R2 signing failed:", err);
        res.status(502).send("Storage backend error");
      }
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(
          `[StorageProxy] forge error: ${forgeResp.status} ${body}`
        );
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
