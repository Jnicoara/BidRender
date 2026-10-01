/**
 * How the built client is served: what a browser may keep, and what a missing
 * file answers. Added 2026-09-30 with the "new version available" bar
 * (todo.md, "Open tabs keep running the OLD code").
 *
 * ── Three kinds of file, three rules ─────────────────────────────────────────
 *
 *   /assets/*      `immutable`, a year. Vite names them by content hash, so a
 *                  given URL can never mean different bytes.
 *   index.html,    `no-cache`: keep it, but ask every time. These are the
 *   /sw.js         files that NAME the current build. A proxy or CDN holding
 *                  an old one pins people to the old build.
 *   anything else  left to Express's default (revalidate). Icons, manifest.
 *
 * ── A missing asset is a 404, never the app's front page ─────────────────────
 * The catch-all used to answer EVERY unknown path with index.html and a 200,
 * including `/assets/x.js` that a tab from an older build asked for after a
 * deploy. The service worker's cache-first rule then stored that HTML under
 * the script's URL, forever: a page that could not load its own code, in that
 * browser, until someone cleared the cache. An honest 404 fails the import
 * cleanly, which the client turns into "BidRidge has been updated — Refresh".
 */
import express, { type Express } from "express";
import path from "path";

export const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const SHELL_CACHE_CONTROL = "no-cache";

/** The Cache-Control a served file gets, by its URL path; null = default. */
export function staticCacheControl(urlPath: string): string | null {
  if (urlPath.startsWith("/assets/")) return ASSET_CACHE_CONTROL;
  if (urlPath === "/" || urlPath === "/index.html" || urlPath === "/sw.js") {
    return SHELL_CACHE_CONTROL;
  }
  return null;
}

/** Serve a built client directory with the rules above. */
export function serveBuiltClient(app: Express, distPath: string): void {
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        const rel =
          "/" + path.relative(distPath, filePath).split(path.sep).join("/");
        const rule = staticCacheControl(rel);
        if (rule) res.setHeader("Cache-Control", rule);
      },
    })
  );

  // Not found under /assets/: say so. See the header.
  app.use("/assets", (_req, res) => {
    res.status(404).type("text/plain").send("Not found");
  });

  // Everything else is the single-page app; its router decides the screen.
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", SHELL_CACHE_CONTROL);
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
