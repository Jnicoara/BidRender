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
import type { PagePoint } from "@shared/takeoffGeometry";

export function CrosshairGuides({
  at,
  width,
  height,
  renderScale,
  color,
}: {
  /** Cursor position in page points, or null when the pointer is away. */
  at: PagePoint | null;
  /** The overlay's coordinate space. */
  width: number;
  height: number;
  renderScale: number;
  color: string;
}) {
  if (!at) return null;
  const x = at.x * renderScale;
  const y = at.y * renderScale;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return (
    <g pointerEvents="none" aria-hidden="true">
      <line
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.35}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.35}
        vectorEffect="non-scaling-stroke"
      />
      {/*
        The plus stays. The guides say what you are aligned with; this says
        exactly where the point will land, and at low zoom the two lines cross
        over enough drawing that the intersection alone is hard to pick out.
      */}
      <line
        x1={x - 8}
        y1={y}
        x2={x + 8}
        y2={y}
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={x}
        y1={y - 8}
        x2={x}
        y2={y + 8}
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
