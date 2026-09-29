/**
 * What an EXTRA or MAKEUP value may be, at the door — one definition for the
 * three routers that accept them (company, run type, run). Three copies of a
 * range is three chances for one level to accept what another refuses.
 *
 * references/track-b-held-migrations-plan.md § 1.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SHIPPED_HEIGHT_TYPES } from "../shared/takeoffHeights";
import * as db from "./db";

/**
 * An extra percentage as a FRACTION: 0 to 1, so 0% to 100%. Negative is
 * refused — an extra below zero would cut measured footage, which § 5a
 * forbids — and over 100% is a slipped key, not a considered figure.
 */
export const extraPctSchema = z.number().finite().min(0).max(1);

/**
 * Makeup per conductor per end, whole inches, 0 to 20 ft. Twenty feet is far
 * past any tail anybody leaves at a switchboard; more than that is a typo.
 */
export const makeupInchesSchema = z.number().int().min(0).max(240);

/** A height type's key → its own makeup, for a run type or a run. */
export const makeupByKindSchema = z.record(
  z.string().trim().min(1).max(64),
  makeupInchesSchema
);

/** A fraction as the DECIMAL(6,4) column stores it. */
export function pctText(value: number | null): string | null {
  return value === null ? null : value.toFixed(4);
}

/**
 * Refuse makeup for a height type this company does not have. A key nobody
 * can pick would be a figure nothing ever reads — or, worse, one that starts
 * applying the day somebody adds a type that happens to slug to it.
 */
export async function refuseUnknownKinds(
  keys: readonly string[],
  userId: number
): Promise<void> {
  if (keys.length === 0) return;
  const own = await db.getMountingHeights(userId);
  const known = new Set([
    ...SHIPPED_HEIGHT_TYPES.map(t => t.key),
    ...own.map(t => t.typeKey),
  ]);
  const unknown = keys.filter(key => !known.has(key));
  if (unknown.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Not a height type: ${unknown.join(", ")}.`,
    });
  }
}
