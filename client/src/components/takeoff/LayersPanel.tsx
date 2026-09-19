/**
 * LayersPanel — which marks are showing, on two independent axes.
 *
 * System (what a thing is) and Location (where it sits) filter separately and
 * combine, so "only devices, and only the ones underground" is one state
 * rather than a choice between two. See shared/takeoffLayers.ts for why they
 * are not one list.
 *
 * ── Counts on every row, and a warning when filtered ─────────────────────────
 * Each layer shows how many things are in it, and the panel says plainly when
 * a subset is showing. A filtered takeoff that looks like a complete one is how
 * someone quotes a job missing half its receptacles — the count on screen is
 * right for what is visible and wrong for the job.
 */
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Layers as LayersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  layerLabel,
  setAxis,
  toggleLayer,
  type LayerEntry,
  type LayerKey,
  type LayerState,
} from "@shared/takeoffLayers";

function Axis({
  title,
  entries,
  active,
  onToggle,
  onAll,
  onNone,
}: {
  title: string;
  entries: LayerEntry[];
  active: Set<LayerKey>;
  onToggle: (key: LayerKey) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="px-3 py-2 border-t border-border/60">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[0.7rem] text-muted-foreground"
            onClick={onAll}
          >
            All
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[0.7rem] text-muted-foreground"
            onClick={onNone}
          >
            None
          </Button>
        </div>
      </div>

      <div className="space-y-0.5">
        {entries.map(entry => {
          const on = active.has(entry.key);
          // Null means this band is not a colour on the drawing.
          const swatch = entry.color;
          return (
            <button
              key={entry.key}
              onClick={() => onToggle(entry.key)}
              className={cn(
                "w-full flex items-center gap-2 px-1.5 py-1 rounded text-xs transition-colors",
                on ? "hover:bg-muted" : "opacity-45 hover:bg-muted/50"
              )}
              aria-pressed={on}
            >
              {/*
                A swatch here is a LEGEND, so it only shows a colour when the
                band is actually drawn in one — a run type hands over the colour
                of its lines. A band with no colour on the sheet gets a neutral
                chip rather than an invented hue, because two swatches that look
                alike and mean different things is worse than one that says
                nothing. See takeoffLayers.
              */}
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-sm shrink-0 border-[1.5px]",
                  // A neutral chip is styled in CLASSES, not in an inline
                  // hsl(): this theme's colours are oklab custom properties, so
                  // `hsl(var(--muted-foreground))` parses to nothing and the
                  // fill silently vanishes — which made an ON band look exactly
                  // like an OFF one.
                  !swatch && "border-muted-foreground/60",
                  !swatch && on && "bg-muted-foreground/50"
                )}
                style={
                  swatch
                    ? {
                        backgroundColor: on ? swatch : "transparent",
                        borderColor: swatch,
                      }
                    : undefined
                }
              />
              <span className="flex-1 min-w-0 truncate text-left">
                {layerLabel(entry.key)}
              </span>
              <span className="font-mono text-[0.7rem] text-muted-foreground">
                {entry.count}
              </span>
              {on ? (
                <Eye className="w-3 h-3 text-muted-foreground/50" />
              ) : (
                <EyeOff className="w-3 h-3 text-muted-foreground/50" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LayersPanel({
  present,
  state,
  onChange,
  filtered,
  hiddenCount,
}: {
  present: {
    systems: LayerEntry[];
    locations: LayerEntry[];
  };
  state: LayerState;
  /**
   * Takes an UPDATER, not a value.
   *
   * Two toggles landing in one React batch would otherwise both compute from
   * the state captured at render, and the second would overwrite the first's
   * axis with a stale copy — "All" on both axes at once restored only one of
   * them. An updater always sees what the previous one produced.
   */
  onChange: (update: (previous: LayerState) => LayerState) => void;
  filtered: boolean;
  hiddenCount: number;
}) {
  const [open, setOpen] = useState(false);

  if (present.systems.length === 0 && present.locations.length === 0)
    return null;

  return (
    <div className="border-t border-border shrink-0">
      {/*
        Shut by default, like the Co-pilot panel above it.

        The work pane stacked Co-pilot, Layers and Legend above the counted
        items in a 32%-wide column, and only Co-pilot could be put away. Layers
        is a filter — set occasionally, read rarely — so it costs the most
        vertical space per glance of anything in the pane.

        ── The hidden-count warning is NOT collapsible ────────────────────────
        It moves into the header rather than folding away with the rest. A
        filtered takeoff that looks like a complete one is how someone quotes a
        job missing half its receptacles, and hiding that warning behind a
        chevron would be exactly the failure this panel's own docblock is about.
      */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full px-3 py-2 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <LayersIcon className="w-3 h-3" /> Layers
        {filtered && (
          <span className="ml-auto normal-case tracking-normal text-[#F5C518]">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {!open ? null : (
        <>
          <Axis
            title="System"
            entries={present.systems}
            active={state.systems}
            onToggle={key =>
              onChange(previous => toggleLayer(previous, "systems", key))
            }
            onAll={() =>
              onChange(previous =>
                setAxis(
                  previous,
                  "systems",
                  present.systems.map(s => s.key),
                  true
                )
              )
            }
            onNone={() =>
              onChange(previous =>
                setAxis(
                  previous,
                  "systems",
                  present.systems.map(s => s.key),
                  false
                )
              )
            }
          />

          <Axis
            title="Location"
            entries={present.locations}
            active={state.locations}
            onToggle={key =>
              onChange(previous => toggleLayer(previous, "locations", key))
            }
            onAll={() =>
              onChange(previous =>
                setAxis(
                  previous,
                  "locations",
                  present.locations.map(l => l.key),
                  true
                )
              )
            }
            onNone={() =>
              onChange(previous =>
                setAxis(
                  previous,
                  "locations",
                  present.locations.map(l => l.key),
                  false
                )
              )
            }
          />

          {/* Said plainly, because a filtered takeoff that looks complete is how a
          job gets quoted missing half its devices. */}
          {filtered && (
            <p className="px-3 pb-2 text-[0.7rem] text-[#F5C518]">
              Showing part of this sheet. Totals below cover the whole bid
              regardless.
            </p>
          )}
        </>
      )}
    </div>
  );
}
