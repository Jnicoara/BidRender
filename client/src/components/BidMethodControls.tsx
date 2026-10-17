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
import {
  PRICING_METHODS,
  PRICING_METHOD_LABEL,
  type PricingMethod,
} from "@shared/bidMethods";
import { notPricedSuffix } from "@/lib/notPricedTotal";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";

/** What each method means, in one line under its name. */
const METHOD_MEANS: Record<PricingMethod, string> = {
  cost_op:
    "Material and labor at cost, then your overhead and profit on top. No material markup.",
  markup_rate:
    "Material marked up, labor at each role's charge rate. No overhead or profit on top.",
};

/**
 * Where a bid's method comes from: the company standard (what new bids are
 * created with today, `bids.howYouBid`) or this job only. Said beside the
 * method on the bid and in the shut panel's summary, so changing it on one
 * job can never be mistaken for changing the company's — it never does
 * (`server/howYouBid.test.ts`).
 */
export function useMethodSource(current: PricingMethod | null | undefined) {
  const company = trpc.bids.howYouBid.useQuery();
  if (current === undefined || !company.data) return null;
  return current === company.data.newBids ? "company" : "job";
}

const SOURCE_WORDS = {
  company: "Company standard",
  job: "This job only",
} as const;

/** "Cost + O&P · company standard" — the shut Pricing panel's first words. */
export function methodSummary(
  current: PricingMethod | null,
  source: "company" | "job" | null
) {
  const name = current === null ? "Old math" : PRICING_METHOD_LABEL[current];
  return source ? `${name} · ${SOURCE_WORDS[source].toLowerCase()}` : name;
}

/**
 * "HOW DO YOU BID?" — the one-time question (owner Q8, 2026-10-16). Shown
 * only while `bids.howYouBid` says it is open: a company with material
 * markup that never chose a method, whose new bids therefore keep today's
 * math. Never stuck: nothing waits on the answer, both answers are one
 * press, and Settings › Pricing holds the same choice for later. Someone
 * who cannot change company pricing sees the question and who can answer.
 */
export function HowYouBidCard({ className }: { className?: string }) {
  const utils = trpc.useUtils();
  const { can } = useCompany();
  const q = trpc.bids.howYouBid.useQuery();
  const answer = trpc.bids.setPricingDefaults.useMutation({
    onSuccess: (_r, v) =>
      toast.success(
        `New bids now start on ${PRICING_METHOD_LABEL[v.pricingMethod!]}. Bids you already have keep their own method.`
      ),
    onError: e => toast.error(e.message),
    onSettled: () => {
      void utils.bids.howYouBid.invalidate();
      void utils.bids.pricingDefaults.invalidate();
      void utils.bids.methodPrices.invalidate();
    },
  });
  if (!q.data?.open) return null;
  const canAnswer = can("pricing.edit");
  return (
    <div
      className={cn(
        "rounded-xl border border-[#F5C518]/50 bg-[#F5C518]/5 p-4 space-y-2",
        className
      )}
      role="region"
      aria-label="How do you bid?"
      data-testid="how-you-bid"
    >
      <p className="text-sm font-semibold">How do you bid?</p>
      <p className="text-xs text-muted-foreground">
        Until you choose, new bids keep today's math: your material markup, then
        overhead and profit on top of it. Pick the one way you price, once — you
        can change it any time in Settings › Pricing, and any one job can still
        be priced the other way.
      </p>
      {canAnswer ? (
        <div className="flex flex-wrap gap-2">
          {PRICING_METHODS.map(m => (
            <Button
              key={m}
              size="sm"
              variant="outline"
              className="h-auto min-h-8 max-w-xs py-1.5 text-left whitespace-normal"
              disabled={answer.isPending}
              onClick={() => answer.mutate({ pricingMethod: m })}
            >
              <span>
                <span className="block text-xs font-semibold">
                  {PRICING_METHOD_LABEL[m]}
                </span>
                <span className="block text-[11px] font-normal opacity-80">
                  {METHOD_MEANS[m]}
                </span>
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Whoever manages your company's pricing can answer this in Settings ›
          Pricing.
        </p>
      )}
    </div>
  );
}

function useChoose(bidId: number) {
  const utils = trpc.useUtils();
  return trpc.bids.setPricingMethod.useMutation({
    onSuccess: r =>
      toast.success(
        `This job is priced by ${PRICING_METHOD_LABEL[r.pricingMethod]} now. Your company standard is unchanged.`
      ),
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
  const source = useMethodSource(prices.data?.current);
  if (!prices.data) return null;
  const { current, changeable, options } = prices.data;
  const now = options.find(o => o.method === current);

  return (
    <div className="space-y-1.5" data-testid="bid-method">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Method</span>
        <span className="flex flex-wrap items-center justify-end gap-1.5 text-xs font-medium">
          {current === null
            ? "Old math — markup, then overhead and profit"
            : PRICING_METHOD_LABEL[current]}
          {source && (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-normal",
                source === "job"
                  ? "border-[#F5C518]/60 text-foreground"
                  : "border-border text-muted-foreground"
              )}
              data-testid="bid-method-source"
            >
              {SOURCE_WORDS[source]}
            </span>
          )}
        </span>
      </div>
      {changeable && canEdit && (
        <p className="text-[11px] text-muted-foreground">
          Changing it here changes this job only — never your company standard
          or any other bid.
        </p>
      )}
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
