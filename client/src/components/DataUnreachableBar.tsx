/**
 * "BidRidge can't reach your data right now" — the net under every screen.
 *
 * Raised by @/lib/dataReach when a read fails for want of the data (the
 * server cannot reach its database, or no answer came back at all), lowered
 * by the next read that succeeds. While it is up it re-asks the reads on
 * screen every 15 s, so it clears itself when the data comes back; "Try
 * again" does the same now.
 *
 * Why it exists: with the database down, screens opened afterwards stated
 * things that were not true — "No clients yet", an empty catalog, a bid that
 * "may have been deleted" — or went blank (drilled 2026-10-15). The worst of
 * those now say so themselves; this covers the rest, and any screen added
 * later, by saying plainly that what is on screen may be incomplete.
 *
 * Rendered outside <App> beside NewVersionBar, so it needs no provider: the
 * retry is handed in. At the TOP, so it never sits on the new-version bar
 * or a screen's bottom controls. Hidden when printing.
 */
import { useEffect, useSyncExternalStore } from "react";
import { RotateCcw, WifiOff } from "lucide-react";
import { dataIsUnreachable, subscribeDataReach } from "@/lib/dataReach";

const RETRY_MS = 15_000;

/*
  OFFLINE is its own case. While the browser says it is offline, React Query
  PAUSES reads and saves instead of failing them, so nothing ever raises the
  "can't reach" flag — a save just sat there looking done (drill,
  2026-10-15). The browser's own online/offline signal drives this wording.
*/
const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
const isOffline = () => navigator.onLine === false;

export function DataUnreachableBar({ retry }: { retry: () => void }) {
  const unreachable = useSyncExternalStore(
    subscribeDataReach,
    dataIsUnreachable
  );
  const offline = useSyncExternalStore(subscribeOnline, isOffline);

  useEffect(() => {
    if (!unreachable) return;
    const timer = window.setInterval(retry, RETRY_MS);
    return () => window.clearInterval(timer);
  }, [unreachable, retry]);

  if (offline)
    return (
      <div
        role="status"
        aria-live="polite"
        className="bp-no-print fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-32px)] max-w-md rounded-lg border border-amber-500/60 bg-card shadow-lg px-3 py-2 flex items-center gap-3"
      >
        <WifiOff className="w-4 h-4 shrink-0 text-amber-500" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">You're offline</p>
          <p className="text-xs text-muted-foreground">
            Changes you make are held and sent when the connection is back —
            keep this tab open until then.
          </p>
        </div>
      </div>
    );
  if (!unreachable) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="bp-no-print fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-32px)] max-w-md rounded-lg border border-amber-500/60 bg-card shadow-lg px-3 py-2 flex items-center gap-3"
    >
      <WifiOff className="w-4 h-4 shrink-0 text-amber-500" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          BidRidge can't reach your data right now
        </p>
        <p className="text-xs text-muted-foreground">
          What's on screen may be incomplete. Nothing you saved is lost — this
          clears by itself when the connection is back.
        </p>
      </div>
      <button
        type="button"
        onClick={retry}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Try again
      </button>
    </div>
  );
}
