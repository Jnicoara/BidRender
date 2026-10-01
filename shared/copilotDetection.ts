/**
 * Turning what the model said it saw into findings the app will show.
 *
 * Everything here is pure. The model's raw reply goes in, a validated list
 * comes out, and every rule that decides what a user is offered lives on this
 * path rather than in the router — so the interesting cases (a symbol that
 * isn't in the legend, a coordinate off the page, forty detections of the same
 * mark, a reply that is mostly nonsense) are testable without a model.
 *
 * ── Symbol meaning comes from the legend, not from the model ─────────────────
 * The model is asked WHERE a mark is and WHICH legend entry it resembles. What
 * that entry means is looked up in the user's own symbol_links table, the same
 * table the manual legend panel writes. The model never names an assembly, so
 * it cannot invent one — a label that matches nothing resolves to no assembly
 * and is offered at low confidence for the user to link, which is the existing
 * manual flow rather than a new one.
 *
 * ── Nothing here computes money or hours ────────────────────────────────────
 * A finding carries a symbol, a place and a confidence. It never carries a
 * cost, a labor hour or a total, and it must not learn to: quantities go to the
 * pricing engine as stamps, and the pricing engine does the arithmetic. An AI
 * doing its own cost reasoning is an AI that can be confidently wrong about a
 * number nobody re-derives.
 */
import {
  classifyConfidence,
  canPropose,
  TIER_ORDER,
  type ConfidenceTier,
} from "./copilotConfidence";
import { symbolLookupKey } from "./takeoffCounts";

/** One candidate mark, exactly as the model reports it. Everything optional. */
export type RawDetection = {
  /** The legend label it thinks this matches. */
  symbol?: unknown;
  /** 0–1 across the page image, left to right. */
  x?: unknown;
  /** 0–1 down the page image, top to bottom. */
  y?: unknown;
  /** The model's certainty, 0–1. */
  confidence?: unknown;
  /** False when the model is telling us it could not make the mark out. */
  legible?: unknown;
  /** Optional free text, e.g. "partially obscured by a dimension line". */
  note?: unknown;
};

/** A legend link, as the resolver needs it. */
export type LegendSymbol = {
  id: number;
  /** The estimator's name for it, which may have been changed since capture. */
  label: string;
  /**
   * The key of the name it was CAPTURED under (`symbol_links.lookupKey`).
   * Required, not optional: a renamed symbol must still be found by the name
   * the drawing and the model use, and an optional field is one a caller
   * forgets (shared/takeoffCounts.ts, `SymbolNames`).
   */
  lookupKey: string;
  assemblyId: number | null;
  assemblyName: string | null;
};

/**
 * A correction this user made before, on plans from the same source.
 *
 * `rawLabel` is what the model called it; `symbolLinkId` is what the user said
 * it really was. Applied before lookup, so the same misread on the next sheet
 * lands on the right symbol without the user saying so twice.
 */
export type CorrectionHint = {
  rawLabel: string;
  symbolLinkId: number;
  /** How many times the user has made this same correction. */
  timesApplied: number;
};

export type Finding = {
  /** Stable within one analysis, so the UI can key rows before they are saved. */
  key: string;
  /** What the model called it, kept verbatim for the correction flow. */
  rawLabel: string;
  /** The legend entry it resolved to, or null when nothing matched. */
  symbolLinkId: number | null;
  symbolLabel: string | null;
  /** The assembly that legend entry points at. Null when unlinked. */
  assemblyId: number | null;
  assemblyName: string | null;
  confidence: ConfidenceTier;
  /** 0–1, kept for ordering within a tier and for the panel's tooltip. */
  score: number;
  /** One sentence saying why it landed in that tier. */
  reason: string;
  /** PDF page points. Null only on findings that cannot be placed. */
  x: number | null;
  y: number | null;
  /**
   * The mark was read but its symbol has no assembly behind it yet — the
   * "link this one" prompt, which is the existing manual flow.
   */
  needsLink: boolean;
  /** True when a remembered correction decided which symbol this is. */
  fromCorrection: boolean;
  /** Anything the model wanted to add. Shown on unreadable findings. */
  note: string | null;
};

/** Two marks of the same symbol closer than this are one mark seen twice. */
export const MERGE_RADIUS_POINTS = 8;

/**
 * Ceiling on one sheet's findings.
 *
 * A dense floor plan genuinely carries a few hundred devices, so the cap is
 * well above realistic. It exists for the other case: a model that loses the
 * plot and emits the same detection three thousand times.
 */
export const MAX_FINDINGS = 400;

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Models sometimes hand back "0.82" rather than 0.82. A numeric string is a
  // formatting slip, not an unreadable answer; anything else is not a number.
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A normalised coordinate that actually lands on the page.
 *
 * Out of range is rejected rather than clamped. Clamping 1.6 to 1.0 puts a
 * marker on the page edge and calls it a location, which reads as a real
 * finding the user has to go and disprove; refusing it makes the finding
 * unplaceable, which is what it is.
 */
function normalisedCoord(value: unknown): number | null {
  const num = asFiniteNumber(value);
  if (num === null) return null;
  if (num < 0 || num > 1) return null;
  return num;
}

export type DetectionContext = {
  /** The user's legend links — the only source of what a symbol means. */
  symbols: LegendSymbol[];
  /** Corrections remembered for this user on plans from the same source. */
  corrections?: CorrectionHint[];
  /** The page's real size in PDF points, for converting the model's 0–1 grid. */
  pageWidthPoints: number;
  pageHeightPoints: number;
};

/**
 * Resolve one label against the legend, applying remembered corrections first.
 *
 * The correction wins over a direct match on purpose: the user has already told
 * us, on these plans, that this label is really that symbol. A direct match
 * that disagrees is the misreading they corrected.
 */
function resolveSymbol(
  rawLabel: string,
  byKey: Map<string, LegendSymbol>,
  byId: Map<number, LegendSymbol>,
  corrections: Map<string, CorrectionHint>
): { symbol: LegendSymbol | null; fromCorrection: boolean } {
  const key = symbolLookupKey(rawLabel);

  const corrected = corrections.get(key);
  if (corrected) {
    const symbol = byId.get(corrected.symbolLinkId);
    if (symbol) return { symbol, fromCorrection: true };
    // The symbol the correction pointed at has since been deleted. Fall
    // through rather than fail — a stale correction should be inert, not fatal.
  }

  return { symbol: byKey.get(key) ?? null, fromCorrection: false };
}

/**
 * Build the findings list from a raw reply.
 *
 * Anything unusable becomes an `unreadable` finding rather than being dropped
 * silently. A dropped detection is invisible; a flagged one tells the user
 * there is something at that spot the app could not read, which is the honest
 * outcome and the one that keeps a missed device from staying missed.
 *
 * Entries with nothing at all to say — no symbol name and no position — ARE
 * dropped, because a flag pointing at nowhere is noise a user cannot act on.
 */
export function buildFindings(
  raw: unknown,
  context: DetectionContext
): Finding[] {
  if (!Array.isArray(raw)) return [];

  const byKey = new Map<string, LegendSymbol>();
  const byId = new Map<number, LegendSymbol>();
  // Original names first, current names over them: the current name is what
  // the prompt hands the model, so on any overlap it is the one that wins.
  for (const symbol of context.symbols) byKey.set(symbol.lookupKey, symbol);
  for (const symbol of context.symbols) {
    byKey.set(symbolLookupKey(symbol.label), symbol);
    byId.set(symbol.id, symbol);
  }

  const corrections = new Map<string, CorrectionHint>();
  for (const hint of context.corrections ?? []) {
    const key = symbolLookupKey(hint.rawLabel);
    const existing = corrections.get(key);
    // The correction the user has made most often is the one that stands.
    if (!existing || hint.timesApplied > existing.timesApplied) {
      corrections.set(key, hint);
    }
  }

  const findings: Finding[] = [];

  for (const entry of raw.slice(0, MAX_FINDINGS * 4)) {
    if (!entry || typeof entry !== "object") continue;
    const detection = entry as RawDetection;

    const rawLabel = asText(detection.symbol);
    const nx = normalisedCoord(detection.x);
    const ny = normalisedCoord(detection.y);

    // Nothing to name and nowhere to point: not a finding, just noise.
    if (rawLabel === null && (nx === null || ny === null)) continue;

    const { symbol, fromCorrection } = rawLabel
      ? resolveSymbol(rawLabel, byKey, byId, corrections)
      : { symbol: null, fromCorrection: false };

    const linkedToAssembly = symbol?.assemblyId != null;
    const hasPosition = nx !== null && ny !== null;

    const verdict = classifyConfidence({
      score: asFiniteNumber(detection.confidence),
      // Absent means "did not say", which is treated as legible — the model
      // opts OUT by sending false. Anything that is neither is a malformed
      // answer, and a malformed answer about legibility is not a yes.
      legible:
        detection.legible === undefined || detection.legible === null
          ? true
          : detection.legible === true,
      hasPosition,
      linkedToAssembly,
    });

    findings.push({
      key: `${findings.length}:${symbolLookupKey(rawLabel ?? "unnamed")}`,
      rawLabel: rawLabel ?? "Unreadable mark",
      symbolLinkId: symbol?.id ?? null,
      symbolLabel: symbol?.label ?? null,
      // An unreadable finding proposes nothing at all — not even the assembly
      // its label happened to resolve to. This is the line the third tier
      // exists to draw, so it is drawn here rather than left to the UI.
      assemblyId: canPropose(verdict.tier)
        ? (symbol?.assemblyId ?? null)
        : null,
      assemblyName: canPropose(verdict.tier)
        ? (symbol?.assemblyName ?? null)
        : null,
      confidence: verdict.tier,
      score: verdict.score,
      reason: verdict.reason,
      x: hasPosition ? round4(nx! * context.pageWidthPoints) : null,
      y: hasPosition ? round4(ny! * context.pageHeightPoints) : null,
      needsLink: canPropose(verdict.tier) && !linkedToAssembly,
      fromCorrection,
      note: asText(detection.note),
    });
  }

  return sortForPanel(dedupe(findings)).slice(0, MAX_FINDINGS);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Collapse repeated detections of the same symbol at effectively one place.
 *
 * A vision model asked to enumerate marks on a dense sheet will report some of
 * them twice, and two stamps on one receptacle is a doubled quantity — the
 * exact failure this whole feature has to avoid. The survivor is the higher
 * confidence one, so merging never lowers what the user is shown.
 */
export function dedupe(findings: Finding[]): Finding[] {
  const kept: Finding[] = [];

  for (const finding of findings) {
    const { x, y } = finding;
    if (x === null || y === null) {
      kept.push(finding);
      continue;
    }
    const key = symbolLookupKey(finding.rawLabel);

    const duplicateIndex = kept.findIndex(other => {
      if (other.x === null || other.y === null) return false;
      if (symbolLookupKey(other.rawLabel) !== key) return false;
      return Math.hypot(other.x - x, other.y - y) <= MERGE_RADIUS_POINTS;
    });

    if (duplicateIndex === -1) {
      kept.push(finding);
      continue;
    }
    if (finding.score > kept[duplicateIndex].score) {
      kept[duplicateIndex] = finding;
    }
  }

  return kept;
}

/**
 * Panel order: confident first, then uncertain, then the manual-review flags.
 *
 * Within a tier, strongest first. The flags sit last rather than first because
 * they are not work the user can do in the panel — they are somewhere to go
 * look on the drawing, and burying the acceptable proposals under them turns a
 * time-saver into a chore list.
 */
export function sortForPanel(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const tier = TIER_ORDER[a.confidence] - TIER_ORDER[b.confidence];
    if (tier !== 0) return tier;
    if (b.score !== a.score) return b.score - a.score;
    return a.rawLabel.localeCompare(b.rawLabel);
  });
}

/**
 * Is this finding one the user could accept into the bid?
 *
 * Needs a tier that may be proposed, a place on the drawing, and an assembly
 * behind it. The middle condition is why an unplaceable finding is never
 * acceptable: a stamp with no coordinate cannot be checked against the plan,
 * and a count you cannot check is a count you should not bill.
 */
export function isAcceptable(
  finding: Pick<Finding, "confidence" | "x" | "y" | "assemblyId">
): boolean {
  return (
    canPropose(finding.confidence) &&
    finding.x !== null &&
    finding.y !== null &&
    finding.assemblyId !== null
  );
}

/** How the panel's header summarises a sheet: how many of each tier. */
export function summariseFindings(findings: Finding[]): {
  high: number;
  low: number;
  unreadable: number;
  acceptable: number;
} {
  return {
    high: findings.filter(f => f.confidence === "high").length,
    low: findings.filter(f => f.confidence === "low").length,
    unreadable: findings.filter(f => f.confidence === "unreadable").length,
    acceptable: findings.filter(isAcceptable).length,
  };
}
