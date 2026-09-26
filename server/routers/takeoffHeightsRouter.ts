/**
 * Mounting heights: the settings every vertical is measured from.
 *
 * ── Two gates, not one, and the split is deliberate ──────────────────────────
 * Company-level changes need `pricing.edit`, because changing one moves every
 * job still inheriting it — including bids already sent. Per-job and per-run
 * overrides need only `bids.edit`, because overriding on one job is an ordinary
 * local edit. That is the same line `CLAUDE.md` § Company defaults draws
 * between the settings screen and the per-bid controls, applied here.
 *
 * ── Nothing here does arithmetic ─────────────────────────────────────────────
 * Resolution and the vertical maths live in `shared/takeoffHeights.ts`, which is
 * pure and tested. This router reads rows, hands them to that module, and
 * returns what it says. A second implementation of the inheritance order is
 * exactly how a settings screen and a bill of materials come to disagree about
 * how far a receptacle drops.
 *
 * ── Elevations are INCHES, everywhere, including on the wire ─────────────────
 * Feet and inches are a display format (`formatFeetInches`), never a transport
 * one. A below-floor type is entered as a positive DEPTH at the UI boundary and
 * arrives here already negative — see `belowFloor` on the shipped list.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import {
  SHIPPED_HEIGHT_TYPES,
  heightList,
  resolveDistributionHeight,
  shippedHeightType,
  slugForHeightType,
} from "../../shared/takeoffHeights";
import {
  BEND_SIZE_CHOICES,
  DEFAULT_FACTORY_ELBOW_FROM,
  DEFAULT_PULL_BOX_FROM,
  DEFAULT_PULL_POINT_LIMIT,
  PULL_POINT_LIMITS,
  resolveBendSettings,
} from "../../shared/runBends";
import * as db from "../db";

/** Company settings: the same gate labor rates and sales tax sit behind. */
const settings = scoped("pricing.view", "pricing.edit");
/** One job's overrides: an ordinary edit to that bid. */
const perBid = scoped("bids.view", "bids.edit");

/**
 * A believable elevation, in inches.
 *
 * −240 to 600 is 20 ft below the floor to 50 ft above it. Wide enough for a
 * deep underground stub and a high-bay warehouse, narrow enough that a typo
 * with an extra digit is refused rather than quietly pricing a drop of a
 * hundred feet. Integers only: a measurement finer than an inch is a precision
 * a tape does not have and a plan does not support.
 */
const inchesSchema = z.number().int().min(-240).max(600);

/** A label someone will have to recognise in a picker six months from now. */
const labelSchema = z.string().trim().min(1).max(64);

const typeKeySchema = z.string().trim().min(1).max(64);

async function requireBid(bidId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  return bid;
}

export const takeoffHeightsRouter = router({
  /**
   * The company's heights, as the settings screen shows them.
   *
   * `bidsInheriting` is the count behind the warning: settings here are
   * inherited rather than copied, so a change re-prices every job that has not
   * overridden it. The estimator sees how many bids that is BEFORE making the
   * change rather than discovering it afterwards.
   */
  company: settings.query(async ({ ctx }) => {
    const userId = ctx.scope.dataUserId;
    const [defaults, rows, bidsInheriting] = await Promise.all([
      db.getHeightDefaults(userId),
      db.getMountingHeights(userId),
      db.countBidsInheritingHeights(userId),
    ]);
    return {
      distributionHeight: resolveDistributionHeight({
        company: defaults?.distributionHeightInches ?? null,
      }),
      types: heightList({ company: rows }),
      bidsInheriting,
    };
  }),

  /** The heights in effect on one job, and where each one comes from. */
  forBid: perBid
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const bid = await requireBid(input.bidId, userId);
      const [defaults, company, job] = await Promise.all([
        db.getHeightDefaults(userId),
        db.getMountingHeights(userId),
        db.getBidMountingHeights(input.bidId, userId),
      ]);
      return {
        distributionHeight: resolveDistributionHeight({
          company: defaults?.distributionHeightInches ?? null,
          job: bid.distributionHeightInches,
        }),
        /** What resetting this job's height would fall back to. */
        companyDistributionInches: defaults?.distributionHeightInches ?? null,
        types: heightList({ company, job }),
      };
    }),

  /**
   * Set — or clear — the company's distribution height.
   *
   * NULL is a real input, not a missing one: it shuts the gate again and stops
   * every vertical on every job. Somebody who entered a number by mistake has
   * to be able to take it back, so clearing is a value this accepts rather than
   * a deletion the UI has to find another route for.
   */
  /**
   * The company's bend settings (0084): each stored value, NULL for "the
   * shipped default", beside what is in effect — so the screen can say
   * "1-1/4" (default)" without knowing what the default is.
   */
  bends: settings.query(async ({ ctx }) => {
    const row = await db.getBendDefaultsRow(ctx.scope.dataUserId);
    const stored = {
      factoryElbowFromSize: row?.factoryElbowFromSize ?? null,
      pullPointLimitDegrees: row?.pullPointLimitDegrees ?? null,
      pullBoxFromSize: row?.pullBoxFromSize ?? null,
    };
    return {
      stored,
      effective: resolveBendSettings(stored),
      defaults: {
        factoryElbowFrom: DEFAULT_FACTORY_ELBOW_FROM,
        pullPointLimit: DEFAULT_PULL_POINT_LIMIT,
        pullBoxFrom: DEFAULT_PULL_BOX_FROM,
      },
      sizes: BEND_SIZE_CHOICES,
      limits: PULL_POINT_LIMITS,
    };
  }),

  /**
   * Change any of the three. Omitted leaves a setting alone; NULL puts it back
   * to the shipped default. Company-wide, so the same gate as every other
   * company default: it recounts elbows and pull points on every job.
   */
  setBends: settings
    .input(
      z.object({
        factoryElbowFromSize: z.enum(BEND_SIZE_CHOICES).nullable().optional(),
        pullPointLimitDegrees: z
          .union([z.literal(360), z.literal(270)])
          .nullable()
          .optional(),
        pullBoxFromSize: z.enum(BEND_SIZE_CHOICES).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.setBendDefaults(ctx.scope.dataUserId, input);
      return { ok: true };
    }),

  setCompanyDistribution: settings
    .input(z.object({ inches: inchesSchema.nullable() }))
    .mutation(async ({ input, ctx }) => {
      await db.setCompanyDistributionHeight(ctx.scope.dataUserId, input.inches);
      return { ok: true };
    }),

  /** Set one mounting height for the company. NULL means "no height set". */
  setCompanyHeight: settings
    .input(
      z.object({ typeKey: typeKeySchema, inches: inchesSchema.nullable() })
    )
    .mutation(async ({ input, ctx }) => {
      await db.upsertMountingHeight(ctx.scope.dataUserId, {
        typeKey: input.typeKey,
        heightInches: input.inches,
      });
      return { ok: true };
    }),

  /**
   * Add a type of the company's own — an exit sign, a thermostat.
   *
   * It behaves exactly like a shipped one from here on: it appears in every run
   * picker, it inherits down to job and run, and changing its height re-prices
   * every run pointing at it. The only difference is that nobody else has it.
   */
  addType: settings
    .input(z.object({ label: labelSchema, inches: inchesSchema.nullable() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const existing = await db.getMountingHeights(userId);
      const typeKey = slugForHeightType(
        input.label,
        new Set(existing.map(row => row.typeKey))
      );
      await db.upsertMountingHeight(userId, {
        typeKey,
        label: input.label,
        heightInches: input.inches,
      });
      return { typeKey };
    }),

  /** Rename one of the company's own types. The KEY never changes with it. */
  renameType: settings
    .input(z.object({ typeKey: typeKeySchema, label: labelSchema }))
    .mutation(async ({ input, ctx }) => {
      if (shippedHeightType(input.typeKey)) {
        // A shipped label is ours, and a company's copy of it could drift after
        // a rewording. Their own types are theirs to name.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A shipped height type cannot be renamed.",
        });
      }
      const userId = ctx.scope.dataUserId;
      const existing = await db.getMountingHeights(userId);
      const row = existing.find(r => r.typeKey === input.typeKey);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "No such type." });
      await db.upsertMountingHeight(userId, {
        typeKey: input.typeKey,
        heightInches: row.heightInches,
        label: input.label,
      });
      return { ok: true };
    }),

  /**
   * Retire a type, or bring one back. There is no delete, and there will not
   * be one.
   *
   * A run stores a type's key and resolves its height live, so deleting a type
   * would silently shorten every run pointing at it — the footage falls, the
   * bid gets cheaper, and nothing on screen says why. Retiring takes it out of
   * every picker and keeps it resolving for the runs that already use it. Same
   * rule as a retired material, for the same reason.
   */
  setTypeRetired: settings
    .input(z.object({ typeKey: typeKeySchema, retired: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      const existing = await db.getMountingHeights(userId);
      const row = existing.find(r => r.typeKey === input.typeKey);
      await db.upsertMountingHeight(userId, {
        typeKey: input.typeKey,
        // Retiring a shipped type the company never touched creates the row
        // that records the decision; it carries no height of its own.
        heightInches: row?.heightInches ?? null,
        isActive: !input.retired,
      });
      return { ok: true };
    }),

  /**
   * Put a shipped type back to the value the app ships.
   *
   * Deleting the company's row is the whole of it: with nothing stored, the
   * resolver falls through to the shipped list, so "reset" can never drift from
   * what the app actually ships the way a copied-back number could.
   */
  resetToShipped: settings
    .input(z.object({ typeKey: typeKeySchema }))
    .mutation(async ({ input, ctx }) => {
      if (!shippedHeightType(input.typeKey)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This type is your own, so there is no shipped value to reset to. Retire it instead.",
        });
      }
      await db.resetMountingHeightToShipped(
        ctx.scope.dataUserId,
        input.typeKey
      );
      return { ok: true };
    }),

  /** This job runs at a different elevation. NULL inherits the company's. */
  setBidDistribution: perBid
    .input(
      z.object({
        bidId: z.number().int().positive(),
        inches: inchesSchema.nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      await requireBid(input.bidId, userId);
      await db.setBidDistributionHeight(input.bidId, userId, input.inches);
      return { ok: true };
    }),

  /** Override one mounting height on this job. */
  setBidHeight: perBid
    .input(
      z.object({
        bidId: z.number().int().positive(),
        typeKey: typeKeySchema,
        inches: inchesSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      await requireBid(input.bidId, userId);
      await db.upsertBidMountingHeight(
        input.bidId,
        userId,
        input.typeKey,
        input.inches
      );
      return { ok: true };
    }),

  /** Drop this job's override, so it follows the company again. */
  clearBidHeight: perBid
    .input(
      z.object({
        bidId: z.number().int().positive(),
        typeKey: typeKeySchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.scope.dataUserId;
      await requireBid(input.bidId, userId);
      await db.clearBidMountingHeight(input.bidId, userId, input.typeKey);
      return { ok: true };
    }),

  /** The shipped list itself, for a client that wants it without a round trip. */
  shippedTypes: settings.query(() => SHIPPED_HEIGHT_TYPES),
});
