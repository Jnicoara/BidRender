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
        labels: unique(s.all.flatMap(m => m.labels ?? [])),
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
  /** The item's first look: trusted like the box (`firstLookId`). */
  isFirst: boolean;
  url: string | null;
};

/**
 * What a new look's own search tells the look-alike check (plan § 4): the
 * spots it found, for the server to compare with marks counted as other
 * items — or, when the comparison cannot be made, the sentence that says so.
 * A scan has no line work to compare, and saying nothing there would read as
 * "checked, nothing alike".
 *
 * When other items' looks were searched WITH it (`looksOnSet`, given here as
 * look id -> item id), the spots are only the new look's own finds, and
 * `otherLooks` counts, per other item, how many of those spots one of its
 * looks also found — two items claiming one spot. A spot only another
 * item's look found is not the new look's business, and is left out.
 */
export function lookAlikeCheck(
  result: FindResult | null,
  lookItems: ReadonlyMap<number, number> = new Map()
):
  | { spots: LookSpot[]; otherLooks: { symbolId: number; spots: number }[] }
  | { cannotCompare: string } {
  if (result?.kind === "ok" && !result.scan) {
    // Searched with no looks, a find carries no sources: all of it is the box's.
    const own = result.matches.filter(m => m.foundByBox !== false);
    const tally = new Map<number, number>();
    for (const m of own) {
      const items = new Set(
        (m.foundByLooks ?? []).flatMap(id => {
          const item = lookItems.get(id);
          return item === undefined ? [] : [item];
        })
      );
      items.forEach(item => tally.set(item, (tally.get(item) ?? 0) + 1));
    }
    return {
      spots: own.map(m => ({
        x: m.x,
        y: m.y,
        reach: Math.max(m.halfWidth, m.halfHeight),
      })),
      otherLooks: Array.from(tally, ([symbolId, spots]) => ({
        symbolId,
        spots,
      })),
    };
  }
  return {
    cannotCompare:
      result?.kind === "scan" || (result?.kind === "ok" && result.scan)
        ? "This sheet is a scan, so this look could not be compared with marks counted as other items."
        : "This look could not be compared with marks counted as other items on this sheet.",
  };
}

/**
 * "Your other look has 'GF' beside it; this one doesn't" (multiple-looks-plan
 * § 4 point 1). The new look's device words (GF, WP, IG… — the matcher's
 * fixed list, so a circuit number never counts) against the item's other
 * looks'. A word on one side and not the other is the cheapest sign that the
 * two pictures are two different devices — a GFCI and a plain duplex drawn
 * alike. Code only: the words come from the drawing's own text, no AI.
 *
 * Nothing to compare (no other look could be rebuilt) says nothing; the
 * caller says separately when the comparison could not be made at all.
 */
export function lookWordNotes(
  newDevice: readonly string[],
  otherDevice: readonly (readonly string[])[]
): string[] {
  if (otherDevice.length === 0) return [];
  const other =
    otherDevice.length === 1 ? "Your other look" : "Your other looks";
  const theirs = new Set(otherDevice.flat());
  const mine = new Set(newDevice);
  const q = (words: string[]) => words.map(w => `“${w}”`).join(", ");
  const missing = Array.from(theirs)
    .filter(w => !mine.has(w))
    .sort();
  const extra = Array.from(mine)
    .filter(w => !theirs.has(w))
    .sort();
  return [
    ...(missing.length
      ? [
          `${other} ${otherDevice.length === 1 ? "has" : "have"} ${q(missing)} beside ${otherDevice.length === 1 ? "it" : "them"}; this one doesn't.`,
        ]
      : []),
    ...(extra.length
      ? [
          `This one has ${q(extra)} beside it; ${other.toLowerCase()} ${otherDevice.length === 1 ? "doesn't" : "don't"}.`,
        ]
      : []),
  ];
}
