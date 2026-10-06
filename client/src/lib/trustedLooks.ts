/**
 * Which ADDED looks someone has confirmed a find from (@/lib/findMatchingSession,
 * `newLooksOf`). Kept in this browser, because `symbol_looks` has no column
 * for it yet — `symbol_looks.confirmedAt` is requested from Track A in
 * references/track-c-handoff.md.
 *
 * That makes the failure direction the safe one, and it has to stay that way:
 * a browser that has not seen the confirmation (another colleague, a cleared
 * cache, a private window, storage that throws) treats the look as NEW, so
 * its finds need a look and Confirm all leaves them. Nothing here can make a
 * look trusted that was not confirmed.
 */
const KEY = "bidridge:trusted-looks";

export function readTrustedLooks(storage: Pick<Storage, "getItem"> | null) {
  try {
    const raw = storage?.getItem(KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(ids)
        ? ids.filter((id): id is number => Number.isInteger(id) && id > 0)
        : []
    );
  } catch {
    return new Set<number>();
  }
}

export function rememberTrustedLooks(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  lookIds: readonly number[]
) {
  if (lookIds.length === 0) return;
  try {
    const ids = readTrustedLooks(storage);
    for (const id of lookIds) ids.add(id);
    storage?.setItem(KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* not remembered: the look stays new here, which is the safe side */
  }
}

/** The page's storage, or null where touching it throws. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
