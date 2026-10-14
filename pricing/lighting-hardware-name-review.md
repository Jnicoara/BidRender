# Lighting Hardware — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Lighting Hardware" shelf of `starter-catalog-pricing.xlsx` ("Starter
prices", spreadsheet rows **1149–1307**, 159 rows, in the app-order sort),
the question is whether one real product can be priced at Platt or Home
Depot from the name alone. The workbook was read from a fresh copy (the
worktree's copy, byte for byte the same as `C:\dev\BidPhase\pricing`),
because the owner has it open. It is the shelf after Breakers
(`breakers-name-review.md`); Grounding & Bonding starts at row 1308.

The sheet's 159 names match `BASELINE_MATERIALS`' Lighting Hardware rows one
for one (read from the seed the same day), so the search words quoted below
are the catalog's own.

**The test.** A fixture is priced by its size or length and, for commercial
and outdoor fixtures, its **wattage class** (a 150W and a 240W high bay are
different prices). A lamp is priced by its base and wattage; a trim by its
size and the can it fits; site lighting by the pole's height, shaft and
gauge. Brand is not a property here (CLAUDE.md § Brands: generic everywhere
except panels and breakers).

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**;
**Decided**, where an earlier decision settled it.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
**58 of the 159 rows are used** (the sheet's "Used by" column says the
same). **No run type uses this shelf.**

**Sources.** Listings checked on 2026-10-14: UFO high bays (homelectrical
GlobaLux and CyberTech, ledlightingsupply), shoebox area lights
(ledlightingsupply, Revolve LED), 3/4" × 30" anchor bolt sets (Crescent
Hubbell TAB-30-M38, homelectrical Keystone KT-ABOLT-4SQ-K1), 30 ft 5" 11 ga
square poles (homelectrical EnVision, West Durable, ledlightingsupply), 3/8"
14/3 fixture whips (Steiner, Southwire at Ace, Anaconda/Electri-Flex). Prices
only show how big a question is; they are not proposed prices.

**Already decided, and not reopened here:**

- **Every wafer, canless, CCT-disc and LED retrofit trim size is its own
  row** (owner, 2026-10-07, and again 2026-10-09 in
  `references/catalog-reality-check-build.md`, "TWO LINES NOT APPLIED"). The
  5" wafers stay; the 5" and 6" discs and retrofit trims stay separate.
- **Batch 2 of the catalog reality check** (owner, 2026-10-09,
  `references/catalog-reality-check.md`): the 3" recessed cans, the 2" and
  8" gimbal wafers, the slim and wet-rated wafers and the 3/4/5" sloped cans
  were retired; their old names are search words on the kept rows (that is
  why "gimbal" and "wet rated" sit on the plain wafers). It also left one
  line open: **"high bay, area light, wall pack, flood light … carry no
  wattage — not a rename yet."** Q2 is that line.
- **`Tape light channel` → `Tape light channel, 1 m (3.3 ft)`, sold each**
  (owner, 2026-10-13, `pack-label-scan.md` "Owner's answers"). **`LED tape
light`'s label → `per foot (from 16.4 ft reel)`** (same answers).
- **Brands:** generic. "halo", "juno", "lithonia", "rab", "philips cree
  feit" are search words only.

## Existing rows

### Recessed: housings, lamp trims, LED retrofit trims

| Row                                                              | Current name                                                                                                    | Used by                                                                    | Verdict                                                | Why                                                                                                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1262–1274                                                        | `{4,5,6}" recessed can, new construction \| remodel, IC \| non-IC`; 6" shallow IC airtight; 6" sloped (13 rows) | 4" NC IC: LT5, LT9. 6" NC IC: LT4. 4" remodel IC: LT33. 6" remodel IC: LT6 | OK                                                     | Size, new/remodel, IC: the three things a housing is bought by. Checked in batch 2 (Halo H5ICAT, H47ICAT; Juno IC928).                                                                   |
| 1150–1152, 1181–1183, 1189–1191, 1253–1255, 1276–1278, 1281–1283 | `{4,5,6}" baffle \| eyeball \| gimbal \| open \| reflector \| shower wet-rated trim` (18 rows)                  | 4" shower: LT9                                                             | OK (+ description, Q6)                                 | Size and style. A lamp trim needs a bulb and fits the same maker's can series; Q6 says so.                                                                                               |
| 1149, 1180, 1188, 1252, 1275, 1280                               | `3" {baffle, eyeball, gimbal, open, reflector, shower wet-rated} trim` (6 rows)                                 | —                                                                          | **Owner pick** (Q5)                                    | **The 3" cans these fit were retired on 2026-10-09** (no Halo or Juno 3" line-voltage housing). A 3" lamp trim now has no can on the shelf to go in; 3" LED is covered by the 3" wafers. |
| 1220–1222                                                        | `{4,5,6}" LED retrofit trim`                                                                                    | 4": LT5, LT33. 6": LT4, LT6, DR20                                          | **Decided** (sizes kept)                               | Owner, 2026-10-07/09.                                                                                                                                                                    |
| 1261                                                             | `Recessed can conversion kit`                                                                                   | —                                                                          | **Needs words**: `Recessed can pendant conversion kit` | Its search words ("pendant adapter screw in") say what it is: the kit that hangs a pendant from a can. "Conversion" alone also reads as an LED retrofit, which is row 1220–1222.         |

### Canless wafers and disc lights

| Row       | Current name                                                                                                | Used by                                   | Verdict                  | Why                                               |
| --------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------ | ------------------------------------------------- |
| 1154–1169 | `{2,3,4,5,6,8}" canless wafer LED downlight`, the same `, CCT selectable`, `{3,4,5,6}" …, gimbal` (16 rows) | 2": LT31. 4": LT8. 6": LT7, CK4. 8": LT32 | **Decided** (sizes kept) | Owner, 2026-10-07/09. See S1 for one search word. |
| 1206–1212 | `{4,5,6}" LED disc light`, `{4,5,6,7}" …, CCT selectable` (7 rows)                                          | —                                         | **Decided** (sizes kept) | Same.                                             |

### Linear and troffers

| Row                             | Current name                                                                              | Used by                                                                     | Verdict                                          | Why                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1227–1229, 1243–1244, 1303–1304 | `{2,4,8} ft LED strip fixture`, `{4,8} ft LED wraparound`, `{4,8} ft vapor tight fixture` | 4 ft strip: LT22. 8 ft strip: LT23. 4 ft wrap: LT24. 4 ft vapor tight: LT25 | OK (+ description, Q3)                           | Length and type are what the counter asks. Standard-output is the shelf item; a high-output one is a different price, which Q3 puts in the description.      |
| 1236–1238                       | `1x4`, `2x2`, `2x4 LED troffer`                                                           | 1x4: LT21. 2x2: LT20. 2x4: LT19, DR6                                        | OK (+ description, Q3)                           | Same.                                                                                                                                                        |
| 1239                            | `LED troffer retrofit kit`                                                                | DR7                                                                         | **Needs words**: `LED troffer retrofit kit, 2x4` | Kits are sold per size (2x2, 2x4, 1x4); DR7 retrofits the common 2x4. Renamed in place, DR7 moves with it. "2x2" stays a search word until a 2x2 row exists. |

### Lamps and tubes

| Row                              | Current name                                                                                                                                                  | Used by                                | Verdict             | Why                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1196–1201, 1204, 1213, 1215–1217 | `LED A19 bulb, 60W equivalent`, `A21, 100W equivalent`, `BR30`, `BR40`, `candelabra, E12`, `corn bulb, E39, 100W`, `G25`, `PAR20`, `PAR30`, `PAR38` (10 rows) | PAR20: LT9. Corn E39: DR12             | OK                  | Shape and base name one shelf item each. The E39 corn bulb gained its wattage on 2026-10-09.                                                                                  |
| 1203                             | `LED corn bulb, E26`                                                                                                                                          | —                                      | **Owner pick** (Q9) | The E39 row names its wattage; this one does not, and E26 corn bulbs run from small to large wattages at very different prices. Batch 2 called it OK on trade knowledge only. |
| 1219                             | `LED PL-pin lamp, G24`                                                                                                                                        | —                                      | **Owner pick** (Q9) | G24d (2-pin, magnetic ballast) and G24q (4-pin, electronic ballast) do not interchange, and a ballast-compatible lamp is not a bypass lamp. Pack: P1.                         |
| 1230–1233                        | `{2,4} ft LED T8 tube, ballast bypass \| ballast compatible`                                                                                                  | 4 ft bypass: DR8. 4 ft compatible: DR9 | OK                  | Type A vs type B is in the name, which is the thing people get wrong.                                                                                                         |
| 1240–1241                        | `8 ft LED tube, FA8 single-pin, ballast bypass`, `8 ft LED tube, R17d HO, ballast bypass`                                                                     | DR10, DR11                             | OK (FA8 pack: P1)   | Renamed 2026-10-09 to the counter words.                                                                                                                                      |
| 1250                             | `Non-shunted lampholder`                                                                                                                                      | DR8                                    | OK                  | G13 tombstone for a bypass tube.                                                                                                                                              |

### Residential decorative fixtures

| Row                                                       | Current name                                                                                                                                                                                                                              | Used by                                                                                                                  | Verdict             | Why                                                                                                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1170, 1171, 1214, 1218, 1226, 1242, 1279, 1287, 1298–1302 | `Ceiling fan`, `Chandelier`, `LED mirror light`, `LED pendant fixture`, `LED step light`, `LED wall sconce`, `Semi-flush ceiling fixture`, `Surface-mount ceiling fixture`, `Vanity light bar`, `Vanity light, {1,2,3,4}-light` (13 rows) | Fan: LT2, LT3. Chandelier: LT11. Pendant: LT10, CK25. Sconce: LT13, LT15. Surface-mount: LT1, CK17. 3-light vanity: LT12 | **Owner pick** (Q4) | Real products, but the customer's choice sets the price, from a builder-grade fixture to many times that. No name can make one of these a single product; a description can say what the shipped price stands for. |

### Commercial and outdoor fixtures

| Row                         | Current name                                                                                                                 | Used by                 | Verdict                                         | Why                                                                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1192                        | `High bay`                                                                                                                   | LT26, DR13              | **Needs words** (Q2): `High bay, LED UFO, 150W` | GlobaLux 150W **$122.99** vs 240W **$229.99**; CyberTech 150W **$184.23** vs 240W **$232.54** (homelectrical). 150W is the common replacement for a 250–400W metal-halide bay. Renamed in place, both starters move with it. |
| 1198                        | `LED area light`                                                                                                             | GC3                     | **Needs words** (Q2): `LED area light, 150W`    | 150W shoebox **$179.95–$247.28**, 300W **$329.95–$349.95** (Revolve LED, ledlightingsupply).                                                                                                                                 |
| 1187, 1202, 1205, 1305–1307 | `Flood light`, `LED canopy light`, `LED cylinder downlight`, `Wall pack, full cutoff`, `Wall pack, large`, `Wall pack, mini` | Full cutoff: LT29, DR14 | **Owner pick** (Q2)                             | Same gap, not priced on 2026-10-14. A names the common wattage from one listing each before pricing.                                                                                                                         |
| 1153, 1174                  | `Bollard light`, `Dock light, swing arm`                                                                                     | Bollard: CW9            | OK                                              | One common product each.                                                                                                                                                                                                     |
| 1223–1225                   | `LED security light, dusk-to-dawn`, `…, motion-activated, {2,3}-head`                                                        | 2-head: LT16            | OK                                              | Residential shelf items, named by what they do.                                                                                                                                                                              |

### Emergency, exit and controls

| Row                    | Current name                                                                              | Used by        | Verdict                                                      | Why                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1175, 1176, 1178, 1179 | `Emergency battery backup pack`, `Emergency light`, `Exit sign`, `Exit sign, double face` | GC1, CK1, LT27 | OK                                                           | The battery pack already has its description.                                                                                                                             |
| 1177                   | `Emergency light remote head`                                                             | GC4            | **Needs words** (Q13): `Emergency light remote head, single` | Remote heads are sold single or twin. And a remote head runs only from an emergency unit with remote capacity, which GC4 does not price (P4), so the description says so. |
| 1173, 1251             | `Daylight sensor`, `Occupancy sensor, high bay`                                           | Daylight: CK10 | OK                                                           |                                                                                                                                                                           |

### Track, tape and under-cabinet

| Row                  | Current name                                                                                               | Used by                               | Verdict                                    | Why                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1245–1247, 1291–1293 | `{4,6,8} ft lighting track`, `Track light connector, straight`, `Track light end feed`, `Track light head` | 8 ft track, end feed, head (x4): LT30 | OK (+ description, Q7; connector pack: P1) | Named the way the counter sells them. Track comes in three systems (H, J, L) that do not mix; Q7 says so in the description. |
| 1234, 1235           | `LED tape light`, `LED tape light power supply`                                                            | —                                     | **Owner pick** (Q8)                        | Tape is 12V or 24V and its supply must match; neither name says which, and the supply has no wattage.                        |
| 1288                 | `Tape light channel`                                                                                       | —                                     | **Decided**                                | → `Tape light channel, 1 m (3.3 ft)`, sold each (owner, 2026-10-13).                                                         |
| 1294–1297            | `{12,18,24,36}" under-cabinet light bar`                                                                   | 24": LT14                             | OK                                         | Rigid bar, sold per unit (its description).                                                                                  |

### Site lighting and poles

| Row                          | Current name                                                                                                                | Used by              | Verdict                                                             | Why                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1285, 1286                   | `{12,20} ft square steel light pole, 4" 11 ga`                                                                              | 20 ft: GC3           | OK                                                                  | Height, shaft and gauge: the pattern batch 1 set.                                                                                                                                                                                 |
| 1284                         | `30 ft square steel light pole`                                                                                             | —                    | **Needs words**: `30 ft square steel light pole, 5" 11 ga`          | Batch 1 said "the 12 and 30 ft poles alike"; the 30 ft was missed. 5" 11 ga with anchor base: EnVision **$1,569.23**, West Durable **$1,389.00**, ledlightingsupply **$1,318.00**. A 7 ga is a different price (MaxLite, $1,995). |
| 1256                         | `Pole anchor bolt kit`                                                                                                      | GC3, CW2, CW9        | **Needs words** (Q10): `Pole anchor bolt kit, 3/4" x 30", set of 4` | A set of four bolts with hardware, sized to the pole: 3/4" × 30" sets **$97.04–$140.70** (Crescent), Keystone **$107.07** "for 25-ft and under poles". **Pack is wrong: P1.**                                                     |
| 1257                         | `Pole base cover`                                                                                                           | GC3                  | **Needs words**: `Pole base cover, 4" square pole`                  | A base cover is sized to the shaft; GC3's pole is 4". A 5" pole is a new row if wanted.                                                                                                                                           |
| 1172                         | `Concrete pole base`                                                                                                        | GC3, CW2, CW9        | **Owner pick** (Q11)                                                | Batch 1: "precast exists; cast-in-place more common; engineered per pole". Three starters of very different weight share it (P3).                                                                                                 |
| 1249, 1258, 1259, 1260, 1290 | `Non-shrink grout, 50 lb bag`, `Pole base in-line fuse holder`, `Pole handhole cover`, `Pole mounting arm`, `Tenon adapter` | Grout, handhole: GC3 | OK                                                                  | Renamed or checked 2026-10-09.                                                                                                                                                                                                    |
| 1193–1195                    | `In-ground splice box`, `Landscape hub connector`, `Landscape light stake`                                                  | Hub: LT18            | OK (hub pack: P1)                                                   | Landscape parts; the fixture and transformers are on Low Voltage.                                                                                                                                                                 |

### Hanging and whips

| Row        | Current name                                                      | Used by                                | Verdict              | Why                                                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------- | -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1186       | `6 ft fixture whip, 3/8" MC, 14/3`                                | LT19, LT20, LT21, LT22, LT25, DR5, CK4 | OK                   | Renamed 2026-10-09; Southwire 55082415, Steiner FW-38-14/3.                                                                                                                                                                                                        |
| 1248       | `8 ft MC whip, 14/3`                                              | LT23, LT26                             | **Owner pick** (Q12) | **No 8 ft prefab whip found on 2026-10-14**: every 3/8" 14/3 listing (Steiner, Southwire at Ace, Anaconda) is 6 ft, which batch 1 also found. The NEC keeps a 3/8" flex fixture tap to 6 ft (348.20(A)(2)(c)), which is why. A row nobody stocks cannot be priced. |
| 1184, 1185 | `Fixture hanging kit, aircraft cable`, `Fixture mounting bracket` | Hanging kit (x2): LT23. Bracket: LT1   | OK                   | One common kit and one crossbar.                                                                                                                                                                                                                                   |
| 1289       | `Temporary light string, 100 ft`                                  | MS14                                   | OK                   | Bergen 100 ft (batch 1).                                                                                                                                                                                                                                           |

**Totals, by row: 159.**

| Verdict     | Rows                                                                                                                                                                                                                                    | Count  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| OK          | every row not listed below                                                                                                                                                                                                              | **93** |
| Decided     | 1154–1169, 1206–1212, 1220–1222, 1288                                                                                                                                                                                                   | **27** |
| Needs words | 1177, 1192, 1198, 1239, 1256, 1257, 1261, 1284                                                                                                                                                                                          | **8**  |
| Owner pick  | 1149, 1180, 1188, 1252, 1275, 1280 (3" trims); 1170, 1171, 1214, 1218, 1226, 1242, 1279, 1287, 1298–1302 (decorative); 1187, 1202, 1205, 1305–1307 (wattage); 1203, 1219 (lamps); 1234, 1235 (tape); 1172 (pole base); 1248 (8 ft whip) | **31** |

93 + 27 + 8 + 31 = **159**. If a recount of the sheet gives another total,
stop and find out why: either the shelf moved (new rows sort in) or this
table is stale.

## Packs

**P1 — five rows carry a box pack that the item is not sold in, all from one
cause.** The sheet's pack rule (`packFor`, `pricing/starterSheetLayout.ts`
lines 448 and 459, ported from `writeWorkbook.cjs`) gives "box of 100" to any
name containing "anchor" or "pin", and "box of 25" to any containing
"connector". These five match by accident:

| Row  | Name                                            | Pack now         | Real pack                                                              | Effect if the owner types the shelf price           |
| ---- | ----------------------------------------------- | ---------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| 1256 | `Pole anchor bolt kit`                          | box of 100 / 100 | **each** (one set of 4 bolts, $97–$141)                                | **A $107 set prices at $1.07** in GC3, CW2 and CW9. |
| 1240 | `8 ft LED tube, FA8 single-pin, ballast bypass` | box of 100 / 100 | each, unless A finds a case size in a listing (not checked 2026-10-14) | DR10's two tubes price at 1/100 of what was typed.  |
| 1219 | `LED PL-pin lamp, G24`                          | box of 100 / 100 | each                                                                   | Same.                                               |
| 1291 | `Track light connector, straight`               | box of 25 / 25   | each                                                                   | Same, at 1/25.                                      |
| 1194 | `Landscape hub connector`                       | box of 25 / 25   | each (the listing in batch 1 is a small kit)                           | LT18's hub at 1/25.                                 |

**The same rule, on later shelves** (not reviewed here, listed so they are
not lost): `Furniture feed connector` (row 1666, Distribution Equipment) and
`Strut wing connector` (1557) are box of 25, and are normally sold each.
`2" SE cable connector` (1494) is box of 25 too; its own shelf review decides.

**The fix is two parts and both are needed:** each row's pack in the sheet,
and the rule, so a regenerated sheet does not put them back (for example an
`each` list checked before the word rules, or word boundaries that do not
match "single-pin" and "PL-pin").

## Search words and descriptions (not names)

**S1 — "retrofit trim" is a search word on all 16 canless wafers.** It is the
name of another material (`{4,5,6}" LED retrofit trim`), which CLAUDE.md's
alias rule forbids, and a search for "6 retrofit trim" can rank a wafer
beside the trim it names. Suggested: drop "retrofit trim" from the wafers
(keep "retrofit", which is how a wafer is sold for existing ceilings).

**S2 — "can" on the wafers and BR30/BR40 lamps** ("recessed can") is right:
people search a wafer as a can light, and the name already says "canless".
No change.

## Things that could price a bid wrong

**P1 — packs** (above). The anchor bolt kit is the big one: three starters,
and a set of four 30-inch bolts priced at about a dollar.

**P2 — a fixture with no wattage.** `High bay` and `LED area light` carry
the whole fixture price of LT26, DR13 and GC3, and the same name covers a
$123 and a $230 high bay. Q2.

**P3 — three different footings are one row.** GC3 (a 20 ft pole), CW9 (a
bollard) and CW2 (an EV charger pedestal) each price one `Concrete pole
base` and one `Pole anchor bolt kit`. A 20 ft pole's footing and 3/4" × 30"
bolts are much bigger than a bollard's, so either the bollard and pedestal
are priced high or the pole is priced low. Q11.

**P4 — GC4 prices a remote head with nothing to run it.** A remote head is
fed by an emergency unit with remote capacity. GC4 assumes one is already
on the job; the description should say so, so nobody prices the head as if
it lights itself. Q13. No starter edit proposed.

## Common items that are MISSING

Searched the whole catalog first: `Photocell` (Switches), `Emergency exit
light combo` (Life Safety), `Landscape light fixture` and the landscape
transformers (Low Voltage), `30A 8-pole lighting contactor` (Distribution
Equipment) and `T-grid fixture clip` (Strut & Supports) already exist.

| #   | Item                                       | Listing                                                                                     | Why it is needed                                                                                                                  | Search words                                 |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| M1  | `Pole anchor bolt kit, 1" x 36", set of 4` | Not priced on 2026-10-14; the 3/4" × 30" set is sold "for 25-ft and under poles" (Keystone) | The 30 ft pole (row 1284) needs the bigger bolts; with only the 3/4" kit on the shelf, a 30 ft pole is priced on the wrong bolts. | "anchor bolts", "j bolt", "30 ft pole bolts" |

## Owner questions, with suggested answers

**Q1. Do the missing words go in the NAME or the DESCRIPTION?**
Suggested: **names**, as for every shelf so far, each old name kept as a
search word on its row.

**Q2. High bays, area lights, floods, wall packs, canopy and cylinder lights: name a wattage?**
Suggested: **yes.** `High bay, LED UFO, 150W` and `LED area light, 150W` now
(listings above); for the other six, A names the common wattage from one
listing each before pricing. This closes the line batch 2 left open. A
different wattage is a new row if wanted.

**Q3. Strips, wraparounds, vapor tights and troffers: name a lumen package?**
Suggested: **no — a description instead**: "Standard output. A high-output
or emergency-battery version is a different price." The length is what the
counter asks first.

**Q4. Decorative fixtures (fan, chandelier, pendant, sconce, vanities, …): what does the shipped price stand for?**
Suggested: **a builder-grade example, said in the description**: "Builder-
grade example. The customer's choice sets the real price." No name can make
these one product.

**Q5. The six 3" lamp trims: retire them?**
Suggested: **yes, retire (hidden, never deleted).** Their cans were retired
on 2026-10-09, no starter uses them, and 3" LED is covered by the 3"
wafers.

**Q6. Lamp trims: add a fit description?**
Suggested: **yes**: "For a lamp can of the same size and maker's series;
takes a bulb. An LED retrofit trim needs neither."

**Q7. Track rows: say the systems don't mix?**
Suggested: **yes**, on the 6 track rows: "Match H, J or L track across the
rail, heads, feeds and connectors."

**Q8. Tape light: name the voltage?**
Suggested: **yes, 24V**: `LED tape light, 24V` and `LED tape light power
supply, 24V`, with A naming the common wattage from one listing. Tape and
supply must match, and 24V runs longer before it dims.

**Q9. `LED corn bulb, E26` and `LED PL-pin lamp, G24`: name the missing words?**
Suggested: **yes**: A names the corn bulb's common wattage from one listing,
and the PL lamp → `LED PL lamp, G24q 4-pin, ballast bypass`. G24q is the
electronic-ballast base most commercial downlights use, and a bypass lamp
cannot be swapped for a compatible one.

**Q10. Pole anchor bolts: name the size, fix the pack, add the 1" set?**
Suggested: **yes**: `Pole anchor bolt kit, 3/4" x 30", set of 4`, sold
**each**; add M1 for the 30 ft pole. The pack is the urgent half: as it
stands a $107 set prices at about $1.

**Q11. The pole base and bolts under a bollard and an EV pedestal (CW9, CW2)?**
Suggested: **no starter edit yet; A checks one bollard and one pedestal
listing for what anchor hardware ships with them**, then proposes the
change for a yes. Today both are priced on a 20 ft pole's footing.

**Q12. `8 ft MC whip, 14/3`: nobody stocks it — what do LT23 and LT26 use?**
Suggested: **move LT23 and LT26 to the 6 ft fixture whip, and retire the 8
ft row** (hidden, never deleted). A longer run is MC cable from the box,
priced by the foot. That is two starter edits, for a yes.

**Q13. Remote head: name it single, and say what feeds it?**
Suggested: **yes**: `Emergency light remote head, single`, with "Runs from
an emergency unit with remote capacity — price that unit if the job does
not already have one." GC4 stays as it is.

**Q14. Drop "retrofit trim" from the wafers' search words (S1)?**
Suggested: **yes**. It is another material's name.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row; new rows (M1) are new seed rows. Retirements go through
  `RETIRED_BASELINE_MATERIALS`.
- **Starter edits: none, unless Q12 is yes** (LT23 and LT26 to the 6 ft
  whip). Starters name parts by KEY (`starterParts.ts`), so the renames move
  no starter; LT26, DR13, GC3, GC4, DR7 and the GC3/CW2/CW9 trio follow
  their renamed rows.
- **Packs (P1):** fix the five rows AND the rule in `packFor`, then rebuild
  the sheet and confirm the five read `each` — a fix to one without the
  other comes back on the next regeneration.
- Run `scripts/searchSpotCheck.mts` for "high bay", "ufo", "150w high bay",
  "area light", "shoebox", "wall pack", "6 retrofit trim", "6 wafer",
  "anchor bolts", "pole base", "tape light", "track head", "pl lamp", "g24",
  "corn bulb", "remote head" and "fixture whip". "6 retrofit trim" must lead
  with the trim, not a wafer.
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming or retiring it.
