/**
 * The NAME each shipped material is proposed to take — ONE function, used by
 * the owner's review sheet now (pricing/buildMaterialsReview.mts) and by the
 * rename commit later, so what the owner approves is exactly what ships
 * (references/materials-review-sheet-plan.md).
 *
 * Only rules the owner has DECIDED live here (naming plan, 2026-10-01; owner
 * Q1, 2026-10-05). A rule that depends on an open question proposes its
 * recommended answer and says which question decides it, so the sheet can
 * mark the row "Your call" instead of pre-filling it.
 *
 * It proposes; it renames nothing. The catalog changes only through
 * RENAMED_BASELINE_MATERIALS, after the sheet comes back.
 */
import { WIRE_AND_CABLE_PROPOSALS } from "./materialRenameProposals";

export type NameProposal = {
  /** The proposed name — equal to the current one when no rule applies. */
  proposed: string;
  /** Which rule changed it, in a few words; null when unchanged. */
  why: string | null;
  /** The open question that decides this row, if any (sheet: "Your call"). */
  openQuestion: string | null;
};

const WIRE = new Map(WIRE_AND_CABLE_PROPOSALS.map(row => [row.current, row]));

/** Data cable that is not copper-bearing: fibre carries no metal (Q4). */
const NOT_COPPER = /\bfiber\b|\bfibre\b/i;

export function proposeMaterialName(material: {
  name: string;
  category: string | null;
  unitOfSale?: string | null;
}): NameProposal {
  const { name, category } = material;

  // Wire and cable: the decided table, row by row (owner, 2026-10-01).
  const wire = WIRE.get(name);
  if (wire) {
    return {
      proposed: wire.proposed,
      why: "wire rule: size/type, metal spelled out at the end",
      openQuestion: wire.openQuestion ?? null,
    };
  }

  // Breakers say "1-Pole" (owner Q1, 2026-10-05) — breakers ONLY: a
  // single-pole SWITCH keeps its name, because there it is the device's name.
  if (category === "Breakers" && /Single-Pole/.test(name)) {
    return {
      proposed: name.replace(/Single-Pole/g, "1-Pole"),
      why: "breakers say 1-Pole (owner Q1)",
      openQuestion: null,
    };
  }

  // A size glued to its unit: "6ft MC whip" -> "6 ft MC whip", like its
  // neighbours "4 ft" and "8 ft" (naming plan § 1.4).
  if (/\b\d+ft\b/.test(name)) {
    return {
      proposed: name.replace(/\b(\d+)ft\b/g, "$1 ft"),
      why: "space between size and unit",
      openQuestion: null,
    };
  }

  // Low-voltage cable sold by the foot: "Copper" at the end is the
  // RECOMMENDED answer to open question 4, not yet a decision.
  if (
    category === "Low Voltage" &&
    material.unitOfSale === "foot" &&
    !NOT_COPPER.test(name) &&
    !/\bCopper$/.test(name)
  ) {
    return {
      proposed: `${name} Copper`,
      why: "metal at the end, if Q4 is yes",
      openQuestion: "Q4",
    };
  }

  return { proposed: name, why: null, openQuestion: null };
}

/**
 * A NEW row's name (one not in the catalog yet) brought to the catalog's
 * spelling: inches as `"`, never "in" — the size parser reads only the inch
 * mark (naming plan § 1.4: "Conduit spacer, 2 in" -> `Conduit spacer, 2"`).
 */
export function normaliseNewName(name: string): string {
  return name.replace(/(\d)\s+in\b/g, '$1"');
}
