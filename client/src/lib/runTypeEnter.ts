/**
 * WHAT ENTER DOES IN THE RUN-TYPE SEARCH (audit #16, 2026-10-06).
 *
 * Enter used to arm the TOP fuzzy match, so a typo ("1/2 emt pvc", "3/4 mc")
 * armed some other type with nothing saying so, and every run traced after
 * it bought that type's pipe and wire. The decided fix
 * (references/track-b-deletes-summary-pan-plan.md § 4, #16): Enter picks a
 * type only when the typed text IS its name; otherwise it makes a new type
 * by that name, which the person can see and undo. A click on a listed
 * result still picks it, fuzzy or not — a click is a choice, Enter on a
 * half-typed word is not.
 *
 * Pure, so the suite reaches it: the component cannot be tested here.
 */
export type EnterAction<T> =
  | { kind: "pick"; type: T }
  | { kind: "create"; label: string }
  | { kind: "none" };

/** Case, spaces and inch/foot marks do not make two names different. */
export function sameRunTypeName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[”″]/g, '"')
      .replace(/[’′]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  return norm(a) === norm(b);
}

export function runTypeEnterAction<T extends { label: string }>(
  query: string,
  results: readonly T[]
): EnterAction<T> {
  const typed = query.trim();
  // Nothing typed: Enter does nothing — it is not a choice of the top row.
  if (!typed) return { kind: "none" };
  const exact = results.find(t => sameRunTypeName(t.label, typed));
  if (exact) return { kind: "pick", type: exact };
  return { kind: "create", label: typed };
}
