/**
 * THE WHOLE PLAN SET, AND "SEND ALL TO BID".
 *
 * references/track-b-deletes-summary-pan-plan.md §§ 2–3, built 2026-09-29.
 *
 * ── Built out of the procedures that already exist, on purpose ──────────────
 * `forBid` reads `takeoffGroups.list` and `takeoffRunTypes.bridgeForBid` — the
 * same two queries the counted-items panel and the run-type bridge show — and
 * sorts them with shared/takeoffSummary.ts. `sendAll` calls the single
 * `sendToBid` of each, one item at a time. So the bulk path and the single
 * path cannot disagree about what is sendable, what a line is priced from, or
 * whether the bid is locked: there is only one of each rule.
 *
 * ── Not one database transaction, and what makes that safe ─────────────────
 * The helpers each single send uses take the shared connection, not a
 * transaction handle. What stops a partial or repeated send from doing harm
 * is that every send is idempotent where it matters: the unique indexes on
 * (bid, count) and (bid, run type, role) mean a second send can only update
 * or skip, never add a second line. A send interrupted half way leaves the
 * rest listed as "not sent yet", and pressing it again sends only those.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createCallerFactory, router, scoped } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import * as db from "../db";
import { refuseSendIfLocked } from "../lockGuard";
import { takeoffGroupsRouter } from "./takeoffGroupsRouter";
import { takeoffRunTypesRouter } from "./takeoffRunTypesRouter";
import { runsNotOnBid } from "../../shared/runsNotOnBid";
import { emptyPipeLookup, runsWithNoWire } from "../../shared/runNoWire";
import {
  sameSendList,
  takeoffSummary,
  type SummaryItem,
  type TakeoffSummary,
} from "../../shared/takeoffSummary";
import { RUN_MATERIAL_ROLES } from "../../drizzle/schema";

const procedure = scoped("bids.view", "bids.edit");

const groupsCaller = createCallerFactory(takeoffGroupsRouter);
const runTypesCaller = createCallerFactory(takeoffRunTypesRouter);

async function summaryFor(
  ctx: TrpcContext,
  bidId: number,
  userId: number
): Promise<TakeoffSummary> {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  const [counts, bridge, runs, lines] = await Promise.all([
    groupsCaller(ctx).list({ bidId }),
    runTypesCaller(ctx).bridgeForBid({ bidId }),
    db.getRunsForBid(bidId, userId),
    db.getBidLineItems(bidId),
  ]);
  // The same read the bid page's "no wire" warning makes (planAttention.ts).
  const [wire, palette] = await Promise.all([
    db.getWireCircuitsForRuns(runs, userId),
    db.getRunTypesFor(userId, true),
  ]);
  const noWire = runsWithNoWire(runs, wire, emptyPipeLookup(palette));
  // Where the first of them is drawn, so the item can open it.
  const firstNoWire =
    noWire.length === 0 ? null : runs.find(r => r.id === noWire[0]);
  const places = firstNoWire
    ? await db.getSheetPlacesForBid(bidId, userId)
    : null;
  const firstPlace = firstNoWire ? places?.get(firstNoWire.sheetId) : null;
  const firstPoint = firstNoWire?.points?.[0] ?? { x: 0, y: 0 };
  const sentTypes = new Set(
    lines.flatMap(line =>
      line.takeoffRunTypeId === null ? [] : [line.takeoffRunTypeId]
    )
  );
  return takeoffSummary({
    locked: bid.quantitiesLockedAt !== null,
    counts: counts.groups,
    runTypes: bridge.map(t => ({
      runTypeId: t.runTypeId,
      label: t.label,
      unmeasurableCount: t.unmeasurableCount,
      rows: t.rows,
      fittings: t.fittings,
    })),
    untypedRuns: runsNotOnBid(runs, sentTypes).noType,
    runsWithNoWire: noWire.length,
    firstRunWithNoWire: firstNoWire
      ? {
          runId: firstNoWire.id,
          bidPdfId: firstPlace?.bidPdfId ?? null,
          pageNumber: firstPlace?.pageNumber ?? null,
          x: firstPoint.x,
          y: firstPoint.y,
        }
      : null,
  });
}

/** One line of what Send all did, for the toast and the dialog. */
type SendOutcome = { key: string; name: string; why?: string };

function describe(item: SummaryItem): string {
  return item.group ? `${item.group} — ${item.name}` : item.name;
}

export const takeoffSummaryRouter = router({
  /** Everything on the plan set, sorted into on the bid / not yet, with why. */
  forBid: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(({ input, ctx }) =>
      summaryFor(ctx, input.bidId, ctx.scope.dataUserId)
    ),

  /**
   * Send every item the preview listed as sendable, and nothing else.
   *
   * `expect` is the list of keys the dialog showed. If the drawing moved while
   * it was open, so the list the server would send now is different, the
   * whole send is refused — sending a set nobody saw is the one thing a
   * preview exists to prevent.
   */
  sendAll: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        expect: z.array(z.string()).max(2000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // The same check every single send makes, first, so a locked bid
      // writes nothing and says so in the lock's own sentence.
      await refuseSendIfLocked(input.bidId, ctx.scope.dataUserId);
      const summary = await summaryFor(ctx, input.bidId, ctx.scope.dataUserId);
      if (!sameSendList(input.expect, summary.sendable))
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Something changed since you opened this — check the list again.",
        });

      const sent: SendOutcome[] = [];
      const notSent: SendOutcome[] = [];
      for (const item of summary.notOnBid) {
        const target = item.send;
        if (!target) continue;
        try {
          if (target.kind === "count") {
            await groupsCaller(ctx).sendToBid({ id: target.groupId });
            sent.push({ key: item.key, name: describe(item) });
          } else {
            const role = RUN_MATERIAL_ROLES.find(r => r === target.role);
            if (!role) throw new Error(`Unknown role ${target.role}`);
            const result = await runTypesCaller(ctx).sendToBid({
              bidId: input.bidId,
              runTypeId: target.runTypeId,
              role,
              ...(target.extraKey !== undefined
                ? { extraKey: target.extraKey }
                : {}),
            });
            if (result.sent.length > 0 || result.updated.length > 0)
              sent.push({ key: item.key, name: describe(item) });
            else
              notSent.push({
                key: item.key,
                name: describe(item),
                why: result.skipped[0]?.why ?? "Nothing was added.",
              });
          }
        } catch (error) {
          notSent.push({
            key: item.key,
            name: describe(item),
            why: error instanceof Error ? error.message : "Could not send.",
          });
        }
      }
      return { sent, notSent };
    }),
});
