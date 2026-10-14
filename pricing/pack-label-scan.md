# Pack label scan — whole pricing sheet (2026-10-13, Track C)

**Read-only. Nothing is changed.** This scan covers every row of
`starter-catalog-pricing.xlsx` ("Starter prices", 1,717 rows, the app-order
sort of `28245633`). The workbook was read from a fresh copy, because the
owner has it open. It looks for rows whose pack qty is **1** (`per foot`,
`per foot (…)` or `each`) while the item is actually sold on a **reel, coil,
roll, length or box**. All of them are listed here, so A can relabel them in
one pass (`packFor` and the seed's pack).

**Why it matters.** "Price per unit" is "Pack price ÷ Pack qty". If the pack
qty is 1 and the owner types what the counter or the shelf tag says (a reel,
a box, a 10 ft length), the whole pack is priced as one foot or one piece. A
starter that uses 2 of them, or a run type that uses 200 ft, multiplies the
mistake.

**The search, stated so the gap is visible.** 1,291 rows have pack qty 1:
1,145 `each`, 73 `per foot (cut to length)`, 31 `per foot (from 250 ft
roll)`, 21 `per foot (from 1000 ft box)`, 7 `per foot (from 500 ft spool)`
and 14 plain `per foot`.

- **Read in full:** all 14 plain `per foot` rows, and all 59 rows that state a
  roll, spool or box length.
- **The 1,145 `each` rows were filtered by name**, by category and by words
  that usually mean a pack or a length (tape, strap, clip, terminal, splice,
  label, tube, wire, rail, channel, bolt, hanger, grommet, and others), and
  every hit was read.
- **Not checked one by one:** the 73 `cut to length` rows (wire sold off the
  reel by the foot, which is the label's point), and `each` rows whose names
  matched none of those words: devices, boxes, panels, breakers, fixtures and
  equipment. They are normally priced one at a time, but a `box of 10` device
  could still be hiding there. A recount by A should search the same way and
  say what it searched for.

**Two conventions already ship, and both are right for their kind.** Rows
below say which one each fits.

- **Per-foot items on a reel:** pack qty stays **1**. The label names the
  reel, "per foot (from 250 ft roll)", and the owner types the PER-FOOT price.
  That is the owner's wire rule, and it is what the 59 labelled wire rows do.
- **Rigid lengths and boxed pieces:** the pack is the thing bought, for
  example `10 ft stick` / `10` (all conduit) or `box of 25` / `25`. The owner
  types the PACK price.

**Listings** were checked on 2026-10-13 at platt.com and homedepot.com, with
another supply house named where neither showed the pack. Prices only show
how large a mistake would be; they are not proposed prices.

## A. Per foot, but sold on a reel or in lengths, with no reel named

These are the dangerous ones: plain `per foot` / `1`, so nothing on the row
says what the shelf price is for.

| Row(s)  | Name                                    | Used by          | Sold as (listing)                                                                                                                                     | Suggested label / pack                                                                                                                         |
| ------- | --------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 669     | Underground warning tape                | **18 run types** | 3" × 1000 ft roll (Platt Dottie UT8D, $49.62). The sheet's "Used by" shows none; see `underground-name-review.md` U-A                                 | `per foot (from 1000 ft roll)` / 1. **Do this one first:** at $49.62 per foot, a 200 ft trench is about $10,000 too high.                      |
| 664     | Mule tape, 1800 lb                      | —                | 5/8" × 3000 ft reel (Platt Neptco 0873571; HD Gardner Bender MT5800, $162.82)                                                                         | `per foot (from 3000 ft reel)` / 1                                                                                                             |
| 665     | Pull rope, 1/4"                         | —                | 1/4" × 1000 ft (HD Ideal 31-841, $109–$136; Elliott 14100)                                                                                            | `per foot (from 1000 ft reel)` / 1                                                                                                             |
| 658–659 | Surface raceway, 500 / 700 series       | 1 run type each  | 10 ft lengths (V500 and V700; HD 700WH 10 ft, $17.25). HD also sells 5 ft (B-1 $11.31, BWH1 $12.84)                                                   | `10 ft length` / 10, like conduit's `10 ft stick` (surface raceway review P1, not yet answered)                                                |
| 636     | Overfloor raceway, 1500 series          | —                | 1500-10, base and cover, 10 ft (Legrand; Lumen sells in 10 ft multiples)                                                                              | `10 ft length` / 10                                                                                                                            |
| 657     | Surface raceway, 2400D series (divided) | —                | Base 10 ft (V2400BD), cover 5 ft (V2400C), bought separately                                                                                          | **Keep `per foot` / 1.** Owner, surface raceway Q6: one row priced per foot as base plus cover. The label could say `per foot (base + cover)`. |
| 1234    | LED tape light                          | —                | 16.4 ft (5 m) reel. The row's own note already says so                                                                                                | `per foot (from 16.4 ft reel)` / 1, matching the note                                                                                          |
| 1414    | Surface raceway, low voltage            | —                | Non-metallic low-voltage raceway is sold in short lengths and kits (Wiremold CordMate II kit, CDW $43.99). **No single-length listing was confirmed** | **Check the product before choosing.** Name the length the shop buys, e.g. `5 ft length` / 5                                                   |
| 68–70   | 14/3 SJOOW, 12/3 SOOW, 10/3 SOOW cord   | —                | Cut to length at the counter, or 250 ft reels                                                                                                         | `per foot (cut to length)` / 1, the label every other cut wire already carries. A wording gap more than a risk.                                |
| 1651    | Busway                                  | —                | Sections, typically 10 ft. The row's note says "Generic placeholder — size and price it per the job's schedule"                                       | **Leave.** A placeholder priced per job. Optionally `per foot (from 10 ft section)`.                                                           |
| 1656    | Cable tray, 12" ladder                  | —                | 10 ft or 12 ft sections. Placeholder note as above                                                                                                    | **Leave**, as 1651. Optionally `per foot (from 10 ft section)`.                                                                                |

## B. Each, but sold in a box, bag or case

`each` / `1`, while the counter or the shelf sells a pack. The owner would type
the pack price and price ONE piece at it.

| Row(s)          | Name                                               | Used by                          | Sold as (listing)                                                                                                                                                                            | Suggested pack                                                                                                                                                        |
| --------------- | -------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1322            | Grounding pigtail                                  | **15 starters**                  | Bags: HD Commercial Electric GP128-5 (5 for $5.48) and GP128-50 (50 for $31.00); IDEAL 30-3392R, 50 per bag, $31.00; IDEAL 30-3399, box of 100                                               | **`bag of 50` / 50.** The weightiest row in this table, because 15 starters each take one.                                                                            |
| 1693            | Arc flash label                                    | 5 starters                       | Packs of 5: HD IDEAL 44-893, 5-pack, $35.45; Brady 99455 and 145972, 5 per pack                                                                                                              | `pack of 5` / 5                                                                                                                                                       |
| 1432–1434       | Butt splice, blue / red / yellow                   | —                                | Platt 3M MVU10BCX, 12–10 yellow, **50 per pack** ($0.55 EA); 3M BSV10Q, 25 per bag                                                                                                           | `pack of 50` / 50 (check each colour's pack)                                                                                                                          |
| 1491–1493       | Ring terminal, blue / red / yellow                 | —                                | HD Ancor 220213, 16–14 blue, pack of 100 ($19.74); Gardner Bender packs of 15–17                                                                                                             | `pack of 100` / 100 (check per colour)                                                                                                                                |
| 1505–1507       | Spade terminal, blue / red / yellow                | —                                | Sold in small packs at HD (Gardner Bender 5-pack, AMT-SR1614) and 14–100 elsewhere. **No single pack size dominates**                                                                        | **Owner pick:** the pack the shop buys. Suggested `pack of 100` / 100, to match the rings.                                                                            |
| 1310            | Exothermic weld powder                             | —                                | Box of 10 cartridges: Elliott ERICO Cadweld #90, about $184–$256 per box                                                                                                                     | `box of 10` / 10. The name should also say the shot size (#90 is the common rod-to-cable size) in the next name review.                                               |
| 1580            | Toggle bolt                                        | —                                | Box of 50, 1/4" × 3" ($12.81–$13.91 per 50: Fastener Superstore, CDE, Elliott)                                                                                                               | `box of 50` / 50. The name has no size, which is for the Fasteners name review.                                                                                       |
| 772             | Steel stud grommet                                 | —                                | Bags of 100: Platt Greenlee 711C (7/8", package 100), Arlington SB10 (package 100, $0.23 EA); ClarkDietrich 100 per bag                                                                      | `bag of 100` / 100                                                                                                                                                    |
| 1230–1233, 1241 | 2 ft and 4 ft LED T8 tubes; 8 ft LED tube, R17d HO | 1231, 1233, 1241: 1 starter each | Platt-brand 4 ft Type B, **sold only by the case of 25** (1000bulbs: PLT-90032, $113.46 per case). HD sells smaller packs                                                                    | **Owner pick:** `case of 25` / 25 if the shop buys from the supply house, or HD's pack if not. Either way, pack qty must be more than 1 if the price typed is a case. |
| 1568            | 12 ga ceiling hanger wire                          | **7 starters (2 each)**          | Two products: 12 ft pieces in a **bundle of 100** (Elliott CW1212, $110.94 per 100; FBM HW12-12-100PC), or HD SUSPEND-IT, a **100 ft roll** ($6.79). The starters take 2, which means pieces | `bundle of 100` / 100, and the name gains "12 ft" in the next name review. **Do not price it from the 100 ft roll**, which is about 8 pieces.                         |

## C. Each, but the length is not named

| Row  | Name               | Used by | Sold as (listing)                                                                                                                            | Suggested                                                                                                           |
| ---- | ------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1455 | DIN rail           | —       | 1 m and 2 m lengths: Platt Weidmüller 0514500000, 35 × 7.5 mm × 2 m steel; 1 m aluminum about $9.66–$19.19 (USA Bluebook, Markertek, Newark) | Keep `each`, and name the length. Suggested `DIN rail, 35 mm, 1 m`, through the rename map.                         |
| 1288 | Tape light channel | —       | 1 m (39") pieces in 5-packs: HD Armacost 960059 ($29.97 per 5) and others                                                                    | `pack of 5` / 5 with "1 m" in the name, or `each` per 1 m piece. Owner pick; suggested the 5-pack, as HD stocks it. |

## D. A reel IS named, and it is the wrong length

| Row | Name        | Sheet says                    | Sold as (listing)                                                            | Suggested                         |
| --- | ----------- | ----------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| 666 | Tracer wire | `per foot (from 250 ft roll)` | **500 ft** rolls: HD Syston 8258-SP-RD-500, $84.28; Ferguson Pro-Pak, 500 ft | `per foot (from 500 ft roll)` / 1 |

The other 58 labelled wire rows were not each checked against a listing. Their
roll lengths (250 ft for NM-B, UF-B and MC; 500 ft for THHN; 1000 ft for
low-voltage boxes) match the usual stock. **#18 and #16 fixture wire (rows
14–15) are the ones to recheck:** fixture wire is commonly a 500 ft spool, and
the sheet says 250 ft. That is a label only, because the owner types the
per-foot price there.

## Checked and fine (pack qty 1 is right)

Not a change, listed so the next reader does not re-check them:

- **T-bar box hanger (1558), J-hook 2" (1573), conduit hanger with bolt
  (1570):** sold EACH at the counter, though cartoned. Platt Caddy 512HD
  $15.04 EA (standard pack 25); Elliott CAT32 $3.23 each; Crescent Minerallac
  0B $0.73 each.
- **Panel directory label (1703, 14 starters):** a kit counts as one. HD
  Square D UCD42CP, $10.98, holds two 42-space directories, so one kit does
  one panel.
- **Strut and all-thread (1519–1522, 1563–1567):** the name already says
  "10 ft", and they are sold per stick.
- **Ground rods, masts, wireway sections:** the length is in the name.
- **Electrical, phase, mastic and rubber tape (1696, 1702, 1704–1711,
  1714):** one roll is the unit people buy and count.

## For A

- One pass over `packFor` and the seed's pack fields for A–D. No name changes
  are needed for A, B or D; C and the names flagged in B (toggle bolt size,
  hanger wire "12 ft", weld powder shot size) belong to their shelves' name
  reviews.
- **669, 1322 and 1568 first**: the rows the most shipped starters and run
  types price.
- Owner picks are needed for the T8 tubes (case or HD pack), the spade
  terminals, the tape light channel, and the surface raceway lengths
  (surface raceway P1).
- If the recount finds a row this scan missed, the search above says what was
  and was not read. Extend it rather than trusting it as complete.

## Owner's answers — 2026-10-13

**Nothing below is applied yet.** A relabels **every row in this scan in ONE
pass** (sections A–D, `packFor` and the seed's pack), during the
end-of-pricing job and **before the owner types any of these prices**. A
price typed against an old label is the exact mistake this scan exists to
stop, so the labels go first.

| Pick                                    | Answer                                       | What the pass does                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T8 tubes (1230–1233, 1241)              | **Case of 25**                               | `case of 25` / 25 on all five rows. The owner types the case price.                                                                                                                                                                                                                                                                           |
| Spade terminals (1505–1507)             | **Bag of 100**                               | `bag of 100` / 100 on all three colours.                                                                                                                                                                                                                                                                                                      |
| Tape light channel (1288)               | **1 m (3.3 ft)**                             | The name gains the length through `RENAMED_BASELINE_MATERIALS`: `Tape light channel, 1 m (3.3 ft)`, old name a search word. Pack stays `each` / 1, one 1 m piece. Not the 5-pack.                                                                                                                                                             |
| Surface raceway lengths (658, 659, 657) | **10 ft lengths for 500/700, 5 ft for 2400** | 658 and 659 `10 ft length` / 10, like conduit's `10 ft stick`. 657 (2400D) `5 ft length` / 5: still per foot underneath, so surface raceway Q6 (one row, base plus cover) stands, and the price typed is 5 ft of base plus one 5 ft cover. Its description changes to say so (Q6 had "price both per foot"). This answers surface raceway P1. |

**The rest of the scan goes as suggested** in the pass: 669, 664, 665 and
666 as recorded in `underground-name-review.md` Q3; 636 `10 ft length` / 10;
1234 `per foot (from 16.4 ft reel)`; 68–70 `per foot (cut to length)`; 1322
`bag of 50`; 1693 `pack of 5`; 1310 `box of 10`; 1580 `box of 50`; 772 `bag
of 100`; 1568 `bundle of 100`; 1432–1434 and 1491–1493 at the pack the
listing shows **for each colour**. 1414 (low-voltage raceway) still needs the
product checked before a length is chosen, and 1651 and 1656 stay as
placeholders. Surface raceway **P3** (coupling packs say 25, real pack 10) is
the same pass.

**Check after the pass:** every row in A–D shows its new label in the sheet,
and the count of pack-qty-1 rows moves by exactly the rows whose qty changed
(658, 659, 636, 657, 1230–1233, 1241, 1505–1507, 1322, 1693, 1310, 1580, 772,
1568, the butt and ring terminals). Count it before and after the pass, not
just after. If the number that moved does not match that list, stop and find
out why before the owner types prices.
