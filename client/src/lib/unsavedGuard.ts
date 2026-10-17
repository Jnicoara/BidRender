/**
 * "Discard changes?" before leaving an editor that holds unsaved work
 * (break-it, 2026-10-15 night — todo.md "Library editors drop a half-made
 * edit without asking").
 *
 * Back, or any link in the nav, threw away a half-built assembly or kit
 * with nothing said. The plan viewer already guarded its unsaved trace; the
 * library editors did not, and their own Back button discarded silently, so
 * losing the work read as a choice rather than a slip.
 *
 * One store for the whole app: an editor says whether it holds unsaved work
 * (`useUnsavedGuard`), the shell asks before following an address change,
 * and one dialog (`UnsavedChangesDialog`) asks the person. Kept here, free of
 * React and the browser, so the suite can reach it.
 */

const dirtyOwners = new Set<symbol>();
let pendingLeave: (() => void) | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(listener => listener());
}

/** An editor says whether it holds work nobody has saved. */
export function markUnsaved(owner: symbol, dirty: boolean): void {
  const had = dirtyOwners.has(owner);
  if (dirty) dirtyOwners.add(owner);
  else dirtyOwners.delete(owner);
  if (had !== dirty) notify();
}

export function hasUnsaved(): boolean {
  return dirtyOwners.size > 0;
}

/**
 * Leave now if nothing is unsaved (returns true); otherwise hold `leave`
 * until the person answers (returns false). A second request while one is
 * waiting replaces it — the last place asked for is where they meant to go.
 */
export function askToLeave(leave: () => void): boolean {
  if (!hasUnsaved()) {
    leave();
    return true;
  }
  pendingLeave = leave;
  notify();
  return false;
}

/** Whether the dialog should be open. */
export function isAskingToLeave(): boolean {
  return pendingLeave !== null;
}

/**
 * The person answered. Discard forgets every unsaved mark and then leaves;
 * keep editing drops the request and leaves nothing.
 */
export function answerLeave(discard: boolean): void {
  const leave = pendingLeave;
  pendingLeave = null;
  if (discard) dirtyOwners.clear();
  notify();
  if (discard && leave) leave();
}

export function subscribeUnsaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Two drafts hold the same thing to save. Compares a plain-data projection
 * the caller builds from what its Save would send, so a field the form
 * normalises on open (a role re-pointed at its fork) is not "a change".
 */
export function sameToSave(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
