/**
 * "A new version of BidRidge is available — Refresh."
 *
 * Asks `/api/version` every few minutes and whenever the tab comes back into
 * view, and shows this bar when the server is running a different build from
 * the page (`newBuildAvailable`, @/lib/versionCheck — the decisions and their
 * tests live there). Also shown when a piece of the app failed to load
 * (`vite:preloadError`, main.tsx), which is the same fact found the hard way.
 *
 * **It never reloads by itself.** A reload can drop a typed draft, an unsent
 * batch of marks or an open dialog; the person knows when they are between
 * things. Dismissing hides it for THAT build only, so a later deploy asks
 * again.
 *
 * Rendered outside <App> (main.tsx), so it needs no provider and still shows
 * on the landing page. Plain `fetch`, not tRPC, for the same reason. Hidden
 * when printing — it must never end up on a client's proposal.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { RotateCcw, X } from "lucide-react";
import type { BuildStamp } from "@shared/buildStamp";
import { BUILD_STAMP } from "@/lib/buildStamp";
import {
  VERSION_POLL_MS,
  newBuildAvailable,
  pageIsOutOfDate,
  readServerVersion,
  subscribeOutOfDate,
} from "@/lib/versionCheck";

export function NewVersionBar() {
  const [serverBuild, setServerBuild] = useState<BuildStamp | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const outOfDate = useSyncExternalStore(subscribeOutOfDate, pageIsOutOfDate);

  useEffect(() => {
    // `pnpm dev` has no stamp and reloads itself; nothing to compare.
    if (BUILD_STAMP.builtAt === null && BUILD_STAMP.commit === null) return;
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const server = readServerVersion(await response.json());
        if (!stopped && server && newBuildAvailable(BUILD_STAMP, server)) {
          setServerBuild(server);
        }
      } catch {
        // Offline or mid-deploy. Not knowing is not a new version.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    const timer = window.setInterval(check, VERSION_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const key = outOfDate
    ? "chunk"
    : serverBuild
      ? (serverBuild.commit ?? serverBuild.builtAt ?? "")
      : null;
  if (key === null || key === dismissedKey) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bp-no-print fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-32px)] max-w-md rounded-lg border border-[#F5C518]/50 bg-card shadow-lg px-3 py-2 flex items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          A new version of BidRidge is available
        </p>
        <p className="text-xs text-muted-foreground">
          Refresh when you're between things. Anything already saved is kept.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-[#F5C518] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#F5C518]/90"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Refresh
      </button>
      <button
        type="button"
        onClick={() => setDismissedKey(key)}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Not now"
        title="Not now"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
