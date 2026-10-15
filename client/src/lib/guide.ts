/**
 * GUIDE MODE — which one tip a new user sees, and where.
 *
 * The owner's brief (2026-10-14): a new user is walked through upload plans
 * → set scale → count → run → review → print, with tips they can turn off,
 * a "Where do I…?" help search, staying on until they turn it off, under the
 * main flow and never covering working controls, in plain words an
 * electrician would use.
 *
 * ── What it is built from, so it cannot disagree with anything ───────────────
 * - The STEP is the step bar's own `next` (shared/bidSteps.ts). Guide and
 *   step bar read one rule, so the strip can never say "count" while the bar
 *   says "scale". It inherits that rule's decisions: guidance never a gate,
 *   a bid counted by hand is not behind, runs are optional.
 * - It is tracked from DATA (`bids.progress`), never from which screens were
 *   opened (CLAUDE.md § Onboarding), and it ticks nothing on the
 *   getting-started checklist.
 * - On the Plans screen it steps aside while one of Track B's first-open
 *   tips is ON SCREEN (plan-reading-help-plan.md § 5): two kinds of tip at
 *   once is noise, and B's are anchored to the very controls this one names.
 *   "On screen", not "all four seen": B shows a tip only when the sheet has
 *   what it points at, so on many sets some are never shown, and waiting
 *   for all four kept the guide silent on Plans for good (caught by looking,
 *   2026-10-14).
 *
 * Seen-state is a per-person convenience on this browser (like B's tips and
 * the step bar switch), so it can come back empty and everything still
 * renders. Pure and DOM-free, so `guide.test.ts` can reach it.
 */
import {
  bidSteps,
  STEP_PLACE,
  type BidProgress,
  type BidStep,
  type StepPlace,
} from "@shared/bidSteps";

/** The screen the strip is on. */
export type GuideScreen =
  | "dashboard"
  | "bid"
  | "plans"
  | "count"
  | "proposal"
  | "other";

/** Stored per person, per browser. */
export type GuideState = {
  /** The whole guide switched off (Settings › Display, or "Turn the guide off"). */
  off: boolean;
  /** Tip ids closed with ×. A closed tip stays closed; the next one shows. */
  hidden: string[];
};

export const GUIDE_DEFAULT: GuideState = { off: false, hidden: [] };

/** Anything unreadable is the default — never a crash, never "off". */
export function parseGuideState(raw: unknown): GuideState {
  if (!raw || typeof raw !== "object") return GUIDE_DEFAULT;
  const r = raw as Partial<GuideState>;
  return {
    off: r.off === true,
    hidden: Array.isArray(r.hidden)
      ? r.hidden.filter((h): h is string => typeof h === "string").slice(0, 50)
      : [],
  };
}

export type GuideTip = {
  /** Stable, so closing it is remembered. */
  id: string;
  /** "Step 2 of 6", or null for a tip that is not one of the six. */
  stepLabel: string | null;
  title: string;
  body: string;
  /** A button to the screen the step is done on, when that is not here. */
  action: { label: string; place: StepPlace } | null;
};

const STEP_NUMBER: Record<BidStep, number> = {
  plans: 1,
  scale: 2,
  count: 3,
  runs: 4,
  review: 5,
  print: 6,
};

/** Plain words, the way it is said on a job (owner: "an electrician's words"). */
const STEP_TEXT: Record<BidStep, { title: string; body: string }> = {
  plans: {
    title: "Get the drawings in",
    body: "Upload the PDF set and BidRidge splits it into sheets. No drawings? Tap Count on the bid and count it by hand instead.",
  },
  scale: {
    title: "Set the scale",
    body: "Open a sheet and pick its scale off the title block — like 1/8\" = 1'-0\". Without it, a run can't be measured in feet.",
  },
  count: {
    title: "Count the devices",
    body: "Pick a symbol off the legend — a duplex, a 2x4 troffer — then tap each one on the sheet. Every tap is one on the bid.",
  },
  runs: {
    title: "Trace the runs (if the job needs it)",
    body: "Draw a run from box to box and BidRidge adds the pipe, wire, fittings and labor. Skip it on a job where footage doesn't matter.",
  },
  review: {
    title: "Check the bid",
    body: "Go down the lines, the hours and the total. A line that says Not priced needs a price before this goes to a customer.",
  },
  print: {
    title: "Print it or send it",
    body: "Open the proposal, make sure it reads right, then print it or save a PDF for the customer.",
  },
};

const PLACE_WORD: Record<StepPlace, string> = {
  plans: "Open the plans",
  bid: "Open the bid",
  proposal: "Open the proposal",
};

const SCREEN_PLACE: Partial<Record<GuideScreen, StepPlace>> = {
  bid: "bid",
  plans: "plans",
  count: "bid",
  proposal: "proposal",
};

/**
 * The one tip to show, or null.
 *
 * `progress` is the open bid's (null off a bid screen, or still loading);
 * `hasBids` is whether the company has any bid yet; `planTipShowing`
 * whether one of Track B's first-open Plans tips is on screen now.
 */
export function guideTip(input: {
  screen: GuideScreen;
  progress: BidProgress | null;
  hasBids: boolean | null;
  state: GuideState;
  planTipShowing: boolean;
  /**
   * The step bar is on this screen with its own Next button (the bid page,
   * unless turned off in Settings › Display). Then the strip explains and
   * does not repeat the button an inch below it.
   */
  stepBarShown?: boolean;
}): GuideTip | null {
  const { screen, progress, hasBids, state } = input;
  if (state.off) return null;
  const visible = (tip: GuideTip | null) =>
    tip && !state.hidden.includes(tip.id) ? tip : null;

  if (screen === "dashboard") {
    // Only before the first bid: after that the getting-started checklist
    // and the bids themselves are the guide on this screen.
    if (hasBids !== false) return null;
    return visible({
      id: "start",
      stepLabel: null,
      title: "Start your first bid",
      body: "Upload a drawing set to count off the plans, or use Quick bid to count it out by hand — no drawings needed.",
      action: null,
    });
  }

  const here = SCREEN_PLACE[screen];
  if (!here || !progress) return null;
  if (screen === "plans" && input.planTipShowing) return null;

  const { next, states } = bidSteps(progress);

  // Counting is done and nothing is traced yet: on the Plans screen, say
  // runs are there if wanted, before moving on to the review.
  if (
    screen === "plans" &&
    next === "review" &&
    states.runs === "optional" &&
    !state.hidden.includes("step:runs")
  ) {
    return {
      id: "step:runs",
      stepLabel: `Step ${STEP_NUMBER.runs} of 6 · optional`,
      ...STEP_TEXT.runs,
      action: { label: PLACE_WORD.bid, place: "bid" },
    };
  }

  if (next === null) {
    return visible({
      id: "sent",
      stepLabel: null,
      title: "It's out",
      body: "When you hear back, mark the bid Won or Lost on the Dashboard — that's what the Performance numbers are built from.",
      action: null,
    });
  }

  const place = STEP_PLACE[next];
  const buttonAbove = input.stepBarShown === true && screen === "bid";
  return visible({
    id: `step:${next}`,
    stepLabel: `Step ${STEP_NUMBER[next]} of 6`,
    ...STEP_TEXT[next],
    action:
      place === here || buttonAbove
        ? null
        : { label: PLACE_WORD[place], place },
  });
}
