/**
 * runIcons — one icon per concept, defined once.
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
 * ── What they are, and why ───────────────────────────────────────────────────
 * **Conduit — `GitCommitHorizontal`.** A straight line with a ring in the
 * middle: a run of pipe with a coupling on it. The lucide name is about version
 * control and says nothing about the picture, which is exactly why it is
 * aliased here and never imported raw.
 *
 * It replaced two attempts that both read as something else. `Route` — two dots
 * joined by an S-bend — says "a journey from A to B", and its endpoint dots are
 * its loudest feature. `Zap` — the lightning bolt on the counted-items rows —
 * says "electrical", which is not information inside an electrical estimating
 * app.
 *
 * **Cable — `Cable`.** Two connector boots with a cable looping between them.
 * It won on consistency rather than on the drawing: it was already what the
 * MC/Romex rows used, so adopting it for the tool made the button and its rows
 * agree. `Shell`, a tight spiral, is the better picture of MC's spiral armour
 * and was passed over for precisely that reason — matching what is already on
 * screen beats a cleverer picture that matches nothing.
 *
 * ── What is NOT in here ──────────────────────────────────────────────────────
 * `Zap` still heads the counted-items panel and its empty state, and that is
 * correct: there it means the counted DEVICES — stamps — and not conduit.
 * "One icon per concept" cuts both ways, and merging those two would be the
 * same mistake in the opposite direction.
 */
export {
  GitCommitHorizontal as ConduitIcon,
  Cable as CableIcon,
} from "lucide-react";

/**
 * The colours they are drawn in, so those cannot drift either.
 *
 * Conduit yellow and cable emerald are the same pair the trace layer draws the
 * runs themselves in — see TraceLayer. A row whose icon is a different colour
 * from the line it points at is a row that has to be read twice.
 */
export const CONDUIT_COLOR = "text-[#F5C518]";
export const CABLE_COLOR = "text-emerald-400";
