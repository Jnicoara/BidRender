/**
 * EVERY DROP ON THE BID, in one list (D21, answer 6).
 *
 * Route rises and drops and approved quantity drops together, each group
 * saying how many came from which — so "how much vertical pipe is on this
 * job, and where" has one answer. Grouped by what they drop to; a group opens
 * to its drops, and a drop jumps to its sheet and spot.
 *
 * Closed by default behind ONE control (CLAUDE.md § "Customization available,
 * but never in the way"): the summary line is what most people need, and the
 * list is one tap away.
 *
 * The query is `takeoffRuns.drops`, invalidated by `refreshRuns` with every
 * other run query, so the numbers move when a drop is answered on any sheet.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { groupDrops, sourceSplit } from "@/lib/dropsReadout";
import { RunTypeSwatch } from "@/components/takeoff/runIcons";
import type { RunTypeColors } from "@shared/takeoffMarks";

export type DropJump = {
  runId: number;
  bidPdfId: number | null;
  pageNumber: number | null;
  x: number;
  y: number;
};

export function BidDropsReadout({
  bidId,
  onJump,
  runColors,
}: {
  bidId: number;
  onJump: (to: DropJump) => void;
  /** Which colour each run type gets on this bid — `takeoffRuns.typeColors`. */
  runColors: RunTypeColors;
}) {
  const { data } = trpc.takeoffRuns.drops.useQuery({ bidId });
  const [open, setOpen] = useState(false);
  const [openKind, setOpenKind] = useState<string | null>(null);
  if (!data) return null;
  const grouped = groupDrops(data.drops);
  const { groups } = grouped;
  /*
    Drops from counted marks (held-migrations plan § 3) join the summary line,
    so "how much vertical pipe is on this job" still has one answer.
  */
  const markCount = data.fromMarks.reduce((n, d) => n + d.count, 0);
  const markFeet = data.fromMarks.reduce((n, d) => n + d.feet, 0);
  const count = grouped.count + markCount;
  const feet = grouped.feet + markFeet;
  // Nothing to report and nothing left out: stay out of the way entirely.
  if (count === 0 && data.noRunHeight === 0 && data.notMeasurable === 0)
    return null;

  return (
    <div className="border-b border-border">
      <button
        type="button"
        className="w-full flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          Drops on this bid
        </span>
        <span className="ml-auto text-xs font-mono tabular-nums">
          {count === 0 ? "none counted" : `${count} · ${feet.toFixed(2)} ft`}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2.5 space-y-1">
          {groups.map(group => {
            const expanded = openKind === group.kind;
            return (
              <div key={group.kind}>
                <button
                  type="button"
                  className={cn(
                    "w-full flex items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left",
                    expanded ? "bg-muted/40" : "hover:bg-muted/40"
                  )}
                  onClick={() => setOpenKind(expanded ? null : group.kind)}
                  aria-expanded={expanded}
                >
                  <span className="text-xs truncate">
                    {group.label}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {group.count} ({sourceSplit(group)})
                    </span>
                  </span>
                  <span className="text-xs font-mono tabular-nums shrink-0">
                    {group.feet.toFixed(2)} ft
                  </span>
                </button>
                {expanded && (
                  <div className="ml-2 mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
                    {group.items.map(item => (
                      <button
                        key={`${item.runId}:${item.end}`}
                        type="button"
                        className="w-full flex items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-[#F5C518]/10"
                        onClick={() =>
                          onJump({
                            runId: item.runId,
                            bidPdfId: item.bidPdfId,
                            pageNumber: item.pageNumber,
                            x: item.x,
                            y: item.y,
                          })
                        }
                        title="Show this one on the drawing"
                      >
                        {/* The swatch of the run it drops from, in the
                            colour that run is drawn — the jump lands on it. */}
                        <span className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground">
                          <RunTypeSwatch
                            runTypeId={item.runTypeId}
                            pathType={item.pathType}
                            colors={runColors}
                            className="self-center"
                          />
                          <span className="truncate">
                            {item.sheetName} ·{" "}
                            {item.direction === "rise" ? "rise" : "drop"},{" "}
                            {item.source}
                          </span>
                        </span>
                        <span className="text-xs font-mono tabular-nums shrink-0">
                          {item.feet.toFixed(2)} ft
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {/* From marks: one line per counted item, since the drop is set
              once on the count, not per mark. */}
          {data.fromMarks.length > 0 && (
            <div className="pt-1">
              <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground px-1">
                From marks
              </div>
              {data.fromMarks.map(d => (
                <div
                  key={d.groupId}
                  className="flex items-baseline justify-between gap-2 px-1 py-0.5"
                >
                  <span className="text-xs truncate">
                    {d.groupLabel}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {d.count} to {d.label || "device"},{" "}
                      {d.perDropFeet !== null
                        ? `${d.perDropFeet.toFixed(2)} ft each`
                        : "heights vary by mark"}
                    </span>
                  </span>
                  <span className="text-xs font-mono tabular-nums shrink-0">
                    {d.feet.toFixed(2)} ft
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground px-1">
                Connectors and elbows for drops from marks are not counted — add
                them by hand.
              </p>
            </div>
          )}
          {/* What is NOT in the number above, counted rather than dropped. */}
          {data.noRunHeight > 0 && (
            <p className="rounded bg-warning/10 px-2 py-1 text-xs text-warning">
              {data.noRunHeight} end{data.noRunHeight === 1 ? " is" : "s are"}{" "}
              waiting on the job's run height — no drop can be counted until it
              is set.
            </p>
          )}
          {data.notMeasurable > 0 && (
            <p className="rounded bg-warning/10 px-2 py-1 text-xs text-warning">
              {data.notMeasurable} drop
              {data.notMeasurable === 1 ? " is" : "s are"} on a sheet with no
              scale, so not counted — the same rule the totals follow.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
