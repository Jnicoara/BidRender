/**
 * The stale-save guard every library editor's save goes through
 * (shared/staleEdit.ts says what "stale" means).
 *
 * Two steps, both needed:
 *
 *   1. `savedSinceOpened` — the screen was opened on an older version than
 *      the one saved now. Refused at once.
 *   2. `claimOwnRowVersion` — otherwise, claim the opened version in ONE
 *      conditional UPDATE, so of several saves racing from screens opened on
 *      the same version exactly one goes ahead (server/db.ts says why a read
 *      alone let all of them through).
 *
 * An editor that sends no `openedAt` (an older client, a script) is never
 * refused, as before. Call this AFTER the row is known to exist and BEFORE
 * anything is written; a save refused here has changed nothing.
 */
import { TRPCError } from "@trpc/server";
import { savedSinceOpened, STALE_EDIT_MESSAGE } from "../shared/staleEdit";
import * as db from "./db";

export async function refuseStaleSave(
  table: db.VersionedTable,
  target: { id: number; userId: number | null; updatedAt: Date | string },
  openedAt: Date | undefined,
  dataUserId: number
): Promise<void> {
  if (openedAt === undefined) return;
  const refuse = () =>
    new TRPCError({ code: "CONFLICT", message: STALE_EDIT_MESSAGE });
  if (savedSinceOpened(target.updatedAt, openedAt)) throw refuse();
  if (target.userId !== dataUserId) return; // a shared row is forked, not written
  if (!(await db.claimOwnRowVersion(table, target.id, dataUserId, openedAt)))
    throw refuse();
}
