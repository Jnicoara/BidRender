/**
 * WHO DOES WHAT, for the whole bid — above the line list
 * (scope-tags-plan.md steps 5 and 7).
 *
 * Two things in one card, both quiet by default:
 *
 * - **The counts** — "48 we install · 6 owner furnishes · 3 by others ·
 *   2 excluded". Shown only once a line says something other than We install
 *   (`showScopeCounts`); on the basic path every line is ours and the strip
 *   would be noise. Tapping a word filters the list to those lines — a VIEW,
 *   it changes no line and no number. Tap it again (or "Show all") to clear.
 * - **More options → the note finder** (`ScopeNoteFinder`), only when the
 *   bid has plans to read. It is behind ONE fold, closed, and runs nothing
 *   until opened.
 *
 * The plan put the strip "above the bid totals"; it sits above the LINE LIST
 * instead, because its words filter that list and a filter belongs beside
 * what it filters (recorded in the plan, step 5).
 *
 * Nothing at all renders on a bid with no tag and no plans.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scopeCounts,
  scopeSummaryWords,
  showScopeCounts,
} from "@/lib/scopeSummary";
import type { LineScope } from "@shared/lineScope";
import { ScopeNoteFinder, type FinderLine } from "./ScopeNoteFinder";

export function ScopeSummary({
  bidId,
  lines,
  locked,
  hasPlans,
  filter,
  onFilter,
  refresh,
}: {
  bidId: number;
  lines: readonly FinderLine[];
  locked: boolean;
  hasPlans: boolean;
  filter: LineScope | null;
  onFilter: (scope: LineScope | null) => void;
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const counts = showScopeCounts(lines);
  if (!counts && !hasPlans) return null;
  const words = scopeSummaryWords(scopeCounts(lines));

  return (
    <div className="rounded-xl border border-border bg-card">
      {counts && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 px-4 py-2.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground mr-1.5">
            Who does what
          </span>
          {words.map((word, i) => (
            <span key={word.scope} className="inline-flex items-center">
              {i > 0 && (
                <span className="text-muted-foreground/60 mx-1" aria-hidden>
                  ·
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  onFilter(filter === word.scope ? null : word.scope)
                }
                aria-pressed={filter === word.scope}
                className={cn(
                  "rounded-full px-2 py-1 min-h-8 hover:bg-muted/50",
                  filter === word.scope
                    ? "bg-[#F5C518]/15 text-foreground font-medium ring-1 ring-[#F5C518]/40"
                    : "text-muted-foreground"
                )}
              >
                {word.text}
              </button>
            </span>
          ))}
          {filter !== null && (
            <button
              type="button"
              onClick={() => onFilter(null)}
              className="ml-auto text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground min-h-8 px-1"
            >
              Show all lines
            </button>
          )}
        </div>
      )}
      {hasPlans && (
        <>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            className={cn(
              "w-full flex items-center gap-2 px-4 py-2 min-h-10 text-left",
              counts && "border-t border-border"
            )}
          >
            <ChevronDown
              className={cn(
                "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
                open ? "" : "-rotate-90"
              )}
            />
            <span className="text-sm font-medium">More options</span>
            <span className="text-xs text-muted-foreground truncate">
              Find "by others", "N.I.C.", "owner furnished" on the drawings
            </span>
          </button>
          {open && (
            <div className="border-t border-border px-4 py-3">
              <ScopeNoteFinder
                bidId={bidId}
                lines={lines}
                locked={locked}
                refresh={refresh}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
