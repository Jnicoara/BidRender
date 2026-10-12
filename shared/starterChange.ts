/**
 * THE STARTER'S NUMBER RULES — what the baseline screen may do to a shipped
 * row, field by field, and who a change reaches (references/baseline-screen-
 * plan.md § 0, § 2, § 3; owner rework items 1–3 and Q17, Q18, Q21).
 *
 * Track C's half of the screen (owner Q12: "C = number rules + tests"). Pure,
 * so `applyStarterChange`, the sheet upload and the screen read one answer.
 * The tables that record pins, changes and offers (BS-M3 – BS-M6) are not
 * applied yet; this is the part that does not need them.
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
 * EVERY column of the four starter tables is listed, and
 * `server/starterChange.test.ts` fails on a column that is not — so a column
 * added later has to be decided here before the screen can touch it.
 */

export type StarterTable =
  | "materials"
  | "assemblies"
  | "laborRates"
  | "modifiers";
export type StarterFieldKind = "offer" | "everyone" | "unit" | "not-editable";

const NOT_EDITABLE_COMMON = [
  "id",
  "userId",
  "baselineId",
  "baselineVersion",
  "version",
  "createdAt",
  "updatedAt",
  "isActive",
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
    ],
    ["searchAliases", "category", "description", "isSpecialty"],
    ["unitOfSale"],
    [
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
    ["isExampleHours", "status", "archivedAt", "trade"]
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
    ],
    [],
    // Hourly vs salaried changes what every amount above MEANS — a unit.
    ["rateType"],
    ["isExampleRate", "trade"]
  ),
  modifiers: kinds(
    // `scope` decides which lines it adds to, so it moves numbers.
    ["name", "laborAdjustmentPct", "scope"],
    [],
    [],
    ["status", "archivedAt"]
  ),
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
