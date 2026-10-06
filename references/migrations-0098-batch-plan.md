# Migrations 0098–0105 — one additive batch for Tracks B and C. PLAN ONLY, 2026-09-29

> **RENUMBERED AGAIN 2026-10-02: § S below is the current list and overrides
> § R's numbers.** This catalog batch is now 0106–0112. (Before that, on
> 2026-10-01, § R made it 0100–0107, and § R overrides § 0 and the numbers in
> §§ 1–11, which keep their original numbers as written.) Nothing after 0097
> is written or run yet.

## S. CONSOLIDATED BATCHES — 2026-10-02. This section overrides § R's numbers

> **Why the numbers moved again, and why that is allowed.** § R put the
> pre-invite files (gate, correction log) at 0098–0099 because they were the
> most urgent. Since then Track B started BUILDING pin styles and Track C
> shipped Check sheet behind OFF switches — both need their columns now,
> while nothing for the invite gate or the correction log is built. Numbers
> must follow DEPLOY order (R.1: the migrator silently skips a file numbered
> below one already applied), so the marks batch now comes first. **Nothing
> after 0097 is written**, so renumbering costs nothing. The rule from R.1
> still holds: once any file is applied anywhere, nothing is ever written
> below it. § R stays below as the reasoning record; where a number differs,
> § S wins.

**Every file below is ADDITIVE and NULLABLE with no default** — step 1 of the
three (migrate BEFORE the code), no `UPDATE`, nothing changes what an existing
column means. NULL always means "not set / automatic / old behaviour", and
nothing may read it as 0. **One statement per file, one `ALTER` per table**,
so a file is applied whole or not at all (several columns in one `ALTER` is
still one statement).

### S.1 The batches, in the order they deploy

> **Status, 2026-10-05:** Batches 1 and 1b are **written and ON STAGING**
> (0096–0104; `deploying.md` § 11), **not on live**. Everything from Batch 2
> on moved up two numbers when 1b took 0103–0104 — none of it is written, so
> that cost nothing (R.1).

**Batch 1 — "marks", now (B builds pin styles; C's Check sheet waits behind
OFF switches).** Goes with the already-written 0096/0097, which must be
applied first anyway (they are below it, and 0096 is restated by later role
enums). Both are additive and harmless without their code.

| #    | File                            | Adds                                                                                                                                                                                                                                                         | For                |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 0096 | `0096_tee_body_role` (written)  | `'teeBody'` appended to `runMaterialRole`                                                                                                                                                                                                                    | C                  |
| 0097 | `0097_password_reset` (written) | `password_reset_tokens`; `users.sessionsValidAfter`                                                                                                                                                                                                          | A (reset)          |
| 0098 | `0098_takeoff_stamps_marks`     | `takeoff_stamps`: `status enum('new','existing','remove','relocate')` (NULL = new), `rotation smallint`, `mirrored boolean`, `mountHeightInches decimal(7,2)`, `mountHeightSource enum('typed','read')`, `checkAcceptedAt timestamp`, `dropExcluded boolean` | B §7, §12; C; B H3 |
| 0099 | `0099_takeoff_groups_marks`     | `takeoff_groups`: `markShape varchar(16)`, `markLetter varchar(4)`, `markColor varchar(7)`, `symbolLookupKey varchar(255)` (+ `fixtureTag varchar(16)` only if decided by then)                                                                              | B §6, §11.7        |
| 0100 | `0100_assemblies_marks`         | `assemblies`: `markShape`, `markLetter`, `markColor` (as above)                                                                                                                                                                                              | B §6               |
| 0101 | `0101_symbol_links_marks`       | `symbol_links`: `markShape`, `markLetter`, `markColor`, `originalLabel varchar(255)`                                                                                                                                                                         | B §6; B rename     |
| 0102 | `0102_symbol_looks`             | table `symbol_looks` (C's `multiple-looks-plan.md` § 6) **with** `connectDx decimal(10,4)`, `connectDy decimal(10,4)` (B § 12: on the look, not the link)                                                                                                    | C; B connect point |

That is **B's 15 columns** (9 pin, `status`, `symbolLookupKey`, `connectDx`,
`connectDy`, `rotation`, `mirrored`) and **C's three** (`symbol_looks`,
`mountHeight*`, `checkAcceptedAt`), plus `dropExcluded` (moved here from the
old catalog batch: it is a `takeoff_stamps` column, and splitting one table
across two batches would mean two `ALTER`s where one does). **Column names are
B's** (`mark*`, settled in its § 12), not the `pin*` names R.10 proposed.

**Batch 1b — "connect point and unconfirmed marks", 2026-10-05 (written, on
staging).** Most of B's connect-point request was already in Batch 1:
`connectDx/Dy` and the capture box are on `symbol_looks` (0102 — the pick,
not also on `symbol_links`), `rotation`/`mirrored` on `takeoff_stamps` (0098).
What was left:

| #    | File                           | Adds                                                                                                   |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 0103 | `0103_mark_status_unconfirmed` | `'unconfirmed'` appended to `takeoff_stamps.status` (every row NULL; the list is 0098's + 1)           |
| 0104 | `0104_run_end_connect`         | `takeoff_runs.startConnect`, `endConnect` `enum('found','confirmed')` NULL (connect-point-plan § 9 Q3) |

**Shipped with it, as code (the owner's two rules, `shared/markStatus.ts`):**
only a NEW mark (or NULL) is a quantity — bid lines, the counts compared with
them, the materials list, the export and the drops all go through one SQL
condition (`markIsQuantity` in `server/db.ts`); and a run never snaps to or
attaches to an `unconfirmed` mark (`snapToMark` skips it; the server's
`setEnds` and leg start refuse it). Pricing `remove`/`relocate` as labor is
still the owner's decision; until then they count toward nothing rather than
as new parts.

**Batch 2 — "before the first outside invite".**

| #    | File                         | Adds                                                                                                                                                                                |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0105 | `0105_signup_invites`        | the invite gate's table (invite-gate plan § 7)                                                                                                                                      |
| 0106 | `0106_ai_correction_log`     | the correction log (its plan § 4) **plus C's** `askKind enum('crop','note')`, `askFingerprint varchar(64)` and index `(dataUserId, askFingerprint)` — in the CREATE, no second file |
| 0107 | `0107_sheet_content_hash`    | `bid_pdf_sheets.contentHash varchar(64)` (NULL = never read) — C's "never pay twice for the same drawing"                                                                           |
| 0108 | `0108_assembly_status_hours` | `assemblies.removeLaborHours`, `relocateLaborHours` decimal(10,4) NULL — owner 2026-10-05                                                                                           |
| 0109 | `0109_group_status_hours`    | `takeoff_groups.removeLaborHours`, `relocateLaborHours` NULL — the per-bid override                                                                                                 |
| 0110 | `0110_line_role`             | `bid_line_items.lineRole` enum NOT NULL DEFAULT `install`; unique key `(bidId, takeoffGroupId)` → `(…, lineRole)`                                                                   |
| 0111 | `0111_sheet_run_height`      | `bid_pdf_sheets.distributionHeightInches INT NULL`, no default — per-sheet run height (Track B, vertical-drops-plan § 7 col 1)                                                      |
| 0112 | `0112_assembly_mount_height` | `assemblies.mountHeightTypeKey VARCHAR(64) NULL`, no default — the height TYPE the device mounts at (Track B, § 7 col 2)                                                            |

> **Added 2026-10-05 (Track A):** 0108–0110 are remove/relocate labor,
> `remove-relocate-labor-plan.md` (on `a-handoff`). **0111–0112 added
> 2026-10-06** for Track B's two owner-approved columns (vertical drops; the
> code is built in `faeaab8` and waits on them). All five are additive, so
> step 3 is empty. **Batch 3 onward shifts by five** when written — none of
> it is, so nothing is renumbered on disk.

**Batch 3 — "catalog", with C's catalog code.** The old 0100–0107, minus
`dropExcluded` (now in 0098):

| #    | File                           | Adds                                                        |
| ---- | ------------------------------ | ----------------------------------------------------------- |
| 0108 | `0108_new_material_categories` | 3 values appended to `materials.category`                   |
| 0109 | `0109_locknut_bushing_roles`   | `'locknut'`, `'bushing'` appended (list = 0096's + 2)       |
| 0110 | `0110_materials_parent_id`     | `materials.parentId int`                                    |
| 0111 | `0111_materials_parent_id_fk`  | self-FK, `ON DELETE RESTRICT`                               |
| 0112 | `0112_materials_brand`         | `materials.brand varchar(64)`                               |
| 0113 | `0113_assembly_categories`     | 2 values appended to `assemblies.category`, `NOT NULL` kept |
| 0114 | `0114_assembly_hours_nullable` | `assemblies.baseLaborHours` may be NULL                     |

**Batch 4 — "legend reading"**: `0115_bid_pdf_legend_entries`, **with**
`lookId int NULL -> symbol_looks, set null` in its `CREATE` — possible now
because `symbol_looks` (0102) lands first, which settles the ordering question
R.11 left open.

**Batch 5 — "before the priced sheet"**: § 10d + B2 (brand line ×2,
`bid_panels` + FKs, `panelId` + FK, `snapshotBrandLine`, example-price ×3),
about ten files, numbered when written.

**Not numbered, and why:**

- **C's scan-decision log** (`scanned-plans-plan.md` § 5: sheet, box, item,
  confirmed/rejected, code or AI). A new table; C says it is not needed until
  the scan branch of Find all matching is built. Numbered then.
- `fixtureTag` if not decided before 0099; legend § 8b/8c; H1 `quoteBucket`
  (held); pack sizes (§ 12).
- **The two step-3 files**, never in `drizzle/` before their code is live:
  (i) clear the 8 starters' hours (§ 11 c), (ii) fold the "… - EXISTING TO
  REMAIN" twins into `status` (R.9).

### S.2 Rehearsal and checks for Batch 1

- **Before writing:** list `drizzle/` on `local-dev`, `track-b`, `track-c`,
  `a-email-reset`. The next free number must be 0098. B's § 12 says to stop if
  anything on its list already exists in the schema — re-check that too.
- **Test database, twice:** `schemaDrift` before; `migrate.mts` (expect
  **7 applied**: 0096–0102 on a database at 0095); drift after ("matches");
  `migrate.mts` again (expect 0). **If the count does not match, stop and find
  out why before going on** — this line is stale, or the database is not where
  you think.
- `SHOW CREATE TABLE` on the five touched tables: `symbol_looks` must show
  **five** foreign keys (C's plan says four; R.8) and its two indexes.
- **A restored copy of live is not needed for Batch 1** (R.7): new nullable
  columns and a new table only. The standing fresh-backup-before-live still
  applies. Batch 3's FK and enums keep their restored-copy rehearsal.

### S.3 Wrong-number watch for Batch 1 (R.5, restated for these columns)

- `status`: the code must read NULL as `new`. A NULL read as anything else
  stops counting real new work. How `existing`/`remove`/`relocate` are priced
  is the owner's decision (todo.md), shipped as code.
- `mountHeightInches`: NULL means "follow the count's height", and 0 is a real
  height (a floor box). Reading NULL as 0 drops every vertical on that mark.
- `connectDx/Dy`: NULL means "never answered"; `0, 0` means "the middle". If
  runs snap to the connect point, footage changes, and the connect-point plan
  must say whether existing runs are re-measured (R.13).
- The `mark*` columns are display only; none moves a number.

### S.4 Before the materials rename — in this order

From `references/materials-naming-and-pricing-plan.md` § 7 (on
`a-materials-plan`):

1. **The owner answers that plan's open questions** (its § 8), starting with
   "1-Pole" against the recorded "Single-Pole" decision.
2. **The size-reading fix ships FIRST, in its own commit**: `readSize`,
   `SIZE_PREFIXES` and `mcFittingNames` read BOTH the old dash form and the
   new form, with tests. Measured: without it, MC cable runs lose their
   connectors and straps on the bid, and 10/2–14/2 sort as amps. **No row is
   renamed before this is live.**
3. **The rename itself, in one commit** (C owns the catalog), through
   `RENAMED_BASELINE_MATERIALS`, with the starter assemblies, run types and
   search tables updated in the same commit. **No migration**: rows keep
   their ids, so bid lines, assemblies and contractors' own copies are
   untouched.
4. **Then pricing:** Batch 3's `parentId`/`brand` (0110–0112) before brand
   variants are seeded, and **Batch 5's example-price columns and their code
   before ANY non-zero price goes into a seed file** (R.5 item 2).

## R. ONE LIST — every planned migration after 0095, reconciled 2026-10-01

**Where things stand (measured, not assumed).** Live and staging both record
**96** migrations, ending at 0095 (`deploying.md` § 11, release of
2026-09-29). The only `.sql` files after 0095 on any branch are **0096 and
0097, on `a-email-reset`**. Nothing else in this list has a file. They exist
as plans only, on five branches, and before today **three of those plans
claimed numbers that clash with each other**:

- the invite gate plan said 0098, and the correction log plan said 0099
  (`origin/a-plans`, each "if reset lands first");
- this file used 0098–0105 for the B/C batch, and § 0 moved the invite gate
  and the correction log to "0106 and later";
- the legend plan says `0106_bid_pdf_legend_entries` in its file list and
  "probably 0107" in its own text (`origin/a-plans-reader`, § 5).

### R.1 Why the number has to be the DEPLOY order

**The migrator skips a file whose number is lower than one already
applied, and it says nothing.** Read from `drizzle-orm`'s
`mysql-core/dialect.js`, `migrate()`: it reads the newest `created_at` in
`__drizzle_migrations` and applies only files whose journal `when` is
greater than that. So if 0102 is applied on staging and 0099 is written
afterwards, 0099 never runs there. The first symptom is a screen failing
with `Unknown column`, because nearly every read is a bare `select()`.

So:

1. **Numbers follow the order files reach a database**, not the order they
   were planned.
2. **A number below is a reservation until its `.sql` is written.** It can
   still move.
3. **Once a file is applied ANYWHERE, including staging and a test database
   somebody keeps, nothing may be written below it.** Renumber the unwritten
   ones upward instead.
4. Before writing any file, list `drizzle/` on `local-dev`, `track-b`,
   `track-c` and every open `a-*` branch. If the next free number is not what
   this list says, **stop and find out which branch moved.**

### R.2 The list, in order

| #                         | File                                      | Adds                                                                                                                                                                                                      | Kind                                                | Was         |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------- |
| 0096                      | `0096_tee_body_role`                      | `'teeBody'` appended to `bid_line_items.runMaterialRole`                                                                                                                                                  | additive                                            | written     |
| 0097                      | `0097_password_reset`                     | table `password_reset_tokens`; `users.sessionsValidAfter` (NULL)                                                                                                                                          | additive                                            | written     |
| 0098                      | `0098_signup_invites`                     | table `signup_invites` (invite gate plan § 7: `codeHash` unique, `email`, `seatLimit`, `expiresAt`, accepted/revoked stamps, FKs `users`/`early_access_signups`)                                          | additive                                            | 0098 / 0106 |
| 0099                      | `0099_ai_correction_log`                  | table `ai_correction_log` (correction log plan § 4, § 9: FKs SET NULL, `shareId` unique, `(dataUserId, createdAt)` index)                                                                                 | additive                                            | 0099 / 0107 |
| 0100                      | `0100_new_material_categories`            | 3 values appended to `materials.category`                                                                                                                                                                 | additive                                            | 0098        |
| 0101                      | `0101_locknut_bushing_roles`              | `'locknut'`, `'bushing'` appended to `runMaterialRole` (list = 0096's + 2)                                                                                                                                | additive                                            | 0099        |
| 0102                      | `0102_materials_parent_id`                | `materials.parentId int NULL`                                                                                                                                                                             | additive                                            | 0100        |
| 0103                      | `0103_materials_parent_id_fk`             | self-FK, `ON DELETE RESTRICT`                                                                                                                                                                             | additive                                            | 0101        |
| 0104                      | `0104_materials_brand`                    | `materials.brand varchar(64) NULL`                                                                                                                                                                        | additive                                            | 0102        |
| 0105                      | `0105_takeoff_stamps_drop_excluded`       | `takeoff_stamps.dropExcluded boolean NULL`                                                                                                                                                                | additive                                            | 0103        |
| 0106                      | `0106_assembly_categories`                | 2 values appended to `assemblies.category`, `NOT NULL` kept                                                                                                                                               | additive                                            | 0104        |
| 0107                      | `0107_assembly_hours_nullable`            | `assemblies.baseLaborHours` NULL allowed, default dropped                                                                                                                                                 | additive (§ 11 a)                                   | 0105        |
| 0108                      | `0108_takeoff_stamps_status`              | `takeoff_stamps.status enum('new','existing','remove','relocate') NULL`, NULL = new. **ONE column for A's list AND C's find-all plan § 6 — the same request** (R.9)                                       | additive — the column ONLY; the fold is step 3 (ii) | unnumbered  |
| 0109                      | `0109_assemblies_pin_style`               | `assemblies.pinShape`, `pinLetter`, `pinColor` (NULL = automatic; types R.10)                                                                                                                             | additive                                            | unnumbered  |
| 0110                      | `0110_symbol_links_pin_style`             | `symbol_links.pinShape`, `pinLetter`, `pinColor` + **`originalLabel varchar(255) NULL`** (B's rename). **No capture box** — it moved to the looks table (R.11)                                            | additive                                            | unnumbered  |
| 0111                      | `0111_takeoff_groups_pin_style`           | `takeoff_groups.pinShape`, `pinLetter`, `pinColor` + **`symbolLookupKey varchar(255) NULL`** (pin plan § 11.7 + count-by-tag § 2) + `fixtureTag` if wanted (R.12)                                         | additive                                            | unnumbered  |
| 0112                      | `0112_bid_pdf_legend_entries`             | table `bid_pdf_legend_entries` (legend plan § 5)                                                                                                                                                          | additive                                            | 0106 / 0107 |
| 0113 (placeholder)        | connect point per symbol                  | **Shape not known yet**: where conduit meets a wall device, stored as distance + direction from the symbol's centre. `references/connect-point-plan.md` (track-b, not pushed when this was written). R.13 | expected additive                                   | new         |
| next                      | count-by-tag `fixtureTag`, if NOT in 0111 | `takeoff_groups.fixtureTag varchar(16) NULL`, no FK, no unique key                                                                                                                                        | additive                                            | unnumbered  |
| next                      | C's looks table `symbol_looks`            | one row per LOOK of a legend item: picture, plan set + sheet, capture box (`decimal(12,4)` ×4), who added it. **Replaces R.11's capture box columns** (`multiple-looks-plan.md` § 6, track-c `f107f3c`)   | additive                                            | was R.11    |
| next, after both          | `bid_pdf_legend_entries.lookId`           | `int NULL -> symbol_looks, set null`, only if the legend plan is built                                                                                                                                    | additive                                            | new         |
| next                      | second batch (§ 10d + B2)                 | brand line ×2, `bid_panels` + FKs, `panelId` + FK, `snapshotBrandLine`, example-price ×3. About ten files.                                                                                                | additive                                            | unnumbered  |
| NEVER in `drizzle/` early | step-3 files                              | (i) clear the 8 starters' hours (§ 11 c); (ii) fold "… - EXISTING TO REMAIN" twin counts into `status` — **R.9, after 0108's code is live**                                                               | **MEANING**: committed only after the code is live  | —           |

Also later, numbered at write time and **after** everything above: legend
§ 8b (`quotedSupplier`/`quotedRef`/`quotedAmount` on `bid_line_items`,
`takeoff_groups.packageLineId`), legend § 8c (`costMicros`,
`aiSpendCapMicros`), H1 `quoteBucket` (held, § 6), pack sizes (§ 12).

**Why this order, and not the plans' original numbers:**

- **0098 and 0099 keep the numbers their own plans gave them.** Both block
  the first outside invite (R.4) and are not tied to B's or C's code, so they
  ship first. Their plans already said "if reset lands first", and with them
  first, it does.
- **The B/C batch shifts up two places as a block (0100–0107).** It rides with
  B's and C's code, which has not been scheduled for live. Nothing in it is
  written, so renumbering costs nothing. § 7 step 1's "expect 8 applied" is
  still 8, now meaning 0100–0107 on a database at 0099.
- **Status and the nine pin columns are one group (0108–0111)**, as B's plan
  asks (`track-b-count-pin-styles-plan.md` § 6, handoffs). One statement per
  file, per table: each file is one `ALTER TABLE … ADD …, ADD …, ADD …`.
  MySQL applies a single `ALTER` whole or not at all, so three columns in one
  statement keep the "applied or not, never half" rule. **The exact column
  names and types are not in B's plan** (re-checked at `4a9f5f9` and
  `4d5c4bb`). R.10 proposes them; that list supersedes the one first written
  here, which said letter `varchar(2)`. Each table's file also carries that
  table's other additive columns from the same handoff (R.10–R.12), so it is
  one `ALTER` per table rather than one per request.
- **The legend table goes last of the numbered ones (0112).** It waits on the
  correction log and on the reader accuracy test (legend plan, "The order, in
  one place", items 0 and 3). Those are the slowest dependencies in the list.
  If the legend is ready before the mark group, swap the numbers **before
  either is written**, never after.
- **Count-by-tag splits in two (R.12).** `symbolLookupKey` now goes IN 0111,
  because the pin plan § 11.7 asks for the same column for "several symbols
  on one assembly" and says to ship it with the pin columns. `fixtureTag` is
  still "when the grouping is known to be wanted": in 0111 if decided by
  then, otherwise its own file.
- **The connect point is a placeholder at 0113.** Its plan is not written
  yet. If its columns turn out to be on `symbol_links` and are settled before
  0110 is written, they fold into 0110. Otherwise 0113
  stands, or swaps with 0112 if it is ready first — **before either is
  written** (R.1).

### R.3 What goes together, and what must go first

| Group                      | Files     | Goes with                                            | Must come after                                                                                                                             |
| -------------------------- | --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A: before the first invite | 0096–0099 | `a-email-reset`, then gate and log code              | nothing. **0096 must precede 0101** (0101 restates the enum with `teeBody`, § 0)                                                            |
| B: B/C batch               | 0100–0107 | B's and C's code that reads them                     | 0096 (above). 0103 after 0102 (FK on its column). 0107 before the "Hours not set" code, and the hours `UPDATE` only after that code is live |
| C: marks                   | 0108–0111 | B's style editor, rename, status looks; C's find-all | nothing in the schema. The status **fold** (step 3 ii) waits until the code that reads `status` is LIVE (R.9)                               |
| D: legend                  | 0112      | legend reading v1                                    | 0099 (it writes correction rows), the accuracy test                                                                                         |
| (placeholder)              | 0113      | connect point                                        | its plan (R.13)                                                                                                                             |
| E: second batch            | next      | brand / example-price code                           | 0102 and 0104 (brand lines match `materials.brand`). **Must be live before ANY non-zero price goes into the seed files**                    |

Every numbered file is **step 1** (migrate, then push the code). The two
step-3 files are written and committed only after their code is on the live
site. A step-3 file committed early runs at step 1, because `migrate.mts`
applies everything pending.

### R.4 BEFORE THE FIRST OUTSIDE INVITE

**Migrations: 0096, 0097, 0098, 0099, on live, with their code.** Nothing
else in this list is needed for an invite.

- **0097 + reset code.** An outside user must be able to reset a forgotten
  password (stage-4 build order 2).
- **0098 + gate code.** The gate must exist before anyone outside has the
  address (stage-4 build order 3; before-beta checklist § 2).
- **0099 + log code.** Corrections made before the table exists are lost for
  good, and the plan reader is open to everyone (`shared/permissions.ts`). The
  log's code must add `ai_correction_log.cropKey` to `FILE_SOURCES`
  (`server/backup/collectFiles.ts`). Without it, the orphan sweep deletes
  every crop after 7 days and the backup never copies them (correction log
  plan § 5, § 8). Also, `a-ai-marks` `2ca2def` merges before the log is built
  (owner answer 7).

**Not migrations, but on the same list** (from the invite gate, correction
log and stage-4 plans):

- the owner's terms sentence;
- the day-one invite list;
- a real Reply-To on invite emails;
- check live `users` for password-less OAuth-era accounts;
- re-count duplicate emails before any UNIQUE index on `users.email`. It is
  kept OUT of 0098 on purpose;
- confirm the smoke account (1421) never signs up;
- **if the priced sheet lands before invites, group E and its code must be
  live first.**

### R.5 Could put a WRONG NUMBER on a bid

None of the step-1 files changes a number on its own: old code ignores a new
column. The risk is in the code that reads them and in the step-3 files.
In order of danger:

1. **Mark status (0108), today and after.**
   - **Today**, an existing device to remain is counted and priced as new,
     with nothing on screen to say so. Track C's stand-in, a twin count named
     "… - EXISTING TO REMAIN", **still prices if it is sent to a bid**.
   - **After 0108**, the risks are the bridge treating NULL as anything but
     `new`, `relocate` or `remove` pricing material when they are labor, or a
     twin count that was never folded still pricing.
   - **Track C's todo entry and its find-all plan § 5 both say the twins are
     converted "by the same migration".** They are not; R.9 splits it into two
     steps. **The fold must never ride in 0108.**
2. **Example prices (group E).** Once a seed file carries a real price,
   `costPerUnit === 0` stops meaning "nobody priced this". Then the Materials
   screen reports a priced catalog that no contractor has checked a line of.
   Order: E's columns, then the code that reads `examplePriceSource`, then
   the priced seed. **Never the prices first** (§ 10b).
3. **Assembly hours (0107 and step 3 i).** If the `UPDATE` runs before the
   "Hours not set" code is live, all 8 starters price at **zero hours** on
   every new bid, silently (§ 11 c).
4. **Enum restatements (0100, 0101, 0106).** A `MODIFY` restates the whole
   list. A retyped or reordered value silently changes what a stored value
   means; `runMaterialRole` decides which bid line a fitting lands on. **Copy
   the previous file's list verbatim and append.**
5. **Out-of-order apply (R.1).** A skipped file is a missing column, so this
   usually takes a screen down rather than changing a number. **0108 is the
   exception:** if code that reads `status` meets a database without it, it
   breaks. If it is written to fall back to "treat all as new", it prices
   existing devices quietly.
6. **Code, not migration, but flagged by B:** with count-by-tag, two tagged
   counts on one assembly make `groupForAssembly` (`server/assemblyGroup.ts`)
   pick the first, so marks are counted as the wrong type
   (`count-by-tag-plan.md` § 5). v1 needs a tag chooser and a test.
7. **Legend § 8b `quotedAmount`** (later). NULL must read as "Not priced" on
   a bid line, never $0 (CLAUDE.md § Editing fields, 6).

### R.6 Renaming a captured legend item — probably no column

> **Superseded 2026-10-01 (later): it needs one optional column,
> `symbol_links.originalLabel`, in 0110.** B shipped rename without a column
> (`0e87f96` on track-b). `label` is the new name, and `lookupKey` keeps the
> captured name's key for matching. The one loss is capitals: "Reset to
> original" gives "linear type", not "LINEAR TYPE", and says so on the button.
> `originalLabel varchar(255) NULL` holds the exact original. NULL means
> never renamed, or renamed before the column existed; either way, fall back
> to `lookupKey`. Nothing is broken without it. B asks for it in the pin
> batch (track-b `todo.md`, "Track A (migration, optional)"). The text below
> is what was written before B said so.

A captured legend item is a `symbol_links` row. It already has
`label varchar(255) NOT NULL` and `lookupKey varchar(255) NOT NULL`, and
`db.updateSymbolLink` takes a partial update. So a rename is
`label` + `lookupKey` together, with a collision check **in code**:
`lookupKey` has a plain index, not a unique one, so nothing in the database
stops two items getting the same name. `count-by-tag-plan.md` lines 94–95
warns that a rename can quietly detach a tag link. **B is building rename now
and will say if it needs a column.** If it does, it takes the next free number
at write time, under R.1's rule.

### R.7 Backup and rehearsal on a RESTORED copy, before staging

**Every apply to live is preceded by a fresh backup, verified by restoring it**
(`deploying.md` § 5a, steps 1–2). That is standing practice for every row
here.

**These also get rehearsed on a restored copy of live BEFORE staging**,
because their failure mode is data-dependent and a fixture database cannot
show it:

| File                     | Why a restored copy                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0103 (parentId FK)       | Time it on real row counts. Rehearse the RESTRICT-vs-user-cascade account delete (§ 7 step 3)                                                                                                                                                  |
| 0100, 0101, 0106 (enums) | A restated list is checked against REAL stored values: `SELECT DISTINCT` before and after must match                                                                                                                                           |
| 0107 (nullability)       | `MODIFY` on a populated column. Check every row keeps its hours: before-and-after count of `baseLaborHours` by value                                                                                                                           |
| step 3 (i) hours clear   | Meaning change. **Expect 0 → 8**, then a second run changes 0                                                                                                                                                                                  |
| step 3 (ii) status fold  | Meaning change. Before and after: marks per base count, twin counts left, bid line quantities per bid. **Totals must move only by what was "existing"**. Rehearse on a restored copy of WHICHEVER database has twins (R.9: live may have none) |

New tables (0097, 0098, 0099, 0112) and new nullable columns (0102, 0104,
0105, 0108–0111) need only the test-database rehearsal of § 7 step 1: run
twice, the second run applies 0, drift before and after. The standing
backup-before-live still applies.

**If any count above does not match, stop and find out why before going
on.** A mismatch means either this plan is stale or the database is not in
the state you think it is, and those want opposite responses.

### R.8 Plans on other branches that still state the old numbers

Per CLAUDE.md § "Where decisions live", each needs a line pointing here
when its branch is next touched. They are not edited in this commit.

- `origin/a-plans:references/invite-gate-plan.md` § 7 still says 0098. That
  matches, but the line should cite R.
- `origin/a-plans:references/ai-correction-log-plan.md` § 9 still says 0099.
  Same.
- `origin/a-plans-reader:references/legend-reading-plan.md` § 5 says 0106 /
  "probably 0107". It is now **0112**. Separately, its rehearsal check expects
  "three foreign keys" where its schema lists four. Fix that before it is
  used as a pass check.
- `origin/track-c:todo.md`, the mark status entry, and
  `references/find-all-matching-plan.md` § 5 and § 6: split into 0108 + a
  step-3 fold (R.9). Its § 6 capture box columns are replaced by C's
  `symbol_looks` table (R.11); `multiple-looks-plan.md` says the find-all
  plan is told.
- `origin/track-c:references/multiple-looks-plan.md` § 6: its rehearsal
  check expects "four foreign keys", but its own schema lists **five**
  (`userId`, `symbolLinkId`, `bidPdfId`, `sheetId`, `createdByUserId`). Fix
  that before it is used as a pass check, the same fault as the legend plan
  above.
  **Correction:** this line first said the find-all plan "does not exist on
  any branch". That was true when it was checked. It was pushed to track-c
  later the same day (`970fdd2`, now at `f47335e`).
- `origin/track-b:references/track-b-count-pin-styles-plan.md` (§ 6, § 11.7)
  and `count-by-tag-plan.md` § 2: status is 0108, styles 0109–0111,
  `symbolLookupKey` in 0111, `originalLabel` in 0110. Column names and types
  are proposed in R.10. B to confirm.

### R.9 Mark status — ONE column, TWO steps

**The duplicate, merged.** Track A's queue (`todo.md`), Track C's `todo.md`
entry and C's `find-all-matching-plan.md` § 6 all ask for the same thing:
`takeoff_stamps.status enum('new','existing','remove','relocate') NULL`,
NULL = new. It is **0108, once**. B's pin plan § 7 draws it and asks for
nothing more.

**Step 1: `0108_takeoff_stamps_status`. The column only.**

```sql
ALTER TABLE `takeoff_stamps` ADD `status` enum('new','existing','remove','relocate');
```

- No default. NULL = `new` is the only meaning today, so nothing is
  backfilled. `DEFAULT 'new'` would make "not yet decided" and
  "deliberately new" the same value.
- Migrate, then push the code that reads it. The bridge
  (`shared/takeoffBridge.ts`) prices `new` (NULL included), and `relocate` as
  labour only. It never prices `existing`. `remove` waits on the owner's
  demo-labour answer. The card says "12 new · 4 existing" (pin plan § 7).

**Step 2: the code is LIVE.** Only then is step 3 written.

**Step 3: the twin fold, a meaning change.** A later file, **committed to
`drizzle/` only after step 2 is live** (R.3, step-3 rule):

- each mark in a "<name> - EXISTING TO REMAIN" count moves to its base count
  with `status = 'existing'`;
- the emptied twin count goes;
- C's twin ASSEMBLIES (made by C's script, `shared/existingToRemain.ts`) are
  retired, not deleted (CLAUDE.md § "Retire, never delete").

**Before writing it, measure where twins exist.** `existingToRemain.ts` is on
`track-c` only: absent from `main`, `staging` and `local-dev` at the time of
writing. So twins exist only in databases where track-c's code or C's test
script has run. **On live the fold may have nothing to do.** Count twin
groups on each database first. If live has none, step 3 is still written
(staging and test databases may hold them), but its live rehearsal is "0 → 0",
and it should say so in advance.

**What the fold must decide first (owner):** a twin that was **sent to a bid**
has a bid line pricing existing devices. After the fold that line has no
count behind it. It must be removed, or flagged for the estimator, and
**never left silently pricing**. On a locked bid, the fold must not move
anything; it leaves the twin and reports it. **A bid total WILL move here,
and correctly**: it stops charging for devices that are already on the wall.
That is the one intended number change in this list. Say so in the release
entry, so it is not read as a fault (the bid 23 precedent, `deploying.md`
§ 11).

### R.10 Pin-style columns — proposed names and types (B's plan has none)

Checked against `track-b-count-pin-styles-plan.md` at `4a9f5f9` and
`4d5c4bb`. The plan says only "shape, letter, color", nullable, NULL =
automatic (§ 6). Proposed, the same three on `assemblies`, `symbol_links` and
`takeoff_groups`:

| Column      | Type          | Why                                                                                                                                                                                                                                                                                                                      |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pinShape`  | `varchar(16)` | Six named shapes (§ 2), including the new wide rectangle, which is conditional on the § 9 step-0 measurement. A varchar means adding or dropping one is a code change, checked against one list in `shared/`, **not a migration**. An unknown stored value reads as automatic, like run colours.                         |
| `pinLetter` | `varchar(4)`  | **Changed from the `varchar(2)` first written here.** § 3 says a chosen letter is "up to two characters", but lighting "takes the plan's own tag … a leading 1–3 character tag" (`C14`). `varchar(2)` would refuse a 3-character tag outright. The limit lives in one zod schema; the column only has to be wide enough. |
| `pinColor`  | `varchar(7)`  | `#RRGGBB`, the same as `takeoff_run_types.color`, whose rule B copies (§ 5): a chosen colour wins, and a stored value no longer in the palette reads as automatic.                                                                                                                                                       |

**None of the nine changes a number**: a pin's look is display only. The
status look (§ 7) is what carries a number, and it reads 0108, not these.
**B to confirm the names before 0109 is written.**

### R.11 C's capture box — now the `symbol_looks` table

> **Replaced 2026-10-01 (later) by C's `multiple-looks-plan.md` § 6**
> (track-c `f107f3c`). An item can now have several LOOKS: pictures of the
> same symbol captured from different sets. A box on `symbol_links` can hold
> only one look's box, so the box moves to the look. **Nothing goes on
> `symbol_links` for the box, and nothing goes in 0110.**
>
> The table, as C proposes it (additive, new table, no `UPDATE`):
> `symbol_looks` (`id`; `userId` → users cascade; `symbolLinkId` →
> symbol_links cascade; `thumbnail text NULL`; `bidPdfId` → bid_pdfs set null;
> `sheetId` → bid_pdf_sheets set null; `captureX/Y/Width/Height decimal(12,4)
NULL`; `createdByUserId` → users set null; `createdAt`; indexes on
> `symbolLinkId` and `userId`).
>
> - **No backfill.** An item with no look rows reads its old
>   `symbol_links.thumbnail` as a box-less first look.
> - **Number: "next", not reserved yet.** Neither find-all nor looks is
>   approved as a product (looks plan § 9 has seven open questions). When it
>   is, it takes the next free number under R.1.
> - **`bid_pdf_legend_entries.lookId` depends on it.** That FK cannot exist
>   before the looks table does. So either the looks table is numbered BEFORE
>   0112 and `lookId` goes into 0112's `CREATE` (a swap, allowed only while
>   neither is written), or `lookId` is its own later `ALTER`. Decide when
>   the first of the two is written.
> - **No number on a bid.** Looks only seed proposals. A look never has its
>   own count; every look counts into the item's one count (looks plan § 2).
> - Rehearse with `SHOW CREATE TABLE symbol_looks`: **five** foreign keys and
>   two indexes, not the four C's plan says (R.8).
>
> What R.11 said before, kept for the record:

From `find-all-matching-plan.md` § 4 step 3 and § 6 (`f47335e` on track-c):
nullable, in page points, for "Find on this sheet" from a legend row.
Pre-existing captures have none and simply do not offer it.

- **Type:** `decimal(12,4) NULL` ×4, matching `takeoff_stamps.x`/`y`.
  The sheet is already `symbol_links.capturedFromSheetId`, so nothing else is
  needed.
- **Placement:** in 0110 (same table, same handoff), **if the owner says yes
  to find-all step 3** (plan § 7, decision 6) before 0110 is written.
  Otherwise its own file at the next number. The plan has not been approved
  as a product yet, and a column nobody has decided to use is a column
  nobody chose.
- **No number on a bid.** It only proposes matches, and unconfirmed matches
  are never counted (pin plan § 8).

### R.12 Count-by-tag and several-symbols-on-one-assembly — the columns

| Column                                             | Asked for by                                                                                                                   | Placement                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `takeoff_groups.symbolLookupKey varchar(255) NULL` | `count-by-tag-plan.md` § 2 **and** pin plan § 11.7 (several captured items on one assembly) — the same column, asked for twice | **0111.** B: "ship it in the same batch as the nine pin-style columns … One handoff." |
| `takeoff_groups.fixtureTag varchar(16) NULL`       | `count-by-tag-plan.md` § 2 (v2)                                                                                                | 0111 if the grouping is wanted by then, else its own file                             |

- Both have NULL = not from a symbol / untagged, which is every existing row.
  Additive, no backfill. The optional step-3 tag backfill from labels is not
  planned.
- **No FK on `symbolLookupKey`, on purpose**: a library symbol is per user, a
  count is per bid, and deleting a symbol must not touch a bid. **No unique
  key either**: names are unique per bid by the router (count-by-tag § 5), and
  a unique key over a nullable column would not stop duplicate NULLs anyway.
- **Wrong-number risk is in code, not the columns** (R.5 6):
  `groupForAssembly` picks the FIRST count on an assembly. Once one assembly
  has several counts (tags, or § 11's one count per captured item), a mark can
  land on the wrong one. B's § 11.2 and count-by-tag § 5 both say "choose,
  never guess". v1 needs that chooser and a test. **v1 matches by name, not by
  key, so it does not need 0111 to be safe.**

### R.13 Connect point — PLACEHOLDER (0113)

The point on a wall-device symbol where the conduit really meets it, stored
as a distance and direction from the symbol's centre. B is writing
`references/connect-point-plan.md` on track-b. It was **not pushed** when
this was written (checked on `origin/track-b`).

- **Expected additive** (nullable, NULL = the centre, today's behaviour), but
  not assumed: classify it per R.3 when the plan exists.
- **Where it lives is the open question.** It could be per captured symbol
  (`symbol_links`), per assembly as a default, or both, with the pin plan's
  precedence.
- **Could it move a number? Probably yes**, unlike the pin look. If traced
  run ends snap to the connect point instead of the centre, every run's
  footage changes by the offset. **Its plan must say whether existing runs are
  re-measured.** If they are, that is a meaning change (step 3) with a
  before-and-after footage count. If only new runs use it, it is additive and
  old runs keep their length.

**Status: nothing here is written or run.** No `.sql` file exists yet, and
no database has been touched. Measured against `local-dev` at `90a286c`, which
ends at **0095**, and `a-email-reset` at `af82b2f`, which holds **0096**
(`teeBody`) and **0097** (password reset).

**Every file in this batch is ADDITIVE**: new nullable columns, one foreign key
on an all-NULL column, values appended to the END of three enums, and one
column made nullable. There is no `UPDATE`. So every file is **step 1 of the
three-step deploy (migrate BEFORE the code), and step 3 is empty for this
batch** (CLAUDE.md § "Deploying a migration: THREE STEPS"). The one step-3
file in sight, clearing the starters' hours, is deliberately **outside** this
batch (§ 11 (c)). That has been checked per FILE below, as the rule requires, not
asserted for the batch.

## The owner's answers (2026-09-29) — these override anything below

1. **Q1: all three shelves in one step.** 0098 appends **Surface Raceway,
   Underground and Service Entrance** in one `MODIFY` (§ 1). It is renamed
   `0098_new_material_categories`.
2. **Q2: C's extras (A2 locknut/insulated-throat flags, A3 what box a run end
   lands in) are skipped** until C answers its own Q3. Not in this batch.
3. **Q3: preferred brand, the per-bid brand override and the example-price
   flag are a SECOND small batch**, with a shape for the owner to pick from.
   The proposal is § 10. Nothing in it is written until the owner picks.
4. **Q4: HOLD the quote-bucket columns (H1)** until B's screens for them are
   planned. Not in this batch (§ 6).
5. **Q5: the column is `dropExcluded`** (§ 4).
6. **Added later the same day: two ASSEMBLY categories, "Demo & Retrofit" and
   "General"**, for Track C's starter assemblies. They are `0104` (§ 4a).
7. **Added later again: "Hours not set" on assemblies**, in three ordered
   steps (§ 11). Only step (a), `0105`, is in this batch. The `UPDATE` that
   clears the 8 starters is **not** in this batch and must not be.
8. **Pack sizes on materials are needed later** (§ 12). Not in this batch.

**When:** the owner has said Track B, Track C and `a-fitting-labor` all merge
only AFTER the live release from `90a286c`. This batch rides with or after
them, so nothing here is written before that release is out.

---

## 0. Numbering depends on `a-email-reset` landing first

> **SUPERSEDED 2026-10-01 by § R.** The invite gate and correction log now
> come BEFORE this batch (0098, 0099), and this batch is 0100–0107. The
> reasoning below about 0096 preceding the locknut file still holds; that
> file is now 0101.

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
  0106 and later. Their text already covers that case.

| File (proposed)                     | For                        | What it adds                                                                                |
| ----------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `0098_new_material_categories`      | C                          | `'Surface Raceway'`, `'Underground'`, `'Service Entrance'` appended to `materials.category` |
| `0099_locknut_bushing_roles`        | C (A1)                     | `'locknut'`, `'bushing'` appended to `runMaterialRole`                                      |
| `0100_materials_parent_id`          | C, before the priced sheet | `materials.parentId int NULL`                                                               |
| `0101_materials_parent_id_fk`       | C, before the priced sheet | the self-referencing FK, `ON DELETE RESTRICT`                                               |
| `0102_materials_brand`              | C, before the priced sheet | `materials.brand varchar(64) NULL`                                                          |
| `0103_takeoff_stamps_drop_excluded` | B (H3)                     | `takeoff_stamps.dropExcluded boolean NULL`                                                  |
| `0104_assembly_categories`          | C (starter assemblies)     | `'Demo & Retrofit'`, `'General'` appended to `assemblies.category`                          |
| `0105_assembly_hours_nullable`      | C (starter assemblies)     | `assemblies.baseLaborHours` may be NULL ("Hours not set"). § 11, step (a)                   |
| — (none)                            | B, drops per run end       | **No migration.** See § 6.                                                                  |

**One statement per file**, as `deploying.md` § 5a prefers: when a file fails
halfway, it is either applied or not, never half. That is why the FK is its own
file.

---

## 1. `0098_new_material_categories` — Track C

```sql
ALTER TABLE `materials`
	MODIFY COLUMN `category` enum(<the 19 values in MATERIAL_CATEGORIES, in order>,'Surface Raceway','Underground','Service Entrance');
```

- **What it adds:** three shelves, in one step (owner, Q1).
  `materials.category` is a MySQL enum (`drizzle/schema.ts:720`), so a
  category is a migration, not a text edit.
  - **Surface Raceway** is Track C's ask: `track-c-retail-catalog-plan.md`
    § R3 and RQ2 (on `origin/track-c`). About 23 rows, the 700 and 500 series,
    are seeded after it lands.
  - **Underground** and **Service Entrance** are the pricing sheet's other two
    missing categories (`ASSEMBLIES_PLAN.md` § "Three new categories ride
    along").
  - A shelf with no rows yet is empty in the enum and never shown, so adding
    all three now costs nothing on screen.
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
- **Answered (Q1):** all three in this one `MODIFY`, in that order.
  `MATERIAL_CATEGORY_ORDER` places each where it should display.

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
  "what box the end lands in" on `takeoff_runs`. **Skipped (owner, Q2)**
  until C answers its Q3 findings. C lists a no-schema alternative for A2, a
  flag on the seed rows. Each is its own additive file if wanted later, so
  nothing here blocks them.

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

  **Answered (Q3): a second small batch**, with shapes for the owner to pick
  from in **§ 10**. 0100–0102 stay in this batch because they are decided and
  unblock C's seeding work. **Both batches must land before the priced
  sheet.**

## 4. `0103_takeoff_stamps_drop_excluded` — Track B (H3)

```sql
ALTER TABLE `takeoff_stamps` ADD `dropExcluded` boolean;
```

- **What it adds:** "remove ONE mark's drop". B's words
  (`quote-app-panel-plan.md` § H3, commit `5f14947`): "boolean, **nullable, no
  default** — NULL means 'follows the count', the only meaning today, so it is
  **additive**".
- **The name, which B left to A: `dropExcluded`, confirmed by the owner (Q5).**
  It reads as the exception
  it is. `noDrop` reads like a drop _kind_, which is a different field on the
  count (`takeoff_groups.dropKind`), and two names that sound alike on one
  screen are how a mapping picks the wrong one.
- **Safe before the code?** Yes. A new nullable column, and old code never
  names it.
- **Why no default:** the three-step rule's own advice. `DEFAULT 0` would make
  "not yet decided" and "deliberately included" the same value. NULL is "follows
  the count", which B's code reads as today's meaning.

## 4a. `0104_assembly_categories` — Track C (starter assemblies)

```sql
ALTER TABLE `assemblies`
	MODIFY COLUMN `category` enum('Devices','Lighting','Panels','Equipment Connections','Low Voltage/EMS','Demo & Retrofit','General') NOT NULL;
```

- **What it adds:** two assembly shelves. The ask is Track C's
  `starter-assemblies-plan.md` Q3 (on `origin/track-c`, `2d30463`): the
  demo/retrofit and miscellaneous starters "cannot seed" without a slot.
- **Not the materials enum.** C suggested riding along with 0098 "so it is one
  additive `ALTER`, not two". It cannot: 0098 is `materials.category` and this
  is `assemblies.category` (`ASSEMBLY_CATEGORIES`, `drizzle/schema.ts:457`), a
  different table. It is still one step of the same batch, which is what that
  ask was for.
- **The list is copied from the only migration that set it**, `0007`, line 8,
  verbatim, with the two appended. **Keep `NOT NULL`.** A `MODIFY` restates the
  whole column, and leaving it off would quietly make the column nullable.
- **Safe before the code?** Yes. Appended at the end, so every stored value
  keeps its index. Old code never writes either value, and the old code's zod
  (`z.enum(ASSEMBLY_CATEGORIES)` in `assembliesRouter.ts`, `bidsRouter.ts`)
  never accepts them until the code ships.
- **Code that lands with it (C's change, not this file):** the list is copied
  in **three** places besides schema.ts, and all must gain both values:
  `client/src/components/HandPricedLineFields.tsx:51`,
  `client/src/pages/AssembliesLibraryPage.tsx:107`, and the shape map in
  `shared/takeoffMarks.ts` (`SHAPE_BY_CATEGORY`), whose comment says "the five
  library categories". A category missing from that map gets a shape from its
  id, so it works, but the comment and the "one shape per shelf" promise do
  not.
- **Watch:** the same expected "disagrees" from `schemaDrift` as § 1, between
  migrate and push.

## 5. Per-run-end drops — **no migration**

B's own plan says so: `origin/track-b:references/track-b-plans-screen-edits-plan.md`
line 10, "No migration is needed for any of the four parts. Nothing goes to
Track A." Every leg end already stores `startKind`/`endKind` and a per-end
height override (`startHeightInches`/`endHeightInches`). The held batch
(0089–0095) is already on `local-dev` and live. **If B finds it needs a column
after all, it is a new file after 0105, not a change to this batch.**

## 6. Also waiting on Track A, and HELD

- **H1**: `expense_items.quoteBucket` and `bid_expenses.quoteBucket`, a
  nullable enum `task`/`equipment`/`misc`, no default (NULL = Misc).
  Additive, and fully specified. **HELD by the owner (Q4) until B's screens
  for it are planned.** Then it is its own small file pair, numbered at write
  time.
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

   Expect **8 applied** (0098–0105, on a database already at 0097) and
   "Database matches the schema". **If the applied count is not 8, stop and
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

   After: expect the two category enums, the role enum and the hours column's nullability to **disagree** (database ahead)
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
  three enums and the hours column (§ 1, § 11) and nothing else.
- **Nothing reads the new columns until B's and C's code ships**, so no
  screen, price or bid total moves when this batch runs.
- **None of this touches `a-email-reset`'s files**, but it depends on them
  (§ 0).

## 9. Questions for the owner — ANSWERED 2026-09-29

All five are answered; see "The owner's answers" at the top. The questions
are kept below as they were asked.

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

---

## 10. SECOND BATCH — shape proposal for the owner to pick from (NOT a plan to build yet)

Three things block the priced starter sheet and have no decided shape:
the company's preferred brand, a per-bid override of it, and the
example-price flag (H2). **Nothing here is written until the owner picks.**
Every option below is ADDITIVE (new nullable columns or a new table, no
`UPDATE` to an existing column), so whichever is picked is step 1 of the
three-step deploy. Numbers are given at write time, after 0105.

### The owner's answers (2026-09-29, later) — these override 10a–10c below

1. **B1: brand works at THREE levels, not two.** Company default, per-bid
   override, and **per PANEL**: any single panel on a bid can be a different
   brand, including an **existing** panel on a retrofit. **Breakers follow the
   brand of the panel they go in**, not just the bid setting, so a mismatched
   pair cannot be picked. Options A, A′ and B in § 10a are all superseded by
   this. The shape it needs is **§ 10d**.
2. **B2: Option A of § 10b.** Source and date on the material, both cleared on
   any edit of the price, and the example flag frozen on each bid line.
3. **B3: the source reads "BidRidge example", plus the date.** Not a supplier
   name.

**Read first:** CLAUDE.md § Brands (brand exists on PANELS and BREAKERS only;
an assembly points at the parent), `ASSEMBLIES_PLAN.md` § "Parent items and
brand variants" step 5 (parent → preferred variant → fork of that variant;
with no preference, a parent "prices from nothing and says so"), CLAUDE.md
§ "Company defaults vs per-bid overrides" (a bid stores NULL to mean "follow
the company"), and `quote-app-panel-plan.md` § H2.

### 10a. Preferred brand, and the per-bid override

**Option A (recommended): two columns on each level, the productivity-factor
pattern.**

```sql
ALTER TABLE `pricing_defaults` ADD `panelBrand` varchar(64);   -- company
ALTER TABLE `pricing_defaults` ADD `breakerBrand` varchar(64);
ALTER TABLE `bids` ADD `panelBrand` varchar(64);               -- per bid, NULL = follow the company
ALTER TABLE `bids` ADD `breakerBrand` varchar(64);
```

- **Why it fits:** brand exists on exactly two shelves, so two columns hold
  every preference there can be. It is exactly how `productivityPct` works
  (`pricing_defaults` for the company, a nullable column on `bids` that
  inherits), so it reuses the inheritance that `companyDefaults.test.ts`
  already guards. The warning panel (`CompanyDefaultNotice`) goes on the
  company setting and not on the bid, as that section says.
- **NULL at company level means "no preference"**, and a parent then prices
  from nothing and says so. It never means "cheapest".
- **The values are brand LINES** ("Square D QO", "Eaton BR"), matching
  `materials.brand` on the variants (0102). They are validated against one TS
  list in `shared/`, the way categories are, but stored as varchar, so a new
  line is a code change, not a migration.
- **Weak spot:** a panel line and its breakers must match (a QO panel takes
  QO breakers). Two independent columns let someone pick QO panels with
  Homeline breakers. See Option A′.

**Option A′: one column per level, `brandLine`,** covering both panels and
breakers. It cannot pick a mismatched pair, which is simpler and safer. It
cannot express a bolt-on line (QOB) chosen separately from the panel, unless
the brand list maps a panel line to its breaker lines (a code fact, not a
column).

**Option B: a table**, `brand_preferences (ownerUserId, bidId NULL, family
varchar(64), brand varchar(64))`, one row per family, with a bid row
overriding the company row.

- Scales to any number of families. That is not needed while brand lives on
  two shelves, and CLAUDE.md narrows rather than widens that.
- **MySQL trap:** a UNIQUE key over a nullable `bidId` does not stop two
  company rows for one family, because NULLs never collide. It needs a
  generated column or a separate company table. More machinery for a case
  that does not exist yet.

**Recommendation: A′ if the owner confirms panels and breakers always follow
one line on a job; otherwise A.** B only if brand is ever widened beyond those
two shelves.

### 10b. The example-price flag (H2)

**Option A (recommended): source and date on the material, one frozen flag on
the line.**

```sql
ALTER TABLE `materials` ADD `examplePriceSource` varchar(128);  -- e.g. "Supplier list, Spokane"
ALTER TABLE `materials` ADD `examplePriceAsOf` date;
ALTER TABLE `bid_line_items` ADD `snapshotPriceWasExample` boolean;
```

- **"Is this an example price?" is ONE fact:** `examplePriceSource IS NOT
NULL`. There is no separate boolean that could disagree with the source.
  The "EXAMPLE PRICE, source, date" label (the 2026-09-21 decision) reads both
  columns.
- **Editing the price clears both**, in the same update. That is what "makes
  it the shop's own" (H2). This is code, not migration.
- **On the line: `snapshotPriceWasExample`**, frozen with the other
  `snapshot*` fields when the line is added and never recomputed. NULL = "not
  recorded" (every line before the migration), true or false after it. It sits
  beside `snapshotUnpricedParts`, which is the same kind of frozen fact.
- **The seeder fills `examplePriceSource`/`examplePriceAsOf` on baseline rows
  from the seed file.** That writes the NEW columns only, so it is still
  additive. It never touches a fork, the same `isNull(userId)` scope as today
  (`seedPreservesUserPrices.test.ts`).

**Option B: a `priceKind` enum (`example` / `own`) plus source and date.** It
has a third state (NULL), and two fields that must agree. Rejected for the
same reason `whenUnset` exists: two ways to say one thing drift.

**Option C: no column. Compare `costPerUnit` against the seed value at read
time** (`todo.md` floated this). A shop that agrees with the example price
looks unpriced forever. More importantly, a bid LINE cannot be answered
later, because the seed value it was compared against has moved on. Not
recommended.

**The meaning change to watch, whichever is picked:** once shipped rows carry
real prices, `costPerUnit === 0` stops meaning "nobody priced this"
(`shared/materialPricing.ts`, the Materials screen's unpriced filter). The
columns above are additive, but **the seed file gaining prices is a meaning
change to an existing column**. So the order is: this batch's columns (step
1), then the code that reads `examplePriceSource` as the new "unpriced"
signal, then the seed file with prices. Never the prices first.

### 10c. Questions for the owner (second batch) — ANSWERED, see above

1. **B1.** Do panels and breakers on one job always follow one brand line?
   Yes → Option A′ (one `brandLine`). No → Option A (two columns).
2. **B2.** Example-price flag: Option A (source + date on the material, a
   frozen flag on the line)? Recommended.
3. **B3.** What should the source say for the shipped prices — a supplier
   name and city, or just "BidRidge example"? It is shown on every priced
   starter row.

### 10d. What the owner's B1 needs — a SHAPE, not written yet

**Measured against `drizzle/schema.ts` today: there is no panel on a bid.** A
panel is a bid line (an assembly such as "200A main panel furnish and
install", `qty` possibly above 1) or a count on the plans (`takeoff_groups`,
one mark per panel). The only other trace is free text, a circuit named
"Panel A-3" (`takeoff_run_circuits.name`). **An existing panel on a retrofit
is not a line at all**, because nothing is bought. So "this panel is QO"
has nowhere to live, and a breaker has nothing to point at.

**So yes, breakers need a link to their panel.** Without one, "follow the
panel it goes in" cannot be computed, and the app would fall back to the bid
setting, which is exactly what B1 rules out.

**Columns and table, all ADDITIVE (step 1, no `UPDATE`), one statement per
file:**

```sql
-- company default and per-bid override: one brand LINE each (panels and breakers together)
ALTER TABLE `pricing_defaults` ADD `brandLine` varchar(64);   -- NULL = no preference
ALTER TABLE `bids` ADD `brandLine` varchar(64);               -- NULL = follow the company

-- the panels on a bid, new or existing
CREATE TABLE `bid_panels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidId` int NOT NULL,            -- FK bids, ON DELETE cascade
	`userId` int NOT NULL,           -- FK users, ON DELETE cascade (the company owner, like every table)
	`name` varchar(64) NOT NULL,     -- "Panel A", "MDP", "Existing LP-1"
	`brandLine` varchar(64),         -- NULL = follow the bid, then the company
	`isExisting` boolean,            -- true = already on site, nothing to buy; NULL/false = furnished on this bid
	`lineItemId` int,                -- FK bid_line_items, ON DELETE set null: the line that furnishes it (NULL when existing)
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_panels_id` PRIMARY KEY(`id`)
);

-- which panel a breaker line goes in
ALTER TABLE `bid_line_items` ADD `panelId` int;               -- NULL = not in a named panel
ALTER TABLE `bid_line_items` ADD CONSTRAINT `bid_line_items_panelId_bid_panels_id_fk`
	FOREIGN KEY (`panelId`) REFERENCES `bid_panels`(`id`) ON DELETE set null ON UPDATE no action;

-- what brand a line was PRICED as, frozen with the other snapshot fields
ALTER TABLE `bid_line_items` ADD `snapshotBrandLine` varchar(64);
```

Plus 10b Option A (B2): `materials.examplePriceSource`,
`materials.examplePriceAsOf`, `bid_line_items.snapshotPriceWasExample`.

**How a breaker resolves its brand** (code, not migration): the line's
`panelId` → that panel's `brandLine` → the bid's `brandLine` → the company's
`brandLine` → none, when the parent "prices from nothing and says so"
(`ASSEMBLIES_PLAN.md` step 5). **A breaker line has no brand field of its
own, and that is the guard**: there is no control that could pick Homeline
breakers for a QO panel. Which breaker lines a panel line takes (QO panel → QO,
or QOB for bolt-on) is a fact in one TS list in `shared/`, not a column, so a
new line is a code change.

**Why a table and not a column on the line:** an existing panel has no line to
hang a column on, and one panel line with `qty` 3 cannot say "two are QO, one
is Eaton". A `bid_panels` row is one physical panel. The new-panel case links
back to its line through `lineItemId` so the panel is still priced where it is
priced today.

**Why `snapshotBrandLine`:** a line's price is frozen at add time (CLAUDE.md,
"never mutate a snapshot field"). So changing a panel from Homeline to QO
**after** its breakers are on the bid does NOT re-price them, and without a
record of what they were priced as, nothing could even notice. With it, the
bid can say "priced as Homeline, panel is now QO" beside the line.

**Two things to decide before the code, not the migration:**

1. **Changing a panel's brand with breakers already on it — DECIDED by the
   owner, 2026-09-29.** Every breaker line whose `snapshotBrandLine` no longer
   matches its panel's brand is **flagged**, and the bid offers **one
   "re-price to [brand]" button** (e.g. "Re-price to QO"). **Never re-price
   silently.** Re-pricing rewrites that line's snapshot only because a person
   pressed the button, which keeps the snapshot rule: nothing moves a frozen
   price on its own. Doing nothing is ruled out too, because it would leave a
   bid quoting the wrong breakers without a word. No extra column is needed:
   the flag is `snapshotBrandLine` compared with the panel's resolved brand
   at read time.
2. **Do counts on the plans need a panel too?** A breaker is rarely counted
   off a drawing, so recommend NOT adding `panelId` to `takeoff_groups` now. A
   panel's MARK could later link to its `bid_panels` row. That is a separate
   additive column if B's plans screen wants it.

**Manual-first check (CLAUDE.md § "As manual or as automated"):** a
contractor who never names a panel still works. Breakers with no `panelId`
follow the bid, then the company, which is today's behaviour. Naming panels
is only needed when one differs.

**Size of the second batch: roughly ten statements.** That is two brand-line
columns, the table and its three FKs, `panelId` and its FK,
`snapshotBrandLine`, and B2's three columns. **The exact count is fixed when
the files are written.** If the rehearsal's applied count does not match the
number written then, stop and find out why.

---

## 11. "Hours not set" on assemblies — Track C's handoff H2, in the SAFE ORDER

**Source:** `references/track-a-handoff-starter-assemblies.md` § H2, on
`origin/track-c`. **Owner decision (2026-09-29):** a starter with no real hours
stores "not set" and shows **"Hours not set"**, never 0, and the 8 shipped
starters lose their placeholder hours. **Owner's order: (a) the migration
allows empty hours, (b) the code shows "Hours not set" and never prices blank
as 0, (c) only then clear the 8 starters.**

**Checked against the code on this branch, 2026-09-29, rather than taken from
the handoff:**

- `assemblies.baseLaborHours` is `decimal(10,4) NOT NULL DEFAULT '0'` (created
  in `0007`, line 10, never changed since). So "not set" has no value of its
  own today. Zero is taking that role, and zero is what the owner ruled out.
- **The starter seeder never rewrites hours on a row that already exists.**
  `seedBaselineAssemblies` (`server/db.ts`) inserts only missing starters, and
  its update passes fill a role and branch-whip flags, never hours. So a seed
  file change alone reaches new databases only. **Existing databases need the
  one-time `UPDATE` in step (c)**, as the handoff says.
- There are 8 starters in `server/seed/baselineAssemblies.ts`, from "Duplex
  receptacle standard" to "200A main panel furnish and install".

### (a) `0105_assembly_hours_nullable` — ADDITIVE, in this batch, BEFORE the code

```sql
ALTER TABLE `assemblies` MODIFY COLUMN `baseLaborHours` decimal(10,4) NULL DEFAULT NULL;
```

- **No existing value changes.** Every row keeps its number, so this is step 1.
- **Dropping the default is safe with the old code, measured rather than
  assumed.** All four `insert(assemblies)` sites in `server/db.ts` supply the
  column: create takes it from `hoursSchema`, which is required, the seeder
  writes `toFixed(4)`, and fork and duplicate spread the whole source row
  (`contentFields`). So nothing the old code does can write NULL. **Re-check
  this at write time**, since an insert added before then would change the
  answer. `0075` kept `DEFAULT '0'` on the bid-line column. Here the default
  goes, because a value somebody forgot to supply should read as "not set",
  never as a considered zero (CLAUDE.md § three steps, "A `DEFAULT 0` throws
  that away").
- **`overheadLaborHours` is left as it is.** It ships at 0 on purpose as "no
  extra time", and the owner's decision covers only base hours.
- **Watch:** `schemaDrift` reports the nullability as disagreeing between
  migrate and push, the same expected message as the enums (§ 7, § 8).

### (b) The code — ships SECOND. It must read NULL as "not set" everywhere

This is Track C's (or the starter builder's), listed so the order is visible.
`drizzle/schema.ts` loses `.default("0").notNull()` **in the same commit as the
`.sql`**, and `pnpm check` then marks every reader that assumed a number.

- **Every reader treats NULL as NOT SET, never `Number(null)`**, which is 0 and
  is exactly the silent zero this removes. Measured today, readers that coerce
  with `Number(...)` include `server/db.ts:5810`, `assembliesRouter.ts:436`,
  `closeoutRouter.ts:409`, `kitsRouter.ts:99`, `QuickBidPage.tsx:356`, and many
  in `AssembliesLibraryPage.tsx`, several of them `Number(x) || 0`. **That list
  came from searching for `baseLaborHours` beside `Number(`, which is a shape.**
  At write time, search the column name and read every hit (CLAUDE.md § "A grep
  is a measurement"). The handoff counts ten files.
- **On a bid:** adding a not-set assembly snapshots `snapshotLaborHours = NULL`,
  which the bid already reads as "not typed yet" (`0075`). The line shows
  **"Hours not set"**, and the total says how many lines it leaves out, like
  "Not priced".
- **In the builder:** an empty field with the placeholder "Hours not set", via
  `InlineNumberField`'s `whenUnset` (CLAUDE.md § Editing fields, rule 6).
- **The seed file:** `BaselineAssembly.baseLaborHours` becomes `number | null`,
  and new starters ship `null`. A brand-new database is then right from its
  first boot. Existing databases still hold the placeholders until (c).
- **The router:** `hoursSchema` accepts `null` on update, so a person can clear
  hours back to "not set" as well as type them.
- **Rehearse (b) before (c):** on a local copy, set one starter's hours to
  NULL by hand and check the Library, a bid line from it, Quick bid and the
  closeout suggestion. Every one should say "Hours not set", and none should
  show 0.

### (c) Clear the 8 starters' placeholders — MEANING, AFTER the code is live

```sql
UPDATE `assemblies` SET `baseLaborHours` = NULL
WHERE `userId` IS NULL
  AND `name` IN (<the 8 names from server/seed/baselineAssemblies.ts, copied, never retyped>);
```

- **An `UPDATE` to a column older than the batch, so this is the exception:
  code first, then this** (CLAUDE.md § "Deploying a migration: THREE STEPS",
  step 3). If it ran first, every one of the 8 starters would price at zero
  hours on every new bid, with nothing on screen to say so. That is the fault
  this whole change exists to remove.
- **It must NOT sit in `drizzle/` until (b) is live.** `migrate.mts` applies
  every pending file in order, so a step-3 file committed alongside `0105`
  would run at step 1. Write it, and commit it **after** the code is on the
  live site. That is the 2026-09-20 outage's lesson from the other side.
- **Scope, and why it is safe:**
  - `userId IS NULL` means shared starter rows only. A company that edited a
    starter holds a fork with its own `userId`, and those hours are the
    company's.
  - The name list limits it to the 8. A starter the owner has since given
    real hours is not on the list.
  - Existing bid lines are safe by construction. Their hours are a snapshot,
    and a snapshot is never rewritten.
- **Measure both sides (CLAUDE.md § "A count taken before the change is
  intent"):** count starters with `userId IS NULL AND baseLaborHours IS NULL`
  before and after. **Expect 0 → 8.** If the second number is not 8, stop and
  find out why: either a name changed since this was written, or the database
  is not the one you think. Run it twice, and the second run must change 0
  rows.
- **Was open (from the handoff), ANSWERED by the owner 2026-09-29: YES, a
  user's own NEW assembly starts blank too.** It opens with hours "not set",
  exactly like a cleared starter, and `shared/laborHourDefaults.ts` no longer
  pre-fills the field. Instead the builder shows **the sum of its parts'
  hours as a hint the user can tap to use**. The hint is **never applied on
  its own**: not on create, not on save, not when a part is added. Until the
  user taps it or types a number, the assembly stays "Hours not set" and
  prices as such.
  - **Where the sum comes from:** the parts' labor units, added up by
    `shared/materialLabor.ts` (`laborForAssembly`), which is the one place
    allowed to add these up. Do not write a second sum in the builder.
  - **When no part has a labor unit**, there is no hint. Never show a 0 hint,
    since tapping it would store the considered zero this change removes.
  - **This lands with step (b), the code.** It is a builder change and needs
    no migration of its own beyond `0105`.
  - **`laborHourDefaults.ts`** loses its job as a pre-fill. Whether it is
    deleted or kept for something else is decided when (b) is written; its
    comment ("Never zero, never blank") must change in the same commit,
    because blank is now the ruled answer.

---

## 12. Pack sizes on materials — needed LATER, not in either batch

**Recorded 2026-09-29 so it is not rediscovered.** The purchase list will need
to round up to **whole packs** (a box of 25, a 250 ft roll, a 10 ft stick),
and `materials` has no pack size today.

- **What exists:** Track C's `shared/materialsList.ts` (`orderQty`, on
  `origin/track-c`) rounds pieces and boxes up to whole units **after** the
  sum, with no schema. Whole packs wait on a pack size.
- **Already decided elsewhere, so cite it rather than re-deciding:**
  `references/material-markup.md` **D3** (2026-09-25). Price bands use the pack
  or purchase price, and "Piece 2" of that plan adds a pack size and pack price
  to `materials`. **The purchase list and the price bands should read the same
  column**, not one each. Two pack sizes for one material is two chances to
  disagree (CLAUDE.md § "Copying a layout does not copy the behaviour").
- **When it is written:** additive (nullable, no default, NULL = "sold singly /
  not known"), so it is step 1 like the rest. Numbered at write time.
- **Seeding it is a seed-file change** (`server/seed/materials/*.ts`), and it
  reaches existing databases through the startup re-stamp, the same way prices
  will, **once `backfillMaterialMetadata` is taught the new column**. It
  re-stamps only the fields it names. A contractor's own pack size lives on their fork and is never touched.
