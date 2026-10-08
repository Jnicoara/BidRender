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
import {
  OWNER_RENAMES,
  WIRE_AND_CABLE_PROPOSALS,
} from "./materialRenameProposals";

export type NameProposal = {
  /** The proposed name — equal to the current one when no rule applies. */
  proposed: string;
  /** Which rule changed it, in a few words; null when unchanged. */
  why: string | null;
  /** The open question that decides this row, if any (sheet: "Your call"). */
  openQuestion: string | null;
};

const WIRE = new Map(WIRE_AND_CABLE_PROPOSALS.map(row => [row.current, row]));
const OWNER = new Map(OWNER_RENAMES.map(row => [row.current, row.proposed]));

/**
 * Sold by the foot on Low Voltage but carrying no copper conductor: fibre
 * (Q4), and the surface raceway the cable runs IN (2026-10-07 — "Surface
 * raceway (wire mold), low voltage" is a channel, not a cable).
 */
const NOT_COPPER = /\bfiber\b|\bfibre\b|\braceway\b/i;

/** "#1/0" → "1/0": aughts are written without "#" (owner, 2026-10-07). */
const AUGHT_WITH_HASH = /#(\d\/0)(?![\d/])/g;

export function proposeMaterialName(material: {
  name: string;
  category: string | null;
  unitOfSale?: string | null;
}): NameProposal {
  const base = baseProposal(material);
  // Trade style, every row and every category (owner, 2026-10-07): 1/0,
  // 2/0, 3/0, 4/0 are written WITHOUT "#" — "1/0 THHN Copper". #14…#1 keep
  // it. The size parser reads a bare aught (checked 2026-10-07: sorts
  // #2 < #1 < 1/0 < 2/0 < 4/0 < 250 kcmil).
  const proposed = base.proposed.replace(AUGHT_WITH_HASH, "$1");
  if (proposed === base.proposed) return base;
  return {
    proposed,
    why: base.why
      ? `${base.why}; aughts without "#"`
      : 'aughts written without "#" (owner)',
    openQuestion: base.openQuestion,
  };
}

function baseProposal(material: {
  name: string;
  category: string | null;
  unitOfSale?: string | null;
}): NameProposal {
  const { name, category } = material;

  // The owner's row-by-row answers on the review sheet (2026-10-07).
  const owner = OWNER.get(name);
  if (owner) {
    return {
      proposed: owner,
      why: "owner's decision on the review sheet",
      openQuestion: null,
    };
  }

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

  // Low-voltage cable sold by the foot: "Copper" at the end (owner, Q4 Yes,
  // 2026-10-07). Never on fibre, which carries no metal.
  if (
    category === "Low Voltage" &&
    material.unitOfSale === "foot" &&
    !NOT_COPPER.test(name) &&
    !/\bCopper$/.test(name)
  ) {
    return {
      proposed: `${name} Copper`,
      why: "metal at the end (Q4: yes)",
      openQuestion: null,
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
