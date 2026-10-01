/**
 * Does a right-click here belong to the browser, not the plan viewer?
 *
 * The viewer suppresses the context menu over its whole viewport and starts a
 * pan on a right-drag (TakeoffPage, the viewport's pointerdown/contextmenu
 * listeners). That is right for the drawing and wrong for a text box sitting
 * on top of it: the "Name this symbol" box and the "Capture whole legend"
 * name boxes live in the viewer's screen layer, INSIDE the viewport, so a
 * right-click on them reached the viewer, the menu never opened, and the
 * browser's spelling suggestions — which only appear in that menu — were
 * unreachable. Found 2026-09-30; measured by dispatching a contextmenu event
 * at each box (defaultPrevented: true on both).
 *
 * Anything you type into keeps the browser's menu: cut, copy, paste and the
 * spelling fixes. Everything else in the viewport is still the drawing's.
 */

/** Elements a person types into. */
export const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** The slice of an event target this reads; a DOM Element satisfies it. */
type MaybeElement = { closest?: (selector: string) => unknown } | null;

export function wantsNativeMenu(target: unknown): boolean {
  const element = target as MaybeElement;
  return Boolean(
    element &&
      typeof element.closest === "function" &&
      element.closest(EDITABLE_SELECTOR)
  );
}
