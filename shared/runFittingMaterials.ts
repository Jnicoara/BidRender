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
import type { FittingKind } from "./runFittings";

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

  if (kind === "strap") {
    const label = strapFamily(family);
    return label === null ? null : oneHoleStrapName(size, label);
  }
  if (family === "EMT") {
    const chosen = isEmtFittingStyle(style) ? style : DEFAULT_EMT_FITTING_STYLE;
    return emtStyledFittingName(size, chosen, kind);
  }
  return `${size} ${family} ${kind}`;
}
