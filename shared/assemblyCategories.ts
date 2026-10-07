/**
 * The assembly shelves, in the order screens list them — ONE copy for every
 * screen, checked against the schema by `server/assemblyCategories.test.ts`.
 *
 * ── Why this exists (staging spot-check, 2026-10-07) ─────────────────────────
 * Migration 0122 added "Demo & Retrofit" and "General" to
 * `assemblies.category`, and 29 starter assemblies seeded into them. The
 * Library screen grouped rows by its OWN hand-kept copy of the five old
 * categories and kept only those groups — so the 29 were simply not on the
 * screen: 138 rows shown, 167 in the database, nothing said. Two other
 * screens held the same copy. The client cannot import drizzle at runtime
 * (it would pull the ORM into the bundle), so the list is a plain array here
 * and a test pins it to the schema — the same arrangement as
 * shared/materialOrder.ts for material shelves.
 */
export const ASSEMBLY_CATEGORY_ORDER = [
  "Devices",
  "Lighting",
  "Panels",
  "Equipment Connections",
  "Low Voltage/EMS",
  // 0122 (starter-assemblies-plan.md D3).
  "Demo & Retrofit",
  "General",
] as const;

export type AssemblyCategoryName = (typeof ASSEMBLY_CATEGORY_ORDER)[number];

/**
 * Rows grouped by shelf, in shelf order, empty shelves left out.
 *
 * A category NOT on the list is still shown — as its own group after the
 * listed ones — never dropped. The list going stale must cost an odd order,
 * not missing rows.
 */
export function groupByCategory<T extends { category: string }>(
  items: readonly T[]
): { category: string; items: T[] }[] {
  const byCategory = new Map<string, T[]>();
  for (const item of items) {
    const bucket = byCategory.get(item.category);
    if (bucket) bucket.push(item);
    else byCategory.set(item.category, [item]);
  }
  const listed: readonly string[] = ASSEMBLY_CATEGORY_ORDER;
  const unlisted = Array.from(byCategory.keys())
    .filter(category => !listed.includes(category))
    .sort();
  return [...listed, ...unlisted]
    .map(category => ({ category, items: byCategory.get(category) ?? [] }))
    .filter(group => group.items.length > 0);
}
