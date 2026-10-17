/**
 * HOW A BID IS PRICED — the per-bid method (references/bid-methods-plan.md
 * § 7, owner Q2, Q14, Q16). Two pieces, one rule source (`bids.methodPrices`,
 * which prices the bid each way with the same rollup the bid screen uses):
 *
 *   BidMethodRow   inside "Pricing settings" — the method, and on a Draft a
 *                  choice of the other, each with the price it would give
 *                  (old → new before anything changes).
 *   OldMathOffer   under the total, on a Draft still on the old math only —
 *                  an OFFER, never automatic: "This bid is priced the old
 *                  way … Choose one method". Not the plan's "adds markup
 *                  AND overhead and profit" — false on a bid whose overhead
 *                  and profit are 0%, and seen saying it (2026-10-16).
 *
 * A bid that has left Draft, or is locked, shows its method and no choice:
 * it went out with it (`bids.setPricingMethod` refuses the same).
 */
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { money } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { PRICING_METHOD_LABEL, type PricingMethod } from "@shared/bidMethods";
import { notPricedSuffix } from "@/lib/notPricedTotal";

/** What each method means, in one line under its name. */
const METHOD_MEANS: Record<PricingMethod, string> = {
  cost_op:
    "Material and labor at cost, then your overhead and profit on top. No material markup.",
  markup_rate:
    "Material marked up, labor at each role's charge rate. No overhead or profit on top.",
};

function useChoose(bidId: number) {
  const utils = trpc.useUtils();
  return trpc.bids.setPricingMethod.useMutation({
    onSuccess: r =>
      toast.success(`Priced by ${PRICING_METHOD_LABEL[r.pricingMethod]} now.`),
    onError: e => toast.error(e.message),
    // Every bid read moves: the bid, its card, the list, these prices.
    onSettled: () => void utils.bids.invalidate(),
  });
}

/** "$245.00", or "$245.00 + 1 line no charge rate". */
function priceWords(o: {
  workPrice: number;
  notPriced: Parameters<typeof notPricedSuffix>[0];
}) {
  const suffix = notPricedSuffix(o.notPriced);
  return suffix ? `${money(o.workPrice)} ${suffix}` : money(o.workPrice);
}

export function BidMethodRow({
  bidId,
  canEdit,
}: {
  bidId: number;
  /** A viewer sees the method and its words, and no choice. */
  canEdit: boolean;
}) {
  const prices = trpc.bids.methodPrices.useQuery({ id: bidId });
  const choose = useChoose(bidId);
  if (!prices.data) return null;
  const { current, changeable, options } = prices.data;
  const now = options.find(o => o.method === current);

  return (
    <div className="space-y-1.5" data-testid="bid-method">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Method</span>
        <span className="text-xs font-medium">
          {current === null
            ? "Old math — markup, then overhead and profit"
            : PRICING_METHOD_LABEL[current]}
        </span>
      </div>
      {current !== null && (
        <p className="text-[11px] text-muted-foreground">
          {METHOD_MEANS[current]}
        </p>
      )}
      {!canEdit ? null : changeable ? (
        <div className="space-y-1">
          {options
            .filter(o => o.method !== current)
            .map(o => (
              <div
                key={o.method}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
              >
                <span className="min-w-0 text-xs">
                  <span className="font-medium">
                    {PRICING_METHOD_LABEL[o.method as PricingMethod]}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {now ? `${priceWords(now)} → ` : ""}
                    {priceWords(o)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  disabled={choose.isPending}
                  onClick={() =>
                    choose.mutate({
                      id: bidId,
                      method: o.method as PricingMethod,
                    })
                  }
                >
                  Use this
                </Button>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Kept: a bid that has left Draft, or is locked, keeps the method it
          went out with.
        </p>
      )}
    </div>
  );
}

export function OldMathOffer({ bidId }: { bidId: number }) {
  const prices = trpc.bids.methodPrices.useQuery({ id: bidId });
  const choose = useChoose(bidId);
  const data = prices.data;
  if (!data || data.current !== null || !data.changeable) return null;
  return (
    <div
      className="rounded-md border border-[#F5C518]/40 bg-[#F5C518]/5 px-2.5 py-2 space-y-1.5"
      data-testid="old-math-offer"
    >
      <p className="text-xs">
        This bid is priced the old way — material markup, then overhead and
        profit on top of it. Choose one method:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {data.options.map(o => (
          <Button
            key={o.method}
            size="sm"
            variant="outline"
            className="h-auto min-h-7 max-w-full py-1 text-xs text-left whitespace-normal"
            disabled={choose.isPending}
            onClick={() =>
              choose.mutate({ id: bidId, method: o.method as PricingMethod })
            }
          >
            {PRICING_METHOD_LABEL[o.method as PricingMethod]} · {priceWords(o)}
          </Button>
        ))}
      </div>
      {data.oldMath && (
        <p className="text-[11px] text-muted-foreground">
          Now {priceWords(data.oldMath)}. Nothing changes until you choose.
        </p>
      )}
    </div>
  );
}
