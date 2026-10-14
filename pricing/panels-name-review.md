# Panels — name review (2026-10-14, Track C)

**Read-only review. No name has been changed.** For each row on the "Panels"
shelf of `starter-catalog-pricing.xlsx` ("Starter prices", spreadsheet rows
**965–1067**, 103 rows, in the app-order sort of `28245633`), the question is
whether one real product can be priced at Platt or Home Depot from the name
alone. The workbook was read from a fresh copy, because the owner has it
open. It is the shelf after Service Entrance
(`service-entrance-name-review.md`); Breakers start at row 1068.

The sheet's 103 names match `BASELINE_MATERIALS`' Panels rows one for one
(read from the seed the same day), so the search words and descriptions
quoted below are the catalog's own.

**The test** uses the properties a supply house names these parts by. For a
panel: amp rating, space count, main-lug or main-breaker, indoor (NEMA 1) or
outdoor (NEMA 3R), single- or three-phase. For a safety switch: amps, fused
or not, pole count, enclosure, voltage (240V general duty vs 600V heavy
duty). For a fuse: class, voltage and amps. For a meter part: amps, and for
a meter center the rating per position. For an accessory: which panel
family it fits. A name that leaves out something that changes the price is
"vague".

**Verdicts:** **OK**; **Needs a word / words**, with the exact words;
**Not a real product**; **Two products in one row**; **Owner pick**;
**Decided**, where an earlier review already settled it.

**Used by:** shipped starters (`BASELINE_ASSEMBLIES` via `starterPartName`,
the same count as the sheet's "Used by"). 21 of the 103 rows are used. **No
run type uses this shelf.**

**Sources.** Listings checked on 2026-10-14 (Home Depot, Platt, Elliott,
Crescent, Stoneway, Standard Electric Supply, Steiner, Schneider's own
pages). Prices only show how big a question is; they are not proposed
prices.

**Already decided, and not reopened here:**

- **Panel naming** (catalog reality check, 2026-10-09, applied): every
  sized single-phase panel is `{amps}A main-lug panel, {spaces}-space,
indoor|outdoor` or `{amps}A main-breaker panel, …`, with the REAL amp
  rating, full-size spaces, and **both** main-lug and main-breaker kept.
  "MLO" is a search word on every main-lug row; "NEMA 1" on indoor and
  "NEMA 3R" on outdoor rows. A row exists where at least two brand lines
  stock the combination.
- **Brand rows wait for the brand-variants pass** (CLAUDE.md § Brands;
  `parentId` does not exist yet). Every row here is a generic parent. No
  brand row is proposed, and catalog numbers below are listings only.
- **Three-phase panelboards** (retail catalog plan § R5): six sized 208Y/120V
  rows; "main" not "main-breaker" in their names (a code comment in
  `server/seed/materials/power.ts` says why: "main-breaker" puts a row on
  the Breakers shelf).
- **`400A meter base` is the CL320 base** (320A merged into it, 2026-10-09;
  GR3 uses it). "320a" and "cl320" are its search words.
- **Fuses carry class and voltage** (`100A 250V Class RK5 cartridge fuse`)
  and **disconnects carry `240V`** (reality check, rows 213 and 215).
- **Disconnects, safety switches and sensors are generic** (CLAUDE.md
  § Brands, narrowed 2026-09-21).

## Existing rows

### Fuses and the feed-through lug kit (965–971)

| Row     | Current name                                             | Used by         | Pack     | Verdict / proposed words | Why                                                                                                                                                                                                                                                                |
| ------- | -------------------------------------------------------- | --------------- | -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 965–970 | `{30,60,100,200,400,600}A 250V Class RK5 cartridge fuse` | 100A: PG17 (x3) | each / 1 | OK (6 rows)              | Class, voltage and amps named, which is what fits a fuse to a switch (FRN-R-30 … FRN-R-600). Default quantity 3; see P3 for the 2-fuse case.                                                                                                                       |
| 971     | `Feed-through lug kit`                                   | —               | each / 1 | **Owner pick** (Q8)      | Fits ONE panel family and rating: Square D HOML2225, Homeline 225A, **$257–$432** (Standard Electric Supply, Crescent). Not interchangeable, the same position as the panel filler plate (Wall Plates Q6). `Sub-feed breaker kit` on Breakers is a different part. |

### Fused disconnects (972–979)

| Row     | Current name                                       | Used by    | Pack     | Verdict / proposed words                                         | Why                                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------------------------- | ---------- | -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 972–975 | `{30,60,100,200}A fused disconnect, NEMA 1, 240V`  | 100A: PG17 | each / 1 | **Needs a word** (Q3): the pole count, `…, 2-pole, NEMA 1, 240V` | General-duty 240V fused switches come 2-pole (D222N, 60A, **$166.55**, Standard Electric Supply) and 3-pole (D322N; D323N is the 100A the reality check cited). A 2-pole takes 2 fuses, a 3-pole 3. PG17 adds 3 fuses, so it is pricing a 3-pole switch from a row that does not say so. |
| 976–979 | `{30,60,100,200}A fused disconnect, NEMA 3R, 240V` | —          | each / 1 | **Needs a word** (Q3): `…, 2-pole, NEMA 3R, 240V`                | Same as above (D222NRB is the 60A 2-pole 3R).                                                                                                                                                                                                                                            |

### Packaged panels (980–983)

| Row | Current name                 | Used by | Pack     | Verdict / proposed words                                                              | Why                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------- | ------- | -------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 980 | `Generator-ready main panel` | —       | each / 1 | **Needs words** (Q4): `200A main-breaker panel, generator-ready, 40-space, indoor`    | Breaks the frozen panel rule: no amps, no spaces, no indoor/outdoor. Listings are 200A / 40-circuit: Generac GenReady **$849** NEMA 1, **$899** NEMA 3R (Generac); Platt GTRGTL2003D, 200A 40-space MB NEMA 1. "Generator-ready" goes after the main type so the row still sorts with the 200A panels.            |
| 981 | `50A GFCI spa disconnect`    | —       | each / 1 | OK                                                                                    | Midwest U(G)412 family, 50A. Description says the GFCI breaker is built in.                                                                                                                                                                                                                                       |
| 982 | `60A GFCI spa disconnect`    | RS14    | each / 1 | OK                                                                                    | Midwest UG412RMW260P (reality check row 216).                                                                                                                                                                                                                                                                     |
| 983 | `400A main panel, 42-space`  | —       | each / 1 | **Needs words** (Q5): `400A main-breaker panel, 42-space, indoor`, plus a description | Not in the frozen pattern (no "main-breaker", no indoor/outdoor). The real product is a commercial-grade 400A single-phase load center: Eaton BR4242B400S, NEMA 1, **$7,106** (Platt); BR4242B400R, 3R, **$5,677** (Elliott). A house's "400A" is the CL320 meter base plus two 200A panels (GR3), not this (P1). |

### Main-breaker panels (984–1010) — 27 rows, all OK

| Rows     | Names                                                                                                                                                  | Used by                                                                                                        | Verdict | Why                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 984–1010 | `{100,125,150,200,225}A main-breaker panel, {12,16,20,24,30,32,40,42}-space, indoor\|outdoor` (the combinations the reality-check grid marked stocked) | 100A 12-space outdoor: PG20. 100A 24-space indoor: GR5. **200A 40-space indoor: PG1, PG2, PG4, GR2, GR3 (x2)** | OK      | Each names amps, spaces, main type and enclosure, which is everything a supply house needs for a generic parent. Siemens SN4060B1200 is the 200A 40-space (reality check row 51). See S1 for a search-word gap on 12 of them. |

### Main-lug panels (1011–1040) — 29 OK, 1 needs words

| Rows      | Names                                                                                             | Used by                            | Verdict                                                                                      | Why                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1011–1039 | `{70,100,125,150,200,225}A main-lug panel, {2,4,6,8,12,16,20,24,30,40,42}-space, indoor\|outdoor` | **125A 24-space indoor: PG5, CW4** | OK (29 rows)                                                                                 | Same pattern, and every one carries "mlo". See S2: six of them are missing the "Main-lug only" description the other 23 carry.                                                                            |
| 1040      | `400A main-lug sub-panel, 42-space`                                                               | —                                  | **Needs words** (Q5): `400A main-lug panel, 42-space, indoor`, plus the main-lug description | The last row still on the retired "sub-panel" spelling, with no enclosure. Eaton CH42PL400 is the 400A main-lug single-phase 42-space NEMA 1 (Rexel); BR4242L400R the 3R. Commercial-grade, like row 983. |

### Meters (1041–1047)

| Row  | Current name                  | Used by  | Pack     | Verdict / proposed words                                              | Why                                                                                                                                                                                                                                                                                                                                                |
| ---- | ----------------------------- | -------- | -------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1041 | `100A meter base`             | PG20     | each / 1 | OK                                                                    | Reality check: OK.                                                                                                                                                                                                                                                                                                                                 |
| 1042 | `200A meter base`             | PG2, GR2 | each / 1 | OK                                                                    | Reality check: OK. Ring or ringless is the utility's call; "ringless" is already a search word.                                                                                                                                                                                                                                                    |
| 1043 | `400A meter base`             | GR3      | each / 1 | **Decided** — the CL320 base                                          | 2026-10-09 merge.                                                                                                                                                                                                                                                                                                                                  |
| 1044 | `Meter center, 4-position`    | CW12     | each / 1 | **Owner pick** (Q6)                                                   | Priced by the rating per position and the bus as much as by the count: Schneider MPR64200, 4 sockets, 600A bus, 200A per position, **$2,865**; MPL64225, 225A, **$3,656** list; MPH66125, 6 sockets, 125A, **$2,715**. A row with no rating can be priced from any of them.                                                                        |
| 1045 | `Meter center, 6-position`    | —        | each / 1 | **Owner pick** (Q6)                                                   | Same.                                                                                                                                                                                                                                                                                                                                              |
| 1046 | `2" meter hub`                | PG2      | each / 1 | OK                                                                    | Square D A200 (reality check row 223). Fits one maker's hub opening; Q8 adds that to its description.                                                                                                                                                                                                                                              |
| 1047 | `200A meter-main combination` | PG3      | each / 1 | **Needs words** (Q7): `200A meter-main combination, 8-space, outdoor` | Breaks the frozen panel rule (no spaces, no enclosure). Listings: 8-space ringless **$315–$475** (Square D RC816F200C $314.81, GE $318.00, Siemens $353.18, Leviton LS820 $474.68); 20-space **$322–$438**; 30-space RC3040M200SL **$665.38** (all HD). PG3 feeds an inside panel through 10 ft of SER, which is the 8-space (feed-through) shape. |

### Non-fused disconnects (1048–1056)

| Row       | Current name                                           | Used by                                             | Pack     | Verdict / proposed words                          | Why                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------ | --------------------------------------------------- | -------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1048–1051 | `{30,60,100,200}A non-fused disconnect, NEMA 1, 240V`  | 30A: MH8, MH10, MH11, MH12, CK3, CW5, CW6. 60A: MH3 | each / 1 | **Needs a word** (Q3): `…, 2-pole, NEMA 1, 240V`  | Same pole question as the fused rows. **Not checked per size**: whether every amperage is sold 2-pole in general duty was not confirmed on 2026-10-14, so A should check before naming the 100A and 200A rows. |
| 1052–1055 | `{30,60,100,200}A non-fused disconnect, NEMA 3R, 240V` | 30A: RS15, CS1, MH7. 60A: MH5. 200A: CW3            | each / 1 | **Needs a word** (Q3): `…, 2-pole, NEMA 3R, 240V` | Same.                                                                                                                                                                                                          |
| 1056      | `60A non-fused pullout disconnect`                     | MH1, MH4, CK13                                      | each / 1 | OK                                                | Eaton DPU222R (reality check row 93). Its fused sibling is missing (M1).                                                                                                                                       |

### Panel parts (1057–1061)

| Row  | Current name               | Used by | Pack     | Verdict / proposed words                                                     | Why                                                                                                                                                                                                                                                                                       |
| ---- | -------------------------- | ------- | -------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1057 | `Panel cover, flush`       | —       | each / 1 | **Owner pick** (Q8)                                                          | A load center ships with its cover; a commercial panelboard cover is bought apart and sized by the box: Square D NC26F **$571.77** (Crescent), NC32F **$606.28**, NC44F **$762.76** (Stoneway), NC38F **$173.44** (Standard). A residential replacement cover is a fraction of that (P4). |
| 1058 | `Panel cover, surface`     | —       | each / 1 | **Owner pick** (Q8)                                                          | Same (NC50S **$838**, gesrepair).                                                                                                                                                                                                                                                         |
| 1059 | `Panel neutral bar`        | —       | each / 1 | **Owner pick** (Q8)                                                          | An extra neutral bar fits one panel family. `Ground bar kit` (Grounding & Bonding) is the part bought for grounds; this row's search words ("bus terminal strip white") do not say which is which.                                                                                        |
| 1060 | `Panel trim extension`     | —       | each / 1 | **Owner pick** (Q8)                                                          | Fits one panel family and box size, like the covers.                                                                                                                                                                                                                                      |
| 1061 | `Panelboard interior only` | —       | each / 1 | **Needs words** (Q9): `225A panelboard interior, 3-phase main-lug, 42-space` | Priced by amps, spaces and phase like the panelboard it goes in: Square D NQ442L2C, 225A 42-space, **$503.13** (Steiner) to **$1,847.55** (Cesco). With no size it stands for any interior from a 100A 18-space to a 400A 42-space.                                                       |

### Three-phase panelboards (1062–1067) — 6 rows, all OK

| Rows      | Names                                                                     | Used by                                                    | Verdict | Why                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1062–1067 | `{100,125,225,400}A panelboard, 3-phase main\|main-lug, {24,30,42}-space` | 225A main: PG13, GC2. 400A main: PG14. 225A main-lug: PG12 | OK      | Decided (R5). Siemens SW4242B3225 is the 225A main (reality check row 94). Q8 asks whether their description should say "complete: box, interior and cover". |

**Totals, by row: 103.**

| Verdict            | Rows                                                                      | Count  |
| ------------------ | ------------------------------------------------------------------------- | ------ |
| OK                 | 965–970, 981, 982, 984–1010, 1011–1039, 1041, 1042, 1046, 1056, 1062–1067 | **74** |
| Decided            | 1043                                                                      | **1**  |
| Needs words        | 972–979, 980, 983, 1040, 1047, 1048–1055, 1061                            | **21** |
| Owner pick         | 971, 1044, 1045, 1057, 1058, 1059, 1060                                   | **7**  |
| Two products       | —                                                                         | 0      |
| Not a real product | —                                                                         | 0      |

74 + 1 + 21 + 7 = **103**. If a recount of the sheet gives another total,
stop and find out why: either the shelf moved (new rows sort in) or this
table is stale.

**Packs.** Every row is `each` / 1, which matches the listings (all sold
singly). Fuses ship with a default quantity of 3 (see P3). No row is added to
`pack-label-scan.md`.

## Search words and descriptions (not names)

**S1 — 12 older main-breaker rows lack the enclosure search words.** The
frozen rule puts "NEMA 1" on indoor rows and "NEMA 3R" on outdoor. The rows
added 2026-10-09 carry "nema 1 interior" / "nema 3r … rainproof" and "mb";
the older rows do not:

- indoor, missing "nema 1 interior" and "mb": 984, 989, 994, 995, 1000,
  1001, 1002, 1006, 1008, 1009;
- outdoor, missing "mb" and "rainproof": 985, 1007.

**S2 — six main-lug rows lack the "Main-lug only" description** the other
23 carry, and also "nema 1 interior": 1020 (125A 20-space), 1024 (125A
24-space, the PG5/CW4 row), 1027 (125A 30-space), 1028 (200A 30-space), 1032
(200A 40-space), 1034 (225A 42-space). Row 1036 (100A 6-space) has the
description but not "nema 1 interior". Row 1040 lacks both (Q5).

**S3 — "heavy duty" is a search word on every 240V disconnect**, fused and
non-fused (972–979, 1048–1055). A 240V switch is general duty; heavy duty is
the 600V line (H323N), several times the price. Suggested: replace "heavy
duty" with "general duty gd". See P2.

These are search-word fixes, not renames, and go in A's same pass.

## Things that could price a bid wrong

**P1 — "400A main panel, 42-space" is a $5,700–$7,100 commercial load
center.** Someone pricing a house's 400A service from it prices the wrong
equipment by thousands; the house job is GR3's CL320 base plus two 200A
panels. Q5.

**P2 — a 240V switch priced as heavy duty.** The search word "heavy duty"
(S3) invites the 600V heavy-duty price onto a general-duty row.

**P3 — the fuse count follows the pole count, and no switch row states it.**
A 2-pole switch takes 2 fuses, a 3-pole 3. PG17 adds 3 fuses to `100A fused
disconnect, NEMA 1, 240V`, and the fuse rows default to 3, so a 2-pole
single-phase job is one fuse over, every time (a 100A RK5 is a real line,
not pennies). Q3.

**P4 — "Panel cover" is $40 or $800, by which panel.** A load-center
replacement cover and a commercial panelboard trim (NC26F–NC50S, $170–$900)
share one row. Q8.

**P5 — a meter center with no rating per position**, $2,700–$3,700 by
rating and bypass. CW12 uses the 4-position row. Q6.

**P6 — "Panelboard interior only" with no size**, $500–$1,850 for one size
alone. Q9.

## Common items that are MISSING

Each one was checked against a real listing on 2026-10-14. The parts a
panel job uses beside the panel were looked for elsewhere in the catalog
first: `Ground bar kit`, `Generator interlock kit`, `30A`/`50A power inlet
box`, `30A 6-circuit manual transfer switch`, `Panel filler plate` and
`Breaker-style surge protective device` all exist on other shelves, so none
is listed here.

| #   | Item                           | Listing                                                                                                        | Why it is needed                                                                                                                                                                       | Search words                                                     |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| M1  | `60A fused pullout disconnect` | Eaton DPF222RP, 60A 2-pole 240V NEMA 3R, **$19.12** (HD); DPF222R **$45.99** (HD Supply), **$65.02** (Elliott) | A condenser whose nameplate says "max fuse" needs a fused disconnect; today the only pullout is non-fused, so the estimator prices a $200 fused safety switch or leaves the fuses off. | "fused ac disconnect", "fusible pullout", "a/c disconnect fused" |

**Not proposed, for the owner to say if wanted:** the small RK5 sizes
(35A–50A) that go in M1 for an A/C unit, and a 320A/400A meter-main. Both
are real; neither was asked for by a starter.

## Owner questions, with suggested answers

**Q1. Do the missing words go in the NAME or the DESCRIPTION?**
Suggested: **names**, as for every shelf so far, each old name kept as a
search word on its row.

**Q2. Fix the search words and descriptions in S1–S3?**
Suggested: **yes**, in A's same pass: "nema 1 interior"/"mb" and "mb
rainproof" on the 12 older main-breaker rows, the "Main-lug only"
description and "nema 1 interior" on the six main-lug rows (and "nema 1
interior" on 1036), and "general
duty gd" in place of "heavy duty" on the 16 disconnects.

**Q3. Disconnects: state the pole count?**
Suggested: **yes.** Every existing fused and non-fused 240V row becomes
**2-pole** (`100A fused disconnect, 2-pole, NEMA 1, 240V`) — single-phase
240V, the same as the pullout and spa rows beside them. **Add 3-pole fused
rows at 100A and 200A, NEMA 1 and NEMA 3R** (4 rows, `…, 3-pole, …, 240V`)
for three-phase work, and **PG17 moves to `100A fused disconnect, 3-pole,
NEMA 1, 240V`, keeping its 3 fuses** — its 3 fuses say it already means
3-pole. That is the job's one starter edit. The other starters (all
single-phase loads) stay on their rows, now named 2-pole. Before naming the
100A and 200A non-fused rows 2-pole, check one listing for each (see the
table).

**Q4. Generator-ready panel: which?**
Suggested: **`200A main-breaker panel, generator-ready, 40-space, indoor`**,
"generator ready" and "genready" kept as search words.

**Q5. The two 400A single-phase panels.**
Suggested: **keep both, renamed to the pattern** — `400A main-breaker
panel, 42-space, indoor` and `400A main-lug panel, 42-space, indoor` — each
with the description "Commercial-grade 400A load center. A house's 400A
service is usually the 400A meter base with two 200A panels." No starter
uses either.

**Q6. Meter centers: which rating?**
Suggested: **125A per position**, the apartment size that matches CW4's
125A unit panel: `Meter center, 4-position, 125A per position` and the
6-position the same. A 200A-per-position center is a new row if wanted.

**Q7. Meter-main: which size?**
Suggested: **`200A meter-main combination, 8-space, outdoor`** — the
feed-through shape PG3 uses. "meter main" and "meter combo" stay search
words. A 20- or 30-space one is a new row if wanted.

**Q8. The panel-family parts: keep them generic, and how?**
Suggested: **keep all generic**, with the description "Fits the panel's own
family (QO, Homeline, …) — order with the panel", the same answer as the
panel filler plate (Wall Plates Q6) and the bonding jumper kit (Service
Entrance Q4). Applies to 971, 1046, 1057–1060. Three extras:

- **Feed-through lug kit** names its rating: `Feed-through lug kit, 225A`.
- **Panel covers** get "Replacement cover or panelboard trim — sized by the
  box", and the six three-phase panelboards get "Complete: box, interior
  and cover" in their description, so it is clear a panelboard row does not
  need a cover row added.
- **Panel neutral bar** gets "For an extra neutral only — grounds go on a
  Ground bar kit."

These become parents with brand variants when breakers get theirs.

**Q9. Panelboard interior: which size?**
Suggested: **`225A panelboard interior, 3-phase main-lug, 42-space`**, the
size of the commonest panelboard here (PG12). "interior only" and "guts"
stay search words.

**Q10. Add M1 (60A fused pullout)?**
Suggested: **yes.**

## For A, when the answers come back

- Renames go through `RENAMED_BASELINE_MATERIALS`, each old name a search
  word on its row; new rows (Q3's 3-pole switches, M1) are new seed rows.
  The rows live in `server/seed/materials/power.ts`; most panel rows are
  generated (`PANEL_SPACES`, the reality-check batches in `index.ts`), so a
  pattern change is one edit in the generator.
- **Starter edits: PG17 only** (Q3), from the 2-pole row to the new 100A
  3-pole NEMA 1 row. Starters name parts by KEY (`starterParts.ts`), so the
  renames themselves move no starter. Bid lines already priced keep their
  snapshots.
- **Fuse ↔ switch test.** `server/materialsCatalog.test.ts` "stocks a fuse
  for every fused disconnect amperage" matches `^\d+A fused disconnect\b`,
  so the 2-pole and 3-pole names still match it, and their 100A and 200A
  fuses already exist. The test also lists `60A fused disconnect, NEMA 1,
240V` by name (line ~1187), so the rename edits it in the same commit.
- Run `scripts/searchSpotCheck.mts` for "200 amp panel", "mlo", "sub panel",
  "100a sub", "generator panel", "400 amp panel", "meter main", "meter
  center", "disconnect", "30a disconnect", "fused disconnect", "ac
  disconnect", "heavy duty", "panel cover" and "neutral bar". "ac
  disconnect" must still lead with the pullouts, "400 amp panel" must not
  lead with the $6,000 load center ahead of the 400A meter base, and "mlo"
  must return only main-lug rows.
- If a recount finds a starter or run type using a row this review says is
  unused, stop and find out why before renaming it.
