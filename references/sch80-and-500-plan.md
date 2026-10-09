# PVC Sch 80 underground types and the Wiremold 500 run type (PLAN, 2026-10-09)

**Status: plan only. Nothing here is built.** Written by Track C on
`track-c` for two owner-approved additions. Same pattern as
`per-foot-items-plan.md` (the per-foot plan), and it builds on that plan
rather than re-deciding anything in it.

**Read against:** local-dev `dda8e42` and Track A's in-progress branch
`origin/a-catalog-review` (`87066f4`, migration 0140 + the owner's catalog
review, NOT on local-dev when this was written). If either has moved when
you read this, re-check § 4 before building — it is the part that depends on
A's job.

## 0. What the owner approved

| #   | Decision                                                                                                                                                                                             | Answers per-foot plan |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | **PVC Sch 80 underground run types**, the same sizes as the Sch 40 underground set **minus 3-1/2"** (which A's catalog review removes). Warning tape the only extra, horizontal feet, waste applied. | § 7 Q2                |
| 2   | **Wiremold 500 is set up the same way as 700**: its own run type, its own fittings, device box and plate; the base row renamed; the cover row retired if 500 is one-piece.                           | § 7 Q3                |

**Is 500 one-piece? Yes** — Wiremold's 500 and 700 are both one-piece
steel raceway (the two-piece families are 2000/2400/4000), which is what the
per-foot plan § 3c already says. So the cover row is retired. If the owner
knows otherwise, § 2 step "retire the cover" is the one line to drop.

### Decisions this builds on (cited so the next search succeeds)

- **D3** (`takeoff-spec.md`): a run says what it is by its TYPE. So Sch 80
  is a separate TYPE, never a per-run switch.
- **Per-foot plan § 3a/§ 3b**: tape is an extra on the type, `flat`, 1.0;
  the type's raceway waste applies to it; underground types ship NO wire.
  All of that carries over unchanged.
- **Per-foot plan § 3c**: 700 is one per-foot row + factory fittings found
  by the family lookup, entrance end at the start only, corner = inside
  elbow, end drop = flat elbow, tee = a fitting, clips NULL. 500 copies it.
- **Customization rule 1–3** (CLAUDE.md): the underground fold already
  exists (`client/src/lib/runTypeFold.ts`); the Sch 80 types go in it, not
  beside it.
- **Renaming / retiring a shipped material** (CLAUDE.md § Brands): through
  `RENAMED_BASELINE_MATERIALS` and `RETIRED_BASELINE_MATERIALS`, never a
  text edit; shipped run types match by EXACT name, so a rename edits
  `baselineRunTypes.ts` in the same commit.

## 1. PVC Sch 80 underground run types

### 1a. Catalog — every row already exists; add NOTHING

Sizes: `TRADE_SIZES` = 1/2", 3/4", 1", 1-1/4", 1-1/2", 2", 2-1/2", 3", 4"
(**nine**). Sch 80 never shipped 3-1/2" (`conduit.ts`: "rigid, IMC and
Sch 80 do not ship it"), and on A's branch `sizesFor()` returns
`TRADE_SIZES` for every family, so the Sch 40 set is the same nine.

| What the type needs                | Row                                                         | Exists?                                                          |
| ---------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| raceway                            | `N" PVC Sch 80` × 9                                         | yes (`conduit.ts` FAMILIES)                                      |
| connector, coupling                | `N" PVC Sch 80 connector` / `… coupling`                    | yes (FITTINGS, every family × size)                              |
| factory 90 / 45                    | `N" PVC Sch 80 90-degree elbow` / `… 45-degree elbow`       | yes                                                              |
| LB / T / LL / LR / C bodies        | `N" PVC Sch 80 LB conduit body` …                           | yes                                                              |
| strap                              | `N" PVC one-hole strap` (shared with Sch 40, `strapFamily`) | yes                                                              |
| sweeps (only if a type is pointed) | `N" PVC Sch 80 90-degree sweep, 24" radius` … 1"–4"         | yes; 2-1/2"–4" become **Specialty** on A's branch (ranking only) |
| tape                               | `Underground warning tape`                                  | yes                                                              |

The fitting lookup already knows Sch 80 (`shared/runFittingMaterials.ts`
`FAMILY_LABELS`, `PVC_FAMILIES`, `strapFamily`); belled sticks like Sch 40.
**So: no catalog edit, no migration.**

### 1b. Run types to seed (Track A, `server/seed/baselineRunTypes.ts`)

Nine types, one per `sizesFor("PVC Sch 80")`, identical to the Sch 40 set
except the raceway:

| Field              | Value                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| label              | `2" PVC Sch 80, underground` (and so on per size)                                                                        |
| pathType           | `conduit`                                                                                                                |
| raceway            | `2" PVC Sch 80`                                                                                                          |
| conductor / ground | not set (NULL material, NULL counts) — per-foot plan § 3b                                                                |
| extras             | `[WARNING_TAPE]` — `flat`, 1.0                                                                                           |
| waste              | none on the type: the existing chain (`conduitExtraPct` → company → accepted starter) applies to the tape, as for Sch 40 |

Generated by the same `.map` over a list of schedules rather than a second
copy-paste block, so a size added to one schedule cannot miss its type.

### 1c. Code (Track C)

1. **`shared/undergroundRunTypes.ts`** — `undergroundRunTypeLabel(size)`
   hard-codes `PVC Sch 40`. Change to `undergroundRunTypeLabel(size,
schedule)` with the schedule REQUIRED (no default — a default is how a
   Sch 80 call site quietly gets a Sch 40 name). `isShippedUndergroundType`
   / `saysUnderground` read only the `, underground` suffix and need no
   change. A's branch calls it in `RETIRED_BASELINE_RUN_TYPES` — that call
   gains `"PVC Sch 40"` (see § 4).
2. **The fold** (`client/src/lib/runTypeFold.ts`) — today it sorts by size
   only; with two schedules a tie keeps palette order, which interleaves
   them unpredictably. Sort **Sch 40 first, then Sch 80, each by size**: an
   estimator picks the schedule from the spec before the size. One fold,
   "Underground (18)" — not a second fold (rule 1: ONE control).
3. **Respecify naming** (`takeoffRuns.respecify`) — made types are named from
   the raceway (`2" PVC Sch 80, 2 #6 THHN Copper, underground`), so they
   already say Sch 80. Check only; no change expected.

Nothing in the extras path, the bridge, send or materials list is schedule-
specific; Sch 80 rides it unchanged.

### 1d. Tests that must fail without the change

- `server/perFootSeed.test.ts` — "every shipped underground type carries
  tape, and no other shipped type does" already exists; extend it to expect
  the labels for BOTH schedules (`sizesFor(s).map(size =>
undergroundRunTypeLabel(size, s))`). **Red** without the seed: 9 missing.
  Its DB case ("seeds tape on every underground type, once") then covers
  the nine new types' extra rows with no new code.
- `client/src/lib/runTypeFold.test.ts` (new case) — a palette with Sch 80
  and Sch 40 rows in mixed order folds as all Sch 40 by size, then all
  Sch 80 by size. **Red** on today's size-only sort.
- `shared` label test — `undergroundRunTypeLabel('2"', "PVC Sch 80")` is
  `2" PVC Sch 80, underground`, and `isShippedUndergroundType` takes it.
- A DB case in `server/runTypeExtras.test.ts` — a traced 100 ft Sch 80
  underground run with two 3 ft risers and 10% raceway waste sends 106 ft
  of pipe and **110 ft of tape** (flat × waste). Fails if the type ships
  without the extra or the extra is `all`.
- `server/frozenMaterialNames.test.ts` / run-type exact-name check — the
  nine new types name rows that exist (already enforced for every shipped
  type; it goes red if a label/raceway is mistyped).

### 1e. Bid numbers that could move

**None.** Nine NEW shipped types; no existing run points at them, and no
starter recipe changes. The fold sort moves rows on screen, not numbers.
Check after building: E111 1728359 and Bar layout check 1164558, `bids.get`

- `bridgeForBid` + `materialsList.get` + `takeoffSummary.forBid` identical
  old vs new code on one database (the method in `track-c-handoff.md`).

## 2. Wiremold 500 run type

### 2a. Catalog — what exists vs what is needed (list only, add nothing here)

Today (`server/seed/materials/raceUndergroundService.ts`): two 500 rows,
both from 0117 — **staging only, never live** — and **nothing points at
either** (no starter, no run type, no test but one `isSurfaceRaceway700`
negative case).

| Row                                                | Today                        | Needed                                                                                                                                                                                                      |
| -------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Surface raceway base, 500 series`                 | exists                       | **RENAME in place** → `Surface raceway, 500 series` (same id); add `raceway: { stickLengthFeet: 10, stickJoint: "coupling", strapSpacingFeet: null, strapFromBoxFeet: null }`; keep "base" as a search word |
| `Surface raceway cover, 500 series`                | exists                       | **RETIRE** (`RETIRED_BASELINE_MATERIALS` + `FROZEN_ADDS_NOT_SEEDED` `retired` entry)                                                                                                                        |
| `Surface raceway coupling, 500 series`             | no — only `Raceway coupling` | **ADD**                                                                                                                                                                                                     |
| `Surface raceway flat elbow, 500 series`           | no                           | **ADD**                                                                                                                                                                                                     |
| `Surface raceway inside elbow, 500 series`         | no                           | **ADD**                                                                                                                                                                                                     |
| `Surface raceway outside elbow, 500 series`        | no                           | **ADD** (hand-added; the count never buys one — same as 700)                                                                                                                                                |
| `Surface raceway tee, 500 series`                  | no                           | **ADD**                                                                                                                                                                                                     |
| `Surface raceway entrance end fitting, 500 series` | no                           | **ADD**                                                                                                                                                                                                     |
| `Surface raceway support clip, 500 series`         | no                           | **ADD**                                                                                                                                                                                                     |
| `Surface raceway device box, 500 series`           | no                           | **ADD**                                                                                                                                                                                                     |
| `Surface raceway device plate, 500 series`         | no                           | **ADD**                                                                                                                                                                                                     |

**Nine adds, one rename, one retire.** All `Surface Raceway`, `each` (the
raceway `foot`), `jobKind: "commercial"`, $0 and example-tagged, generic
names with the series as the size (CLAUDE.md § Brands). Slang per CLAUDE.md
§ Materials: `500 v500` plus the same part words the 700 rows carry, and
the shelf's `wiremold wire mold` (already on every row via `SR`). Must not
alias each other or the 700 rows: "500 elbow" must lead with a 500 part,
"700 elbow" with a 700 one — `pnpm tsx scripts/searchSpotCheck.mts` after
seeding ("500 elbow", "wiremold 500 tee", "500 coupling", "500 box").

The generic `Raceway …` rows stay (they serve 1500/2400; A's review left
them under NOT SURE item 5). No 500 end cap, as for 700.

**Rename bookkeeping** (exactly as 700 did it, same commit):
`shared/renamedMaterials.ts` `AFTER_FREEZE`, `shared/frozenAddsHeld.ts`
`SHIPPED_AS`, the retire in `server/seed/materials/index.ts` and
`FROZEN_ADDS_NOT_SEEDED`; `pricing/frozen-names.json` stays the owner's
frozen sheet and is NOT edited.

### 2b. Run type to seed (Track A, `baselineRunTypes.ts`)

**`500 series surface raceway, 2 #12 + ground`**, the 700 type's twin:

| Field     | Value                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| pathType  | `conduit`                                                                                                        |
| raceway   | `Surface raceway, 500 series` (the renamed row — exact name, same commit as the rename)                          |
| conductor | `#12 THHN Copper` × 2                                                                                            |
| ground    | × 1, **the same ground row the 700 type uses at the time** — `#12 THHN green Copper` once A's review lands (§ 4) |
| extras    | none                                                                                                             |

Unfolded, beside 700 (it is not underground). The palette's visible count
grows by one; the picker's `max` decides whether it shows before "show
all" — check on screen.

### 2c. Code (Track C)

`shared/surfaceRacewayFittings.ts` is written for ONE series. Generalise it
to a closed list, never a pattern:

- `SURFACE_RACEWAY_SERIES = ["500", "700"] as const` and
  `surfaceRacewaySeries(baselineName): "500" | "700" | null`, matched by
  exact SHIPPED name (`Surface raceway, 500 series` / `…700 series`).
  **Not a regex**: `Surface raceway, 1500 series` must stay off this path
  (it has no fitting family; it falls to the pipe path and says "no catalog
  match", which is honest).
- `surfaceRacewayPartName(part, series)` — series REQUIRED.
  `surfaceRacewayFittingRows` and `countSurfaceRacewayFittings` take the
  series; the counting rules (entrance end at start, inside vs flat elbow,
  tee as a fitting, factory only, clips "not set" while NULL) are
  unchanged and shared.
- `fittingRowsByRunType` (`server/db.ts` ~13716) branches on
  `surfaceRacewaySeries(...) !== null` instead of `isSurfaceRaceway700`.
  `isSurfaceRaceway700` is deleted (one caller + tests), so no caller can
  keep the 700-only check by accident.
- Roles unchanged (`SURFACE_RACEWAY_PART_ROLE`, incl. `elbowFlat`) — one
  line per type + role, and 500 is a different type. **No migration.**

### 2d. Tests that must fail without the change

- `server/surfaceRacewayFittings.test.ts` — the existing
  `isSurfaceRaceway700("Surface raceway, 500 series") === false` case is
  REPLACED by: 500 → `"500"`, 700 → `"700"`, 1500 / 2400 / a company's own
  raceway → `null`. **Red** on today's code (500 → not a family).
- Same file: a 500 run with one corner and one end drop names
  `Surface raceway inside elbow, 500 series` and `…flat elbow, 500 series`
  — never a 700 part. **Red** if the part name ignores the series.
- `server/runTypeExtras.test.ts` (or a new DB case) — a traced 500 run
  sends coupling / connector (entrance end) / elbow90 / elbowFlat lines
  priced from the 500 rows; a 700 run on the same bid still sends 700
  rows. **Red** if the db.ts branch still checks 700 only.
- `server/frozenMaterialNames.test.ts` + a rename test like 700's:
  `Surface raceway base, 500 series` resolves to the renamed row with the
  same id; the cover is inactive and still resolves.
- `server/materialsCatalog.test.ts` (existing, catalog-wide): the nine adds
  carry search words that do not restate the name or alias another row.
- Seed test: the 500 type's raceway, conductor and ground names exist
  (existing exact-name check on shipped run types).

### 2e. Bid numbers that could move

- **700 runs: must NOT move.** The generalisation touches the 700 path.
  Check old vs new on one database: E111 1728359 counted as 700 (380
  couplings, 38 entrance ends, 38 inside elbows, 76 flat elbows, clips not
  set — the figures in `track-c-handoff.md`) and a 700 fixture run giving
  inside elbow 1 + flat elbow 2 (the staging bid 772 shape).
- **A run typed with a 500 raceway today** (a shop type pointed at the 500
  base row): its fittings go from "no catalog match" to counted 500 parts —
  a number appears where none was. Expected, and the point. None ships, and
  0117 is not on live, so no live bid can hold one.
- The rename changes the NAME shown on any line already holding the 500
  base row (staging only); price and quantity unchanged.

## 3. Who does what

| Part                                                 | Track | Files                                                                                         |
| ---------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| Nine Sch 80 underground types + tape extra           | **A** | `server/seed/baselineRunTypes.ts`                                                             |
| 500 rename, cover retire, nine 500 adds with slang   | **A** | `raceUndergroundService.ts`, `materials/index.ts`, `renamedMaterials.ts`, `frozenAddsHeld.ts` |
| 500 run type                                         | **A** | `baselineRunTypes.ts` (exact names, same commit as the rename)                                |
| Any column                                           | —     | **none needed.** No migration in either job.                                                  |
| `undergroundRunTypeLabel(size, schedule)`, fold sort | **C** | `shared/undergroundRunTypes.ts`, `client/src/lib/runTypeFold.ts`                              |
| 500 fitting family                                   | **C** | `shared/surfaceRacewayFittings.ts`, `server/db.ts` (`fittingRowsByRunType`)                   |
| Tests in § 1d / § 2d                                 | both  | each side writes the tests for its half                                                       |

**Order.** The label signature (C) and the seed (A) touch the same call, so
either land C's `undergroundRunTypeLabel` change first and A seeds against
it, or A does both in one commit. The 500 seed can land before C's family
code — until then a 500 run's fittings say "no catalog match", exactly as
700's did between A's seed and C's code (no wrong number, an honest
blank). C's family code must not land before the 500 rows exist, or its
tests have nothing to name. **No three-step migration question: there is
no migration.**

## 4. What depends on A's current catalog job (`a-catalog-review`, 0140)

1. **3-1/2" is gone.** A retires every 3-1/2" row and archives
   `3-1/2" PVC Sch 40, underground` via `RETIRED_BASELINE_RUN_TYPES`. Sch 80
   never had 3-1/2", so the nine-size list needs nothing special — but
   **build on A's branch (or after it merges)**, or the Sch 40 set is still
   ten on local-dev and § 1d's test compares 10 vs 9.
2. **`undergroundRunTypeLabel` is called by A's retire list.** If C changes
   the signature first, A's call needs `"PVC Sch 40"` added; if A merges
   first, C's change updates it. Either way one line, but whoever lands
   second must re-run `perFootSeed.test.ts` and `catalogReviewSeed.test.ts`.
3. **The ground wire.** A retires `#12 bare solid Copper` and moves the
   700 type's ground to `#12 THHN green Copper` (`RUN_TYPE_MATERIAL_SWAPS`).
   The 500 type must name the SAME row: if it seeds before A's review
   merges, it names `#12 bare solid` and needs adding to the swap list's
   effect (the swap pass moves any shipped type still on `from`, so it
   would be caught — but write the final name and avoid the round trip).
4. **Specialty (0140, `materials.isSpecialty`).** A tags 2-1/2"–4" Sch 80
   **sweeps** Specialty. Ranking only; the Sch 80 types count factory 90s,
   not sweeps, so no effect on counting. The Sch 80 **pipe and fittings**
   are not tagged on A's branch — **owner call**: tag them Specialty too?
   That would sort them after Sch 40 in a search (good: "2 pvc" should lead
   with Sch 40) and changes no number. Not assumed here.
5. **Catalog row count.** A's branch: 1,824 → 1,793. This plan adds 9 and
   retires 1 → **1,801 active** if both land. A count is intent, not
   outcome: read it from the seed after building, and if it differs, stop
   and find out why.

## 5. Open questions for the owner (none blocks the seed)

1. **500 clip spacing** — ships NULL ("not set"), as 700 (per-foot § 7 Q1
   still open). One figure answers both if they share it.
2. **Does 500 share fittings with 700 in your supply house?** Some Wiremold
   fittings are sold for both series. This plan ships separate `, 500
series` rows (simplest, mirrors 700). If they are the same part, say so
   and they become one row per part named for both — a rename, not a
   rebuild.
3. **500 wire fill.** The type ships 2 #12 + ground (3 conductors), the
   same as 700. 500 is the smaller channel — confirm 3 #12 is a fill you
   would actually pull.
4. **Tag Sch 80 pipe/fittings Specialty?** (§ 4 item 4.)
5. **GR2 with a Sch 80 trench.** When the bid half lands (per-foot § 3d,
   B's step 3), a traced Sch 80 trench covers GR2's TAPE (same tape row)
   but NOT GR2's 2" Sch 40 pipe — different material, so GR2's 10 ft
   "default length" pipe would stay on top. Either GR2 is Sch 40 by
   definition (fine), or coverage should treat Sch 40/80 of one size as
   the same pipe. Decide before B builds § 3d.

## 6. Look at it (CLAUDE.md: not verified until somebody has looked)

At laptop and 1180×820 touch: the picker's "Underground (18)" fold, closed,
Sch 40 then Sch 80 by size; the 500 type beside 700 and armable; a traced
500 run's Send dialog lines naming 500 parts; a traced Sch 80 trench's tape
line with its "flat length only" sentence.
