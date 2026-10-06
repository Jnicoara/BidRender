/**
 * Every count's pin look on one bid, resolved on the SERVER — for the takeoff
 * CSV's "Pin" column (pin plan decision 11).
 *
 * The takeoff screen resolves the same thing in the browser from three
 * queries: `takeoffGroups.list` (the bid's counts and their own looks),
 * `assemblies.list` (the library, forks included) and `takeoffStamps.symbols`
 * (captured legend items and their looks). This reads the same three sources
 * through the same db functions those procedures call, and feeds the same
 * two shared functions — `pinCountsFor`, then `pinStylesForBid` — so the file
 * and the screen cannot wear different letters.
 * `server/takeoffExportPin.test.ts` holds that against the routers.
 *
 * EVERY count on the bid goes in, not one sheet's: a letter that bumps does
 * so against the whole bid (`pinStylesForBid`'s rule).
 */
import { pinCountsFor } from "../shared/pinCounts";
import { pinStylesForBid, type PinStyle } from "../shared/pinLetters";
import * as db from "./db";

export async function pinStylesForBidFromDb(
  bidId: number,
  userId: number
): Promise<Map<number, PinStyle>> {
  const [groups, assemblies, symbols] = await Promise.all([
    db.getGroupsForBid(bidId, userId),
    db.getLibraryAssemblies(userId, "active"),
    db.getSymbolLinks(userId),
  ]);
  return pinStylesForBid(
    pinCountsFor(
      groups.map(g => ({
        id: g.id,
        label: g.label,
        assemblyId: g.assemblyId,
        look: { shape: g.markShape, letter: g.markLetter, color: g.markColor },
      })),
      assemblies,
      symbols.map(s => ({
        label: s.label,
        lookupKey: s.lookupKey,
        look: { shape: s.markShape, letter: s.markLetter, color: s.markColor },
      }))
    )
  );
}
