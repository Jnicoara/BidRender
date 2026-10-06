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
  mayIncludePrices,
  type RunStatus,
  type TakeoffExportCount,
  type TakeoffExportDoc,
  type TakeoffExportRuns,
  type TakeoffExportSheet,
  type TakeoffPrices,
} from "../../shared/takeoffExport";
import {
  lineHoursUnset,
  lineNotPriced,
  linePartsNotPriced,
} from "../../shared/lineNotPriced";
import { bidRollup, companyDefaultsFor } from "../bidPricing";
import type { Bid } from "../../drizzle/schema";
import { pinCode } from "../../shared/pinLetters";
import { pinStylesForBidFromDb } from "../pinStyles";

const procedure = scoped("bids.view", "bids.edit");

export const takeoffExportRouter = router({
  get: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        /**
         * The bid's COSTS on the Whole bid rows. Off unless asked for, every
         * time (owner, 2026-09-29), and refused without `pricing.view`:
         * the client hides the box, and this is what makes hiding it true.
         */
        includePrices: z.boolean().default(false),
      })
    )
    .query(async ({ input, ctx }): Promise<TakeoffExportDoc> => {
      const userId = ctx.scope.dataUserId;
      if (input.includePrices && !mayIncludePrices(ctx.scope.capabilities))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your role (${ctx.scope.role}) cannot see prices.`,
        });
      const bid = await db.getBidById(input.bidId, userId);
      if (!bid)
        throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

      const [jump, stamps, footageInput, palette, pins] = await Promise.all([
        db.getSheetJumpRows(input.bidId, userId),
        db.getStampsForBid(input.bidId, userId),
        loadRunFootageInput(input.bidId, userId, bid.distributionHeightInches),
        db.getRunTypesFor(userId, true),
        pinStylesForBidFromDb(input.bidId, userId),
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
            // The export goes to the supply house: new devices only.
            status: stamp.status,
          }))
        )) {
          // The look the takeoff screen draws, resolved over EVERY count on
          // the bid (server/pinStyles.ts). Marks with no count have no pin.
          const style =
            group.groupId === null ? undefined : pins.get(group.groupId);
          counts.push({
            sheetId,
            key: countKey(group),
            name: group.name,
            count: group.count,
            pin: style ? pinCode(style) : null,
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
        /*
          DROPS FROM MARKS (§ 3) belong to the sheet their marks are on, and a
          mark has no draft state — so they join that sheet's FINISHED rows,
          and a sheet with drops but no runs still gets a partition.
        */
        for (const drop of footageInput.markDrops) {
          const key = `${drop.sheetId}|committed`;
          if (!partitions.has(key)) partitions.set(key, []);
        }
        partitions.forEach((partRuns, key) => {
          const [sheetIdText, status] = key.split("|");
          const grouped = groupRunFootage({
            ...footageInput,
            runs: partRuns,
            markDrops:
              status === "committed"
                ? footageInput.markDrops.filter(
                    d => d.sheetId === Number(sheetIdText)
                  )
                : [],
          });
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
              // BOUGHT: what the file's reader orders. Its parts follow.
              totalFeet: row.conduitBoughtFeet + row.cableBoughtFeet,
              verticalFeet: row.verticalFeet,
              typedFeet: row.typedFeet,
              extraFeet: row.racewayExtraFeet,
              // Makeup inside the RACEWAY figure — only a cable has any.
              makeupFeet: row.pathType === "cable" ? row.makeupFeet : 0,
              wireFeet: row.insulatedBoughtFeet,
              groundFeet: row.groundBoughtFeet,
              noExtraCount: row.noExtraCount,
              markDropCount: row.markDropCount,
              markDropFeet: row.markDropFeet,
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
        prices: input.includePrices
          ? await pricesFor(bid, userId, palette, runs)
          : undefined,
      });
    }),
});

/**
 * The bid's lines as the bid prices them — the SAME `bidRollup` the bid
 * screen reads, with nothing computed here — each tagged with the whole-bid
 * row it belongs to.
 *
 * A count's row is `group:<id>` (`countKey`), which is exactly what a line
 * from the plans points at. A run type's row is keyed by the id its runs
 * carry; a line may hold the shipped id or a fork of it, so both sides are
 * compared through `resolveRunType`, the way the bid resolves them.
 */
async function pricesFor(
  bid: Bid,
  userId: number,
  palette: Awaited<ReturnType<typeof db.getRunTypesFor>>,
  runs: readonly TakeoffExportRuns[]
): Promise<TakeoffPrices> {
  const [lines, company, expenseRows] = await Promise.all([
    db.getRollupLines(bid.id, userId),
    companyDefaultsFor(userId),
    db.getBidExpenses(bid.id),
  ]);
  // Tax is not read: this file stops at the Direct cost, before any of it.
  const rollup = bidRollup(
    bid,
    lines,
    company,
    undefined,
    expenseRows.map(row => ({
      name: row.name,
      amount: Number(row.amount),
      taxable: row.taxable,
      markedUp: row.markedUp,
    }))
  );
  const resolved = (id: number) => resolveRunType(palette, id)?.id ?? id;
  const runKeyByType = new Map<number, string>();
  for (const r of runs) runKeyByType.set(resolved(Number(r.key)), r.key);

  return {
    lines: rollup.priced.map(({ line, breakdown, problem }) => {
      const directCost = problem || !breakdown ? null : breakdown.directCost;
      const rowKey =
        line.takeoffGroupId !== null
          ? `group:${line.takeoffGroupId}`
          : line.takeoffRunTypeId !== null
            ? (runKeyByType.get(resolved(line.takeoffRunTypeId)) ?? null)
            : null;
      return {
        rowKey,
        qty: Number(line.qty),
        directCost,
        notPriced: directCost !== null && lineNotPriced(line, directCost),
        hoursNotSet: directCost !== null && lineHoursUnset(line),
        partsNotPriced:
          directCost === null ? 0 : linePartsNotPriced(line, directCost),
      };
    }),
    markedUpCharges: rollup.totals.markedUpCharges,
    directCost: rollup.totals.directCost,
    quantitiesLockedAt: bid.quantitiesLockedAt,
  };
}
