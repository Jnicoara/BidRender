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

  const ask = {
    screen,
    progress: bidId !== null ? (progress.data ?? null) : null,
    hasBids: bids.data
      ? bids.data.some(b => !(b as { isSample?: boolean }).isSample)
      : null,
    state,
    planTipShowing,
    stepBarShown,
    canEdit,
  };
  const shown = guideTip(ask);
  /*
    On Plans, giving way to a tip card keeps the strip's ROOM: the tip it
    would show is drawn invisible in the same place. Taking the row away and
    putting it back re-fitted the drawing twice, 51 px each way, while marks
    were being placed (measured 2026-10-16) — see `steady` below.
  */
  const held =
    !shown && screen === "plans" && planTipShowing
      ? guideTip({ ...ask, planTipShowing: false })
      : null;
  const tip = shown ?? held;
  if (!tip) return null;

  const close = () => setState({ ...state, hidden: [...state.hidden, tip.id] });
  const turnOff = () => setState({ ...state, off: true });
  /*
    On the Plans screen the strip is ONE HEIGHT whatever the tip says: one
    line on a phone, a title line and a body line wider up, each cut short
    rather than wrapped. It sits under the drawing, so any change in its
    height re-centres the sheet — and it changed every time the step moved
    on (the first mark takes "Count" to "Runs", whose tip has a button that
    wrapped to a second row), so the drawing jumped between aiming a tap and
    making it. Taps landed off their symbols; found by B's phone smoke on
    local-dev's Gate, 2026-10-16 ("select two marks", "reload"). The whole
    tip is in the title attribute.
  */
  const steady = screen === "plans";

  return (
    <aside
      aria-label={held ? undefined : "Guide"}
      aria-hidden={held ? true : undefined}
      inert={held ? true : undefined}
      className={cn(
        "shrink-0 border-t border-border bg-sidebar px-3 md:px-6 py-2",
        held && "[&>*]:invisible"
      )}
    >
      <div
        className={cn(
          "flex items-start gap-x-3 gap-y-1.5 max-w-5xl",
          steady ? "flex-nowrap items-center" : "flex-wrap"
        )}
        title={steady ? `${tip.title}. ${tip.body}` : undefined}
      >
        <Compass
          className="w-4 h-4 mt-0.5 shrink-0 text-[#F5C518]"
          aria-hidden
        />
        <div className={cn("flex-1", steady ? "min-w-0" : "min-w-[12rem]")}>
          <p className={cn("text-xs", steady && "truncate")}>
            {tip.stepLabel && (
              <span className="text-[#F5C518] mr-1.5">{tip.stepLabel}</span>
            )}
            <span className="font-semibold text-foreground">{tip.title}</span>
          </p>
          <p
            className={cn(
              "text-xs text-muted-foreground mt-0.5",
              // The Plans screen is the tightest on a phone: one line there.
              steady && "hidden md:block truncate",
              // A short screen (a phone turned sideways, 375 px tall): one
              // line everywhere — the body took a fifth of the height and
              // left the drawing a sliver (rotate drill, 2026-10-14).
              "[@media(max-height:500px)]:hidden"
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
