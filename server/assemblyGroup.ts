/**
 * The count an assembly's marks belong to on one bid — found, or made.
 *
 * ONE function, because there are two ways to place an assembly's mark: the
 * stamp tool (through `takeoffGroups.forAssembly`) and the plan reader's Place
 * button (`planCopilot.confirm`). Until 2026-09-29 only the first went through
 * a count. Place wrote its marks with `groupId` NULL, and every counter skips a
 * NULL group (`countStampsByGroup`, `stampCountsForBid`), so a placed mark was
 * drawn on the sheet, priced by the materials list, and counted on no bid line.
 * The bid and the supply list disagreed and nothing on screen said so.
 * Both paths now call this, so neither can place a mark outside a count again.
 *
 * ── And which count, when several items share one assembly (2026-10-01) ─────
 * This used to take the FIRST count on the bid with the assembly, so every
 * legend symbol linked to it landed in one count — 22 + 3 lights stored as
 * 25, under one name. A symbol now arms its own count, and with no symbol and
 * several counts the caller is told to ask. The decision is
 * `chooseAssemblyCount` (shared/assemblyCounts.ts), where the suite reaches
 * every branch; this file only applies it.
 */
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import {
  chooseAssemblyCount,
  type SymbolForCount,
} from "../shared/assemblyCounts";

type GroupKind = Awaited<ReturnType<typeof db.getGroupsForBid>>[number]["kind"];

export type AssemblyGroup = {
  id: number;
  label: string;
  kind: GroupKind;
  created: boolean;
  /** Taken as the first of several counts of the assembly, by request. */
  firstOfSeveral?: boolean;
};

/** Thrown when the caller must ask which count; the client opens a chooser. */
export const SEVERAL_COUNTS_MESSAGE =
  "This bid counts that assembly as more than one item. Choose which one to count.";

export async function groupForAssembly(
  bidId: number,
  userId: number,
  assembly: { id: number; name: string; category?: string | null },
  options: {
    symbol?: SymbolForCount | null;
    ifSeveral?: "ask" | "first";
  } = {}
): Promise<AssemblyGroup> {
  const existing = await db.getGroupsForBid(bidId, userId);
  const symbols = options.symbol ? await db.getSymbolLinks(userId) : [];
  const choice = chooseAssemblyCount({
    groups: existing,
    assembly,
    symbol: options.symbol ?? null,
    symbols,
    ifSeveral: options.ifSeveral ?? "ask",
  });

  switch (choice.kind) {
    case "use":
      return {
        id: choice.group.id,
        label: choice.group.label,
        kind: choice.group.kind,
        created: false,
        // `ifSeveral: "first"` took one of several: the caller says so.
        firstOfSeveral:
          !options.symbol &&
          existing.filter(g => g.assemblyId === assembly.id).length > 1,
      };
    case "choose":
      throw new TRPCError({
        code: "CONFLICT",
        message: SEVERAL_COUNTS_MESSAGE,
      });
    case "name-taken":
      throw new TRPCError({
        code: "CONFLICT",
        message:
          `This bid already counts something called "${choice.group.label}" ` +
          `that is not ${assembly.name}. Rename that count, then click the symbol again.`,
      });
    case "link-plain": {
      /*
        The symbol was counted before it was linked. Its count becomes the
        assembly's — every mark kept — unless it is already on the bid as a
        line, whose snapshot is never rewritten; then the clicks keep going to
        that count, priced as the line already is.
      */
      const group = choice.group;
      if (!(await db.getBidLineForGroup(group.id))) {
        await db.setGroupSource(group.id, userId, {
          id: assembly.id,
          name: assembly.name,
          category: assembly.category ?? null,
        });
        return {
          id: group.id,
          label: group.label,
          kind: "assembly",
          created: false,
        };
      }
      return {
        id: group.id,
        label: group.label,
        kind: group.kind,
        created: false,
      };
    }
    case "create": {
      const id = await db.createTakeoffGroup({
        bidId,
        userId,
        label: choice.label,
        kind: "assembly",
        assemblyId: assembly.id,
      });
      return { id, label: choice.label, kind: "assembly", created: true };
    }
  }
}
