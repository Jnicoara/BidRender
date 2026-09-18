/**
 * The materials list a bid can send to a supplier for a quote.
 *
 * ── Why this is its own router and not a mode of the proposal ────────────────
 * The proposal is a customer document and carries money on purpose. This is a
 * supplier document and must never carry any. They differ in audience, in
 * content and in what a mistake costs, so they are built by different code
 * reading different queries. A shared builder with a "hide prices" switch would
 * put the contractor's cost and margin one wrong argument away from the people
 * they buy from — and switches get flipped by refactors that never read this
 * comment.
 *
 * The type system carries the guarantee rather than this comment: the procedure
 * returns `MaterialsListDoc`, whose entries have a name, a unit and a quantity
 * and no field a price could go in. It is filled from
 * `getAssemblyMaterialQuantities`, which does not select `costPerUnit` at all.
 * There is no point in this path where a cost is in scope and chosen against.
 *
 * ── Two sources, one list ────────────────────────────────────────────────────
 * Stamps on a drawing and line items on the bid are independent — stamping does
 * not create a line item — so a bid can have either, both or neither, and a
 * list built from one of them alone would be short in a way nobody could see.
 * Quick Bids have line items and no plan; a takeoff in progress has stamps and
 * no line items yet. Both are read, and both are why this works before any
 * pricing exists.
 *
 * ── It never requires a price to exist ───────────────────────────────────────
 * Nothing here touches labor rates, company defaults, tax or the bid rollup, so
 * an unpriced bid produces exactly the same list as a finished one. That is the
 * point: a contractor gets the supplier's numbers BEFORE they can price the
 * job, and a list that waited for pricing would be useless in the one moment it
 * is most needed.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import { groupStamps } from "../../shared/takeoffCounts";
import { NO_VERTICALS, totalQuantities } from "../../shared/takeoffQuantities";
import {
  aggregateMaterials,
  measuredEntries,
  type AssemblyMaterialQty,
  type CountedAssemblySource,
  type MaterialsListDoc,
} from "../../shared/materialsList";
import * as db from "../db";

/**
 * This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("bids.view", "bids.edit");

export const materialsListRouter = router({
  /**
   * The whole document for one bid.
   *
   * Returns the same shape whether the bid is empty, half-taken-off or
   * finished, so the caller never has to branch on completeness — an empty list
   * is a document with no entries, not an error.
   */
  get: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }): Promise<MaterialsListDoc> => {
      const bid = await db.getBidById(input.bidId, ctx.scope.dataUserId);
      if (!bid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

      const [lineItems, stamps, runs] = await Promise.all([
        db.getBidLineItems(input.bidId),
        db.getStampsForBid(input.bidId, ctx.scope.dataUserId),
        db.getRunsForBid(input.bidId, ctx.scope.dataUserId),
      ]);

      // ── What each assembly is made of ──────────────────────────────────────
      // One query for every assembly involved, rather than one per line.
      const liveLines = lineItems.filter(line => line.archivedAt === null);
      const assemblyIds = Array.from(
        new Set(
          [
            ...liveLines.map(line => line.assemblyId),
            ...stamps.map(stamp => stamp.assemblyId),
          ].filter((id): id is number => id !== null)
        )
      );
      const materialRows = await db.getAssemblyMaterialQuantities(assemblyIds);

      const byAssembly = new Map<number, AssemblyMaterialQty[]>();
      for (const row of materialRows) {
        const list = byAssembly.get(row.assemblyId) ?? [];
        list.push({
          name: row.name,
          unit: row.unitOfSale,
          category: row.category,
          qty: Number(row.qty),
        });
        byAssembly.set(row.assemblyId, list);
      }

      // ── Both sources, as one flat list of "this assembly, this many" ───────
      const sources: CountedAssemblySource[] = [];
      const orphaned = new Set<string>();

      for (const line of liveLines) {
        const materials =
          line.assemblyId === null
            ? []
            : (byAssembly.get(line.assemblyId) ?? []);
        // An assembly deleted from the library since it was added keeps its
        // snapshot name on the bid, but nothing knows what it CONTAINS any
        // more. It is named in the notes rather than dropped, because a
        // supplier reading a short list cannot tell that something is missing.
        if (materials.length === 0) {
          orphaned.add(line.name);
          continue;
        }
        sources.push({
          name: line.name,
          count: Number(line.qty),
          materials,
        });
      }

      for (const group of groupStamps(
        stamps.map(stamp => ({
          id: stamp.id,
          sheetId: stamp.sheetId,
          assemblyId: stamp.assemblyId,
          assemblyName: stamp.assemblyName,
          x: Number(stamp.x),
          y: Number(stamp.y),
        }))
      )) {
        const materials =
          group.assemblyId === null
            ? []
            : (byAssembly.get(group.assemblyId) ?? []);
        if (materials.length === 0) {
          orphaned.add(group.name);
          continue;
        }
        sources.push({
          name: group.name,
          count: group.count,
          materials,
        });
      }

      const entries = aggregateMaterials(sources);

      // ── Traced runs: footage, kept apart from the counted materials ────────
      const scales = await db.getSheetScalesForBid(
        input.bidId,
        ctx.scope.dataUserId
      );
      const circuits = await db.getCircuitsForRuns(
        runs.map(run => run.id),
        ctx.scope.dataUserId
      );
      const circuitsByRun = new Map<number, typeof circuits>();
      for (const circuit of circuits) {
        const list = circuitsByRun.get(circuit.runId) ?? [];
        list.push(circuit);
        circuitsByRun.set(circuit.runId, list);
      }

      // A suggested run is not counted, for the same reason it is not counted
      // anywhere else: it is the app's guess until a person accepts it.
      const realRuns = runs.filter(run => !run.isSuggestion);
      const totals = totalQuantities(
        realRuns.map(run => {
          const sheet = scales.get(run.sheetId);
          const usable =
            sheet && !(sheet.notToScale && sheet.scaleSource !== "manual")
              ? sheet.scaleRatio
              : null;
          return {
            run: { pathType: run.pathType, points: run.points },
            circuits: (circuitsByRun.get(run.id) ?? []).map(circuit => ({
              name: circuit.name,
              conductorCount: circuit.conductorCount,
            })),
            ratio: usable,
            // No heights yet: Phase 5 step 2 brings the settings a vertical is
            // resolved from. Stated rather than defaulted — see NO_VERTICALS.
            verticals: NO_VERTICALS,
          };
        })
      );

      // ── Notes: everything the reader needs to read the list correctly ──────
      const notes: string[] = [];
      if (totals.unmeasurableCount > 0) {
        notes.push(
          `${totals.unmeasurableCount} traced ${
            totals.unmeasurableCount === 1 ? "run is" : "runs are"
          } on ${
            totals.unmeasurableCount === 1 ? "a sheet" : "sheets"
          } with no usable scale, so ${
            totals.unmeasurableCount === 1 ? "its" : "their"
          } length is not included above.`
        );
      }
      if (orphaned.size > 0) {
        notes.push(
          `Not itemised, because the assembly is no longer in the library: ${Array.from(
            orphaned
          ).join(", ")}.`
        );
      }
      notes.push(
        "Quantities are taken off the drawings and carry no allowance for waste, " +
          "spoilage or cut lengths unless the assemblies already include it."
      );

      return {
        bidName: bid.name,
        jobAddress: bid.siteAddress?.trim() ? bid.siteAddress.trim() : null,
        preparedOn: new Date(),
        entries,
        measured: measuredEntries(totals),
        notes,
      };
    }),
});
