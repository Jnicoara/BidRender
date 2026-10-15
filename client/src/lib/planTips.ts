/**
 * TIPS THE FIRST TIME THE PLANS SCREEN OPENS
 * (references/plan-reading-help-plan.md § 5; step 4 of § 7).
 *
 * Four tips, one at a time, each pointing at the control it is about. The
 * rules live here rather than in the component because the suite can reach
 * `client/src/lib` and not a React component (CLAUDE.md § "A rule with no red
 * to go to is an instruction"):
 *
 * - `nextTip` — which tip, if any, comes next on this sheet. A tip whose
 *   control is not on screen is SKIPPED, not marked seen: no notes sheet in
 *   this set, a sheet-kind line that is hidden or says nothing here, nothing
 *   tappable on the drawing. It can still show on a later sheet or bid.
 * - `placeTip` — where the card goes: as near its control as it can get while
 *   staying inside the drawing's box — never over the toolbars or the side
 *   panel — and never over the middle of the drawing (§ 5: a tip over what
 *   the person is about to tap has cost them a tap).
 *
 * Seen-state is per person, in this browser — a convenience, so browser
 * storage (CLAUDE.md § Browser storage); a blocked store just shows the tips
 * again. Tips tick nothing on the getting-started checklist (CLAUDE.md
 * § Onboarding): they say nothing about what the person has set up.
 */

export const PLAN_TIP_IDS = [
  "notesSheet",
  "sheetKind",
  "drawingTaps",
  "lookUp",
] as const;
export type PlanTipId = (typeof PLAN_TIP_IDS)[number];

export const PLAN_TIPS_KEY = "bidrender.plans.tipsSeen";

/** What is stored: the tips already shown, and "No more tips". */
export type TipsSeen = { seen: PlanTipId[]; off: boolean };

export const NO_TIPS_SEEN: TipsSeen = { seen: [], off: false };

/**
 * Anything unreadable — nothing stored, a hand-edited value, a later build's
 * shape — reads as nothing seen. The cost of being wrong that way is four
 * tips shown once more; the other way, they never show.
 */
export function parseTipsSeen(raw: string | null | undefined): TipsSeen {
  if (!raw) return NO_TIPS_SEEN;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return NO_TIPS_SEEN;
    const { seen, off } = value as { seen?: unknown; off?: unknown };
    return {
      seen: Array.isArray(seen)
        ? PLAN_TIP_IDS.filter(id => seen.includes(id))
        : [],
      off: off === true,
    };
  } catch {
    return NO_TIPS_SEEN;
  }
}

/** What is on this sheet for a tip to point at. */
export type TipSheetState = {
  /** The set has a sheet `sheetKinds` calls notes and legend. */
  hasNotesSheet: boolean;
  /** The sheet-kind line is on screen for THIS sheet. */
  sheetKindShown: boolean;
  /** A keyed-note tag or detail link was found on this sheet (§ 6). */
  tappable: boolean;
};

export function nextTip(
  seen: TipsSeen,
  sheet: TipSheetState
): PlanTipId | null {
  if (seen.off) return null;
  const onScreen: Record<PlanTipId, boolean> = {
    notesSheet: sheet.hasNotesSheet,
    sheetKind: sheet.sheetKindShown,
    drawingTaps: sheet.tappable,
    lookUp: true,
  };
  return (
    PLAN_TIP_IDS.find(id => !seen.seen.includes(id) && onScreen[id]) ?? null
  );
}

/** "Next", or the card's close: this one is seen, the rest still come. */
export function markTipSeen(seen: TipsSeen, id: PlanTipId): TipsSeen {
  return seen.seen.includes(id) ? seen : { ...seen, seen: [...seen.seen, id] };
}

/** "No more tips". */
export function turnTipsOff(seen: TipsSeen): TipsSeen {
  return { ...seen, off: true };
}

/** More options' "Show tips again". */
export function showTipsAgain(): TipsSeen {
  return NO_TIPS_SEEN;
}

/** The tip text. Plain words; one sentence that says what to do. */
export function tipText(
  id: PlanTipId,
  notesSheetLabel: string | null
): { title: string; body: string } {
  switch (id) {
    case "notesSheet":
      return {
        title: "Start with the notes sheet",
        body: `${notesSheetLabel ? `${notesSheetLabel} has` : "This set has"} the general notes and legend. Read it first — a note there can change what you count on every other sheet.`,
      };
    case "sheetKind":
      return {
        title: "What is this sheet?",
        body: "This line says what kind of sheet you are on. Tap it for what to count here.",
      };
    case "drawingTaps":
      return {
        title: "Tap the drawing to read it",
        body: "Tap a boxed note number to read the note, or a detail reference like 2/E004 to go to it. Put any tool down first.",
      };
    case "lookUp":
      return {
        title: "Don't know a word?",
        body: "Look it up in the Legend tab — WP, AFF, HR, or a symbol's name. This set's own legend answers first.",
      };
  }
}

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where the card goes, in window pixels.
 *
 * FIRST CHOICE: inside the drawing's own box, clear of its middle. Outside
 * that box are the toolbars and the side panel, which are nothing but
 * controls — and a card over a control is a control that cannot be used
 * until the tip is dismissed. That is not hypothetical: until 2026-10-14
 * this took the first spot inside the WINDOW, so "Don't know a word?" sat
 * under the Legend tab, on top of Capture and the legend's own rows, and
 * smoke run 38595716662 timed out clicking both (desktop and a sideways
 * tablet). The drawing is the one place where covering an edge costs
 * nothing that a pan cannot get back.
 *
 * So each of below, above, left of and right of the control is slid into the
 * drawing's box, then the drawing's own corners are tried, nearest the
 * control first; the first that fits and keeps the middle clear wins.
 *
 * Only when the drawing is too small to hold the card (or is not known) does
 * it fall back to the window: the first side spot inside the window that
 * keeps the middle clear, then the window's corners, then bottom-left.
 */
export function placeTip(
  anchor: Rect,
  card: { width: number; height: number },
  window: { width: number; height: number },
  drawing: Rect | null,
  gap = 8
): { left: number; top: number } {
  const centre = drawing
    ? {
        x: drawing.left + drawing.width / 2,
        y: drawing.top + drawing.height / 2,
      }
    : null;
  const midX = anchor.left + anchor.width / 2 - card.width / 2;
  const midY = anchor.top + anchor.height / 2 - card.height / 2;
  const clampX = (x: number) =>
    Math.max(gap, Math.min(x, window.width - card.width - gap));
  const clampY = (y: number) =>
    Math.max(gap, Math.min(y, window.height - card.height - gap));
  const spots = [
    { left: clampX(midX), top: anchor.top + anchor.height + gap },
    { left: clampX(midX), top: anchor.top - card.height - gap },
    { left: anchor.left - card.width - gap, top: clampY(midY) },
    { left: anchor.left + anchor.width + gap, top: clampY(midY) },
  ];
  const fits = (s: { left: number; top: number }) =>
    s.left >= 0 &&
    s.top >= 0 &&
    s.left + card.width <= window.width &&
    s.top + card.height <= window.height;
  const coversCentre = (s: { left: number; top: number }) =>
    centre !== null &&
    centre.x >= s.left &&
    centre.x <= s.left + card.width &&
    centre.y >= s.top &&
    centre.y <= s.top + card.height;
  const right = Math.max(gap, window.width - card.width - gap);
  const bottom = Math.max(gap, window.height - card.height - gap);
  const corners = [
    { left: gap, top: bottom },
    { left: right, top: bottom },
    { left: gap, top: gap },
    { left: right, top: gap },
  ];
  if (drawing) {
    const box = {
      left: Math.max(0, drawing.left) + gap,
      top: Math.max(0, drawing.top) + gap,
      right: Math.min(window.width, drawing.left + drawing.width) - gap,
      bottom: Math.min(window.height, drawing.top + drawing.height) - gap,
    };
    if (
      box.right - box.left >= card.width &&
      box.bottom - box.top >= card.height
    ) {
      const into = (s: { left: number; top: number }) => ({
        left: Math.max(box.left, Math.min(s.left, box.right - card.width)),
        top: Math.max(box.top, Math.min(s.top, box.bottom - card.height)),
      });
      const ax = anchor.left + anchor.width / 2;
      const ay = anchor.top + anchor.height / 2;
      const inner = [
        { left: box.left, top: box.top },
        { left: box.right - card.width, top: box.top },
        { left: box.left, top: box.bottom - card.height },
        { left: box.right - card.width, top: box.bottom - card.height },
      ].sort(
        (a, b) =>
          Math.hypot(
            a.left + card.width / 2 - ax,
            a.top + card.height / 2 - ay
          ) -
          Math.hypot(b.left + card.width / 2 - ax, b.top + card.height / 2 - ay)
      );
      const inside = [...spots.map(into), ...inner].find(s => !coversCentre(s));
      if (inside) return inside;
    }
  }
  return (
    spots.find(s => fits(s) && !coversCentre(s)) ??
    corners.find(s => !coversCentre(s)) ??
    corners[0]
  );
}
