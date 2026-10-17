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
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ArrowUpToLine, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeightFields } from "@/components/HeightFields";
import { cn } from "@/lib/utils";
import { formatElevation } from "@shared/takeoffHeights";
import { overlappingHeightAreas } from "@shared/homerunFootage";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  removePickedCorner,
  reshapeChanged,
  reshapeTap,
  sideMidpoints,
  type Pt,
  type Reshape,
} from "@/lib/heightAreaReshape";

export type HeightAreaView = {
  id: number;
  sheetId: number;
  name: string;
  heightInches: number | null;
  outline: Pt[];
};

const AREA = "#0284C7";
const WARN = "#F59E0B";
const PICKED = "#F5C518";

/*
  RESHAPING (todo.md "Reshape a height area after drawing — BEFORE BETA").
  The row starts it and the layer on the sheet takes the taps, and the two are
  rendered apart by the Plans screen — so the one reshape in progress lives
  here, shared by both, rather than as more state threaded through
  TakeoffPage. The rules are `@/lib/heightAreaReshape` (tested).
*/
let reshapeNow: Reshape | null = null;
const reshapeListeners = new Set<() => void>();
function setReshape(next: Reshape | null) {
  reshapeNow = next;
  reshapeListeners.forEach(l => l());
}
function useReshape(): Reshape | null {
  return useSyncExternalStore(
    l => {
      reshapeListeners.add(l);
      return () => reshapeListeners.delete(l);
    },
    () => reshapeNow
  );
}
/** How far from a handle a finger may land and still be on it, in CSS px. */
const HANDLE_REACH_PX = 22;

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
  onReshape,
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
  /** Save a reshaped outline (`homeruns.updateHeightArea`'s `outline`). */
  onReshape: (id: number, outline: Pt[]) => void;
  /** Why the last Finish made nothing, or null. */
  finishError: string | null;
}) {
  const reshape = useReshape();
  // The panel closing, or the area leaving this sheet, ends a reshape: the
  // sheet must never keep taking taps for controls nobody can see.
  useEffect(() => () => setReshape(null), []);
  useEffect(() => {
    if (reshape && !areas.some(a => a.id === reshape.areaId)) setReshape(null);
  }, [reshape, areas]);
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
        {!drawing && !locked && reshape === null && (
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
          // One tool at a time: no reshaping while drawing a new area, and
          // one area reshaped at a time.
          canReshape={!drawing && (reshape === null || reshape.areaId === a.id)}
          reshape={reshape?.areaId === a.id ? reshape : null}
          onReshapeDone={outline => {
            if (
              reshapeChanged({ areaId: a.id, outline, picked: null }, a.outline)
            )
              onReshape(a.id, outline);
            setReshape(null);
          }}
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
  canReshape,
  reshape,
  onReshapeDone,
}: {
  area: HeightAreaView;
  locked: boolean;
  sheetHeightLabel: string;
  onRename: (name: string) => void;
  onHeight: (inches: number | null) => void;
  onRemove: () => void;
  canReshape: boolean;
  /** This area's reshape in progress, or null. */
  reshape: Reshape | null;
  onReshapeDone: (outline: Pt[]) => void;
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
      {!locked &&
        (reshape ? (
          <div className="space-y-1.5 rounded bg-muted/40 p-2">
            <div className="text-muted-foreground">
              Tap a corner, then tap where it goes. Tap a small dot between two
              corners to add one there.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 text-xs"
                disabled={
                  reshape.picked === null || reshape.outline.length <= 3
                }
                onClick={() => setReshape(removePickedCorner(reshape))}
              >
                Remove corner
              </Button>
              <Button
                size="sm"
                className="min-h-11 text-xs"
                onClick={() => onReshapeDone(reshape.outline)}
              >
                Done
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11 text-xs"
                onClick={() => setReshape(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          canReshape && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 text-xs"
              onClick={() =>
                setReshape({
                  areaId: area.id,
                  outline: area.outline.map(p => ({ ...p })),
                  picked: null,
                })
              }
            >
              Reshape
            </Button>
          )
        ))}
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
  // A reshape of an area on THIS sheet takes the taps, like drawing does.
  const reshapeAll = useReshape();
  const reshape =
    reshapeAll && areas.some(a => a.id === reshapeAll.areaId)
      ? reshapeAll
      : null;
  const taking = drawing || reshape !== null;
  // Handles are sized in SCREEN pixels, like their reach: in page points they
  // shrank to a dot at a tablet's fit zoom (seen 2026-10-16, 10%). The layer
  // sits inside the zoom, so its on-screen scale is measured, not assumed.
  const svgRef = useRef<SVGSVGElement>(null);
  const [pxPerPoint, setPxPerPoint] = useState(1);
  useLayoutEffect(() => {
    if (!reshape || !svgRef.current) return;
    const shownWidth = svgRef.current.getBoundingClientRect().width;
    const next = (shownWidth / width) * k;
    if (next > 0 && Math.abs(next - pxPerPoint) / pxPerPoint > 0.05)
      setPxPerPoint(next);
  });
  /** A size in screen px, in this svg's units. */
  const px = (n: number) => (n / pxPerPoint) * k;
  // While reshaping, the area is drawn with the outline being edited.
  const shown = reshape
    ? areas.map(a =>
        a.id === reshape.areaId ? { ...a, outline: reshape.outline } : a
      )
    : areas;
  const overlapping = new Set(overlappingHeightAreas(shown).flat());
  const path = (pts: readonly Pt[]) =>
    pts.map(p => `${p.x * k},${p.y * k}`).join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(
        "absolute inset-0 w-full h-full z-10",
        taking ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"
      )}
      style={taking ? { touchAction: "none" } : undefined}
      aria-label="Height areas"
      ref={svgRef}
      onPointerDown={e => {
        if (!taking) return;
        e.stopPropagation();
        down.x = e.clientX;
        down.y = e.clientY;
      }}
      onPointerUp={e => {
        if (!taking) return;
        e.stopPropagation();
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
        const r = e.currentTarget.getBoundingClientRect();
        const at = {
          x: (((e.clientX - r.left) / r.width) * width) / k,
          y: (((e.clientY - r.top) / r.height) * height) / k,
        };
        if (reshape) {
          // A handle's reach is a finger's, whatever the zoom: CSS px turned
          // into page points at this zoom.
          const pxPerPoint = (r.width / width) * k;
          setReshape(reshapeTap(reshape, at, HANDLE_REACH_PX / pxPerPoint));
          return;
        }
        onTap(at);
      }}
      onClick={e => taking && e.stopPropagation()}
    >
      {shown.map(a => {
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
      {reshape && (
        <g>
          {sideMidpoints(reshape.outline).map((p, i) => (
            <circle
              key={`mid-${i}`}
              cx={p.x * k}
              cy={p.y * k}
              r={px(5)}
              fill="white"
              stroke={AREA}
              strokeWidth={px(2)}
            />
          ))}
          {reshape.outline.map((p, i) => (
            <circle
              key={`corner-${i}`}
              cx={p.x * k}
              cy={p.y * k}
              r={px(reshape.picked === i ? 10 : 7)}
              fill={reshape.picked === i ? PICKED : AREA}
              stroke="white"
              strokeWidth={px(2)}
            />
          ))}
        </g>
      )}
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
