/**
 * Guide mode's strip: ONE tip, in plain words, along the bottom of the
 * screen — under the work, never over a control (owner, 2026-10-14). The rule
 * for which tip is client/src/lib/guide.ts; this only draws it.
 *
 * Mounted once, in the shell, as a `shrink-0` row of the main column between
 * the screen and the phone's bottom bar, so the screen above ends where the
 * strip starts by construction (CLAUDE.md § Responsiveness rule 4) and no
 * screen — Track B's Plans screen included — had to change for it.
 */
import { useEffect, useState } from "react";
import { Compass, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { guideTip, type GuideScreen } from "@/lib/guide";
import { useGuideState, useShowStepBar } from "@/hooks/useCrosshairColor";
import type { StepPlace } from "@shared/bidSteps";

/**
 * Is one of Track B's first-open Plans tips on screen? Read off the page,
 * by the "No more tips" button every tip card carries
 * (components/takeoff/PlanTips.tsx), because only B's component knows which
 * tip its sheet can show — its seen-state cannot say (see guide.ts).
 */
function planTipOnScreen(): boolean {
  return Array.from(document.querySelectorAll("button")).some(
    b => b.textContent?.trim() === "No more tips"
  );
}

export function GuideStrip({
  screen,
  bidId,
  onGo,
  onOpenHelp,
}: {
  screen: GuideScreen;
  /** The open bid, on a bid's screens. */
  bidId: number | null;
  onGo: (place: StepPlace) => void;
  onOpenHelp: () => void;
}) {
  const [state, setState] = useGuideState();
  const [stepBarShown] = useShowStepBar();
  const canEdit = useCompany().can("bids.edit");
  const on = !state.off;

  const progress = trpc.bids.progress.useQuery(
    { bidId: bidId ?? 0 },
    { enabled: on && bidId !== null }
  );
  const bids = trpc.bids.dashboard.useQuery(undefined, {
    enabled: on && screen === "dashboard",
  });

  // Polled on the Plans screen only, and only while the guide is on: a tip
  // card comes and goes with the sheet, with no event this strip could hear.
  const [planTipShowing, setPlanTipShowing] = useState(false);
  useEffect(() => {
    if (screen !== "plans" || !on) {
      setPlanTipShowing(false);
      return;
    }
    const check = () => setPlanTipShowing(planTipOnScreen());
    check();
    const timer = window.setInterval(check, 800);
    return () => window.clearInterval(timer);
  }, [screen, on]);

  const tip = guideTip({
    screen,
    progress: bidId !== null ? (progress.data ?? null) : null,
    hasBids: bids.data
      ? bids.data.some(b => !(b as { isSample?: boolean }).isSample)
      : null,
    state,
    planTipShowing,
    stepBarShown,
    canEdit,
  });
  if (!tip) return null;

  const close = () => setState({ ...state, hidden: [...state.hidden, tip.id] });
  const turnOff = () => setState({ ...state, off: true });

  return (
    <aside
      aria-label="Guide"
      className="shrink-0 border-t border-border bg-sidebar px-3 md:px-6 py-2"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 max-w-5xl">
        <Compass
          className="w-4 h-4 mt-0.5 shrink-0 text-[#F5C518]"
          aria-hidden
        />
        <div className="flex-1 min-w-[12rem]">
          <p className="text-xs">
            {tip.stepLabel && (
              <span className="text-[#F5C518] mr-1.5">{tip.stepLabel}</span>
            )}
            <span className="font-semibold text-foreground">{tip.title}</span>
          </p>
          <p
            className={cn(
              "text-xs text-muted-foreground mt-0.5",
              // The Plans screen is the tightest on a phone: one line there.
              screen === "plans" && "hidden md:block"
            )}
          >
            {tip.body}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {tip.action && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => onGo(tip.action!.place)}
            >
              {tip.action.label}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs px-2"
            onClick={onOpenHelp}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Where do I…?
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-muted-foreground hidden sm:inline-flex"
            onClick={turnOff}
            title="Turn the guide off — Settings › Display turns it back on"
          >
            Turn off guide
          </Button>
          <button
            type="button"
            onClick={close}
            aria-label="Close this tip"
            title="Close this tip — the next step's tip still shows"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
