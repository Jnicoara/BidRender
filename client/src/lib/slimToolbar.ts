/**
 * "Slim toolbar" on the Plans screen (owner, overnight 2026-10-17 item 4:
 * "collapse the upper toolbar for more drawing room"). Per person, in this
 * browser — a view convenience, never shared state (CLAUDE.md § Browser
 * storage), and every read and write survives storage being refused.
 *
 * What slim does, all of it: the bid header (name, step bar, Materials
 * list, Export, Add PDF) goes, as in Focus mode; the tool buttons show
 * their icons only (their names stay for screen readers, tooltips and
 * tests); the scale chip takes its short form. The drop-heights warning
 * stays as it is — a warning about a number must not get quieter.
 */
export const SLIM_TOOLBAR_KEY = "bidrender.takeoff.slimToolbar";

export function readSlimToolbar(
  storage: Pick<Storage, "getItem"> | undefined
): boolean {
  try {
    return storage?.getItem(SLIM_TOOLBAR_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSlimToolbar(
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined,
  slim: boolean
): void {
  try {
    if (slim) storage?.setItem(SLIM_TOOLBAR_KEY, "1");
    else storage?.removeItem(SLIM_TOOLBAR_KEY);
  } catch {
    // Private browsing: it simply does not stick.
  }
}
