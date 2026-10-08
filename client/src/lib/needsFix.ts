/**
 * "Never stuck" (references/never-stuck-plan.md): a warning that names a
 * missing number is also the way to fill it in.
 *
 * A label like "Needs price" used to be a plain span whose explanation lived
 * in a hover-only `title` — so on a tablet it explained nothing, and with a
 * mouse it still sent the person hunting for the pencil. Now the label is a
 * button that opens the editor with the cursor already in the missing field,
 * and the explanation shows as visible text beside that field.
 *
 * The words live here, not in the pages, so the same sentence is used
 * wherever the label appears and the suite can see it.
 */

/** Which field an editor opens on when a warning was clicked to get there. */
export type NeedsField = "price" | "hours" | "rate";

export const NEEDS_WHY: Record<NeedsField, string> = {
  price:
    "No price yet — this material prices the job at nothing until you set one.",
  hours:
    "No labor unit yet — work using this material carries no hours until you set one. On a traced run, couplings, connectors and straps need none: the pipe's hours per foot pay for them.",
  rate: "No rate yet — every line this role works on prices its labor at nothing until you set one.",
};

/** The "Example rate" tag's reason — the tag opens the rate to set your own. */
export const EXAMPLE_RATE_WHY =
  "BidRidge's example loaded rate, not your shop's. Type your own and it stops being an example.";

/** The field an editor focuses: the one the warning named, else the name. */
export function focusOnOpen(
  openedFor: NeedsField | null,
  field: NeedsField | "name"
): boolean {
  return openedFor === null ? field === "name" : openedFor === field;
}
