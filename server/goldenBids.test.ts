/**
 * GOLDEN BIDS — nine fixture bids, every line and total pinned
 * (server/goldenBids.ts says how it works and how to update on purpose).
 *
 * Each bid is built through the real routers, the way an estimator would:
 * counts placed and sent, runs traced and sent, drops set, scope tags picked,
 * a price typed on a free count, company overhead / profit / productivity /
 * markup, a tax area and an expense. Then `bids.get` — what the bid screen
 * shows — is snapshotted and compared with server/fixtures/goldenBids.json.
 *
 * Every price is the test's own (CLAUDE.md § Starter content). Where a
 * shipped material is needed because the run maths reads its trade size
 * (1/2" EMT, #12 THHN), it is priced here first, which forks it — no shipped
 * number reaches these totals. Fittings are pointed at the test's own
 * materials for the same reason.
 *
 * Fixture users 9906 (no overhead, profit or tax), 9907 (all of them) and
 * 9912 (extras, item markup, profit as margin), unused elsewhere (checked
 * 2026-10-15). All three are deleted when the file ends.
 *
 * NOT COVERED, on purpose, until it exists: a QUOTED line. The columns are in
 * the schema (`isQuoteItem`, `quoteId`, `bidUnitCost`, `quotedMarkupPct`) but
 * no router writes them and nothing prices them (db.ts loads
 * `quotedLinePct: null`), so a golden quoted line would pin a feature that is
 * not built. The nearest real thing — a supplier's price typed onto a line —
 * is bid "free-count".
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  at,
  bidWithSheet,
  countOf,
  duplexAssembly,
  emtType,
  freshUser,
  own,
  rate,
  runLaborRate,
  straightRun,
  type Caller,
} from "./bidBuilders.testHelper";
import { countNotPriced } from "../shared/lineNotPriced";
import {
  NOT_CHECKED,
  compareGoldenBids,
  describeGoldenDiffs,
  flattenGolden,
  goldenFileProblem,
  updatedGoldenFile,
  type GoldenBid,
  type GoldenFile,
  type GoldenValue,
} from "./goldenBids";

const PLAIN = 9906;
const PRICED = 9907;
/** Its own company, so its markup and extras cannot reach bids 1–8. */
const MARKUP = 9912;
dropFixtureUsersAfterAll([PLAIN, PRICED, MARKUP]);
const hasDb = Boolean(process.env.DATABASE_URL);
const GOLDEN_PATH = new URL("./fixtures/goldenBids.json", import.meta.url);

// ─── The snapshot ─────────────────────────────────────────────────────────────

/** Ids, timestamps and order columns differ run to run and are not numbers anyone reads. */
const VOLATILE = /(^|\.)(id|sortOrder)$|Id$|At$|(^|\.)bid\./;

function numbersOnly(flat: Record<string, GoldenValue>, keep: RegExp[] = []) {
  const out: Record<string, GoldenValue> = {};
  for (const [k, v] of Object.entries(flat)) {
    const last = k.split(".").pop()!;
    if (VOLATILE.test(k) || VOLATILE.test(last)) continue;
    if (typeof v === "string" && !keep.some(r => r.test(k))) continue;
    out[k] = v;
  }
  return out;
}

type Detail = Awaited<ReturnType<Caller["bids"]["get"]>>;

function snapshot(
  key: string,
  title: string,
  covers: string[],
  detail: Detail
): GoldenBid {
  const lines = detail.lines.map(line => {
    const label = [
      line.lineRole ?? "install",
      line.runMaterialRole,
      line.scopeTag,
    ]
      .filter(Boolean)
      .join("/");
    const { breakdown, problem, ...row } = line;
    const fields = numbersOnly(
      flattenGolden({
        qty: row.qty,
        laborQty: row.laborQty,
        unitLabel: row.unitLabel,
        snapshotMaterialCost: row.snapshotMaterialCost,
        snapshotLaborHours: row.snapshotLaborHours,
        snapshotLaborRate: row.snapshotLaborRate,
        snapshotModifierPct: row.snapshotModifierPct,
        snapshotMarkupPct: row.snapshotMarkupPct,
        snapshotLaborOnly: row.snapshotLaborOnly,
        snapshotPriceWasExample: row.snapshotPriceWasExample,
        unpricedParts: row.unpricedParts,
        breakdown,
        problem: problem?.code ?? null,
      }),
      [/^unitLabel$/, /^problem$/]
    );
    return { key: `${line.name} [${label}]`, fields };
  });
  lines.sort((a, b) => a.key.localeCompare(b.key));
  const totals = numbersOnly(
    flattenGolden({
      mathVersion: detail.bid.mathVersion,
      status: detail.bid.status,
      incomplete: detail.incomplete,
      problems: detail.problems.map(p => p.code).sort(),
      totals: detail.totals,
      salesTax: detail.salesTax,
      taxRate: detail.taxRate,
      settings: detail.settings,
      fromPlans: detail.fromPlans,
      dropsNotPriced: detail.dropsNotPriced,
      // What the bid page's "+ N not priced" counts — the same function.
      notPriced: countNotPriced(
        detail.lines.map(line => ({
          line,
          directCost: line.breakdown?.directCost ?? null,
        }))
      ),
      units: detail.units,
    }),
    [
      /^status$/,
      /^problems\[/,
      /^salesTax\.status$/,
      /^taxRate\.source$/,
      /^settings\.\w+Source$/,
      /^units\[\d+\]\.label$/,
    ]
  );
  return { key, title, covers, checked: NOT_CHECKED, lines, totals };
}

// ─── The bids ─────────────────────────────────────────────────────────────────

type Built = { key: string; title: string; covers: string[]; detail: Detail };

async function buildPlain(): Promise<Built[]> {
  const c = as(PLAIN);
  const journeyman = await rate(c, "Golden journeyman", 62);
  const helper = await rate(c, "Golden helper", 38);
  await runLaborRate(c, PLAIN, journeyman);
  const duplex = await duplexAssembly(c, journeyman);
  const built: Built[] = [];

  // 1 — counts, plus the same assembly added by hand.
  {
    const { bidId, sheetId } = await bidWithSheet(c, PLAIN, "Golden 1 counts");
    const g = await countOf(c, bidId, sheetId, duplex.id, [{ n: 7, y: 3000 }]);
    await c.takeoffGroups.sendToBid({ id: g });
    const light = await own(c, "Golden 2x4 LED troffer", 68.5, 0.75);
    const troffer = (await c.assemblies.create({
      name: "Golden troffer, lay-in",
      category: "Lighting",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.25,
      laborRateId: journeyman,
      materials: [{ materialId: light, qty: 1 }],
      modifierIds: [],
    }))!;
    await c.bids.addAssembly({ bidId, assemblyId: troffer.id, qty: 12 });
    built.push({
      key: "counts",
      title:
        "7 counted receptacles sent from the plans + 12 troffers added by hand",
      covers: ["counts", "assembly lines"],
      detail: await c.bids.get({ id: bidId }),
    });
  }

  // 2 — one homerun, 100 ft, with a circuit.
  {
    const { bidId, sheetId } = await bidWithSheet(c, PLAIN, "Golden 2 homerun");
    const type = await emtType(c, "Golden EMT homerun");
    const run = await straightRun(
      c,
      bidId,
      sheetId,
      type.id,
      "Homerun to panel A",
      100
    );
    await c.takeoffRuns.addCircuit({
      runId: run.id,
      name: "A-1",
      conductorCount: 2,
      groundCount: 1,
    });
    await c.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    built.push({
      key: "homerun",
      title: 'One 100 ft 1/2" EMT homerun with 2 #12 + ground',
      covers: ["runs", "homeruns", "fittings"],
      detail: await c.bids.get({ id: bidId }),
    });
  }

  // 3 — a run plus drops to counted receptacles.
  {
    await c.takeoffHeights.setCompanyDistribution({ inches: 120 });
    const { bidId, sheetId } = await bidWithSheet(c, PLAIN, "Golden 3 drops");
    const type = await emtType(c, "Golden EMT drops");
    await straightRun(c, bidId, sheetId, type.id, "Branch run", 60);
    await c.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const g = await countOf(c, bidId, sheetId, duplex.id, [{ n: 4, y: 3000 }]);
    await c.takeoffGroups.setDrop({
      id: g,
      dropKind: "receptacle",
      dropRunTypeId: type.id,
    });
    await c.takeoffGroups.sendToBid({ id: g });
    // The run height stays set: drop footage is live, so clearing it here
    // would take the drops back off before the bid is read (the first draft
    // did, and pinned 60 ft). No later bid of this user has a run.
    built.push({
      key: "drops",
      title:
        "60 ft run + 4 receptacles each with a drop from a 10'-0\" run height",
      covers: ["runs", "drops", "counts"],
      detail: await c.bids.get({ id: bidId }),
    });
  }

  // 4 — remove and relocate.
  {
    const { bidId, sheetId } = await bidWithSheet(
      c,
      PLAIN,
      "Golden 4 remove relocate"
    );
    await c.assemblies.update({
      id: duplex.id,
      removeLaborHours: 0.2,
      relocateLaborHours: 0.6,
    });
    const g = await countOf(c, bidId, sheetId, duplex.id, [
      { n: 3, y: 3000 },
      { n: 5, y: 6000, status: "remove" },
      { n: 2, y: 9000, status: "relocate" },
    ]);
    await c.takeoffGroups.setLaborRoleHours({
      id: g,
      role: "remove",
      hours: 0.25,
    });
    await c.takeoffGroups.sendToBid({ id: g });
    await c.assemblies.update({
      id: duplex.id,
      removeLaborHours: null,
      relocateLaborHours: null,
    });
    built.push({
      key: "remove-relocate",
      title:
        "3 new, 5 removed (count says 0.25 h), 2 relocated (assembly says 0.6 h)",
      covers: ["remove/relocate"],
      detail: await c.bids.get({ id: bidId }),
    });
  }

  // 5 — scope tags.
  {
    const { bidId } = await bidWithSheet(c, PLAIN, "Golden 5 scope tags");
    const lines = [];
    for (let i = 0; i < 4; i++)
      lines.push(
        (
          await c.bids.addAssembly({
            bidId,
            assemblyId: duplex.id,
            qty: 10 + i,
          })
        ).line!.id
      );
    await c.bids.setLineScope({
      bidId,
      changes: [
        { id: lines[0], scopeTag: "install" },
        { id: lines[1], scopeTag: "ofci" },
        { id: lines[2], scopeTag: "by_others" },
        { id: lines[3], scopeTag: "excluded" },
      ],
    });
    built.push({
      key: "scope-tags",
      title:
        "Four receptacle lines (10–13): install, owner furnished, by others, excluded",
      covers: ["scope tags"],
      detail: await c.bids.get({ id: bidId }),
    });
  }

  // 6 — labor only, and an assembly with no parts that is NOT ticked.
  {
    const { bidId } = await bidWithSheet(c, PLAIN, "Golden 6 labor only");
    const ticked = (await c.assemblies.create({
      name: "Golden trace and tag existing circuits",
      category: "General",
      baseLaborHours: 1.5,
      laborRateId: helper,
      laborOnly: true,
    }))!;
    const unticked = (await c.assemblies.create({
      name: "Golden light pole, set",
      category: "Equipment Connections",
      baseLaborHours: 6,
      laborRateId: journeyman,
    }))!;
    await c.bids.addAssembly({ bidId, assemblyId: ticked.id, qty: 8 });
    await c.bids.addAssembly({ bidId, assemblyId: unticked.id, qty: 2 });
    built.push({
      key: "labor-only",
      title:
        "8 × labor-only assembly (ticked) + 2 × parts-less assembly NOT ticked",
      covers: ["labor-only", "material not priced"],
      detail: await c.bids.get({ id: bidId }),
    });
  }

  // 7 — free count with a typed price (a supplier quote typed on the line),
  // and one left blank.
  {
    const { bidId, sheetId } = await bidWithSheet(
      c,
      PLAIN,
      "Golden 7 free count"
    );
    const priced = await c.takeoffGroups.create({
      bidId,
      label: "Type F1 fixture",
    });
    await c.takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: priced.id,
      at: at(14, 3000),
    });
    const { lineId } = await c.takeoffGroups.sendToBid({ id: priced.id });
    await c.bids.updateLine({ bidId, id: lineId, materialCost: 212.4 });
    await c.bids.updateLine({
      bidId,
      id: lineId,
      laborHours: 1.25,
      laborRateId: journeyman,
    });
    const blank = await c.takeoffGroups.create({
      bidId,
      label: "Type X exit sign",
    });
    await c.takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: blank.id,
      at: at(3, 6000),
    });
    await c.takeoffGroups.sendToBid({ id: blank.id });
    built.push({
      key: "free-count",
      title:
        "14 fixtures priced by hand ($212.40, 1.25 h) + 3 exit signs left unpriced",
      covers: [
        "hand-priced lines",
        "quote price typed on a line",
        "not priced",
      ],
      detail: await c.bids.get({ id: bidId }),
    });
  }
  return built;
}

async function buildPriced(): Promise<Built[]> {
  const c = as(PRICED);
  const journeyman = await rate(c, "Golden journeyman", 71.5);
  await runLaborRate(c, PRICED, journeyman);
  await c.bids.setPricingDefaults({
    overheadEnabled: true,
    overheadMode: "percentage",
    overheadValue: 0.12,
    profitMethod: "markup",
    profitValue: 0.15,
    productivityPct: 0.05,
    materialMarkupPct: 0.1,
  });
  await c.salesTax.setRules({
    enabled: true,
    taxMaterials: true,
    taxLabor: false,
    applyTo: "price",
  });
  const area = await c.salesTax.create({
    name: "Golden county",
    state: "IL",
    county: "Golden",
    components: [
      { label: "State", ratePct: 6.25 },
      { label: "County", ratePct: 1.75 },
    ],
  });
  const duplex = await duplexAssembly(c, journeyman);
  const type = await emtType(c, "Golden EMT priced");

  // 8 — everything, then out of Draft so its settings freeze.
  const { bidId, sheetId } = await bidWithSheet(
    c,
    PRICED,
    "Golden 8 O&P and tax"
  );
  const g = await countOf(c, bidId, sheetId, duplex.id, [{ n: 9, y: 3000 }]);
  await c.takeoffGroups.sendToBid({ id: g });
  const run = await straightRun(c, bidId, sheetId, type.id, "Feeder", 85);
  await c.takeoffRuns.addCircuit({
    runId: run.id,
    name: "P-1",
    conductorCount: 2,
    groundCount: 1,
  });
  await c.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
  await c.bids.update({ id: bidId, taxJurisdictionId: area!.id });
  await c.bidExtras.expenses.addToBid({
    bidId,
    name: "Permit",
    amount: 185,
    taxable: false,
    markedUp: false,
  });
  await c.bidExtras.expenses.addToBid({
    bidId,
    name: "Lift rental",
    amount: 420,
    taxable: true,
    markedUp: true,
  });
  await c.bids.update({ id: bidId, status: "Active" });
  return [
    {
      key: "op-and-tax",
      title:
        "9 receptacles + 85 ft feeder; 12% overhead, 15% markup profit, 5% productivity, 10% material markup, 8% tax on materials, $185 permit + $420 lift (taxed, marked up); moved to Active",
      covers: [
        "overhead",
        "profit",
        "productivity",
        "material markup",
        "sales tax",
        "expenses",
        "frozen settings",
      ],
      detail: await c.bids.get({ id: bidId }),
    },
  ];
}

/**
 * 9 — wire extra and makeup accepted (the company's OWN numbers, not the
 * shipped starters, so a starter change cannot move this bid), a per-item
 * markup beating the company markup, and profit taken as MARGIN.
 */
async function buildMarkup(): Promise<Built[]> {
  const c = as(MARKUP);
  const journeyman = await rate(c, "Golden journeyman", 58);
  await runLaborRate(c, MARKUP, journeyman);
  await c.bids.setPricingDefaults({
    overheadEnabled: false,
    profitMethod: "margin",
    profitValue: 0.2,
    productivityPct: 0,
    materialMarkupPct: 0.15,
  });
  await c.takeoffHeights.acceptExtraStarters({ accept: true });
  await c.takeoffHeights.setExtras({
    conduitExtraPct: 0.05,
    wireExtraPct: 0.1,
    makeupDeviceInches: 12,
    makeupPanelInches: 36,
  });
  const type = await emtType(c, "Golden EMT markup");
  const emt = (await c.materials.list()).find(
    m => m.name === '1/2" EMT' && m.userId !== null
  )!;
  await c.bids.setItemMarkupOverride({ materialId: emt.id, markupPct: 0.4 });

  const { bidId, sheetId } = await bidWithSheet(
    c,
    MARKUP,
    "Golden 9 markup and extras"
  );
  const run = await straightRun(
    c,
    bidId,
    sheetId,
    type.id,
    "Homerun to panel B",
    100
  );
  await c.takeoffRuns.setEnds({
    id: run.id,
    startKind: "distribution",
    endKind: "receptacle",
    distributionHeightInches: 120,
  });
  await c.takeoffRuns.addCircuit({
    runId: run.id,
    name: "B-1",
    conductorCount: 2,
    groundCount: 1,
  });
  await c.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
  return [
    {
      key: "markup-extras",
      title:
        '100 ft EMT homerun, panel to a receptacle; 5% conduit + 10% wire extra, 12"/36" makeup; EMT marked up 40% (item) over the company\'s 15%; 20% profit as margin',
      covers: ["wire extra", "makeup", "item markup override", "profit margin"],
      detail: await c.bids.get({ id: bidId }),
    },
  ];
}

// ─── The comparison ───────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("golden bids", () => {
  let actual: GoldenBid[] = [];
  let details: Built[] = [];

  beforeAll(async () => {
    await freshUser(PLAIN);
    await freshUser(PRICED);
    await freshUser(MARKUP);
    const built = [
      ...(await buildPlain()),
      ...(await buildPriced()),
      ...(await buildMarkup()),
    ];
    details = built;
    actual = built.map(b => snapshot(b.key, b.title, b.covers, b.detail));
  }, 120_000);

  it("every line and total matches the golden file", () => {
    const reason = process.env.GOLDEN_UPDATE_REASON;
    const previous: GoldenFile | null = existsSync(GOLDEN_PATH)
      ? JSON.parse(readFileSync(GOLDEN_PATH, "utf8"))
      : null;

    if (reason !== undefined) {
      expect(
        process.env.CI,
        "Golden numbers are updated at a desk, never by CI"
      ).toBeFalsy();
      const next = updatedGoldenFile(
        previous,
        actual,
        reason,
        new Date().toISOString().slice(0, 10)
      );
      next.about =
        previous?.about ||
        "Golden bids — see server/goldenBids.ts. Update only with GOLDEN_UPDATE_REASON.";
      writeFileSync(GOLDEN_PATH, JSON.stringify(next, null, 2) + "\n");
      return;
    }

    expect(
      previous,
      "server/fixtures/goldenBids.json is missing"
    ).not.toBeNull();
    expect(goldenFileProblem(previous!)).toBeNull();
    const diffs = compareGoldenBids(previous!.bids, actual);
    expect(
      diffs,
      "A golden bid's numbers moved. If that is on purpose, re-run with " +
        'GOLDEN_UPDATE_REASON="why" and commit the file:\n' +
        describeGoldenDiffs(diffs)
    ).toEqual([]);
  });

  it("no golden bid prices at nothing — a $0 bid would pin nothing", () => {
    for (const bid of actual)
      expect(Number(bid.totals["totals.directCost"]), bid.key).toBeGreaterThan(
        0
      );
  });

  /*
    THE PRINTED AND EXPORTED NUMBERS MATCH THE BID SCREEN, TO THE CENT (owner's
    queue item 9, 2026-10-16). For every golden bid: the proposal the customer
    gets, the quote-app panel, and the takeoff spreadsheet with prices. A bid
    that leaves something unpriced must PRINT "Price pending" — no figure —
    rather than a short one.
  */
  it("the proposal, the quote-app panel and the spreadsheet agree with the bid screen", async () => {
    const cents = (n: number) => Math.round(n * 100);
    // The quote-app panel is an internal-tier feature (shared/permissions.ts
    // FEATURES), read off the session's user. A tier changes what is SHOWN,
    // never a price, so these reads are made as an internal-tier session.
    const internal = (id: number) =>
      appRouter.createCaller({
        user: {
          id,
          openId: `test-fixture-${id}`,
          role: "user",
          accessTier: "internal",
        },
      } as unknown as TrpcContext);
    for (const b of details) {
      const c = internal(b.detail.bid.userId);
      const bidId = b.detail.bid.id;
      const screen = b.detail.totals;
      const leavesOut = b.detail.lines.some(
        l => l.breakdown === null || l.problem !== null
      );

      const proposal = await c.proposals.document({ bidId });
      const investment = proposal.document.investment;
      const notPriced = actual.find(a => a.key === b.key)!.totals;
      const anyNotPriced =
        leavesOut ||
        Number(notPriced["notPriced.lines"]) > 0 ||
        Number(notPriced["notPriced.parts"]) > 0 ||
        Number(notPriced["notPriced.hours"]) > 0;
      // The printed figure is "Price pending" exactly when the bid screen
      // says something is not priced (shared/proposal.ts `pricePending`).
      expect(investment.pricePending, `${b.key}: Price pending`).toBe(
        anyNotPriced
      );
      if (!anyNotPriced)
        expect(cents(investment.total), `${b.key} proposal total`).toBe(
          cents(screen.totalDue)
        );

      const quote = await c.quoteApp.get({ bidId });
      if (quote.state === "ready") {
        expect(quote.totalDueCents, `${b.key} quote total due`).toBe(
          cents(screen.totalDue)
        );
        expect(quote.preTaxCents, `${b.key} quote pre-tax`).toBe(
          cents(screen.totalDue) - cents(screen.salesTaxAmount)
        );
      } else {
        expect(
          anyNotPriced,
          `${b.key}: the quote panel blocks only an unfinished bid`
        ).toBe(true);
      }

      // The LISTS price a bid without opening it — the Dashboard card and
      // "Find a bid" (2026-10-16: they load every listed bid's lines in a
      // few queries rather than a few per bid). Each must say what the bid
      // screen says, on every golden shape.
      const card = (await c.bids.dashboard()).find(row => row.id === bidId);
      expect(card, `${b.key} on the Dashboard`).toBeDefined();
      expect(cents(card!.totalDue), `${b.key} Dashboard total due`).toBe(
        cents(screen.totalDue)
      );
      const found = (await c.bids.search({ pageSize: 100 })).items.find(
        row => row.id === bidId
      );
      expect(found, `${b.key} in Find a bid`).toBeDefined();
      expect(cents(found!.totalDue), `${b.key} Find a bid total due`).toBe(
        cents(screen.totalDue)
      );

      const sheet = await c.takeoffExport.get({ bidId, includePrices: true });
      const f = sheet.prices!;
      expect(cents(f.directCost), `${b.key} spreadsheet direct cost`).toBe(
        cents(screen.directCost)
      );
      expect(
        cents(f.pricedRows) +
          cents(f.notPricedCost) +
          cents(f.otherCost) +
          cents(f.markedUpCharges),
        `${b.key} spreadsheet rows add up`
      ).toBe(cents(f.directCost));
    }
  }, 120_000);
});
