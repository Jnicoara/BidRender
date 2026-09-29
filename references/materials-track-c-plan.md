# Materials catalog — Track C plan (2026-09-27)

Plan only. Nothing here is built. Track C rules apply: no migrations or schema
changes, no deploys, nothing against the live site.

Measured on `track-c` after pulling `local-dev` (df5f1d2), 2026-09-27:
`BASELINE_MATERIALS.length` = **1,237**, `RETIRED_BASELINE_MATERIALS.length` = 12. `server/materialsCatalog.test.ts` + `server/seedReactivatesRetired.test.ts`
run against `bidrender_test_clean`: **63 passed, 0 failed.** If a re-run prints
different numbers, stop and find out why before acting on anything below —
either this file is stale or the branch is not where it was.

---

## 1. The 1,250-row catalog cap — ALREADY RAISED to 1,500

**What sets it:** one assertion, and only a test —
`server/materialsCatalog.test.ts`, "is the size the catalog was specified at":
`expect(BASELINE_MATERIALS.length).toBeLessThan(1500)`, with a floor of 500.
Nothing in the app, the seeder or the database enforces a row limit.

**It was raised from 1,250 to 1,500 on 2026-09-26** in `af79758` ("Catalog
tripwire: 1,250 -> 1,500 rows"), at 1,237 rows. That commit is on `local-dev`,
`main` and `track-c`. The comment there records the reasoning:

- the pricing sheet held 1,364 generic rows, so 1,500 fits all of them with
  ~10% spare;
- it still trips if the biggest generated family (Conduit Fittings, 338 rows)
  doubles by accident (1,237 + 338 = 1,575);
- it is a tripwire against a runaway generator, not a limit on the catalog.

**What the number actually protects, and the real ceiling.** The cost of a
bigger catalog is not the test, it is `getLibraryMaterials`: `materials.list`
and the bid screens read the whole catalog unpaged — about 255 KB of seed data
alone at 1,237 rows (figure from the test comment, not re-measured today). The
comment already says: when the 519 brand-variant rows land (~1,900 total),
measure that response before raising the line again.

**Proposed:** no change now. The boxes work below adds ~33 rows (→ ~1,270).
The one thing that would crowd 1,500 is conduit bodies (§ 3, question G).

## 2. Seeder: a retired name never switches back on — ALREADY FIXED

**Fixed 2026-09-26** in `2799bf1` ("Seeder: a retired material put back in the
catalog comes back"), on `local-dev`, `main` and `track-c`.

- `reactivateBaselineMaterials` (`server/db.ts`, ~line 1859) runs right after
  the retire pass in `seedBaselineMaterialsFrom`. It finds shared rows
  (`userId IS NULL`) with `isActive = false` whose name is in the shipped
  catalog again, and sets them active — same row, same id, so every assembly,
  kit, stamp and priced bid that pointed at it still does.
- Scoped to `userId IS NULL`, so a company's own copy is never touched.
- `server/seedReactivatesRetired.test.ts` covers: comes back after the next
  seed; leaves a company copy alone and a second seed changes nothing; never
  switches on a company row sharing a shipped name. All 3 pass today.
- CLAUDE.md § Brands ("Un-retiring works too, since 2026-09-26") already says so.

**Proposed:** nothing to build. The one open check is the owner's to make:
`main` deploys on push, so this should be live — confirming it is means reading
the live site, which Track C does not do.

## 3. Boxes catalog audit

> **BUILT 2026-09-27, Tiers 1 + 2, on `track-c`.** The owner accepted all
> eight recommendations (A–H). Catalog 1,237 → **1,270**, Boxes shelf 52 →
> **85**. Tier 3 is held. Four things changed from the plan below, and each
> was a measurement rather than a preference:
>
> - **The PVC boxes are named `4x4 PVC pull box` etc., not
>   `PVC junction box, 4x4`.** With "junction box" in the name, the standard
>   search sweep put all four PVC rows ahead of the steel 1900 for "j box".
>   Named like the steel pull boxes, they tie on the alias and sort in beside
>   them by size. Still their own rows, so question D's answer holds:
>   `pullBoxFor` proposes steel.
> - **Commonness: `4" square blank cover`, not the decorator raised cover.**
>   Marking the raised cover moved it to the top of a bare "cover" search,
>   ahead of the blank cover every 1900 junction gets.
> - **The PVC FS box is `Weatherproof box, single-gang, PVC`**, not
>   `PVC weatherproof box, single-gang`. Led by "PVC", it took the top of a
>   bare "pvc" search from the conduit, and `materialSearchRank.test.ts` went
>   red. It now also sorts beside its steel sibling.
> - **"brass" moved from `Floor box` to the new `Floor box cover`**, and the
>   box now says "The box only. The cover is a separate item."
>
> The pricing sheet was regenerated in the same change. The committed copy had
> been stale since 2026-09-25, so it also picked up ~130 rows from catalog
> changes made since then (1,252 → 1,397 generic rows; 0 typed prices in the
> old copy, checked before overwriting).

### What exists (52 rows on the Boxes shelf, `server/seed/materials/boxes.ts`)

| Family                 | Rows                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device boxes, new work | Single/Double/Triple-gang (plastic, unsuffixed) + metal of each; 4-gang, 5-gang (plastic)                                                         |
| Old-work device boxes  | Single/Double/Triple-gang old-work box                                                                                                            |
| Masonry                | Masonry box, single-gang / double-gang                                                                                                            |
| 4" square              | `4" square box`, mud ring, extension ring, blank cover                                                                                            |
| 4-11/16" square        | box, mud ring, blank cover (no extension ring)                                                                                                    |
| Ceiling                | Octagon box plastic / metal, Shallow round box (pancake), Old-work ceiling box, Ceiling fan brace box, Fan-rated ceiling box, Retrofit bar hanger |
| Weatherproof           | Weatherproof box 1/2/3-gang, Handy box, Floor box                                                                                                 |
| FS/FD cast             | 1/2", 3/4", 1" × FS and FD (single-gang)                                                                                                          |
| Pull boxes             | 4x4, 6x6, 8x8, 12x12, 16x16, 24x24 (no depth, no NEMA rating stated)                                                                              |
| Rough-in               | Nail plates 1-1/2"/3"/5", Single-gang box extender, Drywall repair ring, Low-voltage mud ring, Panel knockout seal, Steel stud grommet            |

Box-adjacent rows on OTHER shelves (not duplicated below): Weatherproof flip
cover, in-use cover 1- and 2-gang, stainless WP cover, wall plates (Wall
Plates & Misc); Floor monument, Raised floor box, Poke-through 2/4-service,
4x4/6x6 wireway (Distribution Equipment); Grid box bracket (Strut); In-ground
splice box (Lighting Hardware); Recessed TV receptacle box (Receptacles);
LB conduit bodies, 5 raceways × 9 sizes (Conduit Fittings).

### Names other code depends on — do NOT rename

- `4" square box`, `4-11/16" square box`, `4" square blank cover`,
  `4-11/16" square blank cover` — the tee box/cover in
  `shared/runFittingMaterials.ts` (~line 261); `4" square box` also in
  `server/seed/baselineAssemblies.ts`.
- `NxN pull box` — `pullBoxName` / `PULL_BOX_SIDES` (4, 6, 8, 12, 16, 24) in
  `shared/runFittingMaterials.ts`, which proposes the smallest box meeting NEC
  314.28's 6× angle pull (takeoff-spec.md, answer 3).
- Adding a DESCRIPTION to an existing row is fine; changing a name goes through
  `RENAMED_BASELINE_MATERIALS`, and none is proposed here.

### Earlier decisions this touches

- **Mud ring depths were merged, 2026-09-25** (`pricing/movedFromSheet.ts`,
  batch 2): "Plaster ring, 1/2 in" and "5/8 in" both fold into
  `4" square mud ring`. This plan keeps that and splits by GANG instead, which
  that merge did not address.
- **Generic everywhere except panels and breakers** (CLAUDE.md § Brands). All
  rows below are generic. Brand names as ALIASES only, if the owner wants the
  lighting audit's pattern (question F).
- **"T bodies wait for catalog rows"** (takeoff-spec.md, answer 3) — relevant
  to question G.

### Gaps — Tier 1 (common on most jobs; recommend now), 16 rows

| #   | Proposed name                           | Why                                                                                                                                                             |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `4" square box, 2-1/8" deep`            | The deep 1900 — the default on commercial work and wherever box fill runs out. Existing row gets a description: "1-1/2\" deep. The 2-1/8\" is a separate item." |
| 2   | `4" square mud ring, 2-gang`            | A two-device location on a 1900 needs it; today the only ring is single-gang.                                                                                   |
| 3   | `4-11/16" square mud ring, 2-gang`      | Same, on the 4-11/16. Existing rings get "Single-gang." descriptions.                                                                                           |
| 4   | `4" square raised cover, duplex`        | Industrial/exposed-work cover. Nothing today covers surface EMT work in a shop, garage or unfinished basement.                                                  |
| 5   | `4" square raised cover, single toggle` | Same family.                                                                                                                                                    |
| 6   | `4" square raised cover, decorator`     | GFCI/decora on exposed work — the most-bought of the set.                                                                                                       |
| 7   | `4" square raised cover, two toggle`    | Two switches on one exposed box.                                                                                                                                |
| 8   | `4-11/16" square extension ring`        | The 4" has one, the 4-11/16 does not.                                                                                                                           |
| 9   | `4" round blank cover`                  | Closes an octagon/round box (abandoned fixture, junction). Nothing does today.                                                                                  |
| 10  | `Weatherproof blank cover, single-gang` | Closes a WP/FS box. Only device covers exist today.                                                                                                             |
| 11  | `Weatherproof round box`                | 4" round bell box for exterior fixtures and cameras.                                                                                                            |
| 12  | `PVC junction box, 4x4`                 | Nonmetallic JB for PVC runs, outdoors and underground. Nothing PVC exists.                                                                                      |
| 13  | `PVC junction box, 6x6`                 |                                                                                                                                                                 |
| 14  | `PVC junction box, 8x8`                 |                                                                                                                                                                 |
| 15  | `PVC junction box, 12x12`               |                                                                                                                                                                 |
| 16  | `PVC weatherproof box, single-gang`     | The PVC FS box — solvent-weld hubs, no bonding needed.                                                                                                          |

### Gaps — Tier 2 (common enough; recommend in the same change), 17 rows

| #   | Proposed name                                    | Why                                                                                                                                   |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 17  | `4-11/16" square raised cover, 2-gang decorator` | Two GFCIs on one exposed box.                                                                                                         |
| 18  | `4-11/16" square raised cover, two duplex`       | Two duplexes on one exposed box.                                                                                                      |
| 19  | `4" square mud ring, fixture`                    | Round-opening ring for a fixture on a 1900 in a ceiling.                                                                              |
| 20  | `4" round extension ring`                        | Deepens an octagon/round box after a ceiling is furred.                                                                               |
| 21  | `Weatherproof blank cover, double-gang`          | Pairs with the shipped 2-gang WP box.                                                                                                 |
| 22  | `Weatherproof lampholder cover`                  | Keyless/porcelain cover on a WP round or 1-gang box.                                                                                  |
| 23  | `1/2" FS cast box, 2-gang`                       | 2-gang cast box; FS only (FD 2-gang is rarer).                                                                                        |
| 24  | `3/4" FS cast box, 2-gang`                       |                                                                                                                                       |
| 25  | `6x6 pull box, NEMA 3R`                          | Outdoor rated. Existing squares get a "Screw cover, NEMA 1 (indoor)." description.                                                    |
| 26  | `8x8 pull box, NEMA 3R`                          |                                                                                                                                       |
| 27  | `12x12 pull box, NEMA 3R`                        |                                                                                                                                       |
| 28  | `Single-gang box, deep`                          | The 22+ cu in plastic box a GFCI or smart switch needs.                                                                               |
| 29  | `Double-gang box, deep`                          |                                                                                                                                       |
| 30  | `Box support bracket`                            | Stud-to-stud bracket that holds a box between studs (commercial metal stud). Grid box bracket is the T-bar version and already ships. |
| 31  | `Floor box cover`                                | The flip-lid/brass cover; the shipped Floor box does not say whether it includes one — check its description while building.          |
| 32  | `Octagon box, 2-1/8" deep`                       | Metal octagon depth split, same reason as #1.                                                                                         |
| 33  | `Masonry box, triple-gang`                       | Completes the masonry pair.                                                                                                           |

### Tier 3 — hold, name them so they are a decision not an omission

- More pull-box sizes (10x10, 18x18, 30x30+). **Changes what `pullBoxFor`
  proposes** — a 1-1/2" angle pull needs 9" and would move from 12x12 to 10x10
  — so it is a takeoff decision as much as a catalog one.
- NEMA 4X / stainless / fiberglass enclosures; hinged-cover enclosures.
- Concrete ring (slab/deck) boxes and their covers.
- Adjustable-depth device boxes; FS/FD tee-through (FST/FDT); 1-1/4"+ FS.
- Masonry deep variants; old-work 4-gang.

### How it would be built (same shape as the lighting audit, `b15df02`)

1. Rows in `server/seed/materials/boxes.ts`, `costPerUnit: UNPRICED`, category
   `Boxes`; slang via `aliases()` — "1900", "deep", "industrial cover",
   "handy box cover" etc. — and **no alias that is another row's name**
   ("mud ring" alone is a name substring; the alias-hygiene test will say).
2. Descriptions on the existing pairs a user could pick wrong (depth, gang,
   NEMA 1 vs 3R), same pattern as `PLASTIC_NOTE` / `METAL_NOTE`.
3. `shared/materialCommonness.ts`: mark #1, #2, #6 "common" so "1900", "mud
   ring" and "raised cover" searches lead with the everyday part.
4. Run the size-order test (`server/materialOrder.test.ts`) — a suffix like
   `, 2-1/8" deep` after a leading size is exactly what tripped the dual-size
   parser in the lighting audit. `pnpm tsx scripts/categoryAudit.mts` and
   `pnpm tsx scripts/searchSpotCheck.mts` before and after.
5. Regenerate the pricing sheet (`pricing/buildPricingSheet.mts`) in the same
   commit, and check `pricing/movedFromSheet.ts` for any of these names already
   in the sheet under another spelling (fold, don't duplicate).
6. Stop `pnpm dev` while editing seed files (CLAUDE.md: tsx-watch reseeds
   mid-edit). `pnpm check`, then the catalog suites on `bidrender_test_clean`.
7. No schema, no migration, no rename. CHANGELOG entry in the same commit.

Expected count after tiers 1+2: **1,237 + 33 = 1,270**.

### Questions for the owner (recommended answer first)

- **A. Depth split on 4" square and metal octagon?** _Recommend yes_ — add the
  2-1/8" as a new row, describe the existing one as 1-1/2". Box fill is why
  it gets bought, and the price differs.
- **B. Mud rings: split by gang, keep depths merged?** _Recommend yes_ — gang
  is functional (a 2-device box needs a 2-gang ring); 1/2" vs 5/8" depth is
  matched to the drywall and priced the same, which is why 2026-09-25 merged it.
- **C. Raised covers: which set?** _Recommend_ 4 on the 4" (duplex, single
  toggle, decorator, two toggle) and 2 on the 4-11/16 (2-gang decorator, two
  duplex).
- **D. PVC junction boxes: 4x4, 6x6, 8x8, 12x12?** _Recommend yes_, as their
  own rows rather than a "PVC" variant of the steel pull boxes, so
  `pullBoxFor` keeps proposing the steel ones.
- **E. Pull boxes: NEMA 3R versions of 6x6/8x8/12x12, and no new square
  sizes?** _Recommend yes_ — new sizes change the takeoff's proposals (Tier 3).
- **F. Brand names as aliases (carlon, raco, steel city, red dot, bell,
  crouse hinds, garvin)?** _Recommend yes_, aliases only — same as the lighting
  audit; names stay generic.
- **G. Conduit bodies beyond LB (LL, LR, T, C) — this lane or separate?**
  _Recommend separate, and T first._ They belong on Conduit Fittings, not
  Boxes; the takeoff spec is already waiting on T bodies. All four across the
  LB generator's 5 raceways × 9 sizes is **180 rows → ~1,450, within 50 of
  the 1,500 tripwire.** T alone is 45.
- **H. Scope: Tiers 1 + 2 now, Tier 3 held?** _Recommend yes_ (~33 rows).

---

## 4. T conduit bodies at a branch tee — ROWS BUILT, wiring waits on Track A

Owner's direction: separate from the boxes job, T first (§ 3 question G).

> **2026-09-27: the owner accepted T1–T6.** The 45 catalog rows are built on
> `track-c` (1,270 → **1,315**), named by `tBodyName` in
> `shared/runFittingMaterials.ts`, with the description "Priced with its cover
> and gasket." The takeoff wiring is NOT built. It needs Track A's `teeBody`
> role first, and it is itemised in `todo.md` under "T bodies at a tee".
> The search sweep was unchanged by the rows.
>
> **One correction to T3 below:** it says the body is priced with its cover
> "the way the LB row is today". The LB rows do not actually say that either
> way; nothing records it. The T rows now say it. The LB wording is left for
> the covers decision (todo.md, "LB covers and gaskets"), planned in § 5.

### What already exists, and what is already decided

- **The tee model reserves it.** `TEE_FITTINGS = ["box", "body", "mark"]`
  (`shared/runNetwork.ts`). `body` is described there as "RESERVED: the
  catalog ships none yet", so nothing offers it and a stored one counts as
  unanswered ("At least N tee boxes … no box chosen — not counted").
- **takeoff-spec.md, D20 answer 3:** the fitting at a split is "a sticky
  toolbar choice, remembered like D3's run type", and "T bodies wait for
  catalog rows". This plan builds that. It does not reopen D20.
- **todo.md:** "T bodies at a tee … Add the rows (with slang: 'tee body',
  'T condulet') and offer it in the snap". And separately, "LB covers and
  gaskets, LL/LR/T/C bodies and PVC sweeps are not in the catalog".
- **The LB is the template.** `lbName(size, family)` builds
  `1/2" EMT LB conduit body`; the conduit generator ships one per family ×
  trade size (5 × 9 = 45); `materialsCatalog.test.ts` fails if any name the
  lookup can ask for is missing. `lbHubsTakeConnectors` (EMT yes; rigid, IMC
  and PVC no) decides whether pipe into the hubs takes a connector.
- **What the snap does today:** `client/src/lib/legSnap.ts` always answers
  `fitting: "box"` for a tee (or `mark` on a counted mark). There is no
  toolbar choice between box and body yet.
- **Bid lines are keyed by run type + role** (`runMaterialRole`), and the
  roles are a DATABASE ENUM (`RUN_MATERIAL_ROLES`, extended by 0084 and 0085).
  A run type with some box tees and some body tees needs two lines, so a body
  cannot ride on the `teeBox` role. **This part is a schema change, so it
  belongs to Track A.**

### Which rows (catalog — Track C)

Where T bodies are commonly used, by raceway:

| Raceway     | Common sizes | Notes                                                                                           |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------- |
| EMT         | 1/2" – 2"    | Set-screw or compression hubs are also sold; the lookup, like the LB, prices one body per size. |
| Rigid       | 1/2" – 4"    | Threaded, Form 7/8. The full range is common.                                                   |
| IMC         | 1/2" – 4"    | Uses the same threaded bodies as rigid; own row to match the LB lookup.                         |
| PVC Sch 40  | 1/2" – 4"    | Solvent-weld. Sch 80 pipe glues into the same bodies.                                           |
| PVC Sch 80  | 1/2" – 4"    | Own row to match the LB lookup, as above.                                                       |
| Flex / LFMC | none         | Flex turns itself and has no LB today (`pullPointKindFor`); a tee on flex stays a box.          |

**Recommended: match the LB exactly, 5 families × 9 sizes = 45 rows**, named
by a new `tBodyName(size, family)` → `1/2" EMT T conduit body`. The case for
all nine sizes rather than only the common ones is the lookup. Every size a
raceway comes in resolves to a row, so choosing "body" never lands on a size
that cannot be priced. The rare large EMT sizes cost a few catalog rows and
nothing else. Catalog: 1,270 → **1,315**, well inside the 1,500 tripwire.

Slang (per `server/seed/materials/types.ts`): "tee body", "t body",
"condulet", "access fitting", "pull", plus the family and size slang the LB
already uses, and the § 3 brand aliases where they fit ("crouse hinds" on
rigid/IMC, "carlon" on PVC). The search sweep must still lead "lb" with the LB
rows and "tee" with the T bodies. Run `scripts/searchSpotCheck.mts` before and
after, and `server/materialSearchRank.test.ts`, which caught a name-order
fault in § 3.

### How the branch-leg takeoff uses them

1. **The choice.** A sticky toolbar choice, "Tee: box / T body", remembered
   like D3's run type (D20 answer 3). The snap stops hard-coding `"box"`: it
   returns the current choice. Default stays **box**. Snapping onto a counted
   mark still wins as `mark`, whatever the choice.
2. **What it buys.** One T body per tee, owned by the same run type
   `teeBoxOwners` already picks. `materialNameFor(raceway, "teeBody")` →
   `tBodyName(size, family)`; flex → null, and the tee says so.
3. **No cover line for a body tee.** The body is priced with its cover and
   gasket, the way the LB row is today (question T3). `teeCover` counts only
   box tees.
4. **Connectors follow the hub rule, not the box rule.** At a body tee, each
   leg end takes a connector only when `lbHubsTakeConnectors` says so (EMT
   yes; rigid, IMC and PVC no), the same rule an LB already follows.
   `countConnectors` needs to know WHICH fitting stands at a tee node, not just
   that it is a tee. Pass the tee's fitting through with the node, not a
   second lookup, and say it in the sentence: "1 T body (3 into the hubs)" or
   "(none — the pipe goes straight into the hubs)".
5. **A mismatched tee.** A T body is one size and one kind each way. When the
   legs meeting at a tee differ in size or family, the snap offers **box**
   only, and says why in the tee's own sentence. A tee already stored as a
   `body` that later becomes mismatched (a leg's run type changed) counts as
   **unanswered**, "at least", never as a quiet box nobody chose. Same rule
   as `countTeeBoxes` today.
6. **Elbows.** Unchanged: the tee is a node, so the corner the fitting turns
   is not also an elbow. This already holds for a box tee.
7. **Box fill.** Not checked, the same stance as the tee box and conduit fill
   (`teeBoxFor`: "never").

### Order of work (three deploy steps, per CLAUDE.md)

> **2026-09-29, owner's answer: the migration adds `teeBody` ONLY.** Not
> `ll` / `lr` / `cBody` for a pull point (§ 7, L5) — those get their own
> additive migration when somebody builds that feature, so the enum never
> carries roles nothing writes. File: `drizzle/0096_tee_body_role.sql`,
> rehearsed on a restored live backup before staging.

1. **Track A: additive migration**, appending `teeBody` to
   `bid_line_items.runMaterialRole`. Appended, so every stored value keeps its
   index, like 0084/0085. No UPDATE. It goes out BEFORE the code.
2. **Track C: catalog rows**: the 45 bodies, `tBodyName` in
   `shared/runFittingMaterials.ts`, and a test asserting every raceway the
   lookup reads has its body (the "ships a 90, a 45 and an LB" test grows a T).
   Rows alone are inert, so this can ship ahead of step 3.
3. **Code** (owner to assign the track): the `teeBody` kind in `TEE_KINDS` /
   `FITTING_WORDS`, `teeFittingCounts` splitting box / body / mark, the
   connector rule, the toolbar choice and the snap, the mismatch sentence.
   Tests in `server/branchLegs.test.ts` / `runFittings` for: a body tee on
   EMT (3 connectors), on rigid (0), no cover line, a mismatched tee refused,
   and a mixed run type (2 box tees + 1 body tee → two lines).
4. **Step 3 of the deploy is empty**: nothing rewrites an existing meaning.
   Every stored `body` today is already "unanswered", and after the change it
   is counted, which is the fix rather than a silent re-price. **Before
   deploying, count stored `fitting = 'body'` rows in production.** If any
   exist, their bids will gain a line, so the owner decides whether that is
   wanted. Expected: 0, because nothing offers `body` today. If the count is
   not 0, stop and find out why before going on.

### Questions for the owner (recommended answer first)

- **T1. Which sizes?** _Recommend all nine sizes × five families (45)_, to
  match the LB so every choice prices. The alternative, 1/2"–2" only (30),
  leaves "body" unpriceable on larger pipe.
- **T2. One row per family, or share bodies (rigid = IMC, PVC 40 = PVC 80)?**
  _Recommend one per family_, like the LB. Sharing means teaching the lookup
  an alias table to save a handful of rows.
- **T3. Cover and gasket: in the body's price, or their own rows?**
  _Recommend in the body's price for now_ (description: "Priced with its
  cover and gasket"), matching how the LB row is used today, and decide LB
  and T covers together under the open todo item. Separate cover rows are
  per size and shared across LB/LL/LR/T/C, so they belong in that job.
- **T4. Default choice for a new tee: box or body?** _Recommend box_, as
  today. It is what D20 specified, and body stays one click away and sticky.
- **T5. Mismatched tee: refuse body, or allow it with a warning?**
  _Recommend refuse_ (box only, with the reason shown). Reducing T bodies are
  not a stocked item, so an estimate built on one is a part nobody can buy.
- **T6. LL, LR and C bodies: same job or later?** _Recommend later._ Nothing
  in the takeoff proposes them yet, so they would be rows nothing uses.
  Adding them later is +135 rows (~1,450).
  **Overridden 2026-09-28 by § 7:** the owner asked for the rows anyway, for
  adding by hand. Built, 1,320 → 1,455. The takeoff still proposes none of
  them (§ 7, L5).

---

## 5. Conduit body covers — one rule for every body shape

> **BUILT 2026-09-27 on `track-c`.** The owner accepted C1 and C2 and said
> not now to C3. The 45 LB rows carry "Priced with its cover and gasket." from
> one constant shared with the T rows; `materialsCatalog.test.ts` fails on any
> "… conduit body" row without it (checked red with the LB description
> removed: exactly the 45 LB rows). The pricing sheet has a Notes column
> beside Name, filled from every shipped description (195 generic rows).

Plan only, 2026-09-27. Answers the covers half of the open todo item "LB
covers and gaskets, LL/LR/C bodies and PVC sweeps".

Measured on `track-c` at `232e188`, by importing `BASELINE_MATERIALS` and
filtering: **1,315 rows**. If a re-run prints a different total, stop and find
out why before acting on anything below — either this section is stale or the
branch is not where it was.

### What is in the catalog today

| Shape                  | Rows | Name (`shared/runFittingMaterials.ts`)  | Description                         |
| ---------------------- | ---- | --------------------------------------- | ----------------------------------- |
| LB                     | 45   | `lbName` → `1/2" EMT LB conduit body`   | **none**                            |
| T                      | 45   | `tBodyName` → `1/2" EMT T conduit body` | "Priced with its cover and gasket." |
| LL, LR, C, SLB, others | 0    | —                                       | held by the owner (T6)              |

No cover, gasket or body blank-cover row exists anywhere in the catalog
(searched names, aliases and descriptions for "cover", "gasket", "body",
"condulet"; every hit was a box cover, wall plate or the two body families
above). The pricing sheet drops `Conduit body, 4" LB` on purpose
(`pricing/movedFromSheet.ts`, "No raceway type").

**How the takeoff already uses them:** one `lb` bid line per LB pull point and
**no cover line** — `RUN_MATERIAL_ROLES` has `lb` and `pullBox` and no cover
role for either. The T body tee in § 4, step 3 was specified the same way ("No
cover line for a body tee"). So the takeoff has always behaved as if the cover
is in the body's price. Only the words are missing on the LB.

### Recommendation: every body is priced WITH its cover and gasket

One rule for LB, T and every shape added later (LL, LR, C): **a conduit body
row is the complete fitting — body, cover and gasket — at one price.** No
separate cover rows.

- **A body is never installed without its cover.** Separate cover rows mean a
  second line the takeoff must add for every body, per size, per shape. Miss
  it once and the bid is short a part with nothing on screen to say so. One
  row cannot be half-counted.
- **It is what the takeoff already does.** Separate rows would need a new
  cover role, which is a database enum change (Track A) plus a deploy step, for
  no difference in the total.
- **It matches how most are sold.** EMT die-cast and PVC bodies come with
  cover and gasket in the box. Cast rigid/IMC bodies are often listed body and
  cover separately at the counter; the estimator adds the two and types one
  number. The description tells them to, which is the whole fix.
- **Both directions stay open (CLAUDE.md, "as manual or as automated").**
  Anyone who wants covers as their own line can add their own material. The
  shipped catalog just does not require it.

Gasket wording: a dry-location body is often fitted without one. "Priced with
its cover and gasket" is still the right instruction for the pricer — the
gasket is cents and the rows are generic across locations. Keep the T wording
exactly, so both shapes read the same.

### Every row that would change — 45 rows, description only

The 45 LB rows gain the description **"Priced with its cover and gasket."**,
set once on the `LB conduit body` entry in `FITTINGS`
(`server/seed/materials/conduit.ts`), the way the T entry already carries it.
5 families × 9 trade sizes (1/2", 3/4", 1", 1-1/4", 1-1/2", 2", 2-1/2", 3", 4"):

| Family        | Rows                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| EMT           | `1/2" EMT LB conduit body` … `4" EMT LB conduit body` (9)                     |
| PVC Sch 40    | `1/2" PVC Sch 40 LB conduit body` … `4" PVC Sch 40 LB conduit body` (9)       |
| PVC Sch 80    | `1/2" PVC Sch 80 LB conduit body` … `4" PVC Sch 80 LB conduit body` (9)       |
| rigid conduit | `1/2" rigid conduit LB conduit body` … `4" rigid conduit LB conduit body` (9) |
| IMC           | `1/2" IMC LB conduit body` … `4" IMC LB conduit body` (9)                     |

**Unchanged:** the 45 T rows (already say it). No renames, no new rows, no
migration, no retirement. The catalog stays at 1,315.

It reaches every database on the next start with nothing else to do:
`backfillMaterialMetadata` re-stamps `description` on baseline rows
(`server/db.ts` ~line 2053), scoped to shipped rows only, so a company's forked
LB keeps whatever it says.

Also in the same change:

- Rewrite the `FITTINGS` doc comment in `conduit.ts` to state the rule for all
  bodies, and say LL/LR/C follow it when they come.
- A test in `server/materialsCatalog.test.ts`: every row whose name ends
  `conduit body` carries the description. That makes the rule structural — an
  LL/LR/C family added later without it goes red.
- Close the covers half of the todo item; LL/LR/C and sweeps stay open.
- Update § 4's note ("The LB wording is left for the covers decision") to
  say it is decided.
- CHANGELOG line.

### The pricing sheet does not show descriptions

`pricing/rows.json` carries category, name, size, type, unit, brand, job —
**no description.** Whoever prices the 90 body rows cannot see "with its cover
and gasket", and a bare-body price from a rigid catalog would go in looking
complete. That is the one place this rule can quietly fail. See C2.

### Questions for the owner (recommended answer first)

- **C1. One rule: every body priced with its cover and gasket, no separate
  cover rows?** _Recommend yes._ 45 LB descriptions, nothing else.
- **C2. Show the description in the pricing sheet (a Notes column)?**
  _Recommend yes, in the same change._ A small edit to
  `pricing/buildPricingSheet.mts`, and it helps every other described row too
  (FS/FD, NEMA 1/3R, plastic/steel, floor box without cover).
- **C3. Replacement covers (for a body already in the wall) as their own
  rows?** _Recommend no, not now._ Service work only, and one per size × shape
  × family is 90+ rows nothing proposes.

---

## 6. Boxes — what is left after Tiers 1 + 2

> **BUILT 2026-09-27 on `track-c`: Tier 2.5 and the 8 description fixes**
> (owner: B1 yes; B2 hold Tier 3, concrete ring boxes first; B3 hold).
> Catalog 1,315 → **1,320**, Boxes 85 → **90**, pricing sheet 1,442 → 1,447
> generic rows. The search sweep moved in one place only: a bare "cover" still
> leads with `4" square blank cover`, and the four handy box covers now take
> places 3–5 where `4" round blank cover` and two 4-11/16" covers were.
> Tier 3 below is unchanged and held.

Plan only, 2026-09-27. Measured on `track-c` at `232e188` by importing
`BASELINE_MATERIALS`: **85 rows on the Boxes shelf**, 1,315 in the catalog. If
a re-run prints different numbers, stop and find out why before acting.

### Tier 2.5 — small, and a real hole (recommend next), 5 rows

| #   | Proposed                                                                                                            | Rows | Why                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Handy box cover, blank`, `Handy box cover, duplex`, `Handy box cover, single toggle`, `Handy box cover, decorator` | 4    | **`Handy box` ships with no cover at all**, and the 4" square raised covers do not fit it. A handy box on a bid today cannot be finished. |
| 2   | `Siding mounting block`                                                                                             | 1    | Every exterior light or receptacle on vinyl siding. Nothing in the catalog is one (searched "siding", "mounting block").                  |

### Description-only fixes — 0 new rows, 8 rows touched (recommend with 2.5)

Tiers 1+2 described some pairs and not their siblings, so the same question is
answered on one row and not the next:

- `4-11/16" square box` — says no depth, while `4" square box` says 1-1/2".
  Recommend "2-1/8\" deep.", which is how it is normally bought.
- `4x4 pull box`, `16x16 pull box`, `24x24 pull box` — no NEMA wording while
  6x6/8x8/12x12 say "Screw cover, NEMA 1 (indoor)." Recommend that sentence
  alone (no 3R exists at these sizes to point to).
- The four `PVC pull box` rows — recommend "Nonmetallic, NEMA 4X." It is
  already an alias; the description says what the alias implies.

### Tier 3 — still held (from § 3), now with rough counts

| Group                                                      | Rows | Hold reason                                                                                                    |
| ---------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| Concrete (slab/deck) ring boxes, backplate, cover          | 3–4  | Commercial deck pours. **The strongest Tier 3 candidate** — first in line if commercial work is the next push. |
| More pull-box sizes (10x10, 18x18, 30x30)                  | 3    | **Changes what `pullBoxFor` proposes** (a 1-1/2" angle pull moves 12x12 → 10x10). A takeoff decision first.    |
| Pull-box depths (6x6x4 vs 6x6x6 …)                         | 6+   | The lookup keys on side only; depth means teaching it depth.                                                   |
| NEMA 4X steel / stainless / fiberglass / hinged enclosures | 4–8  | Spec-driven; those jobs price from the spec.                                                                   |
| Weatherproof boxes by hub size (1/2" vs 3/4")              | 3–6  | The rows are unsized today; sizing them is a rename plus adds, not just adds.                                  |
| FST/FDT tee-through cast boxes; 1-1/4"+ FS/FD              | 4–6  | Rare.                                                                                                          |
| Adjustable-depth device boxes                              | 2    | An ordinary box plus the shipped extender covers it.                                                           |
| Masonry deep; old-work 4-gang; metal 4-gang                | 3–5  | Rare.                                                                                                          |
| 4-11/16" single-device raised covers                       | 2    | The 4" raised covers already serve one device.                                                                 |

All of Tier 3: roughly 30–40 rows. Headroom to the 1,500 tripwire today: 185.

### How it would be built

Same shape as Tiers 1+2 (§ 3, "How it would be built"): rows in
`server/seed/materials/boxes.ts`, unpriced, slang via `aliases()` ("utility
cover", "industrial cover" on the handy box covers; "siding block", "j block",
"mounting kit" on the block), no alias that is another row's name.
`scripts/searchSpotCheck.mts` before and after, and
`server/materialSearchRank.test.ts` — a new cover row can take the top of a
bare "cover" search, which is exactly what the decorator raised cover did in
§ 3. Regenerate the pricing sheet in the same commit. Stop `pnpm dev` while
editing seed files. No schema, no migration, no rename.

Expected after Tier 2.5: catalog **1,315 + 5 = 1,320**, Boxes **85 → 90**.

### Questions for the owner (recommended answer first)

- **B1. Build Tier 2.5 (4 handy box covers, siding mounting block) plus the
  8 description fixes?** _Recommend yes_ — the handy box is unfinishable
  without it.
- **B2. Tier 3: keep holding?** _Recommend hold_, with concrete ring boxes
  first when commercial deck work comes up.
- **B3. More pull-box sizes?** _Recommend hold until the takeoff decides
  whether `pullBoxFor` should propose them_ — it is a takeoff change wearing a
  catalog row's clothes.

---

## 7. LL, LR and C conduit bodies — BUILT 2026-09-28

> **BUILT 2026-09-28 on `track-c`, owner accepted L1–L5.** Measured after:
> catalog **1,455**, Conduit Fittings **518**, bodies **225**, pricing sheet
> **1,582** generic rows (0 typed prices before regenerating; 135 added, 0
> removed, 0 changed). L2 as planned: the sweep matched the prototype line
> for line. **L1 was traced and the plan's guess was wrong:** the alias map
> was never consulted. The typed "c" already scored tier 3 on every body
> through "conduit", above anything an alias reaches, so the fix is in
> scoring: a finished one-letter word that only starts a word of the name is
> demoted to tier 5 (`smartSearch.ts`, `finishedLetter`). The sweep is
> unchanged by it; `ALIAS_MAP["c body"]` was left as it was.

Written as a plan, 2026-09-28. **This goes against T6** (§ 4, "LL, LR and C bodies:
same job or later? _Recommend later_", accepted 2026-09-27): the owner has now
asked for the rows. When this is built, T6 and the todo.md item "LL/LR/C
bodies and PVC sweeps" both get a line saying so.

Measured on `track-c` at `e3d20e9` (after pulling `local-dev`) by importing
`BASELINE_MATERIALS`: **1,320 rows**, Conduit Fittings **383**, rows ending
`conduit body` **90** (45 LB + 45 T). Pricing sheet: **1,447** generic rows.
If a re-run prints different numbers, stop and find out why before acting on
anything below — either this section is stale or the branch is not where it
was.

The search results below were MEASURED, not predicted: the 135 rows were added
in a throwaway worktree (since removed, nothing committed), and
`scripts/searchSpotCheck.mts` was run before and after, plus
`materialsCatalog.test.ts` and `materialSearchRank.test.ts`.

### Rows — 135, exactly like the LB and T

Three more entries in `FITTINGS` (`server/seed/materials/conduit.ts`), so the
generator gives each shape to all 5 families × 9 trade sizes, the same as the
LB and T. **3 × 5 × 9 = 135 rows.**

| Shape | Name                                | Slang (beyond the family and size slang every fitting gets) |
| ----- | ----------------------------------- | ----------------------------------------------------------- |
| LL    | `1/2" EMT LL conduit body` … `4" …` | condulet access fitting pull left                           |
| LR    | `1/2" EMT LR conduit body` … `4" …` | condulet access fitting pull right                          |
| C     | `1/2" EMT C conduit body` … `4" …`  | condulet access fitting pull straight through               |

- **Families:** EMT, PVC Sch 40, PVC Sch 80, rigid conduit, IMC. The row is
  keyed by the raceway the body goes on, not the metal it is cast from
  (die-cast, malleable iron, aluminum, PVC) — same as LB and T, and generic
  per the brands rule. No aluminum-conduit family exists to key one to.
- **Sizes:** 1/2", 3/4", 1", 1-1/4", 1-1/2", 2", 2-1/2", 3", 4"
  (`TRADE_SIZES`). No flex: flex turns itself and has no LB either.
- **Description:** `BODY_DESCRIPTION`, "Priced with its cover and gasket.",
  the same constant. The existing test "says every conduit body is priced with
  its cover and gasket" covers them by name ending with no change; in the
  prototype it passed with 225 bodies. Its floor `>= 90` rises to `>= 225` so
  the new shapes cannot vanish unnoticed.
- **Unit / price / category:** each, `UNPRICED`, Conduit Fittings.
- **Name helpers:** `llName`, `lrName`, `cBodyName` in
  `shared/runFittingMaterials.ts` beside `lbName` / `tBodyName`, and the test
  "ships a 90, a 45, an LB and a T body for every rigid raceway" grows all
  three. Nothing in the takeoff calls them yet; they exist so that the day
  something does, the name is built by the function the test checks.
- **No brand aliases** (the T got "crouse hinds" / "carlon"; the LB has none).
  See question L4.

**Catalog 1,320 → 1,455; Conduit Fittings 383 → 518; bodies 90 → 225.**
Headroom to the 1,500 tripwire drops to **45**. See question L3.

**Pricing sheet: 1,447 → 1,582 generic rows.** The sheet takes its rows from
`BASELINE_MATERIALS` and its Notes column from each row's description, so the
new rows arrive with size, type (e.g. `EMT LL conduit body`), unit and "Priced
with its cover and gasket." with no change to `pricing/buildPricingSheet.mts`.
Regenerating overwrites `starter-catalog-pricing.xlsx`: **check it holds no
typed prices first**, as the last regeneration did (0 found then).

### Takeoff — no effect, by design

Nothing in the takeoff proposes, counts or prices LL, LR or C:

- pull points are `lb` or `pullBox` (`PULL_POINT_KINDS`, `shared/runBends.ts`),
  and `pullPointKindFor` only ever answers those two;
- bid lines are keyed by run type + `runMaterialRole`, a DATABASE ENUM with no
  body role but `lb` (and `teeBody`, pending, § 4).

So the rows are inert to the traced-run count. They are for **hand use**: an
estimator adds an LR from the catalog like any other part, or builds it into an
assembly. That is a first-class path (CLAUDE.md, "as manual or as automated"),
and it is why the rows are worth shipping before the takeoff knows about them.
Offering "LB / LL / LR / C" at a pull point needs a new role in the enum — a
Track A migration and a three-step deploy — and is NOT in this job. See L5.

### Search — two measured problems, one fix known, one not

**1. The C body wins bare body searches on the alphabet.** Within a tie the
name decides, and `C conduit body` sorts before `LB conduit body` (and before
`connector`). With the rows added and nothing else changed, the app-order
sweep moved:

| Query                                                 | Today                           | With the rows only                   |
| ----------------------------------------------------- | ------------------------------- | ------------------------------------ |
| `condulet`, `conduit body`, `access fitting`          | LB first                        | **C first** (C sizes fill the top 5) |
| `1-1/4 rigid` (3 spellings), `2 inch imc`, `4 pvc 80` | pipe, 90, 45, connector, …      | pipe, 90, 45, **C body**, connector  |
| `ll`, `lr`                                            | 90-degree elbows (no LL/LR yet) | LL / LR first — the point            |
| `1 rigid lr`, `1/2 emt ll`                            | elbow first                     | LR / LL first — the point            |
| `lb`, `tee body`, `elbow`, `3/4 emt 90`               | —                               | unchanged                            |

The pinned tests all still PASS with this regression, because their `search()`
is raw smartSearch without the app's role grouping. That is the gap, and the
sweep is what saw it.

**Fix (measured):** the one the 90 got over the 45 — mark every LB `"common"`
in `rigidRacewaysAndTheirNineties()` (`shared/materialCommonness.ts`). The LB
is the body nearly every job buys. Measured with it:

- `condulet`, `conduit body`, `access fitting`: **LB first again.**
- On the 7 bare size+family queries in the sweep (`1/2 emt`, `3/4 pvc`,
  `1-1/4 rigid` ×3 spellings, `2 inch imc`, `4 pvc 80`) the LB moves up to
  3rd, ahead of the 45, and on five of them the C body sits 5th; connector
  and coupling drop two places. That changes searches that work today — L2.
- Pin `condulet` / `conduit body` → LB first and `ll` / `lr` → LL / LR first
  against the ROLE-RANKED order (`rankMaterialHits`), since the raw order is
  what missed this.

**2. "c body" cannot find the C body.** A one-letter word does not
discriminate: `c body`, `2 pvc c body` and `c condulet` return all five shapes
tied, and ranking falls to the alphabet (with the LB fix, LB first;
`2 pvc c body` puts the C 3rd). Tried in the prototype and it did NOTHING:
pointing `ALIAS_MAP["c body"]` at "straight through" (the C rows' slang). So
either the phrase never reaches the alias table or one-letter words are
dropped before it — not yet traced. See L1.

### How it would be built (one commit; Track C rules — no schema, no migration)

1. Stop `pnpm dev` (seed edits under `tsx watch`, CLAUDE.md).
2. `scripts/searchSpotCheck.mts` BEFORE, saved.
3. `FITTINGS` + 3 entries; `llName` / `lrName` / `cBodyName`; rewrite the
   `FITTINGS` doc comment (T6 overridden, LL/LR/C shipped).
4. LB `"common"` (if L2 = yes), and the L1 fix.
5. Tests: the rigid-raceway test grows LL/LR/C; body floor 90 → 225; the
   pinned role-ranked searches above.
6. Sweep AFTER, diffed against step 2 — every moved line must be one listed in
   this section. If anything else moved, stop and find out why.
7. `pnpm check`, `pnpm test` (against `bidrender_test_clean`).
8. Check the xlsx for typed prices; regenerate the pricing sheet.
9. § 4 T6 and todo.md say this overrides "later". CHANGELOG line.

Expected after: catalog **1,455**, Conduit Fittings **518**, bodies **225**,
pricing sheet **1,582** generic rows. If a count differs, stop and find out
why before going on.

### Questions for the owner (recommended answer first)

- **L1. How should "c body" find the C body?** _Recommend a small search fix_:
  trace why the `ALIAS_MAP["c body"]` phrase does not take effect, make it
  reach "straight through", and pin it with a test. Fallback if that proves
  invasive: ship without it — "straight through", the full name and browsing
  the family still find it — and record the gap in todo.md.
- **L2. Mark the LB "common" so it leads bare body searches?** _Recommend
  yes._ Without it the C body leads "condulet" and "conduit body" purely on the
  alphabet. The cost: bare pipe searches ("1-1/4 rigid") show the LB 3rd and
  push connector/coupling down two places.
- **L3. Tripwire headroom drops to 45.** _Recommend leaving 1,500 where it is
  for this job._ It still fits; raise it deliberately, with the
  library-response measurement its comment asks for, when the next family
  needs it.
- **L4. Brand aliases on LL/LR/C ("crouse hinds", "carlon") like the T?**
  _Recommend no_, to match the LB and keep a brand query from surfacing 135
  more rows. "crouse hinds tee" already works.
- **L5. Offer LL/LR/C at a pull point in the takeoff?** _Recommend not now._
  It needs a new `runMaterialRole` (Track A migration, three-step deploy) and
  a way to know which side the pipe turns to, which the trace does not record.
  The rows are useful by hand without it.
  _2026-09-29: the `teeBody` migration (0096) deliberately does NOT add these
  roles too — see § 4 "Order of work". This stays its own migration._

---

## 8. PVC sweeps — plan, 2026-09-29

> **ROWS BUILT 2026-09-29 on `track-c`.** Owner accepted the plan with S5
> (take "sweep" off the PVC 90s — done for PVC only; EMT, rigid and IMC keep
> it, since they ship no sweep rows). Build order: rows, then the run-type
> 90/45 pickers (S6) — but first a measured test of how a traced sweep counts
> (§ 8a). Measured after: catalog **1,511**, Conduit Fittings **574**,
> pricing sheet 1,582 → **1,638** generic rows (0 typed prices before).
> Spot-check: one line moved in the standard sweep ("4 pvc 80" 5th place, C
> body → 45 sweep; both there on the alphabet). **Known cost, accepted in the
> test:** a bare "sweep" leads with a 45 ("45" < "90"); marking the 90 sweeps
> "common" would fix it and push the LB down on every bare PVC pipe search.
> "2 pvc 90 sweep" and "2 pvc 90" both lead with what they name.

Plan only. Nothing here is built. Track C rules: no migration, no schema
change, no deploy.

Measured on `track-c` at `d9fa1d8` (= `origin/local-dev`) by importing
`BASELINE_MATERIALS`: **1,455 rows**, Conduit Fittings **518**. The tripwire
is now **3,000** (`CATALOG_ROW_LIMIT`, raised in `cadcdd3`), so headroom is
**1,545**. If a re-run prints different numbers, stop and find out why before
acting — either this section is stale or the branch is not where it was.

### This overrides an earlier answer — say so in both places when built

**D19 answer 2** (`references/takeoff-spec.md`, 2026-09-26): "45° elbows only
were added to the catalog; sweeps wait for an Underground category." The same
line is in `todo.md` ("PVC sweeps are not in the catalog"). This plan proposes
shipping sweeps **on the Conduit Fittings shelf now**, without waiting (S1).
Why:

- `materials.category` is a MySQL enum (`MATERIAL_CATEGORIES`). An Underground
  shelf is a migration — Track A — and `ASSEMBLIES_PLAN.md` ties it to the
  `parentId` release, which is not scheduled.
- **Underground is already an axis, and it is not the category.** D8 made it a
  LOCATION tag on runs and stamps. A sweep is a conduit fitting by its shape;
  where it is buried is the run's location. Two axes for one fact is the
  mistake CLAUDE.md warns against with `trade` vs `projectType`.
- **Moving later is free.** `backfillMaterialMetadata` re-stamps `category`
  from the seed on every start (`server/db.ts`, ~line 2051), so if an
  Underground shelf ever lands, moving the sweeps is a one-word seed edit with
  the same ids.

When accepted, D19 answer 2 and the todo item each get a line saying this
replaced them. The todo item already points here.

### What already exists

- Every PVC family (Sch 40, Sch 80) ships a **standard-radius factory 90 and
  45** at all nine trade sizes (`2" PVC Sch 40 90-degree elbow`), from
  `FITTINGS` in `server/seed/materials/conduit.ts`. Those stay what they are.
- The 90's slang includes the word **`sweep`** (`"ell bend sweep factory"`).
  Once a row NAMED "sweep" exists, that alias points one material at another's
  name — the alias rule in CLAUDE.md, which `materialsCatalog.test.ts` checks.
  See S5.
- The takeoff: every traced corner and every counted end drop on a PVC run
  becomes a factory 90 or 45 (`bendMethodFor` — "PVC always takes factory
  elbows"), found by `elbowName(size, family, angle)`.
- **`takeoff_run_types.elbow90MaterialId` / `elbow45MaterialId` already
  exist** and the server honours them (`server/db.ts` ~line 11865,
  `overrides`; `takeoffRunTypesRouter` accepts them). **The run-type editor
  does not show them** — `RunTypePicker.tsx` exposes the coupling, connector
  and strap overrides only. That finding shapes the takeoff half below.

### Rows

Name: `${size} ${family} ${angle}-degree sweep, ${radius}" radius`, e.g.
`2" PVC Sch 40 90-degree sweep, 36" radius`. **Measured** against
`shared/materialSizeOrder.ts`: the leading trade size is the size key (`2"` →
`[1,6,0,…]`, the same as the elbow), the radius suffix does not trip it, and
sorted, the sweeps sit beside that size's elbow with 24" before 36". Each
radius is its own type group (`materialTypeName`), which is right: they are
not interchangeable.

| Axis      | Recommend                              | Why / held                                                                                                                                                                                                                                     |
| --------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sizes     | 1", 1-1/4", 1-1/2", 2", 2-1/2", 3", 4" | At 1/2" and 3/4" the factory elbow is the bend; nobody buys large-radius sweeps there.                                                                                                                                                         |
| Angles    | **90° and 45°**                        | 30°, 22.5° and 11.25° exist but are occasional, and the bend counter only ever produces 90 and 45 (15–67° → 45), so anything else is hand-added regardless. Held — S3.                                                                         |
| Radii     | **24" and 36"**                        | 36" is the usual utility/service spec, 24" the usual general-underground one. 18" (small sizes) and 48" (primary, 4"+) held — S2. **Typical values, not measured here: confirm against the pricing sheet or a supplier list before building.** |
| Schedules | **Sch 40 and Sch 80, symmetric**       | Sch 80 is where a sweep comes up out of grade exposed to damage. Symmetric keeps the generator a loop rather than a list of exceptions. Lean alternative in S4.                                                                                |

**Rows: 7 sizes × 2 angles × 2 radii × 2 schedules = 56.** Catalog
1,455 → **1,511**; Conduit Fittings 518 → **574**; pricing sheet +56 generic
rows. Lean alternative (Sch 80 90° only): 42.

Per row: `unitOfSale: "each"`, `UNPRICED`, Conduit Fittings, slang via
`aliases()` — `sizeAliases(size)`, the family slang, plus "large radius long
radius big bend underground stub up stubup riser utility". **Not "lr"** — that
is the LR conduit body. Description: `Large-radius factory sweep, 36" to the
centreline.` (per radius). Not marked `"common"` in `materialCommonness.ts`:
the standard 90 stays what a bare "2 pvc 90" leads with.

A name helper `sweepName(size, family, angle, radius)` goes in
`shared/runFittingMaterials.ts` beside `elbowName`, and the seed calls it —
the same rule as every other fitting name, so a lookup built later cannot
drift from the seed.

### Takeoff — what is automatic and what is by hand

| Situation                                                     | Today                            | Proposed                                                                                                                                                | Needs                                                        |
| ------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Corner or stub-up drop on a PVC run, nothing chosen           | Factory 90 / 45                  | **Unchanged.** The default stays the standard elbow.                                                                                                    | Nothing                                                      |
| A run type the estimator treats as swept (e.g. "2\" PVC UG")  | Only by a server call; no screen | **Automatic by choice**: show "90s from" / "45s from" on the run-type editor, pick the 36" sweep, and every corner and drop on that type counts sweeps. | Client change only — columns and server exist. No migration. |
| Degrees toward a pull point                                   | 90 per 90                        | Unchanged — a sweep is still 90°.                                                                                                                       | Nothing                                                      |
| 30° / 22.5° / 11.25° sweeps, 48" radius, extra sweeps         | —                                | **By hand**: add the row to the bid or an assembly.                                                                                                     | The rows (30°/22.5° only if S3 says yes)                     |
| Rigid or PVC-coated 90 at a PVC stub-up (utility requirement) | By hand (rigid 90 rows exist)    | **By hand**, or the run type's 90 override pointed at the rigid elbow.                                                                                  | Nothing new                                                  |
| Location tag Underground switching elbows to sweeps by itself | —                                | **Not proposed.** D8's open question says a switch like that must be shown, never silent; a run type per location already does it explicitly.           | —                                                            |

Both directions stay open (CLAUDE.md, "as manual or as automated"): somebody
who never touches run-type overrides still gets factory elbows counted and can
add sweeps by hand; somebody who sets up a "PVC underground" type once gets
sweeps counted on every job.

**Not measured, and worth checking before relying on the automatic path:**
`runBends.ts` merges same-direction turns closer than 3 ft into one bend. A
36"-radius 90 has about 4.7 ft of arc, so an arc traced with clicks more than
3 ft apart may count as two 45s rather than one 90. Trace one on the fixture
bid and read the count. **Measured and fixed 2026-09-29 — § 8a.**

### 8a. A traced sweep counted as two 45s — MEASURED, FIXED 2026-09-29

Owner's instruction: test this BEFORE shipping the run-type pickers, fix it
or say what the fix needs, and add a test that fails without the fix.

**Measured** through `legBends` / `countFittings`, a 90° turn traced four
ways at 1/4" = 1'-0" (gap = distance between the two clicks that must merge):

| Traced as               | 24" radius           | 36" radius                     |
| ----------------------- | -------------------- | ------------------------------ |
| one click at the corner | 1 × 90               | 1 × 90                         |
| **the arc's two ends**  | gap 2.83 ft → 1 × 90 | **gap 4.24 ft → 2 × 45 WRONG** |
| ends and middle         | gap 1.53 → 1 × 90    | gap 2.30 → 1 × 90              |
| ends and two between    | gap 1.04 → 1 × 90    | gap 1.55 → 1 × 90              |

(48", which does not ship, also went wrong on "ends and middle": 3.06 ft.)
The degrees toward a pull point were right throughout (45 + 45 = 90); only
the FITTINGS were wrong — and on a type whose 45 is still the standard elbow,
the wrong part as well. The 24" two-click case passed by 0.17 ft.

**Fix — code only, no schema, no Track A.** On a run type whose 90 or 45
override is a sweep, the merge distance becomes that sweep's 90° chord ×
1.25 (`mergeWithinFeetFor`, `shared/runBends.ts`): 5.30 ft for 36", 3.54 ft
for 24". The radius is read off the chosen row's name (`sweepRadiusInches`,
the inverse of `sweepName`). Every type without a sweep keeps exactly 3 ft,
so no existing count moves — the 124 existing bend, fitting and network
tests pass untouched. Both paths carry it: the bid (`countFittings`, whose
`bends` argument now REQUIRES `mergeWithinFeet`) and the run panel
(`runBendsFor`, whose per-type context requires it too), so the two cannot
disagree.

**Accepted cost:** on a sweep type, two separate same-direction 45s closer
than the reach count as one 90. At that spacing the trace cannot tell them
from one sweep. A test pins that two 45s 6 ft apart still count as two.

**Test:** `server/runBendsSweep.test.ts`, 16 cases. Run against the code
with the old 3 ft still in the comparison: **3 failed** — exactly the 36"
two-click case through the bid, the panel, and the two agreeing. After the
fix: 16 passed.

**Not covered:** a type on STANDARD elbows with a big arc drawn on the plan
still counts it by the 3 ft rule. That is right when the pipe really is
standard elbows; if a drawn arc is a sweep, the type should say so (S6).

### 8b. The run-type pickers (S6) — BUILT 2026-09-29, looked at

"90° bends" and "45° bends" sit in the run-type editor's existing fittings
fold, after coupling, connector and strap (one fold, rule 1 of "never in
the way"). Empty reads "Standard elbow, from the catalog" — that is what
the takeoff counts then, so empty is not a warning. No migration: the
columns, the router input and the listing already existed.

**Checked in the running app** (bid "Bar layout check", sheet 1, type
`2" PVC Sch 40`, on `bidrender_local_c`), not just the suite:

- A run saved as a 36" sweep traced by its two ends read "90° of bend on
  the drawing (**2 corners**)" before anything was chosen.
- Picked `2" PVC Sch 40 90-degree sweep, 36" radius` through the new slot's
  own search and pressed Save. The same run then read "(**1 corner**)", and
  the side panel's fitting list changed on its own, with no reload: the 90
  line named the sweep, "≥ 2" (this run's 90° + the other run's 131°), and
  the 45 line "≥ 1" (the 131° remainder) — where the old rule would have
  added two 45s.
- The check run was removed and the type's override cleared afterwards, so
  the fixture is as it was.

**Found by looking, and fixed in the same change:** with "Choose fittings
yourself" open, the editor measured **873px tall in a 737px window, with no
scroll — Save sat at y = 957, off the screen.** It was already over with the
original three slots; the two new ones made it worse. The popover is now
capped at Radix's available height and scrolls, the pattern the app's
dropdown and select menus already use; measured after, 616px, Save at y = 708.

**Left as it is, for the owner:** the sentence under a sweep row still says
"At least 2 90° elbows". The kind is called "90° elbow" everywhere
(`FITTING_KIND_LABELS`), so renaming it to "bend" changes wording on every
raceway. Small, but it is a caption saying elbow beside a row that is a
sweep.

**Local database note:** `bidrender_local_c` was 7 migrations behind the
code (0089–0095, Track B's, arrived with the last `local-dev` merge), so the
takeoff screen's queries failed until `scripts/migrate.mts` applied them.
Local only; no file in `drizzle/` was written or changed.

### How it would be built (one commit; no schema, no migration)

1. Stop `pnpm dev` (seed edits under `tsx watch`).
2. `pnpm tsx scripts/searchSpotCheck.mts` BEFORE, saved.
3. `sweepName` plus a sweep generator in `conduit.ts` for the two PVC
   families; take `sweep` off the elbow slang (if S5 = yes).
4. Tests: every sweep the matrix promises exists; pin role-ranked `sweep`,
   `2 pvc sweep`, `36 sweep` → a sweep first, and `2 pvc 90` → the standard
   elbow first.
5. Spot-check AFTER, diffed — every moved line must be a sweep query. If
   anything else moved, stop and find out why.
6. `pnpm check`, then the catalog suites on `bidrender_test_clean`.
7. Check the xlsx for typed prices; regenerate the pricing sheet.
8. D19 answer 2 and the todo item say what replaced them. CHANGELOG line.
9. (Separate commit, if S6 = yes) the run-type editor's "90s / 45s from"
   pickers — then look at the screen, pick a sweep, and read the fitting count
   move.

Expected after step 7: catalog **1,511**, Conduit Fittings **574**. If a
count differs, stop and find out why before going on.

### Questions for the owner (recommended answer first)

- **S1. Ship sweeps on Conduit Fittings now, rather than wait for an
  Underground shelf?** _Recommend yes._ The shelf is a Track A migration with
  no date; Underground is already a location tag; moving shelves later is a
  seed edit.
- **S2. Radii: 24" and 36"?** _Recommend yes._ Add 18" only if the small
  sizes (1"–1-1/2") are routinely spec'd that way on your jobs; 48" held
  (primary and utility jobs price from the spec).
- **S3. Angles: 90° and 45° only?** _Recommend yes._ 30° and 22.5° would add
  56 more rows the takeoff can never count; hand-add a custom row when a job
  calls for one.
- **S4. Sch 80 gets the full set (56 total) or 90° only (42)?** _Recommend
  the full set_ — one loop, and a 45 kick into a riser is not rare.
- **S5. Take "sweep" off the standard PVC elbows' aliases?** _Recommend yes_
  — once sweep rows exist, a bare "sweep" should find sweeps. The cost:
  somebody who calls every PVC 90 a sweep sees the sweeps first, with the
  elbow one query away ("pvc 90").
- **S6. Show the existing 90/45 overrides on the run-type editor, so a type
  can count sweeps automatically?** _Recommend yes, as its own commit after
  the rows._ No migration — the columns and the server path exist. It is a
  screen change rather than catalog, so say whether Track C should take it.
- **S7. Should the Underground location tag switch elbows to sweeps by
  itself?** _Recommend no_ (D8: shown, never silent; S6 covers it
  explicitly).

---

## 9. Boxes Tier 3 — what each group would add, concrete ring boxes first

Measured at `d9fa1d8`: Boxes shelf **90** rows. The owner's B2 (2026-09-27):
"hold Tier 3, concrete ring boxes first". Headroom is no longer the constraint
(1,545 to the 3,000 tripwire); the reasons to hold below are about the takeoff
and search, not size.

### 9a. Concrete ring boxes — first in line, 4–5 rows

> **BUILT 2026-09-29 on `track-c`, 3 rows (B5 as recommended):**
> `Concrete ring, 4" deep`, `Concrete ring, 6" deep` and
> `Concrete ring backplate`. **No cover row — DECIDED by the owner
> 2026-09-29:** a ring is a 4" octagon and the shipped
> `4" round blank cover` (aliased "octagon") fits it. Catalog 1,511 →
> **1,514**, Boxes 90 → **93**, pricing sheet 1,638 → **1,641** (0 typed
> prices).
>
> Search, measured: the standard sweep did not move. Three things found on
> the way, each pinned in `materialSearchRank.test.ts`:
>
> - A "box" alias on the rings put one 4th for a bare "box", ahead of boxes
>   that name the word — and exposed an arrival-order tie
>   (`materialSearchCommonness.test.ts` went red). Alias removed. **Cost:
>   "deck box" now finds nothing** (every typed word must match). "deck
>   ring", "concrete ring" and "pour" find them.
> - On "concrete ring" the backplate led: two typed words stand the role
>   grouping down, so the plate tied the ring and won on the name. The 4"
>   ring is marked "common", the same move as the LB.
> - A bare "ring" leads with the two rings, then "Drywall repair ring", then
>   the mud rings. That is the role rule as designed — a ring box is a
>   product, a mud ring is a box's fitting — and "Drywall repair ring"
>   already led it for the same reason. "mud ring" is unchanged.

For deck pours: a ring nailed to the form with a backplate, and the pipe run
in the pour. Nothing in the catalog is one today (names searched for
"concrete", "deck", "ring": only mud and extension rings, and
`Concrete wedge anchor`).

| #   | Proposed                     | Why                                                                                                                               |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Concrete ring, 4" deep`     | The common depth for a slab.                                                                                                      |
| 2   | `Concrete ring, 6" deep`     | Thicker slabs, more pipe entries.                                                                                                 |
| 3   | `Concrete ring, 3" deep`     | Thin toppings. Optional — B5.                                                                                                     |
| 4   | `Concrete ring backplate`    | Sold separately; a ring without one cannot be poured.                                                                             |
| 5   | `Concrete ring cover, blank` | **Only if the shipped `4" round blank cover` does not fit** — rings are 4" octagon; check a spec sheet before adding a duplicate. |

Depths are typical, not measured here — confirm against the pricing sheet or a
supplier list. Slang: "deck box", "pour box", "slab box", "ceiling ring",
brand aliases "steel city", "appleton" (per F, aliases only). **Takeoff: no
effect** — nothing proposes a box at a stamp; they are hand-added or built
into a "light on deck" assembly. Concrete-tight EMT fittings need nothing new:
the compression style already ships.

### 9b. The rest of Tier 3 (from § 6), and what each costs beyond rows

> **Weatherproof boxes by hub size — BUILT 2026-09-29 on `track-c`** (owner:
> rename the unsized rows to 1/2", no 1", closure plugs yes, "3 hole" /
> "5 hole" as search terms). Five renames through
> `RENAMED_BASELINE_MATERIALS`, same ids: `1/2" weatherproof box`
> single-/double-/triple-gang, `1/2" weatherproof round box`,
> `1/2" weatherproof box, single-gang, PVC`. Four adds: the 3/4" of each
> except triple-gang. Two plugs: `1/2"` and `3/4" threaded closure`.
> Catalog 1,514 → **1,520**, Boxes 93 → **97**, pricing sheet 1,641 →
> **1,647** (0 typed prices before overwriting). Standard search sweep
> unchanged. Found on the way:
>
> - **The plug is named `threaded closure`, not `closure plug`.** With
>   "plug" in the name the pair led a bare "plug" search ahead of Duplex
>   receptacle — the plug-on SPD fault again. "closure plug" and "hub plug"
>   are aliases; "closure plug" still finds them first.
> - **The round box lost its "4 inch" aliases.** Carrying a 1/2" hub size,
>   it broke "a size matches itself, whole" (a "4" search found a 1/2" row)
>   and pushed the 4" square box off "4 inch box"
>   (`materialSearchSizes.test.ts` went red). "wp round box" finds it.
> - **Both single-gangs are "common"**, or "wp box" put the 3/4" double-gang
>   above the 3/4" single-gang.
> - **"3 hole" does not find them.** The search reads "3" as a 3" size and
>   returns one-hole straps. "5 hole" does (after a 500 kcmil lug). The
>   aliases are there; teaching the query side that "N hole" is not a size is
>   a search change, not a catalog one — not done.

| Group                                           | Rows | What it takes beyond rows                                                               | Recommend         |
| ----------------------------------------------- | ---- | --------------------------------------------------------------------------------------- | ----------------- |
| More pull-box sizes (10x10, 18x18, 30x30)       | 3    | **Changes `pullBoxFor`'s proposals** (1-1/2" angle pull 12x12 → 10x10). A takeoff call. | Hold (B3)         |
| Pull-box depths (6x6x4 vs 6x6x6 …)              | 6+   | The lookup keys on side only; depth means teaching it depth.                            | Hold              |
| Weatherproof boxes by hub size                  | 3–6  | Existing rows are unsized: a rename (`RENAMED_BASELINE_MATERIALS`) plus adds.           | **Built** (above) |
| NEMA 4X steel / stainless / fiberglass / hinged | 4–8  | Spec-driven; those jobs price from the spec.                                            | Hold              |
| FST/FDT tee-through; 1-1/4"+ FS/FD              | 4–6  | Rare.                                                                                   | Hold              |
| Adjustable-depth device boxes                   | 2    | An ordinary box plus the shipped extender covers it.                                    | Hold              |
| Masonry deep; old-work 4-gang; metal 4-gang     | 3–5  | Rare.                                                                                   | Hold              |
| 4-11/16" single-device raised covers            | 2    | The 4" raised covers serve one device.                                                  | Hold              |

Built the same way as Tiers 1+2 (§ 3, "How it would be built"): rows in
`boxes.ts`, unpriced, spot-check before and after, pricing sheet regenerated,
no schema.

### Questions for the owner (recommended answer first)

- **B4. What comes next: sweeps (§ 8) or concrete ring boxes (§ 9a)?**
  _Recommend sweeps first_ — they touch every underground job and the takeoff
  can count them (S6); ring boxes are 4–5 rows for commercial deck work only.
  Both are small enough to ship in one commit if you prefer.
- **B5. Ring box depths: 4" and 6", or 3"/4"/6"?** _Recommend 4" and 6"_
  plus the backplate; add 3" if you pour thin toppings.
- **B6. Everything else in Tier 3: keep holding?** _Recommend hold_, with
  weatherproof-by-hub-size next after ring boxes if any.
