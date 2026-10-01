/**
 * Which keys may press a confirm dialog's ACTION button.
 *
 * references/track-b-deletes-summary-pan-plan.md § 1.1: on a confirm that
 * loses something, "Enter does not confirm". Radix already focuses Cancel
 * when the dialog opens, so a bare Enter presses Cancel — but that only holds
 * while focus stays there. Tab-then-Enter is a habit, and on a delete it is
 * the habit that removes a run nobody meant to lose. So the action button
 * swallows Enter itself; Space and a click still confirm, which are both
 * deliberate.
 *
 * Here rather than in the component so a test can go red on it: vitest
 * reaches client/src/lib and not a React component.
 */
export function actionKeyAllowed(key: string): boolean {
  return key !== "Enter";
}
