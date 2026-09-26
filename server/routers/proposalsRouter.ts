/**
 * Proposals — the client-facing document, and the two things that dress it.
 *
 * Three groups of procedures:
 *   • branding  — the contractor's own letterhead. Per user, never shared.
 *   • settings  — layout, accent colour, which sections appear.
 *   • document  — one bid, rendered into the view model the page draws.
 *
 * ── The document is built on the server ──────────────────────────────────────
 * `document` returns a finished ProposalDocument rather than the raw parts,
 * for the same reason the bid rollup is server-side: the browser must never be
 * the thing that decides what a client sees. If deciding what to hide happened
 * in the renderer, then every layout would have to make that decision again and
 * the third one to be written would eventually get it wrong — showing a
 * contractor's overhead percentage to their customer is not a cosmetic bug.
 *
 * The narrowing itself lives in shared/proposal.ts (`buildProposal`), which is
 * pure and directly tested. This router's job is to fetch, authorise, and hand
 * it the pieces.
 *
 * ── Prices come from the bid's snapshot, not from today's catalog ────────────
 * The numbers are produced by ../bidPricing, the same rollup the Bids screen
 * reads. A proposal therefore quotes what was actually priced when the lines
 * were added — re-pricing a material next month does not silently reissue the
 * quote at a new number.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import { PROPOSAL_LAYOUTS } from "../../drizzle/schema";
import { PROPOSAL_MODES } from "../../shared/bidExtras";
import {
  buildProposal,
  isValidAccent,
  PROPOSAL_SECTION_IDS,
  type BrandingFields,
} from "../../shared/proposal";
import {
  bidRollup,
  companyDefaultsFor,
  taxRulesFor,
  toTaxJurisdiction,
} from "../bidPricing";
import { refuseIfIncomplete, reportPricingProblems } from "../pricingProblems";
import { resolveBidClient } from "../../shared/bidClient";
import { explainTaxStatus } from "../../shared/salesTax";
import { storagePresignPut } from "../storage";
import * as db from "../db";
import { storageUrl } from "../storageTokens";

/**
 * This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("bids.view", "bids.edit");

/** Logos are small. This is a letterhead image, not a plan sheet. */
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

const sectionIdSchema = z.enum(PROPOSAL_SECTION_IDS);

/**
 * A fetchable URL for the logo, minted from its KEY.
 *
 * `company_branding.logoUrl` is a stored path from before the storage proxy
 * required a token, and it no longer fetches anything on its own. The key is
 * the durable fact; the URL is derived per read and expires. Null stays null —
 * a company with no logo has no URL, and the document prints a placeholder.
 */
function logoUrlFor(
  row: Awaited<ReturnType<typeof db.getCompanyBranding>>
): string | null {
  return row?.logoKey ? storageUrl(row.logoKey, new Date()) : null;
}

/** The branding row reduced to what the document needs, and nothing else. */
function toBrandingFields(
  row: Awaited<ReturnType<typeof db.getCompanyBranding>>
): BrandingFields {
  return {
    companyName: row?.companyName ?? "",
    licenseNumber: row?.licenseNumber ?? "",
    address: row?.address ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    website: row?.website ?? "",
    logoUrl: logoUrlFor(row),
  };
}

async function requireBid(id: number, userId: number) {
  const bid = await db.getBidById(id, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  return bid;
}

export const proposalsRouter = router({
  // ── Branding ───────────────────────────────────────────────────────────────

  /**
   * This user's letterhead. Always returns a row — blank for a new account,
   * which is exactly what the Settings screen and the document want to see.
   */
  branding: procedure.query(async ({ ctx }) => {
    const row = await db.getCompanyBranding(ctx.scope.dataUserId);
    return {
      companyName: row?.companyName ?? "",
      licenseNumber: row?.licenseNumber ?? "",
      address: row?.address ?? "",
      phone: row?.phone ?? "",
      email: row?.email ?? "",
      website: row?.website ?? "",
      logoKey: row?.logoKey ?? null,
      logoUrl: logoUrlFor(row),
    };
  }),

  /**
   * Save one or more branding fields.
   *
   * Every field is optional and only the ones sent are written, so the settings
   * form can save field by field as the user leaves each one — the standing
   * rule for self-saving inputs (CLAUDE.md § Editing fields).
   */
  setBranding: procedure
    .input(
      z.object({
        companyName: z.string().trim().max(255).optional(),
        licenseNumber: z.string().trim().max(128).optional(),
        address: z.string().trim().max(512).optional(),
        phone: z.string().trim().max(64).optional(),
        email: z.string().trim().max(320).optional(),
        website: z.string().trim().max(255).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) patch[key] = value;
      }
      if (Object.keys(patch).length > 0) {
        await db.updateCompanyBranding(ctx.scope.dataUserId, patch);
      }
      return db.getCompanyBranding(ctx.scope.dataUserId);
    }),

  /**
   * Step 1 of a logo upload: check it, hand back somewhere to put it.
   *
   * Same two-step shape as attaching a plan (bidPdfsRouter): the browser PUTs
   * straight to S3 and this server never holds the bytes. Overkill for a 40 KB
   * logo on its own, but having one upload pattern in the app is worth more
   * than saving a round trip on a file people upload once.
   */
  createLogoUploadTicket: procedure
    .input(
      z.object({
        filename: z.string().trim().min(1).max(255),
        contentType: z.enum(LOGO_TYPES),
        byteSize: z.number().int().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.byteSize > MAX_LOGO_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `That logo is ${(input.byteSize / 1024 / 1024).toFixed(1)} MB. Keep it under ${MAX_LOGO_BYTES / 1024 / 1024} MB — a letterhead image does not need to be larger.`,
        });
      }

      const { key, uploadUrl } = await storagePresignPut(
        `company-logos/${ctx.scope.dataUserId}/${input.filename}`,
        input.contentType
      );
      return { uploadUrl, storageKey: key };
    }),

  /**
   * Step 2: the bytes are in storage — point the letterhead at them.
   *
   * The key has to be one this server just issued for THIS user. Without that
   * check a caller could set their logo to any object in the bucket by naming
   * its key, including another contractor's.
   */
  confirmLogo: procedure
    .input(z.object({ storageKey: z.string().min(1).max(1024) }))
    .mutation(async ({ input, ctx }) => {
      const expectedPrefix = `company-logos/${ctx.scope.dataUserId}/`;
      if (!input.storageKey.startsWith(expectedPrefix)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "That upload does not belong to this account.",
        });
      }
      await db.updateCompanyBranding(ctx.scope.dataUserId, {
        logoKey: input.storageKey,
        /**
         * Kept for the rows that already have it, and for anything reading the
         * column directly. It is NOT fetchable on its own any more — the proxy
         * requires a signed token in the path — so every read mints a fresh URL
         * from `logoKey` instead. See logoUrlFor.
         */
        logoUrl: `/manus-storage/${input.storageKey}`,
      });
      const row = await db.getCompanyBranding(ctx.scope.dataUserId);
      // The minted URL, not the stored path, so a caller that uses this
      // response directly gets one that actually loads.
      return row ? { ...row, logoUrl: logoUrlFor(row) } : row;
    }),

  /** Remove the logo. The document goes back to prompting for one. */
  clearLogo: procedure.mutation(async ({ ctx }) => {
    await db.updateCompanyBranding(ctx.scope.dataUserId, {
      logoKey: null,
      logoUrl: null,
    });
    return db.getCompanyBranding(ctx.scope.dataUserId);
  }),

  // ── Presentation ───────────────────────────────────────────────────────────

  settings: procedure.query(async ({ ctx }) => {
    const row = await db.getProposalSettings(ctx.scope.dataUserId);
    return {
      layout: row?.layout ?? "classic",
      accentColor: row?.accentColor ?? "#F5C518",
      hiddenSections: row?.hiddenSections ?? [],
      termsText: row?.termsText ?? "",
      validDays: row?.validDays ?? 30,
    };
  }),

  /**
   * Change how proposals look.
   *
   * Presentation only — there is deliberately no procedure here that can move a
   * price. Clicking through the three layouts on a finished bid is safe by
   * construction, not by care.
   */
  setSettings: procedure
    .input(
      z.object({
        layout: z.enum(PROPOSAL_LAYOUTS).optional(),
        accentColor: z.string().trim().max(9).optional(),
        hiddenSections: z.array(sectionIdSchema).max(32).optional(),
        termsText: z.string().max(4000).optional(),
        /** 0 switches the validity line off; a year is already generous. */
        validDays: z.number().int().min(0).max(365).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const patch: Record<string, unknown> = {};
      if (input.layout !== undefined) patch.layout = input.layout;
      if (input.accentColor !== undefined) {
        // Refused rather than corrected: silently swapping an unreadable colour
        // for the default would leave the user clicking a control that appears
        // to do nothing.
        if (!isValidAccent(input.accentColor)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `“${input.accentColor}” is not a colour. Use a hex value like #1F4E79.`,
          });
        }
        patch.accentColor = input.accentColor;
      }
      if (input.hiddenSections !== undefined) {
        // Deduplicated here so the stored list stays the small, readable thing
        // a checkbox column writes.
        patch.hiddenSections = Array.from(new Set(input.hiddenSections));
      }
      if (input.termsText !== undefined) patch.termsText = input.termsText;
      if (input.validDays !== undefined) patch.validDays = input.validDays;

      if (Object.keys(patch).length > 0) {
        await db.updateProposalSettings(ctx.scope.dataUserId, patch);
      }
      return db.getProposalSettings(ctx.scope.dataUserId);
    }),

  // ── The document ───────────────────────────────────────────────────────────

  /**
   * One bid as a client-facing proposal.
   *
   * Returns the built document AND the bid's own internal totals. The second is
   * not on the document — it is what the composer shows the contractor beside
   * the preview, so they can see the bid price they know and confirm the
   * proposal quotes the same figure.
   */
  document: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        /**
         * Which document to build.
         *
         * Transient — deliberately NOT stored. A stored preference is one that
         * can be left on scope-only by accident and then printed as if it were
         * the priced proposal. Every visit starts from the real document.
         */
        mode: z.enum(PROPOSAL_MODES).default("full"),
      })
    )
    .query(async ({ input, ctx }) => {
      const bid = await requireBid(input.bidId, ctx.scope.dataUserId);
      const [
        lines,
        company,
        brandingRow,
        settingsRow,
        client,
        taxRules,
        jurisdictionRows,
        expenseRows,
        scopeNoteRows,
      ] = await Promise.all([
        db.getBidLineItems(bid.id),
        companyDefaultsFor(ctx.scope.dataUserId),
        db.getCompanyBranding(ctx.scope.dataUserId),
        db.getProposalSettings(ctx.scope.dataUserId),
        bid.clientId
          ? db.getClientById(bid.clientId, ctx.scope.dataUserId)
          : Promise.resolve(undefined),
        taxRulesFor(ctx.scope.dataUserId),
        db.getTaxJurisdictions(ctx.scope.dataUserId),
        db.getBidExpenses(bid.id),
        db.getBidScopeNotes(bid.id),
      ]);

      // Same rollup, same tax context as the bid screen. Two callers computing
      // their own tax is how a client receives a document whose total does not
      // match the bid it was approved from.
      const expenses = expenseRows.map(row => ({
        name: row.name,
        amount: Number(row.amount),
        taxable: row.taxable,
        markedUp: row.markedUp,
      }));

      const { priced, units, totals, salesTax, problems } = bidRollup(
        bid,
        lines,
        company,
        {
          rules: taxRules,
          jurisdictions: jurisdictionRows.map(toTaxJurisdiction),
        },
        expenses
      );

      // A proposal built on a total that leaves a line out is a wrong price
      // sent to a client. Refuse, with the references. See pricingProblems.ts.
      // Scope-only prints no money, so an incomplete total cannot leak through
      // it — it stays available, and is still reported.
      const reported = await reportPricingProblems(
        ctx.scope.dataUserId,
        bid.id,
        problems
      );
      if (input.mode === "full") refuseIfIncomplete(reported, "a proposal");

      // The bid's own text still wins; a linked client only fills in what was
      // left blank. With no client this returns bid.clientName/siteAddress
      // unchanged, which is why attaching the link altered no existing
      // proposal. See shared/bidClient.ts.
      const resolved = resolveBidClient(bid, client);

      const document = buildProposal({
        bid: {
          name: bid.name,
          clientName: resolved.clientName,
          siteAddress: resolved.siteAddress,
          proposalNote: bid.proposalNote,
        },
        totals,
        salesTax,
        taxExemptReason: bid.taxExemptReason,
        expenses: totals.expenseLines.map(line => ({
          name: line.name,
          amount: line.charged,
        })),
        scopeNotes: scopeNoteRows.map(row => ({
          kind: row.kind,
          text: row.text,
        })),
        mode: input.mode,
        units: units.map(u => ({
          label: u.label,
          directCost: u.directCost,
          costWithMarkup: u.costWithMarkup,
        })),
        lines: priced.map(({ line }) => ({
          name: line.name,
          qty: Number(line.qty),
          unitLabel: line.unitLabel,
        })),
        branding: toBrandingFields(brandingRow),
        design: {
          layout: settingsRow?.layout ?? "classic",
          accentColor: settingsRow?.accentColor ?? "#F5C518",
          hiddenSections: settingsRow?.hiddenSections ?? [],
          termsText: settingsRow?.termsText ?? null,
          validDays: settingsRow?.validDays ?? 30,
        },
        // The clock is the server's, so two people looking at the same proposal
        // on either side of midnight see the same date on it.
        now: new Date(),
      });

      return {
        document,
        /**
         * The linked client record, or null.
         *
         * The composer needs this to explain itself: with a client attached and
         * the bid's own Client field empty, the field looks unfilled while the
         * document is addressed to someone. Without saying where that name came
         * from, the empty box invites a name to be typed into it — which
         * silently overrides the record rather than editing it.
         */
        client: client
          ? { id: client.id, name: client.name, address: client.address }
          : null,
        /**
         * Sales tax, and — when there is none — why.
         *
         * The composer needs the `no-rate` case especially: the DOCUMENT cannot
         * invent a tax it does not know, so it silently prints without one.
         * That is the right behaviour for the document and the wrong thing to
         * leave unsaid to the person about to send it, so the warning surfaces
         * here, beside the preview, where it can still be fixed.
         */
        salesTax,
        taxNote: explainTaxStatus(salesTax.status, bid.siteAddress),
        bid: {
          id: bid.id,
          name: bid.name,
          status: bid.status,
          clientName: bid.clientName,
          siteAddress: bid.siteAddress,
          proposalNote: bid.proposalNote,
        },
        /** The estimator's own view, for confirming the two agree. Never shown to a client. */
        internalTotals: {
          materialCost: totals.materialCost,
          laborCost: totals.laborCost,
          directCost: totals.directCost,
          materialMarkup: totals.materialMarkup,
          overheadAmount: totals.overheadAmount,
          profitAmount: totals.profitAmount,
          finalPrice: totals.finalPrice,
        },
        lineCount: lines.length,
      };
    }),
});
