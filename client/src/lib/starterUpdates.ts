/**
 * How a BidRidge starter update READS on a shop's screen
 * (references/starter-offers-plan.md § 2.3; owner Q3, Q4, Q6).
 *
 * Kept here rather than in the component because the suite can reach
 * client/src/lib and not a React component: a wrong unit on a price, or an
 * unset hour shown as "0", is a wrong number on screen, and that wants a test
 * that can go red (CLAUDE.md § "A rule with no red to go to").
 */
import { money, unitCost } from "@/lib/money";
import { needsPricing } from "@shared/materialPricing";

/**
 * A material price as the starter screens show it. The column stores 0 for
 * "nobody has priced this" (shared/materialPricing.ts), and "$0.00" reads as
 * a part that costs nothing — so an unpriced one says so in words.
 */
export function starterPriceText(
  costPerUnit: string | number | null | undefined
): string {
  return needsPricing(costPerUnit) ? "not priced" : unitCost(Number(costPerUnit));
}

export type UpdateTable =
  | "materials"
  | "assemblies"
  | "laborRates"
  | "modifiers"
  | "runTypes";

/** The fields a shop sees named, in its own words. */
const FIELD_LABEL: Record<UpdateTable, Record<string, string>> = {
  materials: {
    name: "Name",
    costPerUnit: "Price",
    laborHours: "Labor hours",
    fieldBendLaborHours: "Bend hours",
    stickLengthFeet: "Stick length",
    strapSpacingFeet: "Strap spacing",
    strapFromBoxFeet: "Strap from box",
    stickJoint: "Stick joint",
    defaultQty: "Default quantity",
    packQty: "Pack size",
    packLabel: "Pack word",
  },
  assemblies: {
    name: "Name",
    baseLaborHours: "Labor hours",
    overheadLaborHours: "Overhead hours",
    removeLaborHours: "Remove hours",
    relocateLaborHours: "Relocate hours",
    laborRateId: "Labor role",
    laborOnly: "Labor only",
    mountHeightTypeKey: "Mounting height",
    materialByQuote: "Material by quote",
  },
  laborRates: {
    name: "Name",
    hourlyCost: "Hourly rate",
    annualSalary: "Annual salary",
    annualHours: "Annual hours",
    baseWage: "Base wage",
    payrollTaxPct: "Payroll tax",
    workersCompPct: "Workers' comp",
    insurancePct: "Insurance",
    benefitsPct: "Benefits",
  },
  modifiers: {
    name: "Name",
    laborAdjustmentPct: "Labor adjustment",
    scope: "Applies to",
  },
  runTypes: {
    label: "Name",
    racewayMaterialId: "Raceway",
    conductorMaterialId: "Wire",
    conductorCount: "Conductors",
    groundMaterialId: "Ground",
    groundCount: "Grounds",
    fittingStyle: "Fittings",
    couplingMaterialId: "Coupling",
    connectorMaterialId: "Connector",
    strapMaterialId: "Strap",
    elbow90MaterialId: "90° elbow",
    elbow45MaterialId: "45° elbow",
    lbMaterialId: "LB",
    pullBoxMaterialId: "Pull box",
    conduitExtraPct: "Conduit waste",
    wireExtraPct: "Wire waste",
    makeupDeviceInches: "Make-up at a device",
    makeupPanelInches: "Make-up at a panel",
    makeupByKindInches: "Make-up by end",
  },
};

export const TABLE_LABEL: Record<UpdateTable, string> = {
  materials: "Materials",
  assemblies: "Assemblies",
  laborRates: "Labor rates",
  modifiers: "Modifiers",
  runTypes: "Run types",
};

export function fieldLabel(table: UpdateTable, field: string): string {
  return FIELD_LABEL[table]?.[field] ?? field;
}

const MONEY = new Set([
  "costPerUnit",
  "hourlyCost",
  "baseWage",
  "annualSalary",
]);
const HOURS = new Set([
  "laborHours",
  "fieldBendLaborHours",
  "baseLaborHours",
  "overheadLaborHours",
  "removeLaborHours",
  "relocateLaborHours",
]);
const PERCENT = new Set([
  "conduitExtraPct",
  "wireExtraPct",
  "payrollTaxPct",
  "workersCompPct",
  "insurancePct",
  "benefitsPct",
  "laborAdjustmentPct",
]);
const FEET = new Set([
  "stickLengthFeet",
  "strapSpacingFeet",
  "strapFromBoxFeet",
]);
const INCHES = new Set(["makeupDeviceInches", "makeupPanelInches"]);

/**
 * Fields whose NULL means "follow the level above", not "nothing": a run
 * type with no waste of its own uses the company's default (run → run type
 * → company default, plan § 9a). Saying "not set" there would tell a shop
 * nothing applies when something does (CLAUDE.md § "what EMPTY means
 * changes with where it is used").
 */
const INHERITS: Record<string, string> = {
  conduitExtraPct: "your default",
  wireExtraPct: "your default",
  makeupDeviceInches: "your default",
  makeupPanelInches: "your default",
};

/** A stored number as a plain number string: "0.5500" → "0.55". */
function plain(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(+n.toFixed(4)) : String(v);
}

/**
 * One value as the shop reads it. UNSET IS NOT ZERO (CLAUDE.md § Editing
 * fields 6): a NULL hour or count reads "not set", never "0". `names` maps a
 * reference id to the row it names.
 */
export function formatUpdateValue(
  table: UpdateTable,
  field: string | null,
  value: unknown,
  names: Record<string, string> = {}
): string {
  if (field === "costPerUnit") return starterPriceText(value as string | null);
  if (value === null || value === undefined || value === "")
    return field !== null && INHERITS[field] ? INHERITS[field] : "not set";
  if (field === null) return String(value);
  if (field.endsWith("MaterialId") || field === "laborRateId")
    return names[String(value)] ?? "another item";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (MONEY.has(field))
    return field === "hourlyCost" || field === "baseWage"
      ? `${money(Number(value))} / h`
      : money(Number(value));
  if (HOURS.has(field)) return `${plain(value)} h`;
  // Every percent column is stored as a FRACTION (0.1000 = 10%: waste in
  // drizzle/schema.ts takeoff_run_types, the burden parts in 0134, a
  // modifier's labor adjustment) — shown as the percent people say.
  if (PERCENT.has(field)) return `${plain(Number(value) * 100)}%`;
  if (FEET.has(field)) return `${plain(value)} ft`;
  if (INCHES.has(field)) return `${plain(value)} in`;
  if (typeof value === "object")
    // The shop took this part off its own recipe (server/starterOffers.ts).
    return "removed" in (value as object) ? "not on yours" : "changed";
  if (typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value)))
    return plain(value);
  return String(value);
}

/** A recipe line, as the log holds it. */
type Line = { qty?: unknown } | null;

/**
 * The sentence a recipe update reads as (plan § 3b): "Add 2 × Wire
 * connector", "Remove Wire connector", "Wire connector: quantity 2 → 3".
 */
export function partSentence(input: {
  kind: "part" | "partField" | "modifier";
  childName: string | null;
  field: string | null;
  yours: unknown;
  latest: unknown;
}): string {
  const part = input.childName ?? "a part";
  if (input.kind === "modifier")
    return input.latest === true
      ? `Add the ${part} adjustment`
      : `Remove the ${part} adjustment`;
  if (input.kind === "part") {
    const latest = input.latest as Line;
    const yours = input.yours as Line;
    if (latest === null) return `Remove ${part}`;
    const qty = plain(latest.qty);
    return yours === null
      ? `Add ${qty} × ${part}`
      : `${part}: quantity ${plain(yours.qty)} → ${qty}`;
  }
  const label =
    input.field === "qty"
      ? "quantity"
      : input.field === "overrideLaborHours"
        ? "labor hours"
        : "set as a branch whip";
  return `${part}: ${label}`;
}

/**
 * The re-count warning, shown BEFORE Accept is pressed (plan § 2.4, owner
 * Q6). Null when nothing would move: a price or hours update never re-counts
 * a bid, so it carries no warning (a warning on every Accept would be read
 * past on the one that matters).
 */
export function recountWarning(drafts: number): string | null {
  if (drafts <= 0) return null;
  return drafts === 1
    ? "1 draft bid uses this and will re-count."
    : `${drafts} draft bids use this and will re-count.`;
}

/** What an Accept says it did. */
export function acceptedSentence(drafts: number): string {
  if (drafts <= 0) return "Accepted.";
  return drafts === 1
    ? "Accepted. 1 draft bid re-counted."
    : `Accepted. ${drafts} draft bids re-counted.`;
}

/** The Accept all dialog's first sentence (Q6: the total first). */
export function acceptAllSentence(updates: number, drafts: number): string {
  const what = updates === 1 ? "1 update" : `${updates} updates`;
  if (drafts <= 0)
    return `Accept ${what} from BidRidge? No bid re-counts: bids already priced keep their prices.`;
  const bids = drafts === 1 ? "1 draft bid" : `${drafts} draft bids`;
  return `Accept ${what} from BidRidge? This re-counts ${bids}. Sent and locked bids never change.`;
}

/** The Dashboard card's words, or null when there is nothing to say. */
export function updatesCardText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 starter update available"
    : `${count} starter updates available`;
}
