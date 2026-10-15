import { Check, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BID_STEPS,
  NEXT_LABEL,
  STEP_LABEL,
  STEP_PLACE,
  bidSteps,
  type BidStep,
  type StepPlace,
} from "@shared/bidSteps";

/**
 * The bid's steps — Plans, Scale, Count, Runs, Review, Print — and ONE
 * next-step button (owner, 2026-10-14). The rule is `shared/bidSteps.ts`;
 * this only draws it.
 *
 * Every step is a link, done or not: guidance, never a gate. Four steps are
 * done on the Plans screen, so on that screen the button names the step and
 * says it is here rather than navigating to where you already are.
 *
 * The counts come from `bids.progress`, which main.tsx refreshes after every
 * successful mutation, so marking a device moves "Count" the moment it lands.
 *
 * Small on purpose: one line, under the header. On a phone the step names
 * drop and the dots stay, so the bar never wraps under the button.
 */
export function BidStepBar({
  bidId,
  here,
  onGo,
  className,
}: {
  bidId: number;
  /** The screen this bar is on. */
  here: StepPlace;
  /** Go to the screen a step is done on. */
  onGo: (place: StepPlace) => void;
  className?: string;
}) {
  const { data } = trpc.bids.progress.useQuery({ bidId });
  if (!data) return null;
  const { states, next } = bidSteps(data);

  const go = (step: BidStep) => {
    if (STEP_PLACE[step] !== here) onGo(STEP_PLACE[step]);
  };

  return (
    <nav
      aria-label="Bid steps"
      className={cn(
        "flex flex-nowrap items-center gap-2 min-w-0 text-xs",
        className
      )}
    >
      <ol className="flex items-center gap-0.5 min-w-0 overflow-hidden">
        {BID_STEPS.map((step, i) => {
          const state = states[step];
          const isHere = STEP_PLACE[step] === here;
          return (
            <li key={step} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && (
                <ChevronRight
                  className="w-3 h-3 text-muted-foreground/40"
                  aria-hidden
                />
              )}
              <button
                type="button"
                onClick={() => go(step)}
                aria-current={state === "next" ? "step" : undefined}
                title={
                  state === "done"
                    ? `${STEP_LABEL[step]} — done`
                    : state === "skipped"
                      ? `${STEP_LABEL[step]} — skipped: this bid was counted by hand`
                      : state === "optional"
                        ? `${STEP_LABEL[step]} — optional`
                        : STEP_LABEL[step]
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors",
                  isHere ? "cursor-default" : "hover:bg-muted/60",
                  state === "next"
                    ? "text-[#F5C518] font-semibold"
                    : state === "done"
                      ? "text-foreground"
                      : "text-muted-foreground"
                )}
              >
                {state === "done" ? (
                  <Check className="w-3 h-3 text-emerald-400" aria-hidden />
                ) : (
                  <span
                    className={cn(
                      "inline-block w-1.5 h-1.5 rounded-full",
                      state === "next"
                        ? "bg-[#F5C518]"
                        : state === "skipped"
                          ? "bg-transparent border border-muted-foreground/40"
                          : "bg-muted-foreground/40"
                    )}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "hidden sm:inline",
                    state === "skipped" && "line-through decoration-1"
                  )}
                >
                  {STEP_LABEL[step]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {next &&
        (STEP_PLACE[next] === here ? (
          <span className="ml-auto shrink-0 text-muted-foreground">
            Next: <span className="text-foreground">{NEXT_LABEL[next]}</span> —
            here
          </span>
        ) : (
          <Button
            size="sm"
            className="ml-auto h-7 gap-1 text-xs shrink-0"
            onClick={() => go(next)}
          >
            {/* The step's name on a phone, the sentence on anything wider,
                so the bar stays one line at 375 px. */}
            <span className="sm:hidden">Next: {STEP_LABEL[next]}</span>
            <span className="hidden sm:inline">Next: {NEXT_LABEL[next]}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        ))}
    </nav>
  );
}
