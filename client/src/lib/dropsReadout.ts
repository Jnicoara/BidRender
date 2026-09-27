/**
 * The bid's drops, grouped for the readout (D21, answer 6): by what they drop
 * to, with how many, how much, and how many came from each kind of trace.
 *
 * Pure and in `client/src/lib` so the suite can reach it. The server decides
 * WHICH drops count (`takeoffRuns.drops`); this only arranges them, and never
 * re-derives a foot of them.
 */
export type ReadoutDrop = {
  runId: number;
  kind: string;
  label: string;
  direction: "rise" | "drop";
  feet: number;
  source: "route" | "quantity";
};

export type DropGroup<T extends ReadoutDrop> = {
  kind: string;
  label: string;
  count: number;
  feet: number;
  /** How many came from route runs and how many from quantity traces. */
  fromRoute: number;
  fromQuantity: number;
  /** Every drop of this kind, largest first, so the odd one stands out. */
  items: T[];
};

export function groupDrops<T extends ReadoutDrop>(
  drops: readonly T[]
): { groups: DropGroup<T>[]; count: number; feet: number } {
  const byKind = new Map<string, DropGroup<T>>();
  for (const drop of drops) {
    let group = byKind.get(drop.kind);
    if (!group) {
      group = {
        kind: drop.kind,
        label: drop.label,
        count: 0,
        feet: 0,
        fromRoute: 0,
        fromQuantity: 0,
        items: [],
      };
      byKind.set(drop.kind, group);
    }
    group.count++;
    group.feet += drop.feet;
    if (drop.source === "route") group.fromRoute++;
    else group.fromQuantity++;
    group.items.push(drop);
  }
  const groups = Array.from(byKind.values())
    .map(group => ({
      ...group,
      feet: round2(group.feet),
      items: [...group.items].sort((a, b) => b.feet - a.feet),
    }))
    // The biggest share of the footage first: that is what a reader checks.
    .sort((a, b) => b.feet - a.feet || a.label.localeCompare(b.label));
  return {
    groups,
    count: drops.length,
    feet: round2(drops.reduce((sum, drop) => sum + drop.feet, 0)),
  };
}

/** "18 route, 6 quantity" — or just the one that applies. */
export function sourceSplit(group: {
  fromRoute: number;
  fromQuantity: number;
}): string {
  const parts: string[] = [];
  if (group.fromRoute > 0) parts.push(`${group.fromRoute} route`);
  if (group.fromQuantity > 0) parts.push(`${group.fromQuantity} quantity`);
  return parts.join(", ");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
