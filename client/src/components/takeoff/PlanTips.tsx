/**
 * The first-open tips on the Plans screen (references/plan-reading-help-plan.md
 * § 5; step 4 of § 7). One card at a time, beside the control it is about,
 * with a ring round that control. Which tip, and where it goes on a laptop
 * or tablet, are decided in @/lib/planTips; this finds the control on screen
 * and draws. The phone's spot is decided here (below), and is simpler.
 *
 * A control is found by its `data-plan-tip` attribute. On a phone every tip
 * sits at the bottom of the screen, just above the bar under the drawing
 * (plan § 1, "Where each piece lives"): the controls they name are inside
 * the closed panel there.
 *
 * Not modal: the page behind it still works, and the card swallows its own
 * pointer events so a tap on it can never pan or mark the drawing behind.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { placeTip, tipText, type PlanTipId, type Rect } from "@/lib/planTips";

/** Where each tip looks for its control, first match that is on screen. */
const ANCHORS: Record<PlanTipId, string[]> = {
  notesSheet: ["sheets"],
  sheetKind: ["sheet-kind"],
  drawingTaps: ["drawing"],
  lookUp: ["tab-legend"],
};

function findRect(name: string): Rect | null {
  const el = document.querySelector(`[data-plan-tip="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0
    ? { left: r.left, top: r.top, width: r.width, height: r.height }
    : null;
}

export function PlanTips({
  tip,
  phone,
  notesSheetLabel,
  last,
  onNext,
  onClose,
  onOff,
}: {
  tip: PlanTipId;
  phone: boolean;
  notesSheetLabel: string | null;
  /** No tip after this one on this sheet: "Next" reads "Got it". */
  last: boolean;
  onNext: () => void;
  /** The card's ×: this one is seen; the rest wait for the next visit. */
  onClose: () => void;
  onOff: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{
    left: number;
    top: number;
    ring: Rect | null;
  } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const card = cardRef.current;
      if (!card) return;
      const win = { width: window.innerWidth, height: window.innerHeight };
      const size = { width: card.offsetWidth, height: card.offsetHeight };
      /*
        PHONE: always just above the bar under the drawing, never over it —
        the bar is the way into the panel the tips talk about. Here, and only
        here, the "not over the drawing's middle" rule cannot hold on a small
        phone: at 375 x 667 the drawing is 300 px tall and the card 182
        (measured 2026-10-13), so every spot in it covers the middle.
      */
      const bar = phone ? findRect("phone-bar") : null;
      if (bar) {
        const next = {
          left: 16,
          top: Math.max(8, bar.top - size.height - 8),
          ring: null,
        };
        setAt(prev =>
          prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next
        );
        return;
      }
      const anchor =
        ANCHORS[tip].map(findRect).find((r): r is Rect => r !== null) ?? null;
      const drawing = findRect("drawing");
      const spot = anchor
        ? placeTip(anchor, size, win, drawing)
        : placeTip(
            { left: 0, top: win.height, width: 0, height: 0 },
            size,
            win,
            drawing
          );
      const next = { ...spot, ring: anchor };
      // Unchanged most of the time: keep the same object, so no re-render.
      setAt(prev =>
        prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      );
    };
    place();
    // The top bar wraps, panels open and close, a tablet turns round: the
    // control moves, so the card follows it.
    const timer = window.setInterval(place, 500);
    window.addEventListener("resize", place);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", place);
    };
  }, [tip, phone]);

  const text = tipText(tip, notesSheetLabel);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      {at?.ring && (
        <div
          aria-hidden
          className="fixed z-40 pointer-events-none rounded-md ring-2 ring-[#F5C518]"
          style={{
            left: at.ring.left - 3,
            top: at.ring.top - 3,
            width: at.ring.width + 6,
            height: at.ring.height + 6,
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={text.title}
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
        }}
        className="fixed z-50 rounded-lg border border-[#F5C518]/60 bg-popover text-popover-foreground shadow-lg p-3"
        style={{
          width: phone ? "calc(100vw - 32px)" : 300,
          left: at?.left ?? 0,
          top: at?.top ?? 0,
          // Measured once before it is placed; invisible until then.
          visibility: at ? "visible" : "hidden",
        }}
      >
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-medium">{text.title}</p>
          <button
            type="button"
            onClick={onClose}
            className="-m-1 p-1 rounded text-muted-foreground hover:text-foreground"
            aria-label="Close this tip"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{text.body}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            className={phone ? "h-11" : "h-8"}
            onClick={onOff}
          >
            No more tips
          </Button>
          <Button size="sm" className={phone ? "h-11" : "h-8"} onClick={onNext}>
            {last ? "Got it" : "Next"}
          </Button>
        </div>
      </div>
    </>
  );
}
