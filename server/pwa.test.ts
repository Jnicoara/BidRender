/**
 * The installable app: manifest, icons, and a service worker that lets go.
 *
 * ── What these tests can and cannot prove ────────────────────────────────────
 * They are file-level and rule-level. They check that the manifest satisfies
 * the criteria Chrome actually enforces for installability, that every icon it
 * names exists and is genuinely the size it claims, that the iOS meta tags are
 * present (iOS ignores most of the manifest), and — the important one — that
 * the service worker's caching rules cannot serve a stale price.
 *
 * They cannot prove that tapping "Add to Home Screen" on a physical iPhone
 * produces a working icon. Nothing running in CI can. What was done instead is
 * recorded in the commit message; this file covers the half that a machine can
 * check honestly.
 *
 * ── The rule with money behind it ────────────────────────────────────────────
 * `describe("never caches the API")` is the one to read. Every figure in this
 * app is money, and a cached API response is a stale price shown with no
 * indication that it is stale — indistinguishable on screen from one the
 * server just computed. The worker is asserted to bail out of `/api/` before
 * any caching branch can see it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CLIENT = resolve(import.meta.dirname, "../client");
const PUBLIC = resolve(CLIENT, "public");

const read = (path: string) => readFileSync(resolve(PUBLIC, path), "utf8");
const manifest = JSON.parse(read("manifest.webmanifest")) as {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  shortcuts?: Array<{ name: string; url: string }>;
};
const sw = read("sw.js");
const indexHtml = readFileSync(resolve(CLIENT, "index.html"), "utf8");

/** Width and height straight out of a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(resolve(PUBLIC, path));
  const signature = bytes.subarray(0, 8).toString("hex");
  expect(signature, `${path} is not a PNG`).toBe("89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// ── The manifest ─────────────────────────────────────────────────────────────

describe("the web app manifest", () => {
  it("carries every field Chrome requires to offer installation", () => {
    // These are the actual installability criteria, not a wish list: without
    // any one of them the install prompt never appears and the failure is
    // silent.
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(
      manifest.display
    );
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("keeps short_name short enough for a home screen label", () => {
    // Android truncates past roughly a dozen characters; a name that gets cut
    // is worse than a shorter one chosen deliberately.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it("uses the app's own colours, not defaults", () => {
    // The splash screen and status bar are the first thing an installed app
    // shows. Wrong colours there read as a broken app before it has rendered.
    expect(manifest.background_color).toBe("#0F1117");
    expect(manifest.theme_color).toBe("#0F1117");
    expect(indexHtml).toContain('name="theme-color" content="#0F1117"');
  });

  it("starts inside its own scope", () => {
    // A start_url outside the scope opens the installed app in a browser tab,
    // which is the whole thing it exists to avoid.
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it("starts on the dashboard rather than the marketing page", () => {
    // Someone who has installed the app has already decided; landing them on
    // the pitch is a wasted tap every single launch.
    expect(manifest.start_url).toContain("/#/dashboard");
  });

  it("offers shortcuts that point at real routes", () => {
    // Deliberately not the start_url, and deliberately not each other.
    //
    // These used to be Quick bid and Bids, and both of those addresses have
    // since been retired — they now redirect to the Dashboard, which is where
    // the icon already lands. Two shortcuts to the screen you were going to get
    // anyway is a menu that costs a long-press and gives nothing back, so they
    // were replaced with the two things worth jumping straight to from a phone
    // away from a desk: a price at the counter, and a customer's number.
    const routes = ["/#/library/materials", "/#/clients"];
    for (const shortcut of manifest.shortcuts ?? []) {
      expect(routes).toContain(shortcut.url);
      expect(shortcut.url).not.toBe(manifest.start_url);
    }
  });
});

// ── The icons ────────────────────────────────────────────────────────────────

describe("the icons phones actually ask for", () => {
  it("ships 192 and 512, which are Chrome's hard requirements", () => {
    const sizes = manifest.icons
      .filter(icon => icon.purpose === "any")
      .map(icon => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("has a file behind every icon the manifest names", () => {
    for (const icon of manifest.icons) {
      const path = icon.src.replace(/^\//, "");
      expect({
        src: icon.src,
        exists: existsSync(resolve(PUBLIC, path)),
      }).toEqual({ src: icon.src, exists: true });
    }
  });

  it("has icons that are genuinely the size they claim", () => {
    // A 512 entry pointing at a 192 file is a real and common mistake: the
    // manifest validates, the install prompt appears, and the home screen icon
    // is soft. Checked against the PNG header, not the filename.
    for (const icon of manifest.icons) {
      const [width, height] = icon.sizes.split("x").map(Number);
      const actual = pngSize(icon.src.replace(/^\//, ""));
      expect({ src: icon.src, ...actual }).toEqual({
        src: icon.src,
        width,
        height,
      });
    }
  });

  it("ships a maskable pair as well as a plain one", () => {
    // Without a maskable icon Android shrinks the plain one into a white
    // circle, which looks like a mistake because it is one.
    const maskable = manifest.icons.filter(i => i.purpose === "maskable");
    expect(maskable.map(i => i.sizes).sort()).toEqual(["192x192", "512x512"]);
  });

  it("draws the maskable variant full-bleed, with the mark inside the safe zone", () => {
    const source = read("icons/icon-maskable.svg");
    // No corner radius: the launcher applies its own mask and an icon that
    // rounds its own corners gets them sliced off.
    expect(source).not.toMatch(/<rect[^>]*\srx=/);
    // And the mark is set smaller than on the unmasked icon so it survives a
    // circular mask. 168 against 240 — see the file.
    expect(source).toContain('font-size="168"');
    expect(read("icons/icon.svg")).toContain('font-size="240"');
  });

  it("gives iOS a PNG apple-touch-icon at 180, which is what it asks for", () => {
    // iOS reads the manifest for very little and takes its home-screen icon
    // from here. It also refuses SVG, so the favicon cannot stand in.
    expect(indexHtml).toContain('rel="apple-touch-icon"');
    expect(indexHtml).toContain("/icons/apple-touch-icon.png");
    expect(pngSize("icons/apple-touch-icon.png")).toEqual({
      width: 180,
      height: 180,
    });
  });

  it("keeps every icon small enough not to slow a first install", () => {
    for (const icon of manifest.icons) {
      const path = resolve(PUBLIC, icon.src.replace(/^\//, ""));
      expect({
        src: icon.src,
        under100k: readFileSync(path).length < 100_000,
      }).toEqual({ src: icon.src, under100k: true });
    }
  });
});

// ── iOS, which reads almost none of the manifest ─────────────────────────────

describe("what iOS needs, since it ignores the manifest", () => {
  it("declares itself web-app capable so it opens without Safari chrome", () => {
    expect(indexHtml).toContain('name="apple-mobile-web-app-capable"');
    expect(indexHtml).toContain('name="mobile-web-app-capable"');
  });

  it("names the app for the home screen label", () => {
    expect(indexHtml).toContain('name="apple-mobile-web-app-title"');
  });

  it("sets a status bar style that suits a dark app", () => {
    expect(indexHtml).toContain("apple-mobile-web-app-status-bar-style");
    expect(indexHtml).toContain("black-translucent");
  });

  it("links the manifest at all", () => {
    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).toContain("/manifest.webmanifest");
  });
});

// ── The rule with money behind it ────────────────────────────────────────────

describe("never caches the API", () => {
  it("bails out of /api/ before any caching branch", () => {
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    // A bare `return` inside the fetch handler, which leaves the request to the
    // network untouched — not a cache strategy with a short lifetime.
    expect(sw).toMatch(/if \(isApiRequest\(url\)\) return;/);
  });

  it("puts that check before every strategy call", () => {
    const apiCheck = sw.indexOf("if (isApiRequest(url)) return;");
    expect(apiCheck).toBeGreaterThan(-1);
    for (const strategy of [
      "cacheFirst(request",
      "networkFirstDocument(request)",
      "staleWhileRevalidate(request",
    ]) {
      // Every call site sits after the bail-out, so no ordering change can put
      // a caching branch in front of it without failing here.
      expect({ strategy, after: sw.indexOf(strategy) > apiCheck }).toEqual({
        strategy,
        after: true,
      });
    }
  });

  it("ignores anything that is not a GET", () => {
    // A POST is a mutation and has no business in a cache.
    expect(sw).toContain('request.method !== "GET"');
  });

  it("leaves cross-origin requests alone", () => {
    // Opaque responses cannot be inspected, so caching them means caching
    // failures indistinguishably from successes.
    expect(sw).toContain("url.origin !== self.location.origin");
  });
});

describe("does not serve stale content indefinitely", () => {
  it("serves the document network-first, so a new build is picked up", () => {
    // index.html is not fingerprinted and points at the current assets. Cached
    // first, a returning user is pinned to an old build — the single most
    // common way a PWA "won't update".
    expect(sw).toContain('request.mode === "navigate"');
    expect(sw).toContain("networkFirstDocument");
    expect(sw).toMatch(
      /async function networkFirstDocument[\s\S]*?await fetch\(request\)/
    );
  });

  it("only caches fingerprinted assets forever", () => {
    // Cache-first is safe exactly once: when the URL is a content hash, so a
    // cached copy cannot be the wrong version of anything.
    expect(sw).toContain('url.pathname.startsWith("/assets/")');
    expect(sw).toMatch(/isBuildAsset\(url\)[\s\S]{0,80}cacheFirst/);
  });

  it("deletes every cache from a previous version on activate", () => {
    // The kill switch: bumping the version orphans the old caches and this
    // removes them, so a bad strategy cannot outlive one deploy.
    expect(sw).toContain("CACHE_VERSION");
    expect(sw).toMatch(/addEventListener\("activate"[\s\S]*?caches\.delete/);
    expect(sw).toMatch(/!CURRENT_CACHES\.includes\(key\)/);
  });

  it("does not take over a page mid-session", () => {
    // skipWaiting would let a new worker serve a new build's assets to a page
    // running the old build's code, which shows up as a blank screen.
    expect(sw).not.toMatch(/self\.skipWaiting\(\)/);
  });

  it("can be told to empty its caches", () => {
    expect(sw).toContain("CLEAR_CACHES");
  });
});

// ── Run, not read: what the worker actually keeps (2026-09-30) ───────────────

describe("never keeps the front page as a script", () => {
  /**
   * sw.js executed for real against an in-memory Cache Storage, so this
   * asserts behaviour rather than spelling. The fault it guards: a missing
   * /assets/ file was answered with index.html and a 200, the cache-first
   * rule stored it, and that browser could not load the script again.
   */
  async function fetchThroughWorker(
    pathname: string,
    answer: () => Response
  ): Promise<{ status: number; stored: string[] }> {
    const store = new Map<string, Response>();
    const cache = {
      match: async (req: { url: string } | string) =>
        store.get(typeof req === "string" ? req : req.url)?.clone(),
      put: async (req: { url: string } | string, res: Response) => {
        store.set(typeof req === "string" ? req : req.url, res);
      },
      add: async () => undefined,
    };
    const listeners: Record<string, (event: unknown) => void> = {};
    const self = {
      location: { origin: "https://bidridge.com" },
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        listeners[type] = fn;
      },
      clients: { claim: async () => undefined },
    };
    const caches = {
      open: async () => cache,
      match: cache.match,
      keys: async () => [],
      delete: async () => true,
    };
    new Function("self", "caches", "fetch", sw)(self, caches, async () =>
      answer()
    );
    let responded: Promise<Response> | undefined;
    listeners.fetch({
      request: {
        method: "GET",
        mode: "no-cors",
        url: `https://bidridge.com${pathname}`,
      },
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
    });
    const response = await responded!;
    // cache.put is not awaited by the worker; let it land.
    await new Promise(resolve => setTimeout(resolve, 0));
    return { status: response.status, stored: Array.from(store.keys()) };
  }

  it("does not store an HTML answer for an /assets/ URL", async () => {
    const result = await fetchThroughWorker(
      "/assets/BidRenderShell-gone.js",
      () =>
        new Response("<!doctype html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" },
        })
    );
    expect(result.stored).toEqual([]);
  });

  it("does not store a 404", async () => {
    const result = await fetchThroughWorker(
      "/assets/gone.js",
      () => new Response("Not found", { status: 404 })
    );
    expect(result).toEqual({ status: 404, stored: [] });
  });

  it("still keeps a real script", async () => {
    const result = await fetchThroughWorker(
      "/assets/index-abc.js",
      () =>
        new Response("export {};", {
          status: 200,
          headers: { "content-type": "application/javascript" },
        })
    );
    expect(result.stored).toEqual(["https://bidridge.com/assets/index-abc.js"]);
  });
});

// ── It must not become a requirement ─────────────────────────────────────────

describe("works for people who never install it", () => {
  const registration = readFileSync(
    resolve(CLIENT, "src/lib/registerServiceWorker.ts"),
    "utf8"
  );

  it("registers only in production, so dev is untouched", () => {
    // A worker in dev fights Vite's hot reload — the page ends up running two
    // versions of the same module.
    expect(registration).toContain("import.meta.env.PROD");
  });

  it("checks for support before touching the API", () => {
    expect(registration).toContain('"serviceWorker" in navigator');
    expect(registration).toContain("isSecureContext");
  });

  it("swallows a failed registration instead of surfacing it", () => {
    // The user has no action to take and the app works without it.
    expect(registration).toMatch(/\.catch\(/);
    expect(registration).not.toMatch(/toast\.|throw new Error/);
  });

  it("waits for load, so it never slows the first paint", () => {
    // The point is a faster SECOND visit; buying that with a slower first one
    // would be a poor trade.
    expect(registration).toContain('addEventListener("load"');
  });

  it("ships the way back out", () => {
    // A service worker can outlive its own deletion: remove the file and every
    // browser that installed it keeps running the old copy.
    expect(registration).toContain("disableServiceWorker");
    expect(registration).toContain("unregister");
  });

  it("does not gate any app behaviour on being installed", () => {
    // Nothing anywhere should branch on display-mode. If this ever fails,
    // something has made installation a requirement rather than an enhancement.
    const main = readFileSync(resolve(CLIENT, "src/main.tsx"), "utf8");
    expect(main).not.toMatch(/display-mode/);
    expect(main).toContain("registerServiceWorker()");
  });
});
