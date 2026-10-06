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
import {
  circuitWire,
  totalQuantities,
  tracedRunOf,
} from "../../shared/takeoffQuantities";
import { extrasForRunRow, verticalsForRunRow } from "../runVerticals";
import { markDropEntries } from "../../shared/groupDrops";
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
import { unmatchedKindWords } from "../../shared/runFittings";
import { isBendRole } from "../../shared/runBends";
import { isTeeRole, rootOf } from "../../shared/runNetwork";
import { runOnBid } from "../../shared/runOnBid";
import { quantityTraceSummary } from "../../shared/quantityDrops";

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

      const [lineItems, stamps, runs, groups] = await Promise.all([
        db.getBidLineItems(input.bidId),
        db.getStampsForBid(input.bidId, ctx.scope.dataUserId),
        db.getRunsForBid(input.bidId, ctx.scope.dataUserId),
        db.getGroupsForBid(input.bidId, ctx.scope.dataUserId),
      ]);

      /*
        COUNTS MADE WITH NO ASSEMBLY — "Supplier to price" (legend plan § 8a).

        A count that was only ever a name ("A1 luminaire") is exactly what a
        lighting or gear package is: the supplier prices it, the app never
        knew its parts. Until 2026-09-30 it went into the "not itemised" note,
        which a supplier reads as an apology rather than a line to quote.

        Decided by the GROUP's kind, not by a NULL assemblyId: a count whose
        assembly was deleted also has none, and that one is a gap to explain
        (the note below), not a package to quote.
      */
      const counterOnly = new Set(
        groups
          .filter(group => group.kind === "plain" || group.kind === "typed")
          .map(group => group.id)
      );
      const forQuote: MaterialsListDoc["forQuote"] = [];

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
        if (
          line.assemblyId === null &&
          line.takeoffGroupId !== null &&
          counterOnly.has(line.takeoffGroupId)
        ) {
          forQuote.push({
            name: line.name,
            qty: Number(line.qty),
            unit: "each",
          });
          continue;
        }
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
          // An existing device is not bought (shared/markStatus.ts).
          status: stamp.status,
        }))
      )) {
        if (group.groupId !== null && countedOnBid.has(group.groupId)) continue;
        if (
          group.assemblyId === null &&
          group.groupId !== null &&
          counterOnly.has(group.groupId)
        ) {
          forQuote.push({ name: group.name, qty: group.count, unit: "each" });
          continue;
        }
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
        const bendMinimums: string[] = [];
        const teeMinimums: string[] = [];
        const unmatched: string[] = [];
        const uncounted: string[] = [];
        fittingsByType.forEach((rows, runTypeId) => {
          const label =
            resolveRunType(palette, runTypeId)?.label ?? "A traced run type";
          for (const row of rows) {
            /*
              A FIELD BEND is labor, not a part. Its line points at the
              raceway, so listing it would order "7 × 3/4" EMT" — pipe, by
              the each, on top of the pipe already listed by the foot.
            */
            if (row.role === "fieldBend") continue;
            // Used only on lines with no part matched — "90° bends", not
            // "elbows", beside a type that may buy sweeps (runFittings.ts).
            const kind = unmatchedKindWords(row.role).many;
            // Cable legs too (§ R1): an MC type's straps on an unscaled
            // sheet are uncountable, and the supplier is told so.
            const traced =
              (footage.get(runTypeId)?.legs.length ?? 0) +
              (footage.get(runTypeId)?.cableLegs.length ?? 0);
            if (row.count.status === "unknown" && traced > 0) {
              uncounted.push(`${label} ${kind} — ${row.count.why}`);
              continue;
            }
            if (row.count.status !== "counted" || row.qty <= 0) continue;
            if (!row.pick.ok) {
              unmatched.push(
                `${row.qty} ${kind} for ${label} (${row.pick.why})`
              );
              continue;
            }
            // A bend count is a floor for a different reason than a short
            // drop: the plans never show the kicks and offsets at boxes.
            if (row.count.atLeast) {
              if (isBendRole(row.role)) bendMinimums.push(row.pick.name);
              else if (isTeeRole(row.role)) teeMinimums.push(row.pick.name);
              else minimums.push(row.pick.name);
            }
            sources.push({
              name: `${label} (counted from traced runs)`,
              count: row.qty,
              materials: [
                {
                  name: row.pick.name,
                  unit: "each",
                  // A tee box is a box, and is ordered with the boxes (D20).
                  category: isTeeRole(row.role) ? "Boxes" : "Conduit Fittings",
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
        if (bendMinimums.length > 0) {
          fittingShortfalls.push(
            `Minimums, not totals — elbows are counted from the corners and drops on the drawing, and plans do not show the kicks and offsets at boxes: ${Array.from(new Set(bendMinimums)).join(", ")}.`
          );
        }
        if (teeMinimums.length > 0) {
          fittingShortfalls.push(
            `Minimums, not totals — a branch tee on the drawing has no box chosen yet, so it is not in these: ${Array.from(new Set(teeMinimums)).join(", ")}.`
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
      // A quantity trace's wire comes from its type (D21).
      const circuitsByRun = await db.getWireCircuitsForRuns(
        runs,
        ctx.scope.dataUserId
      );

      // The runs THE BID prices, by the one rule every reading asks
      // (shared/runOnBid.ts; owner, 2026-09-27). Until then this counted every
      // run that was not a suggestion — runs with no type, which the bid
      // cannot price, and branch wiring's wire, which the devices' whips
      // already carry and this same list already itemises from the devices.
      const judged = runs.map(run => ({ run, on: runOnBid(run) }));
      const realRuns = judged.filter(j => j.on.footage).map(j => j.run);
      const wireCounts = new Set(
        judged.filter(j => j.on.wire).map(j => j.run.id)
      );
      const untypedRuns = new Set(
        judged.filter(j => j.on.leftOut === "noType").map(j => rootOf(j.run))
      ).size;
      // Verticals reach the bill of materials through the same resolver the
      // takeoff panel uses, so the two cannot report different footage.
      const heights = await db.heightContextForBid(
        input.bidId,
        ctx.scope.dataUserId,
        bid.distributionHeightInches
      );
      // Drops from counted marks (§ 3) — what the bid prices, so the list a
      // supplier orders from has them too. Claimed against every run.
      const markDrops = markDropEntries(
        await db.loadGroupDrops(
          input.bidId,
          ctx.scope.dataUserId,
          heights,
          runs,
          scales
        )
      );
      const totals = totalQuantities(
        realRuns.map(run => {
          const sheet = scales.get(run.sheetId);
          const usable =
            sheet && !(sheet.notToScale && sheet.scaleSource !== "manual")
              ? sheet.scaleRatio
              : null;
          return {
            run: tracedRunOf(run),
            circuits: wireCounts.has(run.id)
              ? (circuitsByRun.get(run.id) ?? []).map(circuitWire)
              : [],
            ratio: usable,
            verticals: verticalsForRunRow(run, heights),
            extras: extrasForRunRow(run, heights),
            // A branched run is several rows and ONE run in the notes (D20).
            runKey: rootOf(run),
          };
        }),
        markDrops
      );

      // ── Notes: everything the reader needs to read the list correctly ──────
      const notes: string[] = [];
      // Drops to counted devices, and the fittings NOT counted for them (Q8):
      // this list is what somebody orders from, so it says what is missing.
      if (totals.markDropCount > 0) {
        notes.push(
          `Includes ${totals.markDropCount} ${
            totals.markDropCount === 1 ? "drop" : "drops"
          } to counted devices (${totals.markDropFeet.toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })} ft of raceway or cable). Connectors and elbows for those drops are NOT counted — add them by hand.`
        );
      }
      if (untypedRuns > 0) {
        notes.push(
          `${untypedRuns} traced ${
            untypedRuns === 1 ? "run has" : "runs have"
          } no run type, so ${
            untypedRuns === 1 ? "it is" : "they are"
          } not in this list or on the bid. Give ${
            untypedRuns === 1 ? "it" : "each"
          } a type on the Plans screen.`
        );
      }
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
      // Quantity traces are flat by choice (D21); said on its own, since a
      // total can include route drops and still carry none of these.
      const quantity = quantityTraceSummary(realRuns);
      if (quantity.openEnds > 0) {
        notes.push(
          `Quantity traces are flat footage only: ${quantity.openEnds} ` +
            (quantity.openEnds === 1 ? "end has" : "ends have") +
            " no drop answered, so no vertical footage is included for " +
            (quantity.openEnds === 1 ? "it." : "them.")
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
      /*
        EXTRA AND MAKEUP, said in words (held-migrations plan § 1). This note
        read "carry no allowance for waste" until 2026-09-29, which stopped
        being true the day extras arrived. A list with extras in it says so and
        how much; a list whose runs carry none says THAT, because an unset
        extra is the whisper § 2.3 warns about and this page leaves the app.
      */
      const extraFeet =
        Math.round(
          (totals.conduitExtraFeet +
            totals.cableExtraFeet +
            totals.wireExtraFeet) *
            100
        ) / 100;
      const makeupFeet =
        Math.round((totals.cableMakeupFeet + totals.wireMakeupFeet) * 100) /
        100;
      const feetText = (n: number) =>
        n.toLocaleString("en-US", { maximumFractionDigits: 2 });
      if (extraFeet > 0 || makeupFeet > 0) {
        notes.push(
          "Includes " +
            feetText(extraFeet) +
            " ft of extra (conduit on the run length; wire and cable on " +
            "the run length and drops) and " +
            feetText(makeupFeet) +
            " ft of makeup — the tail left at each box and panel."
        );
      }
      if (totals.noExtraCount > 0) {
        notes.push(
          "No extra is set for " +
            totals.noExtraCount +
            (totals.noExtraCount === 1 ? " traced run" : " traced runs") +
            ", so those quantities carry none. Set the extra and makeup in " +
            "Settings before ordering."
        );
      }
      notes.push(
        "Quantities are taken off the drawings. Assemblies carry only what " +
          "their own recipes include."
      );

      return {
        bidName: bid.name,
        jobAddress: bid.siteAddress?.trim() ? bid.siteAddress.trim() : null,
        preparedOn: new Date(),
        entries,
        measured: measuredEntries(totals),
        forQuote,
        notes,
      };
    }),
});
