# Track B — the three items held for migrations. PLAN ONLY, 2026-09-28

The three items `track-b-next-batch-plan.md` § "Looked at and left out" held
back because each needs columns:

1. **Extra and makeup footage.** This covers § 5j, R7 and T16.
2. **Typed-length runs** (§ 4c).
3. **Verticals on marks.** This is Phase 8, "verticals on stamps".

Nothing here is built. **B builds nothing until Track A's migration is applied**
(§ 5 is the handoff). The owner answered the nine questions on 2026-09-28, and
§ 7 records the answers. Everything below already follows them.

**Read first.** These are the decisions this plan builds on. They are cited
rather than restated:

- **§ 2.2 / § 2.3 / § 5j / § 7.1** in `plan-viewer-overhaul.md` cover three
  quantities in three units. Conduit extra applies to the traced length only.
  Wire extra applies to traced plus vertical. Makeup is wire only, per
  conductor per end.
- **§ 2.0 / D3.** These are TYPE settings, not a form on every run.
- **§ 2.5.** NULL means "follow the level above", and nothing is copied down.
- **§ 5a.** Measure honestly and pad where it can be seen. Every pad is its own
  term on screen.
- **§ 5d** covers verticals on runs, which are **already built**. The columns
  exist, and `totalVerticalFeet` already decides whether a vertical belongs to
  the run or the stamp.
- **§ 7.** A vertical belongs to the GROUP, not to each stamp.
- **D18.** Devices own the branch wire through their whips. **D21** is
  quantity mode, whose approved drops are end kinds.
- **CLAUDE.md § Starter content, as amended 2026-09-25.** Unaccepted starters
  apply nothing.

---

## 1. Extra and makeup footage

### What it does for the estimator

Traced footage is what the drawing measures. It is not what gets bought.
Today every run reaches the bid, the materials list and the CSV with no extra
at all. The CSV even says so: "No extra is included"
(`shared/takeoffExport.ts:328`). A 400 ft homerun of 3 #12 is bid at 1,200 ft
of wire when the truck needs about 1,340 ft. The shortfall is the whisper
§ 2.3 warns about: nothing on screen says the total is low.

After this item, each run and each bid total shows the arithmetic with every
term visible. The breakdown also says which footage carries labor (Q5):

```
Conduit   112.00 traced + 8.50 vertical + 5.60 extra = 126.10 ft bought
          labor on 120.50 ft installed — extra is material only
Wire      336.00 traced + 25.50 vertical + 36.15 extra + 9.00 makeup = 406.65 ft bought
          labor on 370.50 ft installed (traced + vertical + makeup) — extra is material only
```

When a bid carries no extra at all, the screen says so in words. It is never a
quiet zero: "23 runs carry no extra".

### The values, and where each one can be set — ALL FIVE AT ALL THREE LEVELS

The owner asked for every value to be adjustable for the company, per run
type, and per run.

| Value                           | Company                                                      | Run type                                      | Run                                      | Starter (inert until accepted) |
| ------------------------------- | ------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------- | ------------------------------ |
| Wire extra %                    | `takeoff_extra_defaults.wireExtraPct`                        | `takeoff_run_types.wireExtraPct`              | `takeoff_runs.wireExtraPct`              | 10%                            |
| Conduit extra %                 | `takeoff_extra_defaults.conduitExtraPct`                     | `takeoff_run_types.conduitExtraPct`           | `takeoff_runs.conduitExtraPct`           | 5%                             |
| Device makeup                   | `takeoff_extra_defaults.makeupDeviceInches`                  | `takeoff_run_types.makeupDeviceInches`        | `takeoff_runs.makeupDeviceInches`        | **18 in** per conductor        |
| Panel makeup                    | `takeoff_extra_defaults.makeupPanelInches`                   | `takeoff_run_types.makeupPanelInches`         | `takeoff_runs.makeupPanelInches`         | **5 ft** per conductor         |
| Makeup for a custom height type | `takeoff_mounting_heights.makeupInches` (on that type's row) | `takeoff_run_types.makeupByKindInches` (JSON) | `takeoff_runs.makeupByKindInches` (JSON) | none: follows device or panel  |

**Check against the first draft.** It covered the two percentages at all three
levels, and device and panel makeup at company and type only. **Missing and now
added:** device and panel makeup per run, and makeup for a custom height type at
any level. The first draft only let a custom type say "treat me as a panel"
(`makeupAt`). That stays, because it is how a "Switchboard" follows the panel
figure at every level without a number of its own. The own number is now
possible as well.

**Why JSON for "per custom type" on a run type and a run**, rather than two new
tables: the key is the height type's string key, which already survives a
rename (§ 5d). A map cannot hold two entries for one key, so there is no
uniqueness to enforce. The router validates the shape with zod: keys must be
known height types, and values must be non-negative whole inches. That makes
two columns instead of two tables, two indexes and two FKs, and the migration
stays small.

**The makeup value at one end of kind K**, whose class C is `panel` if K is
`panel` or a type marked `makeupAt = 'panel'`, and `device` otherwise:

```
run[K] → run[C] → type[K] → type[C] → company[K] → company[C] → accepted starter[C] → unset (0, flagged)
```

A nearer level always wins, following the run → type → company chain of
§ 2.5. Within one level, a named height type beats the plain device or panel
figure. Q10 asks the owner to confirm the one case where that ordering bites.

**Per-run values live on every row of the run**, root and legs alike, and the
server keeps them equal. That is the `traceMode` rule (D21 trap 2): a reader
decides from the row in front of it, and there is no lookup to forget.

### The arithmetic (pinned before building)

- **Conduit bought** = flat × (1 + conduit%) + vertical. The vertical gets no
  conduit extra (§ 7.1).
- **Wire bought, per conductor** = (flat + vertical) × (1 + wire%) + makeup.
- **Makeup** = the end's makeup length × conductors in that leg, summed over
  the counted ends. Grounds count as conductors, because every wire gets a
  tail. Makeup is never multiplied by a percentage.
- **Cable runs (Q3):** the wire percentage applies to all of it, verticals
  included. Makeup is counted once per END in cable feet, not × conductors.
  The cable is the wire.
- **Labor (Q5): "installed" footage carries hours, and extra does not.**
  Installed conduit = flat + vertical. Installed wire = flat + vertical +
  makeup. Makeup carries labor at the run's own hours per foot.
- **Counted ends.** Makeup applies at the **same ends where the fittings count
  a connector**, which is every node except an `open:` one
  (`shared/runFittings.ts:707`). There is one rule about where wire terminates,
  so makeup and connectors cannot disagree. A quantity leg therefore gets
  makeup only at an approved drop, the same as its connectors under D21.
- **Branch-wiring runs (D18)** have no wire on the bid, so they get no wire
  extra and no makeup. A branch conduit run keeps its pipe, and its pipe keeps
  its conduit extra.

### What Track A adds (the files are in § 5)

- A new table, **`takeoff_extra_defaults`**, with one row per company. It holds
  the two percentages, the two makeup lengths and `acceptedAt`.
- **Five nullable columns on `takeoff_run_types`**: the four values plus
  `makeupByKindInches`.
- **Six on `takeoff_runs`**: the same five plus `typedLengthInches` (item 2).
- **Two on `takeoff_mounting_heights`**: `makeupAt` and `makeupInches`. A
  company row whose `heightInches` is NULL still falls through to the shipped
  height (`resolveMountingHeight` reads `usableInches`). Checked in the code,
  so adding a makeup-only row to a shipped type cannot unset its height.
- **One on `bid_line_items`: `laborQty`** (Q5). Locking a bid (0073) freezes
  ONE stored `qty` per line (`db.ts:5525`). Once extra is material only, a
  run-type line has two quantities: bought and installed. If only `qty` were
  frozen, the labor would either keep following the drawing on a locked bid or
  be charged on the bought figure. NULL means "labor on `qty`", which is every
  existing line and every line that is not from a run.

**Defaults:** none. Every column is NULL, and the table starts empty. **No
backfill.**

### What B builds after the migration

1. **`shared/runExtras.ts`**, holding the resolution and nothing else. It
   returns each value with its source (`run`, `type`, `company`, `starter`,
   `unset`), the same shape as `resolveMountingHeight`. The starters live in
   code with their date: 10% / 5% / 18 in / 5 ft. That follows the
   `SHIPPED_HEIGHT_TYPES` pattern, so a starter change needs no migration.
   Starters apply **only when the company row has `acceptedAt`**.
2. **`shared/takeoffQuantities.ts`**, restructured the way § 4.1 warned it
   would be. `quantitiesForRun` takes a **required** `extras` argument, with a
   named `NO_EXTRAS`, following the `NO_VERTICALS` precedent.
   - **Rename, do not add.** `conduitFeet`, `cableFeet` and `totalWireFeet`
     become `…InstalledFeet`, and `…BoughtFeet` fields appear beside them.
     Every existing reader then fails to compile and has to choose which one it
     means. **Fittings read installed**, because extra conduit does not add
     couplings. **Labor reads installed. The bid line's material, the
     materials list and the CSV read bought.**
   - New terms: `conduitExtraFeet`, `wireExtraFeet` and `makeupFeet`.
     `flat + vertical + extra + makeup === bought` and
     `flat + vertical + makeup === installed` (wire) always hold.
3. **`groupRunFootage`** sums the new terms. The run-type line gets
   `qty = bought` and `laborQty = installed`. **One helper, `laborQtyOf(line)`,
   is the only place `laborQty ?? qty` is written**, and every hours
   calculation goes through it. A search for `qty` beside `snapshotLaborHours`
   must find nothing else.
4. **Locking** (`lockBidQuantities`) freezes `laborQty` alongside `qty` on
   run-type lines, and unlocking clears nothing, as today.
5. **The run row, the totals panel and the bid line breakdown** show both
   lines: what is bought, and what labor is on, with "extra is material only"
   in words. Terms that are zero are dropped, except when "nobody set this" is
   the reason ("23 runs carry no extra").
6. **Settings → Takeoff** (next to heights) gets the four numbers, the starters
   labelled with their date, and **Accept starters**, which states the count
   first: "This changes the wire on 7 bids that still follow the drawing".
   `CompanyDefaultNotice` goes on it. Each height type on the heights screen
   gets a makeup cell ("follows device, 18 in") and a panel checkbox.
7. **The run type editor** shows device and panel makeup and both percentages,
   with "company default (10%)" placeholders (`whenUnset={{ placeholder }}`,
   CLAUDE.md § 6). Custom height types go behind "more", with a field for each
   custom type that is in use.
8. **The run panel** gets the same five, behind "more", and says "differs from
   type" with a one-click reset (§ 2.5).
9. **The CSV and the materials-list note** replace "No extra is included" with
   the actual terms, or with "no extra set" when that is the truth.
10. **Rewrite the header of `server/seed/baselineRunTypes.ts`**, which says no
    allowances ship.

### Where this could produce a wrong number

- **Labor charged on the extra.** Q5 made this the sharpest risk in the item.
  The guard is the `laborQtyOf` helper plus a test: a run with 10% wire extra
  has the same hours as the same run with none, and **more** hours when the
  makeup grows.
- **A locked bid whose labor keeps moving.** Test: lock, raise the extra, and
  confirm that neither `qty` nor `laborQty` moves. Unlock, and confirm that
  both move.
- **Every unlocked bid moves when starters are accepted.** This is correct for
  inheritance, and the accept button states the count first. Deploying the code
  moves nothing, because starters are inert until accepted (Q1).
- **Extra folded into the fittings.** Test: a run with 5% conduit extra has the
  same coupling count as the same run with none.
- **Conduit extra applied to verticals** (§ 7.1). Test: a vertical-only run
  gets zero conduit extra and non-zero wire extra.
- **Makeup that scales with length.** Test: doubling a run's length leaves its
  makeup unchanged, and makeup never appears in `conduit…`.
- **A restated shape that drops a field.** `GroupableRun` is written out field
  by field, so run-level values must reach it. Take the row (CLAUDE.md
  § "structural in the maths").
- **Legs disagreeing.** If a per-run value were written to the root only, legs
  would read their type's figure. The server writes all rows in one statement,
  with a test on a three-leg run.

---

## 2. Typed-length runs (§ 4c)

### What it does for the estimator

On a sheet with no usable scale, conduit cannot be counted at all today.
Tracing is refused (`measurabilityOf`). That rules out riser diagrams,
one-lines, details drawn at another scale, and a homerun whose length is known
while the plan's scale is not. After this item, the estimator draws the path
to show _where_ the conduit goes and types `60 ft`.

**The typed length is the FLAT run along the drawing (Q6), and the field says
so:** "length along the drawing — drops and extra are added". A typed run then
goes through exactly the same arithmetic as a traced one. It looks different
wherever its footage appears: "60.00 typed" instead of "60.00 traced".

### What Track A adds

- One nullable column, `takeoff_runs.typedLengthInches`, as `decimal(14,4)`,
  the same type as `lengthInches`. **NULL means "measured from the points"**,
  which is every existing row.

It must be its own column. `lengthInches` is "recomputed on read", and it is
written in four places: `takeoffRunsRouter.ts:523`, `:569`, `:655` and
`db.ts:7516`.

### What B builds after the migration

1. **`TracedRun` gains `typedLengthInches: number | null`, REQUIRED.**
   `runFeet` returns it when set and does not consult the ratio. Because the
   field is required, every caller has to supply it, `groupRunFootage`
   included.
2. **The measurability gate becomes conditional.** Tracing on an unscaled or
   N.T.S. sheet is allowed, with "No scale — you'll type the length".
3. **The UI.** After drawing, "or type the length" appears. On an unscaled
   sheet the box _is_ the figure. An existing run can switch either way.
4. **The "typed" word** appears on the run row, the arithmetic line, the
   materials list and the CSV (a new "Length source" column).
5. **Legs and quantity mode.** The typed length is per row: each leg has its
   own.

### Where this could produce a wrong number

- **Something recomputes a typed run from its geometry.** A test edits points,
  changes the scale and re-saves the run, then asserts `typedLengthInches` is
  unchanged.
- **The typed length double-counts the drops.** The label says "flat", and the
  line shows `60.00 typed + 8.50 vertical`, so a double count is visible.
- **Bends proposed from a schematic.** They are proposals a person approves,
  and on a typed run they get "drawn path — check these against the job".
- **A typo like 600.** On a scaled sheet both figures are shown
  ("typed 60.00 · drawn 54.20").

---

## 3. Verticals on marks (Phase 8)

### What it does for the estimator

A device that is marked but never traced to has no drop today. Thirty
receptacles at 18" under a 10 ft run height is 255 ft of pipe, plus wire per
conductor, and none of it is counted (§ 2.4). After this item, a counted group
can say "each of these drops from run height to Receptacle, in 3/4" EMT, 2 #12

- ground". The footage lands on that run type's existing bid lines as its own
  term ("+ 255.00 from marks"). It is set once on the **group** (§ 7), and
  nothing is counted until somebody sets it.

### What Track A adds

| Column             | Holds                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `dropKind`         | The height type key at the device. NULL means not answered and no drop. `distribution` means "no drop" as an answer.                    |
| `dropHeightInches` | This group's own device height. NULL follows the kind, then the job, then the company.                                                  |
| `dropRunTypeId`    | What the drop is made of. FK to `takeoff_run_types`, `set null`. NULL means nothing to price it, so it is flagged and left off the bid. |

Plus an index and the FK, in their own file.

**Correction to § 5e.** Its line "Phase 8 stops needing its own migration" is
wrong, and it is noted there as well.

### What B builds after the migration

1. **`shared/groupDrops.ts`.** It resolves the height (the same resolvers a
   run end uses), the drop per mark, and the marks **not claimed by a run
   end**. It feeds the existing `totalVerticalFeet`.
2. **Wire from the type, read live**, as one synthesised circuit
   (`quantityCircuit`'s way). Wire extra applies and conduit extra does not
   (§ 7.1). Makeup applies at the device end, at the group's kind. Labor is on
   drop plus makeup, not on the extra (Q5).
3. **`groupRunFootage`** adds the drops to the run type's row as
   `markDropFeet`.
4. **The group row** shows "Drop: Receptacle 1'-6" from run height 10'-0" ·
   3/4" EMT · 30 marks = 255.00 ft". **Whip and drop are shown together (Q7)**:
   "whip 25 ft + drop 8.50 ft each", with "this assembly's whip may already
   include the drop" whenever both are non-zero.
5. **The drops readout (D21)** gains mark drops. The group mutations must
   invalidate its query as well (CLAUDE.md's staleness rule).
6. **Fittings: none counted (Q8), and labelled clearly** on the group row, the
   bid line breakdown and the materials list: "Connectors and elbows for these
   30 drops are NOT counted — add them by hand."

### Where this could produce a wrong number

- **Double count with a run end.** A linked stamp carries no drop of its own.
  Unlinked stamps on a run end are **flagged** ("3 may be counted twice").
- **Double count with a quantity-mode drop.** The same flag applies to
  quantity leg ends within `SUGGEST_WITHIN_INCHES` of a dropping mark.
- **Double count with the whip.** Shown, never blocked (Q7).
- **Unscaled sheets.** A mark drop needs no scale, so it counts. This is
  deliberately unlike an unmeasurable run, and the code comment says why.
- **Group retyped or type deleted.** The drop leaves the bid, and the row says
  "no type — not on the bid".

---

## 4. Order B builds in, once A's migration is in

1. **Typed lengths.** It is the smallest and unblocks risers.
2. **Extras, makeup and the labor split.** This is the biggest short number.
3. **Mark drops.** They add a term to the structure item 2 settled.

Each item is looked at on "Bar layout check" before the next starts. The look
checks that the number **moves** when its setting moves, and that the hours
**do not** move when only the extra does. Nothing merges before that.

---

## 5. HANDOFF TO TRACK A — the migration

**Seven hand-written files, one statement each, in this order. Every one is
ADDITIVE:** no `UPDATE`, no `DEFAULT`, all nullable. With them in place and
empty, today's code and B's code both produce today's numbers, because the
starters are inert until accepted. So: **step 1, apply before any B code is
pushed; step 2, deploy; step 3 is empty.** No backfill.

Numbers are A's to assign. `local-dev` ends at 0088 today; if A has taken
numbers since, shift these. Do not generate them (CLAUDE.md § "NEVER RUN
GENERATED MIGRATION OUTPUT"). Match `COLLATE=utf8mb4_unicode_ci` on the new
table, and keep FK names in drizzle's form and under 64 characters
(`server/migrationRun.test.ts`).

| Order | File                               | The one statement                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `0089_takeoff_extra_defaults.sql`  | `CREATE TABLE takeoff_extra_defaults` (`id` PK, `userId int NOT NULL`, `conduitExtraPct decimal(6,4)`, `wireExtraPct decimal(6,4)`, `makeupDeviceInches int`, `makeupPanelInches int`, `acceptedAt timestamp`, `createdAt`, `updatedAt`), with **UNIQUE(`userId`)** and the FK to `users` ON DELETE CASCADE inside the CREATE |
| 2     | `0090_run_type_extras.sql`         | `ALTER TABLE takeoff_run_types ADD conduitExtraPct decimal(6,4), ADD wireExtraPct decimal(6,4), ADD makeupDeviceInches int, ADD makeupPanelInches int, ADD makeupByKindInches json`                                                                                                                                           |
| 3     | `0091_run_typed_length_extras.sql` | `ALTER TABLE takeoff_runs ADD typedLengthInches decimal(14,4), ADD conduitExtraPct decimal(6,4), ADD wireExtraPct decimal(6,4), ADD makeupDeviceInches int, ADD makeupPanelInches int, ADD makeupByKindInches json`                                                                                                           |
| 4     | `0092_height_type_makeup.sql`      | `ALTER TABLE takeoff_mounting_heights ADD makeupAt enum('device','panel'), ADD makeupInches int`                                                                                                                                                                                                                              |
| 5     | `0093_bid_line_labor_qty.sql`      | `ALTER TABLE bid_line_items ADD laborQty decimal(10,4)`, the same precision as `qty`                                                                                                                                                                                                                                          |
| 6     | `0094_group_drops.sql`             | `ALTER TABLE takeoff_groups ADD dropKind varchar(64), ADD dropHeightInches int, ADD dropRunTypeId int`                                                                                                                                                                                                                        |
| 7     | `0095_group_drop_run_type_fk.sql`  | `ALTER TABLE takeoff_groups ADD INDEX takeoff_groups_dropRunTypeId_idx (dropRunTypeId), ADD CONSTRAINT takeoff_groups_dropRunTypeId_takeoff_run_types_id_fk FOREIGN KEY (dropRunTypeId) REFERENCES takeoff_run_types(id) ON DELETE SET NULL ON UPDATE NO ACTION` (the FK name is 52 characters, measured)                     |

**Order that matters:** 7 after 6, because the column must exist. The rest are
independent, and the order above just keeps each table's changes together.

**Why one statement per file** (§ 5d): MySQL cannot undo DDL, and drizzle
records a file only when all of it succeeds. So a failure can only mean "that
file did nothing", and a re-run resumes exactly there.

**File 7 is the slow one**, because MySQL checks every row when a foreign key
is added. **Production has all its foreign keys**: A confirmed 133 on
2026-09-28, which closes the 0004 gap. (This plan's first draft said
otherwise.) The column is new in file 6 and NULL on every row, so the check has
no data to reject. Slow, not risky.

**`drizzle/schema.ts`** gets matching definitions, with the NULL meaning of
each column in its comment. **`drizzle/meta/_journal.json`** gets the seven
entries.

### The order on the night — rehearse on a backup FIRST

From `references/deploying.md` § 5, steps 1–4, with this batch's figures:

1. **Fresh backup, minutes before.** Note the run id.
   ```bash
   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/backup.mts
   ```
2. **Prove it restores AND keep the copy** (one restore does both):
   ```bash
   DOTENV_CONFIG_PATH=.env.production.local \
   VERIFY_DATABASE_URL=mysql://…@127.0.0.1:3307/bidrender_test_clean \
   KEEP_SCRATCH=1 pnpm tsx scripts/verifyBackup.mts <runId>
   ```
3. **Rehearse on production's data.** Point `DATABASE_URL` at the kept
   `bidrender_backup_verify` schema, then:
   ```bash
   pnpm tsx scripts/migrate.mts
   pnpm tsx scripts/schemaDrift.mts
   ```
   Expect these seven applied (plus anything else already pending on
   production, which step 4 lists) and no drift. Drop the scratch schema when
   done.
4. **Ask production what it is missing:**
   ```bash
   DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/schemaDrift.mts
   ```
   Expect these seven, plus anything already pending from earlier work (0086,
   for quantity mode, was not deployed as of 2026-09-26).
5. **Apply to production:**
   ```bash
   ALLOW_REMOTE_DATABASE=yes DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/migrate.mts
   ```
   Use `migrate.mts`, not `pnpm db:push`, which generates first.
6. **`schemaDrift.mts` again**: expect nothing pending.
7. **Open the live site on the OLD code** and check a takeoff's totals and a
   bid's hours are the numbers they were. This step has to be boring.

**If any command prints something other than what is expected here, stop and
find out why before going on.** A mismatch means either this plan is stale or
production is not in the state you think, and those want opposite responses.
The counts above are facts about 2026-09-28.

**Then tell B the migration is in.** B's code for these items is not pushed
anywhere that deploys until A has done steps 1–6.

---

## 6. Still open — one question the answers raised

10. **A custom type's own makeup against a run type's panel figure: which
    wins?** Say the company sets Switchboard makeup to 8 ft, and the "4/0
    feeder" run type sets panel makeup to 6 ft. A 4/0 feeder ending at a
    Switchboard gets **6 ft** under the plan, because the nearer level wins
    (run → type → company, § 2.5). _Recommended: keep it that way._ The type
    was set deliberately for that wire size, and if a type should differ at a
    Switchboard, the run type can name Switchboard itself. The other rule
    ("a named height type wins at any level") is one reordering in
    `runExtras.ts` and changes no column.

---

## 7. The owner's answers, 2026-09-28

| #   | Question                                                 | Answer                                                                                                                                                                                                      |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Do starter extras apply before the company accepts them? | **Recommendation taken: no.** Shown, dated, inert until **Accept**. (The answer was "yes", read as accepting the recommendation, the same way as Q3–Q9. Q8's "yes, clearly labeled" confirms that reading.) |
| 2   | Makeup starters                                          | **CHANGED: 18 in per conductor at a device box, 5 ft at a panel.**                                                                                                                                          |
| 3   | Cable runs                                               | As recommended: wire % on all of it, makeup once per end in cable feet.                                                                                                                                     |
| 4   | A custom height type as a panel end                      | Yes, and it can also carry its own makeup (the owner's three-level rule).                                                                                                                                   |
| 5   | Labor on the extra                                       | **CHANGED: extra is MATERIAL ONLY, with no hours; labor is on installed quantity. Makeup DOES carry labor at the run's hours per foot. Shown clearly in the breakdown.**                                    |
| 6   | Typed length: flat or whole pull                         | Flat, and the label says so.                                                                                                                                                                                |
| 7   | Group drop plus assembly whip                            | Allow, and show both.                                                                                                                                                                                       |
| 8   | Fittings on mark drops                                   | None in v1, clearly labelled.                                                                                                                                                                               |
| 9   | Run-level override                                       | Yes. **Widened by the owner: all five values at all three levels** (§ 1 table).                                                                                                                             |

**Recorded in both places, per CLAUDE.md § "Where decisions live".** § 2.3 and
§ 5j of `plan-viewer-overhaul.md` each carry a line saying the starters are
inert until accepted, what the makeup starter is, and that extra carries no
labor, pointing here.
