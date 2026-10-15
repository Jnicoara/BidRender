/**
 * What the baseline screen lets the starter editor change, and how a typed
 * value becomes the value `applyStarterChange` stores
 * (references/starter-offers-plan.md § 2.1, § 4 step 4).
 *
 * The server re-checks every rule (`STARTER_FIELDS`, the sheet's checks); this
 * is the screen's half — which fields get a box, in what unit — kept here so
 * the conversion has a test. A waste % typed as "10" must be stored as 0.1,
 * not 10 (a 1,000% waste is a wrong number nothing else would catch), and an
 * emptied hours box is "not set", never 0 (CLAUDE.md § Editing fields 6).
 *
 * Labor rates are not edited here: a rate is its base wage times its burden,
 * and changing one figure alone would leave the rate disagreeing with its own
 * breakdown. They wait for an edit that writes the wage and the rate as one
 * batch.
 */
export type EditTable = "materials" | "assemblies" | "runTypes";

export type EditUnit =
  | "money"
  | "hours"
  | "percent"
  | "feet"
  | "count"
  | "text";

export type EditField = {
  field: string;
  label: string;
  unit: EditUnit;
  /** True for a finding field: it reaches every shop, no offer. */
  everyone?: boolean;
  /** Blank is allowed and means "not set". */
  blankable?: boolean;
};

export const STARTER_EDIT_FIELDS: Record<EditTable, EditField[]> = {
  materials: [
    { field: "costPerUnit", label: "Price per unit", unit: "money" },
    {
      field: "laborHours",
      label: "Labor hours",
      unit: "hours",
      blankable: true,
    },
    { field: "name", label: "Name", unit: "text" },
    {
      field: "stickLengthFeet",
      label: "Stick length",
      unit: "feet",
      blankable: true,
    },
    {
      field: "strapSpacingFeet",
      label: "Strap spacing",
      unit: "feet",
      blankable: true,
    },
    {
      field: "searchAliases",
      label: "Search words",
      unit: "text",
      everyone: true,
      blankable: true,
    },
    {
      field: "description",
      label: "Description",
      unit: "text",
      everyone: true,
      blankable: true,
    },
  ],
  assemblies: [
    {
      field: "baseLaborHours",
      label: "Labor hours",
      unit: "hours",
      blankable: true,
    },
    { field: "overheadLaborHours", label: "Overhead hours", unit: "hours" },
    { field: "name", label: "Name", unit: "text" },
    { field: "category", label: "Shelf", unit: "text", everyone: true },
  ],
  runTypes: [
    { field: "label", label: "Name", unit: "text" },
    {
      field: "conduitExtraPct",
      label: "Conduit waste",
      unit: "percent",
      blankable: true,
    },
    {
      field: "wireExtraPct",
      label: "Wire waste",
      unit: "percent",
      blankable: true,
    },
    {
      field: "conductorCount",
      label: "Conductors",
      unit: "count",
      blankable: true,
    },
    { field: "groundCount", label: "Grounds", unit: "count", blankable: true },
  ],
};

/** The stored value as the box shows it: 0.1 → "10" for a percent. */
export function toInputText(unit: EditUnit, stored: unknown): string {
  if (stored === null || stored === undefined) return "";
  if (unit === "text") return String(stored);
  const n = Number(stored);
  if (!Number.isFinite(n)) return "";
  const shown = unit === "percent" ? n * 100 : n;
  return String(+shown.toFixed(4));
}

/**
 * The typed text as the value to send, or why it cannot be. Blank is `null`
 * ("not set") only where the field allows it — never 0.
 */
export function fromInputText(
  f: EditField,
  text: string
): { value: string | number | null } | { error: string } {
  const t = text.trim();
  if (t === "") {
    if (f.blankable) return { value: null };
    return { error: `${f.label} can't be blank.` };
  }
  if (f.unit === "text") return { value: t };
  const n = Number(t.replace(/^\$/, "").replace(/%$/, "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return { error: `"${t}" is not a number.` };
  if (n < 0) return { error: `${f.label} can't be below 0.` };
  if (f.unit === "count") {
    if (!Number.isInteger(n)) return { error: `${f.label} is a whole number.` };
    return { value: n };
  }
  if (f.unit === "percent") return { value: +(n / 100).toFixed(4) };
  return { value: n };
}

const shopsWord = (n: number) => (n === 1 ? "1 shop" : `${n} shops`);

/**
 * What the preview says a Confirm will do. A zero says so plainly rather
 * than "Pins 0 shops that don't have their own copy yet", which read as a
 * fault the first time it was looked at (2026-10-14, by eye).
 */
export function previewSentence(p: {
  reach: "offer" | "everyone" | "unchanged";
  pins: number;
  offered: number;
}): string {
  if (p.reach === "unchanged")
    return "That is already the value. Nothing to save.";
  if (p.reach === "everyone")
    return "Reaches every shop now. Changes no number.";
  const pins =
    p.pins === 0
      ? "Every shop already has its own copy, so none needs pinning"
      : `Pins ${shopsWord(p.pins)} to today's value first`;
  const offered =
    p.offered === 0
      ? "no shop is offered it (each already has this value)"
      : `offers it to ${shopsWord(p.offered)}`;
  return `${pins}; ${offered}. New shops get it straight away.`;
}
