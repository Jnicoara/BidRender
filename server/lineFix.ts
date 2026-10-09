/**
 * "Fix this line" on the server — `bids.fixLineOptions` and `bids.fixLine`
 * (references/never-stuck-plan.md, gap 11, as amended by the owner
 * 2026-10-07). The rules are in `shared/lineFix.ts`; this file reads the rows
 * and writes them.
 *
 * ── The library half goes through the library's OWN procedures ──────────────
 * "Also save to my library" calls `materials.update` and `assemblies.update`
 * by caller, never a second copy of what they do. So a starter forks exactly
 * as it does on the Library screen, an "Example price" tag clears exactly as
 * it does there, and a person whose role may change bids but not the library
 * is refused by the library's own capability check (CLAUDE.md § "A user's
 * own entry behaves exactly like a shipped one").
 *
 * ── Not one transaction, and the order is why that is safe ─────────────────
 * The plan asked for one. The library procedures own their own writes, so
 * the fix validates EVERYTHING first (the line's arithmetic included), then
 * writes the library, then the line. A failure before any write changes
 * nothing; the only partial outcome is a library row saved and the line not,
 * which is a library edit the person asked for and can see — never a line
 * moved that the library does not explain.
 */
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { createCallerFactory } from "./_core/trpc";
import { materialsRouter } from "./routers/materialsRouter";
import { assembliesRouter } from "./routers/assembliesRouter";
import * as db from "./db";
import type { BidLineItem, StoredMarkupSource } from "../drizzle/schema";
import {
  addMaterialToLine,
  hasLineFixGap,
  lineFixGaps,
  lineFixRefusal,
  pricePartsOnLine,
  type FrozenPart,
  type LineFixGaps,
  type LineMaterialState,
} from "../shared/lineFix";
import { canPriceByHand } from "../shared/handPricedLines";
import { resolveMaterial } from "../shared/materialLookup";
import {
  materialItemKey,
  resolvePartMarkup,
  storedMarkupPct,
} from "../shared/materialMarkup";
import { hourlyCostOf, resolveLaborRate } from "../shared/laborRateLookup";
import { snapshotHoursFor, assemblyHours } from "../shared/assemblyHours";
import { needsPricing } from "../shared/materialPricing";

type FixCtx = TrpcContext & { scope: { dataUserId: number } };

const materialsCaller = createCallerFactory(materialsRouter);
const assembliesCaller = createCallerFactory(assembliesRouter);

/** The library procedures re-derive scope from the person, as any call does. */
const asCaller = (ctx: FixCtx): TrpcContext => ({
  req: ctx.req,
  res: ctx.res,
  user: ctx.user,
});

const bad = (message: string) =>
  new TRPCError({ code: "BAD_REQUEST", message });

async function loadLine(bidId: number, lineId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  const row = await db.getBidLineItem(lineId, bidId);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Line not found." });
  const [line] = await db.withUnpricedParts([row], userId);
  return { bid, line };
}

function frozenPartsOf(line: BidLineItem): FrozenPart[] | null {
  const source = line.snapshotMarkupSource as StoredMarkupSource | null;
  if (!source || !Array.isArray(source.parts)) return null;
  return source.parts.map(p => ({
    materialId: p.materialId,
    cost: Number(p.cost) || 0,
  }));
}

function materialStateOf(
  line: BidLineItem & { unpricedParts: number },
  frozenParts: FrozenPart[]
): LineMaterialState {
  return {
    materialCost: Number(line.snapshotMaterialCost ?? 0),
    unpricedParts: line.snapshotUnpricedParts,
    markupPct:
      line.snapshotMarkupPct === null
        ? null
        : storedMarkupPct(line.snapshotMarkupPct),
    frozenParts,
  };
}

/** Which material field a run line's hours live in. */
function runHoursField(role: string | null) {
  return role === "fieldBend" ? "fieldBendLaborHours" : "laborHours";
}

// ─── What the panel shows ────────────────────────────────────────────────────

export type FixLineOptions = {
  refusal: string | null;
  gaps: LineFixGaps;
  assembly: {
    /** The row the library half writes: the company's own copy if it has one. */
    id: number;
    name: string;
    isStarter: boolean;
    overheadHours: number;
  } | null;
  /** The $0 parts frozen in this line that the recipe still holds. */
  parts: {
    materialId: number;
    name: string;
    unitOfSale: string;
    qtyPerOne: number;
    /** The library's price now, shown as a hint — never filled in. */
    libraryPrice: number;
  }[];
  /**
   * Why the parts gap cannot be fixed on this line, when it cannot: a line
   * from before markup rules froze no list of its parts, or the recipe no
   * longer holds them. The library half still works.
   */
  partsNote: string | null;
  run: {
    materialId: number;
    name: string;
    unitOfSale: string;
    libraryPrice: number;
    libraryHours: number | null;
    hoursAreBend: boolean;
  } | null;
};

export async function fixLineOptions(
  ctx: FixCtx,
  input: { bidId: number; lineId: number }
): Promise<FixLineOptions> {
  const userId = ctx.scope.dataUserId;
  const { bid, line } = await loadLine(input.bidId, input.lineId, userId);
  const gaps = lineFixGaps(line);
  const out: FixLineOptions = {
    refusal: lineFixRefusal(bid),
    gaps,
    assembly: null,
    parts: [],
    partsNote: null,
    run: null,
  };
  if (!hasLineFixGap(gaps)) return out;

  if (line.assemblyId !== null) {
    const detail = await db.getAssemblyForStoredReference(
      line.assemblyId,
      userId
    );
    if (!detail) {
      out.partsNote =
        "This line's assembly has been deleted, so there is no recipe to read.";
      return out;
    }
    out.assembly = {
      id: detail.id,
      name: detail.name,
      isStarter: detail.userId === null,
      overheadHours: assemblyHours(detail.overheadLaborHours) ?? 0,
    };
    if (gaps.parts) {
      const frozen = frozenPartsOf(line);
      if (frozen === null) {
        out.partsNote =
          "This line was added before BidRidge kept a list of its parts, so its parts can't be priced on it. Price them in your library, then add the assembly again.";
      } else {
        for (const row of detail.materials) {
          const qty = Number(row.qty);
          if (!(qty > 0)) continue;
          if (
            !frozen.some(p => p.materialId === row.materialId && p.cost === 0)
          )
            continue;
          out.parts.push({
            materialId: row.materialId,
            name: row.name,
            unitOfSale: row.unitOfSale,
            qtyPerOne: qty,
            libraryPrice: Number(row.costPerUnit) || 0,
          });
        }
        if (out.parts.length === 0)
          out.partsNote =
            "The assembly's recipe has changed since this line was added, so its unpriced parts can't be matched. Add the assembly again to take the new recipe.";
      }
    }
    return out;
  }

  if (line.runMaterialId !== null) {
    const material = resolveMaterial(
      await db.getMaterialsByIds([line.runMaterialId], userId),
      line.runMaterialId
    );
    if (material) {
      const bend = line.runMaterialRole === "fieldBend";
      const hours = bend ? material.fieldBendLaborHours : material.laborHours;
      out.run = {
        materialId: line.runMaterialId,
        name: material.name,
        unitOfSale: material.unitOfSale,
        libraryPrice: Number(material.costPerUnit) || 0,
        libraryHours: hours === null ? null : Number(hours),
        hoursAreBend: bend,
      };
    }
  }
  return out;
}

// ─── The fix ─────────────────────────────────────────────────────────────────

export type FixLineInput = {
  bidId: number;
  lineId: number;
  /** Assembly line: prices for its $0 parts, per unit of sale. */
  partPrices?: { materialId: number; price: number }[];
  /** Assembly line with no material: a picked material and how many on one. */
  addMaterial?: { materialId: number; qtyPerOne: number; price?: number };
  /** Run line: its part's price. */
  runPrice?: number;
  /** Assembly: hours for one (before overhead). Run line: its labor unit. */
  hours?: number;
  /** Assembly line: the role doing the hours. */
  laborRateId?: number;
  saveToLibrary: boolean;
};

export type FixLineResult = {
  /** False when the bid refused the line change (locked, Won, Lost). */
  lineChanged: boolean;
  refusal: string | null;
  /** What went into the library, in words, for the confirmation. */
  savedToLibrary: string[];
  /** Other lines on this bid with the same source still missing it. */
  otherLineIds: number[];
};

export async function fixLine(
  ctx: FixCtx,
  input: FixLineInput
): Promise<FixLineResult> {
  const userId = ctx.scope.dataUserId;
  const { bid, line } = await loadLine(input.bidId, input.lineId, userId);

  if (canPriceByHand(line))
    throw bad(
      "This line is priced by hand. Type its price and hours on the line itself."
    );

  const refusal = lineFixRefusal(bid);
  // Nothing at all would happen: say why rather than appear to succeed.
  if (refusal && !input.saveToLibrary) throw bad(refusal);

  const gaps = lineFixGaps(line);
  const patch: Partial<BidLineItem> = {};
  const library: {
    materials: { id: number; patch: Record<string, number | null> }[];
    assembly: Record<string, unknown> | null;
    words: string[];
  } = { materials: [], assembly: null, words: [] };

  const wantsAnything =
    (input.partPrices?.length ?? 0) > 0 ||
    input.addMaterial !== undefined ||
    input.runPrice !== undefined ||
    input.hours !== undefined ||
    input.laborRateId !== undefined;
  if (!wantsAnything) throw bad("Nothing to save — type a number first.");

  // ── An assembly line ──
  if (line.assemblyId !== null) {
    if (input.runPrice !== undefined)
      throw bad("This line comes from an assembly, not a traced run.");
    const detail = await db.getAssemblyForStoredReference(
      line.assemblyId,
      userId
    );
    if (!detail)
      throw bad(
        "This line's assembly has been deleted, so there is nothing to fix it from."
      );

    const needsMaterialWork =
      (input.partPrices?.length ?? 0) > 0 || input.addMaterial !== undefined;
    if (needsMaterialWork) {
      const frozen = frozenPartsOf(line);
      const rules = await db.getMarkupRuleSet(userId);
      const ids = [
        ...(input.partPrices ?? []).map(p => p.materialId),
        ...(input.addMaterial ? [input.addMaterial.materialId] : []),
      ];
      const named = await db.getMaterialsByIds(ids, userId);
      const markupOf = (materialId: number) => {
        const m = resolveMaterial(named, materialId);
        return resolvePartMarkup(
          {
            itemKey: m ? materialItemKey(m) : null,
            category: m?.category ?? null,
            packPrice: null,
          },
          rules
        ).pct;
      };

      let state: LineMaterialState | null =
        frozen === null ? null : materialStateOf(line, frozen);

      if ((input.partPrices?.length ?? 0) > 0) {
        if (!gaps.parts) throw bad("This line has no unpriced parts to price.");
        if (state === null)
          throw bad(
            "This line was added before BidRidge kept a list of its parts, so its parts can't be priced on it. Price them in your library, then add the assembly again."
          );
        const priced = [];
        for (const p of input.partPrices!) {
          const row = detail.materials.find(r => r.materialId === p.materialId);
          if (!row)
            throw bad(
              "That part is no longer in the assembly's recipe, so this line can't be matched to it."
            );
          priced.push({
            materialId: p.materialId,
            qtyPerOne: Number(row.qty),
            price: p.price,
            markupPct: markupOf(p.materialId),
          });
          library.materials.push({
            id: p.materialId,
            patch: { costPerUnit: p.price },
          });
          library.words.push(`${row.name} price`);
        }
        const result = pricePartsOnLine(state, priced);
        if (!result.ok) throw bad(result.message);
        state = result.state;
      }

      if (input.addMaterial) {
        if (!gaps.material)
          throw bad(
            "This line already has material on it. Price its parts instead."
          );
        const add = input.addMaterial;
        const material = resolveMaterial(named, add.materialId);
        if (!material) throw bad("That material is not in your library.");
        const price = add.price ?? Number(material.costPerUnit);
        // A line from before markup rules has no parts list to add to; it
        // starts one, at the 0% it already prices with.
        const base: LineMaterialState = state ?? {
          materialCost: Number(line.snapshotMaterialCost ?? 0),
          unpricedParts: line.snapshotUnpricedParts,
          markupPct: null,
          frozenParts: [],
        };
        const result = addMaterialToLine(base, {
          materialId: add.materialId,
          qtyPerOne: add.qtyPerOne,
          price,
          markupPct: markupOf(add.materialId),
        });
        if (!result.ok) throw bad(result.message);
        state = result.state;
        library.assembly = {
          ...(library.assembly ?? {}),
          materials: [
            ...detail.materials.map(r => ({
              materialId: r.materialId,
              qty: Number(r.qty),
              isBranchWhip: r.isBranchWhip,
            })),
            {
              materialId: add.materialId,
              qty: add.qtyPerOne,
              isBranchWhip: false,
            },
          ],
        };
        library.words.push(`${material.name} added to ${detail.name}`);
        // A TYPED price that differs from the library's is saved there too;
        // a picked material at its own price leaves its row alone.
        if (
          add.price !== undefined &&
          (needsPricing(material.costPerUnit) ||
            Math.abs(add.price - Number(material.costPerUnit)) > 1e-9)
        ) {
          library.materials.push({
            id: add.materialId,
            patch: { costPerUnit: add.price },
          });
          library.words.push(`${material.name} price`);
        }
      }

      if (state) {
        patch.snapshotMaterialCost = state.materialCost.toFixed(4);
        patch.snapshotUnpricedParts = state.unpricedParts;
        if (state.markupPct !== null)
          patch.snapshotMarkupPct = state.markupPct.toFixed(6);
        const source = line.snapshotMarkupSource as StoredMarkupSource | null;
        patch.snapshotMarkupSource = {
          level: source?.level ?? "none",
          label: source?.label ?? "no markup rule set",
          parts: state.frozenParts,
        } as BidLineItem["snapshotMarkupSource"];
      }
    }

    if (input.hours !== undefined) {
      if (!gaps.hours) throw bad("This line's hours are already set.");
      patch.snapshotLaborHours = snapshotHoursFor(
        input.hours,
        detail.overheadLaborHours
      );
      patch.snapshotHoursWereExample = false;
      library.assembly = {
        ...(library.assembly ?? {}),
        baseLaborHours: input.hours,
      };
      library.words.push(`${detail.name} hours`);
    }

    if (input.laborRateId !== undefined) {
      const hoursAfter = Number(
        patch.snapshotLaborHours ?? line.snapshotLaborHours ?? 0
      );
      if (!(hoursAfter > 0))
        throw bad(
          "Set the hours first — a role prices hours, and there are none."
        );
      if (!(Number(line.snapshotLaborRate ?? 0) === 0))
        throw bad("This line already has a labor rate.");
      const rate = resolveLaborRate(
        await db.getLibraryLaborRates(userId),
        input.laborRateId
      );
      if (!rate) throw bad("That labor role is not in your library.");
      const cost = hourlyCostOf(rate);
      if (!(cost > 0))
        throw bad(
          `${rate.name} has no rate yet. Give it one in Labor rates, or pick another role.`
        );
      patch.snapshotLaborRate = cost.toFixed(4);
      patch.snapshotLaborRateWasExample = rate.isExampleRate === true;
      library.assembly = {
        ...(library.assembly ?? {}),
        laborRateId: input.laborRateId,
      };
      library.words.push(`${detail.name} role`);
    }

    // ── Write: library first, then the line (see the header) ──
    if (input.saveToLibrary) {
      for (const m of library.materials)
        await materialsCaller(asCaller(ctx)).update({
          id: m.id,
          costPerUnit: m.patch.costPerUnit as number,
        });
      if (library.assembly)
        await assembliesCaller(asCaller(ctx)).update({
          id: detail.id,
          ...(library.assembly as object),
        });
    }
  } else if (line.takeoffRunTypeId !== null && line.runMaterialId !== null) {
    // ── A run line ──
    if (
      (input.partPrices?.length ?? 0) > 0 ||
      input.addMaterial !== undefined ||
      input.laborRateId !== undefined
    )
      throw bad(
        "This line comes from a traced run: price its part or set its hours."
      );
    const material = resolveMaterial(
      await db.getMaterialsByIds([line.runMaterialId], userId),
      line.runMaterialId
    );
    if (!material) throw bad("This line's part is no longer in your library.");
    const materialPatch: Record<string, number | null> = {};

    if (input.runPrice !== undefined) {
      if (!gaps.runPrice) throw bad("This line's part already has a price.");
      if (!(input.runPrice > 0)) throw bad("Type a price above $0.");
      const rules = await db.getMarkupRuleSet(userId);
      const pct = resolvePartMarkup(
        {
          itemKey: materialItemKey(material),
          category: material.category,
          packPrice: null,
        },
        rules
      );
      patch.snapshotMaterialCost = input.runPrice.toFixed(4);
      patch.snapshotPriceWasExample = false;
      // One part: its markup is simply its own, as a fresh send would freeze.
      if (line.snapshotMarkupPct !== null) {
        patch.snapshotMarkupPct = pct.pct.toFixed(6);
        patch.snapshotMarkupSource = {
          level: pct.level,
          label: pct.label,
          parts: [{ materialId: line.runMaterialId, cost: input.runPrice }],
        } as BidLineItem["snapshotMarkupSource"];
      }
      materialPatch.costPerUnit = input.runPrice;
      library.words.push(`${material.name} price`);
    }
    if (input.hours !== undefined) {
      if (!gaps.runHours) throw bad("This line's hours are already set.");
      patch.snapshotLaborHours = input.hours.toFixed(4);
      patch.snapshotHoursWereExample = false;
      materialPatch[runHoursField(line.runMaterialRole)] = input.hours;
      library.words.push(
        line.runMaterialRole === "fieldBend"
          ? `${material.name} hours per bend`
          : `${material.name} labor hours`
      );
    }
    if (input.saveToLibrary && Object.keys(materialPatch).length > 0) {
      await materialsCaller(asCaller(ctx)).update({
        id: line.runMaterialId,
        ...materialPatch,
      });
    }
  } else {
    throw bad("This line has nothing the fix panel can set.");
  }

  if (!refusal && Object.keys(patch).length > 0) {
    await db.updateBidLineItem(line.id, bid.id, patch);
  }

  return {
    lineChanged: !refusal,
    refusal,
    savedToLibrary: input.saveToLibrary ? library.words : [],
    otherLineIds: refusal
      ? []
      : await otherLinesStillMissing(bid.id, line, userId),
  };
}

/**
 * Other lines on this bid from the same assembly (or the same run part and
 * role) that still have a gap — what "Update N other lines" would reach.
 * Only offered; never applied here.
 */
async function otherLinesStillMissing(
  bidId: number,
  fixed: BidLineItem,
  userId: number
): Promise<number[]> {
  const rows = await db.withUnpricedParts(
    await db.getBidLineItems(bidId),
    userId
  );
  return rows
    .filter(
      row =>
        row.id !== fixed.id &&
        (fixed.assemblyId !== null
          ? row.assemblyId === fixed.assemblyId
          : row.runMaterialId === fixed.runMaterialId &&
            row.runMaterialRole === fixed.runMaterialRole &&
            row.takeoffRunTypeId !== null) &&
        hasLineFixGap(lineFixGaps(row))
    )
    .map(row => row.id);
}
