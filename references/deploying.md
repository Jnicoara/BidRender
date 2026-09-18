# Deploying BidRender

Reference for the deploy sequence summarised in `CLAUDE.md` § Deploying.

---

## 1. The one fact that explains everything

**Pushing `main` deploys the live site.** DigitalOcean App Platform watches the
`main` branch of `Jnicoara/BidRender` and rebuilds on every push. There is no
button to press afterwards and no second step to remember.

That means there is no dry run. A push to `main` reaches the people using the
app, usually within five minutes.

| Action                       | Effect on the live site                       |
| ---------------------------- | --------------------------------------------- |
| Commit in the local checkout | None.                                         |
| `git push origin local-dev`  | None. This is the safe place to put work.     |
| **`git push origin main`**   | **Deploys.** Builds and goes live on its own. |

> **This reversed on 2026-09-16.** It used to be the opposite — pushing did
> nothing, and a human pressed Deploy inside Manus. Anything you read anywhere
> that describes a Manus session, a sandbox pre-flight or a checkpoint is from
> that era and no longer applies. The one thing that did NOT change: migrations
> still do not travel with a deploy (§ 5).

## 2. The habit: land on `local-dev` first

Work goes to `local-dev`, which deploys nothing. It moves to `main` only when
you have decided it should be live.

This is a habit rather than a rule enforced anywhere, and it is the only thing
standing between a routine push and an unplanned deploy. `main` has no branch
protection; nothing will stop you.

**Merging `local-dev` into `main` is the deploy.** Do it deliberately:

```bash
git checkout main
git merge --ff-only local-dev     # refuses if it is not a clean fast-forward
git push origin main              # ← this is the moment it goes live
git checkout local-dev            # go back, so the next edit is not on main
```

`--ff-only` is worth keeping. If it refuses, `main` has something `local-dev`
does not, and you want to find out before deploying rather than after.

## 3. Before you push `main`

Three questions, and they take about a minute.

```bash
git log main..local-dev --oneline    # what is about to go live
git status --porcelain               # uncommitted edits — expect empty
pnpm check                           # TypeScript, the correctness gate
```

- **Read the first list.** It is the entire change set the deploy carries. If
  anything in it surprises you, stop.
- **Does it add a migration?** (`drizzle/` changed.) Then § 5 applies and the
  migration has to be run by hand — it does not ride along.
- **Write down what is live now**, so "roll back to what?" has an answer:

```bash
git log --oneline -1 origin/main
```

## 4. Deploy sequence

1. **Pre-flight** — § 3 above.
2. **Merge and push `main`** — § 2. The build starts by itself.
3. **Watch the Activity tab** — § 4a. Do not walk away; a failed build is
   quiet unless you are looking at it.
4. **Run migrations if there are any** — § 5. They do **not** deploy with the
   code, and a missed one does not crash the app, it serves wrong data.
5. **Verify** — § 6.
6. **Deploy any new scheduled job separately** — § 7. The cron Worker is not
   part of this deploy and never has been.

### 4a. Watching it, and rolling back

**DigitalOcean dashboard → your app → Activity.** Every deploy is listed with
its status. A normal one takes roughly three to six minutes and finishes as
**Deployed**. Watch it rather than assuming: a build that fails leaves the
previous version running, so the site stays up and nothing tells you the new
code never arrived.

**To roll back — same tab.** Find the last deployment that succeeded and press
**Rollback**. It restores that build in a couple of minutes and touches neither
GitHub nor your local checkout. **This is the fastest way out of a bad deploy**
and the first thing to reach for.

Rolling back the code as well, when you want `main` to match what is running:

```bash
git revert --no-commit <bad-commit>...<bad-commit>
git commit -m "Revert <what>"
git push origin main
```

That undoes the change as a _new_ commit and triggers a fresh deploy. Slower
than the Activity-tab rollback, but it keeps the history honest — prefer it
over force-pushing `main`, which rewrites what everyone else has.

**A rollback does not undo a migration.** Migrations are forward-only here, so
rolling the code back to before a schema change leaves the database ahead of it.
Usually harmless — extra columns nothing reads — but check § 5 before assuming.

## 5. Migrations are the sharp edge

`pnpm db:push` is step 4 rather than an afterthought because a skipped migration
**does not fail loudly**. The server starts, serves pages, and renders wrong
data. `.claude/skills/run-bidrender/SKILL.md` documents the symptoms in detail:
a single `Seed failed: ... Unknown column` line in the log at startup, materials
rendering as one flat list with no categories, and per-material trade slang
finding nothing while the global alias map keeps working — so search looks fine
until someone tries "1900" or "gem box".

**It does not always fail quietly, though — sometimes it takes a whole screen
with it.** Nearly every read in this app is a bare `select()`, which drizzle
expands to _every_ column in `drizzle/schema.ts`. A database one migration
behind therefore does not lose one field; the entire statement fails with
`Unknown column`, and the feature behind it dies. That is what happened to the
bid archive: `getArchivedBids` names `isSample` (0043) and the four tax columns
(0036) whether or not any bid uses them, so an environment without those
migrations threw on opening the archive. The query was fine. The database was
behind.

Ask the database directly, rather than counting files:

```bash
pnpm tsx scripts/schemaDrift.mts
```

It prints how many migrations that database has recorded and exactly which
columns the code expects that it does not have, and exits non-zero on drift.
Run it **before** `pnpm db:push` to see what is pending and **after** to confirm
it took. When in doubt, run `pnpm db:push` anyway — it is idempotent.

The same check runs as `server/schemaDrift.test.ts`, so a column added to the
schema without its migration fails on the author's machine rather than in
somebody else's console a week later.

### A new database has to build from the files alone

Moving to new hosting means applying every migration to an empty database —
something the live database never had to do, because it was built one
migration at a time as they were written, on TiDB. Until v5.118 that stopped
at 4 of 44 on MySQL 8, twice over: 0004 named a constraint in 65 characters
(MySQL allows 64), and 0032 used `ADD COLUMN IF NOT EXISTS`, which TiDB
accepts and MySQL 8 refuses. `server/migrationRun.test.ts` reads every
migration file for both mistakes, and checks the journal's dates are in order.

Nobody saw it because `drizzle-kit migrate` never prints the error — it redraws
its spinner and exits 1. So `pnpm db:push` runs `scripts/migrate.mts` instead:
the same migrator, but a failure names the file, the statement and MySQL's
reason. When one stops partway, the statements before it in that file have
already happened — MySQL cannot undo a table change — so running again repeats
them. On an empty database, drop it and start over.

**Correcting an old migration file is safe for databases that already ran it.**
drizzle does not compare file contents with what a database ran; it runs only
the journal entries dated after the newest one the database has recorded. The
flip side: a new migration must be dated after every existing one, or every
existing database skips it without a word.

### The DigitalOcean database is built from the migrations. Do NOT restore the Manus backup into it.

Build the tables by running the migrations against an empty database, then load
only the DATA from the backup. Restoring the backup file as-is would also
restore Manus's table definitions and Manus's record of which migrations ran,
and that is the part that cannot be undone later.

Why:

- **The live database is missing 5 foreign keys and 9 indexes.** Migration 0004
  failed partway on TiDB in July (a constraint name one character over MySQL's
  limit) and was marked applied by hand, so everything after that statement in
  the file never ran. 0012's foreign key is missing too.
- **Restoring would make those gaps permanent.** The backup carries drizzle's
  migration ledger, so migrations would consider themselves done and never add
  the missing pieces. Nothing would ever report it.
- **`assemblies.laborRateId` → `labor_rates` is one of the five, and it is
  current, not legacy.** It should clear an assembly's labor rate when that rate
  is deleted. On the live database it does not exist, so deleting a labor rate
  today leaves assemblies pointing at a rate that is gone. Building fresh fixes
  it; restoring carries the fault across.
- **The text-comparison settings would be mismatched.** Live tables were created
  `utf8mb4_unicode_ci`; a fresh MySQL 8 build uses `utf8mb4_0900_ai_ci`. A
  database holding both — restored tables plus any created later by a migration
  — throws "Illegal mix of collations" when a query compares text from two of
  them.
- **The backup is mostly test data anyway**: 73 of its 75 accounts are test
  accounts, and the 4,240 bids in it are fixtures.

So: `pnpm db:push` against the empty DigitalOcean database first, confirm 44 of
44 applied, and only then load the rows that are actually wanted. The other four
missing foreign keys and the nine indexes are on the retired `master_*` /
`project_*` tables and come back for free the same way.

### 5a. Running a migration against production — the checklist

Written 2026-09-18, for the Phase 5 verticals migrations (0046–0052) and every
one after them. **Read it as a procedure, not as background.** Each step has one
command and one thing to look at; do them in order and stop at the first one
that does not say what it should.

**It is a fresh-morning job.** Seven steps that each want your full attention is
not an end-of-day task, and nothing about a migration is urgent — an additive
migration can wait as long as you like, because the site runs perfectly well
without it.

#### Before step 1: this machine cannot reach production yet

`.env.production.local` has **`DATABASE_URL=`** — empty — and no
`DATABASE_CA_CERT` at all. Both are required (§ 3 of
`references/database-digitalocean.md`), and both live **only in DigitalOcean's
environment**: App Platform → the app → Settings → App-Level Environment
Variables.

Copy them into `.env.production.local`. That file is gitignored and already
holds the R2 secrets, so it is the right home; it is also a file full of
credentials, so do not paste its contents anywhere, and consider blanking
`DATABASE_URL` again when you are done.

Everything below assumes those two values are in place. Every command names the
file explicitly rather than relying on the shell, because a migration that runs
against the wrong database is the one mistake here with no undo.

#### The order, and why it is not the obvious one

**Migrate FIRST. Deploy SECOND.** Nearly every read in this app is a bare
`select()` that expands to every column the RUNNING build knows about, so:

- new code against an old database → `Unknown column`, and the whole takeoff
  screen dies;
- old code against a new database → the extra columns are simply ignored.

So the database goes first and the site carries on unchanged until you choose
to deploy. They are two separate decisions on two separate days if you like.

#### 1. Take a fresh backup

```bash
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/backup.mts
```

Minutes before, not last night's. Note the run id it prints.

#### 2. Prove that backup actually restores

```bash
DOTENV_CONFIG_PATH=.env.production.local \
VERIFY_DATABASE_URL=mysql://root:pass@localhost:3306/mysql \
pnpm tsx scripts/verifyBackup.mts
```

`VERIFY_DATABASE_URL` is a MySQL server **you** control — the local one is
fine. It downloads what is really in the bucket, restores it into a scratch
database and compares the result against the manifest.

**What this step does NOT do is rehearse the migration.** It drops its scratch
database when it finishes (`server/backup/verifyBackup.ts`), so there is
nothing left to migrate. That is step 3, and it is a separate job.

#### 3. Rehearse the migrations on production's DATA

The point of this step is not the schema — the local database already proved
all seven apply cleanly to an empty-ish one. The point is **production's rows**:
statements 0051 and 0052 add foreign keys, and MySQL validates a foreign key
against every existing row. Local has a handful of runs; production has real
ones.

So: restore the dump from step 1 into a scratch database that PERSISTS, point
`DATABASE_URL` at it, and run

```bash
pnpm tsx scripts/migrate.mts
pnpm tsx scripts/schemaDrift.mts
```

Expect seven applied and no drift.

> **Worth building before the next migration:** a `KEEP_SCRATCH=1` flag on
> `verifyBackup.mts` would make steps 2 and 3 one command instead of a manual
> restore. It drops the schema unconditionally today.

#### 4. Ask production what it is missing

```bash
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/schemaDrift.mts
```

Expect it to name exactly what you are about to add. For Phase 5 that is three
tables and the columns on `bids` and `takeoff_runs`.

#### 5. Run it

```bash
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/migrate.mts
```

`pnpm db:push` also works, but it runs `drizzle-kit generate` first, which can
write a new migration file you did not ask for. **Prefer `migrate.mts` on
production**: it applies what is already in `drizzle/` and nothing else.

Expect `Applied 7 migrations: 0046_magical_electro to 0052_windy_sunspot.`

#### 6. Ask again

```bash
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/schemaDrift.mts
```

Expect `Database matches the schema.` **If it still names something, stop here
and do not deploy.** The site is fine — it is running the old code, which does
not know about any of this.

#### 7. Open the live site, still on the OLD code

Check a bid's takeoff totals read the numbers they read yesterday. **This step
has to be boring.** Old code against a new database should be completely
unremarkable, and if it is not, you have found something worth knowing before
any new code ships.

Only then is the deploy a separate decision — § 4 of this document.

#### If a step fails

Every migration in this set is **one statement in one file**, deliberately (see
the header comment in `drizzle/0046_magical_electro.sql`). So a failure can only
mean "that statement failed and nothing was applied":

- `scripts/migrate.mts` names the file, the statement and MySQL's own reason —
  unlike `drizzle-kit migrate`, which redraws its spinner and exits 1.
- The files before it stay applied and are harmless on their own.
- Nothing live depends on any of it, because the code has not shipped.
- Fix the one file and run step 5 again. It resumes where it stopped.

**Rollback is not on the menu, and that is by design.** Migrations here are
forward-only. If the code is later rolled back, the columns stay behind — empty,
read by nothing. That is why step 3 exists.

#### The two statements most likely to fail

`0051` and `0052` each add a foreign key from `takeoff_runs` to
`takeoff_stamps`. A foreign key is checked against every existing row, and this
database is **already missing five foreign keys** from the 0004 incident in July
— so it is the statement type with history here. Both are in their own file for
exactly that reason.

## 6. Verifying a deploy actually took

A deploy that silently didn't take looks identical to one that did, so check
something that could only be true of the new build:

- **The navigation helper** (Dashboard → "Ask where to find something") is still
  the cheapest probe, because it needs `ANTHROPIC_API_KEY` — which is set in the
  deployed environment and is switched off locally by `DISABLE_AI_FEATURES=true`
  in `.env`. A working answer proves the deployed environment has its secrets,
  not just its code. It used to be recommended for reaching the Manus gateway;
  that is no longer what it exercises.

  Read the result carefully. Every AI feature here degrades to something useful
  rather than erroring, so a **plain text answer with no button** may be the
  graceful fallback — which means the key is missing or the daily allowance is
  spent. A returned screen **and** a button is the pass.

- **The version tag** in the sidebar footer (hover to reveal) reads
  `APP_VERSION` from `shared/version.ts`. If it shows an older number than the
  one on `main`, the deploy did not take.
- **A schema-dependent screen** — Materials grouped into categories, with "1900"
  and "gem box" returning hits. Proves step 4 ran.

## 7. Scheduled jobs need a second, manual step

Deploying a handler under `/api/scheduled/` does **not** schedule it. The thing
that calls it on a timer is a **Cloudflare Worker in `workers/cron/`**, deployed
separately with `wrangler` **from a local checkout** — not from the app's host,
and not by pushing to GitHub. It ships on its own clock and is easy to forget.

```bash
cd workers/cron
npx wrangler deploy                    # 1. create the Worker
npx wrangler secret put CRON_SECRET    # 2. then give it the secret
```

**That order.** A secret cannot attach to a Worker that does not exist yet.

`CRON_SECRET` must be byte-identical to the value in the DigitalOcean
environment. Note that `.env` and `.env.production.local` hold **different**
values — the production one is in `.env.production.local`.

Both jobs, **five fields, UTC** — standard cron, no seconds field:

| Job                | Cron          | Pacific (summer / winter) |
| ------------------ | ------------- | ------------------------- |
| Backup             | `0 9 * * *`   | 2:00am / 1:00am           |
| Archived-bid purge | `30 10 * * *` | 3:30am / 2:30am           |

The purge stays **90 minutes behind** the backup on purpose: it permanently
destroys bids whose archive window has closed, and going second means the
night's backup still contains what it is about to remove. Moving either job
means moving both — the times are restated in `workers/cron/wrangler.toml`
because TOML cannot import from TypeScript, and `server/scheduledBackup.test.ts`
asserts the two agree.

**Verify the triggers attached; do not trust "deploy succeeded."** A deploy can
report success and leave the Worker with no timer at all, which looks healthy
and silently never runs. Check Cloudflare → Compute (Workers) →
`bidrender-cron` → Settings → Triggers → Cron Triggers. The subdomain trap that
causes this — and the fact that registering a workers.dev subdomain is an
interactive prompt a non-interactive shell declines on its own — is written up
in the comment at the top of `workers/cron/wrangler.toml`.

`references/periodic-updates.md` is the full reference for the cron system, and
`references/backups.md` § 4 covers the backup job specifically.
`CLAUDE.md` § Scheduled work explains why failure here points at "keeps too
much" rather than "deletes too early".

## 8. Outside services the app cannot run without

Relevant when anyone proposes hosting this elsewhere. **The app no longer
depends on any Manus service** — the move completed in September 2026, and
nothing here is a platform lock-in any more. What it does depend on:

| Service               | Env                                    | What breaks without it                                                                                       |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| MySQL database        | `DATABASE_URL`, `DATABASE_CA_CERT`     | Everything.                                                                                                  |
| Cloudflare R2, plans  | `R2_PLANS_*` (4) + `PLAN_STORAGE=r2`   | Plan upload and viewing. Logos too — they ride the same pipe.                                                |
| Cloudflare R2, backup | `R2_*` (4) + `R2_PLANS_READONLY_*` (2) | Backups. Missing the read-only pair makes the backup **refuse to start** rather than silently skip files.    |
| Anthropic             | `ANTHROPIC_API_KEY`                    | The plan reader, navigation helper and alias suggester. All three degrade gracefully, so this fails quietly. |
| Cloudflare Worker     | `CRON_SECRET`, matching the Worker's   | Both scheduled jobs (§ 7).                                                                                   |

**Sign-in is not on this list, and that is the point.** Email and password with
bcrypt, in our own `users` table (`server/routers/authRouter.ts` — `signup`,
`login`, `changePassword`), shipped in v5.127/5.128. It moves with the database
and needs no outside service at all. The legacy OAuth path still exists in
`server/_core/sdk.ts` but nothing depends on it.

Earlier versions of this section said leaving the old platform meant building a
login system. It did not, and it was the single most expensive wrong sentence in
these docs — it is the line someone reads to size the job.

**`JWT_SECRET` serves files as well as sessions.** Storage URLs carry a signed,
expiring token in the path (`server/storageTokens.ts`) because the proxy would
otherwise hand any stored object to any caller. The same secret signs both, so
an environment missing it does not merely fail to log people in — it cannot
serve a plan sheet or a logo either, and says so rather than serving them
unsigned.

**`JWT_SECRET` now serves files as well as sessions.** Storage URLs carry a
signed, expiring token in the path (`server/storageTokens.ts`) because the
proxy would otherwise hand any stored object to any caller. The same secret
signs both, so an environment missing it does not merely fail to log people in
— it cannot serve a plan sheet or a logo either, and says so rather than
serving them unsigned.

**Gotcha:** an error reading `OPENAI_API_KEY is not configured` can still appear
(`server/_core/llm.ts`). **There is no OpenAI dependency anywhere in this app**
and no such variable is wanted. It comes from the old Manus gateway shim, which
is still present but dead on this host — the app runs on `ANTHROPIC_API_KEY`
through `server/llm`, and only falls through to that shim when the Anthropic key
is absent. So the message means "no Anthropic key", worded by the wrong layer.
It has sent one investigation down the wrong path already. Removing the shim is
tracked in `todo.md`.

## 9. Storage needs a CORS rule, and without it no plan uploads

> **Configured — this is no longer an outstanding issue.** The rule is on the
> `bidrender-plans` R2 bucket and covers six origins: `https://bidridge.com`
> and `https://www.bidridge.com` (added 2026-09-17 with the domain move),
> `https://bidrender.com` and `https://www.bidrender.com` (kept — they redirect,
> but a rule costs nothing and removing it is a way to break an old link nobody
> has retired yet), the `ondigitalocean.app` host, and
> `http://localhost:3000`.
>
> Kept in these docs because it explains a failure that looks like an app bug
> and is not — and because **a new origin needs the rule adding by hand.** A
> staging site or another renamed domain will upload plans fine under 25MB via
> the fallback and fail above it, which is the confusing way round.

Without it, plan PDF upload fails for every file at every size, having
transferred zero bytes, because the bucket does not publish a CORS rule for the
site's origin.

### Why a bucket setting breaks the app

Uploads go browser → S3 directly through a presigned PUT, so the app can accept
files far larger than a request body limit allows (`server/routers/bidPdfsRouter.ts`
explains that design). A cross-origin `PUT` is **always** preflighted — there is
no way to make one a "simple" request, because PUT is not a CORS-safelisted
method. So the browser sends `OPTIONS` first, and if the bucket has no matching
CORS configuration the upload is refused before a single byte of the file is
sent.

The tell is exact and worth memorising: **the progress bar never moves.** A
transfer that climbs and then dies is a different problem. `shared/uploadDiagnosis.ts`
now reports the two differently, so the message on screen says which.

### The configuration required

The `bidrender-plans` R2 bucket needs a rule permitting the deployed origin to
PUT, and exposing nothing it does not need to. Set it in the Cloudflare
dashboard under R2 → `bidrender-plans` → Settings → CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://<the deployed site origin>"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`AllowedHeaders` must include `Content-Type`: the upload sends
`Content-Type: application/pdf`, and that header is precisely what forces the
preflight in the first place. Logo upload (`BrandingSection`) uses the identical
mechanism and is fixed by the same rule.

**`ExposeHeaders` must include `ETag`.** A large plan goes up in 16MB pieces,
and each piece's `ETag` is the receipt R2 returns for it; without those receipts
the pieces cannot be reassembled and the upload fails at the end, after the
transfer rather than before it.

This is a Cloudflare bucket setting, not something in this repo — no file here
can change it. It **can** be tested from a local checkout: `pnpm dev:r2` points
a local run at the real bucket, borrowing only the `R2_PLANS_*` credentials.

### If it is ever missing again

`server/planUpload.ts` is a fallback: the browser POSTs the file to
`/api/plan-upload` on our own origin, which cannot be refused by a bucket
policy, and the server forwards the bytes on. The client tries the direct PUT
first and only falls back when it is blocked, so **the moment the CORS rule is
added the app returns to the direct path on its own** with nothing to switch
back.

The fallback is capped at 25MB (`PROXY_UPLOAD_MAX_BYTES`) because it goes
through the host's request body limit — the very ceiling the direct upload was
built to avoid. So whenever CORS is missing, plan sets over 25MB cannot be
attached at all, and the app says so in those words rather than claiming the
file is too large.

That cap is also why a working upload is **not** proof the CORS rule exists: a
small file succeeds either way, quietly taking the slow path. § "Verifying"
below has a probe that actually distinguishes them.

### Verifying

**A successful upload does not prove the rule is there** — without it the client
silently falls back to the same-origin route, which works for anything under
25MB. To actually check, ask the bucket directly:

```bash
curl -i -X OPTIONS "https://<account>.r2.cloudflarestorage.com/bidrender-plans/probe" \
  -H "Origin: https://bidrender.com" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type"
```

A `204` naming the origin back means the rule covers it. Then make a real ranged
`GET` and look for `ETag` in `Access-Control-Expose-Headers` — **exposed headers
never appear on the preflight**, so a preflight alone cannot tell you whether a
large multi-part upload will reassemble.

Failing that, attach a plan **over 25MB**. Under that size the fallback hides
the answer; over it, only the direct path can succeed.
