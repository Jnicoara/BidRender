/**
 * The bid's "who does what" strip (scope-tags-plan.md step 5): "48 we
 * install · 6 owner furnishes · 3 by others · 2 excluded", each word a filter
 * on the line list (view only — it changes no line and no number).
 *
 * Here rather than in the component so the suite can reach the decisions:
 * when the strip shows at all, what it says, and what a filter keeps.
 */
import { scopeOf, type LineScope, type ScopedLine } from "@shared/lineScope";

const ORDER: readonly LineScope[] = [
  "install",
  "ofci",
  "by_others",
  "excluded",
];

const WORD: Record<LineScope, string> = {
  install: "we install",
  ofci: "owner furnishes",
  by_others: "by others",
  excluded: "excluded",
};

export function scopeCounts(
  lines: readonly ScopedLine[]
): Record<LineScope, number> {
  const counts: Record<LineScope, number> = {
    install: 0,
    ofci: 0,
    by_others: 0,
    excluded: 0,
  };
  for (const line of lines) counts[scopeOf(line)]++;
  return counts;
}

/**
 * Whether the counts show. Only once a line says something other than We
 * install: on the basic path every line is ours, and "48 we install" on its
 * own tells nobody anything (CLAUDE.md § "never in the way").
 */
export function showScopeCounts(lines: readonly ScopedLine[]): boolean {
  return lines.some(line => scopeOf(line) !== "install");
}

/** The words, in the table's order, leaving out any at zero. */
export function scopeSummaryWords(
  counts: Record<LineScope, number>
): { scope: LineScope; text: string }[] {
  return ORDER.filter(scope => counts[scope] > 0).map(scope => ({
    scope,
    text: `${counts[scope]} ${WORD[scope]}`,
  }));
}

/**
 * The filter in force. One whose lines have all gone (untagged, or Undo)
 * reads as no filter, so the list can never sit empty under a word that no
 * longer shows.
 */
export function effectiveScopeFilter(
  filter: LineScope | null,
  lines: readonly ScopedLine[]
): LineScope | null {
  if (filter === null) return null;
  return lines.some(line => scopeOf(line) === filter) ? filter : null;
}

/** The lines a filter keeps: every line when there is none. */
export function filterByScope<L extends ScopedLine>(
  lines: readonly L[],
  filter: LineScope | null
): L[] {
  return filter === null
    ? [...lines]
    : lines.filter(line => scopeOf(line) === filter);
}
