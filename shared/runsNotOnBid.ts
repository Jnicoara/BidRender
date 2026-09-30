/**
 * TRACED RUNS WHOSE FOOTAGE IS NOT ON THE BID — counted so it can be SAID.
 *
 * A run reaches the bid only when its run type is sent (R2). Until 2026-09-29
 * nothing downstream said when that had not happened: the bid's amber "from
 * plans" strip counted COUNTS only, and the quote panel checked only lines
 * already on the bid. So 800 ft of EMT traced and never sent produced a bid
 * and a quote that looked finished. Owner: "never silent".
 *
 * ── What counts as not on the bid ───────────────────────────────────────────
 *  - `notSent`: its footage would count (`runOnBid(run).footage`) and no live
 *    bid line carries its run type — the type was never sent, or its line was
 *    removed.
 *  - `noType`: traced with no run type, so there is nothing to send it as.
 *
 * NOT counted: an AI suggestion (nobody has accepted it), and a CABLE run
 * with answered branch wiring (the devices' whips carry it on purpose; a
 * conduit run's pipe still counts and is judged like any other).
 *
 * Counted in RUNS: a branched run is one run however many legs (D20).
 */
import { runOnBid, type RunOnBidRow } from "./runOnBid";

export type RunNotOnBidRow = RunOnBidRow & {
  id: number;
  parentRunId: number | null;
};

export type RunsNotOnBid = { notSent: number; noType: number };

export function runsNotOnBid(
  rows: readonly RunNotOnBidRow[],
  /** The run-type ids of the bid's LIVE (not archived) lines. */
  sentRunTypeIds: ReadonlySet<number>
): RunsNotOnBid {
  const notSent = new Set<number>();
  const noType = new Set<number>();
  for (const row of rows) {
    const root = row.parentRunId ?? row.id;
    const on = runOnBid(row);
    if (on.leftOut === "noType") noType.add(root);
    else if (
      on.footage &&
      row.runTypeId !== null &&
      !sentRunTypeIds.has(row.runTypeId)
    )
      notSent.add(root);
  }
  // A run with one untyped leg and one unsent leg is one run, said once.
  for (const root of Array.from(noType)) notSent.delete(root);
  return { notSent: notSent.size, noType: noType.size };
}

/**
 * "3 traced runs not on the bid — not sent yet." — or null when there is
 * nothing to say. Says WHAT and WHY only; each screen adds its own pointer to
 * the Plans screen, so the bid page's link is not a second "Plans screen".
 */
export function runsNotOnBidText(counts: RunsNotOnBid): string | null {
  const total = counts.notSent + counts.noType;
  if (total === 0) return null;
  const head = `${total} traced run${total === 1 ? "" : "s"} not on the bid`;
  if (counts.noType === 0) return `${head} — not sent yet.`;
  if (counts.notSent === 0)
    return `${head} — ${total === 1 ? "it has" : "they have"} no run type yet.`;
  return `${head} — ${counts.notSent} not sent, ${counts.noType} with no run type.`;
}
