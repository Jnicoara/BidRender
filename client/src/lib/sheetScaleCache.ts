/**
 * Writing a sheet's scale state into the cached sheet list, straight from a
 * save — so the scale chip changes the moment the save does.
 *
 * ── The fault, 2026-09-25 ────────────────────────────────────────────────────
 * "Right after finishing a check, the scale still says not checked." The chip
 * read ONLY from the sheets query, and every scale mutation updated it by
 * invalidating that query and waiting for the refetch. So after a confirm
 * the chip kept saying "not checked" for a full second round trip; after a
 * re-set it kept saying checked for the same. Measured locally by holding the
 * refetch: the confirm had saved, and the chip said otherwise until the GET
 * landed. On a slow connection that is exactly "sometimes".
 *
 * These are pure so the suite can reach them (CLAUDE.md § a rule with no red
 * to go to). TakeoffPage calls them from the mutations, after CANCELLING any
 * in-flight sheets fetch — a GET that read the row before the save would
 * otherwise land after this write and put the old value back.
 */

/** The fields of a sheet row this module touches. */
export type ScaleSheetRow = {
  id: number;
  scaleCheckedAt?: Date | string | null;
};

/**
 * Replace one sheet in the list with the server's own copy of it.
 *
 * What a scale mutation RETURNS is the row as saved, so it is the truth, not
 * a guess — this is used on success, and it corrects the optimistic write
 * below if the two ever differ.
 */
export function withSavedSheet<T extends { id: number }>(
  list: readonly T[] | undefined,
  saved: T
): T[] | undefined {
  if (!list) return list;
  return list.map(sheet => (sheet.id === saved.id ? saved : sheet));
}

/**
 * Mark one sheet's scale checked, NOW, before the server answers.
 *
 * The optimistic half of a confirm. The server stamps its own time and that
 * replaces this on success (`withSavedSheet`); on failure the caller restores
 * the snapshot it took, so a failed confirm never shows as checked.
 */
export function withSheetChecked<T extends ScaleSheetRow>(
  list: readonly T[] | undefined,
  sheetId: number,
  at: Date
): T[] | undefined {
  if (!list) return list;
  return list.map(sheet =>
    sheet.id === sheetId ? { ...sheet, scaleCheckedAt: at } : sheet
  );
}
