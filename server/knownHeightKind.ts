import { TRPCError } from "@trpc/server";
import { DISTRIBUTION_KIND, shippedHeightType } from "../shared/takeoffHeights";
import * as db from "./db";

/**
 * Refuse a height type this company does not have.
 *
 * An unknown key is not harmless: it resolves to "not set", so the run quietly
 * counts no vertical and nothing on screen says why. Refusing the save beats
 * storing something that silently means nothing. One check for a run end and
 * for an assembly's "Mounts at", so the two cannot accept different keys.
 */
export async function requireKnownKind(
  kind: string | null,
  userId: number
): Promise<void> {
  if (kind === null || kind === DISTRIBUTION_KIND) return;
  if (shippedHeightType(kind)) return;
  const own = await db.getMountingHeights(userId);
  if (own.some(row => row.typeKey === kind)) return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "That is not one of your height types.",
  });
}
