# Going private — GitHub minutes, the Gate, and DigitalOcean

Track A, 2026-10-14 night. The repo `Jnicoara/BidRender` is **public today**
(checked with `gh api`); it goes private on 2026-10-15. Public repos run
Actions free and unlimited; private ones get **2,000 free minutes a month**
on GitHub Free (3,000 on Pro), then bill per minute.

## 1. What we use today — MEASURED, not estimated

Every Gate run since the Gate began (2026-10-01 22:52 → 2026-10-15 04:52 UTC,
13.25 days, 633 runs), read job by job from the GitHub API. Billed the way a
private repo is billed: **each job rounded UP to a whole minute**.

| Where the minutes went (13.25 days)         | Billed minutes |
| ------------------------------------------- | -------------: |
| `test` job                                  |          5,583 |
| `smoke` (staging browser test)              |          1,120 |
| `deploy-staging` (mostly waiting on DO)     |            603 |
| `drizzle-guard` (8 s of work, 1 min billed) |            374 |
| **Total**                                   |      **7,680** |
| **Per 30 days**                             |   **≈ 17,400** |

By branch: local-dev 3,702 · track-b 1,595 · track-c 1,410 · a-_ 726 ·
c-_ 228. Of all runs: **202 pushes changed only documentation** (2,261 min),
**102 test jobs re-tested a commit that had already passed** (927 min),
449 min were runs cancelled by a newer push.

A green test job: median **9.1 min**, p90 11.9 (`Test suite` itself is
~11.5 min of a 12-min job on the run looked at; install 3 s, typecheck 31 s,
migrate 12 s). Smoke median 6.1, deploy wait 3.1.

**That is ~8.7× the free allowance, before the next point.**

### Private repos get a SMALLER machine

GitHub's standard runner is 4 CPUs / 16 GB for public repos and **2 CPUs /
7 GB for private** ones. The suite is CPU-bound and parallel, so expect the
`test` job to take longer once private — plausibly 1.3–2× (not measured: it
cannot be until the repo is private). The figures below are at TODAY's speed
and will rise by that factor on the test share.

## 2. What changed in the Gate (on `track-a-night`, not yet on local-dev)

`.github/workflows/gate.yml`. Nothing that can change a result is tested
less; the job first decides how much testing the push needs:

- **DOCS** — every changed file is `*.md` or under `references/`: run only the
  tests that READ docs (`.github/docs-only-tests.txt`: sourceHygiene, the
  starter-assemblies plan + seed checks, and the guard itself), no database,
  **no staging deploy, no smoke**. `server/docsOnlyGate.test.ts` re-derives
  the list from the code and goes red if a doc-reading test is missing from
  it (proved: red with one entry removed). Staging picks the docs commit up
  with the next code push.
- **SEEN** — this exact commit already passed the full `Test suite` step in
  another Gate run (a track tip fast-forwarded onto local-dev): skip the
  suite, still deploy and smoke. Same commit = same files = same result. Only
  a run whose `Test suite` step passed counts, so a DOCS or SEEN run can never
  vouch for a commit.
- **FULL** — everything else, including pull requests, new branches, force
  pushes, and any API failure.
- **drizzle-guard folded into the test job** as its first step (a separate
  job is billed a whole minute for 8 seconds).
- **Smoke only when something deploys** — this was already true (it only
  follows a staging deploy, only on local-dev); it now also skips DOCS pushes.
- **Not a saving but a fix, same night:** the test job's MySQL is now the one
  preinstalled on the runner. AWS's public image mirror refused EVERY track's
  pull on 2026-10-14 ("toomanyrequests: Data limit exceeded"), after Docker
  Hub did on 10-09 — the Gate could not run at all.

### The new number

Replaying the same 633 runs under the new rules (DOCS billed 1 min, SEEN
1 min plus its deploy and smoke): **7,680 → 4,429 minutes**, so
**≈ 17,400 → ≈ 10,000 a month (−42%)**. Per 30 days by branch: local-dev
≈ 4,800, track-b ≈ 2,500, track-c ≈ 1,550, a-\* ≈ 1,150.

**That is still ~5× the free 2,000, and more once the 2-CPU runner slows
the suite.** No change that keeps "nothing that matters gets less testing"
gets near 2,000 at today's push rate (~48 Gate runs a day across three
tracks). The rest is a decision with money in it — see
`morning-questions-a.md`.

## 3. Options beyond tonight's change (owner's call)

Rough monthly figures at the new ~10,000 and today's speed. GitHub Linux
2-core is **$0.006/min** after the January 2026 price cut (third-party
summaries of GitHub's pricing page; check Settings → Billing before
deciding).

| Option                                                                                                                  | Testing lost                                                                | Cost / month                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A. Pay the overage (set an Actions budget)                                                                              | none                                                                        | ≈ 8,000 × $0.006 ≈ **$48**, more with the slower runner                                                                        |
| B. Self-hosted runner on a small droplet (2 vCPU / 4 GB, MySQL on it)                                                   | none                                                                        | droplet ≈ $24; GitHub minutes ≈ 0 (a $0.002/min self-hosted fee was announced for March 2026 and reportedly postponed — check) |
| C. Track WIP pushes run typecheck + only changed test files; full Gate on demand before a handoff (`workflow_dispatch`) | WIP pushes lose the full suite; every commit still gets it before local-dev | track minutes ≈ −60–75% → total ≈ 6,000                                                                                        |
| D. A works on a track branch too, so local-dev only ever fast-forwards to tested tips                                   | none (local-dev runs become SEEN)                                           | local-dev test share ≈ −1,800                                                                                                  |
| E. Keep the repo public                                                                                                 | none                                                                        | $0                                                                                                                             |

**Whatever is chosen, the one thing that must not happen:** GitHub Free
with no payment method has an Actions spending limit of $0, so once the
2,000 minutes are gone **every workflow stops until the 1st** — and the Gate
IS the staging deploy path. At ~10,000/month that would be around day 6.

## 4. DigitalOcean after the switch — read from our docs, not the dashboard

Both apps were created by choosing **the GitHub repo** in App Platform's
wizard, with **autodeploy on push** (`deploying.md` § "How it was created",
`stage-4-safety-plan.md` § D). App Platform only offers autodeploy for a repo
reached through its GitHub integration (the DigitalOcean GitHub App); a
public "Git repository URL" source cannot autodeploy. So both apps read the
repo **through the GitHub app connection, which keeps working when the repo
is private** — provided the app's installation covers this repo.

**Not verified against the live config tonight** (no DigitalOcean access
from here, and the rule was read-only from docs). One-minute check for the
owner, before or right after switching:

1. DigitalOcean → each app (live and `bidrender-staging`) → Settings → App
   Spec: the source block says `github:` with `repo: Jnicoara/BidRender` and
   `deploy_on_push: true` — **not** `git:` with a `repo_clone_url`.
2. GitHub → Settings → Applications → Installed GitHub Apps → DigitalOcean →
   Repository access includes `BidRender` ("All repositories", or it is in
   the selected list).
3. After switching: push something harmless to `staging` (or re-run a
   local-dev Gate) and confirm staging's `/api/version` moves. If DO had been
   reading a public URL, this is where it would fail.

Nothing else found that needs the repo public: no code fetches from
`raw.githubusercontent.com` or the GitHub API; the cron Worker deploys from
a local checkout; the smoke's failure traces are already sealed.
