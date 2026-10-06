/**
 * Change a locked bid's drawing THE ONLY WAY LEFT: from before the rule.
 *
 * Since 2026-09-29 a locked bid refuses every change to its plans — no new
 * marks, no traced runs, no legs (server/lockedEdits.test.ts). But bids locked
 * before that day may already have drawings that moved after the lock, and the
 * read side must still answer from the stored number for them. The suites that
 * pin that ("a locked bid holds still", "Send-again does not overwrite") used
 * to move the drawing through the app after locking; they now do it through
 * this, which lifts the lock's column for the length of `edit` and puts the
 * SAME timestamp back.
 *
 * Deliberately not `bids.unlockQuantities` + `lockQuantities`: re-locking
 * rewrites every following line's stored qty from the drawing, which is the
 * very number these tests assert did NOT move. This touches the column only.
 *
 * Test-only. Nothing in the app may do this.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { bids } from "../drizzle/schema";

export async function behindTheLock<T>(
  bidId: number,
  edit: () => Promise<T>
): Promise<T> {
  const database = (await getDb())!;
  const [bid] = await database
    .select({ lockedAt: bids.quantitiesLockedAt })
    .from(bids)
    .where(eq(bids.id, bidId));
  if (!bid?.lockedAt)
    throw new Error(`behindTheLock: bid ${bidId} is not locked`);
  await database
    .update(bids)
    .set({ quantitiesLockedAt: null })
    .where(eq(bids.id, bidId));
  try {
    return await edit();
  } finally {
    await database
      .update(bids)
      .set({ quantitiesLockedAt: bid.lockedAt })
      .where(eq(bids.id, bidId));
  }
}
