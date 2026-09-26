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
 * ── Two sources, one list, and they OVERLAP since 2026-09-19 ────────────────
 * Stamps on a drawing and line items on the bid are both read, because a bid
 * can have either, both or neither, and a list built from one of them alone
 * would be short in a way nobody could see. Quick Bids have line items and no
 * plan; a takeoff in progress has stamps and no line items yet. Both are why
 * this works before any pricing exists.
 *
 * **This header used to say the two were independent — "stamping does not
 * create a line item".** That was true until the bridge shipped and it is not
 * true now: sending a count creates a line that points back at the group, so
 * the same fourteen exit signs are reachable down both paths at once. Reading
 * both without noticing would put twenty-eight on a supplier's desk.
 *
 * So the stamp loop below SKIPS any group that already reaches this list as a
 * bid line. The rule is one line of code, and it is load-bearing: this comment
 * is here because a stale assertion about what the code does is worse than no
 * comment at all — the next reader takes it as current and builds on it, which
 * is exactly how this document's § 2 came to specify an option that had already
 * been rejected by name.
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
import { groupStamps, stampName } from "../../shared/takeoffCounts";
import { circuitWire, totalQuantities } from "../../shared/takeoffQuantities";
import { verticalsForRunRow } from "../runVerticals";
import {
  aggregateMaterials,
  measuredEntries,
  type AssemblyMaterialQty,
  type CountedAssemblySource,
  type MaterialsListDoc,
} from "../../shared/materialsList";
import * as db from "../db";
import { footageByRunType } from "../runTypeFootage";
import { resolveRunType } from "../../shared/runTypeLookup";

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
          isBranchWhip: row.isBranchWhip,
        });
        byAssembly.set(row.assemblyId, list);
      }

      // ── Both sources, as one flat list of "this assembly, this many" ───────
      const sources: CountedAssemblySource[] = [];
      /*
        Two different reasons a counted thing cannot be itemised, kept apart.

        `gone` is an assembly deleted from the library since it was used: the
        bid keeps its snapshot name and nothing knows what it CONTAINED any more.
        `noParts` is an assembly still sitting in the library that contains no
        materials at all — a labour-only one, which the builder allows
        (assembliesRouter's materials default of []).

        They were one set until 2026-09-18, under a note that told the supplier
        the assembly was "no longer in the library". For a labour-only assembly
        that is simply false, and it is false on a document that leaves the app
        and gets read by somebody who cannot ask the screen a question. A
        supplier chasing a part that was never a part is the app lying about
        itself.
      */
      /*
        `noAssembly`, not "gone" — and the rename is the fix.

        Until 2026-09-26 this set was called `gone` and its note told the
        supplier each name was "no longer in the library". That was true of
        almost nothing in it: run-type lines (pipe, wire and fittings, which
        are read from the runs below), and free counts and lines priced by
        hand, which never had an assembly at all. A deleted assembly does land
        here too, but `assemblyId` is `set null` on delete, so it is
        indistinguishable from a line that never had one — and the note says
        exactly that much and no more.
      */
      const noAssembly = new Set<string>();
      const noParts = new Set<string>();

      for (const line of liveLines) {
        // Pipe, wire and fittings from traced runs are read from the runs
        // themselves below; listing the line too would count them twice.
        if (line.takeoffRunTypeId !== null) continue;
        const materials =
          line.assemblyId === null
            ? []
            : (byAssembly.get(line.assemblyId) ?? []);
        // Named in the notes rather than dropped, either way: a supplier
        // reading a short list cannot tell that something is missing from it.
        if (materials.length === 0) {
          (line.assemblyId === null ? noAssembly : noParts).add(line.name);
          continue;
        }
        sources.push({
          name: line.name,
          count: Number(line.qty),
          materials,
        });
      }

      /*
        Groups that already reach this list through a BID LINE.

        THE DOUBLE COUNT THIS ROUTER WOULD OTHERWISE HAVE. Until 2026-09-19 the
        two sources above were genuinely independent — stamping did not create a
        line item — so reading both could not overlap. The bridge makes them
        overlap exactly: a sent count is fourteen marks AND a line of fourteen,
        and adding both would send a supplier a request for twenty-eight.

        The line wins rather than the marks, because it is the same quantity
        resolved from the same marks (`withPlanCounts` in server/db.ts) and it
        is the row that carries the name the estimator gave it.
      */
      const countedOnBid = new Set(
        liveLines
          .map(line => line.takeoffGroupId)
          .filter((id): id is number => id !== null)
      );

      for (const group of groupStamps(
        stamps.map(stamp => ({
          id: stamp.id,
          sheetId: stamp.sheetId,
          groupId: stamp.groupId,
          name: stampName(stamp),
          assemblyId: stamp.assemblyId,
          x: Number(stamp.x),
          y: Number(stamp.y),
        }))
      )) {
        if (group.groupId !== null && countedOnBid.has(group.groupId)) continue;
        const materials =
          group.assemblyId === null
            ? []
            : (byAssembly.get(group.assemblyId) ?? []);
        if (materials.length === 0) {
          (group.assemblyId === null ? noAssembly : noParts).add(group.name);
          continue;
        }
        sources.push({
          name: group.name,
          count: group.count,
          materials,
        });
      }

      /*
        The per-job whip dial reaches the branch-wire lines and nothing else.

        A building laid out tighter or looser changes the cable between devices;
        it does not change how many boxes or plates get bought, and it never
        touches the measured footage below — that is § 5a, and it is why the
        dial is an argument here rather than something applied to the finished
        totals where it could not tell the two apart.
      */
      /*
        FITTINGS COUNTED FROM THE TRACE — couplings, connectors and straps —
        as ordinary orderable lines, so the CSV, the PDF and the dialog all
        carry them with no change of their own. One source per run TYPE, so a
        coupling used by two types reads "from" both, and it merges with the
        same part inside any assembly by name, like every other material.

        From every traced conduit type on the job, whether or not it was sent
        to the bid — the same scope as the measured footage below, so the
        pipe and its fittings describe the same runs.

        What cannot be listed is SAID: a count with no catalog match, or one
        that could not be counted, goes into the notes by name. A minimum
        ("at least") is said too, since it reaches a supplier as a number.
      */
      const fittingShortfalls: string[] = [];
      const footage = await footageByRunType(
        input.bidId,
        ctx.scope.dataUserId,
        bid.distributionHeightInches
      );
      const fittingsByType = await db.fittingRowsByRunType(
        ctx.scope.dataUserId,
        footage
      );
      if (fittingsByType.size > 0) {
        const palette = await db.getRunTypesFor(ctx.scope.dataUserId, true);
        const minimums: string[] = [];
        const unmatched: string[] = [];
        const uncounted: string[] = [];
        fittingsByType.forEach((rows, runTypeId) => {
          const label =
            resolveRunType(palette, runTypeId)?.label ?? "A traced run type";
          for (const row of rows) {
            if (
              row.count.status === "unknown" &&
              footage.get(runTypeId)?.legs.length
            ) {
              uncounted.push(`${label} ${row.role}s — ${row.count.why}`);
              continue;
            }
            if (row.count.status !== "counted" || row.qty <= 0) continue;
            if (!row.pick.ok) {
              unmatched.push(
                `${row.qty} ${row.role}s for ${label} (${row.pick.why})`
              );
              continue;
            }
            if (row.count.atLeast) minimums.push(row.pick.name);
            sources.push({
              name: `${label} (counted from traced runs)`,
              count: row.qty,
              materials: [
                {
                  name: row.pick.name,
                  unit: "each",
                  category: "Conduit Fittings",
                  qty: 1,
                  isBranchWhip: false,
                },
              ],
            });
          }
        });
        if (minimums.length > 0) {
          fittingShortfalls.push(
            `Minimums, not totals — some traced runs have a drop with no height, so these are counted over a length that is short: ${Array.from(new Set(minimums)).join(", ")}.`
          );
        }
        if (unmatched.length > 0) {
          fittingShortfalls.push(
            `Counted but not listed, because no catalog part matches: ${unmatched.join("; ")}.`
          );
        }
        if (uncounted.length > 0) {
          fittingShortfalls.push(`Not counted: ${uncounted.join("; ")}.`);
        }
      }

      const entries = aggregateMaterials(sources, Number(bid.whipAdjustPct));

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
      // Verticals reach the bill of materials through the same resolver the
      // takeoff panel uses, so the two cannot report different footage.
      const heights = await db.heightContextForBid(
        input.bidId,
        ctx.scope.dataUserId,
        bid.distributionHeightInches
      );
      const totals = totalQuantities(
        realRuns.map(run => {
          const sheet = scales.get(run.sheetId);
          const usable =
            sheet && !(sheet.notToScale && sheet.scaleSource !== "manual")
              ? sheet.scaleRatio
              : null;
          return {
            run: { pathType: run.pathType, points: run.points },
            circuits: (circuitsByRun.get(run.id) ?? []).map(circuitWire),
            ratio: usable,
            verticals: verticalsForRunRow(run, heights),
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
      if (noAssembly.size > 0) {
        notes.push(
          `Counted on this job but not itemised, because no assembly says what ${
            noAssembly.size === 1 ? "it is" : "they are"
          } made of — a count or line with no assembly, or one whose assembly was since deleted: ${Array.from(
            noAssembly
          ).join(", ")}.`
        );
      }
      if (fittingShortfalls.length > 0) {
        notes.push(...fittingShortfalls);
      }
      if (noParts.size > 0) {
        notes.push(
          `Counted on this job but not itemised, because ${
            noParts.size === 1 ? "it contains" : "they contain"
          } no materials — ${
            noParts.size === 1 ? "it is" : "they are"
          } labor only: ${Array.from(noParts).join(", ")}.`
        );
      }
      /*
       * Say what the vertical share of these totals is, or that there is none.
       *
       * This list leaves the app — it gets printed, mailed, and read by
       * somebody who cannot ask the screen a question. A number that travels
       * has to carry its own explanation, and "no drops are in this" is the
       * half a reader would never think to ask about.
       */
      const verticalFeet =
        Math.round(
          (totals.conduitVerticalFeet + totals.cableVerticalFeet) * 100
        ) / 100;
      if (verticalFeet > 0) {
        notes.push(
          "Includes " +
            verticalFeet.toLocaleString("en-US", {
              maximumFractionDigits: 2,
            }) +
            " ft of vertical raceway — the drops and rises at the ends of " +
            "traced runs, which a traced line does not measure."
        );
      } else if (totals.flatOnlyCount > 0) {
        notes.push(
          "No vertical footage is included: " +
            totals.flatOnlyCount +
            (totals.flatOnlyCount === 1
              ? " traced run is"
              : " traced runs are") +
            " counted flat only. Drops and rises come from the mounting " +
            "heights in Settings."
        );
      }

      /*
        A SHORTFALL IS NOT AN ALTERNATIVE TO A FIGURE — it is said ALONGSIDE
        one, which is why this is its own `if` and not another `else`.

        The branch above reads "includes N ft of vertical raceway" and stops
        there, so a list whose drops are half-counted went to a supplier
        carrying a confident number and no hint that it was low. Both
        sentences are true at once whenever some runs are finished and others
        are not, and the quantity on this page is what somebody orders from.
      */
      if (totals.partialVerticalCount > 0) {
        notes.push(
          "Vertical footage is INCOMPLETE: " +
            totals.partialVerticalCount +
            (totals.partialVerticalCount === 1
              ? " traced run has"
              : " traced runs have") +
            " only one end counted, so the raceway and wire above are short " +
            "by the drops still missing. Set the mounting heights for those " +
            "ends before ordering."
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
