import { History, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { unitCost } from "@/lib/money";
import { packPhrase } from "@shared/packPricing";
import { howLabel, priceChangeLabel } from "@shared/priceHistory";

/**
 * PRICE HISTORY — every recorded change of one material's price, newest
 * first (references/price-history-plan.md § 3.5; owner, 2026-10-14).
 *
 * View-only: no restore, no edit — changing a price stays where it is, and a
 * bid never reads this (its prices are frozen on its lines). Opened from the
 * material editor's More options. A window of 50 with "Show older".
 *
 * Fresh by construction: main.tsx lets this query go after every successful
 * mutation, so a price saved with the panel open appears without a reload.
 */
export function PriceHistoryPanel({
  open,
  onOpenChange,
  materialId,
  name,
  unitOfSale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materialId: number;
  name: string;
  unitOfSale: string;
}) {
  const query = trpc.materials.priceHistory.useInfiniteQuery(
    { id: materialId },
    {
      enabled: open,
      getNextPageParam: page => page.nextCursor,
    }
  );
  const pages = query.data?.pages ?? [];
  const entries = pages.flatMap(p => p.entries);
  const beforeHistory = pages.at(-1)?.beforeHistory ?? null;
  const unitWord =
    unitOfSale === "foot"
      ? "per foot"
      : unitOfSale === "box"
        ? "per box"
        : "each";
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pr-12">
          <SheetTitle className="flex items-center gap-2">
            <History className="w-4 h-4" /> Price history
          </SheetTitle>
          <SheetDescription>
            {name} · {unitWord}. What this price was, who changed it and how.
            Bids keep the price they were built with.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-1">
          {query.isLoading ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="h-12 rounded-md bg-muted/40 animate-pulse"
                />
              ))}
            </div>
          ) : entries.length === 0 && !beforeHistory ? (
            <p className="text-sm text-muted-foreground py-6">
              No price changes recorded yet. Every change from now on is kept
              here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map(e => (
                <li key={`${e.kind}-${e.id}`} className="py-2.5">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="text-muted-foreground w-24 shrink-0 text-xs">
                      {day(e.at)}
                    </span>
                    <span className="font-mono">
                      {unitCost(String(e.unitCost))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {priceChangeLabel(e.unitCost, e.previousUnitCost)}
                    </span>
                  </div>
                  <div className="pl-[6.5rem] text-xs text-muted-foreground">
                    {howLabel(e)}
                    {e.kind === "company" && e.supplierName
                      ? ` · ${e.supplierName}`
                      : ""}
                    {e.kind === "company" && e.priceAsOf
                      ? ` · sheet dated ${day(`${e.priceAsOf}T12:00:00Z`)}`
                      : ""}
                    {e.kind === "company" &&
                      e.packPrice !== null &&
                      e.packQty !== null && (
                        <div>
                          from {unitCost(String(e.packPrice))} per{" "}
                          {packPhrase(e.packQty, e.unitOfSale, e.packLabel)}
                        </div>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {query.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Show older"
              )}
            </Button>
          )}

          {!query.hasNextPage && !query.isLoading && (
            <p className="text-[0.7rem] text-muted-foreground pt-3">
              {beforeHistory
                ? `${unitCost(String(beforeHistory.unitCost))} — last changed ${day(beforeHistory.changedAt)}, before price history was kept. `
                : ""}
              Changes before price history started were not recorded.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
