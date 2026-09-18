/**
 * SheetChip — which sheet you are on, one click either way, and a page of
 * pictures for "which sheet had the panel schedule on it".
 *
 * ── Why this exists at all ───────────────────────────────────────────────────
 * So that collapsing the sheet list costs nothing. The list is the fastest way
 * to move around a 40-sheet set and it is also 240px of the drawing, so it has
 * to be foldable — and folding it is only acceptable if the sheet you are on
 * is still named and the next one is still one click away. That is this chip.
 *
 * ── Why thumbnails, and why BIG ones ─────────────────────────────────────────
 * On a real set the names blur together: `E2.01 POWER PLAN — LEVEL 2` against
 * `E2.02 POWER PLAN — LEVEL 3`. Shape does not. A panel schedule looks nothing
 * like a floor plan and a riser diagram looks like neither, and shape is what
 * people actually navigate by — so a postage-stamp grid would throw away the
 * whole idea. Fewer, larger thumbnails beat more, smaller ones.
 *
 * ── Rendering them is not free ───────────────────────────────────────────────
 * Every thumbnail is a real page render, and the worker draws one thing at a
 * time — so a grid rendered eagerly would sit in front of the sharp patch for
 * the sheet the user is actually reading. `onBrowsing` is how this component
 * says "somebody is looking at me now", and the page above only renders while
 * that is true. Each one arrives on its own, so the grid fills in rather than
 * making anyone wait for the last sheet in the set.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, ChevronLeft, ChevronRight, Ruler } from "lucide-react";

export type ChipSheet = {
  id: number;
  pageNumber: number;
  name: string;
  scaleRatio: number | null;
  scaleText: string | null;
};

export function SheetChip({
  sheets,
  page,
  pageCount,
  thumbnails,
  onOpenPage,
  onBrowsing,
  disabled,
}: {
  sheets: ChipSheet[];
  page: number;
  pageCount: number;
  /** Page number to a data URL, as each one finishes drawing. */
  thumbnails: Record<number, string>;
  onOpenPage: (page: number) => void;
  /** True while the grid is on screen and worth spending renders on. */
  onBrowsing: (browsing: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    onBrowsing(open);
    // Stop drawing thumbnails the moment this unmounts, not just when it
    // closes — navigating away mid-set would otherwise leave the worker
    // grinding through a grid nobody can see.
    return () => onBrowsing(false);
  }, [open, onBrowsing]);

  /** Bring the sheet you are on into view when the grid opens. */
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(
      () => activeRef.current?.scrollIntoView({ block: "center" }),
      0
    );
    return () => window.clearTimeout(timer);
  }, [open]);

  const active = sheets.find(s => s.pageNumber === page) ?? null;
  const label = active?.name ?? (pageCount > 0 ? `Sheet ${page}` : "—");

  /**
   * Every page, whether or not a sheet row exists for it yet.
   *
   * The rows are created from the PDF's outline after the document opens, so
   * for the first moment of a new plan there are pages and no sheets. Driving
   * the grid off the page count means it is never empty when there is
   * something to show.
   */
  const pages = Array.from({ length: Math.max(pageCount, sheets.length) }).map(
    (_, index) => {
      const pageNumber = index + 1;
      return (
        sheets.find(s => s.pageNumber === pageNumber) ?? {
          id: -pageNumber,
          pageNumber,
          name: `Sheet ${pageNumber}`,
          scaleRatio: null,
          scaleText: null,
        }
      );
    }
  );

  return (
    <div className="flex items-center gap-0.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => onOpenPage(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Previous sheet"
        title="Previous sheet (left arrow)"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs max-w-[15rem]"
            disabled={disabled}
            title="Every sheet in this set"
          >
            <span className="truncate">{label}</span>
            <span className="font-mono tabular-nums text-muted-foreground shrink-0">
              {pageCount > 0 ? `${page}/${pageCount}` : "—"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-[34rem] p-0">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-sm font-medium">
              {pages.length} {pages.length === 1 ? "sheet" : "sheets"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick by shape — a panel schedule looks nothing like a floor plan.
            </p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-3 grid grid-cols-3 gap-3">
            {pages.map(sheet => {
              const isActive = sheet.pageNumber === page;
              const thumbnail = thumbnails[sheet.pageNumber];
              return (
                <button
                  key={sheet.pageNumber}
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => {
                    onOpenPage(sheet.pageNumber);
                    setOpen(false);
                  }}
                  className={cn(
                    "group text-left rounded-lg border transition-colors overflow-hidden",
                    isActive
                      ? "border-[#F5C518] bg-[#F5C518]/5"
                      : "border-border hover:border-[#F5C518]/50 hover:bg-muted/50"
                  )}
                  title={sheet.name}
                >
                  {/*
                    A fixed 4:3 box whatever the sheet's own proportions, so
                    the grid stays a grid. The picture is contained rather than
                    cropped: a cropped thumbnail of a drawing is a picture of
                    the middle of a drawing, which is the part that looks the
                    same on every sheet.
                  */}
                  <div className="aspect-[4/3] bg-white/95 flex items-center justify-center overflow-hidden">
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt=""
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted animate-pulse" />
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-[0.7rem] text-muted-foreground shrink-0">
                        {sheet.pageNumber}
                      </span>
                      <span
                        className={cn(
                          "text-xs truncate",
                          isActive && "text-[#F5C518]"
                        )}
                      >
                        {sheet.name}
                      </span>
                    </div>
                    {sheet.scaleRatio ? (
                      <p className="text-[0.65rem] text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                        <Ruler className="w-2.5 h-2.5" /> {sheet.scaleText}
                      </p>
                    ) : (
                      <p className="text-[0.65rem] text-muted-foreground/60 mt-0.5">
                        No scale
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => onOpenPage(page + 1)}
        disabled={disabled || page >= pageCount}
        aria-label="Next sheet"
        title="Next sheet (right arrow)"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
