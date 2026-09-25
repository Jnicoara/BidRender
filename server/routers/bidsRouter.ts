/**
 * Bids API (Foundation).
 *
 * A bid is a set of line items, each one an assembly frozen at the moment it
 * was added, plus the pricing settings that turn their sum into a price.
 *
 * ── All math is delegated ────────────────────────────────────────────────────
 * The rollup lives in ../bidPricing, which calls calculateLineItem /
 * sumDirectCost / calculateBidPrice from shared/pricing.ts, and answers the
 * company-vs-bid settings question with resolveBidPricingSettings in the same
 * module. Nothing here re-implements a percentage. That matters most for the
 * snapshot: a line prices from its frozen inputs through the same engine as
 * everything else, so "what this bid says" and "what the engine computes" can
 * never diverge — and the client proposal, which prices through that same
 * module, cannot quote a different number from the bid it was built from.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requireCapability, router, scoped } from "../_core/trpc";
import { ASSEMBLY_CATEGORIES, BID_STATUSES } from "../../drizzle/schema";
import {
  bidRollup,
  companyDefaultsFor,
  priceFromDirectCost,
  rollUpBid,
  taxRulesFor,
  toTaxJurisdiction,
} from "../bidPricing";
import { explainTaxStatus } from "../../shared/salesTax";
import {
  daysRemaining,
  purgeDueAt,
  retentionUrgency,
} from "../../shared/retention";
import { resolveBidClient } from "../../shared/bidClient";
import {
  ARCHIVE_SCOPES,
  BID_DATE_FIELDS,
  BID_SORTS,
  PAGE_SIZE_MAX,
  clampPageSize,
  decodeCursor,
  rangeIsBackwards,
  toPage,
} from "../../shared/bidSearch";
import {
  countsWaitingToSend,
  countsWithNoPrice,
  doubleCountedAssemblies,
  type BridgeGroup,
  type BridgeLine,
} from "../../shared/takeoffBridge";
import {
  followsDrawing,
  quantitySource,
  typedQuantityRefusal,
  unlockChanges,
} from "../../shared/quantityLock";
import {
  canPriceByHand,
  saveAsAssemblyRefusal,
} from "../../shared/handPricedLines";
import { hourlyCostOf, resolveLaborRate } from "../../shared/laborRateLookup";
import { resolveForkedRow } from "../../shared/forkedRows";
import { needsPricing } from "../../shared/materialPricing";
import * as db from "../db";

/**
 * The three things a takeoff can be telling a bid that its money does not say.
 *
 * ── Why all three live under the totals and none on the drawing ─────────────
 * The warning strip's rule is that it sits directly under the number it
 * contradicts, which is exactly the relationship each of these has with the
 * material total. A marker on the drawing would break level 1's promise of a
 * quiet count on the screen where that promise was made — see
 * references/plan-viewer-overhaul.md § 5f.
 *
 * ── `doubleCounted` is the half a warning at send time cannot cover ─────────
 * The hand-added line can arrive AFTER the count was sent, so this is read
 * every time the bid is shown rather than fired once at the crossing. That is
 * what makes R3 a rule in the code instead of a note in a document.
 */
async function planAttentionFor(
  bidId: number,
  userId: number,
  lines: readonly {
    id: number;
    name: string;
    takeoffGroupId: number | null;
    assemblyId: number | null;
  }[]
): Promise<{
  waitingToSend: number;
  countedWithNoPrice: number;
  doubleCounted: string[];
}> {
  const bridgeLines: BridgeLine[] = lines.map(line => ({
    id: line.id,
    name: line.name,
    takeoffGroupId: line.takeoffGroupId,
    assemblyId: line.assemblyId,
  }));

  const doubleCounted = doubleCountedAssemblies(bridgeLines);

  const [groups, counts] = await Promise.all([
    db.getGroupsForBid(bidId, userId),
    db.countStampsByGroup(bidId, userId),
  ]);
  const bridgeGroups: BridgeGroup[] = groups.map(group => ({
    id: group.id,
    label: group.label,
    kind: group.kind,
    assemblyId: group.assemblyId,
    materialId: group.materialId,
    unitCost: group.unitCost === null ? null : Number(group.unitCost),
    count: counts.get(group.id) ?? 0,
  }));

  return {
    waitingToSend: countsWaitingToSend(bridgeGroups, bridgeLines),
    countedWithNoPrice: countsWithNoPrice(bridgeGroups, bridgeLines),
    doubleCounted,
  };
}

/**
 * This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("bids.view", "bids.edit");

const nameSchema = z.string().trim().min(1).max(255);
const qtySchema = z.number().min(0).max(999999);
/** A typed price for ONE. Inside decimal(12,4); zero allowed and meaningful. */
const moneySchema = z.number().min(0).max(99999999);
/** Typed hours for ONE. Inside decimal(10,4); zero allowed and meaningful. */
const hoursPerUnitSchema = z.number().min(0).max(99999);
const labelSchema = z.string().trim().min(1).max(128);

const overheadModeSchema = z.enum(["percentage", "flat"]);
const profitMethodSchema = z.enum(["markup", "margin"]);

/**
 * The productivity factor, as a signed fraction. −0.5 = crew beats book hours
 * by half; 1.0 = takes twice as long.
 *
 * Bounded well inside what the column holds, and floored above −1: at exactly
 * −100% every job takes no time and prices at no labor, which is never what
 * anyone means and would be a very quiet way to send a bid out wrong.
 */
const productivitySchema = z.number().min(-0.9).max(2);
/**
 * The per-job whip dial, as a signed fraction. -0.9 to +3 is a deliberately
 * wide but finite range: past that it is a typo rather than a tight building,
 * and a floor below -100% would subtract wire somebody else counted.
 */
const whipAdjustSchema = z.number().min(-0.9).max(3);

const toDecimal4 = (value: number) => value.toFixed(4);

/** Assert the bid belongs to the caller before anything touches its children. */
async function requireBid(id: number, userId: number) {
  const bid = await db.getBidById(id, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  return bid;
}

export const bidsRouter = router({
  /**
   * Historical search: find a bid out of thousands, by who it was for, what
   * trade it was, where the job was, and when.
   *
   * ── Paginated at the query, not in the browser ──────────────────────────
   * Returns one page and a cursor. Every filter is applied in SQL, so the
   * response size is bounded by `pageSize` no matter how many bids the company
   * has — see `db.searchBids` for the keyset reasoning.
   *
   * ── Scoped like everything else ─────────────────────────────────────────
   * `ctx.scope.dataUserId`, so a member searches their company's bids and
   * nobody else's, and a viewer can search but the `scoped()` gate still stops
   * them changing anything they find.
   */
  search: procedure
    .input(
      z.object({
        text: z.string().trim().max(200).optional(),
        client: z.string().trim().max(200).optional(),
        address: z.string().trim().max(200).optional(),
        trade: z.string().trim().max(64).optional(),
        status: z.enum(BID_STATUSES).optional(),
        dateField: z.enum(BID_DATE_FIELDS).default("created"),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        archive: z.enum(ARCHIVE_SCOPES).default("live"),
        sort: z.enum(BID_SORTS).default("recent"),
        cursor: z.string().max(200).nullish(),
        pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const pageSize = clampPageSize(input.pageSize);

      // A backwards range is a typo, not a query. Returning nothing would look
      // like "no bids match" and send someone hunting for missing data.
      if (rangeIsBackwards(input.from, input.to)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The start of the date range is after its end.",
        });
      }

      const rows = await db.searchBids(
        ctx.scope.dataUserId,
        input,
        decodeCursor(input.cursor),
        pageSize
      );

      // Priced through the same rollup the dashboard uses, so a search result
      // and the card it corresponds to cannot show different money. Only the
      // page's rows are priced — this is why the page is bounded.
      const company = await companyDefaultsFor(ctx.scope.dataUserId);
      const priced = await Promise.all(
        rows.map(async bid => {
          const lines = await db.getBidLineItems(bid.id);
          const { directCost, bidPrice } = rollUpBid(bid, lines, company);
          return {
            ...bid,
            lineCount: lines.length,
            directCost,
            finalPrice: bidPrice.finalPrice,
          };
        })
      );

      const page = toPage(priced, pageSize, row =>
        input.sort === "created" ? row.createdAt : row.updatedAt
      );
      return { ...page, pageSize };
    }),

  /** The trades this company has actually bid, for the search filter. */
  usedTrades: procedure.query(async ({ ctx }) =>
    db.getUsedTrades(ctx.scope.dataUserId)
  ),

  list: procedure.query(async ({ ctx }) => {
    return db.getBidsByUser(ctx.scope.dataUserId);
  }),

  /**
   * Every bid with enough to place it on the dashboard: its own fields plus a
   * rolled-up value.
   *
   * ── One query, not one per bid ─────────────────────────────────────────────
   * This used to fetch the bids and then read every bid's line items in a
   * loop. That answered in ~100ms at 249 bids and ~600ms at 1,149, growing in a
   * straight line — on the screen the app opens on. `getDashboardBids` sums the
   * lines in SQL instead, so the cost stops following the size of the history.
   *
   * ── The price is still computed here, and has to be ────────────────────────
   * Only the per-LINE half can be summed in the database. Overhead and profit
   * resolve per BID — either may be overridden, flat overhead is an amount
   * rather than a rate, and a target margin divides — so the last step runs
   * through `priceFromDirectCost`, which is the same resolution and the same
   * engine call `rollUpBid` makes. A card and the bid it opens cannot disagree.
   *
   * Grouping and ordering are deliberately NOT done here — those are
   * presentation rules, they live in client/src/lib/bidDashboard.ts, and they
   * are tested there.
   */
  dashboard: procedure.query(async ({ ctx }) => {
    const company = await companyDefaultsFor(ctx.scope.dataUserId);
    const rows = await db.getDashboardBids(
      ctx.scope.dataUserId,
      company.productivityPct
    );

    return rows.map(row => {
      const {
        lineCount,
        materialCost,
        laborCost,
        directCost,
        totalHours,
        ...bid
      } = row;
      const { price } = priceFromDirectCost(bid, directCost, company);
      return { ...bid, lineCount, directCost, finalPrice: price };
    });
  }),

  create: procedure
    .input(
      z.object({
        name: nameSchema,
        status: z.enum(BID_STATUSES).default("Draft"),
        trades: z
          .array(z.string().trim().min(1).max(64))
          .max(20)
          .default(["electrical"]),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await db.createBid({
        userId: ctx.scope.dataUserId,
        name: input.name,
        status: input.status,
        trades: input.trades,
        dueDate: input.dueDate,
      });
      return db.getBidById(id, ctx.scope.dataUserId);
    }),

  update: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: nameSchema.optional(),
        status: z.enum(BID_STATUSES).optional(),
        trades: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
        /** "YYYY-MM-DD", or null to clear the deadline. */
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        // Passing null clears an override and returns the group to the company
        // default; omitting the key leaves it as it is.
        overheadEnabled: z.boolean().nullable().optional(),
        overheadMode: overheadModeSchema.nullable().optional(),
        overheadValue: z.number().min(0).nullable().optional(),
        profitMethod: profitMethodSchema.nullable().optional(),
        profitValue: z.number().min(0).max(0.99).nullable().optional(),
        productivityPct: productivitySchema.nullable().optional(),
        /**
         * How much tighter or looser this building is than the library assumes.
         *
         * NOT nullable, unlike the overrides around it: there is no company
         * default above it to inherit, so 0 is the answer rather than a stand-in
         * for one. Signed — a tight fit-out is as real as a sprawling house.
         */
        whipAdjustPct: whipAdjustSchema.optional(),
        /**
         * Who this bid is for. Null unassigns, leaving the bid's own
         * `clientName` text as the only source — which is the state every bid
         * written before clients existed is already in, and it prints exactly
         * as it did before.
         */
        clientId: z.number().int().positive().nullable().optional(),
        /**
         * Proposal content. Null clears the field back to "not filled in", so
         * the document goes back to prompting for it rather than printing a
         * blank line where a client's name belongs.
         */
        clientName: z.string().trim().max(255).nullable().optional(),
        siteAddress: z.string().trim().max(512).nullable().optional(),
        proposalNote: z.string().trim().max(4000).nullable().optional(),

        /**
         * Sales tax overrides. Every one of these exists so the automatic
         * answer is never the only answer — see the schema comments on `bids`.
         *
         * `taxRateOverridePct` is nullable-optional with a deliberate
         * distinction: null CLEARS the override and goes back to matching,
         * while 0 is a real zero-rate that gets applied as one.
         */
        taxJurisdictionId: z.number().int().positive().nullable().optional(),
        taxRateOverridePct: z.number().min(0).max(25).nullable().optional(),
        taxExempt: z.boolean().optional(),
        taxExemptReason: z.string().trim().max(255).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...rest } = input;
      await requireBid(id, ctx.scope.dataUserId);

      const patch: Record<string, unknown> = {};
      if (rest.name !== undefined) patch.name = rest.name;
      if (rest.status !== undefined) patch.status = rest.status;
      if (rest.trades !== undefined) patch.trades = rest.trades;
      if (rest.dueDate !== undefined) patch.dueDate = rest.dueDate;
      if (rest.overheadEnabled !== undefined)
        patch.overheadEnabled = rest.overheadEnabled;
      if (rest.overheadMode !== undefined)
        patch.overheadMode = rest.overheadMode;
      if (rest.overheadValue !== undefined) {
        patch.overheadValue =
          rest.overheadValue === null ? null : toDecimal4(rest.overheadValue);
      }
      if (rest.profitMethod !== undefined)
        patch.profitMethod = rest.profitMethod;
      if (rest.profitValue !== undefined) {
        patch.profitValue =
          rest.profitValue === null ? null : toDecimal4(rest.profitValue);
      }
      if (rest.productivityPct !== undefined) {
        patch.productivityPct =
          rest.productivityPct === null
            ? null
            : toDecimal4(rest.productivityPct);
      }
      // No null branch: the column is NOT NULL and 0 means no adjustment, so
      // there is nothing to clear back to.
      if (rest.whipAdjustPct !== undefined) {
        patch.whipAdjustPct = toDecimal4(rest.whipAdjustPct);
      }
      // Checked rather than trusted: a client id is a small integer, so
      // assigning one must prove it belongs to this user or a bid could be
      // pointed at a stranger's contact record.
      if (rest.clientId !== undefined) {
        if (rest.clientId !== null) {
          const client = await db.getClientById(
            rest.clientId,
            ctx.scope.dataUserId
          );
          if (!client)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Client not found.",
            });
        }
        patch.clientId = rest.clientId;
      }
      // Emptied by hand is the same as never filled in: both mean the proposal
      // should prompt, not print an empty line.
      if (rest.clientName !== undefined)
        patch.clientName = rest.clientName || null;
      if (rest.siteAddress !== undefined)
        patch.siteAddress = rest.siteAddress || null;
      if (rest.proposalNote !== undefined)
        patch.proposalNote = rest.proposalNote || null;

      // Checked, not trusted — the same rule the client link follows. A tax
      // area id is a small integer, and pointing a bid at someone else's rate
      // would charge a customer a number from another contractor's settings.
      if (rest.taxJurisdictionId !== undefined) {
        if (rest.taxJurisdictionId !== null) {
          const area = await db.getTaxJurisdictionById(
            rest.taxJurisdictionId,
            ctx.scope.dataUserId
          );
          if (!area)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Tax area not found.",
            });
        }
        patch.taxJurisdictionId = rest.taxJurisdictionId;
      }
      if (rest.taxRateOverridePct !== undefined) {
        // null clears the override; 0 is a real zero-rate and is kept.
        patch.taxRateOverridePct =
          rest.taxRateOverridePct === null
            ? null
            : toDecimal4(rest.taxRateOverridePct);
      }
      if (rest.taxExempt !== undefined) patch.taxExempt = rest.taxExempt;
      if (rest.taxExemptReason !== undefined)
        patch.taxExemptReason = rest.taxExemptReason || null;

      if (Object.keys(patch).length > 0)
        await db.updateBid(id, ctx.scope.dataUserId, patch);
      return db.getBidById(id, ctx.scope.dataUserId);
    }),

  /**
   * Move a bid off the dashboard without destroying it.
   *
   * Independent of `status` on purpose: a Won job and an abandoned Draft both
   * stop being things you want to look at every morning, and forcing the user
   * to mislabel a bid's outcome just to hide it would corrupt the one field
   * their reporting depends on.
   *
   * Reversible for RETENTION_DAYS, then not. `restore` is the way back.
   */
  archive: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const bid = await requireBid(input.id, ctx.scope.dataUserId);
      if (bid.archivedAt) {
        // Already counting down. Returning the ORIGINAL date rather than
        // re-archiving is the point: a double-click must not buy another 30
        // days and strand the bid in the archive indefinitely.
        return {
          success: true,
          archivedAt: bid.archivedAt,
          alreadyArchived: true,
        };
      }
      const now = new Date();
      await db.archiveBid(input.id, ctx.scope.dataUserId, now);
      return { success: true, archivedAt: now, alreadyArchived: false };
    }),

  /** Put an archived bid back on the dashboard, stopping the countdown. */
  restore: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const bid = await requireBid(input.id, ctx.scope.dataUserId);
      if (!bid.archivedAt) return { success: true, alreadyLive: true };
      await db.restoreBid(input.id, ctx.scope.dataUserId);
      return { success: true, alreadyLive: false };
    }),

  /**
   * The archive, with each bid's countdown resolved server-side.
   *
   * `daysRemaining` is computed here rather than in the browser because a
   * machine with a wrong clock would otherwise show a wrong deadline for a real
   * deletion — and the deletion itself runs on server time. One clock decides.
   */
  archived: procedure.query(async ({ ctx }) => {
    const now = new Date();
    const [rows, company] = await Promise.all([
      db.getArchivedBids(ctx.scope.dataUserId),
      companyDefaultsFor(ctx.scope.dataUserId),
    ]);

    return Promise.all(
      rows.map(async bid => {
        // Priced through the same rollUpBid as the dashboard, so a bid's value
        // reads the same whether it is archived or not — someone deciding what to
        // rescue is looking at exactly the number they saw before archiving it.
        const lines = await db.getBidLineItems(bid.id);
        const { bidPrice } = rollUpBid(bid, lines, company);
        // Non-null by construction: getArchivedBids filters on archivedAt.
        const archivedAt = bid.archivedAt as Date;
        return {
          ...bid,
          archivedAt,
          lineCount: lines.length,
          finalPrice: bidPrice.finalPrice,
          purgeDueAt: purgeDueAt(archivedAt),
          daysRemaining: daysRemaining(archivedAt, now),
          urgency: retentionUrgency(archivedAt, now),
        };
      })
    );
  }),

  /**
   * Destroy a bid now, without waiting out the window.
   *
   * Refuses anything not already archived, mirroring the modifiers pattern:
   * there is no path from the working list straight to destruction. The user
   * archives first, then confirms again from the archive.
   */
  deleteForever: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const bid = await requireBid(input.id, ctx.scope.dataUserId);
      if (!bid.archivedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only archived bids can be deleted permanently. Archive it first.",
        });
      }
      await db.deleteBidForever(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /**
   * A bid, its lines, and the full rolled-up price.
   *
   * Everything the detail screen needs in one call — lines priced individually,
   * grouped by repeating unit, summed to a direct cost, then run through
   * overhead and profit at whichever level supplied them.
   */
  get: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const bid = await requireBid(input.id, ctx.scope.dataUserId);
      const [lines, company, client, taxRules, jurisdictionRows, expenseRows] =
        await Promise.all([
          db.getBidLineItems(bid.id),
          companyDefaultsFor(ctx.scope.dataUserId),
          // Null for the great majority of bids, which have no client assigned.
          bid.clientId
            ? db.getClientById(bid.clientId, ctx.scope.dataUserId)
            : Promise.resolve(undefined),
          taxRulesFor(ctx.scope.dataUserId),
          db.getTaxJurisdictions(ctx.scope.dataUserId),
          db.getBidExpenses(bid.id),
        ]);

      const expenses = expenseRows.map(row => ({
        name: row.name,
        amount: Number(row.amount),
        taxable: row.taxable,
        markedUp: row.markedUp,
      }));

      const { settings, priced, units, totals, salesTax, taxRate } = bidRollup(
        bid,
        lines,
        company,
        {
          rules: taxRules,
          jurisdictions: jurisdictionRows.map(toTaxJurisdiction),
        },
        expenses
      );

      return {
        bid,
        lines: priced.map(({ line, breakdown }) => ({ ...line, breakdown })),
        units,
        totals,
        settings,
        company,
        /** The linked client record, or null. */
        client: client ?? null,
        /**
         * The tax figure, and where its rate came from.
         *
         * `salesTax.status` carries WHY when there is no amount — disabled,
         * exempt, nothing marked taxable, or no rate found. The screen shows
         * that sentence rather than an unexplained $0, because a silent zero
         * and a genuine exemption look identical and cost very differently.
         */
        salesTax,
        taxRate,
        /** Plain-language reason there is no tax, or null when there is. */
        taxNote: explainTaxStatus(salesTax.status, bid.siteAddress),
        /**
         * Name and site address after the bid's own text and the linked record
         * have been reconciled — the same resolution the proposal prints, so
         * the screen and the document cannot show different names.
         */
        resolvedClient: resolveBidClient(bid, client),
        /**
         * What the takeoff says that this bid's money does not yet agree with.
         *
         * All three sit in the warning strip under the totals, which is the
         * rule that surface already follows: it goes directly under the number
         * it contradicts. None of them is a badge on the drawing.
         */
        fromPlans: await planAttentionFor(bid.id, ctx.scope.dataUserId, lines),
      };
    }),

  /**
   * Where this bid stands with the quantity lock, and what unlocking would do.
   *
   * ── Why the changes are MEASURED rather than described ────────────────────
   * "Unlocking may change some quantities" is a warning nobody can act on. This
   * asks the drawing what it says today, compares it with what the bid is
   * holding, and hands back the differences by name — so the confirmation can
   * print "Exit sign LED: 14 → 16" and the estimator either recognises that or
   * cancels. CLAUDE.md § "A number that can be measured should not be asserted".
   *
   * ── Empty `changes` on an UNLOCKED bid, always ────────────────────────────
   * Its lines are already reading the drawing, so there is nothing pending.
   * Comparing the stored column against the resolved one there would report
   * every line sent before the last mark as a "change", which is a warning about
   * nothing on a screen that is already correct.
   */
  quantityLock: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      const { lockedAt, lines } = await db.compareBidQuantitiesWithPlans(
        input.bidId
      );
      const following = lines.filter(followsDrawing);
      return {
        lockedAt,
        /** Lines whose quantity comes from the plans — what a lock holds. */
        followingLines: following.length,
        changes: lockedAt === null ? [] : unlockChanges(following),
      };
    }),

  /**
   * Freeze the quantities — the estimator saying "this bid is what I sent".
   *
   * ── Never automatic, and never on a status change ─────────────────────────
   * A bid marked Won is often still being adjusted, and a lock the app applied
   * is a number frozen at an instant the app chose. Same reasoning as sending a
   * count to the bid being a button (§ 5f.0 OVERRIDE 2). One deliberate act.
   *
   * ── Locking a bid twice is not an error ───────────────────────────────────
   * It re-reads the drawing and re-stamps the time, which is what somebody who
   * pressed it again meant. Refusing would be a dialog explaining a state they
   * cannot see.
   */
  lockQuantities: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      // The clock is passed in rather than read inside, so the date on the
      // banner and the date in the row are one value. See db.lockBidQuantities.
      return db.lockBidQuantities(input.bidId, new Date());
    }),

  /**
   * Let the quantities follow the plans again.
   *
   * The numbers this moves are named by `quantityLock` above, which the screen
   * shows before asking. This mutation is the answer to that question, not the
   * place the question is asked — a confirmation built server-side would be a
   * second copy of the same comparison, computed at a different instant.
   */
  unlockQuantities: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      await db.unlockBidQuantities(input.bidId);
      return { success: true };
    }),

  /** Add an assembly to the bid, freezing its costs as they are right now. */
  addAssembly: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        assemblyId: z.number().int().positive(),
        qty: qtySchema.default(1),
        unitLabel: labelSchema.nullable().default(null),
        /**
         * Quick-bid sets this so repeat counts of one assembly stack onto a
         * single line, keeping that line's original snapshot. Off by default:
         * the Bids screen wants a new line, freshly snapshotted, every time.
         */
        merge: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      const { id, merged } = await db.addAssemblyToBid(
        input.bidId,
        ctx.scope.dataUserId,
        input.assemblyId,
        input.qty,
        input.unitLabel,
        { merge: input.merge }
      );
      const line = await db.getBidLineItem(id, input.bidId);
      return { line, merged };
    }),

  /**
   * Add a whole kit to the bid, snapshotting every assembly inside it.
   *
   * The kit does not become a row: it expands into ordinary line items, which
   * is exactly what makes each item's quantity editable afterwards. A bedroom
   * needing a fifth receptacle is then just an edit to that line, with no
   * kit-shaped container in the way. `qty` multiplies through, so 2 x a package
   * containing 4 receptacles lands 8.
   */
  addKit: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        kitId: z.number().int().positive(),
        qty: qtySchema.default(1),
        unitLabel: labelSchema.nullable().default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      try {
        return await db.addKitToBid(
          input.bidId,
          ctx.scope.dataUserId,
          input.kitId,
          input.qty,
          input.unitLabel
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Could not add that kit.",
        });
      }
    }),

  updateLine: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        id: z.number().int().positive(),
        qty: qtySchema.optional(),
        name: nameSchema.optional(),
        unitLabel: labelSchema.nullable().optional(),
        /**
         * The price and hours for ONE, typed on a hand-priced line — a free
         * count sent from the plans, or a line added with no assembly. NULL
         * puts the field back to "not typed yet", which is not the same as 0
         * and is what the warning strip reads (shared/handPricedLines.ts).
         * Refused on a line priced from the library.
         */
        materialCost: moneySchema.nullable().optional(),
        laborHours: hoursPerUnitSchema.nullable().optional(),
        /**
         * The role doing those hours. Its hourly cost is FROZEN onto the line
         * now, like every other line's rate, so a later raise does not re-price
         * this bid. Without one, typed hours price at $0 — the existing "hours
         * but no labor rate" warning names that.
         */
        laborRateId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const bid = await requireBid(input.bidId, ctx.scope.dataUserId);

      const typingPrice =
        input.materialCost !== undefined ||
        input.laborHours !== undefined ||
        input.laborRateId !== undefined;
      const handPatch: Record<string, unknown> = {};
      if (typingPrice) {
        const line = await db.getBidLineItem(input.id, input.bidId);
        if (!line)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Line not found.",
          });
        /*
          Only where the price did not come from the library. A library line
          re-snapshots from its assembly or run type on purpose, and a number
          typed over it would be a price the next reader cannot trace to
          anything. That is R4 guarding the other direction.
        */
        if (!canPriceByHand(line)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This line's price comes from your library, so it is not typed here. Change the assembly in the Library and add it again to take the new price.",
          });
        }
        if (input.materialCost !== undefined) {
          handPatch.snapshotMaterialCost =
            input.materialCost === null ? null : toDecimal4(input.materialCost);
        }
        if (input.laborHours !== undefined) {
          handPatch.snapshotLaborHours =
            input.laborHours === null ? null : toDecimal4(input.laborHours);
        }
        if (input.laborRateId !== undefined) {
          const rates = await db.getLibraryLaborRates(ctx.scope.dataUserId);
          const rate = resolveLaborRate(rates, input.laborRateId);
          if (!rate) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That labor role is not in your library.",
            });
          }
          handPatch.snapshotLaborRate = toDecimal4(hourlyCostOf(rate));
        }
      }

      /*
        What a from-plans line IS and HOW MANY of it there are both belong to
        the plans, so neither is typeable here.

        The quantity half is D2(a), settled 2026-09-14: "that line's quantity is
        changed by stamping, not by typing — one source of truth". Enforced here
        rather than only hidden in the UI, because a line reading 20 beside a
        drawing holding 16 is a disagreement with nothing on screen to say which
        is right.

        The name half follows from the same rule and is enforced for a plainer
        reason: `withPlanCounts` resolves a from-plans line's name from its
        group on every read, so a typed name would be accepted, written, and
        then silently never shown again. A field that takes an edit and drops it
        is worse than one that says no.

        Both refusals name where the change is actually made. Everything else on
        the line — the unit label, and removing it entirely — stays ordinary.
      */
      if (input.qty !== undefined || input.name !== undefined) {
        const line = await db.getBidLineItem(input.id, input.bidId);
        const source =
          line === undefined
            ? "typed"
            : quantitySource(line, bid.quantitiesLockedAt);
        if (input.qty !== undefined && source !== "typed") {
          /*
            A LOCKED bid is refused too, and the sentence is different.

            "Change it by marking on the Plans screen" is true while the line is
            following and a lie the moment it is frozen — marking is precisely
            what will not move it. A message that quietly restates the old
            meaning beside a number carrying the new one reads as confirmation
            (CLAUDE.md § a label describing the OLD meaning), so the wording is
            generated from the lock state by the module that owns it.

            Why locked is refused at all, rather than becoming typeable: the
            column now holds the drawing's answer, and a typed number over the
            top of it would be lost the moment somebody unlocks — an edit
            accepted and then dropped, which is worse than one refused. Unlock,
            or change the marks.
          */
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: typedQuantityRefusal(source, Number(line?.qty ?? 0)),
          });
        }
        if (line && input.name !== undefined && line.takeoffGroupId !== null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `This line is named by the count it came from. Rename that count on the Plans screen and the line follows.`,
          });
        }
      }

      const patch: Record<string, unknown> = {};
      if (input.qty !== undefined) patch.qty = toDecimal4(input.qty);
      if (input.name !== undefined) patch.name = input.name;
      if (input.unitLabel !== undefined) patch.unitLabel = input.unitLabel;
      Object.assign(patch, handPatch);

      // A LIBRARY line's frozen costs are not editable — re-adding the assembly
      // is how you take a fresh snapshot, and that stays an explicit act. The
      // one exception is a hand-priced line above, whose snapshot was never
      // from the library: typing it IS how it gets priced.
      if (Object.keys(patch).length > 0) {
        await db.updateBidLineItem(input.id, input.bidId, patch);
      }
      return db.getBidLineItem(input.id, input.bidId);
    }),

  /**
   * Price a hand-priced line from the library — optional, never required.
   *
   * ── An ASSEMBLY re-snapshots all four inputs and makes it a library line ──
   * See db.priceLineFromAssembly. After this it prices exactly like the same
   * assembly added any other way, and is no longer typed over.
   *
   * ── A MATERIAL copies its price, and hours only if the material has them ──
   * A line has no material column, so the number now lives on this job and the
   * line stays hand-priced — the estimator can still type over it. Materials
   * carry an optional labor unit; where one is set it comes too, and where it
   * is not the hours are left exactly as they were rather than zeroed, so a
   * blank stays a blank the strip can name.
   *
   * ── An UNPRICED material is refused ─────────────────────────────────────
   * Every shipped material costs $0 until somebody prices it (CLAUDE.md
   * § Materials). Copying that zero would turn a named "no price" into a
   * silent one — the exact failure blank-not-zero exists to stop.
   */
  linkLine: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        id: z.number().int().positive(),
        source: z.discriminatedUnion("kind", [
          z.object({
            kind: z.literal("assembly"),
            assemblyId: z.number().int().positive(),
          }),
          z.object({
            kind: z.literal("material"),
            materialId: z.number().int().positive(),
          }),
        ]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      const line = await db.getBidLineItem(input.id, input.bidId);
      if (!line)
        throw new TRPCError({ code: "NOT_FOUND", message: "Line not found." });
      if (!canPriceByHand(line)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This line is already priced from your library.",
        });
      }

      if (input.source.kind === "assembly") {
        const linked = await db.priceLineFromAssembly(
          line.id,
          input.bidId,
          ctx.scope.dataUserId,
          input.source.assemblyId
        );
        if (!linked)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Assembly not found.",
          });
        return { from: linked.name };
      }

      const material = resolveForkedRow(
        await db.getLibraryMaterials(ctx.scope.dataUserId),
        input.source.materialId
      );
      if (!material)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material not found.",
        });
      if (needsPricing(material.costPerUnit)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${material.name} has no price in your library yet — it shows $0. Price it on the Materials screen first, or type a price on this line.`,
        });
      }
      const patch: Record<string, unknown> = {
        snapshotMaterialCost: toDecimal4(Number(material.costPerUnit)),
        snapshotAt: new Date(),
      };
      if (material.laborHours !== null) {
        patch.snapshotLaborHours = toDecimal4(Number(material.laborHours));
      }
      await db.updateBidLineItem(line.id, input.bidId, patch);
      return { from: material.name };
    }),

  /**
   * Save a hand-priced line to the library as an assembly — optional, never
   * required, and offered on the line rather than as a prompt.
   *
   * Refused until both numbers have been SAID (0 counts, blank does not): an
   * assembly saved from a blank would carry a price nobody chose onto every
   * job after this one. See shared/handPricedLines.ts § saveAsAssemblyRefusal.
   *
   * The name must not already be an assembly. "Link to material or assembly"
   * is the answer when it is, and the refusal says so rather than quietly
   * making a second row with the same name.
   */
  saveLineAsAssembly: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        id: z.number().int().positive(),
        category: z.enum(ASSEMBLY_CATEGORIES),
        /** Who does the hours. Required when the line has any. */
        laborRateId: z.number().int().positive().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      const line = await db.getBidLineItem(input.id, input.bidId);
      if (!line)
        throw new TRPCError({ code: "NOT_FOUND", message: "Line not found." });
      const refusal = saveAsAssemblyRefusal(line);
      if (refusal)
        throw new TRPCError({ code: "BAD_REQUEST", message: refusal });

      const hours = Number(line.snapshotLaborHours);
      let laborRate = 0;
      if (input.laborRateId !== null) {
        const rate = resolveLaborRate(
          await db.getLibraryLaborRates(ctx.scope.dataUserId),
          input.laborRateId
        );
        if (!rate)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That labor role is not in your library.",
          });
        laborRate = hourlyCostOf(rate);
      } else if (hours > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Pick who does the hours. An assembly with hours and no role prices its labor at $0.",
        });
      }

      const name = line.name.trim().toLowerCase();
      const [assemblies, materials] = await Promise.all([
        db.getLibraryAssemblies(ctx.scope.dataUserId),
        db.getLibraryMaterials(ctx.scope.dataUserId),
      ]);
      const clash =
        assemblies.find(a => a.name.trim().toLowerCase() === name)?.name ??
        (Number(line.snapshotMaterialCost) > 0
          ? materials.find(m => m.name.trim().toLowerCase() === name)?.name
          : undefined);
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Your library already has "${clash}". Use "Link to material or assembly" to price this line from it instead.`,
        });
      }

      return db.saveLineAsAssembly({
        userId: ctx.scope.dataUserId,
        bidId: input.bidId,
        line,
        category: input.category,
        laborRateId: input.laborRateId,
        laborRate,
      });
    }),

  removeLine: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        id: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      await db.deleteBidLineItem(input.id, input.bidId);
      return { success: true };
    }),

  /** Distinct repeating units on a bid — the pick-list for mass duplicate. */
  units: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      return db.getBidUnitLabels(input.bidId);
    }),

  /**
   * Every unit with its link role — template, linked copy, forked copy, or a
   * one-off label. Drives the badge on each unit and which actions it offers.
   */
  unitStates: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      return db.getBidUnitStates(input.bidId);
    }),

  /**
   * Generate copies from one or more templates in a single action.
   *
   * Numbering is continuous ACROSS the groups, in the order given — 35 standard
   * rooms then 5 ADA rooms produce Room 101–140, because a hotel numbers rooms
   * by position, not by spec. Restarting per group would mint two Room 101s.
   */
  generateUnits: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        baseName: labelSchema,
        startNumber: z.number().int().min(0).max(100000).default(101),
        groups: z
          .array(
            z.object({
              sourceUnitLabel: labelSchema,
              // 200 of one type is a big hotel; beyond that it is a mistake.
              count: z.number().int().min(1).max(200),
            })
          )
          .min(1)
          .max(20),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      try {
        return await db.generateBidUnits(
          input.bidId,
          input.groups,
          input.baseName,
          input.startNumber
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not generate those units.",
        });
      }
    }),

  /**
   * Push a template's current lines onto every copy still following it.
   *
   * Never called automatically. The client confirms first, because this
   * overwrites whole units and the estimator is the only one who knows whether
   * the edit they just made was meant for one room or forty.
   */
  pushToLinkedCopies: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        templateLabel: labelSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      try {
        return await db.pushTemplateToLinkedCopies(
          input.bidId,
          input.templateLabel
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not update the linked copies.",
        });
      }
    }),

  /** Archive every copy still following a template. Forked copies are left. */
  archiveLinkedCopies: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        templateLabel: labelSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      return db.archiveLinkedCopies(input.bidId, input.templateLabel);
    }),

  /** Undo a bulk archive — the copies come back still linked. */
  restoreUnits: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        unitLabels: z.array(labelSchema).min(1).max(200),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      return db.restoreArchivedUnits(input.bidId, input.unitLabels);
    }),

  /** Break a copy's link by hand, without editing it first. */
  forkUnit: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        unitLabel: labelSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      return { forked: await db.forkBidUnit(input.bidId, input.unitLabel) };
    }),

  /**
   * Generate N numbered copies of a repeating unit.
   *
   * Copies carry the SOURCE's snapshot, not a fresh read of the library, so
   * every generated room prices identically no matter when it was made.
   */
  duplicateUnit: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        sourceUnitLabel: labelSchema,
        baseName: labelSchema,
        startNumber: z.number().int().min(0).max(100000).default(101),
        // 200 rooms is a big hotel; beyond that this is a mistake, not a bid.
        count: z.number().int().min(1).max(200),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      try {
        return await db.duplicateBidUnit(
          input.bidId,
          input.sourceUnitLabel,
          input.baseName,
          input.startNumber,
          input.count
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Could not duplicate that unit.",
        });
      }
    }),

  /** Company-level pricing defaults — the fallback every bid inherits. */
  pricingDefaults: procedure.query(async ({ ctx }) => {
    return db.getPricingDefaults(ctx.scope.dataUserId);
  }),

  /**
   * `pricing.edit`, not this router's `bids.edit`.
   *
   * The exception that proves why `scoped()` needs one. Everything else here
   * changes ONE bid; this changes overhead, profit and the productivity factor
   * for the whole company — and because settings are inherited rather than
   * copied (CLAUDE.md § Company defaults), it re-prices every existing bid
   * still following them. An estimator adding a line and an estimator moving
   * the company's margin are not the same act and must not share a gate.
   *
   * Caught by an adversarial test, not by review.
   */
  setPricingDefaults: requireCapability("pricing.edit")
    .input(
      z.object({
        overheadEnabled: z.boolean().optional(),
        overheadMode: overheadModeSchema.optional(),
        overheadValue: z.number().min(0).optional(),
        profitMethod: profitMethodSchema.optional(),
        profitValue: z.number().min(0).max(0.99).optional(),
        productivityPct: productivitySchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const patch: Record<string, unknown> = {};
      if (input.overheadEnabled !== undefined)
        patch.overheadEnabled = input.overheadEnabled;
      if (input.overheadMode !== undefined)
        patch.overheadMode = input.overheadMode;
      if (input.overheadValue !== undefined)
        patch.overheadValue = toDecimal4(input.overheadValue);
      if (input.profitMethod !== undefined)
        patch.profitMethod = input.profitMethod;
      if (input.profitValue !== undefined)
        patch.profitValue = toDecimal4(input.profitValue);
      if (input.productivityPct !== undefined) {
        patch.productivityPct = toDecimal4(input.productivityPct);
      }

      if (Object.keys(patch).length > 0) {
        await db.updatePricingDefaults(ctx.scope.dataUserId, patch);
      }
      return db.getPricingDefaults(ctx.scope.dataUserId);
    }),
});
