/**
 * The wage-set editor's draft (Labor rates › More options, bid-methods-plan
 * § 5). Boxes hold TEXT and only become a set when every one reads — a
 * blank wage is refused by name, never saved as $0: a $0 prevailing wage
 * underbids a public job with nothing on screen to say so.
 */
import type { WageClassification } from "@shared/prevailingWage";
import { parseTypedNumber } from "./inlineEdit";

export type WageRowDraft = {
  classification: WageClassification;
  label: string;
  laborRateId: number | null;
  baseWage: string;
  fringe: string;
};

export type WageSetDraft = {
  name: string;
  wageDeterminationNumber: string;
  dateSet: string;
  fringePaidAsCash: boolean;
  rates: WageRowDraft[];
};

export const CLASSIFICATION_LABEL: Record<WageClassification, string> = {
  journeyman: "Journeyman",
  apprentice: "Apprentice",
  trainee: "Trainee",
  other: "Other",
};

/** A new set: the three usual rows, wages blank — typed, never assumed. */
export function emptyWageSet(today: string): WageSetDraft {
  return {
    name: "",
    wageDeterminationNumber: "",
    dateSet: today,
    fringePaidAsCash: false,
    rates: (["journeyman", "apprentice", "trainee"] as const).map(c => ({
      classification: c,
      label: CLASSIFICATION_LABEL[c],
      laborRateId: null,
      baseWage: "",
      fringe: "",
    })),
  };
}

const money = (n: number | string) => String(Number(n));

/** A stored set → a draft to edit. */
export function draftFromSet(set: {
  name: string;
  wageDeterminationNumber: string | null;
  dateSet: string;
  fringePaidAsCash: boolean | null;
  rates: Array<{
    classification: WageClassification;
    label: string;
    laborRateId: number | null;
    baseWage: string | number;
    fringe: string | number;
  }>;
}): WageSetDraft {
  return {
    name: set.name,
    wageDeterminationNumber: set.wageDeterminationNumber ?? "",
    dateSet: set.dateSet,
    fringePaidAsCash: set.fringePaidAsCash === true,
    rates: set.rates.map(r => ({
      classification: r.classification,
      label: r.label,
      laborRateId: r.laborRateId,
      baseWage: money(r.baseWage),
      fringe: money(r.fringe),
    })),
  };
}

export type WageSetPayload = {
  name: string;
  wageDeterminationNumber: string | null;
  dateSet: string;
  fringePaidAsCash: boolean;
  rates: Array<{
    classification: WageClassification;
    label: string;
    laborRateId: number | null;
    baseWage: number;
    fringe: number;
  }>;
};

/** The draft as the server takes it, or the first thing that is wrong. */
export function payloadFromDraft(
  d: WageSetDraft
): { ok: true; set: WageSetPayload } | { ok: false; message: string } {
  if (d.name.trim() === "")
    return { ok: false, message: "Give the set a name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dateSet))
    return {
      ok: false,
      message: "Pick the day the wage determination was set.",
    };
  if (d.rates.length === 0)
    return { ok: false, message: "Add at least one classification." };
  const rates: WageSetPayload["rates"] = [];
  for (const r of d.rates) {
    const label = r.label.trim() || CLASSIFICATION_LABEL[r.classification];
    const baseWage = parseTypedNumber(r.baseWage);
    const fringe = parseTypedNumber(r.fringe);
    if (!Number.isFinite(baseWage) || baseWage < 0)
      return { ok: false, message: `${label}: type the base wage per hour.` };
    if (!Number.isFinite(fringe) || fringe < 0)
      return {
        ok: false,
        message: `${label}: type the fringe per hour (0 if there is none).`,
      };
    rates.push({
      classification: r.classification,
      label,
      laborRateId: r.laborRateId,
      baseWage,
      fringe,
    });
  }
  return {
    ok: true,
    set: {
      name: d.name.trim(),
      wageDeterminationNumber: d.wageDeterminationNumber.trim() || null,
      dateSet: d.dateSet,
      fringePaidAsCash: d.fringePaidAsCash,
      rates,
    },
  };
}
