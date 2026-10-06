# Next migrations — ONE list, every track's asks. PLAN ONLY, 2026-10-06

**Nothing here is written, migrated or deployed.** This is the single
numbered list of every column and table any track has asked Track A for,
after the 105 already on staging AND live (0000–0104; live since
2026-10-06). **It supersedes the numbers in
`migrations-0098-batch-plan.md` § S from 0105 on**, which had two problems
fixed here: its Batch 3 still reused 0108–0114 (the same numbers as Batch
2), and Batch 2 had two separate `ALTER`s on `bid_pdf_sheets` and three on
`assemblies`, against § S's own rule of one `ALTER` per table.

**Sources read for this list** (so the next reader can see what was searched,
CLAUDE.md § "A grep is a measurement"): `todo.md` § "Track A next migration
batch" and § "Requests to Track A from Check sheet" on `local-dev` (f8fdec3)
**and** `track-b` (41462a7, clean working copy, quote items included);
`track-c-handoff.md` § "Migrations Track A would need"; `code-first-ceiling.md`;
`track-c-next-batch-plan.md` W5; `track-c-retail-catalog-plan.md` R8;
`migrations-0098-batch-plan.md` § S, R.6, R.9, § 11; `invite-gate-plan.md` § 7
and `ai-correction-log-plan.md` § 4 (on `a-plans`);
`remove-relocate-labor-plan.md`; `vertical-drops-plan.md` § 7;
`quote-items-plan.md` § 8.

## How to read it

- **Order = number = deploy order.** The migrator skips a file numbered below
  one already applied (§ R.1), so a number is never reused once anything
  is applied anywhere. None of these is written, so renumbering is still free.
- **Step 1 / step 3** (CLAUDE.md § "Deploying a migration: THREE STEPS"):
  step 1 = additive, migrate BEFORE the code; step 3 = meaning change,
  committed to `drizzle/` only after its code is LIVE.
- **"Bid number?"** answers two questions: does applying the file move any
  number on an existing bid (it must not, for every step-1 file), and does
  the code that later reads it move numbers (said plainly, because that is
  where a wrong number would come from).
- Every step-1 column is **nullable with no default** unless the row says
  why not. NULL means "not set / follows the level above / old behaviour" and
  nothing may read it as 0.

## 0105–0106 — labor only: FIRST, because it ships with B's rule

**Owner, 2026-10-06: YES.** Shipped labor-only starter assemblies are marked
labor-only; every other assembly stays "material not priced" until somebody
ticks it. Numbered first — added 2026-10-06, shifting everything below up
by two (none was written) — because it must reach live **no later than
Track B's rule** (`5c98bd1`), and the rest of Batch 2 need not.

**Two columns, two files.** A bid line keeps what was frozen when it was
added, so the answer is also FROZEN onto the line (0106), the same as every
other line snapshot. Then ticking "labor only" later cannot quietly re-mark
a finished bid. Track B recommended this and left the pick to Track A
(todo.md, 2026-10-06). **Picked: freeze.** Reading the assembly live
instead would make a bid's "not priced" count change when someone edits the
library, which is the thing snapshots exist to stop.

| #    | File                       | What it is                                                                                                                                                                         | Asked by                           | Bid number?                                                                                                                                                                                                                        | Order                                                                                     |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 0105 | `0105_assembly_labor_only` | `assemblies.laborOnly boolean NULL`, no default. NULL / false = not said: a line with labor and $0 material stays "not priced".                                                    | B (asked); owner (yes, 2026-10-06) | Applying: no. Code (B): `lineMaterialNotPriced` AND its SQL copy skip a labor-only assembly's material, so its lines read **priced** and the priced print is no longer blocked. Totals: no change (the material is $0 either way). | Step 1. Before B's reading code. **With, or before, the release that carries `5c98bd1`.** |
| 0106 | `0106_line_labor_only`     | `bid_line_items.snapshotLaborOnly boolean NULL`, no default — the assembly's `laborOnly`, frozen when the line is added. NULL = a line from before the column, read as "not said". | B (asked); A (picked freezing)     | Applying: no. Code (B): `lineMaterialNotPriced` reads the LINE's frozen answer; NULL keeps today's behaviour, so no existing bid changes when the column lands.                                                                    | Step 1, with 0105.                                                                        |

**Why it is not simply part of the `assemblies` file (0110).** One `ALTER`
per table is the rule within one RELEASE. 0105 and 0110 ship in different
releases, so they are two files on purpose — the same reason 0098 and 0103
both touch `takeoff_stamps`.

**Why it matters for the release now pending** (`live-release-plan.md`):
on `f8fdec3` the priced print refuses any bid with a "not priced" line, with
no way past (`ProposalPage.tsx`), and B's rule makes every labor-only
assembly line "not priced". The 8 shipped starters include **no** labor-only
assembly (counted 2026-10-06), so nothing shipped is caught — but any
labor-only assembly a contractor builds (demo, pull wire) would block that
bid's priced print, and there is nothing to type that clears it (a $0
material is exactly what the rule flags; the per-bid price box is 0115,
not built). Decision recorded in `live-release-plan.md` § 0.

## Batch 2 — owner-approved now, and before the first outside invite

| #    | File                      | What it is                                                                                                                                                                                                                                                                                                                                                              | Asked by                                          | Bid number?                                                                                                                                                                                                                                   | Order                                                                     |
| ---- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 0107 | `0107_signup_invites`     | Table `signup_invites` — the invite gate (codes for a NEW company, separate from `company_invites`).                                                                                                                                                                                                                                                                    | A (stage-4 safety § 5; `invite-gate-plan.md` § 7) | No.                                                                                                                                                                                                                                           | Step 1. Before the gate's code; the gate before the first outside invite. |
| 0108 | `0108_ai_correction_log`  | Table: the AI correction log, one table with an identified and an anonymised half, **plus C's** `askKind enum('crop','note')`, `askFingerprint varchar(64)`, index `(dataUserId, askFingerprint)` in the same `CREATE`.                                                                                                                                                 | A (§ 3) + C (pay-once)                            | No.                                                                                                                                                                                                                                           | Step 1. Before outside users touch the AI.                                |
| 0109 | `0109_sheet_hash_height`  | `bid_pdf_sheets`: `contentHash varchar(64)` (NULL = never read) **and** `distributionHeightInches int` (NULL = follows the job). One `ALTER`.                                                                                                                                                                                                                           | C (pay-once) + B (vertical-drops § 7 col 1)       | Applying: no. B's built code (`faeaab8`) then reads a sheet's run height: **vertical footage moves only on a sheet someone sets** — NULL keeps today's chain.                                                                                 | Step 1.                                                                   |
| 0110 | `0110_assembly_columns`   | `assemblies`: `removeLaborHours`, `relocateLaborHours` decimal(10,4); `mountHeightTypeKey varchar(64)`; `materialByQuote boolean`. One `ALTER`. (`laborOnly` is 0105, a release earlier — see above.)                                                                                                                                                                   | A (owner Q2) + B (drops § 7 col 2; quote items)   | Applying: no. Code: remove/relocate labor lines appear when hours are set; a NEW count's drop starts from the height type; new lines from a quote assembly start as quote items.                                                              | Step 1.                                                                   |
| 0111 | `0111_group_status_hours` | `takeoff_groups`: `removeLaborHours`, `relocateLaborHours` — the per-bid override of 0110.                                                                                                                                                                                                                                                                              | A (owner Q2)                                      | Applying: no. Code: overrides the assembly's hours on this bid only.                                                                                                                                                                          | Step 1, with 0110.                                                        |
| 0112 | `0112_stamp_label_words`  | `takeoff_stamps.labelWords text` — the words Find all matching tied to a device ("USB", `54"`, "(E)", "A2").                                                                                                                                                                                                                                                            | C (handoff, 2026-10-06)                           | Applying: no. **Pricing by the words is not planned**; if it ever is, that is its own decision.                                                                                                                                               | Step 1.                                                                   |
| 0113 | `0113_look_confirmed_at`  | `symbol_looks.confirmedAt timestamp` — when a look was first confirmed by hand, shared across browsers (today `@/lib/trustedLooks`, per browser).                                                                                                                                                                                                                       | C (handoff, 2026-10-06)                           | No (which finds are pre-trusted, not quantities).                                                                                                                                                                                             | Step 1. After 0102 (done).                                                |
| 0114 | `0114_bid_quotes`         | Table `bid_quotes` (`id`, `bidId` FK cascade, `userId`, `supplierName`, `quotedOn`, `packagePrice`, `carriedFromBidId` **no FK**, `note`, timestamps; index `(userId, bidId)`).                                                                                                                                                                                         | B (quote items, owner-answered)                   | No.                                                                                                                                                                                                                                           | Step 1. **Before 0115** (0115's `quoteId` points at it).                  |
| 0115 | `0115_bid_line_columns`   | `bid_line_items`, one `ALTER`: `lineRole enum('install','remove','relocate') NOT NULL DEFAULT 'install'` + unique key `(bidId, takeoffGroupId)` → `(bidId, takeoffGroupId, lineRole)`; `bidUnitCost decimal(12,4)`; `isQuoteItem boolean`; `quoteId int` + FK `bid_quotes` SET NULL; `quoteShare decimal(12,2)`; `quoteItemKey varchar(255)`; `quoteNote varchar(500)`. | A (owner Q2) + B (quote items; price box)         | **Applying: must not** — `install` IS every existing line's meaning; prove with `bidTotals.mts` before/after on the rehearsal copy. Code: a typed `bidUnitCost` prices that line on that bid (intended); remove/relocate lines are new lines. | Step 1. After 0114. **Read twice** (below).                               |
| 0116 | `0116_quoted_markup`      | `pricing_defaults.quotedMarkupPct decimal(6,4)` beside `materialMarkupPct` — the ONE company-wide quoted-line markup (material-markup D4, owner c).                                                                                                                                                                                                                     | B (quote items)                                   | Applying: no. Code: when set, quote lines take it instead of the material bands (intended).                                                                                                                                                   | Step 1.                                                                   |

**0115 is the one to read twice.** `lineRole` is the only NOT NULL column
here, on purpose: MySQL treats NULLs in a unique key as all different, so a
nullable role would silently stop guarding "one line per count". Inside the
one `ALTER`: add the columns, ADD the new unique key, then DROP the old one.
Old code never writes a role, so for it the new key is exactly as strict as
the old. The rehearsal must show the `bidId` foreign key still backed by an
index after the drop (the new key starts with `bidId`). Detail:
`remove-relocate-labor-plan.md` (on `a-handoff`).

## Batch 3 — catalog, with C's catalog code (renumbered from § S)

| #    | File                           | What it is                                                                                | Asked by | Bid number?                                                                                                                                                                                                                                           | Order                                    |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 0117 | `0117_new_material_categories` | 3 values appended to `materials.category`                                                 | C        | No.                                                                                                                                                                                                                                                   | Step 1.                                  |
| 0118 | `0118_locknut_bushing_roles`   | `'locknut'`, `'bushing'` appended to `bid_line_items.runMaterialRole` (list = 0096's + 2) | C (A1)   | Applying: no. **Code: YES** — runs start counting locknuts and bushings. The owner's **"wire size not set, bushings not counted"** rule is code on top of this, not a column: on small conduit with no conductor chosen, count no bushing and say so. | Step 1. Before C's locknut/bushing code. |
| 0119 | `0119_materials_parent_id`     | `materials.parentId int`                                                                  | C        | No (until variants resolve, Batch 5).                                                                                                                                                                                                                 | Step 1.                                  |
| 0120 | `0120_materials_parent_id_fk`  | self-FK `ON DELETE RESTRICT`                                                              | C        | No.                                                                                                                                                                                                                                                   | After 0119.                              |
| 0121 | `0121_materials_brand`         | `materials.brand varchar(64)`                                                             | C        | No.                                                                                                                                                                                                                                                   | Step 1.                                  |
| 0122 | `0122_assembly_categories`     | 2 values appended to `assemblies.category`, NOT NULL kept                                 | C        | No.                                                                                                                                                                                                                                                   | Step 1.                                  |
| 0123 | `0123_assembly_hours_nullable` | `assemblies.baseLaborHours` may be NULL ("hours not set", § 11)                           | C (H2)   | Applying: no. Code must read NULL as "not set" everywhere BEFORE step 3 (i) below.                                                                                                                                                                    | Step 1. Code second; step 3 (i) third.   |

## Batch 4 — legend reading

| #    | File                          | What it is                                                       | Asked by | Bid number? | Order                      |
| ---- | ----------------------------- | ---------------------------------------------------------------- | -------- | ----------- | -------------------------- |
| 0124 | `0124_bid_pdf_legend_entries` | Table, **with** `lookId int NULL → symbol_looks, SET NULL` in it | A/C      | No.         | Step 1. After 0102 (done). |

## Batch 5 — before the priced sheet

§ 10d + B2 of the batch plan: brand line ×2, `bid_panels` + FKs, `panelId` +
FK, `snapshotBrandLine`, example-price ×3 — about ten files, **numbered from
0125 when written**. Bid numbers: yes by design (brand variants resolve
prices; example prices become non-zero), which is why it waits for the
"nobody has priced this" signal (example-price) to land first.

## Step 3 — meaning changes, committed ONLY after their code is LIVE

| Step-3 file                         | What it does                                                                                                    | Asked by          | Bid number?                                                                                                                                                                                                                        | Order                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| (ii) **Fold the twin counts**       | Track C's "… - EXISTING TO REMAIN" twin counts become marks with `status = 'existing'` on the base count (R.9). | C / B (handoff 3) | **YES, on purpose:** an existing device stops pricing as new. Totals must move **only** by what was existing — measured with `bidTotals.mts` before/after on a restored copy of whichever database has twins (live may have none). | After the `status` code (0098, in `f8fdec3`) is LIVE. Not before. |
| (i) **Clear the 8 starters' hours** | Starter assemblies' 0 hours → NULL "not set" (§ 11 c).                                                          | C (H2)            | No amounts move (line snapshots are frozen); new lines from those starters read "hours not set" instead of a silent 0.                                                                                                             | After 0123 AND its code are live.                                 |

## Not numbered — and why

| Item                                                                          | Asked by                 | Why not numbered                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unique key `symbol_links (userId, lookupKey)` (R.6)                           | A / C                    | **Fails on existing duplicates.** Measured on the local copy: 0 duplicate groups — but only 3 rows, which says nothing. Check the restored live copy at rehearsal; number it only if that is 0. |
| Panel schedules (`bid_panel_circuits`, under `bid_panels`)                    | C (code-first-ceiling e) | **One panel table decided** (clash 5): C's reading writes `bid_panels` + `bid_panel_circuits`. Numbered with Batch 5, when the schedule reader is scheduled.                                    |
| `bid_pdfs.supersedesId` (addenda)                                             | C (code-first-ceiling f) | Needs one real addendum pair from the owner first.                                                                                                                                              |
| Scan decision log (`scanned-plans-plan.md` § 5)                               | C                        | Not needed until the scan branch of Find all matching is built.                                                                                                                                 |
| ~~`assemblies.laborOnly boolean`~~ **NUMBERED: 0105** (owner yes, 2026-10-06) | B                        | See the 0105 section above.                                                                                                                                                                     |
| `fixtureTag`; legend § 8b/8c; pack sizes (§ 12)                               | B / C                    | Undecided.                                                                                                                                                                                      |
| ~~H1 `quoteBucket`~~ **DROPPED** (clash 6)                                    | earlier quote idea       | Replaced by B's quote items (0110, 0114–0116).                                                                                                                                                  |

## Clashes and duplicates found

1. **Numbers reused.** § S's Batch 3 table still said 0108–0114, the same
   numbers as Batch 2's 0108–0112. Fixed: catalog is 0117–0123, legend 0124
   (this list's numbers, after 0105–0106 went to `laborOnly`).
2. **Two `ALTER`s on one table in one batch.** `bid_pdf_sheets` (contentHash
   0107 + run height 0111, as § S numbered them) and `assemblies` (0108 +
   0112 + quote flag). Merged into 0109 and 0110 (this list's numbers).
3. **`mountingHeightIn` on a mark — DUPLICATE, do not add.** C's handoff
   suggests it beside `labelWords`; `takeoff_stamps.mountHeightInches` +
   `mountHeightSource` already exist (0098, on staging).
4. **`bidUnitCost` is ONE column for two features** — quote items and the
   price box. Never two. `lineNotPriced` and `lineNotPricedSql` read it
   together (B's note).
5. **Panels twice — DECIDED 2026-10-06 (Track A, reversible): ONE table,
   `bid_panels`.** A panel on a bid is one row whatever put it there: the
   brand-line plan (Batch 5) and C's panel-schedule reading both write it,
   with nullable `bidPdfId` / `sheetId` for a panel read off a schedule and
   NULL for one typed in. Its circuits go in a child table,
   `bid_panel_circuits` (`panelId` FK cascade, number, breaker amps, poles,
   description, load), which replaces C's `panel_circuits`. C's
   `panel_schedules` is not built. Why: two panel tables would let the same
   panel exist twice, priced from one and counted from the other. Nothing is
   written, so this changes no bid number and can be reversed.
6. **Quotes twice — DECIDED 2026-10-06 (Track A, reversible): B's quote
   items win** — `bid_quotes` (0114), the six `bid_line_items` columns (0115),
   `pricing_defaults.quotedMarkupPct` (0116), `assemblies.materialByQuote`
   (0110). H1 `quoteBucket` is **dropped**: it was the held predecessor of the
   same feature, and B's design is owner-answered. Nothing is written, so
   this changes no bid number and can be reversed.
7. **"Nobody has priced this" vs example-price ×3** — the same signal under
   two names (CLAUDE.md § "Where a priced catalog lands"; Batch 5). One set
   of columns.
8. **0115 breaks the "nullable, no default" rule** — deliberately, for the
   unique key (above). Written down so nobody "fixes" it.
9. **The twin fold is not "the same migration" as the status column.**
   C's older notes say the twins convert with the column; R.9 split it — the
   column is on staging (0098), the fold is step 3 and waits for live.
10. **Stale numbers elsewhere:** `remove-relocate-labor-plan.md` and the
    `todo.md` note (both on `a-handoff`) said 0108–0112; corrected to this
    list the same day.

## If what the directory shows does not match this list

Before writing any file, `ls drizzle/*.sql | tail -3` and
`scripts/schemaDrift.mts` on staging. **If the last applied number is not
0104, stop and find out why before writing anything** — either this list is
stale (another file landed) or the database is not where you think it is,
and those want opposite responses.
