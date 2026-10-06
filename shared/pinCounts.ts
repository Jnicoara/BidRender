/**
 * The counts on a bid, as `pinStylesForBid` (shared/pinLetters.ts) needs
 * them — each with the looks chosen at every level it inherits from.
 *
 * Pure, and in shared/ so the takeoff screen AND the takeoff CSV (its "Pin"
 * column, server/pinStyles.ts) read one rule — moved from client/src/lib on
 * 2026-10-06 for that. It holds the two lookups that are easy to get quietly
 * wrong:
 *
 * - THE ASSEMBLY is the company's own copy when one exists. Choosing a look
 *   on a shipped assembly forks it (`takeoffGroups.setLook`), but the count
 *   still points at the SHIPPED id — so reading the look off that id would
 *   find the shared row, which never carries it, and the choice would vanish
 *   on reload.
 * - THE SYMBOL is the captured legend item of the same name, by the key the
 *   server matches it with (`symbolLookupKey`), under its captured name or
 *   its current one — the same rule `setLook` uses, so the look saved is the
 *   look read.
 */
import { symbolLookupKey } from "./takeoffCounts";
import type { PinCount, PinLook } from "./pinLetters";

type Look = {
  markShape?: string | null;
  markLetter?: string | null;
  markColor?: string | null;
};

const fromRow = (row: Look | undefined): PinLook | null =>
  row
    ? { shape: row.markShape, letter: row.markLetter, color: row.markColor }
    : null;

export function pinCountsFor(
  groups: readonly {
    id: number;
    label: string;
    assemblyId: number | null;
    look?: PinLook | null;
  }[],
  assemblies: readonly ({
    id: number;
    name: string;
    category?: string | null;
    baselineId?: number | null;
  } & Look)[],
  symbols: readonly {
    label: string;
    lookupKey?: string | null;
    look?: PinLook | null;
  }[]
): PinCount[] {
  const byId = new Map(assemblies.map(a => [a.id, a] as const));
  // The company's own copy of a shipped assembly, by the shipped id.
  const forkOf = new Map(
    assemblies
      .filter(a => a.baselineId != null)
      .map(a => [a.baselineId as number, a] as const)
  );
  const symbolByKey = new Map<string, (typeof symbols)[number]>();
  for (const s of symbols) {
    symbolByKey.set(symbolLookupKey(s.label), s);
    if (s.lookupKey) symbolByKey.set(s.lookupKey, s);
  }
  return groups.map(g => {
    const assembly =
      g.assemblyId === null
        ? undefined
        : (forkOf.get(g.assemblyId) ?? byId.get(g.assemblyId));
    const symbol = symbolByKey.get(symbolLookupKey(g.label));
    return {
      id: g.id,
      label: g.label,
      assemblyName: assembly?.name ?? null,
      assemblyCategory: assembly?.category ?? null,
      chosen: {
        count: g.look ?? null,
        symbol: symbol?.look ?? null,
        assembly: fromRow(assembly),
      },
    };
  });
}
