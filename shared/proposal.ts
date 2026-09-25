/**
 * The proposal document — what a finished bid looks like to the client.
 *
 * ── A different document from the bid screen, on purpose ─────────────────────
 * The Bids screen shows an estimator their own costs: materials, labor hours,
 * the modifier percentages, overhead, the profit method and what it added. A
 * client is not shown any of that. They are shown what work is included, how
 * long it stands, and what it costs — one price, arrived at honestly, with
 * nothing on the page that invites a line-by-line negotiation of the
 * contractor's margin.
 *
 * So this module is not a formatter over the bid rollup. It is a deliberate
 * NARROWING of it, and the narrowing is the feature. `buildProposal` takes the
 * full internal breakdown and returns only what may leave the building:
 *
 *   materials + labor + overhead + profit   →   "Total investment"
 *
 * Overhead and profit are folded into the total rather than listed. They are
 * real costs of doing the work and they belong IN the price; itemising them
 * turns a proposal into an invitation to ask which of them can be dropped.
 *
 * ── Pure, like shared/pricing.ts ─────────────────────────────────────────────
 * No database, no framework, no I/O, no clock of its own — the date is passed
 * in. Everything here is directly testable, which is what lets
 * `server/proposal.test.ts` assert what the client can and cannot see without
 * standing up a browser.
 *
 * ── It never re-prices anything ──────────────────────────────────────────────
 * Every figure arrives already computed by the pricing engine from the bid's
 * SNAPSHOT. This module does not multiply, mark up or adjust; the only
 * arithmetic it does is rounding for display. A proposal generated today from a
 * bid priced in March shows March's numbers, because that is what was priced.
 */

import { PROPOSAL_LAYOUTS, type ProposalLayout } from "../drizzle/schema";
import { roundMoney } from "./pricing";
import {
  groupScopeNotes,
  sectionAllowedInMode,
  sumExpenses,
  type ProposalMode,
} from "./bidExtras";

export { PROPOSAL_LAYOUTS, type ProposalLayout };

// ─── Layouts ──────────────────────────────────────────────────────────────────

/**
 * Three pre-built looks, and deliberately no fourth way in.
 *
 * There is no template upload and no free-form editor. Every layout here is a
 * document somebody would be happy to hand a general contractor, and the user
 * picks between finished things rather than assembling one. The cost of the
 * open version is not the editor — it is that the app can no longer promise the
 * output is presentable, and a broken proposal goes out under the contractor's
 * name, not ours.
 */
export const PROPOSAL_LAYOUT_INFO: Record<
  ProposalLayout,
  { label: string; description: string }
> = {
  classic: {
    label: "Classic",
    description:
      "Serif headings, ruled sections, logo and details stacked at the top left. Reads like a contract.",
  },
  modern: {
    label: "Modern",
    description:
      "A colour band across the head of the page, the total called out in a panel, generous spacing.",
  },
  minimal: {
    label: "Minimal",
    description:
      "No fills, hairline rules, one accent. Fits the most on a page and photocopies cleanly.",
  },
};

/** Ships as the app's own yellow — a colour, not a company's identity. */
export const DEFAULT_ACCENT = "#F5C518";

/** `#RGB` and `#RRGGBB` only. Anything else is refused rather than corrected. */
export function isValidAccent(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim());
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export const PROPOSAL_SECTION_IDS = [
  "letterhead",
  "preparedFor",
  "summary",
  "scope",
  "inclusions",
  "laborSummary",
  "unitPricing",
  "investment",
  "terms",
  "acceptance",
] as const;

export type ProposalSectionId = (typeof PROPOSAL_SECTION_IDS)[number];

export type SectionInfo = {
  id: ProposalSectionId;
  label: string;
  description: string;
  /**
   * Sections that cannot be switched off.
   *
   * Two of them, and only two: the letterhead, because a document with no
   * sender is not a proposal, and the investment total, because a proposal that
   * does not say the price is not one either. Everything else is the user's
   * call — some contractors send a page and a number, others send four pages.
   */
  required?: true;
};

export const PROPOSAL_SECTIONS: SectionInfo[] = [
  {
    id: "letterhead",
    label: "Your company header",
    description: "Logo, company name, licence number, address and phone.",
    required: true,
  },
  {
    id: "preparedFor",
    label: "Prepared for",
    description: "Who the proposal is addressed to, and the job address.",
  },
  {
    id: "summary",
    label: "Project summary",
    description: "The job name, the date, and how long the price stands.",
  },
  {
    id: "scope",
    label: "Scope of work",
    description:
      "What is included, by name and quantity. No unit costs — quantities only.",
  },
  {
    id: "inclusions",
    label: "Includes and excludes",
    description:
      "What the price covers, and what it explicitly does not. Hidden when the bid has neither.",
  },
  {
    id: "laborSummary",
    label: "Labor summary",
    description: "Total estimated labor hours for the job.",
  },
  {
    id: "unitPricing",
    label: "Price per unit",
    description:
      "For repeating work — a per-room or per-apartment price. Hidden when the bid has no repeating units.",
  },
  {
    id: "investment",
    label: "Total investment",
    description: "The price. One figure, everything included.",
    required: true,
  },
  {
    id: "terms",
    label: "Terms",
    description: "Your standard payment terms and exclusions.",
  },
  {
    id: "acceptance",
    label: "Acceptance",
    description: "Signature and date lines for the client to sign and return.",
  },
];

const REQUIRED_SECTIONS = new Set<string>(
  PROPOSAL_SECTIONS.filter(s => s.required).map(s => s.id)
);

/**
 * Is this section on?
 *
 * Reads the hidden list rather than a visible one, so a section shipped after a
 * user last touched their settings is on for them. A required section is on
 * whatever the stored list says — including a list hand-edited in the database
 * or left behind by an older version that let it be hidden.
 */
export function isSectionVisible(
  hiddenSections: string[] | null | undefined,
  id: ProposalSectionId
): boolean {
  if (REQUIRED_SECTIONS.has(id)) return true;
  return !(hiddenSections ?? []).includes(id);
}

/**
 * Turn one section on or off, returning the new hidden list.
 *
 * Refuses to hide a required section rather than throwing: the caller is a
 * checkbox, and a toggle that silently declines is better than one that can
 * error out mid-edit. The UI renders those two as fixed rather than as
 * switches, so this is the second line of defence, not the first.
 */
export function setSectionVisible(
  hiddenSections: string[] | null | undefined,
  id: ProposalSectionId,
  visible: boolean
): string[] {
  const current = (hiddenSections ?? []).filter(s =>
    PROPOSAL_SECTION_IDS.includes(s as ProposalSectionId)
  );
  if (visible || REQUIRED_SECTIONS.has(id)) {
    return current.filter(s => s !== id);
  }
  return current.includes(id) ? current : [...current, id];
}

// ─── Branding ─────────────────────────────────────────────────────────────────

export type BrandingFields = {
  companyName: string | null;
  licenseNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
};

/** Everything blank, for an account that has set nothing. */
export const EMPTY_BRANDING: BrandingFields = {
  companyName: "",
  licenseNumber: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  logoUrl: null,
};

/**
 * The fields a proposal genuinely needs before it can be sent, in the order the
 * prompt should name them.
 *
 * Email and website are not on this list. Plenty of contractors do not put
 * either on paper, and flagging a field somebody has deliberately left out
 * teaches them to ignore the flag — the same reason the material catalog only
 * flags a $0 price and not every empty column on the row.
 */
const NEEDED_BRANDING: Array<{ key: keyof BrandingFields; label: string }> = [
  { key: "logoUrl", label: "logo" },
  { key: "companyName", label: "company name" },
  { key: "licenseNumber", label: "license number" },
  { key: "address", label: "address" },
  { key: "phone", label: "phone" },
];

const blank = (value: string | null | undefined) =>
  value == null || value.trim() === "";

/**
 * Which branding fields are still empty.
 *
 * Same shape of answer as `countNeedingPricing` for materials: not a boolean
 * buried in the UI but a list, so the placeholder can name what is missing
 * instead of saying "incomplete" and leaving the user to hunt.
 */
export function missingBrandingFields(
  branding: BrandingFields
): Array<{ key: keyof BrandingFields; label: string }> {
  return NEEDED_BRANDING.filter(field => blank(branding[field.key]));
}

/**
 * True when this account has not set up its branding.
 *
 * ── Why "any field missing" rather than "all fields missing" ─────────────────
 * A half-filled letterhead is the failure this is here to catch. A proposal
 * carrying a company name but no licence number looks finished — nothing on the
 * page is obviously wrong — and goes out missing a number that is a legal
 * requirement to state on electrical work in most places. Blank is loud;
 * plausible-but-incomplete is silent, which makes it the more expensive of the
 * two. So the prompt stays up until the letterhead is actually complete.
 */
export function needsBranding(branding: BrandingFields): boolean {
  return missingBrandingFields(branding).length > 0;
}

/**
 * What the letterhead prints for a field the user has not filled in.
 *
 * Never blank space. A blank line on a proposal reads as a rendering fault to
 * the contractor and as nothing at all to the client — and worse, it can be
 * missed entirely and sent. A visible bracketed prompt cannot be: it says what
 * belongs there, it is obviously not real, and it survives being printed to
 * PDF, so anyone who sends the document without looking finds out immediately
 * rather than after the client does.
 */
export function brandingPlaceholder(label: string): string {
  return `[Add your ${label}]`;
}

// ─── The document ─────────────────────────────────────────────────────────────

/** One line of work, as the client sees it: what and how many. Never a cost. */
export type ProposalScopeLine = {
  name: string;
  qty: number;
  /** Which repeating unit it belongs to, e.g. "Room 101". Null for one-offs. */
  unitLabel: string | null;
};

export type ProposalScopeGroup = {
  /** Null for the lines that belong to no unit. */
  label: string | null;
  lines: ProposalScopeLine[];
};

export type ProposalUnitPrice = {
  label: string;
  /** The unit's share of the final price, not its bare cost. See below. */
  price: number;
};

/** What the caller hands in — the bid, already priced, plus how to dress it. */
export type BuildProposalInput = {
  bid: {
    name: string;
    clientName: string | null;
    siteAddress: string | null;
    proposalNote: string | null;
  };
  /** Priced from the bid's snapshot by shared/pricing.ts. Never recomputed here. */
  totals: {
    directCost: number;
    /**
     * Direct cost plus material markup — what overhead and profit applied to,
     * and so the only honest denominator for spreading the price over units.
     * Required: see `unitPricing` below.
     */
    costWithMarkup: number;
    overheadAmount: number;
    profitAmount: number;
    finalPrice: number;
    /**
     * The marked-up materials and labor alone.
     *
     * Falls back to finalPrice, which is what it equals on any bid with no
     * marked-up charge — so a caller that predates them is unaffected.
     */
    workPrice?: number;
    totalLaborHours: number;
  };
  /**
   * The sales tax on this bid, as bidRollup computed it.
   *
   * Optional so a caller with no tax context produces exactly the document it
   * produced before tax existed — which is also the document a user who never
   * switched tax on should get.
   */
  salesTax?: {
    status: string;
    amount: number;
    ratePct: number | null;
    components: { label: string; ratePct: number }[];
    totalWithTax: number;
  };
  /** Printed on an exempt line so the document says why it was not taxed. */
  taxExemptReason?: string | null;
  /** Flat charges on the bid — permits, inspections, dispatch. */
  expenses?: readonly { name: string; amount: number }[];
  /** What the price covers and what it does not. */
  scopeNotes?: readonly { kind: "include" | "exclude"; text: string }[];
  /**
   * Which document to build. Defaults to the full priced proposal, so every
   * existing caller is unchanged.
   */
  mode?: ProposalMode;
  /**
   * Unit subtotals as bids.get returns them. `costWithMarkup` is the unit's
   * direct cost plus ITS lines' material markup, and is what the unit is
   * priced from.
   */
  units: Array<{ label: string; directCost: number; costWithMarkup: number }>;
  lines: ProposalScopeLine[];
  branding: BrandingFields;
  design: {
    layout: ProposalLayout;
    accentColor: string;
    hiddenSections: string[] | null;
    termsText: string | null;
    validDays: number;
  };
  /** Passed in, never read from the clock — see shared/retention.ts for why. */
  now: Date;
};

export type ProposalDocument = {
  layout: ProposalLayout;
  accentColor: string;
  /** Every visible section id, in document order. */
  visibleSections: ProposalSectionId[];
  letterhead: {
    /** Field text with placeholders already substituted — ready to render. */
    companyName: string;
    licenseNumber: string;
    addressLines: string[];
    phone: string;
    email: string;
    website: string;
    logoUrl: string | null;
    /** True when at least one field is a placeholder rather than real content. */
    needsSetup: boolean;
    /** Plain-language list for the "finish your letterhead" prompt. */
    missing: string[];
  };
  preparedFor: {
    clientName: string;
    siteAddress: string[];
    /** The client's name is a placeholder rather than something they typed. */
    needsSetup: boolean;
  };
  summary: {
    projectName: string;
    dateLabel: string;
    /** Null when validity is switched off (0 days). */
    validUntilLabel: string | null;
    note: string | null;
  };
  /**
   * Which document this is.
   *
   * The renderer needs it for the wording that REFERS to a price — a labor
   * line saying "included in the price below" is wrong on a page with no
   * price below it, and a dangling reference like that is exactly the kind of
   * thing a GC notices before the contractor does.
   */
  mode: ProposalMode;
  scope: ProposalScopeGroup[];
  /**
   * What the price covers and what it does not.
   *
   * Prints on the client document because that is its entire purpose: an
   * exclusion nobody read is an exclusion that does not settle the argument.
   */
  inclusions: { includes: string[]; excludes: string[] };
  laborHours: number;
  unitPricing: ProposalUnitPrice[];
  investment: {
    /**
     * What the customer owes — expenses and tax included. The bottom line.
     *
     * This used to be the ONLY money figure on the document, and on a bid with
     * no expenses and no tax it still is. Each of those, when present, has to
     * appear as its own line: a total with charges folded silently inside it is
     * one the customer cannot check and the contractor cannot defend.
     */
    total: number;
    /**
     * Work + expenses, before tax. Equal to `total` when there is no tax.
     */
    subtotal: number;
    /**
     * The flat charges, itemised, or null when the bid has none.
     *
     * Named individually rather than lumped as "Fees" because the whole reason
     * a permit is its own line is so the customer can see WHAT they are paying
     * for; an unlabelled block of charges invites exactly the query it was
     * meant to prevent.
     */
    expenses: {
      lines: { name: string; amount: number }[];
      total: number;
    } | null;
    /** Work only — materials, labor, overhead and profit, before expenses. */
    workTotal: number;
    /**
     * The tax line, or null when the document carries none.
     *
     * Null covers every "no tax" case EXCEPT exemption: an exempt customer gets
     * an explicit $0 line, because someone entitled to an exemption should see
     * on the document that they received it. Absence would look like an
     * oversight to exactly the customer most likely to check.
     */
    salesTax: {
      amount: number;
      /** Percent, e.g. 9.25. Null on an exempt line. */
      ratePct: number | null;
      /** The stack — "State 6.25%", "Cook County 1.75%" — for showing the working. */
      components: { label: string; ratePct: number }[];
      exempt: boolean;
      /** Why, on an exempt line. Printed so the document explains itself. */
      exemptReason: string | null;
    } | null;
    /** True when overhead or profit is in the total — drives the wording. */
    includesIndirect: boolean;
  };
  terms: string | null;
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", DATE_FORMAT);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** Split an address the way a person wrote it — newlines first, then commas. */
function addressLines(value: string | null | undefined): string[] {
  if (blank(value)) return [];
  const raw = value as string;
  const parts = raw.includes("\n") ? raw.split("\n") : raw.split(/,\s*/);
  return parts.map(line => line.trim()).filter(Boolean);
}

/**
 * Build the document.
 *
 * The one place that decides what a client sees. Every rule this module's
 * header states is enforced here rather than in the renderer, so the three
 * layouts cannot disagree about what is on the page — they only disagree about
 * how it looks.
 */
/**
 * The money block at the foot of the document.
 *
 * ── Three numbers or one ─────────────────────────────────────────────────────
 * Without tax the document keeps exactly the shape it always had: one figure,
 * everything inside it. With tax it becomes subtotal / tax / total, because a
 * total with tax folded in is a number the customer cannot verify against
 * their own understanding of the rate — and sales tax is the one line on a
 * proposal a customer is most likely to check.
 *
 * An exempt bid is the case worth spelling out: it renders a $0 tax line with
 * the reason, rather than no line at all. Someone entitled to an exemption
 * should be able to see they got it; silence looks like an oversight to
 * precisely the customer who will notice.
 */
function buildInvestment(
  totals: BuildProposalInput["totals"],
  salesTax: BuildProposalInput["salesTax"],
  taxExemptReason: string | null | undefined,
  expenseLines: readonly { name: string; amount: number }[] = []
): ProposalDocument["investment"] {
  const workTotal = totals.workPrice ?? totals.finalPrice;
  const expensesTotal = sumExpenses(expenseLines);
  const expenses =
    expenseLines.length > 0
      ? { lines: expenseLines.map(line => ({ ...line })), total: expensesTotal }
      : null;
  /** Work + charges. What tax sits under, and the price before tax. */
  const subtotal = roundMoney(workTotal + expensesTotal);
  const includesIndirect = totals.overheadAmount > 0 || totals.profitAmount > 0;
  const base = { subtotal, workTotal, expenses, includesIndirect };

  if (salesTax?.status === "exempt") {
    return {
      ...base,
      total: subtotal,
      salesTax: {
        amount: 0,
        ratePct: null,
        components: [],
        exempt: true,
        exemptReason: taxExemptReason?.trim() || null,
      },
    };
  }

  // Anything other than a real applied tax leaves the document as it was:
  // disabled, nothing marked taxable, or — importantly — no rate found. The
  // document cannot invent a tax it does not know, so the warning about that
  // belongs in the composer, where the person who can fix it is looking.
  if (salesTax?.status !== "ok" || salesTax.amount <= 0) {
    return { ...base, total: subtotal, salesTax: null };
  }

  return {
    ...base,
    // Recomputed from the subtotal rather than taken from salesTax.totalWithTax,
    // which knows nothing about expenses.
    total: roundMoney(subtotal + salesTax.amount),
    salesTax: {
      amount: salesTax.amount,
      ratePct: salesTax.ratePct,
      components: salesTax.components,
      exempt: false,
      exemptReason: null,
    },
  };
}

export function buildProposal(input: BuildProposalInput): ProposalDocument {
  const {
    bid,
    totals,
    branding,
    design,
    now,
    salesTax,
    taxExemptReason,
    expenses = [],
    scopeNotes = [],
    mode = "full",
  } = input;

  const inclusions = groupScopeNotes(scopeNotes);

  /**
   * A section appears when the user has not hidden it AND the mode allows it.
   *
   * The second clause is the whole of scope-only mode. `isSectionVisible`
   * refuses to hide `investment` because a proposal without a price is not a
   * proposal — correct for the normal document and exactly wrong for this one,
   * so the mode overrides it rather than the required-list being weakened.
   * See MONEY_SECTION_IDS in shared/bidExtras.ts.
   */
  const visible = (id: ProposalSectionId) =>
    sectionAllowedInMode(id, mode) &&
    isSectionVisible(design.hiddenSections, id);

  const missing = missingBrandingFields(branding);
  const missingKeys = new Set(missing.map(f => f.key));
  const field = (key: keyof BrandingFields, label: string) =>
    missingKeys.has(key)
      ? brandingPlaceholder(label)
      : ((branding[key] as string) ?? "").trim();

  const letterhead: ProposalDocument["letterhead"] = {
    companyName: field("companyName", "company name"),
    licenseNumber: field("licenseNumber", "license number"),
    addressLines: missingKeys.has("address")
      ? [brandingPlaceholder("address")]
      : addressLines(branding.address),
    phone: field("phone", "phone"),
    // Optional fields render as nothing when empty rather than as a prompt —
    // they are not on the needed list, so a blank one is a choice.
    email: blank(branding.email) ? "" : branding.email!.trim(),
    website: blank(branding.website) ? "" : branding.website!.trim(),
    logoUrl: blank(branding.logoUrl) ? null : branding.logoUrl,
    needsSetup: missing.length > 0,
    missing: missing.map(f => f.label),
  };

  const clientMissing = blank(bid.clientName);

  // Scope lines keep the bid's own order and grouping. Un-labelled lines go
  // last under a null label, exactly as the Bids screen groups them, so the
  // proposal reads in the order the estimator built it.
  const scope: ProposalScopeGroup[] = [];
  if (visible("scope")) {
    for (const line of input.lines) {
      const label = line.unitLabel ?? null;
      const group = scope.find(g => g.label === label);
      if (group) group.lines.push(line);
      else scope.push({ label, lines: [line] });
    }
    scope.sort((a, b) => (a.label === null ? 1 : b.label === null ? -1 : 0));
  }

  /**
   * Per-unit price, scaled from direct cost to the client-facing price.
   *
   * A unit's own direct cost is not what the client is charged for that unit —
   * overhead and profit sit on top of the whole bid, not on each line. Scaling
   * by the bid's own cost-to-price ratio spreads them the same way the total
   * does, so the units add up to the total the client is quoted. Anything else
   * prints per-room figures that visibly do not sum to the number underneath
   * them, which is the fastest way to lose an argument about a price.
   */
  /*
    ── Each unit's OWN marked-up cost, times the bottom-of-bid ratio ──────────
    This was unit.directCost × (finalPrice ÷ directCost): one ratio for the
    whole bid. Once material carries its own markup that is wrong in both
    directions — a room of cheap, heavily marked-up parts would print under
    its real share and a room of gear over it — while the total underneath
    stayed right, so nothing on the page looked off. A unit is now priced from
    its cost WITH its markup, and only overhead and profit are spread.
  */
  const priceRatio =
    totals.costWithMarkup > 0 ? totals.finalPrice / totals.costWithMarkup : 0;
  const unitPricing: ProposalUnitPrice[] = visible("unitPricing")
    ? input.units.map(unit => ({
        label: unit.label,
        price: Math.round(unit.costWithMarkup * priceRatio * 100) / 100,
      }))
    : [];

  const validDays = Math.max(0, Math.trunc(design.validDays));

  return {
    layout: design.layout,
    accentColor: isValidAccent(design.accentColor)
      ? design.accentColor.trim()
      : DEFAULT_ACCENT,
    visibleSections: PROPOSAL_SECTIONS.filter(
      section =>
        visible(section.id) &&
        // A section with nothing in it is not rendered empty. "Price per unit"
        // on a bid with no repeating units would be a heading over a blank
        // space, which reads as a fault rather than as a choice.
        !(section.id === "unitPricing" && unitPricing.length === 0) &&
        !(section.id === "terms" && blank(design.termsText)) &&
        !(section.id === "scope" && scope.length === 0) &&
        // Nothing to include or exclude is a heading over a blank space.
        !(
          section.id === "inclusions" &&
          inclusions.includes.length === 0 &&
          inclusions.excludes.length === 0
        )
    ).map(section => section.id),
    letterhead,
    preparedFor: {
      clientName: clientMissing
        ? "[Add your client's name]"
        : bid.clientName!.trim(),
      siteAddress: addressLines(bid.siteAddress),
      needsSetup: clientMissing,
    },
    summary: {
      projectName: bid.name,
      dateLabel: formatDate(now),
      // "This price is good through …" is a claim about a price. On a
      // scope-only document there is none, so the line is suppressed rather
      // than left promising something the page does not contain.
      validUntilLabel:
        mode !== "scope-only" && validDays > 0
          ? formatDate(addDays(now, validDays))
          : null,
      note: blank(bid.proposalNote) ? null : bid.proposalNote!.trim(),
    },
    scope,
    laborHours: Math.round(totals.totalLaborHours * 100) / 100,
    unitPricing,
    mode,
    inclusions,
    investment: buildInvestment(totals, salesTax, taxExemptReason, expenses),
    terms: blank(design.termsText) ? null : design.termsText!.trim(),
  };
}
