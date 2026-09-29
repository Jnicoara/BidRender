/**
 * HOW MANY a line's LABOUR is on — the one place `laborQty ?? qty` is written.
 *
 * Owner, 2026-09-28 (references/track-b-held-migrations-plan.md, Q5): on a
 * line of traced footage, EXTRA is material only. The pipe and wire bought to
 * cover it are real and priced, but nobody installs a percentage — the labour
 * is on the INSTALLED footage (flat, vertical and makeup). So such a line
 * carries two quantities: `qty`, what is bought, and `laborQty`, what is
 * installed (0093).
 *
 * Every other line — an assembly, a count, a typed price, a fitting — stores
 * `laborQty` NULL, and its labour is on its `qty` exactly as before 0093. That
 * is what keeps every existing bid's hours where they were.
 *
 * The SQL twin is `lineLaborQtySql` in server/db.ts. A hand-written
 * `line.qty` beside hours anywhere else is the bug this file exists to stop:
 * it would charge install hours on footage nobody installs.
 */
export function laborQtyOf(line: {
  qty: string | number;
  laborQty: string | number | null;
}): number {
  return Number(line.laborQty ?? line.qty);
}
