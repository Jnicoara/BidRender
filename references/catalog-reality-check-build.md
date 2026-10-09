# Catalog reality check — what was built (Track A, 2026-10-09)

The owner approved Track C's catalog reality check
(`references/catalog-reality-check.md` on `track-c`, `d60ee58`): batch 1,
batch 2 with the owner's five calls, and the PANELS table — all 56 rows,
including the five Square D-only rows and C's retire picks — plus the box
decisions in `box-depth-check.md` and two labels. This file is what was
built from that, and **every call made where an approved line offered a
choice**. The data is `shared/catalogRealityCheck20261009.ts` (renames,
retirements, search words) and `server/seed/materials/realityCheck.ts` (new
rows).

## The rules it keeps

- **No existing bid changes.** Renames are in place (same id,
  `RENAMED_BASELINE_MATERIALS`); retirements set `isActive = false`
  (`RETIRED_BASELINE_MATERIALS`); nothing is deleted; no `bid_line_items`
  snapshot is touched. Rehearsed on a copy — see "Rehearsal" below.
- **Old names stay search words** — on a renamed row, and on the ONE kept row
  a retired row's job goes to (approval condition 1). Done by the seed
  itself (`applyRealityCheck`), not by hand per row.
- **Starters repointed** in `server/seed/starterParts.ts` (keys unchanged,
  96 values). 10 pointed at retired rows; the rest follow renames.
- **Pairs ship together.** The PVC Sch 40/80 names are built with
  `pvcSharedFittingName` and Track C's code half (`c-pvc-4080`, `460bd83`)
  is merged on this branch, so the two cannot ship apart.

## Counts (measured from the seed, 2026-10-09)

|                                                         | Before | After                                                     |
| ------------------------------------------------------- | ------ | --------------------------------------------------------- |
| Shipped (active) rows                                   | 1,825  | 1,717                                                     |
| Retired names on the list                               | 152    | 310                                                       |
| Renamed in place on a real copy (incl. older spellings) | —      | 296                                                       |
| Retired on a real copy                                  | —      | 158                                                       |
| New rows                                                | —      | 50 (37 panels, 7 lugs, 2 fire alarm, 2 washers, 2 labels) |
| Specialty                                               | 114    | 95 (20 tagged rows retired, the 5-gang box added)         |

If a recount differs, stop and find out why before going on: either this
table is stale, or one of the two modules was edited without the other.

## TWO LINES HELD — for the owner

Both are batch-2 lighting lines, approved under "everything else", that
**contradict an earlier owner decision the batch-2 section does not cite**:
the owner decided on 2026-10-07, twice, to "ship ALL wafer/canless/CCT-disc
sizes (2", 3", 4", 5", 6", 8"), each size its own separate item, never folded
together" (`materialsCatalog.test.ts`, `shared/frozenAddsHeld.ts`). So these
two were NOT applied, pending the owner's word:

1. **"Every 5" canless wafer row → retire."** The 5" plain, CCT and gimbal
   wafers stay. (The 5" slim and wet-rated go, like every size's: removing a
   variant removes no size.)
2. **"5" + 6" LED disc light (and CCT twins) → one 5/6" row"; "5" LED
   retrofit trim → merge into 6", renamed 5/6"."** The 5" and 6" stay
   separate.

If the owner says yes, both are a few lines in
`shared/catalogRealityCheck20261009.ts` (the comments mark where) and the
starters need nothing (the 6" trim's key already points at the 6" row).

## Search fixes this needed (measured, then fixed)

The renames moved searches, found by `scripts/searchSpotCheck.mts` run before
and after (118 queries) and by the search suites:

- **A depth is not a size.** '1/2" weatherproof box, single-gang, 2" deep'
  answered "2 emt". A measurement followed by "deep" is now not one of the
  item's sizes when another size comes first (`withoutDepths`,
  `client/src/lib/smartSearch.ts`). "Concrete ring, 6" deep", whose depth is
  its only size, still answers "6".
- **A space or circuit count is not a size.** "20 amp breaker" led with
  twenty "main-breaker panel, 20-space" rows. "20-space" is now one count
  word on both sides, so "42 space" still finds the 42-space panels
  (`joinCountWords`).
- **A leading rating.** "3 way" led with "3-way dimmer" once the switch was
  "15A 3-way switch", and "plug" with a combo device. A count, a size and a
  SYNONYM look past a leading amperage ("15A"); a typed word does not, or
  "switch" would start "400A switchboard" (`LEADING_RATING`). The phrase rule
  does it only for a query that begins with a number, so "main breaker"
  still leads with the main breakers rather than the main-breaker panels.
- **"500/700" is one word to search**, so "700 clip" found nothing once the
  clip was a 500/700 row. The seed no longer strips "500"/"700" from the
  search words as already said by the name (`dropRestatedWords`).
- **Old names join as words, never as a size the row is not.** A retired or
  renamed row's old name is added without its commas and brackets, and
  without an inch size the new name lacks — '1/2"' on the now-3/4" triple
  WP box would have answered a 1/2" search.

**Two names changed for search, inside the approved change:**

- `Detector relay module` → **`Relay module, smoke alarm`** (the line said
  "Smoke alarm relay module"): a name starting with "smoke" led a search for
  "smoke" above every smoke detector.
- The quad breakers → **`15A 2-Pole quad breaker (two 2-pole circuits)`**
  (the line said "15/15A …"): "15/15A" is one search word, so "15A quad
  breaker" found nothing.

**One rename NOT made, for the same reason:** `1/2"` / `3/4" threaded
closure` keep their names and gain "closure plug" as search words. Named
"closure plug", they led a search for "plug" — the word CLAUDE.md gives as
the one an estimator types for a receptacle.

**Panels named "main-breaker":** `power.ts` recorded on 2026-09-29 why the
3-phase panels say "main", not "main-breaker": the word "breaker" puts a
panel in breaker searches. The panel table's names (owner-approved) use
"main-breaker"; the search fixes above keep "20 amp breaker" and "main
breaker" on the breakers. If the owner prefers the older convention, it is a
rename of 35 rows.

## Code that changed with the names

A few names are BUILT by code rather than looked up, so the code moved with
them, in the same change:

- `fittingMaterialName` (`shared/runFittingMaterials.ts`): PVC couplings,
  terminal adapters and LBs use the shared Sch 40/80 names (C's half); EMT
  raintight fittings are `… EMT raintight compression …`; a rigid connector
  is `… rigid conduit threadless compression connector`; the PVC strap is
  `… PVC two-hole strap` from 2-1/2" up.
- `pullBoxName`: `6x6x4 pull box` etc. (`PULL_BOX_DEPTH`, one table for the
  name and the seed).
- `surfaceRacewayPartName`: the support clip and the tee are one 500/700
  row (V5703, V5715).
- `STARTER_COMMONNESS` and `SPECIALTY_MATERIALS` read their keys through the
  same maps, so a renamed key follows its row and a retired one drops out —
  including the PVC LB keys (`next-live-release-plan.md` § 4 item 6).
- Run types match by exact name: `baselineRunTypes.ts` now names
  `#12 THHN solid Copper` and `#12 THHN green solid Copper`.

## Calls made on lines that offered a choice (say if wrong)

**Wire**

- `Video doorbell chime kit` → `Video doorbell power kit` (its own search
  words named the maker's power adapter).
- `Fiber optic cable` → `…, 12-strand OM4 multimode, plenum` only (no OS2
  row added); "single mode", "om3", "os2" dropped from its search words.
- `#3 3-conductor` / `#3 4-conductor MC cable Copper` → `3/3` / `3/4 MC cable
Copper` as approved. **This turns back the 2026-10-08 review**, which used
  words because "3/4" reads as a fraction; the size order was checked after
  (see Tests).

**Panels**

- The table exactly as approved: 19 renames, 21 retire-intos (the bare
  400A rows as batch 2 said), 37 new rows; "mlo" on every main-lug row.
- `Temporary power pole` → `100A main-breaker panel, 12-space, outdoor`;
  `Subpanel, 100A` → `125A main-lug panel, 24-space, indoor`; **CW4
  (Apartment unit panel, 125A main-lug)** also moved — it used
  `125A main-lug sub-panel, 24-space`, which the table retires into that
  same row. The batch-1 table predates CW4.

**Devices and lugs**

- Each crimp-lug RANGE row became its LARGEST size, in place (`8-6` → `#6`,
  `4-2` → `#2`, `1-1/0` → `1/0`, `2/0-4/0` → `4/0`, `250-350` → `350 kcmil,
single size`); the other sizes are new rows (`#8`, `#4`, `#3`, `#1`, `2/0`,
  `3/0`, `250 kcmil, single size`). The feeder starter (PG15) points at the
  new `#3 AWG crimp lug` (owner call 3); the transformer starter (PG16) at
  `#4` (batch 1).
- `3/4"` and `1" cord grip` → no range in the name (the second option).
- `Twist-lock receptacle` → retired into `L14-30 receptacle` (the first
  option; it is the generator one its words described).
- Prefix `15A`: duplex, GFCI, GFCI WR, duplex WR, single, quad receptacles;
  single-pole, 3-way and 4-way switches.

**Raceway and supports**

- Trapeze kit → strut channel: **MS5 0.3** of a stick (C's 3 ft); **PG16
  0.4** (one 4 ft trapeze under a 45 kVA transformer — my estimate).
- `1-5/8" x 3-1/4"` strut → **back-to-back** (P1001), not "deep".
- `Raceway device box, 2-gang` → `Surface raceway device box, 2-gang, 700
series` (the starter's series; not checked against a part number).
- The unseried raceway parts retire into the **700** rows (the series the
  starters use); `Raceway mounting strap` into the 500/700 clip;
  `Raceway end cap` + `Raceway blank end plate` → `Raceway end cap / blank
end plate`.
- `Duct bank spacer` → retired into `Conduit spacer, 2"`.
- `Service mast` rows → `…, 10 ft` (the length the line suggested).
- `4x4` / `6x6 wireway` → `…, 5 ft` (the stocked lay-in section).
- Liquidtight couplings retire into the liquidtight connector of the same
  size (a coil has no couplings; no traced run counts one).

**Lighting and equipment**

- Fuses: one form for all six, `NA 250V Class RK5 cartridge fuse` (batch 2's
  example); batch 1's `100A Class RK5 fuse, 250V` spelled the same way.
- Disconnects: `…, 240V` on all 16 general-duty rows ("and its siblings").
- `30 ft light pole` → `30 ft square steel light pole` (no wall gauge: the
  4" 11 ga of the 12 and 20 ft poles is not what a 30 ft pole is).
- The 5"/6" disc and trim merge and the 5" wafer retirement are **HELD**
  (see "TWO LINES HELD" above). The wafer variants go: slim and wet rated
  into the plain wafer of the same size, the 2" and 8" gimbal into theirs.
- 3" cans retire into the 4" of the same type; airtight-shallow and sloped
  cans into the 6" (`6" recessed can, shallow, IC airtight` is the renamed
  6" airtight row); the 5" new-construction non-IC into the 6".
- Every old name that stated a SIZE the row no longer is cannot find it
  (`1/2" weatherproof box, triple-gang`, `1-5/8" x 1-1/4" strut`): the old
  size is deliberately not a search word on the new row.

## Lines NOT done, and why

Each needs a fact or a choice the approval did not give.

- `Panel filler plate` as a panel-family item with brand variants — brand
  variants need `parentId` (`ASSEMBLIES_PLAN.md`), not built.
- `Temporary pole, 6x6 post` — "add the length meant": the owner's length.
- `Poke-through device, 2-service` — "once the owner says what the starter
  means".
- `Floor heating mat` — size and voltage, or per sq ft: the owner's call.
- `Busway`, `Busway elbow` — "add the amp rating": not chosen.
- `4/2`, `2/2 MC cable Copper`; the `Set-screw splice` rows; the two
  `Mechanical lug, 2-hole` rows; `20A quad receptacle`; `20A 2-Pole
AFCI/GFCI combo breaker` — "confirm … or retire": not confirmed, so kept.
- `3/4"` and `1" NM clamp connector` vs the snap-in NM rows — "decide
  whether they duplicate": not decided.
- The generic `Wall plate`, `Jumbo wall plate`, `Stainless steel wall plate`
  — "retire, or keep as parents": kept as parents.
- Every line marked "optional", "if wanted" or "consider" (16/2 landscape,
  3/4" knockout seal, siding block with box, 1"/4" J-hooks, 1/2" beam clamp,
  1/2" wedge anchor, combination clamp connector, photocell and IG
  variants, dryer cord, CCT wafers, tray cable, violet phase tape, expansion
  couplings, weatherhead, 4" two-duplex cover, sloped trims, track L/T,
  pump start relay, "240V general duty" wording, VFD/contactor alternates).
- Catalog-wide wattage and length on high bays, area lights, wall packs,
  floods and baseboard heaters — "not a rename yet".
- `Ceiling support wire` stays sold "each": the line said "by the foot",
  and changing a unit under starters that already count it is a quantity
  change, not a rename.

## Rehearsal on a local copy of staging — CLEAN (2026-10-09)

| Step              | Result                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy              | `staging-2026-10-09T18-23-28Z-before-0141.sql` restored to `bidrender_rehearse_reality`; migrated 0141 → all 142                                                                                                           |
| Control           | today's `local-dev` (`aaed2a8`) booted once; catalog 1,965 rows / 1,825 active; `bidTotals` 959 bids                                                                                                                       |
| This code, boot 1 | **added 50, renamed 296, retired 158, DELETED 0**; 1,717 active; 0 company rows touched; 0 active rows on an old spelling; 0 duplicate names; every reference into materials identical by id, 0 orphans — `VERDICT: CLEAN` |
| Boot 2            | nothing: added 0, renamed 0, retired 0                                                                                                                                                                                     |
| Totals            | **959/959 unchanged** (total due, not-priced, incomplete)                                                                                                                                                                  |
| Old spellings     | 604 searched; the renamed row first for every one found; 3 not found — the known "5/6" fraction, and the two old names that state a size the row no longer is (on purpose: `materialSearchRank.test.ts`)                   |

Fresh database (`bidrender_test_reality`, migrated, booted once): 1,717
materials, all active, all 224 starters seeded. Full suite on it: 6,519
passed, 0 failed.

## Existing databases: starters on retired rows are NOT repointed

The starter seed inserts a recipe only when it is missing
(`seedBaselineAssemblies`, `server/db.ts`), so on a database that already
has the starters:

- **renamed rows follow by themselves** — same id, new name;
- **the 10 starter lines on RETIRED rows stay on them** (temporary power
  pole's 60A panel, the 320A meter base, the RV receptacle, the floor box
  cover, the blank plate, the raceway entrance end, the 200A bare panel,
  CW4's 125A sub-panel, the compression ground lug, the trapeze kit ×2, and
  PG15's 2/0–4/0 lug). They still resolve and price — retired rows do — but
  they are hidden from pickers and differ from a fresh database's starters.

Repointing them there is a repair pass of the `repairStarterCovers` shape
(narrow, report first, `--apply`, totals before and after). **Not built:**
it was not asked for, and it writes to shared starter lines on staging and
live, which wants its own yes.

## Not done here, on purpose

- **Pricing sheets NOT rebuilt** (owner). The carry-over rule applies to the
  next rebuild: renamed items keep their typed values by key.
- **Staging untouched.** Next: back up staging, rehearse on its restore,
  push, then `repairStarterCovers` on staging (`next-live-release-plan.md`).
