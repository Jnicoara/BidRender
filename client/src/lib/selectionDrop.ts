/**
 * WHAT THE SELECTED MARKS SAY ABOUT THEIR DROPS — for the selection pill's
 * height field and its "No drop on these" button
 * (references/vertical-drops-plan.md § 2).
 *
 * The height shown is the one height every selected mark shares. When they
 * differ the field shows nothing and says "heights differ": showing the
 * first mark's height would read as "these are all at 4'-6"", and saving
 * over it would then look like no change.
 */
export type SelectionDrop = {
  /** The shared own height, or null (none set, or they differ). */
  inches: number | null;
  mixed: boolean;
  /** How many have their drop left off. */
  excluded: number;
};

export function selectionDrop(
  marks: readonly {
    id: number;
    mountHeightInches: number | null;
    dropExcluded: boolean;
  }[],
  selected: ReadonlySet<number>
): SelectionDrop | undefined {
  const picked = marks.filter(m => selected.has(m.id));
  if (picked.length === 0) return undefined;
  const heights = new Set(picked.map(m => m.mountHeightInches));
  const mixed = heights.size > 1;
  return {
    inches: mixed ? null : picked[0].mountHeightInches,
    mixed,
    excluded: picked.filter(m => m.dropExcluded).length,
  };
}
