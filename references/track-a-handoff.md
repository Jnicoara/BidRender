# Track A handoff — 2026-10-05

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
