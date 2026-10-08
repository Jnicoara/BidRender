# Track A handoff — 2026-10-06, after the live release

Written for a restart. **Read this first.** The session-by-session history
it replaces is in git (`git log -p -- references/track-a-handoff.md`); the
release record is `deploying.md` § 11 "LIVE: `24105ad`".

## UPDATE 2026-10-08 (session 23) — START HERE

**Where things stand.** Live = `24105ad`, 0000–0104, untouched. Staging =
`local-dev`, **migrations 0000–0139 (140)**.

- **0139 BUILT and on staging**: `0139_elbow_flat_role` appends
  `elbowFlat` to `bid_line_items.runMaterialRole` (after `extra`). Why: a
  700 run needs an inside elbow (`elbow90`) AND a flat elbow, and the bid
  allows one line per run type + role. **Matches C's stand-in exactly** —
  name, journal entry (`when` 1789962900000) and statement; only the header
  comment differs. C takes A's file at merge; a DB that ran the stand-in
  needs nothing (the migrator goes by `when`).
- Safety steps as for 0135–0138: backup
  `staging-2026-10-08T22-38-43Z-before-0139.sql`, restored, 73/73 counts
  equal; rehearsed (1 applied, re-run nothing, matches 176/176, **732/732
  totals unchanged**); staging 22:44 UTC the same, **732/732 unchanged**,
  old code still serving. Record: `deploying.md` § 11 "0139".
- Code: `RUN_MATERIAL_ROLES` + `elbowFlat`; a **tripwire** `elbowFlat` case
  in `feetForRole` (`server/db.ts`) answering 0 — C's code puts the role in
  `FITTING_KINDS`, the label stops compiling, delete it then.
  `server/teeBodyRole.test.ts` now takes its list from 0139 (C's same edit).
- Test: `server/migration0139.test.ts` — red on a DB at 0138 ("Data
  truncated for column 'runMaterialRole'", and the enum check), green after.
- **Next live release**: batch is now **0105–0139 (35)**, expect 140 and
  176/176; re-rehearse first (`next-live-release-plan.md` § 3).
- **Commit `2caf1f6`**: pushed to `staging` by hand, then `local-dev`;
  staging served it 22:59 UTC; drift "matches" 176/176 and **732/732
  totals unchanged** with the new code too. **Gate 37856771424 green**
  (test, deploy-staging, smoke). Local suite: 355 files, 5,936 passed.
- Local DBs at 140: `bidrender_local`, `bidrender_test_localdev`. Scratch
  `bidrender_staging_restore_0139` dropped.
- **Track C can now merge `c-per-foot-logic`**: take A's 0139 file and
  journal entry. Not checked: whether C's `drizzle-guard` clears after
  that — it lists branch commits touching `drizzle/`, and C's stand-in
  commit is one; it may stay red by rule until merged to local-dev.

## UPDATE 2026-10-08 (session 22)

**Where things stand.** Live = `24105ad`, 0000–0104, untouched. Staging =
`local-dev` = `27d5ca0` (+ this docs commit), migrations 0000–0138, no
migration this session.

- **Smoke step 10 flake FIXED — release blocker cleared.** Cause, in plain
  words: the TEST read the mark count before the sheet had loaded. After
  step 9's reload the tally says "0 marks" until the list arrives; step 10
  took that 0 as its start (step 8's mark was already there), its "one more"
  check was met by the old mark loading, and Ctrl+Z went in before the new
  mark was saved — so nothing was undone and it read 2. Same "Expected 0,
  Received 2" in all five red runs that day. **Not a redeploy** (local-dev
  Gate runs are already one queued concurrency group; none of the five
  overlapped another), **not an undo bug.** So no concurrency change was
  made — it would not have touched this.
- **Fix** (`e2e/smoke/flow.spec.ts`): start comes from the server and the
  screen must agree; the server must hold the new mark before Ctrl+Z; undo
  and redo are checked on screen AND server. Step 9 delays sheet 2's first
  mark list 6 s, so the window is forced every run. Old step 10 under the
  hold: red locally with the CI picture. New: 3/3 locally, Gate
  37845117225 green, then smoke re-run on staging **5 of 5 green**.
- **Two app findings logged, NOT fixed** (`todo.md` top): the tally states
  "0 marks" while loading; Ctrl+Z on a mark still saving does nothing and
  says nothing.
- Local `bidrender_smoke` (port 3018 smoke DB) migrated 105 → 139 to run it.

## UPDATE 2026-10-08 (session 21)

**Where things stand.** Live = `24105ad`, 0000–0104, untouched. Staging =
`local-dev` = `06791ea` (+ this docs commit), **migrations 0000–0138**.

- **Per-foot items M1–M4 BUILT and on staging** as **0135–0138**
  (`0135_run_type_extras`, `0136_bid_line_extras`,
  `0137_assembly_material_qty_source`, `0138_traced_parts`), all additive.
  Backup `staging-2026-10-08T19-09-32Z-before-0135-0138.sql` restored and
  counted; rehearsed on that copy; staging 4 applied, 176/176 FKs; **all
  651 staging bid totals unchanged** after the migration AND after the new
  code booted (`deploying.md` § 11 "0135–0138").
- **Seed content shipped with it:** ten `N" PVC Sch 40, underground` types
  (no wire, NULL counts) each with `Underground warning tape` (flat, 1.0) as
  an extra row; `700 series surface raceway, 2 #12 + ground`; seven 700
  fittings; `Surface raceway base, 700 series` → `Surface raceway, 700
series` (same id #1685 on staging) and the 700 cover retired (#1686).
  Clip spacing NULL; no Sch 80; 500 series untouched (owner Qs 1–3 open).
  The frozen-adds record moved through `shared/frozenAddsHeld.ts`
  (`SHIPPED_AS` + a new `retired` kind), NOT by editing
  `pricing/frozen-names.json`, which stays the owner's frozen sheet.
- **Picker fold built** (CLAUDE.md rule 3: ships with the types):
  `client/src/lib/runTypeFold.ts`, sorted by SIZE. Looked at locally.
  The homerun-type and drop-type SELECTS still list all 15 — not folded.
- **What is NOT built (C's server half, plan § 9 step 2):** the extras'
  footage — `feetForRole` in `server/db.ts` has an `extra` tripwire case
  answering 0 that C must REPLACE; the 700 fitting family (until then a 700
  run's fittings say "no catalog match"); `setExtraShared`; extras CRUD; a
  resolver for `takeoff_run_type_extras.materialId` (registered
  `unreviewed`, count 6 → 7 in `forkableReferences.test.ts`).
  `forkRunType` already copies extras (tested). **B's step 3** (DV34 drops
  the entrance end, GR2/GR5 `qtySource`) is NOT done — every part's
  `qtySource` is NULL; the 0136/0138 columns are written by nobody.
- **Pricing sheets**: still list the old 700 base/cover names; the loader
  folds old names through the rename map. Not rebuilt (owner typing).
- **Before the next live release**: 0135–0138 join the batch (now
  0105–0138); the 11 types and the rename ride with `06791ea`'s seed.
  Re-rehearse (`next-live-release-plan.md` § 5) — expect 34 applied, 139.
  If that differs, stop and find out why.
- **Gate on `06791ea` GREEN**: run 37833034148 — test, deploy-staging,
  smoke all success.
- Cleaned up: worktree `../bidrender-before-0135` removed, local DB
  `bidrender_staging_restore_0135` dropped. Local `bidrender_local` is now
  at 139 (was 105); `bidrender_test_localdev` at 139, seeded.
- **Local sign-in gotcha met this session:** a stale httpOnly
  `app_session_id` cookie on 127.0.0.1 outranks the Bearer header, so a
  freshly minted token still shows the landing page. Calling `auth.logout`
  from the page clears it.

## UPDATE 2026-10-08 (session 20)

**Where things stand.** Live = `24105ad`, migrations 0000–0104, untouched.
Staging = `local-dev` (`9d2d854` + later docs), migrations 0000–0134, Gate
green (run 37733963891). No Track A work is unfinished, and there is no WIP
branch.

- **Live release REHEARSED — passed.** `next-live-release-plan.md` § 5b:
  backup `2026-10-08T05-35-31Z` verified, recount 0, 0105–0134 = 30 applied
  in 4.5 s with no errors, 173/173 FKs, local-dev booted with 183 starters,
  0 held, both live bids unchanged. Throwaway copy dropped.
- **The release WAITS for three things** (owner): Track B's **white-box fix**
  (plan opens with a blank white box, `todo.md` "FIRST: the white box…"),
  Track B's **cover swaps** (starter recipes onto the new cover rows), and the
  **owner's tablet look at staging**. Then re-run the § 5 checks on the
  chosen candidate (a new commit means a new Gate, and if `drizzle/` has
  changed, a new rehearsal).
- **Before release: fix the flaky smoke step 10** ("undo and redo a mark",
  `e2e/smoke/flow.spec.ts:410`). Evidence is at the top of `todo.md`: three
  failures, all overlapping a staging redeploy or a second smoke on the
  shared account. Two possible fixes are named there: one concurrency group
  for smoke + the staging deploy, or a longer poll on step 10. The first
  addresses the suspected cause; prefer it unless it turns out not to.
- **Next build job: M1–M4 from `references/per-foot-items-plan.md`** (Track
  C's plan, owner-approved 2026-10-08; § 4 has the columns, § 8 the tests that
  must fail without it, § 9 the order). Numbered from **0135**. All four are
  additive (step 1) and go to staging BEFORE any code that reads them; they
  reach LIVE only with that code. If `ls drizzle/*.sql | tail -1` is not
  `0134_example_labor_rates.sql` when you start, stop and find out why.
  - M1 `takeoff_run_type_extras` (table); M2 `bid_line_items`: `extra` on
    `runMaterialRole` (append only), `runExtraKey` NOT NULL DEFAULT 0, the
    unique-index swap, `extraFeetPerFoot` NULL; M3
    `assembly_materials.qtySource` enum NULL; M4 `snapshotTracedParts` +
    `tracedPartAnswers` JSON NULL.
  - **Also the seed content in that plan:** the underground run types with
    warning tape as their extra, the seven 700-series fittings, the rename
    `Surface raceway base, 700 series` → `Surface raceway, 700 series`
    (through `RENAMED_BASELINE_MATERIALS`) and the RETIRE of `Surface
raceway cover, 700 series` (`RETIRED_BASELINE_MATERIALS`). The owner
    allows this rename and retire because those rows are not on live. The
    seed writes extras rows, so it needs M1 on the database first. Starter
    names and run types match by EXACT name: edit them in the same commit
    (plan § 5, CLAUDE.md).
- `pricing/` sheets: no change this session. The pricing and labor sheets
  may hold the owner's typing — never rebuild them without `--only`.

## UPDATE 2026-10-08 (session 19)

- **DV34 unlocked on `pricing/assembly-hours-starter.xlsx`** (B's `7641bb1`
  emptied its `missingParts`, which is all `heldNote` reads). Rebuilt with
  `--only assembly-hours --new-since <a019453's copy>`, so the 15 NEW marks
  stay; 0 HELD. Checked first: 0 MY HOURS typed. Loader dry run with 0.75 h
  on DV34 accepts it. Pricing and labor sheets NOT touched (owner typing).
- **Bare gang search mixes** (`mixGangLanes`, `shared/materialSearchRank.ts`):
  "1/2/3 gang", "double gang" take turns box → mud ring → plate; a row
  naming a different count goes last. With a noun the old ranking stands.
  7 guards red on the old code (`server/materialSearchRank.test.ts`).
  Not changed: a typed "2-gang" (hyphen) leads its box lane with "Raceway
  device box, 2-gang", not "Double-gang box" — that is the base ranking for
  the hyphenated form, older than this.
- Next live release planned: `references/next-live-release-plan.md`.

## UPDATE 2026-10-08 (session 18) — the cover family

- **103 cover rows added, catalog 1,715 → 1,818.** Adds only, nothing renamed or
  retired, no recipe changed. Spec: the owner's list (the audit,
  `references/cover-plates-audit.md`, arrived mid-session and asks for nothing
  the list lacks). Generators: `COVER_PLATE_FAMILY` (devices.ts) and
  `BOX_COVER_FAMILY` (boxes.ts, listed after the receptacles: raw search
  ties keep catalog order, and with the boxes "recep" led with a raised cover).
  Guard: `server/coverPlateFamily.test.ts` (builds the expected names itself).
- **New seed field `jobKind`** (Residential / Commercial / Both) for a row no
  starter uses; sheets only, never the database (`materialKind`).
- **DV34's plate ships** under its exact listed name; DV34 stays held until
  Track B adds the line and empties `missingParts` (todo.md, B's swaps).
- Pricing + labor-units sheets rebuilt (both checked empty first: 0 set).

## UPDATE 2026-10-08 (session 17)

- **local-dev = staging = `bea4d8f`**, which merges `c-homerun-footage` and
  `a-example-tags` and adds **0131** (`bids.homerunExtraBends`,
  `takeoff_runs.runsAt`). **Staging has 0000–0134 (135)**, applied before
  the code. **Live is unchanged: `24105ad`, 0000–0104.**
- Every staging bid total was unchanged across the migration and the new
  code's first boot. Gate run 37715026901 green (test, deploy-staging,
  smoke). Record: `deploying.md` § 11 "0125–0134".
- **On-screen was done LOCALLY, not on staging.** Staging's gate password and
  sign-up are not something this agent may enter. If the owner wants it seen
  on staging itself, they sign in (or run a check script themselves).
- Cleaned up: mirror branch `a-ci-c-homerun-footage` deleted; scratch DBs
  `bidrender_test_exampletags` and the two rehearsal copies dropped. B told
  its after-C fixes are unblocked; C told the two columns are live (nothing
  reads them yet, and C wires them).
- Live release: all of 0105–0134 together with their code, under the
  pairing rules in `live-release-plan.md`. Not scheduled.

## UPDATE 2026-10-07 (session 16)

- **Example tags BUILT on branch `a-example-tags`** (from local-dev
  `615f122`; NOT merged, NOT on staging). Migrations **0132–0134**
  (`migrations-next-batch.md` § Batch 5): apply ONLY together with, and
  AFTER, C's 0125–0131 from `a-batch-c-0125` — the migrator skips older
  `when`s.
- What ships: "Example price / hours / rate" tags on the bid screen (frozen
  per line), never on the proposal; a warning (not a block) before
  printing; a sky "example rates" banner on the Dashboard and the bid until
  every role is the shop's own; first-run shows the example and asks for
  their own; Labor rates shows wage + burden parts and edits them
  ("Build from wage"). Any real edit clears the tag; an untouched save does
  not.
- **New Helper role.** Field roles ship at the approved example loaded rates
  (Foreman $70.50, Journeyman $59.22, Apprentice $36.66, Helper $33.84 =
  wage × 1.41). Supervisor and PM stay unrated.
- Tests: `server/exampleTagsFlow.test.ts` (DB, 10) and
  `server/exampleTags.test.ts` (12); `starterValues.test.ts` now requires a
  shipped number to carry its tag. Red verified by breaking three pieces.
  Local scratch DB `bidrender_test_exampletags` — throwaway.
- Next step (owner): migrate C's batch and this one together.

## UPDATE 2026-10-07 (session 15)

- **"Example hours" decided** (owner): the price treatment, shipped with the
  hours, never alone. Plan § "Shipped HOURS" + Batch 5 columns.
- **Four starter sheets**, all built by `pricing/buildStarterSheets.mts`,
  all loadable by `pricing/loadStarterSheets.mts` (`--prices`, `--labor`,
  `--brands`, `--assembly-hours`; dry run unless `--write`), all with a
  "Residential / Commercial / Both" column:
  `pricing/starter-catalog-pricing.xlsx` (1,715),
  `pricing/labor-units-starter.xlsx` (1,715),
  `pricing/brand-variants-pricing.xlsx` (508; 11 left off, parent declined),
  `pricing/assembly-hours-starter.xlsx` (168, top-30 lists first).
- Everything loaded stays inert until its tag exists
  (`server/starterValues.test.ts`); brand prices also wait on
  `materials.parentId`.

## UPDATE 2026-10-07 (session 14)

- **Wafer variants renamed** `N" canless wafer LED downlight, <variant>` —
  the plain canless leads "N wafer" at every size (test pinned). **5"/6"
  disc and retrofit trim split** into 5" and 6": the combined rows became
  the 6" (same ids). On staging only the trim was used — 3 starter recipe
  lines, all 6" jobs; 0 company copies, 0 bid lines.
- **Example loaded rates APPROVED** (plan § 3b): still in Batch 5, shipped
  only together with `isExampleRate`.
- **File loader BUILT**: `pricing/loadStarterSheets.mts` → the seed
  (`server/seed/materials/starterPrices.ts`, `starterLaborUnits.ts`, empty).
  Labor hours now re-stamp on shipped rows like price. Inert until tagged —
  `server/starterValues.test.ts`.
- **Sheets for the owner**: `pricing/starter-catalog-pricing.xlsx`,
  `pricing/labor-units-starter.xlsx` (`pricing/buildStarterSheets.mts`,
  1,715 rows, most-used first, pack price, no store/date).
- Open: how shipped labor HOURS say "example" (todo.md).

## UPDATE 2026-10-07 (session 13)

- **Adds on staging (`f440576`), CI full suite + deploy + smoke green.**
  Staging 1,554 → **1,713** (159 added, 0 deleted, 0 renamed), every
  reference identical, the 227 earlier bid lines identical (full-row hash),
  LT8 #871 / LT7 #872 on the 4" / 6" canless wafers. **VERDICT CLEAN.**
  Second restart: measured on the docs push after it (see the plan file).
- **Owner's answers applied:** 3-1/2" full family for EMT + PVC Sch 40;
  150–200A two-pole + 100–200A main breakers; every wafer / canless size
  2"–8" its own item (+ slim, gimbal, wet, CCT) and CCT discs 4"–7";
  "Surface raceway (wire mold), low voltage"; "wire mold"/"wiremold" on every
  surface raceway item. Declined: QO-only 60A/70A. 143 of 153 frozen adds
  ship; 8 duplicates; `shared/frozenAddsHeld.ts` has every reason.
- **Open owner questions** (todo.md): "6 wafer" lists the four variants before
  the plain canless 6"; the plain 5"/6" disc and 5"/6" retrofit trim are
  still one row for two sizes.
- **Part 2 plan:** `references/starter-vs-company-plan.md` — what reaches
  every account vs one company; file loader now, admin screen later;
  example LOADED labor rates (columns in Batch 5, no migration).
- CI caught two things the local subset could not: the British "colour" in
  a search word, and a typo test that used 175A as "a size we do not ship".

## UPDATE 2026-10-07 (session 12)

- **The rename is on staging** (`47f0942`): backup first, then merged, Gate +
  deploy + smoke green, and staging checked directly — **VERDICT CLEAN**
  (`materials-review-sheet-plan.md` § Order, step 8).
- **The adds:** 86 of 153 seeded; 8 duplicates of shipped rows; **59 held
  for the owner** with reasons in `shared/frozenAddsHeld.ts`. The three new
  wire items ship with "Copper" (owner). The new shelves need **0117** — on
  staging, NOT live: pairing rule 4 in `live-release-plan.md`.
- **Search fix that came with them:** the head noun of a wire is the word
  before its metal (`queryTier`) — "ser" had led with Service mast.
- **Correction:** the session-11 rehearsal's "209 bid lines byte-identical"
  used a `GROUP_CONCAT` digest truncated at 1,024 bytes. Staging was
  checked with a full-row hash instead.
- **Track C 0131** planned (not written, not merged): `bids.homerunExtraBends`
  - `takeoff_runs.runsAt`, nullable, no DB default — "default 1,
    unconfirmed" is NULL read by C's code. Batch 5 moves to 0132.
- **Track B told** (todo.md): names frozen, load the drafted starters by
  part key with final names.
- **Open for the owner:** the 59 held adds (four questions, in
  `frozenAddsHeld.ts`).

## UPDATE 2026-10-07 (session 11)

- **STOPPED BEFORE STAGING, as asked. The rename is on branch `a-rename`
  (`3a6423e`), NOT on local-dev** — pushing local-dev deploys staging, and
  the rename runs on a server start. Gate on `a-rename` green (no deploy).
  To ship it to staging (owner's OK first): back up staging, merge
  `a-rename` into local-dev, push, then re-run the compare against staging
  (`materials-review-sheet-plan.md` § Order, step 9).
- **On local-dev and staging (`a0ac3f6`, Gate + deploy + smoke green):** the
  names freeze (`pricing/frozen-names.json`, read back by
  `pricing/readMaterialsReview.mts`), the root fix for case-only name twins
  (`server/seedNameCase.test.ts`, red on the old code), the size reader for
  `5/8" x 8 ft`, and the multi-supplier answers (plan only).
- **Rehearsed on a local copy of staging's data: VERDICT CLEAN** — 151 rows
  renamed by id, nothing added or deleted, all 839 starter lines and the run
  types' wire on the same ids, 209 saved bid lines byte-identical, a second
  boot changes nothing; 257 of 258 old spellings find the renamed row first.
- **Next for A:** owner's OK for staging; then the 153 adds (todo.md); then
  regenerate the pricing sheet (naming plan § 5.1).
- `fe2d3c0`'s Gate rerun: tests green; its deploy step correctly refused
  (staging had moved past it). Every later run includes it.

## UPDATE 2026-10-07 (session 10)

- **Size reader landed** (`d86043b`, local-dev): 12/2, #3/4, bare 1/0 and
  22 AWG read; the current names are unchanged.
- **Sheet:** the owner's second answers are marked. Measured: 151 renames,
  153 adds, 0 shipped rows cut, all Excel warnings 0.
- **Name-lookup audit and the freeze/rename ORDER** are in
  `materials-review-sheet-plan.md` (approved in session 11).
- **Wafers:** 4" → `4" canless wafer LED downlight` and 5"/6" → `6" canless
wafer LED downlight`, both renamed in place. LT8 and LT7 follow through
  their ids; LT7 is the only user of the 5"/6" row.

## UPDATE 2026-10-07 (session 9)

| What              | State                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review sheet      | `pricing/materials-review.xlsx` now has a **Possible duplicates** tab (1 pair: `2" riser strap` / waiting `Riser strap, 2"`) and a **typical-job completeness pass** on Missing (13 likely-missing items, pre-filled Add, each hand-checked; 9 first-pass false "missing" corrected). Still waiting for the owner to mark it.                     |
| Example price     | Owner rule recorded: plain "Example price" tag, no store, no date, cleared on a shop edit — CLAUDE.md, `migrations-0098-batch-plan.md` B3 (overridden), Batch 5 now `isExamplePrice` + `snapshotPriceWasExample`.                                                                                                                                 |
| Track C's columns | **0125–0130 on branch `a-batch-c-0125` only** (not local-dev, not staging): `bid_panels`, `bid_panel_circuits` (incl. `homerunCeilingInches`), bid + sheet homerun settings, `takeoff_run_circuits.panelCircuitId` / `conductorSource`, `bid_height_areas`. Pairing rule 3 in `live-release-plan.md`. Renumber if anything else is applied first. |
| Multi-supplier    | Plan only: `references/multi-supplier-plan.md` (suppliers, supplier_prices, imports; default supplier on pricing_defaults, per-bid on bids; frozen snapshotSupplierId + snapshotPriceParts; no auto-pick; 4 owner questions).                                                                                                                     |

## UPDATE 2026-10-07 ~02:30 UTC (session 8)

| What              | State                                                                                                                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live**          | Unchanged: `24105ad`, 105 migrations. Only a READ-ONLY count was run (below).                                                                                                                                                                                                           |
| **Staging**       | **`2f469e5`**, database **125 migrations**. Green: tests, deploy-staging, smoke (run 37559170943).                                                                                                                                                                                      |
| **local-dev**     | `2f469e5` = everything below + **B's Labor-only tick and reading code** (`d8a0235`).                                                                                                                                                                                                    |
| Pairing rules     | **Both now met on local-dev**: 0105–0106 + B's rule + tick + reading code; 0122–0123 + B's hours code. `live-release-plan.md` (top) says what to re-check on the day. LT1/LT2 repair still NOT on live as written.                                                                      |
| Live-recipe lines | **Live: 0** (read-only session, 2026-10-07 — live has 0 assembly lines at all). Checklist line added: recount before release; must be 0, otherwise freeze first.                                                                                                                        |
| Review sheet      | **Built: `pricing/materials-review.xlsx`** — 1,679 rows, 146 proposed names, 20 "Your call", 85 missing + 25 blank, 5 questions. Opened in Excel, warnings tested. **Waiting for the owner to mark it**; then the read-back (`readMaterialsReview.mts`, not written) freezes the names. |
| Open risk         | `todo.md` "WRONG-NUMBER RISK: older bid lines read their assembly's recipe LIVE" — report only.                                                                                                                                                                                         |

## UPDATE 2026-10-07 ~01:10 UTC (session 7)

| What          | State                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Live**      | Unchanged: `24105ad`, 105 migrations. **Not touched.**                                                                                                                                                             |
| **Staging**   | **`932cb53`**, database **125 migrations** (0105–0124 applied 00:16 UTC; backup `staging-2026-10-07T00-13-36Z-before-0105-0124.sql`, restored and counted). Gate + deploy-staging + smoke green (run 37553791194). |
| **local-dev** | `932cb53` = the batch + slow-request logging (`3a173a0`, its own green run 37550736540) + the Assemblies-screen fix (29 starters in the two new shelves were hidden; found on the staging spot-check).             |
| Spot-check    | Staging Assemblies screen: 167 starters, 7 shelves incl. Demo & Retrofit (20) and General (9); every new starter "hours not set"; the original 8 show their hours; none 0.                                         |

Note: Track C's run 37552978452 (`722ca8f`) went red at deploy-staging only
because `staging` had been pushed by hand to a newer commit (§ 11 step 3);
its tests passed and its code is in `932cb53`.

## Where everything stood (checked 2026-10-06, ~21:05 UTC)

| What          | State                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live**      | **`24105ad`** (built 20:40:38 UTC). Database: **105 migrations** (0000–0104), schema matches, foreign keys 141/141. Released with the owner's approvals A–D. Backup just before: `2026-10-06T20-03-57Z`.      |
| Live email    | Live `RESEND_API_KEY` (`bidridge-live`) is in; **password reset works on bidridge.com** (owner).                                                                                                              |
| `main`        | `24105ad` (= live). Pushing `main` deploys; only with the owner's yes.                                                                                                                                        |
| **Staging**   | `cdf1bb7` when checked; it follows `local-dev` again (auto-deploy ON, `STAGING_AUTODEPLOY` unset). Database: 105.                                                                                             |
| **local-dev** | `8e9a475` plus this commit: everything on live, plus Track B's labor rule (`5c98bd1`), C's tie-labels / CAD layers / demolition plans, the reset early-check (`6518fc5`), and docs. No migration beyond 0104. |
| Tracks B, C   | **May merge into `local-dev` again** (they were closed for the release window).                                                                                                                               |

## What is queued, in order

**All three DONE 2026-10-06 (session 6)** — see `todo.md` § Flaky tests:
blank Plans was a real bug (an unbounded read batch; plus a failed list drew
"Drop plan PDFs here"); the "flaky undo" was a slow count-create, and its
reload path lost marks silently; and chasing it found a real short count
(a click between the server's answer and React's re-render, flow 5).
`touch.spec` is stable (0 failures in 18 executions since `24105ad`). The
original entries follow for the record.

1. **The blank Plans screen after a reload: MUST INVESTIGATE FIRST**
   (owner). Smoke flow 9 failed once on the `24105ad` candidate (run
   37512445462 attempt 1): after `page.reload()` the screen stayed blank for
   60 s, with the title "Plans" and no bid name. Attempt 2 passed. Treat it as
   a possible real bug: a person who reloads and sees nothing would think
   their plans were gone. `todo.md` § Flaky tests has the detail. Start from
   what the Plans screen waits on after a reload.
2. **`touch.spec`** (owner-queued). Its 2026-10-06 fixes force two timings
   (rows created late, `ensureSheets` held; the first mark list answered with
   pre-save data). Check that it is stable in CI over several runs, and that
   the route holds cannot starve a refresh (the first version did; it was
   narrowed to ONE call each).
3. **The flaky undo** (owner-queued). **No written record of it was found**
   in `todo.md`, the references or the handoffs (searched 2026-10-06). The
   likely candidate is smoke flow 10, "undo and redo a mark; delete one and
   Undo brings it back". Find the failing run first and write it into
   `todo.md` § Flaky tests before changing anything.

## The next live release

**Contents:** `assemblies.laborOnly` + `bid_line_items.snapshotLaborOnly`
(migrations **0105–0106**) with Track B's `laborOnly` code, **Track B's
"labor with $0 material is not priced" rule** (already on local-dev), Track
C's tie-labels and CAD layers, and the reset early-check.

**The one rule:** B's labor rule must never reach live without 0105–0106
and B's code. The priced print refuses a not-priced line with no way past,
and nothing else clears a labor-only line (`live-release-plan.md` § 0).

**Before the window:** write and rehearse 0105–0106 (additive, step 1);
B builds the reading code (`lineMaterialNotPriced` and its SQL copy read the
line's frozen `snapshotLaborOnly`; a "Labor only" tick in the assembly
editor). Then a green staging smoke on the exact candidate commit. If the
candidate is not the `local-dev` tip, use the one-off `a-smoke-<commit>`
branch method in `live-release-plan.md` § 0. Run `bidTotals.mts` before and
after (§ 1b): with B's rule in, a not-priced rise on labor-with-$0-material
lines is labelled EXPECTED, and any total that moves is a FAIL.

## Migrations — ONE list

`references/migrations-next-batch.md` (also on `a-migrations-plan`, now
merged here). None written. In deploy order:

| #         | What                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0105      | `assemblies.laborOnly` — **next release**                                                                                                 |
| 0106      | `bid_line_items.snapshotLaborOnly` (frozen, A's pick) — **next release**                                                                  |
| 0107      | `signup_invites` (invite gate)                                                                                                            |
| 0108      | AI correction log (+ C's `askKind`, `askFingerprint`)                                                                                     |
| 0109      | `bid_pdf_sheets`: `contentHash`, `distributionHeightInches` (C + B)                                                                       |
| 0110      | `assemblies`: remove/relocate hours, `mountHeightTypeKey`, `materialByQuote`                                                              |
| 0111      | `takeoff_groups`: remove/relocate hours (per-bid override)                                                                                |
| 0112      | `takeoff_stamps.labelWords` (C)                                                                                                           |
| 0113      | `symbol_looks.confirmedAt` (C)                                                                                                            |
| 0114      | `bid_quotes` table (B)                                                                                                                    |
| 0115      | `bid_line_items`: `lineRole` (NOT NULL DEFAULT `install`, unique-key swap: read twice) + the six quote columns incl. `bidUnitCost`        |
| 0116      | `pricing_defaults.quotedMarkupPct` (B)                                                                                                    |
| 0117–0123 | catalog batch (C), incl. `locknut`/`bushing` (0118: the "wire size not set" rule is code on top)                                          |
| 0124      | `bid_pdf_legend_entries` (+ `lookId`)                                                                                                     |
| 0125+     | before the priced sheet (brand lines, `bid_panels`, example prices)                                                                       |
| step 3    | fold "EXISTING TO REMAIN" twins into `status` (moves totals on purpose, after its code is live); clear the 8 starters' hours (after 0123) |

Decided 2026-10-06 (reversible, nothing written): **one panel table**,
`bid_panels` + `bid_panel_circuits` (C's `panel_schedules` not built);
**quotes = B's quote items**, H1 `quoteBucket` dropped. Not numbered, with
reasons: the `symbol_links (userId, lookupKey)` unique key (live has 0 rows
today, so it is safe there; check again when written), addenda
`supersedesId`, the scan decision log, `fixtureTag`.

**If `ls drizzle/*.sql | tail -1` is not `0104_run_end_connect.sql` when you
start writing, stop and find out why before writing anything.** Either this
list is stale or the repo is not where you think it is.

## Owner decisions recorded this session (all in `owner-questions.md`)

- Q1: breakers say **"1-Pole"**, breakers only. **Not renamed yet**: the
  rename waits for the other naming questions. Search already finds every
  pole spelling.
- Q2: remove/relocate labor lines; hours on the assembly with a per-bid
  override; unset = "not priced" (`remove-relocate-labor-plan.md`).
- Q3: a run ending on an existing device prices its drop, with "Leave it
  off". **Built by Track B.**
- `laborOnly`: yes (starters that are labor-only ship marked; none today).

## Before beta (`todo.md` § "Before beta: sign-in protection")

Block known-leaked passwords; limit repeated wrong sign-ins; **refuse a new
password equal to the current one** (no password history).

## Worth knowing

- Every `[email]` / `[auth] password reset` line in the Runtime Logs says
  why a send stopped. The staging failure was an invalid Resend key, and
  Resend shows no trace of such a request (`deploying.md` § 11).
- `gh` is installed and signed in as Jnicoara. Reload PATH in a new shell,
  or call `"/c/Program Files/GitHub CLI/gh.exe"`. CI screenshots now upload
  (`include-hidden-files`).
- The local `bidrender_local` and `bidrender_test_clean` are at 105.
- Laptop memory runs short: background watchers get killed. Prefer
  foreground checks, and keep one server at a time (ports 3000/3002/3004).
- A stale agent worktree remains at `.claude/worktrees/agent-a02fd66b3ea7af9ae`
  (`a-materials-plan`). Safe to remove with `git worktree remove`.

## SHORT SUMMARY

- Live = `24105ad` with 105 migrations, released with approvals A–D;
  password reset works on live with the `bidridge-live` key.
- Queue: blank Plans after reload (investigate first, maybe real), then
  `touch.spec` stability, then the flaky undo (find its record first).
- Next release: 0105–0106 `laborOnly` + B's code + B's labor rule (never the
  rule alone) + C's tie-labels/CAD layers + the reset early-check.
- One migration list: `migrations-next-batch.md`, 0105–0125+, none written.
- B and C may merge into `local-dev` again; staging follows it.
