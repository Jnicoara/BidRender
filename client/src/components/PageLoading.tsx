/**
 * What shows while a page's code is still arriving (pages load on demand —
 * client/src/lib/lazyPage.ts). Nothing for the first 300 ms, because a
 * spinner on a fast load reads as a slow app (CLAUDE.md § Responsiveness
 * rule 3), then one quiet line — never a blank screen on a weak signal.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function PageLoading() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), 300);
    return () => window.clearTimeout(timer);
  }, []);
  if (!show) return null;
  return (
    <div
      role="status"
      className="h-full flex items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 className="w-4 h-4 animate-spin text-[#F5C518]" aria-hidden />
      Loading…
    </div>
  );
}
