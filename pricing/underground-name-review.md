# Underground — name review (2026-10-13, Track C)

**Read-only review. No name has been changed.** For each row on the
"Underground" shelf of `starter-catalog-pricing.xlsx` ("Starter prices", rows
**660–669**, 10 rows, in the app-order sort of `28245633`), the question is
whether one real product can be priced at Platt or Home Depot from the name
alone. The workbook was read from a fresh copy, because the owner has it
open. It is the shelf after Surface Raceway (`surface-raceway-name-review.md`).

**The test** uses the properties a supply house names these parts by: for a
spacer, conduit size, base or intermediate, and separation; for a handhole,
size, depth, load tier and cover marking; for tape, rope and wire, width or
gauge, material, detectable or not, and roll length; for a connector, the
wire range. A name that leaves out something that changes the price is
"vague".

**Verdicts:** **OK**; **Needs a word**, with the exact words; **Not a real
product**; **Two products in one row**.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`)
and run types. The sheet's column shows **no use for any of these 10 rows.
That is wrong for one of them**; see U-A below.

**Sources.** Listings were checked on 2026-10-13 at homedepot.com and
platt.com. Where neither listed the part, the supply house or maker's page
(Elliott, Steiner, Sydist, Gexpro, Pollard Water, Pipemarker, ABB) is named in
the row. Prices only show how big a question is; they are not proposed
prices.

**Already decided, and not reopened here:**

- **The handhole** is the in-grade pull point for site lighting and
  underground runs. It is not the light pole's handhole cover or the
  landscape splice box (coverage check, owner-approved, 2026-10-09; seed
  comment in `server/seed/materials/raceUndergroundService.ts`).
- **`Duct bank spacer` retired into `Conduit spacer, 2"`** (catalog reality
  check, batch 2).
- **Warning tape rides on every shipped underground run type** and follows
  the FLAT traced length, one foot of tape per foot of trench (owner decision
  2; `server/seed/baselineRunTypes.ts` `WARNING_TAPE`;
  `shared/runExtrasPerFoot.ts`). The underground types ship NO wire.
- **Batch 2 marked all eight of the other rows OK as "stocked", with no
  page.** That check asked whether the item exists. This one asks whether the
  name prices one product.

## Read this first: two things for A that are not names

**U-A. The sheet hides the one row 18 run types price.** `usedBy` in
`pricing/starterSheetLayout.ts` counts a run type's raceway, conductor and
ground, but **not its extras**. So `Underground warning tape` shows "Not in
an assembly" and sorts to the bottom of the shelf. In fact it is priced by
all 18 shipped underground types: 9 sizes × Sch 40 and Sch 80
(`UNDERGROUND_SCHEDULES` × `sizesFor` = `TRADE_SIZES`). Unpriced, every one
of them leaves the tape off the bid. Adding `extras[].materialName` to
`usedBy` is A's fix; nothing here changes it.

**U-B. The warning tape's name is matched EXACTLY by those run types**
(`WARNING_TAPE.materialName`). A rename there is a seed + run-type edit in
one commit, like the conduit names the takeoff builds. The other nine rows
are plain renames through `RENAMED_BASELINE_MATERIALS`.

## Existing rows

| Row | Current name                          | Used by                                 | Verdict / proposed words                                                                                | Why                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 660 | `Conduit spacer, 2"`                  | —                                       | **Needs words:** `Conduit spacer, 2", base, 3" separation`                                              | A duct spacer is sold by conduit size **and** separation **and** position. Carlon S288JLN is the "2 x 3 in" base spacer (Steiner; Sydist $246.70 per 100). The bottom tier takes a base and each tier above it an intermediate. The alias "base" already says which, and 3" is the common separation.                                                                      |
| 661 | `Conduit spacer, 4"`                  | —                                       | **Needs words:** `Conduit spacer, 4", base, 3" separation`                                              | Carlon S288NLN, 4" x 3" base (Elliott $3.63–$4.04). The 4" base with **2"** separation, S288NJN, is a different part ($8.02, PartsSource). The intermediate, S289NLN, is Platt **$2.92** (0160572).                                                                                                                                                                        |
| 662 | `Direct burial wire nut`              | —                                       | **Needs words:** `Direct burial wire nut, #22–#8`                                                       | Direct-bury connectors are sized like any wire nut. HD lists DryConn Large aqua (10670, #22–#8) at **$115.57 per 100**, X-Large blue/blue for bigger wire, and a 20-pack (10222) at $15.25. The box of 100 matches the 10670.                                                                                                                                              |
| 663 | `Handhole with lid, polymer concrete` | —                                       | **Needs words** (Q5): `Handhole, polymer concrete, 13" x 24" x 12", Tier 15, "ELECTRIC" cover`          | **Size and tier are the whole price, and box and cover are sold apart.** Platt: Quazite PG1324BA12, 13x24x12 box, **$264.88**; PG1324HA0017P, Tier 15 "ELECTRIC" cover, **$225.53**. That is about $490 for the pair. 17x30, 24x36 and Tier 22 sizes are all common. "With lid" is right, but the row must be priced as box plus cover, and the description should say so. |
| 664 | `Mule tape, 1800 lb`                  | —                                       | OK. **Pack: see P1**                                                                                    | 1800 lb is the 5/8" polyester tape. Platt Neptco 0873571 is "Polyester MuleTape, rated to 1800 lbs, 3000' reel, 5/8" wide"; HD Gardner Bender MT5800 is 5/8" x 3000 ft, **$162.82**.                                                                                                                                                                                       |
| 665 | `Pull rope, 1/4"`                     | —                                       | **Needs a word:** `Pull rope, 1/4", polypropylene`. **Pack: see P1**                                    | The electrical 1/4" pull rope is polypropylene (HD Ideal Pro-Pull 31-841, 1/4" x 1000 ft, $109–$136; Elliott 14100, yellow poly). A polyester double-braid rope is a different and dearer buy.                                                                                                                                                                             |
| 666 | `Tracer wire`                         | —                                       | **Needs words** (Q6): `Tracer wire, #14 solid copper, red, direct burial`. **Pack label wrong: see P1** | Tracer wire varies by gauge (#14 or #12), conductor (solid copper or copper-clad steel, a different price), insulation thickness and colour. **Red is the electric colour.** HD Syston 8258-SP-RD-500, #14 solid copper, red, direct burial, **$84.28 per 500 ft**. Rolls are sold in **500 ft** (Ferguson; HD), not the 250 ft the sheet's pack label says.               |
| 667 | `Tracer wire access box`              | —                                       | **Needs words** (Q7): `Tracer wire access box, grade level, light duty`                                 | Grade-level access points are sold by duty. Copperhead SnakePit light duty (CLD14BTP) is **$44.50**; the driveway-rated one, with a cast iron collar (CCD14BTP), is **$77.90** (Pollard Water). Lid colour follows the utility: the blue ones are water, and red is electric. Neither Platt nor HD listed one.                                                             |
| 668 | `Trench marker post`                  | —                                       | **Needs words** (Q8): `Utility marker post, 66", "buried electric"`                                     | Marker posts are sold by height (66" or 72") and legend. Pipemarker U1002R-DP66, "Warning Electric Line", HDPE, 66", is $25.22; SafetySign's triangular "Buried Electric Cable" 66" is $33.05; the fiberglass flat one is $38.61. Neither Platt nor HD listed one. "Trench marker post" is not how they are sold, so it becomes a search word.                             |
| 669 | `Underground warning tape`            | **18 run types** (sheet says none, U-A) | **Needs words** (Q2): `Underground warning tape, 3", red, non-detectable`. **Pack: see P1**             | **Detectable and non-detectable differ by 3.5×**, and the alias "detectable" claims both. Platt: Dottie UT8D, 3" x 1000 ft red "Buried Electric Line Below", **$49.62**; 3M 406, 3" x 1000 ft red, **detectable**, **$177.11**; Ideal 6" x 1000 ft, $106.09. Width doubles the price as well. Rename is a seed + run-type pair (U-B).                                      |

**Totals, by row: 10.** OK: 1 (664). Needs words: 9 (660–663, 665–669).
Not a real product: 0. Two products in one row: 0, though 663 is priced as a
pair and must say so. 1 + 9 = 10.

## Things that could price a bid wrong

**P1 — four per-foot rows say pack qty 1, and every one is bought on a
reel.** If the reel price is typed as the pack price, each foot is priced at
the whole reel.

| Row | Bought as (listing)             | Reel price | Per foot | Suggested pack        |
| --- | ------------------------------- | ---------- | -------- | --------------------- |
| 664 | 3000 ft reel (Platt; HD MT5800) | $162.82    | 5.4¢     | `3000 ft reel` / 3000 |
| 665 | 1000 ft (HD 31-841)             | $109–$136  | 11–14¢   | `1000 ft` / 1000      |
| 666 | 500 ft (HD Syston; Ferguson)    | $84.28     | 17¢      | `500 ft roll` / 500   |
| 669 | 1000 ft roll (Platt UT8D)       | $49.62     | 5¢       | `1000 ft roll` / 1000 |

**669 matters most.** Its 18 run types multiply it by every foot of trench,
so a tape typed as $49.62 per foot adds about $10,000 to a 200 ft trench.
The wire rows already use the owner's "per foot (from 250 ft roll)" label
style, so the cheaper fix is that same label with the real roll length:
"per foot (from 1000 ft roll)", and so on. 666's label already says 250 ft,
and the roll is 500 ft. These are A's sheet labels (`packFor`) and the seed's
pack, with no name change.

**P2 — the handhole (663) is about $490, and half of it is the cover.** A
price taken from the box line alone, or the cover line alone, is about half
the real cost. It is Commercial-tagged, and no shipped starter uses it today.

## Common items that are MISSING

Each one was checked against a real listing on 2026-10-13.

| #   | Item                                                         | Listing                                                                                                      | Why it is needed                                                                                                                                                                                               | Search words                                          |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| U1  | `Conduit spacer, 2", intermediate, 3" separation` and `…4"…` | Carlon S289NLN, 4" x 3" intermediate, Platt **$2.92** (0160572); the 2" twin follows the same S289 numbering | A duct bank of two tiers or more needs an intermediate spacer for every tier above the base. Today the catalog has bases only, so a stacked bank cannot be priced. **Check the 2" part number.**               | "intermediate", "spacer", "duct bank", "stack"        |
| U2  | `Underground warning tape, 3", red, detectable`              | 3M 406, 3" x 1000 ft red, detectable, Platt **$177.11** (0788715)                                            | Some jobs specify detectable tape over non-metallic conduit, at 3.5× the price. Only needed if Q2 picks non-detectable for the shipped row.                                                                    | "detectable", "metallic", "locatable", "caution tape" |
| U3  | `{size} PVC conduit end cap`, 1/2"–4"                        | Carlon E958 series, Sch 40 and 80: E958J 2", E958L 3" (Crescent $51.88 for 3", likely a pack); ABB catalog   | Caps a stub-out or spare conduit until it is used. It is on most underground and slab jobs, and the catalog has no PVC cap at all. **Check the pack before pricing**: ABB lists E958J in packs of 200 and 120. | "pipe cap", "end cap", "stub cap", "pvc cap"          |

`Duct seal` (Consumables), `Underground splice kit` (Consumables), the
insulated multi-taps and set-screw splices (Connectors), PVC sweeps and end
bells (Conduit Fittings; end bells are conduit X4) already exist, so they are
not listed.

## Owner questions, with suggested answers

**Q1. Do the missing words go in the NAME or the DESCRIPTION?**
Suggested: **names**, as in the surface raceway Q1. Nine of these are plain
renames, and today's names do not say which product to price. The warning
tape (Q2) is the only one whose rename also edits the run types (U-B). That
is one commit, and worth it, because it is the row that prices 18 types.

**Q2. Warning tape: which one ships?**
Suggested: **3" red non-detectable, "Caution buried electric line below",
1000 ft roll** (Platt UT8D, about 5¢ a foot). It is the ordinary buy, and
tracer wire is how a PVC run is found again. Drop "detectable" from this
row's search words and add it as U2 only if wanted.

**Q3. Packs for the four reel items (P1)?**
Suggested: **per foot, labelled with the real reel**: mule tape "(from 3000
ft reel)", pull rope "(from 1000 ft)", tracer wire "(from 500 ft roll)", and
warning tape "(from 1000 ft roll)". The owner types the per-foot price, the
same as wire.

**Q4. Spacers: base with 3" separation, and add the intermediates?**
Suggested: **yes to both.** Name 660 and 661 as base spacers with 3"
separation, add U1, and keep "duct bank" on all four.

**Q5. Handhole: which size, and priced as box plus cover?**
Suggested: **13" x 24" x 12", Tier 15, with an "ELECTRIC" cover, priced as
the pair.** It is the common site-lighting and pull-point box, and Tier 15
covers sidewalks and occasional non-deliberate traffic. The description
says: "Box and cover are bought separately; price both. Tier 22 for
driveways." Other sizes are new rows if wanted.

**Q6. Tracer wire: #14 solid copper, red?**
Suggested: **yes.** #14 is the usual open-trench size, and red is the
electric locate colour. Copper-clad steel is cheaper and stronger, but it is
a different product. Add "locate wire" and "14 awg" as search words, and
drop "pvc conduit utility", which names other things.

**Q7. Tracer wire access box: light duty or driveway?**
Suggested: **grade-level light duty, red lid** ($44.50 class). Driveway-rated
is a new row if wanted.

**Q8. Marker post: rename to "Utility marker post, 66", buried electric"?**
Suggested: **yes**, keeping "trench marker post" as a search word. 66" is the
common height, and the legend is what is ordered.

**Q9. Direct burial wire nut: #22–#8?**
Suggested: **yes** (DryConn Large class, box of 100). Bigger wire underground
uses the splice kit or the insulated multi-taps, which already exist.

**Q10. Add U1, U3 (and U2 if Q2 stays non-detectable)?**
Suggested: **yes to U1 and U3.** U2 only if detectable tape is something a
shop is asked for.

## For A, when the answers come back

- **U-A first**, even with no answers: `usedBy` should count run-type
  extras, so warning tape sorts to the top with its 18 users. Otherwise the
  most-used row on this shelf is the last one the owner reaches.
- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name kept as a
  search word (condition 1). The warning tape rename edits
  `WARNING_TAPE.materialName` in the same commit; `frozenMaterialNames.test.ts`
  checks run types against the frozen names.
- P1 is sheet labels in `packFor` and the seed's pack, with no name change.
- Run `scripts/searchSpotCheck.mts` for "warning tape", "caution tape",
  "tracer", "mule tape", "pull rope", "spacer", "handhole", "quazite" and
  "dbr". Each should surface its own row first.
- If a recount finds a starter using any of rows 660–669, or a run type using
  one other than the warning tape, stop and find out why before changing
  anything.

## Owner's answers — 2026-10-13

**Nothing below is applied yet.** It is all for A's **end-of-pricing job**.
Track C changes no catalog row, seed, run type or starter.

| Q   | Answer                                                                             | What the job does                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Yes: names.** The warning tape is renamed in the SAME commit as its 18 run types | Rename all nine "Needs words" rows through `RENAMED_BASELINE_MATERIALS`, each old name kept as a search word on its row. The warning tape's rename edits `WARNING_TAPE.materialName` (`server/seed/baselineRunTypes.ts`) in the same commit, so no run type ever names a material that is not there (U-B). `frozenMaterialNames.test.ts` checks the run types.             |
| Q2  | **Yes**                                                                            | 669 becomes `Underground warning tape, 3", red, non-detectable` (Dottie UT8D class, "Caution buried electric line below", 1000 ft roll). "detectable" comes OFF this row's search words; it goes on U2.                                                                                                                                                                    |
| Q3  | **Yes: per foot, labelled with the real reel size**                                | Pack stays `1`; the label names the reel, and the owner types the PER-FOOT price, as for wire. 664 `per foot (from 3000 ft reel)`, 665 `per foot (from 1000 ft reel)`, 666 `per foot (from 500 ft roll)` (was 250 ft), 669 `per foot (from 1000 ft roll)`. The same labels are in `pack-label-scan.md` A and D, so this is the same pass, not a second one.                |
| Q4  | **Yes**                                                                            | 660 `Conduit spacer, 2", base, 3" separation`; 661 `Conduit spacer, 4", base, 3" separation`. Add U1 (Q10). "duct bank" stays on all four.                                                                                                                                                                                                                                 |
| Q5  | **Yes**                                                                            | 663 becomes `Handhole, polymer concrete, 13" x 24" x 12", Tier 15, "ELECTRIC" cover`, priced as box plus cover. Description: "Box and cover are bought separately; price both. Tier 22 for driveways." "quazite", "pull box" and "with lid" become search words.                                                                                                           |
| Q6  | **Yes**                                                                            | 666 becomes `Tracer wire, #14 solid copper, red, direct burial`. Add "locate wire" and "14 awg" as search words; drop "pvc conduit utility".                                                                                                                                                                                                                               |
| Q7  | **Yes**                                                                            | 667 becomes `Tracer wire access box, grade level, light duty`, red lid. Driveway-rated is not added.                                                                                                                                                                                                                                                                       |
| Q8  | **Yes. "trench marker post" stays a search word**                                  | 668 becomes `Utility marker post, 66", "buried electric"`.                                                                                                                                                                                                                                                                                                                 |
| Q9  | **Yes**                                                                            | 662 becomes `Direct burial wire nut, #22–#8` (DryConn Large class). Pack `box of 100` / 100 if the row is priced from the box.                                                                                                                                                                                                                                             |
| Q10 | **Add U1, U2 and U3. U2 is its own optional row**                                  | Add the 2" and 4" intermediate spacers (U1; **check the 2" part number**), `Underground warning tape, 3", red, detectable` as a separate row that no run type prices (U2; label `per foot (from 1000 ft roll)`), and `{size} PVC conduit end cap` 1/2"–4" (U3; **check the pack before pricing**, ABB lists packs of 120–200). Search words as in the missing-items table. |

**U-A is still A's first step**, whatever the answers: `usedBy` must count
run-type extras so the warning tape shows its 18 users and sorts first.

**Check before shipping.** Run `scripts/searchSpotCheck.mts` for "warning
tape", "caution tape", "detectable", "tracer", "locate wire", "mule tape",
"pull rope", "spacer", "intermediate", "handhole", "quazite", "dbr" and "pvc
cap". Each must surface its own row first, and "warning tape" must surface
the non-detectable row (the one the run types price) above U2. If a recount
finds a starter or a run type using any of rows 660–669 other than the
warning tape, stop and find out why first.

## Source rule for the new rows (owner, 2026-10-14)

The new rows this review proposed are checked in
`pricing/new-rows-source-check.md`. **That file, not the "Listing" column
above, decides each new row's price:** COMMON (found at Home Depot, Platt
or Stoneway) takes its Example price from those three only; SPECIALTY is
still added, with the price blank and "Specialty - price from your
supplier." Listings above from other sites are comparison only.
