/**
 * One Find all matching session on one sheet: what is on offer, what has been
 * decided. Pure, so the rules that decide what a click CONFIRMS can be
 * tested; the screen (components/takeoff/FindMatching.tsx) only draws them.
 *
 * Every match starts UNCONFIRMED, and an unconfirmed match is never stored
 * anywhere: not a mark, not a row, not browser storage. It counts on nothing
 * — not the answer key, not a bid — until it is confirmed, and confirming
 * places an ordinary mark through the same queue a click uses.
 *
 * "Confirm all" confirms only the CLEAR ones: no flag, not already counted.
 * A copy the matcher was unsure of is confirmed one at a time or not at all;
 * a button that swept those in would make every flag decorative. And on a
 * scan, a copy the AI made clear goes in only through the review grid
 * (`confirmAllNeedsReview`, owner N1 2026-10-16).
 */
import type { Match } from "./findMatching";
import { SCAN_UNREAD_REASON } from "./scanMatching";

export type MatchState =
  | "open"
  | "confirmed"
  | "confirmedExisting"
  | "rejected";

export type MatchItem = Match & {
  id: number;
  state: MatchState;
  /** The name of a mark already on the sheet at this copy, if there is one. */
  alreadyCounted: string | null;
  /**
   * What the AI read beside this copy when asked (scans only, a button —
   * server/tieBreak.ts `scanFindsRequest`): null when not asked, "noAnswer"
   * when asked and nothing usable came back. A suggestion: it adds a
   * reason, never a decision.
   */
  ai: ScanFindAnswer | "noAnswer" | null;
  /**
   * The AI moved this SCAN find from flagged to clear: it answered "same"
   * and that took off the only reason it needed a look (the tag beside it
   * not being read). Owner, N1, 2026-10-16: such a find never goes in by
   * "Confirm all" without the review grid first (`confirmAllNeedsReview`).
   */
  aiCleared: boolean;
  /**
   * The untrusted looks that alone found it (`newLooksOf`); empty for an
   * ordinary find. Non-empty means it needs a look.
   */
  newLooks: number[];
};

/** The AI's answers for a scan find (server/tieBreak.ts). */
export type ScanFindAnswer = "same" | "otherLabel" | "existing" | "notThis";

export type PlacedMark = { x: number; y: number; name: string };

/**
 * Build the session's items. A copy that already has a mark on it (any
 * count) is offered as already counted, not as a new one — confirming it
 * again would count one device twice.
 *
 * `trustedLooks` is REQUIRED, not optional, because forgetting it would
 * trust every look — the wrong-count risk it exists for. See `newLooksOf`.
 */
export function matchItems(
  matches: readonly Match[],
  marks: readonly PlacedMark[],
  trustedLooks: ReadonlySet<number>
): MatchItem[] {
  return matches.map((m, id) => {
    const reach = Math.max(4, Math.max(m.halfWidth, m.halfHeight));
    const on = marks.find(p => Math.hypot(p.x - m.x, p.y - m.y) <= reach);
    return {
      ...m,
      id,
      state: "open",
      alreadyCounted: on?.name ?? null,
      ai: null,
      aiCleared: false,
      newLooks: newLooksOf(m, trustedLooks),
    };
  });
}

/**
 * FROM A NEW LOOK (multiple-looks-plan.md § 4, § 8 test 7). A look added to
 * an item is not trusted until someone confirms one of its finds by hand: a
 * wrong look ("GFCI" drawn like a duplex here) would otherwise put every
 * duplex into Confirm all as a GFCI — a wrong count in one click.
 *
 * Trusted: the box drawn now, the item's first look, and any look already
 * confirmed once. A find that ONLY untrusted looks made returns those looks'
 * ids; it needs a look, and Confirm all leaves it. Any trusted source finding
 * it too makes it an ordinary find.
 */
export function newLooksOf(
  m: Pick<Match, "foundByBox" | "foundByLooks">,
  trustedLooks: ReadonlySet<number>
): number[] {
  const looks = m.foundByLooks ?? [];
  if (m.foundByBox !== false || looks.length === 0) return [];
  return looks.some(id => trustedLooks.has(id)) ? [] : looks;
}

export const NEW_LOOK_REASON =
  "Found only by a look added recently. Confirm one by hand to trust that look; until then Confirm all leaves its finds.";

/**
 * Someone confirmed a find by hand: the looks that alone made it are now
 * trusted, and every other find they made becomes an ordinary one. Returns
 * the looks newly trusted, for the caller to remember.
 */
export function trustLooks(
  items: readonly MatchItem[],
  confirmedIds: readonly number[]
): { items: MatchItem[]; trusted: number[] } {
  const ids = new Set(confirmedIds);
  const trusted = Array.from(
    new Set(items.filter(i => ids.has(i.id)).flatMap(i => i.newLooks))
  );
  if (trusted.length === 0) return { items: [...items], trusted };
  return {
    items: items.map(i =>
      i.newLooks.some(l => trusted.includes(l)) ? { ...i, newLooks: [] } : i
    ),
    trusted,
  };
}

export type ItemKind =
  | "clear"
  | "needsLook"
  | "maybeExisting"
  | "already"
  | "demolition";

/**
 * How a copy is drawn and offered. Needs-a-look wins over maybe-existing.
 * A copy on a DEMOLITION plan (a scan, @/lib/scanMatching) is its own kind,
 * whatever else is true of it: it is a device being taken out, so it is
 * never "clear" and "Confirm all" never counts it. "Count it" still can —
 * the estimator decides, not the title.
 */
export function itemKind(item: MatchItem): ItemKind {
  if (item.alreadyCounted) return "already";
  if (item.onDemolitionPlan) return "demolition";
  if (item.needsLook.length || item.newLooks.length) return "needsLook";
  if (item.maybeExisting.length) return "maybeExisting";
  return "clear";
}

/** The ones "Confirm all" takes: open, clear. */
export function clearOpen(items: readonly MatchItem[]): MatchItem[] {
  return items.filter(i => i.state === "open" && itemKind(i) === "clear");
}

/**
 * A saved look was removed while this session is open (multiple-looks-plan.md
 * § 7): every OPEN find that look helped make is dropped, never re-pointed to
 * another source — unless the box drawn on this sheet found it too, since
 * that find stands without the look. A decided item is left alone: a confirmed
 * one is already a mark, and a removed look never moves a mark.
 */
export function dropLookMatches(
  items: readonly MatchItem[],
  lookId: number
): { items: MatchItem[]; dropped: number } {
  const goes = (i: MatchItem) =>
    i.state === "open" &&
    !i.foundByBox &&
    (i.foundByLooks ?? []).includes(lookId);
  const kept = items.filter(i => !goes(i));
  return { items: kept, dropped: items.length - kept.length };
}

export function summary(items: readonly MatchItem[]) {
  const open = items.filter(i => i.state === "open");
  return {
    found: items.length,
    clear: open.filter(i => itemKind(i) === "clear").length,
    needsLook: open.filter(i => itemKind(i) === "needsLook").length,
    maybeExisting: open.filter(i => itemKind(i) === "maybeExisting").length,
    already: items.filter(i => itemKind(i) === "already").length,
    demolition: open.filter(i => itemKind(i) === "demolition").length,
    confirmed: items.filter(
      i => i.state === "confirmed" || i.state === "confirmedExisting"
    ).length,
    rejected: items.filter(i => i.state === "rejected").length,
  };
}

export function decide(
  items: readonly MatchItem[],
  ids: readonly number[],
  state: MatchState
): MatchItem[] {
  const set = new Set(ids);
  return items.map(i => (set.has(i.id) ? { ...i, state } : i));
}

/**
 * The next copy still waiting for a decision after `from`, flagged ones
 * first — they are the ones that need a person. Null when none are left.
 */
export function nextToLookAt(
  items: readonly MatchItem[],
  from: number | null
): MatchItem | null {
  const waiting = items.filter(
    i => i.state === "open" && itemKind(i) !== "already"
  );
  if (waiting.length === 0) return null;
  // Flagged first, then clear; demolition copies last — not counted unless
  // somebody chooses to, so they are the least likely to want a look.
  const rank = (i: MatchItem) =>
    ({ needsLook: 0, maybeExisting: 0, clear: 1, demolition: 2, already: 3 })[
      itemKind(i)
    ];
  const order = [...waiting].sort((p, q) => rank(p) - rank(q));
  const at = order.findIndex(i => i.id === from);
  return order[(at + 1) % order.length] ?? null;
}

/** The AI's batch limit (server/tieBreak.ts TIE_BREAK_MAX_CROPS). */
export const AI_BATCH = 12;

/**
 * The copies to send with the next press of "Ask AI": open, not already
 * counted, not asked before; flagged ones first, demolition ones last. One
 * batch per press, so a press costs at most one small call.
 */
export function aiBatch(items: readonly MatchItem[]): MatchItem[] {
  const waiting = items.filter(
    i => i.state === "open" && itemKind(i) !== "already" && i.ai === null
  );
  const rank = (i: MatchItem) =>
    ({ needsLook: 0, maybeExisting: 0, clear: 1, demolition: 2, already: 3 })[
      itemKind(i)
    ];
  return [...waiting].sort((p, q) => rank(p) - rank(q)).slice(0, AI_BATCH);
}

export const AI_REASONS = {
  otherLabel: "The AI reads a different tag or label beside it.",
  existing: "The AI sees an E beside it, so it may be existing.",
  notThis: "The AI says this is not the same symbol.",
} as const;

/**
 * Put the AI's answers on the copies it was asked about. An answer that
 * disagrees with the boxed one becomes a reason, so the copy stops being
 * clear and "Confirm all" leaves it; "same" adds nothing. Nothing is
 * confirmed or set aside here: the person still decides every copy.
 */
export function applyAiAnswers(
  items: readonly MatchItem[],
  answers: ReadonlyMap<number, ScanFindAnswer | null>
): MatchItem[] {
  return items.map(i => {
    if (!answers.has(i.id)) return i;
    const a = answers.get(i.id) ?? null;
    if (a === null) return { ...i, ai: "noAnswer" };
    // Any answer means the words beside it HAVE been read.
    const read = i.needsLook.filter(r => r !== SCAN_UNREAD_REASON);
    if (a === "existing")
      return {
        ...i,
        ai: a,
        needsLook: read,
        maybeExisting: [...i.maybeExisting, AI_REASONS.existing],
      };
    if (a === "otherLabel" || a === "notThis")
      return { ...i, ai: a, needsLook: [...read, AI_REASONS[a]] };
    return {
      ...i,
      ai: a,
      needsLook: read,
      // "Same" took the unread flag off: if that was the only thing keeping
      // it out of Confirm all, it is the AI that made it clear.
      aiCleared:
        i.aiCleared ||
        (i.needsLook.includes(SCAN_UNREAD_REASON) && read.length === 0),
    };
  });
}

/**
 * THE REVIEW GRID (owner, N1, 2026-10-16). On a scan, when any find "Confirm
 * all" would take was made clear by the AI, the button first shows EVERY one
 * of them as a small picture side by side; the person taps away the
 * look-alikes, and one tap confirms the rest. Nothing the AI cleared is
 * counted until that review — it is the AI's word, and a wrong "same" on a
 * GFCI would otherwise count it as a duplex in one click.
 */
export function confirmAllNeedsReview(items: readonly MatchItem[]): boolean {
  return clearOpen(items).some(i => i.aiCleared);
}

/**
 * What the review's one tap does: of the finds that were SHOWN, the ones
 * still open and clear are confirmed unless dropped, and the dropped ones
 * are set aside. A find decided elsewhere while the grid was open is left
 * as it is, and nothing that was not shown is touched.
 */
export function reviewedDecisions(
  items: readonly MatchItem[],
  shownIds: readonly number[],
  droppedIds: ReadonlySet<number>
): { confirm: number[]; reject: number[] } {
  const stillClear = new Set(clearOpen(items).map(i => i.id));
  const shown = shownIds.filter(id => stillClear.has(id));
  return {
    confirm: shown.filter(id => !droppedIds.has(id)),
    reject: shown.filter(id => droppedIds.has(id)),
  };
}
