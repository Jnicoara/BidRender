# Box depth check — 2026-10-09 (Track A)

The 33 boxes in `C:\dev\catalog-review\verify-box-depths.txt` (catalog review
RENAME 7) checked against real products. The owner decided on 2026-10-09
(below); the renames are built in `shared/catalogRealityCheck20261009.ts`
(in place, same ids, every starter keeps its row).

## Owner's decisions — 2026-10-09 (APPROVED)

Numbers refer to "Proposed changes" at the end of this file.

- **#1 and #3–#11: apply as proposed** — but see #14, which names the
  plastic ones by cubic inches instead of depth.
- **#2, 5-gang box:** keep it, depth 3-9/16", tagged **Specialty**.
- **#12, 2- and 3-gang metal:** one-piece **welded** gang box rows, with
  "gangable" as a search word.
- **#13: keep 3"** for the triple- and 4-gang plastic boxes.
- **#14: plastic boxes are named by CUBIC INCHES** (e.g. "Single-gang new
  work box, plastic, 18 cu in"); the old names and the depths stay as search
  words. The owner approved these as changes to the frozen names.

**As built** (every old name is a search word on its row):

| Was                                | Now                                                |
| ---------------------------------- | -------------------------------------------------- |
| Single-gang box                    | Single-gang new work box, plastic, 18 cu in        |
| Double-gang box                    | Double-gang new work box, plastic, 32 cu in        |
| Triple-gang box                    | Triple-gang new work box, plastic, 46 cu in        |
| Single-gang box, deep              | Single-gang new work box, plastic, 22.5 cu in      |
| Double-gang box, deep              | Double-gang new work box, plastic, 35 cu in        |
| 4-gang box                         | 4-gang new work box, plastic, 60 cu in             |
| 5-gang box                         | 5-gang new work box, plastic, 94 cu in (Specialty) |
| Single-gang old-work box           | Single-gang old work box, plastic, 20 cu in        |
| Double-gang old-work box           | Double-gang old work box, plastic, 34 cu in        |
| Triple-gang old-work box           | Triple-gang old work box, plastic, 55 cu in        |
| Octagon box, plastic               | Round ceiling box, plastic, 20 cu in               |
| Old-work ceiling box               | Old work ceiling box, plastic, 18 cu in            |
| Single-gang metal box              | Single-gang metal box, 2-1/2" deep                 |
| Double-gang metal box              | Double-gang welded metal box, 2-1/2" deep          |
| Triple-gang metal box              | Triple-gang welded metal box, 2-1/2" deep          |
| Masonry box, single/double/triple  | …, 3-1/2" deep                                     |
| Fan-rated ceiling box              | Fan-rated ceiling box, 2-1/4" deep                 |
| Ceiling fan brace box              | Ceiling fan brace box, 1-1/2" deep                 |
| Handy box                          | Handy box, 1-7/8" deep                             |
| 1/2" and 3/4" WP single/double     | …, 2" deep                                         |
| 1/2" weatherproof box, triple-gang | 3/4" weatherproof box, triple-gang, 2-5/8" deep    |
| 1/2" and 3/4" WP round             | …, 1-1/2" deep                                     |
| 1/2" and 3/4" WP single, PVC       | …, PVC, 2-3/8" deep                                |
| NxN pull box (steel, 3R, PVC)      | NxNx4 up to 12x12; 16x16x6, 24x24x6                |

**Calls made in building it (say if wrong):**

- **Which cubic inches.** Each is the commonly stocked size the research
  found at that depth: 18 (2-7/8"), 32 (3"), 22.5 (deep single; Carlon's is
  22), 35 (deep double), 20 / 34 / 55 (old work), 20 (round ceiling), 18
  (old-work ceiling).
- **#13 with #14.** "Keep 3"" and "name by cubic inches" meet on the 3"-deep
  product: the triple-gang is 46 cu in (Allied 3300-NK, 3") rather than
  Carlon's 44 cu in at 2-11/16", and the 4-gang is 60 cu in (3"). "3 inch
  deep" stays a search word on both.
- **#11 (PVC weatherproof) stays on depth**, not cubic inches: it is a
  weatherproof FS box, and the two stocked parts disagree on capacity (18 vs
  22.5 cu in) while agreeing on depth.
- **"new work" / "old work" unhyphenated**, as in the owner's example; the
  hyphenated old names are search words.
- **The fan-rated box is not a plastic-by-cubic-inch row:** batch 1 of the
  reality check redefines it as the new-work fan box, metal or plastic.

## How it was checked, and how far to trust it

- Three sources per box, manufacturer first (Carlon/ABB, Allied Moulded,
  Cantex, RACO/Hubbell, Steel City/ABB, Bell/Hubbell, Red Dot, Hoffman,
  Milbank, Appleton, Arlington, Westinghouse), then distributors and
  retailers (Platt, Gexpro, Rexel, Crescent, Elliott, Home Depot…).
- **Many figures are from search-result text of a product page, not the page
  opened.** ABB's own catalog (`empower.abb.com`) and the Carlon catalog PDF
  timed out; Crescent and HD Supply returned 403; the Cantex sell-sheet PDFs
  did not parse. Those are marked _(snippet)_. Home Depot / Lowe's pages were
  mostly not opened. Treat a _(snippet)_ figure as likely, not checked.
- **"Most stocked" is inferred** — from which size every maker and big-box
  store carries, "top seller" tags, and the cheapest builder line — not from
  sales data. Nobody here has sales data.
- A depth is the box's depth; several listings mix depth and height (e.g. the
  Cantex EZ32DN at "3-5/8"" is its height). Where sources disagree it says so.

## The answer in one table

| #   | Current name                             | Proposed depth | Verdict                                     | Use instead (most stocked)                                       |
| --- | ---------------------------------------- | -------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Single-gang box                          | 3"             | **WRONG** — no common box is 3"             | **2-7/8" (18 cu in)**; 3-1/4" (20 cu in) is the other stock size |
| 2   | Double-gang box                          | 3"             | correct                                     | 3" (32 cu in)                                                    |
| 3   | Triple-gang box                          | 3"             | roughly — 2-11/16" to 3-1/4" by maker       | 3" defensible; Carlon's common one is 2-11/16"                   |
| 4   | Single-gang box, deep                    | 3-1/2"         | correct (3-3/8" to 3-9/16")                 | 3-1/2" (22–22.5 cu in)                                           |
| 5   | Double-gang box, deep                    | 3-1/2"         | correct                                     | 3-1/2" (35 cu in)                                                |
| 6   | 4-gang box                               | 3"             | acceptable (2-1/2" to 3-1/2")               | 3" (Allied 60 cu in); Carlon's is 2-1/2"                         |
| 7   | 5-gang box                               | 3"             | **WRONG** — the one real product is 3-9/16" | **3-9/16" (94 cu in)**; only Allied makes it                     |
| 8   | Single-gang metal box                    | 2-1/2"         | correct                                     | 2-1/2" (3x2, 12.5 cu in)                                         |
| 9   | Double-gang metal box                    | 2-1/2"         | depth real, **product ambiguous**           | decide: welded gang box (2-1/2") or ganged 3x2 boxes             |
| 10  | Triple-gang metal box                    | 2-1/2"         | depth real, **product ambiguous**           | same decision as 9                                               |
| 11  | Single-gang old-work box                 | 3"             | **WRONG**                                   | **3-5/8" (20 cu in)**; shallow 14 cu in is 2-3/4"                |
| 12  | Double-gang old-work box                 | 3"             | **WRONG**                                   | **3-9/16" (34 cu in)**; shallow 25 cu in is 2-3/4"               |
| 13  | Triple-gang old-work box                 | 3"             | **WRONG**                                   | **3-1/2" nominal (55 cu in)**, 3-3/8" to 3-11/16" by maker       |
| 14  | Masonry box, single-gang                 | 3-1/2"         | correct                                     | 3-1/2" (22 cu in); 2-1/2" also exists                            |
| 15  | Masonry box, double-gang                 | 3-1/2"         | correct                                     | 3-1/2" (45–47 cu in)                                             |
| 16  | Masonry box, triple-gang                 | 3-1/2"         | correct                                     | 3-1/2" (67–71 cu in); 2-1/2" also exists                         |
| 17  | Octagon box, plastic                     | 2-1/4"         | depth right, **shape wrong**                | stocked box is **ROUND** 4", 20 cu in, 2-1/4"                    |
| 18  | Old-work ceiling box                     | 2-1/4"         | **WRONG**                                   | **2-3/4" (18 cu in round)**                                      |
| 19  | Fan-rated ceiling box                    | 2-1/4"         | correct for plastic new work                | 2-1/4"; metal fan boxes are 2-1/8"                               |
| 20  | Ceiling fan brace box                    | 1-1/2"         | correct                                     | 1-1/2"                                                           |
| 21  | Handy box                                | 1-7/8"         | correct                                     | 1-7/8" (4 x 2-1/8)                                               |
| 22  | 1/2" WP box, single-gang                 | 2"             | correct (2.14" actual)                      | 2"; "deep" 2-5/8" also stocked                                   |
| 23  | 1/2" WP box, double-gang                 | 2"             | correct                                     | 2"                                                               |
| 24  | 1/2" WP box, triple-gang                 | 2"             | **NOT a stocked product at 2"**             | **3/4" WP box, triple-gang, 2-5/8" deep** (Bell 5390-0)          |
| 25  | 3/4" WP box, single-gang                 | 2"             | correct                                     | 2"                                                               |
| 26  | 3/4" WP box, double-gang                 | 2"             | correct — exists and stocked                | 2"                                                               |
| 27  | 1/2" WP round box                        | 2"             | **WRONG**                                   | **1-1/2" nominal** (1-5/8" actual)                               |
| 28  | 3/4" WP round box                        | 2"             | **WRONG**                                   | **1-1/2" nominal** (1-5/8" actual)                               |
| 29  | 1/2" WP box, single-gang, PVC            | 2"             | close — really 2.3"–2.375"                  | **2-3/8"** is more exact                                         |
| 30  | 3/4" WP box, single-gang, PVC            | 2"             | close — same as 29                          | **2-3/8"**                                                       |
| 31  | Pull boxes 4x4 → 12x12 (all three kinds) | x4             | correct                                     | WxHx4; 12x12x6 is also very common                               |
| 32  | 16x16, 24x24 pull box                    | x6             | correct                                     | 16x16x6, 24x24x6                                                 |
| 33  | Floor box                                | none           | correct to leave it                         | 3-5/8" cast, 6" PVC — no single depth                            |

**Correct as proposed: 2, 4, 5, 8, 14, 15, 16, 19, 20, 21, 22, 23, 25, 26,
31, 32, 33** (and 3, 6 acceptable). **Wrong depth: 1, 7, 11, 12, 13, 18, 27, 28.** **Wrong or doubtful product: 9, 10, 17, 24.** **Slightly off: 29, 30.**

## A pattern worth a decision, not just numbers

**Plastic boxes are sold by CUBIC INCHES, and depth for one nominal size
varies by maker by 1/4" to 9/16".** An estimator asks the counter for "an 18"
or "a 22", not "a 2-7/8"". Two of the three agents independently suggested
naming plastic boxes by cubic inches (`Single-gang box, plastic, 18 cu in`),
with the depth optional. Cubic inches also decide box fill, which is the
reason a person picks one size over another. Owner's call.

## Per box — sources

_(snippet)_ = figure from search-result text of that page, not the page read.

### Plastic new-work (1–7)

**1. Single-gang — WRONG (3").** Three stocked sizes: 18 cu in 2-7/8"
(cheapest builder box), 20 cu in 3-1/4", 22.5 cu in ~3-1/2" (that is #4).

- Carlon B118A — 2-7/8", 18 cu in — CESCO product page (Elliott says 2.83").
- Carlon B120A-UPC — 3-1/4", 20 cu in — Crescent product 16672; Home Depot 321828222.
- Cantex EZ18SNW — 2.875", 18 cu in — Home Depot REZ18SNWV page (depth for HD's listing not confirmed).
- Allied Moulded 1098-N — 3-1/4", 20.5 cu in — Elliott.

**2. Double-gang — CORRECT (3").**

- Carlon B232ACP — 3", 32 cu in — Gexpro (B232A-UPC listed discontinued).
- Allied Moulded 2300-NK — 3", 32.5 cu in — Platt.
- Cantex EZ32DN — 3.063", 32 cu in — Cantex spec sheet via Elliott (Ace: 3.06").

**3. Triple-gang — roughly (3").**

- Carlon B344AB — 2-11/16", 44 cu in — Gexpro / Rexel / Platt.
- Allied Moulded 3300-NK — 3", 46 cu in — Crescent; Elliott.
- Carlon NG-354-V / FN-354-V — 3-1/4", 54 cu in — Platt; Home Depot.

**4. Single-gang deep — CORRECT (3-1/2").**

- Carlon B122A-UPC — 3-1/2", 22 cu in — Rexel (page opened); Crescent agrees; HD says 22.5 cu in.
- Allied Moulded 1099-N — 3-9/16", 22.5 cu in — Platt (mc-mc and Lowe Electric say 3-1/4": disputed).
- ABB Nutek RN-23-FS — 3-3/8", 22.5 cu in — Crescent.

**5. Double-gang deep — CORRECT (3-1/2").**

- Carlon BH235A — 3-1/2", 35 cu in — Platt; Stoneway.
- Cantex EZ35DN-HW — 3.59", 35 cu in — retailer figure; Cantex sell sheet did not parse.
- Allied Moulded P-442QT — 3-9/16", 43.5 cu in — Platt.

**6. 4-gang — acceptable (3").**

- Allied Moulded 4300-NK — 3", 60 cu in — Platt; Crescent; Elliott.
- Carlon B455A-UPC — 2-1/2", 60 cu in — Crescent.
- Carlon BH464A — 3-3/16", 64 cu in — Crescent (Platt says 3-1/2": disputed).

**7. 5-gang — WRONG (3").** One maker found.

- Allied Moulded 5305-NK — 3-9/16", 94 cu in — Platt.
- Allied Moulded 5305-NK — 3-9/16", 94 cu in — Gexpro.
- Allied Moulded 5305-NBK (with bracket) — 3-9/16", 94 cu in — Rexel.
- No 5-gang found from Carlon, Cantex or Arlington — **a rare item**; worth asking whether it belongs in a starter catalog at all.

### Metal new-work (8–10)

**8. Single-gang metal — CORRECT (2-1/2").** 3x2x2-1/2, 12.5 cu in.

- Steel City A257-20R — 2-1/2", 12.5 cu in — Home Depot (ABB catalog timed out).
- RACO 500 (gangable) — 2-1/2", 12.5 cu in — Platt.
- RACO 512 (gangable, NM clamps) — 2-1/2" — Gexpro (capacity not confirmed).

**9–10. Double / triple-gang metal — the depth is real; the product is a
choice.** A one-piece 2- or 3-gang metal box at 2-1/2" is a WELDED or DRAWN
gang box (a conduit item, ~$100+ for 3-gang). On new work a "2-gang metal box"
is usually two gangable 3x2 boxes, or a 4" square with a 2-gang mud ring.
Different products, very different prices.

- RACO 941, 2-gang welded — 2-1/2", 70 cu in — Hubbell spec sheet.
- Steel City 2-gang drawn — 2-1/2", 71 cu in — CESCO (part no. not confirmed).
- RACO 942, 3-gang welded — 2-1/2", 90 cu in — Crescent product 15928; Van Meter.
- Steel City H3BD-3/4-1, 3-gang drawn — 2-1/2", 90 cu in — Gexpro; Crescent.
- Also stocked: 2-gang welded at 2-1/8" (Steel City 132-W-1/2, 30.3 cu in; Appleton 132AP-SPL).

### Old-work (11–13)

**11. Single-gang old-work — WRONG (3").** Standard is 3-5/8" (18–22 cu in);
shallow 14 cu in is 2-3/4".

- Carlon B120R — 3-5/8", 20 cu in — ABB catalog; SupplyHouse.
- Cantex EZ21SO — 3.60", 21 cu in — Cantex sell sheet _(snippet)_; EZ14SO 2.75", 14 cu in.
- Carlon B114R-UPC — 2-3/4", 14 cu in — ABB catalog.
- Allied P-1220OW — 3-3/4" (capacity listed 22.5 though named 20: unresolved) — Stoneway.

**12. Double-gang old-work — WRONG (3").**

- Carlon BH234R — 3.59", 34 cu in — Crescent _(snippet; page 403)_.
- Carlon B225R-UPC — 2-3/4", 25 cu in — ABB catalog; Home Depot 100404169.
- Cantex EZ34DO HW — 34 cu in, depth not confirmed — Cantex sell sheet.

**13. Triple-gang old-work — WRONG (3").**

- Carlon B355R — 3.69", 55 cu in — ABB catalog; Elliott.
- Allied P-352OW — 3-3/8", 55 cu in — Stanion (page empty when fetched).
- Allied 9313-EWK (fiberglass) — 2-7/8", 42.5 cu in — Van Meter.

### Masonry (14–16) — all CORRECT at 3-1/2"

**14.** Steel City GW-135-G 3-1/2", 22 cu in (ABB catalog; Rexel) · Home Depot
GW135G-20R 3-1/2", 22 cu in · RACO 695 3-1/2", 22.5 cu in (Hubbell spec sheet).
**15.** RACO 696 3-1/2", 45 cu in (Hubbell) · Home Depot "696" 3-1/2" ·
Steel City 2-MB 3-1/2", 46.8 cu in (ABB catalog). Steel City GW-235-G listings
conflict on capacity and gang count.
**16.** Steel City GW-335-G 3-1/2", 71 cu in (Platt; Home Depot) · RACO 697
3-1/2", 67.3 cu in (Hubbell spec sheet). RACO 692 is a 2-1/2" 3-gang.

### Ceiling and fan (17–20)

**17. Plastic octagon — the stocked box is ROUND.** 4" round, 20 cu in,
2-1/4". A true plastic octagon is mainly Carlon's ENT box (~2-1/8").

- Carlon B520A-UPC — round, 2-1/4", 20 cu in, 50 lb fixture — Platt.
- Carlon B520P-UPC — round, 2-1/4", 20 cu in — Elliott.
- Carlon A615DE (ENT octagon) — 56 mm (~2-1/8"), 20.5 cu in — ABB catalog.

**18. Old-work ceiling box — WRONG (2-1/4").** Common one is 18 cu in round at 2-3/4".

- Carlon B618RR — 2-3/4", 18 cu in — retailers (one ABB field says 4-1/4", likely the diameter).
- Cantex EZ18COG — 2.680", 18 cu in — Cantex sell sheet _(snippet)_.
- Allied 9338-ES — 2", 14 cu in, 3-1/2" round (smaller, less common) — Rexel.

**19. Fan-rated ceiling box — CORRECT (2-1/4") for plastic new work.**

- Carlon B520A-CFB — 2-1/4", 35 lb fan — ABB catalog.
- Cantex EZ20CZ — 2.30", 20 cu in, 35 lb fan — Cantex sell sheet _(snippet)_.
- Commercial Electric CMB218-SM (metal) — 2-1/8", 21.5 cu in, 70 lb fan — Home Depot.

**20. Fan brace box — CORRECT (1-1/2").**

- RACO 936 Retro-Brace — 1-1/2", 15.8 cu in — Hubbell spec sheet.
- Westinghouse 0110000 Saf-T-Brace — 1-1/2", 15.5 cu in — Westinghouse; Rexel.
- Arlington FBS415 — 1-1/2", 14.6 cu in — Stanion (FBRS415's depth not confirmed).

### Utility and weatherproof (21–30)

**21. Handy box — CORRECT (1-7/8").** Appleton 4CS12 (Platt) · Appleton
4CS34 (Rexel) · RACO 660 (Platt, from the listing title).

**22. 1/2" WP single-gang — CORRECT (2", 2.142" actual).** Bell 5320-0
4-1/2x2-3/4x2, 18.3 cu in (Steiner; Hubbell spec sheet _(snippet)_) · Red Dot
IH3-1-LM 2" (Platt) · Bell 5321-0 2" (Hubbell _(snippet)_). Deep: Red Dot
IHD3-1 2-5/8" (Rexel).

**23. 1/2" WP double-gang — CORRECT (2").** Bell 5337-0 2" nom / 2.25"
actual, 31 cu in (Hubbell _(snippet)_) · Bell 5340-0 2" (Gexpro) · Red Dot
2IH3-1 2-1/16" (Platt).

**24. 1/2" WP triple-gang — NOT a stocked 2" product.** Bell's only 3-gang
(5390-0) has 3/4" hubs and is the DEEP box: 2-5/8" nom, 2.781" actual
(Hubbell _(snippet)_). Red Dot B37D20G likewise 3/4" hubs, ~2-3/4" (ABB
_(snippet)_). The only 1/2" triple-gang found: Topaz WB3750, 2.625" (Gexpro,
from the listing title). Red Dot CIFS-3G-1/2 (1-7/8") could not be confirmed
as a hubbed device box. "Bell 5397" does not appear to exist.

**25. 3/4" WP single-gang — CORRECT (2").** Bell 5324-0 2" / 2.142"
(Hubbell; spec sheet _(snippet)_) · Bell 5330-0 2" (Gexpro) · deep Red Dot
IHD3-2 2-5/8" (Gexpro).

**26. 3/4" WP double-gang — CORRECT (2"), exists and stocked.** Bell 5342-0
2", 31 cu in (Hubbell _(snippet)_) · Bell/TayMac 5343-0 2" (Hubbell
_(snippet)_) · deep Bell 5388-0 2.625" (Hubbell Mexico _(snippet)_).

**27. 1/2" WP round — WRONG (2").** 1-1/2" nominal, 1-5/8" actual.

- Bell 5361-0 — 4" round, 1-1/2" — Gexpro.
- Bell 5361-0 — 1.5" nom / 1.625" actual, 16 cu in — Hubbell _(snippet)_.
- Red Dot S-47 — 1-5/8" — Platt (listing title; the page's own table says 1/2", plainly wrong).

**28. 3/4" WP round — WRONG (2").** Bell 5372-0 1.5" nom / 1.625" actual
(SYDist _(snippet)_) · Bell round 5×3/4" (Hubbell _(snippet)_, part no. not
confirmed) · Mulberry 30326 1.625" (_(snippet)_).

**29. 1/2" PVC WP single-gang — close (2").** Carlon E980DFN 2.30", 18 cu in
(Crescent) · Cantex 5133363 2.375", 22.5 cu in (Elliott, page read) ·
Bell/TayMac PSBD37550WH deep 2-5/8" (Hubbell spec sheet _(snippet)_).

**30. 3/4" PVC WP single-gang — close (2").** Carlon E980EFN 2.30" (mc-mc
_(snippet)_; ABB 58.4 mm _(snippet)_) · Platt says 2.42", True Value 2.25" ·
Cantex 5133364 exists, depth not confirmed.

### Pull boxes and floor box (31–33)

**31. WxHx4 up to 12x12 — CORRECT.** 4" is the stocked depth in every size
and kind; 12x12x6 is also very common.

- Steel NEMA 1: Hoffman ASE4X4X4 (North Coast), ASE6X6X4NK (Crescent),
  ASE8X8X4 (Kele), ASE12X12X4 and ASE12X12X6NK (SYDist); Milbank 664SC1,
  884SC1, 12124SC1 (Elliott).
- NEMA 3R: Hoffman A6R64 (Elliott), A8R84 _(snippet)_, A12R124 (Platt),
  A12R126 (Gexpro); Milbank 12126SC3RNK (Elliott).
- PVC: Carlon E987N 4x4x4 (mc-mc), E987R 6x6x4 (Elliott), E989N 8x8x4
  _(snippet, catalog timed out)_, E989UUN 12x12x4 (mc-mc); Cantex 5133709
  4x4x4 (Steiner). **PVC also comes deeper** — Cantex 5133711 is 6x6x6 and
  5133708 is 8x8x7 (Elliott) — so a PVC name must state its depth.
- The takeoff names pull boxes by size when it proposes one at an angle
  pull: renaming needs that code changed in the same step (the original list
  says so).

**32. 16x16x6, 24x24x6 — CORRECT.** Hoffman ASE16X16X6 (Elliott), Milbank
16166-SC1-NK (Van Meter), Hoffman ASE24X24X6 (Kele), Milbank 24246SC1NK
(Elliott). 24x24x8 also exists (Hoffman ASE24X24X8, North Coast).

**33. Floor box — leave it.** Steel City 641 cast iron 1-gang 3-5/8", 35 cu in
(Steiner, 641AL page); 642-1 / 643 also 3-5/8" · Carlon E976RFB PVC 6" deep,
97.4 cu in (mc-mc _(snippet)_) · Arlington FLBC4502 depth not confirmed.

## Proposed changes — NOT made; for the owner's yes

1. Single-gang box → `Single-gang box, plastic, 2-7/8" deep` (18 cu in) — not 3".
2. 5-gang box → `5-gang box, plastic, 3-9/16" deep` — not 3" (and: keep it at all? one maker).
3. Single-gang old-work box → `…, 3-5/8" deep` — not 3".
4. Double-gang old-work box → `…, 3-9/16" deep` — not 3".
5. Triple-gang old-work box → `…, 3-1/2" deep` — not 3".
6. Octagon box, plastic → `Round ceiling box, plastic, 2-1/4" deep` — it is round.
7. Old-work ceiling box → `…, 2-3/4" deep` — not 2-1/4".
8. 1/2" weatherproof box, triple-gang → `3/4" weatherproof box, triple-gang, 2-5/8" deep` — no stocked 1/2" 2" one.
9. 1/2" weatherproof round box → `…, 1-1/2" deep` — not 2".
10. 3/4" weatherproof round box → `…, 1-1/2" deep` — not 2".
11. 1/2" and 3/4" PVC weatherproof single-gang → `…, 2-3/8" deep` — "2"" is close; 2-3/8" is exact.
12. Double / triple-gang metal box — decide welded gang box vs ganged 3x2 boxes before naming.
13. Triple-gang and 4-gang plastic — 3" is defensible, not universal (Carlon: 2-11/16", 2-1/2").
14. Everything else as proposed. Consider naming plastic boxes by cubic inches.
