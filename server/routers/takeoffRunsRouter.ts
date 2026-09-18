/**
 * Traced runs — the measuring tool. Takeoff redesign, phase 2b.
 *
 * ── The scale gate is enforced HERE, not only in the UI ──────────────────────
 * A greyed-out button is a courtesy; this is the control. Every path that
 * produces or stores a measured length calls `requireMeasurableSheet` first,
 * so a run cannot acquire a length against a sheet with no scale — or against
 * one the drawing itself marks NOT TO SCALE — however the request arrived.
 *
 * A run may still be SAVED against an unmeasurable sheet: the points are the
 * user's work and losing them would be worse than holding an unmeasured path.
 * What is refused is a number. `lengthInches` stays null and every rollup
 * reports the run as unmeasurable rather than counting it as zero.
 *
 * ── Nothing here does arithmetic ─────────────────────────────────────────────
 * Lengths and footages come from shared/takeoffGeometry.ts and
 * shared/takeoffQuantities.ts, which are pure and exhaustively tested. A second
 * implementation in this file is exactly how a screen and a bill of materials
 * end up disagreeing about how much wire a job needs.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import {
  RUN_PATH_TYPES,
  RUN_STATUSES,
  TAKEOFF_LOCATIONS,
} from "../../drizzle/schema";
import { pathRealInches, toBillableFeet } from "../../shared/takeoffGeometry";
import {
  NO_VERTICALS,
  measurabilityOf,
  quantitiesForRun,
  totalQuantities,
  type RunPathType,
} from "../../shared/takeoffQuantities";
import * as db from "../db";

/**
 * This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("bids.view", "bids.edit");

const nameSchema = z.string().trim().min(1).max(255);

/**
 * A traced vertex, in PDF page points.
 *
 * Bounded generously rather than tightly: a page point is 1/72", so ±100000
 * covers any sheet size that exists while still refusing the absurd values
 * that indicate a bug upstream. Non-finite values are rejected by `.finite()`.
 */
const pointSchema = z.object({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
});

/** A path long enough to be worth storing, short enough to be a real trace. */
const pointsSchema = z.array(pointSchema).max(5000);

async function requireSheet(sheetId: number, userId: number) {
  const sheet = await db.getBidPdfSheet(sheetId, userId);
  if (!sheet)
    throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
  return sheet;
}

async function requireRun(id: number, userId: number) {
  const run = await db.getRunById(id, userId);
  if (!run)
    throw new TRPCError({ code: "NOT_FOUND", message: "Run not found." });
  return run;
}

/** The sheet's scale as the pure functions want it. */
function sheetScale(
  sheet: Awaited<ReturnType<typeof db.getBidPdfSheet>> & object
) {
  return {
    scaleRatio: sheet.scaleRatio === null ? null : Number(sheet.scaleRatio),
    scaleSource: sheet.scaleSource,
    notToScale: sheet.notToScale,
  };
}

/**
 * The hard gate. Throws unless this sheet can legitimately be measured.
 *
 * Used by anything that RETURNS a distance. Saving points does not go through
 * it — see the module header on why work is kept even when it cannot yet be
 * measured.
 */
async function requireMeasurableSheet(sheetId: number, userId: number) {
  const sheet = await requireSheet(sheetId, userId);
  const measurability = measurabilityOf(sheetScale(sheet));
  if (!measurability.ok) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: measurability.message,
    });
  }
  return { sheet, ratio: measurability.ratio };
}

export const takeoffRunsRouter = router({
  /**
   * Whether this sheet can be traced on, and why not if it cannot.
   *
   * The UI asks before enabling the tool so it can show the actual reason and
   * the way out, rather than a disabled button with no explanation.
   */
  measurability: procedure
    .input(z.object({ sheetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const sheet = await requireSheet(input.sheetId, ctx.scope.dataUserId);
      return measurabilityOf(sheetScale(sheet));
    }),

  /** Every run on a sheet, with its measured quantities where possible. */
  listForSheet: procedure
    .input(z.object({ sheetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const sheet = await requireSheet(input.sheetId, ctx.scope.dataUserId);
      const scale = sheetScale(sheet);
      const measurability = measurabilityOf(scale);
      const ratio = measurability.ok ? measurability.ratio : null;

      const runs = await db.getRunsForSheet(
        input.sheetId,
        ctx.scope.dataUserId
      );
      const circuits = await db.getCircuitsForRuns(
        runs.map(r => r.id),
        ctx.scope.dataUserId
      );

      return runs.map(run => {
        const runCircuits = circuits
          .filter(c => c.runId === run.id)
          .map(c => ({
            id: c.id,
            name: c.name,
            conductorCount: c.conductorCount,
          }));

        const traced = {
          pathType: run.pathType as RunPathType,
          points: run.points ?? [],
        };
        return {
          id: run.id,
          name: run.name,
          pathType: run.pathType,
          points: run.points ?? [],
          status: run.status,
          isSuggestion: run.isSuggestion,
          location: run.location,
          circuits: runCircuits,
          /** Null whenever the sheet cannot be measured — never a fallback 0. */
          /*
           * No heights yet: the settings tables arrive with Phase 5 step 2, and
           * a run has nowhere to read a distribution height from until they
           * do. Stated rather than defaulted — see NO_VERTICALS.
           */
          quantities: quantitiesForRun(
            traced,
            runCircuits,
            ratio,
            NO_VERTICALS
          ),
          /**
           * The sheet's scale has changed since this was traced. The length
           * shown is against the CURRENT scale; this flags that it differs
           * from what the user saw when they drew it.
           */
          scaleChangedSinceTraced:
            run.scaleRatioUsed != null &&
            ratio != null &&
            Math.abs(Number(run.scaleRatioUsed) - ratio) > 1e-6,
        };
      });
    }),

  /**
   * Save a traced path.
   *
   * Used for the explicit commit AND for autosave, which is why `status` is an
   * input: an in-progress trace is stored exactly like a finished one, just
   * marked draft. Losing an autosave to a schema that only accepts finished
   * work would defeat the point of having one.
   */
  save: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        sheetId: z.number().int().positive(),
        /** Omitted to create; supplied to update an existing run in place. */
        id: z.number().int().positive().optional(),
        name: nameSchema,
        pathType: z.enum(RUN_PATH_TYPES),
        points: pointsSchema,
        status: z.enum(RUN_STATUSES).default("draft"),
        isSuggestion: z.boolean().default(false),
        /** Where the raceway sits — the Location layer. Taggable later too. */
        location: z.enum(TAKEOFF_LOCATIONS).nullable().default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sheet = await requireSheet(input.sheetId, ctx.scope.dataUserId);
      const bid = await db.getBidById(input.bidId, ctx.scope.dataUserId);
      if (!bid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

      // Measure if we legitimately can; otherwise store the points with NO
      // length rather than refusing the save. The user's clicking is real work.
      const measurability = measurabilityOf(sheetScale(sheet));
      const ratio = measurability.ok ? measurability.ratio : null;
      const inches =
        ratio === null ? null : pathRealInches(input.points, ratio);

      const values = {
        bidId: input.bidId,
        sheetId: input.sheetId,
        userId: ctx.scope.dataUserId,
        name: input.name,
        pathType: input.pathType,
        points: input.points,
        lengthInches: inches === null ? null : inches.toFixed(4),
        scaleRatioUsed: ratio === null ? null : String(ratio),
        status: input.status,
        isSuggestion: input.isSuggestion,
        location: input.location,
      };

      if (input.id) {
        const existing = await requireRun(input.id, ctx.scope.dataUserId);
        if (existing.sheetId !== input.sheetId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That run belongs to another sheet.",
          });
        }
        await db.updateRun(input.id, ctx.scope.dataUserId, values);
        return {
          id: input.id,
          measured: inches !== null,
          lengthFeet: inches === null ? null : toBillableFeet(inches),
        };
      }

      const id = await db.createRun(values);
      return {
        id,
        measured: inches !== null,
        lengthFeet: inches === null ? null : toBillableFeet(inches),
      };
    }),

  /**
   * Mark a run finished.
   *
   * Refuses if the sheet cannot be measured: committing is the point at which
   * a run enters the bill of materials, and an uncounted line there is worse
   * than a draft the user can see is unfinished.
   */
  commit: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const run = await requireRun(input.id, ctx.scope.dataUserId);
      const { ratio } = await requireMeasurableSheet(
        run.sheetId,
        ctx.scope.dataUserId
      );

      const points = run.points ?? [];
      if (points.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A run needs at least two points before it can be finished.",
        });
      }

      const inches = pathRealInches(points, ratio);
      if (inches === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That path could not be measured.",
        });
      }

      await db.updateRun(input.id, ctx.scope.dataUserId, {
        status: "committed",
        isSuggestion: false,
        lengthInches: inches.toFixed(4),
        scaleRatioUsed: String(ratio),
      });
      return { id: input.id, lengthFeet: toBillableFeet(inches) };
    }),

  /**
   * Accept an AI-suggested route.
   *
   * Separate from `commit` so the act of accepting a suggestion is explicit in
   * the API as well as the UI. A suggestion never becomes real on its own.
   */
  acceptSuggestion: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const run = await requireRun(input.id, ctx.scope.dataUserId);
      if (!run.isSuggestion) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That run is not a suggestion.",
        });
      }
      await requireMeasurableSheet(run.sheetId, ctx.scope.dataUserId);
      await db.updateRun(input.id, ctx.scope.dataUserId, {
        isSuggestion: false,
        status: "draft",
      });
      return { success: true };
    }),

  /** Tag a run's Location without disturbing its geometry. */
  setLocation: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        location: z.enum(TAKEOFF_LOCATIONS).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireRun(input.id, ctx.scope.dataUserId);
      await db.updateRun(input.id, ctx.scope.dataUserId, {
        location: input.location,
      });
      return { success: true };
    }),

  remove: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireRun(input.id, ctx.scope.dataUserId);
      await db.deleteRun(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  // ── Circuits on a run ──────────────────────────────────────────────────────

  addCircuit: procedure
    .input(
      z.object({
        runId: z.number().int().positive(),
        name: nameSchema,
        /** Bounded at 60: a raceway with more conductors is a data-entry slip. */
        conductorCount: z.number().int().min(1).max(60),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const run = await requireRun(input.runId, ctx.scope.dataUserId);
      if (run.pathType !== "conduit") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A cable run carries its own conductors — circuits are only assigned to conduit runs.",
        });
      }
      const id = await db.createRunCircuit({
        runId: input.runId,
        userId: ctx.scope.dataUserId,
        name: input.name,
        conductorCount: input.conductorCount,
      });
      return { id };
    }),

  updateCircuit: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: nameSchema.optional(),
        conductorCount: z.number().int().min(1).max(60).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...patch } = input;
      await db.updateRunCircuit(id, ctx.scope.dataUserId, patch);
      return { success: true };
    }),

  removeCircuit: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteRunCircuit(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /**
   * The bill of materials for a whole bid: conduit once per run, wire per
   * circuit, cable separate, and a count of what could NOT be measured.
   *
   * Drafts and suggestions are excluded — neither is finished work, and
   * counting either would put provisional footage into a total the user reads
   * as their quantity.
   */
  totals: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const bid = await db.getBidById(input.bidId, ctx.scope.dataUserId);
      if (!bid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

      const allRuns = await db.getRunsForBid(input.bidId, ctx.scope.dataUserId);
      const runs = allRuns.filter(
        r => r.status === "committed" && !r.isSuggestion
      );
      const circuits = await db.getCircuitsForRuns(
        runs.map(r => r.id),
        ctx.scope.dataUserId
      );

      // Each run measures against ITS OWN sheet's scale — a bid can hold a site
      // plan at 1" = 40' and a floor plan at 1/4" = 1'-0".
      const sheetIds = Array.from(new Set(runs.map(r => r.sheetId)));
      const ratioBySheet = new Map<number, number | null>();
      for (const sheetId of sheetIds) {
        const sheet = await db.getBidPdfSheet(sheetId, ctx.scope.dataUserId);
        if (!sheet) {
          ratioBySheet.set(sheetId, null);
          continue;
        }
        const measurability = measurabilityOf(sheetScale(sheet));
        ratioBySheet.set(
          sheetId,
          measurability.ok ? measurability.ratio : null
        );
      }

      return totalQuantities(
        runs.map(run => ({
          run: {
            pathType: run.pathType as RunPathType,
            points: run.points ?? [],
          },
          circuits: circuits
            .filter(c => c.runId === run.id)
            .map(c => ({ name: c.name, conductorCount: c.conductorCount })),
          ratio: ratioBySheet.get(run.sheetId) ?? null,
          // No heights yet — see the note in listForSheet.
          verticals: NO_VERTICALS,
        }))
      );
    }),
});
