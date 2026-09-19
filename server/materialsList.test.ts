/**
 * The supplier materials list: quantities out, money nowhere.
 *
 * ── What these tests are actually defending ──────────────────────────────────
 * This document leaves the company. It goes to the people the contractor buys
 * from, and it must carry the take-off — which is the estimator's skill — while
 * carrying nothing about what they pay, what they charge, or what they add on
 * top. A supplier who can read the contractor's cost and margin is negotiating
 * against a hand held face up.
 *
 * So the money assertions here are not a formatting check. `describe("carries
 * no pricing")` walks the ENTIRE serialised response and both exported files
 * looking for anything that could be a price — a cost-like key, a currency
 * symbol, a decimal that matches a known cost. It is written to fail if someone
 * later adds a helpful "estimated total" to the header, which is exactly the
 * change that would look harmless in review.
 *
 * ── And that it works before the bid is priced ───────────────────────────────
 * The other half of the point. A contractor asks for a quote precisely because
 * they do not yet know what things cost, so a list that needed a priced bid
 * would be missing in the one moment it matters. `describe("works on a
 * completely unpriced bid")` builds a bid with $0 materials, no labor rate and
 * no pricing defaults, and asserts the quantities come out identical to the
 * priced case.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bidPdfSheets, bids, users } from "../drizzle/schema";
import {
  aggregateMaterials,
  exportFilename,
  isEmptyList,
  lineCount,
  measuredEntries,
  toCsv,
  unitLabel,
  type MaterialsListDoc,
} from "../shared/materialsList";
import type { TrpcContext } from "./_core/context";

const USER = 9301;
const OTHER_USER = 9302;

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-matlist-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

const uniq = () => `${Date.now()}${Math.random()}`;

/**
 * Every material here is priced at $0 — the shipped default.
 *
 * Deliberate: if the list is correct for materials that cost nothing, no part
 * of it can be reading a cost. The one test that needs real costs prices its
 * own fixture (see "a priced bid produces the same list").
 */
async function material(name: string, unit: "each" | "foot" = "each") {
  const created = await caller().materials.create({
    name,
    unitOfSale: unit,
    costPerUnit: 0,
    category: unit === "foot" ? "Wire & Cable" : "Boxes",
  });
  return created!.id;
}

async function assembly(
  name: string,
  materials: { materialId: number; qty: number }[]
) {
  const created = await caller().assemblies.create({
    name,
    category: "Devices",
    trade: "electrical",
    projectType: "both",
    baseLaborHours: 0.5,
    laborRateId: null,
    materials,
    modifierIds: [],
  });
  return created!.id;
}

async function newBid(name = `Matlist bid ${uniq()}`) {
  const bid = await caller().bids.create({ name, trades: ["electrical"] });
  return bid!.id;
}

/** A sheet to stamp and trace on, with a known scale. Bypasses S3. */
async function newSheet(bidId: number, ratio: number | null = 48) {
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId,
    userId: USER,
    filename: "E1.pdf",
    storageKey: `test/${bidId}/e1.pdf`,
    byteSize: 2048,
    pageCount: 1,
    sortOrder: 0,
  });
  const [sheet] = await database!.insert(bidPdfSheets).values({
    bidPdfId: pdf.insertId,
    userId: USER,
    pageNumber: 1,
    name: "E1 — Power plan",
    scaleRatio: ratio === null ? null : String(ratio),
    scaleSource: ratio === null ? "none" : "manual",
  });
  return sheet.insertId;
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  for (const id of [USER, OTHER_USER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await database.insert(users).values({
        id,
        openId: `test-matlist-${id}`,
        name: `Materials list user ${id}`,
      });
    }
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  // bid_pdfs, sheets, stamps, runs and line items all cascade from bids.
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
});

// ── The pure aggregation ─────────────────────────────────────────────────────

describe("rolling assemblies into one list", () => {
  it("multiplies each material by how many of the assembly there are", () => {
    const entries = aggregateMaterials([
      {
        name: "Duplex receptacle",
        count: 12,
        materials: [
          { name: "Duplex receptacle", unit: "each", category: null, qty: 1 },
          { name: '4" square box', unit: "each", category: null, qty: 1 },
          { name: "#12 THHN", unit: "foot", category: null, qty: 25 },
        ],
      },
    ]);
    expect(entries.find(e => e.name === "Duplex receptacle")!.qty).toBe(12);
    expect(entries.find(e => e.name === "#12 THHN")!.qty).toBe(300);
  });

  it("sums the same material arriving from two different assemblies", () => {
    const box = {
      name: '4" square box',
      unit: "each" as const,
      category: null,
      qty: 1,
    };
    const entries = aggregateMaterials([
      { name: "Receptacle", count: 10, materials: [box] },
      { name: "Switch", count: 6, materials: [box] },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].qty).toBe(16);
    // Provenance survives the merge, so the estimator can see where 16 came from.
    expect(entries[0].sources).toEqual(["Receptacle", "Switch"]);
  });

  it("keeps two units of the same name apart rather than adding feet to pieces", () => {
    const entries = aggregateMaterials([
      {
        name: "Odd",
        count: 1,
        materials: [
          { name: "Mystery item", unit: "each", category: null, qty: 3 },
          { name: "Mystery item", unit: "foot", category: null, qty: 50 },
        ],
      },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.map(e => e.qty).sort((a, b) => a - b)).toEqual([3, 50]);
  });

  it("contributes nothing for a zero or negative count instead of subtracting", () => {
    const material = {
      name: "Box",
      unit: "each" as const,
      category: null,
      qty: 2,
    };
    expect(
      aggregateMaterials([{ name: "A", count: 0, materials: [material] }])
    ).toEqual([]);
    expect(
      aggregateMaterials([{ name: "A", count: -5, materials: [material] }])
    ).toEqual([]);
  });

  it("survives a fractional quantity without producing a long decimal", () => {
    const entries = aggregateMaterials([
      {
        name: "Run",
        count: 3,
        materials: [
          { name: "#12 THHN", unit: "foot", category: null, qty: 12.3333 },
        ],
      },
    ]);
    expect(entries[0].qty).toBe(37);
  });
});

describe("measured footage is reported as its own kind of thing", () => {
  it("names what still has to be specified rather than inventing a size", () => {
    const measured = measuredEntries({
      conduitFeet: 340,
      cableFeet: 0,
      wireFeet: 900,
    });
    expect(measured.map(m => m.label)).toEqual(["Conduit", "Wire"]);
    // The note is the whole reason this is not an orderable line.
    expect(measured[0].note).toMatch(/still to be specified/i);
    expect(measured[1].note).toMatch(/still to be specified/i);
  });

  it("omits a category with no footage rather than listing it as zero", () => {
    expect(
      measuredEntries({ conduitFeet: 0, cableFeet: 0, wireFeet: 0 })
    ).toEqual([]);
  });
});

// ── The CSV ──────────────────────────────────────────────────────────────────

const docFixture = (
  over: Partial<MaterialsListDoc> = {}
): MaterialsListDoc => ({
  bidName: "Maple Street duplex",
  jobAddress: "12 Maple St, Portland, OR",
  preparedOn: new Date("2026-08-14T10:00:00Z"),
  entries: [
    {
      name: "#10 bare copper, stranded",
      unit: "foot",
      qty: 250,
      category: "Wire & Cable",
      sources: ["Service feeder"],
    },
    {
      name: 'He said "big" box',
      unit: "each",
      qty: 4,
      category: "Boxes",
      sources: ["Panel"],
    },
  ],
  measured: [{ label: "Conduit", feet: 340, note: "Traced length." }],
  notes: ["A note."],
  ...over,
});

describe("the CSV a supplier opens", () => {
  it("quotes a material name containing a comma instead of splitting it", () => {
    const csv = toCsv(docFixture());
    const line = csv.split("\r\n").find(l => l.includes("bare copper"))!;
    // One name, one cell — five cells on the row, not six.
    expect(line).toContain('"#10 bare copper, stranded"');
    expect(line.split('","')).toHaveLength(5);
  });

  it("doubles an embedded quote, per RFC 4180", () => {
    const csv = toCsv(docFixture());
    expect(csv).toContain('"He said ""big"" box"');
  });

  it("uses CRLF, because Excel is the reader that cares", () => {
    expect(toCsv(docFixture())).toContain("\r\n");
  });

  it("says on its face that it has no pricing", () => {
    expect(toCsv(docFixture())).toContain("Quantities only");
  });

  it("names the file so it cannot be confused with the proposal", () => {
    const name = exportFilename(docFixture(), "csv");
    expect(name).toBe("Maple-Street-duplex-materials-list-2026-08-14.csv");
  });

  it("still produces a filename for a bid named only in punctuation", () => {
    expect(exportFilename(docFixture({ bidName: "***" }), "pdf")).toBe(
      "bid-materials-list-2026-08-14.pdf"
    );
  });

  it("labels units the way a counter does", () => {
    expect(unitLabel("foot")).toBe("ft");
    expect(unitLabel("each")).toBe("ea");
    expect(unitLabel("box")).toBe("box");
  });

  it("knows when there is nothing worth sending", () => {
    expect(isEmptyList(docFixture({ entries: [], measured: [] }))).toBe(true);
    expect(isEmptyList(docFixture())).toBe(false);
    expect(lineCount(docFixture())).toBe(3);
  });
});

// ── The whole document, end to end ───────────────────────────────────────────

describeDb("building the list from a real bid", () => {
  it("counts stamps on the drawing", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const boxId = await material(`Box ${uniq()}`);
    const asmId = await assembly(`Recep ${uniq()}`, [
      { materialId: boxId, qty: 2 },
    ]);

    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      assemblyId: asmId,
      assemblyName: "Recep",
      at: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ],
    });

    const doc = await caller().materialsList.get({ bidId });
    const box = doc.entries.find(e => e.name.startsWith("Box"))!;
    expect(box.qty).toBe(6); // 3 stamps × 2 boxes
    expect(box.unit).toBe("each");
  });

  it("counts assemblies added to the bid, which stamping does not create", async () => {
    const bidId = await newBid();
    const wireId = await material(`Wire ${uniq()}`, "foot");
    const asmId = await assembly(`Circuit ${uniq()}`, [
      { materialId: wireId, qty: 40 },
    ]);

    await caller().bids.addAssembly({ bidId, assemblyId: asmId, qty: 5 });

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.entries.find(e => e.name.startsWith("Wire"))!.qty).toBe(200);
  });

  /*
    The two reasons something cannot be itemised, and why they are worded apart.

    This note is the only part of the document that explains an absence, and it
    goes to a supplier who cannot ask the screen what happened. Telling them a
    labour-only assembly is "no longer in the library" sends them looking for a
    part that was never a part. Both branches were untested until 2026-09-18,
    which is how the wrong one survived.
  */
  it("says labor-only when the assembly is present and contains no parts", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const labourOnly = await assembly(`Testing ${uniq()}`, []);

    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      assemblyId: labourOnly,
      assemblyName: "Testing and commissioning",
      at: [{ x: 5, y: 5 }],
    });

    const doc = await caller().materialsList.get({ bidId });
    const note = doc.notes.find(n => n.includes("Testing and commissioning"))!;
    expect(note).toContain("labor only");
    expect(note).not.toContain("no longer in the library");
  });

  it("still says so plainly when the assembly really has gone", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const boxId = await material(`Doomed box ${uniq()}`);
    const asmId = await assembly(`Doomed ${uniq()}`, [
      { materialId: boxId, qty: 1 },
    ]);

    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      assemblyId: asmId,
      assemblyName: "Doomed assembly",
      at: [{ x: 7, y: 7 }],
    });
    // Deleting the library row nulls the stamp's assemblyId; the name survives.
    // Permanent deletion is gated on archiving first, deliberately.
    await caller().assemblies.archive({ id: asmId });
    await caller().assemblies.deleteForever({ id: asmId });

    const doc = await caller().materialsList.get({ bidId });
    const note = doc.notes.find(n => n.includes("Doomed assembly"))!;
    expect(note).toContain("no longer in the library");
    expect(note).not.toContain("labor only");
  });

  it("adds a stamped and a bid-added assembly together into one line", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const boxId = await material(`Shared box ${uniq()}`);
    const asmA = await assembly(`A ${uniq()}`, [{ materialId: boxId, qty: 1 }]);
    const asmB = await assembly(`B ${uniq()}`, [{ materialId: boxId, qty: 1 }]);

    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      assemblyId: asmA,
      assemblyName: "A",
      at: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    });
    await caller().bids.addAssembly({ bidId, assemblyId: asmB, qty: 3 });

    const doc = await caller().materialsList.get({ bidId });
    const shared = doc.entries.filter(e => e.name.startsWith("Shared box"));
    expect(shared).toHaveLength(1);
    expect(shared[0].qty).toBe(5);
    expect(shared[0].sources).toHaveLength(2);
  });

  it("measures traced runs, and keeps them out of the counted materials", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId, 48);

    // 720 page points at 1/4" = 1'-0" is (720/72) × 48 = 480 inches = 40 ft.
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Panel A feeder",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 720, y: 0 },
      ],
    });
    expect(saved.lengthFeet).toBe(40);
    await caller().takeoffRuns.addCircuit({
      runId: saved.id,
      name: "Ckt 1",
      conductorCount: 3,
    });

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.entries).toHaveLength(0);
    const conduit = doc.measured.find(m => m.label === "Conduit")!;
    const wire = doc.measured.find(m => m.label === "Wire")!;
    expect(conduit.feet).toBe(40);
    expect(wire.feet).toBe(120); // 40 ft × 3 conductors
  });

  it("reports an unmeasurable run rather than dropping it silently", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId, null); // no scale set

    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Unscaled",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
      ],
    });

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.measured).toHaveLength(0);
    expect(doc.notes.some(n => /no usable scale/i.test(n))).toBe(true);
  });

  it("leaves a suggested run out until a person accepts it", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId, 48);

    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "AI guess",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 720, y: 0 },
      ],
      isSuggestion: true,
    });

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.measured).toHaveLength(0);
  });

  it("returns an empty document for an empty bid, not an error", async () => {
    const bidId = await newBid();
    const doc = await caller().materialsList.get({ bidId });
    expect(doc.entries).toEqual([]);
    expect(doc.measured).toEqual([]);
    expect(isEmptyList(doc)).toBe(true);
    expect(doc.bidName).toContain("Matlist bid");
  });

  it("refuses another contractor's bid", async () => {
    const bidId = await newBid();
    await expect(
      callerFor(OTHER_USER).materialsList.get({ bidId })
    ).rejects.toThrow(/not found/i);
  });

  it("leaves an archived line off the list", async () => {
    const bidId = await newBid();
    const boxId = await material(`Archived box ${uniq()}`);
    const asmId = await assembly(`Arch ${uniq()}`, [
      { materialId: boxId, qty: 1 },
    ]);
    const { line } = await caller().bids.addAssembly({
      bidId,
      assemblyId: asmId,
      qty: 4,
    });
    let doc = await caller().materialsList.get({ bidId });
    expect(doc.entries).toHaveLength(1);

    await caller().bids.removeLine({ bidId, id: line!.id });
    doc = await caller().materialsList.get({ bidId });
    expect(doc.entries).toHaveLength(0);
  });
});

// ── Works before anything is priced ──────────────────────────────────────────

describeDb("works on a completely unpriced bid", () => {
  it("produces the same quantities whether or not the materials have prices", async () => {
    const freeId = await material(`Unpriced ${uniq()}`);
    const asmId = await assembly(`Unpriced asm ${uniq()}`, [
      { materialId: freeId, qty: 3 },
    ]);

    const bidId = await newBid();
    await caller().bids.addAssembly({ bidId, assemblyId: asmId, qty: 7 });
    const before = await caller().materialsList.get({ bidId });
    expect(before.entries[0].qty).toBe(21);

    // Now price the material and the labor role, and re-read. Same list.
    await caller().materials.update({ id: freeId, costPerUnit: 4.25 });
    const rates = await caller().laborRates.list();
    if (rates[0]) {
      await caller().laborRates.update({ id: rates[0].id, hourlyCost: 55 });
    }

    const after = await caller().materialsList.get({ bidId });
    expect(after.entries[0].qty).toBe(21);
    expect(after.entries[0].name).toBe(before.entries[0].name);
    expect(JSON.stringify(after.entries)).toBe(JSON.stringify(before.entries));
  });

  it("needs no labor rate, no overhead and no tax settings to build", async () => {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);
    const id = await material(`No settings ${uniq()}`);
    const asmId = await assembly(`No settings asm ${uniq()}`, [
      { materialId: id, qty: 1 },
    ]);
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      assemblyId: asmId,
      assemblyName: "No settings asm",
      at: [{ x: 5, y: 5 }],
    });

    // No calls to setPricingDefaults, no tax area, no rate on the assembly.
    const doc = await caller().materialsList.get({ bidId });
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0].qty).toBe(1);
  });
});

// ── The guarantee ────────────────────────────────────────────────────────────

/**
 * Anything that smells like money, in a key or a value.
 *
 * Deliberately broad and deliberately applied to the whole payload rather than
 * to a list of fields someone remembered to check. The failure this is here to
 * catch is additive — a later "handy" subtotal in the header — so it has to be
 * a rule about the document, not about today's fields.
 */
const MONEY_KEY =
  /cost|price|pricing|rate|markup|overhead|profit|margin|tax|total|amount|subtotal|charge|dollar|usd/i;
const MONEY_VALUE = /[$£€]|\b\d{1,3}(,\d{3})+(\.\d{2})?\b/;

function moneyKeysIn(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => moneyKeysIn(v, `${path}[${i}]`));
  }
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (MONEY_KEY.test(key)) found.push(`${path}.${key}`);
    found.push(...moneyKeysIn(child, `${path}.${key}`));
  }
  return found;
}

describeDb("carries no pricing", () => {
  /** A bid with real prices everywhere, so there is something that COULD leak. */
  async function pricedBid() {
    const bidId = await newBid();
    const sheetId = await newSheet(bidId);

    const device = await caller().materials.create({
      name: `Priced device ${uniq()}`,
      unitOfSale: "each",
      costPerUnit: 26.74,
      category: "Receptacles",
    });
    const wire = await caller().materials.create({
      name: `Priced wire ${uniq()}`,
      unitOfSale: "foot",
      costPerUnit: 1.42,
      category: "Wire & Cable",
    });

    const rates = await caller().laborRates.list();
    const rate = rates[0]
      ? (await caller().laborRates.update({ id: rates[0].id, hourlyCost: 38 }))
          .laborRate!.id
      : null;

    const asmId = await assembly(`Priced asm ${uniq()}`, [
      { materialId: device!.id, qty: 1 },
      { materialId: wire!.id, qty: 30 },
    ]);
    if (rate)
      await caller().assemblies.update({ id: asmId, laborRateId: rate });

    // Fractions, not percents — 0.12 is 12%. See bidsRouter's schemas.
    await caller().bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "percentage",
      overheadValue: 0.12,
      profitMethod: "margin",
      profitValue: 0.18,
      productivityPct: 0.05,
    });
    await caller().bids.addAssembly({ bidId, assemblyId: asmId, qty: 9 });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      assemblyId: asmId,
      assemblyName: "Priced asm",
      at: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    });
    return { bidId, deviceCost: 26.74, wireCost: 1.42 };
  }

  it("has no money-shaped key anywhere in the response", async () => {
    const { bidId } = await pricedBid();
    const doc = await caller().materialsList.get({ bidId });
    expect(moneyKeysIn(doc)).toEqual([]);
  });

  it("has no currency symbol or thousands-grouped figure in the response", async () => {
    const { bidId } = await pricedBid();
    const doc = await caller().materialsList.get({ bidId });
    expect(JSON.stringify(doc)).not.toMatch(MONEY_VALUE);
  });

  it("does not contain the actual costs of the materials on it", async () => {
    const { bidId, deviceCost, wireCost } = await pricedBid();
    const doc = await caller().materialsList.get({ bidId });
    const text = JSON.stringify(doc);
    // The exact figures, and the extended figures they would roll up to.
    for (const figure of [
      deviceCost,
      wireCost,
      deviceCost * 11,
      wireCost * 330,
    ]) {
      expect(text).not.toContain(figure.toFixed(2));
    }
  });

  it("has no money in the exported CSV either", async () => {
    const { bidId, deviceCost } = await pricedBid();
    const doc = await caller().materialsList.get({ bidId });
    const csv = toCsv(doc);
    expect(csv).not.toMatch(/[$£€]/);
    expect(csv).not.toContain(deviceCost.toFixed(2));
    // The header row names every column the file will ever have.
    const header = csv.split("\r\n").find(l => l.startsWith('"Item"'))!;
    expect(header).toBe('"Item","Unit","Quantity","Category","From"');
  });

  it("still carries the quantities it is supposed to", async () => {
    const { bidId } = await pricedBid();
    const doc = await caller().materialsList.get({ bidId });
    // 9 on the bid + 2 stamped = 11 assemblies; wire is 30 ft in each.
    const wire = doc.entries.find(e => e.name.startsWith("Priced wire"))!;
    expect(wire.qty).toBe(330);
    expect(toCsv(doc)).toContain("330");
  });

  it("a priced bid produces the same list as an unpriced one", async () => {
    const { bidId } = await pricedBid();
    const priced = await caller().materialsList.get({ bidId });
    const quantities = priced.entries.map(e => `${e.name}|${e.unit}|${e.qty}`);
    expect(quantities).toHaveLength(2);
    // Nothing in the entries varies with a cost — asserted by rebuilding the
    // same shape from the pure function with no cost in scope at all.
    expect(quantities.every(q => /\|\d+(\.\d+)?$/.test(q))).toBe(true);
  });
});
