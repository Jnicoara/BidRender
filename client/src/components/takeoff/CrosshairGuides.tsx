/**
 * CrosshairGuides — faint lines the full width and height of the sheet.
 *
 * Borrowed from the deleted PlanPanel, which had them and was better for it.
 * Placing a point on a drawing is an alignment job: you are not aiming at a
 * pixel, you are lining up with a wall two feet away and a column above. A dot
 * under the cursor tells you where the cursor is, which you already know. Lines
 * running off both edges tell you what you are LINED UP WITH, which is the
 * thing you cannot otherwise see.
 *
 * ── The plus is GONE, and the cursor is now the crosshair ────────────────────
 * This used to draw a plus at the pointer as well. That made TWO crosshairs on
 * screen — the system cursor and this one — and the drawn one, being the bigger
 * and the yellower, was the one the eye followed. It also arrived late: pointer
 * moves, React re-renders, overlay repaints, and on a dense sheet with the
 * render worker busy it trailed visibly behind the real pointer.
 *
 * The pointer itself is the crosshair now (`@/lib/crosshairCursor`), drawn by
 * the compositor on the pointer's own clock. Only the long alignment guides are
 * left here, because those are the part a cursor image cannot provide.
 *
 * ── Moved IMPERATIVELY, for the same reason ──────────────────────────────────
 * The guides are positioned by writing attributes straight onto two `<line>`
 * elements through a ref, not by re-rendering. A guide that lags is a guide
 * that lies about what you are lined up with, and putting it back on React
 * state would reintroduce exactly the lag the cursor change removes — the
 * overlay's parent re-renders on every pointer move for the rubber-band
 * preview and the readout, and those are allowed to be a frame late. This is
 * not.
 *
 * Callers therefore hold a ref and call `moveTo` from their pointer handler.
 *
 * ── Faint on purpose ─────────────────────────────────────────────────────────
 * These cross the whole drawing, so anything heavy enough to notice is heavy
 * enough to obscure. They sit just above the background and below every mark:
 * visible when looked for, invisible when not.
 *
 * ── Why the stroke does not scale ────────────────────────────────────────────
 * `vectorEffect="non-scaling-stroke"` keeps them one screen pixel at every
 * zoom. Without it a guide drawn at fit zoom becomes a band several feet wide
 * across the building at 400%, and a hairline is the entire point.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";

export type CrosshairHandle = {
  /** Put the guides at this point, in the overlay's own coordinates. */
  moveTo: (x: number, y: number) => void;
  /** Pointer has left the drawing. */
  hide: () => void;
};

export const CrosshairGuides = forwardRef<
  CrosshairHandle,
  { width: number; height: number; color: string }
>(function CrosshairGuides({ width, height, color }, ref) {
  const groupRef = useRef<SVGGElement | null>(null);
  const horizontalRef = useRef<SVGLineElement | null>(null);
  const verticalRef = useRef<SVGLineElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      moveTo(x: number, y: number) {
        const group = groupRef.current;
        const horizontal = horizontalRef.current;
        const vertical = verticalRef.current;
        if (!group || !horizontal || !vertical) return;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        horizontal.setAttribute("y1", String(y));
        horizontal.setAttribute("y2", String(y));
        vertical.setAttribute("x1", String(x));
        vertical.setAttribute("x2", String(x));
        // Hidden until the first move, so a stale position never flashes up
        // where the pointer used to be.
        group.style.display = "";
      },
      hide() {
        const group = groupRef.current;
        if (group) group.style.display = "none";
      },
    }),
    []
  );

  return (
    <g
      ref={groupRef}
      pointerEvents="none"
      aria-hidden="true"
      style={{ display: "none" }}
    >
      <line
        ref={horizontalRef}
        x1={0}
        y1={0}
        x2={width}
        y2={0}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.35}
        vectorEffect="non-scaling-stroke"
      />
      <line
        ref={verticalRef}
        x1={0}
        y1={0}
        x2={0}
        y2={height}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.35}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});
