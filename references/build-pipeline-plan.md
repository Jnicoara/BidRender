# Build pipeline — B and C merge without waiting, the app tests itself. PLAN ONLY, 2026-10-01

**Status: nothing here is built.** No workflow file, no script, no setting
changed. Written by Track A on `a-pipeline-plan`.

**The aim, in the owner's words:** "streamline the build process so B and C
can build and merge without waiting on me, and the app tests itself. There
are no users yet. **Protect the database and live; loosen everything else.**"

So the plan sorts every step into three bins:

| Protected — a person, every time      | Automatic when the gate is green          | Still the owner's eyes     |
| ------------------------------------- | ----------------------------------------- | -------------------------- |
| Any migration, on any shared database | Merging a track branch into `local-dev`   | A real phone, touch        |
| Anything reaching `main` (live)       | Deploying CODE-ONLY changes to staging    | How a new screen feels     |
| Live and staging app settings         | Running the browser smoke test on staging | Hand counts against the AI |

---

## 0. What exists today — measured 2026-10-01, not assumed

| Question                              | Answer                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub Actions?                       | **None.** No `.github/` directory on any branch.                                                                                                                                                                                                                                                                                                                                                             |
| Browser tests (Playwright, Cypress…)? | **None.** Not in `package.json`, not in `node_modules`.                                                                                                                                                                                                                                                                                                                                                      |
| Test scripts                          | `pnpm check` (tsc, app + tests) and `pnpm test` (vitest, server + `client/src/lib` + `scripts`). `.claude/skills/run-bidrender/smoke.mjs` drives a LOCAL server's API (materials only). Nothing drives a browser.                                                                                                                                                                                            |
| How staging deploys                   | DigitalOcean App Platform builds the **`staging`** branch on every push (`deploying.md` § 11). Today a person pushes `local-dev:staging`. Build takes 3–6 min. A failed build leaves the old version running, silently.                                                                                                                                                                                      |
| How live deploys                      | Same, from **`main`**. A person pushes. Nothing protects `main` on GitHub.                                                                                                                                                                                                                                                                                                                                   |
| Is the repo public?                   | **YES.** `api.github.com/repos/Jnicoara/BidRender` answers `"private": false`. See § 9, risk 1.                                                                                                                                                                                                                                                                                                              |
| Is the test DB guarded?               | Yes. `checkTestDatabase` (`scripts/databaseGuard.ts`) refuses any database that is not on loopback with `test` as its own word in the name. A CI MySQL on `127.0.0.1` named `bidrender_test_ci` passes it.                                                                                                                                                                                                   |
| How long does the gate take?          | **Measured on this laptop, on a brand-new database:** migrate 96 files **23 s**, `pnpm check` **8 s**, full suite **418 s (~7 min)**. One file at a time (`fileParallelism: false`, on purpose). A GitHub runner is usually slower than a laptop: plan on **10–12 min** until the first real run says otherwise.                                                                                             |
| Is a brand-new database green?        | **Not on its own.** 11 tests in 4 files failed (`takeoffRunTypes`, `runTypeColor`, `seats`, `groupDropsBid`), all needing the **shipped run types**. Shipped content is seeded by the SERVER at startup (`server/_core/index.ts`), never by the tests. **Seeding it took 4 s and turned all 11 green.** The whole suite then ran **fully green: 239 of 239 files, 4,454 passed, 5 skipped, 409 s.** See § 1. |

---

## 1. The test gate on GitHub Actions

**Every push to `local-dev`, `track-b`, `track-c` and `a-*` runs:**

1. `pnpm install --frozen-lockfile` (cached by lockfile hash).
2. `pnpm check`. It is the cheapest step, so it goes first and a type error
   fails in under a minute.
3. A **MySQL 8.0 service container** created with
   `--character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci`.
   The collation matters: a server-default database dies at migration 0055
   (`ER_CANT_AGGREGATE_2COLLATIONS`).
   - The database is **`bidrender_test_ci`**, at `127.0.0.1`. That passes
     the guard.
   - It is a fresh database per run, thrown away with the runner. **No
     shared CI database**: two branches sharing one database were the real
     cause of earlier flakes (2026-09-29).
4. `npx tsx scripts/migrate.mts`, all of `drizzle/`. This **also proves every
   migration applies cleanly from zero**, which nothing checks today.
5. **A seed step**: a new script, `scripts/seedBaseline.mts`. It calls the
   seeders in the order `server/_core/index.ts` uses (materials, labor rates
   and modifiers; then assemblies; then kits; then run types). It is about
   ten lines. **This is the one piece of new code the gate needs.** It also
   gives local fresh databases a seed command, which has not existed. Make
   the server and the script call ONE exported function, so the two cannot
   drift into different seed orders.
6. `npx vitest run`.

**Secrets the gate needs: none.** `vitest.setup.ts` supplies `JWT_SECRET`
and decides the AI environment itself. The R2 backup tests already pass with
R2 unconfigured. **GitHub holds no live credential, ever** (§ 9).

**Concurrency:** one run per branch at a time. A newer push cancels the
older run on the same branch (`concurrency: cancel-in-progress`).

**Cost:**

- **Public repo (today): standard GitHub-hosted runners are free.**
- **If the repo goes private (§ 9, risk 1):** the included minutes depend on
  the account plan. GitHub's published figures are 2,000 min/month on Free,
  3,000 on Pro, then about $0.008/min for Linux. **Check the billing page;
  these are from memory, not measured.**
- **At 12 min a run, 15 pushes a day ≈ 180 min/day ≈ 5,400 min/month.** That
  is past the free allowance on a private repo, so roughly $25–30/month at
  that rate.

**Making it faster, later, only if the wait hurts:** `vitest --shard=1/3` …
`3/3` as three parallel jobs, each with its own MySQL. That cuts the wait to
about a third at the same total minutes. Not in the first piece.

---

## 2. B and C merge into `local-dev` themselves when green

**The rule:** pull first, push the track branch, wait for green, merge, push
`local-dev`, and watch `local-dev`'s own gate go green. A red `local-dev` is
fixed or reverted by whoever merged, before anything else.

**What B and C still never do:** push `main` or `staging`, add or edit
anything under `drizzle/`, or run a migration against a shared database.

### Wording for the three terminals (paste as-is)

**Track B:**

> You may merge `track-b` into `local-dev` yourself, without asking, when
> ALL of these hold: (1) you pulled `origin/local-dev` into `track-b` first
> and resolved any conflict; (2) the GitHub Actions gate is green on that
> exact `track-b` commit; (3) the change adds or edits nothing under
> `drizzle/`. Then `git checkout local-dev && git pull --ff-only && git merge
--no-ff track-b && git push origin local-dev`, go back to `track-b`, and
> watch the `local-dev` run. If it goes red, fix it or `git revert -m 1` your
> merge within the hour, before starting anything new. Never push `main` or
> `staging`. Never touch `drizzle/` or run a migration; a column you need is
> a handoff to Track A in `todo.md`. Say what you merged, with the commit, in
> your summary.

**Track C:** the same paragraph with `track-c`.

**Track A:**

> B and C now merge into `local-dev` themselves when the gate is green.
> Before starting work, `git pull` on `local-dev`. You own: every file under
> `drizzle/`, every migration on staging and live (with a backup, per
> `deploying.md` § 5a), GitHub and DigitalOcean settings, and the release to
> `main` (§ 6). Code-only changes reach staging on their own (§ 3). A merge
> that carries a migration does not reach staging until you apply it there by
> hand and push `staging` yourself.

**Enforcement, not only words:** the gate gets one extra job,
`drizzle-guard`. On a push to `track-b` or `track-c` it fails if
`git diff origin/local-dev...HEAD --name-only -- drizzle/` is not empty. So a
migration written on a track branch goes red before it can be merged.

---

## 3. Auto-deploy CODE-ONLY changes to staging

After the gate is green **on `local-dev`**, a `deploy-staging` job runs:

1. `git fetch origin staging`. **Refuse unless staging is an ancestor of
   this commit** (fast-forward only). Otherwise somebody pushed staging by
   hand; leave it for A.
2. **The migration check.** If `git diff --name-only origin/staging HEAD --
drizzle/` lists anything (a `.sql`, the journal or `schema.ts`): **refuse
   and say why**, naming the files, for example "contains
   `drizzle/0108_takeoff_stamps_status.sql`; A applies it to staging by hand,
   then pushes staging". It is a red "needs A" result, not a failure of the
   code.
   - `schema.ts` counts, because a schema change without a `.sql` is exactly
     the fault that takes a screen down.
   - **It compares against what staging is RUNNING (`origin/staging`), not
     against the last commit.** So a migration merged three pushes ago still
     blocks until A has dealt with it.
3. `git push origin HEAD:staging` with the workflow's own token
   (`contents: write`). DigitalOcean sees the push and builds.
4. **Wait for the build to be the one running.** Poll
   `https://staging.bidridge.com/api/version` until `commit` equals this
   commit, up to 10 min. If it never does, **fail loudly**: DO kept the old
   version, which is the silent failure `deploying.md` warns about.
5. **A second, independent check that cannot be fooled by a file name:**
   `/api/version` reports `schema: "ok" | "behind"`. It gives no column
   names, because the endpoint is open without the staging password. The
   value comes from the server's existing `server/schemaCheck.ts`, run once
   at boot. **A small code change, A's.** If staging says `behind`, the job
   fails, whatever the diff said. The file check is a prediction; this is a
   measurement of the database itself.
6. Then the browser smoke test (§ 4).

**A pause switch.** The owner rechecks staging by hand (today's recheck
happened while staging was live), and a deploy mid-recheck swaps the build
under him. **A repository variable `STAGING_AUTODEPLOY=off`** makes step 3
refuse with "paused". Flip it in GitHub → Settings → Variables. No push is
needed.

---

## 4. Browser smoke test on staging — replaces the 13-step recheck

**Playwright, run by GitHub Actions after every staging deploy.** It
reports failures only: a green run says nothing, and a red run emails the
owner (GitHub's default) with a screenshot and a trace attached.

### Keeping it away from real data — four walls

1. **Host allowlist, in the test code itself:** the base URL must be exactly
   `https://staging.bidridge.com`, or the run aborts before opening a page.
   **`bidridge.com` and `www.bidridge.com` are refused by name.** Note that
   live has a "smoke account" (user 1421, used for hand checks in
   `deploying.md`). This test must never be pointed at it.
2. **Staging's database is not live's** (`bidrender_staging`, its own login,
   `deploying.md` § 11). GitHub holds no live credential at all.
3. **Its own account and company on staging**: `ci-smoke@…`, created once by
   A. The password and the staging password are GitHub secrets. It cannot
   see the owner's staging work, because data is scoped to the company
   owner.
4. **Throwaway bids:** every run creates `CI smoke <run id>`, and deletes it
   at the end, through the app, so plan files leave R2 too (`storageDelete`).
   A cleanup step first removes any `CI smoke …` bid on that account older
   than a day, so a crashed run cannot pile up.

**It never presses an AI button.** Staging has AI on with a real key (since
2026-09-29), and a call is money.

### What it does, in order (about 3 min)

1. Staging password page, then sign in as `ci-smoke`.
2. **Refresh bar:** load the app, fake an older build stamp, and confirm "A
   new version of BidRidge is available" appears and the page does not reload
   itself (recheck 4).
3. New bid. Proposal on the empty bid says "No work added yet", and Print
   is blocked with "Add work before sending" (recheck 1).
4. Upload a checked-in 1-page fixture PDF (~50 KB, a few symbols, a printed
   scale).
5. Plans: the tabs are there; set the scale; count 3 of one symbol with no
   assembly (8a); "Link assembly…" to a fixture assembly; the marks move with
   it.
6. Trace one run of the fixture run type. The count card and run card show
   the expected numbers.
7. **Refresh keeps place:** zoom, pan, F5, same sheet and zoom.
8. **"Not on the bid yet"**: the amber, grouped reasons, then Send all, which
   adds no second line on a second send (recheck 6, 7).
9. Undo/redo a mark; delete a mark and Undo it (recheck 5, 9).
10. The bid total on screen **equals the API's figure for the same bid**.
    That catches a screen showing yesterday's answer (CLAUDE.md, the
    staleness class).
11. Lock quantities: Send, a scale change and deleting a mark are each
    refused with one sentence (recheck 8).
12. Proposal opens and Print is no longer blocked.
13. **Phone pass:** at 390×844, the Plans panel goes full-screen with a
    Sheets tab. **Layout check:** no sideways scroll, and no text whose bottom
    is past the screen with no scrolling parent — the check CLAUDE.md
    describes, which found the cut-off totals.
14. Delete the bid.

**Selectors:** by role and visible text where it is stable, plus a handful of
`data-testid` on key controls (a small code change). Otherwise every wording
change the owner asks for breaks the smoke test, which is noise, and noise
teaches people to ignore red.

**What it replaces, and what it does not:**

- **Automated:** recheck items 1, 4, 5, 6, 7, 8, 9, the 8a link, the tabs,
  refresh-keeps-place, the amber "not on the bid" and phone layout at one
  size.
- **Not automated:** the fitting-labor caption's hover (item 3 is a
  wording check; covered by a unit test instead); the Reader jump (item 2),
  because it needs an AI call; and anything about feel (§ 7).

---

## 5. The "known answer" bid — any change that moves a number fails the gate

**A vitest test, `server/knownAnswerBid.test.ts`, run by the gate.** It
builds one bid through `appRouter.createCaller` on its own fixture company
and asserts every subtotal and the total due **as literals, to the cent**.

**Fixture prices only.** CLAUDE.md: tests must not borrow shipped prices or
rates. Every material, rate and band below is created by the test.

### Contents

| Part        | What                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Labor rate  | Journeyman **$50.00/h**                                                                                                                                                                                                   |
| Run type    | "KA 3/4 EMT, 3 #12 + #12 G": EMT **$0.80/ft**, #12 THHN **$0.10/ft** × 3 conductors + 1 ground, coupling **$0.50**, connector **$0.60**, strap **$0.25**; labor **0.040 h/ft**, which covers fittings (`a-fitting-labor`) |
| Runs        | **100.00 ft**, **47.50 ft** and **12.25 ft** traced, on a sheet at a stated scale. The 47.50 ft run has two **8 ft** verticals.                                                                                           |
| Counts      | 10 × "KA duplex" assembly (box $1.20, device $2.00, plate $0.50; **0.30 h**) and 4 × "KA switch" (box $1.20, switch $2.50, plate $0.50; **0.25 h**)                                                                       |
| Quoted line | "Permit", hand-priced **$150.00**                                                                                                                                                                                         |
| Expense     | Lift rental **$300.00**, a plain charge                                                                                                                                                                                   |
| Markup      | One accepted band, **20%** on all material (not a starter: starters apply nothing until accepted)                                                                                                                         |
| Overhead    | **10%**                                                                                                                                                                                                                   |
| Profit      | **10%**                                                                                                                                                                                                                   |
| Sales tax   | Enabled, **8.000%**, materials only                                                                                                                                                                                       |

### How the expected figure is made — two independent answers

The order is fixed by `references/material-markup.md`: material, then
markup per line, plus labor, equals subtotal; then overhead on the subtotal;
then profit on the subtotal plus overhead (D1); then charges and tax.

1. **By hand first.** Whoever builds it writes the worksheet into the test
   file's header: fitting counts per run, conductor feet including
   verticals, material $, markup $, labor hours and $, overhead $, profit $,
   tax base and tax $, total due.
2. **Then run the engine.**
3. **If the two disagree, that is a FINDING, not a snapshot to update.**
   Either the hand arithmetic or the engine is wrong, and which one decides
   what happens next.

**The fitting counts are not stated here on purpose.** How many couplings
and straps a 47.50 ft run takes is a rule in `shared/runFittingMaterials.ts`.
Writing a number here without reading that rule would be the unmeasured
number CLAUDE.md forbids. The hand worksheet reads the rule and cites it.

**Why subtotals and not just the total:** a red result then says WHICH step
moved, for example "overhead $41.20, expected $40.80". A bare total does
not.

**Changing it is allowed, and deliberate.** A change that is SUPPOSED to
move a number (a new rule, a fixed bug) updates the literals in the same
commit. The commit message says which figure moved, by how much and why,
like the bid 23 note in `deploying.md` § 11. Re-running and pasting the new
output is not that.

**The same bid on staging:** the smoke test (§ 4, step 10) checks that the
screen agrees with the API. Pinning the money on staging as well would need
the fixture prices in the smoke account, which is possible later but not
needed. The gate already pins the arithmetic.

---

## 6. Live release — one deliberate step by A

Unchanged in spirit from `deploying.md` § 4. Tightened in two places:

1. **Release exactly what staging tested.** `main` fast-forwards to
   **`origin/staging`'s commit**, not to the tip of `local-dev`, which may
   have moved since.
2. **Preconditions, checked rather than remembered:** the gate is green on
   that commit, the smoke test is green on staging at that commit, and
   `/api/version` on staging shows it with `schema: "ok"`.

**Then A:** applies any migrations to live with a fresh, verified backup
(`deploying.md` § 5a, three steps per file); pushes `main`; and confirms
`https://bidridge.com/api/version` shows the commit and a fresh `builtAt`.

**GitHub branch protection on `main`** (free on a public repo): only A may
push, and the gate must be green. **On `staging`:** only A and the workflow.
That makes "B and C never push main" a setting, not a sentence.

A later convenience, not needed: a manual "Release" workflow
(`workflow_dispatch`) that runs the precondition checks and the push, and
refuses while a migration is pending unless A ticks "applied to live".

---

## 7. What stays manual for the owner

- **A real phone and touch.** The smoke test's phone pass is a desktop
  browser at phone size, and B's phone layout has never been checked on a
  real device.
- **How a new screen feels**: weight, wording, whether the right thing
  catches the eye. CLAUDE.md's "looked at" rule stays, and the smoke test is
  not a substitute for it.
- **Hand counts** against the AI reader, and anything that spends AI money.
- **Printouts, emails** (reset and invites, once built), and the proposal on
  paper.
- **Migrations and live**, through A.

---

## 8. Build order — smallest useful piece first

| #   | Piece                                                                                             | Who                                  | Size       | Useful on its own because                      |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------- | ---------------------------------------------- |
| 1   | `scripts/seedBaseline.mts` + the gate workflow on `local-dev` only                                | **A** (or B)                         | half a day | every merge is tested from a clean database    |
| 2   | Gate on `track-b`, `track-c` and `a-*` + `drizzle-guard`; adopt the § 2 wording                   | A                                    | an hour    | B and C stop waiting                           |
| 3   | Branch protection on `main` and `staging`                                                         | **owner clicks**, A writes the steps | 15 min     | live cannot be pushed by accident              |
| 4   | Known-answer bid test                                                                             | **B** (knows the bid path) or C      | a day      | any moved number goes red                      |
| 5   | `/api/version` gains `schema`; `deploy-staging` job with the migration check and the pause switch | **A** (deploy and database)          | half a day | staging keeps itself current                   |
| 6   | Playwright smoke test on staging + the `ci-smoke` account + `data-testid`s                        | **B** (Plans screen), account by A   | 1–2 days   | the 13-step recheck stops being a person's job |
| 7   | Phone pass and layout check in the smoke test                                                     | B                                    | half a day | layout faults caught without a phone           |
| 8   | Release workflow (optional)                                                                       | A                                    | half a day | fewer steps to remember                        |

**C's natural piece:** sharding the suite (§ 1), and a known-answer
**materials list**, the same idea as piece 4 for the purchase list C owns.

---

## 9. Risks and open questions, in plain words

1. **The repository is public.**
   - Anyone can read the code, CLAUDE.md, the reference docs (bucket names,
     database names, the deploy procedure) and every past commit.
   - No `.env` file was ever committed (checked 2026-10-01), but a proper
     secret scan (gitleaks or similar) over the whole history has not been
     run.
   - Public makes Actions free. Private costs roughly $25–30/month at the
     rate in § 1.
   - **Owner's call. Recommend a secret scan either way, and private before
     the first outside invite.**
2. **A 7–12 minute gate is a wait.** Merges slow down, and two merges at once
   race. The merger watches `local-dev`'s run; sharding helps.
3. **A flaky gate is worse than none.** It teaches people to re-run rather
   than read. `todo.md` already lists a `materialsLibrary` flake. **Rule: a
   flake is fixed or the test is quarantined with a dated note, the same
   day.** Never "re-run until green".
4. **Auto-deploy could ship code that needs a migration not yet on staging.**
   Two guards: the `drizzle/` diff against what staging runs, and staging's
   own `schema` report. Either one refuses.
5. **The owner's recheck could be interrupted by an auto-deploy.** Use the
   pause switch (§ 3). **Open: should auto-deploy be on by default, or only
   when the owner is not testing?**
6. **The smoke test could touch real data if pointed wrong.** Guarded by the
   four walls (§ 4). The one that matters most is that **GitHub never holds a
   live credential**.
7. **Smoke tests rot** when wording changes. Hence `data-testid`s, and a
   failing smoke test is fixed before the next merge, like a red gate.
8. **The known-answer bid can be "fixed" by pasting new output.** The rule in
   § 5 only works if a moved figure gets a reason in the commit. Reviewing
   that is the owner's or A's job.
9. **React components still have no unit tests** (vitest covers `server/`,
   `client/src/lib`, `scripts/`). The smoke test is the only thing that sees
   a screen. CLAUDE.md's "a comment claiming something else handles it" class
   stays uncatchable except by the browser.
10. **Open: who fixes a red `local-dev`** when the merger is mid-task?
    Proposed: the merger, within the hour, or revert.
11. **Open: does DigitalOcean charge for build minutes** at this plan level,
    if staging builds several times a day? Not checked.

---

## SHORT SUMMARY

- No CI exists today: no Actions, no browser tests. Measured: on a fresh
  database the gate is migrate 23 s + check 8 s + suite ~7 min, and it needs
  one new 10-line seed script. Without it, 11 run-type tests fail; with it,
  they pass.
- B and C merge into `local-dev` themselves on green (pull first, never touch
  `drizzle/`, never push main or staging). Wording for all three terminals is
  in § 2, with a `drizzle-guard` job so the rule is enforced.
- Code-only changes auto-deploy to staging. A push carrying anything under
  `drizzle/` is refused, and staging's own `/api/version` schema flag is a
  second check. There is a pause switch for the owner's rechecks.
- A Playwright smoke test on staging (its own account, throwaway bids,
  host-locked, no AI) replaces most of the 13-step recheck. A known-answer
  bid pins every subtotal to the cent in the gate.
- **The repo is public.** Free Actions, but the code and docs are readable by
  anyone. Owner to decide; a secret scan is recommended either way.
