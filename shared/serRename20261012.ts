/**
 * The SER / SEU naming change, 2026-10-12 — owner-approved change to the
 * frozen names. Name each cable the way supply houses list it:
 *
 *   - copper SER by the SHORT form: "6/3 SER Copper";
 *   - aluminum SER by the full set: "2-2-2-4 SER Aluminum" (unchanged);
 *   - SEU by the full set: "4-4-6 SEU Aluminum" (unchanged).
 *
 * So only the five copper SER rows are renamed. Applied like the 2026-10-09
 * reality check: `latestCatalogName` (shared/renamedMaterials.ts) follows
 * this last, so every older spelling — "8-3 SER CU", "8-8-8-8 SER CU",
 * "8-8-8-8 SER Copper" — points STRAIGHT at the new name (no chains), and the
 * seed renames each row IN PLACE, same id, so any bid line, recipe or stamp
 * that points at it still does.
 *
 * Record (old -> new, descriptions, search words, what was checked):
 * references/ser-rename-plan.md. Seed: server/seed/materials/wireAndCable.ts.
 */
export const SER_RENAMES_2026_10_12: Readonly<Record<string, string>> = {
  "8-8-8-8 SER Copper": "8/3 SER Copper",
  "6-6-6-6 SER Copper": "6/3 SER Copper",
  "4-4-4-6 SER Copper": "4/3 SER Copper",
  "2-2-2-4 SER Copper": "2/3 SER Copper",
  "1-1-1-3 SER Copper": "1/3 SER Copper",
};
