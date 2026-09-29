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
 */
import * as db from "./db";

type GroupKind = Awaited<ReturnType<typeof db.getGroupsForBid>>[number]["kind"];

export type AssemblyGroup = {
  id: number;
  label: string;
  kind: GroupKind;
  created: boolean;
};

export async function groupForAssembly(
  bidId: number,
  userId: number,
  assembly: { id: number; name: string }
): Promise<AssemblyGroup> {
  const existing = await db.getGroupsForBid(bidId, userId);
  const already = existing.find(group => group.assemblyId === assembly.id);
  if (already) {
    return {
      id: already.id,
      label: already.label,
      kind: already.kind,
      created: false,
    };
  }

  const id = await db.createTakeoffGroup({
    bidId,
    userId,
    label: assembly.name,
    kind: "assembly",
    assemblyId: assembly.id,
  });
  return { id, label: assembly.name, kind: "assembly", created: true };
}
