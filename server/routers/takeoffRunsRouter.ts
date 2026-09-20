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
  DISTRIBUTION_KIND,
  shippedHeightType,
} from "../../shared/takeoffHeights";
import {
  circuitWire,
  measurabilityOf,
  quantitiesForRun,
  totalQuantities,
  type RunPathType,
} from "../../shared/takeoffQuantities";
import {
  runDisplayName,
  runName,
  runNameParts,
} from "../../shared/takeoffCounts";
import * as db from "../db";
import {
  EMPTY_HEIGHT_CONTEXT,
  heightContextForBid,
  verticalsForRunRow,
} from "../runVerticals";

/**
 * This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("bids.view", "bids.edit");

const nameSchema = z.string().trim().min(1).max(255);

/** A height type key, or null for "nobody has said what is at this end". */
const kindSchema = z.string().trim().min(1).max(64).nullable();

/** An elevation override on one run, in inches. Same range as the settings. */
const runInchesSchema = z.number().int().min(-240).max(600).nullable();

/**
 * Refuse a height type this company does not have.
 *
 * An unknown key is not harmless: it resolves to "not set", so the run quietly
 * counts no vertical and nothing on screen says why. Refusing the save beats
 * storing something that silently means nothing.
 */
async function requireKnownKind(
  kind: string | null,
  userId: number
): Promise<void> {
  if (kind === null || kind === DISTRIBUTION_KIND) return;
  if (shippedHeightType(kind)) return;
  const own = await db.getMountingHeights(userId);
  if (own.some(row => row.typeKey === kind)) return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "That is not one of your height types.",
  });
}

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

      // The heights, loaded ONCE for the whole sheet rather than per run. The
      // bid comes from the runs rather than the sheet: a sheet belongs to a
      // PDF, and only a run knows which bid it is counted against.
      const bidId = runs[0]?.bidId ?? null;
      const bid =
        bidId === null
          ? null
          : await db.getBidById(bidId, ctx.scope.dataUserId);
      const heights =
        bidId === null
          ? EMPTY_HEIGHT_CONTEXT
          : await heightContextForBid(
              bidId,
              ctx.scope.dataUserId,
              bid?.distributionHeightInches ?? null
            );

      return runs.map(run => {
        /*
          Through `circuitWire`, plus the id the panel needs to edit a row.

          Hand-mapping this is what broke: `conductorCount` stopped including
          the ground when 0063 split it, so a mapping that drops `groundCount`
          does not report a missing field — it reports a circuit one conductor
          SHORT, on every run, with nothing on screen to say so. Found by
          applying the migration to a live local database and watching a bid's
          wire go 125.01 ft to 83.34 ft. The arithmetic was right the whole
          time; three mappings between the table and the arithmetic were not.
        */
        const rows = circuits.filter(c => c.runId === run.id);

        /*
          Two mappings from one row, and the split is deliberate.

          The ARITHMETIC goes through `circuitWire`, which turns a stored NULL
          into a zero — correct, because an un-split circuit still has its
          ground inside `conductorCount`.

          The SCREEN gets the raw nullable value, because it has to tell "no
          ground on this circuit" from "nobody has said yet", and `circuitWire`
          has deliberately thrown that distinction away by the time it returns.
          A panel showing 0 for both would report a decision nobody made — the
          failure CLAUDE.md § Editing fields rule 6 is about.

          Hand-mapped here, where a structural spread would be wrong: an added
          column reaching the arithmetic silently is a wrong number, and an
          added column reaching the SCREEN silently is clutter nobody chose.
          Display shapes are listed on purpose.
        */
        const forMaths = rows.map(circuitWire);
        const runCircuits = rows.map(c => ({
          id: c.id,
          name: c.name,
          conductorCount: c.conductorCount,
          /** Raw: null is "not yet said", and the panel shows it as such. */
          groundCount: c.groundCount,
        }));

        const traced = {
          pathType: run.pathType as RunPathType,
          points: run.points ?? [],
        };
        return {
          id: run.id,
          name: run.name,
          /**
           * What this run IS, and what to call it.
           *
           * `typeName` resolves the type's live label, the snapshot, and the
           * run's own name in that order — see runName. The id comes too,
           * because it is what a colour and a filter group on.
           */
          runTypeId: run.runTypeId,
          typeName: runName(run),
          /** What it is called as one sentence. Derived, never stored. */
          displayName: runDisplayName(run, heights.types),
          /**
           * The same name in halves, for the two-line row in the panel.
           * Null when the ends are not both answered — see runNameParts.
           */
          endsName: runNameParts(run, heights.types).ends,
          pathType: run.pathType,
          points: run.points ?? [],
          status: run.status,
          isSuggestion: run.isSuggestion,
          location: run.location,
          circuits: runCircuits,
          /** Null whenever the sheet cannot be measured — never a fallback 0. */
          quantities: quantitiesForRun(
            traced,
            forMaths,
            ratio,
            verticalsForRunRow(run, heights)
          ),
          /** What is at each end, so the panel can show it and change it. */
          ends: {
            startKind: run.startKind,
            endKind: run.endKind,
            startHeightInches: run.startHeightInches,
            endHeightInches: run.endHeightInches,
            distributionHeightInches: run.distributionHeightInches,
            startStampId: run.startStampId,
            endStampId: run.endStampId,
          },
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
        /**
         * The palette entry this was traced under.
         *
         * OPTIONAL, and omitting it leaves what is there — same rule as the
         * end kinds below, and for the same reason: an autosave part-way
         * through a trace must not be able to strip a run of what it is.
         *
         * The LABEL is not accepted from the client. It is read off the type
         * here, so a run cannot be saved claiming to be something its type
         * does not say. See drizzle/0058 on why the snapshot exists at all.
         */
        runTypeId: z.number().int().positive().nullable().optional(),
        /**
         * What is at each end, from the sticky pickers on the trace toolbar.
         *
         * OPTIONAL, and omitting one means "leave what is there" rather than
         * "clear it" — unlike the location field above, which the client always
         * sends. An autosave part-way through a trace must not be able to wipe
         * the ends off a run that already has them.
         */
        startKind: kindSchema.optional(),
        endKind: kindSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sheet = await requireSheet(input.sheetId, ctx.scope.dataUserId);
      const bid = await db.getBidById(input.bidId, ctx.scope.dataUserId);
      if (!bid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

      /*
        What this run IS, resolved from the palette rather than trusted.

        The label is read off the type here instead of being accepted from the
        client, so a run cannot be saved claiming to be something its type does
        not say. Both fields move together: the link is what a later rename
        follows, and the label is what survives the link being gone.

        Omitted means "leave what is there", which is what makes an autosave
        part-way through a trace safe. Explicit null clears both, which is what
        detaching a run from its type means.
      */
      let runTypeFields: {
        runTypeId?: number | null;
        runTypeLabel?: string | null;
      } = {};
      if (input.runTypeId === null) {
        runTypeFields = { runTypeId: null, runTypeLabel: null };
      } else if (input.runTypeId !== undefined) {
        const type = await db.getRunTypeById(
          input.runTypeId,
          ctx.scope.dataUserId
        );
        if (!type)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That run type is not in your palette.",
          });
        if (type.pathType !== input.pathType)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${type.label}" is a ${type.pathType} type, and this is a ${input.pathType} run.`,
          });
        runTypeFields = { runTypeId: type.id, runTypeLabel: type.label };
      }

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
        ...(input.startKind !== undefined
          ? { startKind: input.startKind }
          : {}),
        ...(input.endKind !== undefined ? { endKind: input.endKind } : {}),
        ...runTypeFields,
      };

      if (input.startKind !== undefined)
        await requireKnownKind(input.startKind, ctx.scope.dataUserId);
      if (input.endKind !== undefined)
        await requireKnownKind(input.endKind, ctx.scope.dataUserId);

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

  /**
   * Say what an already-traced run is — D3(b), the way to change it later.
   *
   * ── The name follows, and nothing has to be written to make it ────────────
   * `runName` reads the type's LIVE label first and the run's own `name` column
   * last (shared/takeoffCounts.ts), so retyping renames what is shown without
   * touching a row. That is also why this is safe today: nothing in the app can
   * rename a run by hand yet, so there is no chosen name to overwrite. When a
   * rename arrives it goes in FRONT of the type in that resolution order, which
   * is where `takeoffCounts.ts` already says it belongs — and this procedure
   * needs no change for it.
   *
   * ── The label snapshot moves with the link, always ────────────────────────
   * Both fields together, exactly as `save` does it, and the label is read off
   * the type here rather than accepted from the caller — so a run cannot be
   * retyped into claiming something its type does not say. The snapshot is what
   * survives the type being archived (drizzle/0058).
   */
  setRunType: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        /** Null detaches the run from the palette, leaving it untyped. */
        runTypeId: z.number().int().positive().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const run = await requireRun(input.id, ctx.scope.dataUserId);

      if (input.runTypeId === null) {
        await db.updateRun(input.id, ctx.scope.dataUserId, {
          runTypeId: null,
          runTypeLabel: null,
        });
        return { success: true, label: null };
      }

      const type = await db.getRunTypeById(
        input.runTypeId,
        ctx.scope.dataUserId
      );
      if (!type)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That run type is not in your palette.",
        });

      /*
        A cable type on a conduit run is refused rather than quietly converted.

        Changing `pathType` to match would change what the run MEASURES — a
        conduit run counts pipe once and wire per conductor, a cable run counts
        neither — so accepting it would rewrite a quantity as a side effect of
        picking from a list. Same refusal, same wording, as `save`.
      */
      if (type.pathType !== run.pathType)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${type.label}" is a ${type.pathType} type, and this is a ${run.pathType} run.`,
        });

      await db.updateRun(input.id, ctx.scope.dataUserId, {
        runTypeId: type.id,
        runTypeLabel: type.label,
      });
      return { success: true, label: type.label };
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
        /**
         * INSULATED conductors. The ground is counted separately, below.
         *
         * Bounded at 60: a raceway with more conductors is a data-entry slip.
         */
        conductorCount: z.number().int().min(1).max(60),
        /**
         * Grounds. One on almost every circuit, two on an isolated ground.
         *
         * ── DEFAULTS TO ZERO, and the tempting answer is 1 ─────────────────
         * A new circuit almost always has a ground, so defaulting to 1 reads as
         * the helpful choice. It is not, because of what the EXISTING caller
         * sends: the panel passes `conductorCount: 3` and nothing else, meaning
         * "2 and a ground" under the old convention — three wires. Defaulting
         * the ground to 1 would turn that same call into four wires, silently,
         * on every circuit anyone adds. A 33% wire increase with nothing on
         * screen to say so.
         *
         * So absent stays ZERO here, exactly as it is in the column (0061), in
         * `RunCircuit`, and in `circuitWire`. One meaning for "nobody said",
         * everywhere. The panel starts sending 2 and 1 explicitly when it
         * learns about grounds, and then the number is a person's, not a
         * default's.
         */
        groundCount: z.number().int().min(0).max(10).default(0),
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
        groundCount: input.groundCount,
      });
      return { id };
    }),

  updateCircuit: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: nameSchema.optional(),
        conductorCount: z.number().int().min(1).max(60).optional(),
        /**
         * Omitted leaves it alone, as with every other field here.
         *
         * Deliberately NOT defaulted on this path: an edit that names only the
         * conductor count must not silently give a circuit a ground it did not
         * have, which is the difference between changing what somebody typed
         * and changing what they did not.
         */
        groundCount: z.number().int().min(0).max(10).optional(),
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

      const heights = await heightContextForBid(
        input.bidId,
        ctx.scope.dataUserId,
        bid.distributionHeightInches
      );

      return totalQuantities(
        runs.map(run => ({
          run: {
            pathType: run.pathType as RunPathType,
            points: run.points ?? [],
          },
          circuits: circuits.filter(c => c.runId === run.id).map(circuitWire),
          ratio: ratioBySheet.get(run.sheetId) ?? null,
          verticals: verticalsForRunRow(run, heights),
        }))
      );
    }),

  /**
   * Change what is at a run's ends, after it has been traced.
   *
   * ── Every field is optional, and omitted means "leave it" ────────────────
   * The panel edits one thing at a time — a kind, a height, a stamp link — and
   * a mutation that took the whole shape would make each of those a chance to
   * clear the other two by forgetting them. Sending `null` is how a caller
   * clears something deliberately; sending nothing changes nothing.
   *
   * ── The stamp link is the double-count rule's teeth ──────────────────────
   * Linking a stamp to a run end is what tells the quantity code that this
   * drop belongs to the RUN, so the stamp must not carry it as well. It is set
   * by a person accepting the suggestion — never inferred from how close the
   * two happen to sit, which is right most of the time and silently wrong the
   * rest, with nothing on screen looking wrong.
   */
  setEnds: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        startKind: kindSchema.optional(),
        endKind: kindSchema.optional(),
        startHeightInches: runInchesSchema.optional(),
        endHeightInches: runInchesSchema.optional(),
        distributionHeightInches: runInchesSchema.optional(),
        startStampId: z.number().int().positive().nullable().optional(),
        endStampId: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const run = await requireRun(input.id, userId);

      if (input.startKind !== undefined)
        await requireKnownKind(input.startKind, userId);
      if (input.endKind !== undefined)
        await requireKnownKind(input.endKind, userId);

      // A stamp may only be claimed by a run on its OWN sheet. Linking across
      // sheets would suppress a vertical somewhere the estimator is not
      // looking, which is the one thing this link must never do quietly.
      const claiming = [input.startStampId, input.endStampId].filter(
        (id): id is number => typeof id === "number"
      );
      if (claiming.length > 0) {
        const onSheet = await db.getStampsForSheet(run.sheetId, userId);
        const ids = new Set(onSheet.map(stamp => stamp.id));
        for (const stampId of claiming) {
          if (!ids.has(stampId)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "That mark is not on this sheet.",
            });
          }
        }
      }

      const patch: Record<string, unknown> = {};
      const fields = [
        "startKind",
        "endKind",
        "startHeightInches",
        "endHeightInches",
        "distributionHeightInches",
        "startStampId",
        "endStampId",
      ] as const;
      for (const field of fields) {
        if (input[field] !== undefined) patch[field] = input[field];
      }
      if (Object.keys(patch).length === 0) return { ok: true };

      await db.updateRun(input.id, userId, patch);
      return { ok: true };
    }),
});
