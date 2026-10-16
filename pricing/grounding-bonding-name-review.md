# Grounding & Bonding — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Grounding & Bonding" shelf of `starter-catalog-pricing.xlsx` ("Starter
prices", spreadsheet rows **1308–1326**, 19 rows, in the app-order sort),
the question is whether one real product can be priced at Platt or Home
Depot from the name alone. The workbook was read from a fresh copy (the
worktree's copy, byte for byte the same as `C:\dev\BidPhase\pricing`),
because the owner has it open. It is the shelf after Lighting Hardware
(`lighting-hardware-name-review.md`); Life Safety starts at row 1327.

The sheet's 19 names match `BASELINE_MATERIALS`' Grounding & Bonding rows
one for one (read from the seed the same day), so the search words quoted
below are the catalog's own. No row on this shelf carries a description
today.

**The test.** A ground rod is bought by diameter, length and coating
(copper-bonded or galvanized); a clamp by the pipe or rod it fits; a
coupling by rod size and type (compression or threaded); an exothermic
mold by the exact connection it makes, because a mold for one conductor and
rod is scrap for any other.

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**;
**Decided**, where an earlier decision settled it.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**6 of the 19 rows are used** (the sheet's "Used by" column says the same).
**No run type uses this shelf.**

**Sources.** Listings checked on 2026-10-14: ERICO 615880 copper ground rod
(Home Depot, Elliott), bronze 1/2"–1" water pipe clamps (Home Depot
Commercial Electric J-B1-25, SupplyHouse Blackburn, Crescent Burndy), ILSCO
GBL-4 lay-in lug (Crescent, Stoneway, McMc, RSP, Lumen), 5/8" rod couplers
(nVent CC58 at Crescent, Stoneway and PartsSource; CR58 at Elliott), Cadweld
GTC161T (Platt, Crescent), nVent ERICO copper ground plates (Platt,
Royal Wholesale, Northcoast). Prices only show how big a question is; they
are not proposed prices.

**Already decided, and not reopened here:**

- **Packs** (owner, 2026-10-13, `pack-label-scan.md` "Owner's answers"):
  `Grounding pigtail` → `bag of 50` / 50; `Exothermic weld powder` → `box of
10` / 10, and that scan said the name should state the shot size (Q5).
- **`Ground rod clamp` → `Ground rod clamp, 5/8", direct burial`** (catalog
  reality check batch 1, applied 2026-10-09).
- **Brands:** generic. "cadweld" and "thermoweld" are search words only.

## Existing rows

| Row  | Current name                            | Used by                                                                         | Verdict                                                                     | Why                                                                                                                                                                                                                                             |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1315 | `Ground rod, 5/8" x 8 ft`               | **10 starters**: PG2, PG3, PG11, GR2, GR3, GR5, CW12 (x2 each); PG19, PG20, GC3 | **Needs words** (Q2): `Ground rod, 5/8" x 8 ft, copper-bonded`              | Rods are sold copper-bonded or galvanized, at different prices, and this row's search words say both ("copper clad galvanized"). ERICO 615880 copper-bonded: **$22.78** (Home Depot), **$23.84–$40.33** (Elliott).                              |
| 1316 | `Ground rod, 5/8" x 10 ft`              | —                                                                               | **Needs words** (Q2): `Ground rod, 5/8" x 10 ft, copper-bonded`             | Same; its search words already say "copper clad".                                                                                                                                                                                               |
| 1317 | `Ground rod, 3/4" x 10 ft`              | —                                                                               | **Needs words** (Q2): `Ground rod, 3/4" x 10 ft, copper-bonded`             | Same.                                                                                                                                                                                                                                           |
| 1318 | `Ground rod clamp, 5/8", direct burial` | **10 starters**, the same as 1315                                               | **Decided** name; pack **P1**                                               | Named 2026-10-09. The pack is the problem (Q10).                                                                                                                                                                                                |
| 1319 | `Ground rod coupling`                   | —                                                                               | **Needs words** (Q4): `Ground rod coupling, 5/8", compression`              | Sold by rod size and type: compression couplers fit an ordinary pointed rod (nVent CC58, **$15.12–$29.85**); threaded couplings fit only threaded sectional rods (CR58, **$14.78–$20.13**). Its search words say both ("threaded compression"). |
| 1320 | `Ground rod driving stud`               | —                                                                               | **Needs words** (Q4): `Ground rod driving stud, 5/8"`                       | A driving stud screws onto a threaded sectional rod; it is sized to the rod. Q4 adds what it is for.                                                                                                                                            |
| 1326 | `Water pipe bonding clamp`              | PG2, PG3, PG11, GR2, GR3                                                        | **Needs words** (Q3): `Pipe bonding clamp, bronze, 1/2"-1"`                 | Clamps are sold by pipe range. Bronze 1/2"–1": **$4.98** (Home Depot), **$8.28** (SupplyHouse), **$8.88** (Crescent). Pack: P1.                                                                                                                 |
| 1311 | `Gas pipe bonding clamp`                | —                                                                               | **Owner pick** (Q3)                                                         | The bonding clamp on a gas pipe is the same bronze pipe clamp as on a water pipe, so two rows price one product twice. Pack: P1.                                                                                                                |
| 1325 | `Rebar ground clamp`                    | —                                                                               | **Owner pick** (Q9)                                                         | Sized by rebar; no size named. Not checked on 2026-10-14. Pack: P1.                                                                                                                                                                             |
| 1313 | `Ground lug, mechanical`                | —                                                                               | **Needs words** (Q7): `Lay-in ground lug, #14-#4`                           | Its search words say "lay in", which is the common product: ILSCO GBL-4, #14–#4, **$4.52–$6.94** (Crescent, Stoneway, McMc, RSP, Lumen). "Mechanical" alone covers any set-screw lug, of any size.                                              |
| 1314 | `Ground plate electrode`                | —                                                                               | **Needs words** (Q6): `Ground plate electrode, copper, 12" x 24" (2 sq ft)` | The NEC's plate electrode must expose at least 2 sq ft (250.52(A)(7)), so 12" × 24" is the smallest that counts. ERICO GPECNDH024 (bare, 12" × 24"): no price shown; a 12" × 24" plate with cable attachments is **$568.63** (Platt).           |
| 1309 | `Exothermic weld mold`                  | —                                                                               | **Needs words** (Q5): `Exothermic weld mold, #2 solid to 5/8" rod`          | A mold makes one connection only. The common one, #2 solid cable to a 5/8" rod (Cadweld GTC161T, #90 weld metal): **$344.82** (Platt), **$342.04–$431.63** (Crescent).                                                                          |
| 1310 | `Exothermic weld powder`                | —                                                                               | **Needs words** (Q5): `Exothermic weld powder, #90`                         | The shot size must match the mold; #90 is the size GTC161T takes. Pack decided 2026-10-13 (box of 10).                                                                                                                                          |
| 1308 | `Bonding jumper`                        | —                                                                               | **Owner pick** (Q8)                                                         | Its search words ("bond strap water pipe gas main green braided") cover three different products: a water-heater jumper, a braided strap, and a main bonding jumper, which is already `Main bonding jumper kit` on Service Entrance.            |
| 1312 | `Ground bar kit`                        | PG5, CW4                                                                        | OK (+ description, Q11)                                                     | The trade's name. It fits one panel family, like the panel parts (Panels Q8).                                                                                                                                                                   |
| 1324 | `Intersystem bonding bridge`            | PG2, PG3, PG11, GR2, GR3                                                        | OK                                                                          | Sold as a "bridge" (RACO IBB, Southwire MEIBB), checked 2026-10-09.                                                                                                                                                                             |
| 1322 | `Grounding pigtail`                     | **15 starters**                                                                 | OK                                                                          | Pack decided 2026-10-13 (bag of 50).                                                                                                                                                                                                            |
| 1323 | `Grounding screw`                       | —                                                                               | OK                                                                          | Green 10-32, one product.                                                                                                                                                                                                                       |
| 1321 | `Ground wire staple`                    | —                                                                               | OK                                                                          | For securing a bare grounding electrode conductor.                                                                                                                                                                                              |

**Totals, by row: 19.**

| Verdict     | Rows                                                       | Count  |
| ----------- | ---------------------------------------------------------- | ------ |
| OK          | 1312, 1321, 1322, 1323, 1324                               | **5**  |
| Decided     | 1318                                                       | **1**  |
| Needs words | 1309, 1310, 1313, 1314, 1315, 1316, 1317, 1319, 1320, 1326 | **10** |
| Owner pick  | 1308, 1311, 1325                                           | **3**  |

5 + 1 + 10 + 3 = **19**. If a recount of the sheet gives another total,
stop and find out why: either the shelf moved (new rows sort in) or this
table is stale.

## Packs

**P1 — five clamp and coupling rows are a box of 25, from the word "clamp"
or "coupling"** (`pack-label-scan.md` § E): 1311, 1318, 1319, 1325, 1326.
The listings found price them by the piece (the 1/2"–1" pipe clamps at
Home Depot, SupplyHouse and Crescent; the couplers above). The
two weightiest rows are on this shelf: **1318 is in 10 starters, most of
them twice, and 1326 in 5.** If the owner types the each price under a pack
of 25, every one of those starters prices its clamps at a twenty-fifth.
Q10. The staple and the screw (1321, 1323, box of 100) are bought in boxes,
and stay.

## Search words and descriptions (not names)

**S1 — "galvanized" on `Ground rod, 5/8" x 8 ft`** points a galvanized
search at a copper-bonded row once Q2 names it. Suggested: drop it; a
galvanized row is a new row if wanted.

**S2 — "gas main" on `Bonding jumper`.** A main bonding jumper is
`Main bonding jumper kit` (Service Entrance), and "main" here lets a search
for it find this row too. Suggested: drop "main" with Q8.

## Things that could price a bid wrong

**P1 — clamps at a twenty-fifth** (above). Ten starters.

**P2 — a copper-bonded rod or a galvanized one.** Ten starters price one or
two rods each, and the row says both. Q2.

**P3 — one mold for every connection.** At $342–$432 a mold, an unnamed
mold is a several-hundred-dollar line nobody can order from. Q5.

## Common items that are MISSING

| #   | Item                                | Listing                  | Why it is needed                                                                                          | Search words                           |
| --- | ----------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| M1  | `Exothermic weld mold handle clamp` | Not priced on 2026-10-14 | A graphite mold is held and closed with a handle clamp, sold separately; a mold alone cannot make a weld. | "cadweld handle", "mold clamp", "l160" |

`Ground rod access well` (Service Entrance; becoming `Ground rod
inspection well, 10", HDPE` by that shelf's Q7) and `Main bonding jumper
kit` (Service Entrance) were found first and are not missing.

## Owner questions, with suggested answers

**Q1. Do the missing words go in the NAME or the DESCRIPTION?**
Suggested: **names**, as for every shelf so far, each old name kept as a
search word on its row.

**Q2. Ground rods: name the coating?**
Suggested: **yes, copper-bonded** on all three rods, and drop "galvanized"
from 1315's search words (S1). Copper-bonded is what the counter hands over
for a house ground; a galvanized rod is a different price and a new row if
wanted.

**Q3. Water pipe and gas pipe bonding clamps are the same clamp: one row?**
Suggested: **yes.** Rename 1326 to `Pipe bonding clamp, bronze, 1/2"-1"`
(its 5 starters move with it), with "water pipe", "gas pipe" and "csst" as
search words, and retire 1311 into it (hidden, never deleted). Two rows for
one clamp is one product priced twice.

**Q4. Rod coupling and driving stud: name the size and type?**
Suggested: **yes**: `Ground rod coupling, 5/8", compression` (fits an
ordinary rod) and `Ground rod driving stud, 5/8"`, with the description "For
threaded sectional rods." A threaded coupling does not fit a plain rod.

**Q5. Exothermic weld: name the connection and the shot?**
Suggested: **yes**: `Exothermic weld mold, #2 solid to 5/8" rod` and
`Exothermic weld powder, #90` (the size that mold takes), and add M1, the
handle clamp. A mold for the wrong cable is scrap.

**Q6. Ground plate: name the size?**
Suggested: **yes**: `Ground plate electrode, copper, 12" x 24" (2 sq ft)`.
2 sq ft is the code minimum, so it is the plate that gets bought.

**Q7. Ground lug: name the common lay-in lug?**
Suggested: **yes**: `Lay-in ground lug, #14-#4`, old name a search word. It
is the lug the search words already describe, at about $5.

**Q8. `Bonding jumper`: what is it?**
Suggested: **a water-heater bonding jumper kit** (a short #6 jumper with two
pipe clamps), named from one listing A checks, and drop "main" from its
search words (S2). The main bonding jumper already has its own row.

**Q9. Rebar ground clamp: name the rebar size?**
Suggested: **yes**, from one listing A checks (the size a footing's rebar
usually is). Not checked on 2026-10-14.

**Q10. Clamps and coupling: sold each?**
Suggested: **yes**: 1311, 1318, 1319, 1325 and 1326 become `each` / 1 in the
pack pass (`pack-label-scan.md` § E); the staple and the screw stay boxes.
The starters buy one or two.

**Q11. Ground bar kit: add a fit description?**
Suggested: **yes**: "Fits the panel's own family (QO, Homeline, …) — order
with the panel", the same as the panel parts (Panels Q8).

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row; M1 is a new seed row; 1311 (if Q3 is yes) goes on
  `RETIRED_BASELINE_MATERIALS`, its name a search word on the kept row.
- **Starter edits: none.** Starters name parts by KEY (`starterParts.ts`),
  so the renames move no starter; the ten rod starters and the five clamp
  starters follow their renamed rows.
- The pack changes (Q10) go in the pack pass, before the owner types these
  prices.
- Run `scripts/searchSpotCheck.mts` for "ground rod", "8 ft ground rod",
  "acorn", "water pipe clamp", "gas bond", "csst", "ground lug", "lay in
  lug", "cadweld", "ibt", "ground bar", "pigtail" and "bonding jumper".
  "bonding jumper" should lead with this shelf's row, and "main bonding
  jumper" with the Service Entrance kit.
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming or retiring it.

## Owner's answers — 2026-10-14: Q1–Q11 all YES, as suggested

For A's end-of-pricing job. Nothing applied here; no catalog row, seed or
starter changed.

1. **Q1 yes**: the missing words go in the NAMES, each old name kept as a
   search word on its row.
2. **Q2 yes**: rods 1315–1317 say `copper-bonded`; "galvanized" leaves
   1315's search words (S1).
3. **Q3 yes**: 1326 becomes `Pipe bonding clamp, bronze, 1/2"-1"` with
   "water pipe", "gas pipe" and "csst" as search words; 1311 retires into it
   (`RETIRED_BASELINE_MATERIALS`, its name a search word on 1326).
4. **Q4 yes**: `Ground rod coupling, 5/8", compression` and `Ground rod
driving stud, 5/8"` with the description "For threaded sectional rods."
5. **Q5 yes**: `Exothermic weld mold, #2 solid to 5/8" rod`, `Exothermic
weld powder, #90`, and M1 (the mold handle clamp) is added.
6. **Q6 yes**: `Ground plate electrode, copper, 12" x 24" (2 sq ft)`.
7. **Q7 yes**: `Lay-in ground lug, #14-#4`.
8. **Q8 yes**: `Bonding jumper` becomes a water-heater bonding jumper kit,
   named from one listing A checks; "main" leaves its search words (S2).
9. **Q9 yes**: the rebar clamp names its rebar size, from one listing A
   checks.
10. **Q10 yes**: 1311, 1318, 1319, 1325 and 1326 become `each` / 1 in the
    pack pass; the staple and screw stay boxes. (1311 retires under Q3, so
    its pack only matters if it is ever un-retired.)
11. **Q11 yes**: the ground bar kit gets "Fits the panel's own family (QO,
    Homeline, …) — order with the panel".

**Starter edits: none** — the rod and clamp starters follow their renamed
rows by key. "For A, when the answers come back" above is the job list.

## Source rule for the new rows (owner, 2026-10-14)

The new rows this review proposed are checked in
`pricing/new-rows-source-check.md`. **That file, not the "Listing" column
above, decides each new row's price:** COMMON (found at Home Depot, Platt
or Stoneway) takes its Example price from those three only; SPECIALTY is
still added, with the price blank and "Specialty - price from your
supplier." Listings above from other sites are comparison only.
