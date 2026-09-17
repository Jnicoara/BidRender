/**
 * Where a brand-new account lands.
 *
 * ── One real step, not a tour ────────────────────────────────────────────────
 * The full Dashboard is the wrong first thing to show someone: every screen is
 * visible at once and none of them is obviously first. So a new account gets
 * this instead, and it asks for exactly one thing before letting go.
 *
 * That one thing is the labor rate, and the choice is not arbitrary. An
 * unpriced material understates one line of a bid; the labor rate multiplies
 * EVERY line, so a first bid built on a $0 rate is not slightly wrong, it is
 * missing its entire labor cost while looking complete. Materials can be priced
 * as jobs need them — the checklist nudges that later — but the rate has to be
 * real before the first bid, so it is asked for here and nowhere else.
 *
 * ── It asks; it does not trap ────────────────────────────────────────────────
 * Skipping is allowed and says plainly what it costs. A welcome screen that
 * will not let go is worse than a bid built on a rate the user was warned
 * about: the first teaches them the app fights them, the second is recoverable
 * and flagged everywhere it matters.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, HardHat, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { needsRate } from "@shared/laborRatePricing";
import { NavigationHelper } from "@/components/NavigationHelper";

export default function FirstRunPage() {
  const utils = trpc.useUtils();
  const { data: rates = [], isLoading } = trpc.laborRates.list.useQuery();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const setRate = trpc.onboarding.setStarterRate.useMutation({
    onError: e => toast.error(e.message),
  });
  const complete = trpc.onboarding.completeFirstRun.useMutation({
    onError: e => toast.error(e.message),
  });

  /** Only the hourly roles. A salary needs two numbers and a conversation. */
  const hourly = rates.filter(r => r.rateType === "hourly");
  const anyRateSet = rates.some(r => !needsRate(r));

  const save = async (id: number) => {
    const raw = drafts[id];
    const value = Number(raw);
    if (
      raw === undefined ||
      raw.trim() === "" ||
      Number.isNaN(value) ||
      value < 0
    ) {
      toast.error("Enter an hourly rate.");
      return;
    }
    setSavingId(id);
    try {
      await setRate.mutateAsync({ id, hourlyCost: value });
      await utils.laborRates.list.invalidate();
      setDrafts(d => {
        const next = { ...d };
        delete next[id];
        return next;
      });
    } catch {
      /* surfaced by onError */
    } finally {
      setSavingId(null);
    }
  };

  /** Finish onboarding and go start a bid — the point of all this. */
  const goToFirstBid = async () => {
    try {
      await complete.mutateAsync();
      await utils.onboarding.state.invalidate();
      // The Dashboard, where both ways into a first bid are the first thing
      // on the screen. This used to hand off to Quick bid, whose page was a
      // chooser over bids a new account does not have yet.
      window.location.hash = "#/dashboard";
    } catch {
      /* surfaced by onError */
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <div className="flex items-center gap-3 mb-2">
          <HardHat className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-semibold">Welcome to BidRidge</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          One thing before you start bidding, and then you are straight into it.
        </p>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold">
            What does an hour cost you?
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            This is the number every bid multiplies by. Set the roles you
            actually use — one is enough to start, and you can change them any
            time. Anything left at zero prices that work at nothing.
          </p>

          <div className="mt-5 space-y-2">
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                Loading roles…
              </div>
            ) : (
              hourly.map(rate => {
                const unset = needsRate(rate);
                const draft = drafts[rate.id];
                return (
                  <div key={rate.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm truncate">{rate.name}</span>
                    {unset ? (
                      <>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            $
                          </span>
                          <Input
                            value={draft ?? ""}
                            onChange={e =>
                              setDrafts(d => ({
                                ...d,
                                [rate.id]: e.target.value,
                              }))
                            }
                            onFocus={selectOnFocus}
                            onKeyDown={e => {
                              if (e.key === "Enter") void save(rate.id);
                            }}
                            onBlur={() => {
                              if (drafts[rate.id]?.trim()) void save(rate.id);
                            }}
                            inputMode="decimal"
                            placeholder="0.00"
                            aria-label={`${rate.name} hourly rate`}
                            className="h-9 w-32 pl-6 text-sm text-right"
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">
                          /hr
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="w-32 text-right text-sm font-mono">
                          ${Number(rate.hourlyCost).toFixed(2)}
                        </span>
                        <span className="w-8 flex items-center">
                          {savingId === rate.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <Check className="w-4 h-4 text-[#F5C518]" />
                          )}
                        </span>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            className="gap-2"
            onClick={goToFirstBid}
            disabled={complete.isPending}
          >
            {complete.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            Start my first bid
          </Button>
          <span
            className={cn(
              "text-xs",
              anyRateSet ? "text-muted-foreground" : "text-[#F5C518]"
            )}
          >
            {anyRateSet
              ? "You can add the rest of your roles later."
              : "You can skip this, but bids will price labor at $0 until a rate is set."}
          </span>
        </div>

        <div className="mt-10 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">
            Not sure where something lives? Ask.
          </p>
          <NavigationHelper />
        </div>
      </div>
    </div>
  );
}
