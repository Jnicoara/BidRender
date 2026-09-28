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

---

## 5. Conduit body covers — one rule for every body shape

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
