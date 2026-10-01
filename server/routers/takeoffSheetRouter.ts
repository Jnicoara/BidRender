/**
 * Clear every mark and run on ONE sheet — and put them all back (Track B plan,
 * Part 3; owner, 2026-09-29).
 *
 * ── This overrides takeoff-spec.md D6, and says why ─────────────────────────
 * D6 left out the old "Clear page" because "a one-tap wipe is how a whole
 * takeoff gets lost". That reason is met here a different way rather than
 * ignored: it is never one tap (`clearPreview` supplies the exact counts the
 * question asks about, and the button names the number), and the whole clear
 * is one undo step (`restore`, same ids, every link back). No plan-set-wide
 * clear exists, on purpose.
 *
 * Refused on a locked bid, like every other change to what the drawing holds.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import * as db from "../db";
import {
  SHEET_PACKET,
  openPacket,
  packetSchema,
  sealPacket,
} from "../restorePacket";
import {
  clearSheetWithSnapshot,
  previewSheetClear,
  restoreSheet,
  type SheetSnapshot,
} from "../takeoffRestore";

const procedure = scoped("bids.view", "bids.edit");

/** The sheet, with the bid it belongs to (through its plan set). */
async function requireSheet(sheetId: number, userId: number) {
  const sheet = await db.getBidPdfSheet(sheetId, userId);
  const pdf = sheet ? await db.getBidPdf(sheet.bidPdfId, userId) : undefined;
  if (!sheet || !pdf)
    throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
  return { ...sheet, bidId: pdf.bidId };
}

async function refuseIfLocked(bidId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  if (bid.quantitiesLockedAt !== null)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This bid's quantities are locked, so its sheets cannot be cleared. Unlock them on the bid first.",
    });
}

export const takeoffSheetRouter = router({
  /** Exactly what `clear` would remove, for the question in front of it. */
  clearPreview: procedure
    .input(z.object({ sheetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireSheet(input.sheetId, ctx.scope.dataUserId);
      return previewSheetClear(input.sheetId, ctx.scope.dataUserId);
    }),

  /** Remove every mark and run on the sheet, in one transaction. */
  clear: procedure
    .input(z.object({ sheetId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const sheet = await requireSheet(input.sheetId, userId);
      await refuseIfLocked(sheet.bidId, userId);
      const { removedRuns, removedMarks, snapshot } =
        await clearSheetWithSnapshot(
          { id: sheet.id, bidId: sheet.bidId },
          userId
        );
      return {
        removedRuns,
        removedMarks,
        undo: sealPacket(SHEET_PACKET, userId, snapshot),
      };
    }),

  /** Put a cleared sheet back, same ids, in one step. */
  restore: procedure
    .input(z.object({ undo: packetSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const snapshot = openPacket<SheetSnapshot>(
        SHEET_PACKET,
        userId,
        input.undo
      );
      if (!snapshot)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That undo step is not valid here.",
        });
      await refuseIfLocked(snapshot.bidId, userId);
      await restoreSheet(snapshot, userId);
      return { sheetId: snapshot.sheetId };
    }),
});
