# Fasteners & Anchors — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Fasteners & Anchors" shelf of `starter-catalog-pricing.xlsx` ("Starter
prices", spreadsheet rows **1568–1581**, 14 rows, in the app-order sort),
the question is whether one real product can be priced from the name alone.
The workbook was read from a fresh copy of `C:\dev\BidPhase\pricing` (byte
for byte the same as the worktree's, and unchanged since the Strut read),
because the owner has it open. It is the shelf after Strut & Supports
(`strut-supports-name-review.md`); Equipment & Appliances starts at row
1582.

**Source rule (owner, 2026-10-14; `new-rows-source-check.md`):** every
listing below is from Home Depot, Platt or Stoneway. A new row found there
is COMMON and takes its Example price from there; one found at none of the
three is SPECIALTY, added with the price blank and "Specialty - price from
your supplier."

The sheet's 14 names match `BASELINE_MATERIALS`' Fasteners & Anchors rows
one for one (read from the seed the same day), so the search words quoted
below are the catalog's own. No row carries a description.

**The test.** An anchor or screw is bought by diameter and length (and head);
a hanger by the conduit or rod it takes; a clip by what it clamps to. A name
with no size cannot be priced: a 1/8" toggle and a 1/4" x 3" toggle are
both "Toggle bolt".

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**4 of the 14 rows are used** (the sheet's "Used by" column says the same):
`12 ga ceiling hanger wire` (7 starters: LT19–LT23 x2, MS2, CK4 x2),
`3/8" x 3" concrete wedge anchor` (6: PG14 x6; CS16, PG12, PG13, PG17 and
MS3 x4), `Beam clamp, 3/8" rod` (3: LT26, MH12, MS5, x2
each), `J-hook, 2"` (3: MS6, CK9, CW8 — the data drops, x3 each). **No run
type uses this shelf.**

**Packs: 10 of the 14 rows have a pack guessed from a word in the name**
(`pack-label-scan.md` § E: "clamp", "anchor", "screw", "clip", "pin").

## Existing rows

| Row  | Name                              | Used by    | Verdict         | Exact words / note                                                                                                                                                                  |
| ---- | --------------------------------- | ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1568 | `12 ga ceiling hanger wire`       | 7 starters | **Needs words** | `12 ga ceiling hanger wire, 12 ft piece` (Q1). The starters take 2 pieces per fixture; a 100 ft roll is about 8 pieces.                                                             |
| 1569 | `Beam clamp, 3/8" rod`            | 3 starters | **OK**          | Malleable iron, 3/8"-16 — Platt Dottie BK38M, priced each. Pack is wrong (Q13).                                                                                                    |
| 1570 | `Conduit hanger with bolt`        | —          | **Needs words** | `1/2" conduit hanger with bolt` (Q2); a hanger is sized to the conduit.                                                                                                             |
| 1571 | `Drop-in anchor`                  | —          | **Needs words** | `3/8" drop-in anchor` (Q3) — the 3/8"-16 size hanger rod takes.                                                                                                                    |
| 1572 | `Drywall anchor`                  | —          | **Needs words** | `Plastic drywall anchor, #10-12` (Q4). Size goes last: a leading `#` reads as a wire gauge to `shared/materialSizeOrder.ts`.                                                        |
| 1573 | `J-hook, 2"`                      | 3 starters | **Owner pick**  | Which mount (Q5): a bare hook can't be hung on its own.                                                                                                                             |
| 1574 | `Masonry screw`                   | —          | **Needs words** | `3/16" x 1-3/4" masonry screw, hex head` (Q6).                                                                                                                                      |
| 1575 | `Plastic conduit clip`            | —          | **Owner pick**  | No one product at the three stores (Q7).                                                                                                                                            |
| 1576 | `Powder-actuated pin`             | —          | **Needs words** | `1-1/2" powder-actuated pin with washer` (Q8).                                                                                                                                      |
| 1577 | `Rod hanger clip`                 | —          | **Needs words** | `Rod to flange clip, 3/8" rod, hammer-on` (Q9) — the Strut Q5 check.                                                                                                                |
| 1578 | `Self-drilling screw`             | —          | **Needs words** | `Self-drilling screw, #10 x 3/4", hex washer head` (Q10). Size after the name, for the same `#` reason as 1572.                                                                     |
| 1579 | `Sleeve anchor`                   | —          | **Needs words** | `1/4" x 2-1/4" sleeve anchor, hex nut` (Q11).                                                                                                                                       |
| 1580 | `Toggle bolt`                     | —          | **Needs words** | `1/4" x 3" toggle bolt` (Q12) — the size `pack-label-scan.md` § B already flagged.                                                                                                 |
| 1581 | `3/8" x 3" concrete wedge anchor` | 6 starters | **OK**          | Pack read at the three stores (Q13).                                                                                                                                                |

**Counts: 2 OK, 10 need words, 2 owner picks.**

## Strut Q5: is `Rod hanger clip` the same part as the Strut EMT clips?

**No.** The Strut rows (`1/2"` / `3/4" conduit clip`, becoming `{size} EMT
clip, rod/wire hanger`) hold a conduit ON a hanger rod or wire — Platt Caddy
812MB18A. `Rod hanger clip`'s own search words ("flange clip", "threaded
attachment") describe the part that hangs the ROD from a steel flange —
Platt Caddy 6TI24, "Rod to Flange Clip, 3/8" threaded, 1/8"–1/4" flange",
hammered on. Different parts on either end of the same rod, so **neither
row retires into the other**; the rename in Q9 makes that readable.

It is not the beam clamp either: `Beam clamp, 3/8" rod` is a malleable
clamp tightened with a set screw, for heavier flanges.

## Packs

| Row  | Name (after Q answers)             | Pack today (guessed) | What the three stores sell                                                                                     |
| ---- | ---------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1568 | 12 ga ceiling hanger wire, 12 ft   | each                 | Platt: 12 ft pieces (Dottie CWC12, pre-tied with pin and clip). **Not** the HD 100 ft roll.                    |
| 1569 | Beam clamp, 3/8" rod               | box of 25 ("clamp")  | Platt prices it **each** (Dottie BK38M).                                                                       |
| 1571 | 3/8" drop-in anchor                | box of 100           | Platt **box of 50**, priced each (DeWalt 06306-PWR, Dottie DA38).                                               |
| 1572 | Plastic drywall anchor, #10-12     | box of 100           | HD Everbilt with screws, **pack of 75** (813212); Prime-Line 100-pack without.                                 |
| 1574 | 3/16" x 1-3/4" masonry screw       | box of 100           | HD Tapcon 24305, **pack of 75**.                                                                               |
| 1576 | 1-1/2" powder-actuated pin         | box of 100           | HD Ramset 00803, **box of 100** — the guess is right.                                                          |
| 1577 | Rod to flange clip, 3/8" rod       | box of 100 ("clip")  | Platt Caddy 6TI24 — A reads the pack.                                                                          |
| 1578 | Self-drilling screw, #10 x 3/4"    | box of 100           | Platt Dottie TEKHW1034, **package of 100** — the guess is right.                                               |
| 1579 | 1/4" x 2-1/4" sleeve anchor        | box of 100           | Platt Dottie SA14214 — its two listings disagree (100 and 25); A reads it.                                     |
| 1580 | 1/4" x 3" toggle bolt              | each                 | HD Everbilt 803932, **pack of 10**. (`pack-label-scan.md` said box of 50 from stores outside the owner's rule.) |
| 1581 | 3/8" x 3" concrete wedge anchor    | box of 100           | A reads it at the three.                                                                                       |
| 1573 | J-hook, 2"                         | each                 | Platt prices **each** (carton of 50) — keep.                                                                   |

## Search words (not names)

- **S1.** `Drywall anchor` carries "toggle", which is the name of `Toggle
  bolt` — drop it (never alias one material to another).
- **S2.** `Drop-in anchor` carries "rod hanger", the name words of `Rod
  hanger clip` — drop it.
- **S3.** `Rod hanger clip` carries "bat wing", a stud clip and a word
  `J-hook, 2"` also carries — drop it.

## Things that could price a bid wrong

- **P1 — hanger wire priced from a roll (7 starters, 2 each).** The HD
  100 ft roll is about 8 pieces; pricing a "piece" from it under-prices
  every lay-in fixture by roughly 8x on this line.
- **P2 — a bare J-hook (3 data starters, 3 each).** Platt: bare CAT32HP
  ~$6.60, with rod/wire clip (CAT32HP4Z34) ~$9.02, with angle bracket
  ~$8.77. A bare hook leaves the mount out of every data drop.
- **P3 — anchors and screws with no size.** Ten rows can be priced from any
  size on the shelf, and the gap between a 1/8" toggle and a 1/4" x 3" one
  is several times the price.
- **P4 — powder-actuated pins with no loads.** A pin cannot be shot without
  a load, and the catalog has none (M1).

## Common items that are MISSING

Searched the whole catalog first: zip ties (Consumables), all-thread rod,
nuts, washers and rod couplers (Strut & Supports), EMT and PVC straps
(Conduit Fittings) already exist.

| #   | Item                                 | Source (owner's rule)                                                                                                                                                                                       | Why it is needed                                                             | Search words                                |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| M1  | `Powder load, .27 cal, yellow strip` | **COMMON** — Home Depot, Ramset 00667, 100-count ([listing](https://www.homedepot.com/p/Ramset-0-27-Steel-Concrete-Strip-Single-Use-Load-Booster-Caliber-Yellow-Strip-Loads-100-Count-00667/100190942)) | Every powder-actuated pin needs one (P4).                                   | "ramset", "shots", "booster", "22 27 cal"   |
| M2  | `3/4" conduit hanger with bolt`      | **COMMON** — Platt, Minerallac 1B / Raco 2053                                                                                                                                                               | Q2: the one hanger row becomes 1/2", and 3/4" is as common.                  | "minerallac", "conduit clamp", "rod hanger" |
| M3  | `1" conduit hanger with bolt`        | **COMMON** — Platt, Minerallac 2B                                                                                                                                                                           | Q2: same family, the next size.                                              | "minerallac", "conduit clamp", "rod hanger" |

All three are in `new-rows-source-check.md`, marked as waiting for the
answers. (M2 and M3's "rod hanger" is safe once Q9 renames `Rod hanger
clip`; A drops it if Q9 is a no.)

## Owner questions, with suggested answers

**Q1. `12 ga ceiling hanger wire, 12 ft piece`?**
Suggested: **yes**. The starters take 2 pieces, and a price from the
100 ft roll would be about 8x too low.

**Q2. `1/2" conduit hanger with bolt`, and add M2 3/4" and M3 1"?**
Suggested: **yes**. A hanger only fits one conduit size; all three are at
Platt.

**Q3. `3/8" drop-in anchor`, and drop "rod hanger" from its search words (S2)?**
Suggested: **yes**. 3/8"-16 is the hanger-rod size, and Platt has it.

**Q4. `Plastic drywall anchor, #10-12`, and drop "toggle" (S1)?**
Suggested: **yes**. It's the common ribbed anchor at Home Depot; "toggle"
is another row's name.

**Q5. J-hook: `J-hook, 2", with rod/wire clip`?**
Suggested: **yes**. Above a lay-in ceiling the hook hangs on wire or rod,
and a bare hook leaves the clip unpriced (~$2.40 a hook at Platt). The other
choice is "with angle bracket" for wall mounting.

**Q6. `3/16" x 1-3/4" masonry screw, hex head`?**
Suggested: **yes**. It's the common Tapcon size at Home Depot.

**Q7. `Plastic conduit clip`: retire it?**
Suggested: **yes, retire** (through `RETIRED_BASELINE_MATERIALS`). No one
product at the three stores matches; EMT straps, cable staples and the
Strut EMT clips already cover what its search words describe. No starter
uses it.

**Q8. `1-1/2" powder-actuated pin with washer`?**
Suggested: **yes**. It's the common box-and-strap pin (Home Depot Ramset
00803).

**Q9. `Rod to flange clip, 3/8" rod, hammer-on`, and drop "bat wing" (S3)?**
Suggested: **yes**. It's a different part from Strut's EMT clip (see the
Strut Q5 section), and the new name says so.

**Q10. `Self-drilling screw, #10 x 3/4", hex washer head`?**
Suggested: **yes**. It's the common tek screw at Platt, and the size goes
last so it doesn't sort as a wire gauge.

**Q11. `1/4" x 2-1/4" sleeve anchor, hex nut`?**
Suggested: **yes**. It's the common size for boxes and straps, at Platt.

**Q12. `1/4" x 3" toggle bolt`?**
Suggested: **yes**. It's the common size at Home Depot, and the size the
pack scan already flagged.

**Q13. Packs: beam clamp `each`; drop-in `box of 50`; drywall anchor and
masonry screw `pack of 75`; toggle `pack of 10`; the rest as A reads them at
the three stores?**
Suggested: **yes**, in the pack pass. Those are what the three stores sell;
the old packs were guessed from words.

**Q14. Add M1, `Powder load, .27 cal, yellow strip`?**
Suggested: **yes**. It's COMMON at Home Depot, and a pin can't be used
without one.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row; the retire (Q7) through `RETIRED_BASELINE_MATERIALS`.
- **Starter edits: none.** The starters follow their renamed rows by key;
  Q5's J-hook keeps its key.
- The pack changes go in the pack pass, before the owner types these
  prices.
- New-row prices follow `new-rows-source-check.md` (the source rule).
- Run `scripts/searchSpotCheck.mts` for "tapcon", "toggle", "red head",
  "tek", "ramset", "j hook", "caddy", "beam clamp", "ceiling wire" and
  "minerallac".
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming or retiring it.

## Owner's answers — 2026-10-14: Q1–Q14 all YES, as suggested

For A's end-of-pricing job. Nothing applied here; no catalog row, seed or
starter changed.

1. **Q1 yes**: `12 ga ceiling hanger wire, 12 ft piece` (the 7 starters
   follow by key; priced per piece, never from a 100 ft roll).
2. **Q2 yes**: `1/2" conduit hanger with bolt`, and **M2 `3/4" conduit
   hanger with bolt` and M3 `1" conduit hanger with bolt` added**, COMMON
   (Platt, Minerallac 1B / 2B), per `new-rows-source-check.md`.
3. **Q3 yes**: `3/8" drop-in anchor`; "rod hanger" comes out of its search
   words (S2).
4. **Q4 yes**: `Plastic drywall anchor, #10-12`; "toggle" comes out (S1).
5. **Q5 yes**: `J-hook, 2", with rod/wire clip` (MS6, CK9, CW8 keep the
   key).
6. **Q6 yes**: `3/16" x 1-3/4" masonry screw, hex head`.
7. **Q7 yes**: `Plastic conduit clip` RETIRED through
   `RETIRED_BASELINE_MATERIALS` (no starter uses it).
8. **Q8 yes**: `1-1/2" powder-actuated pin with washer`.
9. **Q9 yes**: `Rod to flange clip, 3/8" rod, hammer-on`; "bat wing" comes
   out (S3). M2 and M3 may now carry "rod hanger".
10. **Q10 yes**: `Self-drilling screw, #10 x 3/4", hex washer head`.
11. **Q11 yes**: `1/4" x 2-1/4" sleeve anchor, hex nut`.
12. **Q12 yes**: `1/4" x 3" toggle bolt`.
13. **Q13 yes — the pack pass**: beam clamp `each`; drop-in `box of 50`;
    drywall anchor and masonry screw `pack of 75`; toggle `pack of 10`; the
    rest as A reads them at the three stores. **Before** the owner types
    these prices.
14. **Q14 yes**: **M1 `Powder load, .27 cal, yellow strip` added**, COMMON
    (Home Depot, Ramset 00667, 100-count).

**Starter edits: none.**
