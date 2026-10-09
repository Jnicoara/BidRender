/**
 * The coverage check's catalog adds (owner-approved, 2026-10-09;
 * references/coverage-check.md on track-c, "Missing catalog items" and
 * "New missing catalog items"). Additive only — nothing renamed or retired.
 *
 * The rows themselves live in their family modules under
 * server/seed/materials/; this is the record of which names came from the
 * check, so a test that holds a shelf to a decided list (the Wire & Cable
 * names, server/materialNaming.test.ts) can read them as decided too.
 * server/coverageCheckRows.test.ts checks every one ships.
 *
 * "CT cabinet" is not here: it already ships as "Current transformer
 * cabinet" (Specialty since the catalog review).
 */

/** The two Wire & Cable adds, named by the 2026-10-07 wire rules. */
export const COVERAGE_CHECK_WIRE_ADDS: readonly string[] = [
  "4/3 NM-B Copper",
  "12/2 MC cable healthcare (HCF) Copper",
];
