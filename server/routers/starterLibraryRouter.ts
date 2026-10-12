/**
 * THE BASELINE SCREEN'S READS (baseline-screen-plan.md § 1, § 11: Track B
 * builds the screen). What the shipped starter holds today: materials,
 * assemblies with their parts, labor rates and run types.
 *
 * ── Read only, on purpose, until the change log exists ──────────────────────
 * Every starter change must be pinned, logged and offered (§ 2, § 4), and the
 * tables for that are BS-M3 to BS-M6, not applied yet. A write here before
 * them would be a change no company is protected from and nobody can undo.
 * `references/track-b-handoff.md` lists what waits on them.
 *
 * ── Every route is `starterEditorProcedure` ─────────────────────────────────
 * Never the public, protected, admin or a company builder (not even named in
 * a comment — the check reads the source): the starter editor has no
 * company, and a company login must open nothing here.
 * `server/scopeDiscipline.test.ts` (STARTER_ONLY) fails this file if any
 * other builder appears in it, and `server/starterLibrary.test.ts` calls
 * every route without a finished starter session.
 *
 * ── Shared rows only ────────────────────────────────────────────────────────
 * The db reads are `userId IS NULL` (server/db.ts, "The starter, as the
 * baseline screen reads it"). A company's own copy is that company's data.
 *
 * Mapped by hand, field by field: these feed a SCREEN (CLAUDE.md § "Where to
 * be structural, and where to be explicit"), and a NULL hour stays NULL —
 * a measurement nobody set must never arrive as 0.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { starterEditorProcedure } from "./starterAuthRouter";
import { sortMaterialsForDisplay } from "../../shared/materialOrder";
import { needsPricing } from "../../shared/materialPricing";
import { hourlyCostOf } from "../../shared/laborRateLookup";
import { needsRate } from "../../shared/laborRatePricing";
import { assemblyHours } from "../../shared/assemblyHours";

/** A decimal column that may be unset: NULL stays NULL, never 0. */
function decimalOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const starterLibraryRouter = router({
  /** The shipped catalog, in the order every material list shows it. */
  materials: starterEditorProcedure.query(async () => {
    const rows = sortMaterialsForDisplay(await db.getStarterMaterials());
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      unitOfSale: row.unitOfSale,
      costPerUnit: Number(row.costPerUnit),
      notPriced: needsPricing(row.costPerUnit),
      isExamplePrice: row.isExamplePrice === true,
      laborHours: decimalOrNull(row.laborHours),
      isExampleLaborHours: row.isExampleLaborHours === true,
      isSpecialty: row.isSpecialty === true,
      searchAliases: row.searchAliases,
      description: row.description,
      version: row.version,
    }));
  }),

  /** The shipped assemblies, by name. */
  assemblies: starterEditorProcedure.query(async () => {
    const rows = await db.getStarterAssemblies();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      trade: row.trade,
      projectType: row.projectType,
      baseLaborHours: assemblyHours(row.baseLaborHours),
      overheadLaborHours: Number(row.overheadLaborHours),
      isExampleHours: row.isExampleHours === true,
      laborOnly: row.laborOnly === true,
      laborRateId: row.laborRateId,
      version: row.version,
    }));
  }),

  /** One shipped assembly with its parts. A company's assembly is NOT_FOUND. */
  assembly: starterEditorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const row = await db.getStarterAssemblyById(input.id);
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No starter assembly has that id.",
        });
      const parts = await db.getStarterAssemblyParts(row.id);
      return {
        id: row.id,
        name: row.name,
        removeLaborHours: decimalOrNull(row.removeLaborHours),
        relocateLaborHours: decimalOrNull(row.relocateLaborHours),
        mountHeightTypeKey: row.mountHeightTypeKey,
        parts: parts.map(part => ({
          lineId: part.lineId,
          materialId: part.materialId,
          /** NULL: the line points at a row that is not a starter material. */
          name: part.name,
          qty: Number(part.qty),
          unitOfSale: part.unitOfSale,
          costPerUnit: decimalOrNull(part.costPerUnit),
          isExamplePrice: part.isExamplePrice === true,
          overrideLaborHours: decimalOrNull(part.overrideLaborHours),
        })),
      };
    }),

  /** The shipped roles and their rates. */
  laborRates: starterEditorProcedure.query(async () => {
    const rows = await db.getStarterLaborRates();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      trade: row.trade,
      rateType: row.rateType,
      hourlyRate: hourlyCostOf(row),
      needsRate: needsRate(row),
      isExampleRate: row.isExampleRate === true,
      version: row.version,
    }));
  }),

  /** The shipped run types and the parts each one names. */
  runTypes: starterEditorProcedure.query(async () => {
    const [rows, catalog] = await Promise.all([
      db.getStarterRunTypes(),
      db.getStarterMaterials(),
    ]);
    const nameOf = new Map(catalog.map(m => [m.id, m.name]));
    const named = (id: number | null) =>
      id === null ? null : (nameOf.get(id) ?? null);
    return rows.map(row => ({
      id: row.id,
      label: row.label,
      pathType: row.pathType,
      raceway: named(row.racewayMaterialId),
      conductor: named(row.conductorMaterialId),
      conductorCount: row.conductorCount,
      groundCount: row.groundCount,
      fittingStyle: row.fittingStyle,
      conduitExtraPct: decimalOrNull(row.conduitExtraPct),
      wireExtraPct: decimalOrNull(row.wireExtraPct),
      version: row.version,
    }));
  }),
});
