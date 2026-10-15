# Track A overnight log — 2026-10-14 → 15

Branch `track-a-night` (from `origin/local-dev` `d0152f60`). Times PDT.
Rules for the night: push only `track-a-night`; no staging/live database,
no deploy, no migration except throwaway local; no dev server; changed test
files only (B and C also running). MySQL 3307 shared — left running.

## Item 1 — signup race fix — 21:45 → 22:20

- `createPersonalCompany` under a per-user MySQL named lock with the
  membership re-checked inside; company + membership in one transaction.
  New `withNamedLock` (`server/db.ts`) does the work on the lock's own
  connection so a burst bigger than the pool cannot starve the holder.
- `personalCompanyRace.test.ts`: `it.fails` → `it`, 8 → 12 parallel requests
  (more than the pool's 10), plus "a suspended member is still refused".
- Tests (`bidrender_test_localdev`, 164/205, matches): race file green 5×;
  **red with the lock removed (12 companies)**; seedLock, permissions,
  starterEditorLogin, starterEditorPure, scopeDiscipline, sourceHygiene
  113/113; `pnpm check` clean.
- Migration DRAFTED, not applied: `references/drafts/personal-company-unique.sql`
  (nullable unique `companies.personalOwnerUserId`, backfill lowest id per
  owner). Rehearsed on a throwaway schema (dropped): re-run 0 rows,
  second personal company `ER_DUP_ENTRY`; MySQL 1093 measured for the naive
  form. Plan: `references/signup-race-plan.md`.

## Item 2 — GitHub minutes / private repo — 22:20 → 23:40

- **Outage found and fixed first:** every track's Gate failed tonight pulling
  `public.ecr.aws/docker/library/mysql:8.0` ("toomanyrequests: Data limit
  exceeded"; 38683716637 here, 38684208140 track-b). Test job now starts the
  runner's preinstalled MySQL — no pull. Gate 38684649809 (that change).
- **Measured** 633 runs / 13.25 days from the API, each job rounded up:
  7,680 min → **≈ 17,400 / month**. 202 docs-only pushes (2,261 min), 102
  re-tests of an already-green commit (927), drizzle-guard 374 for 8 s jobs.
- **Gate change:** FULL / DOCS / SEEN modes in the test job; drizzle-guard
  folded in; no deploy/smoke after DOCS. `.github/docs-only-tests.txt` +
  `server/docsOnlyGate.test.ts` (red with an entry removed). Mode logic
  dry-run in bash on real commits: docs-only `0a9d5709` → docs; code
  commits, zero/unknown `before` → full.
- **Replay** under the new rules: 7,680 → 4,429 → **≈ 10,000 / month (−42%)**.
  Still ~5×; options + money question → morning question 1. Private repos
  get a 2-CPU runner (vs 4), so the suite will be slower.
- **DigitalOcean**: docs say GitHub integration + autodeploy → fine when
  private; not verified against the dashboard (morning question 2).
- Tests: docs list with no DB 29 passed / 6 DB-skipped; `pnpm check` clean.
