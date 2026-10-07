/**
 * HOMERUNS — one per circuit per bid (references/homerun-footage-plan.md
 * § 10 steps 2–4, on Track A's 0125–0130).
 *
 * The browser reads the circuits (only it has the drawing's word positions)
 * and `syncSheet`s them here; everything priced is computed on the server by
 * `loadBidHomeruns`, the same function the bid line reads, so the panel and
 * the bid cannot disagree.
 *
 * The owner's rules (plan § 11) live in `shared/homerunFootage.ts` and
 * `server/homerunsCore.ts`, not here: method per bid (Measured by default)
 * with a per-sheet override, routing and waste ADD, waste on material only,
 * makeup at the panel end only, unconfirmed homeruns COUNT, and no number
 * without a panel spot and a scale.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import * as db from "../db";
import { lockedEditRefusal } from "../../shared/quantityLock";
import {
  HOMERUN_METHODS,
  heightAreaWarnings,
  homerunTotals,
  outlineFromTaps,
} from "../../shared/homerunFootage";
import { ROUTING_STARTER_PCT } from "../homerunsCore";

const procedure = scoped("bids.view", "bids.edit");

const feetSchema = z.number().min(0).max(10000);
const pointSchema = z.object({
  x: z.number().finite().min(0).max(100000),
  y: z.number().finite().min(0).max(100000),
});
/** A ceiling in inches: the same believable range as every height. */
const heightSchema = z.number().int().min(-240).max(1200);

/** The outline the screen would make of these taps, or a refusal. */
function requireOutline(taps: { x: number; y: number }[]) {
  const outline = outlineFromTaps(taps);
  if (!outline)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "That area is too small to be a room — tap its corners further apart.",
    });
  return outline;
}

async function requireBid(bidId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  return bid;
}

/** A locked bid's quantities do not move — homeruns included. */
async function requireOpenBid(bidId: number, userId: number) {
  const bid = await requireBid(bidId, userId);
  if (bid.quantitiesLockedAt !== null)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: lockedEditRefusal("its homeruns cannot be changed"),
    });
  return bid;
}

async function requireSheetOnBid(
  bidId: number,
  sheetId: number,
  userId: number
) {
  const sheets = await db.getSheetScalesForBid(bidId, userId);
  if (!sheets.has(sheetId))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That sheet is not on this bid.",
    });
}

export const homerunsRouter = router({
  /** Every homerun on a bid, with the settings that made them. */
  forBid: procedure
    .input(z.object({ bidId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      const bid = await requireBid(input.bidId, userId);
      const heights = await db.heightContextForBid(
        input.bidId,
        userId,
        bid.distributionHeightInches
      );
      const [computed, panels, circuits, sheetMethods] = await Promise.all([
        db.loadBidHomeruns(input.bidId, userId, heights),
        db.getHomerunPanels(input.bidId, userId),
        db.getHomerunCircuits(input.bidId, userId),
        db.getSheetHomerunMethods(input.bidId, userId),
      ]);
      const rows = computed?.rows ?? [];
      const byId = new Map(circuits.map(c => [c.id, c]));
      return {
        settings: {
          method: bid.homerunMethod,
          averageFt:
            bid.homerunAverageFt === null ? null : Number(bid.homerunAverageFt),
          minimumFt:
            bid.homerunMinimumFt === null ? null : Number(bid.homerunMinimumFt),
          routingPct:
            bid.homerunRoutingPct === null
              ? null
              : Number(bid.homerunRoutingPct),
          runTypeId: bid.homerunRunTypeId,
        },
        routingStarterPct: ROUTING_STARTER_PCT,
        type: computed?.type ?? null,
        noExtraSet: computed?.noExtraSet ?? false,
        locked: bid.quantitiesLockedAt !== null,
        /** Sheets with their own method (an area override); others follow. */
        sheetMethods: sheetMethods.filter(s => s.method !== null),
        panels: panels.map(p => ({
          id: p.id,
          name: p.name,
          planSheetId: p.planSheetId,
          planX: p.planX === null ? null : Number(p.planX),
          planY: p.planY === null ? null : Number(p.planY),
        })),
        rows: rows.map(r => {
          const c = byId.get(r.circuitId);
          return {
            circuitId: r.circuitId,
            panelId: r.panelId,
            panelName: r.panelName,
            circuitNumber: r.circuitNumber,
            poles: r.poles,
            sheetId: r.sheetId,
            method: r.method,
            ceiling: r.ceiling,
            footage: r.footage,
            line: r.line,
            overrideFt:
              c?.homerunOverrideFt == null ? null : Number(c.homerunOverrideFt),
            ceilingInches: c?.homerunCeilingInches ?? null,
            leavingStampId: c?.homerunFromStampId ?? null,
          };
        }),
        totals: homerunTotals(rows.map(r => r.footage)),
      };
    }),

  /**
   * The circuits the browser read on one sheet. Each panel is made if it is
   * new, each circuit made if new, and an UNCONFIRMED homerun is pointed at
   * the device now closest (`syncHomerunCircuit` keeps a confirmed one).
   * A leaving device not on this bid and sheet is refused, not stored.
   */
  syncSheet: procedure
    .input(
      z.object({
        bidId: z.number().int(),
        sheetId: z.number().int(),
        circuits: z
          .array(
            z.object({
              panel: z.string().trim().min(1).max(64),
              circuits: z.array(z.number().int().min(1).max(999)).min(1),
              leavingStampId: z.number().int().nullable(),
            })
          )
          .max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      await requireOpenBid(input.bidId, userId);
      await requireSheetOnBid(input.bidId, input.sheetId, userId);
      const marks = new Set(
        (await db.getStampsForSheet(input.sheetId, userId))
          .filter(s => s.bidId === input.bidId)
          .map(s => s.id)
      );
      const panelIds = new Map<string, number>();
      let synced = 0;
      for (const c of input.circuits) {
        if (c.leavingStampId !== null && !marks.has(c.leavingStampId))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That device is not a mark on this sheet.",
          });
        const key = c.panel.toUpperCase();
        let panelId = panelIds.get(key);
        if (panelId === undefined) {
          panelId = await db.ensureHomerunPanel(input.bidId, userId, c.panel);
          panelIds.set(key, panelId);
        }
        // A two-pole "2B-36,38" is ONE homerun, kept on its first circuit.
        await db.syncHomerunCircuit(
          panelId,
          userId,
          Math.min(...c.circuits),
          c.circuits.length,
          c.leavingStampId
        );
        synced++;
      }
      return { synced };
    }),

  /** Where a panel sits on a sheet — the Measured method's other end. */
  placePanel: procedure
    .input(
      z.object({
        bidId: z.number().int(),
        panel: z.string().trim().min(1).max(64),
        spot: z
          .object({
            sheetId: z.number().int(),
            x: z.number().min(0).max(100000),
            y: z.number().min(0).max(100000),
          })
          .nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      await requireOpenBid(input.bidId, userId);
      if (input.spot)
        await requireSheetOnBid(input.bidId, input.spot.sheetId, userId);
      const panelId = await db.ensureHomerunPanel(
        input.bidId,
        userId,
        input.panel
      );
      await db.setHomerunPanelSpot(panelId, userId, input.spot);
      return { panelId };
    }),

  /**
   * One homerun's own answers. Any of them CONFIRMS it (plan § 6): a typed
   * length, a different leaving device, its own ceiling. `confirmed` alone
   * confirms or un-confirms with nothing changed.
   */
  update: procedure
    .input(
      z.object({
        circuitId: z.number().int(),
        overrideFt: feetSchema.nullable().optional(),
        leavingStampId: z.number().int().optional(),
        ceilingInches: z.number().int().min(0).max(1200).nullable().optional(),
        confirmed: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      const found = await db.getHomerunCircuit(input.circuitId, userId);
      if (!found)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Homerun not found.",
        });
      await requireOpenBid(found.bidId, userId);
      if (input.leavingStampId !== undefined) {
        const [stamp] = await db.getStampsByIds([input.leavingStampId], userId);
        if (!stamp || stamp.bidId !== found.bidId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That device is not a mark on this bid.",
          });
      }
      const answered =
        (input.overrideFt !== undefined && input.overrideFt !== null) ||
        input.leavingStampId !== undefined ||
        (input.ceilingInches !== undefined && input.ceilingInches !== null);
      const confirmedAt =
        input.confirmed === false
          ? null
          : input.confirmed === true || answered
            ? (found.circuit.homerunConfirmedAt ?? new Date())
            : undefined;
      await db.updateHomerunCircuit(input.circuitId, userId, {
        homerunOverrideFt: input.overrideFt,
        homerunFromStampId: input.leavingStampId,
        homerunCeilingInches: input.ceilingInches,
        homerunConfirmedAt: confirmedAt,
      });
      return { ok: true };
    }),

  /** "Confirm all on this sheet" — the circuits named, nothing else. */
  confirmMany: procedure
    .input(
      z.object({
        bidId: z.number().int(),
        circuitIds: z.array(z.number().int()).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      await requireOpenBid(input.bidId, userId);
      const onBid = new Set(
        (await db.getHomerunCircuits(input.bidId, userId)).map(c => c.id)
      );
      const now = new Date();
      let confirmed = 0;
      for (const id of input.circuitIds) {
        if (!onBid.has(id)) continue;
        await db.updateHomerunCircuit(id, userId, { homerunConfirmedAt: now });
        confirmed++;
      }
      return { confirmed };
    }),

  /**
   * The bid's homerun settings (0127). Omitted leaves a field, NULL clears
   * it. The routing starter is never written by itself: "Use +15%" sends
   * 0.15 like any typed value (CLAUDE.md § Starter content).
   */
  setBidSettings: procedure
    .input(
      z.object({
        bidId: z.number().int(),
        method: z.enum(HOMERUN_METHODS).nullable().optional(),
        averageFt: feetSchema.nullable().optional(),
        minimumFt: feetSchema.nullable().optional(),
        routingPct: z.number().min(0).max(5).nullable().optional(),
        runTypeId: z.number().int().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      await requireOpenBid(input.bidId, userId);
      if (input.runTypeId !== undefined && input.runTypeId !== null) {
        const types = await db.getRunTypesFor(userId, true);
        if (!types.some(t => t.id === input.runTypeId))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That run type is not in this company's list.",
          });
      }
      await db.setBidHomerunSettings(input.bidId, userId, {
        homerunMethod: input.method,
        homerunAverageFt: input.averageFt,
        homerunMinimumFt: input.minimumFt,
        homerunRoutingPct: input.routingPct,
        homerunRunTypeId: input.runTypeId,
      });
      return { ok: true };
    }),

  /**
   * HEIGHT AREAS (0130; plan § 4, owner 2026-10-06): an outline on a sheet
   * with its own ceiling — "Stockroom, open to deck, 18'-0"". A homerun
   * leaving a device inside it climbs to that height; where two overlap,
   * the SMALLER outline wins (never just the lower height), and the overlap
   * is warned about on the sheet. A shared wall is not an overlap.
   */
  heightAreas: procedure
    .input(z.object({ bidId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      await requireBid(input.bidId, userId);
      const rows = await db.getHeightAreas(input.bidId, userId);
      const areas = rows.map(a => ({
        id: a.id,
        sheetId: a.sheetId,
        name: a.name,
        heightInches: a.distributionHeightInches,
        outline: a.region.map(([x, y]) => ({ x, y })),
      }));
      // Warnings per sheet: areas on two sheets never overlap.
      const sheets = Array.from(new Set(areas.map(a => a.sheetId)));
      return {
        areas,
        warnings: sheets.flatMap(sheetId =>
          heightAreaWarnings(areas.filter(a => a.sheetId === sheetId)).map(
            text => ({ sheetId, text })
          )
        ),
      };
    }),

  createHeightArea: procedure
    .input(
      z.object({
        bidId: z.number().int(),
        sheetId: z.number().int(),
        name: z.string().trim().min(1).max(64),
        outline: z.array(pointSchema).min(2).max(200),
        heightInches: heightSchema.nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      await requireOpenBid(input.bidId, userId);
      await requireSheetOnBid(input.bidId, input.sheetId, userId);
      const outline = requireOutline(input.outline);
      const id = await db.createHeightArea({
        bidId: input.bidId,
        userId,
        sheetId: input.sheetId,
        name: input.name,
        region: outline.map(p => [p.x, p.y]),
        distributionHeightInches: input.heightInches,
      });
      return { id };
    }),

  updateHeightArea: procedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().trim().min(1).max(64).optional(),
        outline: z.array(pointSchema).min(2).max(200).optional(),
        heightInches: heightSchema.nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      const area = await db.getHeightArea(input.id, userId);
      if (!area)
        throw new TRPCError({ code: "NOT_FOUND", message: "Area not found." });
      await requireOpenBid(area.bidId, userId);
      await db.updateHeightArea(input.id, userId, {
        name: input.name,
        region: input.outline
          ? requireOutline(input.outline).map(p => [p.x, p.y])
          : undefined,
        distributionHeightInches: input.heightInches,
      });
      return { ok: true };
    }),

  removeHeightArea: procedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      const area = await db.getHeightArea(input.id, userId);
      if (!area)
        throw new TRPCError({ code: "NOT_FOUND", message: "Area not found." });
      await requireOpenBid(area.bidId, userId);
      await db.deleteHeightArea(input.id, userId);
      return { ok: true };
    }),

  /** One sheet's (one area's) override of the bid's method. NULL follows. */
  setSheetMethod: procedure
    .input(
      z.object({
        bidId: z.number().int(),
        sheetId: z.number().int(),
        method: z.enum(HOMERUN_METHODS).nullable().optional(),
        averageFt: feetSchema.nullable().optional(),
        minimumFt: feetSchema.nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.scope.dataUserId;
      await requireOpenBid(input.bidId, userId);
      await requireSheetOnBid(input.bidId, input.sheetId, userId);
      await db.setSheetHomerunMethod(input.sheetId, userId, {
        homerunMethod: input.method,
        homerunAverageFt: input.averageFt,
        homerunMinimumFt: input.minimumFt,
      });
      return { ok: true };
    }),
});
