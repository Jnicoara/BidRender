/**
 * Turning the service worker on, and being able to turn it off again.
 *
 * ── Production only ─────────────────────────────────────────────────────────
 * A service worker in development fights Vite's hot reload: the worker serves a
 * cached module, HMR pushes a new one, and the page ends up running two
 * versions of the same file. Registering only in production keeps `pnpm dev`
 * behaving exactly as it always has. Testing the worker means `pnpm build &&
 * pnpm start`, which is the honest way to test it anyway — dev serves
 * unbundled modules that the production caching rules never see.
 *
 * ── The unregister path is not optional ─────────────────────────────────────
 * A service worker is the one piece of a web app that can outlive its own
 * removal: delete the file and every browser that already installed it keeps
 * running the old copy, potentially forever. So this ships with the way out
 * built in — `disableServiceWorker()` unregisters and empties every cache, and
 * it is exported rather than hidden so a future decision to drop the PWA is a
 * function call rather than an archaeology exercise.
 *
 * ── Nothing here is required for the app to work ────────────────────────────
 * Every call is inside a capability check and a try/catch. A browser with no
 * service-worker support, a user in private browsing, an insecure origin, a
 * corporate policy blocking workers — all of them fall through to the app
 * working exactly as it did before. Installation is an enhancement and must
 * never become a dependency.
 */

/** Is this browser able to run one at all? */
export function serviceWorkerSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    // Workers need a secure context. localhost counts, which is what makes a
    // local production build testable.
    (window.isSecureContext || window.location.hostname === "localhost")
  );
}

/**
 * Register the worker, quietly.
 *
 * Deferred to `load` so it never competes with the first render for bandwidth.
 * The whole point is a faster SECOND visit; making the first one slower to buy
 * that would be a poor trade.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!serviceWorkerSupported()) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(error => {
      // Not a toast, not a retry. The app works without it and the user has no
      // action to take; this is for whoever is reading the console.
      console.warn("[PWA] Service worker registration failed:", error);
    });
  });
}

/**
 * Remove the worker and everything it cached.
 *
 * Two steps, because either alone leaves a mess: unregistering stops the worker
 * from intercepting but leaves the caches on disk, and clearing caches without
 * unregistering just means it refills them.
 */
export async function disableServiceWorker(): Promise<void> {
  if (!serviceWorkerSupported()) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(registration => registration.unregister())
    );
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          // The old product name, matching the cache names in sw.js.
          .filter(key => key.startsWith("helixbid-"))
          .map(key => caches.delete(key))
      );
    }
  } catch (error) {
    console.warn("[PWA] Could not remove the service worker:", error);
  }
}

/**
 * Ask the running worker to empty its caches without unregistering it.
 *
 * For signing out on a shared phone: the next person gets a fresh shell rather
 * than one cached under someone else's session. The worker itself stays, so the
 * app is still fast for them.
 */
export function clearServiceWorkerCaches(): void {
  if (!serviceWorkerSupported()) return;
  navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_CACHES" });
}
