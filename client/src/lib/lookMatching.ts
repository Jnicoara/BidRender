/**
 * FIND ALL MATCHING WITH EVERY LOOK — merging what each look found.
 * references/multiple-looks-plan.md § 3; looks are `symbol_looks`.
 *
 * A search runs the matcher once per source — the box drawn now, and each of
 * the item's saved looks (shared/symbolLooks `looksForSearch`) — and this
 * turns those lists into ONE list where one device is one find:
 *
 *   - two finds within half a symbol of each other are one spot; the better
 *     likeness is kept, and the reasons of both;
 *   - every find says how many sources found it.
 *
 * ── The owner's rule, 2026-10-05: a look is per plan set ───────────────────
 * The same picture can mean different things on different sets (Old
 * Blueridge's half-filled duplex is a duplex above the backsplash, not a
 * GFCI). A find that ONLY looks from other plan sets made is a suggestion:
 * it gets OTHER_SET_REASON, so it is never "clear" and Confirm all never
 * takes it. It is confirmed one at a time, by a person who has looked at
 * this set's own legend. The box drawn on this sheet, and a look captured on
 * this set, both count as this set's own.
 */
import type { FindResult, Match } from "./findMatching";
import type { LookSpot } from "@shared/symbolLooks";

export type LookSource =
  /** The symbol boxed on this sheet for this search. */
  | { kind: "box" }
  | {
      kind: "look";
      lookId: number;
      /** The plan set it was captured on, for the reason's wording. */
      setName: string | null;
      /** Captured on THIS plan set: its legend confirms the item. */
      confirmsThisSet: boolean;
    };

export type LookResult = { source: LookSource; matches: readonly Match[] };

export const OTHER_SET_REASON = (sets: readonly string[]) =>
  `Found only by a look saved on ${
    sets.length ? sets.join(", ") : "another plan set"
  }. The same symbol can mean something else here — check this set's legend before counting it.`;

const confirms = (s: LookSource) => s.kind === "box" || s.confirmsThisSet;
const unique = (xs: readonly string[]) => Array.from(new Set(xs));

export type MergedMatch = Match & {
  /** How many sources (the box, each look) found this spot. */
  foundBy: number;
  foundByBox: boolean;
  foundByLooks: number[];
};

export function mergeLookResults(
  results: readonly LookResult[]
): MergedMatch[] {
  type Spot = { best: Match; all: Match[]; sources: LookSource[] };
  const spots: Spot[] = [];
  for (const r of results)
    for (const m of r.matches) {
      const reach = Math.max(m.halfWidth, m.halfHeight);
      const spot = spots.find(
        s => Math.hypot(s.best.x - m.x, s.best.y - m.y) <= reach
      );
      if (!spot) {
        spots.push({ best: m, all: [m], sources: [r.source] });
        continue;
      }
      spot.all.push(m);
      if (!spot.sources.includes(r.source)) spot.sources.push(r.source);
      if (m.coverage > spot.best.coverage) spot.best = m;
    }

  return spots
    .map(s => {
      const needsLook = unique(s.all.flatMap(m => m.needsLook));
      if (!s.sources.some(confirms))
        needsLook.push(
          OTHER_SET_REASON(
            unique(
              s.sources.flatMap(src =>
                src.kind === "look" && src.setName ? [src.setName] : []
              )
            )
          )
        );
      return {
        ...s.best,
        needsLook,
        maybeExisting: unique(s.all.flatMap(m => m.maybeExisting)),
        isBoxed: s.all.some(m => m.isBoxed),
        onDemolitionPlan:
          s.all.find(m => m.onDemolitionPlan)?.onDemolitionPlan ?? null,
        foundBy: s.sources.length,
        foundByBox: s.sources.some(src => src.kind === "box"),
        foundByLooks: s.sources.flatMap(src =>
          src.kind === "look" ? [src.lookId] : []
        ),
      };
    })
    .sort((p, q) => p.y - q.y || p.x - q.x);
}

/**
 * A saved look as a search is given it (server `takeoffStamps.searchLooks`,
 * passed through to the PDF worker): its box on its own sheet, and a viewer
 * url only when it is from ANOTHER plan set, whose drawing must be opened to
 * rebuild it. The url is a bearer credential: held in memory, never logged.
 */
export type SavedLook = {
  id: number;
  box: { x: number; y: number; width: number; height: number };
  pageNumber: number;
  setName: string | null;
  confirmsThisSet: boolean;
  url: string | null;
};

/**
 * What a new look's own search tells the look-alike check (plan § 4): the
 * spots it found, for the server to compare with marks counted as other
 * items — or, when the comparison cannot be made, the sentence that says so.
 * A scan has no line work to compare, and saying nothing there would read as
 * "checked, nothing alike".
 */
export function lookAlikeCheck(
  result: FindResult | null
): { spots: LookSpot[] } | { cannotCompare: string } {
  if (result?.kind === "ok" && !result.scan)
    return {
      spots: result.matches.map(m => ({
        x: m.x,
        y: m.y,
        reach: Math.max(m.halfWidth, m.halfHeight),
      })),
    };
  return {
    cannotCompare:
      result?.kind === "scan" || (result?.kind === "ok" && result.scan)
        ? "This sheet is a scan, so this look could not be compared with marks counted as other items."
        : "This look could not be compared with marks counted as other items on this sheet.",
  };
}
