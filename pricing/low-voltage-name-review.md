# Low Voltage — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Low Voltage" shelf of `starter-catalog-pricing.xlsx` ("Starter prices",
spreadsheet rows **1353–1421**, 69 rows, in the app-order sort), the
question is whether one real product can be priced at a supply house or
Home Depot from the name alone. The workbook was read from a fresh copy
(the worktree's copy, byte for byte the same as `C:\dev\BidPhase\pricing`),
because the owner has it open. It is the shelf after Life Safety
(`life-safety-name-review.md`); Connectors & Terminations starts at row 1422.

The sheet's 69 names match `BASELINE_MATERIALS`' Low Voltage rows one for
one (read from the seed the same day), so the search words quoted below are
the catalog's own. One row carries a description today (`18/3 control wire
Copper`).

**The test.** Cable is bought by type and jacket (riser or plenum) on a
1000 ft box; a patch panel or rack by size (ports, rack units); a speaker by
size, and usually as a PAIR; a wall plate, connector or plug by the pack the
counter sells.

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**;
**Decided**, where an earlier decision settled it.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**28 of the 69 rows are used** (the sheet's "Used by" column says the
same). `Telecom backboard, plywood 4x8` and `Telecom grounding busbar` are
used by no starter but ship as commercial rows (`jobKind`, coverage-check
rows). **No run type uses this shelf.**

**Sources.** Listings checked on 2026-10-14: Southwire Cat6 CMR 1000 ft
(Home Depot, Border States, Elliott), RG6 compression F connectors (Home
Depot 10-packs and 50-pack), 6.5" in-ceiling speakers (Home Depot, sold in
pairs), Leviton 47605-28N and 47605-14E structured media enclosures
(SupplyHouse, Home Depot, Crescent, MC-MC, Lumen), 12U swing-gate wall racks
(Fibersavvy, Nassau, SoundPro). Prices only show how big a question is;
they are not proposed prices. Brands stay out of names.

**Already decided, and not reopened here:**

- **Every cable name on this shelf** (`Cat6 cable Copper`, `RG6 coax cable
Copper`, `18/2 control wire Copper`, `16/2 speaker wire Copper`, …) is the
  2026-10-07 frozen form (`pricing/frozen-names.json`, CLAUDE.md § "One
  convention"): conductor or type first, metal last. Anything they lack goes
  in a description (Q1).
- **Packs on the cable rows**: `per foot (from 1000 ft box)` and the
  landscape cable's `per foot (from 250 ft roll)` are the right labels.
- **`Surface raceway, low voltage`** is on `pack-label-scan.md` § A as
  "check the product before choosing" (Q12 here).

## Existing rows

| Row                               | Current name                                                                                         | Used by                                                                  | Verdict                                                                  | Why                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1359                              | `Cat6 cable Copper`                                                                                  | **5 starters**: MS6 (150 ft), MS7 (75), MS9 (100), CK9 (300), CW8 (150)  | **Decided** name; description (Q1)                                       | The riser (CMR) cable; plenum has its own row. Southwire CMR 1000 ft: **$195** (Home Depot), **$254.15** (distributor). The jacket is said only in its search words. |
| 1356, 1364, 1366, 1367            | `Cat5e cable Copper`, `Cat6 plenum cable Copper`, `Cat6 shielded cable Copper`, `Cat6A cable Copper` | —                                                                        | **Decided**; description (Q1)                                            | Same: the jacket goes in the description.                                                                                                                            |
| 1375–1379                         | `18/2`, `18/3`, `18/4`, `18/5`, `18/8 control wire Copper`                                           | 18/2: 4 starters; 18/3: 2; 18/4: 3; 18/5: 1                              | **Decided**                                                              | Thermostat / bell wire, sold on 250 ft and 500 ft spools as well as boxes; the label follows the box. 18/3 already has its description.                              |
| 1403, 1404                        | `RG11 coax cable Copper`, `RG6 coax cable Copper`                                                    | RG6: MS8 (75 ft)                                                         | **Decided**                                                              | Quad shield and dual shield are near the same price; "quad shield" is a search word.                                                                                 |
| 1405, 1406                        | `22/2 security cable Copper`, `22/4 security cable Copper`                                           | —                                                                        | **Decided**                                                              |                                                                                                                                                                      |
| 1407                              | `Security camera cable Copper`                                                                       | —                                                                        | **Decided** name; description (Q1)                                       | It is siamese cable (RG59 + 18/2 power) for analog cameras; the name does not say so, the search words do.                                                           |
| 1411, 1412                        | `16/2 speaker wire Copper`, `14/2 speaker wire Copper`                                               | 16/2: MS10 (50 ft)                                                       | **Decided**                                                              |                                                                                                                                                                      |
| 1397                              | `12/2 landscape lighting cable Copper`                                                               | LT18 (30 ft)                                                             | **Decided**                                                              |                                                                                                                                                                      |
| 1385                              | `Fiber optic cable, 12-strand OM4 multimode, plenum`                                                 | —                                                                        | **OK**                                                                   | Fully named.                                                                                                                                                         |
| 1390                              | `In-ceiling speaker`                                                                                 | MS10                                                                     | **Needs words** (Q2): `In-ceiling speaker, 6.5"`; pack **P1**            | Sized 6.5" or 8"; search words say both. **Sold as a PAIR**: Home Depot 6.5" pairs **$35–$312**.                                                                     |
| 1413                              | `Structured media enclosure`                                                                         | MS12                                                                     | **Needs words** (Q3): `Structured media enclosure, 28"`                  | Sold by height: 28" (47605-28N) **$60–$115**; 14" **$79**; 42" more.                                                                                                 |
| 1399                              | `Network rack, wall mount`                                                                           | MS11                                                                     | **Needs words** (Q4): `Network rack, wall mount, 12U swing gate`         | Sold by rack units: 12U swing gate **$183–$592**.                                                                                                                    |
| 1389                              | `Horizontal cable manager`                                                                           | MS11                                                                     | **Needs words** (Q4): `Horizontal cable manager, 1U`                     | Search words say "1u 2u".                                                                                                                                            |
| 1402                              | `Rack shelf`                                                                                         | —                                                                        | **Needs words** (Q4): `Rack shelf, 1U cantilever`                        | Search words say "1u 2u".                                                                                                                                            |
| 1401                              | `Patch panel blank`                                                                                  | —                                                                        | **Needs words** (Q4): `Rack blank panel, 1U`                             | It is a rack filler, not part of a patch panel; "patch panel blank" stays a search word.                                                                             |
| 1418                              | `Vertical cable manager`                                                                             | —                                                                        | **Needs words** (Q4): `Vertical cable manager, 7 ft`                     | Sold by height to match a floor rack.                                                                                                                                |
| 1358                              | `Cat5e patch panel`                                                                                  | —                                                                        | **Needs words** (Q5): `Cat5e patch panel, 24-port`                       | Its Cat6 twin says 24-port; search words say "24 port 48".                                                                                                           |
| 1386                              | `Fiber patch panel`                                                                                  | —                                                                        | **Owner pick** (Q5)                                                      | Search words say "enclosure lgx splice tray": an enclosure, its adapter panels and splice trays are each bought.                                                     |
| 1373                              | `Coax splitter`                                                                                      | —                                                                        | **Needs words** (Q6): `Coax splitter, 2-way`                             | Sold by ways; search words say "2 way 3 4".                                                                                                                          |
| 1370                              | `Coax amplifier`                                                                                     | —                                                                        | **Needs words** (Q6): `Coax distribution amplifier, 4-port`              | Sold by outputs.                                                                                                                                                     |
| 1421                              | `Volume control`                                                                                     | —                                                                        | **Needs words** (Q2): `Speaker volume control, 100W, impedance-matching` | Sold by watts, and impedance-matching is what lets several on one amplifier work.                                                                                    |
| 1408, 1409                        | `Security camera, bullet`, `Security camera, dome`                                                   | dome: MS9                                                                | **Needs words** (Q7): `…, IP PoE`                                        | MS9 runs Cat6 to it, so it is a network (PoE) camera, not an analog one on siamese cable.                                                                            |
| 1396                              | `Landscape light fixture`                                                                            | LT18                                                                     | **Owner pick** (Q8)                                                      | Search words cover path, spot, well and in-grade lights, which are four products at $20–$150 each.                                                                   |
| 1416                              | `Telecom grounding busbar`                                                                           | — (commercial row)                                                       | **Needs words** (Q9): `Telecom grounding busbar, 1/4" x 2" x 12"`        | Sold by length; a main busbar (TMGB) is longer.                                                                                                                      |
| 1419                              | `Video doorbell`                                                                                     | RS11                                                                     | **Owner pick** (Q10)                                                     | A branded smart product, often supplied by the homeowner.                                                                                                            |
| 1420                              | `Video doorbell power kit`                                                                           | RS11                                                                     | **OK**; description (Q10)                                                | Fits one doorbell brand.                                                                                                                                             |
| 1391                              | `Keypad mounting plate`                                                                              | —                                                                        | **Owner pick** (Q11)                                                     | An alarm keypad backplate; fits one alarm brand.                                                                                                                     |
| 1400                              | `NVR enclosure`                                                                                      | —                                                                        | **Owner pick** (Q11)                                                     | A lockbox for a camera recorder: not a common counter item.                                                                                                          |
| 1414                              | `Surface raceway, low voltage`                                                                       | —                                                                        | **Owner pick** (Q12)                                                     | Search words say "metal plastic"; the 500/700 series metal rows already exist (Surface Raceway). Plastic adhesive channel is sold in 5 ft lengths and kits.          |
| 1371                              | `Coax F connector`                                                                                   | MS8 (x2)                                                                 | **OK** name; pack **P2**                                                 | Compression RG6 connectors: Home Depot 10-packs **$9.75–$12.97**, also 50-packs.                                                                                     |
| 1365                              | `Cat6 RJ45 end`                                                                                      | MS9                                                                      | **OK** name; pack **P2**                                                 | Sold in jars or bags of 50 or 100.                                                                                                                                   |
| 1374, 1387, 1392–1395, 1410, 1417 | Coax, HDMI, keystone 1/2/4/6-port, speaker and thermostat wall plates                                | coax: MS8; HDMI: CK11, CK23; keystone 1-port: MS6, MS7, CW8; 2-port: CK9 | **OK** names; pack **P3**                                                | All box of 25 from the word "plate" (§ E).                                                                                                                           |
| 1388                              | `Hook-and-loop cable strap`                                                                          | —                                                                        | **OK** name; pack **P3**                                                 | Box of 25 from "strap"; sold in rolls and packs of 50 too.                                                                                                           |
| 1357, 1360, 1368                  | `Cat5e jack`, `Cat6 jack`, `Cat6A jack`                                                              | Cat6: 5 starters                                                         | **OK**                                                                   | Keystone jacks, sold each.                                                                                                                                           |
| 1361, 1362, 1363                  | `Cat6 patch cord, 3 ft` / `7 ft`, `Cat6 patch panel, 24-port`                                        | 3 ft: MS11 (x24); panel: MS11                                            | **OK**                                                                   |                                                                                                                                                                      |
| 1353–1355                         | `150W`, `300W`, `600W landscape transformer`                                                         | 300W: LT17                                                               | **OK**                                                                   | Sold by watts; multi-tap is standard.                                                                                                                                |
| 1372                              | `Coax ground block`                                                                                  | —                                                                        | **OK**                                                                   |                                                                                                                                                                      |
| 1380                              | `D-ring cable guide`                                                                                 | —                                                                        | **OK**                                                                   |                                                                                                                                                                      |
| 1381–1384, 1398, 1369             | Doorbell button, chime (wired, wireless), diode, lighted button, chime extender kit                  | button, wired chime: RS10                                                | **OK**                                                                   |                                                                                                                                                                      |
| 1415                              | `Telecom backboard, plywood 4x8`                                                                     | — (commercial row)                                                       | **OK**                                                                   | Fire-retardant 3/4" ply is in its search words; a description would say it (Q9).                                                                                     |

**Counts:** 18 decided (the cable rows), 31 OK, 14 need words, 6 owner
picks — 69. (OK includes the 11 rows whose name is fine and whose pack is
the question.)

## Packs

**P1 — `In-ceiling speaker` is `each` / 1, and speakers are sold in pairs.**
MS10 buys one speaker. If the owner types the pair price under `each` / 1,
every speaker prices double. Suggested: `pair` / 2 (Q2).

**P2 — F connectors and RJ45 ends are sold in packs.** `Coax F connector` is
a box of 25 from the word "connector" (§ E); the counter sells 10-packs and
50-packs. `Cat6 RJ45 end` is `each` / 1; it comes in 50s and 100s.
Suggested: `bag of 10` / 10 and `bag of 50` / 50 (Q13).

**P3 — eight wall plates and the strap are a box of 25 from words.** Low
voltage plates (keystone, HDMI, coax, speaker, thermostat) are sold each at
the counter. The keystone 1-port is in 3 starters and HDMI in 2. Suggested:
`each` / 1 for all eight plates; the strap waits for the pack pass (Q13).

## Search words and descriptions (not names)

**S1 — the cable jackets live only in search words.** Q1 puts them in a
description: "Riser (CMR)", "Plenum (CMP)", "Shielded (F/UTP), riser",
"Riser (CMR), 10G", and for the camera cable "Siamese: RG59 video + 18/2
power, for analog cameras".

**S2 — "patch panel" on `Patch panel blank`** stays only as a search word
once Q4 renames it, so "patch panel" leads with the real patch panels.

## Things that could price a bid wrong

**P1 — speakers priced as a pair under `each`** (above). MS10.

**P2 — racks, enclosures and panels with no size.** A 12U rack at
$183–$592 and a 28" enclosure at $60–$115 are lines where the next size is
a different price. Q3, Q4.

**P3 — "Landscape light fixture" covers four products.** LT18 prices one
light per starter; a path light and an in-grade well light are not the
same money. Q8.

## Common items that are MISSING

Searched the whole catalog first: `J-hook, 2"` (Strut & Supports),
`Low-voltage mounting bracket, 1-gang` (Boxes), `Doorbell transformer`,
`Landscape hub connector` and `Firestop caulk` already exist.

| #   | Item                             | Listing                  | Why it is needed                                                                                                                  | Search words                                 |
| --- | -------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| M1  | `Landscape spot light, LED, 12V` | Not priced on 2026-10-14 | The other common landscape light, if Q8 makes the existing row a path light.                                                      | "uplight", "bullet light", "flood", "mr16"   |
| M2  | `Surface mount data box, 1-port` | Not priced on 2026-10-14 | The "biscuit" jack box for a ceiling access point or a wall with no box. CW8 (ceiling AP) uses a mud ring and a wall plate today. | "biscuit", "surface jack", "smb"             |
| M3  | `Fiber connector, LC, multimode` | Not priced on 2026-10-14 | The fiber cable and patch panel exist, but nothing to terminate the strands.                                                      | "lc connector", "fiber end", "om4 connector" |
| M4  | `Firestop cable pathway, 2"`     | Not priced on 2026-10-14 | The re-enterable sleeve data cable passes through a rated wall in (EZ-Path type). Today only firestop caulk exists.               | "ez path", "firestop sleeve", "rated wall"   |

## Owner questions, with suggested answers

**Q1. Cable rows: put the jacket in a description, since the names are frozen?**
Suggested: **yes**: "Riser (CMR)" on Cat6 and Cat5e, "Plenum (CMP)" on
Cat6 plenum, "Shielded (F/UTP), riser" and "Riser (CMR), 10G" on the
others, and "Siamese: RG59 video + 18/2 power, for analog cameras" on the
camera cable. Riser and plenum differ in price, and the names stay as
frozen on 2026-10-07.

**Q2. Speakers: `In-ceiling speaker, 6.5"` sold as a `pair` / 2, and
`Speaker volume control, 100W, impedance-matching`?**
Suggested: **yes**. Speakers are sold in pairs, so `each` / 1 would price
MS10 double; 6.5" is the common size.

**Q3. Structured media enclosure: `Structured media enclosure, 28"`?**
Suggested: **yes**. 28" is the common house size; 14" and 42" are other
prices.

**Q4. Rack parts: name the size?**
Suggested: **yes**: `Network rack, wall mount, 12U swing gate`,
`Horizontal cable manager, 1U`, `Rack shelf, 1U cantilever`, `Rack blank
panel, 1U` and `Vertical cable manager, 7 ft`. Rack parts are sold by rack
units.

**Q5. Patch panels: `Cat5e patch panel, 24-port`, and the fiber panel as
`Fiber enclosure, 1U rack mount`?**
Suggested: **yes**, with the fiber adapter panel left to the shop. 24-port
matches the Cat6 panel; a fiber "patch panel" is an enclosure plus parts.

**Q6. Coax: `Coax splitter, 2-way` and `Coax distribution amplifier, 4-port`?**
Suggested: **yes**. Both are sold by number of outputs.

**Q7. Cameras: `Security camera, dome, IP PoE` and `Security camera,
bullet, IP PoE`?**
Suggested: **yes**. MS9 runs Cat6 to the dome, so it is a network
camera; analog cameras use the siamese cable row.

**Q8. Landscape light: make the row `Landscape path light, LED, 12V` and add M1 spot light?**
Suggested: **yes**, with LT18 staying on the path light. Today one row
stands for four different lights.

**Q9. Telecom room: `Telecom grounding busbar, 1/4" x 2" x 12"`, and
"Fire-retardant 3/4" plywood" as the backboard's description?**
Suggested: **yes**. The busbar is sold by length, and fire-retardant ply
is what the inspector looks for.

**Q10. Video doorbell: keep, with "Often supplied by the homeowner —
price it only if you furnish it"; power kit "Fits the doorbell's own
brand"?**
Suggested: **yes**. It's a branded smart product, and RS11 is mostly
the wiring.

**Q11. Keypad mounting plate and NVR enclosure: keep or retire?**
Suggested: **keep the keypad plate with "Fits the alarm's own brand";
retire the NVR enclosure** (hidden, never deleted). Nothing uses it and
it is not a counter item.

**Q12. `Surface raceway, low voltage`: `Surface raceway, low voltage,
adhesive-back, 1/2"`, sold as a `5 ft length` / 5?**
Suggested: **yes**, after A checks one listing. The metal 500/700 series
already have their own rows, so this one is the plastic stick-on channel.

**Q13. Packs: F connectors `bag of 10`, RJ45 ends `bag of 50`, the eight
low-voltage wall plates `each`?**
Suggested: **yes**, in the pack pass (`pack-label-scan.md` § E). The plates
are sold each, and the connectors come in counter packs.

**Q14. Add M1–M4 (spot light, surface mount data box, LC connector,
firestop pathway)?**
Suggested: **yes**, each unpriced like every row and priced from one
listing A checks. No starter edit proposed.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row. The cable rows are NOT renamed (Q1 is descriptions
  only), so `pricing/frozen-names.json` does not move.
- The NVR enclosure (if Q11 is yes) goes on `RETIRED_BASELINE_MATERIALS`.
- **Starter edits: none.** MS10, MS11, MS12, MS9 and LT18 follow their
  renamed rows by key. The pair pack (Q2) changes the label, not MS10's
  quantity of 1.
- The pack changes (P1–P3) go in the pack pass, before the owner types
  these prices.
- Run `scripts/searchSpotCheck.mts` for "cat6", "cat 6 plenum", "rg6",
  "f connector", "rj45", "keystone plate", "hdmi plate", "speaker",
  "smc", "network rack", "patch panel", "landscape light", "ring
  doorbell", "camera" and "thermostat wire". "patch panel" should lead with
  the real panels, not the blank.
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming or retiring it.

## Owner's answers — 2026-10-14: Q1–Q14 all YES, as suggested

For A's end-of-pricing job. Nothing applied here; no catalog row, seed or
starter changed.

1. **Q1 yes**: jacket descriptions on the cable rows ("Riser (CMR)",
   "Plenum (CMP)", "Shielded (F/UTP), riser", "Riser (CMR), 10G"; the
   camera cable "Siamese: RG59 video + 18/2 power, for analog cameras").
   Names stay as frozen; `frozen-names.json` does not move.
2. **Q2 yes**: `In-ceiling speaker, 6.5"`, pack `pair` / 2 (MS10 keeps qty
   1); `Speaker volume control, 100W, impedance-matching`.
3. **Q3 yes**: `Structured media enclosure, 28"` (MS12).
4. **Q4 yes**: `Network rack, wall mount, 12U swing gate` (MS11),
   `Horizontal cable manager, 1U` (MS11), `Rack shelf, 1U cantilever`,
   `Rack blank panel, 1U`, `Vertical cable manager, 7 ft`.
5. **Q5 yes**: `Cat5e patch panel, 24-port`; `Fiber enclosure, 1U rack
mount`.
6. **Q6 yes**: `Coax splitter, 2-way`; `Coax distribution amplifier,
4-port`.
7. **Q7 yes**: `Security camera, dome, IP PoE` (MS9); `Security camera,
bullet, IP PoE`.
8. **Q8 yes**: `Landscape path light, LED, 12V` (LT18 stays on it); M1 spot
   light added.
9. **Q9 yes**: `Telecom grounding busbar, 1/4" x 2" x 12"`; backboard
   description "Fire-retardant 3/4" plywood".
10. **Q10 yes**: video doorbell kept, description "Often supplied by the
    homeowner — price it only if you furnish it"; power kit "Fits the
    doorbell's own brand".
11. **Q11 yes**: keypad plate kept with "Fits the alarm's own brand"; NVR
    enclosure retired (`RETIRED_BASELINE_MATERIALS`, hidden, never deleted).
12. **Q12 yes**: `Surface raceway, low voltage, adhesive-back, 1/2"`, pack
    `5 ft length` / 5, after A checks one listing.
13. **Q13 yes**: `Coax F connector` `bag of 10` / 10; `Cat6 RJ45 end` `bag
of 50` / 50; the eight low-voltage wall plates `each` / 1. In the pack
    pass.
14. **Q14 yes**: M1–M4 added (spot light, surface mount data box, LC
    connector, firestop pathway). Their prices follow the owner's
    2026-10-14 source rule — `new-rows-source-check.md`.

**Starter edits: none.**

## Source rule for the new rows (owner, 2026-10-14)

The new rows this review proposed are checked in
`pricing/new-rows-source-check.md`. **That file, not the "Listing" column
above, decides each new row's price:** COMMON (found at Home Depot, Platt
or Stoneway) takes its Example price from those three only; SPECIALTY is
still added, with the price blank and "Specialty - price from your
supplier." Listings above from other sites are comparison only.
