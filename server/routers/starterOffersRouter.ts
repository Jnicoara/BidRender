/**
 * A SHOP'S STARTER UPDATES — "N starter updates available" on the Dashboard
 * and the Updates tabs on the library screens (references/starter-offers-
 * plan.md §§ 2.3–2.5, 3c, 3d; owner Q1–Q7, 2026-10-14).
 *
 * ── One read, one count ─────────────────────────────────────────────────────
 * `count` is `list`'s length, from the same server function
 * (`starterOffersFor`), never a second query — a count that could disagree
 * with the list it counts is the stale-number fault CLAUDE.md warns about.
 * The client refreshes both through ONE helper (`refreshStarterOffers`).
 *
 * ── Who ─────────────────────────────────────────────────────────────────────
 * Every member who can see the library sees the count and the list. Accept,
 * Accept all, Ignore and un-ignore change the shop's library for everyone in
 * it: owner and admins only (Q1), checked here on every answer route —
 * `library.edit` alone would let an estimator through.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import {
  StarterOfferRefused,
  acceptStarterOffers,
  draftsRecounted,
  ignoreStarterOffers,
  starterOffersFor,
  unignoreStarterOffers,
} from "../starterOffers";
import { canAnswerStarterOffers } from "../../shared/starterChange";

const library = scoped("library.view", "library.edit");

/** Only the owner and admins answer an offer (Q1). */
const answering = library.use(async ({ ctx, next }) => {
  if (!canAnswerStarterOffers(ctx.scope.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only the owner or an admin can accept or ignore BidRidge updates.",
    });
  return next({ ctx });
});

const picks = z
  .array(
    z.object({
      key: z.string().min(1).max(200),
      latestChangeId: z.number().int().positive(),
    })
  )
  .min(1)
  .max(2000);

/** A refusal is the user's to read: plain words, BAD_REQUEST. */
async function answered<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof StarterOfferRefused)
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    throw err;
  }
}

export const starterOffersRouter = router({
  /** The list, the Ignored fold, and what the screen may offer this person. */
  list: library.query(async ({ ctx }) => {
    const read = await starterOffersFor(ctx.scope.dataUserId);
    return {
      offers: read.offers,
      ignored: read.ignored,
      canAnswer: canAnswerStarterOffers(ctx.scope.role),
      /** Drafts "Accept all" would re-count, each once (Q6). */
      acceptAllDrafts: draftsRecounted(
        read.offers.filter(o => o.bucket === "offer")
      ).length,
    };
  }),

  /** The Dashboard's N: the list's own length. */
  count: library.query(async ({ ctx }) => {
    const read = await starterOffersFor(ctx.scope.dataUserId);
    return {
      count: read.offers.length,
      canAnswer: canAnswerStarterOffers(ctx.scope.role),
    };
  }),

  /** Accept ONE update — the only way to take a row the shop changed itself. */
  accept: answering
    .input(
      z.object({
        key: z.string().min(1).max(200),
        latestChangeId: z.number().int().positive(),
      })
    )
    .mutation(({ ctx, input }) =>
      answered(() =>
        acceptStarterOffers({
          ownerUserId: ctx.scope.dataUserId,
          actorUserId: ctx.scope.actorUserId,
          picks: [input],
          allowOwnValue: true,
        })
      )
    ),

  /** Accept every listed update the client showed; never an own-value row (Q18). */
  acceptAll: answering.input(z.object({ picks })).mutation(({ ctx, input }) =>
    answered(() =>
      acceptStarterOffers({
        ownerUserId: ctx.scope.dataUserId,
        actorUserId: ctx.scope.actorUserId,
        picks: input.picks,
        allowOwnValue: false,
      })
    )
  ),

  ignore: answering.input(z.object({ picks })).mutation(({ ctx, input }) =>
    answered(() =>
      ignoreStarterOffers({
        ownerUserId: ctx.scope.dataUserId,
        actorUserId: ctx.scope.actorUserId,
        picks: input.picks,
      })
    )
  ),

  unignore: answering.input(z.object({ picks })).mutation(({ ctx, input }) =>
    answered(() =>
      unignoreStarterOffers({
        ownerUserId: ctx.scope.dataUserId,
        picks: input.picks,
      })
    )
  ),
});
