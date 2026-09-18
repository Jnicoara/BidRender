/**
 * SidePanel — a viewer side panel that folds away, and the rail that folds it.
 *
 * ── The control is ON the thing it controls ──────────────────────────────────
 * A chevron tab on the panel's INNER edge, always visible, pointing the way the
 * panel will move. Not a menu item and not a keyboard-only affordance: a
 * control that lives somewhere else is a control nobody finds, and a panel
 * nobody can fold is 240 or 400 pixels of drawing gone for ever.
 *
 * ── The rail is also the drag handle ─────────────────────────────────────────
 * The same strip resizes the panel, because it is already exactly where a
 * resize handle belongs and a second 4px target beside it would be a target
 * nobody can hit. The chevron sits at the top of the rail and stops the drag
 * from starting, so pressing it folds rather than resizes.
 *
 * ── Collapsed means GONE, not narrow ─────────────────────────────────────────
 * Only the rail is left. A collapsed panel that keeps a strip of its own
 * content is the worst of both: it does not show anything useful and it has
 * not given the drawing back either.
 */
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** The rail is this wide whether the panel is open or folded. */
export const PANEL_RAIL_WIDTH = 18;

export function SidePanel({
  side,
  open,
  width,
  minWidth = 200,
  maxWidth = 560,
  onToggle,
  onWidth,
  label,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onToggle: () => void;
  onWidth: (width: number) => void;
  /** What this panel is, for the chevron's tooltip and screen readers. */
  label: string;
  children: React.ReactNode;
}) {
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!open) return;
      dragging.current = { startX: e.clientX, startWidth: width };
      e.preventDefault();
    },
    [open, width]
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const from = dragging.current;
      if (!from) return;
      // Dragging the rail of a RIGHT panel outward means leftward, so the
      // sign follows the side rather than the pointer.
      const delta =
        side === "left" ? e.clientX - from.startX : from.startX - e.clientX;
      onWidth(
        Math.min(
          maxWidth,
          Math.max(minWidth, Math.round(from.startWidth + delta))
        )
      );
    };
    const end = () => {
      dragging.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [side, minWidth, maxWidth, onWidth]);

  /**
   * Which way the chevron points: where the panel is ABOUT to go.
   *
   * An open left panel folds leftwards, so its chevron points left; folded, it
   * will come back rightwards. Pointing at the panel instead — "this is the
   * sheets panel" — is the version that reads as an arrow into a wall.
   */
  const pointsLeft = side === "left" ? open : !open;
  const Chevron = pointsLeft ? ChevronLeft : ChevronRight;

  const rail = (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        "shrink-0 flex flex-col items-center bg-card select-none",
        side === "left" ? "border-l border-border" : "border-r border-border",
        open ? "cursor-col-resize" : null
      )}
      style={{ width: PANEL_RAIL_WIDTH }}
    >
      <button
        type="button"
        onPointerDown={e => e.stopPropagation()}
        onClick={onToggle}
        aria-expanded={open}
        title={open ? `Hide ${label}` : `Show ${label}`}
        aria-label={open ? `Hide ${label}` : `Show ${label}`}
        className="w-full h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        <Chevron className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const body = open ? (
    <div
      className="shrink-0 min-w-0 flex flex-col min-h-0 bg-card overflow-hidden"
      style={{ width }}
    >
      {children}
    </div>
  ) : null;

  return (
    <div className="flex shrink-0 min-h-0">
      {side === "left" ? (
        <>
          {body}
          {rail}
        </>
      ) : (
        <>
          {rail}
          {body}
        </>
      )}
    </div>
  );
}
