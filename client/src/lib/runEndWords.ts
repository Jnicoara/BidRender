/**
 * What one run end SAYS beside it in the Run ends list, and whether it warns.
 *
 * Kept out of the component so the rule has a test. Until 2026-10-07 the list
 * warned on every end that counted no drop and called each one "no height for
 * this type" — true of one reason out of four. An end LEVEL with the run is an
 * answer, not a gap, and a box-to-box run (0131) makes both its ends level on
 * purpose: warning there tells the estimator something is missing when the
 * run says exactly what it means.
 */
import { DISTRIBUTION_KIND, type EndVertical } from "@shared/takeoffHeights";

export type EndWords = { text: string; warn: boolean };

export function runEndWords(input: {
  /** Null when the server has not worked the verticals out (no scale). */
  vertical: EndVertical | null;
  kind: string | null;
  onTee: boolean;
  runsAt: "ceiling" | "boxToBox";
}): EndWords | null {
  const { vertical, kind, onTee, runsAt } = input;
  if (onTee) return { text: "branch tee — no drop", warn: false };
  // Counted ends say their drop; the caller words those with the feet.
  if (vertical?.counted) return null;
  if (kind === null)
    return { text: "nothing there — no drop counted", warn: true };
  if (kind === DISTRIBUTION_KIND) return { text: "no drop here", warn: false };
  if (vertical === null)
    return { text: "no height for this type — no drop counted", warn: true };
  switch (vertical.reason) {
    case "level":
      return runsAt === "boxToBox"
        ? { text: "box to box — no drop", warn: false }
        : { text: "level with the run — no drop", warn: false };
    case "no-distribution-height":
      return {
        text: "no run height for this job — no drop counted",
        warn: true,
      };
    case "height-not-set":
      return { text: "no height for this type — no drop counted", warn: true };
    case "no-kind":
      return { text: "nothing there — no drop counted", warn: true };
  }
}
