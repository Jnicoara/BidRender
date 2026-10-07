/**
 * What a homerun row SAYS (references/homerun-footage-plan.md § 6–7). Kept
 * here, not in the component, so the wording that matters — a refusal that
 * names its fix, a piece list that adds up — has a test.
 */
import {
  HOMERUN_METHOD_LABELS,
  type HomerunFootage,
  type HomerunRefusal,
  type ResolvedHomerunMethod,
} from "@shared/homerunFootage";
import type { EndVertical } from "@shared/takeoffHeights";

/** Feet to one decimal, the way a homerun row shows them. */
export function ft(value: number): string {
  return `${(Math.round(value * 10) / 10).toLocaleString("en-US")} ft`;
}

/** Why there is no number, as the fix: never a blank, never a 0. */
export function refusalText(reason: HomerunRefusal, panel: string): string {
  switch (reason) {
    case "no-panel-spot":
      return `Place panel ${panel} on this sheet to measure it`;
    case "no-scale":
      return "Set this sheet's scale to measure it";
    case "no-average":
      return "Enter the average length to use";
    case "no-minimum":
      return "Enter the minimum length to use";
    case "no-devices":
      return "No device on this circuit any more";
  }
}

function dropText(v: EndVertical, what: string): string | null {
  if (v.counted) return `${ft(v.feet)} ${what}`;
  if (v.reason === "level") return null;
  return `${what} not counted`;
}

/**
 * "52.5 ft — 40 ft run + 8.5 ft up + 4 ft down at the panel". The pieces
 * BEFORE routing, waste and makeup: what was measured or typed, which is
 * what an estimator checks against the drawing.
 */
export function homerunBreakdown(
  footage: Extract<HomerunFootage, { state: "computed" }>
): string {
  const p = footage.pieces;
  if (footage.overridden) return `${ft(p.installedFt)} — typed`;
  const run = p.minimumApplied
    ? `${ft(p.runFt)} minimum (measured ${ft(p.measuredFt ?? 0)})`
    : footage.method === "average"
      ? `${ft(p.runFt)} average`
      : `${ft(p.runFt)} run`;
  const parts = [
    run,
    dropText(p.upDrop, "up"),
    dropText(p.downAtPanel, "down at the panel"),
  ].filter((x): x is string => x !== null);
  return `${ft(p.installedFt)} — ${parts.join(" + ")}`;
}

/** "Measured" / "Average 30 ft, this sheet" — the method, and where from. */
export function methodText(m: ResolvedHomerunMethod): string {
  const label = HOMERUN_METHOD_LABELS[m.method];
  const amount =
    m.method === "average" && m.averageFt !== null
      ? ` ${ft(m.averageFt)}`
      : m.method === "measuredMin" && m.minimumFt !== null
        ? ` ${ft(m.minimumFt)}`
        : "";
  return `${label}${amount}${m.methodFrom === "area" ? ", this sheet" : ""}`;
}

/**
 * The bid's one summary line (plan § 7): "Homeruns: Measured, +15%
 * routing · 12 homeruns + 3 unconfirmed".
 */
export function homerunSummaryLine(input: {
  method: ResolvedHomerunMethod;
  routing: { pct: number; applied: boolean };
  counted: number;
  unconfirmed: number;
  sheetsDiffering: number;
}): string {
  const routing = input.routing.applied
    ? `+${Math.round(input.routing.pct * 1000) / 10}% routing`
    : "no routing added";
  const differ =
    input.sheetsDiffering > 0
      ? ` (${input.sheetsDiffering} sheet${input.sheetsDiffering === 1 ? "" : "s"} on their own method)`
      : "";
  const unconfirmed =
    input.unconfirmed > 0 ? ` + ${input.unconfirmed} unconfirmed` : "";
  return `Homeruns: ${methodText(input.method)}, ${routing}${differ} · ${input.counted} homerun${input.counted === 1 ? "" : "s"}${unconfirmed}`;
}
