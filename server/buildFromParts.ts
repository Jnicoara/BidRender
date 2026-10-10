/**
 * "Build it from parts here" — `bids.buildFromParts` (todo.md § "Before beta:
 * when the picker finds nothing", item b, owner-approved 2026-10-08).
 *
 * When the bid's assembly search finds nothing, the person builds one on the
 * spot from catalog parts, it goes on the bid, and — ticked by default — it is
 * saved to their library (the same "Also save to my library" tick as gap 11,
 * references/never-stuck-plan.md).
 *
 * ── What it makes is an ordinary assembly, always ───────────────────────────
 * CLAUDE.md § "As manual or as automated as the user wants": what this makes
 * must be first-class afterwards, not a lesser thing. So it is created by
 * `assemblies.create` itself — the library's own procedure, by caller, with
 * its own capability check and name-clash refusal — and the line is added by
 * the same `addAssemblyToBid` every other assembly line uses. Nothing here
 * prices anything.
 *
 * ── Unticked is ARCHIVED, not a different kind of row ───────────────────────
 * A line needs an assembly to point at, so unticking cannot mean "no
 * assembly". It means the assembly is archived straight after the line is
 * added: off the library list and every picker, still resolving for this
 * line (CLAUDE.md § "Retire, never delete"), and one "Restore" away on the
 * library's Archived view if they change their mind. Both directions, always.
 *
 * ── Order, and the one partial outcome ──────────────────────────────────────
 * Everything is checked before anything is written: the bid is theirs, every
 * part is in their catalog, the role is theirs. Then create, add, archive.
 * If adding fails after the create, the assembly is in their library (which
 * is what the tick asked for) and the line is not — something they can see
 * and use, never a line the library does not explain.
 *
 * ── From the plan viewer: the assembly, and NO line (2026-10-09) ────────────
 * The plan viewer's pickers (stamp picker, Legend/Runs link list) build here
 * too, with `addLine: false`. There the new assembly is ARMED or LINKED, and
 * its quantity reaches the bid the way every count does — through the marks
 * and "Send to bid" (shared/takeoffBridge.ts). A line added here as well would
 * be a second, hand-typed quantity for the same thing.
 *
 * Without a line the assembly MUST be saved to the library: an archived one
 * with no line would be a row nothing points at and no picker shows, so the
 * count it was built for could not find it again. Refused before any write.
 */
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { createCallerFactory } from "./_core/trpc";
import { assembliesRouter } from "./routers/assembliesRouter";
import * as db from "./db";
import type { ASSEMBLY_CATEGORIES } from "../drizzle/schema";

type BuildCtx = TrpcContext & { scope: { dataUserId: number } };

const assembliesCaller = createCallerFactory(assembliesRouter);

/** The library procedures re-derive scope from the person, as any call does. */
const asCaller = (ctx: BuildCtx): TrpcContext => ({
  req: ctx.req,
  res: ctx.res,
  user: ctx.user,
});

export interface BuildFromPartsInput {
  bidId: number;
  name: string;
  category: (typeof ASSEMBLY_CATEGORIES)[number];
  /** Per ONE of the assembly. The same material twice is summed. */
  parts: { materialId: number; qty: number }[];
  /** NULL = hours not set (D1), never 0. */
  baseLaborHours: number | null;
  laborRateId: number | null;
  /** How many go on the bid. */
  qty: number;
  unitLabel: string | null;
  saveToLibrary: boolean;
  /** Quick bid stacks repeat counts on one line, as `addAssembly` does. */
  merge: boolean;
  /** FALSE from the plan viewer: make the assembly only (see the header). */
  addLine: boolean;
}

/** Sum repeats of one material, keeping the order they were first chosen. */
export function mergeParts(
  parts: readonly { materialId: number; qty: number }[]
): { materialId: number; qty: number }[] {
  const byId = new Map<number, { materialId: number; qty: number }>();
  for (const part of parts) {
    const found = byId.get(part.materialId);
    if (found) found.qty += part.qty;
    else byId.set(part.materialId, { ...part });
  }
  return Array.from(byId.values());
}

export async function buildFromParts(
  ctx: BuildCtx,
  input: BuildFromPartsInput
) {
  const userId = ctx.scope.dataUserId;
  const bid = await db.getBidById(input.bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });

  if (!input.addLine && !input.saveToLibrary)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "An assembly built for counting has to be saved to your library, or the count could not find it again.",
    });

  const parts = mergeParts(input.parts);
  if (parts.length === 0)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Add at least one part.",
    });

  // `assemblies.create` trusts its material ids; this caller does not, so a
  // part from another company's catalog is refused here, before any write.
  const catalog = new Set(
    (await db.getLibraryMaterials(userId)).map(m => m.id)
  );
  if (parts.some(part => !catalog.has(part.materialId)))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "One of those parts is not in your catalog.",
    });

  if (input.laborRateId !== null) {
    const rates = await db.getLibraryLaborRates(userId);
    if (!rates.some(rate => rate.id === input.laborRateId))
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That labor role is not in your library.",
      });
  }

  const library = assembliesCaller(asCaller(ctx));
  const assembly = await library.create({
    name: input.name,
    category: input.category,
    baseLaborHours: input.baseLaborHours,
    laborRateId: input.laborRateId,
    materials: parts.map(part => ({
      materialId: part.materialId,
      qty: part.qty,
      isBranchWhip: false,
    })),
  });
  if (!assembly)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "The assembly was saved but could not be read back.",
    });

  if (!input.addLine)
    return {
      line: null,
      merged: false,
      assemblyId: assembly.id,
      savedToLibrary: true,
    };

  const { id: lineId, merged } = await db.addAssemblyToBid(
    input.bidId,
    userId,
    assembly.id,
    input.qty,
    input.unitLabel,
    { merge: input.merge }
  );

  if (!input.saveToLibrary) await library.archive({ id: assembly.id });

  const line = await db.getBidLineItem(lineId, input.bidId);
  return {
    line,
    merged,
    assemblyId: assembly.id,
    savedToLibrary: input.saveToLibrary,
  };
}
