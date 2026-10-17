/**
 * RESHAPING a height area after it is drawn (todo.md, "Reshape a height area
 * after drawing — BEFORE BETA", owner 2026-10-07). Before this an outline was
 * fixed once drawn: remove it and draw it again.
 *
 * TAPS, never a drag, for the same reason drawing is taps
 * (`components/takeoff/HeightAreas.tsx`): on the Plans screen a drag pans the
 * sheet, and a tablet has no hover. So:
 *
 *   - tap a corner → it is picked (tap it again → not picked);
 *   - with a corner picked, tap anywhere else → the corner moves there;
 *   - tap the small dot halfway along a side → a new corner there, picked;
 *   - "Remove corner" drops the picked one, never below three.
 *
 * Pure, in page points, so the suite can hold the rules. The layer converts a
 * tap to page points and says how far (in page points) counts as "on" a
 * handle at the current zoom.
 */
export type Pt = { x: number; y: number };

export type Reshape = {
  areaId: number;
  outline: Pt[];
  /** Index into `outline` of the picked corner, or null. */
  picked: number | null;
};

/** The dot halfway along each side: side i runs from corner i to i+1. */
export function sideMidpoints(outline: readonly Pt[]): Pt[] {
  return outline.map((p, i) => {
    const q = outline[(i + 1) % outline.length];
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  });
}

const nearest = (pts: readonly Pt[], at: Pt, within: number) => {
  let best = -1;
  let bestD = within;
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
};

/**
 * One tap while reshaping. `within` is the hit radius in page points. A
 * corner wins over a side's dot when both are in reach (a corner is what
 * people aim at; the dots sit between them).
 */
export function reshapeTap(state: Reshape, at: Pt, within: number): Reshape {
  const corner = nearest(state.outline, at, within);
  if (corner !== -1)
    return { ...state, picked: state.picked === corner ? null : corner };

  const side = nearest(sideMidpoints(state.outline), at, within);
  if (side !== -1) {
    const outline = [...state.outline];
    outline.splice(side + 1, 0, sideMidpoints(state.outline)[side]);
    return { ...state, outline, picked: side + 1 };
  }

  if (state.picked === null) return state;
  const outline = state.outline.map((p, i) =>
    i === state.picked ? { x: at.x, y: at.y } : p
  );
  return { ...state, outline, picked: null };
}

/** Drop the picked corner — never below three, which is the least an area is. */
export function removePickedCorner(state: Reshape): Reshape {
  if (state.picked === null || state.outline.length <= 3) return state;
  return {
    ...state,
    outline: state.outline.filter((_, i) => i !== state.picked),
    picked: null,
  };
}

/** Whether Done would change anything (it saves nothing when it would not). */
export function reshapeChanged(state: Reshape, stored: readonly Pt[]): boolean {
  return (
    state.outline.length !== stored.length ||
    state.outline.some((p, i) => p.x !== stored[i].x || p.y !== stored[i].y)
  );
}
