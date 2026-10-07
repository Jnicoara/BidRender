/**
 * CircuitsView — the sheet's marks grouped by the circuit tag beside each
 * one (@/lib/circuitGroups): which devices are on 2B-14, what 2B's schedule
 * says about it, and which device sits closest to the panel — where that
 * circuit's homerun leaves from (references/homerun-footage-plan.md).
 *
 * Since 2026-10-07 the HOMERUN is priced: each circuit row shows the
 * server's footage for it (HomerunControls), and the panel's spot is saved
 * on the bid (`bid_panels`), no longer in this browser.
 *
 * Flags, without nagging: marks of a circuited item with no tag; tags whose
 * circuit is not on a schedule that WAS read. An item that is never tagged
 * here (data outlets) is listed once as "no circuit tags", not flagged mark
 * by mark.
 *
 * Built for a tablet: the panel docks over the right of the sheet, every
 * row is at least 44 px, and placing a panel is one tap on the drawing.
 */
import { useRef } from "react";
import { createPortal } from "react-dom";
import { CircuitBoard, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CircuitReport } from "@/lib/circuitGroups";
import type { HomerunWord } from "@/lib/homeruns";
import type { PanelSchedule } from "@/lib/panelSchedules";
import { homerunKey, homerunKeyForCircuit } from "@/lib/homerunSync";
import type { HomerunMethod } from "@shared/homerunFootage";
import {
  HomerunLine,
  HomerunSettings,
  type BidHomerunPatch,
  type HomerunsData,
} from "./HomerunControls";

/** What the worker reads for one page. */
export type SheetCircuitText = {
  /** The page's words — empty when it has no circuit tag at all. */
  words: HomerunWord[];
  panels: PanelSchedule[];
};

/** What is picked in the panel, and so lit on the sheet. */
export type CircuitPick =
  | { kind: "circuit"; key: string }
  | { kind: "untagged" }
  | null;

export function CircuitsToggle({
  count,
  on,
  onChange,
}: {
  count: number;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  if (count === 0) return null;
  return (
    <Button
      size="sm"
      variant={on ? "secondary" : "ghost"}
      className="h-7 gap-1.5 text-xs shrink-0"
      aria-pressed={on}
      title="Devices grouped by the circuit tag beside them — read-only"
      onClick={() => onChange(!on)}
    >
      <CircuitBoard className="w-3.5 h-3.5" />
      Circuits
      <span className="text-muted-foreground">{count}</span>
    </Button>
  );
}

/** The homerun half of the panel (homerun-footage-plan.md § 10 step 3). */
export type CircuitHomeruns = {
  data: HomerunsData;
  sheetMethod: string | null;
  runTypes: readonly { id: number; label: string }[];
  /** Unconfirmed on this sheet with nothing guessed (plan § 6). */
  confirmable: number[];
  onBid: (patch: BidHomerunPatch) => void;
  onSheet: (method: HomerunMethod | null) => void;
  onUpdate: (
    circuitId: number,
    patch: {
      overrideFt?: number | null;
      ceilingInches?: number | null;
      confirmed?: boolean;
    }
  ) => void;
  onConfirmAll: (ids: number[]) => void;
};

export function CircuitsPanel({
  report,
  pick,
  onPick,
  placing,
  onPlace,
  onUnplace,
  onClose,
  feetPerPoint,
  homeruns,
  heightAreas,
}: {
  homeruns: CircuitHomeruns | null;
  /** The sheet's height areas and their tool (HeightAreasSection). */
  heightAreas: React.ReactNode;
  report: CircuitReport;
  pick: CircuitPick;
  onPick: (pick: CircuitPick) => void;
  /** The panel being placed, or null. */
  placing: string | null;
  onPlace: (panel: string | null) => void;
  onUnplace: (panel: string) => void;
  onClose: () => void;
  /** Sheet scale, feet per page point; null = no scale set. */
  feetPerPoint: number | null;
}) {
  // Feet only with a scale; page points mean nothing to an estimator
  // ("584 pt right-angle", seen on a tablet), so without one: no number.
  const distance = (d: number) => `${Math.round(d * (feetPerPoint ?? 0))} ft`;
  const offSchedule = report.circuits.filter(c => c.offSchedule);
  const homerunByKey = new Map(
    (homeruns?.data.rows ?? []).map(r => [
      homerunKey(r.panelName, r.circuitNumber),
      r,
    ])
  );
  return createPortal(
    <div
      className="fixed right-3 top-28 bottom-3 z-40 w-[min(340px,calc(100vw-24px))] flex flex-col rounded-lg border border-border bg-background shadow-xl"
      role="dialog"
      aria-label="Circuits on this sheet"
    >
      <div className="shrink-0 flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Circuits on this sheet</div>
          <div className="text-xs text-muted-foreground">
            Read from the tags beside each mark. Each circuit's homerun is
            priced on the bid's homerun run type.
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11 shrink-0"
          aria-label="Close circuits"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3 text-sm">
        {placing && (
          <div
            className="rounded-md border border-[#7C3AED] bg-[#7C3AED]/10 p-2 text-xs"
            role="status"
          >
            Tap the sheet where panel {placing} is.{" "}
            <button
              type="button"
              className="underline min-h-11 px-1"
              onClick={() => onPlace(null)}
            >
              Cancel
            </button>
          </div>
        )}

        {homeruns && (
          <HomerunSettings
            data={homeruns.data}
            sheetMethod={homeruns.sheetMethod}
            runTypes={homeruns.runTypes}
            onBid={homeruns.onBid}
            onSheet={homeruns.onSheet}
            confirmable={homeruns.confirmable}
            onConfirmAll={homeruns.onConfirmAll}
          />
        )}
        {heightAreas}

        {report.panels.map(p => (
          <div key={p.name} className="rounded-md border border-border p-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium">Panel {p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.read
                    ? "Schedule read on this set"
                    : "No schedule for this panel read on this set"}
                  {" · "}
                  {p.spot === null
                    ? "not on this sheet yet"
                    : p.spot.source === "label"
                      ? `from the "PANEL ${p.name}" label`
                      : "placed on this sheet, saved with the bid"}
                </div>
              </div>
              {p.spot?.source !== "label" && (
                <Button
                  size="sm"
                  variant={p.spot ? "ghost" : "outline"}
                  className="min-h-11 gap-1 text-xs shrink-0"
                  onClick={() => onPlace(p.name)}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {p.spot ? "Move" : "Place"}
                </Button>
              )}
              {p.spot?.source === "placed" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11 text-xs shrink-0"
                  onClick={() => onUnplace(p.name)}
                >
                  Remove
                </Button>
              )}
            </div>
            {p.spot === null && (
              <div className="mt-1 text-xs text-muted-foreground">
                Place it to see which device on each circuit is closest.
              </div>
            )}
          </div>
        ))}

        {(report.untagged.length > 0 || offSchedule.length > 0) && (
          <div className="space-y-1">
            {report.untagged.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onPick(
                    pick?.kind === "untagged" ? null : { kind: "untagged" }
                  )
                }
                className={cn(
                  "w-full min-h-11 rounded-md border px-2 text-left text-xs",
                  pick?.kind === "untagged"
                    ? "border-[#F59E0B] bg-[#F59E0B]/10"
                    : "border-[#F59E0B]/60"
                )}
              >
                <span className="font-medium text-[#B45309] dark:text-[#F59E0B]">
                  {report.untagged.length} device
                  {report.untagged.length === 1 ? "" : "s"} with no circuit tag
                </span>{" "}
                — show them
              </button>
            )}
            {offSchedule.map(c => (
              <div
                key={c.key}
                className="rounded-md border border-[#F59E0B]/60 px-2 py-2 text-xs"
              >
                <span className="font-medium">{c.key}</span>: not on panel{" "}
                {c.panel}'s schedule
              </div>
            ))}
          </div>
        )}

        <ul className="space-y-1">
          {report.circuits.map(c => {
            const active = pick?.kind === "circuit" && pick.key === c.key;
            const desc =
              c.schedule.kind === "panel"
                ? c.schedule.circuits
                    .map(x => x.circuit?.description || "—")
                    .join(" / ")
                : null;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() =>
                    onPick(active ? null : { kind: "circuit", key: c.key })
                  }
                  className={cn(
                    "w-full min-h-11 rounded-md border px-2 py-1.5 text-left",
                    active
                      ? "border-[#0D9488] bg-[#0D9488]/10"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono font-medium">{c.key}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.devices.length} device
                      {c.devices.length === 1 ? "" : "s"}
                    </span>
                    {c.offSchedule && (
                      <span className="text-xs text-[#B45309] dark:text-[#F59E0B]">
                        not on schedule
                      </span>
                    )}
                  </div>
                  {desc && (
                    <div className="text-xs text-muted-foreground truncate">
                      {desc}
                    </div>
                  )}
                  {/* Said once on the panel card when it is not placed —
                      repeated on every row it was noise (seen on a tablet). */}
                  {c.closest && (
                    <div className="text-xs">
                      Closest to panel: {c.closest.device.name}
                      {feetPerPoint !== null &&
                        ` · ${distance(c.closest.distance)} at right angles`}
                    </div>
                  )}
                </button>
                {homeruns && (
                  <div className="px-2 pt-1 pb-2">
                    <HomerunLine
                      row={homerunByKey.get(homerunKeyForCircuit(c)) ?? null}
                      panel={c.panel}
                      expanded={active}
                      locked={homeruns.data.locked}
                      onUpdate={patch => {
                        const row = homerunByKey.get(homerunKeyForCircuit(c));
                        if (row) homeruns.onUpdate(row.circuitId, patch);
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {report.notCircuited.length > 0 && (
          <div className="text-xs text-muted-foreground">
            No circuit tags on:{" "}
            {report.notCircuited.map(n => `${n.name} (${n.count})`).join(", ")}{" "}
            — low voltage or not on a panel; not flagged.
          </div>
        )}
        {report.unmatchedTags.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {report.unmatchedTags.length} tag
            {report.unmatchedTags.length === 1 ? "" : "s"} with no mark beside
            {report.unmatchedTags.length === 1 ? " it" : " them"} — a device not
            counted yet, or a label set further away.
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * The sheet layer: the picked circuit's devices ringed, its closest device
 * joined to the panel by the right-angle path, the panel's spot, and — while
 * placing — the one tap that sets it. That tap stops here, so an armed tool
 * underneath never also takes it (CLAUDE.md, "a guard, not a comment").
 */
export function CircuitLayer({
  width,
  height,
  renderScale,
  report,
  pick,
  placing,
  onPlaced,
}: {
  width: number;
  height: number;
  renderScale: number;
  report: CircuitReport;
  pick: CircuitPick;
  placing: string | null;
  onPlaced: (spot: { x: number; y: number }) => void;
}) {
  const k = renderScale;
  const circuit =
    pick?.kind === "circuit"
      ? (report.circuits.find(c => c.key === pick.key) ?? null)
      : null;
  const devices =
    pick?.kind === "untagged" ? report.untagged : (circuit?.devices ?? []);
  const panelSpot = circuit
    ? (report.panels.find(p => p.name === circuit.panel)?.spot ?? null)
    : null;
  const tone = pick?.kind === "untagged" ? "#F59E0B" : "#0D9488";
  // Where the tap began; a ref, so a re-render mid-tap cannot reset it.
  const downRef = useRef({ x: 0, y: 0 });
  const down = downRef.current;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(
        "absolute inset-0 w-full h-full z-10",
        placing ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"
      )}
      style={placing ? { touchAction: "none" } : undefined}
      aria-label="Circuits"
      onPointerDown={e => {
        if (!placing) return;
        e.stopPropagation();
        down.x = e.clientX;
        down.y = e.clientY;
      }}
      onPointerUp={e => {
        if (!placing) return;
        e.stopPropagation();
        // A tap, not a drag that wandered.
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
        const r = e.currentTarget.getBoundingClientRect();
        onPlaced({
          x: (((e.clientX - r.left) / r.width) * width) / k,
          y: (((e.clientY - r.top) / r.height) * height) / k,
        });
      }}
      onClick={e => placing && e.stopPropagation()}
    >
      {report.panels.map(p =>
        p.spot ? (
          <g key={p.name}>
            {/* Sized in page points to read at a tablet's fit zoom (~20%):
                the first sizes drew 2 px rings there (seen on screen). */}
            <rect
              x={(p.spot.x - 22) * k}
              y={(p.spot.y - 14) * k}
              width={44 * k}
              height={28 * k}
              fill="#7C3AED"
              fillOpacity={0.9}
              rx={4 * k}
            />
            <text
              x={p.spot.x * k}
              y={(p.spot.y + 6) * k}
              fontSize={17 * k}
              textAnchor="middle"
              fill="#FFFFFF"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight={600}
            >
              {p.name}
            </text>
          </g>
        ) : null
      )}
      {circuit?.closest && panelSpot && (
        <polyline
          points={[
            [circuit.closest.device.x, circuit.closest.device.y],
            [panelSpot.x, circuit.closest.device.y],
            [panelSpot.x, panelSpot.y],
          ]
            .map(([x, y]) => `${x * k},${y * k}`)
            .join(" ")}
          fill="none"
          stroke="#7C3AED"
          strokeWidth={4 * k}
          strokeDasharray={`${12 * k} ${7 * k}`}
        />
      )}
      {devices.map(d => {
        const closest = circuit?.closest?.device.id === d.id;
        return (
          <circle
            key={d.id}
            cx={d.x * k}
            cy={d.y * k}
            r={(closest ? 22 : 16) * k}
            fill="none"
            stroke={closest ? "#7C3AED" : tone}
            strokeWidth={(closest ? 6 : 4) * k}
          />
        );
      })}
    </svg>
  );
}
