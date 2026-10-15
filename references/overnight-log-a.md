# Track A overnight log — 2026-10-14 → 15

Branch `track-a-night` (from `origin/local-dev` `d0152f60`). Times PDT, from
the commit clock. (The first draft of this log carried ESTIMATED end times
for items 2–5, running to 02:45; they were wrong and are replaced by the
commit times — corrected 22:40.)
Rules for the night: push only `track-a-night`; no staging/live database,
no deploy, no migration except throwaway local; no dev server; changed test
files only (B and C also running). MySQL 3307 shared — left running.

## Item 1 — signup race fix — 21:45 → 21:52

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

## Item 2 — GitHub minutes / private repo — 21:52 → 22:16

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

## Item 3 — next live release prep (paper + scripts) — 22:05 → 22:17 (overlapped item 2 while its Gate ran)

- `next-live-release-plan.md` § "Night prep 2026-10-14": contents
  (0152–0163, boot change, pack fix, signup fix, companies 5–8), P1–P4
  before the window with expected figures, day steps 1–11, rollback.
- **Found:** the boot change conflicts with owner Q1 (ships the release
  AFTER the end-of-pricing load, which has not landed) → morning question 3.
- New `server/raceCompanies.ts` + `scripts/removeRaceCompanies.mts`: keeps
  the lowest-id company, checks every FK into `companies` from
  information_schema + `users.activeCompanyId`, `--apply --expect` or
  nothing, one transaction with a re-check. `raceCompanies.test.ts` 5/5
  (live's shape; invite, active pointer, second member each refused;
  mismatched `--expect` removes nothing). Script dry run + refusal without
  `--expect` exercised on `bidrender_test_localdev`. `pnpm check` clean.
- Gate 38684649809 (preinstalled MySQL) **green**. SEEN lookup checked
  against the real API: 3854d2d5 → seen (run 38684649809), e03bead6 → full.

## Item 4 — invite gate (server, OFF by default) — 22:17 → 22:26

- **Found:** the gate's table already exists — 0107 `signup_invites`, live
  since 10-10 — and the owner-answered plan lived only on `a-plans`. Copied
  to `references/invite-gate-plan.md` with § 12 "BUILT".
- Built: `server/signupInvites.ts` (switch `SIGNUP_INVITE_ONLY=on`, exact
  word), `server/inviteCodes.ts` (shared generator/hash, companyRouter now
  imports it), `auth.signup` takes `inviteCode`, `auth.inviteInfo`,
  `auth.signupMode`, `signupInvitesRouter` (admin create/list/revoke/mode).
- Not built: sign-in page / `#/signup` page / Admin panel / emails (UI
  needs a visual check; no dev server tonight).
- Drafted, not applied: `references/drafts/users-email-unique.sql`;
  rehearsed on a throwaway schema; 0 duplicates on two local DBs.
- Tests: `signupInviteGate.test.ts` 9/9; two mutations each turned exactly
  their test red; auth.email, auth.logout, permissions, seats,
  personalCompanyRace, scopeDiscipline (router listed), sourceHygiene: 121
  green; `pnpm check` clean.

## Item 5 — light cleanup (measured, drafts only) — 22:26 → 22:36

`references/night-cleanup-2026-10-14.md`.

- **Snapshot hole is 0059–0163, not 0059–0064** (0032, 0035 also missing).
  Draft `references/drafts/drizzle-snapshot/0163_snapshot.json`, made in a
  scratch dir: generate today = 338 statements re-adding live objects; with
  the draft = "No schema changes"; draft vs a DB migrated 0000–0163 (pull,
  read-only) = 0 real differences over 86 tables / 1,105 columns.
  (A drizzle-kit absolute `out` landed in `C:\c\…`; moved my file out and
  removed only my own folders there — that tree also holds Track C's.)
- **Dead tables**: 11 listed with reach, row counts (local copy) and FKs;
  only point at each other; `projects.pdfKey` is still in the backup's
  file list. Nothing dropped.
- **Type-check `scripts/`**: 589 errors / 56 files today; 5 / 2 files with
  `target: ES2022`; app 0 with it. Not applied (todo.md: `target` affects
  class-field compile) — numbers added to todo.md.

## Second pass — 22:36 → 22:45

- Release plan names the invite gate (ships OFF) as riding along if merged.
- Invite plan § 12 names the one known difference from § 2 (an existing
  account using a company code gets "already exists", not "sign in and it
  will be waiting").
- `auth.signup` names its fallback message instead of `problem!`.
- Log times corrected to the commit clock (the first draft had estimates).
- **Final local check, one run:** 14 files touched or affected —
  personalCompanyRace, raceCompanies, signupInviteGate, docsOnlyGate,
  scopeDiscipline, sourceHygiene, seedLock, permissions, auth.email,
  auth.logout, seats, starterAssembliesPlan/Seed, starterEditorLogin:
  **178 / 178** on `bidrender_test_localdev`. `pnpm check` 0 errors. Full
  suite only in the Gate (memory rule tonight).
- **DOCS mode proven in CI** — Gate 38689089046 on the docs-only handoff
  commit `f6540de3`: "Gate mode: docs", 4 files, 29 passed / 6 DB-skipped,
  test job **24 s** (1 billed minute, against ~13 for FULL), no deploy.
  Gate 38687906570 (items 4–5) green, mode full. Every code commit on the
  branch has a green FULL run. End 22:53. MySQL 3307 left running (shared);
  no dev server was started.

---

# Run 2 — 2026-10-15 (owner away; branch only)

## Item 1 — Q-DB1, server stuck after the database comes back — 06:06 → 06:25

- Plan + record: `references/q-db1-plan.md`.
- `server/dbDeadline.ts`: a query (or the wait for a connection) past 30 s
  DESTROYS its connection and fails with words; transaction connections too.
  `server/appPool.ts` builds the pool for `db.ts` and the test alike.
- `GET /api/health` (`server/health.ts`): `SELECT 1`, 3 s, 200 / 503; open
  through the staging gate. Pointing App Platform at it = owner (§ 3).
- Tests: `dbDeadline.test.ts` (TCP proxy swallows bytes; 12 reads > pool of
  10): **red without the deadline** (reads never answer, pool dead after),
  green with it; `health.test.ts` 3. Related 8 files 57/57 ×3. One earlier
  `personalCompanyRace` failure (77 ms, message not captured) did not recur
  in 16 runs — recorded in the plan. `pnpm check` 0.
