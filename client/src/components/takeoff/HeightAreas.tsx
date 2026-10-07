/**
 * HEIGHT AREAS — an outline on a sheet with its own ceiling (0130;
 * references/homerun-footage-plan.md § 4, owner 2026-10-06: "mixed ceilings
 * on one sheet are common on my retail jobs"). A homerun leaving a device
 * inside one climbs to that height.
 *
 * Built for a tablet, so drawing is TAPS, never a drag (a drag pans the
 * sheet): tap the corners, then Finish. Two taps are opposite corners of a
 * box; three or more are the outline (`outlineFromTaps`). The new area is
 * saved at once, named "Area N" and with no height — "follows the sheet" —
 * and both are edited on its row, so drawing is one gesture and not a form.
 *
 * Where two overlap, the SMALLER outline wins, and the sheet says so in
 * amber, naming both. A shared wall is not an overlap and says nothing.
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpToLine, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeightFields } from "@/components/HeightFields";
import { cn } from "@/lib/utils";
import { formatElevation } from "@shared/takeoffHeights";
import { overlappingHeightAreas } from "@shared/homerunFootage";
import { selectOnFocus } from "@/lib/selectOnFocus";

type Pt = { x: number; y: number };

export type HeightAreaView = {
  id: number;
  sheetId: number;
  name: string;
  heightInches: number | null;
  outline: Pt[];
};

const AREA = "#0284C7";
const WARN = "#F59E0B";

/** The toolbar button: on every scaled sheet (owner, 2026-10-07). */
export function CeilingsToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Button
      size="sm"
      variant={on ? "secondary" : "ghost"}
      className="h-7 gap-1.5 text-xs shrink-0"
      aria-pressed={on}
      title="This sheet's ceiling, and height areas inside it"
      onClick={() => onChange(!on)}
    >
      <ArrowUpToLine className="w-3.5 h-3.5" />
      Ceilings
    </Button>
  );
}

/**
 * CEILINGS ON THIS SHEET — the sheet's own ceiling and its height areas.
 * Every drop on the sheet reads them: regular runs at each end's box, count
 * drops at each mark, homeruns at their device (shared/ceilingHeights.ts).
 * Its own panel since 2026-10-07 — it lived on the Circuits panel, which
 * exists only where a sheet has circuit tags.
 */
export function CeilingsPanel({
  sheetCeiling,
  aboveLabel,
  locked,
  onSheetCeiling,
  onClose,
  children,
}: {
  sheetCeiling: number | null;
  /** What an empty sheet ceiling follows: "the job, 10'-0"". */
  aboveLabel: string;
  locked: boolean;
  onSheetCeiling: (inches: number | null) => void;
  onClose: () => void;
  /** The height-areas section. */
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      className="fixed right-3 top-28 bottom-3 z-40 w-[min(340px,calc(100vw-24px))] flex flex-col rounded-lg border border-border bg-background shadow-xl"
      role="dialog"
      aria-label="Ceilings on this sheet"
    >
      <div className="shrink-0 flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Ceilings on this sheet</div>
          <div className="text-xs text-muted-foreground">
            Every drop on this sheet climbs to the ceiling of the area its box
            sits in, else this sheet's.
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11 shrink-0"
          aria-label="Close ceilings"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3 text-sm">
        <div className="rounded-md border border-border p-2 space-y-1.5 text-xs">
          <div className="font-medium text-sm">This sheet's ceiling</div>
          {locked ? (
            <div className="text-muted-foreground">
              {sheetCeiling === null
                ? `Follows ${aboveLabel}`
                : formatElevation(sheetCeiling)}
            </div>
          ) : (
            <HeightFields
              value={sheetCeiling}
              belowFloor={false}
              ariaPrefix="This sheet's ceiling"
              compact
              setLabel="Set this sheet's"
              clearLabel="Clear"
              unsetLabel={`follows ${aboveLabel}`}
              onSave={inches => onSheetCeiling(inches)}
              onClear={() => onSheetCeiling(null)}
            />
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** The section on the Ceilings panel: this sheet's areas, and the tool. */
export function HeightAreasSection({
  areas,
  warnings,
  drawing,
  taps,
  locked,
  sheetHeightLabel,
  onStartDraw,
  onUndoTap,
  onFinish,
  onCancel,
  onRename,
  onHeight,
  onRemove,
  finishError,
}: {
  /** This sheet's areas only. */
  areas: HeightAreaView[];
  warnings: string[];
  drawing: boolean;
  taps: Pt[];
  locked: boolean;
  /** What an area with no height follows, in words: "the sheet, 10'-0"". */
  sheetHeightLabel: string;
  onStartDraw: () => void;
  onUndoTap: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onRename: (id: number, name: string) => void;
  onHeight: (id: number, inches: number | null) => void;
  onRemove: (id: number) => void;
  /** Why the last Finish made nothing, or null. */
  finishError: string | null;
}) {
  return (
    <div className="rounded-md border border-border p-2 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">Height areas</div>
          <div className="text-muted-foreground">
            A ceiling for part of this sheet. A homerun leaving a device inside
            one climbs to its height.
          </div>
        </div>
        {!drawing && !locked && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 gap-1 text-xs shrink-0"
            onClick={onStartDraw}
          >
            <Square className="w-3.5 h-3.5" /> Draw
          </Button>
        )}
      </div>

      {drawing && (
        <div
          className="rounded-md border p-2 space-y-2"
          style={{ borderColor: AREA, background: `${AREA}14` }}
          role="status"
        >
          <div>
            Tap the corners on the sheet — two taps make a box.{" "}
            {taps.length > 0 && `${taps.length} tapped.`}
          </div>
          {finishError && (
            <div className="text-[#B45309] dark:text-[#F59E0B]">
              {finishError}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="min-h-11 flex-1 text-xs"
              disabled={taps.length < 2}
              onClick={onFinish}
            >
              Finish
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 text-xs"
              disabled={taps.length === 0}
              onClick={onUndoTap}
            >
              Undo tap
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 text-xs"
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {warnings.map(w => (
        <div
          key={w}
          className="rounded border px-2 py-1.5 text-[#B45309] dark:text-[#F59E0B]"
          style={{ borderColor: `${WARN}99` }}
        >
          {w}
        </div>
      ))}

      {areas.length === 0 && !drawing && (
        <div className="text-muted-foreground">
          None on this sheet — every homerun follows {sheetHeightLabel}.
        </div>
      )}
      {areas.map(a => (
        <AreaRow
          key={a.id}
          area={a}
          locked={locked}
          sheetHeightLabel={sheetHeightLabel}
          onRename={name => onRename(a.id, name)}
          onHeight={inches => onHeight(a.id, inches)}
          onRemove={() => onRemove(a.id)}
        />
      ))}
    </div>
  );
}

function AreaRow({
  area,
  locked,
  sheetHeightLabel,
  onRename,
  onHeight,
  onRemove,
}: {
  area: HeightAreaView;
  locked: boolean;
  sheetHeightLabel: string;
  onRename: (name: string) => void;
  onHeight: (inches: number | null) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(area.name);
  const commit = () => {
    const name = draft.trim();
    if (!name) setDraft(area.name);
    else if (name !== area.name) onRename(name);
  };
  return (
    <div className="rounded border border-border p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-sm shrink-0"
          style={{ background: AREA }}
          aria-hidden
        />
        <Input
          value={draft}
          disabled={locked}
          aria-label="Area name"
          className="h-11 text-xs flex-1 min-w-0"
          onFocus={selectOnFocus}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setDraft(area.name);
          }}
        />
        {!locked && (
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 shrink-0"
            aria-label={`Remove ${area.name}`}
            onClick={onRemove}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
      <HeightFields
        value={area.heightInches}
        belowFloor={false}
        ariaPrefix={`${area.name} ceiling`}
        compact
        setLabel="Set its ceiling"
        clearLabel="Clear"
        // Empty is not "not set": the area follows the sheet, and says so.
        unsetLabel={`no height yet — follows ${sheetHeightLabel}`}
        onSave={inches => onHeight(inches)}
        onClear={() => onHeight(null)}
      />
    </div>
  );
}

/**
 * The areas on the sheet, and — while drawing — the taps that make one. A
 * tap stops here, so a tool armed underneath never also takes it; a drag
 * that wanders is not a tap, so the sheet still pans.
 */
export function HeightAreasLayer({
  width,
  height,
  renderScale,
  areas,
  drawing,
  taps,
  onTap,
}: {
  width: number;
  height: number;
  renderScale: number;
  areas: HeightAreaView[];
  drawing: boolean;
  taps: Pt[];
  onTap: (at: Pt) => void;
}) {
  const k = renderScale;
  const downRef = useRef({ x: 0, y: 0 });
  const down = downRef.current;
  const overlapping = new Set(overlappingHeightAreas(areas).flat());
  const path = (pts: readonly Pt[]) =>
    pts.map(p => `${p.x * k},${p.y * k}`).join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(
        "absolute inset-0 w-full h-full z-10",
        drawing ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"
      )}
      style={drawing ? { touchAction: "none" } : undefined}
      aria-label="Height areas"
      onPointerDown={e => {
        if (!drawing) return;
        e.stopPropagation();
        down.x = e.clientX;
        down.y = e.clientY;
      }}
      onPointerUp={e => {
        if (!drawing) return;
        e.stopPropagation();
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
        const r = e.currentTarget.getBoundingClientRect();
        onTap({
          x: (((e.clientX - r.left) / r.width) * width) / k,
          y: (((e.clientY - r.top) / r.height) * height) / k,
        });
      }}
      onClick={e => drawing && e.stopPropagation()}
    >
      {areas.map(a => {
        const warn = overlapping.has(a.id);
        const tone = warn ? WARN : AREA;
        const top = a.outline.reduce(
          (best, p) =>
            p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best,
          a.outline[0]
        );
        return (
          <g key={a.id}>
            <polygon
              points={path(a.outline)}
              fill={tone}
              fillOpacity={0.07}
              stroke={tone}
              strokeWidth={4 * k}
              strokeDasharray={warn ? `${14 * k} ${8 * k}` : undefined}
            />
            {/* Sized in page points so it reads at a tablet's fit zoom. */}
            <text
              x={(top.x + 8) * k}
              // 30 pt: 18 read as a smudge at a tablet's fit zoom (seen on
              // screen, 2026-10-07); the outline's colour carries the rest.
              y={(top.y + 36) * k}
              fontSize={30 * k}
              fill={tone}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight={600}
            >
              {a.name}
              {a.heightInches === null
                ? " · no height"
                : ` · ${formatElevation(a.heightInches)}`}
              {warn ? " · overlaps" : ""}
            </text>
          </g>
        );
      })}
      {drawing && taps.length > 0 && (
        <g>
          {taps.length === 2 ? (
            <rect
              x={Math.min(taps[0].x, taps[1].x) * k}
              y={Math.min(taps[0].y, taps[1].y) * k}
              width={Math.abs(taps[1].x - taps[0].x) * k}
              height={Math.abs(taps[1].y - taps[0].y) * k}
              fill={AREA}
              fillOpacity={0.12}
              stroke={AREA}
              strokeWidth={4 * k}
            />
          ) : (
            <polyline
              points={path(taps)}
              fill="none"
              stroke={AREA}
              strokeWidth={4 * k}
            />
          )}
          {taps.map((t, i) => (
            <circle key={i} cx={t.x * k} cy={t.y * k} r={10 * k} fill={AREA} />
          ))}
        </g>
      )}
    </svg>
  );
}
