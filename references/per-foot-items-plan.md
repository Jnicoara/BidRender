# Extra per-foot items on a traced run (PLAN, 2026-10-08)

**Status: plan only. Nothing is built.** Written by Track C, on
`c-homerun-wiring`, for the owner's ask of 2026-10-07. The first sketch is in
`todo.md` § "Track A: ONE feature — extra per-foot items on a traced run".
This plan keeps that sketch's shape and corrects four things in it that the
code does not support as written (§ 2).

## 1. What the owner asked for

- **Underground warning tape follows the traced trench length.** If no
  trench is traced, the tape says **"not priced"** — never 1 ft, never $0.
  It goes back into GR2 (200A underground service) and GR5 (detached garage
  feeder) that way.
- **Wiremold 700 follows the traced run length** (for DV34). The catalog
  sells it as two per-foot rows, `Surface raceway base, 700 series` and
  `Surface raceway cover, 700 series`. Both are charged off the same feet.
  The matching 700 plate and box are counted **per device**.
- **It works for any per-foot item** a shop adds to a run type later, not
  just these two. Tracer wire in a trench is the obvious third one
  (`Tracer wire` is already in the catalog, sold by the foot).
- **Never stuck:** every "not priced" this adds has a fix-it-here button.

**One feature, not two special cases**, because both are "a second material
priced off the same traced feet". Two special cases would drift.

### Decisions this builds on (cited so the next reader's search succeeds)

- **D3** (`takeoff-spec.md`): a run says what it is by its TYPE, chosen
  before tracing. Not a form on every run. So extras live on the **run
  type**, and a run never asks about tape.
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

## 2. What the todo.md sketch got wrong (checked against the code)

1. **No shipped run type is underground.** `server/seed/baselineRunTypes.ts`
   ships four, all EMT or MC. "Underground run types carry the tape" has
   nothing to attach to. A trench is a run whose `takeoff_runs.location` is
   `Underground` (the `TAKEOFF_LOCATIONS` axis), not a kind of run type. So
   an extra needs an optional **"only where the run is Underground"**
   condition. Without it, a PVC run type used both above and below grade
   would buy tape on the exposed runs too.
2. **A bid can hold only ONE line per run type and role.** The unique index
   `bid_line_items_bid_runtype_role_uq` is on `(bidId, takeoffRunTypeId,
runMaterialRole)`. Two extras on one type (tape AND tracer wire) would
   collide. The index has to widen (§ 4, M2).
3. **A bid line does not freeze its parts one by one.** It freezes one
   `snapshotMaterialCost` and a count of unpriced parts. So "this part's
   quantity comes from the run" cannot be read off the line later. Without
   a frozen copy, an assembly edited after the line was added would change
   the line. The traced parts need their own frozen copy (§ 4, M4).
4. **DV34's plate and box are already counted per device.** Track B did
   that on 2026-10-08 (700 plate and 700 box, one each, in the recipe). This
   plan only adds the base and cover as traced parts, so a DV34 with no
   traced raceway says "not priced" instead of silently carrying no
   raceway.

## 3. How it works

### 3a. On the run type: "extras"

A run type keeps its one raceway, conductor and ground. It gains a list of
**extras**. Each extra has:

- a material (sold by the foot);
- **feet per foot**: 1.0 for tape, tracer wire and the 700 cover;
- **which feet**:
  - `flat` — the traced horizontal length only. This is right for tape: it
    lies in the trench, not up the riser.
  - `all` — every installed foot, verticals included. This is right for the
    700 cover, which covers every foot of the base.
- **only where** — NULL (every run of the type) or `Underground` (only runs
  whose location is Underground).

**Arithmetic, one path.** The extras ride the same footage path as the
raceway, so they move when the run moves, and undo, clear and delete move
them too:

- `server/runTypeFootageCore.ts` `groupRunFootage` already sums installed
  and vertical feet per type. It adds, per extra:
  - `flatFeet` (installed − vertical) or `allFeet`, filtered by location;
  - then × feet per foot.
- **Waste:** the type's raceway extra % applies to the extras as well, as
  bought feet. Labour is on installed feet at the material's own labour per
  foot, the same as the raceway line. Owner question 3 if that is wrong for
  tape.
- **Which runs count:** the same `runOnBid` rule as everything else (drafts
  count, suggestions do not). A run on a sheet with no scale is
  `unmeasurableCount`, as today.

**On the bid:** `shared/takeoffBridge.ts` `runTypeRows` emits one row per
extra, with role `extra`. `takeoffRunTypes.bridgeForBid` sends it as a
run-type line like the raceway. Send-again, the preview and the totals
treat it like any other role. A $0 extra says "+ material not priced" by
the existing rule, and gap 11's panel fixes it.

**Shipped content** (decided by the owner before seeding — § 7):

- a new shipped run type, **"700 series surface raceway, 2 #12 + ground"**:
  raceway = 700 base, extra = 700 cover (`all`, 1.0), no EMT fittings
  (fitting style NULL — a test must confirm this counts no EMT couplings or
  straps);
- tape (`flat`, 1.0, only where Underground) on whichever underground run
  types ship. **Today there are none.** Owner question 1.

**The run type editor** (`RunSpecEditor.tsx`, in the Plans screen) gets an
"Extras" block, folded behind one "More" like the rest (CLAUDE.md §
Customization). A shop adds an extra by searching its own materials, which
lists foot-sold materials only. Editing a shipped type forks it, and the fork
copies its extras (`forkRunType`). Nothing is copied down to runs, so
editing an extra re-prices every run of the type.

### 3b. On the assembly: a part "from the traced run"

GR2, GR5 and DV34 need to SAY they need a traced length, so a bid with none
can say "not priced" instead of quietly leaving the tape out.

- An assembly part gets **quantity source**: `fixed` (today) or `traced`.
  The editor shows the choice only for a material sold by the foot.
- **A traced part is never priced by the assembly line when a run carries
  it.** It is a check. The run-type extra line holds the feet and the money,
  so there is **one tape line, never two**.
- **When the line is added**, the traced parts are frozen onto it: material,
  name and unit cost. That way an assembly edited later does not move this
  line.
- **Covered** means: some run on the bid has a type whose raceway or extra
  is that material (matched by baseline lineage, so a shop's fork of the
  tape still matches), and its feet are measured and greater than 0.

**What the line shows**, per traced part:

| State                                     | Line says                                             | Money                                      |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Covered by a traced run                   | "Tape: 52 ft, from the traced trench"                 | on the run's extra line, not here          |
| Not covered, nothing typed                | **"+ tape not priced — no trench traced"** (amber)    | NULL; counts in "+ N not priced"           |
| Not covered, run on a sheet with no scale | "+ tape not priced — the trench's sheet has no scale" | NULL                                       |
| Length typed on the line                  | "Tape: 40 ft, typed"                                  | typed ft × frozen unit cost, on this line  |
| Answered "not on this job"                | nothing                                               | 0, and not counted as not priced           |
| Typed, and later a run covers it          | "Tape: 52 ft traced (replaces 40 ft typed)"           | the run's; the typed figure stops counting |

**Traced always wins over typed**, so a length can never be counted twice.
The typed answer is kept and shown as replaced, not deleted, so taking the
run away brings it back.

### 3c. Never stuck: the buttons on "not priced"

Every amber label above is a button (a `TapExplain`-style tap target, 44 px
on touch). It opens gap 11's in-place panel with three choices:

1. **"Type the length"** — a feet box (`InlineNumberField`, `whenUnset` set
   to a placeholder, select on focus, Enter saves and closes). It writes
   this line's answer and the line re-prices. **The fastest fix, and the
   manual path.**
2. **"Trace it on the plans"** — opens `/bids/:id/plans` with the run type
   that carries this material armed. If no type carries it, the panel
   offers "Add tape to a run type", which opens the run-type picker.
3. **"Not on this job"** — this line stops asking. One tap undoes it.

The same panel opens from the totals strip's "+ N not priced" walk (gap 11).

**Sent and locked bids**: the panel explains and offers nothing that
changes the line, by gap 11's rule. The one rule decides both.

**The "$0 tape" case** (tape traced, but its price is $0) is the existing
"+ material not priced" on the run's extra line. Gap 11's price box fixes
it. Nothing new.

## 4. Database changes — Track A builds these

All four are **ADDITIVE, step 1** (CLAUDE.md § "three steps"). None has an
`UPDATE` to a column older than the batch. Step 3 (backfill) is **empty**.
Shipped extras are seeded at startup like shipped run types, not by a
migration. Numbers are A's to assign, after 0134.

**M1 — new table `takeoff_run_type_extras`**

| Column                  | Type                                          | Notes                                                     |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `id`                    | int PK                                        |                                                           |
| `userId`                | int NULL, FK users, cascade                   | NULL = shipped; set = the company owner's id              |
| `runTypeId`             | int NOT NULL, FK `takeoff_run_types`, cascade |                                                           |
| `baselineExtraId`       | int NULL                                      | the shipped extra this was forked from                    |
| `materialId`            | int NULL, FK materials, set null              | NULL after a material is deleted: says so, prices nothing |
| `feetPerFoot`           | decimal(8,4) NOT NULL                         | 1.0 for every shipped extra                               |
| `appliesTo`             | enum('flat','all') NOT NULL                   |                                                           |
| `onlyLocation`          | enum(`TAKEOFF_LOCATIONS`) NULL                | NULL = every run; `Underground` for tape                  |
| `sortOrder`             | int NOT NULL default 0                        |                                                           |
| `createdAt`/`updatedAt` | timestamp                                     |                                                           |

**M2 — `bid_line_items`: room for more than one extra per type**

- Append `extra` to the `runMaterialRole` enum. Append only, so every
  stored value keeps its index (the same as 0084 and 0096 did).
- Add `runExtraKey INT NOT NULL DEFAULT 0`. 0 means "not an extra", which
  is TRUE of every existing row. That is why a default is safe here: it is
  not a meaning anything else produces. An extra's line stores
  `baselineExtraId ?? id`, so a fork of the type keeps its line.
- Replace the unique index `bid_line_items_bid_runtype_role_uq` with one on
  `(bidId, takeoffRunTypeId, runMaterialRole, runExtraKey)`. It must NOT
  use a nullable column: MySQL lets NULLs repeat in a unique index, which
  would quietly allow duplicate raceway lines.

**M3 — `assembly_materials.qtySource`** `ENUM('fixed','traced') NULL`.
NULL = fixed, which is today's meaning, so no backfill.

**M4 — `bid_line_items`, two JSON columns, both NULL**

- `snapshotTracedParts` — frozen when the line is added:
  `[{ materialId, baselineMaterialId, name, unitCost, perUnit }]`. NULL on
  every line with no traced part. Never written again (snapshot rule).
- `tracedPartAnswers` — the estimator's answers on THIS line, keyed by
  material: `{ feet: number } | { notOnJob: true }`. A hand edit to their
  own line, which the snapshot rule allows (gap 11, point 1).

**Pairing rule:** M1–M4 ship with the code that reads them, never apart.
They go to staging BEFORE the code (step 1). Old code ignores all four.

## 5. Files it touches

**Server and shared (Track C can build these):**

- `drizzle/schema.ts` — Track A, with the migrations
- `server/runTypeFootageCore.ts` — the extras' feet; `GroupableRun` gains
  `location`
- `shared/takeoffQuantities.ts` (`quantitiesForRun`) — flat vs vertical feet
  per run, if not already exposed
- `shared/takeoffBridge.ts` (`runTypeRows`) — one row per extra
- `shared/runExtrasPerFoot.ts` — **new**, pure: an extra's feet from a run
  and its type, plus "is this traced part covered on this bid"
- `server/routers/takeoffRunTypesRouter.ts` — extras CRUD, the fork copies
  them, `bridgeForBid` and send-again carry the `extra` role
- `server/runTypeFootage.ts`, `server/routers/takeoffSummaryRouter.ts` —
  the totals and materials list show extras
- `server/seed/baselineRunTypes.ts` — the 700 run type, and the shipped
  extras
- `server/db.ts` — read and write extras; freeze traced parts when a line
  is added

**Bid and library (B's files, see § 6):**

- `shared/lineNotPriced.ts` — "traced part not covered" counts as not
  priced, with its own reason
- `client/src/lib/notPricedTotal.ts` — the "+ N not priced" total includes
  it
- `client/src/components/LineCost.tsx` — the per-part sub-line and its
  button
- `client/src/pages/BidsPage.tsx` — the panel (gap 11's, plus "Type the
  length" and "Not on this job")
- `server/routers/bidsRouter.ts` — `bids.answerTracedPart({ lineId,
materialId, feet | notOnJob | clear })`, refused on a locked or sent bid
- `client/src/pages/AssembliesLibraryPage.tsx` — "From the traced run"
  per part
- `server/seed/starterAssemblies.ts` — GR2 and GR5 gain
  `Underground warning tape` (traced); DV34 gains the 700 base and cover
  (traced)
- `server/starterGapAssemblies.test.ts` — the per-foot guard allows a
  TRACED part and still forbids a fixed 1 ft

**Plans screen:**

- `client/src/components/takeoff/RunSpecEditor.tsx` and `RunTypePicker.tsx`
  — the Extras block
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

## 7. Questions for the owner (decide before seeding)

1. **Which underground run types should ship with tape?** None ships today.
   Recommended: one per PVC size the starters use (1", 2"), each "PVC Sch
   40, underground", with tape (`flat`, only where Underground), and tracer
   wire left for a shop to add.
2. **Two conduits in one trench.** Each traced run buys its own tape, so two
   parallel runs buy two tapes for one trench. Recommended for now: trace
   the trench ONCE on the run type that carries the tape. A "shares a
   trench" answer is a later feature, and the screen should say so.
3. **Waste on tape.** Recommended: the type's raceway extra % applies to
   every extra, tape included, since the shop sets that percentage. Say if
   tape should never take waste.
4. **Should GR2's fixed `2in-pvc-sch-40` × 10 also become traced?** Not
   part of this ask. Flagged because it is the same "1 ft of a per-foot
   thing" question in a softer form.

## 8. Tests that must fail without it

Pure logic goes in `shared/` or `client/src/lib`, where vitest reaches it.

- **Tape = flat feet only.** A 100 ft underground run with two 3 ft risers
  gives 100 ft of tape, and the conduit gives 106 ft. Moving a point moves
  the tape. Undo and clear move it back.
- **Location filter.** The same type with an exposed run adds no tape.
- **The 700 cover = every foot.** Cover feet equal base feet, verticals
  included. No EMT couplings or straps are counted on the 700 type.
- **Two extras on one type** (tape + tracer wire) give two bid lines, both
  off one length. Send-again twice adds no third line (M2's index).
- **No trench traced** on a bid with GR2: "not priced" on the line and in
  the total. Never 1 ft, never $0. The print is blocked like any
  not-priced line.
- **One tape line, not two.** GR2 plus a traced trench: the tape is priced
  once, on the extra line, and the GR2 line says "from the traced trench".
- **Typed, then traced.** Traced replaces typed. Deleting the run brings
  the typed figure back.
- **"Not on this job"** clears the not-priced count. Undo restores it.
- **Snapshot:** editing GR2's recipe after the line is added changes
  nothing on that line.
- **Locked and sent bids** refuse `answerTracedPart`.
- **A fork of the 700 type** keeps its cover and keeps its bid line (same
  `runExtraKey`).
- **The per-foot guard** in `starterGapAssemblies.test.ts` still fails a
  fixed 1 ft of a foot-sold part, and passes a traced one.
- **On screen** (CLAUDE.md: not verified until somebody has looked), at
  laptop and 1180x820 touch:
  - the amber label's button opens the panel;
  - typing a length moves the line AND the bid total, without a reload
    (the stale-query class — add the query to the screen's one refresh
    helper);
  - tracing a trench on the Plans screen moves the GR2 line on the bid.

## 9. Order of work

1. **Owner answers § 7.**
2. **Track A: M1–M4**, applied to staging before any code that reads them.
3. **Server and shared half** (Track C, or whoever is free): the extras'
   feet, the bridge, extras CRUD and fork, the 700 run type. Tested on its
   own; no bid screen change yet.
4. **Bid half, after gap 11** (Track B, on gap 11's panel): traced parts,
   the line labels, the three buttons, the starter recipe changes.
5. **Look at it**, at both sizes, before calling it done.
