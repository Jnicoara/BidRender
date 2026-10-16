import { TRPCError } from "@trpc/server";
/**
 * First-run state and the getting-started checklist.
 *
 * The rules live in shared/onboarding.ts and shared/laborRatePricing.ts; this
 * router's whole job is gathering the facts those rules need and persisting the
 * two timestamps that say where the user is. Keeping the judgement out of here
 * is what lets the first-run screen and the checklist agree about what "labor
 * rates are set" means without either of them owning the answer.
 */
import { z } from "zod";
import { companyProcedure, requireCapability, router } from "../_core/trpc";
import { buildChecklist, type OnboardingFacts } from "../../shared/onboarding";
import { hasAnyRealRate } from "../../shared/laborRatePricing";
import { needsPricing } from "../../shared/materialPricing";
import * as db from "../db";

/**
 * Look at what the user has actually done.
 *
 * Every one of these is a fact about their data, never a record that they
 * visited a screen — see the header of shared/onboarding.ts for why that
 * distinction is the point rather than an implementation detail.
 */
async function gatherFacts(userId: number): Promise<OnboardingFacts> {
  const [rates, materials, assemblies, bidsWithLines] = await Promise.all([
    db.getLibraryLaborRates(userId),
    db.getLibraryMaterials(userId),
    db.getLibraryAssemblies(userId),
    db.countBidsWithLineItems(userId),
  ]);

  return {
    hasRealLaborRate: hasAnyRealRate(rates),
    // A priced material means one the USER priced. Every shipped row is $0
    // until they say otherwise, so "has any material" would tick on day one
    // for an account that has done nothing.
    hasPricedMaterial: materials.some(m => !needsPricing(m.costPerUnit)),
    // Likewise their own assembly, not the starter recipes.
    hasOwnAssembly: assemblies.some(a => a.userId === userId),
    hasBidWithLines: bidsWithLines > 0,
  };
}

export const onboardingRouter = router({
  /**
   * Everything the shell needs to decide where a user lands and what to show.
   *
   * One query rather than three so the Dashboard and the router are never
   * briefly disagreeing about whether this account is new.
   */
  state: companyProcedure.query(async ({ ctx }) => {
    const facts = await gatherFacts(ctx.scope.dataUserId);
    const user = await db.getUserById(ctx.user.id);

    return {
      /** NULL onboardedAt is what makes an account "new". */
      isFirstRun: !user?.onboardingCompletedAt,
      checklistDismissed: !!user?.checklistDismissedAt,
      steps: buildChecklist(facts),
    };
  }),

  /**
   * Mark first-run done and let the user into the app proper.
   *
   * Idempotent, and deliberately NOT conditional on the labor rate being set.
   * The flow asks for a rate and explains why, but a user who insists on
   * skipping is a user who gets to skip: a welcome screen that will not let go
   * is worse than a bid built on a rate they were warned about.
   */
  completeFirstRun: companyProcedure.mutation(async ({ ctx }) => {
    await db.markOnboardingComplete(ctx.user.id);
    return { success: true };
  }),

  /** Hide the checklist. Reversible — see restoreChecklist. */
  dismissChecklist: companyProcedure.mutation(async ({ ctx }) => {
    await db.setChecklistDismissed(ctx.user.id, new Date());
    return { success: true };
  }),

  /**
   * Bring the checklist back.
   *
   * The pair exists because "dismissible" and "gone forever" are different
   * promises, and only one of them is safe to make to someone still learning
   * the app.
   */
  restoreChecklist: companyProcedure.mutation(async ({ ctx }) => {
    await db.setChecklistDismissed(ctx.user.id, null);
    return { success: true };
  }),

  /**
   * Used by the first-run screen to price the starter roles in place.
   *
   * `pricing.edit`, not plain membership — and this is the exception worth
   * noticing in an otherwise per-person router. Everything else here reads or
   * writes the acting user's own flags; this one writes an hourly cost that
   * multiplies every line of every future bid in the company. A first-run
   * screen is a perfectly ordinary place for a viewer to land, and without this
   * gate that viewer could set the company's labor rate on their way through.
   */
  setStarterRate: requireCapability("pricing.edit")
    .input(
      z.object({
        id: z.number().int().positive(),
        hourlyCost: z.number().min(0).max(10000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Goes through the same fork-on-edit path as the Labor Rates screen, so
      // a starter role edited here behaves exactly as it would there.
      // A rate that is not this company's (or not there) is a 404, not a
      // server error (weird-input sweep, 2026-10-14).
      if (!(await db.getLaborRateById(input.id, ctx.scope.dataUserId)))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Labor rate not found.",
        });
      return db.setLaborRateHourlyCost(
        input.id,
        ctx.scope.dataUserId,
        input.hourlyCost
      );
    }),
});
