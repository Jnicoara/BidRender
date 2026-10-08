/**
 * The one-tap answers to "what is at this end?" in a run's Run ends section
 * (owner, 2026-09-29).
 *
 * Each is a kind the app already ships (`SHIPPED_HEIGHT_TYPES`), so the drop
 * comes from that kind's existing height — the company's, or the job's — and
 * nothing new is stored: an end already holds a kind and an optional height of
 * its own. "No drop here" is carrying on at run height, which is no drop —
 * it was labelled "Nothing" until 2026-10-07, which read the same as an end
 * nobody has answered ("nothing there") and is the opposite answer. Anything
 * else (a switch, a disconnect, a type the company added) is in the full
 * picker beside these.
 *
 * runEndPicks.test.ts fails if a key here stops being a shipped kind — a quick
 * pick pointing at nothing would set an end the counts cannot read.
 */
import { DISTRIBUTION_KIND, END_NO_DROP_LABEL } from "@shared/takeoffHeights";

export type RunEndPick = { label: string; kind: string };

export const RUN_END_PICKS: readonly RunEndPick[] = [
  { label: "Device box", kind: "receptacle" },
  { label: "Panel", kind: "panel" },
  { label: "J-box", kind: "junction-box-wall" },
  { label: "Fixture", kind: "ceiling-box" },
  { label: "Stub-up", kind: "underground" },
  // The SAME words the picker beside it shows for this answer.
  { label: END_NO_DROP_LABEL, kind: DISTRIBUTION_KIND },
];

/**
 * The picks this company can use: a kind it has retired is left out, the same
 * rule the full picker follows. "No drop here" is always there.
 */
export function availablePicks(activeKinds: ReadonlySet<string>): RunEndPick[] {
  return RUN_END_PICKS.filter(
    p => p.kind === DISTRIBUTION_KIND || activeKinds.has(p.kind)
  );
}
