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

## Item 2 — C's four parked security findings — 06:16 → 06:24

`references/security-parked-a.md` (status + recommended order).

- **A-S14** signup race: already fixed 2026-10-14.
- **A-S9b FIXED**: session cookie `SameSite=Lax` on https too
  (`_core/cookies.ts`); `cookies.test.ts` turned around — 2 of 3 red on the
  old code, 3/3 green.
- **A-S12 PREPARED**: `CLIENT_IP_FROM` (`first-forwarded` default = no
  change; `last-forwarded`; `header:<name>`). 3 new tests, 2 red on the old
  code; `rateLimit.test.ts` 8/8. Needs one live request's headers first.
- **A-S13 NOT DONE**: needs proof on an R2 bucket; a wrong guess breaks
  every upload. Recommended order: S12 switch → health check → S13 on the
  staging bucket → Q-SEC1 (unmount legacy routers, owner).
- `environment.md`: `DB_QUERY_DEADLINE_MS`, `CLIENT_IP_FROM`,
  `SIGNUP_INVITE_ONLY` added.

## Item 3 — Q-AUTH1 in todo.md — 06:24

Under the stress-test items ("Before beta: speed of the summary…"): the
measurement, the cause (`bcryptjs` on the main thread), two fix options
(native `bcrypt` or a `worker_threads` pool), and a done-when.

- **Gate 38741709348 RED on `dbDeadline.test.ts`** under CI load (first
  read after the hang hit the 500 ms test deadline). Test now asks for
  recovery within 15 s with retries; red without the fix, green with it, and
  under parallel load 101/101. Pushed with items 2–3.
- **Gate 38744046001 RED on `auth.logout.test.ts`**, which still expected
  `sameSite: "none"`. Missed because the search for affected tests looked
  for the function's NAME, not for `sameSite` — a grep measures the pattern
  typed. Searched again for `samesite` everywhere: that was the only one.
  `dbDeadline.test.ts` passed in that run. Fixed; auth/cookie/rate tests
  23/23.
- **Gate 38746107689 GREEN** on `30e45889` (full suite, Q-DB1 + A-S9b +
  A-S12 + Q-AUTH1 note). Run 2 end **07:02**. No dev server started; MySQL
  3307 left running (shared). Nothing pushed except `track-a-night`.

# Run 3 — 2026-10-15 night

## Step 1 — land track-a-night on local-dev — 22:01

`origin/local-dev` (d0152f60) was an ancestor of `track-a-night`, so
`--ff-only` went through: `d0152f60..a4c97280 local-dev -> local-dev`.
No `drizzle/` change in the 17 commits. Gate 38853660685 on local-dev.

## Item 2 — golden bids — 22:05 → 22:40

- 8 fixture bids built through the routers (fixture users 9906, 9907):
  counts, homerun, drops, remove-relocate, scope-tags, labor-only,
  free-count (a typed price stands in for a quote item), op-and-tax
  (overhead, profit, productivity, markup, 8% tax, two expenses, Active).
- Every line field and total from `bids.get` plus the screen's not-priced
  tally pinned in `server/fixtures/goldenBids.json`. A moved number fails,
  naming bid · line · field: old → new. On-purpose updates need
  `GOLDEN_UPDATE_REASON`, are refused under CI, and are hash-checked, so a
  hand edit fails too.
- **Proof it bites:** the first draft cleared the run height before reading
  the drops bid, which pinned 60 ft. Fixing the fixture made the compare fail
  with 20 named diffs (60 → 94 ft, $252.61 → $365.83). Then regenerated from
  scratch; 2 further runs identical.
- **Quoted lines not covered:** no router writes them and pricing ignores
  them. Listed in `golden-bids-to-check.md`.

## Item 3 — speed limits — 22:45 →

- `server/speedLimits.test.ts` (fixture user 9908): 1 sheet, 2 run types,
  20 runs with circuits, 6 counts × 25 marks, 24 lines. A screen = the
  page-level `useQuery` reads fired together; median of 5 after a warm-up.
  Limits 2000 ms (screen), 1000 ms (save); `OVER_TODAY` names any raised
  limit (empty).
- Builders moved to `server/bidBuilders.testHelper.ts`, shared with the
  golden bids (golden still matches after the move).
- Measured locally (laptop, three tracks running): screens 8–167 ms
  (Plans 167, Bid 141), saves 6–32 ms (scope tag 32). Nothing over → no
  todo needed. CI numbers: in the Gate log, lines starting `[speed]`.

## Step 1 result — 22:25

Local-dev Gate 38853660685 **green**: test, deploy-staging, smoke
**96 passed / 2 skipped** (as expected). Staging `/api/version`:
`commit a4c97280`, builtAt 05:11 UTC.
- Item 3 committed `fe878143` (code); end 22:55.

## Item 4 — Q-AUTH1 sign-in burst — 22:55 → 23:15

- Option (b): `server/passwordHashing.ts`, `bcryptjs` in ≤4 worker threads
  started from source text (the server ships as one bundled file), loading
  the `bcryptjs` path resolved by the main thread. No main-thread fallback.
  `authRouter` (9 calls) and `starterEditor/store.ts` (4) switched.
- `server/signInBurst.test.ts`: 6 real cost-12 sign-ins via `auth.login`
  with a 10 ms ticker. **Red before: stall 874 ms** (burst 1,811 ms).
  **Green after: 24 ms** (586 ms). Hash made by plain `bcryptjs` → old
  passwords verify. Auth tests 58/58. From an esbuild bundle: hash, verify,
  reject, and the process exits (idle workers unref'd).
- `auth.email.test.ts` mocked `bcryptjs` by name; mock moved to
  `./passwordHashing` with identical fakes — no assertion changed.
- Not done: C's burst script against a production build (needs a server;
  memory). Recommended on staging after merge.
- Item 2 Gate 38854852318 **green** (d75970b1).

## Item 5 — invite sign-up screens — 23:20 → 00:05

- Free memory 3.8 GB before starting. ONE dev server (port 3017, test DB
  `bidrender_test_localdev`, `SIGNUP_INVITE_ONLY=on`), stopped after: its
  whole cmd/cross-env/tsx tree killed, port 3017 free, verified.
- Built: `client/src/lib/signupLink.ts` + test (9), `LoginPage`, `AuthGuard`
  (`#/signup?invite=`). Switch OFF = page unchanged.
- Screenshots `references/overnight-shots/a/` 1–5 × laptop 1366×768 /
  iPad 820×1180 / phone 390×844 (+ 6, dashboard after an invite sign-up).
  None scrolls sideways. Looked at: 1 laptop, 2 phone, 3 phone, 5 iPad.
- Driven in the browser: the new-company link signed up and landed on the
  dashboard, code gone from the address; the waitlist link went to the
  landing form (`#early-access`, field visible).
- **Found by using it:** a company-code sign-up refused for seats told the
  INVITEE "Remove someone or add a seat." Now `INVITEE_SEATS_FULL` (both
  accept paths are the invitee's); `seats.test.ts` assertion moved to the
  new words, still exact. (The refusal itself came from my fixture: the
  invite was inserted past the seat check. The seat rule is right.)
- Throwaway invites/users removed from the test DB afterwards.
