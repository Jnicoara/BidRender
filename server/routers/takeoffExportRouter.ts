/**
 * The takeoff as a spreadsheet — see shared/takeoffExport.ts for what it is
 * and what it deliberately is not.
 *
 * ── Same rows, same grouping, as the bid ─────────────────────────────────────
 * Run footage comes from `groupRunFootage` over `loadRunFootageInput` — the
 * exact loader and arithmetic the bid's run-type lines resolve through. The
 * export only PARTITIONS the runs first, by sheet and by status, and groups
 * each partition. Footage is added run by run, so the partitions sum to the
 * bid's figure; server/takeoffExport.test.ts holds that against the database.
 *
 * Counts are every mark, grouped by `countKey` — the identity the takeoff
 * list and `takeoffGroups.list` count by.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import * as db from "../db";
import { loadRunFootageInput } from "../runTypeFootage";
import { groupRunFootage } from "../runTypeFootageCore";
import { countKey, groupStamps, stampName } from "../../shared/takeoffCounts";
import { resolveRunType } from "../../shared/runTypeLookup";
import { sheetDisplay } from "../../shared/sheetIdentity";
import {
  buildTakeoffExport,
  type RunStatus,
  type TakeoffExportCount,
  type TakeoffExportDoc,
  type TakeoffExportRuns,
  type TakeoffExportSheet,
} from "../../shared/takeoffExport";

const procedure = scoped("bids.view", "bids.edit");

export const takeoffExportRouter = router({
  get: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }): Promise<TakeoffExportDoc> => {
      const userId = ctx.scope.dataUserId;
      const bid = await db.getBidById(input.bidId, userId);
      if (!bid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

      const [jump, stamps, footageInput, palette] = await Promise.all([
        db.getSheetJumpRows(input.bidId, userId),
        db.getStampsForBid(input.bidId, userId),
        loadRunFootageInput(input.bidId, userId, bid.distributionHeightInches),
        db.getRunTypesFor(userId, true),
      ]);

      // ── Sheets, in plan-set order then page order ──────────────────────────
      const readAt = new Map(
        jump.reads.map(r => [`${r.bidPdfId}:${r.pageNumber}`, r])
      );
      const planOrder = new Map(jump.plans.map((plan, i) => [plan.id, i]));
      const planName = new Map(jump.plans.map(p => [p.id, p.filename]));
      const sheets: TakeoffExportSheet[] = [...jump.sheets]
        .sort(
          (a, b) =>
            (planOrder.get(a.bidPdfId) ?? 0) -
              (planOrder.get(b.bidPdfId) ?? 0) || a.pageNumber - b.pageNumber
        )
        .map(sheet => {
          const display = sheetDisplay(
            sheet,
            readAt.get(`${sheet.bidPdfId}:${sheet.pageNumber}`)
          );
          return {
            sheetId: sheet.id,
            planFile: planName.get(sheet.bidPdfId) ?? "",
            page: sheet.pageNumber,
            number: display.number,
            title: display.title,
          };
        });

      // ── Counts, per sheet ──────────────────────────────────────────────────
      const counts: TakeoffExportCount[] = [];
      const stampsBySheet = new Map<number, typeof stamps>();
      for (const stamp of stamps) {
        const list = stampsBySheet.get(stamp.sheetId) ?? [];
        list.push(stamp);
        stampsBySheet.set(stamp.sheetId, list);
      }
      stampsBySheet.forEach((onSheet, sheetId) => {
        for (const group of groupStamps(
          onSheet.map(stamp => ({
            id: stamp.id,
            sheetId: stamp.sheetId,
            groupId: stamp.groupId,
            name: stampName(stamp),
            assemblyId: stamp.assemblyId,
            x: Number(stamp.x),
            y: Number(stamp.y),
          }))
        )) {
          counts.push({
            sheetId,
            key: countKey(group),
            name: group.name,
            count: group.count,
          });
        }
      });

      // ── Runs, per sheet and status, through the bid's own grouping ─────────
      const runs: TakeoffExportRuns[] = [];
      let untypedRunCount = 0;
      if (footageInput) {
        const partitions = new Map<string, typeof footageInput.runs>();
        for (const run of footageInput.runs) {
          if (run.isSuggestion) continue;
          if (run.runTypeId === null) {
            untypedRunCount++;
            continue;
          }
          const key = `${run.sheetId}|${run.status}`;
          const list = partitions.get(key) ?? [];
          list.push(run);
          partitions.set(key, list);
        }
        partitions.forEach((partRuns, key) => {
          const [sheetIdText, status] = key.split("|");
          const grouped = groupRunFootage({ ...footageInput, runs: partRuns });
          grouped.forEach((row, runTypeId) => {
            runs.push({
              sheetId: Number(sheetIdText),
              key: String(runTypeId),
              typeLabel:
                resolveRunType(palette, runTypeId)?.label ??
                `Run type ${runTypeId}`,
              pathType: row.pathType,
              status: status as RunStatus,
              runCount: partRuns.filter(r => r.runTypeId === runTypeId).length,
              totalFeet: row.conduitFeet + row.cableFeet,
              verticalFeet: row.verticalFeet,
              typedFeet: row.typedFeet,
              wireFeet: row.insulatedFeet,
              groundFeet: row.groundFeet,
              unmeasurableCount: row.unmeasurableCount,
              branchCount: row.branchCount,
              unansweredCount: row.unansweredCount,
              endsNotCountedCount: row.endsNotCountedCount,
            });
          });
        });
      }

      // A mark or run on a sheet the list did not return still has to land
      // somewhere, or the whole-bid rows would hold more than the sheets add
      // up to. Nothing should reach this; if something does, it is visible.
      const known = new Set(sheets.map(s => s.sheetId));
      const orphanIds = new Set(
        [...counts, ...runs].map(r => r.sheetId).filter(id => !known.has(id))
      );
      orphanIds.forEach(sheetId =>
        sheets.push({
          sheetId,
          planFile: "",
          page: 0,
          number: null,
          title: "Sheet not found",
        })
      );

      return buildTakeoffExport({
        bidName: bid.name,
        preparedOn: new Date(),
        sheets,
        counts,
        runs,
        untypedRunCount,
      });
    }),
});
