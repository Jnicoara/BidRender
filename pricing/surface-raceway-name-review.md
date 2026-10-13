# Surface raceway — name review (2026-10-13, Track C)

**Read-only review. No name has been changed.** For each row on the "Surface
Raceway" shelf of `starter-catalog-pricing.xlsx` ("Starter prices", rows
**636–659**, 24 rows, in the app-order sort of `28245633`), the question is
whether one real product can be priced at Platt or Home Depot from the name
alone. The workbook was read from a copy, because the owner has it open.

**Why this shelf.** It is the next one in app order after Conduit Fittings
(`conduit-name-review.md`). Wire & Cable comes first, but its names were set
row by row in the 2026-10-07 rename (`frozen-names.json`) and the SER rename
(`references/ser-rename-plan.md`). Underground (rows 660–669) is next after
this one.

**The test** uses the properties a supply house names surface raceway by:
the series (500, 700, 1500, 2400D); one piece or base and cover; for a box,
gang count and depth; and the colour (ivory, white or gray). A name that
leaves out something that changes the price is "vague". A property that is
the same on every product of that type is not needed.

**Verdicts:**

- **OK**
- **Needs a word**, and the exact words are given
- **Not a real product**
- **Two products in one row**, or **one product in two rows**

**Used by** counts the shipped starter assemblies (`BASELINE_ASSEMBLIES` via
`starterPartName`) and run types that price from the row, as the sheet's own
column does. DV34 is `Surface raceway receptacle (block wall)`.

**Sources.** Listings were checked on 2026-10-13 at homedepot.com and
platt.com. Where neither listed the part, Legrand's own page or a supply house
(Elliott, Steiner, Crescent, Lumen, Sydist, HD Supply) is named in the row.
Prices are what the listing showed that day. They only show how big a
question is; they are not proposed prices.

**Already decided, and not reopened here:**

- **Wiremold is a search word, never a name** (CLAUDE.md § Brands; the seed
  header in `server/seed/materials/raceUndergroundService.ts`).
- **500 and 700 are each one per-foot row**, priced by their own run type
  (owner, 2026-10-08 and 2026-10-09). The cover rows are retired.
- **A part is shared by 500 and 700 only if one model number fits both**
  (catalog reality check, condition 2; `references/sch80-and-500-plan.md`
  § 5 Q2). That is why the device box, support clip and tee are already
  "500/700", and the couplings and elbows are not. Distributor pages often
  write "500/700 Series" for any part of the family. That is the family's
  name, not proof one part fits both, so this review uses part numbers
  only.
- **Batch 2 of the catalog reality check** renamed 1500 to "Overfloor",
  2400 to "2400D (divided)", and the divider clip to "2400D series". It also
  merged the end cap and the blank end plate into one row.

## Read this before applying anything: some of these names are built by the takeoff

`shared/surfaceRacewayFittings.ts` (`surfaceRacewayPartName`) builds the
names of six parts from the run's series: coupling, entrance end fitting,
support clip, flat, inside and outside elbows, and tee. Clip and tee are in
`SHARED_500_700_PARTS` and build "500/700".

- **Renaming one of those rows, or merging two of them, is code and seed
  together.** The takeoff otherwise asks for a name that no longer exists,
  and nothing on screen says so. Q2 below would be one of these.
- **The other rows are plain renames** through `RENAMED_BASELINE_MATERIALS`:
  the device boxes and plates, the fixture box, the connector, the end cap,
  the divider clip, 1500 and 2400D. DV34 names its parts by KEY
  (`server/seed/starterParts.ts`), which follows the rename map, so a rename
  cannot skip it.

The conduit review's Q5 answer (missing words go in the DESCRIPTION, not the
name) was given for conduit. It is not assumed to carry over here; Q1 asks.

## Existing rows

**Every row from 636 to 659 is in exactly one line below.**

| Rows     | Current name                                                      | Used by                     | Verdict / proposed words                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 636      | `Overfloor raceway, 1500 series`                                  | —                           | OK. **Pack: see P1**                                                                       | One part, Wiremold 1500-10: base AND cover, galvanized steel, 10 ft (Legrand 1500-10; Sydist $4.90 per ft; Lumen $5.13 per ft, sold in 10 ft multiples).                                                                                                                                                                                                                                                                                                                                                                          |
| 637      | `Raceway conduit connector`                                       | —                           | **Needs words** (Q2): `Surface raceway offset connector, 500/700 series`                   | No series in the name. Wiremold makes two 500/700 parts that join raceway to a box: V5785, the combination connector, straight on, and V5786, the adjustable offset connector, with a 1/2" chase nipple and locknut in the box (Legrand V5786; Steiner). The earlier check matched this row to V5786 or the 1585, which belongs to another series. If 647–648 become V5785 (Q2), this row is V5786.                                                                                                                               |
| 638      | `Raceway divider clip, 2400D series`                              | —                           | **Not a real product** (Q4)                                                                | No 2400D divider clip was found on any listing. The 2400D base, V2400BD, is made already divided into two channels, 1/3 and 2/3 (Steiner; Stanion). The parts near that name are the 2401D divided coupling and the 2400WC wire clip, which holds wires and is not a divider. The batch 2 source was a search snippet, not a page.                                                                                                                                                                                                |
| 639      | `Raceway end cap / blank end plate`                               | —                           | **Needs a series, or not a real product** (Q4)                                             | One product with two names (merged in batch 2). **500/700 has no blank end.** None is listed, and a buyer asking on Legrand's V5785 page could not find one. The seed already says a 700 run ends in a box or an entrance end. Blank ends exist for other series (V4010B for 4000, V6010B for 6000), so a 2400D one may exist, but none was confirmed.                                                                                                                                                                            |
| 640      | `Raceway fixture box`                                             | —                           | **Needs words:** `Surface raceway fixture box, 500/700 series, 4-3/4" round, solid base`   | Three 500/700 round boxes, each a different buy: V5738 4-3/4" solid base, 1" deep, takes fixture studs; V5737 4-3/4" open base extension box, mounts on a 3-1/4" or 4" box; V5739 6-3/8" solid base (Legrand; Sydist). The alias "round ceiling light" means the V5738.                                                                                                                                                                                                                                                           |
| 641, 642 | `Surface raceway coupling, 500 series` / `700 series`             | — (priced by traced runs)   | OK. **Pack wrong** (box of 25), **and add a search word**                                  | V506 and V706, one per series. Wiremold calls them **"connection cover"**, and so does the counter: "STL Connection Cover 700 Iv" (Elliott), "connection cover (10-pack)" (HD Supply, $11.99). Put "connection cover" on both rows as a search word. Packs are **10**: Elliott carton of 10, IMS bag of 10, HD Supply 10-pack. No box of 25 was found.                                                                                                                                                                            |
| 643      | `Surface raceway device box, 2-gang, 700 series`                  | —                           | **Needs words:** `Surface raceway device box, 2-gang, 500/700 series, 1-3/8" deep`         | **One part fits both series, so "700" alone is wrong.** Each Wiremold 2-gang box is sold as "500/700": V5747-2 shallow 1-3/8", V5744S-2 deep, V5744-2 extra deep 2-3/4", for deep devices (Legrand; Sydist). Depth changes the price. Shallow is the one that matches a standard device.                                                                                                                                                                                                                                          |
| 644      | `Surface raceway device box, 500/700 series`                      | DV34                        | **Needs words** (Q3): `…, 1-gang, 1-3/4" deep` (V5748) or `…, 1-gang, 1-3/8" deep` (V5747) | Three 1-gang depths, all "500/700": V5748S 15/16", V5747 1-3/8" and V5748 1-3/4" (Platt 0061458 V5747 and 0061461 V5748). **HD: V5747 $8.44, V5748 $12.73**, so the name alone can be off by half. DV34 puts a 20A duplex in it. Wiremold sells V5748 "for deep switches and receptacles" and V5747 for "standard shallow" devices.                                                                                                                                                                                               |
| 645, 646 | `Surface raceway device plate, 500 series` / `700 series`         | 646: DV34                   | **Not a Wiremold product: the box takes a standard plate** (Q5)                            | The 500/700 boxes take a **standard NEMA 1-gang plate**. The V5748 listing says "accepts NEMA single-gang standard faceplates", and 5747WH gives the opening (Legrand; Platt V5748). No 500-only or 700-only plate exists, and no Wiremold plate was found for either box. The 2026-10-09 check kept the two rows apart for want of a part number. This is the reason none turned up. **This prices DV34**, so the row should say what is actually bought.                                                                        |
| 647, 648 | `Surface raceway entrance end fitting, 500 series` / `700 series` | 648: DV34 (and traced runs) | **One product in two rows?** (Q2): `Surface raceway entrance end fitting, 500/700 series`  | The part that starts a 500 or 700 run at a box is **V5785, one model number for both series**. It is a "500/700 Series Combination Connector" for a surface 3-1/4" or 4" box, with a spring bushing, and on 700 the cover extension breaks off (Legrand V5785; Walmart $19.88). No series-only entrance end (a "V510" or "V710") exists on any listing; batch 2 had already marked them "not confirmed by a page". Under the condition 2 rule, that is one row. **Code + seed pair:** `entranceEnd` joins `SHARED_500_700_PARTS`. |
| 649, 650 | `Surface raceway flat elbow, 500 series` / `700 series`           | — (priced by traced runs)   | OK                                                                                         | V511 and V711, one per series (Steiner V511 $2.68; Stanion V711).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 651, 652 | `Surface raceway inside elbow, 500 series` / `700 series`         | — (priced by traced runs)   | OK                                                                                         | V517 and V717 (Steiner V517 $3.37). Distributors label V517 "500 & 700 Series". That is the family name; Wiremold numbers them per series, so they stay apart.                                                                                                                                                                                                                                                                                                                                                                    |
| 653, 654 | `Surface raceway outside elbow, 500 series` / `700 series`        | — (priced by traced runs)   | OK (500 not confirmed)                                                                     | V718 is confirmed (Steiner $3.50). V518 was on no listing found. The row is still the right pattern, but check the part number when pricing.                                                                                                                                                                                                                                                                                                                                                                                      |
| 655      | `Surface raceway support clip, 500/700 series`                    | — (priced by traced runs)   | OK                                                                                         | V5703, steel, one clip for both series (Crescent; Legrand). Elliott and others sell it each, at $0.90–$1.19, so "box of 100" was not confirmed. Check the pack when pricing.                                                                                                                                                                                                                                                                                                                                                      |
| 656      | `Surface raceway tee, 500/700 series`                             | — (priced by traced runs)   | OK                                                                                         | V5715 (Elliott $6.30–$6.91; Lumen $8.26).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 657      | `Surface raceway, 2400D series (divided)`                         | —                           | **Two products in one row** (Q6): base and cover                                           | 2400D is TWO parts, bought separately: the V2400BD divided base, in 10 ft lengths (MC-MC $3.68), and the V2400C cover, in **5 ft** lengths (Steiner; Lumen about $3.17–$3.32 per ft). A per-foot row priced from either one alone is about half the true cost.                                                                                                                                                                                                                                                                    |
| 658      | `Surface raceway, 500 series`                                     | 1 run type                  | OK. **Pack: see P1**                                                                       | V500, one piece, 10 ft, ivory only (Elliott; Legrand). Elliott prices it per foot: $2.04, or $20.38 per 10.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 659      | `Surface raceway, 700 series`                                     | 1 run type                  | OK. **Pack: see P1. Colour: Q7**                                                           | V700, one piece, 10 ft, ivory (Elliott $2.05 "each", sold per foot in 10s). **HD sells the white one, 700WH, as a 10 ft length at $17.25.**                                                                                                                                                                                                                                                                                                                                                                                       |

**Totals, by row: 24.** OK: 13 (636, 641, 642, 649–656, 658, 659; five of
them carry a pack or colour note). Needs words: 6 (637, 640, 643, 644, and
647–648 as a merge). Not a real product, or not a Wiremold one: 4 (638, 639,
645, 646). Two products in one row: 1 (657). 13 + 6 + 4 + 1 = 24.

## Things that could price a starter wrong

**P1 — raceway packs say "per foot" and pack qty 1, and the obvious price to
type is a 10 ft length.** This covers rows 636, 657, 658 and 659. Home Depot
prices the 700WH at **$17.25 for 10 ft**. Typed as a pack price over a pack
of 1, every foot of every traced 700 run prices at $17.25, ten times the real
figure. The counter quotes a per-foot number (Elliott $2.05), so either habit
is plausible, and that is exactly what makes it dangerous. Conduit already
uses `10 ft stick` / `10` (the conduit review, rows 118–153).
**Suggested:** `10 ft length` / `10` on 636, 658 and 659. For 657, see Q6.
This is A's sheet label (`packFor`), with no catalog change.

**P2 — DV34 prices three parts that are each in question:** the box depth
(Q3, $8.44 versus $12.73), the plate (Q5, which is a standard plate), and the
entrance end (Q2). Nothing else uses those rows, but DV34 is the one surface
raceway starter.

**P3 — the coupling packs (641, 642) say 25.** The real pack is 10. With a
10-pack price typed over a pack of 25, each coupling prices at 40% of its
cost.

## Common items that are MISSING

Each one was checked against a real listing on 2026-10-13.

| #   | Item                                                                     | Listing                                                                                           | Why it is needed                                                                                                                                                                                                                                                                      | Search words                                                          |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| S1  | `Surface raceway flush extension adapter, 500/700 series, 1-gang`        | Wiremold V5751, about $10–$13 (Elliott "STL Flush Ext. Iv"; Sydist). V5751A is the 1.8" deep one. | **The usual way to start a run from an existing wall box**, which is the retrofit job surface raceway exists for. It mounts over a flush box, takes a standard plate, and feeds the raceway. Neither the entrance end (which needs a surface box) nor the offset connector does this. | "extension adapter", "flush extension", "starter box", "box extender" |
| S2  | `Surface raceway extension box, 500/700 series, 4-3/4" round, open base` | Wiremold V5737 (Legrand; Dixon)                                                                   | Mounts on an existing 3-1/4" or 4" ceiling box to bring a light onto raceway. It pairs with row 640, the solid-base box, which is for a new fixture point.                                                                                                                            | "extension ring", "round extension", "light box"                      |
| S3  | `Surface raceway blank cover, 500/700 series, round`                     | Wiremold V5736 (Sydist, special order)                                                            | Turns the 640 or S2 round box into a junction or pull box. Without it, a raceway splice point has nothing to close it.                                                                                                                                                                | "blank cover", "junction", "pull box cover"                           |
| S4  | `Surface raceway coupling, 2400D series` (only if 657 stays)             | Wiremold 2401D, divided coupling (MC-MC; Walmart $7.14)                                           | A 2400D run has no coupling in the catalog today.                                                                                                                                                                                                                                     | "2401d", "connection cover", "divided coupling"                       |

The 500/700 fan box (V5738AF, HD 202519448) and the corner box (V5719) are
real, but they were left out as uncommon. Say if either is wanted.

## Owner questions, with suggested answers

**Q1. Do the missing words go in the NAME here, or in the DESCRIPTION as the
conduit answer did?**
Suggested: **names, for every row the takeoff does not build** (637, 640,
643, 644, and 645–646 if kept). These are plain renames through the rename
map, cost no code, and today's names would send a pricer to the wrong part
(the "700"-only 2-gang box, and a box with no depth). The conduit Q5 answer
was about names the takeoff builds, where a rename is a code change. The one
built name in question here, the entrance end (Q2), changes because it
becomes ONE row, not because a word was missing.

**Q2. Entrance end and connector: one V5785 row for both series, and the old
"conduit connector" row becomes the V5786 offset connector?**
Suggested: **yes.** Retire `…entrance end fitting, 500 series` into the 700
row and rename that row in place to `Surface raceway entrance end fitting,
500/700 series` (DV34 follows its key). Keep both old names as search words,
add "combination connector", and add `entranceEnd` to
`SHARED_500_700_PARTS`, so a traced 500 run asks for the shared row. That is
one code + seed pair, the same shape as the clip and tee. Then rename 637 to
`Surface raceway offset connector, 500/700 series`, with "offset connector"
and "chase nipple" as search words.

**Q3. Which 1-gang box depth is the shipped row (644)?**
Suggested: **1-3/4" deep (V5748).** DV34 holds a 20A duplex, and the deep box
is the one Wiremold sells for standard receptacles. It also has room for a
GFCI. The shallow V5747 is $4 cheaper, but it fits only shallow devices. If
both are wanted, the shallow box is a new row.

**Q4. Retire the divider clip (638) and the end cap (639)?**
Suggested: **retire both** through `RETIRED_BASELINE_MATERIALS`. No starter
or run type uses either. 638 has no listing, and the 2400D base comes
divided. 639 has no 500/700 part, and the 2400D one is unconfirmed. Either
row can come back, as the same row, if a part number turns up
(`reactivateBaselineMaterials`).

**Q5. The device plate (645, 646): what does a shop actually put on the box?**
The owner asked for "a matching 700-series device plate" on 2026-10-07, and
the box takes any standard 1-gang plate. Suggested: **merge 645 into 646 and
rename it `Surface raceway device plate, 1-gang duplex, standard NEMA,
500/700 series`**, with the description "Any standard 1-gang duplex plate;
the 500/700 box takes it." DV34 keeps its line, and the owner prices the
plate he buys (ivory steel to match the raceway is the usual one). The other
way is to repoint DV34 to `1-gang wall plate, duplex, nylon` (row 872, used by
15 starters) and retire both rows, which is fine if a nylon plate is what goes
on.

**Q6. 2400D (657): one per-foot row priced as base plus cover, or two rows?**
Suggested: **one row, base plus cover, per foot**, with the description
"Divided base (10 ft) plus cover (5 ft lengths); price both per foot." That
is the 700 precedent: one per-foot row per run type, and the 1500-10 already
ships base and cover together. Pack `per foot` / `1`, because the base and
cover come in different lengths and no single length prices both.

**Q7. Colour: ivory, the standard?**
Suggested: **ivory, said in the description** of every 500/700 row: "Ivory
(the standard V part). White and gray cost more." 500 comes only in ivory.
700 white is a different, dearer part: the tee is $8.26 ivory and $10.63
white (Lumen V5715 and 5715WH), and HD stocks only the white 700 raceway. No
new rows. Add "ivory" and "white" as search words on 659 only, so either word
finds the raceway.

**Q8. Add S1–S3 (and S4 if 657 stays)?**
Suggested: **yes to S1** (the common retrofit start) **and S2–S3**, with the
search words above. S4 only if Q6 keeps 2400D.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS` and retirements through
  `RETIRED_BASELINE_MATERIALS`, each old name kept as a search word on the ONE
  row that replaces it (condition 1).
- Q2 is the one code change: `shared/surfaceRacewayFittings.ts`
  `SHARED_500_700_PARTS`, plus its test, in the same commit as the seed.
- P1 and P3 are sheet labels in `packFor`, plus the seed's pack, with no
  name change.
- Check with `scripts/searchSpotCheck.mts` that "connection cover", "entrance
  end", "extension adapter", "offset connector", "700" and "wiremold" each
  surface their own row first.
- If a recount at the job finds a starter or run type using 638, 639, 645 or
  647 that this review did not list, stop and find out why before changing
  anything.
