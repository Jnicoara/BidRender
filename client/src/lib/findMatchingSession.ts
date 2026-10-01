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
 * a button that swept those in would make every flag decorative.
 */
import type { Match } from "./findMatching";

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
};

export type PlacedMark = { x: number; y: number; name: string };

/**
 * Build the session's items. A copy that already has a mark on it (any
 * count) is offered as already counted, not as a new one — confirming it
 * again would count one device twice.
 */
export function matchItems(
  matches: readonly Match[],
  marks: readonly PlacedMark[]
): MatchItem[] {
  return matches.map((m, id) => {
    const reach = Math.max(4, Math.max(m.halfWidth, m.halfHeight));
    const on = marks.find(p => Math.hypot(p.x - m.x, p.y - m.y) <= reach);
    return { ...m, id, state: "open", alreadyCounted: on?.name ?? null };
  });
}

export type ItemKind = "clear" | "needsLook" | "maybeExisting" | "already";

/** How a copy is drawn and offered. Needs-a-look wins over maybe-existing. */
export function itemKind(item: MatchItem): ItemKind {
  if (item.alreadyCounted) return "already";
  if (item.needsLook.length) return "needsLook";
  if (item.maybeExisting.length) return "maybeExisting";
  return "clear";
}

/** The ones "Confirm all" takes: open, clear. */
export function clearOpen(items: readonly MatchItem[]): MatchItem[] {
  return items.filter(i => i.state === "open" && itemKind(i) === "clear");
}

export function summary(items: readonly MatchItem[]) {
  const open = items.filter(i => i.state === "open");
  return {
    found: items.length,
    clear: open.filter(i => itemKind(i) === "clear").length,
    needsLook: open.filter(i => itemKind(i) === "needsLook").length,
    maybeExisting: open.filter(i => itemKind(i) === "maybeExisting").length,
    already: items.filter(i => itemKind(i) === "already").length,
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
  const order = [
    ...waiting.filter(i => itemKind(i) !== "clear"),
    ...waiting.filter(i => itemKind(i) === "clear"),
  ];
  const at = order.findIndex(i => i.id === from);
  return order[(at + 1) % order.length] ?? null;
}
