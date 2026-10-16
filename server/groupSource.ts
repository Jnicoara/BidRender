/**
 * Say which library assembly a count IS — the one set of rules, for the
 * count card's "Link assembly" (`takeoffGroups.setSource`) and for a legend
 * symbol linked from the Legend tab (`takeoffStamps.linkSymbol`, which
 * adopts the counts of it already on the bid).
 *
 * Two doors used to mean two answers: linking from the Legend changed the
 * symbol and left the count already made "by name", unpriced on the bid,
 * until the symbol was armed again (Track A's whole-job journey, 2026-10-16).
 * Both doors now come here.
 */
import * as db from "./db";
import { lockedEditRefusal } from "../shared/quantityLock";
import { mayShareAssembly } from "../shared/assemblyCounts";
import { isUnassignedCount } from "../shared/unassignedCount";

type Group = NonNullable<Awaited<ReturnType<typeof db.getGroupById>>>;

export type GroupSourceResult =
  | {
      ok: true;
      id: number;
      kind: "plain" | "assembly";
      assemblyId: number | null;
    }
  | {
      ok: false;
      code: "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND";
      message: string;
    };

export async function setGroupSourceChecked(
  group: Group,
  assemblyId: number | null,
  userId: number
): Promise<GroupSourceResult> {
  // Never the Unassigned count itself: it would keep its reserved label,
  // stop being Unassigned, and could reach the bid as "__unassigned__".
  if (isUnassignedCount(group))
    return {
      ok: false,
      code: "BAD_REQUEST",
      message:
        "These marks are unassigned. Use “Pick what they are…” — it moves them into a count of their own.",
    };
  const bid = await db.getBidById(group.bidId, userId);
  if (!bid) return { ok: false, code: "NOT_FOUND", message: "Bid not found." };
  if (bid.quantitiesLockedAt !== null)
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: lockedEditRefusal("its counts cannot be changed"),
    };
  if (await db.getBidLineForGroup(group.id))
    return {
      ok: false,
      code: "CONFLICT",
      message:
        `"${group.label}" is already on the bid as a line, priced there. ` +
        `Remove that line from the bid first, then link the count and send it again.`,
    };

  if (assemblyId === null) {
    await db.setGroupSource(group.id, userId, null);
    return { ok: true, id: group.id, kind: "plain", assemblyId: null };
  }

  const assembly = await db.getAssemblyById(assemblyId, userId);
  if (!assembly)
    return { ok: false, code: "NOT_FOUND", message: "Assembly not found." };
  const others = (await db.getGroupsForBid(group.bidId, userId)).filter(
    other => other.id !== group.id && other.assemblyId === assembly.id
  );
  const clash = mayShareAssembly(group, others, await db.getSymbolLinks(userId))
    ? undefined
    : others[0];
  if (clash)
    return {
      ok: false,
      code: "CONFLICT",
      message: `This bid already counts "${assembly.name}" as "${clash.label}". Mark these under that count instead, or link a different assembly.`,
    };

  await db.setGroupSource(group.id, userId, {
    id: assembly.id,
    name: assembly.name,
    category: assembly.category ?? null,
  });
  return { ok: true, id: group.id, kind: "assembly", assemblyId: assembly.id };
}
