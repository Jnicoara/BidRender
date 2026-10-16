/**
 * MATH VERSION 2 — traced runs' labor priced at the run labor rate
 * (shared/mathVersion.ts; morning-questions-a.md N4, owner 2026-10-16).
 *
 * Until 2026-10-16 nothing could set `pricing_defaults.defaultLaborRateId`,
 * so every traced-run line froze its labor rate at $0 an hour. The owner
 * chose no automatic re-price: a Draft takes the fix only when somebody
 * presses "Update to the current math" and has seen old → new. Sent, won,
 * lost and locked bids never move.
 *
 * Which lines: a run line (`takeoffRunTypeId` set) whose frozen rate is $0
 * and whose hours are above zero — the only lines a rate changes. A line
 * with no hours prices nothing either way, so it is left alone.
 *
 * Pure, so the preview and the write cannot pick different lines: the
 * preview prices `withRunRate(lines)` and the write sets the same ids.
 */

export type RunRateLine = {
  id: number;
  takeoffRunTypeId: number | null;
  snapshotLaborRate: string | null;
  snapshotLaborHours: string | null;
};

/** A run line that froze at $0 an hour with hours to price. */
export function needsRunRate(line: RunRateLine): boolean {
  return (
    line.takeoffRunTypeId !== null &&
    Number(line.snapshotLaborRate ?? 0) === 0 &&
    Number(line.snapshotLaborHours ?? 0) > 0
  );
}

/** The company's run rate, as a line would freeze it. */
export type RunRate = { cost: number; wasExample: boolean };

/**
 * The lines as they price after the repair: each `needsRunRate` line carries
 * the run rate, every other line is returned as it is.
 */
export function withRunRate<
  T extends RunRateLine & { snapshotLaborRateWasExample: boolean | null },
>(lines: T[], rate: RunRate): T[] {
  return lines.map(line =>
    needsRunRate(line)
      ? {
          ...line,
          snapshotLaborRate: rate.cost.toFixed(4),
          snapshotLaborRateWasExample: rate.wasExample,
        }
      : line
  );
}
