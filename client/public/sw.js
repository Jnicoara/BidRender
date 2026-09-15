/*
 * BidRender service worker — fast repeat loads, and nothing else.
 *
 * ── What this deliberately does NOT do ───────────────────────────────────────
 * It does not cache the API. Not one response, not for a second. Every number
 * this app shows is money — a bid price, a labor rate, a tax figure — and a
 * cached API response is a stale price displayed with no indication that it is
 * stale. A contractor cannot tell the difference on screen between a total the
 * server just computed and one from an hour ago, which is exactly the failure
 * every other part of this codebase is built to avoid. Offline editing is a
 * much larger piece of work with real conflict-resolution decisions in it, and
 * half of it is worse than none.
 *
 * So the deal is narrow and honest: the SHELL loads instantly and offline, and
 * the moment it needs data it behaves exactly like the website does — which,
 * with no connection, means it says so.
 *
 * ── Three caches, three different staleness rules ────────────────────────────
 *
 *   BUILD ASSETS (/assets/*)   cache-first, forever.
 *     Vite fingerprints these — `index-a1b2c3.js` changes name when its
 *     contents change — so a cached copy can never be the wrong version of
 *     anything. This is the one place "cache forever" is safe, precisely
 *     because the URL is a content hash.
 *
 *   THE DOCUMENT (navigations) network-first, cache as fallback.
 *     index.html is NOT fingerprinted and is what points at the current
 *     assets. Serving it cache-first would pin a returning user to an old
 *     build indefinitely — the single most common way a PWA "won't update".
 *     Network wins whenever there is one; the cached copy exists so a phone
 *     with no signal still opens the app instead of showing a dinosaur.
 *
 *   EVERYTHING ELSE (icons, fonts) stale-while-revalidate.
 *     Shown immediately, refreshed in the background. These change rarely and
 *     nothing depends on them being current within one page load.
 *
 * ── The version string is the kill switch ────────────────────────────────────
 * Bumping CACHE_VERSION orphans every previous cache, and `activate` deletes
 * anything that is not on the current list. That is what guarantees "does not
 * serve stale content indefinitely" even if one of the strategies above is
 * later got wrong: a deploy with a new version starts clean.
 */

// The `helixbid-` prefix is the product's old name, kept on purpose: activate
// deletes old caches by this prefix, so renaming it would strand every existing
// cache in the browsers that hold one.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `helixbid-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `helixbid-assets-${CACHE_VERSION}`;
const MISC_CACHE = `helixbid-misc-${CACHE_VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, MISC_CACHE];

/**
 * The bare minimum to render something. Not a precache manifest — the hashed
 * asset names are not known here, and they populate on first use instead.
 * First visit is a normal network load; every visit after that is instant.
 */
const SHELL_URLS = ["/", "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, and tolerating failure: one 404 in this list must not
      // stop the whole worker installing and leave the app with no cache at all.
      .then(cache =>
        Promise.all(
          SHELL_URLS.map(url => cache.add(url).catch(() => undefined))
        )
      )
  );
  // NOT skipWaiting(). A new worker taking over mid-session could start serving
  // a new build's assets to a page running the old build's code, and the
  // mismatch shows up as a blank screen. The new worker takes over on the next
  // full load, which is the next time the user opens the app.
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("helixbid-"))
            .filter(key => !CURRENT_CACHES.includes(key))
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Anything under here is live data and is never touched. */
function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

/** Vite's fingerprinted build output — safe to keep forever. */
function isBuildAsset(url) {
  return url.pathname.startsWith("/assets/");
}

self.addEventListener("fetch", event => {
  const request = event.request;

  // Only GET. A POST is a mutation and has no business in a cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin (fonts, analytics) is left entirely alone. Opaque responses
  // cannot be inspected, so caching them means caching failures indistinguishably.
  if (url.origin !== self.location.origin) return;

  // The API, untouched. See the header — this is the important line in the file.
  if (isApiRequest(url)) return;

  if (isBuildAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, MISC_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network first, falling back to whatever was cached last.
 *
 * The fallback chain ends at "/" rather than at a failure: this is a hash-routed
 * SPA, so every route is served by the same document, and a cached "/" can open
 * any screen the user was on.
 */
async function networkFirstDocument(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put("/", response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match(request)) || (await caches.match("/"));
    if (cached) return cached;
    throw new Error("offline and nothing cached");
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || fetch(request);
}

/**
 * Let the page ask for the cache to be emptied.
 *
 * The escape hatch for the failure mode a service worker is famous for: a user
 * stuck on an old build with no way to say so. Signing out clears it, so a
 * shared phone does not hand the next person a cached shell.
 */
self.addEventListener("message", event => {
  if (event.data?.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then(keys =>
          Promise.all(
            keys
              .filter(key => key.startsWith("helixbid-"))
              .map(key => caches.delete(key))
          )
        )
    );
  }
});
