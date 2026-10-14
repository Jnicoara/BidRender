/**
 * TAP A NOTE TAG, READ THE NOTE — step 5c of
 * references/plan-reading-help-plan.md § 7 (rules in § 6). No AI, nothing
 * saved: the tags and notes are what @/lib/keyedNotes already read off the
 * sheet when it opened.
 *
 * The decisions, kept here because vitest can reach this file and cannot
 * reach a React component:
 *
 * - THE TARGET IS AT LEAST 32 SCREEN PX ACROSS (§ 6). The tag layer sits
 *   inside the zoom transform, so a 13.5 pt tag is about 3 px at 19% zoom. A
 *   radius in page points would shrink with the drawing; this one is worked
 *   out back from the screen, so a finger finds the tag at any zoom.
 * - WHICH NOTE: the first KEYED list on the sheet with that number. General
 *   notes are never what a tag points at (keyedNotes.ts).
 * - WHERE THE CARD GOES: beside the tag, inside the drawing's box, never on
 *   the tag itself and never over a toolbar or the side panel (CLAUDE.md, and
 *   the tips' lesson of 2026-10-14 — a card over a control is a control
 *   nobody can use).
 * - TAPS ARE ON unless turned off under More options. They draw nothing, so
 *   they add no clutter; the RINGS that would are a separate switch, off.
 */
import type {
  NoteList,
  NoteTag,
  SheetNote,
  SheetNotesRead,
} from "./keyedNotes";
import type { Rect } from "./planTips";

/** A tag's target is never smaller than this on screen, at any zoom. */
export const TAG_TAP_MIN_SCREEN_PX = 32;

/** Page points between the tag's own shape and its edge — the ring's gap. */
export const TAG_RING_GAP = 2.5;

/**
 * The target's radius in OVERLAY pixels (what the SVG inside the transform
 * draws in): the tag's own shape plus its ring gap, or half of
 * TAG_TAP_MIN_SCREEN_PX on screen, whichever is bigger.
 */
export function tagTapRadius(
  tag: Pick<NoteTag, "r">,
  renderScale: number,
  zoom: number
): number {
  const own = (tag.r + TAG_RING_GAP) * renderScale;
  const least = TAG_TAP_MIN_SCREEN_PX / 2 / Math.max(zoom, 1e-6);
  return Math.max(own, least);
}

/**
 * Which tag a tap meant, page points. Zoomed out, the 32 px targets of two
 * tags a few feet apart overlap, and the browser would give the tap to
 * whichever circle was drawn last — so a finger nearer note 4 could open
 * note 9. The nearest centre wins instead.
 */
export function nearestTag(
  tags: readonly Pick<NoteTag, "x" | "y">[],
  at: { x: number; y: number }
): number {
  let best = -1;
  let bestD = Infinity;
  tags.forEach((t, i) => {
    const d = Math.hypot(t.x - at.x, t.y - at.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** The note a tag points at: the first keyed list holding its number. */
export function noteForTag(
  read: Pick<SheetNotesRead, "lists">,
  label: string
): { list: NoteList; note: SheetNote } | null {
  for (const list of read.lists) {
    if (!list.keyed) continue;
    const note = list.notes.find(n => n.label === label);
    if (note) return { list, note };
  }
  return null;
}

// ── The switch (More options) ───────────────────────────────────────────────

export const NOTE_TAPS_KEY = "bidrender.plans.noteTagTaps";

/** ON unless somebody turned it off — only "off" is ever stored. */
export function noteTapsOn(raw: string | null | undefined): boolean {
  return raw !== "off";
}

/** Whether a tap on the drawing may open a note right now. */
export function noteTapsLive(state: {
  tapsOn: boolean;
  /** Any tool picked up: count, trace, capture, Copy text… (§ 6). */
  toolInHand: boolean;
  read: Pick<SheetNotesRead, "tags"> | null;
}): boolean {
  return (
    state.tapsOn &&
    !state.toolInHand &&
    state.read !== null &&
    state.read.tags.length > 0
  );
}

// ── Where the card goes ─────────────────────────────────────────────────────

function overlaps(
  a: { left: number; top: number; width: number; height: number },
  b: Rect
): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/**
 * Window pixels for the card's top-left. Below, above, right and left of the
 * tag, each slid into the drawing's box; the first that keeps the tag
 * uncovered wins, then the box's corners, farthest from the tag first. Only
 * when the drawing cannot hold the card does it use the window.
 */
export function placeNoteCard(
  tag: Rect,
  card: { width: number; height: number },
  window: { width: number; height: number },
  drawing: Rect | null,
  gap = 8
): { left: number; top: number } {
  const box =
    drawing &&
    drawing.width - 2 * gap >= card.width &&
    drawing.height - 2 * gap >= card.height
      ? {
          left: Math.max(0, drawing.left) + gap,
          top: Math.max(0, drawing.top) + gap,
          right: Math.min(window.width, drawing.left + drawing.width) - gap,
          bottom: Math.min(window.height, drawing.top + drawing.height) - gap,
        }
      : {
          left: gap,
          top: gap,
          right: window.width - gap,
          bottom: window.height - gap,
        };
  const into = (s: { left: number; top: number }) => ({
    left: Math.max(box.left, Math.min(s.left, box.right - card.width)),
    top: Math.max(box.top, Math.min(s.top, box.bottom - card.height)),
  });
  const midX = tag.left + tag.width / 2 - card.width / 2;
  const midY = tag.top + tag.height / 2 - card.height / 2;
  const sides = [
    { left: midX, top: tag.top + tag.height + gap },
    { left: midX, top: tag.top - card.height - gap },
    { left: tag.left + tag.width + gap, top: midY },
    { left: tag.left - card.width - gap, top: midY },
  ].map(into);
  const ax = tag.left + tag.width / 2;
  const ay = tag.top + tag.height / 2;
  const corners = [
    { left: box.left, top: box.top },
    { left: box.right - card.width, top: box.top },
    { left: box.left, top: box.bottom - card.height },
    { left: box.right - card.width, top: box.bottom - card.height },
  ]
    .map(into)
    .sort(
      (a, b) =>
        Math.hypot(b.left + card.width / 2 - ax, b.top + card.height / 2 - ay) -
        Math.hypot(a.left + card.width / 2 - ax, a.top + card.height / 2 - ay)
    );
  const clear = (s: { left: number; top: number }) =>
    !overlaps({ ...s, ...card }, tag);
  return [...sides, ...corners].find(clear) ?? corners[0];
}
