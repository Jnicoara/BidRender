/**
 * The one check every SEND from the plans to the bid goes through.
 *
 * Owner, 2026-09-29: a locked bid must not change, and that includes sending.
 * Until then a send to a locked bid was allowed on purpose — the line arrived
 * frozen at the number it crossed with (server/quantityLock.test.ts said "a
 * second lock rule in a second place"). It is refused now, and it lives HERE
 * so the count send, the run-type send and any bulk send cannot disagree about
 * it: a bid that refused one send and took another would give two answers.
 */
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { lockedEditRefusal } from "../shared/quantityLock";

export async function refuseSendIfLocked(bidId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  if (bid.quantitiesLockedAt !== null)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: lockedEditRefusal(
        "nothing more can be sent to it from the plans"
      ),
    });
  return bid;
}
