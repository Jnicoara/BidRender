# Consumables — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Consumables" shelf of `starter-catalog-pricing.xlsx` ("Starter prices",
spreadsheet rows **1692–1719**, 28 rows, in the app-order sort), the question
is whether one real product can be priced from the name alone. This is the
**last shelf of the sheet**; it comes after Distribution Equipment (which ends
at row 1691).

The workbook was read from the **owner's live copy** (saved 19:29 today),
which is not the same as the worktree's. On this shelf the owner has already
made two changes in that copy: row 1693 `Arc flash label` is now
`pack of 5` / 5, and row 1719 zip ties is `bag of 100` / 100. Both are taken
as the starting point below, and neither is re-asked.

**Source rule (owner, 2026-10-14; `new-rows-source-check.md`):** every
listing below is from Home Depot, Platt or Stoneway. A new row found there
is COMMON and takes its Example price from there; one found at none of the
three is SPECIALTY, added with the price blank and "Specialty - price from
your supplier."

The sheet's 28 names match `BASELINE_MATERIALS`' Consumables rows one for
one (read from the seed the same day, after the 2026-10-09 reality-check
renames: `Zip ties` became `Zip ties, 8", bag of 100`, and `Phase tape,
black` was folded into `Electrical tape`), so the search words quoted below
are the catalog's own. No row carries a description.

**The test.** A consumable is bought by its container and its spec: tape by
width and length (3/4" x 66 ft), caulk by the tube (10.1 oz), cement by the
can and its type (8 oz, gray, for conduit), lube by the quart or gallon, foam
by the can, a pulling grip by the cable size it takes. A name with no size
cannot be priced: a 3/4" x 20 ft roll and a 3/4" x 66 ft roll are both
"Electrical tape", and a quart and a gallon of lube are both "Pulling lube".
**And the unit matters as much as the name**: every starter quantity on this
shelf was checked against what one unit actually is (see "Things that could
price a bid wrong").

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**7 of the 28 rows are used** (the sheet's "Used by" column says the same):
`Panel directory label` (14 starters: PG2–PG5, PG12–PG14, DR4, MS13, GC2,
GR2, GR3 x2, GR5, CW4 — 1 each except GR3's two panels), `Arc flash label`
(5: PG12, PG13, PG14, MS13, GC2, 1 each), `Silicone sealant` (2: LT29
Exterior wall pack, DR14 Replace wall pack, 1 tube each), `Duct seal` (MH1
HVAC condenser disconnect + whip, 1), `Firestop caulk` (MS4 Firestop
penetration, 0.25 of a tube), `Emergency disconnect label` (CW3, 1) and
`EV-ready label` (CW11, 1). **No run type uses this shelf.**

**Packs: 1 of the 28 rows had a pack guessed from a word in the name**
(`pack-label-scan.md` § E: "zip tie" → box of 100, row 1719), and the name
already says bag of 100, so it is right. The owner set row 1693's
`pack of 5` from `pack-label-scan.md` § B. Every other row is `each`.

## Existing rows

| Row  | Name                         | Used by     | Verdict         | Exact words / note                                                                                                                                         |
| ---- | ---------------------------- | ----------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1692 | `Anti-oxidant compound`      | —           | **Needs words** | `Anti-oxidant compound, 4 oz` (Q11) — the squeeze bottle, HD Ideal 30-026.                                                                                 |
| 1693 | `Arc flash label`            | 5 starters  | **OK**          | The common 5" x 7" NEC warning label, HD Ideal 44-893, 5-pack. Pack already `pack of 5` (owner).                                                           |
| 1694 | `Duct seal`                  | 1 starter   | **Needs words** | `Duct seal, 1 lb` (Q4). One 1 lb block is what the starter means.                                                                                          |
| 1695 | `Electrical putty pad`       | —           | **Needs words** | `Electrical putty pad, 7" x 7"` (Q6) — the size every maker sells.                                                                                         |
| 1696 | `Electrical tape`            | —           | **Needs words** | `Electrical tape, black, 3/4" x 66 ft` (Q1). Since the fold of `Phase tape, black`, this is the black roll, so the name says so.                          |
| 1697 | `Emergency disconnect label` | 1 starter   | **OK**          | The name says what it is. Not found at the three stores; A reads it there (it may be a sign-shop or engraved part).                                        |
| 1698 | `EV-ready label`             | 1 starter   | **OK**          | Same as 1697: the wording is set by the local code, and no listing was found at the three. A reads it.                                                     |
| 1699 | `Expanding foam`             | —           | **Needs words** | `Expanding foam, gaps and cracks, 12 oz can` (Q8). Not the fire-block foam, which is another product.                                                      |
| 1700 | `Firestop caulk`             | 1 starter   | **Needs words** | `Firestop caulk, 10.1 oz tube` (Q5). The starter takes a quarter of one.                                                                                   |
| 1701 | `Heat shrink tubing`         | —           | **Owner pick**  | One size, or an assortment kit (Q13).                                                                                                                      |
| 1702 | `Mastic tape`                | —           | **Needs words** | `Mastic tape, 2" x 10 ft` (Q3) — the Scotch 2228 roll.                                                                                                     |
| 1703 | `Panel directory label`      | 14 starters | **OK**          | One kit does one panel (HD UCD42CP holds two 42-space directories); `pack-label-scan.md` already checked it.                                              |
| 1704 | `Phase tape, blue`           | —           | **Needs words** | `Phase tape, blue, 3/4" x 66 ft` (Q1).                                                                                                                     |
| 1705 | `Phase tape, brown`          | —           | **Needs words** | `Phase tape, brown, 3/4" x 66 ft` (Q1).                                                                                                                    |
| 1706 | `Phase tape, gray`           | —           | **Needs words** | `Phase tape, gray, 3/4" x 66 ft` (Q1).                                                                                                                     |
| 1707 | `Phase tape, green`          | —           | **Needs words** | `Phase tape, green, 3/4" x 66 ft` (Q1).                                                                                                                    |
| 1708 | `Phase tape, orange`         | —           | **Needs words** | `Phase tape, orange, 3/4" x 66 ft` (Q1).                                                                                                                   |
| 1709 | `Phase tape, red`            | —           | **Needs words** | `Phase tape, red, 3/4" x 66 ft` (Q1).                                                                                                                      |
| 1710 | `Phase tape, white`          | —           | **Needs words** | `Phase tape, white, 3/4" x 66 ft` (Q1).                                                                                                                    |
| 1711 | `Phase tape, yellow`         | —           | **Needs words** | `Phase tape, yellow, 3/4" x 66 ft` (Q1).                                                                                                                   |
| 1712 | `Pulling lube`               | —           | **Needs words** | `Pulling lube, 1 qt` (Q10). A gallon is about four times the price.                                                                                        |
| 1713 | `PVC cement`                 | —           | **Needs words** | `PVC cement, gray, 8 oz` (Q9) — the conduit cement, HD Oatey 31040.                                                                                        |
| 1714 | `Rubber splicing tape`       | —           | **Needs words** | `Rubber splicing tape, 3/4" x 30 ft` (Q2) — the Scotch 23 roll.                                                                                            |
| 1715 | `Silicone sealant`           | 2 starters  | **Needs words** | `Silicone sealant, clear, 10.1 oz tube` (Q7).                                                                                                              |
| 1716 | `Thread sealant`             | —           | **Owner pick**  | Its search words describe two products: pipe dope (a paste) and PTFE tape (Q14).                                                                          |
| 1717 | `Underground splice kit`     | —           | **Needs words** | `Underground splice kit, UF cable, 14-8 AWG` (Q12) — the standard kit, not the longer "stretcher" repair kit.                                              |
| 1718 | `Wire pulling grip`          | —           | **Owner pick**  | A grip fits one range of cable size (Q15).                                                                                                                 |
| 1719 | `Zip ties, 8", bag of 100`   | —           | **OK**          | HD Commercial Electric GT-200STCB, 8", 50 lb, UV black, 100-pack. Pack already `bag of 100` (owner).                                                       |

**Counts: 5 OK, 20 need words, 3 owner picks.**

## Packs

| Row       | Name (after Q answers)                     | Pack today          | What the three stores sell                                                                                                                       |
| --------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1693      | Arc flash label                            | pack of 5 (owner)   | HD Ideal 44-893, **5-pack**, $35.45; Stoneway lists the same part, 5 per pack. Right.                                                            |
| 1719      | Zip ties, 8", bag of 100                   | bag of 100 (owner)  | HD GT-200STCB, **100-pack**, $10.98. Right.                                                                                                      |
| 1694      | Duct seal, 1 lb                            | each                | Platt Ideal 31-601 **each** ($6.92, 10 to a carton); HD RACO DS-1LB, each ($4.98). Keep `each`.                                                  |
| 1700      | Firestop caulk, 10.1 oz tube               | each                | Platt STI SpecSeal LCI300, **each** ($11.98). Keep.                                                                                              |
| 1715      | Silicone sealant, clear, 10.1 oz tube      | each                | HD DAP 08668, **each** ($13.59). HD also sells 12-packs (Titebond 2611A); price the single tube. Keep.                                          |
| 1695      | Electrical putty pad, 7" x 7"              | each                | HD HOLDRITE HydroFlame HF-PP-1, **each** ($5.79). Other makers sell 20 to a pack outside the three stores. Keep `each`.                           |
| 1696–1711 | Electrical and phase tapes, 3/4" x 66 ft   | each                | One roll: HD 3M Super 33+ 6132-BA-10, $4.98 a roll (also a 3-pack); Platt 3M 35 phase tape, $11.27 a roll. Keep `each` (pack scan agreed).       |
| 1717      | Underground splice kit, UF, 14-8 AWG       | each                | Platt 3M UF1, $55.13 — another seller lists the same part as "6 kits", so **A reads whether Platt's price is one kit or six** before it is typed. |

## Search words (not names)

- **S1.** `Firestop caulk` carries "putty", a name word of `Electrical putty
  pad`, and firestop putty is a different product from caulk — drop it.
- **S2.** `PVC cement` carries "primer purple". Primer is a different product
  (and conduit cement doesn't need it); searching "primer" should not return
  cement — drop both words.
- **S3.** `Heat shrink tubing` carries "sleeve", a name word of `Sleeve
  anchor` and the crimp sleeves — drop it.
- **S4.** `Mastic tape` carries "pad", a name word of `Electrical putty pad`
  — drop it.
- **S5.** `Electrical tape` carries "phase", which came from the old `Phase
  tape, black` name when it was folded in. Keep it (an old name stays a
  search word), but A checks that "phase tape" still ranks the eight colour
  rows above the black roll — the reason "colored phase" was taken off this
  row on 2026-10-08.
- **S6.** `Thread sealant` carries "pipe dope" and "tape". If Q14 picks the
  PTFE tape, drop "pipe dope" — it would find the wrong product.
- **S7.** `Silicone sealant` carries "caulk", a name word of `Firestop
  caulk`. Keep it — "silicone caulk" is what it is called at the counter, and
  "fire caulk" still names the other row — but A checks the ranking.

## Things that could price a bid wrong

- **P1 — silicone, one whole tube per wall pack (LT29, DR14).** Each wall
  pack takes 1 tube, about $7–$14 at HD. A wall pack uses a fraction of that,
  but the rest of an opened tube usually dries out, so this is high by a few
  dollars, not wrong. **No change suggested.** It matters more that the row
  is priced as ONE 10.1 oz tube (Q7): HD also lists 12-packs at $80–$108,
  and a pack price typed against `each` would put about $100 of caulk on
  every wall pack.
- **P2 — firestop caulk, a quarter tube per penetration (MS4).** Right for a
  10.1 oz tube (~$3 a penetration at Platt's $11.98). Priced from a 20 oz
  sausage or a case of 12, it would be 2x to 12x high. Q5's size stops that.
- **P3 — duct seal, one per condenser (MH1).** Right for a 1 lb block
  (~$5–$7). Ideal 31-601 comes 10 to a carton; a carton price typed against
  `each` would be 10x high. Q4's "1 lb" stops that.
- **P4 — arc flash label, one per panel (5 starters).** Right now that the
  owner has set `pack of 5`: the 5-pack price ($35.45) is typed, and each
  panel takes one label, about $7.09. Before that change it would have been
  $35.45 a panel.
- **P5 — zip ties: the name says "bag of 100", the line counts TIES.** The
  pack is set right, so a quantity of 10 means 10 ties (about $1.10). Someone
  typing "1" on a bid thinking "one bag" gets one tie. Small money, and the
  owner already chose this name, so **no change suggested** — noted so A
  keeps the pack and the name in step.
- **P6 — tapes with no length.** A 3/4" x 20 ft roll and a 66 ft roll are
  both "Electrical tape" today; at Platt the rubber (Scotch 23, $50.97) and
  mastic (Scotch 2228, $71.70) rolls are the dearest things on this shelf, so
  naming the roll size (Q1–Q3) matters most there.

## Common items that are MISSING

Searched the whole catalog first: pull line and mule tape, underground
warning tape and trench markers (Underground), hook-and-loop cable straps
(Low Voltage), foil duct tape (Safety & Support), wire nuts and crimp sleeves
(Connectors) already exist. The catalog has no explosion-proof seal fittings,
so sealing compound for them is not missing. Neither row below is in
`new-rows-source-check.md` or `pack-label-scan.md`.

| #   | Item                         | Source (owner's rule)                                                                                                                                                                                                   | Why it is needed                                                                                     | Search words                                    |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| M1  | `Wire marker booklet, 0-9`   | **COMMON** — Home Depot, Gardner Bender 42-027, $15.01 ([listing](https://homedepot.com/p/Gardner-Bender-Wire-Marker-Booklet-Numbers-0-9-42-027/302444108))                                                             | Numbering conductors in panels, gutters and control work; the catalog has no way to mark a wire but tape. | "wire numbers", "number tape", "markers book", "brady" |
| M2  | `Zip ties, 14", bag of 100`  | **COMMON** — Home Depot, Commercial Electric GT-370STB, 14", 50 lb, UV black, 100-pack ([listing](https://homedepot.com/p/Commercial-Electric-14in-Standard-50lb-Tensile-Strength-UL-21S-Rated-Cable-Zip-Ties-100-Pack-UV-Black-GT-370STB/203531913)) | 8" ties won't go round a feeder bundle or a cable to a strut; 14" is the other size every truck carries. | "cable tie wrap ty rap nylon bundle uv black"   |

## Owner questions, with suggested answers

**Q1. Tapes: `Electrical tape, black, 3/4" x 66 ft`, and each phase tape
`Phase tape, {colour}, 3/4" x 66 ft`?**
Suggested: **yes**. 3/4" x 66 ft is the full-size roll: HD sells the black
Super 33+ that size ($4.98), and Platt sells the Scotch 35 colour rolls that
size ($11.27 each, item 0064025 gray, 0064021 blue). A shorter 20 ft roll
would be a different price.

**Q2. `Rubber splicing tape, 3/4" x 30 ft`?**
Suggested: **yes**. It's the Scotch 23 roll at Platt (item 0063969) and
Stoneway; the size is how it's sold.

**Q3. `Mastic tape, 2" x 10 ft`, and drop "pad" from its search words (S4)?**
Suggested: **yes**. It's the Scotch 2228 roll at Platt (item 0063962); "pad"
is another row's name.

**Q4. `Duct seal, 1 lb`?**
Suggested: **yes**. The starter takes one block per condenser, and 1 lb is
the block at Platt (Ideal 31-601) and HD (RACO DS-1LB). Without the size a
carton of 10 could be priced as one.

**Q5. `Firestop caulk, 10.1 oz tube`, and drop "putty" (S1)?**
Suggested: **yes**. The starter takes a quarter tube per penetration, which
is only right if the price is one 10.1 oz tube (Platt STI SpecSeal LCI300).

**Q6. `Electrical putty pad, 7" x 7"`?**
Suggested: **yes**. 7" x 7" is the size every maker sells; HD has it each
(HOLDRITE HydroFlame HF-PP-1).

**Q7. `Silicone sealant, clear, 10.1 oz tube`?**
Suggested: **yes**. It's the standard caulk-gun tube at HD (DAP 08668), and
the two wall-pack starters take one tube each, so the name must say one tube.

**Q8. `Expanding foam, gaps and cracks, 12 oz can`?**
Suggested: **yes**. It's the common can at HD (Great Stuff 227112, about
$4.38). "Gaps and cracks" keeps it apart from the orange fire-block foam,
which is a different price and a different job.

**Q9. `PVC cement, gray, 8 oz`, and drop "primer purple" (S2)?**
Suggested: **yes**. Gray 8 oz is the electrical conduit cement at HD (Oatey
31040, $6.28). Primer is a different product.

**Q10. `Pulling lube, 1 qt`?**
Suggested: **yes**. The quart squeeze bottle is the common one at Platt
(Ideal Yellow 77 31-358, item 0028592; Polywater Dyna-Blue D-35, item
0002059). A gallon is a different price.

**Q11. `Anti-oxidant compound, 4 oz`?**
Suggested: **yes**. It's the 4 oz squeeze bottle at HD (Ideal Noalox 30-026,
about $9.88).

**Q12. `Underground splice kit, UF cable, 14-8 AWG`?**
Suggested: **yes**. It's the standard kit at Platt (3M UF1, item 0673841) and
Stoneway (Burndy UGSKIT8). The longer "stretcher" kit for a cut cable is a
different, dearer part. A checks whether Platt's price is one kit or a
6-kit pack before it is typed.

**Q13. Heat shrink tubing: `Heat shrink tubing assortment, 160-piece`, and
drop "sleeve" (S3)?**
Suggested: **yes**. A single size can't cover what this row is used for; the
160-piece assortment is the common kit at HD (Gardner Bender HST-ASTA, about
$15). The other choice is one heavy-wall size for big conductors, which a
shop could add as its own row.

**Q14. Thread sealant: `Thread seal tape (PTFE), 1/2" x 520"`, and drop
"pipe dope" (S6)?**
Suggested: **yes**. It's the common roll at HD (Oatey 31202, about $2). The
other choice is pipe dope in a can, which is a different product; one row
can't be both.

**Q15. Wire pulling grip: `Wire pulling grip, 0.75"-0.99" cable`?**
Suggested: **yes**. A grip only holds one range of cable size; Platt has
this one (Kellems 15.75" junior, single weave, item 0030423). A shop pulling
bigger feeders adds its own size.

**Q16. Packs: keep `each` on every row except arc flash (`pack of 5`) and
zip ties (`bag of 100`), which you already set?**
Suggested: **yes**. Tubes, rolls, cans and blocks are sold one at a time at
the three stores; the one to read first is the UF splice kit (Q12).

**Q17. Add M1, `Wire marker booklet, 0-9`?**
Suggested: **yes**. It's COMMON at Home Depot (Gardner Bender 42-027), and
the catalog has nothing for numbering wires.

**Q18. Add M2, `Zip ties, 14", bag of 100`?**
Suggested: **yes**. It's COMMON at Home Depot (Commercial Electric
GT-370STB), and 8" ties are too short for feeder bundles.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row. No retire on this shelf.
- **Starter edits: none.** The starters follow their renamed rows by key,
  and every starter quantity checked out against its unit (P1–P4).
- The names put a size like `3/4"` in the middle of tape names; check
  `shared/materialSizeOrder.ts` doesn't read it as a raceway trade size and
  sort the tapes oddly on the shelf.
- The pack changes (only a read of the UF splice kit) go in the pack pass,
  before the owner types these prices.
- New-row prices follow `new-rows-source-check.md` (the source rule); add M1
  and M2 there.
- Run `scripts/searchSpotCheck.mts` for "phase tape", "electrical tape",
  "tape", "caulk", "fire caulk", "putty", "primer", "pvc glue", "noalox",
  "yellow 77", "great stuff", "duct seal", "heat shrink", "zip tie",
  "wire markers" and "kellems".
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming it.
