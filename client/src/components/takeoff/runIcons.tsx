/**
 * runIcons — one icon per concept, defined once, and now DRAWN here.
 *
 * ── Why this file exists rather than two imports ─────────────────────────────
 * A conduit run is drawn in two places that are nowhere near each other: the
 * tool button in the viewer's top bar (`TakeoffPage`) and the row that button
 * produces in the counted-items list (`RunsPanel`). They disagreed — a winding
 * path on the button, a lightning bolt on the row — and nothing in the code
 * connected them, so there was no way to change one and be reminded of the
 * other.
 *
 * Importing from here means the button and the row cannot drift apart again.
 * Anything else that ever draws a run imports from here too.
 *
 * ── Why these are hand-drawn rather than picked from lucide ──────────────────
 * Three rounds of picking from the library produced three icons that each said
 * something adjacent to the right thing and none that said it:
 *
 *   `Route`  — two dots joined by an S-bend. Says "a journey from A to B", and
 *              its endpoint dots are its loudest feature.
 *   `Zap`    — says "electrical", which is not information inside an electrical
 *              estimating app.
 *   `GitCommitHorizontal` — a line with a ring on it. The closest the library
 *              gets to a length of pipe, and it is a version-control icon that
 *              had to be aliased to stop anyone reading its real name.
 *   `Cable`  — two connector boots with a loop between them. That is a patch
 *              lead. An estimator tracing MC is not thinking about plugs.
 *
 * **The library does not contain these two objects**, because outside this
 * trade nobody needs a picture of them. So they are drawn: a length of pipe
 * with a coupling near its right end, and a sheath with three conductors coming
 * out of the cut end — which is what the thing on the reel actually looks like.
 *
 * ── Drawn to lucide's grid so they do not look bolted on ─────────────────────
 * Every constant below is lucide's, and matching them is the whole point:
 * a 24x24 viewBox, `none` fill, `currentColor` stroke, **2** stroke width,
 * round caps and round joins. Sized in CSS by the caller (`w-3.5 h-3.5`), like
 * every other icon in the bar, which overrides the 24 on the element.
 *
 * Both keep inside a ~2px margin on all sides, again like lucide's own, so they
 * sit at the same optical weight as `MapPin` and `Ruler` beside them rather
 * than reading a size larger.
 *
 * ── What is NOT in here ──────────────────────────────────────────────────────
 * `Zap` still heads the counted-items panel and its empty state, and that is
 * correct: there it means the counted DEVICES — stamps — and not conduit.
 * "One icon per concept" cuts both ways, and merging those two would be the
 * same mistake in the opposite direction.
 */
import type { SVGProps } from "react";

/** Lucide's own, so a hand-drawn icon cannot drift from a library one. */
const base = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * CONDUIT — the line style a conduit run is drawn in. Solid.
 *
 * ── These are SWATCHES now, not pictures of objects ──────────────────────────
 * Rewritten 2026-09-24. They used to be miniature drawings: a length of pipe
 * with a coupling, and a sheath with three conductors splaying out of a cut
 * end. A great deal of care went into those and the verdict from using them was
 * that they "don't read as anything" — which is the honest outcome for detailed
 * objects at 14 pixels, however carefully drawn.
 *
 * What replaces them is not a better picture. It is a different idea: the
 * button now shows THE LINE IT WILL DRAW. Conduit is solid and cable is dashed
 * on the sheet already — `RUN_DASH` in shared/takeoffMarks.ts, chosen there
 * because colour was freed up to mean grouping — so the toolbar can simply
 * show that, and the button becomes a sample of its own output.
 *
 * The advantage is that it cannot go stale in the way the old pair did: if the
 * line style ever changes, these are wrong in an obvious way rather than
 * quietly depicting a thing nobody recognises.
 */
export function ConduitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2 12h20" />
    </svg>
  );
}

/**
 * CABLE — the line style a cable run is drawn in. Dashed.
 *
 * The dash ratio matches `RUN_DASH.cable` ("10 6") rather than being picked by
 * eye, so the swatch and the line keep the same rhythm. It is scaled down
 * because this is a 24-unit viewBox shown at 14px while the run is drawn in
 * overlay units: "5 3" is the same 10:6 proportion at a size where the gaps
 * survive.
 *
 * See ConduitIcon for why these stopped being drawings of objects.
 */
export function CableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} strokeDasharray="5 3">
      <path d="M2 12h20" />
    </svg>
  );
}

/**
 * ── There are no tint constants here any more, and that is the point ────────
 *
 * There used to be two — conduit yellow, cable emerald — and the comment above
 * them said they were "the same pair the trace layer draws the runs in", so a
 * row could not disagree with the line it pointed at.
 *
 * That stopped being true the day colour started meaning WHICH TYPE rather
 * than conduit-versus-cable. A yellow icon beside a pink line is a row that has
 * to be read twice, which is the exact fault those constants existed to
 * prevent — the claim outlived the arrangement it described.
 *
 * So the two places that draw these icons now answer the question separately,
 * because they are different questions:
 *
 *   - **The toolbar** has no particular run in hand, so its icons are plain
 *     foreground. Conduit-versus-cable is carried by the SHAPE — a length of
 *     pipe against a sheath with conductors — which is what they were drawn
 *     for. A tint there would be teaching a code the drawing no longer uses.
 *   - **A row in the panel** does have a run in hand, so it wears that run's
 *     own colour (`runAppearance`) and the row names its line on sight.
 *
 * Do not reintroduce a shared constant to "tidy this up". One colour cannot
 * answer both, and the last one that tried is what this comment is about.
 */
