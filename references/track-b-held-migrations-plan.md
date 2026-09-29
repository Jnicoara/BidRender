# Track B — the three items held for migrations. PLAN ONLY, 2026-09-28

The three items `track-b-next-batch-plan.md` § "Looked at and left out" held
back because each needs columns:

1. **Extra and makeup footage.** This covers § 5j, R7 and T16.
2. **Typed-length runs** (§ 4c).
3. **Verticals on marks.** This is Phase 8, "verticals on stamps".

Nothing here is built. Track A makes the database change in § 4. Track B builds
the code in each item's "B builds" list, **after** A's migration is applied
locally. The questions for the owner are in § 6. Where a question changes the
schema, the schema below follows the recommended answer and says what would
change otherwise.

**Read first.** These are the decisions this plan builds on. They are cited
rather than restated:

- **§ 2.2 / § 2.3 / § 5j / § 7.1** in `plan-viewer-overhaul.md` cover three
  quantities in three units. Conduit extra applies to the traced length only.
  Wire extra applies to traced plus vertical. Makeup is wire only, per
  conductor per end.
- **§ 2.0 / D3.** These are TYPE settings, not a form on every run.
- **§ 5a.** Measure honestly and pad where it can be seen. Every pad is its own
  term on screen.
- **§ 5d** covers verticals on runs, which are **already built**. The columns
  exist, and `totalVerticalFeet` already decides whether a vertical belongs to
  the run or the stamp.
- **§ 7.** A vertical belongs to the GROUP, not to each stamp.
- **D18.** Devices own the branch wire through their whips. **D21** is
  quantity mode, whose approved drops are end kinds.
- **CLAUDE.md § Starter content, as amended 2026-09-25.** Unaccepted starters
  apply nothing. This matters for item 1; see Q1.

---

## 1. Extra and makeup footage

### What it does for the estimator

Traced footage is what the drawing measures. It is not what gets bought.
Today every run reaches the bid, the materials list and the CSV with no extra
at all. The CSV even says so: "No extra is included"
(`shared/takeoffExport.ts:328`). A 400 ft homerun of 3 #12 is bid at 1,200 ft
of wire when the truck needs about 1,340 ft. The shortfall is the whisper
§ 2.3 warns about: nothing on screen says the total is low.

After this item, each run and each bid total shows the arithmetic, every term
visible (§ 5j):

```
Conduit   112.00 traced + 8.50 vertical + 5.60 extra = 126.10 ft
Wire      336.00 traced + 25.50 vertical + 36.15 extra + 12.00 makeup = 409.65 ft
```

The numbers are set once as company defaults. A run type can change them, and
a run can differ from its type. When a bid carries no extra at all, the screen
says so in words. It is never a quiet zero: "23 runs carry no extra".

### The arithmetic (pinned before building, from § 5j and § 7.1)

- **Conduit** = flat × (1 + conduit%) + vertical. The vertical gets no
  conduit extra (§ 7.1).
- **Wire, per conductor** = (flat + vertical) × (1 + wire%) + makeup.
- **Makeup** = per-end length × conductors in that leg × counted ends. Grounds
  count as conductors, because every wire gets a tail. Makeup is never
  multiplied by a percentage.
- **Counted ends.** Makeup applies at the **same ends where the fittings count
  a connector**, which is every node except an `open:` one
  (`shared/runFittings.ts:707`). There is one rule about where wire terminates,
  so makeup and connectors cannot disagree. A quantity leg therefore gets
  makeup only at an approved drop, the same as its connectors under D21.
- **Panel ends** use the panel makeup length. Every other counted end uses the
  device length. Which kinds count as a panel is Q4.
- **Branch-wiring runs (D18)** have no wire on the bid, so they get no wire
  extra and no makeup. A branch conduit run keeps its pipe, and its pipe keeps
  its conduit extra.
- **Cable runs** are Q3.

### What Track A adds (details in § 4)

- A new table, `takeoff_extra_defaults`, with one row per company. It holds the
  two percentages, the two makeup lengths and `acceptedAt`.
- Four nullable columns on `takeoff_run_types` for the same four numbers.
  NULL means "follow the company".
- Two nullable columns on `takeoff_runs` for the two percentages. NULL means
  "follow the type". There is no run-level makeup, because the run's ends
  already decide it.
- One nullable column on `takeoff_mounting_heights`, `makeupAt`. It lets a
  company mark its own "Switchboard" type as a panel end (Q4).

**Defaults:** none. Every column is NULL, and the table starts empty. **No
backfill.** Old code ignores all of it.

### What B builds after the migration

1. **`shared/runExtras.ts`**, holding the resolution and nothing else. It
   resolves each of the four numbers through run → type → company → shipped
   starter. It returns the value and its source (`run`, `type`, `company`,
   `unset`), the same shape as `resolveMountingHeight`. An unaccepted company
   row resolves to `unset`, which means an effect of 0 and a flag. The shipped
   starters live in code with their date (10% / 5% / 2 ft / panel TBD, Q2).
   That follows the `SHIPPED_HEIGHT_TYPES` pattern, so a starter change needs no
   migration.
2. **`shared/takeoffQuantities.ts`**, restructured the way § 4.1 warned it
   would be. `quantitiesForRun` takes a **required** `extras` argument, with a
   named `NO_EXTRAS` for callers that have none. This matches the
   `NO_VERTICALS` precedent: a forgotten extra should be a compile error, not a
   lower number.
   - **Rename, do not add.** `conduitFeet`, `cableFeet` and `totalWireFeet`
     become `…MeasuredFeet`, and new `…ToBuyFeet` fields appear beside them.
     Every existing reader then fails to compile and has to choose which one it
     means. That is the same move `groundFeet` made. The **fittings must read
     the measured figure** (`legFromRun`'s `conduitFeet`). Extra conduit covers
     route uncertainty and does not add couplings. The **bid line, materials
     list and CSV read to-buy**.
   - New per-run fields: `conduitExtraFeet`, `wireExtraFeet` and `makeupFeet`.
     With them, `flat + vertical + extra + makeup === toBuy` always holds. That
     is the same invariant `wireFlatFeet + wireVerticalFeet` has today.
3. **`server/runTypeFootageCore.ts` `groupRunFootage`** sums the new terms
   into `RunTypeFootageRow`. The bid lines already derive their quantity from
   this, so extras reach the bid with no new line kind.
4. **The run row, the totals panel and the drops readout** show the § 5j
   arithmetic. Terms that are zero are dropped, except when "nobody set this"
   is the reason: the row says it, and the totals count it ("23 runs carry no
   extra").
5. **Settings → Takeoff** (next to heights) gets the four numbers, the starters
   labelled with their date, and **Accept starters** (Q1). The company-default
   warning, `CompanyDefaultNotice`, goes on it. The accept button states the
   count before anything moves: "This changes the wire on 7 bids that still
   follow the drawing." That is § 5d trap 1's answer, reused.
6. **The run type editor** shows the four numbers as "company default (10%)"
   placeholders. `InlineNumberField` gets `whenUnset={{ placeholder }}`
   (CLAUDE.md § 6), because this is inheritance, not zero.
7. **The run panel** gets "Extra differs from type", placed behind "more"
   (§ 2.5: the run must say it is overridden, and a reset is one click).
8. **The CSV and the materials-list note** replace "No extra is included" with
   the actual terms, or with "no extra set" when that is the truth.
9. **Rewrite the header of `server/seed/baselineRunTypes.ts`.** It says no
   allowances ship (§ 5j: rewrite it, do not delete it).

### Where this could produce a wrong number

- **Every unlocked bid moves when extras turn on.** Bid-line quantities follow
  the drawing live, so accepting starters raises the wire on every bid that is
  not locked (0073 is the lock). That is correct for inheritance, and it is
  why the accept button states the count first. **If Q1 goes the other way
  (starters apply without accept), then deploying the CODE moves every live
  bid's wire by about 10%, with no action by anyone.** Nothing in the
  migration would reveal that.
- **Extra folded into the fittings.** Couplings, straps and pull points read
  measured pipe. The rename in step 2 is what stops a padded figure reaching
  them. Test it: a run with 5% conduit extra has the same coupling count as
  the same run with none.
- **Conduit extra applied to verticals.** This is the § 7.1 split, and it is
  the likeliest thing to be "simplified" into one percentage on one total.
  Test it: a run with a vertical and no flat length gets zero conduit extra
  and non-zero wire extra.
- **Makeup as a percentage, or makeup on conduit.** This is ruled out in
  § 2.2. Test it: doubling a run's length leaves its makeup unchanged, and
  makeup never appears in `conduit…`.
- **A restated shape that drops a field.** `GroupableRun` is written out
  field by field. The run-level extras must go through it, or the bid silently
  uses the type's figure while the panel shows the run's. Take the row, not a
  shape (CLAUDE.md § "structural in the maths").
- **Labour on the extra.** The bid line multiplies quantity × hours per foot,
  so extra footage carries install hours. See Q5.

---

## 2. Typed-length runs (§ 4c)

### What it does for the estimator

On a sheet with no usable scale, conduit cannot be counted at all today.
Tracing is refused (`measurabilityOf`). That rules out riser diagrams,
one-lines, details drawn at another scale, and a homerun whose length is known
while the plan's scale is not. After this item, the estimator draws the path
to show _where_ the conduit goes and types `60 ft`. The line records the route
and the number comes from the estimator. Everything downstream (conduit, wire
per conductor, verticals, extras, bid line, CSV) works unchanged, because it
all takes a length.

A typed run looks different from a measured one wherever its footage appears:
"60.00 typed" instead of "60.00 traced". Those are two different kinds of fact.

### What Track A adds

- One nullable column, `takeoff_runs.typedLengthInches`, as `decimal(14,4)`.
  That is the same type as `lengthInches`, so both go through one conversion.
  **NULL means "measured from the points"**, which is every existing row. No
  default and no backfill.

It must be its own column. `lengthInches` is "recomputed on read", and it is
written in four places: `takeoffRunsRouter.ts:523`, `:569`, `:655` and
`db.ts:7516`. A typed value stored there would be overwritten the next time a
point moved or a scale changed.

### What B builds after the migration

1. **`TracedRun` gains `typedLengthInches: number | null`, REQUIRED.**
   `runFeet` returns the typed length when there is one and does not consult
   the ratio. Because the field is required, every `quantitiesForRun` caller
   has to supply it. That includes `groupRunFootage`, whose `GroupableRun` is
   a restated shape: the panel and the bid cannot disagree about a typed run.
2. **The measurability gate becomes conditional.** Tracing on an unscaled or
   N.T.S. sheet is allowed, with the condition on screen: "No scale — you'll
   type the length." A run on such a sheet with no typed length stays
   unmeasurable, which is today's state, counted and named.
   `quantitiesForRun`'s null return then means "no scale **and** no typed
   length".
3. **The UI.** After drawing, "or type the length" appears beside the measured
   figure. On an unscaled sheet, the type box _is_ the figure. An existing run
   can switch either way, and clearing the typed value returns it to measured.
   The feet-and-inches entry uses the existing parser.
4. **Every place footage shows** gets the "typed" word: the run row, the
   arithmetic line, the materials list and the CSV (a new "Length source"
   column).
5. **Legs (D20) and quantity mode (D21).** The typed length is per ROW, so each
   leg has its own. Nothing here needs keeping equal across rows, unlike
   `traceMode`.

### Where this could produce a wrong number

- **Something "helpfully" recomputes a typed run from its geometry.** § 4c and
  § 4d name this. It is guarded structurally by the separate column, and **by
  a test that fails if a typed length is ever overwritten**. The test edits
  points, changes the sheet scale and re-saves the run, then asserts
  `typedLengthInches` is unchanged.
- **The typed length double-counts the verticals.** "I know the pull is 60 ft"
  might mean flat or total. If it means total and the run also has end kinds,
  the drops are added twice. See Q6. The recommended answer is _flat, and say
  so in the field's label_, with the arithmetic line showing
  `60.00 typed + 8.50 vertical` so any double count is visible.
- **Bends proposed from a schematic.** D19 proposes bends from the drawn
  corners, and on a riser the corners are symbolic. They are proposals a person
  approves, so they are not silently counted. The proposal line on a typed run
  gets "drawn path — check these against the job".
- **A typed run on a scaled sheet shows a measured figure beside it.** Show
  both ("typed 60.00 · drawn 54.20"). That way a typo like 600 is one glance
  away, and neither figure is hidden.

---

## 3. Verticals on marks (Phase 8)

### What it does for the estimator

A device that is marked but never traced to has no drop today. Examples are a
receptacle dropped off a homerun that nobody traced, a fixture whip, or a
disconnect on a wall. Thirty receptacles at 18" under a 10 ft run height is
255 ft of pipe, plus wire per conductor, and none of it is counted (§ 2.4).
After this item, a counted group can say "each of these drops from run height
to Receptacle, in 3/4" EMT, 2 #12 + ground". The drop footage then lands on
that run type's existing bid lines, shown as its own term ("+ 255.00 from
marks").

Per § 7 the drop is set once on the **group**, not on each mark. Nothing is
counted until somebody sets it.

### What Track A adds

Three nullable columns on `takeoff_groups`:

| Column             | Holds                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `dropKind`         | The height type key at the device, such as `receptacle`. NULL means not answered and no drop. `distribution` means "no drop" as an answer.  |
| `dropHeightInches` | This group's own device height. NULL follows the kind, then the job, then the company.                                                      |
| `dropRunTypeId`    | What the drop is made of. FK to `takeoff_run_types`, `set null`. NULL means no material to price it, so it is flagged and left off the bid. |

Plus an index and an FK on `dropRunTypeId`. That is a second statement, and
the slow one, because MySQL checks every existing row.

**Correction to § 5e.** Its line "Phase 8 stops needing its own migration" is
wrong. The group row gave the drop a home, but `takeoff_groups` has no height
columns. The migration is smaller than the old per-stamp design, not absent.
Noted there as well.

### What B builds after the migration

1. **`shared/groupDrops.ts`.** For each group it gives the resolved height
   (the same `resolveMountingHeight` / `resolveDistributionHeight` a run end
   uses), the drop per mark, and the count of marks **not claimed by a run
   end**. Feet go per stamp into the existing `totalVerticalFeet`, which is
   already the one place run verticals and stamp verticals are summed. Its
   test already hands it a stamp carrying a vertical (§ 5d); this is what makes
   that fixture real.
2. **Wire for a drop comes from the type, read live.** It is one synthesised
   circuit, the way `quantityCircuit` does it for D21, through the same
   `circuitWire`. There is one arithmetic. Wire extra applies to a mark drop
   (it is vertical footage); conduit extra does not (§ 7.1).
3. **`groupRunFootage`** takes the group drops as an input and adds them to the
   run type's row as a named `markDropFeet` term. The bid line quantity then
   includes them. The run-type line breakdown shows "from marks".
4. **The group row** gets "Drop: Receptacle 1'-6" from run height 10'-0" ·
   3/4" EMT · 30 marks = 255.00 ft". It sits behind the group's "more" until
   set, and after that it is always shown. The pickers are the same
   components as the run ends pickers.
5. **The drops readout (D21)** gains mark drops, labelled "from marks", grouped
   by type like the rest. Its query is in `refreshRuns`, and the group
   mutations must invalidate it too. That is CLAUDE.md's staleness rule: find
   the helper the group mutations already use and add the query there.
6. **Fittings.** None are counted for a mark drop in v1, and the row says so:
   "connectors and elbows for these drops are not counted". See Q8.

### Where this could produce a wrong number

- **Double count with a run end.** This is handled by the existing claim rule:
  a stamp a run end links (`startStampId` / `endStampId`) carries no drop of its
  own. Stamps sitting on a run end without a link are **flagged, not
  resolved** ("3 of these may be counted twice — link them to the run"), as
  § 5d already specified.
- **Double count with a quantity-mode approved drop.** A quantity leg end on a
  marked device approves a drop with no stamp link, so the group's drop is
  added on top. Apply the same flag to quantity leg ends within
  `SUGGEST_WITHIN_INCHES` of a mark in a dropping group. It is shown, never
  auto-resolved.
- **Double count with the assembly's whip (D18).** A receptacle assembly
  carrying 25 ft of NM-B may already include getting down the wall. See Q7.
  The recommendation is to show both terms and never block.
- **Unscaled sheets.** A mark drop needs no scale, so it **counts** on a sheet
  with no scale. This is deliberately unlike an unmeasurable run (§ 5d
  decision 4). That rule exists because a run's flat length is unknown, and a
  mark has no flat length to be unknown. It is stated in the code comment so
  nobody "makes it consistent".
- **Group deleted or retyped.** `dropRunTypeId` is `set null`, so the drop
  leaves the bid and the group row says "no type — not on the bid". It does
  not vanish silently.

---

## 4. For Track A — ONE migration session, all ADDITIVE

**Classified per FILE, as CLAUDE.md requires. Every file is additive and none
has an `UPDATE`.** Asked of each file: does new code need the column to
compute a number it already computes correctly? No. With every new column NULL
and the new table empty, the new code produces today's numbers exactly. That
holds under Q1's recommended answer. A test pins it for all three items: a run
and a group with every new field empty give the current quantities.

So: **step 1, apply all of these before the push; step 2, deploy; step 3 is
empty.** There is no backfill.

They are grouped as one release, but as **one statement per file**, following
§ 5d's reasoning. MySQL cannot undo DDL, and drizzle records a file only when
all of it succeeds, so a multi-statement file that dies halfway leaves an
unrecorded partial. Numbers are A's to assign (the next free is 0089 on
`local-dev` today). Hand-write them; do not generate. See CLAUDE.md
§ "NEVER RUN GENERATED MIGRATION OUTPUT".

| #   | File (suggested name)          | Statement                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `_takeoff_extra_defaults.sql`  | `CREATE TABLE takeoff_extra_defaults` (`id`, `userId int NOT NULL` FK users cascade, **unique `userId`**, `conduitExtraPct decimal(6,4)`, `wireExtraPct decimal(6,4)`, `makeupDeviceInches int`, `makeupPanelInches int`, `acceptedAt timestamp`, `createdAt`, `updatedAt`), `COLLATE=utf8mb4_unicode_ci`, index and FK inside the CREATE |
| 2   | `_run_type_extras.sql`         | `ALTER TABLE takeoff_run_types ADD conduitExtraPct decimal(6,4), ADD wireExtraPct decimal(6,4), ADD makeupDeviceInches int, ADD makeupPanelInches int`                                                                                                                                                                                    |
| 3   | `_run_typed_length_extras.sql` | `ALTER TABLE takeoff_runs ADD typedLengthInches decimal(14,4), ADD conduitExtraPct decimal(6,4), ADD wireExtraPct decimal(6,4)`                                                                                                                                                                                                           |
| 4   | `_height_type_makeup_at.sql`   | `ALTER TABLE takeoff_mounting_heights ADD makeupAt enum('device','panel')`                                                                                                                                                                                                                                                                |
| 5   | `_group_drops.sql`             | `ALTER TABLE takeoff_groups ADD dropKind varchar(64), ADD dropHeightInches int, ADD dropRunTypeId int`                                                                                                                                                                                                                                    |
| 6   | `_group_drop_run_type_fk.sql`  | `ALTER TABLE takeoff_groups ADD CONSTRAINT … FOREIGN KEY (dropRunTypeId) REFERENCES takeoff_run_types(id) ON DELETE SET NULL` (plus its index)                                                                                                                                                                                            |

All nullable, **no `DEFAULT` on any of them**. A `DEFAULT 0` on an extra would
make "nobody set this" and "deliberately 0%" the same value. That is the exact
distinction the "23 runs carry no extra" line depends on (the 0073 comment
makes the same argument).

- **Fractions, not percents.** 0.10 means 10%, which is `productivityPct`'s
  convention and `decimal(6,4)` like it. Negative values are refused at the
  router, not the schema, because an extra below zero would cut measured
  footage (§ 5a).
- **FK names** must be drizzle's own and under 64 characters, because
  `server/migrationRun.test.ts` checks them. `takeoff_groups_dropRunTypeId_takeoff_run_types_id_fk`
  is 52 characters (measured).
- **File 6 is the slow one** and the likeliest to fail, because the live
  database is missing FKs from the 0004 incident. Rehearse it on a restored
  backup first (§ 5d's order: backup → rehearse → `schemaDrift.mts` → apply →
  `schemaDrift.mts` → check old-code totals are unchanged → deploy).
- **`schema.ts`** gets matching drizzle definitions with the NULL meanings in
  the column comments, as the rest of the file does.
- **If Q4 is answered "no"**, drop file 4. **If Q6 is answered "total"**,
  nothing changes in the schema.

**Expect `schemaDrift.mts` to name these six as pending before, and none
after.** If what it prints does not match, stop and find out why before going
on. A mismatch means either this line is stale or the database is not in the
state you think, and those want opposite responses.

---

## 5. Order B would build in, once A lands

1. **Typed lengths first.** It is the smallest, it touches only `runFeet`, and
   it unblocks real work (risers) the day it ships.
2. **Extras and makeup.** This is the biggest short number. It restructures
   `takeoffQuantities.ts` once, with typed lengths already in it.
3. **Mark drops last.** They add a term to the structure item 2 settled, and
   the flags need the claim machinery that is already there.

Each item ships and is looked at on "Bar layout check" before the next starts.
The look covers the number **moving** when its setting moves, not just the
screen rendering. Nothing merges before that.

---

## 6. Questions for the owner, each with a recommendation

1. **Do starter extras apply before the company accepts them?**
   _Recommended: no. Show them, dated, with an Accept button; until then they
   apply nothing, and the totals say "no extra set"._ This is the CLAUDE.md
   rule from 2026-09-25 ("any future starter with a number follows the same
   shape"), and it is newer than § 2.3, which said ship them applied. It also
   means deploying the code moves no live bid. On a yes, § 2.3 and § 5j get a
   line saying what overrode them, in both files.
2. **What is the panel makeup starter?** § 2.3 says only "more at panels".
   _Recommended: 2 ft at a device and 5 ft at a panel_, labelled a convention
   and dated. The 5 is my figure, not a recorded one. Change it if yours
   differs.
3. **Cable runs (MC / Romex): which extras?** _Recommended: the WIRE
   percentage on all of it, verticals included, and makeup per END in cable
   feet (not × conductors)._ The cable is the wire, so § 7.1's wire reasoning
   applies. One tail of cable per box, not one per conductor.
4. **Should a company's own height type be markable as a panel end for
   makeup?** _Recommended: yes_ (file 4). Otherwise a "Switchboard" type the
   user added gets device makeup at the end of every feeder, which is short by
   the difference on the largest wire on the job.
5. **Does the extra footage carry install hours?** _Recommended: yes, all of
   it, at the same hours per foot._ Extra conduit is "bought, bent and
   installed" (§ 5j). Leaving makeup out would need a labour-exempt portion on
   a bid line, and makeup's hours are tiny (12 ft of #12 is a few minutes). It
   errs toward covering the work, and the breakdown says it.
6. **Does a typed length mean the flat run or the whole pull?**
   _Recommended: flat._ It then goes through the same arithmetic as a traced
   line, and the field says "length along the drawing — drops and extra are
   added". "Whole pull" would need the ends forced level on typed runs, which
   is a second rule to keep in step.
7. **A group drop on a device whose assembly carries a whip: allow, warn, or
   block?** _Recommended: allow, and show both on the group row_ ("whip 25 ft
   - drop 8.50 ft each"), with one line when both are non-zero: "this
     assembly's whip may already include the drop". The estimator knows which
     applies (§ 5c). Blocking would forbid a real commercial case, where a device
     is fed by conduit from the ceiling and whipped to the next device.
8. **Fittings on mark drops?** _Recommended: none in v1, said on the row._
   Counting one connector at the box and one 90 at the top is a guess about
   how every drop is built. It can come later as a per-type setting.
9. **A run-level extras override: build the columns now even though the UI is
   behind "more"?** _Recommended: yes_ (file 3). § 5j says the run may differ,
   and adding two nullable columns now is cheaper than a second migration
   session later.
