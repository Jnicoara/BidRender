/**
 * How long "Name this symbol" (a boxed legend symbol waiting for its name)
 * stays up: until it is saved or cancelled, OR until the person has plainly
 * moved on — picked up another tool, or gone to another sheet. One tool at a
 * time (CLAUDE.md, the Plans screen's own rule).
 *
 * Found on a tablet, 2026-10-15 (`pnpm device:touch`): the form outlived a
 * sheet change and a Trace, still showing the symbol boxed on the sheet
 * before, and sat on top of the trace bar's Finish button, so the run could
 * not be finished by finger until the form was found and cancelled.
 */
export function captureOutlived(
  capture: { sheetId: number | undefined } | null,
  now: { tracing: boolean; countArmed: boolean; sheetId: number | undefined }
): boolean {
  if (!capture) return false;
  if (now.tracing || now.countArmed) return true;
  return capture.sheetId !== undefined && capture.sheetId !== now.sheetId;
}
