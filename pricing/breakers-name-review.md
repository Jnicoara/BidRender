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
