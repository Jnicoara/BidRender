# Track B handoff — 2026-10-05

## WHERE B STANDS — 2026-10-09 (later), coverage-check starters BUILT (READ FIRST)

- **41 new starters, 224 in all.** CK1–CK26 are every missing assembly in
  the first coverage check (owner: all 26, not 10; duplicates once). CW1–CW15
  are the wider check's top 15. Source: `references/coverage-check.md` on
  track-c. Hours not set, R/C/B tags as the document gives them, every part
  a shipped row (A's 24 rows filled the gaps). Recipes:
  `starter-assemblies-plan.md` § "CK / CW".
- **Changes to existing starters, names unchanged:**
  - RS12 → `4/3 NM-B Copper` (was 6/3);
  - LT23 + `Fixture hanging kit, aircraft cable` 2 (support wire kept);
  - RS6 stays the range hood; the microwave is CK18.
- **Older databases get RS12/LT23 from the cover repair.** They are two
  more entries in `STARTER_COVER_SWAPS`; the seeder never edits a starter.
- **Track A, at the release (staging and live), no migration:**
  1. `scripts/repairStarterCovers.mts`, report then `--apply`. Expect RS12
     and LT23 "would swap" and the other 48 "already has it" where the
     repair already ran. If it prints anything else, stop and find out why.
  2. Bid totals before and after with `scripts/bidTotals.mts --compare`.
     None may move.
  3. The 41 starters need nothing: the seeder inserts them on boot.
  4. Then the ONE `assembly-hours-starter.xlsx` rebuild (41 NEW rows).
- **Measured locally** (`bidrender_local_b_new`): boot seed took shared
  starters 183 → 224; the repair swapped RS12 and LT23; then 49 "already
  has it"; all 4,284 bid totals unchanged (`bidTotals --compare`).
- **Tests:** `server/coverageCheckStarters.test.ts` (new), plus updated
  counts and repair checks. With the HEAD seed files swapped in, 50 tests
  failed in 3 files; with the change, all pass.
  - `starterCoverSwaps.test.ts` banned the duplex raised cover outright.
    The audit's fault was that cover on a twist-lock, and CK12 (ceiling
    projector duplex) uses it rightly. The test now checks that the cover
    only covers a duplex receptacle.
  - `starterGapAssemblies.test.ts` allows CK4 as a second user of the 6"
    wafer.
  - Pinned lists that grew with the new starters: specialty-row users
    (+7, `catalogReview20261008`), wire-nut users 114 → 133, and the
    Mounts-at list (+CK9, `deviceMountKind`).
  - Full suite on `bidrender_test_b`: 374 files, 6,230 passed, 6 skipped.
- **Owner questions** (missing labels, recipe choices): todo.md §
  "Coverage-check starters".
- **Staging cleanup:** the two `track-b-race-*` accounts are now on the
  delete-before-stress-test list.
- **Merged into local-dev as `09b0294`** after track-b Gate 37983660993
  went green (merged tree: 375 files, 6,235 passed). The local-dev merge
  had one conflict, CHANGELOG.md (both entries kept). The local-dev Gate
  (staging deploy and smoke) was not watched to the end; check it.
- **State:** merged local-dev (A's 0141). B's databases are at 142 and
  `schemaDrift` matches (176/176). No migrations by B. No dev server running.

## WHERE B STOOD — 2026-10-09, smoke test 2 PROVEN + "Fix these" walk + gap 10

- **Smoke test 2 (empty sheet list after a first upload): release blocker
  CLEARED.** The 2026-10-08 fix was only half: a re-run on Gate
  37883298465 (attempt 3) failed test 2 with nothing deploying. A staging
  probe reproduced it 2 of 12, and its network log showed the cause. The
  set's FIRST sheet read was in flight when `ensureSheets` answered, and
  React Query folds an invalidate into a running fetch when the query has
  no data yet, so no second read was sent. Fix `11f5466`: cancel, then
  invalidate (`client/src/lib/refetchPastInFlight.ts`; its test pins the
  trap against a real QueryClient and goes red without the cancel).
- **Proof after the fix:**
  - Staging probe on `71f9f82`: **0 of 24 failed**. All 24 had the first
    read racing the insert, and every one re-read afterwards.
  - **Test 2 passed in all 10 smoke runs since:**
    - Gate 37960082974 (`71f9f82`): first run + re-runs 2–4;
    - A's Gates 37962455841 and 37967963402;
    - Gate 37970377380 (`f058ab5`): first run + re-runs 2–4.
  - 8 of those 10 smoke JOBS were fully green. The other 2 failed on
    DIFFERENT tests, with no deploy running:
    - **screens / Proposal, tablet-landscape** (37960082974 attempt 4): the
      network-idle wait had no bound and one request never came back.
      Bounded at 15 s and made to name what is pending (`739eae6`). No
      warnings in the 4 runs since. Which request hung is not known.
    - **flow test 5** (37970377380 attempt 2): clicking CI SWITCH in the
      Legend did not arm its count, so the forced-race hook never fired.
      Not caused by B's changes (nothing touches the legend or arming).
      Cause NOT found (`trace: "off"`). In todo.md for whoever owns the
      legend.
- **Built: the "Fix these" walk and gap 10** (`88feaf9`). Six bid warning
  boxes have "Fix these N", which walks the "Fix this line" panel one line
  at a time ("Line 2 of 5", Skip; Save goes to the next, Cancel ends it).
  Each line in the Proposal's print block opens
  `/bids/:id?fix=<lineId>` with that line's fix open. Tests red on the old
  code. Seen on screen at 1536x864 and 820x1180. todo.md § "Fix this line".
- **State:** `track-b` = `local-dev` at `f058ab5` + this docs commit. B's
  databases are at 141 and `schemaDrift` matches (176/176); A's new rows
  are seed, not migrations. No migrations by B. No dev server running.
  Leftovers:
  - staging: one more `track-b-race-*@example.com` per probe run (2 runs),
    their plan sets removed and bids archived;
  - local only: throwaway "B walk check …" and "B race probe …" data in
    `bidrender_local_b_new`.

## WHERE B STOOD — 2026-10-08, Won/Lost ask first + smoke race fixed

- **Smoke (local-dev Gate 37879795728) FAILED at test 2**: after a first
  upload the sheet list stayed on "Sheets appear here once the document
  opens", so no "1/2 scaled". A real race from Gap 6.1, not the test:
  `useMutation` takes new options in an effect, a parent's effects run after
  its children's, and the viewer re-announces a just-attached set from its
  own effect in the commit the row first appears — so `ensureSheets` ran
  with the previous render's `onSuccess` (`doc` null) and the sheet-list
  refresh was skipped. When the list's first read beat the insert, nothing
  ever refetched it. A staging probe passed (the read lost the race that
  time). Fix: `ensureSheets` refreshes by the id it SENT
  (`TakeoffPage.tsx`). No vitest can reach this (component); **proof is the
  next local-dev smoke run**: test 2 must be green.
- **Owner decision, "Fix this line":** only a LOCKED bid refuses. Won/Lost
  ask "This bid is marked Won/Lost. Changing it changes a price you may
  have already sent. Change anyway?" (Continue / Cancel, focus on Cancel).
  Server refuses until `changeClosedBid` is sent, so a forgotten question
  cannot change a sent price. Tests: 6 changed/new in
  `server/fixLine.test.ts`, all red on the old code (run in a HEAD worktree
  with the new tests). On screen at 1536x864 and 820x1180: asked, Cancel kept
  the typed value, Continue fixed the line ($63.99 → $83.49). Recorded in
  todo.md and `references/never-stuck-plan.md`.
- **Leftovers** listed in todo.md's staging-cleanup item: one more
  `track-b-upload-*` account (the probe), and local-only "B fix-line
  check" data plus local smoke account `b-smoke-local@example.test`
  (`.env.test.local` in B's worktree, git-ignored, points at it).
- **State:** no migrations. No dev server running.

## WHERE B STOOD — 2026-10-08, "fix this line" (gap 11) BUILT

- **Built (c), the "fix this line" panel.** Assembly and run lines with a
  gap show "Fix this line", and their amber words open it too. It prices $0
  parts, picks a material for a line with none, sets hours, picks the role,
  and prices or sets hours on a traced part. "Also save to my library" is ON
  by default. Other lines are only offered. Locked, Won and Lost bids refuse
  the line and still take the library half. No migration. Details, decisions
  and gaps: todo.md § "Fix this line"; the plan's gap 11 note.
- **Owner to confirm:** "sent" is read as Won or Lost, since the schema has
  no Sent status (Active is still editable).
- **Tests:** `server/fixLine.test.ts` (21) and
  `client/src/lib/fixLineDraft.test.ts` (9), each guard seen red when
  removed. On screen at 1536x864 and 820x1180, all pass; looking found one
  fault (the "update other lines" offer vanished) and it is fixed.
- **Gap 6.1 on staging (`fa0c697`):** sheet 1 drawn 1.51 s after picking a
  6.6 MB set; the upload finished at 2.2 s. 0 MB pulled back.
- **Local leftovers:** throwaway "B fix-line check …" bids, assemblies and
  materials for user 1 in `bidrender_local_b_new` (local only). One more
  `track-b-upload-*` account on staging.
- **Next:** gap 10 (print block jumps to the line's fix) and the strips'
  "Fix these" walk.
- **State:** no migrations. No dev server running.

## WHERE B STOOD — 2026-10-08, owner cover decisions + batch 3

- **Cover decisions DONE (`efe06c6`).** Nylon stays. RS1/RS2: the BOX was
  wrong (no 2-gang power plate; RS1's 6/3 overfills a 1-gang box) → owner
  chose a 4-11/16" box + 4-11/16" raised cover, 30A/50A. RS13 (outdoor) +
  `Weatherproof in-use cover, 30A/50A power receptacle`. In the SAME repair
  script; it now also recognises a database that already ran the first
  swap (`interim`). **Track A: still report, then `--apply`, on staging and
  live at the release** — nothing else changed for A. Staging copy
  (before-0139 + 0139): 48 swapped, rerun 48 "already has it", all 732 bid
  totals unchanged; scratch DB dropped. B's local DB took the interim path
  (3 swapped). Tests red without the fix.
- **Batch 3 DONE.** Gap 3: marking a bid Won offers "Lock this bid?" (bid
  screen; never locks itself; "Not now" equal and focused). Gap 6.1: a
  first upload previews from the file in ~1.5–1.9 s; uploaded sets keep
  reading from disk; attach does not reload. Details and what was seen on
  screen in todo.md. Throwaway local bids "B 6.1 preview check …" (user 1,
  `bidrender_local_b_new`) were left; the lock check restored its bid.
- **Track A, re the live rehearsal in `ee7576c`** (cover repair "5 swapped
  - 43 already"): with this change, RS1/RS2/RS13 will now report as
    "would swap" there too — from the old recipe, or "first cover swap's
    recipe" where the first swap already landed. Expected; still report,
    then `--apply`, then bid totals.
- **Merge note:** local-dev's TakeoffPage conflicted with C's RunsPanel
  changes (my preview wrapper re-indented that block). Resolved by taking
  C's block verbatim and re-wrapping; `git diff -w origin/local-dev`
  shows only B's changes (212 lines, the same as B's own diff).
- **local-dev Gate 37868193507 went red at SMOKE** (test and staging
  deploy green): the smoke helper `uploadFixturePlan` waited for the sheet
  canvas, which Gap 6.1 now draws from the file BEFORE the attach, so
  `beforeAll` closed the page mid-upload and the phone-panel test found an
  empty bid. Fixed in `e2e/smoke/helpers.ts` (waits for `confirmAttach`).
  Worth knowing generally: **a drawn sheet no longer means a saved set.**
  **The smoke fix is NOT yet proven on staging:** the last local-dev run
  (37873032008, `a748e96`) passed TEST, but deploy-staging was refused
  ("staging has commits local-dev does not" — A's hand push for 0140), so
  smoke did not run. First local-dev run after A reconciles staging must
  show smoke green, the phone-panel test included.
- **Next:** (c) the "fix this line" panel. Optional: staging timing of 6.1
  with `scripts/stagingUploadTiming.mts` once it is on staging.
- **State:** no migrations. No dev server running.

## WHERE B STOOD — 2026-10-08, cover swaps + "still saving"

- **Cover swaps DONE (release blocker).** 48 starters, old → new cover
  lines in `server/seed/starterCoverSwaps.ts`, recipes changed to match.
  Nylon throughout. Nothing missing from the catalog, so nothing for A to
  add. **Track A: run `scripts/repairStarterCovers.mts` (report, then
  `--apply`) on staging and live at the next release** — the seeder never
  rewrites an existing starter. It swaps a FORKED shared starter too (the
  fork is never touched), unlike the LT1/LT2 repair; reason in
  `server/starterCoverRepair.ts`. Rehearsed on a local copy of staging
  (`before-0139`): 48 swapped, rerun 48 "already has it", 732 bid totals
  unchanged ($20,333.43 both sides, `bidTotals --compare`). Scratch DB
  dropped. Owner notes are in todo.md (RS1/RS2 box size, RS13 in-use,
  stainless).
- **"Still saving" DONE:** Ctrl+Z (and every undo control) while a mark is
  in the queue says "Still saving — try again in a second.", takes nothing,
  and flushes the queue. `client/src/lib/undoWhileSaving.test.ts`.
- **On screen, laptop 1536x864 and tablet 1180x820, both pass:** DV1 in
  the assembly editor lists "1-gang wall plate, duplex, nylon"; with the
  drop held 5 s the message showed, then undo after the save took the
  mark back (6 → 7 → 6). Throwaway probe deleted. It left an empty "20A
  duplex receptacle" count on bid 1728350 (local `bidrender_local_b_new`
  only), and that DB has the cover repair applied.
- **Gap 3 DECIDED by the owner (batch 3, not built):** when a bid is
  marked Won, OFFER "Lock this bid?" — never auto-lock, "Not now" just as
  easy.
- **Left for batch 3:** Gap 6.1 and Gap 3. Then (c) the "fix this line"
  panel.
- **State:** merged A's 0139 (`elbowFlat`) from local-dev; B's databases
  migrated to 140 and `schemaDrift` matches (176/176 FKs). No dev server
  running.

## WHERE B STOOD — 2026-10-08, after batch 2

**Batch 2 of 3 is built** (undo), details ticked in todo.md:

- **Gap 4a:** the undo arrow reads "Can't be undone: …" after any of 19
  changes undo does not cover (`NOT_UNDOABLE` in `undoStack.ts`). The first
  press says so and names the older step; the second press takes it.
  `notUndoableWired.test.ts` fails on any Plans-screen mutation that
  neither pushes a step nor notes itself.
- **Gap 4c:** run type (and respecify), typed length, add/change/remove
  circuit, and add leg are undo steps with redo. Server: `asUndoStep` in
  `takeoffRunsRouter.ts`; `server/runEditUndo.test.ts`.
- **Found and fixed:** adding legs to a FINISHED run left a "run finished"
  step whose undo deleted the whole run (`commit` now says `wasCommitted`).
- **Gap 4b was NOT fixed by batch 1.** Seen on screen: the other sheet still
  showed "0 marks" before "2 marks". The invalidate only marked closed
  sheets stale; `EVERY_SHEET_REFETCH` now refetches them.
- **On screen, laptop 1536x864 and tablet 1180x820, ALL PASS:** 4b (no 0
  frame), 4c (70→120→70→120 ft; wire 210→350→210; circuit out and back;
  type out and back), 4a (message, nothing moved, second press 90→70 ft).
  Driven with a throwaway playwright script on `deviceAudit.mts` helpers
  (deleted after). It left ~8 throwaway "B batch 2 undo check" bids for
  user 1 in `bidrender_local_b_new`, local only.
- **Not seen on screen:** a leg added with the trace tool (server-tested).

**Left for batch 3:** Gap 6.1 (open the viewer from the local file while
it uploads) and Gap 3 (won bid offers "lock it?" once; owner's call first).
Then (b) the cover swaps and (c) the "fix this line" panel, as below.

**State:** no migrations. B's databases are still at 139. Full suite before
the last 4b change: 354 files, 5,930 passed, 6 skipped; the touched files
after it: 116 files, 1,393 passed. `pnpm check` clean. No dev server running.

## WHERE B STOOD — 2026-10-08, after batch 1

**Batch 1 of 3 is built**, details in todo.md (each item ticked there):

- **The white box on plan open is fixed.** `planCanvasStep` in
  `client/src/lib/planLoadState.ts` clears the drawn page and size when a
  load starts.
  - Locally at laptop and tablet: FLASH without the fix, "No flash" with
    it.
  - The local run needs `RENEW_HOLD_MS=14000 BASE=http://127.0.0.1:3002`.
    At 5 s the renewal lands before sheet 1 is drawn, so it cannot fail.
  - **Staging (serving `06791ea`, which contains it): "No flash" at
    laptop and tablet.** Sheet 1 was drawn at ~9 s and the renewal landed
    at ~10.5 s, so the walk was able to fail. On 2026-10-07 it printed
    FLASH.
- **Gap 2:** `setLocation` now checks the lock.
  `server/runMutationsCheckLock.test.ts` fails on any run mutation that does
  not check it.
- **Gap 4b:** undoing a count delete refreshes every sheet. It is NOT seen
  on screen yet; look at it in batch 2.

**Left for batch 2 (undo):**

- Gap 4a: "can't be undone" on the undo arrow.
- Gap 4c: undo for run type, typed length, circuits and legs.
- The on-screen look at 4b.

**Left for batch 3:**

- Gap 6.1: open the viewer from the local file while it uploads.
- Gap 3: a won bid offers "lock it?" once. Owner's call first (plan Q2).

**Then (b) the cover swaps and (c) the "fix this line" panel**, as below.

**State:**

- `track-b` = `origin/local-dev` at `06791ea` plus this handoff commit.
- B's databases are at 139 (0135–0138 from A), and `schemaDrift` says
  both match.
- **The local-dev run for `14fead9` went red at deploy-staging only.** Its
  tests passed. The deploy was refused because Track A had pushed staging
  by hand (0135–0138). That staging push (`06791ea`) contains B's commit,
  so staging runs it anyway. The `06791ea` local-dev run was still queued
  at handoff.
- No dev server is running.

**Watch out:** stopping dev servers by matching `pnpm` in the command line
also kills a `pnpm test` running in the same worktree. Its vitest then
lives on, orphaned, and holds the test-DB lock. Stop the server set by its
port's tree, and check for a stray `vitest` before re-running.

## WHERE B STOOD — 2026-10-08, closing for a Claude Code update

**State:**

- `track-b` is pushed and merged into `local-dev`. Nothing is unfinished,
  and there is no WIP branch.
- The last local-dev run (3a1f3ef) was green: tests, staging deploy, smoke.
- Nothing is on `main`, nothing deployed live, and no migrations were
  written by B.
- B's local databases (`bidrender_test_b`, `bidrender_local_b_new`) are
  migrated to 0134 (all 135). `scripts/schemaDrift.mts` says both match.
- **Track C has MERGED into local-dev** (`bea4d8f`). Everything parked
  "after Track C merges" is unblocked.

**Shipped this session**, details in the sessions below:

- never-stuck gaps 1–7, plus two faults the staging check found;
- DV34 loaded (700 series box + plate);
- 15 starters (GC/GR, 2"/8" wafers, 4" remodel can);
- the large-plan download fix;
- the "Most used" row in Quick bid.

**NEXT JOBS, in this order:**

**(a) The white-box fix on plan open, plus the six parked fixes, in 2–3
small batches.** All are in todo.md: "White box on plan open" and "Plans
screen gaps — AFTER TRACK C MERGES".

- **The white box:**
  - Cause, fix and tests are written in todo.md.
  - The fix is in `TakeoffPage.tsx` `PlanPane`'s load effect: reset
    `canvasSize` and `drawnPage` when a load starts.
  - `scripts/stagingOpenFlash.mts` prints `FLASH` today and must print
    "No flash" after.
- **The six parked fixes:**
  - Gap 2: the `setLocation` lock check.
  - Gap 3: a won bid offers "lock it?" once. Owner's call first.
  - Gap 4a: "can't be undone" on the undo arrow.
  - Gap 4b: undoing a multi-sheet count delete refreshes every sheet.
  - Gap 4c: undo for run type, typed length, circuits, legs.
  - Gap 6.1: open the viewer from the local file while it uploads.
- **Suggested batches:**
  1. white box + Gap 2 + Gap 4b, all small;
  2. Gap 4a + Gap 4c, undo;
  3. Gap 6.1 + Gap 3.

**(b) The cover swaps** (`references/cover-plates-audit.md` § 3; Track A
shipped the parts, B changes the recipes):

- CS6, CS7, CS8 → `4" square raised cover, single receptacle`;
- RS17, CS5, RS1, RS2, RS13, MS12, per the audit;
- the device recipes onto the new duplex/toggle/decora plates.

Notes:

- A starter recipe change on a database that already has the starter: the
  seeder never rewrites a starter's lines. Check how the audit wants
  existing rows handled before assuming a seed change reaches them.
- DV34 is already done.

**(c) The "fix this line" panel** (`references/never-stuck-plan.md`, gap
11, as amended):

- It saves the number onto that one line.
- It has an "Also save to my library" tick box, ON by default.
- Sent and locked bids never change.
- It needs `bids.fixLine` and no migration.
- **Track C's per-foot plan (`references/per-foot-items-plan.md`) builds on
  it**, so it goes before C needs it.

**Standing, not B's to build:**

- Extra per-foot items (warning tape) is Track C's plan, and Track A
  builds only its database parts. Wiremold 700 is its own run type, not an
  extra (owner).
- The starter RENAME path, then the can-light names, is in todo.md (B,
  later).

**Watch out for:**

- **Smoke step 10 (undo a mark) failed 3 times on 2026-10-08.** Every
  failure overlapped a staging redeploy or another smoke run, and the head
  run passed. Evidence and fixes are in todo.md. If it fails again with
  nothing overlapping, it is real.
- **After pulling local-dev, migrate B's databases**
  (`npx tsx scripts/migrate.mts` with DATABASE_URL at each, then
  `scripts/schemaDrift.mts`), or the suite fails by the hundred on missing
  columns. It did on 2026-10-08: 811 failures, all "Unknown column".
- **About twenty throwaway `example.com` accounts on staging** come from B's
  probes. todo.md says to delete them before stress testing.

State at handoff: `track-b` = `origin/track-b` = `origin/local-dev` at
**`d9d805d`**, working tree clean. Nothing on `main`, no deploy. Track B's own
databases (`bidrender_local_b_new`, `bidrender_test_b`) are migrated to 105
and `scripts/schemaDrift.mts` says both match. Last gate: `pnpm check` clean,
292 test files / 4,976 passing / 5 skipped.

## Session 2026-10-08 (early) — never stuck, gaps 1–7 built

- `references/never-stuck-plan.md` § 3 lists what each gap does. Tests:
  `client/src/lib/neverStuck.test.ts` and
  `server/analyticsNotPricedNamed.test.ts`, 16 red on the old code.
- **Gap 11** (fix a bid line in place) is re-planned with the owner's
  "Also save to my library" tick box, ON by default. Sent and locked bids
  never change.
- **Track A, in todo.md:** ONE feature, "extra per-foot items on a traced
  run" (warning tape and the 700-series cover), plus the 700-series device
  plate.
- **Track C merged** (`bea4d8f`): the "after Track C merges" items are
  unblocked.

## Session 2026-10-07 (late night) — 15 more starters, by key, hours not set

- **Loaded:** GC1–GC5 and GR1–GR7 (top-assemblies-draft.md § 2b), LT31 (2")
  and LT32 (8") wafers, and LT33, the 4" remodel can. 183 starters now.
- **Owner changes, mid-session:**
  - wafers only at 2", 4", 6", 8": the 3"/5" starters made earlier were
    removed before merging; the materials stay;
  - can lights at 4" and 6" × new construction/remodel: three already
    shipped (LT5, LT4, LT6).
- **Every part exists.** Two deliberate differences from the draft, both in
  todo.md as owner questions or notes:
  - GR3 is on the 320A meter base;
  - GR2/GR5 leave out Underground warning tape (sold by the foot; "1" would
    be one foot).
- **Can light names:** the owner suggested '4" can light, remodel'. Starters
  cannot be renamed in place, so LT33 matches its siblings. That's a
  question in todo.md.
- **DV34 surface raceway:** drafted against A's new raceway items, NOT
  loaded, with 4 questions (top-assemblies-draft.md § 2b).
- **The Residential/Commercial picker filter is NOT built.** It is a plan
  (draft § 5) waiting on A's `bids.projectType`. The tags show on the
  Assemblies list today.
- **Staging check:** `scripts/stagingStartersCheck.mts`.

## Session 2026-10-07 (night) — the white box at the top-left on open

- **Reproduced on staging** (laptop + 1180x820 touch), cause found. The fix
  waits for Track C because it is in `TakeoffPage.tsx`. todo.md, first item
  under "after Track C merges", has the cause, the one-place fix and the
  tests.
- **`scripts/stagingOpenFlash.mts`** records every frame (layout boxes plus
  Chrome's painted screencast). It walks the paths: open by address, open
  from the bid, zoom, next sheet zoomed, reload with the view restored, and
  link renewed. Only the last flashes. It prints `FLASH` today and must print
  "No flash" after the fix.
- Left on staging: seven more throwaway `example.com` accounts. Their plan
  sets were removed and their bids archived.

## Session 2026-10-07 (late) — Plans screen gaps, staging upload timing

- **On local-dev as `1fcb2e7`**, and green: tests, staging deploy, smoke.
- **Fixed: large plan sets downloaded WHOLE in the background**
  (`shared/pdfRangeLoading.ts`, `disableStream`).
  - Measured on staging R2 with the 52.6 MB / 15-page Decant set.
  - Before: 52.55 MB extra.
  - After, at laptop and tablet sizes: 6.4 MB of ranges to sheet 1, and
    0 MB more in the 10 s after it.
- **Where the time goes** (staging, 4 runs):
  - PUT: 11.5–17.1 s.
  - Ticket and attach: about 0.2 s each.
  - Viewer opens the file: 2.7–4.0 s.
  - Sheet 1 drawn: 1.4–2.0 s.
  - `scripts/stagingUploadTiming.mts` (`SIZE=tablet-portrait` for tablet).
- **Gap 5 built** (preview never saved): two guard tests, each shown red.
- **Gaps 2, 3, 4 and 6.1** are in todo.md "after Track C merges". Gap 1 is
  Track C's.
- **Left on staging:** six throwaway `example.com` accounts from the upload
  probe. Their plan sets were removed from the bucket and their bids
  archived.

## WHERE B STANDS — 2026-10-07, after the merge (read this first)

- **Everything B has built is on `local-dev` and on staging.** A landed
  0105–0124 on local-dev (`7f5832f`); B merged it into `track-b` (Gate green,
  drizzle-guard included, `3487c93`), then into local-dev as **`2f469e5`**:
  tests, staging deploy and smoke all green; staging serves `2f469e5`.
  That carries H2 step 2 ("hours not set"), "Use suggested", the CSV Pin
  column and Labor only, all on the schema they pair with.
- **The STAGING on-screen check is DONE** (2026-10-07, staging on `5ebf9ef`,
  laptop + tablet, `scripts/stagingHoursCheck.mts`): every "hours not set"
  screen and the Labor-only tick read right; one fault found and fixed
  (`f94d06e`: totals said "price the part" for missing hours). Details and
  what was not seen are in todo.md's ON-SCREEN CHECK entry. The probe left
  three throwaway `example.com` accounts on staging (the app cannot delete
  an account); their bids are archived (purged in 30 days) and their test
  rows deleted — one labor role remains in the first account.
- **Ships together, never apart** — now on local-dev together, as required:
  H2 step 2 with 0122/0123; Labor only with 0105–0106 and `5c98bd1`.
- **Not run anywhere, on purpose**: the LT1/LT2 fixture repair script. It
  rides the next release (migrations-next-batch.md § "Data repairs").
- **Next B jobs with no A column and no bid number** (all on-screen): the
  pin look editor from the Legend tab and assembly editor, the ring around
  the symbol, faint marks.

## Session 2026-10-06 (late) — Labor only, on A's 0105–0106

- **Built on `track-b`, which now CONTAINS `a-batch-0105` (0105–0124).**
  So `track-b` must NOT merge into local-dev until A's batch is on
  local-dev: merging it first would carry A's migrations in by the back
  door. Once A lands the batch, pull local-dev and merge as usual.
- Track B's own DBs (`bidrender_test_b`, `bidrender_local_b_new`) are
  migrated to 0124. On that schema the starter holds lifted: only DV34 is
  held, the other 167 seed with hours not set.
- todo.md "LABOR ONLY — BUILT" has the parts, the tests and the screen
  check; the pairing rule is there and in migrations-next-batch.md.

## Session 2026-10-06 (night) — new assemblies start "not set"; CSV Pin column

- `304260a` on local-dev: green (tests, staging deploy, smoke).
- **A NEW assembly's hours start empty** (owner); grey suggestion + "Use
  suggested" (`client/src/lib/assemblyHoursSuggestion.ts`). Create now
  closes only on success, so a refused blank no longer loses the recipe.
- **The takeoff CSV's "Pin" column** (pin plan decision 11) — built; see
  todo.md's pin-looks entry. Picked as the next job because it needs no A
  column, moves no bid number, and is testable without a screen.
- **Next B jobs left with no A column and no bid number** (all display, all
  need a screen check, so start them when the laptop has memory for a dev
  server and browser): the pin look editor from the Legend tab and the
  assembly editor (pin plan § 6); the ring around the symbol at reading zoom
  (§ 4, needs step 0's measurement first); faint marks (decision 12). Plus
  todo.md's "hours not set" on-screen check, once A's 0123 is on local-dev.

## Session 2026-10-06 (evening) — H2 step 2, LT1/LT2 repair

- **H2 step 2 is built**: NULL assembly hours read as "not set" everywhere
  (`shared/assemblyHours.ts`; todo.md has the list). **It ships in the SAME
  release as Track A's 0122/0123, never apart** — written in todo.md and
  beside 0122/0123 in `references/migrations-next-batch.md`.
- **LT1/LT2 fixture repair**: `scripts/repairStarterFixtureLines.mts`,
  tested on `bidrender_test_b` and a dropped copy of the local database.
  NOT run on staging or live; listed in migrations-next-batch.md § "Data
  repairs" to ride the release.
- Open for the owner: should a user's own NEW assembly still pre-fill hours
  from `laborHourDefaults` or start "not set"?

## Session 2026-10-06 (later) — starter assemblies, labor sheet tab 2, run bends

- **All 168 starters are in the seed**, 160 HELD until Track A's 0123
  (hours NULL) and 0122 (two categories); DV34 until surface raceway. The
  holds lift by themselves from `drizzle/schema.ts`. todo.md, "Starter
  assemblies", has the files, the order rule, and the one owner question
  (LT1/LT2's new fixture line on existing databases).
- `pricing/labor-units-starter.xlsx` tab 2 = all 168, most-used first.
- `references/run-bends-plan.md` § 7: all three owner answers recorded;
  build after A's three columns.

## Standing rules (owner, 2026-10-05) — read before doing anything

**1. Merging: CI is the gate, not the laptop.** Do not run the full suite
locally before a merge. Instead:

1. `pnpm check` and the tests the change touches, locally.
2. Push `track-b`, then wait for the GitHub Actions **Gate** workflow's
   `test` job on `track-b` to go green (`gh run list --branch track-b`,
   `gh run watch <id>`).
3. Green: pull `local-dev`, merge `track-b`, push `local-dev`, and confirm
   the Gate run on `local-dev` is green too. That run also deploys staging,
   code only, and smoke-tests it.
4. Red, at either step: fix, push, repeat.

Run the full suite locally only when CI cannot tell you something. Why: the
laptop runs three tracks at once, and two full local runs on 2026-10-05
were stopped by Claude Code for low memory.

**2. Stopping a dev server: stop the whole SET, not the process on the
port.** `pnpm dev` starts a chain: pnpm → cross-env → `tsx watch` → the
server. Killing only the process holding the port (what was done on
2026-10-05) left three idle `tsx watch` chains in `C:\dev\BidPhase-B`. An
idle watcher can restart a server when files change, so it is a dev
server nobody knows is running. Stop it from the top: find the `pnpm …
dev` root for this folder and `taskkill /T /F /PID <root>`, then check
that no `node.exe` whose command line mentions `BidPhase-B` is left. Never
touch a set whose command line names another track's folder.

## Done

### Pin looks — chosen shape, letter, color (pin plan § 6, § 11.4)

- Columns 0099–0101 (A, batch 1). Resolver in `shared/pinLetters.ts`:
  count → legend symbol → assembly → automatic. Count/symbol letters are
  never renumbered (a clash is flagged in `clashesWith`); an assembly letter
  or color is a default and bumps. A value the palette no longer holds reads
  as automatic.
- **Shape can be chosen** — this overrides § 11.4's "shape is always the
  family's", on the owner's request; recorded in the plan and in
  `pinLetters.ts`.
- Where a count takes its look from: `client/src/lib/pinCounts.ts` (reads
  the company's FORK of a shipped assembly; finds a renamed symbol by its
  captured key).
- Saving: `takeoffGroups.setLook` (`where: "job" | "everyJob"`). Every job =
  the legend symbol, else the assembly (forked if shipped), and the count's
  own choice is cleared. A typed-name count is refused with the reason.
- Editor: `client/src/components/takeoff/PinLookEditor.tsx`, opened from the
  count card's swatch. Opens left with a capped height (it was cut off on a
  tablet).

### Mark status (pin plan § 7)

- Columns 0098 + 0103 (`unconfirmed`, A). Set with "Mark as…" on a
  selection (`takeoffStamps.setStatus`, refused on a locked bid, scoped to the
  bid) or by `drop`'s `status`. People choose only `USER_MARK_STATUSES`;
  `unconfirmed` is the reader's.
- Drawn: new filled · existing hollow + SOLID outline · remove red X ·
  relocate filled arrowhead badge · unconfirmed dashed hollow
  (`statusLook`, `shared/takeoffMarks.ts`). Card says the split in words and
  what is off the bid (`statusSplitText`, `unpricedStatusNote`).
- Refresh: `markStatus` and `pinLook` in `client/src/lib/takeoffRefresh.ts`
  (checked on screen: the card number moves without a reload).

### One "only NEW marks are priced" rule — merged with Track A's

A and B built the same rule the same day; the merge kept ONE of each:
`markCountsAsQuantity` (`shared/markStatus.ts`, A's; `isPricedMark` is the
same rule for a row) and `markIsQuantity` in `server/db.ts` (A's SQL).
Applied where a mark becomes a number: `stampCountsForBid` (bid lines),
`countStampsByGroup` ("Send N", the count list), `getStampsForBid`
(materials list, export, drops), and `groupStamps` (pure; `StampRecord.status`
is REQUIRED so no mapping can drop it). `statusSplitByGroup` is the one
display-only count and says so. Tests: `server/markStatusPricing.test.ts`
(red with either half of the rule removed), `client/src/lib/pinLooks.test.ts`,
and A's `server/markStatusQuantities.test.ts`.

## Open

1. **Owner: what do REMOVE and RELOCATE cost?** Today neither is priced
   (neither buys a device) and the card says "labor not on the bid".
   Recommendation in todo.md: a labor line per status per count.
2. **Owner: a run ENDING on an existing mark** still prices its own drop
   (a run end claims a mark; not a mark count, so the rule does not reach
   it). New conduit to an existing device can be real work. todo.md.
3. **Track A: the step-3 fold** of Track C's "… - EXISTING TO REMAIN" twin
   counts (`shared/existingToRemain.ts`) into `status`. Until then those
   twins still PRICE AS NEW if sent — the one remaining way an existing
   device reaches a bid.
4. **"Placing as" while counting** — a New / Existing… choice in the count
   pill so a run of existing devices is placed as existing. The server side
   exists (`drop` takes `status`); only the control is missing.
5. **The look editor on the Legend tab and in the assembly editor.** It
   opens from the count card only; pin plan § 6 wants the one editor from
   all three places.

Also still open from step 1 of the pin plan (todo.md): ring around the
symbol at reading zoom, faint marks, the CSV "Pin" column, step 0's
`LETTER_MIN_PX`.

## Exact next step

Start with **open item 4, "placing as"**: it is the only one that needs no
decision and no migration. In `client/src/pages/TakeoffPage.tsx`, add a
sticky `placingStatus` (default new) beside the armed count, shown in the
counting pill; pass it as `status` in the `dropStamps` mutation and on the
pending marks (so they draw right before the reply). Test that a drop with
`status: "existing"` is not counted (extend `server/markStatusPricing.test.ts`,
which already places existing marks this way), then look at it on screen at
laptop and tablet widths.

Fixture for screen checks: bid "Sheet numbers check" (1728350, user 1),
sheet E-200 (234209, 1/8" scale): four duplex marks are new / existing /
remove / relocate, and the switch count has a chosen look (orange hexagon
"SW"). The `deviceAudit.mts` helpers (`openAt`, `gotoRoute`) drive it; a probe
script must live in `scripts/` to resolve playwright-core.
