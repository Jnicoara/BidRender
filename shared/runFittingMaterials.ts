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
import {
  isBendRole,
  mergeWithinFeetFor,
  type BendMethod,
  type BendWords,
  type PullPointKind,
} from "./runBends";
import { tradeSizeAtLeast } from "./materialSizeOrder";
import {
  TEE_KINDS,
  isTeeRole,
  teeFittingCounts,
  type TeeRef,
} from "./runNetwork";

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

/**
 * The box and cover at a tee on small pipe — and at EVERY tee on a cable run
 * (owner, 2026-09-29, plan W4). One constant, so the two cannot come to name
 * different parts.
 */
export const SMALL_TEE_BOX = {
  box: '4" square box',
  cover: '4" square blank cover',
} as const;

/**
 * The box at a branch tee (D20, answer 3): a 4" square box and blank cover up
 * to 3/4", 4-11/16" from 1" to 1-1/4", and the pull-box rule from 1-1/2" up —
 * a tee in large pipe is an angle pull, and a pull box comes with its screw
 * cover. Box fill is not checked (the same stance as conduit fill: never).
 */
export function teeBoxFor(
  baselineName: string | null,
  ownName: string | null
):
  | { box: string; cover: string | null; why: string }
  | { box: null; cover: null; why: string } {
  const parsed = readRaceway(baselineName, ownName);
  const inches = parsed ? TRADE_SIZE_INCHES[parsed.size] : undefined;
  if (!parsed || inches === undefined) {
    return {
      box: null,
      cover: null,
      why: "The raceway's size cannot be read, so no tee box size is proposed",
    };
  }
  if (inches <= 0.75) {
    return {
      box: SMALL_TEE_BOX.box,
      cover: SMALL_TEE_BOX.cover,
      why: `a 4" square box at each tee on ${parsed.size}`,
    };
  }
  if (inches <= 1.25) {
    return {
      box: '4-11/16" square box',
      cover: '4-11/16" square blank cover',
      why: `a 4-11/16" square box at each tee on ${parsed.size}`,
    };
  }
  const pull = pullBoxFor(baselineName, ownName);
  return pull.name === null
    ? { box: null, cover: null, why: pull.why }
    : {
        box: pull.name,
        cover: null,
        why: `a pull box at each tee — ${pull.why}`,
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

/**
 * `2" PVC Sch 40 90-degree sweep, 36" radius` — a large-radius factory bend,
 * shipped for the two PVC families (references/materials-track-c-plan.md
 * § 8). Nothing in the takeoff builds this name on its own: a run type counts
 * sweeps only when its 90 or 45 is pointed at one. It lives here beside
 * `elbowName` so that the day something does build it, the seed and the
 * lookup share one spelling.
 */
export function sweepName(
  size: string,
  family: string,
  angle: 90 | 45,
  radiusInches: number
): string {
  return `${size} ${family} ${angle}-degree sweep, ${radiusInches}" radius`;
}

/** The radius `sweepName` wrote, or null for anything that is not a sweep. */
export function sweepRadiusInches(name: string | null): number | null {
  if (name === null) return null;
  const match = / sweep, (\d+(?:\.\d+)?)" radius$/.exec(name);
  return match ? Number(match[1]) : null;
}

/**
 * The bend-merge distance for a run type, from the rows its 90 and 45 are
 * pointed at (`takeoff_run_types.elbow90MaterialId` / `elbow45MaterialId`).
 * A sweep among them widens it to that sweep's reach; standard elbows, or no
 * override, leave it at the flat 3 ft. See `mergeWithinFeetFor`.
 *
 * Read off the chosen row's OWN name, so a company's fork of a shipped sweep
 * keeps its radius — unless they renamed it without one, which falls back to
 * 3 ft rather than guessing.
 */
export function bendMergeFeetForOverrides(
  elbow90Name: string | null,
  elbow45Name: string | null
): number {
  return mergeWithinFeetFor(
    [sweepRadiusInches(elbow90Name), sweepRadiusInches(elbow45Name)].filter(
      (r): r is number => r !== null
    )
  );
}

/**
 * What this type's 90s and 45s are called, from the parts it buys — see
 * `BendWords` (runBends.ts). Read with the same names, and the same sweep
 * test, as `bendMergeFeetForOverrides`, so the merge distance and the word
 * cannot disagree about whether a type buys sweeps.
 *
 *   nothing chosen        the catalog's factory elbow  → "90° elbow"
 *   a sweep chosen        → "90° sweep"
 *   an elbow chosen       → "90° elbow"
 *   anything else chosen  → "90° bend" — the part is on the row beside it;
 *                           the sentence does not guess what to call it.
 */
export function bendWordsFor(
  elbow90Name: string | null,
  elbow45Name: string | null
): BendWords {
  const wordFor = (degrees: 90 | 45, name: string | null) => {
    const noun =
      name === null || /\belbow\b/i.test(name)
        ? "elbow"
        : sweepRadiusInches(name) !== null
          ? "sweep"
          : "bend";
    return { one: `${degrees}° ${noun}`, many: `${degrees}° ${noun}s` };
  };
  return {
    elbow90: wordFor(90, elbow90Name),
    elbow45: wordFor(45, elbow45Name),
  };
}

export function lbName(size: string, family: string): string {
  return `${size} ${family} LB conduit body`;
}

/**
 * `1/2" EMT T conduit body` — the body at a branch tee. The catalog ships one
 * per rigid family and trade size, like the LB (2026-09-27). Nothing in the
 * takeoff asks for it yet: a body tee needs its own `teeBody` bid-line role,
 * which is a schema change (todo.md, "T bodies at a tee").
 */
export function tBodyName(size: string, family: string): string {
  return `${size} ${family} T conduit body`;
}

/*
  LL, LR and C bodies (2026-09-28, materials-track-c-plan.md § 7). Shipped
  per rigid family and trade size like the LB, for adding by hand or in an
  assembly. Nothing in the takeoff asks for them: a pull point is an LB or a
  pull box, and offering these there needs a new bid-line role (L5).
*/

/** `1/2" EMT LL conduit body`. */
export function llName(size: string, family: string): string {
  return `${size} ${family} LL conduit body`;
}

/** `1/2" EMT LR conduit body`. */
export function lrName(size: string, family: string): string {
  return `${size} ${family} LR conduit body`;
}

/** `1/2" EMT C conduit body` — the straight-through body. */
export function cBodyName(size: string, family: string): string {
  return `${size} ${family} C conduit body`;
}

/**
 * The strap a family is held with. PVC 40 and 80 share an outside diameter,
 * as do rigid and IMC, so each pair shares a strap. So do flexible metal and
 * liquidtight, since 2026-09-29 (retail plan § R7) — until then flex had no
 * strap and its count said "No catalog strap".
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
    // "flexible conduit", not "flex": named `1/2" flex one-hole strap` it led
    // a search for "1/2 flex", above the flex conduit itself.
    case "flexible metal conduit":
    case "liquidtight flexible conduit":
      return "flexible conduit";
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
    case "teeBox":
      return teeBoxFor(racewayBaselineName, null).box;
    case "teeCover":
      return teeBoxFor(racewayBaselineName, null).cover;
    case "fieldBend":
      // Not a part: a field bend's "material" is the raceway itself, picked
      // in `pickFittingMaterial` before any name is built.
      return null;
    case "elbowFlat":
      // Surface raceway only, and its raceway does not parse as a pipe —
      // the 700 family names its own parts (`surfaceRacewayPartName`).
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

/**
 * Whether a fitting row is worth SAYING anything about — in the Send preview,
 * and in what Send reports as "not sent". One rule for both, so the toast
 * cannot list what the preview deliberately hid.
 *
 * Couplings, connectors and straps always are, with their sentence, even with
 * nothing to send ("belled end — sticks join without couplings"): without it
 * a reader would think the part was forgotten.
 *
 * The BEND kinds are five rows that mostly do not apply — a type is either
 * factory-elbowed or field-bent, and most runs have no LB. A bend row speaks
 * when it has something to send, is already on the bid, or cannot be counted
 * (that needs saying). "PVC always takes factory elbows" reported as "not
 * sent" read as a failure (seen 2026-09-26), which is what this stops.
 */
export function fittingRowSpeaks(row: {
  role: FittingKind;
  status: FittingCount["status"];
  qty: number;
  onBid: boolean;
}): boolean {
  // A tee box speaks by the same rule as a bend: most runs have no tee, and
  // "No branch tees" listed as "not sent" would read as a failure.
  // A flat elbow is surface raceway's alone: on every pipe it is a 0 that
  // would read as a failure, so it speaks by the bend rule too.
  if (!isBendRole(row.role) && !isTeeRole(row.role) && row.role !== "elbowFlat")
    return true;
  if (row.onBid || row.status === "unknown") return true;
  return row.status === "counted" && row.qty > 0;
}

/**
 * A CABLE run's tee rows: the box and cover at each tee it owns. Its
 * connectors and straps are `cableRunRows` (MC only, since 2026-09-29); a
 * cable has no couplings or elbows to buy.
 *
 * Until 2026-09-29 a cable type got no fitting rows at all, so a branch on an
 * MC or NM run counted its footage and drops and bought no box at the split:
 * one box and cover short per tee, with nothing on screen saying so (plan
 * W4). The box is SMALL_TEE_BOX, the owner's answer (Q2); a cable has no trade
 * size to size it by. Ownership is `teeBoxOwners`, which ranks a type with no
 * raceway below every pipe — so where conduit meets cable, the conduit buys
 * the one box, sized to itself.
 */
export function cableTeeRows(
  ownedTees: readonly TeeRef[],
  found: (
    name: string
  ) => { id: number; name: string; costPerUnit: string | number } | undefined
): FittingRow[] {
  const counts = teeFittingCounts(ownedTees, false);
  return TEE_KINDS.map(kind => {
    const wanted = kind === "teeBox" ? SMALL_TEE_BOX.box : SMALL_TEE_BOX.cover;
    const row = found(wanted);
    const count = counts[kind];
    return {
      role: kind,
      count,
      pick: row
        ? {
            ok: true as const,
            materialId: row.id,
            name: row.name,
            costPerUnit: row.costPerUnit,
            override: false,
          }
        : { ok: false as const, why: `No catalog match for ${wanted}` },
      qty: count.status === "counted" ? count.qty : 0,
    };
  });
}

/**
 * The MC connector and strap for one MC cable, by its SHIPPED name — or null
 * when the cable is not MC (retail catalog plan § R1, 2026-09-29).
 *
 * Sized by the cable's outside diameter, which follows conductor size and
 * count: 14 and 12 AWG and 10-2/10-3 take a 3/8" connector and the small
 * strap; 10-4 and 8 AWG a 1/2"; 6 and 4 AWG a 3/4"; 3 and 2 AWG a 1". The
 * connector rows' descriptions say the same (seed/materials/connectors.ts).
 *
 * Read from the name, like `parseRacewayName`: the size is the leading
 * `<gauge>-<count>`, and a suffix ("12-2 MC cable, isolated ground") does not
 * change the part.
 */
export function mcFittingNames(
  cableName: string | null
): { connector: string; strap: string } | null {
  if (cableName === null) return null;
  // Dash or slash, hashed or not, any suffix: "12-2 MC cable" today,
  // "12/2 MC cable Copper" and "#3/4 MC cable Copper" after the rename.
  // Until 2026-10-07 only the dash form matched, and every MC run renamed to
  // the slash form would have lost its connectors and straps without a word
  // (naming plan § 1.3). MC-AP (aluminum armor, 2026-10-07) is MC too and
  // takes the same connector and strap.
  const match = /^#?(\d+)[-/](\d) MC(?:-AP)? cable\b/.exec(cableName);
  if (!match) return null;
  const gauge = Number(match[1]);
  const conductors = Number(match[2]);
  const small = gauge >= 12 || (gauge === 10 && conductors <= 3);
  const connector = small
    ? '3/8"'
    : gauge >= 8
      ? '1/2"'
      : gauge >= 4
        ? '3/4"'
        : '1"';
  return {
    connector: `${connector} MC connector`,
    strap: small ? "MC one-hole strap, small" : "MC one-hole strap, large",
  };
}

/**
 * A CABLE run's connector and strap rows (§ R1): the type's own choice of
 * part wins, as on a conduit type; otherwise the catalog part `mcFittingNames`
 * names. The count is `countCableFittings`.
 */
export function cableRunRows(
  counts: { connector: FittingCount; strap: FittingCount },
  parts: {
    connector: { override: FittingPart | null; wanted: string };
    strap: { override: FittingPart | null; wanted: string };
  },
  found: (name: string) => FittingPart | undefined
): FittingRow[] {
  return (["connector", "strap"] as const).map(kind => {
    const { override, wanted } = parts[kind];
    const row = override ?? found(wanted);
    const count = counts[kind];
    return {
      role: kind,
      count,
      pick: row
        ? {
            ok: true as const,
            materialId: row.id,
            name: row.name,
            costPerUnit: row.costPerUnit,
            override: override !== null,
          }
        : { ok: false as const, why: `No catalog match for ${wanted}` },
      qty: count.status === "counted" ? count.qty : 0,
    };
  });
}

/** A part as a pick needs it. */
type FittingPart = { id: number; name: string; costPerUnit: string | number };

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
