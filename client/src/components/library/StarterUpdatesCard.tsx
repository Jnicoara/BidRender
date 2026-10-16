/**
 * The Dashboard's "N starter updates available · Review"
 * (references/starter-offers-plan.md § 2.3; owner Q1, Q3).
 *
 * Shown only while N > 0, and only to the owner and admins — the people who
 * can answer. Never on a bid screen and never a pop-up (Q3). N is the server
 * list's own length (`starterOffers.count`), refreshed with every answer by
 * `useRefreshStarterOffers`, so it cannot disagree with the list it opens.
 */
import { Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { routeToPath } from "@/lib/appRoutes";
import { updatesCardText } from "@/lib/starterUpdates";

export function StarterUpdatesCard({ className }: { className?: string }) {
  const count = trpc.starterOffers.count.useQuery(undefined, {
    staleTime: 60_000,
  });
  const text = updatesCardText(count.data?.count ?? 0);
  if (!text || !count.data?.canAnswer) return null;
  return (
    <a
      href={`#${routeToPath("library-materials", { view: "updates" })}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-[#F5C518]/50 bg-[#F5C518]/5 px-4 py-3 hover:bg-[#F5C518]/10",
        className
      )}
    >
      <Sparkles className="w-4 h-4 shrink-0 text-[#F5C518]" />
      <span className="flex-1 min-w-0 text-sm">
        <span className="font-semibold">{text}</span>
        <span className="block text-xs text-muted-foreground">
          BidRidge changed starter items you use. Nothing of yours changes until
          you accept.
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-[#F5C518]">
        Review
      </span>
    </a>
  );
}
