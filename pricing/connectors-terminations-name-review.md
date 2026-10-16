# Connectors & Terminations — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Connectors & Terminations" shelf of `starter-catalog-pricing.xlsx`
("Starter prices", spreadsheet rows **1422–1518**, 97 rows, in the
app-order sort), the question is whether one real product can be priced
from the name alone. The workbook was read from a fresh copy (the
worktree's copy, byte for byte the same as `C:\dev\BidPhase\pricing`, and
unchanged since the Low Voltage read), because the owner has it open. It is
the shelf after Low Voltage (`low-voltage-name-review.md`).

**The owner's source rule (2026-10-14) applies to this review and every one
after it** — `new-rows-source-check.md`: a COMMON part is one found at Home
Depot, Platt or Stoneway, and its Example price comes from those three
only; a SPECIALTY part found at none of them is still added, with the price
BLANK and the description "Specialty - price from your supplier." Every
listing below is from those three stores.

The sheet's 97 names match `BASELINE_MATERIALS`' Connectors & Terminations
rows one for one (read from the seed the same day), so the search words
quoted below are the catalog's own. Most rows already carry a description.

**The test.** A compression lug is bought by conductor size, number of
holes and STUD size; a set-screw lug or splice by the range it takes; a
crimp terminal by wire range and stud; a cable connector by the cable; and
almost everything on this shelf by the bag or box the counter sells — so
the pack matters as much as the name.

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**12 of the 97 rows are used** (the sheet's "Used by" column says the
same), and three of them carry most of the app: `Wire nut, 22-8 AWG
(tan/red)` (**133 starters**), `MC anti-short bushing` (**37**) and `3/8" MC
connector` (**36**). **No run type uses this shelf.**

**Packs: 29 of the 97 rows have a pack guessed from a word in the name**
(`pack-label-scan.md` § E: "connector", "clamp", "bushing", "screw",
"ferrule", "staple", "nut"). This review says which of those are right.

## Existing rows

| Row                  | Current name                                                                             | Used by                                    | Verdict                                                                                      | Why                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1422–1431, 1439–1442 | `#8`…`4/0 AWG crimp lug`, `250`/`350`/`400`/`500 kcmil crimp lug, single size` (14 rows) | #4: PG16 (x2); #3: PG15 (x4)               | **Needs words** (Q1): `{size} copper compression lug, 1-hole, {stud} stud`                   | Sold by conductor, holes and **stud**: Platt lists the #6 1-hole at #10, 1/4", 5/16", 3/8" and 1/2" studs ($1.75–$7.41). Today the name gives none of that, the search words say "one hole two", and the descriptions contradict each other (C1). |
| 1443–1454            | `#8`…`500 kcmil crimp sleeve` (12 rows)                                                  | —                                          | **OK**; description (Q2)                                                                     | A copper compression splice, one size each; the description should say copper and that the die must match.                                                                                                                                        |
| 1495–1502            | `Set-screw splice, {range}` (8 rows)                                                     | —                                          | **OK**; pack **P2**                                                                          | Named by range, dual-rated. Platt sells the big ones each (#4–500 kcmil copper 2-set-screw splice, 515B5003S).                                                                                                                                    |
| 1480–1485            | `Mechanical lug, 1-hole / 2-hole, {range}` (6 rows)                                      | —                                          | **OK**; search word S2                                                                       | Named by range and holes.                                                                                                                                                                                                                         |
| 1460–1471            | `Insulated multi-tap, {range}, {3,4,6}-port` (12 rows)                                   | —                                          | **OK**                                                                                       | Range and ports named.                                                                                                                                                                                                                            |
| 1457–1459            | `H-tap, #2-#6`, `2/0-#2`, `4/0-2/0`                                                      | —                                          | **OK**                                                                                       | Run and tap named; the descriptions say the die must match.                                                                                                                                                                                       |
| 1508–1514            | `Split bolt, {size}` (7 rows)                                                            | —                                          | **OK**                                                                                       | Sized by the largest conductor, which the description says.                                                                                                                                                                                       |
| 1475                 | `MC anti-short bushing`                                                                  | **37 starters** (x2 in most)               | **OK** name; pack **P1**                                                                     | Platt: 3/8" anti-short bushing, **package of 100** (1ASBU). The sheet says box of 25 from the word "bushing".                                                                                                                                     |
| 1476–1479            | `3/8"`, `1/2"`, `3/4"`, `1" MC connector`                                                | 3/8": **36 starters** (x2); 3/4": CW7 (x2) | **OK** names; pack **P1**                                                                    | Box of 25 from "connector". Home Depot sells the 3/8" snap-in in 5- and 50-packs (Arlington 38AST-50, Halex 85703NB); Platt sells it each (Arlington 380ST).                                                                                      |
| 1518                 | `Wire nut, 22-8 AWG (tan/red)`                                                           | **133 starters**                           | **OK**                                                                                       | Platt: 3M tan/red, 22–8 AWG, **package of 100** — the guessed box of 100 happens to be right.                                                                                                                                                     |
| 1517, 1516           | `Wire nut, 22-12 AWG (blue/orange)`, `Wing nut wire connector, 14-6 AWG (blue)`          | —                                          | **OK**                                                                                       | Box of 100 is how both are sold (Ideal wing-nuts, bag of 100, Home Depot and Platt).                                                                                                                                                              |
| 1486–1489            | `3/8"`, `1/2"`, `3/4"`, `1" NM clamp connector`                                          | 3/8": 6 starters; 1/2": 7; 3/4": 3; 1": 5  | **OK**; search word S3; pack check (Q8)                                                      | Box of 25 from "clamp".                                                                                                                                                                                                                           |
| 1503, 1504           | `1/2"`, `3/4" snap-in NM connector`                                                      | —                                          | **OK**; pack check (Q8)                                                                      | Box of 25 from "connector".                                                                                                                                                                                                                       |
| 1494                 | `2" SE cable connector`                                                                  | PG3 (x2), CW3 (x2)                         | **OK** name; pack **P2**                                                                     | Home Depot sells it each: Halex 10220 watertight, **$13.70**. Box of 25 from "connector".                                                                                                                                                         |
| 1472–1474            | `Lever wire connector, 2-port`, `3-port`, `5-port`                                       | —                                          | **OK**; pack check (Q8)                                                                      | Box of 25 from "connector"; Home Depot sells the 2-port in 10, 50 and 100.                                                                                                                                                                        |
| 1438                 | `1/2" cord grip (0.25"-0.50" cord)`                                                      | LT25, MH8                                  | **OK**                                                                                       | Cord range named.                                                                                                                                                                                                                                 |
| 1436, 1437           | `3/4" cord grip`, `1" cord grip`                                                         | —                                          | **Needs words** (Q3): `3/4" cord grip (0.40"-0.70" cord)`, `1" cord grip (0.50"-0.90" cord)` | Their twin names its cord range; these keep it in the search words.                                                                                                                                                                               |
| 1491–1493, 1505–1507 | `Ring terminal, …`, `Spade terminal, …` (blue, red, yellow)                              | —                                          | **Needs words** (Q4): `…, #8-#10 stud`                                                       | A ring or fork is bought by stud size as well as wire: Home Depot and Platt sell 16–14 AWG rings for #4-6, #8-10 and #12-1/4" studs. Pack P3.                                                                                                     |
| 1432–1434            | `Butt splice, blue / red / yellow`                                                       | —                                          | **OK**; pack P3                                                                              | Wire range named.                                                                                                                                                                                                                                 |
| 1490                 | `Push-in wire connector`                                                                 | —                                          | **Needs words** (Q5): `Push-in wire connector, 3-port`                                       | Sold by ports; search words say "2 port 3". Pack: box of 25 from "connector".                                                                                                                                                                     |
| 1435                 | `Cable staple`                                                                           | —                                          | **Needs words** (Q6): `Cable staple, insulated, NM 14/2-12/2`                                | Metal and insulated staples, and sizes for 10/3 and up, are different products; search words say "insulated plastic". Box of 100 is sold.                                                                                                         |
| 1455                 | `DIN rail`                                                                               | —                                          | **Needs words** (Q7): `DIN rail, 35 mm, 1 m`                                                 | Sold by length (`pack-label-scan.md` § A: 1 m and 2 m; Platt Weidmüller 35 x 7.5 mm).                                                                                                                                                             |
| 1456                 | `Ferrule kit`                                                                            | —                                          | **OK** name; pack **P2**                                                                     | A kit is one assortment box; "box of 100" came from the word "ferrule".                                                                                                                                                                           |
| 1515                 | `Terminal block`                                                                         | —                                          | **Owner pick** (Q7)                                                                          | Search words say "din strip barrier feed through": a DIN feed-through block and a barrier strip are different products.                                                                                                                           |

**Counts:** 71 OK, 25 need words, 1 owner pick — 97.

## Descriptions that contradict each other

**C1 — the crimp lugs.** `350 kcmil crimp lug, single size` says "Sized by
the conductor range it accepts, not by a single gauge" — the opposite of
its own name. `#6`, `#2`, `1/0` and `4/0` say the same "range" sentence;
`400` and `500` say "sold per size, not by range"; `#8`, `#4`, `#3`, `#1`,
`2/0`, `3/0` and `250` say nothing. A copper compression lug takes ONE
conductor size (Platt lists every one by a single AWG). Suggested (Q1):
one description on all 14 — "One conductor size; the crimp die must match"
— and drop "single size" from the four kcmil names, since it is true of all
of them.

## Packs

**P1 — the two busiest rows after the wire nut are on guessed packs.**
`MC anti-short bushing` (37 starters) is a box of 25; Platt sells a package
of 100. `3/8" MC connector` (36 starters) is a box of 25; Home Depot sells
5s and 50s and Platt sells each. If the owner types a 100-pack price under
25, every MC starter prices its bushings four times over. Suggested (Q8):
anti-short `bag of 100` / 100; MC connectors `box of 50` / 50 for 3/8" and
1/2", and `each` / 1 for 3/4" and 1".

**P2 — big single parts on box packs.** The eight set-screw splices are a
**box of 100** (from "screw"); the #4–500 kcmil one is a several-dollar
part sold each. `2" SE cable connector` (PG3, CW3) is a box of 25 and sold
each ($13.70). `Ferrule kit` is a box of 100 and is one kit. Suggested:
all `each` / 1.

**P3 — crimp terminals and butt splices are `each` / 1 but sold in bags.**
Home Depot sells them in 15, 75 and 100. Suggested: `bag of 100` / 100.

## Search words and descriptions (not names)

**S1 — the crimp lugs name each other.** `#6` carries "8", `#2` carries "4
3", `1/0` carries "1-1/0", `4/0` carries "2/0 3/0", `350 kcmil` carries
"250 300" — each a size that has its own row. All say "mechanical", which
is the Mechanical lug rows, and "one hole two". Suggested: drop all of
them with Q1.

**S2 — "1/0-500" on `Mechanical lug, 1-hole, #4-500 kcmil`** names the
2-hole `1/0-500 kcmil` row. Suggested: drop it.

**S3 — "ser se" on the four NM clamp connectors** sends an SE search to an
NM part; `2" SE cable connector` exists. Suggested: drop "ser se" ("duplex"
stays: it is the trade name for the two-screw NM clamp).

## Things that could price a bid wrong

**P1 — anti-short bushings at a quarter of a bag** (37 starters).
**P2 — set-screw splices at a hundredth** of a single part.
**P3 — 1-hole lugs with no stud size.** PG15 buys four #3 lugs and PG16
two #4 lugs; the lug that fits the bar is the one with the right stud.

## Common items that are MISSING

Searched the whole catalog first: `Electrical tape`, `Heat shrink tubing`
and `Reducing washer set` exist on other shelves.

| #   | Item                                           | Source (owner's rule)                                                                                                                                                                                                                                                                                              | Why it is needed                                                                                                                       | Search words                        |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| M1  | `#6 copper compression lug, 2-hole, 1/4" stud` | **COMMON** — Platt, Burndy YA6CL2TC14 ([listing](https://www.platt.com/p/0237498/burndy/compression-lug-copper-2-hole-1-4-stud-size-6-awg-blue/781810503607/burya6cl2tc14)); Penn-Union BLU6D2TC14 ([listing](https://www.platt.com/p/0048192/penn-union/6-awg-copper-compression-lug/785037231800/penblu6d2tc14)) | The two-hole lug a #6 bonding conductor lands on a telecom busbar (Low Voltage Q9) or a ground bar with; only 1-hole crimp lugs exist. | "2 hole lug", "two hole", "tgb lug" |

## Owner questions, with suggested answers

**Q1. Crimp lugs: `{size} copper compression lug, 1-hole, {stud} stud`, one description, and drop the cross search words?**
Suggested: **yes**, studs 1/4" through #2, 3/8" for #1 to 2/0, 1/2" for 3/0
and up (A confirms each at Platt). The stud decides whether the lug fits
the bar, and today the descriptions contradict the names.

**Q2. Crimp sleeves: description "Copper compression splice, one size; the crimp die must match"?**
Suggested: **yes**. The names are fine; only the material and the die are
missing.

**Q3. Cord grips: put the cord range in the 3/4" and 1" names?**
Suggested: **yes**, `(0.40"-0.70" cord)` and `(0.50"-0.90" cord)`, like the
1/2". The range is what decides the fit.

**Q4. Ring and spade terminals: add `#8-#10 stud`?**
Suggested: **yes**. It is the common stud, and the same wire size comes
in three stud sizes.

**Q5. `Push-in wire connector, 3-port`?**
Suggested: **yes**. It is sold by ports, and a 2-port is a different
part.

**Q6. `Cable staple, insulated, NM 14/2-12/2`?**
Suggested: **yes**. Metal and larger staples are other products.

**Q7. `DIN rail, 35 mm, 1 m`, and `Terminal block` as `Terminal block, DIN rail, feed-through, 12-10 AWG`?**
Suggested: **yes**. Both are sold by size, and the DIN block goes on the
rail beside it.

**Q8. Packs: anti-short `bag of 100`; 3/8" and 1/2" MC connectors `box of 50`; 3/4" and 1" MC connectors, set-screw splices, the 2" SE connector and the ferrule kit `each`; crimp terminals and butt splices `bag of 100`; NM clamps, snap-ins, push-ins and lever connectors as A finds them at the three stores?**
Suggested: **yes**, in the pack pass. Platt sells anti-short bushings in
100s, and the big splices and the SE connector each.

**Q9. Add M1, the 2-hole #6 lug?**
Suggested: **yes**, COMMON at Platt, so it gets an Example price from
there. Telecom busbars and ground bars take 2-hole lugs.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row. The size stays first in each lug and sleeve name, so
  `shared/materialSizeOrder.ts` keeps sorting them.
- **Starter edits: none.** PG15 and PG16 follow their renamed lugs by key.
- The pack changes (P1–P3) go in the pack pass, **before** the owner types
  these prices — three rows here are in 37, 36 and 133 starters.
- M1's Example price comes from Platt (the owner's source rule).
- Run `scripts/searchSpotCheck.mts` for "red head", "anti short", "mc
  connector", "romex connector", "wire nut", "wago", "lug", "2 hole lug",
  "split bolt", "polaris", "set screw splice", "ring terminal" and "din
  rail". "lug" should not lead with a lug a size off.
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming it.

## Owner's answers — 2026-10-14: Q1–Q9 all YES, as suggested

For A's end-of-pricing job. Nothing applied here; no catalog row, seed or
starter changed.

1. **Q1 yes**: the 14 crimp lugs become `{size} copper compression lug,
1-hole, {stud} stud` — 1/4" through #2, 3/8" for #1 to 2/0, 1/2" for 3/0
   and up, each confirmed at Platt — with one description, "One conductor
   size; the crimp die must match", "single size" dropped from the kcmil
   names, and the cross search words dropped (S1). PG15 and PG16 follow by
   key.
2. **Q2 yes**: crimp sleeves described "Copper compression splice, one
   size; the crimp die must match".
3. **Q3 yes**: `3/4" cord grip (0.40"-0.70" cord)`, `1" cord grip
(0.50"-0.90" cord)`.
4. **Q4 yes**: the six ring and spade terminals add `#8-#10 stud`.
5. **Q5 yes**: `Push-in wire connector, 3-port`.
6. **Q6 yes**: `Cable staple, insulated, NM 14/2-12/2`.
7. **Q7 yes**: `DIN rail, 35 mm, 1 m`; `Terminal block, DIN rail,
feed-through, 12-10 AWG`.
8. **Q8 yes — the pack pass**: `MC anti-short bushing` `bag of 100` / 100;
   3/8" and 1/2" MC connectors `box of 50` / 50; 3/4" and 1" MC connectors,
   the eight set-screw splices, `2" SE cable connector` and `Ferrule kit`
   `each` / 1; ring, spade and butt splices `bag of 100` / 100; NM clamps,
   snap-ins, push-ins and lever connectors as A finds them at Home Depot,
   Platt or Stoneway. **Before** the owner types these prices.
9. **Q9 yes**: M1 `#6 copper compression lug, 2-hole, 1/4" stud` added,
   COMMON — Example price from Platt (Burndy YA6CL2TC14), per
   `new-rows-source-check.md`.

S2 and S3 (the cross search words on the mechanical lug and the NM clamps)
go with these. **Starter edits: none.**
