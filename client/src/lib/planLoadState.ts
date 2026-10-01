/**
 * What the plan viewer shows while a plan set opens (Track B plan, Part 4 § 1).
 *
 * ── The white square this replaced ──────────────────────────────────────────
 * The viewer dropped its "Opening…" panel the moment the worker said the FILE
 * had loaded, before any sheet was drawn. The canvas underneath had no size
 * yet, so the browser gave it the default 300x150, white with a shadow, at the
 * top-left of the pane. That was the square, and it stayed until the first
 * render came back. So "opening" now lasts until a sheet is drawn, and says
 * which step it is on; range loading has no honest byte total, so it is words
 * and not a percentage.
 */

export type PlanLoadState =
  | { show: "opening"; message: string }
  | { show: "drawing"; message: string }
  | { show: "sheet" };

export function planLoadState(input: {
  /** The worker has not finished opening the file. */
  documentLoading: boolean;
  /** A raster of the sheet has reached the canvas (its size is known). */
  drawn: boolean;
  page: number;
}): PlanLoadState {
  if (input.documentLoading)
    return { show: "opening", message: "Opening plan set…" };
  if (!input.drawn)
    return { show: "drawing", message: `Drawing sheet ${input.page}…` };
  return { show: "sheet" };
}
