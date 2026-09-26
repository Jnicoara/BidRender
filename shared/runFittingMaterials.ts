/**
 * WHICH CATALOG ROW a run type's couplings, connectors and straps come from.
 *
 * ── One naming rule, read by the seed AND the lookup ─────────────────────────
 * The conduit seed generates fittings as `${size} ${family} ${suffix}`, and
 * the lookup below finds them by building the same string. If the two were
 * written separately they would drift — a seed that says "rain-tight" and a
 * lookup that asks for "raintight" finds nothing, and the screen would say
 * "no catalog match" about a row that is sitting right there. So the seed
 * calls these functions too (`server/seed/materials/conduit.ts`).
 *
 * ── The lookup is by the BASELINE name, then follows the company's fork ──────
 * A run type points at a raceway material, which may be the company's fork of
 * a shipped row. Its fittings are found by the SHIPPED raceway's name, then
 * resolved to the company's fork of each fitting if there is one — the same
 * `resolveMaterial` every other stored id goes through. A custom raceway has
 * no shipped name to build from, and gets its fittings from the per-type
 * overrides instead; without one the count says "no catalog match".
 */
import {
  FITTING_KIND_LABELS,
  FITTING_KINDS,
  type FittingCount,
  type FittingKind,
} from "./runFittings";
import { needsPricing } from "./materialPricing";
import type { BendMethod, PullPointKind } from "./runBends";
import { tradeSizeAtLeast } from "./materialSizeOrder";

/**
 * EMT's three fitting styles. NULL on a run type reads as set-screw — it is
 * what "EMT coupling" means at the counter.
 *
 * Other families' styles (FMC squeeze vs screw-in, LFMC straight vs 90, PVC
 * glue vs threaded adapter) are NOT here yet — todo.md.
 */
export const EMT_FITTING_STYLES = [
  "set-screw",
  "compression",
  "raintight",
] as const;
export type EmtFittingStyle = (typeof EMT_FITTING_STYLES)[number];
export const DEFAULT_EMT_FITTING_STYLE: EmtFittingStyle = "set-screw";

export const EMT_FITTING_STYLE_LABELS: Record<EmtFittingStyle, string> = {
  "set-screw": "Set-screw",
  compression: "Compression",
  raintight: "Raintight",
};

export function isEmtFittingStyle(value: unknown): value is EmtFittingStyle {
  return (EMT_FITTING_STYLES as readonly unknown[]).includes(value);
}

/** The raceway families the catalog ships, as their name reads. */
const FAMILY_LABELS = [
  "EMT",
  "PVC Sch 40",
  "PVC Sch 80",
  "rigid conduit",
  "IMC",
  "flexible metal conduit",
  "liquidtight flexible conduit",
] as const;
export type RacewayFamilyLabel = (typeof FAMILY_LABELS)[number];

/** `1-1/4" EMT` → `{ size: '1-1/4"', family: "EMT" }`, or null. */
export function parseRacewayName(
  name: string
): { size: string; family: RacewayFamilyLabel } | null {
  const space = name.indexOf('" ');
  if (space < 0) return null;
  const size = name.slice(0, space + 1);
  const family = name.slice(space + 2);
  return (FAMILY_LABELS as readonly string[]).includes(family)
    ? { size, family: family as RacewayFamilyLabel }
    : null;
}

const FLEX_FAMILIES: readonly RacewayFamilyLabel[] = [
  "flexible metal conduit",
  "liquidtight flexible conduit",
];
const PVC_FAMILIES: readonly RacewayFamilyLabel[] = [
  "PVC Sch 40",
  "PVC Sch 80",
];

/** The raceway's size and family, from its shipped name or else its own. */
function readRaceway(
  baselineName: string | null,
  ownName: string | null
): { size: string; family: RacewayFamilyLabel } | null {
  return (
    (baselineName === null ? null : parseRacewayName(baselineName)) ??
    (ownName === null ? null : parseRacewayName(ownName))
  );
}

/**
 * Whether pipe going into an LB needs a connector at each hub. EMT does;
 * rigid and IMC thread straight in; PVC glues straight in.
 *
 * A raceway whose family cannot be read (a custom one) gets connectors
 * counted: one too many connectors is a visible line somebody deletes, one too
 * few is a part nobody knows is missing.
 */
export function lbHubsTakeConnectors(
  baselineName: string | null,
  ownName: string | null
): boolean {
  const parsed = readRaceway(baselineName, ownName);
  return parsed === null || parsed.family === "EMT";
}

/**
 * Factory elbows or field bends for this raceway, with the sentence that says
 * why. The decision (owner, 2026-09-26): factory elbows from the company's
 * size up, bent in the field below it; PVC always takes factory elbows; flex
 * turns itself. The size is compared through `TRADE_SIZE_ORDER`, never by
 * arithmetic on the text.
 */
export function bendMethodFor(
  baselineName: string | null,
  ownName: string | null,
  factoryElbowFrom: string
): BendMethod {
  const parsed = readRaceway(baselineName, ownName);
  const name = ownName ?? baselineName ?? "This raceway";
  if (parsed === null) {
    return {
      method: "unknown",
      why: `The size of ${name} cannot be read from its name, so its bends cannot be sorted into elbows or field bends`,
    };
  }
  if (FLEX_FAMILIES.includes(parsed.family)) {
    return {
      method: "none",
      why: `${name} turns corners itself — no elbows, no bending`,
    };
  }
  if (PVC_FAMILIES.includes(parsed.family)) {
    return { method: "factory", why: "PVC always takes factory elbows" };
  }
  const atLeast = tradeSizeAtLeast(parsed.size, factoryElbowFrom);
  if (atLeast === null) {
    return {
      method: "unknown",
      why: `${parsed.size} is not a trade size this app knows, so its bends cannot be sorted into elbows or field bends`,
    };
  }
  return atLeast
    ? {
        method: "factory",
        why: `factory elbows from ${factoryElbowFrom} up`,
      }
    : {
        method: "field",
        why: `${parsed.size} ${parsed.family} is bent in the field below ${factoryElbowFrom}`,
      };
}

/**
 * Which pull point to PROPOSE: an LB below the company's size, a pull box from
 * it up (owner, 2026-09-26; default 2"). Flex has no LB, so always a box. The
 * person can switch it on the drawing; this is only what is offered first.
 */
export function pullPointKindFor(
  baselineName: string | null,
  ownName: string | null,
  pullBoxFrom: string
): PullPointKind {
  const parsed = readRaceway(baselineName, ownName);
  if (parsed === null) return "pullBox";
  if (FLEX_FAMILIES.includes(parsed.family)) return "pullBox";
  return tradeSizeAtLeast(parsed.size, pullBoxFrom) === false
    ? "lb"
    : "pullBox";
}

/**
 * Trade size in inches for the pull-box rule. An explicit table, like
 * `TRADE_SIZE_ORDER`: `1-1/4"` is not something to parse into a number.
 */
const TRADE_SIZE_INCHES: Readonly<Record<string, number>> = {
  '1/2"': 0.5,
  '3/4"': 0.75,
  '1"': 1,
  '1-1/4"': 1.25,
  '1-1/2"': 1.5,
  '2"': 2,
  '2-1/2"': 2.5,
  '3"': 3,
  '3-1/2"': 3.5,
  '4"': 4,
};

/** The pull boxes the catalog ships (`boxes.ts`), smallest first. */
const PULL_BOX_SIDES = [4, 6, 8, 12, 16, 24] as const;

export function pullBoxName(side: number): string {
  return `${side}x${side} pull box`;
}

/**
 * The smallest shipped pull box for an ANGLE pull on this raceway: NEC
 * 314.28(A)(2), at least 6 × the trade size. A proposal always sits on a bend,
 * so it is always an angle pull. Other conduits entering the same box are not
 * known here, which is why the sentence says "at least".
 */
export function pullBoxFor(
  baselineName: string | null,
  ownName: string | null
): { name: string; why: string } | { name: null; why: string } {
  const parsed = readRaceway(baselineName, ownName);
  const inches = parsed ? TRADE_SIZE_INCHES[parsed.size] : undefined;
  if (!parsed || inches === undefined) {
    return {
      name: null,
      why: "The raceway's size cannot be read, so no pull box size is proposed — choose one on the run type",
    };
  }
  const needed = 6 * inches;
  const side = PULL_BOX_SIDES.find(s => s >= needed);
  if (side === undefined) {
    return {
      name: null,
      why: `An angle pull on ${parsed.size} needs at least ${needed}" — larger than any shipped pull box`,
    };
  }
  return {
    name: pullBoxName(side),
    why: `angle pull: at least 6 × ${parsed.size} = ${trimInches(needed)}" (NEC 314.28), more if other conduits enter the box`,
  };
}

function trimInches(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** `1" EMT 90-degree elbow` — the seed's names, read by the lookup too. */
export function elbowName(
  size: string,
  family: string,
  angle: 90 | 45
): string {
  return `${size} ${family} ${angle}-degree elbow`;
}

export function lbName(size: string, family: string): string {
  return `${size} ${family} LB conduit body`;
}

/**
 * The strap a family is held with. PVC 40 and 80 share an outside diameter,
 * as do rigid and IMC, so each pair shares a strap. Flex has none yet.
 */
export function strapFamily(family: RacewayFamilyLabel): string | null {
  switch (family) {
    case "EMT":
      return "EMT";
    case "PVC Sch 40":
    case "PVC Sch 80":
      return "PVC";
    case "rigid conduit":
    case "IMC":
      return "rigid";
    default:
      return null;
  }
}

/** `3/4" EMT compression coupling` and friends — the seed's names. */
export function emtStyledFittingName(
  size: string,
  style: EmtFittingStyle,
  kind: "coupling" | "connector"
): string {
  return `${size} EMT ${style} ${kind}`;
}

export function oneHoleStrapName(size: string, strapLabel: string): string {
  return `${size} ${strapLabel} one-hole strap`;
}

/**
 * The shipped catalog name for one fitting on this raceway, or null when the
 * catalog has no such row.
 *
 * `style` is ignored off EMT: every other family ships one coupling and one
 * connector per size until its styles are added.
 */
export function fittingMaterialName(
  racewayBaselineName: string,
  kind: FittingKind,
  style: string | null
): string | null {
  const parsed = parseRacewayName(racewayBaselineName);
  if (!parsed) return null;
  const { size, family } = parsed;
  const flex = FLEX_FAMILIES.includes(family);

  switch (kind) {
    case "strap": {
      const label = strapFamily(family);
      return label === null ? null : oneHoleStrapName(size, label);
    }
    case "elbow90":
      return flex ? null : elbowName(size, family, 90);
    case "elbow45":
      return flex ? null : elbowName(size, family, 45);
    case "lb":
      return flex ? null : lbName(size, family);
    case "pullBox":
      return pullBoxFor(racewayBaselineName, null).name;
    case "fieldBend":
      // Not a part: a field bend's "material" is the raceway itself, picked
      // in `pickFittingMaterial` before any name is built.
      return null;
    case "coupling":
    case "connector":
      if (family === "EMT") {
        const chosen = isEmtFittingStyle(style)
          ? style
          : DEFAULT_EMT_FITTING_STYLE;
        return emtStyledFittingName(size, chosen, kind);
      }
      return `${size} ${family} ${kind}`;
  }
}

// ── From a count and a material to a row the bid can take ───────────────────

/** Which material a fitting resolved to — or, plainly, why none. */
export type FittingMaterialPick =
  | {
      ok: true;
      materialId: number;
      name: string;
      costPerUnit: string | number;
      /** From the per-type override, rather than the catalog lookup. */
      override: boolean;
      /**
       * Set only on a FIELD BEND, whose "material" is the raceway: the hours
       * for one bend (`materials.fieldBendLaborHours`), NULL when not set. A
       * field bend is priced by these, never by the pipe's cost per foot.
       */
      fieldBendHours?: string | number | null;
    }
  | { ok: false; why: string };

/** A raceway row as the field-bend pick needs it. */
export type FieldBendRaceway = {
  id: number;
  name: string;
  fieldBendLaborHours: string | number | null;
};

/**
 * Whether this pick is priced, as the Send preview says it. A part is priced by
 * its cost; a field bend by its hours — a set 0 is an answer, only NULL is not.
 */
export function pickIsPriced(pick: FittingMaterialPick): boolean | null {
  if (!pick.ok) return null;
  if (pick.fieldBendHours !== undefined) return pick.fieldBendHours !== null;
  return !needsPricing(pick.costPerUnit);
}

/**
 * Pick the material for one fitting.
 *
 * The per-type override wins. Otherwise the catalog row for this raceway,
 * size and style — by the SHIPPED raceway's name, so a company's fork of the
 * pipe still finds its fittings. `found` is that lookup, already resolved to
 * the company's own copy where one exists.
 */
export function pickFittingMaterial(input: {
  kind: FittingKind;
  override: { id: number; name: string; costPerUnit: string | number } | null;
  racewayBaselineName: string | null;
  racewayName: string | null;
  /** The resolved raceway row — a field bend's line points at it. */
  raceway: FieldBendRaceway | null;
  style: string | null;
  found: (
    name: string
  ) => { id: number; name: string; costPerUnit: string | number } | undefined;
}): FittingMaterialPick {
  if (input.kind === "fieldBend") {
    // Labor only. The line points at the pipe so Send-again can see a changed
    // raceway, and carries NO material cost: the pipe is already bought by
    // the foot, and pricing a bend at the pipe's cost would buy it twice.
    if (!input.raceway) {
      return {
        ok: false,
        why: "This type names no raceway, so its field bends cannot be priced",
      };
    }
    return {
      ok: true,
      materialId: input.raceway.id,
      name: `${input.raceway.name} field bend`,
      costPerUnit: 0,
      override: false,
      fieldBendHours: input.raceway.fieldBendLaborHours,
    };
  }
  if (input.override) {
    return {
      ok: true,
      materialId: input.override.id,
      name: input.override.name,
      costPerUnit: input.override.costPerUnit,
      override: true,
    };
  }
  if (input.racewayName === null) {
    return {
      ok: false,
      why: "This type names no raceway, so its fittings cannot be looked up",
    };
  }
  const wanted =
    input.racewayBaselineName === null
      ? null
      : fittingMaterialName(input.racewayBaselineName, input.kind, input.style);
  if (wanted === null) {
    return {
      ok: false,
      why: `No catalog ${FITTING_KIND_LABELS[input.kind].one} for ${input.racewayName} — choose one on the run type`,
    };
  }
  const row = input.found(wanted);
  if (!row) {
    return { ok: false, why: `No catalog match for ${wanted}` };
  }
  return {
    ok: true,
    materialId: row.id,
    name: row.name,
    costPerUnit: row.costPerUnit,
    override: false,
  };
}

/** One fitting line a run type wants on the bid. */
export type FittingRow = {
  role: FittingKind;
  count: FittingCount;
  pick: FittingMaterialPick;
  /** What would go on the bid: the counted quantity, or 0. */
  qty: number;
};

export type FittingRowSendability =
  | { ok: true }
  | {
      ok: false;
      reason: "not-counted" | "none" | "no-material";
      message: string;
    };

/**
 * Whether a fitting row can become a bid line, and why not. Every refusal
 * names itself, like `runRowSendability`, so the preview can say which.
 *
 * "included" — belled PVC, a rigid stick's own coupling, a coil — is not a
 * failure, and its sentence says so. It simply has no line to send.
 */
export function fittingRowSendability(row: FittingRow): FittingRowSendability {
  if (row.count.status !== "counted") {
    return { ok: false, reason: "not-counted", message: row.count.why };
  }
  if (row.qty <= 0) {
    return { ok: false, reason: "none", message: row.count.why };
  }
  if (!row.pick.ok) {
    return { ok: false, reason: "no-material", message: row.pick.why };
  }
  return { ok: true };
}

export function fittingRows(
  counts: Record<FittingKind, FittingCount>,
  picks: Record<FittingKind, FittingMaterialPick>
): FittingRow[] {
  return FITTING_KINDS.map(kind => {
    const count = counts[kind];
    return {
      role: kind,
      count,
      pick: picks[kind],
      qty: count.status === "counted" ? count.qty : 0,
    };
  });
}
