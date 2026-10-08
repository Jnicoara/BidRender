/**
 * The few words beside a drop that say where its device height came from.
 *
 * A height borrowed from the device's TYPE — the job's, the shop's or the
 * shipped one — says "default height" (owner, 2026-10-07), so a receptacle
 * dropping to the shop's 18" is never read as a height somebody measured for
 * that box. A height of the run end's own says nothing: the "This end only"
 * field beside it already shows it. Kept here, not in the component, so the
 * words have a test.
 */
export function heightSourceWords(source: string): string | null {
  switch (source) {
    case "mark-typed":
      return "this mark's height";
    case "mark-read":
      return "read from the plan";
    case "count":
      return "the count's height";
    case "job":
    case "company":
    case "shipped":
      return "default height";
    default:
      return null;
  }
}
