# Extra per-foot items on a traced run (PLAN, 2026-10-08)

> **BUILT 2026-10-08 (Track A): § 9 step 1 and the seed content.** M1–M4 are
> migrations **0135–0138** (`0135_run_type_extras`, `0136_bid_line_extras`,
> `0137_assembly_material_qty_source`, `0138_traced_parts`). Seeded: the ten
> underground types with tape (`server/seed/baselineRunTypes.ts`, labels
> through `shared/undergroundRunTypes.ts`), the 700 type, the seven 700
> fittings, the 700 rename and cover retire, and the picker's "Underground
> (10)" fold (`client/src/lib/runTypeFold.ts`, sorted by SIZE).
> `forkRunType` already copies a type's extras. **Not built, still C's
> server half (step 2):** the extras' footage (`feetForRole`'s `extra` case
> is a tripwire answering 0 — replace it), the 700 fitting family (until
> then a 700 run's fittings say "no catalog match"), `setExtraShared`, the
> extras CRUD, and a resolver for `takeoff_run_type_extras.materialId`
> (`server/forkableReferences.test.ts` lists it as unreviewed). **Not
> touched, B's step 3:** DV34/GR2/GR5 recipes — `qtySource` ships unset on
> every part. Clip spacing ships NULL; no Sch 80 types; 500 series not
> merged (§ 7, Q1–Q3 still open). Record: `deploying.md` § 11.

**Status: plan, plus the column-free counting** — the 700 rules, the
extras' feet and the traced-part fallback, as pure functions with tests on
branch `c-per-foot-logic` (2026-10-08, not merged; `track-c-handoff.md`).
Nothing reads them yet. Written by Track C, on
`c-homerun-wiring`, for the owner's ask of 2026-10-07. The first sketch is in
`todo.md` § "Track A: ONE feature — extra per-foot items on a traced run".

> **REVISED 2026-10-08 with the owner's answers (§ 0).** The first version of
> this plan put the Wiremold 700 cover on a run type as an "extra" and gave
> DV34 two traced parts. The owner overrode both: 700 is a **run type of its
> own**, and DV34 counts only its device, box and plate. Tape is the only
> shipped extra. Where this file and the first version differ, this file
> wins; the old § 7 questions are answered in § 0 and removed.

## 0. The owner's decisions (2026-10-08)

| #   | Decision                                                                                                                                                                                            | Where it lands |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | **Wiremold 700 is NOT an extra.** It is its own run type (surface raceway), picked and traced like EMT, with its own per-foot price, labor and fittings. DV34 counts only device + 700 box + plate. | § 3c, § 3e     |
| 2   | Extras stay a **general** feature. **Underground warning tape is the only shipped extra.**                                                                                                          | § 3a           |
| 3   | Tape goes on **all** underground PVC sizes. None ship today, so underground run types are added.                                                                                                    | § 3b           |
| 4   | Two conduits in one trench: tape is counted **per conduit** for now, labelled **"Shared trench? Set this extra to 0"**.                                                                             | § 3a, M2       |
| 5   | **Waste % applies to tape**, like any other material.                                                                                                                                               | § 3a           |
| 6   | GR2's fixed 10 ft of 2" PVC: **use the traced run when there is one, otherwise keep 10 ft labelled "default length".**                                                                              | § 3d, M3       |

## 1. What the owner asked for

- **Underground warning tape follows the traced trench length.** No trench
  traced: the tape says **"not priced"** — never 1 ft, never $0. GR2 (200A
  underground service) and GR5 (detached garage feeder) get it back that way.
- **Any per-foot item** a shop adds to a run type later works the same way
  (tracer wire, mule tape, pull rope are all already in the catalog by the
  foot).
- **Surface raceway is traced like pipe**, not priced as an add-on to a
  receptacle.
- **Never stuck:** every "not priced" this adds has a fix-it-here button.

### Decisions this builds on (cited so the next reader's search succeeds)

- **D3** (`takeoff-spec.md`): a run says what it is by its TYPE, chosen
  before tracing. Not a form on every run. So extras live on the **run
  type**, and a run never asks about tape. Decision 3 (tape on underground
  TYPES) is D3 applied, and is why the first version's per-run "only where
  Underground" condition is dropped (§ 2).
- **Snapshot freeze** (CLAUDE.md § Architecture): a bid line's price inputs
  are frozen when it is added. A line's quantity may follow the drawing; its
  prices may not.
- **Unset is not zero** (CLAUDE.md § Editing fields, rule 6): no trench is
  a NULL quantity and says "not priced".
- **Labor with $0 material is never fully priced** (2026-10-05). Tape at $0
  is "not priced" by the existing rule; nothing new is needed for that.
- **Never stuck, gap 11** (`never-stuck-plan.md` § 3): a line's fix opens in
  place, writes THIS line, and offers "Also save to my library". This plan
  reuses that panel instead of building a second one.
- **As manual or as automated as the user wants**: somebody who never
  traces must be able to type the trench length on the line. Somebody who
  traces everything must never type it.
- **Customization never in the way** (CLAUDE.md): the run-type palette was
  kept to four on purpose. Eleven new types need a fold (§ 3b).

## 2. What changed from the first version, and why

1. **No "only where Underground" condition on an extra.** The first version
   needed one because no underground run type shipped, so tape would have
   hung off a PVC type used above and below grade. Decision 3 ships
   underground types, so the TYPE says it is underground (D3), and the
   condition — a column, a filter in the footage path and a location read in
   `GroupableRun` — is not needed. A shop that wants one PVC type for both
   forks the underground one. Can be added later, additively, if asked.
2. **No 700 cover extra, no `700 series` traced parts on DV34.** Decision 1.
3. **The bid line can be told "this extra is 0 on this bid"** (decision 4).
   New column in M2.
4. **A traced part can carry a default length** (decision 6). M3's enum
   gains a third value and M4's snapshot freezes the default.
5. **Still true from the first version:** a bid holds only ONE line per run
   type and role (`bid_line_items_bid_runtype_role_uq`), so the index must
   widen for two extras on one type; and a bid line freezes one
   `snapshotMaterialCost`, not parts one by one, so traced parts need their
   own frozen copy.

## 3. How it works

### 3a. Extras on a run type

A run type keeps its one raceway, conductor and ground. It gains a list of
**extras**. Each extra has:

- a material (sold by the foot);
- **feet per foot**: 1.0 for tape;
- **which feet**:
  - `flat` — the traced horizontal length only. Right for tape and tracer
    wire: they lie in the trench, not up the riser.
  - `all` — every installed foot, verticals included. Right for a pull rope
    or mule tape, which goes through every foot of pipe. Nothing shipped
    uses it; it is kept because a shop's extras need both, and it costs one
    enum.

**Arithmetic, one path.** The extras ride the same footage path as the
raceway, so they move when the run moves, and undo, clear and delete move
them too:

- `server/runTypeFootageCore.ts` `groupRunFootage` already sums installed
  and vertical feet per type. Per extra it adds `flat` (installed −
  vertical) or `all`, × feet per foot.
- **Waste (decision 5):** the type's raceway extra % (`conduitExtraPct`,
  else the company's, else the accepted starter) applies to every extra,
  tape included, as bought feet. Labor is on installed feet at the
  material's own labor per foot, the same as the raceway line.
- **Which runs count:** the same `runOnBid` rule as everything else (drafts
  count, suggestions do not). A run on a sheet with no scale is
  `unmeasurableCount`, as today.

**On the bid:** `shared/takeoffBridge.ts` `runTypeRows` emits one row per
extra, role `extra`. `takeoffRunTypes.bridgeForBid` sends it as a run-type
line like the raceway. Send-again, the preview and the totals treat it like
any other role. A $0 extra says "+ material not priced" by the existing
rule, and gap 11's panel fixes it.

**Two conduits in one trench (decision 4).** Each traced run buys its own
tape, so two parallel conduits buy two tapes. Every extra line on the bid
carries a small button under its quantity: **"Shared trench? Set this extra
to 0"**. Tapping it writes `extraFeetPerFoot = 0` on THAT bid line (M2): the
line stays, reads "0 ft — shared trench (set on this bid)", and one tap
undoes it (back to NULL, following the type). It is per bid and per type, not
per run — the honest limit, and the screen says so in the panel ("applies to
every run of this type on this bid"). A per-run "shares a trench" answer is a
later feature. Refused on a locked or sent bid, like any line edit.

**The run type editor** (`RunSpecEditor.tsx`, in the Plans screen) gets an
"Extras" block, folded behind one "More" like the rest. A shop adds an extra
by searching its own materials, which lists foot-sold materials only.
Editing a shipped type forks it, and the fork copies its extras
(`forkRunType`). Nothing is copied down to runs, so editing an extra
re-prices every run of the type.

### 3b. Underground run types (decision 3) — seed content, no migration

Ten new shipped types, one per **PVC Sch 40** size the catalog ships:
1/2", 3/4", 1", 1-1/4", 1-1/2", 2", 2-1/2", 3", 3-1/2", 4"
(`sizesFor("PVC Sch 40")` in `server/seed/materials/conduit.ts`).

| Field          | Value                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| label          | `2" PVC Sch 40, underground` (and so on per size)                                   |
| pathType       | `conduit`                                                                           |
| raceway        | `2" PVC Sch 40`                                                                     |
| conductor      | **not set** (NULL material, NULL count)                                             |
| ground         | not set                                                                             |
| fittings/bends | the existing PVC lookup (couplings, connectors, factory 90s; risers count their 90) |
| extras         | `Underground warning tape`, `flat`, 1.0                                             |

**Why no wire on them.** What goes in a trench varies job to job (SER, a
feeder, a set of THHN), and the GR2 and GR5 starters already carry their
own feeder — a type that shipped wire would count it twice. NULL is
"not said", and the screens already say so rather than showing a zero
(`wireNotCounted` in `shared/homerunFootage.ts`; the sentence in
`HomerunControls.tsx`). Whether every OTHER run-type surface says it too is
a check for the build, not a fact assumed here. A shop that always pulls the same
set forks the type. **Sch 80 is not shipped** (§ 7, Q2).

**The palette.** Four types becomes fifteen. CLAUDE.md § Customization
rule 1: the picker shows the four, the 700 type, and the shop's own types as
today, and the ten underground types sit behind ONE "Underground (10)" fold
in `RunTypePicker.tsx`. A shop's fork of one is the shop's own and shows
above the fold (rule 2). The fold ships with the types, not after (rule 3).

### 3c. The 700 surface raceway run type (decision 1) — seed content, no migration

One new shipped type: **`700 series surface raceway, 2 #12 + ground`**.

| Field     | Value                                                        |
| --------- | ------------------------------------------------------------ |
| pathType  | `conduit` (traced like EMT; arms the conduit tool)           |
| raceway   | `Surface raceway, 700 series` (one per-foot row — see below) |
| conductor | `#12 THHN Copper` × 2                                        |
| ground    | `#12 bare solid Copper` × 1, like the EMT types              |
| extras    | none                                                         |

**One per-foot row, not base + cover.** Decisions 1 and 2 together mean the
700 raceway carries ONE per-foot price and no extra. Wiremold's 500 and 700
series are also one-piece raceway in the field (the base/cover split is the
2000/4000 two-piece families), so the catalog's two 700 rows describe a part
nobody buys as two. So:

- `Surface raceway base, 700 series` → **renamed** `Surface raceway, 700
series` through `RENAMED_BASELINE_MATERIALS` (same id; its "base half"
  description goes). `pricing/frozen-names.json` and
  `server/frozenMaterialNames.test.ts` move in the same edit.
- `Surface raceway cover, 700 series` → **retired**
  (`RETIRED_BASELINE_MATERIALS`), so anything already pointing at it still
  resolves.
- **Cheap now:** these rows came with 0117, which is on staging and NOT on
  live (`next-live-release-plan.md`), so no live bid holds either.
- The 500-series pair has the same problem. **Not touched** here; § 7, Q3.

**Its fittings — found by the family lookup, not by override columns.**
`shared/runFittingMaterials.ts` gains a `surface raceway, 700 series`
family, so the type finds its parts from the shipped raceway's name the way
PVC and EMT do, and a fork resolves to the company's fork of each part.
Overrides stay available to a shop, as for any type.

| What the trace counts           | 700 part (new catalog row, § 3e)                   | Rule                                                                                                                       |
| ------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| coupling                        | `Surface raceway coupling, 700 series`             | per joint; stick length 10 ft on the raceway row (`stickLengthFeet`, joint `coupling`)                                     |
| connector                       | `Surface raceway entrance end fitting, 700 series` | **one per run, at its START**, not one per end: the far end goes into the 700 device box, which takes the raceway directly |
| strap                           | `Surface raceway support clip, 700 series`         | spacing on the raceway row; **ships NULL ("not set")** until the owner gives a figure (§ 7, Q1)                            |
| 90° at a plan corner            | `Surface raceway inside elbow, 700 series`         | a turn along walls is an inside corner far more often than an outside one; an outside elbow is hand-added                  |
| 90° at an end drop              | `Surface raceway flat elbow, 700 series`           | running along a wall and turning down it stays in the wall's plane                                                         |
| branch tee                      | `Surface raceway tee, 700 series`                  | in place of the tee BOX a pipe gets (`teeBoxOwners`): surface raceway branches with a fitting, not a box                   |
| field bend / 45 / LB / pull box | none                                               | factory fittings only (`bendMethodFor` returns factory, like PVC); no 45 is shipped                                        |

Three code rules come with the family (no migration): entrance end at the
start only; corner vs end-drop picks inside vs flat; a tee is a fitting.
Each needs a test that fails without it (§ 8). **Labor** is the material's
own labor per foot on the raceway line and per piece on each fitting — the
same path as EMT; nothing new.

**DV34** (`server/seed/starterAssemblies.ts`) becomes device + box + plate:

- keeps `surface-raceway-device-box-700` ×1, `20a-duplex-receptacle` ×1,
  `surface-raceway-device-plate-700` ×1, `wire-nuts` ×3;
- **drops `raceway-entrance-end-fitting`** — the run type counts it now, so
  leaving it would count it twice;
- **no traced parts.** A DV34 with no traced raceway is a receptacle with
  its box and plate, priced as such. The raceway is a separate run-type line
  on the bid, exactly like a receptacle fed in EMT.
- `wire-nuts` are kept: they are the device's connection, not the raceway's.
  Say if "only device + box + plate" meant them too (§ 7, Q4).

### 3d. On the assembly: a part "from the traced run"

GR2 and GR5 need to SAY they need a traced length, so a bid with none can
say "not priced" (tape) or "default length" (GR2's pipe) instead of quietly
guessing.

- An assembly part gets **quantity source** (M3):
  - `fixed` — today. NULL reads as this.
  - `traced` — from a traced run; **nothing traced = not priced**. Tape.
  - `traced_or_default` — from a traced run; **nothing traced = the part's
    own quantity, labelled "default length"** (decision 6). GR2's 10 ft of
    2" PVC.

  The editor shows the choice only for a material sold by the foot (and,
  for `traced_or_default`, a fitting — below). The part's `quantity` is the
  default for `traced_or_default` and is not read for `traced` (the editor
  hides it; the seed writes 0).

- **A traced part is never priced by the assembly line when a run covers
  it.** The run-type line holds the feet and the money, so there is **one
  tape line, one pipe line, never two**.
- **When the line is added**, the traced parts are frozen onto it (M4):
  material, name, unit cost and default. An assembly edited later does not
  move the line.
- **Covered** means: some run on the bid has a type whose raceway or extra
  is that material (matched by baseline lineage, so a shop's fork still
  matches), and its feet are measured and greater than 0.

**GR2's elbow and connectors follow the pipe** — otherwise a traced 2" run
counts its own 90s and connectors AND GR2 adds 1 elbow and 2 connectors on
top. So `2in-pvc-sch-40-90-degree-elbow` ×1 and `2in-pvc-sch-40-connector`
×2 are also `traced_or_default`, covered when the pipe is covered. GR5's
`1in-pvc-sch-40-connector` ×2 the same, covered by a traced 1" run. This
goes one step past decision 6, so it is § 7, Q5 — but the alternative is a
number counted twice, so the plan assumes yes. GR2's 10 ft of SER is NOT
touched: the underground types carry no wire (§ 3b), so nothing doubles it.

**What the line shows**, per traced part:

| State                                     | Line says                                             | Money                                       |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| Covered by a traced run                   | "Tape: 52 ft, from the traced trench"                 | on the run-type line, not here              |
| `traced`, not covered, nothing typed      | **"+ tape not priced — no trench traced"** (amber)    | NULL; counts in "+ N not priced"            |
| `traced_or_default`, not covered          | "2\" PVC: 10 ft, default length — no trench traced"   | default × frozen unit cost, on this line    |
| Not covered, run on a sheet with no scale | "+ tape not priced — the trench's sheet has no scale" | NULL (the default, for `traced_or_default`) |
| Length typed on the line                  | "Tape: 40 ft, typed"                                  | typed ft × frozen unit cost, on this line   |
| Answered "not on this job"                | nothing                                               | 0, and not counted as not priced            |
| Typed, and later a run covers it          | "Tape: 52 ft traced (replaces 40 ft typed)"           | the run's; the typed figure stops counting  |

The "default length" line is NOT amber and NOT "not priced" — the owner
chose a number for it. It is still a button (§ 3f), because "trace it" and
"type it" are the obvious next steps.

**Traced always wins over typed, and typed over default**, so a length can
never be counted twice. The typed answer is kept and shown as replaced, not
deleted, so taking the run away brings it back.

### 3e. Catalog rows to add — seed content, no migration

In `server/seed/materials/raceUndergroundService.ts`, `SURFACE_RACEWAY`,
category `Surface Raceway`, `each`, `jobKind: "commercial"` like the 700 box
and plate, $0 and example-tagged like every shipped row. Generic names, the
series as the size (CLAUDE.md § Brands); slang written when they are seeded
(what the counter calls each — "wiremold" and "wire mold" on all of them, as
the shelf already does):

| Name                                               | Already in catalog?                      |
| -------------------------------------------------- | ---------------------------------------- |
| `Surface raceway coupling, 700 series`             | no — only the generic `Raceway coupling` |
| `Surface raceway flat elbow, 700 series`           | no — only `Raceway flat elbow`           |
| `Surface raceway inside elbow, 700 series`         | no — only `Raceway inside elbow`         |
| `Surface raceway outside elbow, 700 series`        | no — only `Raceway outside elbow`        |
| `Surface raceway tee, 700 series`                  | no — only `Raceway tee fitting`          |
| `Surface raceway entrance end fitting, 700 series` | no — only `Raceway entrance end fitting` |
| `Surface raceway support clip, 700 series`         | no — only `Raceway mounting strap`       |

The generic `Raceway …` rows stay: they serve the other series, and nothing
here retires them. **No 700 end cap** — a run ends in a device box or an
entrance end. Add one if the owner wants it.

Per CLAUDE.md § Materials: these need `searchAliases`, must not alias each
other, and `pnpm tsx scripts/searchSpotCheck.mts` after seeding ("700
elbow", "wiremold tee", "700 coupling").

### 3f. Never stuck: the buttons

Every amber "not priced" label above, and the "default length" label, is a
button (a `TapExplain`-style tap target, 44 px on touch). It opens gap 11's
in-place panel with three choices:

1. **"Type the length"** — a feet box (`InlineNumberField`, `whenUnset` a
   placeholder, select on focus, Enter saves and closes). Writes this
   line's answer and the line re-prices. **The fastest fix, and the manual
   path.**
2. **"Trace it on the plans"** — opens `/bids/:id/plans` with the run type
   that carries this material armed. If no type carries it, the panel
   offers the run-type picker.
3. **"Not on this job"** — this line stops asking. One tap undoes it.

The same panel opens from the totals strip's "+ N not priced" walk (gap 11).
The extra line's "Shared trench? Set this extra to 0" (§ 3a) is a separate,
one-tap control on the run-type line, not this panel.

**Sent and locked bids**: the panel explains and offers nothing that
changes the line, by gap 11's rule. The one rule decides both.

**The "$0 tape" case** (tape traced, but its price is $0) is the existing
"+ material not priced" on the extra line. Gap 11's price box fixes it.

## 4. Database changes — Track A builds these

All four are **ADDITIVE, step 1** (CLAUDE.md § "three steps"). None has an
`UPDATE` to a column older than the batch. **Step 3 (backfill) is empty.**
Everything shipped — the eleven run types, tape on the ten, the seven 700
fittings, the 700 rename and retire, DV34/GR2/GR5 — is **seed content**,
applied at startup, not by a migration. Numbers are A's to assign, after 0134.

**Pairing (step 2 needs step 1):** the seed writes extras rows, so M1 must be
on a database before a build that seeds them boots against it. The 700 rows
need 0117 (staging has it; live does not — `next-live-release-plan.md`).

**Dropped since the first version:** `takeoff_run_type_extras.onlyLocation`
(§ 2, point 1). Nothing else is dropped; M2–M4 each gained one thing.

**M1 — new table `takeoff_run_type_extras`**

| Column                  | Type                                          | Notes                                                     |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `id`                    | int PK                                        |                                                           |
| `userId`                | int NULL, FK users, cascade                   | NULL = shipped; set = the company owner's id              |
| `runTypeId`             | int NOT NULL, FK `takeoff_run_types`, cascade |                                                           |
| `baselineExtraId`       | int NULL                                      | the shipped extra this was forked from                    |
| `materialId`            | int NULL, FK materials, set null              | NULL after a material is deleted: says so, prices nothing |
| `feetPerFoot`           | decimal(8,4) NOT NULL                         | 1.0 for the shipped tape                                  |
| `appliesTo`             | enum('flat','all') NOT NULL                   | `flat` for the shipped tape                               |
| `sortOrder`             | int NOT NULL default 0                        |                                                           |
| `createdAt`/`updatedAt` | timestamp                                     |                                                           |

**M2 — `bid_line_items`: more than one extra per type, and "0 on this bid"**

- Append `extra` to the `runMaterialRole` enum. Append only, so every
  stored value keeps its index (as 0084 and 0096 did).
- Add `runExtraKey INT NOT NULL DEFAULT 0`. 0 means "not an extra", which
  is TRUE of every existing row — that is why a default is safe here: it is
  not a meaning anything else produces. An extra's line stores
  `baselineExtraId ?? id`, so a fork of the type keeps its line.
- Replace the unique index `bid_line_items_bid_runtype_role_uq` with one on
  `(bidId, takeoffRunTypeId, runMaterialRole, runExtraKey)`. It must NOT
  use a nullable column: MySQL lets NULLs repeat in a unique index, which
  would quietly allow duplicate raceway lines.
- **OPEN (found 2026-10-08, Track C, building § 3c's counting): the flat
  elbow has no role.** The 700 type sends an inside elbow and a flat elbow,
  two parts on one type, and the unique index allows one line per role. The
  other 700 parts fit existing roles (entrance end `connector`, clip
  `strap`, inside elbow `elbow90`, tee `teeBox`). Suggested: append
  `elbowFlat` here beside `extra`, append-only like 0084. Undecided — see
  `track-c-handoff.md`. The counting is built
  (`shared/surfaceRacewayFittings.ts`) and does not depend on the answer.
- **New: add `extraFeetPerFoot DECIMAL(8,4) NULL`** (decision 4). NULL =
  follow the run type's extra; `0` = "shared trench" on this bid. Only read
  on a role-`extra` line. NULL with no default, so "follow the type" is a
  value nothing else produces.

**M3 — `assembly_materials.qtySource`**
`ENUM('fixed','traced','traced_or_default') NULL`. NULL = fixed, which is
today's meaning, so no backfill. (The first version had two values; the
third is decision 6.)

**M4 — `bid_line_items`, two JSON columns, both NULL**

- `snapshotTracedParts` — frozen when the line is added:
  `[{ materialId, baselineMaterialId, name, unitCost, defaultQty }]`,
  `defaultQty` NULL for a `traced` part. NULL on every line with no traced
  part. Never written again (snapshot rule).
- `tracedPartAnswers` — the estimator's answers on THIS line, keyed by
  material: `{ feet: number } | { notOnJob: true }`. A hand edit to their
  own line, which the snapshot rule allows (gap 11, point 1).

**Pairing rule:** M1–M4 ship with the code that reads them, never apart.
They go to staging BEFORE the code (step 1). Old code ignores all four.

## 5. Files it touches

**Server and shared (Track C can build these):**

- `drizzle/schema.ts` — Track A, with the migrations
- `server/runTypeFootageCore.ts` — the extras' feet (flat / all)
- `shared/takeoffQuantities.ts` (`quantitiesForRun`) — flat vs vertical
  feet per run, if not already exposed
- `shared/takeoffBridge.ts` (`runTypeRows`) — one row per extra; reads
  `extraFeetPerFoot`
- `shared/runExtrasPerFoot.ts` — **new**, pure: an extra's feet from a run
  and its type, plus "is this traced part covered on this bid"
- `shared/runFittingMaterials.ts`, `shared/runFittings.ts`,
  `shared/runBends.ts`, `shared/runNetwork.ts` — the 700 family: entrance
  end at the start only, corner = inside elbow, end drop = flat elbow, tee =
  a fitting, factory bends only
- `server/routers/takeoffRunTypesRouter.ts` — extras CRUD, the fork copies
  them, `bridgeForBid` and send-again carry the `extra` role
- `server/routers/bidsRouter.ts` — `bids.setExtraShared({ lineId, shared })`
  (writes `extraFeetPerFoot` 0 / NULL), refused on a locked or sent bid
- `server/runTypeFootage.ts`, `server/routers/takeoffSummaryRouter.ts` —
  the totals and materials list show extras
- `server/seed/baselineRunTypes.ts` — the ten underground types, the 700
  type, and the shipped tape extras. **Shipped run types match materials by
  exact name** (CLAUDE.md), so the 700 rename edits this file in the same
  commit
- `server/seed/materials/raceUndergroundService.ts`,
  `server/seed/materials/index.ts` (rename + retire), `pricing/frozen-names.json`
  — the seven 700 fittings, the 700 rename, the cover retired
- `server/db.ts` — read and write extras; freeze traced parts when a line
  is added

**Bid and library (B's files, see § 6):**

- `shared/lineNotPriced.ts` — a `traced` part not covered counts as not
  priced, with its own reason; a `traced_or_default` part does not
- `client/src/lib/notPricedTotal.ts` — the "+ N not priced" total includes
  it
- `client/src/components/LineCost.tsx` — the per-part sub-line, its button,
  and the extra line's "Shared trench?" control
- `client/src/pages/BidsPage.tsx` — the panel (gap 11's, plus "Type the
  length" and "Not on this job")
- `server/routers/bidsRouter.ts` — `bids.answerTracedPart({ lineId,
materialId, feet | notOnJob | clear })`, refused on a locked or sent bid
- `client/src/pages/AssembliesLibraryPage.tsx` — quantity source per part
  (fixed / from the traced run / from the traced run, else a default)
- `server/seed/starterAssemblies.ts` — GR2 gains tape (`traced`) and its
  pipe, elbow and connectors become `traced_or_default`; GR5 gains tape and
  its connectors become `traced_or_default`; DV34 drops the entrance end
- `server/starterGapAssemblies.test.ts` — the per-foot guard allows a
  traced part and still forbids a fixed 1 ft

**Plans screen:**

- `client/src/components/takeoff/RunSpecEditor.tsx` — the Extras block
- `client/src/components/takeoff/RunTypePicker.tsx` — the "Underground"
  fold
- `client/src/pages/TakeoffPage.tsx` — arm a run type from the address
  (for "Trace it on the plans")

## 6. Clashes with Track B

| B's work                                                       | Same files                                                                                               | What to do                                                                                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Never-stuck gap 11** (fix a line in place), planned next     | `BidsPage.tsx`, `LineCost.tsx`, `shared/lineNotPriced.ts`, `notPricedTotal.ts`, `bidsRouter.ts`, `db.ts` | **Build the bid half AFTER gap 11 lands, on top of its panel.** Two panels for one "not priced" would be the drift CLAUDE.md warns about. The server half (§ 5, first list) does not wait. |
| **Cover swaps** (CS6/7/8, RS1/2/13/17, CS5, the generic plate) | `server/seed/starterAssemblies.ts`, its tests                                                            | Different entries in the same file; a small merge. Whoever lands second re-runs the starter tests.                                                                                         |
| **Starter rename path** (`RENAMED_BASELINE_ASSEMBLIES`)        | `server/db.ts`, `server/seed/*`                                                                          | No overlap in logic. Land in either order.                                                                                                                                                 |
| **Gap 8** (open the assembly editor on the hours field)        | `AssembliesLibraryPage.tsx`                                                                              | Small. Land in either order.                                                                                                                                                               |
| **Gap 14** (run types editable outside Plans)                  | `RunSpecEditor.tsx`                                                                                      | If gap 14 lands first, the Extras block shows in both places for free. Build the block INSIDE the shared editor, not beside it.                                                            |

## 7. Questions still open (none blocks M1–M4)

1. **700 support clip spacing.** Ships NULL, which the count shows as "not
   set". Give a figure (or "per the manufacturer, N ft") and it goes on the
   raceway row.
2. **Sch 80 underground types?** Not shipped; Sch 40 is the trench pipe.
   Say if risers or a spec need Sch 80 types too.
3. **The 500-series base/cover pair** has the same one-piece problem as 700
   (§ 3c). Merge it the same way? Not done here.
4. **DV34's wire nuts** are kept (§ 3c). Say if "only device + box + plate"
   meant them too.
5. **GR2's elbow and connectors, and GR5's connectors, follow the traced
   pipe** (§ 3d). Assumed yes, because otherwise a traced trench counts them
   twice.

## 8. Tests that must fail without it

Pure logic goes in `shared/` or `client/src/lib`, where vitest reaches it.

- **Tape = flat feet only.** A 100 ft underground run with two 3 ft risers
  gives 100 ft of tape, and the pipe gives 106 ft. Moving a point moves the
  tape. Undo and clear move it back.
- **Waste:** a type with 10% raceway extra buys 110 ft of tape on that run.
- **Every underground type carries tape;** no other shipped type carries an
  extra (a seed test, so an eleventh PVC size cannot ship without it).
- **Two extras on one type** (tape + tracer wire) give two bid lines, both
  off one length. Send-again twice adds no third line (M2's index).
- **Shared trench:** `extraFeetPerFoot = 0` makes that line 0 ft on this bid
  only; another bid with the same type is unchanged; NULL brings it back.
  Refused on a locked or sent bid.
- **The 700 type:** couplings off 10 ft sticks; ONE entrance end per run
  (not two); a plan corner buys an inside elbow and an end drop a flat
  elbow; a branch buys a 700 tee and no box; no EMT part and no field bend
  is ever counted.
- **DV34** has no entrance end and no traced part; a DV34 plus a traced 700
  run counts exactly one entrance end.
- **No trench traced** on a bid with GR2: tape "not priced" on the line and
  in the total, never 1 ft, never $0. The print is blocked like any
  not-priced line. **The pipe says 10 ft, "default length"**, priced, and
  NOT counted as not priced.
- **One line, not two.** GR2 plus a traced 2" trench: the tape and the pipe
  are priced once, on the run-type lines; GR2's elbow and connectors stop
  counting; the GR2 line says "from the traced trench".
- **Typed, then traced.** Traced replaces typed; typed replaces default.
  Deleting the run brings the typed figure back.
- **"Not on this job"** clears the not-priced count. Undo restores it.
- **Snapshot:** editing GR2's recipe after the line is added changes
  nothing on that line, default included.
- **Locked and sent bids** refuse `answerTracedPart` and `setExtraShared`.
- **A fork of an underground type** keeps its tape and keeps its bid line
  (same `runExtraKey`).
- **Rename:** `Surface raceway base, 700 series` resolves to the renamed row
  with the same id; the cover is inactive and still resolves.
- **The per-foot guard** in `starterGapAssemblies.test.ts` still fails a
  fixed 1 ft of a foot-sold part, and passes a traced one.
- **On screen** (CLAUDE.md: not verified until somebody has looked), at
  laptop and 1180x820 touch:
  - the "Underground" fold in the run-type picker, closed by default;
  - the amber label's button opens the panel;
  - typing a length moves the line AND the bid total, without a reload
    (the stale-query class — add the query to the screen's one refresh
    helper);
  - "Shared trench?" moves the extra line and the total, without a reload;
  - tracing a trench on the Plans screen moves the GR2 line on the bid.

## 9. Order of work

1. **Track A: M1–M4**, applied to staging before any code that reads them.
2. **Server and shared half** (Track C, or whoever is free): extras' feet,
   the bridge, extras CRUD and fork, "shared trench", the 700 family's
   fitting rules, and the seed (eleven types, tape, seven fittings, the
   rename). Tested on its own; no bid screen change yet beyond the
   "Shared trench?" control.
3. **Bid half, after gap 11** (Track B, on gap 11's panel): traced parts,
   the default length, the line labels, the three buttons, the starter
   recipe changes.
4. **Look at it**, at both sizes, before calling it done.
