# Going private on GitHub — what it costs, and the options (Track A, 2026-10-16)

The repo `Jnicoara/BidRender` is still **public**, so Actions minutes cost
nothing today. This file says what the same work would cost private, and
what to do about it. It replaces the estimate in `private-repo-plan.md`
§ 1–3 (that file's history is kept), because the measured volume since then
is higher than its estimate.

## 1. Real minutes — MEASURED 2026-10-16, after the trim

Every workflow run of the last 7 days (2026-10-09 → 2026-10-16, 524 runs,
1,847 jobs), read job by job from the GitHub API and billed the way a
private repo is billed: **each job rounded UP to a whole minute**.

| Measure                                                        | Billed minutes |
| -------------------------------------------------------------- | -------------: |
| **Last 7 days, all runs**                                      |      **6,119** |
| → per 30 days                                                  |  **≈ 24,500** |
| Since the trim reached local-dev (2026-10-15 05:16 → now, 1.6 days, 181 runs) |  1,697 |
| → per 30 days at that (very busy, three overnight tracks) rate |       ≈ 31,000 |
| Runs that use the trimmed Gate only (86 runs)                  | 877 (≈ 10 per run) |

Where the 7 days went: `test` 4,131 · `smoke` 943 · `deploy-staging` 641 ·
`drizzle-guard` 403 (gone since the trim). By branch: track-c 2,079 ·
local-dev 1,818 · track-b 1,468 · track-a-night 307 · c-\* 294 · a-\* 153.
A green test job: median **9 min**. Runs cancelled since the trim: 22
(140 min).

**What the trim did, and did not do.** Per run it worked: the test share
of a run dropped, docs-only pushes went from a full run to ≈ 1 min, and a
commit already tested is not re-tested. But **the number of pushes went
up** (three tracks working through the night), and volume is what drives
the bill. Today's Gate fix (notes pushes no longer start the Gate, and can
no longer cancel a code run) trims a little more; it does not change the
picture.

**And private is slower.** GitHub gives public repos a 4-CPU runner and
private repos a 2-CPU one. The suite is CPU-bound, so expect the test share
(≈ 67% of minutes) to take 1.3–2× longer: **≈ 30,000–41,000 minutes a
month at today's push rate.** Not measurable until the switch.

## 2. What private costs — GitHub's current prices

From GitHub's billing docs (checked 2026-10-16, "GitHub Actions billing"):

- **Included:** GitHub Free 2,000 min/month; **GitHub Pro 3,000** (Pro is
  $4/month).
- **Linux 2-core: $0.006 per minute** after the included minutes (the
  January 2026 cut). Linux 2-core arm64 $0.005; 1-core Linux $0.002.
- **Self-hosted runners: free.** GitHub announced a $0.002/min charge on
  self-hosted minutes for March 2026, then **postponed** it in December 2025
  "to re-evaluate"; the billing docs today say self-hosted usage is free.
  It could come back.
- **No payment method = a hard stop.** On Free with no card, Actions are
  blocked once the 2,000 minutes are used — and the Gate IS the staging
  deploy path. At today's rate that is **about day 2–3 of the month**.
- Storage: 500 MB artifacts (Free), 10 GB cache — we are well under.

| At today's push rate                     | Minutes / month | Cost / month (Free) | (Pro, $4 + 3,000 incl.) |
| ---------------------------------------- | --------------: | ------------------: | ----------------------: |
| Public speed (measured)                  |        ≈ 24,500 |  ≈ **$135**         | ≈ $133                  |
| Private, 1.3× slower test share          |        ≈ 29,500 |  ≈ **$165**         | ≈ $163                  |
| Private, 2× slower test share            |        ≈ 41,000 |  ≈ **$234**         | ≈ $232                  |

(`(minutes − included) × $0.006`. Pro barely matters at this volume.)

## 3. Options

| Option | What it means | Cost / month | Testing lost | Risks |
| --- | --- | --- | --- | --- |
| **A. Pay** | Card on file, an Actions budget (e.g. $250) with the 90 % alert | ≈ $135–235 | none | grows with every new track or overnight run |
| **B1. Self-hosted on your laptop** | A runner service on the laptop; MySQL is already there | $0 (today) | none | laptop memory is already critical; the laptop must be on and awake for any Gate to run; Gate jobs and three tracks' work compete on one machine; a runner on a personal machine runs whatever a workflow says |
| **B2. Self-hosted on a droplet** | 2 vCPU / 4 GB ($24) or 4 vCPU / 8 GB ($48) DigitalOcean droplet running the GitHub runner + MySQL; smoke still targets staging | $24–48 (+ the postponed $0.002/min if it returns ≈ $50–80) | none | one more machine to patch; jobs run one at a time per runner (a queue at night) |
| **C. Fewer runs** | Track WIP pushes run typecheck + changed tests only; the full Gate runs on demand before a handoff and always on local-dev | ≈ 8,000–12,000 min → ≈ $35–60 (or $0 with B2) | WIP pushes lose the full suite; nothing reaches local-dev untested | a track can drift red for a day between handoffs (exactly today's hole, in a milder form) |
| **D. Stay public until beta** | Do nothing now | **$0** | none | the code is readable by anyone until then; nothing secret is in the repo (secrets live in DO / GitHub secrets) |

## 4. My pick

**D now, then B2 at the switch.** Stay public until beta: it costs nothing
and loses no testing, and nothing in the repo is a credential. When going
private, put the Gate on **one 4 vCPU / 8 GB droplet ($48)** — the price
does not grow with pushes, it runs the private-speed problem away (4 CPUs,
like today's public runner), and it keeps your laptop out of it (B1 is
ruled out by the laptop's memory). Keep a card on file with a **$50 Actions
budget** as the fallback, so a dead droplet slows the Gate to GitHub's
runners instead of stopping it. Add C only if the droplet queue gets long.

If the date to go private cannot wait for the droplet: **A with a $250
budget** for that month — never Free with no card (the Gate and staging
deploys would stop around day 2–3).

## 5. The one-minute DigitalOcean check (before or right after switching)

Both apps read the repo through DigitalOcean's GitHub App, which keeps
working when the repo is private — **if** the setup is what the docs say
(`private-repo-plan.md` § 4). Check:

1. **DigitalOcean → each app** (live and `bidrender-staging`) → Settings →
   App Spec: the source block says `github:` with `repo: Jnicoara/BidRender`
   and `deploy_on_push: true` — **not** `git:` with a `repo_clone_url`.
2. **GitHub → Settings → Applications → Installed GitHub Apps →
   DigitalOcean** → Repository access includes `BidRender`.
3. **After switching:** re-run a local-dev Gate (or push a harmless commit)
   and confirm staging's `/api/version` moves to that commit.

If (1) says `git:`, the app would stop deploying the moment the repo goes
private: switch the source to the GitHub integration first.
