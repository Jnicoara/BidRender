# Migrations 0098–0103 — one additive batch for Tracks B and C. PLAN ONLY, 2026-09-29

**Status: nothing here is written or run.** No `.sql` file exists yet, and
no database has been touched. Measured against `local-dev` at `90a286c`, which
ends at **0095**, and `a-email-reset` at `af82b2f`, which holds **0096**
(`teeBody`) and **0097** (password reset).

**Every file in this batch is ADDITIVE**: new nullable columns, one foreign key
on an all-NULL column, and values appended to the END of two enums. There is
no `UPDATE`. So every file is **step 1 of the three-step deploy (migrate BEFORE
the code), and step 3 is empty** (CLAUDE.md § "Deploying a migration: THREE
STEPS"). That has been checked per FILE below, as the rule requires, not
asserted for the batch.

---

## 0. Numbering depends on `a-email-reset` landing first

- The numbers below assume **0096 and 0097 merge before this batch**. The
  journal on that branch ends at `idx 97, when 1789958700000`, so this batch
  starts at **idx 98, when 1789958800000**, rising by 100000 per file, as the
  existing files do (`server/migrationRun.test.ts` requires the dates in
  order).
- **0099 depends on 0096's content, not just its number.** An enum `MODIFY`
  restates the whole list, so 0099's list includes `teeBody`. Run 0099 on a
  database without 0096 and it adds `teeBody` too. That is harmless, but 0096
  then becomes a no-op, and the record of which file added what is wrong.
  **Apply 0096 first, everywhere.**
- **The owner has said `a-email-reset` stays off staging until the code-only
  live release is done.** So this batch can be written and rehearsed locally
  now, but it reaches staging only after 0096/0097 do. If that order must
  change, renumber the batch **at write time**, and put `teeBody` in 0099's list
  only if 0096 is withdrawn.
- **The invite gate and the AI correction log plans** said "0098" and "0099"
  with "whatever is next when written". If this batch lands first, they become
  0104 and later. Their text already covers that case.

| File (proposed)                     | For                        | What it adds                                           |
| ----------------------------------- | -------------------------- | ------------------------------------------------------ |
| `0098_surface_raceway_category`     | C                          | `'Surface Raceway'` appended to `materials.category`   |
| `0099_locknut_bushing_roles`        | C (A1)                     | `'locknut'`, `'bushing'` appended to `runMaterialRole` |
| `0100_materials_parent_id`          | C, before the priced sheet | `materials.parentId int NULL`                          |
| `0101_materials_parent_id_fk`       | C, before the priced sheet | the self-referencing FK, `ON DELETE RESTRICT`          |
| `0102_materials_brand`              | C, before the priced sheet | `materials.brand varchar(64) NULL`                     |
| `0103_takeoff_stamps_drop_excluded` | B (H3)                     | `takeoff_stamps.dropExcluded boolean NULL`             |
| — (none)                            | B, drops per run end       | **No migration.** See § 6.                             |

**One statement per file**, as `deploying.md` § 5a prefers: when a file fails
halfway, it is either applied or not, never half. That is why the FK is its own
file.

---

## 1. `0098_surface_raceway_category` — Track C

```sql
ALTER TABLE `materials`
	MODIFY COLUMN `category` enum(<the 19 values in MATERIAL_CATEGORIES, in order>,'Surface Raceway');
```

- **What it adds:** one shelf. `materials.category` is a MySQL enum
  (`drizzle/schema.ts:720`), so a category is a migration, not a text edit.
  Track C's ask: `track-c-retail-catalog-plan.md` § R3 and RQ2 (on
  `origin/track-c`). About 23 rows, the 700 and 500 series, are seeded after
  it lands.
- **Code that lands with it:** `MATERIAL_CATEGORIES` gets the value **at the
  end**, and `MATERIAL_CATEGORY_ORDER` (`shared/materialOrder.ts`) gets it
  **wherever it should display**. `server/materialOrder.test.ts` compares the
  two lists sorted, so both change together. Display order is not enum order.
- **Safe before the code?** Yes. Appended at the end, so every stored value
  keeps its index, with no table copy. Old code never writes the new value,
  and nothing holds it until the new seed runs, which ships with the code.
- **Watch:** between this file and the push, `schemaDrift` reports the
  category enum as **disagreeing**, with the database ahead of the code. That
  is expected for an appended enum, the same as `teeBody` on the test
  database today. A **column missing** from the database is never expected.
  Say so in the release entry, so nobody stops a rollout over the expected
  message or waves through the other one.
- **Question Q1:** `ASSEMBLIES_PLAN.md` § "Three new categories ride along"
  names **Underground** and **Service Entrance** as well, for the same pricing
  sheet. Add all three in this one `MODIFY` (recommended: they are the sheet's
  categories, and a second enum migration later costs a whole release step),
  or Surface Raceway only, as asked?

## 2. `0099_locknut_bushing_roles` — Track C (A1)

```sql
ALTER TABLE `bid_line_items`
	MODIFY COLUMN `runMaterialRole` enum('raceway','conductor','ground','coupling','connector','strap','elbow90','elbow45','fieldBend','lb','pullBox','teeBox','teeCover','teeBody','locknut','bushing');
```

- **What it adds:** two bid-line roles, so a conduit run type can carry
  locknut and bushing lines. The ask is `track-c-next-batch-plan.md` § 4, A1:
  "Append `locknut`, `bushing` … (like 0084/0085, no UPDATE) | ADDITIVE —
  apply BEFORE the code".
- **Safe before the code?** Yes, for the same reason as 0096: appended, no
  stored value moves, and old code never writes them. The column is in a
  unique key (run type + role). Appending does not change any existing key.
- **Depends on 0096** (§ 0). The list above is 0096's list plus the two
  values, and it must match `RUN_MATERIAL_ROLES` in schema.ts exactly and in
  order, because `schemaCheck` compares the whole list.
- **Not in this file, and waiting on the owner (C's A2 and A3):** two nullable
  booleans on `materials` (`includesLocknut`, `insulatedThroat`) and a per-end
  "what box the end lands in" on `takeoff_runs`. **Question Q2.** C lists a
  no-schema alternative for A2, a flag on the seed rows, and measured that no
  connector row today says it includes either. Recommendation: **leave both
  out** until C's Q3 findings are answered. Each is its own additive file if
  wanted, so nothing here blocks them.

## 3. `0100`–`0102`: parent items and brand variants — Track C, BEFORE THE PRICED SHEET

**Decided shape (`ASSEMBLIES_PLAN.md` § "Parent items and brand variants",
steps 1–2; CLAUDE.md § Brands). This batch builds only these two columns:**

```sql
-- 0100
ALTER TABLE `materials` ADD `parentId` int;
-- 0101
ALTER TABLE `materials` ADD CONSTRAINT `materials_parentId_materials_id_fk`
	FOREIGN KEY (`parentId`) REFERENCES `materials`(`id`) ON DELETE restrict ON UPDATE no action;
-- 0102
ALTER TABLE `materials` ADD `brand` varchar(64);
```

- **What they add:**
  - `parentId` is NULL for "this row is its own parent", so **every existing
    row is already correct** and nothing is backfilled.
  - `brand` is a real column, **not** `brandNote`, which is the user's own note
    about their supply house and stays theirs.
- **Safe before the code?** Yes. Old code never names either column. The FK is
  added to a column that is NULL in every row, so it cannot find a violation.
  It needs an index on `parentId`, which MySQL creates. The table is a few
  thousand rows, so this takes seconds, not minutes. **Measure it on the
  verify copy of live before live** (§ 7), rather than trusting "seconds".
- **Why RESTRICT** (the plan's reason): `set null` would leave a variant
  looking like a generic, and `cascade` would delete a contractor's priced
  variants because somebody retired a parent.
- **The risk to rehearse, and it is real: RESTRICT on a table that CASCADES
  from `users`.** Every material row belongs to a user through a cascading FK.
  Deleting a user who owns both a parent and a variant of it deletes both rows
  in one cascade. InnoDB checks `RESTRICT` row by row, so depending on the
  order the rows are reached, **the account delete can fail**. The same goes
  for any test fixture's cleanup. Nothing today sets `parentId`, so it cannot
  happen until C's code does. **Rehearse it (§ 7, step 3), not assume it.** If
  it fails, that is a finding for C's code: delete variants before parents, or
  make the user-owned case `SET NULL`. It is not a reason to change the
  column.
- **`server/forkableReferences.test.ts` will demand an answer for the new
  column** (the ASSEMBLIES_PLAN note). That is C's code change, landing with
  the code, not the migration.
- **Not in this batch, and it must be decided before the priced sheet loads
  (Q3):**
  - **the company preferred-brand setting** ("per family", default none): no
    table or key is written down anywhere;
  - **the per-bid brand override**: no column is specified;
  - **H2, the example-price flag** (`quote-app-panel-plan.md` § H2): a marker,
    source and date on `materials`, and a snapshot flag on `bid_line_items`.
    Column names are not specified, and the plan says to "sequence it inside
    [the parentId] work, not before it". **This is the "nobody priced this"
    signal `todo.md` says blocks the priced upload.**

  **All three are additive** as described, and each would be its own file
  after 0103. But their shape is not decided, and a migration is the wrong
  place to decide it. Recommendation: **ship 0100–0102 now** (they are decided
  and unblock C's seeding work), and write the three as a second small batch
  once the owner picks their shapes. **Both batches must land before the
  priced sheet.**

## 4. `0103_takeoff_stamps_drop_excluded` — Track B (H3)

```sql
ALTER TABLE `takeoff_stamps` ADD `dropExcluded` boolean;
```

- **What it adds:** "remove ONE mark's drop". B's words
  (`quote-app-panel-plan.md` § H3, commit `5f14947`): "boolean, **nullable, no
  default** — NULL means 'follows the count', the only meaning today, so it is
  **additive**".
- **The name, which B left to A: `dropExcluded`.** It reads as the exception
  it is. `noDrop` reads like a drop _kind_, which is a different field on the
  count (`takeoff_groups.dropKind`), and two names that sound alike on one
  screen are how a mapping picks the wrong one.
- **Safe before the code?** Yes. A new nullable column, and old code never
  names it.
- **Why no default:** the three-step rule's own advice. `DEFAULT 0` would make
  "not yet decided" and "deliberately included" the same value. NULL is "follows
  the count", which B's code reads as today's meaning.

## 5. Per-run-end drops — **no migration**

B's own plan says so: `origin/track-b:references/track-b-plans-screen-edits-plan.md`
line 10, "No migration is needed for any of the four parts. Nothing goes to
Track A." Every leg end already stores `startKind`/`endKind` and a per-end
height override (`startHeightInches`/`endHeightInches`). The held batch
(0089–0095) is already on `local-dev` and live. **If B finds it needs a column
after all, it is a new file after 0103, not a change to this batch.**

## 6. Also waiting on Track A, not in this batch unless the owner says (Q4)

- **H1**: `expense_items.quoteBucket` and `bid_expenses.quoteBucket`, a
  nullable enum `task`/`equipment`/`misc`, no default (NULL = Misc).
  Additive, and fully specified. It could ride as **0104–0105** at no extra
  risk.
- `track-b-beta-plan.md` (optional): a deleted-bids log and
  `bid_pdfs.lastOpenedAt`. Marked optional there. Not recommended now.

---

## 7. Rehearsal — each step prints something; if it does not match, stop

Commands are from `references/deploying.md` § 5a and § 11. **Before AND after
every apply, run the drift check**, so the second run is an outcome, not
intent (CLAUDE.md § "A count taken before the change is intent").

**Writing the files (all hand-written, never `drizzle-kit generate`):** each
`.sql` gets the "ADDITIVE. STEP 1" header 0096 uses, and a journal entry in
`drizzle/meta/_journal.json` (idx, `when`, tag). **`drizzle/schema.ts` changes
in the same commit as the `.sql`**, because `server/schemaDrift.test.ts` fails
on a test database that lacks a column the schema declares.

1. **Local test database** (`bidrender_test_clean`, or this worktree's own):

   ```bash
   DATABASE_URL=<test db> pnpm tsx scripts/schemaDrift.mts   # before
   DATABASE_URL=<test db> pnpm tsx scripts/migrate.mts
   DATABASE_URL=<test db> pnpm tsx scripts/schemaDrift.mts   # after
   ```

   Expect **6 applied** (0098–0103, on a database already at 0097) and
   "Database matches the schema". **If the applied count is not 6, stop and
   find out why before going on**: either this line is stale (a migration
   landed since it was written) or the database is not where you think it is.
   Then run the full suite. **Run every file TWICE** (a second `migrate.mts`
   must apply 0) — the 0055 lesson.

2. **Local dev database** (`bidrender_local`, the restored real-data copy):
   the same three commands. Then start `pnpm dev` and open Materials, a bid,
   and the Plans screen, **with the old code** (before C's and B's code
   lands). The old code must still work against the migrated database, and
   that is the whole premise of step 1 of the three-step deploy.

3. **The RESTRICT rehearsal (§ 3)**, on the test database only:
   1. Create a throwaway user.
   2. Give them two materials, and set one's `parentId` to the other by hand
      (SQL, test database only).
   3. Delete the user.
   4. Record whether the cascade succeeded.

   This is the one step here whose answer is not already known.

4. **Staging, only after 0096/0097 are on staging** (§ 0):

   ```bash
   DOTENV_CONFIG_PATH=.env.staging.local pnpm tsx scripts/schemaDrift.mts
   ALLOW_REMOTE_DATABASE=yes DOTENV_CONFIG_PATH=.env.staging.local pnpm tsx scripts/migrate.mts
   DOTENV_CONFIG_PATH=.env.staging.local pnpm tsx scripts/schemaDrift.mts
   ```

   After: expect the category and role enums to **disagree** (database ahead)
   until the code is pushed, and nothing else. Then push the code to staging
   and run drift again. Expect "Database matches the schema".

5. **Live, in the release that ships C's and B's code**, in the order in
   `deploying.md` § 5a:
   1. Back up (`scripts/backup.mts`) and verify the backup into a local
      database (`scripts/verifyBackup.mts`, `KEEP_SCRATCH=1`). Apply the batch
      to that verified copy first and **time 0101** there.
   2. Drift on live, apply, then drift again.
   3. Check the old code on bidridge.com (`/api/version`, a bid, its plans).
   4. Only then push `main`.
   5. The recorded live count before the batch will be whatever the release
      entry says at the time (96 today, 98 once 0096/0097 run). **Write that
      number into the release entry with its "if it does not match, stop"
      line.**

---

## 8. What could break elsewhere

- **The enum lists must match `schema.ts` exactly, in order.** A typo in a
  restated list is a silent rename of a stored value's meaning, or a failed
  `MODIFY`. Copy the list from the previous migration verbatim and append.
  Never retype it.
- **Account deletion and test cleanup** once `parentId` is set (§ 3).
- **`schemaDrift` "disagrees" between migrate and push** is expected for the
  two enums and nothing else (§ 1).
- **Nothing reads the new columns until B's and C's code ships**, so no
  screen, price or bid total moves when this batch runs.
- **None of this touches `a-email-reset`'s files**, but it depends on them
  (§ 0).

## 9. Questions for the owner

1. **Q1.** Add **Underground** and **Service Entrance** in 0098 too?
   Recommendation: yes, one enum step for all three sheet categories.
2. **Q2.** C's optional A2 (locknut / insulated-throat flags on materials)
   and A3 (what box a run end lands in)? Recommendation: not in this batch.
   Wait for C's Q3 answers.
3. **Q3.** The preferred-brand setting, the per-bid brand override and the
   example-price flag (H2) all block the priced sheet, and none has a decided
   shape. OK to plan them as a second batch, with a short shape proposal for
   you to pick from?
4. **Q4.** Add H1 (`quoteBucket` on expenses) as 0104–0105? It is fully
   specified and additive. Recommendation: yes, if B is ready to build the
   screens. Otherwise hold it.
5. **Q5.** The name `dropExcluded` (recommended) or `noDrop`?
