/**
 * The "Build it from parts here" form's draft, and what it sends
 * (server/buildFromParts.ts says what the server does with it).
 *
 * Kept out of the component so the suite can reach the rules: a quantity of
 * zero is refused rather than sent, blank hours are NOT SET rather than 0
 * (CLAUDE.md § Editing fields 6), and a part chosen twice adds to the first.
 */
import type { AssemblyCategoryName } from "@shared/assemblyCategories";
import { money } from "./money";

export interface DraftPart {
  materialId: number;
  name: string;
  unitOfSale: string;
  costPerUnit: number;
  /** As typed. */
  qty: string;
}

export interface BuildDraft {
  name: string;
  category: AssemblyCategoryName;
  parts: DraftPart[];
  /** As typed; blank = hours not set. */
  hours: string;
  laborRateId: number | null;
  /** "Save to my library" — ON by default (owner, never-stuck-plan gap 11). */
  saveToLibrary: boolean;
}

/** A shelf every kind of thing fits, until the person picks a better one. */
export const BUILD_DEFAULT_CATEGORY: AssemblyCategoryName = "General";

/** A new draft, named from what the search was looking for. */
export function newBuildDraft(query: string): BuildDraft {
  return {
    name: query.replace(/\s+/g, " ").trim(),
    category: BUILD_DEFAULT_CATEGORY,
    parts: [],
    hours: "",
    laborRateId: null,
    saveToLibrary: true,
  };
}

/** Add a part; choosing one already in the list adds one more of it. */
export function addDraftPart(
  draft: BuildDraft,
  material: {
    id: number;
    name: string;
    unitOfSale: string;
    costPerUnit: string | number;
  }
): BuildDraft {
  const existing = draft.parts.find(part => part.materialId === material.id);
  if (existing) {
    const now = Number(existing.qty);
    return {
      ...draft,
      parts: draft.parts.map(part =>
        part === existing
          ? { ...part, qty: String(Number.isFinite(now) ? now + 1 : 1) }
          : part
      ),
    };
  }
  return {
    ...draft,
    parts: [
      ...draft.parts,
      {
        materialId: material.id,
        name: material.name,
        unitOfSale: material.unitOfSale,
        costPerUnit: Number(material.costPerUnit),
        qty: "1",
      },
    ],
  };
}

export type BuildRequest = {
  name: string;
  category: AssemblyCategoryName;
  parts: { materialId: number; qty: number }[];
  baseLaborHours: number | null;
  laborRateId: number | null;
  saveToLibrary: boolean;
};

/** What to send, or the ONE sentence saying what is still missing. */
export function buildRequest(
  draft: BuildDraft
): { ok: true; request: BuildRequest } | { ok: false; problem: string } {
  const name = draft.name.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, problem: "Give it a name." };
  if (draft.parts.length === 0)
    return { ok: false, problem: "Add at least one part." };
  const parts: { materialId: number; qty: number }[] = [];
  for (const part of draft.parts) {
    const qty = Number(part.qty.trim());
    if (part.qty.trim() === "" || !Number.isFinite(qty) || qty <= 0)
      return {
        ok: false,
        problem: `${part.name} needs a quantity above zero.`,
      };
    parts.push({ materialId: part.materialId, qty });
  }
  let baseLaborHours: number | null = null;
  if (draft.hours.trim() !== "") {
    const hours = Number(draft.hours.trim());
    if (!Number.isFinite(hours) || hours < 0)
      return { ok: false, problem: "Hours must be a number, 0 or more." };
    baseLaborHours = hours;
  }
  return {
    ok: true,
    request: {
      name,
      category: draft.category,
      parts,
      baseLaborHours,
      laborRateId: draft.laborRateId,
      saveToLibrary: draft.saveToLibrary,
    },
  };
}

/**
 * The parts' cost for ONE, as the preview shows it, and how many parts have
 * no price. An unpriced part is counted, never folded in as $0 — the bid will
 * say "not priced" for it, so the preview says so first.
 */
export function draftPartsCost(draft: BuildDraft): {
  cost: number;
  notPriced: number;
} {
  let cost = 0;
  let notPriced = 0;
  for (const part of draft.parts) {
    const qty = Number(part.qty);
    if (!(part.costPerUnit > 0)) {
      notPriced += 1;
      continue;
    }
    if (Number.isFinite(qty) && qty > 0) cost += part.costPerUnit * qty;
  }
  return { cost, notPriced };
}

/**
 * The preview's sentence, in two parts: the priced figure and the warning.
 * When NO part has a price there is no figure at all — "$0.00 each" beside
 * "2 not priced" reads as a price of nothing (CLAUDE.md § Editing fields 6,
 * "on a bid line, unpriced says Not priced, never $0").
 */
export function draftPartsSummary(draft: BuildDraft): {
  priced: string | null;
  notPriced: string | null;
} {
  if (draft.parts.length === 0) return { priced: null, notPriced: null };
  const { cost, notPriced } = draftPartsCost(draft);
  const allUnpriced = notPriced === draft.parts.length;
  return {
    priced: allUnpriced ? null : `Parts: ${money(cost)} each`,
    notPriced:
      notPriced === 0
        ? null
        : allUnpriced
          ? notPriced === 1
            ? "Parts: not priced yet"
            : `Parts: none of the ${notPriced} priced yet`
          : `+ ${notPriced} not priced`,
  };
}
