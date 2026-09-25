/**
 * Pricing-sheet rows that moved into the shipped catalog under ANOTHER name.
 *
 *   pricing sheet name  ->  shipped name
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `buildPricingSheet.mts` starts from the shipped catalog and then adds its own
 * rows, skipping any name already shipped. That is what marks a moved row as
 * moved — but only when the names match exactly. A row that moved under a new
 * name, or was folded into a row that already existed, would otherwise come
 * back as NEW beside its shipped self and be priced twice.
 *
 * Two kinds of entry, kept apart because they mean different things:
 *
 *   MERGED — the sheet row was the SAME PRODUCT as a row already shipped,
 *            worded another way ("10/2 MC cable" is "10-2 MC cable"). Nothing
 *            was added; the shipped row's aliases carry the sheet's wording
 *            where it was not already findable.
 *   RENAMED — the sheet row was added, under the catalog's naming ("Romex
 *            staple, 1/2 in" style becomes the `1/2"` style the rest of the
 *            catalog uses).
 *
 * Moved in batches on 2026-09-25. Rows the sheet still lists as NEW were left
 * there on purpose — a recorded decision, a blocked category, or a question for
 * the owner (see the commit messages for each batch).
 *
 * Every value must be a shipped name and no key may be one; the sheet builder
 * refuses to run otherwise, and `server/pricingSheetMoves.test.ts` asserts the
 * same so it is checked on every test run rather than only when somebody
 * regenerates the sheet.
 */

export const MERGED_FROM_SHEET: Record<string, string> = {
  // ── Batch 1: wire, conduit fittings, connectors, consumables, fasteners, strut
  "10/2 MC cable": "10-2 MC cable",
  "10/3 MC cable": "10-3 MC cable",
  "12/3 MC cable": "12-3 MC cable",
  "8/3 MC cable": "8-3 MC cable",
  "10/3 NM-B": "10-3 NM-B",
  "12/3 NM-B": "12-3 NM-B",
  "14/3 NM-B": "14-3 NM-B",
  "6/3 NM-B": "6-3 NM-B",
  "8/3 NM-B": "8-3 NM-B",
  "10/2 UF-B": "10-2 UF-B",
  "12/2 UF-B": "12-2 UF-B",
  "Bare copper, #2": "#2 bare copper, stranded",
  "Bare copper, #4": "#4 bare copper, stranded",
  "Bare copper, 1/0": "#1/0 bare copper, stranded",
  // The sheet does not say copper or aluminum. XHHW-2 at these sizes is
  // bought as aluminum feeder, and the catalog ships it only that way.
  "XHHW-2, #2": "#2 XHHW aluminum",
  "XHHW-2, 1/0": "#1/0 XHHW aluminum",
  "XHHW-2, 4/0": "#4/0 XHHW aluminum",
  '4" rigid coupling': '4" rigid conduit coupling',
  // The four cable connectors are sized by jacket diameter and already stand
  // for every style — snap-in, two-screw, duplex — see connectors.ts.
  "AC/MC snap connector": '3/8" cable connector',
  "Duplex NM connector": '3/8" cable connector',
  "Snap-in NM connector": '3/8" cable connector',
  "Two-screw NM connector": '3/8" cable connector',
  "MC cable connector, 3/8 in": '3/8" cable connector',
  "MC cable connector, 1/2 in": '1/2" cable connector',
  "Romex connector, 1/2 in": '1/2" cable connector',
  "Romex connector, 3/4 in": '3/4" cable connector',
  "Compression lug, 4/0": "2/0-4/0 AWG crimp lug",
  "Mechanical lug, 4/0": "2/0-4/0 AWG crimp lug",
  // Polaris is a brand of insulated multi-tap connector.
  "Polaris connector, 4/0": "Insulated multi-tap block",
  "Cable lubricant gel": "Pulling lube",
  "Wire pulling soap": "Pulling lube",
  "Push-in connectors": "Push-in wire connector",
  "Split bolt connector": "Split-bolt connector",
  "Wire nuts, assorted": "Wire nuts",
  "All-thread rod, 3/8 in": '3/8" all-thread rod, 10 ft',
  "All-thread rod, 1/2 in": '1/2" all-thread rod, 10 ft',
  // Unsized duplicates of the four sized rod-hardware families; folded into
  // 3/8", the size most hangers are hung on.
  "Hex nut": '3/8" hex nut',
  "Lock washer": '3/8" lock washer',
  "Washer, flat": '3/8" flat washer',
  "Rod coupling nut": '3/8" rod coupler',
  "Insulated staple": "Cable staple",
  "Nail-on cable staple": "Cable staple",
  "Strut nut": "Strut channel nut",
  "Strut spring nut": "Strut channel nut",
  "Tapcon screw": "Masonry screw",
  "Batwing hanger": "Rod hanger clip",
  "Rod hanger, 1/4-20": "Rod hanger clip",
  "Ceiling grid support clip": "T-bar grid clip",
  "Fixture hanger bar": "Fixture mounting bracket",
  "Pipe strap, 4 in": '4" strut conduit strap',
  "Strut 90-degree fitting": "Strut angle bracket",
  "Strut, 1-5/8 in x 1-5/8 in": '1-5/8" x 1-5/8" strut channel, 10 ft',
  "Strut, 1-5/8 in x 13/16 in": '1-5/8" x 13/16" strut channel, 10 ft',
  "Unistrut end cap": "Strut end cap",
};

export const RENAMED_FROM_SHEET: Record<string, string> = {
  // ── Batch 1
  "14/2 UF-B": "14-2 UF-B",
  "Fire alarm cable, 14/2": "14-2 fire alarm cable",
  "Fire alarm cable, 16/2": "16-2 fire alarm cable",
  "SJOOW cord, 14/3": "14-3 SJOOW cord",
  "SOOW cord, 10/3": "10-3 SOOW cord",
  "SOOW cord, 12/3": "12-3 SOOW cord",
  "Tray cable, 12/3": "12-3 tray cable",
  "Crimp sleeve, #2": "#2 crimp sleeve",
  "Crimp sleeve, 4/0": "#4/0 crimp sleeve",
  "Din rail": "DIN rail",
  "Caddy clip, 1/2 in": '1/2" conduit clip',
  "Caddy clip, 3/4 in": '3/4" conduit clip',
};

/** Every sheet name that moved under a different name, whichever kind. */
export const MOVED_FROM_SHEET: Record<string, string> = {
  ...MERGED_FROM_SHEET,
  ...RENAMED_FROM_SHEET,
};
