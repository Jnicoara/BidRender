/**
 * The Updates view of a library screen (`?view=updates` on Materials,
 * Assemblies and Labor rates; references/starter-offers-plan.md § 2.3). The
 * same list on all three, the screen's own kind first — see StarterUpdates.
 */
import { Sparkles } from "lucide-react";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { StarterUpdates } from "@/components/library/StarterUpdates";
import type { UpdateTable } from "@/lib/starterUpdates";

export default function StarterUpdatesPage({
  screen,
}: {
  screen: "materials" | "assemblies" | "laborRates";
}) {
  const first: UpdateTable = screen;
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="page-header border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">
              {screen === "materials"
                ? "Materials"
                : screen === "assemblies"
                  ? "Assemblies"
                  : "Labor rates"}
            </h1>
            <p className="text-xs text-muted-foreground">
              Starter items BidRidge has changed since you started using them.
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5">
        <LibraryTabs group={screen} current="updates" />
        <StarterUpdates first={first} />
      </div>
    </div>
  );
}
