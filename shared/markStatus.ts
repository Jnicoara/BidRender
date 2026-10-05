/**
 * A MARK'S STATUS — new, existing to remain, remove, relocate — and the one
 * rule about what it may cost (pin plan § 7; todo.md, "a STATUS on each mark";
 * column `takeoff_stamps.status`, migration 0098).
 *
 * ── THE HARD RULE: ONLY A NEW MARK IS A QUANTITY ────────────────────────────
 * A device drawn as existing to remain is already on the wall. Counting it
 * into a bid line, a supplier list or a drop's footage buys it a second time —
 * a wrong price on the one screen whose job is the price, with nothing on the
 * screen to say so. So every place a mark becomes a number asks THIS module,
 * through `isPricedMark` here or `pricedMarkWhere` in server/db.ts, which is
 * the same rule in SQL. `server/markStatusPricing.test.ts` holds both to it.
 *
 * ── Remove and relocate are NOT priced as new either — and not yet priced ──
 * A removal is demolition labour; a relocation is labour on a device that is
 * reused. Neither buys a new device, so neither may count as one. What each
 * DOES cost is the owner's decision (todo.md, the mark-status entry: "`remove`
 * wants its own demo labour line, owner to decide"), so until then they are
 * counted, shown in words on the count, and kept off every quantity — an
 * omission the card states ("2 remove — not on the bid"), never a silent one.
 *
 * NULL is `new`: every mark placed before the column existed is new, which is
 * what it was counted as all along, so nothing already on a bid moves.
 */

export const MARK_STATUSES = ["new", "existing", "remove", "relocate"] as const;
export type MarkStatus = (typeof MARK_STATUSES)[number];

export function isMarkStatus(value: unknown): value is MarkStatus {
  return (
    typeof value === "string" &&
    (MARK_STATUSES as readonly string[]).includes(value)
  );
}

/** What a stored value means. NULL, or anything unknown, is `new`. */
export function markStatusOf(value: string | null | undefined): MarkStatus {
  return isMarkStatus(value) ? value : "new";
}

/**
 * Whether this mark counts toward a quantity that is bought or priced.
 * ONLY `new`. See the header — this is the hard rule, in one line.
 */
export function isPricedMark(mark: { status?: string | null }): boolean {
  return markStatusOf(mark.status) === "new";
}

/** The estimator's words, for menus and the card. */
export const MARK_STATUS_LABEL: Record<MarkStatus, string> = {
  new: "New",
  existing: "Existing to remain",
  remove: "Remove",
  relocate: "Relocate",
};

/** Short words for the split on a count's card. */
const SPLIT_WORD: Record<MarkStatus, string> = {
  new: "new",
  existing: "existing",
  remove: "remove",
  relocate: "relocate",
};

export type StatusSplit = Record<MarkStatus, number>;

export function emptySplit(): StatusSplit {
  return { new: 0, existing: 0, remove: 0, relocate: 0 };
}

/** How many marks of each status. */
export function statusSplit(
  marks: readonly { status?: string | null }[]
): StatusSplit {
  const split = emptySplit();
  for (const m of marks) split[markStatusOf(m.status)] += 1;
  return split;
}

/**
 * The split in words — "12 new · 4 existing · 1 remove" — or null when every
 * mark is new, which is the ordinary case and needs no sentence. In words
 * because a pin's fill is invisible on a printout and to some eyes (§ 7).
 */
export function statusSplitText(split: StatusSplit): string | null {
  if (split.existing + split.remove + split.relocate === 0) return null;
  return MARK_STATUSES.filter(s => split[s] > 0)
    .map(s => `${split[s]} ${SPLIT_WORD[s]}`)
    .join(" · ");
}

/**
 * What the card says about the marks that are NOT on the bid, or null. The
 * omission is stated, never silent: an existing device is correctly free, but
 * a removal or relocation has labour nobody has priced yet.
 */
export function unpricedStatusNote(split: StatusSplit): string | null {
  const parts: string[] = [];
  // Short: it sits under a count's name in a narrow panel (three lines long
  // on the first screen check, 2026-10-05).
  if (split.existing > 0) parts.push(`${split.existing} existing — not priced`);
  const labour = split.remove + split.relocate;
  if (labour > 0)
    parts.push(
      `${labour} ${split.remove > 0 && split.relocate > 0 ? "remove/relocate" : split.remove > 0 ? "remove" : "relocate"} — labour not on the bid`
    );
  return parts.length > 0 ? parts.join(". ") : null;
}
