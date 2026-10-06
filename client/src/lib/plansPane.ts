/**
 * What the Plans screen's main pane shows while its list of plan sets loads.
 *
 * ── A failed load must never read as "no plans" ─────────────────────────────
 * The pane used to choose between a skeleton, "Drop plan PDFs here" and the
 * plans, from `isLoading` and the list. A list that FAILED came back as the
 * default empty array, so it drew the upload box — telling an estimator with
 * a full set of drawings that the bid had none. Found 2026-10-06 while
 * chasing smoke flow 9's blank reload (@/lib/queryDeadline): once a stalled
 * read is given up on, an error is a state this pane really reaches.
 *
 * Plans already on screen stay on screen if a later refresh fails: what was
 * shown is still the best answer, and swapping it for an error would be the
 * same fault from the other side.
 */
export type PlansPane = "loading" | "failed" | "empty" | "plans";

export function plansPane(list: {
  isLoading: boolean;
  isError: boolean;
  count: number;
}): PlansPane {
  if (list.count > 0) return "plans";
  if (list.isError) return "failed";
  if (list.isLoading) return "loading";
  return "empty";
}
