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
 *
 * NEVER IN THE WAY (2026-10-14). The card is placed off the toolbars and the
 * side panel (`placeTip`), and the person's first press ANYWHERE ELSE puts
 * it away for this visit (`onAway`). Placement alone was not enough: a tool's
 * own popover — "Name this symbol" after a capture — opens over the drawing,
 * which is exactly where the card goes. Smoke run 38595716662 timed out on
 * both, on a laptop and a sideways tablet. The press still does what it was
 * for; the listener is on the capture phase so nothing below can swallow it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { placeTip, tipText, type PlanTipId, type Rect } from "@/lib/planTips";

/** Where each tip looks for its control, first match that is on screen. */
const ANCHORS: Record<PlanTipId, string[]> = {
  touchGestures: ["drawing"],
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
  touch,
  notesSheetLabel,
  last,
  onNext,
  onClose,
  onAway,
  onOff,
}: {
  tip: PlanTipId;
  phone: boolean;
  /**
   * A finger, not a mouse — a tablet as much as a phone. Every way out of
   * the card is then 44 px, so dismissing it is one easy tap.
   */
  touch: boolean;
  notesSheetLabel: string | null;
  /** No tip after this one on this sheet: "Next" reads "Got it". */
  last: boolean;
  onNext: () => void;
  /** The card's ×: this one is seen; the rest wait for the next visit. */
  onClose: () => void;
  /**
   * A press outside the card: the person is busy. Tips go away for this
   * visit and this one is NOT marked seen, so it comes back next time.
   */
  onAway: () => void;
  onOff: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const onAwayRef = useRef(onAway);
  onAwayRef.current = onAway;

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const card = cardRef.current;
      if (card && e.target instanceof Node && card.contains(e.target)) return;
      onAwayRef.current();
    };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, []);
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
            className={
              touch
                ? "-m-3 flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                : "-m-1 p-1 rounded text-muted-foreground hover:text-foreground"
            }
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
            className={touch ? "h-11" : "h-8"}
            onClick={onOff}
          >
            No more tips
          </Button>
          <Button size="sm" className={touch ? "h-11" : "h-8"} onClick={onNext}>
            {last ? "Got it" : "Next"}
          </Button>
        </div>
      </div>
    </>
  );
}
