/**
 * Run types — the palette a run is traced under.
 *
 * ── Why this is a library router and not a per-bid one ──────────────────────
 * A counted group (takeoffGroupsRouter) is per bid, because "14 exit signs on
 * this school" is a fact about one job. A run type is the opposite kind of
 * thing: "3/4in EMT, 3 #12 THHN" is the same definition on every job this
 * contractor will ever bid. So it is scoped to the USER and behaves like the
 * material catalog — shipped rows everyone shares, the contractor's own
 * alongside them, and editing a shipped row forks it rather than changing it
 * for everybody.
 *
 * ── The decision this implements ────────────────────────────────────────────
 * D3(a) in references/takeoff-spec.md, made 2026-09-14 and reconciled into
 * § 2.0 of the overhaul document on 2026-09-18: a run says what it is by being
 * traced under a type that was chosen before the first click and stays armed,
 * exactly as the mark tool holds a counted group. The alternative — a form of
 * fields on every finished run — was rejected by name as bloat.
 *
 * ── What lives here and what does not ───────────────────────────────────────
 * The TYPE owns what a run IS: raceway, conductor, count, and the name every
 * run of it inherits. The RUN owns where it is and how long — its points, its
 * location, its ends, its heights. Circuits are what a new run STARTS with,
 * never a constraint: a particular run may carry two circuits in one pipe, and
 * § 2.1 is emphatic that the app must never decide that for the estimator.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import { RUN_PATH_TYPES } from "../../drizzle/schema";
import * as db from "../db";

/**
 * Gated on bids rather than on a library permission, deliberately: this palette
 * is reached from the takeoff screen while tracing, and somebody who can trace
 * a run can define what it is made of.
 */
const procedure = scoped("bids.view", "bids.edit");

const labelSchema = z
  .string()
  .trim()
  .min(1, "Give it a name — that is what every run of it will be called.")
  .max(255);

/**
 * INSULATED conductors in one circuit. The ground is counted separately.
 *
 * ── This used to say "INCLUDING the ground", and the note predicted its own
 *    replacement ──────────────────────────────────────────────────────────
 * It said § 2.1 recorded separating the ground as the right call and
 * mechanical to migrate, and that until then this file must not invent a second
 * convention "because two meanings for one number is worse than one imperfect
 * meaning". That happened on 2026-09-20: migrations 0061-0064 split the ground
 * into its own column and its own count, and the shipped type labelled
 * "2 #12 + ground" now stores a 2 and a 1 rather than a 3 that had to be
 * explained.
 *
 * The old note was right to refuse a second convention while only one column
 * existed. There are two columns now, so there is one meaning each.
 */
const conductorCountSchema = z.number().int().min(1).max(100).nullable();

/**
 * Grounds in one circuit of this type. NULL means the type does not say.
 *
 * Null rather than 0 for the same reason `conductorCount` is nullable: a
 * half-defined type is honest about what it has not been told, and a zero here
 * would be a claim that this run carries no ground.
 */
const groundCountSchema = z.number().int().min(0).max(10).nullable();

async function requireOwnType(id: number, userId: number) {
  const type = await db.getRunTypeById(id, userId);
  if (!type)
    throw new TRPCError({ code: "NOT_FOUND", message: "Run type not found." });
  return type;
}

/** Refuse a name already in the palette. Same reasoning as a counted group. */
async function refuseDuplicate(
  userId: number,
  label: string,
  pathType: (typeof RUN_PATH_TYPES)[number],
  exceptId?: number
) {
  const all = await db.getRunTypesFor(userId, true);
  const wanted = label.trim().toLowerCase();
  const clash = all.find(
    t =>
      t.label.trim().toLowerCase() === wanted &&
      t.pathType === pathType &&
      t.id !== exceptId
  );
  if (clash) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Your palette already has a ${pathType} type called "${clash.label}".`,
    });
  }
}

export const takeoffRunTypesRouter = router({
  /**
   * The palette: shipped types and the contractor's own, in one list.
   *
   * Each carries how many runs are traced under it — read from the runs
   * themselves rather than stored, for the same reason a count is: a stored
   * total is a second source of truth that drifts the moment a run is deleted.
   */
  list: procedure
    .input(
      z
        .object({ includeArchived: z.boolean().default(false) })
        .optional()
        .default({ includeArchived: false })
    )
    .query(async ({ input, ctx }) => {
      const [types, counts] = await Promise.all([
        db.getRunTypesFor(ctx.scope.dataUserId, input.includeArchived),
        db.countRunsByType(ctx.scope.dataUserId),
      ]);

      /*
        The two materials, resolved to NAMES, in one query.

        Sent from here rather than looked up on the client, because the client
        that needs them most — the takeoff screen — does not fetch the material
        catalog at all and should not have to pull one in to print "3/4in EMT"
        on a run row. It is two ids per type and one round trip for all of them.

        A link that resolves to nothing comes back null rather than as a
        dangling id: `set null` on delete means a retired material leaves the
        type readable, and the palette already says what a type with nothing
        behind it cannot do.
      */
      const byId = new Map(
        (
          await db.getMaterialsByIds(
            types.flatMap(t =>
              [
                t.racewayMaterialId,
                t.conductorMaterialId,
                t.groundMaterialId,
              ].filter((id): id is number => id !== null)
            ),
            ctx.scope.dataUserId
          )
        ).map(m => [m.id, m])
      );
      const nameOf = (id: number | null) =>
        id === null ? null : (byId.get(id)?.name ?? null);

      return types.map(type => ({
        id: type.id,
        label: type.label,
        pathType: type.pathType,
        racewayMaterialId: type.racewayMaterialId,
        conductorMaterialId: type.conductorMaterialId,
        groundMaterialId: type.groundMaterialId,
        /** Resolved above. Null for no link AND for a link that no longer resolves. */
        racewayMaterialName: nameOf(type.racewayMaterialId),
        conductorMaterialName: nameOf(type.conductorMaterialId),
        groundMaterialName: nameOf(type.groundMaterialId),
        conductorCount: type.conductorCount,
        groundCount: type.groundCount,
        status: type.status,
        /** True for a row the app ships. Read-only until it is forked. */
        isShipped: type.userId === null,
        /**
         * Whether this still needs a specification.
         *
         * Read from the absence itself — the same convention as an unpriced
         * material being the one whose cost is 0, rather than a second flag
         * that can drift out of step with the thing it describes.
         */
        /*
          The ground is deliberately NOT part of this test.

          A type with a raceway and a conductor is specified; one that also
          names a ground is specified in more detail. Counting the ground here
          would push every type that predates the split back into "needs a
          specification" on the day it shipped, which is a screen full of
          warnings about work nobody did wrong.
        */
        needsSpecification:
          type.racewayMaterialId === null && type.conductorMaterialId === null,
        runCount: counts.get(type.id) ?? 0,
      }));
    }),

  /** Define a new kind of run. */
  create: procedure
    .input(
      z.object({
        label: labelSchema,
        pathType: z.enum(RUN_PATH_TYPES),
        racewayMaterialId: z.number().int().positive().nullable().default(null),
        conductorMaterialId: z
          .number()
          .int()
          .positive()
          .nullable()
          .default(null),
        conductorCount: conductorCountSchema.default(null),
        /** The ground wire itself — bare copper, or the green insulated one. */
        groundMaterialId: z.number().int().positive().nullable().default(null),
        groundCount: groundCountSchema.default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await refuseDuplicate(ctx.scope.dataUserId, input.label, input.pathType);
      const id = await db.createRunType({
        userId: ctx.scope.dataUserId,
        label: input.label,
        pathType: input.pathType,
        racewayMaterialId: input.racewayMaterialId,
        conductorMaterialId: input.conductorMaterialId,
        conductorCount: input.conductorCount,
        groundMaterialId: input.groundMaterialId,
        groundCount: input.groundCount,
      });
      return { id, label: input.label, pathType: input.pathType };
    }),

  /**
   * Change one. Editing a shipped type forks it first.
   *
   * The fork happens here rather than being something the caller has to
   * remember, because forgetting it would mean editing a row every other
   * contractor shares — the failure the rule exists to prevent, and one nobody
   * would notice from their own screen.
   */
  update: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        label: labelSchema.optional(),
        racewayMaterialId: z.number().int().positive().nullable().optional(),
        conductorMaterialId: z.number().int().positive().nullable().optional(),
        conductorCount: conductorCountSchema.optional(),
        groundMaterialId: z.number().int().positive().nullable().optional(),
        groundCount: groundCountSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const target = await requireOwnType(input.id, ctx.scope.dataUserId);

      const id =
        target.userId === null
          ? await db.forkRunType(target.id, ctx.scope.dataUserId)
          : target.id;

      if (input.label !== undefined) {
        await refuseDuplicate(
          ctx.scope.dataUserId,
          input.label,
          target.pathType,
          id
        );
      }

      const { id: _ignored, ...rest } = input;
      await db.updateRunType(id, ctx.scope.dataUserId, rest);
      return { id, forked: id !== target.id };
    }),

  /**
   * Withdraw a type from the palette without losing what points at it.
   *
   * Retire, never delete: a run traced under this type keeps reading it, and
   * keeps its own snapshot of the label besides. Deleting instead would strip
   * the link from measured work somebody traced by hand — see
   * drizzle/0058 on why that foreign key is SET NULL rather than CASCADE.
   */
  archive: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await requireOwnType(input.id, ctx.scope.dataUserId);
      if (target.userId === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A shipped type cannot be archived. Edit it to make it yours first.",
        });
      }
      const counts = await db.countRunsByType(ctx.scope.dataUserId);
      await db.updateRunType(input.id, ctx.scope.dataUserId, {
        status: "archived",
        archivedAt: new Date(),
      });
      return { id: input.id, runsKept: counts.get(input.id) ?? 0 };
    }),

  restore: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnType(input.id, ctx.scope.dataUserId);
      await db.updateRunType(input.id, ctx.scope.dataUserId, {
        status: "active",
        archivedAt: null,
      });
      return { id: input.id };
    }),
});
