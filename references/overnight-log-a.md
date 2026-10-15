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
