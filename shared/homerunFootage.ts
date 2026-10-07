/**
 * HOMERUN FOOTAGE — the calculator, and nothing else.
 *
 * One homerun is one circuit going back to its panel
 * (`references/homerun-footage-plan.md` § 2). This module turns a circuit's
 * devices, the panel's spot, the sheet's scale and the heights into wire and
 * conduit footage, with every piece shown: the run, the up-drop at the
 * device, the drop at the panel, routing, waste and the panel makeup.
 *
 * ── Standalone, on purpose (2026-10-06) ──────────────────────────────────────
 * Pure: no database, no React, nothing priced. Track A's columns (plan § 9)
 * are not written yet, so nothing here reads a row or reaches a bid. Every
 * input is a plain value the caller has already resolved, which is also what
 * lets the suite reach every rule (`server/homerunFootage.test.ts`).
 *
 * ── The owner's rules (plan § 11, answered 2026-10-06) ───────────────────────
 * - Routing and waste ADD: +15% routing and +10% waste is +25%, never
 *   1.15 × 1.10. Waste is on MATERIAL only — labor footage never carries it.
 * - Makeup at the PANEL END only, per wire, added after the percentages and
 *   never scaled by them. A homerun never adds box-end makeup; that stays
 *   with the device.
 * - Unconfirmed homeruns COUNT, with "+ N unconfirmed" beside the total.
 *
 * ── Nothing here guesses ─────────────────────────────────────────────────────
 * Measured with no panel spot or no scale gives NO number and names what is
 * missing; it never falls back to the average. No ceiling gives no vertical
 * (named, never zero) — the same gate `verticalAtEnd` keeps for traced runs.
 * Percentages are FRACTIONS (0.15 = 15%), as in `takeoff_run_types`.
 *
 * Footage is NOT rounded here, except the verticals, which come through
 * `verticalAtEnd` exactly as a traced run's do. Rounding to the hundredth
 * belongs to the bid line (plan § 10 step 4), where it is done once.
 */
import { pointsToRealInches, inchesToFeet } from "./takeoffGeometry";
import { verticalAtEnd, type EndVertical } from "./takeoffHeights";

type Pt = { x: number; y: number };

// ── Method ─────────────────────────────────────────────────────────────────

/** The stored values of `bids.homerunMethod` / `bid_pdf_sheets.homerunMethod` (0127, 0128). */
export const HOMERUN_METHODS = ["measured", "average", "measuredMin"] as const;
export type HomerunMethod = (typeof HOMERUN_METHODS)[number];

/** A stored value, or NULL for anything this build does not know. */
export function parseHomerunMethod(
  raw: string | null | undefined
): HomerunMethod | null {
  return (HOMERUN_METHODS as readonly string[]).includes(raw ?? "")
    ? (raw as HomerunMethod)
    : null;
}

export const HOMERUN_METHOD_LABELS: Record<HomerunMethod, string> = {
  measured: "Measured",
  average: "Average",
  measuredMin: "Measured with a minimum",
};

/** The default when neither the area nor the bid says. */
export const DEFAULT_HOMERUN_METHOD: HomerunMethod = "measured";

/** One level of the method settings. NULL = follow the level above. */
export type HomerunMethodLevel = {
  method: HomerunMethod | null;
  averageFt: number | null;
  minimumFt: number | null;
};

export type ResolvedHomerunMethod = {
  method: HomerunMethod;
  methodFrom: "area" | "bid" | "default";
  averageFt: number | null;
  minimumFt: number | null;
};

/**
 * Area → bid → Measured (plan § 3). The average and the minimum resolve the
 * same way, each on its own: an area may change the method and inherit the
 * bid's minimum.
 */
export function resolveHomerunMethod(levels: {
  area: HomerunMethodLevel | null;
  bid: HomerunMethodLevel | null;
}): ResolvedHomerunMethod {
  const pick = <K extends keyof HomerunMethodLevel>(key: K) =>
    levels.area?.[key] ?? levels.bid?.[key] ?? null;
  const methodFrom =
    levels.area?.method != null
      ? "area"
      : levels.bid?.method != null
        ? "bid"
        : "default";
  return {
    method: pick("method") ?? DEFAULT_HOMERUN_METHOD,
    methodFrom,
    averageFt: usableLength(pick("averageFt")),
    minimumFt: usableLength(pick("minimumFt")),
  };
}

// ── Ceiling ────────────────────────────────────────────────────────────────

export type CeilingSource =
  | "homerun"
  | "area"
  | "sheet"
  | "job"
  | "company"
  | "unset";

/**
 * The ceiling a homerun climbs to: this homerun's own → the height area it
 * leaves from → the sheet → the job → the company (plan § 4). Unset stays
 * unset — there is no shipped ceiling, and that absence is the gate.
 */
export function resolveHomerunCeiling(levels: {
  homerun?: number | null;
  area?: number | null;
  sheet?: number | null;
  job?: number | null;
  company?: number | null;
}): { inches: number | null; source: CeilingSource } {
  for (const source of [
    "homerun",
    "area",
    "sheet",
    "job",
    "company",
  ] as const) {
    const inches = levels[source];
    if (typeof inches === "number" && Number.isFinite(inches))
      return { inches, source };
  }
  return { inches: null, source: "unset" };
}

/** How the ceiling control names an EMPTY homerun height (plan § 6). */
export const HOMERUN_CEILING_UNSET_LABEL = "follows the sheet";

// ── Height areas inside a sheet (before beta, plan § 4) ────────────────────

export type HeightArea = {
  id: number;
  /** Outline in page points: a box is four corners. */
  outline: readonly Pt[];
  ceilingInches: number;
};

/**
 * The height area a device sits in. Two overlapping: the one with the
 * SMALLER OUTLINE wins — the more specific one, a stockroom drawn inside a
 * sales floor — never just the lower height (owner, 2026-10-06). A device
 * in no area returns null and follows the sheet.
 */
export function heightAreaAt<A extends Pick<HeightArea, "outline">>(
  point: Pt,
  areas: readonly A[]
): A | null {
  let best: A | null = null;
  let bestSize = Infinity;
  for (const area of areas) {
    if (!insidePolygon(point, area.outline)) continue;
    const size = polygonArea(area.outline);
    if (size < bestSize) {
      best = area;
      bestSize = size;
    }
  }
  return best;
}

/**
 * Pairs of areas that overlap, for the warning on the sheet — an overlap is
 * shown, not silently resolved. Two areas that only share a wall do NOT
 * overlap: a stockroom drawn beside a sales floor is the common case and
 * must not warn. Tested by edges crossing, and by a corner or the centre of
 * one lying strictly inside the other (containment, either way round).
 */
export function overlappingHeightAreas(
  areas: readonly Pick<HeightArea, "id" | "outline">[]
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < areas.length; i++)
    for (let j = i + 1; j < areas.length; j++)
      if (polygonsOverlap(areas[i].outline, areas[j].outline))
        out.push([areas[i].id, areas[j].id]);
  return out;
}

/**
 * The smallest outline worth keeping, in square page points: a 12 pt box
 * (about 4 in on paper at 1/4" — under a foot of building). A tap that
 * wandered, or two taps on one spot, is not an area anybody meant.
 */
export const MIN_AREA_POINTS2 = 144;

/**
 * An outline from the corners somebody tapped (the drawing tool, tablet
 * first: taps, not drags). TWO taps are opposite corners of a box; three or
 * more are the outline's corners in order. NULL when it would be nothing —
 * fewer than two taps, or smaller than `MIN_AREA_POINTS2`.
 */
export function outlineFromTaps(taps: readonly Pt[]): Pt[] | null {
  if (taps.length < 2) return null;
  const outline =
    taps.length === 2
      ? [
          {
            x: Math.min(taps[0].x, taps[1].x),
            y: Math.min(taps[0].y, taps[1].y),
          },
          {
            x: Math.max(taps[0].x, taps[1].x),
            y: Math.min(taps[0].y, taps[1].y),
          },
          {
            x: Math.max(taps[0].x, taps[1].x),
            y: Math.max(taps[0].y, taps[1].y),
          },
          {
            x: Math.min(taps[0].x, taps[1].x),
            y: Math.max(taps[0].y, taps[1].y),
          },
        ]
      : taps.map(t => ({ x: t.x, y: t.y }));
  return polygonArea(outline) >= MIN_AREA_POINTS2 ? outline : null;
}

/**
 * Each overlap as the sentence the sheet shows: which two, and which one
 * wins (the smaller outline). Shared walls never appear here.
 */
export function heightAreaWarnings(
  areas: readonly (Pick<HeightArea, "id" | "outline"> & { name: string })[]
): string[] {
  const byId = new Map(areas.map(a => [a.id, a]));
  return overlappingHeightAreas(areas).map(([a, b]) => {
    const one = byId.get(a)!;
    const two = byId.get(b)!;
    const [small, big] =
      polygonArea(one.outline) <= polygonArea(two.outline)
        ? [one, two]
        : [two, one];
    return `"${small.name}" and "${big.name}" overlap — "${small.name}" is smaller, so its height wins where they overlap`;
  });
}

// ── The calculator ─────────────────────────────────────────────────────────

/** A device on the circuit. Its height is already resolved (mark → count …). */
export type HomerunDevice = {
  id: number;
  x: number;
  y: number;
  /**
   * Height-type key, for the drop rule: "receptacle", "floor-box", … NULL =
   * the count never said what it is: the up-drop is "no kind", never guessed.
   */
  kind: string | null;
  /** Through `resolveDeviceHeight`. NULL = never set anywhere. */
  heightInches: number | null;
};

export type HomerunInput = {
  /** The circuit's devices on this sheet, page points. */
  devices: readonly HomerunDevice[];
  /** The estimator's pick of leaving device; null = closest at right angles. */
  leavingDeviceId: number | null;
  /** Where the panel sits on this sheet; null = not placed. */
  panelSpot: Pt | null;
  /** `bid_pdf_sheets.scaleRatio` — 48 for 1/4" = 1'-0". */
  scaleRatio: number | null;
  method: ResolvedHomerunMethod;
  /** Through `resolveHomerunCeiling`. */
  ceiling: { inches: number | null; source: CeilingSource };
  /** The `panel` height type — no shipped value, so often NULL. */
  panelHeightInches: number | null;
  /** Fractions. Routing is per job; the extras are the homerun run type's. */
  routingPct: number;
  wireExtraPct: number;
  /** NULL = the homerun type has no raceway (cable). */
  conduitExtraPct: number | null;
  /** Per wire, at the panel end only. Starter 60 (5 ft). */
  makeupPanelInches: number;
  /** Entered on the homerun run type, never inferred. NULL = not entered. */
  conductorCount: number | null;
  groundCount: number | null;
  /** A typed length replacing run + drops; the percentages still apply. */
  overrideFt: number | null;
  /** `homerunConfirmedAt` is set. */
  confirmed: boolean;
  /** A traced homerun is tied to this circuit: the trace wins (plan § 2). */
  traced: boolean;
};

/** Why a piece has no number. Named, so the screen can say which fix. */
export type HomerunRefusal =
  | "no-devices"
  | "no-panel-spot"
  | "no-scale"
  | "no-average"
  | "no-minimum";

export type HomerunPieces = {
  /** The horizontal run, feet, as the method produced it. */
  runFt: number;
  /** What the drawing measured, before any minimum. NULL under Average. */
  measuredFt: number | null;
  /** Measured with a minimum, and the minimum was used. */
  minimumApplied: boolean;
  /** Box up to the ceiling, at the leaving device. */
  upDrop: EndVertical;
  /** Ceiling down to the panel. */
  downAtPanel: EndVertical;
  /** Run + both drops — or the override, which replaces all three. */
  installedFt: number;
  /** installed × routing. On labor AND material. */
  routingFt: number;
  /** installed × wire extra. Material only. */
  wireWasteFt: number;
  /** installed × conduit extra. Material only; 0 on cable. */
  conduitWasteFt: number;
  /** Per wire, at the panel, unscaled. */
  makeupFt: number;
};

export type HomerunFootage =
  /** A traced run is this circuit's homerun; nothing is computed. */
  | { state: "traced" }
  /** No horizontal number could be made. */
  | {
      state: "refused";
      reason: HomerunRefusal;
      confirmed: boolean;
    }
  | {
      state: "computed";
      method: HomerunMethod;
      leavingDevice: HomerunDevice | null;
      pieces: HomerunPieces;
      /** installed × (1 + routing). No waste, no makeup. */
      laborFt: number;
      /** Per conductor: installed × (1 + routing + wire extra) + makeup. */
      wirePerConductorFt: number;
      /** × (conductors + grounds). NULL until the count is entered. */
      wires: number | null;
      wireFt: number | null;
      /** installed × (1 + routing + conduit extra). NULL on cable. */
      conduitFt: number | null;
      /** Starts false; a typed length, a picked device or a homerun ceiling confirms. */
      confirmed: boolean;
      overridden: boolean;
    };

/** Right-angle distance, page points: homeruns run with the building grid. */
export function rightAngleDistance(a: Pt, b: Pt): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** The device a homerun leaves from: the picked one, else the closest. */
export function leavingDevice(
  devices: readonly HomerunDevice[],
  panelSpot: Pt | null,
  pickedId: number | null
): HomerunDevice | null {
  if (pickedId !== null) {
    const picked = devices.find(d => d.id === pickedId);
    if (picked) return picked;
  }
  if (!panelSpot) return null;
  let best: HomerunDevice | null = null;
  let bestDistance = Infinity;
  for (const d of devices) {
    const distance = rightAngleDistance(d, panelSpot);
    if (distance < bestDistance) {
      best = d;
      bestDistance = distance;
    }
  }
  return best;
}

export function homerunFootage(input: HomerunInput): HomerunFootage {
  if (input.traced) return { state: "traced" };

  const overridden = usableLength(input.overrideFt) !== null;
  const confirmed =
    input.confirmed ||
    overridden ||
    input.leavingDeviceId !== null ||
    input.ceiling.source === "homerun";

  const { method } = input.method;
  const leaving = leavingDevice(
    input.devices,
    input.panelSpot,
    input.leavingDeviceId
  );

  // ── The horizontal run ──
  let runFt = 0;
  let measuredFt: number | null = null;
  let minimumApplied = false;
  if (!overridden) {
    if (method === "average") {
      if (input.method.averageFt === null)
        return { state: "refused", reason: "no-average", confirmed };
      runFt = input.method.averageFt;
    } else {
      if (input.devices.length === 0)
        return { state: "refused", reason: "no-devices", confirmed };
      if (!input.panelSpot || !leaving)
        return { state: "refused", reason: "no-panel-spot", confirmed };
      const inches = pointsToRealInches(
        rightAngleDistance(leaving, input.panelSpot),
        input.scaleRatio
      );
      if (inches === null)
        return { state: "refused", reason: "no-scale", confirmed };
      measuredFt = inchesToFeet(inches);
      runFt = measuredFt;
      if (method === "measuredMin") {
        if (input.method.minimumFt === null)
          return { state: "refused", reason: "no-minimum", confirmed };
        if (measuredFt < input.method.minimumFt) {
          runFt = input.method.minimumFt;
          minimumApplied = true;
        }
      }
    }
  }

  // ── The two verticals, by the drop rule every traced run uses ──
  /*
    Average needs nothing on the drawing, so it may have no leaving device.
    Its up-drop then uses the circuit's first device (they share a height
    type on nearly every circuit); with no devices at all it is not counted.
  */
  const deviceEnd = leaving ?? input.devices[0] ?? null;
  const upDrop: EndVertical = deviceEnd
    ? verticalAtEnd({
        kind: deviceEnd.kind,
        endInches: deviceEnd.heightInches,
        distributionInches: input.ceiling.inches,
      })
    : { counted: false, kind: null, reason: "no-kind" };
  const downAtPanel = verticalAtEnd({
    kind: "panel",
    endInches: input.panelHeightInches,
    distributionInches: input.ceiling.inches,
  });
  const verticalFt =
    (upDrop.counted ? upDrop.feet : 0) +
    (downAtPanel.counted ? downAtPanel.feet : 0);

  const installedFt = overridden ? input.overrideFt! : runFt + verticalFt;

  // ── Percentages ADD (owner Q1); waste is material only ──
  const routingFt = installedFt * input.routingPct;
  const wireWasteFt = installedFt * input.wireExtraPct;
  const conduitWasteFt =
    input.conduitExtraPct === null ? 0 : installedFt * input.conduitExtraPct;
  // ── Makeup at the panel end only, per wire, unscaled (owner Q2) ──
  const makeupFt = inchesToFeet(input.makeupPanelInches);

  const laborFt = installedFt * (1 + input.routingPct);
  const wirePerConductorFt =
    installedFt * (1 + input.routingPct + input.wireExtraPct) + makeupFt;
  const wires =
    input.conductorCount === null
      ? null
      : input.conductorCount + (input.groundCount ?? 0);
  const conduitFt =
    input.conduitExtraPct === null
      ? null
      : installedFt * (1 + input.routingPct + input.conduitExtraPct);

  return {
    state: "computed",
    method,
    leavingDevice: leaving,
    pieces: {
      runFt: overridden ? 0 : runFt,
      measuredFt,
      minimumApplied,
      upDrop,
      downAtPanel,
      installedFt,
      routingFt,
      wireWasteFt,
      conduitWasteFt,
      makeupFt,
    },
    laborFt,
    wirePerConductorFt,
    wires,
    wireFt: wires === null ? null : wirePerConductorFt * wires,
    conduitFt,
    confirmed,
    overridden,
  };
}

// ── Totals ─────────────────────────────────────────────────────────────────

export type HomerunTotals = {
  laborFt: number;
  wireFt: number;
  conduitFt: number;
  /** Counted in the totals above — shown as "+ N unconfirmed" (owner Q3). */
  unconfirmed: number;
  /** No number at all (refused, or no conductor count for wire). */
  notCounted: number;
  traced: number;
};

/**
 * Every homerun on a bid, added up. Unconfirmed ones COUNT and are tallied
 * beside the total, so nothing is silently left out and nothing silently
 * trusted — the "N not priced" pattern (`shared/lineNotPriced.ts`).
 */
export function homerunTotals(
  homeruns: readonly HomerunFootage[]
): HomerunTotals {
  const totals: HomerunTotals = {
    laborFt: 0,
    wireFt: 0,
    conduitFt: 0,
    unconfirmed: 0,
    notCounted: 0,
    traced: 0,
  };
  for (const h of homeruns) {
    if (h.state === "traced") {
      totals.traced++;
      continue;
    }
    /*
      "+ N unconfirmed" counts homeruns IN the total that nobody confirmed.
      A refused one is not in the total, so it is not "unconfirmed" — it is
      "no number yet". Counting it as both read "0 homeruns + 38
      unconfirmed" on UNCC E111 (seen on screen, 2026-10-07).
    */
    if (h.state === "refused") {
      totals.notCounted++;
      continue;
    }
    if (!h.confirmed) totals.unconfirmed++;
    totals.laborFt += h.laborFt;
    totals.conduitFt += h.conduitFt ?? 0;
    if (h.wireFt === null) totals.notCounted++;
    else totals.wireFt += h.wireFt;
  }
  return totals;
}

/**
 * ONE homerun as a run-type line reads it: installed and bought feet per
 * role, the same split every traced run and count drop lands in
 * (`server/runTypeFootageCore.ts`).
 *
 * ── Installed = what is put in; bought = installed + waste ────────────────
 * The owner's Q5 (2026-09-28) for every footage line: material is BOUGHT
 * footage, labour is INSTALLED footage, and makeup is installed work. So:
 *
 *   routed     = (L + V) × (1 + routing)    — routing is real route, so
 *                                             it is installed, on labour too
 *   conduit    installed routed, bought routed + (L + V) × conduit extra
 *   wire/wire  installed routed + makeup,  bought + (L + V) × wire extra
 *   cable      the cable is the wire: one tail of makeup, wire extra (Q3)
 *
 * Plan § 5 wrote labour as (L + V) × (1 + R) with no makeup. That is the
 * conduit's labour; for WIRE it would have been the only footage line on a
 * bid whose labour left the makeup out, so wire follows Q5 instead —
 * recorded in homerun-footage-plan.md § 10.
 */
export type HomerunLineFootage = {
  pathType: "conduit" | "cable";
  /** L + V, before anything is added — what "Homeruns" shows apart. */
  homerunFeet: number;
  conduitInstalledFeet: number;
  conduitBoughtFeet: number;
  cableInstalledFeet: number;
  cableBoughtFeet: number;
  /** Every wire, ground included — as `DropFootage` counts it. */
  wireInstalledFeet: number;
  wireBoughtFeet: number;
  groundInstalledFeet: number;
  groundBoughtFeet: number;
  routingFeet: number;
  conduitExtraFeet: number;
  wireExtraFeet: number;
  makeupFeet: number;
  /** A conduit homerun whose type has no conductor count: no wire on it. */
  wireNotCounted: boolean;
};

export function homerunLineFootage(
  h: Extract<HomerunFootage, { state: "computed" }>,
  input: Pick<
    HomerunInput,
    | "routingPct"
    | "wireExtraPct"
    | "conduitExtraPct"
    | "conductorCount"
    | "groundCount"
  >
): HomerunLineFootage {
  const base = h.pieces.installedFt;
  const routed = base * (1 + input.routingPct);
  const makeup = h.pieces.makeupFt;
  const wireWaste = base * input.wireExtraPct;
  if (input.conduitExtraPct === null) {
    return {
      pathType: "cable",
      homerunFeet: base,
      conduitInstalledFeet: 0,
      conduitBoughtFeet: 0,
      cableInstalledFeet: routed + makeup,
      cableBoughtFeet: routed + makeup + wireWaste,
      wireInstalledFeet: 0,
      wireBoughtFeet: 0,
      groundInstalledFeet: 0,
      groundBoughtFeet: 0,
      routingFeet: routed - base,
      conduitExtraFeet: 0,
      wireExtraFeet: wireWaste,
      makeupFeet: makeup,
      wireNotCounted: false,
    };
  }
  const grounds = input.groundCount ?? 0;
  const wires =
    input.conductorCount === null ? 0 : input.conductorCount + grounds;
  const groundWires = input.conductorCount === null ? 0 : grounds;
  return {
    pathType: "conduit",
    homerunFeet: base,
    conduitInstalledFeet: routed,
    conduitBoughtFeet: routed + base * input.conduitExtraPct,
    cableInstalledFeet: 0,
    cableBoughtFeet: 0,
    wireInstalledFeet: wires * (routed + makeup),
    wireBoughtFeet: wires * (routed + makeup + wireWaste),
    groundInstalledFeet: groundWires * (routed + makeup),
    groundBoughtFeet: groundWires * (routed + makeup + wireWaste),
    routingFeet: routed - base,
    conduitExtraFeet: base * input.conduitExtraPct,
    wireExtraFeet: wires * wireWaste,
    makeupFeet: wires * makeup,
    wireNotCounted: input.conductorCount === null,
  };
}

/** "+ 3 unconfirmed", or nothing when all are confirmed. */
export function unconfirmedNote(totals: HomerunTotals): string | null {
  return totals.unconfirmed > 0 ? `+ ${totals.unconfirmed} unconfirmed` : null;
}

// ── Geometry helpers ───────────────────────────────────────────────────────

/** A length the arithmetic can use: finite and not negative. */
function usableLength(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function polygonArea(points: readonly Pt[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/**
 * Even-odd ray cast. On the edge counts as inside, unless `strict` — a
 * device on a wall belongs to the area; two areas sharing a wall do not
 * overlap.
 */
function insidePolygon(p: Pt, poly: readonly Pt[], strict = false): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (onSegment(p, a, b)) return !strict;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-9) return false;
  return (
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function polygonsOverlap(p: readonly Pt[], q: readonly Pt[]): boolean {
  for (let i = 0; i < p.length; i++)
    for (let j = 0; j < q.length; j++)
      if (
        segmentsCross(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length])
      )
        return true;
  const centre = (poly: readonly Pt[]): Pt => ({
    x: poly.reduce((sum, v) => sum + v.x, 0) / poly.length,
    y: poly.reduce((sum, v) => sum + v.y, 0) / poly.length,
  });
  return (
    [...p, centre(p)].some(v => insidePolygon(v, q, true)) ||
    [...q, centre(q)].some(v => insidePolygon(v, p, true))
  );
}
