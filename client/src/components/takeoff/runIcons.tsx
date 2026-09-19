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
 * CONDUIT — a length of pipe with a coupling near the right end.
 *
 * Two parallel lines read as pipe in elevation, which is how it is drawn on a
 * plan and how it is pictured by anyone who has bent any. The coupling is a
 * narrow box standing proud of the pipe above and below — proud is what makes
 * it a fitting rather than a cap, and it is the only cue that survives at 14
 * pixels.
 *
 * **The pipe continues past the coupling, and that short tail is load-bearing.**
 * Drawn five times and looked at on screen at 14px: with the box on the very
 * end and nothing after it, the two lines become prongs and the whole thing
 * reads as a PLUG going into a socket. A coupling sits in the middle of a run,
 * not on the end of one, so putting pipe on both sides of it is both the
 * truthful picture and the one that stops the wrong reading.
 *
 * Also tried and rejected at size: a ring on the pipe (reads as a key), and two
 * vertical bars at the end (reads as a stop, not a fitting).
 */
export function ConduitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2 9h12" />
      <path d="M2 15h12" />
      <rect x="14" y="6.5" width="4" height="11" rx="1" />
      <path d="M18 9h4" />
      <path d="M18 15h4" />
    </svg>
  );
}

/**
 * CABLE — a sheath with three conductors coming out of the cut end.
 *
 * The jacket is two long parallel lines running off the left edge — the reel
 * it came from is out of frame — and the right end is where it was cut. Three
 * conductors splay out of the opening, which is both the literal picture and
 * the one thing that separates this from the conduit above at a glance: **pipe
 * is closed and parallel, cable is open and splayed.**
 *
 * **The jacket has to be much longer than the conductors**, and this was the
 * whole difficulty. Drawn with the two at similar lengths — the obvious
 * proportions — it reads as a bowtie, or as a pair of scissors, and at 14px it
 * is unrecognisable. Roughly two thirds jacket to one third conductors is where
 * it starts reading as a cable with wires coming out rather than as a symmetric
 * shape. A closed rounded rectangle for the jacket was also tried: it reads as
 * a battery with leads.
 *
 * Three conductors rather than two or four on purpose — two reads as a lamp
 * cord and four turns to mush at 14 pixels. Three is also the common case.
 */
export function CableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2 7.5h12" />
      <path d="M2 16.5h12" />
      <path d="m14 10.5 7.5-2" />
      <path d="M14 12h8" />
      <path d="m14 13.5 7.5 2" />
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
