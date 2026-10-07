# Track A handoff — 2026-10-06, after the live release

Written for a restart. **Read this first.** The session-by-session history
it replaces is in git (`git log -p -- references/track-a-handoff.md`); the
release record is `deploying.md` § 11 "LIVE: `24105ad`".

## UPDATE 2026-10-07 (session 13) — read this first

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
