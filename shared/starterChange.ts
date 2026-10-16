/**
 * THE STARTER'S NUMBER RULES — what the baseline screen may do to a shipped
 * row, field by field, and who a change reaches (references/baseline-screen-
 * plan.md § 0, § 2, § 3; owner rework items 1–3 and Q17, Q18, Q21).
 *
 * Track C's half of the screen (owner Q12: "C = number rules + tests"). Pure,
 * so `applyStarterChange`, the sheet upload and the screen read one answer.
 * The tables that record pins, changes and offers (BS-M3 – BS-M6, 0152–0155)
 * are written by `applyStarterChange` (server/starterChanges.ts), which reads
 * every rule below; this file is the part that needs no database.
 *
 * ── The four kinds ───────────────────────────────────────────────────────────
 *   offer         a number, or a name, a company sees. An existing company
 *                 is pinned to the old value and OFFERED the new one; it
 *                 never arrives on its own (owner, 2026-10-10).
 *   everyone      a FINDING field — search words, shelf, description,
 *                 specialty tag, library filters, the mark's look. Changes
 *                 no number and no item, so it reaches every company as an
 *                 app improvement (owner Q21).
 *   unit          never changed on an existing item (owner, rework item 3):
 *                 every quantity on every bid means "so many of THAT unit".
 *                 A unit change is a new item plus hiding the old one.
 *   not-editable  owned by the machinery (ids, versions, example tags,
 *                 status, hiding) or by the company (its supplier, its
 *                 brand note). The screen never writes these as a field.
 *
 * EVERY column of the five starter tables is listed, and
 * `server/starterChange.test.ts` fails on a column that is not — so a column
 * added later has to be decided here before the screen can touch it.
 */

export type StarterTable =
  | "materials"
  | "assemblies"
  | "laborRates"
  | "modifiers"
  | "runTypes";
export type StarterFieldKind = "offer" | "everyone" | "unit" | "not-editable";

const NOT_EDITABLE_COMMON = [
  "id",
  "userId",
  "baselineId",
  "baselineVersion",
  "version",
  "createdAt",
  "updatedAt",
  // Starter hiding and pins (0154, BS-M5) — machinery, written only by
  // applyStarterChange / hideStarterItem, never as a field.
  "isPinnedCopy",
  "hiddenAt",
  "replacedById",
] as const;

function kinds(
  offer: readonly string[],
  everyone: readonly string[],
  unit: readonly string[],
  notEditable: readonly string[]
): Record<string, StarterFieldKind> {
  const out: Record<string, StarterFieldKind> = {};
  for (const f of offer) out[f] = "offer";
  for (const f of everyone) out[f] = "everyone";
  for (const f of unit) out[f] = "unit";
  for (const f of [...NOT_EDITABLE_COMMON, ...notEditable])
    out[f] = "not-editable";
  return out;
}

export const STARTER_FIELDS: Record<
  StarterTable,
  Record<string, StarterFieldKind>
> = {
  materials: kinds(
    [
      "name", // owner Q17: a name change is an offer
      "costPerUnit",
      "laborHours",
      "fieldBendLaborHours",
      "stickLengthFeet",
      "strapSpacingFeet",
      "strapFromBoxFeet",
      "stickJoint",
      "defaultQty",
      // Pricing safety (0157/0158, PS-M1/M2; Track A's call 2026-10-14, C to
      // confirm before step 6 seeds them): the pack size changes the
      // purchase list and, later, the price band key, so a company is
      // offered a new one. The label travels with it — a qty without its
      // word misreads.
      "packQty",
      "packLabel",
    ],
    ["searchAliases", "category", "description", "isSpecialty"],
    ["unitOfSale"],
    [
      "isActive",
      "isExamplePrice",
      "isExampleLaborHours",
      "status",
      "archivedAt",
      "trade",
      "parentId",
      "brand",
      "brandNote",
      "supplierName",
      "priceUpdatedAt",
      // 0159/0160 (PS-M3/M4): the company's own — a pack price as THEY typed
      // it (a shipped row's stays NULL, PS § 2.4), and their "keep it" on the
      // sanity warning.
      "packPrice",
      "priceCheckAcceptedAt",
    ]
  ),
  assemblies: kinds(
    [
      "name",
      "baseLaborHours",
      "overheadLaborHours",
      "removeLaborHours",
      "relocateLaborHours",
      "laborRateId",
      "laborOnly",
      "mountHeightTypeKey",
      "materialByQuote",
    ],
    ["category", "projectType", "markShape", "markLetter", "markColor"],
    [],
    ["isActive", "isExampleHours", "status", "archivedAt", "trade"]
  ),
  laborRates: kinds(
    [
      "name",
      "hourlyCost",
      "annualSalary",
      "annualHours",
      "baseWage",
      "payrollTaxPct",
      "workersCompPct",
      "insurancePct",
      "benefitsPct",
      // 0165 (BM-M4): what an hour is CHARGED at under method A — money on
      // every line priced that way, so a shipped value changing reaches a
      // shop only as an offer, like hourlyCost. Ships NULL.
      "chargeRate",
    ],
    [],
    // Hourly vs salaried changes what every amount above MEANS — a unit.
    ["rateType"],
    ["isActive", "isExampleRate", "trade"]
  ),
  modifiers: kinds(
    // `scope` decides which lines it adds to, so it moves numbers.
    ["name", "laborAdjustmentPct", "scope"],
    [],
    [],
    ["isActive", "status", "archivedAt"]
  ),
  // takeoff_run_types (§ 10a.1 #1): its parts are COLUMNS, so each is an
  // offer like any number. Its EXTRAS are child rows and wait with kits.
  runTypes: kinds(
    [
      "label",
      "racewayMaterialId",
      "conductorMaterialId",
      "conductorCount",
      "groundMaterialId",
      "groundCount",
      "fittingStyle",
      "couplingMaterialId",
      "connectorMaterialId",
      "strapMaterialId",
      "elbow90MaterialId",
      "elbow45MaterialId",
      "lbMaterialId",
      "pullBoxMaterialId",
      "conduitExtraPct",
      "wireExtraPct",
      "makeupDeviceInches",
      "makeupPanelInches",
      "makeupByKindInches",
    ],
    // The run's colour on the drawing: its look, no number.
    ["color"],
    // Conduit vs cable vs … decides what every foot on a bid IS — a unit.
    ["pathType"],
    ["trade", "status", "archivedAt"]
  ),
};

/**
 * The fields that NAME another starter row. A change may point one only at a
 * SHARED, active row of that table (§ 10a.3 step 1, as for a part): a starter
 * that pointed at one company's copy would hand that company's item to every
 * other company.
 */
export const STARTER_REFERENCES: Partial<
  Record<StarterTable, Record<string, StarterTable>>
> = {
  assemblies: { laborRateId: "laborRates" },
  runTypes: {
    racewayMaterialId: "materials",
    conductorMaterialId: "materials",
    groundMaterialId: "materials",
    couplingMaterialId: "materials",
    connectorMaterialId: "materials",
    strapMaterialId: "materials",
    elbow90MaterialId: "materials",
    elbow45MaterialId: "materials",
    lbMaterialId: "materials",
    pullBoxMaterialId: "materials",
  },
};

/** The kind of one field, or `undefined` for a field this list does not know. */
export function starterFieldKind(
  table: StarterTable,
  field: string
): StarterFieldKind | undefined {
  return STARTER_FIELDS[table][field];
}

/**
 * Why the screen (or the sheet upload) must refuse to change this field on an
 * existing starter row — or null when it may. A field this list does not know
 * is refused too: an unlisted column is an undecided one.
 */
export function starterChangeRefusal(
  table: StarterTable,
  field: string
): string | null {
  const kind = starterFieldKind(table, field);
  if (kind === undefined)
    return `"${field}" is not a field the starter screen can change.`;
  if (kind === "unit")
    return `The unit is never changed on an existing item: every bid's quantity means so many of that unit. Add a new item and hide this one with the new one as its replacement.`;
  if (kind === "not-editable")
    return `"${field}" is kept by the app, not edited on the starter.`;
  return null;
}

// ─── Who a change reaches (§ 2, "The offer") ────────────────────────────────

/** Equal as stored values: "0.5000" and 0.5 are one price; null is its own. */
export function sameStarterValue(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined)
    return (a ?? null) === (b ?? null);
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (
    typeof a !== "boolean" &&
    typeof b !== "boolean" &&
    String(a).trim() !== "" &&
    String(b).trim() !== "" &&
    Number.isFinite(na) &&
    Number.isFinite(nb)
  )
    return na === nb;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Where one logged change lands for ONE existing company, read from that
 * company's copy of the item (a pinned copy holds the old value):
 *
 *   "offer"      its copy still holds the OLD starter value. Listed, and in
 *                "Accept all".
 *   "own-value"  it changed this field itself. Listed apart, one at a time,
 *                yours vs BidRidge's new value — never in Accept all (Q18).
 *   "nothing"    its copy already holds the NEW value. Nothing to offer.
 *
 * For an "everyone" field there is no offer: the shared row changes and
 * every company reads it. Callers ask this only for "offer" fields.
 */
export type OfferBucket = "offer" | "own-value" | "nothing";

export function offerBucket(change: {
  oldValue: unknown;
  newValue: unknown;
  companyValue: unknown;
}): OfferBucket {
  if (sameStarterValue(change.companyValue, change.newValue)) return "nothing";
  if (sameStarterValue(change.companyValue, change.oldValue)) return "offer";
  return "own-value";
}

/** The rows "Accept all" may take: offers only, never a company's own value (Q18). */
export function acceptAllTakes<T extends { bucket: OfferBucket }>(
  rows: readonly T[]
): T[] {
  return rows.filter(row => row.bucket === "offer");
}

// ─── One offer per FIELD, not per change (starter-offers-plan.md § 3a) ───────

/**
 * One logged change, as the offer read needs it: values unwrapped from the
 * log's `{"v": …}`, and this company's answer to it, if any.
 */
export type LoggedOfferChange = {
  id: number;
  oldValue: unknown;
  newValue: unknown;
  answer: "accepted" | "ignored" | null;
};

export type CollapsedOffer = {
  /** What BidRidge held when this company's copy was made. */
  base: unknown;
  /** BidRidge's value now: the LAST change's new value. */
  latest: unknown;
  bucket: OfferBucket;
  /** The newest change: what the screen shows and what Accept must match. */
  latestChangeId: number;
  /** The changes an answer to this offer covers: every one not answered yet. */
  unansweredIds: number[];
  /** The answer to the newest change; "ignored" puts the offer in the fold. */
  answer: "accepted" | "ignored" | null;
};

/**
 * Every change to ONE field (or one recipe part) of one starter row since this
 * company's copy was made, oldest first, collapsed into the one offer the shop
 * sees — or null when there is nothing to say.
 *
 * ── Why per field, and why not `baselineVersion` (the fault this replaces) ──
 * `baseline-screen-plan.md` § 10a.3 hid a change once the copy's
 * `baselineVersion` passed it and compared the copy with ONE change's old
 * value. `baselineVersion` is one number per ROW while changes are per FIELD,
 * so accepting a row's hours change hid an unanswered price change on the
 * same row, and a field changed twice (0.48 → 0.52 → 0.55) made a shop still
 * at 0.48 read "own-value", as if it had typed a price. Here:
 *
 *   - the offer is about the NEWEST change; once that is answered it is
 *     gone, and a newer change is a new offer (owner Q7);
 *   - the company's value is "BidRidge's" when it equals ANY value the
 *     starter held since the copy was made — the first change's old value or
 *     an earlier change's new one (what an Accept wrote) — so neither an
 *     ignored nor an accepted earlier change makes it read "own-value";
 *   - it equals the latest: nothing to offer (an undo a shop never took).
 */
export function collapseOffer(
  changes: readonly LoggedOfferChange[],
  companyValue: unknown,
  same: (a: unknown, b: unknown) => boolean = sameStarterValue
): CollapsedOffer | null {
  if (changes.length === 0) return null;
  const last = changes[changes.length - 1];
  const latest = last.newValue;
  if (same(companyValue, latest)) return null;
  const heldByStarter = [
    changes[0].oldValue,
    ...changes.slice(0, -1).map(c => c.newValue),
  ];
  const bucket: OfferBucket = heldByStarter.some(v => same(companyValue, v))
    ? "offer"
    : "own-value";
  if (last.answer === "accepted") return null;
  return {
    base: changes[0].oldValue,
    latest,
    bucket,
    latestChangeId: last.id,
    unansweredIds: changes.filter(c => c.answer === null).map(c => c.id),
    answer: last.answer,
  };
}

/**
 * Accepting and ignoring change a shop's library for everyone in it, so only
 * the owner and admins may (owner Q1, 2026-10-14). Every member sees the count.
 */
export function canAnswerStarterOffers(role: string): boolean {
  return role === "owner" || role === "admin";
}

// ─── The Example tag travels with its number (§ 2.6) ────────────────────────

/**
 * Which tag each shipped number carries. A change to one of these fields
 * writes the tag in the SAME change — never as a change of its own, which
 * would show a shop an offer "Example tag: off → on" that means nothing and
 * could be accepted without its number.
 */
export const EXAMPLE_COMPANIONS: Partial<
  Record<StarterTable, Record<string, string>>
> = {
  materials: {
    costPerUnit: "isExamplePrice",
    laborHours: "isExampleLaborHours",
    fieldBendLaborHours: "isExampleLaborHours",
  },
  laborRates: {
    hourlyCost: "isExampleRate",
    annualSalary: "isExampleRate",
    annualHours: "isExampleRate",
    baseWage: "isExampleRate",
    payrollTaxPct: "isExampleRate",
    workersCompPct: "isExampleRate",
    insurancePct: "isExampleRate",
    benefitsPct: "isExampleRate",
  },
  assemblies: {
    baseLaborHours: "isExampleHours",
    overheadLaborHours: "isExampleHours",
  },
};

/** The tag column a field's number carries, or null. */
export function exampleTagOf(
  table: StarterTable,
  field: string
): string | null {
  return EXAMPLE_COMPANIONS[table]?.[field] ?? null;
}

/**
 * The tag a starter row carries once `field` holds `value`, read with the
 * row's OTHER numbers (`row`, before the change):
 *
 *   price  tagged only when it is above zero. A blank or $0 is "Not priced",
 *          never a $0 "Example price" (owner, 2026-10-14 — the same rule as
 *          `server/seed/materials/index.ts`).
 *   hours  tagged while any of the row's hours that carry it is set.
 *   rate   always tagged: every shipped rate is BidRidge's example.
 */
export function exampleTagAfter(
  table: StarterTable,
  field: string,
  value: unknown,
  row: Record<string, unknown>
): { tag: string; value: boolean } | null {
  const tag = exampleTagOf(table, field);
  if (!tag) return null;
  if (tag === "isExamplePrice") {
    const n = value === null || value === undefined ? NaN : Number(value);
    return { tag, value: Number.isFinite(n) && n > 0 };
  }
  if (tag === "isExampleRate") return { tag, value: true };
  const siblings = Object.entries(EXAMPLE_COMPANIONS[table] ?? {})
    .filter(([, t]) => t === tag)
    .map(([f]) => (f === field ? value : row[f]));
  return {
    tag,
    value: siblings.some(v => v !== null && v !== undefined && v !== ""),
  };
}

// ─── Which offers re-count Drafts (§ 2.4, plan § 9 F1) ──────────────────────

/**
 * The offer fields an UNLOCKED Draft reads live, so accepting one re-counts
 * the Drafts that use it. Everything else on a bid line is frozen when the
 * line is added (price, hours, rate, modifier, labor-only — plan § 9a), so
 * accepting it changes only the shop's NEXT lines.
 *
 *   materials   the raceway facts: stick length, strap spacing and distance
 *               from a box, the joint (couplings).
 *   assemblies  the mounting height type (drops and verticals).
 *   runTypes    every part, count, waste % and make-up length.
 */
const RECOUNTS: Record<StarterTable, readonly string[]> = {
  materials: [
    "stickLengthFeet",
    "strapSpacingFeet",
    "strapFromBoxFeet",
    "stickJoint",
  ],
  assemblies: ["mountHeightTypeKey"],
  laborRates: [],
  modifiers: [],
  runTypes: [
    "racewayMaterialId",
    "conductorMaterialId",
    "conductorCount",
    "groundMaterialId",
    "groundCount",
    "fittingStyle",
    "couplingMaterialId",
    "connectorMaterialId",
    "strapMaterialId",
    "elbow90MaterialId",
    "elbow45MaterialId",
    "lbMaterialId",
    "pullBoxMaterialId",
    "conduitExtraPct",
    "wireExtraPct",
    "makeupDeviceInches",
    "makeupPanelInches",
    "makeupByKindInches",
  ],
};

/**
 * The offer fields that DO NOT re-count, each named on purpose — so a field
 * added to `STARTER_FIELDS` later fails `server/starterChange.test.ts` until
 * somebody decides which side it is on.
 */
export const DOES_NOT_RECOUNT: Record<StarterTable, readonly string[]> = {
  materials: [
    "name",
    "costPerUnit",
    "laborHours",
    "fieldBendLaborHours",
    "defaultQty",
    "packQty",
    "packLabel",
  ],
  assemblies: [
    "name",
    "baseLaborHours",
    "overheadLaborHours",
    "removeLaborHours",
    "relocateLaborHours",
    "laborRateId",
    "laborOnly",
    "materialByQuote",
  ],
  laborRates: [
    "name",
    "hourlyCost",
    "annualSalary",
    "annualHours",
    "baseWage",
    "payrollTaxPct",
    "workersCompPct",
    "insurancePct",
    "benefitsPct",
    // 0165: frozen on each line as `snapshotChargeRate`, like hourlyCost's
    // `snapshotLaborRate` — a new charge rate reaches new lines only.
    "chargeRate",
  ],
  modifiers: ["name", "laborAdjustmentPct", "scope"],
  runTypes: ["label"],
};

/** Does accepting this field re-count the shop's unlocked Drafts? */
export function recountsDrafts(table: StarterTable, field: string): boolean {
  return RECOUNTS[table].includes(field);
}

/** Every field the re-count rule names, for the test that nothing is missed. */
export function recountClassified(table: StarterTable): string[] {
  return [...RECOUNTS[table], ...DOES_NOT_RECOUNT[table]];
}
