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

/**
 * Whether the marks may be drawn over the canvas — only when the canvas holds
 * THIS sheet (Track B, 2026-10-01).
 *
 * ── The pins that floated on the wrong page ─────────────────────────────────
 * The overlay used to wait only for the canvas to have a size. After the first
 * sheet it always has one, so on a sheet change the new sheet's marks arrived
 * (~0.5 s, measured on the Blueridge set) while the canvas still held the
 * PREVIOUS sheet's raster (replaced at ~1.2 s). Sheet 1 of that set is a
 * notes sheet, mostly white, so the pins hung on a blank page — and a click
 * in that window would have placed a mark on this sheet by looking at the
 * last one. The canvas now records which page it holds, and the marks wait
 * for it.
 */
export function marksMayShow(input: {
  /** The page whose raster is on the canvas now, or null before the first. */
  drawnPage: number | null;
  page: number;
}): boolean {
  return input.drawnPage !== null && input.drawnPage === input.page;
}

/**
 * A sheet is being drawn while the previous one is still on screen — the
 * moment the thin bar at the top of the viewer is for. The first sheet has
 * the full "Drawing sheet N…" panel instead, so this is false until then.
 */
export function drawingNextSheet(input: {
  drawnPage: number | null;
  page: number;
}): boolean {
  return input.drawnPage !== null && input.drawnPage !== input.page;
}
