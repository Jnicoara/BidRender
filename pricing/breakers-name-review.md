# Breakers — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the
"Breakers" shelf of `starter-catalog-pricing.xlsx` ("Starter prices",
spreadsheet rows **1068–1148**, 81 rows, in the app-order sort), the question
is whether one real product can be priced at Platt or Home Depot from the
name alone. The workbook was read from a fresh copy (the worktree's copy, byte
for byte the same as `C:\dev\BidPhase\pricing`), because the owner has it
open. It is the shelf after Panels (`panels-name-review.md`); Lighting
Hardware starts at row 1149.

The sheet's 81 names match `BASELINE_MATERIALS`' Breakers rows one for one
(read from the seed the same day), so the search words quoted below are the
catalog's own. No Breakers row carries a description today.

**The test** uses the properties a supply house names a breaker by: amps,
pole count, type (standard, AFCI, GFCI, dual function, shunt trip), format
(full-size, half-size, tandem, quad), and **how it mounts** (plug-on into a
load center, bolt-on into a panelboard, or a molded-case frame breaker above
100A). Brand family (QO, Homeline, BR, Siemens QP) also decides fit, and that
waits for the brand-variants pass.

**Verdicts:** **OK**; **Needs words**, with the exact words; **Owner pick**;
**Decided**, where an earlier decision settled it.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`).
18 of the 81 rows are used. **No run type uses this shelf.**

**Sources.** Listings checked on 2026-10-14: Square D QOB120 (SupplyHouse,
Standard Electric Supply, JRL), QO3100 (SupplyHouse, Zoro, JRL), HOM2125 and
HOM2200 (Crescent, RSP Supply), QDL32200RP (superbreakers.com), Eaton
HFD3200 (electricalpowerandcontrol.com), Eaton BR250B (Elliott, Crescent),
Schneider's QO dual-function page, Border States' QO shunt-trip pages. Prices
only show how big a question is; they are not proposed prices.

**Already decided, and not reopened here:**

- **"1-Pole" naming** (owner, 2026-10-05; applied 2026-10-07): breakers say
  `1-Pole`, with single-pole / 1P / SP as search words. Every row here
  follows it.
- **Keep the "half-size" names** (owner, frozen rule for this review).
- **Brand rows wait for the brand-variants pass** (CLAUDE.md § Brands;
  `parentId` does not exist yet). Every row here is a generic parent. Plug-on
  neutral vs pigtail on AFCI/GFCI is a brand-family property, and waits too.

## Existing rows

### Half-size and tandem (1068–1079)

| Row                    | Current name                                      | Used by     | Verdict              | Why                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------- | ----------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1068–1070              | `{15,20,30}A 1-Pole half-size breaker`            | —           | **Decided** (frozen) | Name kept. **No 1/2-inch breaker was found in a US listing on 2026-10-14** — Eaton BR and CL are 1-inch. Q4 adds a description so nobody prices a full-size breaker from this row. |
| 1073–1077              | `{15,20,30,40,50}A 2-Pole half-size breaker`      | —           | **Decided** (frozen) | Same. The 40A and 50A 2-pole half-size were not found in any listing; Q4.                                                                                                          |
| 1071, 1072, 1078, 1079 | `15/15`, `15/20`, `20/20`, `30/30 tandem breaker` | 20/20: CK26 | OK                   | The trade's own spelling, and every brand sells these four. Fits only panels or slots rated for tandems; Q5 says so in the description.                                            |

### 1-pole (1080–1094)

| Row       | Current name                                | Used by                                                                                                      | Verdict | Why                                                                                    |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------- |
| 1080–1087 | `{15,20,25,30,35,40,45,50}A 1-Pole breaker` | 15A: MH2. **20A: DV3, PG1 (x10), DV23, DV24, CS1, CS3, CS4, CS5, CS6, PG7, GC5, GR7, CK5, CK18, CK21, CK22** | OK      | Amps and poles; QO115–QO150 are all stocked sizes. See P1 (plug-on vs bolt-on) and S1. |
| 1088–1089 | `{15,20}A 1-Pole AFCI breaker`              | 20A: GR6                                                                                                     | OK      | Combination AFCI is the only kind sold now.                                            |
| 1090–1092 | `{15,20,30}A 1-Pole GFCI breaker`           | 20A: RS17                                                                                                    | OK      |                                                                                        |
| 1093–1094 | `{15,20}A 1-Pole AFCI/GFCI combo breaker`   | 20A: RS4, RS5, PG9, CK24                                                                                     | OK      | Schneider calls it "dual function"; that is already a search word.                     |

### 2-pole (1095–1126)

| Row       | Current name                                           | Used by                                                                                                                                                                                                           | Verdict                | Why                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1095–1098 | `{125,150,175,200}A 2-Pole branch breaker`             | —                                                                                                                                                                                                                 | OK                     | Real plug-on parts: HOM2125 **$429.98**, HOM2200 **$470.76** (Crescent).                                                                                                                            |
| 1099–1112 | `{15…110}A 2-Pole breaker` (14 rows)                   | **20A: PG1 (x2), RS19, PG10, MH4, MH8, CK6, CK13, CK14, CW1. 30A: RS2, RS3, RS16, RS18, CS7, CS8, PG8, MH1, MH12, CK3, CW6, CW14.** 40A: MH13 (x2), CK20, CW2. 50A: RS1, GR4, CW7. 60A: RS12, RS14, PG5, MH3, GR5 | OK                     | Eaton BR250B 50A 2-pole **$28–$35** (Elliott, Crescent). See P1.                                                                                                                                    |
| 1113–1116 | `{100,125,150,200}A 2-Pole main breaker, back-fed kit` | —                                                                                                                                                                                                                 | OK (+ description, Q6) | A real kit: Square D sells the back-fed main with its hold-down (HOM2200BB, **$468.42**, Building Controls). The description should say the hold-down is included, so nobody adds row 1145 as well. |
| 1117–1118 | `{15,20}A 2-Pole quad breaker (two 2-pole circuits)`   | —                                                                                                                                                                                                                 | OK                     | The bracket says what a quad is, which is the thing people get wrong.                                                                                                                               |
| 1119      | `30A 2-Pole shunt-trip breaker`                        | CS15                                                                                                                                                                                                              | OK (+ description, Q8) | QO shunt-trip breakers are stocked in 2- and 3-pole (Border States). The coil voltage has to match the hood system.                                                                                 |
| 1120      | `20A 2-Pole AFCI breaker`                              | —                                                                                                                                                                                                                 | OK                     | For a multiwire bedroom circuit.                                                                                                                                                                    |
| 1121–1125 | `{20,30,40,50,60}A 2-Pole GFCI breaker`                | 20A: RS15. 50A: RS13                                                                                                                                                                                              | OK                     |                                                                                                                                                                                                     |
| 1126      | `20A 2-Pole AFCI/GFCI combo breaker`                   | —                                                                                                                                                                                                                 | OK                     | Schneider's QO dual-function line comes in 1- and 2-pole, 15–20A.                                                                                                                                   |

### 3-pole (1127–1143)

| Row       | Current name                         | Used by                                           | Verdict                                                           | Why                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1127–1139 | `{15…100}A 3-Pole breaker` (13 rows) | 30A: PG18, MH7, MH10, MH11. 70A: PG16. 100A: PG15 | OK                                                                | Plug-on 3-pole breakers go up to 100A: QO3100 **$135.09** (SupplyHouse) to **$174.95**. See P1.                                                                                                                                                                        |
| 1140–1142 | `{125,150,200}A 3-Pole breaker`      | —                                                 | **Needs words** (Q3): `{125,150,200}A 3-Pole molded-case breaker` | **No plug-on 3-pole breaker above 100A was found** (no QO3200). At these sizes it is a frame breaker bolted into a panelboard: Square D QDL32200RP, refurbished, **$474.99**; Eaton HFD3200 **$525**. Priced like a $150 plug-on, it is several hundred dollars short. |
| 1143      | `30A 3-Pole shunt-trip breaker`      | —                                                 | OK (+ description, Q8)                                            | Same as 1119.                                                                                                                                                                                                                                                          |

### Accessories (1144–1148)

| Row  | Current name                            | Used by       | Verdict             | Why                                                                                                                                                                     |
| ---- | --------------------------------------- | ------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1144 | `Breaker handle tie`                    | —             | **Owner pick** (Q7) | Fits one breaker family. Generic, like the panel parts (Panels Q8).                                                                                                     |
| 1145 | `Breaker hold-down kit`                 | —             | **Owner pick** (Q7) | Fits one panel family. Q6: not needed with a back-fed main kit (1113–1116).                                                                                             |
| 1146 | `Breaker lock-off`                      | RS3, CK3, CK5 | **Owner pick** (Q7) | A lock-off that fits QO does not fit BR. Used by three starters, so the description matters.                                                                            |
| 1147 | `Breaker-style surge protective device` | —             | **Owner pick** (Q7) | Plugs into one family's slots. `Panel-mount surge protective device, Type 2` (Distribution Equipment, PG18) and `Whole-house surge protector` (PG10) are the other two. |
| 1148 | `Sub-feed breaker kit`                  | —             | **Owner pick** (Q7) | Fits one panel family. `Feed-through lug kit` (Panels) is a different part.                                                                                             |

**Totals, by row: 81.**

| Verdict     | Rows                        | Count  |
| ----------- | --------------------------- | ------ |
| OK          | 1071, 1072, 1078–1139, 1143 | **65** |
| Decided     | 1068–1070, 1073–1077        | **8**  |
| Needs words | 1140–1142                   | **3**  |
| Owner pick  | 1144–1148                   | **5**  |

65 + 8 + 3 + 5 = **81**. If a recount of the sheet gives another total, stop
and find out why: either the shelf moved (new rows sort in) or this table is
stale.

**Packs.** Every row is `each` / 1, which matches the listings. No row is
added to `pack-label-scan.md`.

## Search words and descriptions (not names)

**S1 — "bolt on plug in load center" is a search word on 74 of the 81 rows (all but the five accessories and two shunt-trips).**
It tells a search that a plug-on load-center breaker and a bolt-on panelboard
breaker are the same row (P1). Suggested, with Q2: "plug in plug-on load
center" on these rows, and "bolt on" only on the bolt-on rows Q2 adds.

**S2 — "half" is a search word on the four tandems.** "Half breaker" is a
real name for a tandem, so it stays, but run "half size breaker" in the spot
check: it must lead with the half-size rows, not the tandems.

## Things that could price a bid wrong

**P1 — a plug-on breaker and a bolt-on breaker are one row.** The rows are
plug-on load-center breakers (QO120 type), and their search words also claim
"bolt on". A commercial panelboard (NQ, the three-phase panelboards on the
Panels shelf) takes a bolt-on breaker: QOB120 **$29.49** (SupplyHouse) to
**$34.96** (Standard Electric Supply), against roughly $10–$15 for the plug-on.
Commercial starters price from these rows: CK3, CK5, CK13, CK14, CW1, CW2,
CW6, CW7, CW14, CS1, CS3–CS8, CS15, GC5, PG15, PG16, PG18, MH7, MH10, MH11.
Q2.

**P2 — a 200A three-phase breaker priced as a plug-on.** Rows 1140–1142 read
like the 100A plug-on beside them; the real part is a molded-case frame
breaker, about $475–$525. Q3.

**P3 — a back-fed main plus a hold-down kit, twice.** The kit already holds
the breaker down; adding row 1145 as well charges for a second one. Q6.

## Common items that are MISSING

The bolt-on rows in Q2 are the only gap found. Everything else a breaker job
uses was found on other shelves first: `Panel filler plate` (Wall Plates &
Misc), `Generator interlock kit` and `Whole-house surge protector` (Equipment
& Appliances), `Panel-mount surge protective device, Type 2` (Distribution
Equipment).

| #     | Item                                                                                                                                                  | Listing                                                                        | Why it is needed                                                                                 | Search words                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| M1–M5 | `20A 1-Pole bolt-on breaker`, `20A 2-Pole bolt-on breaker`, `30A 2-Pole bolt-on breaker`, `30A 3-Pole bolt-on breaker`, `100A 3-Pole bolt-on breaker` | QOB120 **$29.49–$34.96**; QOB family on Border States (2- and 3-pole, to 100A) | The sizes commercial starters use, for panelboard work (P1). Other sizes are new rows if wanted. | "bolt on", "bolt-on", "qob", "panelboard breaker" |

## Owner questions, with suggested answers

**Q1. Do the missing words go in the NAME or the DESCRIPTION?**
Suggested: **names**, as for every shelf so far, each old name kept as a
search word on its row.

**Q2. Plug-on and bolt-on: add bolt-on rows?**
Suggested: **yes.** The existing rows stay plug-on load-center breakers, with
the description "Plug-on, for a load center. A panelboard takes a bolt-on
breaker." Add M1–M5, and move "bolt on" off the plug-on rows onto them (S1).
**No starter moves in this job**: whether a commercial starter's circuit is
fed from a load center or a panelboard is a job fact, and A recounts before
anything moves.

**Q3. Rename the 125A–200A 3-pole rows to molded-case?**
Suggested: **yes** — `{125,150,200}A 3-Pole molded-case breaker`, with the
description "Bolts into a panelboard. Not a plug-on breaker." No starter
uses them.

**Q4. The half-size rows: names kept (frozen) — add a description?**
Suggested: **yes**: "Half-size (1/2-inch). Fits only panels that take
half-size breakers; a standard breaker is 1 inch." And before the sheet is
priced, A checks one listing for the 2-pole 40A and 50A half-size rows; if
none exists, they are retired (hidden, never deleted).

**Q5. Tandems: add a fit description?**
Suggested: **yes**: "Two circuits in one space. Only in panels or slots
rated for tandems."

**Q6. Back-fed main kits: say the hold-down is included?**
Suggested: **yes**: "Back-fed main breaker with its hold-down. Do not add a
Breaker hold-down kit."

**Q7. Breaker accessories (1144–1148): keep them generic?**
Suggested: **yes**, with "Fits the breaker's own family (QO, Homeline, …) —
order with the breakers", the same answer as the panel parts (Panels Q8).
They become parents with brand variants in the brand pass.

**Q8. Shunt-trip rows: name the coil voltage?**
Suggested: **in the description, not the name**: "120V shunt coil. Match
the coil to the hood or fire system." 120V is the common QO shunt; another
voltage is a new row if wanted.

**Q9. Plug-on neutral vs pigtail on the AFCI/GFCI rows?**
Suggested: **wait for the brand-variants pass.** It is a brand-family
property (QO PON vs QO pigtail), priced about the same.

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row; new rows (M1–M5) are new seed rows. The breaker rows are
  generated in `server/seed/materials/power.ts`, so the search-word change
  (S1) is one edit in the generator.
- **Starter edits: none.** Starters name parts by KEY (`starterParts.ts`),
  so the renames move no starter.
- `server/materialsCatalog.test.ts` fails on any amp-rated breaker without a
  pole count; the new names all carry one.
- Run `scripts/searchSpotCheck.mts` for "20a breaker", "20 amp single pole",
  "1p 20", "sp 20", "30/2", "tandem", "half size breaker", "quad", "afci",
  "gfci breaker", "dual function", "200a 3 pole", "bolt on breaker", "qob",
  "shunt trip", "hold down" and "lock off". "half size breaker" must lead
  with the half-size rows; "bolt on breaker" must lead with M1–M5; "200a 3
  pole" must not lead with a plug-on row.
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming or retiring it.

## Owner's answers — 2026-10-14

**Nothing below is applied yet.** It is all for A's **end-of-pricing job**.
Track C changes no catalog row, seed or starter. **Q1 and Q3–Q8 are YES as
suggested; Q2 is YES with a starter list (below); Q9 waits for the
brand-variants pass.**

| Q   | Answer                                | What the job does                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Names**                             | Every "Needs words" row is renamed through `RENAMED_BASELINE_MATERIALS`, each old name kept as a search word on its row.                                                                                                                                                                             |
| Q2  | **Yes, plus the starter list below**  | Add M1–M5 (bolt-on). The existing rows become plug-on only, with "Plug-on, for a load center. A panelboard takes a bolt-on breaker." S1: "bolt on" moves off the 74 plug-on rows onto M1–M5. **The starter moves wait for the owner's yes on the list below** (same pattern as the 4" box supports). |
| Q3  | **Yes**                               | 1140–1142 → `{125,150,200}A 3-Pole molded-case breaker`, description "Bolts into a panelboard. Not a plug-on breaker."                                                                                                                                                                               |
| Q4  | **Yes**                               | Half-size names stay (frozen); description "Half-size (1/2-inch). Fits only panels that take half-size breakers; a standard breaker is 1 inch." A checks one listing for the 2-pole 40A and 50A half-size rows before pricing; with none, they are retired (hidden, never deleted).                  |
| Q5  | **Yes**                               | Tandems get "Two circuits in one space. Only in panels or slots rated for tandems."                                                                                                                                                                                                                  |
| Q6  | **Yes**                               | 1113–1116 get "Back-fed main breaker with its hold-down. Do not add a Breaker hold-down kit."                                                                                                                                                                                                        |
| Q7  | **Yes**                               | 1144–1148 stay generic, with "Fits the breaker's own family (QO, Homeline, …) — order with the breakers"; parents with brand variants in the brand pass.                                                                                                                                             |
| Q8  | **In the description**                | 1119 and 1143 get "120V shunt coil. Match the coil to the hood or fire system."                                                                                                                                                                                                                      |
| Q9  | **Waits for the brand-variants pass** | Nothing in this job.                                                                                                                                                                                                                                                                                 |

### The commercial starters that move to a bolt-on row (owner: Q2 asked for this list; waits for a yes)

**What was searched.** Every shipped starter whose recipe names a Breakers
row (`BASELINE_ASSEMBLIES` via `starterPartName`, read 2026-10-14): 64
starters. The list below is the **26 marked `commercial`**. The 8 marked
`both` (DV3, PG1, PG7, PG8, MH1, CK14, CW6, CW7) and the 30 marked
`residential` **stay plug-on**: a house or light-commercial job is usually a
load center, and PG1 IS a load center. A shop doing panelboard work on one of
those swaps the line on that bid.

**Why every commercial one moves, even where the panel is not known.**
Square D's NQ panelboard takes either kind; a panelboard that takes only
bolt-on breakers needs the bolt-on row. The bolt-on costs the same or more,
so it is the right side of unsure — the same rule as the 4" box supports
(`boxes-name-review.md`, "high beats low").

**The price gap, from ONE supply house on one day** (Standard Electric
Supply, 2026-10-14), so both sides compare like with like. Other houses
differ widely (QOB230 runs $25–$140 across four sellers), so these show how
big the move is; they are not proposed prices.

| Row now → bolt-on row                                    | Plug-on                                                         | Bolt-on         | Change per breaker          |
| -------------------------------------------------------- | --------------------------------------------------------------- | --------------- | --------------------------- |
| `20A 1-Pole breaker` → M1 `20A 1-Pole bolt-on breaker`   | QO120 $13.57                                                    | QOB120 $34.96   | **+$21.39**                 |
| `20A 2-Pole breaker` → M2 `20A 2-Pole bolt-on breaker`   | QO220 $34.19                                                    | QOB220 $80.41   | **+$46.22**                 |
| `30A 2-Pole breaker` → M3 `30A 2-Pole bolt-on breaker`   | QO230 $34.19                                                    | QOB230 $80.41   | **+$46.22**                 |
| `30A 3-Pole breaker` → M4 `30A 3-Pole bolt-on breaker`   | QO330 $104.52 (shown for several QO sizes; SupplyHouse $165.43) | QOB330 $277.96  | **+$173.44**                |
| `100A 3-Pole breaker` → M5 `100A 3-Pole bolt-on breaker` | QO3100 $401.56 (SupplyHouse $135.09)                            | QOB3100 $397.49 | **−$4.07** (about the same) |

**Every starter here uses ONE breaker**, so its price change is the row's
change above.

| Ref  | Starter                                            | Breaker row now       | Proposed bolt-on row | Price change |
| ---- | -------------------------------------------------- | --------------------- | -------------------- | ------------ |
| DV23 | Dedicated 20A receptacle, MC                       | `20A 1-Pole breaker`  | M1                   | +$21.39      |
| DV24 | Isolated-ground receptacle (cash wrap)             | `20A 1-Pole breaker`  | M1                   | +$21.39      |
| CS1  | Sign circuit and disconnect                        | `20A 1-Pole breaker`  | M1                   | +$21.39      |
| CS3  | Hand dryer                                         | `20A 1-Pole breaker`  | M1                   | +$21.39      |
| CS4  | Drinking fountain / EWC                            | `20A 1-Pole breaker`  | M1                   | +$21.39      |
| CS5  | Reach-in cooler / freezer receptacle               | `20A 1-Pole breaker`  | M1                   | +$21.39      |
| CS6  | Twist-lock receptacle, L5-20                       | `20A 1-Pole breaker`  | M1                   | +$21.39      |
| GC5  | 120V feed for door hardware / access control       | `20A 1-Pole breaker`  | M1                   | +$21.39      |
| CK5  | Fire alarm control panel connection                | `20A 1-Pole breaker`  | M1                   | +$21.39      |
| MH8  | Walk-in cooler, evaporator                         | `20A 2-Pole breaker`  | M2                   | +$46.22      |
| CK6  | 208V cooler / freezer receptacle (NEMA 6-20)       | `20A 2-Pole breaker`  | M2                   | +$46.22      |
| CK13 | Mini-split connection, MC                          | `20A 2-Pole breaker`  | M2                   | +$46.22      |
| CW1  | Equipment connection, hardwired (flex whip)        | `20A 2-Pole breaker`  | M2                   | +$46.22      |
| CS7  | Twist-lock receptacle, L6-30                       | `30A 2-Pole breaker`  | M3                   | +$46.22      |
| CS8  | Twist-lock receptacle, L14-30                      | `30A 2-Pole breaker`  | M3                   | +$46.22      |
| MH12 | Unit heater                                        | `30A 2-Pole breaker`  | M3                   | +$46.22      |
| CK3  | Water heater connection, commercial (208V, MC)     | `30A 2-Pole breaker`  | M3                   | +$46.22      |
| CW14 | 208V kitchen equipment receptacle, 30A (NEMA 6-30) | `30A 2-Pole breaker`  | M3                   | +$46.22      |
| PG18 | Building surge protective device                   | `30A 3-Pole breaker`  | M4                   | +$173.44     |
| MH7  | Walk-in cooler, condensing unit                    | `30A 3-Pole breaker`  | M4                   | +$173.44     |
| MH10 | Motor with starter, 3-phase                        | `30A 3-Pole breaker`  | M4                   | +$173.44     |
| PG15 | Feeder breaker, 3-pole                             | `100A 3-Pole breaker` | M5                   | −$4.07       |

**22 move. The other 4 commercial starters do NOT move**, each for its own
reason:

| Ref  | Starter                             | Breaker row now                 | Why it stays                                                                                                                                                                                           |
| ---- | ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CW2  | Commercial Level 2 EV charger, 208V | `40A 2-Pole breaker`            | No 40A bolt-on row. **Suggested: add M6 `40A 2-Pole bolt-on breaker` and move CW2 to it** (QOB240 is a stocked part; not priced on 2026-10-14). Needs the owner's yes, like the rest of this list.     |
| CS15 | Kitchen hood shunt interface        | `30A 2-Pole shunt-trip breaker` | The QO shunt-trip breakers found are plug-in (Border States). No bolt-on shunt-trip row is proposed.                                                                                                   |
| PG16 | Dry-type transformer, 45 kVA        | `70A 3-Pole breaker`            | **The transformer's primary is 480V**, and QO/QOB breakers are 120/240V. Neither row fits; a 480V breaker row is a new question (below).                                                               |
| MH11 | Motor on VFD                        | `30A 3-Pole breaker`            | **The drive is "5 HP, 480V 3-phase"**, so the same: a 240V breaker cannot feed it. And its `30A non-fused disconnect, NEMA 1, 240V` is a 240V switch on a 480V load — flagged for A, not changed here. |

**Found while making the list — for the owner, not in this job:** PG16 and
MH11 price a 480V load from 240V parts. The fix is either a 480V breaker row
(and a 600V disconnect for MH11) or a 208V version of each starter. That is a
new question, raised here so it is not lost; nothing changes until it is
answered.

**How it lands** (end-of-pricing job, after the owner's yes): add M1–M5 (and
M6 if yes) as seed rows with keys in `server/seed/starterParts.ts`, then
point each starter above at its key. The plug-on rows keep their ids, so
nothing else moves. A bid that already priced a line keeps its frozen
snapshot. **If the recount at that job finds a commercial starter not on
this list, or one of these no longer using the row named, stop and find out
why before moving anything** — a starter added or changed since 2026-10-14,
or a missed search, and those want different fixes.

## Owner's answers, round 2 — 2026-10-14

**Nothing below is applied yet.** All of it is for A's end-of-pricing job.

| Item                 | Answer                    | What the job does                                                                                                                                |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bolt-on starter list | **Yes, move all 22**      | The 22 starters in the table above move to M1–M5 as listed.                                                                                      |
| M6                   | **Yes**                   | Add `40A 2-Pole bolt-on breaker` (search words "bolt on", "bolt-on", "qob", "panelboard breaker"); **CW2 moves to it.** 23 starter moves in all. |
| CS15                 | **Stays plug-on**         | No change.                                                                                                                                       |
| PG16 / MH11          | **Fix them — propose it** | The proposal below. **It waits for the owner's yes;** nothing in it is part of the job until then.                                               |

### PG16 and MH11 — the 480V proposal (waits for the owner's yes)

**What is wrong today.** PG16 (45 kVA transformer, 480V primary) and MH11
(5 HP VFD, 480V 3-phase) are each fed from a plug-on 3-pole breaker, which is
a 120/240V part, and MH11's motor disconnect is
`30A non-fused disconnect, NEMA 1, 240V`. None of those is rated for a 480V
circuit, so both starters price parts the job cannot use, and cheaper ones
than the parts it will buy.

**Where the 480V parts go.** The catalog already has `480V 3-phase
panelboard` (Distribution Equipment). It takes bolt-on breakers rated for
480Y/277V (Square D's E-frame, EDB), and the catalog has none, so that
panelboard can be priced today but nothing in it can.

**Sizes, so the rows are the right ones.** PG16: a 45 kVA transformer draws
45,000 ÷ (480 × 1.732) = 54A on the primary; the 70A breaker it already
prices is the next standard size up from 125% of that, so the size stays
and only the voltage changes. MH11: a 5 HP motor at 480V is a small load,
and the 30A it already prices stays.

**Proposed new rows:**

| #   | Name                                             | Shelf    | Listing (2026-10-14)                                                                                                                                                          | Search words                                                      |
| --- | ------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| H1  | `30A 3-Pole bolt-on breaker, 480Y/277V`          | Breakers | Square D EDB34030: **$265** (JRL), **$548.76** (Standard Electric Supply, list $669)                                                                                          | "480v breaker", "277/480", "edb", "e frame", "bolt on", "3p 30"   |
| H2  | `70A 3-Pole bolt-on breaker, 480Y/277V`          | Breakers | Square D EDB34070: **$329–$359.99** (JRL, superbreakers.com); **$1,067.89** (SupplyHouse)                                                                                     | "480v breaker", "277/480", "edb", "e frame", "bolt on", "3p 70"   |
| H3  | `30A non-fused disconnect, 3-pole, NEMA 1, 600V` | Panels   | Square D HU361 (heavy duty, 600V): new **$59.99–$120** on eBay, no distributor price found; the NEMA 3R HU361RB **$190** (Stokes Electric). A checks one distributor listing. | "heavy duty", "hd", "600v disconnect", "480v disconnect", "hu361" |

**A 480Y/277V breaker is for a WYE system.** A 480V delta service (no
neutral) needs a breaker rated straight 480V, which is a different part.
H1 and H2 are named with their rating so nobody puts one on the wrong
system; a straight-480V row is a new row if wanted.

**The heavy-duty switch is right for MH11, not only a 600V rating.** A
general-duty switch, which every disconnect on the Panels shelf is today, is
a 240V product. A 600V switch is sold only as heavy duty, which is why H3's
search words include "heavy duty". The Panels answers took "heavy duty" off
the 240V switches for exactly this reason, so it now points only at H3.

**The starter moves:**

| Ref  | Starter                      | Part now                                 | Proposed part | Change, from the listings                                                                                                 |
| ---- | ---------------------------- | ---------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| PG16 | Dry-type transformer, 45 kVA | `70A 3-Pole breaker`                     | H2            | The breaker goes from a 240V plug-on to a ~$330–$360 E-frame breaker.                                                     |
| MH11 | Motor on VFD                 | `30A 3-Pole breaker`                     | H1            | From a plug-on (QO330 $104.52 at Standard Electric Supply) to a $265–$549 E-frame breaker.                                |
| MH11 | Motor on VFD                 | `30A non-fused disconnect, NEMA 1, 240V` | H3            | A 240V general-duty switch to a 600V heavy-duty one. The price gap is not measured: no new HU361 distributor price found. |

**Neither starter gains or loses a line**, so each is a part swap in
`server/seed/starterParts.ts`. Nothing else in either recipe changes: PG16's
flex and lugs and MH11's #10 THHN and liquidtight are right at 480V. **If
the recount at the job finds another starter that feeds a 480V part** (the
other three transformers have no starters today), stop and add it to this
list rather than moving it on its own.

## Owner's answers, round 3 — 2026-10-14: the 480V proposal is YES

**Yes to all of it: H1, H2 and H3 are added, PG16 moves to H2, and MH11
moves to H1 and H3.** For A's end-of-pricing job. Nothing applied here.

- **Before applying H3, A finds a real distributor price for the HU361**
  (the owner's condition). The eBay range ($59.99–$120) is not a supply-house
  price, and the NEMA 3R HU361RB ($190) is a different part. If no
  distributor lists the HU361 itself, stop and ask rather than pricing H3
  from eBay.
- H1 and H2 keep their listing prices from round 2 (EDB34030 $265–$548.76,
  EDB34070 $329–$359.99), checked again the same way as every other row.
- The moves are part swaps in `server/seed/starterParts.ts`; neither starter
  gains or loses a line (round 2, "The starter moves").
- With this, every Breakers question is answered except Q9, which waits for
  the brand-variants pass.

## Source rule for the new rows (owner, 2026-10-14)

The new rows this review proposed are checked in
`pricing/new-rows-source-check.md`. **That file, not the "Listing" column
above, decides each new row's price:** COMMON (found at Home Depot, Platt
or Stoneway) takes its Example price from those three only; SPECIALTY is
still added, with the price blank and "Specialty - price from your
supplier." Listings above from other sites are comparison only.
