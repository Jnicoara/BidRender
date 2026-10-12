/**
 * WHAT THE PROPOSAL SAYS ABOUT WHO DOES THE WORK (0146; scope-tags-plan.md
 * step 5, owner Q8).
 *
 *   • Owner furnishes: still in the scope of work (we install it), and named
 *     under Includes with its quantity — the same name across rooms once;
 *   • By others / Excluded: out of the scope of work, named under Excludes by
 *     name only, prefixed;
 *   • hand-written notes stay exactly as typed, and first;
 *   • nothing tagged: the document is exactly what it was;
 *   • every line By others or Excluded: "No work added yet", never $0.00;
 *   • the router passes the tag through (proposals.document).
 *
 * Fixture id 9949 is this file's alone.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  buildProposal,
  scopeLinesForProposal,
  type BuildProposalInput,
  type ProposalScopeLine,
} from "../shared/proposal";
import { NOTHING_NOT_PRICED } from "../shared/lineNotPriced";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidLineItems, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

function input(lines: ProposalScopeLine[]): BuildProposalInput {
  return {
    bid: {
      name: "Scope tags proposal",
      clientName: "Harbour Construction Group",
      siteAddress: "88 Water St",
      proposalNote: null,
    },
    totals: {
      directCost: 1000,
      costWithMarkup: 1000,
      overheadAmount: 0,
      profitAmount: 0,
      finalPrice: 1000,
      totalLaborHours: 10,
    },
    units: [],
    lines,
    branding: {
      companyName: "Fixture Electric",
      licenseNumber: "EC-1",
      address: "1 Main St",
      phone: "555-0100",
      email: null,
      website: null,
      logoUrl: null,
    },
    design: {
      layout: "classic",
      accentColor: "#1F4E79",
      hiddenSections: [],
      termsText: null,
      validDays: 30,
    },
    now: new Date("2026-10-12T12:00:00Z"),
    notPriced: NOTHING_NOT_PRICED,
  };
}

const L = (
  name: string,
  qty: number,
  scopeTag: ProposalScopeLine["scopeTag"],
  unitLabel: string | null = null
): ProposalScopeLine => ({ name, qty, unitLabel, scopeTag });

describe("the proposal follows who does the work", () => {
  it("owner-furnished stays in the scope and is named, with quantity, under Includes", () => {
    const doc = buildProposal({
      ...input([
        L("Receptacle", 10, null),
        L("Ceiling fan", 2, "ofci", "Room 101"),
        L("Ceiling fan", 2, "ofci", "Room 102"),
      ]),
      scopeNotes: [{ kind: "include", text: "Temporary power" }],
    });
    expect(doc.scope.flatMap(g => g.lines.map(l => l.name))).toEqual([
      "Ceiling fan",
      "Ceiling fan",
      "Receptacle",
    ]);
    expect(doc.inclusions.includes).toEqual([
      "Temporary power",
      "Owner-furnished, installed by us: 4 Ceiling fan",
    ]);
    expect(doc.inclusions.excludes).toEqual([]);
  });

  it("By others and Excluded leave the scope and are named under Excludes", () => {
    const doc = buildProposal({
      ...input([
        L("Receptacle", 10, "install"),
        L("Fire alarm device", 14, "by_others"),
        L("Data drop", 6, "by_others"),
        L("Permit", 1, "excluded"),
      ]),
      scopeNotes: [{ kind: "exclude", text: "Patching and painting" }],
    });
    expect(doc.scope.flatMap(g => g.lines.map(l => l.name))).toEqual([
      "Receptacle",
    ]);
    expect(doc.inclusions.excludes).toEqual([
      "Patching and painting",
      "By others: Fire alarm device, Data drop",
      "Excluded: Permit",
    ]);
    expect(doc.visibleSections).toContain("inclusions");
  });

  it("nothing tagged: no Includes/Excludes entries are invented, the section stays hidden", () => {
    const doc = buildProposal(input([L("Receptacle", 10, null)]));
    expect(doc.inclusions).toEqual({ includes: [], excludes: [] });
    expect(doc.visibleSections).not.toContain("inclusions");
    expect(scopeLinesForProposal([L("Receptacle", 10, null)])).toEqual({
      includes: [],
      excludes: [],
    });
  });

  it("every line By others or Excluded: no work of ours, never a $0.00 price", () => {
    const doc = buildProposal(
      input([
        L("Fire alarm device", 14, "by_others"),
        L("Permit", 1, "excluded"),
      ])
    );
    expect(doc.investment.noWork).toBe(true);
    expect(doc.investment.pricePending).toBe(true);
  });
});

const USER = 9949;
const hasDb = Boolean(process.env.DATABASE_URL);
dropFixtureUsersAfterAll([USER]);

const caller = () =>
  appRouter.createCaller({
    user: {
      id: USER,
      openId: `test-line-scope-proposal-${USER}`,
      role: "user",
      accessTier: "internal",
    },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id: USER,
      openId: `test-line-scope-proposal-${USER}`,
      name: "Line scope proposal fixture",
      accessTier: "internal",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(eq(bids.userId, USER));
});

describe.skipIf(!hasDb)("proposals.document carries the tag", () => {
  it("a By others line is named under Excludes and is not in the scope", async () => {
    const bidId = (await caller().bids.create({
      name: `Scope proposal ${Date.now()}`,
    }))!.id;
    const database = (await getDb())!;
    for (const [name, scopeTag] of [
      ["Receptacle", null],
      ["Fire alarm device", "by_others"],
    ] as const)
      await database.insert(bidLineItems).values({
        bidId,
        name,
        qty: "2",
        snapshotMaterialCost: "10.0000",
        snapshotLaborHours: "1.0000",
        snapshotLaborRate: "50.0000",
        snapshotModifierPct: "0.0000",
        snapshotUnpricedParts: 0,
        scopeTag,
      });

    const { document } = await caller().proposals.document({ bidId });
    expect(document.scope.flatMap(g => g.lines.map(l => l.name))).toEqual([
      "Receptacle",
    ]);
    expect(document.inclusions.excludes).toEqual([
      "By others: Fire alarm device",
    ]);
  });
});
