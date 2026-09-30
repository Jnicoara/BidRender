import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
/**
 * For a procedure that is built out of OTHER procedures — so the bulk send
 * runs the single send itself rather than a copy that could drift from it
 * (server/routers/takeoffSummaryRouter.ts).
 */
export const createCallerFactory = t.createCallerFactory;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);

// ─── Company scope and capabilities ───────────────────────────────────────────
/**
 * The builders every data router should use. Read this before adding a route.
 *
 * ── Two gates, and they are not interchangeable ──────────────────────────────
 *   `ctx.scope.dataUserId`  decides WHOSE rows. Enforced by using it in the
 *                           query — a route that forgets it does not fail
 *                           loudly, it quietly reads the actor's own (empty)
 *                           data. `server/scopeDiscipline.test.ts` is what
 *                           stops that being a matter of remembering.
 *   the capability          decides WHETHER. Enforced here.
 *
 * Passing a capability check does not scope a query, and scoping a query does
 * not authorise it. The bug found in this codebase's earlier health check was
 * exactly this confusion: routes that checked you were logged in and never
 * checked the row was yours.
 *
 * ── Why the capability is chosen by operation type ───────────────────────────
 * `scoped(view, edit)` picks the capability from whether tRPC is running a
 * query or a mutation, rather than making every one of ~400 procedures name
 * its own. That is not laziness: a per-procedure tag is a per-procedure chance
 * to pick the wrong one or forget, across a surface far too large to review
 * honestly. Deriving it from something tRPC already knows makes "a mutation
 * requires edit rights" true by construction for every route that exists now
 * and every one added later.
 *
 * Where a route genuinely needs something else — a destructive delete, a
 * settings write inside an otherwise read-only router — it says so explicitly
 * with `requireCapability`, and that exception is visible precisely because it
 * is written down.
 */
import { resolveScope } from "./companyScope";
import type { Capability } from "@shared/permissions";
import { hasFeature } from "@shared/permissions";

const withScope = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  // Derived from the session alone. Nothing the client sent participates.
  const scope = await resolveScope(ctx.user);
  return next({ ctx: { ...ctx, user: ctx.user, scope } });
});

/**
 * Logged in, and acting within a company. No capability requirement.
 *
 * For routes every member may reach whatever their role — reading who they are,
 * what their company is called, what they are allowed to do.
 */
export const companyProcedure = t.procedure.use(withScope);

/** Demand one specific capability, whatever the operation type. */
export function requireCapability(capability: Capability) {
  return companyProcedure.use(async ({ ctx, next }) => {
    if (!ctx.scope.capabilities.includes(capability)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Your role (${ctx.scope.role}) cannot do this.`,
      });
    }
    return next({ ctx });
  });
}

/**
 * A router's builder: queries need `view`, mutations need `edit`.
 *
 * Subscriptions are treated as reads, which is what they are.
 */
export function scoped(view: Capability, edit: Capability) {
  return companyProcedure.use(async ({ ctx, type, next }) => {
    const needed = type === "mutation" ? edit : view;
    if (!ctx.scope.capabilities.includes(needed)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Your role (${ctx.scope.role}) cannot ${
          type === "mutation" ? "change" : "see"
        } this.`,
      });
    }
    return next({ ctx });
  });
}

/**
 * Gate a route behind an unreleased feature.
 *
 * Tagging is the whole job — the feature's availability lives in
 * `shared/permissions.ts` and flipping it to everyone is one word there. An
 * unknown id fails closed, so a typo hides a feature rather than exposing one.
 */
export function internalProcedure(feature: string, capability?: Capability) {
  const base = capability ? requireCapability(capability) : companyProcedure;
  return base.use(async ({ ctx, next }) => {
    if (!hasFeature(ctx.scope.accessTier, feature)) {
      // NOT_FOUND rather than FORBIDDEN: an unreleased feature should not
      // announce that it exists to an account that cannot use it.
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Not found.",
      });
    }
    return next({ ctx });
  });
}
