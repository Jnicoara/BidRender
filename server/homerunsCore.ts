/**
 * A BID'S HOMERUNS, as pure arithmetic over rows already loaded
 * (references/homerun-footage-plan.md § 10 steps 2–4).
 *
 * Same split as `runTypeFootageCore.ts`: nothing here queries anything, so the
 * suite reaches every rule, and db.ts can call it without an import cycle. The
 * loader is `loadHomerunInput` in `server/db.ts`.
 *
 * ── Where each input comes from ─────────────────────────────────────────────
 *   circuits     `bid_panel_circuits`, written by the browser — only it can
 *                read the "2B-1" tags (the server keeps a page's text, not its
 *                word positions). `homerunFromStampId` is the leaving device:
 *                the closest as last read while unconfirmed, the estimator's
 *                once confirmed (plan § 6; the wording asked of Track A in
 *                migrations-next-batch.md).
 *   panels       `bid_panels.planSheetId/planX/planY` — the panel's spot.
 *   method       sheet (the area, 0128) → bid (0127) → Measured.
 *   ceiling      homerun's own → height area → sheet → job → company.
 *   type         `bids.homerunRunTypeId`, through the fork resolver
 *                (`heights.dropTypeFor`), never read raw.
 *   routing      `bids.homerunRoutingPct`; NULL = none applied. The +15%
 *                starter is only SHOWN until somebody uses it.
 */
import { ceilingAt } from "../shared/ceilingHeights";
import {
  homerunFootage,
  homerunLineFootage,
  parseHomerunMethod,
  resolveHomerunMethod,
  type CeilingSource,
  type HomerunFootage,
  type HomerunLineFootage,
  type ResolvedHomerunMethod,
} from "../shared/homerunFootage";
import {
  resolveDeviceHeight,
  resolveMountingHeight,
  type DeviceHeightSource,
  type EndVertical,
  type MarkHeight,
} from "../shared/takeoffHeights";
import { resolveExtraPct, resolveMakeup } from "../shared/runExtras";
import type { HeightContext } from "./runVerticals";

/** The +15% routing starter (plan § 5): shown, dated, inert until used. */
export const ROUTING_STARTER_PCT = 0.15;

/**
 * Corners a homerun turns that nobody drew (owner, 2026-10-07: "starting
 * at 1, shown as unconfirmed until the user sets it"). Unlike the routing
 * starter this one IS applied — the owner chose that — and every sentence
 * that counts it says it is not confirmed.
 */
export const DEFAULT_EXTRA_BENDS = 1;
/**
 * The stepper's ceiling, and the server's. Four 90s is 360°, the most
 * NEC 358.26 allows between pull points; a homerun turning more than that
 * needs a pull box, which is its own line rather than a bigger number here.
 */
export const MAX_EXTRA_BENDS = 4;

export type HomerunBidSettings = {
  homerunMethod: string | null;
  homerunAverageFt: number | null;
  homerunMinimumFt: number | null;
  homerunRoutingPct: number | null;
  homerunRunTypeId: number | null;
  /**
   * Corners per homerun (owner, 2026-10-07). NULL = nobody set it: counted
   * as `DEFAULT_EXTRA_BENDS` and said "not confirmed". Held in
   * `bids.homerunExtraBends` (0131); accepting the 1 writes 1, so the
   * number does not move and only the "not confirmed" goes.
   */
  homerunExtraBends: number | null;
};

export type HomerunSheet = {
  id: number;
  scaleRatio: number | null;
  /** A "not to scale" sheet measures nothing unless the scale was typed. */
  measurable: boolean;
  homerunMethod: string | null;
  homerunAverageFt: number | null;
  homerunMinimumFt: number | null;
};

export type HomerunPanel = {
  id: number;
  name: string | null;
  planSheetId: number | null;
  planX: number | null;
  planY: number | null;
};

export type HomerunCircuit = {
  id: number;
  panelId: number;
  circuitNumber: number;
  poles: number | null;
  homerunOverrideFt: number | null;
  homerunFromStampId: number | null;
  homerunConfirmedAt: Date | null;
  homerunCeilingInches: number | null;
};

/** A mark, as far as a homerun leaving it needs. */
export type HomerunMark = {
  id: number;
  sheetId: number;
  x: number;
  y: number;
  height: MarkHeight;
  /** The count's height type, and its "Height for this count". */
  countKind: string | null;
  countInches: number | null;
};

export type HomerunRow = {
  circuitId: number;
  panelId: number;
  panelName: string | null;
  circuitNumber: number;
  poles: number | null;
  /** The sheet the leaving device is on; NULL with no leaving device. */
  sheetId: number | null;
  method: ResolvedHomerunMethod;
  ceiling: { inches: number | null; source: CeilingSource };
  footage: HomerunFootage;
  /** What lands on the homerun type's bid lines; NULL when nothing does. */
  line: HomerunLineFootage | null;
  /**
   * Where the leaving device's height came from; NULL with no height. A
   * type default (job, company, shipped) is said on the row as "default
   * height" (owner, 2026-10-07), so a borrowed 18" is never read as measured.
   */
  deviceHeightSource: DeviceHeightSource | null;
};

export type HomerunEntry = {
  runTypeId: number;
  /** The leaving device's sheet — the export splits by it. */
  sheetId: number;
  line: HomerunLineFootage;
  confirmed: boolean;
  /** The circuit — names the homerun's own fitting leg and its two ends. */
  circuitId: number;
  /** Where it leaves and where it arrives, page points — its two ends. */
  from: { x: number; y: number };
  to: { x: number; y: number } | null;
  /** The two verticals, for the drop BENDS (a 90 at each counted drop). */
  upDrop: EndVertical;
  downAtPanel: EndVertical;
  /** Its corners nobody drew (owner, 2026-10-07): per bid, starter 1. */
  extraCorners: { count: number; confirmed: boolean };
  /**
   * A drop at either end could not be counted (no ceiling, no height), so
   * the feet are a floor and every fitting counted on them is "at least" —
   * the rule `legFromRun` applies to a traced run's ends.
   */
  feetIsFloor: boolean;
};

export type BidHomeruns = {
  rows: HomerunRow[];
  /** What `groupRunFootage` adds onto the homerun type's lines. */
  entries: HomerunEntry[];
  /** The type's conductors, so the screen can say what a wire count is. */
  type: {
    runTypeId: number;
    pathType: "conduit" | "cable";
    conductorCount: number | null;
    groundCount: number | null;
  } | null;
  routing: { pct: number; applied: boolean };
  /** Wire or conduit waste nobody set: counted as 0, and said. */
  noExtraSet: boolean;
};

export function bidHomeruns(input: {
  bid: HomerunBidSettings;
  sheets: ReadonlyMap<number, HomerunSheet>;
  panels: readonly HomerunPanel[];
  circuits: readonly HomerunCircuit[];
  marks: ReadonlyMap<number, HomerunMark>;
  /** Circuits a TRACED run is tied to (`takeoff_run_circuits.panelCircuitId`). */
  tracedCircuitIds: ReadonlySet<number>;
  /** Heights, extras AND every ceiling layer (areas, sheets) — `ceilings`. */
  heights: HeightContext;
}): BidHomeruns {
  const { bid, heights } = input;
  const spec =
    bid.homerunRunTypeId === null
      ? null
      : heights.dropTypeFor(bid.homerunRunTypeId);
  const routingApplied = bid.homerunRoutingPct !== null;
  const routingPct = bid.homerunRoutingPct ?? 0;

  const typeExtras = spec?.extras ?? null;
  const wireExtra = resolveExtraPct(
    "wireExtraPct",
    null,
    typeExtras,
    heights.extras
  );
  const conduitExtra = resolveExtraPct(
    "conduitExtraPct",
    null,
    typeExtras,
    heights.extras
  );
  const makeup = resolveMakeup("panel", null, typeExtras, heights.extras);
  const isCable = spec?.pathType === "cable";
  const panelHeight = resolveMountingHeight("panel", heights.layers).inches;
  const panelsById = new Map(input.panels.map(p => [p.id, p]));

  const rows: HomerunRow[] = [];
  const entries: HomerunEntry[] = [];

  for (const circuit of input.circuits) {
    const panel = panelsById.get(circuit.panelId);
    if (!panel) continue;
    const mark =
      circuit.homerunFromStampId === null
        ? null
        : (input.marks.get(circuit.homerunFromStampId) ?? null);
    const sheet = mark ? (input.sheets.get(mark.sheetId) ?? null) : null;

    const method = resolveHomerunMethod({
      area: sheet
        ? {
            method: parseHomerunMethod(sheet.homerunMethod),
            averageFt: sheet.homerunAverageFt,
            minimumFt: sheet.homerunMinimumFt,
          }
        : null,
      bid: {
        method: parseHomerunMethod(bid.homerunMethod),
        averageFt: bid.homerunAverageFt,
        minimumFt: bid.homerunMinimumFt,
      },
    });

    /*
      The homerun's own ceiling, else the ONE rule every drop on the bid
      reads: the area its device sits in → its sheet → job → company
      (shared/ceilingHeights.ts, 2026-10-07). This resolved the area and
      sheet itself until then, which is how runs came to miss them.
    */
    const shared = ceilingAt(
      heights.ceilings,
      mark?.sheetId ?? null,
      mark ?? null
    );
    const ceiling: { inches: number | null; source: CeilingSource } =
      circuit.homerunCeilingInches !== null
        ? { inches: circuit.homerunCeilingInches, source: "homerun" }
        : { inches: shared.inches, source: shared.source };

    // The panel's spot counts only on the leaving device's sheet.
    const panelSpot =
      mark &&
      panel.planSheetId === mark.sheetId &&
      panel.planX !== null &&
      panel.planY !== null
        ? { x: panel.planX, y: panel.planY }
        : null;

    const deviceHeightResolved = mark
      ? resolveDeviceHeight({
          kind: mark.countKind,
          layers: heights.layers,
          runEndInches: null,
          mark: mark.height,
          countInches: mark.countInches,
        })
      : null;
    const deviceHeight = deviceHeightResolved?.inches ?? null;

    /*
      NO LEAVING DEVICE, NO HOMERUN — under every method, Average included.
      A circuit row exists because the browser read its tags off devices; a
      NULL here means that device was deleted (SET NULL), so the circuit's
      work is no longer on the drawing and must not stay priced.
    */
    const footage: HomerunFootage = !mark
      ? {
          state: "refused",
          reason: "no-devices",
          confirmed: circuit.homerunConfirmedAt !== null,
        }
      : homerunFootage({
          devices: mark
            ? [
                {
                  id: mark.id,
                  x: mark.x,
                  y: mark.y,
                  // No height type on the count: the up-drop is named "no
                  // kind", never guessed as a receptacle.
                  kind: mark.countKind,
                  heightInches: deviceHeight,
                },
              ]
            : [],
          leavingDeviceId: null,
          panelSpot,
          scaleRatio: sheet && sheet.measurable ? sheet.scaleRatio : null,
          method,
          ceiling,
          panelHeightInches: panelHeight,
          routingPct,
          wireExtraPct: wireExtra.value ?? 0,
          conduitExtraPct: isCable ? null : (conduitExtra.value ?? 0),
          makeupPanelInches: makeup.value ?? 0,
          conductorCount: spec ? spec.conductorCount : null,
          groundCount: spec ? spec.groundCount : null,
          overrideFt: circuit.homerunOverrideFt,
          confirmed: circuit.homerunConfirmedAt !== null,
          traced: input.tracedCircuitIds.has(circuit.id),
        });

    const line =
      footage.state === "computed" && spec
        ? homerunLineFootage(footage, {
            routingPct,
            wireExtraPct: wireExtra.value ?? 0,
            conduitExtraPct: isCable ? null : (conduitExtra.value ?? 0),
            conductorCount: spec.conductorCount,
            groundCount: spec.groundCount,
          })
        : null;
    if (
      line &&
      mark &&
      footage.state === "computed" &&
      bid.homerunRunTypeId !== null
    )
      entries.push({
        runTypeId: bid.homerunRunTypeId,
        sheetId: mark.sheetId,
        line,
        confirmed: footage.state === "computed" && footage.confirmed,
        circuitId: circuit.id,
        from: { x: mark.x, y: mark.y },
        to: panelSpot,
        upDrop: footage.pieces.upDrop,
        downAtPanel: footage.pieces.downAtPanel,
        extraCorners: {
          count: bid.homerunExtraBends ?? DEFAULT_EXTRA_BENDS,
          confirmed: bid.homerunExtraBends !== null,
        },
        // A typed length replaces the drops, so nothing about it is a floor.
        feetIsFloor:
          footage.state === "computed" &&
          !footage.overridden &&
          [footage.pieces.upDrop, footage.pieces.downAtPanel].some(
            v => !v.counted && v.reason !== "level"
          ),
      });

    rows.push({
      circuitId: circuit.id,
      panelId: panel.id,
      panelName: panel.name,
      circuitNumber: circuit.circuitNumber,
      poles: circuit.poles,
      sheetId: mark?.sheetId ?? null,
      method,
      ceiling,
      footage,
      line,
      deviceHeightSource:
        deviceHeight === null ? null : (deviceHeightResolved?.source ?? null),
    });
  }

  return {
    rows,
    entries,
    type:
      spec && bid.homerunRunTypeId !== null
        ? {
            runTypeId: bid.homerunRunTypeId,
            pathType: spec.pathType,
            conductorCount: spec.conductorCount,
            groundCount: spec.groundCount,
          }
        : null,
    routing: { pct: routingPct, applied: routingApplied },
    noExtraSet:
      wireExtra.value === null || (!isCable && conduitExtra.value === null),
  };
}
