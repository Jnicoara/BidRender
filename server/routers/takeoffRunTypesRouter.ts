/**
 * Run types — the palette a run is traced under.
 *
 * ── Why this is a library router and not a per-bid one ──────────────────────
 * A counted group (takeoffGroupsRouter) is per bid, because "14 exit signs on
 * this school" is a fact about one job. A run type is the opposite kind of
 * thing: "3/4in EMT, 3 #12 THHN" is the same definition on every job this
 * contractor will ever bid. So it is a COMPANY library and behaves like the
 * material catalog — shipped rows everyone shares, the company's own
 * alongside them, and editing a shipped row forks it rather than changing it
 * for everybody.
 *
 * ── Company-wide, and it always was ─────────────────────────────────────────
 * This said "scoped to the USER" until 2026-09-26, and was read as meaning a
 * second member could not see the first one's types. They always could: every
 * procedure here reads and writes under `ctx.scope.dataUserId`, which is the
 * company OWNER's id (schema.ts, the companies block), so a type any member
 * makes is filed under the owner and read back by all of them. The column is
 * still called `userId` because that is how every company table is keyed.
 * `server/seats.test.ts` § "run types" pins both directions and the isolation
 * between companies. Never write `ctx.scope.actorUserId` here.
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
import { resolveMaterial } from "../../shared/materialLookup";
import { resolveRunType } from "../../shared/runTypeLookup";
import { extraNumber } from "../../shared/runExtras";
import {
  runTypeRows,
  runRowSendability,
  type RunTypeRow,
} from "../../shared/takeoffBridge";
import { EXTRA_APPLIES_TO, runLineSlot } from "../../shared/runExtrasPerFoot";
import {
  EMT_FITTING_STYLES,
  fittingRowSendability,
  fittingRowSpeaks,
  pickIsPriced,
} from "../../shared/runFittingMaterials";
import { materialItemKey } from "../../shared/materialMarkup";
import { renamedTo } from "../../shared/renamedMaterials";
import { isFittingRole, laborInRunRate } from "../../shared/runFittings";
import { resendPlan, swapText, type ResendPlan } from "../../shared/resendLine";
import { footageByRunType } from "../runTypeFootage";
import { MARK_COLORS } from "../../shared/takeoffMarks";
import { RUN_MATERIAL_ROLES } from "../../drizzle/schema";
import {
  extraPctSchema,
  makeupByKindSchema,
  makeupInchesSchema,
  pctText,
  refuseUnknownKinds,
} from "../extrasInput";
import * as db from "../db";
import { refuseSendIfLocked } from "../lockGuard";

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

/**
 * The fitting style and the three named fittings (0082). All optional and
 * nullable: omitted leaves a field alone, null clears it — a form is a patch
 * (CLAUDE.md § rule 7). NULL style reads as set-screw; NULL override means
 * "look it up in the catalog".
 */
const fittingFields = {
  fittingStyle: z.enum(EMT_FITTING_STYLES).nullable().optional(),
  couplingMaterialId: z.number().int().positive().nullable().optional(),
  connectorMaterialId: z.number().int().positive().nullable().optional(),
  strapMaterialId: z.number().int().positive().nullable().optional(),
  // The bend parts (0084), the same way.
  elbow90MaterialId: z.number().int().positive().nullable().optional(),
  elbow45MaterialId: z.number().int().positive().nullable().optional(),
  lbMaterialId: z.number().int().positive().nullable().optional(),
  pullBoxMaterialId: z.number().int().positive().nullable().optional(),
};

/**
 * What a run-type line is called: the type, then what this row is — unless
 * that just says it twice. One function, because Send and a style swap both
 * name lines and must name them the same way.
 */
function runLineName(typeLabel: string, materialName: string | null): string {
  // A shipped type's label is the cable's OLD name ("12-2 MC cable" — labels
  // never follow a rename, see baselineRunTypes.ts), so "says it twice"
  // includes the label renaming to the material: "12-2 MC cable — 12/2 MC
  // cable Copper" is the same words twice (rename audit 2026-10-07).
  const sameThing =
    materialName === typeLabel || renamedTo(typeLabel) === materialName;
  return materialName && !sameThing
    ? typeLabel + " — " + materialName
    : typeLabel;
}

/**
 * Send-again's plan for each role already on the bid — refill, swap or keep
 * (`shared/resendLine.ts`). Used by BOTH the preview and the send, so what
 * the panel promises is what the button does.
 *
 * Parts are compared by `materialItemKey`, which survives a fork: the line
 * may have been sent with the shipped row and the type now resolves to the
 * company's copy of the same part, which is not a swap.
 */
async function resendPlans(
  userId: number,
  candidates: readonly {
    role: string;
    /** Which extra, on an `extra` candidate; 0 or absent on every other. */
    extraKey?: number;
    materialId: number | null;
  }[],
  liveLines: readonly {
    runMaterialRole: string | null;
    runExtraKey: number;
    runMaterialId: number | null;
    snapshotMaterialCost: string | null;
    snapshotLaborHours: string | null;
  }[]
): Promise<Map<string, ResendPlan>> {
  const ids = [
    ...candidates.map(c => c.materialId),
    ...liveLines.map(l => l.runMaterialId),
  ].filter((id): id is number => id !== null);
  const rows = ids.length ? await db.getMaterialsByIds(ids, userId) : [];
  const part = (id: number | null) => {
    if (id === null) return null;
    const m = resolveMaterial(rows, id);
    return m
      ? { key: materialItemKey(m), name: m.name, costPerUnit: m.costPerUnit }
      : null;
  };
  const plans = new Map<string, ResendPlan>();
  for (const candidate of candidates) {
    // By SLOT, not role: a type's two extras are two lines (0136).
    const slot = runLineSlot(candidate.role, candidate.extraKey);
    const line = liveLines.find(
      l => runLineSlot(l.runMaterialRole, l.runExtraKey) === slot
    );
    if (!line) continue;
    const current =
      candidate.materialId === null
        ? undefined
        : resolveMaterial(rows, candidate.materialId);
    plans.set(
      slot,
      resendPlan({
        isFitting: isFittingRole(candidate.role),
        // Couplings, connectors and straps: the run's per-foot rate pays
        // their labor, so Send again never fills hours in on them.
        laborInRunRate: laborInRunRate(candidate.role),
        // A field bend is priced by hours on its raceway, never by cost.
        laborOnly: candidate.role === "fieldBend",
        linePart: part(line.runMaterialId),
        currentPart: part(candidate.materialId),
        lineCost: line.snapshotMaterialCost,
        lineHours: line.snapshotLaborHours,
        currentHours:
          (candidate.role === "fieldBend"
            ? current?.fieldBendLaborHours
            : current?.laborHours) ?? null,
      })
    );
  }
  return plans;
}

/** A run-type row's place on the bid: role, and for an extra which one. */
function slotOf(row: { role: string; extraKey: number }): string {
  return runLineSlot(row.role, row.extraKey);
}

/**
 * Each live EXTRA line's "shared trench" answer (0136 `extraFeetPerFoot`),
 * by extra key: 0 is the answer, NULL follows the type. Fed to `runTypeRows`
 * so the preview and a refresh say the same number the bid line does.
 */
function sharedTrenchAnswers(
  lines: readonly {
    runMaterialRole: string | null;
    runExtraKey: number;
    extraFeetPerFoot: string | null;
  }[]
): Map<number, number | null> {
  return new Map(
    lines
      .filter(line => line.runMaterialRole === "extra")
      .map(line => [
        line.runExtraKey,
        line.extraFeetPerFoot === null ? null : Number(line.extraFeetPerFoot),
      ])
  );
}

/** Feet of an extra per foot of run: more than 0 (0 is the per-BID answer). */
const extraFeetPerFootSchema = z.number().positive().max(100);

/** Refuse a material that is not this company's to use, or not sold by the foot. */
async function requireFootSoldMaterial(materialId: number, userId: number) {
  const material = resolveMaterial(
    await db.getMaterialsByIds([materialId], userId),
    materialId
  );
  if (!material)
    throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });
  if (material.unitOfSale !== "foot")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${material.name} is not sold by the foot, so it cannot follow a run's length. Choose a material sold by the foot.`,
    });
  return material;
}

/**
 * The company's own copy of an extra, forking its type first when the extra
 * is shipped — so an edit never writes a shipped row. The fork's copy is
 * found by `baselineExtraId`, which `forkRunType` sets.
 */
async function ownExtra(id: number, userId: number) {
  const extra = await db.getRunTypeExtraById(id, userId);
  if (!extra)
    throw new TRPCError({ code: "NOT_FOUND", message: "Extra not found." });
  if (extra.userId !== null)
    return { id: extra.id, runTypeId: extra.runTypeId, forked: false };
  /*
    A shipped extra on a shipped type. If the company already forked the
    type, edit that fork's copy; otherwise fork now.
  */
  const palette = await db.getRunTypesFor(userId, true);
  const current = resolveRunType(palette, extra.runTypeId);
  const forkId =
    current && current.userId !== null
      ? current.id
      : await db.forkRunType(extra.runTypeId, userId);
  const copy = await db.getForkedExtra(forkId, extra.id, userId);
  if (!copy)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Your copy of this run type no longer carries this extra.",
    });
  return { id: copy.id, runTypeId: forkId, forked: true };
}

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
  /**
   * The type being edited. Its whole LINEAGE is exempt — the shipped row and
   * every fork of it, archived ones included.
   *
   * This used to exempt one id, the fork, so editing a shipped type that the
   * company had once forked and archived was refused as a duplicate of ITS
   * OWN archived copy: "already has a conduit type called 1/2" EMT, 2 #12 +
   * ground". Found 2026-09-26 by saving a fitting style on the fixture bid.
   */
  except?: { id: number; baselineId: number | null }
) {
  const all = await db.getRunTypesFor(userId, true);
  const wanted = label.trim().toLowerCase();
  const root = except ? (except.baselineId ?? except.id) : null;
  const clash = all.find(
    t =>
      t.label.trim().toLowerCase() === wanted &&
      t.pathType === pathType &&
      (root === null || (t.id !== root && t.baselineId !== root))
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
      /*
        RESOLVED, not keyed by id — and the difference is a wrong number.

        `getMaterialsByIds` returns a MERGED list, in which a forked material
        appears under its own new id while the run type still stores the
        baseline's. A `Map` on `row.id` therefore misses every fork, which is
        how the palette came to say "No labor units yet" about a type whose
        pipe the user had priced minutes earlier. Measured 2026-09-20.
      */
      const visible = await db.getMaterialsByIds(
        types.flatMap(t =>
          [
            t.racewayMaterialId,
            t.conductorMaterialId,
            t.groundMaterialId,
            t.couplingMaterialId,
            t.connectorMaterialId,
            t.strapMaterialId,
            t.elbow90MaterialId,
            t.elbow45MaterialId,
            t.lbMaterialId,
            t.pullBoxMaterialId,
          ].filter((id): id is number => id !== null)
        ),
        ctx.scope.dataUserId
      );
      const materialFor = (id: number | null) =>
        id === null ? undefined : resolveMaterial(visible, id);
      const nameOf = (id: number | null) => materialFor(id)?.name ?? null;
      /*
        The labour unit travels with the name, from the row already fetched.

        Sent rather than resolved on the client for the reason the names are:
        the takeoff screen does not fetch the material catalog and must not have
        to pull one in to say what a foot of 3/4in EMT takes. Undefined for a
        link that resolves to nothing, which `laborPerFootForRunType` reads as
        unset — a retired material leaves the type readable and honestly
        incomplete, never quietly free.
      */
      const laborOf = (id: number | null) =>
        materialFor(id)?.laborHours ?? null;

      return types.map(type => ({
        id: type.id,
        label: type.label,
        pathType: type.pathType,
        // The chosen color, for the editor to open on (Part B). What is DRAWN
        // comes from takeoffRuns.typeColors, which reads the same column.
        color: type.color,
        racewayMaterialId: type.racewayMaterialId,
        conductorMaterialId: type.conductorMaterialId,
        groundMaterialId: type.groundMaterialId,
        /** Resolved above. Null for no link AND for a link that no longer resolves. */
        racewayMaterialName: nameOf(type.racewayMaterialId),
        conductorMaterialName: nameOf(type.conductorMaterialId),
        groundMaterialName: nameOf(type.groundMaterialId),
        /*
          Hours per unit of sale for each slot, so the palette can say what a
          foot of this type costs. Listed one by one rather than spread from
          the row, because this mapping feeds a SCREEN — CLAUDE.md § "Where to
          be structural, and where to be explicit". The ARITHMETIC over them is
          structural, and lives in `runTypeComponentsPerFoot`.
        */
        racewayLaborHours: laborOf(type.racewayMaterialId),
        conductorLaborHours: laborOf(type.conductorMaterialId),
        groundLaborHours: laborOf(type.groundMaterialId),
        conductorCount: type.conductorCount,
        groundCount: type.groundCount,
        /**
         * This type's own extra and makeup (0090). NULL follows the company,
         * which the editor shows as a placeholder rather than a zero.
         * Percentages as fractions.
         */
        conduitExtraPct: extraNumber(type.conduitExtraPct),
        wireExtraPct: extraNumber(type.wireExtraPct),
        makeupDeviceInches: type.makeupDeviceInches,
        makeupPanelInches: type.makeupPanelInches,
        makeupByKindInches: type.makeupByKindInches,
        /** NULL reads as set-screw on EMT; ignored on other raceways. */
        fittingStyle: type.fittingStyle,
        couplingMaterialId: type.couplingMaterialId,
        connectorMaterialId: type.connectorMaterialId,
        strapMaterialId: type.strapMaterialId,
        couplingMaterialName: nameOf(type.couplingMaterialId),
        connectorMaterialName: nameOf(type.connectorMaterialId),
        strapMaterialName: nameOf(type.strapMaterialId),
        elbow90MaterialId: type.elbow90MaterialId,
        elbow45MaterialId: type.elbow45MaterialId,
        lbMaterialId: type.lbMaterialId,
        pullBoxMaterialId: type.pullBoxMaterialId,
        elbow90MaterialName: nameOf(type.elbow90MaterialId),
        elbow45MaterialName: nameOf(type.elbow45MaterialId),
        lbMaterialName: nameOf(type.lbMaterialId),
        pullBoxMaterialName: nameOf(type.pullBoxMaterialId),
        /**
         * Hours per field bend on the raceway (0084). Undefined-safe like the
         * labor units above: NULL for no raceway and for a raceway with none.
         */
        racewayFieldBendLaborHours:
          materialFor(type.racewayMaterialId)?.fieldBendLaborHours ?? null,
        status: type.status,
        /**
         * The shipped row this forks, so the screen can follow a run's STORED
         * id to the fork it now means (shared/runTypeLookup.ts) instead of
         * finding nothing and calling the run unspecified.
         */
        baselineId: type.baselineId,
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
        ...fittingFields,
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
        fittingStyle: input.fittingStyle ?? null,
        couplingMaterialId: input.couplingMaterialId ?? null,
        connectorMaterialId: input.connectorMaterialId ?? null,
        strapMaterialId: input.strapMaterialId ?? null,
        elbow90MaterialId: input.elbow90MaterialId ?? null,
        elbow45MaterialId: input.elbow45MaterialId ?? null,
        lbMaterialId: input.lbMaterialId ?? null,
        pullBoxMaterialId: input.pullBoxMaterialId ?? null,
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
        ...fittingFields,
        /**
         * A chosen color (Part B), or null for automatic. Only the six count
         * colors: anything else is refused here rather than stored and then
         * quietly not drawn. On a shipped type this forks it, like every
         * other field (owner, 2026-09-27).
         */
        color: z.enum(MARK_COLORS).nullable().optional(),
        /*
          EXTRA AND MAKEUP for this type (0090; held-migrations plan § 1).
          NULL follows the company; omitted leaves it. Percentages are
          fractions. `makeupByKindInches` maps a height type's key to its own
          makeup on this type — a nearer level than any company figure (Q10).
        */
        conduitExtraPct: extraPctSchema.nullable().optional(),
        wireExtraPct: extraPctSchema.nullable().optional(),
        makeupDeviceInches: makeupInchesSchema.nullable().optional(),
        makeupPanelInches: makeupInchesSchema.nullable().optional(),
        makeupByKindInches: makeupByKindSchema.nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const target = await requireOwnType(input.id, ctx.scope.dataUserId);
      if (input.makeupByKindInches) {
        await refuseUnknownKinds(
          Object.keys(input.makeupByKindInches),
          ctx.scope.dataUserId
        );
      }

      /*
        REFUSE BEFORE FORKING. The check ran after the fork until 2026-09-26,
        so every refused save of a shipped type left a new, unedited fork
        behind — two of them from two clicks on the fixture bid.
      */
      if (input.label !== undefined) {
        await refuseDuplicate(
          ctx.scope.dataUserId,
          input.label,
          target.pathType,
          target
        );
      }

      const id =
        target.userId === null
          ? await db.forkRunType(target.id, ctx.scope.dataUserId)
          : target.id;

      const { id: _ignored, conduitExtraPct, wireExtraPct, ...rest } = input;
      await db.updateRunType(id, ctx.scope.dataUserId, {
        ...rest,
        // DECIMAL columns take a string; omitted stays omitted.
        ...(conduitExtraPct !== undefined
          ? { conduitExtraPct: pctText(conduitExtraPct) }
          : {}),
        ...(wireExtraPct !== undefined
          ? { wireExtraPct: pctText(wireExtraPct) }
          : {}),
      });
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

  /**
   * A type's EXTRAS (per-foot-items-plan.md § 3a) — tape and the like, each a
   * foot-sold material that follows the traced length. Read off the RESOLVED
   * type, so a shipped type the company forked shows the fork's extras.
   */
  extras: procedure
    .input(z.object({ runTypeId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const palette = await db.getRunTypesFor(ctx.scope.dataUserId, true);
      const type = resolveRunType(palette, input.runTypeId);
      if (!type)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Run type not found.",
        });
      const rows = await db.getRunTypeExtrasDetailed(
        ctx.scope.dataUserId,
        type.id
      );
      return { runTypeId: type.id, extras: rows };
    }),

  /**
   * Add an extra to a type. A SHIPPED type forks first, like every other edit
   * to one, and the fork copies its extras (`forkRunType`) — so the shop's
   * tape stays and the new extra joins it. Foot-sold materials only: an
   * extra is so many feet per foot of run, and a part sold by the each would
   * price as a length.
   */
  addExtra: procedure
    .input(
      z.object({
        runTypeId: z.number().int().positive(),
        materialId: z.number().int().positive(),
        feetPerFoot: extraFeetPerFootSchema,
        appliesTo: z.enum(EXTRA_APPLIES_TO),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireOwnType(input.runTypeId, ctx.scope.dataUserId);
      await requireFootSoldMaterial(input.materialId, ctx.scope.dataUserId);
      // RESOLVED: a shipped type the company already forked adds to that
      // fork, never forks a second time.
      const target = resolveRunType(
        await db.getRunTypesFor(ctx.scope.dataUserId, true),
        input.runTypeId
      );
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Run type not found.",
        });
      const runTypeId =
        target.userId === null
          ? await db.forkRunType(target.id, ctx.scope.dataUserId)
          : target.id;
      const id = await db.createRunTypeExtra({
        userId: ctx.scope.dataUserId,
        runTypeId,
        materialId: input.materialId,
        feetPerFoot: input.feetPerFoot,
        appliesTo: input.appliesTo,
      });
      return { id, runTypeId, forked: runTypeId !== target.id };
    }),

  /**
   * Edit an extra. One on a SHIPPED type forks the type and edits the fork's
   * copy — the shipped row is never written. Re-prices every run of the type
   * on every bid still following it; a bid that answered "shared trench"
   * keeps its 0, which lives on its line.
   */
  updateExtra: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        materialId: z.number().int().positive().optional(),
        feetPerFoot: extraFeetPerFootSchema.optional(),
        appliesTo: z.enum(EXTRA_APPLIES_TO).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.materialId !== undefined)
        await requireFootSoldMaterial(input.materialId, ctx.scope.dataUserId);
      const own = await ownExtra(input.id, ctx.scope.dataUserId);
      const { id: _id, ...patch } = input;
      await db.updateRunTypeExtra(own.id, ctx.scope.dataUserId, patch);
      return { id: own.id, runTypeId: own.runTypeId, forked: own.forked };
    }),

  /** Remove an extra. Shipped: forks the type and removes the fork's copy. */
  removeExtra: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const own = await ownExtra(input.id, ctx.scope.dataUserId);
      await db.deleteRunTypeExtra(own.id, ctx.scope.dataUserId);
      return { runTypeId: own.runTypeId, forked: own.forked };
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

  /**
   * What each run type on this bid would put on it — R2, the bridge.
   *
   * One entry per type, each holding one ROW PER MATERIAL: pipe, wire, ground.
   * Three purchases at three prices, which is what § 5f.2 requires and what the
   * materials list already does. A cable type has one row; an empty conduit run
   * for future use has one row too, and that is a real thing to bid.
   *
   * Footage is derived here and never stored, the same rule a counted group's
   * quantity follows: a stored total is a second source of truth that drifts
   * the moment somebody edits a run.
   */
  bridgeForBid: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const bid = await db.getBidById(input.bidId, ctx.scope.dataUserId);
      if (!bid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

      const [types, footage, lines] = await Promise.all([
        db.getRunTypesFor(ctx.scope.dataUserId, true),
        footageByRunType(
          input.bidId,
          ctx.scope.dataUserId,
          bid.distributionHeightInches
        ),
        db.getBidLineItems(input.bidId),
      ]);

      const onBid = new Set(
        lines
          .filter(
            line => line.archivedAt === null && line.takeoffRunTypeId !== null
          )
          .map(
            line =>
              line.takeoffRunTypeId +
              ":" +
              runLineSlot(line.runMaterialRole, line.runExtraKey)
          )
      );

      /*
        RESOLVED, not filtered by id, and the difference is missing footage.

        A run stores the id it was traced under. Editing a shipped type forks
        it and `mergeLibraryRows` hides the baseline, so filtering the merged
        palette by the stored ids finds nothing for exactly those types — on
        the dev fixture that silently dropped two 1/2" EMT homeruns and a 12-2
        MC run, leaving a bid with less pipe than the drawing. Measured
        2026-09-20. See shared/runTypeLookup.ts.

        The STORED id is what a bid line records, so the line and the runs can
        be matched again; only the label and materials come from the fork.
      */
      const visible = Array.from(footage.keys())
        .map(storedId => ({ storedId, type: resolveRunType(types, storedId) }))
        .filter(
          (
            entry
          ): entry is { storedId: number; type: (typeof types)[number] } =>
            entry.type !== undefined
        );
      const materials = await db.getMaterialsByIds(
        visible.flatMap(({ type: t }) =>
          [
            t.racewayMaterialId,
            t.conductorMaterialId,
            t.groundMaterialId,
          ].filter((id): id is number => id !== null)
        ),
        ctx.scope.dataUserId
      );
      const nameOf = (id: number | null) =>
        id === null ? null : (resolveMaterial(materials, id)?.name ?? null);
      const fittingsByType = await db.fittingRowsByRunType(
        ctx.scope.dataUserId,
        footage
      );
      // Each type's EXTRAS (tape), off the RESOLVED type, like its materials.
      const extrasByType = await db.getRunTypeExtrasFor(
        ctx.scope.dataUserId,
        visible.map(({ type: t }) => t.id)
      );

      return Promise.all(
        visible.map(async ({ storedId, type }) => {
          // Present by construction: `visible` is built FROM the footage map.
          const f = footage.get(storedId)!;
          const fittingRowsHere = fittingsByType.get(storedId) ?? [];
          const rows = runTypeRows({
            pathType: type.pathType,
            racewayMaterialId: type.racewayMaterialId,
            racewayMaterialName: nameOf(type.racewayMaterialId),
            conductorMaterialId: type.conductorMaterialId,
            conductorMaterialName: nameOf(type.conductorMaterialId),
            groundMaterialId: type.groundMaterialId,
            groundMaterialName: nameOf(type.groundMaterialId),
            // The footage ROW, not a restatement of it: bought and installed
            // both arrive, and a figure added to the row later cannot be left
            // behind here.
            footage: f,
            extras: extrasByType.get(type.id) ?? [],
            // A live line's "shared trench" answer moves its preview too.
            lineFeetPerFootByKey: sharedTrenchAnswers(
              lines.filter(
                l => l.takeoffRunTypeId === storedId && l.archivedAt === null
              )
            ),
          });
          /*
          What Send-again would do to each line ALREADY on the bid — the same
          plan the send applies (`resendPlans`), so the preview can say
          "set-screw coupling → compression coupling, 9" or "price filled in"
          before anybody presses anything. Nothing on a locked bid.
        */
          const plans =
            bid.quantitiesLockedAt === null
              ? await resendPlans(
                  ctx.scope.dataUserId,
                  [
                    ...rows.map(r => ({
                      role: r.role,
                      extraKey: r.extraKey,
                      materialId: r.materialId,
                    })),
                    ...fittingRowsHere.map(r => ({
                      role: r.role,
                      materialId: r.pick.ok ? r.pick.materialId : null,
                    })),
                  ],
                  lines.filter(
                    l =>
                      l.takeoffRunTypeId === storedId && l.archivedAt === null
                  )
                )
              : new Map<string, ResendPlan>();
          const resendOf = (slot: string, qty: number) => {
            const plan = plans.get(slot);
            if (!plan || plan.kind === "keep") return null;
            switch (plan.kind) {
              case "swap":
                return {
                  kind: "swap" as const,
                  text: swapText(plan.from, plan.to, qty),
                };
              case "refill":
                return {
                  kind: "refill" as const,
                  price: plan.price,
                  hours: plan.hours,
                };
            }
          };
          return {
            // The id the RUNS use, which is what a bid line records.
            runTypeId: storedId,
            label: type.label,
            pathType: type.pathType,
            /** Said out loud, so a smaller number has a reason beside it. */
            unmeasurableCount: f.unmeasurableCount,
            unansweredCount: f.unansweredCount,
            branchCount: f.branchCount,
            /**
             * The pipe (or cable) from QUANTITY traces, already inside the
             * rows' feet — the split the panel shows beside one bid line
             * (D21, answer 3), never a second amount.
             */
            quantityFeet: f.quantityFeet,
            rows: rows.map(row => ({
              role: row.role,
              /** Which extra, on an `extra` row; 0 on the others (0136). */
              extraKey: row.extraKey,
              /** How an extra's feet were reached; null on the others. */
              why: row.why,
              /** The same without "N ft of <name>:", for the panel row. */
              how: row.how,
              materialId: row.materialId,
              materialName: row.materialName,
              feet: row.feet,
              onBid: onBid.has(storedId + ":" + slotOf(row)),
              sendable: runRowSendability(row),
              resend: resendOf(slotOf(row), row.feet),
            })),
            /*
            The fittings, counted from the same runs. Every one carries `why`,
            the sentence that says how it was worked out — the screen shows it
            beside the number, never the number alone. `priced` is false for a
            matched material at $0, so the preview says "Not priced" instead
            of printing a price nobody chose.
          */
            fittings: fittingRowsHere.map(row => ({
              role: row.role,
              status: row.count.status,
              qty: row.qty,
              atLeast: row.count.status === "counted" && row.count.atLeast,
              why: row.count.why,
              materialId: row.pick.ok ? row.pick.materialId : null,
              materialName: row.pick.ok ? row.pick.name : null,
              materialProblem: row.pick.ok ? null : row.pick.why,
              fromOverride: row.pick.ok && row.pick.override,
              // A field bend is priced by its HOURS, a part by its cost.
              priced: pickIsPriced(row.pick),
              onBid: onBid.has(storedId + ":" + row.role),
              sendable: fittingRowSendability(row),
              resend: resendOf(row.role, row.qty),
            })),
          };
        })
      );
    }),

  /**
   * Send one run type's footage to the bid — every row that can go.
   *
   * Rows that cannot are SKIPPED rather than refusing the whole send, and the
   * result says which and why. A type whose pipe is named and whose ground is
   * not should put the pipe on the bid; refusing everything would leave the
   * estimator with nothing on the bid and no idea what was missing.
   */
  sendToBid: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        runTypeId: z.number().int().positive(),
        /** Omitted sends every sendable row; given, sends just that one. */
        role: z.enum(RUN_MATERIAL_ROLES).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Refused whole on a locked bid (owner, 2026-09-29) — server/lockGuard.ts.
      const bid = await refuseSendIfLocked(input.bidId, ctx.scope.dataUserId);
      /*
        RESOLVED, exactly like the read above, and for a sharper reason.

        `input.runTypeId` is the id the RUNS store, which is a baseline when the
        user has forked that type. Reading the row by that id directly would
        build the bid lines from the SHIPPED specification while the screen
        showed the fork's — so a ground the user had removed could still reach
        the bid, from a row the panel never offered. Caught on 2026-09-20 by
        sending a type whose fork had dropped its ground.

        The line still records `input.runTypeId`, so a line and its runs can be
        matched again; only what it is MADE OF comes from the fork.
      */
      const palette = await db.getRunTypesFor(ctx.scope.dataUserId, true);
      const type = resolveRunType(palette, input.runTypeId);
      if (!type)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Run type not found.",
        });

      const [footage, existing] = await Promise.all([
        footageByRunType(
          input.bidId,
          ctx.scope.dataUserId,
          bid.distributionHeightInches
        ),
        db.getBidLinesForRunType(input.bidId, input.runTypeId),
      ]);
      const f = footage.get(input.runTypeId);
      if (!f)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nothing is traced under this type on this bid.",
        });

      const materials = await db.getMaterialsByIds(
        [
          type.racewayMaterialId,
          type.conductorMaterialId,
          type.groundMaterialId,
        ].filter((id): id is number => id !== null),
        ctx.scope.dataUserId
      );
      const nameOf = (id: number | null) =>
        id === null ? null : (resolveMaterial(materials, id)?.name ?? null);

      const rows = runTypeRows({
        pathType: type.pathType,
        racewayMaterialId: type.racewayMaterialId,
        racewayMaterialName: nameOf(type.racewayMaterialId),
        conductorMaterialId: type.conductorMaterialId,
        conductorMaterialName: nameOf(type.conductorMaterialId),
        groundMaterialId: type.groundMaterialId,
        groundMaterialName: nameOf(type.groundMaterialId),
        // The footage ROW — see the matching call in `bridge` above.
        footage: f,
        extras:
          (await db.getRunTypeExtrasFor(ctx.scope.dataUserId, [type.id])).get(
            type.id
          ) ?? [],
        // A refresh keeps a line's "shared trench" answer, never resets it.
        lineFeetPerFootByKey: sharedTrenchAnswers(
          existing.filter(line => line.archivedAt === null)
        ),
      });

      /*
        Pipe, wire and ground by the foot; then the FITTINGS by the each, from
        the same legs — one list, so the lock rule and the refresh rule below
        are written once for both. `sendable` carries each kind's own reasons.
      */
      /*
        Counted across EVERY type on the bid, then this type's rows taken.
        A tee's box belongs to one type (`teeBoxOwners`: the largest pipe
        meeting there), and that can only be decided with all of them in
        view. Given this type alone, it owned every tee it touched, so
        sending a 1/2" type and a 3/4" type that share a tee stored a box for
        each (2026-09-29, plan W4). Cable types too: a tee on a cable run buys
        its box.
      */
      const fittings =
        (await db.fittingRowsByRunType(ctx.scope.dataUserId, footage)).get(
          input.runTypeId
        ) ?? [];
      const candidates = [
        ...rows.map(row => ({
          role: row.role as (typeof RUN_MATERIAL_ROLES)[number],
          extraKey: row.extraKey,
          qty: row.feet,
          // Labour is on INSTALLED footage — extra is material only (Q5).
          laborQty: row.installedFeet as number | null,
          materialId: row.materialId,
          materialName: row.materialName,
          sendable: runRowSendability(row),
          speaks: true,
        })),
        ...fittings.map(row => ({
          role: row.role as (typeof RUN_MATERIAL_ROLES)[number],
          extraKey: 0,
          qty: row.qty,
          // A fitting's labour is on its count; null reads as `qty`.
          laborQty: null as number | null,
          materialId: row.pick.ok ? row.pick.materialId : null,
          materialName: row.pick.ok ? row.pick.name : null,
          sendable: fittingRowSendability(row),
          // A bend row that does not apply ("PVC always takes factory
          // elbows") is not reported as "not sent" — see fittingRowSpeaks.
          // `onBid` false: a row with a live line is handled before this.
          speaks: fittingRowSpeaks({
            role: row.role,
            status: row.count.status,
            qty: row.qty,
            onBid: false,
          }),
        })),
      ];

      const already = new Map(
        existing
          .filter(line => line.archivedAt === null)
          .map(line => [
            runLineSlot(line.runMaterialRole, line.runExtraKey),
            line,
          ])
      );
      const wanted = input.role
        ? candidates.filter(row => row.role === input.role)
        : candidates;
      // Refill or swap, per role — the same plan the preview showed. A locked
      // bid never reaches here (refused at the top).
      const plans = await resendPlans(
        ctx.scope.dataUserId,
        wanted,
        existing.filter(line => line.archivedAt === null)
      );

      const sent = [];
      const updated = [];
      const skipped = [];
      const swapped: string[] = [];
      const refilled: string[] = [];
      for (const row of wanted) {
        /*
          Already there: REFRESH the footage rather than refusing.

          A counted group's line re-resolves its quantity on every read; a run
          type's does not yet (see addRunTypeRowToBid on why, and what it would
          take). Refusing outright would leave an estimator who traced three
          more homeruns with a stale line and no way to move it, which is worse
          than either. The PRICING is never re-snapshotted — only the feet.
        */
        const live = already.get(slotOf(row));
        /*
          A LOCKED bid used to be handled here: an existing line was skipped
          (a re-send once rewrote a quoted quantity — the lock's open door)
          while a NEW row still arrived frozen. Since 2026-09-29 the whole send
          is refused at the top, so neither happens; the old skip is gone
          rather than left as a branch nothing can reach.
        */
        if (live) {
          const allowedAgain = row.sendable;
          if (!allowedAgain.ok) {
            skipped.push({ role: row.role, why: allowedAgain.message });
            continue;
          }
          /*
            SWAP to the type's current part, or REFILL a line sent unpriced —
            owner's decisions of 2026-09-26, decided in shared/resendLine.ts.
            A price already set is never refilled over.
          */
          const plan = plans.get(slotOf(row)) ?? { kind: "keep" as const };
          if (plan.kind === "swap" && row.materialId !== null) {
            await db.resnapshotRunTypeLine(live.id, ctx.scope.dataUserId, {
              mode: "swap",
              materialId: row.materialId,
              name: runLineName(type.label, row.materialName),
              role: row.role,
            });
            swapped.push(swapText(plan.from, plan.to, row.qty));
          } else if (plan.kind === "refill" && row.materialId !== null) {
            await db.resnapshotRunTypeLine(live.id, ctx.scope.dataUserId, {
              mode: "refill",
              materialId: row.materialId,
              role: row.role,
              price: plan.price !== null,
              hours: plan.hours !== null,
            });
            refilled.push(row.materialName ?? row.role);
          }
          // Either quantity moving is a move: bought is the material, installed
          // the labour, and both are stored together (Q5).
          const storedLabor =
            live.laborQty === null ? null : Number(live.laborQty);
          const qtyMoved =
            Number(live.qty) !== row.qty || storedLabor !== row.laborQty;
          if (qtyMoved)
            await db.refreshRunTypeLineQty(live.id, {
              bought: row.qty,
              installed: row.laborQty,
            });
          if (qtyMoved || plan.kind !== "keep") {
            updated.push(row.role);
          } else {
            skipped.push({
              role: row.role,
              why: "Already on the bid, and unchanged.",
            });
          }
          continue;
        }
        const allowed = row.sendable;
        if (!allowed.ok) {
          if (row.speaks)
            skipped.push({ role: row.role, why: allowed.message });
          continue;
        }
        await db.addRunTypeRowToBid(input.bidId, ctx.scope.dataUserId, {
          // The id the RUNS use — see the note above.
          runTypeId: input.runTypeId,
          role: row.role,
          // Which extra, on an `extra` row; 0 on every other (0136).
          extraKey: row.extraKey,
          // Non-null past `sendable`, which refuses a row with no material
          // before this point — a line nobody can order.
          materialId: row.materialId as number,
          /*
            The type, then what this row is — unless that just says it twice.

            A cable type is usually named after its cable, so the plain join
            produced "12-2 MC cable — 12-2 MC cable", which is not information,
            it is furniture. RunsPanel already refuses the same duplication on
            its spec line, and by the same test: what the two strings SAY,
            rather than what kind of run they belong to. `runLineName`, shared
            with the style swap above.
          */
          name: runLineName(type.label, row.materialName),
          qty: row.qty,
          laborQty: row.laborQty,
        });
        sent.push(row.role);
      }
      /** `swapped` and `refilled` say what Send-again did, for the toast. */
      return { sent, updated, skipped, swapped, refilled };
    }),
});
