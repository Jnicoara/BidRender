/**
 * F13: the sentence under a LOCKED bid's warnings, saying they are the
 * counts from the lock (shared/lockedWarnings.ts, server/bidWarnings.ts).
 *
 * Said only when a frozen count is actually showing. With none showing there
 * is nothing it could be about, and a note on every locked bid forever is
 * the noise that teaches people to read past the strip.
 */
import type { WarningCounts } from "@shared/lockedWarnings";

export function frozenWarningsNote(
  frozenAt: string | null,
  counts: WarningCounts
): string | null {
  if (frozenAt === null) return null;
  const showing =
    counts.dropsNotPriced > 0 ||
    counts.waitingToSend > 0 ||
    counts.countedWithNoPrice > 0 ||
    counts.doubleCounted.length > 0 ||
    counts.runsWithNoWire > 0 ||
    counts.runsNotOnBid.notSent > 0 ||
    counts.runsNotOnBid.noType > 0;
  if (!showing) return null;
  const day = new Date(frozenAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `These warnings are as counted when this bid was locked, ${day}. Unlock it to count them again.`;
}
