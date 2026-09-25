/**
 * The client-facing proposal.
 *
 * ── What these tests are really guarding ─────────────────────────────────────
 * Two things, and they pull in opposite directions.
 *
 * The first is that the document says what the contractor meant it to say: the
 * layout they chose, the sections they left on, their own branding at the top —
 * and, where they have not filled something in, a visible prompt rather than a
 * blank line. A blank line is the failure mode that actually costs money here,
 * because it is the one that can be printed and posted without anybody noticing.
 * That is the same rule the material catalog follows for a $0 price, and it is
 * asserted the same way.
 *
 * The second is that the document does NOT say things the contractor never
 * meant to send. Overhead, profit and the labor rate are the contractor's
 * business; the client sees a price. A regression that leaks a margin
 * percentage onto a client's desk would look, on screen, like a slightly more
 * detailed proposal — so it is pinned explicitly rather than left to review.
 *
 * The pure half runs everywhere. The half that needs a database is skipped
 * without one, exactly like server/companyDefaults.test.ts.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
} from "./db";
import {
  assemblies,
  bids,
  companyBranding,
  laborRates,
  pricingDefaults,
  proposalSettings,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { verifyStorageToken } from "./storageTokens";
import {
  buildProposal,
  DEFAULT_ACCENT,
  EMPTY_BRANDING,
  isSectionVisible,
  isValidAccent,
  missingBrandingFields,
  needsBranding,
  setSectionVisible,
  type BuildProposalInput,
} from "../shared/proposal";

/**
 * Split a minted storage URL back into its two halves.
 *
 * `/manus-storage/<token>/<key…>` — the key keeps its own slashes, so the
 * token is the first segment and everything after it is the key, decoded the
 * way the proxy decodes it.
 */
const tokenFrom = (url: string) =>
  url.replace("/manus-storage/", "").split("/")[0];
const keyFrom = (url: string) =>
  url
    .replace("/manus-storage/", "")
    .split("/")
    .slice(1)
    .map(decodeURIComponent)
    .join("/");

const hasDb = !!process.env.DATABASE_URL;
const USER = 9713;
/** A second contractor, to prove branding never crosses between accounts. */
const OTHER_USER = 9714;

const ctxFor = (id: number): TrpcContext =>
  ({ user: { id, role: "user" } }) as unknown as TrpcContext;
const caller = () => appRouter.createCaller(ctxFor(USER));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FILLED_BRANDING = {
  companyName: "Ridgeline Electric LLC",
  licenseNumber: "EC-118240",
  address: "1420 Foundry Rd\nAsheville, NC 28801",
  phone: "(828) 555-0148",
  email: "estimating@ridgeline.example",
  website: "ridgeline.example",
  logoUrl: "/manus-storage/company-logos/1/logo.png",
};

/**
 * A bid priced with fixture numbers, never with anything the app ships.
 *
 * Borrowing a seeded price would make this a test that the catalog has not
 * changed (CLAUDE.md § Materials), which is a different and much less useful
 * assertion than the one intended here.
 */
function input(
  overrides: Partial<BuildProposalInput> = {}
): BuildProposalInput {
  return {
    bid: {
      name: "Second-floor fit-out",
      clientName: "Harbour Construction Group",
      siteAddress: "88 Water St, Unit 4",
      proposalNote: "Rough-in and trim per drawings E1–E4.",
    },
    totals: {
      directCost: 10000,
      // No material markup in these fixtures, so the two are the same figure.
      costWithMarkup: 10000,
      overheadAmount: 1000,
      profitAmount: 2200,
      finalPrice: 13200,
      totalLaborHours: 120,
    },
    units: [],
    lines: [
      { name: "Duplex receptacle", qty: 24, unitLabel: null },
      { name: "Recessed can", qty: 12, unitLabel: null },
    ],
    branding: { ...FILLED_BRANDING },
    design: {
      layout: "classic",
      accentColor: "#1F4E79",
      hiddenSections: [],
      termsText: "50% on acceptance, balance on completion.",
      validDays: 30,
    },
    now: new Date("2026-08-13T12:00:00Z"),
    ...overrides,
  };
}

// ─── Sections ─────────────────────────────────────────────────────────────────

describe("section visibility", () => {
  it("shows everything for a user who has hidden nothing", () => {
    expect(isSectionVisible([], "scope")).toBe(true);
    expect(isSectionVisible(null, "terms")).toBe(true);
    expect(isSectionVisible(undefined, "acceptance")).toBe(true);
  });

  it("hides what the user switched off", () => {
    expect(isSectionVisible(["scope"], "scope")).toBe(false);
    expect(isSectionVisible(["scope"], "terms")).toBe(true);
  });

  it("stores what is HIDDEN, so a new section is on by default", () => {
    // The reason the column is a hidden list rather than a visible one: a
    // section shipped after this user last touched their settings must appear
    // for them, not be silently missing forever.
    const stored = setSectionVisible([], "laborSummary", false);
    expect(stored).toEqual(["laborSummary"]);
    expect(isSectionVisible(stored, "acceptance")).toBe(true);
  });

  it("refuses to hide the letterhead or the price", () => {
    // A document with no sender is not a proposal; one with no price is not
    // one either. The UI renders these as fixed, and this is the second line.
    expect(setSectionVisible([], "letterhead", false)).toEqual([]);
    expect(setSectionVisible([], "investment", false)).toEqual([]);
    expect(isSectionVisible(["letterhead", "investment"], "letterhead")).toBe(
      true
    );
    expect(isSectionVisible(["letterhead", "investment"], "investment")).toBe(
      true
    );
  });

  it("round-trips a toggle without duplicating or dropping others", () => {
    let hidden = setSectionVisible([], "scope", false);
    hidden = setSectionVisible(hidden, "terms", false);
    hidden = setSectionVisible(hidden, "scope", false); // toggled off twice
    expect(hidden.filter(s => s === "scope")).toHaveLength(1);

    hidden = setSectionVisible(hidden, "scope", true);
    expect(hidden).toEqual(["terms"]);
  });

  it("drops ids that are not sections at all", () => {
    // A list left behind by an older version, or edited by hand, must not
    // survive a save and go on hiding something that no longer exists.
    const cleaned = setSectionVisible(
      ["scope", "not-a-section"],
      "terms",
      true
    );
    expect(cleaned).toEqual(["scope"]);
  });

  it("leaves a switched-off section out of the built document", () => {
    const doc = buildProposal(
      input({
        design: { ...input().design, hiddenSections: ["scope", "acceptance"] },
      })
    );
    expect(doc.visibleSections).not.toContain("scope");
    expect(doc.visibleSections).not.toContain("acceptance");
    expect(doc.visibleSections).toContain("investment");
    // Hiding the scope must not empty it of meaning elsewhere — the price is
    // still the whole job's price.
    expect(doc.investment.total).toBe(13200);
  });

  it("leaves out a section that has nothing to show, without being told to", () => {
    // An empty heading reads as a fault rather than as a choice.
    const doc = buildProposal(
      input({
        design: { ...input().design, termsText: null },
        units: [],
      })
    );
    expect(doc.visibleSections).not.toContain("terms");
    expect(doc.visibleSections).not.toContain("unitPricing");
  });
});

// ─── Branding ─────────────────────────────────────────────────────────────────

describe("branding that has not been filled in", () => {
  it("is flagged for a brand-new account", () => {
    expect(needsBranding(EMPTY_BRANDING)).toBe(true);
    expect(missingBrandingFields(EMPTY_BRANDING).map(f => f.label)).toEqual([
      "logo",
      "company name",
      "license number",
      "address",
      "phone",
    ]);
  });

  it("is still flagged when only some of it is filled in", () => {
    // The dangerous state: a letterhead with a name but no licence number looks
    // finished on screen and goes out missing something it is required to state.
    expect(
      needsBranding({ ...EMPTY_BRANDING, companyName: "Ridgeline Electric" })
    ).toBe(true);
  });

  it("stops being flagged once the needed fields are there", () => {
    expect(needsBranding(FILLED_BRANDING)).toBe(false);
    // Email and website are genuinely optional — flagging a field somebody
    // deliberately left out teaches people to ignore the flag.
    expect(needsBranding({ ...FILLED_BRANDING, email: "", website: "" })).toBe(
      false
    );
  });

  it("treats whitespace as empty", () => {
    expect(needsBranding({ ...FILLED_BRANDING, phone: "   " })).toBe(true);
  });

  it("prints a visible prompt in place of every missing field", () => {
    // The whole point: NOT blank space. A blank line can be printed and posted
    // without anyone noticing; "[Add your license number]" cannot.
    const doc = buildProposal(input({ branding: { ...EMPTY_BRANDING } }));

    expect(doc.letterhead.needsSetup).toBe(true);
    expect(doc.letterhead.companyName).toBe("[Add your company name]");
    expect(doc.letterhead.licenseNumber).toBe("[Add your license number]");
    expect(doc.letterhead.addressLines).toEqual(["[Add your address]"]);
    expect(doc.letterhead.phone).toBe("[Add your phone]");
    expect(doc.letterhead.logoUrl).toBeNull();
    expect(doc.letterhead.missing).toContain("logo");

    // Nothing is silently blank — every needed field carries text.
    expect(doc.letterhead.companyName.trim()).not.toBe("");
    expect(doc.letterhead.phone.trim()).not.toBe("");
  });

  it("prints the real thing once it is set, with no prompt left over", () => {
    const doc = buildProposal(input());
    expect(doc.letterhead.needsSetup).toBe(false);
    expect(doc.letterhead.companyName).toBe("Ridgeline Electric LLC");
    expect(doc.letterhead.licenseNumber).toBe("EC-118240");
    expect(doc.letterhead.addressLines).toEqual([
      "1420 Foundry Rd",
      "Asheville, NC 28801",
    ]);
    expect(doc.letterhead.logoUrl).toBe(FILLED_BRANDING.logoUrl);
    expect(JSON.stringify(doc.letterhead)).not.toContain("[Add");
  });

  it("leaves the optional fields as nothing rather than as a prompt", () => {
    const doc = buildProposal(
      input({ branding: { ...FILLED_BRANDING, email: "", website: "" } })
    );
    expect(doc.letterhead.email).toBe("");
    expect(doc.letterhead.website).toBe("");
    expect(doc.letterhead.needsSetup).toBe(false);
  });

  it("prompts for the client's name too, rather than heading a page to nobody", () => {
    const doc = buildProposal(
      input({ bid: { ...input().bid, clientName: null } })
    );
    expect(doc.preparedFor.needsSetup).toBe(true);
    expect(doc.preparedFor.clientName).toBe("[Add your client's name]");
  });
});

// ─── Layout and accent ────────────────────────────────────────────────────────

describe("layout and accent", () => {
  it("carries the chosen layout onto the document", () => {
    for (const layout of ["classic", "modern", "minimal"] as const) {
      const doc = buildProposal(
        input({ design: { ...input().design, layout } })
      );
      expect(doc.layout).toBe(layout);
    }
  });

  it("shows the same CONTENT whichever layout is chosen", () => {
    // Layouts differ in how they look, never in what they say. Otherwise the
    // third one written is the one that quietly forgets a section.
    const sections = (["classic", "modern", "minimal"] as const).map(
      layout =>
        buildProposal(input({ design: { ...input().design, layout } }))
          .visibleSections
    );
    expect(sections[1]).toEqual(sections[0]);
    expect(sections[2]).toEqual(sections[0]);
  });

  it("keeps a valid accent and falls back rather than rendering a broken one", () => {
    expect(isValidAccent("#1F4E79")).toBe(true);
    expect(isValidAccent("#abc")).toBe(true);
    expect(isValidAccent("rebeccapurple")).toBe(false);
    expect(isValidAccent("1F4E79")).toBe(false);

    expect(buildProposal(input()).accentColor).toBe("#1F4E79");
    expect(
      buildProposal(
        input({ design: { ...input().design, accentColor: "not a colour" } })
      ).accentColor
    ).toBe(DEFAULT_ACCENT);
  });
});

// ─── What the client may and may not see ──────────────────────────────────────

describe("what leaves the building", () => {
  it("quotes one price, with overhead and profit inside it", () => {
    const doc = buildProposal(input());
    expect(doc.investment.total).toBe(13200);
    expect(doc.investment.includesIndirect).toBe(true);
  });

  it("never itemises overhead, profit, rates or unit costs", () => {
    const doc = buildProposal(input());
    const serialised = JSON.stringify(doc);

    // The figures themselves must not appear anywhere on the document.
    expect(serialised).not.toContain("1000"); // overhead amount
    expect(serialised).not.toContain("2200"); // profit amount
    expect(serialised).not.toContain("10000"); // direct cost
    expect(serialised.toLowerCase()).not.toContain("markup");
    expect(serialised.toLowerCase()).not.toContain("margin");
    expect(serialised.toLowerCase()).not.toContain("overhead percentage");

    // Scope lines carry quantities and nothing priced.
    for (const group of doc.scope) {
      for (const line of group.lines) {
        expect(Object.keys(line).sort()).toEqual(["name", "qty", "unitLabel"]);
      }
    }
  });

  it("says so plainly when there is no overhead or profit to include", () => {
    const doc = buildProposal(
      input({
        totals: {
          directCost: 10000,
          costWithMarkup: 10000,
          overheadAmount: 0,
          profitAmount: 0,
          finalPrice: 10000,
          totalLaborHours: 120,
        },
      })
    );
    expect(doc.investment.includesIndirect).toBe(false);
  });

  it("groups the scope the way the bid is built", () => {
    const doc = buildProposal(
      input({
        lines: [
          { name: "Receptacle", qty: 4, unitLabel: "Room 101" },
          { name: "Switch", qty: 2, unitLabel: "Room 101" },
          { name: "Panel feed", qty: 1, unitLabel: null },
          { name: "Receptacle", qty: 4, unitLabel: "Room 102" },
        ],
      })
    );
    expect(doc.scope.map(g => g.label)).toEqual(["Room 101", "Room 102", null]);
    expect(doc.scope[0].lines).toHaveLength(2);
  });

  it("scales per-unit prices so they add up to the quoted total", () => {
    // A unit's own direct cost is not what the client is charged for it —
    // overhead and profit sit on the whole bid. Printing raw direct costs under
    // a marked-up total gives a client a column that visibly does not sum.
    const doc = buildProposal(
      input({
        units: [
          { label: "Room 101", directCost: 5000, costWithMarkup: 5000 },
          { label: "Room 102", directCost: 5000, costWithMarkup: 5000 },
        ],
      })
    );
    const summed = doc.unitPricing.reduce((sum, u) => sum + u.price, 0);
    expect(summed).toBeCloseTo(doc.investment.total, 2);
    expect(doc.unitPricing[0].price).toBeCloseTo(6600, 2);
  });

  it("does not divide by zero on a bid that costs nothing yet", () => {
    const doc = buildProposal(
      input({
        totals: {
          directCost: 0,
          costWithMarkup: 0,
          overheadAmount: 0,
          profitAmount: 0,
          finalPrice: 0,
          totalLaborHours: 0,
        },
        units: [{ label: "Room 101", directCost: 0, costWithMarkup: 0 }],
      })
    );
    expect(doc.unitPricing[0].price).toBe(0);
  });

  it("states the date and how long the price stands", () => {
    const doc = buildProposal(input());
    expect(doc.summary.dateLabel).toContain("2026");
    expect(doc.summary.validUntilLabel).toContain("September");
  });

  it("says nothing about validity when it is switched off", () => {
    const doc = buildProposal(
      input({ design: { ...input().design, validDays: 0 } })
    );
    expect(doc.summary.validUntilLabel).toBeNull();
  });
});

// ─── Against a live database ──────────────────────────────────────────────────

describe.skipIf(!hasDb)("proposals end to end", () => {
  let assemblyId: number;
  let materialId: number;

  beforeAll(async () => {
    const db = await getDb();
    for (const id of [USER, OTHER_USER]) {
      const [existing] = await db!
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) {
        await db!.insert(users).values({
          id,
          openId: `test-proposals-${id}`,
          name: `Proposal test user ${id}`,
        });
      }
    }
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
    await seedBaselineModifiers();
    await seedBaselineAssemblies();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db!.delete(bids).where(eq(bids.userId, USER));
    await db!.delete(assemblies).where(eq(assemblies.userId, USER));
    await db!.delete(laborRates).where(eq(laborRates.userId, USER));
    await db!.delete(pricingDefaults).where(eq(pricingDefaults.userId, USER));
    await db!.delete(companyBranding).where(eq(companyBranding.userId, USER));
    await db!.delete(proposalSettings).where(eq(proposalSettings.userId, USER));
    await db!
      .delete(companyBranding)
      .where(eq(companyBranding.userId, OTHER_USER));

    // A fixture material and a real rate, so the numbers below are ours.
    const material = await caller().materials.create({
      name: `Proposal probe ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 100,
      category: "Receptacles",
    });
    materialId = material!.id;
    const rates = await caller().laborRates.list();
    const journeyman = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 50,
    });
    const created = await caller().assemblies.create({
      name: `Proposal assembly ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 2,
      laborRateId: journeyman.laborRate!.id,
      materials: [{ materialId, qty: 1 }],
      modifierIds: [],
    });
    assemblyId = created!.id;
  });

  async function bidWithOneLine(qty = 1, unitLabel: string | null = null) {
    const bid = await caller().bids.create({
      name: `Proposal bid ${Date.now()}${Math.random()}`,
      trades: ["electrical"],
    });
    await caller().bids.addAssembly({
      bidId: bid!.id,
      assemblyId,
      qty,
      unitLabel,
    });
    return bid!;
  }

  // ── Branding ───────────────────────────────────────────────────────────────

  it("starts blank for a new account and says what it needs", async () => {
    const branding = await caller().proposals.branding();
    expect(branding.companyName).toBe("");
    expect(branding.logoUrl).toBeNull();
    expect(needsBranding(branding)).toBe(true);
  });

  it("saves branding fields and reads them straight back", async () => {
    await caller().proposals.setBranding({
      companyName: "Ridgeline Electric LLC",
      licenseNumber: "EC-118240",
      address: "1420 Foundry Rd",
      phone: "(828) 555-0148",
    });

    const branding = await caller().proposals.branding();
    expect(branding.companyName).toBe("Ridgeline Electric LLC");
    expect(branding.licenseNumber).toBe("EC-118240");
    expect(branding.address).toBe("1420 Foundry Rd");
    expect(branding.phone).toBe("(828) 555-0148");
  });

  it("saves one field at a time without wiping the others", async () => {
    // The settings form saves per field as the user leaves each one.
    await caller().proposals.setBranding({ companyName: "Ridgeline" });
    await caller().proposals.setBranding({ phone: "(828) 555-0148" });

    const branding = await caller().proposals.branding();
    expect(branding.companyName).toBe("Ridgeline");
    expect(branding.phone).toBe("(828) 555-0148");
  });

  it("renders saved branding onto the document", async () => {
    const bid = await bidWithOneLine();
    await caller().proposals.setBranding({
      companyName: "Ridgeline Electric LLC",
      licenseNumber: "EC-118240",
      address: "1420 Foundry Rd\nAsheville, NC 28801",
      phone: "(828) 555-0148",
    });
    await caller().proposals.confirmLogo({
      storageKey: `company-logos/${USER}/logo.png`,
    });

    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.letterhead.companyName).toBe("Ridgeline Electric LLC");
    expect(document.letterhead.licenseNumber).toBe("EC-118240");
    expect(document.letterhead.addressLines).toEqual([
      "1420 Foundry Rd",
      "Asheville, NC 28801",
    ]);
    /**
     * The logo URL is minted per read and carries a signed token, so it is not
     * a fixed string any more — see server/storageTokens.ts.
     *
     * What is asserted is what actually matters: it points at THIS company's
     * logo key, and it is tokenized. A bare `/manus-storage/<key>` here would
     * mean the document had been handed a URL the proxy now refuses, and the
     * letterhead would render a broken image.
     */
    const logoUrl = document.letterhead.logoUrl!;
    expect(logoUrl.endsWith(`/company-logos/${USER}/logo.png`)).toBe(true);
    expect(logoUrl).not.toBe(`/manus-storage/company-logos/${USER}/logo.png`);
    expect(
      verifyStorageToken(tokenFrom(logoUrl), keyFrom(logoUrl), new Date())
    ).toBe(true);
    expect(document.letterhead.needsSetup).toBe(false);
  });

  it("shows placeholders, not blank space, when nothing is set", async () => {
    const bid = await bidWithOneLine();
    const { document } = await caller().proposals.document({ bidId: bid.id });

    expect(document.letterhead.needsSetup).toBe(true);
    expect(document.letterhead.companyName).toBe("[Add your company name]");
    expect(document.letterhead.phone).toBe("[Add your phone]");
    expect(document.letterhead.addressLines).toEqual(["[Add your address]"]);
    expect(document.letterhead.logoUrl).toBeNull();
    expect(document.letterhead.missing.length).toBeGreaterThan(0);
  });

  it("refuses a logo key belonging to another account", async () => {
    await expect(
      caller().proposals.confirmLogo({
        storageKey: "company-logos/999999/stolen.png",
      })
    ).rejects.toThrow();
  });

  it("puts the placeholder back when the logo is removed", async () => {
    await caller().proposals.confirmLogo({
      storageKey: `company-logos/${USER}/logo.png`,
    });
    await caller().proposals.clearLogo();
    const branding = await caller().proposals.branding();
    expect(branding.logoUrl).toBeNull();
    expect(branding.logoKey).toBeNull();
  });

  // ── Presentation ───────────────────────────────────────────────────────────

  it("ships on Classic and remembers a different choice", async () => {
    const bid = await bidWithOneLine();
    expect((await caller().proposals.settings()).layout).toBe("classic");

    await caller().proposals.setSettings({ layout: "modern" });

    expect((await caller().proposals.settings()).layout).toBe("modern");
    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.layout).toBe("modern");
  });

  it("saves an accent colour and refuses one that is not a colour", async () => {
    await caller().proposals.setSettings({ accentColor: "#1F4E79" });
    expect((await caller().proposals.settings()).accentColor).toBe("#1F4E79");

    await expect(
      caller().proposals.setSettings({ accentColor: "bright red" })
    ).rejects.toThrow();
    // Refused, not silently corrected — the saved value is untouched.
    expect((await caller().proposals.settings()).accentColor).toBe("#1F4E79");
  });

  it("takes a section off the document and puts it back", async () => {
    const bid = await bidWithOneLine();
    await caller().proposals.setSettings({
      termsText: "50% on acceptance, balance on completion.",
    });

    const before = await caller().proposals.document({ bidId: bid.id });
    expect(before.document.visibleSections).toContain("terms");
    expect(before.document.visibleSections).toContain("laborSummary");

    await caller().proposals.setSettings({
      hiddenSections: ["terms", "laborSummary"],
    });

    const after = await caller().proposals.document({ bidId: bid.id });
    expect(after.document.visibleSections).not.toContain("terms");
    expect(after.document.visibleSections).not.toContain("laborSummary");
    // Reversible, and the price is untouched by any of it.
    await caller().proposals.setSettings({ hiddenSections: [] });
    const restored = await caller().proposals.document({ bidId: bid.id });
    expect(restored.document.visibleSections).toContain("terms");
    expect(restored.document.investment.total).toBe(
      before.document.investment.total
    );
  });

  it("will not let the letterhead or the price be switched off", async () => {
    const bid = await bidWithOneLine();
    await caller().proposals.setSettings({
      hiddenSections: ["letterhead", "investment"],
    });

    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.visibleSections).toContain("letterhead");
    expect(document.visibleSections).toContain("investment");
  });

  // ── The numbers ────────────────────────────────────────────────────────────

  it("quotes exactly the bid price the estimator approved", async () => {
    const bid = await bidWithOneLine(3);
    await caller().bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "percentage",
      overheadValue: 0.1,
      profitMethod: "markup",
      profitValue: 0.2,
    });

    const detail = await caller().bids.get({ id: bid.id });
    const { document, internalTotals } = await caller().proposals.document({
      bidId: bid.id,
    });

    expect(document.investment.total).toBeCloseTo(detail.totals.finalPrice, 2);
    expect(internalTotals.finalPrice).toBeCloseTo(detail.totals.finalPrice, 2);
    expect(document.investment.includesIndirect).toBe(true);
  });

  it("prices from the snapshot, not from today's catalog", async () => {
    // The guarantee that makes a proposal worth sending: it reflects what was
    // actually priced. Re-pricing a material next month must not reissue the
    // quote at a new number.
    const bid = await bidWithOneLine();
    const before = await caller().proposals.document({ bidId: bid.id });

    await caller().materials.update({ id: materialId, costPerUnit: 999 });

    const after = await caller().proposals.document({ bidId: bid.id });
    expect(after.document.investment.total).toBeCloseTo(
      before.document.investment.total,
      2
    );
  });

  it("lists the scope with quantities and no costs", async () => {
    const bid = await bidWithOneLine(7, "Room 101");
    const { document } = await caller().proposals.document({ bidId: bid.id });

    const group = document.scope.find(g => g.label === "Room 101");
    expect(group).toBeDefined();
    expect(group!.lines[0].qty).toBe(7);
    expect(Object.keys(group!.lines[0]).sort()).toEqual([
      "name",
      "qty",
      "unitLabel",
    ]);
  });

  it("saves the client and job address onto the bid, and shows them", async () => {
    const bid = await bidWithOneLine();
    await caller().bids.update({
      id: bid.id,
      clientName: "Harbour Construction Group",
      siteAddress: "88 Water St, Unit 4",
      proposalNote: "Rough-in and trim per drawings E1–E4.",
    });

    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.preparedFor.clientName).toBe("Harbour Construction Group");
    expect(document.preparedFor.needsSetup).toBe(false);
    expect(document.summary.note).toBe("Rough-in and trim per drawings E1–E4.");
  });

  it("goes back to prompting when the client name is cleared", async () => {
    const bid = await bidWithOneLine();
    await caller().bids.update({ id: bid.id, clientName: "Harbour" });
    await caller().bids.update({ id: bid.id, clientName: "" });

    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.preparedFor.needsSetup).toBe(true);
  });

  it("refuses to build a proposal for someone else's bid", async () => {
    const bid = await bidWithOneLine();
    const stranger = appRouter.createCaller(ctxFor(USER + 1));
    await expect(
      stranger.proposals.document({ bidId: bid.id })
    ).rejects.toThrow();
  });

  it("keeps one contractor's branding out of another's", async () => {
    // The whole reason branding is per-user rather than a shared default: a
    // proposal must never go out carrying somebody else's company on it.
    await caller().proposals.setBranding({ companyName: "Ridgeline Electric" });

    const other = appRouter.createCaller(ctxFor(OTHER_USER));
    const otherBranding = await other.proposals.branding();
    expect(otherBranding.companyName).toBe("");
    expect(needsBranding(otherBranding)).toBe(true);

    // And ours is untouched by theirs existing.
    expect((await caller().proposals.branding()).companyName).toBe(
      "Ridgeline Electric"
    );
  });
});
