# Track A handoff — 2026-10-05

## Session 5 (2026-10-06, ~20:50 UTC) — LIVE RELEASED. Read this first

- **Live serves `24105ad`; its database has all 105 migrations** (0096–0104
  applied 2026-10-06 ~20:11 UTC, code live 20:42). Record:
  `deploying.md` § 11 "LIVE: `24105ad`". Backup taken just before:
  `2026-10-06T20-03-57Z`. Every live bid total unchanged before/after.
- **Owner still to do:** add the live `RESEND_API_KEY` (`bidridge-live`) and
  run one reset test on bidridge.com. Until then "Forgot password?" says
  email is not set up.
- **First job after the release (owner): investigate the blank Plans screen
  after a reload** (todo.md § Flaky tests, MUST INVESTIGATE). It may be a
  real bug.
- **Next release must carry B's labor rule TOGETHER with 0105–0106
  (`laborOnly` + `snapshotLaborOnly`) and B's code** — never the rule alone
  (`live-release-plan.md` § 0, `migrations-next-batch.md`). Also in it: C's
  tie-labels and CAD layers, the reset early-check (`6518fc5`).
- The staging email cause was an invalid staging Resend key (`deploying.md`
  § 11); `[email]` lines in Runtime Logs say why any send stops.

## Session 4 (2026-10-06, ~06:00 UTC) — read this first

- **Do NOT release `44f0f5f` or `6323a7b`.** Both carry this session's
  provisional-sheet code without its two follow-up fixes: taps held for a
  missing sheet row could be **counted twice** (crash recovery re-read them
  as left over), and the panel could show **"0 marks"** after a save (React
  Query does not cancel a first fetch on invalidate). Staging run
  37415935629 caught the double (6 for 3). Live (`0af50a6`) never had this
  code. **Release candidate: `f8fdec3`**, green smoke on staging (run
  37422435526, 96 passed, 2 skipped), 2026-10-06 06:27 UTC.
- **Flow test 2's local failures were a real bug**, now fixed (`6323a7b`,
  `client/src/lib/pageTextRead.ts`): a fresh upload's printed scale was
  thrown away when the sheet list arrived mid-read. No wrong lengths: the
  sheet sat unscaled.
- `touch.spec` now forces both orders (rows created late; the first mark
  list answered with pre-save data) and fails without either fix:
  6/6 runs red each way, 6/6 green with both.

## Session 3 (2026-10-06, ~03:45 UTC)

- **First fully green smoke run on staging:** run 37408880584, `44f0f5f`,
  96 passed, 0 failed, 2 skipped (they skip locally too). This is what
  Approval A in `live-release-plan.md` needs. Note: the release commit is now
  `44f0f5f` or later, not `af65f84`.
- **The touch failure was a real bug:** taps on a freshly opened sheet were
  lost on a slow connection. The tap layer waited for the measurability
  query, and a mark had no sheet id until the sheet row arrived. Fixed in
  `2e5e203` (provisional sheet id, `adoptRealSheet`). `touch.spec` now runs
  at 300 ms latency and is red without the fix; `markBatches.test` too.
- **Screenshots now upload** (`f4c444d`, `include-hidden-files`). Before
  that, no run had ever uploaded one.
- **Local only:** flow test 2 ("1/2 scaled") fails about 4 runs in 5 on a
  local production build, with or without this session's changes, and passes
  on staging. Unexplained.
- Owner Q1 and Q2 answered (`owner-questions.md`). Q2's plan:
  `remove-relocate-labor-plan.md`, Batch 2 files 0108–0110, not written.
  Q3 is open.

## Session 2 (evening, ~23:50 UTC) — the earlier state

- **Staging password: fixed.** The new `SMOKE_STAGING_PASSWORD` gets through
  the gate; the specs now run on staging.
- **First real bug the smoke found, fixed (`8815e69`):** a legend symbol
  linked to an assembly went to the bid as a FREE count (no price, no hours)
  when clicked straight after Link — flow test 6. Server guard in
  `takeoffGroups.create` (`server/legendLinkCount.test.ts`, red with it off)
  plus an optimistic legend cache. Flow 6 now PASSES on staging.
- **Gate: local-dev runs queue instead of cancelling (`d0fca43`).** Two smoke
  runs were killed by other tracks' merges in one hour. Proven working: run
  `6bfe956` waited behind `5894efd`, and both finished.
- **Still red — `touch.spec.ts` "count, link and send by touch"** on both
  tablet projects in run `37388349708` (`6bfe956`): three taps, 0 marks
  ("Counting CI TOUCH" did show). It passed in the run before (`5894efd`),
  whose flow stopped at test 6. Not reproduced: memory was at 0.5 GB and
  another track's server held 3002. Two suspects: state left by flow tests
  7–14, which ran on staging for the FIRST time in this run, or my commits
  (nothing found in the touch path). **Next step: get that run's failure
  screenshot** (Actions → run 37388349708 → smoke-failures, needs a signed-in
  browser), or run `pnpm smoke` locally with one server up.
- **Update, 2026-10-06 ~01:15 UTC:** the touch failure is NOT flaky — four
  staging runs in a row (`6bfe956`, `97705c9`, `b14e665`, `6eed153`), both
  tablets, and it is the ONLY failure left on staging. Locally the full
  smoke (96 passed, 2 skipped) passes, touch included, after the full flow.
  It passed on staging only in the run where the flow stopped at test 6.
  Not fixed: no screenshot yet (`gh` is not installed on the laptop).
  Ruled out by reading: the "placing as" switch (React state, resets on load)
  and the flow-6 fix (not on the touch path).
- **Locally, flow test 2 fails ("0/2 scaled") on a production build against
  `bidrender_local`**; it passes on staging. Unexplained, local only.
- **Bid-totals script written and rehearsed** (`scripts/bidTotals.mts`,
  `live-release-plan.md` § 4 steps 3, 4 and 9). Before-run uses a worktree at
  the live commit; read only by construction. Found that `companyDefaultsFor`
  INSERTS a `pricing_defaults` row for an owner without one; the read-only
  session refuses it and the script reports it.
- **Owner questions:** `references/owner-questions.md`, question 1 open.
- Local DBs: `bidrender_local` and `bidrender_test_clean` migrated to 105
  (both were behind; the test DB being at 0103 made 745 local tests fail).

Written at the end of a session, before a restart. Read this first, then
`deploying.md` § 11 and `migrations-0098-batch-plan.md` § S (on
`a-migrations-plan`).

## Where things stand (checked 2026-10-05, about 20:30 UTC)

| What             | State                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live             | serves **`0af50a6`**; database records **96** migrations (0000–0095). Untouched.                                                                                                                |
| Staging code     | serves **`af65f84`** (built 19:58 UTC)                                                                                                                                                          |
| Staging database | **105** migrations (0000–0104), "Database matches the schema", foreign keys **141/141**. No mark has a status (all NULL = new).                                                                 |
| `local-dev`      | `e54933f` (a Track C merge, after `f0d7a21`). No `drizzle/` difference from staging, so the auto-deploy carries it as code only. Its Gate run was queued at the time of writing.                |
| Staging backups  | `C:\dev\bidrender-backups\` on the owner's laptop: `staging-2026-10-05T19-41-13Z-before-0103-0104.sql` (65 tables) is the latest; each was restored locally and matched staging table by table. |

## Done

- **0096–0102 on staging** (2026-10-02) and **0103–0104 on staging**
  (2026-10-05): `0103` appends `unconfirmed` to `takeoff_stamps.status`;
  `0104` adds `takeoff_runs.startConnect` / `endConnect`. Each batch: backup
  proved, rehearsed on a restored copy (count applied, drift matches, data
  unchanged, second run 0), gate green, migrated by hand, matching code pushed
  to `staging` by hand, drift against the running code matches. Full record:
  `deploying.md` § 11.
- **`af65f84`** — the code that goes with 0103–0104, and the owner's two rules
  in `shared/markStatus.ts`:
  - only a NEW mark (or NULL) is a quantity — one SQL condition
    (`markIsQuantity` in `server/db.ts`) at bid-line counts, the counts the
    screens compare with them, and the marks the materials list, export and
    drops read;
  - a run never snaps to or attaches to an `unconfirmed` mark — `snapToMark`
    skips it (`SnapStamp.status` is required, so no caller can forget it),
    and the server's `setEnds` and leg start refuse it.
    Each rule has a test shown to fail with the rule switched off.
- **`references/live-release-plan.md`** — the checklist for taking 0096–0104
  and the staging-tested commit to live (plan only; nothing run on live).
- `migrations-0098-batch-plan.md` § S renumbered (on `a-migrations-plan`,
  `bbb8c18`): Batch 1b is 0103–0104; Batch 2 is now 0105–0107, catalog
  0108–0114, legend 0115. None of those is written.

## Left

1. **The browser smoke test fails on staging, before any test runs.**
2. **The read-only bid-totals script** (`live-release-plan.md` § 4 steps 4
   and 9): reads every live bid's `totalDue` and not-priced count before and
   after the release, so "no number moved" is measured. Not written.
3. **The live release itself**, per `live-release-plan.md`, with the owner's
   four approvals. Not started.

## The smoke failure — facts only (not investigated further)

- Every smoke run on staging so far has failed in the SETUP step
  (`e2e/smoke/auth.setup.ts`), so **0 of the 97 tests have run on staging**.
- The failure is `staging password page refused SMOKE_STAGING_PASSWORD`,
  **HTTP 401** from `POST /staging-gate`.
- The owner re-entered `SMOKE_STAGING_PASSWORD` at **about 12:28 PM (Pacific)
  on 2026-10-05**. The run that finished at **20:24 UTC (about 1:24 PM
  Pacific)** — Gate run `37366791778`, `local-dev` at `af65f84` — **still got
  401**; its smoke job took about 44 seconds, most of it installing, and the
  test step itself 1 second.
- Already ruled out: whitespace. Since `fe2df5e` the setup trims the posted
  password exactly as the server trims its own copy. The same 401 followed.
- Proven earlier on a LOCAL production build: the setup's gate POST works
  with the right password and fails with a wrong one, and no password appears
  in the output or the saved results.
- Not yet checked (for the next session): whether the value saved in GitHub
  equals staging's `STAGING_PASSWORD` in DigitalOcean (the owner can compare
  by re-pasting from the same source both came from); whether the secret was
  saved as a repository secret (not an environment secret, which this job
  does not read); and whether staging's `STAGING_PASSWORD` was changed after
  `.env.staging.local` was written.

## The exact next step

**Find out why staging refuses the saved staging password, then get one green
smoke run on staging** — the owner checks the three "not yet checked" items
above. Track A must not test the staging password itself (typing a password
into a non-local site is the owner's to do). Once the gate POST succeeds, the
remaining 97 tests run for the first time on staging: fix any real bug they
find, then write the bid-totals script, then the live release.

## Other things worth knowing

- The repo is **public**: keep traces and video off in the smoke config, and
  upload screenshots only (see `deploying.md` § 12).
- A stale fork worktree sits at `.claude/worktrees/agent-a02fd66b3ea7af9ae`
  (branch `a-materials-plan` at `3e0109d`, already pushed). Safe to remove
  with `git worktree remove` when convenient.
- The materials rename has NOT started; it waits on the size-reading fix and
  the owner's answers (`materials-naming-and-pricing-plan.md`, on
  `a-materials-plan`).
