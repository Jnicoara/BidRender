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
  migration has to be run by hand — it does not ride along. **Sort the files
  first**: the additive ones run BEFORE this push, the backfills after it.
- **Write down what is live now**, so "roll back to what?" has an answer:

```bash
git log --oneline -1 origin/main
```

## 4. Deploy sequence

> **`main` only ever fast-forwards to a commit that already passed the gate.**
> Added 2026-10-01. GitHub's ruleset on `main` requires the **test** check
> (`.github/workflows/gate.yml`) to be green ON THE COMMIT being pushed, so a
> commit made on `main` itself — a hand edit, a merge commit, a revert — is
> refused, because it has never been through the gate. So:
>
> - **Release what staging tested.** `main` moves to **the commit staging is
>   serving** (`curl -s https://staging.bidridge.com/api/version`), by
>   `git merge --ff-only <that commit>` — not to the tip of `local-dev`, which
>   may have moved since. That commit passed the gate on `local-dev`, was
>   deployed to staging, and passed the browser smoke test there (§ 12).
> - **`--ff-only` refusing is a stop sign**, not something to work around:
>   `main` has something you have not seen.
> - **A revert goes through `local-dev` too** — § 4a.

0. **Staging first.** Code-only changes reach staging BY THEMSELVES now: a
   green push to `local-dev` is pushed to `staging` by the gate workflow, which
   waits for staging to serve it and then runs the browser smoke test (§ 12).
   A push that changes anything under `drizzle/` is REFUSED there — apply its
   migrations to staging by hand (`.env.staging.local`, § 5), then
   `git push origin local-dev:staging` yourself. To stop the automatic push,
   set the repository variable `STAGING_AUTODEPLOY` to `off` (GitHub →
   Settings → Secrets and variables → Actions → Variables).
1. **Pre-flight** — § 3 above. Then confirm the release commit is green: the
   Actions tab shows **Gate** passed for it on `local-dev`, including the
   **smoke** job.
2. **Sort the migrations, if there are any** — § 5, "Which goes first". Each
   **file** is either additive or a meaning change; a release normally has
   both.
3. **Run the ADDITIVE migrations now, BEFORE the push.** Old code ignores a new
   column, and new code against a database without it dies outright. Skipping
   this step is what took the site down on 2026-09-20.
4. **Merge and push `main`** — § 2. The build starts by itself.
5. **Watch the Activity tab** — § 4a. Do not walk away; a failed build is
   quiet unless you are looking at it.
6. **Run the MEANING migrations now, AFTER the build is live** — the backfills
   that rewrite existing values. The code that understands the new meaning is
   running by this point, which is the whole reason they waited.
7. **Verify** — § 6, plus `scripts/schemaDrift.mts` against that database.
8. **Deploy any new scheduled job separately** — § 7. The cron Worker is not
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

Rolling back the code as well, when you want `main` to match what is running —
**through `local-dev`, because `main` refuses a commit the gate has not seen**
(the ruleset, § 4):

```bash
git checkout local-dev && git pull --ff-only
git revert --no-commit <bad-commit>...<bad-commit>
git commit -m "Revert <what>"
git push origin local-dev            # the gate runs; staging follows if green
# when the Gate run for that commit is green:
git checkout main && git merge --ff-only local-dev && git push origin main
git checkout local-dev
```

That undoes the change as a _new_ commit and triggers a fresh deploy. Slower
than the Activity-tab rollback — which needs no gate and stays the fastest way
out — but it keeps the history honest. Never force-push `main`; the ruleset
blocks it anyway.

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

### NEVER RUN GENERATED MIGRATION OUTPUT WITHOUT READING WHAT IT ADDS

**`drizzle-kit generate` writes a diff against its own SNAPSHOT, not against the
database.** When the snapshot is behind, the diff is wrong — and it is wrong in
the most ordinary-looking way possible: a normal-shaped file full of plausible
`ALTER TABLE` statements, in the right format, with the right name.

**This happened on 2026-09-20.** A generate for two new labour columns emitted
SIX `ALTER`s and three constraints, re-adding `groundCount`,
`groundMaterialId` and `takeoffGroupId` — all already live in production from
0060-0064. Running it would have died on `Duplicate column name`, mid-file,
with drizzle recording nothing as applied.

**The cause, and it is permanent here:** `drizzle/meta/` holds snapshots for
0050-0053, 0057 and 0058 and **nothing for 0059-0064**, because those were
hand-written. So generate diffs from 0058 and re-emits everything since. Any
hand-written migration leaves this hole behind it, which means **this repo's
snapshots will keep being stale and generate will keep being wrong.**

So:

1. **Read every statement a generate produces before it goes anywhere near a
   database.** Not the file name, not the count — the statements.
2. **If it touches anything you did not just change, throw it away** and write
   the migration by hand, one statement per file, registering it in
   `drizzle/meta/_journal.json` yourself. That is what 0061-0066 are.
3. **`pnpm db:push` runs generate first**, so it carries the same risk. To
   apply already-written migrations without generating, run the migrator
   directly: `npx tsx scripts/migrate.mts`. Against production that needs
   `ALLOW_REMOTE_DATABASE=yes` in front of it — see § "The guard on scripts
   that write" below.
4. Delete the stray `<n>_snapshot.json` along with the `.sql`, or the next
   generate diffs from a snapshot describing a migration that never ran.

**The general rule this belongs to:** a tool that generates code from a model of
the world is only as right as that model, and it never says how confident it is.
Same family as § "A number that can be measured should not be asserted" in
CLAUDE.md — the generated file is an assertion about the database, and
`scripts/schemaDrift.mts` is the measurement.

Ask the database directly, rather than counting files:

```bash
pnpm tsx scripts/schemaDrift.mts
```

It prints how many migrations that database has recorded, exactly which
columns the code expects that it does not have, and — since 2026-09-25 — every
column where the database and the schema disagree about NULL (either
direction) or about its TYPE, width included: `varchar(255)` against `text`,
`int` against `bigint`, `varchar(128)` against `varchar(64)`, a decimal's
precision or scale, an enum's value list — or about its DEFAULT (a different
value, a default gained or lost, a lost `ON UPDATE`), or where a string column
is on a collation other than `utf8mb4_unicode_ci`. It exits non-zero on any of
them. **Auto-increment is the only thing it does not compare.**

Collation is judged against the project rule rather than the schema, because
drizzle has no way to declare one (§ "A new table lands on the WRONG
collation"). And for collation drift the fix is NOT `pnpm db:push` — a
migration does not set it — so the script prints the `ALTER TABLE … CONVERT`
statement instead.
Run it **before** `pnpm db:push` to see what is pending and **after** to confirm
it took. When in doubt, run `pnpm db:push` anyway — it is idempotent.

The same check runs as `server/schemaDrift.test.ts`, so a column added to the
schema without its migration fails on the author's machine rather than in
somebody else's console a week later.

### WHICH GOES FIRST, THE MIGRATION OR THE CODE? THREE STEPS, NOT TWO

**Added 2026-09-20, and corrected the same evening after the two-step version
of it took the live site down.**

#### The shape: ALTERs, then code, then backfills

    1. ADDITIVE MIGRATIONS   the new columns, nullable, no defaults
    2. DEPLOY THE CODE       it now reads both the old meaning and the new
    3. MEANING MIGRATIONS    the backfills that rewrite existing values

**State it as three steps every time, even when a release has nothing in step 3.** The two-step version — "migrate first, except when the meaning changes,
then code first" — is true of each FILE and false of a release, and collapsing
it is not a hypothetical risk:

> The rule was written on 2026-09-20 and applied too broadly within the hour,
> by the person who wrote it. Migrations 0061–0064 were treated as one batch
> and held back behind the deploy because two of them changed a meaning. But
> 0061 and 0062 are plain `ALTER`s, and with them unrun the newly deployed code
> asked for `groundCount` on a table that did not have it. Every screen touching
> traced runs failed on the live site until the two `ALTER`s were applied.

#### CLASSIFY EACH FILE, NOT THE BATCH

**A release normally contains both kinds, and that is not a problem — it is the
normal case.** 0061–0064 is exactly it: two additive `ALTER`s that must go
BEFORE the deploy and two backfills that must go AFTER. Asking "is this batch
additive?" has no correct answer. Asking it of each file does.

#### The default: migrate first, and why it is the default

**Old code ignores a new column.** Adding `takeoff_groups`, or
`bid_line_items.takeoffGroupId`, or an index, changes nothing about what the
running build reads — every value it already had still means what it meant.

**The reverse is not true.** Nearly every read here is a bare `select()`, which
drizzle expands to every column in `drizzle/schema.ts`, so NEW code against an
OLD database does not lose a field — the whole statement dies with
`Unknown column` and the screen behind it goes with it (§ 5 above, the bid
archive). Migrating first is therefore the safe order by default: the database
is allowed to be ahead of the code, and never behind it.

#### The exception: a migration that changes what an existing column MEANS

**0063 is the first one.** It took the ground out of
`takeoff_run_circuits.conductorCount`, so a stored 3 stopped meaning "three
conductors including the ground" and started meaning "three insulated
conductors, and look at `groundCount` for the rest".

Run in the default order, that is not a missing field and not an error. It is
**every circuit in the app reporting one conductor short**, on every run, on
every bid, with nothing on screen to say so. Measured on a local database:
**a bid's wire went from 125.01 ft to 83.34 ft the instant the migration
landed**, and it stayed wrong until the code that reads `groundCount` shipped.

**So: the code that understands the new meaning ships FIRST, and the migration
runs after it.**

#### How to tell which kind you are holding — ASK IT OF EVERY FILE

Two questions, in order, **per .sql file**, not per release. Both are
answerable in a minute. Write the answer at the top of the file while you have
it, so the person deploying does not have to derive it again at 11pm.

**1. Does any `UPDATE` write to a column that existed before this batch?**

```bash
grep -n "UPDATE\|SET " drizzle/00NN_*.sql
```

Read each `SET` target and ask "did this column exist yesterday?"

- **No `UPDATE` at all** — additive. Migrate first.
- **`UPDATE` that only fills a column this batch added** — still additive. 0055
  sets `takeoff_stamps.groupId`, which 0054 had just created; no value that
  existed before means anything different afterwards. Migrate first.
- **`UPDATE` that writes a column older than this batch** — **this is the
  exception.** 0063 does `SET conductorCount = conductorCount - 1` on a column
  as old as its table. Code first.

**2. If there is no `UPDATE`: does the new code need the new column to compute
a number it was ALREADY computing correctly?**

If yes, the old column's meaning has changed even though no row was rewritten,
and the same answer applies. If no, it is additive.

**Then sort the files into step 1 and step 3, and deploy in the three-step
order.** Running a subset is supported and is the documented path for exactly
this: `scripts/migrate.mts` takes a folder, so a copy of `drizzle/` whose
journal stops after the additive files applies those and no others.

#### What makes step 3 safe, and it is not luck

Shipping the code first only works if that code can read **both** meanings —
the migrated rows and the ones still waiting. The way to guarantee that is to
make "not yet migrated" a value **nothing else can produce**:

- **A new column is NULLABLE with no default.** NULL is "not yet split"; it
  cannot be confused with a real answer.
- **The code treats NULL as the OLD meaning.** `shared/takeoffQuantities.ts`
  reads an absent ground as ZERO, which is exactly right while the ground is
  still inside the conductor count.

Do that and there is no window at all: the code ships, every row still reads
correctly, the migration runs whenever you like, and every row reads correctly
after it too. A `DEFAULT 0` instead of NULL would have thrown that away —
"not yet split" and "deliberately no ground" become the same value, and nothing
can tell them apart.

#### And the other half: one mapper between the table and the arithmetic

The three places that broke were not the arithmetic. They were three routers
each hand-building `{ name, conductorCount }` from a row. **A rule in a
document would not have caught that**, and did not: the exception above was
written down in the migration itself and the mappings were still wrong.

`circuitWire(row)` in `shared/takeoffQuantities.ts` is the answer — one
function, taking the ROW, so `circuits.map(circuitWire)` has nothing to
destructure and therefore nothing to forget. **When a column's meaning changes,
find every place its value crosses from the database into a calculation and put
them behind one function, in the same change.** That is the work; the deploy
order is just the part you can get wrong at 11pm.

### A new table lands on the WRONG collation unless you say otherwise

**Found the hard way on 2026-09-18**, by a migration that failed halfway
through its own rehearsal.

Every table in this schema is `utf8mb4_unicode_ci`. The DATABASE default is
`utf8mb4_0900_ai_ci`. drizzle-kit's `CREATE TABLE` names no collation, so a new
table takes the database's — the other one.

Nothing breaks until a string column of a new table is compared with a string
column of an old one, and then MySQL refuses outright:

```
ER_CANT_AGGREGATE_2COLLATIONS: Illegal mix of collations
  (utf8mb4_0900_ai_ci,IMPLICIT) and (utf8mb4_unicode_ci,IMPLICIT) for operation '='
```

**So: name the collation in every `CREATE TABLE`**, as `0053` does:

```sql
) COLLATE=utf8mb4_unicode_ci;
```

That makes the table match its neighbours on any server, whatever that
server's default happens to be — which also means local and production cannot
diverge on it.

**Four tables were on the wrong side of the line** — `ai_usage_daily`,
`bid_mounting_heights`, `takeoff_height_defaults` and
`takeoff_mounting_heights` — **on the database this was written against.**

> **Corrected 2026-09-25, by measuring.** Production and the test database
> both have a database default of `utf8mb4_unicode_ci`, so every table on them
> — those four included — is already `utf8mb4_unicode_ci`, and not one string
> column is on anything else. The four exist on `utf8mb4_0900_ai_ci` only on
> the LOCAL copy (`bidrender_local`, whose database default is
> `utf8mb4_0900_ai_ci`). `takeoff_height_defaults` is no longer declared in
> `drizzle/schema.ts`, so three of them are in the schema.
>
> So "leave them because converting a live table is risky" no longer applies
> to production — there is nothing to convert there. On the local copy it is a
> free choice; converting makes local match production:
> `ALTER TABLE <table> CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
> `scripts/schemaDrift.mts` now reports these, and prints those statements.

**The general lesson is about rehearsal, not collations.** The failure was
invisible to `pnpm check`, to the test suite and to reading the file, and it
would have stopped the migration on production with three statements already
applied. Running it against a real database first is what found it — see § 5a
step 5, and note that `scripts/migrate.mts` names the file, the statement and
MySQL's own reason, which is what made it a two-minute diagnosis.

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

**Your laptop must also be on the database's trusted list** — see § 10. If a
command below cannot connect while the site itself loads fine, your home
address has probably changed; § 10 says what the error looks like and how to
fix it in about two minutes.

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

Expect **eleven** applied and no drift.

> **This said seven until 2026-09-18**, when Phase 6 added 0053–0056 on top of
> Phase 5's 0046–0052 without this checklist being reread. Nothing was wrong
> with either change; the number here is just a fact that goes stale whenever a
> migration is written, and it is read at the exact moment somebody is about to
> touch production. **If the number below does not match what the command
> prints, stop and find out why before running anything against production** —
> a mismatch means either this line is stale again or the database is not where
> you think it is, and those want opposite responses.

> **Built 2026-09-26: `KEEP_SCRATCH=1` on `verifyBackup.mts`** makes steps 2
> and 3 one restore. It verifies the backup as usual and then leaves
> `bidrender_backup_verify` in place instead of dropping it; point
> `DATABASE_URL` at that schema for `migrate.mts` / `schemaDrift.mts`, and drop
> it when done. First used for 0080/0081 (seat limits).
>
> ```bash
> DOTENV_CONFIG_PATH=.env.production.local \
> VERIFY_DATABASE_URL=mysql://…@127.0.0.1:3307/bidrender_test_clean \
> KEEP_SCRATCH=1 pnpm tsx scripts/verifyBackup.mts <runId>
> ```

#### 4. Ask production what it is missing

```bash
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/schemaDrift.mts
```

Expect it to name exactly what you are about to add. That is now **two
phases** in one sitting:

- **Phase 5** (0046–0052) — three tables, plus columns on `bids` and
  `takeoff_runs`.
- **Phase 6** (0053–0056) — `takeoff_groups`, `takeoff_stamps.groupId`, the
  backfill that fills it from marks already placed, and `assemblyName`
  becoming nullable.

**The two are independent and the order is already right**: nothing in Phase 6
reads anything Phase 5 added. Running them together is one outage window
instead of two, and the checklist below is unchanged by it.

#### 5. Run it

```bash
ALLOW_REMOTE_DATABASE=yes DOTENV_CONFIG_PATH=.env.production.local   pnpm tsx scripts/migrate.mts
```

`pnpm db:push` also works, but it runs `drizzle-kit generate` first, which can
write a new migration file you did not ask for. **Prefer `migrate.mts` on
production**: it applies what is already in `drizzle/` and nothing else.

Expect
`Applied 11 migrations: 0046_magical_electro to 0056_stamps_assembly_name_nullable.`

**0055 is the one to watch, and it is the reason step 2 exists.** It is the
only file here that touches DATA rather than shape: it reads every existing
mark and writes a group for it. It was rehearsed against a real database on
2026-09-18 and **failed on its fourth statement** with three already applied —
a collation mismatch, now fixed (§ 5 "A new table lands on the WRONG
collation"). It has since run clean and the counts were compared before and
after, mark by mark. If it stops here anyway, the file says what a re-run does
and the repair is one `DELETE`; see the header comment in the file itself.

#### 6. Ask again

```bash
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/schemaDrift.mts
```

Expect `Database matches the schema.` **If it still names something, stop here
and do not deploy.** The site is fine — it is running the old code, which does
not know about any of this.

> **`schemaDrift.mts` now sees a change to NULLability — FIXED 2026-09-25,
> the same day the gap was found.** Before 0074/0075 ran, production reported
> `Database matches the schema.` with both `bid_line_items` snapshot columns
> still `NOT NULL`, because the check only compared which columns EXIST. It
> now also compares `IS_NULLABLE` against the schema, so that database would
> have printed
> `bid_line_items.snapshotMaterialCost — schema allows NULL, database NOT NULL`
> and exited 1 (reproduced on a scratch database; pinned in
> `server/schemaDrift.test.ts`).
>
> **Types and widths are covered too — added later the same day.** It compares
> each column's full `COLUMN_TYPE` against the type drizzle declares, so a
> `MODIFY COLUMN` from `decimal(10,4)` to `decimal(12,4)`, or `varchar` to
> `text`, now reads as drift before the migration and as matching after it.
> MySQL's equivalent spellings of one type (`boolean` stored as `tinyint(1)`,
> `integer` for `int`, the `int(11)` display width older servers print) are
> treated as the same; the list is in `normalizeColumnType`
> (`server/schemaCheck.ts`) and is short because it was measured, not guessed.
>
> **Defaults and collation are covered too — added later again the same day.**
> Defaults are compared as values, through a second short, measured list of
> equivalent spellings (`canonicalDefault`): a decimal reported at its scale
> (`0.0000` for `.default("0")`), `false`/`true` as `0`/`1`, the four names
> of the current time (`now()` on production, `CURRENT_TIMESTAMP` on most of
> the local copy), and MariaDB's quotes round a literal. Collation is checked
> against `utf8mb4_unicode_ci`, with no allowlist.
>
> **What it still cannot see: auto-increment.** A migration that only adds or
> removes `AUTO_INCREMENT` reads as "matches" before and after. For one of
> those, ask `information_schema.COLUMNS` for `EXTRA` before and after and
> compare the two readings.
>
> **Run against the local copy, it reports six string columns in three tables
> on `utf8mb4_0900_ai_ci`.** That is real — local differs from production —
> not a false alarm; see § "A new table lands on the WRONG collation".

#### 7. Open the live site, still on the OLD code

Check a bid's takeoff totals read the numbers they read yesterday. **This step
has to be boring.** Old code against a new database should be completely
unremarkable, and if it is not, you have found something worth knowing before
any new code ships.

Only then is the deploy a separate decision — § 4 of this document.

#### 8. After that deploy, confirm the new code is actually the code running

**This step is here because of the failure that produced § 6.** Steps 1–7 are
sound and none of them depends on a version number — step 7 in particular is a
real check, run against the OLD code on purpose. The hole was one step later, in
verifying the deploy that follows: the instruction was to confirm a hand-typed
version tag had moved, and it could not move.

```bash
curl -s https://bidridge.com/api/version
```

**`builtAt` must be newer than the moment you pushed, and `commit` must be the
commit you pushed.** Then open the screen the migration was for and confirm it
reads the new columns.

**Both halves matter and they fail differently.** A migration that ran with code
that never shipped looks exactly like a working site, because the old code does
not touch the new columns — which is what step 7 proves is safe, and also what
makes it invisible.

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

### 5b. A catalog release IS a migration — it just runs at startup

**Added 2026-09-26.** A release that only touches `server/seed/materials/`
has nothing in `drizzle/`, so § 5a looks as if it does not apply. It does. The
first boot of the new build runs `seedBaselineMaterials`, which renames rows in
place (`RENAMED_BASELINE_MATERIALS`), retires others, inserts every new name
and re-stamps category, aliases and price — against production, on its own,
with nobody watching. Nothing in `schemaDrift.mts` can see any of it, because
the schema does not change.

**Rehearse it the same way as a migration, with the build that ships:**

1. § 5a steps 1–2: back up, and prove the backup restores.
2. Restore that dump into a local scratch database that persists.
3. Before starting anything, ask the copy the questions a rename can get
   wrong: does any rename find BOTH names already present (it will skip it,
   leaving a duplicate)? Does a user's own row carry a name the seed is about to
   introduce? What references each row being renamed or retired —
   `assembly_materials`, forks via `baselineId`, run types, `takeoff_groups`?
4. `pnpm build`, then start `dist/index.js` against the copy
   (`NODE_ENV=production`, a spare `PORT`, `DATABASE_URL` overridden). That is
   the exact startup path production will take.
5. Compare before and after, by id: rows added, renamed, retired, deleted (must
   be zero), user rows changed (must be zero), active baseline rows still on an
   old spelling (must be zero), and every reference identical.
6. **Restart it and compare again.** The second boot must change nothing; a
   seed that is not a no-op the second time will do something on every deploy.
7. Search the old spellings against the copy's real library, not the seed file
   — `scripts/searchSpotCheck.mts` reads `BASELINE_MATERIALS`, so it cannot see
   a user's fork or a stray row.

**What this found the first time it was run (2026-09-26, 12 catalog commits):**
46 renames, 2 retirements, 421 inserts, no collisions — and one test that
failed only because an older build's test run had re-seeded old names into the
shared TEST database (`todo.md` § traps). Without the production-data
rehearsal, that red test and a real duplicate would have looked the same.

**And production then matched it line for line** (deployed as `1c29584`,
2026-09-26): 722 → 1143 rows, the same 46 renames, the same 2 retirements, no
deletions, no user row touched, every reference identical. Run the same
before/after comparison against production itself after the first boot — the
rehearsal says what should happen, and only production says it did.

**Steps 3, 5, 6 and 7 are now one script: `scripts/catalogRehearsal.mts`**
(read only). `snapshot <file>` before and after the boot, `compare` the two
(renames grouped by release round, company rows touched, old spellings still
active, duplicates, every reference into `materials` by id, orphans, and a
CLEAN / NOT CLEAN verdict), and `search`, which runs every old spelling
through the app's own search and ranking against the copy's real library.

**Second run — the fittings batch, deployed as `99b8c4e` on 2026-09-26.**
Backup `2026-09-26T18-27-04Z` restored and verified (59 tables, 3,025 rows),
kept with `KEEP_SCRATCH=1`, 0082 + 0083 applied (2 files), no drift. First
boot: 1,129 → 1,192 shipped rows (1,190 active, matching the new build's
1,190), 63 added, **18 renamed** — the rename list has 20 new or re-pointed
entries, but 2 re-point spellings production had already renamed — nothing
retired or deleted, no company row touched, every reference identical, no
orphans. Second boot changed nothing. The three earlier rounds (AL/CU, SER
full sets, disconnects) had already run on production and left no active row
on an old spelling.

**Third run — bends and pull points, deployed as `e07f1e4` on 2026-09-26.**
**Rollback target: `99b8c4e`.** Backup **`2026-09-26T20-57-13Z`** (59 tables,
3,090 rows, 5 files) restored and verified, kept with `KEEP_SCRATCH=1`; 0084
applied to the copy (1 file, 85 recorded), no drift. First boot of the built
release on the copy: 1,192 → 1,237 shipped rows, **45 added** (the 45°
elbows), nothing renamed, retired or deleted, no company row touched, every
reference identical; second boot changed nothing; `search` reported exactly
the known 9 / 12 from earlier rounds. Production then: `schemaDrift` named
exactly 0084's five items, `migrate.mts` applied 1, a second run applied
nothing, drift clean; the old build read bid 25, its runs, the Send preview,
materials and run types normally on the new schema. Pushed 21:04:26Z; the
new build (`builtAt` 21:05:00Z) was serving at 21:06:58Z. Production's
catalog then matched the rehearsal line for line — 1,192 → 1,237, 45 added,
VERDICT CLEAN. The script's reference list did not yet include 0084's four
override columns (all empty on production); added afterwards.

Live checks on bid 25 as the smoke account (a 1-1/4" EMT type and two runs
added for the check, all removed afterwards, sheet 196's scale cleared): a
three-corner run read "270° of bend on the drawing (3 corners) … At least
that"; a five-corner run proposed an LB at its fifth corner (450°); accepting
it in the live UI took the 90s from ≥ 8 to ≥ 7, connectors 4 → 6 ("1 LB (2
each, into the hubs)"), LB 0 → 1, and straps stayed ≥ 20 but redistributed
(4 near a box + 16 spaced → 6 + 14) — the two beside the LB replace two
spacing straps on those lengths.

**Fourth run — branch legs (D20), deployed as `b69c35d` on 2026-09-26.**
**Rollback target: `e07f1e4`.** A schema release, not a catalog one. Backup
**`2026-09-26T23-08-29Z`** (61 tables, 3,137 rows, 5 files) restored and
verified, kept with `KEEP_SCRATCH=1`. On the copy: `schemaDrift` named exactly
0085's three items at 85 recorded; 0085 applied (1 file), a second run applied
nothing, no drift. The built release booted on the copy twice —
`catalogRehearsal` CLEAN both times (1,237 → 1,237, nothing added, renamed,
retired or deleted, no company row touched, every reference identical).

**"Existing totals unchanged" was checked by the ROUTERS, not by eye.** A
throwaway read-only script called `takeoffRuns.totals`,
`takeoffRunTypes.bridgeForBid` and `takeoffRuns.listForSheet` (quantities,
wire ownership, bends) for every bid as its owner, and wrote the result to a
file. Run from a worktree at `e07f1e4` on the copy BEFORE 0085, and again
from the old build AFTER it, and from the new build after it: **all three
byte-identical.** Production has 2 bids and 2 runs, both on bid 23 (the
owner's; bid 25 had none). The same script against production itself: the
old build on the migrated database, and the new build after the push, both
byte-identical to the backup. Worth repeating for any release that touches a
read path: it compares everything the screens are built from, and it cannot
pass on a figure nobody looked at.

Production: `schemaDrift` named exactly 0085's three items; `migrate.mts`
applied 1, a second run applied nothing, drift clean. `fittingsImpact`:
**0 leg rows, 0 tees**, no fittings to add, no line to read "Not priced".
Pushed 23:15:46Z; the new build (`builtAt` 23:16:35Z) was serving at
23:18:43Z on both hosts.

Live checks on bid 25 as the smoke account (sheet 196 given 1/4" = 1'-0" for
the check): a 1/2" EMT main of 75.08 ft (one corner) with a branch
Shift-clicked off it 30.80 ft along, 13.48 ft long. Stored as three legs
(30.80 + 44.28 + 13.48) meeting at one tee, all committed; the tee drawn as a
box at the split. With a run height on each leg, every tee end read level —
no drop — and `setEnds` refused a kind on a tee end. Counts: **6 connectors
("3 line ends, 1 branch tee (3 of this size)")**, 1 tee box (`4" square box`)
and 1 blank cover, 1 field bend (the main's corner — none at the split), 8
couplings, 11 straps; raceway 88.56 ft = main + branch, so the jump back to
the tee was not counted. "Send 7 lines to bid" put the tee box on the bid at
qty 1 with its sentence ($0: the shipped box is unpriced). Deleting leg 3 in
the panel joined the main back into one 75.08 ft leg with no tee, the header
went, and the sent lines followed on their own: tee box 1 → 0, connectors
6 → 2, raceway 88.56 → 75.08. Then the 7 lines, the run and sheet 196's scale
were removed; bid 25 back to 0 lines, 0 runs, no sheet scaled, and the
router snapshot of production byte-identical to the backup again.

**Driving the live viewer from the extension:** in the hidden tab, clicks by
coordinate landed nowhere until a screenshot had been taken (the click frame
was not the CSS one). Pointer events dispatched on the overlay `<svg>` at
CSS coordinates, with `shiftKey` for the branch, drove the real handlers.

**`search` caught a real regression before production did.** The old name
`2-1/2" EMT coupling` matched all three new EMT styles equally and the tie fell
to the alphabet — compression first, the renamed set-screw row third. Fixed
before the push by making set-screw at every size "common" in
`shared/materialCommonness.ts`. What it still reports, all from earlier
rounds and live before this release: the 8 old disconnect spellings and
`30A breaker` land on the renamed row SECOND (the NEMA 1 row and the 2-pole
row match the old words equally), and 12 old spellings find nothing — the
11 bare-copper names, only because a typed comma defeats the tokenizer
("#12 bare copper solid" and "12 bare copper" both find the row), and
`5/6" wafer LED downlight`. See `todo.md`.

**Fifth run — quantity mode (D21), deployed as `a64dfbc` on 2026-09-27.**
**Rollback target: `b69c35d`.** A schema release, not a catalog one: one
nullable column, `takeoff_runs.traceMode`, NULL meaning route. Backup
**`2026-09-27T00-41-48Z`** (62 tables, 3,138 rows, 5 files) restored and
verified, kept with `KEEP_SCRATCH=1`. On the copy: `schemaDrift` named exactly
`takeoff_runs — missing traceMode` at 86 recorded; 0086 applied (1 file), a
second run applied nothing, no drift at 87. The built release booted on the
copy twice — `catalogRehearsal` CLEAN both times (1,237 → 1,237, nothing added,
renamed, retired or deleted, no company row touched, every reference
identical). Every existing run read `traceMode` NULL (2 of 2).

**Existing data, by the routers again** — `takeoffRuns.totals`,
`takeoffRunTypes.bridgeForBid` (the Send preview) and `takeoffRuns.listForSheet`
for every bid as its owner, with the three fields the new build ADDS
(`traceMode`, `quantity`, `quantityFeet`) taken out of the compared file and
collected separately, so they could be asserted rather than ignored: every
`traceMode` read `route`, every `quantity` read `{traceCount: 0, openEnds: 0}`.
Old build before 0086 and old build after it: **byte-identical**. New build
after it: identical **except two lines, both the deliberate change** recorded
in `todo.md` — run 37 on bid 23 starts at "carries on at run height" on a job
with no run height, so its start now reads `level` rather than
`no-distribution-height`, and its bend sentence says "1 drop not counted yet"
instead of "2". No number moved, including that run's flat-only count, because
its other end is unanswered. **The snapshot script from the fourth run had not
been kept** and was rewritten; see `todo.md` on committing it.

Production: the old build read byte-identical to the backup before 0086;
`schemaDrift` named exactly `traceMode`; `migrate.mts` applied 1, a second run
applied nothing, drift clean at 87; the old build on the migrated database
still byte-identical (the "must be boring" step); `fittingsImpact` **0 quantity
rows, 0 leg rows, 0 tees**. Pushed 00:48:56Z; the new build (`builtAt`
00:49:39Z, commit `a64dfbc`) was serving on both hosts at 00:51:42Z, and its
snapshot of production matched the rehearsal's byte for byte.

Live checks on bid 25 as the smoke account (sheet 196 given 1/4" = 1'-0" and the
job a 10'-0" run height for the check). A three-leg quantity trace of 1/2" EMT
— 43.20 ft, an 11.52 ft leg Shift-clicked off its middle, a separate 36.00 ft
leg — stored as three `quantity` rows with no tee, no circuit and no end kind.
The panel proposed **5 drops, none at the joined end**, marked on the drawing;
"Drops to: Receptacle" read "5 drops, 8'-6" each = 42.50 ft"; wire came from the
type (43.2 × 3 = 129.6 ft on leg 1). Approve all: conduit 90.72 → 133.22 ft,
wire +127.50 ft (42.50 × 3), "Drops on this bid" 5 · 42.50 ft, the quantity
warning gone, 5 connectors ("none at 1 quantity-trace end"). Route and back:
totals, wire (399.66 ft), readout and markers identical at every step; going to
route gave the three legs a circuit each and kept the drops. A 43.20 ft route
run of the same type with an 8.50 ft drop was added, and **"Send 7 lines to
bid" put ONE raceway line at 184.92 ft = 133.22 quantity + 51.70 route**, with
conductor 266.44 (the type's 2 × 133.22; the route run had no circuits) and
7 connectors (5 approved drops + 2 route ends). Taking back one drop moved the
bid's raceway line to 176.42 on its own. Then the 7 lines, both runs, sheet
196's scale and the job's run height were removed through the app's own API as
the smoke account: **bid 25 back to 0 lines (none archived), 0 runs, no sheet
scaled, no run height**; the router snapshot of production byte-identical to
the post-push one, and every table's row count identical to the restored
backup plus 0086's own migration row (62 tables, 3,139 rows).

**Driving it, two notes for next time.** Two pointer events dispatched in the
SAME script land in one React tick, and the second replaces the first (the
handler appends to the points it last rendered) — so a route "trace" of two
points came out as one point twice, zero length. One click per call. And the
hidden tab's timers throttle hard: a script that waited 3.5 s twice timed out
the tool at 45 s while the trace itself finished fine. Keep waits short and
read the result in a second call.

**Sixth run — 0087, run colours Part A and Track B's polish, deployed as
`f1521c5` on 2026-09-27.** **Rollback target: `a64dfbc`.** Both kinds of
release at once. The schema half was one nullable column,
`bid_line_items.snapshotUnpricedParts`. The catalog half was B's two new lugs,
plus the seeder change that brings back a retired name returned to the
catalog. Merged tree before anything: 172 files / 3,797 passed / 4 skipped,
typecheck clean. The change set was wider than the request named: it also
carried Polish B1–B9, merged to `local-dev` earlier.

Backup **`2026-09-27T05-25-00Z`** (62 tables, 3,139 rows, 5 files) was restored
and verified, and kept with `KEEP_SCRATCH=1`. On the copy, `schemaDrift` named
exactly `bid_line_items — missing snapshotUnpricedParts` at 87; 0087 applied
(1 file); a rerun applied nothing; no drift at 88. Production had **0 bid
lines**, so 0087 had no existing line to read differently.

- **Routers, with `scripts/routerSnapshot.mts`**, its first committed use. The
  old build before and after 0087 was IDENTICAL. The new build against the old
  one was IDENTICAL too, except for the one field it adds:
  `--added card.notPriced` read `{lines: 0, parts: 0}` on both bids. There
  were no drops, so the added drop fields never appeared. The first try passed
  bare `runTypeId,pathType` and the compare shifted by 220 lines, because run
  rows already carry `pathType`; hence the scoped `parent.key` form.
- **Catalog, with `catalogRehearsal`.** First boot: 1,237 → 1,239, **2 added**
  (400 and 500 kcmil crimp lug, single size), nothing renamed, retired,
  un-retired or deleted, no company row touched, every reference identical,
  CLEAN. Second boot changed nothing. `search`: all 102 old spellings put the
  renamed row first. Only the known `5/6" wafer LED downlight` is missing,
  down from 9 second and 12 missing at the fourth run.

Production: the live build's snapshot matched the copy's; `schemaDrift` named
exactly the one column; `migrate.mts` applied 1; a rerun applied nothing; drift
clean at 88. The old build on the migrated database was still IDENTICAL.
`main` was pushed to exactly `f1521c5` at 05:34:18Z (the snapshot script's own
commit, `a771c5f`, stayed on `local-dev`). The new build (`builtAt`
05:34:55Z, commit `f1521c5`) was serving on both hosts at 05:36:45Z. Its
snapshot of production matched the rehearsal byte for byte, and the catalog
matched it line for line: 1,237 → 1,239, CLEAN.

Live checks on bid 25 as the smoke account, on `www.bidridge.com` with a
1-hour token (`auth.me` 1421, the loaded bundle equal to the one `/` serves):

- An assembly of a $0 lug ×2, a $3 strap and 0.5 h read
  **"$3.00 + 1 part not priced"** on the line and on the Materials total, with
  the parts strip below. The frozen count was 1.
- Three route runs of types 2, 3 and 4 drew **blue, pink and violet (dashed,
  cable)**, in order of first use, and the two legs of a later quantity trace
  of type 2 drew blue. `typeColors` read `[2, 3, 4]`.
- The quantity trace proposed 4 drops. Opening "Leg 1 start" read **"To:
  Receptacle · proposed"**. Its finish result read 2 legs, 50 ft.

The setup script first assumed three conduit types and stopped partway
(production has two). That was swept by what bid 25 holds, since it held none
before, and rerun with a cable type. Afterwards the lines, runs, library rows,
sheet 196's scale and the run height were all removed: **bid 25 back to 0
lines, 0 runs, no run height**. The router snapshot is identical to the
post-push one except bid 25's `updatedAt` (the check's own edits). Every table
matches the rehearsal copy: 62 tables, 3,142 rows = the backup + 0087's
migration row + the 2 lugs.

**Seventh run — 0088, run colors Part B, B10–B12, deployed as `45ada57` on
2026-09-27.** **Rollback target: `f1521c5`.** A schema release: one
nullable column, `takeoff_run_types.color`, where NULL means automatic. It is
also a one-alias catalog change: "Wall plate screws" says "matching color".
It carried B10–B12 as well (dashboard "not priced", and charges counted in
search, the archive and close-out) and the spelling pass. `local-dev`
included B's `8327ee9`, and the full suite was green (177 files / 3,834
passed) once B's seeder test got a 60 s limit. It had been failing on
"timed out in 5000ms" while finishing in 3.4–4.5 s.

Backup **`2026-09-27T17-35-23Z`** (62 tables, 3,142 rows) was restored and
verified, and kept with `KEEP_SCRATCH=1`. On the copy, `schemaDrift` named
exactly `takeoff_run_types — missing color` at 88. **Close-outs saved on bids
with charges: 0**, the number B12 could have repriced. There are no close-outs
at all and no bid carries a charge. 0088 applied (1 file); a rerun applied
nothing; no drift at 89. The old build (`f1521c5`) before and after 0088 was
IDENTICAL. The new build against the old one was also IDENTICAL, with no
`--added` needed: `chosen` and the type list's `color` are not in the snapshot,
and B11's price-with-charges moves nothing with no charges. Catalog: first
boot 1,239 → 1,239, nothing added, renamed, retired or deleted, CLEAN, with
the alias applied in place on row 60215. The second boot changed nothing, and
`search` was unchanged (102 old spellings, the same one known miss).

Production: the live build's snapshot matched the copy's; `schemaDrift` named
exactly `color`; `migrate.mts` applied 1; a rerun applied nothing; drift clean
at 89; the old build on the migrated database was still IDENTICAL.

**The first push did not happen, and nothing said so loudly.** It was chained
behind `git rev-parse --short HEAD origin/local-dev`. `--short` takes ONE
revision, so that step failed, `&&` skipped the push, and a ten-minute wait
watched for a build nobody had started. Production was safe throughout, with
the old build on an additive column. **Push `main` in a command of its own,
and read the `a..b  x -> main` line before waiting.** Pushed at 17:52:27Z;
the new build (`builtAt` 17:53:10Z, commit `45ada57`) was serving on both
hosts at 17:55:13Z. Its snapshot of production matched the rehearsal byte for
byte, and the catalog matched it line for line: CLEAN.

Live checks on bid 25 as the smoke account (`auth.me` 1421, the loaded bundle
equal to the served one, sheet 196 given 1/4" = 1'-0", runs of shipped types
2, 3 and 4):

- The starting colors were blue, pink and violet, in first-use order.
- Choosing **Pink on 1/2" EMT** (shipped) showed the shipped-type notice, no
  "also used by" (3/4" wore pink only automatically), and "On this bid, 3/4"
  EMT … changes to blue". Saved without a reload: 1/2" pink, 3/4" blue, 12-2
  violet. That made fork 7, which covered shipped id 2 through `sameAs`.
- In **3/4" EMT's** editor, Pink read "also used by 1/2" EMT, 2 #12 + ground
  on this bid". Violet was not marked, because 12-2 is automatic and would
  move ("12-2 MC cable changes to blue"). Cancelled, and nothing was saved.
- With the editor open, **no "colour" anywhere** on screen, in a tooltip or in
  an aria-label; "color" appeared 10 times.

Then the runs and the scale were removed, and fork 7 was set back to
Automatic and ARCHIVED. Run types are never deleted, so the shipped row
leads again. **Bid 25 back to 0 lines, 0 runs, no run height**; the router
snapshot is identical to the post-push one. Every table matches the copy
(backup + 0088's migration row) except `takeoff_run_types`, **+1**: the
smoke account's archived fork 7, beside the archived type 6 an earlier check
left the same way.

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

- **`/api/version` — the check to run first, and the only one that cannot
  quietly pass.** No session needed, from anywhere the site answers:

  ```bash
  curl -s https://bidridge.com/api/version
  ```

  ```json
  {
    "version": "v6.1",
    "builtAt": "2026-09-19T01:22:57.679Z",
    "commit": "900380d",
    "mode": "production",
    "now": "..."
  }
  ```

  **Read `builtAt` against the clock, and `commit` against what you pushed.**
  `now` is in the reply so the two can be compared without trusting your own
  machine's clock. A `builtAt` older than your push means the build did not
  take and the previous version is still serving.

  > **This replaced "check the version tag moved" on 2026-09-18, and the old
  > check was worse than nothing.** `APP_VERSION` is typed by hand in
  > `shared/version.ts`; it read `v6.1` while `main` was thirty-three commits
  > further on. **So the final step of every deploy that day confirmed a number
  > that could not move, and passed every time.** `builtAt` is written by the
  > build itself (`scripts/build.mts`) and needs nobody to remember anything.

- **The version tag** in the sidebar footer (hover to reveal) now has two lines:
  the release name, and under it the build stamp this page was built with —
  `900380d · 19 Sep 01:22 UTC`. **The second line is the one that means
  something.** It is baked into the client bundle rather than fetched, so it
  reports the page you are looking at: if it is older than `/api/version` says
  the server is, you are holding a cached bundle, which is a different problem
  from a failed deploy and wants a hard reload rather than a rollback.
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

### 8a. API key rotation — the Anthropic key

**Written 2026-10-09**, when the live key `bidrender-app` was 7 days from
expiring. **Create every replacement key with NO EXPIRATION** (Anthropic
console → API keys → Create key → expiration "Never"). An expiring key is a
scheduled outage nobody is watching for: AI goes quiet on the day, and the
only signal is a log line (below). Spend is capped on the WORKSPACE (monthly
limit and email alert, `todo.md`), not on the key, so a non-expiring key
loses no protection.

**Where the key lives — every place, by setting name** (checked 2026-10-09;
values never written down here):

| Place                              | Setting name                             | Key                                                                                                          |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Live app (DigitalOcean)            | `ANTHROPIC_API_KEY`, encrypted, Run Time | `bidrender-app` (the one expiring)                                                                           |
| Staging app (DigitalOcean)         | `ANTHROPIC_API_KEY`, encrypted, Run Time | its OWN key, `bidridge-staging` (§ 11) — check its expiry too                                                |
| Laptop, `.env.production.local`    | `ANTHROPIC_API_KEY`                      | a copy of live's; only `scripts/aiSmokeTest.mts`, `readerAccuracy.mts` and `scanMatchingCheck.mts` borrow it |
| Laptop, `.env`                     | none — `DISABLE_AI_FEATURES` instead     | —                                                                                                            |
| GitHub Actions                     | **none.** Secrets are `SMOKE_*` only     | the Gate's deploy-staging step only pushes a branch; it never carries a key                                  |
| Tests                              | none — `vitest.setup.ts` blanks it       | —                                                                                                            |
| Cloudflare Worker (`workers/cron`) | none                                     | —                                                                                                            |

The code reads exactly one name, `ANTHROPIC_API_KEY` (`server/llm/anthropic.ts`).
`BUILT_IN_FORGE_API_*` are the dead Manus fallback and are not set on either
app; do not put the key there.

**Keep staging and live on separate keys.** Staging's own key keeps its
spend apart and means a leaked staging setting cannot spend live's money.
Do not paste live's new key into staging to "keep it simple".

**The swap — staging first, then live:**

1. Anthropic console: create the new key, **no expiration**, named for where
   it goes (`bidridge-staging-2`, `bidrender-app-2`). Put it straight into
   the password manager. Leave the old key ENABLED until step 6.
2. DigitalOcean → Apps → the **staging** app → Settings → find
   `ANTHROPIC_API_KEY` (App-Level Environment Variables, or the web
   component's own list — wherever it is shown today; change it there, do not
   add a second copy at the other level) → Edit → paste the new key, keep
   **Encrypt** ticked → Save. Saving REDEPLOYS the app; nothing in GitHub
   needs changing. Wait for Activity to show the deploy live (3–6 min).
3. Confirm the restart happened: `curl -s https://staging.bidridge.com/api/version`
   — `builtAt` must be AFTER you pressed Save. (The key is read once per
   process, so a server that did not restart is still on the old key.)
4. **Confirm AI works on staging** (password page first):
   - Dashboard → "Ask where to find something" → ask "where are labor
     rates". **Pass:** an answer WITH a button that opens the labor rates
     screen. **Fail:** "AI is unavailable right now. Every screen is in the
     sidebar." — the key is missing or refused. (On code older than 0141,
     which is LIVE until the next release, a refused key shows "I'm not sure
     which screen you want…" instead; treat that as a fail too.)
   - DigitalOcean → Runtime Logs, search `llm-`: `[llm-cost]
feature=navigation … cost=…` is the pass. `[llm-unavailable]
feature=navigation reason=key-refused` (or, on older code, `helper call
failed … 401 authentication_error`) means the key was refused —
     re-paste it.
   - Admin → AI spend (from 0141): no amber "AI calls are being refused
     since …" notice. It clears itself on the first call that works.
   - Anthropic console → API keys: the new key shows a recent "last used".
5. Repeat steps 2–4 on the **live** app, at `https://bidridge.com`. Do it
   when nobody is mid-read in the plan viewer: the redeploy restarts the
   server (requests in flight fail once; nothing is lost).
6. Only now, in the Anthropic console, **disable** the old keys. Delete them
   a day later, once nothing in the logs has asked for them.
7. Laptop: replace `ANTHROPIC_API_KEY` in `.env.production.local` with live's
   new key. Optional check, costs a few cents: `pnpm tsx scripts/aiSmokeTest.mts`
   (one real call per feature).

**When the key is missing or refused — what users see** (measured
2026-10-09 with a refused key: the adapter raises `AuthenticationError`, 401,
and every caller catches it). Nothing is written and no bid, quantity or
price moves, so no $0 and no broken bid.

**Since 0141 (2026-10-09; on staging, LIVE from the next release)** a
missing key or a 401/403 is told apart from a failure that passes
(`server/llm/unavailable.ts`, by the SDK's error type and status — never by
the words), and every feature says so:

- Navigation helper: "AI is unavailable right now. Every screen is in the
  sidebar."
- Plan reader: "AI is unavailable right now. Nothing was changed — carry on
  marking by hand." Sheet question, tie-break and scan finds: the same
  sentence with their own manual step. No "try again later".
- Alias suggestions: "Suggestions aren't available right now" (unchanged).
- Admin → AI spend: an amber "AI calls are being refused since <time>"
  notice naming the fault (no key / key refused) and this section. Kept on
  `ai_service_status` (0141, one row, no key text); the first call that
  works clears it.

A timeout, an overload or a bad reply still gets the old words ("could not
be reached … try again later", "not sure which screen") — those pass.

**Before 0141 (live today)** a dead key read "could not be reached … try
again later" in the plan reader and, in the navigation helper, "I'm not sure
which screen you want…" — which blamed the question (`todo.md`, done).

## 9. Storage needs a CORS rule, and without it no plan uploads — or views

> **Configured — this is no longer an outstanding issue.** The rule is on the
> `bidrender-plans` R2 bucket and covers six origins: `https://bidridge.com`
> and `https://www.bidridge.com` (added 2026-09-17 with the domain move),
> `https://bidrender.com` and `https://www.bidrender.com` (kept — a rule costs
> nothing and removing it is a way to break an old link nobody has retired yet.
> **Note these no longer serve the app**: `bidrender.com` left App Platform with
> the 2026-09-17 move and is parked, so it is not a URL to check anything
> against), the `ondigitalocean.app` host, and
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

> **Corrected 2026-09-27 — the rule below used to allow PUT only, and that
> breaks VIEWING.** This section was written about uploads, and a rule copied
> from it onto the staging bucket uploaded fine and then could not open a
> single plan: "could not be opened — Failed to fetch". The viewer does not go
> through this server; `planViewerUrl` hands pdf.js a signed bucket link and
> the browser GETs byte ranges from the bucket directly, which is
> cross-origin exactly like the upload. Measured the same day, the LIVE
> bucket's rule allows `GET, PUT, POST, HEAD` with the `range` and
> `content-type` headers — it had always been wider than this document said.

The plans bucket needs a rule permitting the deployed origin to **view and
upload**. Set it in the Cloudflare dashboard under R2 → the bucket → Settings →
CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://<the deployed site origin>"],
    "AllowedMethods": ["GET", "HEAD", "PUT", "POST"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": [
      "ETag",
      "Accept-Ranges",
      "Content-Range",
      "Content-Length",
      "Content-Encoding"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

**`GET` + `HEAD` + `Range` are for viewing.** pdf.js asks for one piece of the
file at a time (`shared/pdfRangeLoading.ts`), with a `Range` header, which is
not CORS-safelisted and so is preflighted. **`Accept-Ranges` and
`Content-Range` must be exposed** or pdf.js cannot see that the bucket serves
pieces, and falls back to downloading the whole file — which the app refuses
above `PDF_WHOLE_DOWNLOAD_LIMIT_BYTES`. That is the same "works on a small
file, fails on a real one" shape as the 25MB upload fallback below.

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
  -H "Origin: https://bidridge.com" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type"
```

A `204` naming the origin back means the rule covers it. Then make a real ranged
`GET` and look for `ETag` in `Access-Control-Expose-Headers` — **exposed headers
never appear on the preflight**, so a preflight alone cannot tell you whether a
large multi-part upload will reassemble.

Failing that, attach a plan **over 25MB**. Under that size the fallback hides
the answer; over it, only the direct path can succeed.

**And check viewing, not only uploading** — the same preflight with
`Access-Control-Request-Method: GET` and `Access-Control-Request-Headers:
range` must also answer `204` naming the origin. A rule that passes the PUT
probe above and fails this one uploads every plan and opens none.

For the staging bucket all of this is one command,
`pnpm tsx scripts/stagingSettingsCheck.mts`: it preflights GET, HEAD and PUT
from `staging.bidridge.com`, confirms other origins are refused, and makes a
real signed range read to see `Accept-Ranges`, `Content-Range` and `ETag`
exposed (§ 11).

## The guard on scripts that write

**Every script that can write to or drop a database refuses one that is not on
this machine**, unless you say so: `ALLOW_REMOTE_DATABASE=yes`. The decision is
in `scripts/databaseGuard.ts` — one helper, so there is no second copy to
disagree with the first — and it is tested in `scripts/databaseGuard.test.ts`.

Guarded today: `migrate.mts`, `dropOrphanBaselines.mts --delete` (the report is
read-only and stays unguarded), `verifyBackup.mts`, `rehearseBackfill.mts`.

**Where it came from, 2026-09-21.** A throwaway rehearsal script needed R2
credentials, so it ran with `DOTENV_CONFIG_PATH=.env.production.local`. That
file also carries `DATABASE_URL`. The script read it, connected to the
production server, and issued `DROP DATABASE IF EXISTS bidrender_rehearsal`. It
failed — `bidrender_app` cannot drop databases — and that is the only reason
nothing happened.

The author knew about the risk and did it anyway, because the variable that
caused it belongs to a file being read for something else entirely. That is why
this is a function that can fail rather than a warning in a document.

**The override is a WORD, not a truthy flag.** `=1` or `=true` is the kind of
thing left exported in a shell from an unrelated task, and a forgotten override
is the same hole with extra steps. It also announces itself when used, because
an override that works silently is one nobody notices they left on.

**It refuses when it cannot tell**, too — a missing or unparseable URL is not
the same as a safe one, and only one of those should let a `DROP` proceed.

## 10. The database only answers addresses on its trusted list

**From Stage 4 (2026-09-27).** The DigitalOcean database refuses every
connection except from the addresses on its **Trusted Sources** list. Three
entries, all entered as IP addresses (picking the app by name from the list
does NOT work — it took the site down on the first try):

| Entry           | What it is                                                              |
| --------------- | ----------------------------------------------------------------------- |
| `10.124.0.3`    | the live app's VPC egress IP — **removing it takes the live site down** |
| `10.124.0.4`    | the staging app's VPC egress IP (§ 11)                                  |
| `97.94.233.209` | the owner's laptop — changes with the home connection                   |

That laptop entry is what lets a migration (§ 5a) or
`scripts/schemaDrift.mts` run from here.

**A home internet address changes** — after a router restart, an outage, or
whenever the internet company decides. When it does, the laptop is no longer
on the list, and every command that talks to production fails. **The live site
is not affected** — the app has its own entry — so nothing is wrong except
that this laptop cannot get in.

### What it looks like when the address is stale

Measured 2026-09-27, with the laptop deliberately off the list. The command
**hangs for about 20 seconds**, then fails with a long error whose last lines
are:

```
    errorno: 'ETIMEDOUT',
    code: 'ETIMEDOUT',
    syscall: 'connect',
    fatal: true
```

**`ETIMEDOUT` on `connect`, after a pause, is the stale-address signature.** A
wrong password answers at once with `Access denied`; a stale address never
answers at all.

> **`scripts/schemaDrift.mts` used to LIE first — FIXED 2026-09-29.** Before
> the timeout it printed **"No \_\_drizzle_migrations table — this database
> has never been migrated."** That was false — production had 89 applied at
> the time — because the script read a failed connection as an empty answer.
> It now prints **"Could not read this database (…). This is NOT 'never
> migrated'"** and exits 2 before checking anything
> (`scripts/schemaDrift.test.ts`). "Never been migrated" now appears only when
> the database answered and has no migrations table. The rule stands anyway:
> never act on a migration count from a run that did not connect.

If a production command fails like this and the site itself still loads,
the address is the first thing to check — before suspecting the password, the
certificate or the database.

### How to put your current address back on the list

1. Log in to **cloud.digitalocean.com**.
2. Left menu: **Databases**. Click the MySQL database.
3. Open the **Network Access** tab (not Settings — it moved there). Find
   **Trusted Sources**.
4. Click **Edit** next to it.
5. You will see the old laptop entry — an address made of four numbers with
   dots. Click the **X** or trash icon next to it to remove it. **Do not
   remove the entry that names the app.** Removing that one takes the live
   site down.
6. Click **Add**, and choose your current address — the page offers it
   ("my current IP" or similar), so there is nothing to look up or type.
7. Click **Save**. It takes effect within about a minute.
8. Run the command again. It should now connect.

**If the live site stops working right after step 7**, the app entry was
removed by mistake. Go back to the same box, click **Add**, start typing the
app's name, pick it, and save. The site comes back within a minute or two.

## 11. Staging — the practice copy at staging.bidridge.com

**Built 2026-09-27** (Stage 4, `references/stage-4-safety-plan.md`). A second
copy of the site, deployed from the **`staging`** branch, that nobody outside
can see and that cannot touch a single live row.

|                        | Live                               | Staging                                                                   |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Address                | `bidridge.com`                     | `staging.bidridge.com`                                                    |
| Branch that deploys it | `main`                             | `staging`                                                                 |
| Database               | `bidrender`, login `bidrender_app` | `bidrender_staging`, login `bidrender_staging_app` — same cluster         |
| Plans bucket           | `bidrender-plans`                  | `bidrender-plans-staging`                                                 |
| Password page          | none                               | yes — `STAGING_PASSWORD`                                                  |
| AI features            | on                                 | **on since 2026-09-29** — `DISABLE_AI_FEATURES=false`, own key            |
| Nightly backup / purge | yes                                | **no** — `DISABLE_SCHEDULED_JOBS=true`, no `CRON_SECRET`                  |
| Cost                   | —                                  | $10/mo app (1 vCPU / 1 GiB fixed, same as live); database and bucket free |

> **Corrected 2026-10-01.** The AI row said "**off**, and no Anthropic key at
> all" until today, two days after it stopped being true. On 2026-09-29 staging
> got `DISABLE_AI_FEATURES=false` and its own Anthropic key, named
> `bidridge-staging` in the Anthropic console, set as an encrypted Run Time
> variable in the app's settings. A staging check that day placed a real AI
> mark. The stale row was then repeated as "staging has AI off" in a status
> answer, which is how it was caught. **Staging AI calls spend real money**
> on that key, under the same per-person daily limit as live. To answer "is
> AI on?", read the app's settings, not this table.

### How to reach it

Open **https://staging.bidridge.com**. A yellow page asks for the **staging
password** (kept in the owner's password manager, and in `.env.staging.local`
on the laptop). After that, the site is the ordinary app with a yellow
**STAGING** band across the top of every screen. Sign in with a staging
account — **live accounts do not exist there**; create one with "Create
account". The browser stays let in for 30 days; changing `STAGING_PASSWORD`
in the app's settings locks every browser out again.

`curl -s https://staging.bidridge.com/api/version` works without the password
(the one open path), so § 6's deploy check works on staging unchanged.

### The flow

```
local-dev  →  staging  →  main
```

**PUSHING A BRANCH DOES NOT RUN MIGRATIONS — on staging or on live.** The
build only builds. Every migration is a command you run by hand, and the
additive ones run BEFORE the push (§ 5, three steps).

> **Corrected 2026-09-29.** This list used to put the staging push at step 2
> and the migrations at step 3, which is the wrong way round for an additive
> file and read as if the push applied them. It was being read that way when
> 0089–0095 went to staging.

1. `git push origin local-dev` — as always, deploys nothing.
2. **Additive migrations go to the staging DATABASE first**, before any push
   (§ 5, step 1 of three):

   ```bash
   DOTENV_CONFIG_PATH=.env.staging.local pnpm tsx scripts/schemaDrift.mts
   ALLOW_REMOTE_DATABASE=yes DOTENV_CONFIG_PATH=.env.staging.local pnpm tsx scripts/migrate.mts
   DOTENV_CONFIG_PATH=.env.staging.local pnpm tsx scripts/schemaDrift.mts
   ```

   Drift before AND after, so the second run is an outcome rather than intent.
   `.env.staging.local` reaches the staging database over the public host,
   so the laptop's address must be on the database's trusted list (§ 10) —
   the same entry production uses.

3. **Then push the code:** `git push origin local-dev:staging`. The staging
   app rebuilds in 3–6 minutes; `/api/version` must show the commit you
   pushed. Check the screens there.
4. Meaning-changing backfills, if the release has any, run now (§ 5, step 3).
5. Then production, in the same order — see the release entry below for the
   current one, and § 5a for the full commands.

### LIVE: `24105ad` and migrations 0096–0104 (released 2026-10-06)

**Done with the owner's four approvals (A start, B database, C code, D done),
per `live-release-plan.md`.** Live went from `0af50a6` / 96 migrations to
**`24105ad` / 105**.

**Why `24105ad` and not `f8fdec3`:** `f8fdec3` carries Track B's "labor with
$0 material is not priced" rule. The priced print refuses any not-priced
line, and nothing clears that one until `assemblies.laborOnly` (migrations
0105–0106) and B's code ship. `24105ad` is the last commit before that merge
and has every Track A fix (`live-release-plan.md` § 0).

What each step printed (times UTC):

| Step                                                   | Printed                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smoke on `24105ad` (staging, branch `a-smoke-24105ad`) | run 37512445462 attempt 2: **96 passed, 2 skipped**. Attempt 1: flow 9 blank Plans after reload, once (todo.md, must-investigate)                                                                                                                                                                                                                       |
| Password reset on staging                              | passed (owner), after replacing staging's invalid Resend key                                                                                                                                                                                                                                                                                            |
| A — pre-flight                                         | live `0af50a6`; gate green on `24105ad` (run 37419721623); 179 commits; 9 migration files                                                                                                                                                                                                                                                               |
| Backup                                                 | **`2026-10-06T20-03-57Z`**: 63 tables, 3,428 rows, 5/5 files (324.3 MB), `r2://bidsoftware/helixbid`                                                                                                                                                                                                                                                    |
| Backup verified                                        | restored 63 tables / 3,428 rows = manifest (kept as `bidrender_backup_verify`, dropped afterwards)                                                                                                                                                                                                                                                      |
| Rehearsal on the restored copy                         | drift before: **96 recorded, 9 tables, FKs 135**; `migrate.mts` **9 applied, 105**; after **matches, FKs 141/141**; second run **nothing to apply**; data counts identical (3 users, 2 bids, 1,534 materials, 22 marks, 2 counts, 2 runs, 0 lines, 8 assemblies); bid totals unchanged (both bids empty, $0); `0af50a6` code on the migrated copy works |
| B — live totals before                                 | 2/2 bids, read-only session proven (`bidrender-backups/live-totals-before.json`)                                                                                                                                                                                                                                                                        |
| Live drift before                                      | **96 recorded, the same 9 tables, FKs 135**                                                                                                                                                                                                                                                                                                             |
| **Live migrate** (~20:11)                              | **"Applied 9 migrations: 0096_tee_body_role to 0104_run_end_connect. This database now has all 105."**                                                                                                                                                                                                                                                  |
| Live drift after                                       | **matches, FKs 141/141**; second run **nothing to apply**                                                                                                                                                                                                                                                                                               |
| Old code on the migrated live DB                       | site `0af50a6`, HTTP 200; `0af50a6` code priced both bids unchanged                                                                                                                                                                                                                                                                                     |
| C — **push `main`** (20:39:58)                         | `0af50a6..24105ad` fast-forward                                                                                                                                                                                                                                                                                                                         |
| Live build                                             | `/api/version` → **`24105ad`, builtAt 20:40:38** (live at 20:42:56)                                                                                                                                                                                                                                                                                     |
| D — live totals after                                  | **"all 2 bid(s): totalDue unchanged; not-priced and incomplete unchanged"**                                                                                                                                                                                                                                                                             |

**After the release, by the owner:** the live `RESEND_API_KEY`
(`bidridge-live`, sending access to `mail.bidridge.com`), then one reset test
on bidridge.com (release plan step 11). Until then "Forgot password?" says
reset by email is not set up.

**Next release** carries what `24105ad` left out: Track B's labor rule WITH
0105–0106 and B's `laborOnly` code, Track C's tie-labels and CAD layers, and
the reset early-check (`6518fc5`).

### Staging: reset email blocked by an invalid Resend key (fixed 2026-10-06)

**What happened.** The staging password-reset test stopped at step 4: the
screen said "If an account uses … a reset link is on its way", no email
arrived, and Resend's dashboard showed no send at all. The account existed and
a reset token was created, so the app did try. The staging runtime log said:

```
[email] password-reset NOT sent to jj…@gmail.com: Resend answered 400: API key is invalid
```

**Fix (owner).** A new Resend API key, pasted into the staging app's
`RESEND_API_KEY` at **app level** (Run time, Encrypt), saved, redeployed. The
next reset email arrived, the new password worked, the old one and the used
link were refused.

**What to remember.**

- **Resend shows no trace of a request it rejects for a bad key**, so "the
  dashboard shows nothing" does not mean the app never called it. Read the
  app's own log first: search Runtime Logs for `[email]`. Every refusal
  writes one line with its reason, and since 2026-10-06 so do the two stops
  before the email step (no account for the address; an account with no
  password), as `[auth] password reset: …`.
- Retyping `STAGING_EMAIL_ALLOWLIST` changed nothing because it was never the
  cause. Read the log line before changing settings.
- Live needs its OWN key (`bidridge-live`), never staging's, and is set
  during the live release (`live-release-plan.md`).

### Staging: migration 0142 — the no-match search log (2026-10-10 UTC) — NOT on live

`0142_search_misses` (Track B's table, B's SQL word for word): one new table
and a foreign key to `users` — additive, step 1, step 3 empty. Migrated
before the code. Branch `a-search-misses` (B's `track-b` merged, the
declaration moved into `drizzle/schema.ts`).

1. **Backup**: `staging-2026-10-10T02-24-10Z-before-0142.sql` (74 tables);
   restored to `bidrender_staging_restore_0142`: **74/74 counts equal**.
2. **Rehearsal** on that restore: drift before = exactly `search_misses`;
   `bidTotals` 1,035 with staging's code (`bf829b3`); **1 applied**, 143;
   re-run nothing; "matches", 177/177; **1,035/1,035 unchanged** with the old
   code AND the new.
3. **Staging database** (02:36 UTC): drift before the same; `bidTotals`
   1,043 (old code); **1 applied**, 143; re-run nothing; "matches",
   177/177; **1,043/1,043 unchanged** on the old code.
4. **Code**: branch Gate 38017501652 green; `9975a12` pushed to `staging`
   by hand (BEFORE local-dev, so the auto-deploy's drizzle check finds
   nothing new), then local-dev, after merging Track B's own merge of the
   same code.

**Live**: 0142 joins the batch — 0105–0142, 38 files, expect 143, 177/177
(`next-live-release-plan.md` § 3).

### Staging: the catalog reality check + both starter repairs (2026-10-10 UTC) — NOT on live

No migration — seed and code only (`a-catalog-reality`, `334104a` +
`8f28a85`; `references/catalog-reality-check-build.md`).

1. **Backup**: `staging-2026-10-10T01-38-57Z-before-reality-check.sql` (74
   tables) in `C:\dev\bidrender-backups\`; restored to
   `bidrender_staging_restore_reality`: **all 74 table counts equal
   staging's**.
2. **Rehearsal on that restore** (staging's code `aaed2a8` booted as the
   control): catalog 1,965 / 1,825 active; `bidTotals` 1,027. New code boot:
   **added 50, renamed 296, retired 158, deleted 0**, 1,717 active, every
   reference identical, `VERDICT: CLEAN`; second boot nothing. Covers: 2
   swapped (RS12, LT23), 1 skipped (RS13); retired repair: **13 repointed**;
   second runs 50 / 13 "already has it"; **1,027/1,027 unchanged**.
3. **Staging before** (02:43 local / 01:43 UTC, old code): 1,027 bids;
   catalog 1,965 / 1,825 active.
4. **Code**: branch Gate 38013969109 green; `local-dev` fast-forwarded to
   `8f28a85` and pushed; Gate 38014707002: test, deploy-staging, **smoke all
   green**. `/api/version` = `8f28a85`, built 02:00 UTC.
5. **After the first boot**: catalog compare against step 3 — added 50,
   renamed 296, retired 158, deleted 0, 0 on an old spelling, 0 duplicates,
   `VERDICT: CLEAN`; 1,717 active.
6. **Repairs**: covers report RS12 / LT23 "would swap", RS13 "skipped:
   edited" (its RV receptacle line); `--apply`: 2 swapped. Retired repair
   report "13 would repoint" (same 13 as the rehearsal); `--apply`: 13
   repointed. Second runs: 50 and 13 "already has it" (RS13 included).
7. **Totals**: **all 1,027 existing bids unchanged**. `--compare` printed 3
   differences, all bids missing before: 1029–1031, "CI smoke …", the
   smoke account's (owner 597), made during step 4's smoke.

**Live**: rides the next release with § 4b AND § 4c of
`next-live-release-plan.md` (both repairs, covers first).

### Staging: migration 0141 — a dead AI key says so (2026-10-09) — NOT on live

`0141_ai_service_status`: one new table, one row, no `UPDATE` — additive,
step 1, step 3 empty (§ 8a, `todo.md`). Migrated before the code.

1. **Backup**: `staging-2026-10-09T18-23-28Z-before-0141.sql` (73 tables) in
   `C:\dev\bidrender-backups\`.
2. **Rehearsal** on its restore (959 bids): drift before = exactly
   `ai_service_status`; `bidTotals` with staging's code `f058ab5`; **1
   applied**, 142; re-run nothing; "matches", 176/176 (the table has no
   foreign key); **959/959 unchanged** with the old code AND the new.
3. **Staging database** (18:27 UTC): drift before the same; `bidTotals`
   before (963 bids, old code); **1 applied**, 142; re-run nothing;
   "matches", 176/176; site HTTP 200 on the old code; **963/963
   unchanged**.
4. **Code**: `679cce8` pushed to `staging` by hand at 18:47 UTC (BEFORE
   `local-dev`, so the Gate's drizzle check finds nothing new), then
   `local-dev`. `/api/version` = `679cce8`, built 18:48. The Gate run on
   Track B's `8be0c18` (started 18:41) then failed its deploy-staging step
   with "staging has commits local-dev does not" — correct: staging was
   already ahead of it. Superseded by the run on `679cce8`.
5. **After** (18:58, new code): `bidTotals --compare` against step 3's
   before: **963/963 existing bids unchanged**; the 16 differences are bids
   965–980 made by the smoke account at 18:29–18:39. Drift "matches",
   176/176.
6. **AI panel**: `ai_service_status` on staging is EMPTY — no AI call since
   the deploy — so the admin panel shows no notice (no false alarm). NOT yet
   proved: a real call through staging's key on the new code. To prove it:
   staging → Dashboard → ask "where are labor rates" → an answer with a
   button; then Admin → AI spend shows no amber notice, and the row reads
   `lastWorkedAt` set, `refusedSince` NULL.
7. **PROVED by the owner (2026-10-09), on `679cce8`**: staging's Dashboard
   helper answered, and Admin showed no amber notice. A real call through
   staging's key works on the new code.

**Live**: 0141 joins the next release's batch — 0105–0141, 37 files,
expect 142 (`next-live-release-plan.md`).

### Staging: the coverage-check catalog adds (2026-10-09) — NOT on live

No migration — 24 new shipped rows (`3cb5df3`, owner-approved from
`coverage-check.md` on track-c), plus a search fix (a spoken cable spec no
longer matches a longer NEMA number). Additive: renamed 0, retired 0.

1. **Backups**: `staging-2026-10-09T05-13-27Z-before-coverage-rows.sql`
   (rehearsal) and `staging-2026-10-09T16-13-17Z-before-coverage-push.sql`
   (right before the push; staging had gained 8 bids in between), both 73
   tables, in `C:\dev\bidrender-backups\`.
2. **Rehearsal** on the first, restored locally (847 bids): staging's code
   booted as a control, 847/847 unchanged; the new seed twice: **added 24,
   renamed 0, retired 0, DELETED 0**, 1,825 active, 114 Specialty,
   `VERDICT: CLEAN`; second boot nothing; **847/847 unchanged**
   (`next-live-release-plan.md` § 5f).
3. **Before** on staging (code `94471cc`): `bidTotals` 855 bids; catalog
   1,941 rows / 1,801 active.
4. **Code**: `2221948` pushed to `local-dev`; Gate 37957706459 test,
   deploy-staging and smoke **all green**. By the time it was read, staging
   served **`71f9f82`** — `2221948` plus two Track B commits (the "Fix
   these" walk, a sheet-read fix; one touches `shared/lineNotPriced.ts`) —
   so the after-read below covers both.
5. **After** (16:53): `bidTotals --compare`: **855/855 existing bids
   unchanged**; the 27 differences are bids 857–883 created between the
   reads (12 by account 49162 at 16:19–16:21, 15 by the smoke account).
   `catalogRehearsal compare`: **added 24, renamed 0, retired 0, DELETED 0,
   1,825 active**, old spellings 0, duplicates 0, every reference
   identical — `VERDICT: CLEAN`.

### Staging: the Sch 80 / 500 seed (2026-10-09, 04:17 UTC) — NOT on live

No migration — seed content only (`sch80-and-500-plan.md`, Track A's half):
nine `N" PVC Sch 80, underground` run types with tape, the 500 base
renamed in place, the 500 cover retired, nine 500 parts, the 500 run type.

1. **Backup**: `staging-2026-10-09T03-57-40Z-before-sch80-500.sql` (73
   tables, `--single-transaction`, `VERIFY_IDENTITY` TLS) in
   `C:\dev\bidrender-backups\`. Not restored (no migration to rehearse).
2. **Before** (staging's code `c1e7b35`, worktree): `bidTotals` 814 bids;
   `catalogRehearsal snapshot` 1,932 baseline rows, 1,793 active.
3. **Code**: `8f3045c` + docs `13b0dd9` merged to `local-dev`; Gate
   37882505343 test, deploy-staging, smoke (on staging) **all green**;
   `/api/version` = `13b0dd9`, built 04:17.
4. **After**: `bidTotals --compare`: **814/814 existing bids unchanged**;
   the 9 "differences" are bids 816–824 created between the reads (817–824
   the Gate's smoke account, 04:21–04:25; 816 another account, 04:04).
   `catalogRehearsal compare`: **added 9, renamed 1** (`Surface raceway
base, 500 series` → `Surface raceway, 500 series`, same id #1683),
   **retired 1** (the 500 cover), DELETED 0, **1,801 active**, old
   spellings 0, duplicates 0; every pre-existing reference identical,
   checked row by row (its verdict line says "NOT CLEAN" only because the
   10 new run types add references).

### Staging: migration 0140 + the catalog review (2026-10-09, 01:10 UTC) — NOT on live

`0140_material_specialty`: `materials.isSpecialty`, nullable, no default,
no `UPDATE` — additive, step 3 empty. With it, the owner's catalog review
of the STARTER catalog, which runs in the SEED on the new code's first
boot (`references/catalog-review-2026-10-08.md`): 138 retired, 107 added,
23 renamed in place, 108 tagged Specialty, the three "#12 + ground" run
types moved to #12 THHN green, the 3-1/2" underground type archived.

1. **Backup**: `staging-2026-10-09T00-53-51Z-before-0140.sql` (73 tables,
   `--single-transaction`, `VERIFY_IDENTITY` TLS) in
   `C:\dev\bidrender-backups\`; restored locally as
   `bidrender_staging_restore_0140`; 66/73 table counts equal staging's, the
   other 7 higher on staging only by bids 775–776, "CI smoke …", written
   at 00:55 just after the dump.
2. **References into anything removed, before**: **no bid line** points at
   a retired or renamed row. Starter recipe lines point at renamed rows
   only (114 wire nut, 30 square box, …) — same ids. Four SHIPPED run
   types point at retired rows: three grounds on #12 bare, the 3-1/2"
   underground type's pipe; 0 runs were ever traced on that type.
3. **Rehearsal on that copy**: drift before = exactly `isSpecialty`;
   `bidTotals` before with staging's code `6c6a44f` (773 bids); **1
   applied**, 141; re-run nothing; "matches", 176/176; old code's totals
   **773/773 unchanged**. New seed (`scripts/seedBaseline.mts`, the boot's
   own function) twice: `catalogRehearsal compare` — **added 107, renamed
   23, retired 138, DELETED 0**, company rows unchanged, old spellings 0,
   duplicates 0, every reference identical except
   `takeoff_run_types.groundMaterialId` (the intended swap, all 3 now
   `#12 THHN green Copper`); type 14 archived; 108 Specialty; second seed:
   nothing changed. New code's totals: **773/773 unchanged**. Table counts:
   only `__drizzle_migrations` (+1) and `materials` (+107) moved.
4. **Staging database** (01:10 UTC): drift before the same; `bidTotals`
   before (781 bids, old code); **1 applied**, 141; re-run nothing;
   "matches", 176/176; site HTTP 200 on the old code; **781/781
   unchanged**.
5. **Code** (2026-10-09, 02:53 UTC): `d36bfc9` pushed to `staging` by hand
   (owner's yes); `/api/version` = `d36bfc9`. `bidTotals` before (old code,
   789 bids) vs after (new code): **789/789 unchanged**; the only two
   differences were bids 791–792, "CI smoke …", created between the reads.
   `catalogRehearsal compare` on staging itself: **added 107, renamed 23,
   retired 138, DELETED 0**, 1,793 active, 108 Specialty, old spellings 0,
   duplicates 0, company rows unchanged, every reference identical except
   `takeoff_run_types.groundMaterialId` — the intended swap, run types 1, 2
   and 5 now on `#12 THHN green Copper`. Gate 37874094992 re-run on
   `d36bfc9`: deploy-staging and smoke (96 passed) **green**.
6. **Starter cover repair** (Track B's `scripts/repairStarterCovers.mts`,
   right after the new code's first boot, as `next-live-release-plan.md`
   § 4b orders it for live): backup
   `staging-2026-10-09T02-58-38Z-before-cover-repair.sql` (73 tables); dry
   run **48 would swap** (staging's starters were all still on the old
   recipe — live's copy had 43 already); `--apply` **48 swapped**; re-run
   **48 already has it**; `bidTotals` **794/794 unchanged** (bids 796–797,
   "CI smoke …", created between the reads).

**Live**: 0140 joins the batch — 0105–0140, 36 files, expect 141 and
176/176 — and the live rehearsal must be re-run with the catalog review's
first boot (`next-live-release-plan.md` § 5d).

### Staging: migration 0139 (done 2026-10-08, 22:44 UTC) — NOT on live

`0139_elbow_flat_role`: `elbowFlat` appended to
`bid_line_items.runMaterialRole`, after `extra` (`per-foot-items-plan.md`
§ 4 M2 — a 700 type needs an inside elbow AND a flat elbow, and the bid
allows one line per type + role). Additive, no `UPDATE`; step 3 empty. Same
name, journal entry and statement as Track C's stand-in on
`c-per-foot-logic`, which takes this file at merge.

1. **Backup**: `staging-2026-10-08T22-38-43Z-before-0139.sql` (73 tables,
   `--single-transaction`, `VERIFY_IDENTITY` TLS) in
   `C:\dev\bidrender-backups\`; restored locally into a scratch database;
   **73/73 table counts equal staging's**.
2. **Rehearsal on that copy**: drift before = exactly the one enum, 176/176;
   `bidTotals` before; **1 applied**, 140; re-run nothing; "matches",
   176/176; `bidTotals` after: **all 732 unchanged**; counts after = before
   except `__drizzle_migrations` (+1).
3. **Staging**: serving `1e7f544` (built 22:27) — the same commit this
   checkout's code was based on, plus only the enum and tests. Drift before
   the same; `bidTotals` before (732 bids); **1 applied**, 140; re-run
   nothing; "matches", 176/176; `bidTotals` after: **all 732 unchanged**;
   site still HTTP 200 on the old code.
4. **Code**: the commit after this record — `RUN_MATERIAL_ROLES` gains
   `elbowFlat`, a tripwire case in `feetForRole` (nothing writes the role
   until C's 700 code), `server/migration0139.test.ts`. Pushed to `staging`
   by hand (the auto-deploy refuses a `drizzle/` change), then `local-dev`.

**Live**: 0139 joins the batch (0105–0139, 35 files, expect 140 and 176/176
FKs — `next-live-release-plan.md` § 3). Additive, so it is safe ahead of C's
code; it reaches live with whichever release carries that code or earlier.

### Staging: migrations 0135–0138 (done 2026-10-08, ~19:35 UTC) — NOT on live

The per-foot items plan's M1–M4 (`per-foot-items-plan.md` § 4), all four
additive (no `UPDATE`); step 3 empty. With them, seed content: ten
underground PVC types with tape extras, the 700 type, seven 700 fittings,
the 700 base renamed in place and the cover retired.

1. **Backup**: `staging-2026-10-08T19-09-32Z-before-0135-0138.sql` (72
   tables, `--single-transaction`, `VERIFY_IDENTITY` TLS) in
   `C:\dev\bidrender-backups\`; restored locally; 67 table counts equal
   staging's, the other 5 higher on staging only by bids 648–649, "CI
   smoke …", written after the dump.
2. **Rehearsal on that copy**: drift before = exactly this batch;
   `bidTotals` before (staging's code `df25451`); **4 applied**, 139;
   re-run nothing; "matches", 176/176; old code's totals: **all 646
   unchanged**; the new seed booted twice (15 types both times); new
   code's totals: **all 646 unchanged**. The 700 base kept its id (#1685),
   the cover #1686 retired, 10 tape extras.
3. **Staging**: drift before the same; `bidTotals` before (651 bids, old
   code); **4 applied** (0135 → 0138), 139; re-run nothing; "matches",
   176/176; old code still serving — **all 651 unchanged**.
4. **Code**: `06791ea` pushed to `staging` by hand, then `local-dev`;
   served 19:37 UTC. First boot (read only): 15 shipped types, 10 tape
   extras (flat, 1.0), #1685 = "Surface raceway, 700 series" (10 ft
   sticks, clip spacing NULL), #1686 retired, seven fittings #1829–1835.
   `bidTotals` with the new code: **all 651 unchanged**.
5. **On screen**: LOCAL, laptop size — the conduit picker opens on the
   common types with "› Underground (10)" closed; opened, the ten list by
   size. (Found and fixed on that look: they first came out alphabetical,
   1-1/2" before 1-1/4".)

**Live**: 0135–0138 go only with the code that reads them (plan § 4,
pairing). They are additive, so applying them before that code is safe,
but the seed content (11 types, the 700 rename) ships with whichever
release carries `06791ea`, and needs 0117 and 0135 on live first.

### Staging: migrations 0125–0134 (done 2026-10-08, ~01:50 UTC) — NOT on live

Track C's homerun footage (0125–0130), the 0131 C asked for
(`bids.homerunExtraBends`, `takeoff_runs.runsAt`) and the example tags
(0132–0134), applied TOGETHER and in order: the migrator skips a file whose
`when` is older than the newest applied, so 0132–0134 must never land first.
All ten are additive (no `UPDATE`); nothing in step 3.

1. **Backup**: `staging-2026-10-08T01-46-38Z-before-0125-0134.sql` (69
   tables) in `C:\dev\bidrender-backups\`; restored locally. 64 table counts
   equal staging's. The other 5 (bids, bid_pdfs, three sheet tables) were
   higher on staging only by CI smoke rows written after the dump (bids
   507–510, "CI smoke …"), not a restore fault.
2. **Rehearsal on that copy**: drift before listed exactly this batch;
   `bidTotals` before (staging's code `6d860d0`); **10 applied**, 135; second
   run nothing; "matches", 173/173 foreign keys; the shipped-library seed run
   as a boot would (example rates landed: 70.50 / 59.22 / 36.66 / 33.84);
   `bidTotals` after (merge code): **all 505 bids unchanged**.
3. **Staging**: drift before the same; `bidTotals` before (511 bids);
   **10 applied** (0125 → 0134), 135; second run nothing; "matches",
   173/173. Old code still served and priced all 511, unchanged.
4. **Code**: `bea4d8f` pushed to `staging` by hand, then `local-dev`. Gate
   run 37715026901: test, deploy-staging, smoke all green. `bidTotals` after
   the new code booted (example rates seeded): **all 511 earlier bids
   unchanged**; the only differences were bids 513–514, new smoke bids.
5. **On screen**: done at 1180x820 touch on LOCAL copies, not on staging.
   Staging's gate password and sign-up are not something Track A's agent may
   enter. A copy of C's database with the merged code showed E111: 38
   homeruns, 11,988.1 ft of wire, 2B-1 at 42.8 ft. Ceilings opened, and bid
   totals read "Materials $0.00 + 205 drops not priced". A fresh first-run
   shop showed setup with each example rate, the banner, Most used, all three
   tags, and the print warning with "Print anyway". The proposal showed no
   tag.

### Staging: migrations 0105–0124 (done 2026-10-07) — NOT on live

All twenty step-1 files (`migrations-next-batch.md`). Owner, 2026-10-06:
the pairing rules (labor only; hours not set) are for the LIVE release, so
staging takes the batch now; the live gates are at the top of
`live-release-plan.md`.

1. **Drift before** (from the batch's code): 105 recorded; every difference
   listed is this batch's — nothing else.
2. **Backup**: `staging-2026-10-07T00-13-36Z-before-0105-0124.sql` (65
   tables, `--single-transaction`, verified TLS) in
   `C:\dev\bidrender-backups\`; restored locally as
   `bidrender_staging_restore`; **all 65 table counts equal staging's**.
3. **Rehearsal on that copy**: `bidTotals` before (code `3a173a0`), **20
   applied**, rerun "Nothing to apply", "Database matches the schema",
   foreign keys 159/159, `bidTotals` after (batch code): **all 242 bids
   unchanged**.
4. **Gate green** on the merged batch `af235b2` (full suite on a fresh
   database through 0124), after a first run's 8 guard failures were
   answered (`0be70ad`).
5. **Staging**, 00:16 UTC: **20 applied**, 125; "matches", 159/159; second
   run nothing. The old code (`60ae696`) answered throughout — every file is
   additive.
6. **Code**: `e042dc1` pushed to `staging` by hand, then `local-dev`;
   staging served it at 00:42 UTC. First boot: **167 shared starters, 159
   with hours NULL, 0 at 0 h**, 29 in the new shelves (read-only query) —
   the rehearsal's numbers exactly.
7. **Spot-check on screen found a fault**: the Assemblies screen showed 138
   of 167 — it grouped by a hand-kept copy of the five old categories and
   dropped the rest. Fixed in `932cb53` (one shared list pinned to the
   schema; grouping never drops a row). **`932cb53`: test, deploy-staging
   and smoke all green (run 37553791194)**; the screen then showed all 167,
   "hours not set" on every new starter, none 0.
8. Side effect, harmless: Track C's queued run for `722ca8f` failed its
   deploy-staging step ("staging has commits local-dev does not"), because
   staging had been pushed by hand ahead of it. Its tests passed.

### Staging: migrations 0103–0104 (done 2026-10-05) — on live since 2026-10-06 (`24105ad`, entry above)

Batch 1b (`migrations-0098-batch-plan.md` § S): `'unconfirmed'` appended to
`takeoff_stamps.status` (every row NULL) and `takeoff_runs.startConnect` /
`endConnect`. Both additive. Shipped with the two mark-status rules in
`shared/markStatus.ts` (only new marks are quantities; a run never snaps to or
attaches to an unconfirmed mark) — which move no number while every status is
NULL, as it is on staging and live.

1. **Backup**: `staging-2026-10-05T19-41-13Z-before-0103-0104.sql` (65 tables)
   in `C:\dev\bidrender-backups\`, restored locally, every count equal to
   staging's.
2. **Rehearsal on it**: drift before, 103 recorded, the 2 expected
   differences; **2 applied**, 105; "matches", 141/141; second run nothing;
   data counts unchanged; no mark has a status.
3. **Gate green** on `af65f84` (full suite on a fresh database through 0104).
4. **Staging**: the same 2 differences before; **2 applied**, 105; "matches",
   141/141; second run nothing; data unchanged; old code (`fe2df5e`) answered
   throughout.
5. **Code**: `af65f84` pushed to `staging` by hand, `local-dev` fast-forwarded
   to it; `/api/version` = `af65f84` (built 19:58 UTC); drift against it:
   matches.

**Live takes 0096–0104 together**: `references/live-release-plan.md`.

### Staging: migrations 0096–0102 (done 2026-10-02) — on live since 2026-10-06 (`24105ad`, entry above)

The marks batch (`migrations-0098-batch-plan.md` § S, Batch 1) with the two
password-reset files from `a-email-reset`. All seven are additive and
nullable, so they went on the database BEFORE the code (§ 5).

1. **Backed up staging, and proved the backup restores.** Staging has no
   nightly backup, so the backup is a `mysqldump` over TLS
   (`--single-transaction`) to `C:\dev\bidrender-backups\` on the owner's
   laptop: `staging-2026-10-02T05-14-49Z-before-0096-0102.sql` (63 tables),
   restored into a local scratch database and compared with staging table by
   table — every count equal.
2. **Rehearsed on that restored copy**, twice (an earlier copy too): drift
   before, 8 tables out — exactly the expected set; migrate, **7 applied**;
   drift after, "matches", 141/141 foreign keys; second migrate, nothing to
   apply; every data count unchanged; the new code's main reads (bids,
   dashboard, counts, symbols, plan sets) all answer on it.
3. **Staging**: drift before, 96 recorded, the same 8 tables. Migrate, **7
   applied**, 103 recorded. Drift after, "Database matches the schema",
   141/141. Second run, nothing. Data counts before and after: identical. The
   OLD code (`9455e5f`) kept answering in between.
4. **Code**: `c3b1677` pushed to `staging` by hand (a push with `drizzle/`
   changes is refused by the auto-deploy, by design), then `local-dev`
   fast-forwarded to the same commit; the auto-deploy then found nothing to
   refuse and confirmed `/api/version` = `c3b1677`. Drift against the running
   code: matches.

**For live, later, the same order:** fresh backup of live and prove it
restores (§ 5a), drift, migrate (**expect 7 applied, 103 recorded** — if the
number differs, stop and find out why before going on: either this line is
stale or the database is not where you think), drift, check the old code,
then release `main` (§ 4).

### Live release: migrations 0089–0095 (written 2026-09-29, done 2026-09-29)

Staging took this release on 2026-09-29: its drift check went from 6 tables
and 2 foreign keys out of line (89 migrations) to "Database matches the
schema" (96 migrations, 135 of 135 foreign keys), then `d9fa1d8` was pushed and
checked. **Live is still on `45ada57` with 89 migrations** as of that day.

**Pushing `main` does NOT run these migrations.** They are all additive —
nullable columns, one new table, one index and foreign key, no `UPDATE` — so
they go on the live database BEFORE the push, and step 3 of the three is
empty. The order:

1. **Back up the live database, and prove the backup restores.** § 5a steps 1
   and 2: `scripts/backup.mts`, then `scripts/verifyBackup.mts` into a local
   MySQL. Minutes before, not last night's. A backup that has not been
   restored is not yet a backup.
2. **Run 0089–0095 on live.** § 5a's commands against
   `.env.production.local`, with `ALLOW_REMOTE_DATABASE=yes`, and
   `scripts/schemaDrift.mts` before and after. Expect **seven** applied, 96
   recorded, and "Database matches the schema". **If what it prints does not
   match, stop and find out why before going on** — either this line is stale
   (another migration landed since it was written) or the database is not in
   the state you think it is, and those want opposite responses.
3. **Confirm the OLD live code still works against the new columns — before
   pushing anything.** `curl -s https://bidridge.com/api/version` must still
   say `45ada57`. Then on bidridge.com open a real bid: it loads, its plans
   open, its totals show. Old code ignores the new columns (it selects only
   what it knows about), so nothing should change — this step is what makes
   that a measurement rather than an expectation. If anything is broken here,
   the push has not happened yet and nothing new is live; stop.
4. **Push `main`** — § 4 exactly: pre-flight, `git merge --ff-only local-dev`,
   push, `git checkout local-dev`, watch DigitalOcean → Activity.
   `/api/version` must then show the pushed commit and a fresh `builtAt`
   (§ 6).
5. **Check one real bid on the new build**: it opens, plans load, totals show.

When it is done, change this heading's "not yet done" to the date, and say so
here.

**Done 2026-09-29, in this order.** Backup `2026-09-29T19-00-13Z` (62 tables,
3144 rows, 5 files) restored and VERIFIED into local MySQL with
`KEEP_SCRATCH=1`, and 0089–0095 rehearsed on that restored copy: 7 applied,
matches, 135/135 foreign keys; scratch dropped. Live drift before: 89
recorded, 6 tables and 2 foreign keys out. Live migrate: 7 applied, 96
recorded, "Database matches the schema", 135/135. Old code (`45ada57`) then
opened bid 23 and its plans with 0 failed API calls. `main` pushed
`45ada57..3ca33dc` at 19:05:36Z; `/api/version` reported `3ca33dc`, `builtAt`
19:06:28Z. Bid 23 re-checked on the new bundle.

**One figure moved, on purpose — do not read it as a fault.** Bid 23's
"This bid, all sheets" read Conduit 104.52 ft on the old code and 0 ft on the
new, with "2 runs have no type — 179.87 ft of conduit is not on the bid". That
is the 2026-09-27 decision in `shared/runOnBid.ts`: the totals show what the
bid prices, so untyped runs are left out and named, and a draft now counts
(104.52 ft finished + a draft = 179.87 ft).

### What keeps it away from live data — and how to check it still does

Staging shares the production database **cluster** (free, and fine at today's
traffic; a heavy test there can slow the live site, so do not load-test on
staging). What keeps it off live data is the **login**, not the cluster:
`bidrender_staging_app` has rights on `bidrender_staging` and nothing else.

```bash
pnpm tsx scripts/stagingDatabase.mts prove
```

connects **as the staging login** and tries to read live bids and users, list
and switch to the live database, write to it, read the login table, see or
change `bidrender_app`, grant itself the live database, create a role, and log
in as `bidrender_app` with the staging password. **Every line must say `ok
refused`.** It printed twelve `ok` lines on 2026-09-27. If any line says
`FAIL`, or the count of `ok` lines differs, **stop and find out why** — either
this doc is stale or staging can reach live data, and those want opposite
responses.

Run it after anything that touches database users. It is also how you check a
new staging login if the database is ever rebuilt:
`ALLOW_REMOTE_DATABASE=yes pnpm tsx scripts/stagingDatabase.mts provision`
(as `doadmin`, from `.env.digitalocean`) creates the database and login,
narrowed; `prove` then checks the outcome.

**Never copy live data into staging.** It holds real contractors' bids and
prices. Staging was built from the migrations and the seeded catalog, and
started with zero users and zero bids.

### Its settings

Made by script into the gitignored `staging-app-settings.txt`, pasted with
"Add from .env" on the component, then deleted (2026-09-27). Fourteen settings;
as they stand on the staging app:

| Scope              | Encrypted | Settings                                                                                                                                                                                    |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Run Time**       | yes       | `DATABASE_URL`, `DATABASE_CA_CERT`, `JWT_SECRET`, `STAGING_PASSWORD`, `R2_PLANS_ACCESS_KEY_ID`, `R2_PLANS_SECRET_ACCESS_KEY`, `R2_PLANS_ACCOUNT_ID`, `R2_PLANS_ENDPOINT`, `R2_PLANS_BUCKET` |
| Run and Build Time | no        | `NODE_ENV`, `VITE_APP_ID`, `DISABLE_SCHEDULED_JOBS`, `DISABLE_AI_FEATURES`, `PLAN_STORAGE`                                                                                                  |

**Nine are encrypted, not six.** The last three R2 names are not secrets —
on live they are plain — and encrypting them costs only that DigitalOcean
will not show their values again. They are in the Cloudflare dashboard if
ever needed. `VITE_APP_ID` must stay **Run and Build Time**: it is baked into
the page at build.

> **RUN TIME, NOT BUILD TIME.** The scope dropdown offers both, next to each
> other. A setting on **Build Time** exists only while the app is being built
> and is GONE when it runs — the running app sees it as empty. That is what
> happened to all five `R2_PLANS_*` settings on 2026-09-27: uploads failed with
> "PLAN*STORAGE=r2 but the plan bucket is not configured. Missing: …" while
> every value was present and correct. The fix was the dropdown, not the
> values. The build (`scripts/build.mts`) reads nothing but `VITE*`names, so
**no setting here should ever be Build Time alone.** To check without
reading a value: download the App Spec and look at each`scope:`— the
staging spec showed`BUILD_TIME` on exactly the five that failed.

Staging's `JWT_SECRET` is its own, so a live session cookie means nothing
there and the reverse.

**Check the file before pasting it:** `pnpm tsx scripts/stagingSettingsCheck.mts`
connects with the certificate exactly as the app reads it, writes and deletes
a probe object in `bidrender-plans-staging`, and confirms the key is REFUSED
on `bidrender-plans` and `bidsoftware`, then checks the bucket's CORS rule the
way a browser on staging meets it — viewing as well as uploading (§ 9).
Sixteen `ok` lines on 2026-09-27; if the count differs, stop and find out why —
either this line is stale or the settings are not what you think. It exists
because the first version of
the file put the certificate on 25 lines — a `\n` typed through the shell
became real line breaks (CLAUDE.md § "Edit code with the Edit tool") — and
App Platform would have been handed a broken certificate.

**The file it reads is deleted now**, so re-running it means making the file
again: the database line from `.env.staging.local` (with `private-` inserted
after the `@`), and a NEW R2 token from Cloudflare — the old token's secret is
shown once and now lives only in DigitalOcean, encrypted. To check the bucket
rule alone, the `curl` probes in § 9 need no file.

### The staging app's database access

The staging app is on the same VPC as the database (`default-sfo3`), uses the
`private-` host, and its VPC egress IP **`10.124.0.4`** is on the database's
Trusted Sources — exactly like live (§ 10). **Without that entry the staging
app cannot reach its database** — every screen fails to load: the lock from
Stage 4 applies to it too. (Seen on creation, 2026-09-27: the app showed
"Degraded" until the entry went in, then Healthy.)

### How it was created, 2026-09-27 — for the next time

App `bidrender-staging`, SFO3, 1 vCPU / 1 GiB fixed ($10), branch `staging`,
autodeploy on, **build command empty**, **run command `node dist/index.js`**
(the wizard proposes `pnpm start`; live uses `node dist/index.js`), "Connect
app to VPC network" → `default-sfo3`. Settings were added on the COMPONENT
with "Add from .env". Default address:
`https://bidrender-staging-t9gxx.ondigitalocean.app`.

### The domain — and the warning that looks worse than it is

`staging.bidridge.com` was added with **"You manage your domain"**, then ONE
record created by hand in Networking → Domains → `bidridge.com`:

```
CNAME  staging  →  bidrender-staging-t9gxx.ondigitalocean.app
```

**Adding the domain shows a yellow warning** — "This domain is already being
used by another app. Adding it again will overwrite existing DNS records" —
with BOTH options, because the live app owns the `bidridge.com` zone. With
"You manage" it wrote nothing: every record for `bidridge.com` and
`www.bidridge.com` was snapshotted from public DNS before the click and was
identical after it, and DigitalOcean's own nameserver still had no `staging`
record until the CNAME was added by hand. **"We manage your domain" was NOT
tried** on the live zone and should not be. HTTPS came up about two minutes
after the CNAME.

The live zone, for recovery, as it stood 2026-09-27: `A @ 162.159.140.98`,
`A @ 172.66.0.96`, `AAAA @ 2a06:98c1:58::60`, `AAAA @ 2606:4700:7::60`,
`CNAME www → bidrender-hulvy.ondigitalocean.app`, `NS ns1–3.digitalocean.com`,
plus the staging CNAME above.

### The plans bucket

`bidrender-plans-staging`, with its own R2 token (Object Read & Write on that
bucket only) and the § 9 CORS rule for `https://staging.bidridge.com`: `GET`,
`HEAD`, `PUT`, `POST`; `Content-Type` and `Range`; `ETag`, `Accept-Ranges`,
`Content-Range`, `Content-Length`, `Content-Encoding` exposed.

**Its first rule allowed only `PUT`** (copied from § 9 as it then stood), and
the first plan uploaded to staging could not be opened: "Failed to fetch".
The bucket answered a viewing preflight with 403 while the live bucket, asked
the same question, allowed `GET, PUT, POST, HEAD`. Both § 9 and
`stagingSettingsCheck.mts` now cover viewing. Also found the same day: the
five `R2_PLANS_*` settings had been set to **Build Time**, so the running app
saw them as empty — "PLAN_STORAGE=r2 but the plan bucket is not configured".
They must be **Run Time** (the build never reads them).

## 12. The browser smoke test on staging — `e2e/`

**Added 2026-10-01** (references/build-pipeline-plan.md, piece 3). After every
automatic staging deploy (§ 4, step 0), GitHub Actions runs a Playwright test
in **its own headless browser** against `https://staging.bidridge.com` — the
staging recheck list, done by a machine. It reports **failures only**: a green
run says nothing; a red one emails the repo owner with the failing step named,
and keeps a screenshot of the failing page as a run artifact for 7 days.

**What it covers** (`e2e/smoke/`): an empty bid's proposal and blocked Print;
uploading a two-sheet plan; the right-panel tabs; capturing symbols; rename and
reset; 8a (count with no assembly, link later); two symbols on one assembly
keeping separate counts and lines at one price; "Not on the bid yet" and Send
all sending once; a sheet switch putting the count down; pins waiting for their
own page, with the loading bar; R and "Again"; a refresh keeping sheet and zoom;
undo, redo, delete and Undo; a traced run measuring **77.78 ft** (checked by
arithmetic); deleting a run asking first, Enter not deleting; Clear this sheet
and one Ctrl+Z; a locked bid refusing Send, a scale change, a mark delete and a
plan removal; the new-version bar not reloading the page; every main screen at
desktop, phone 390x844 and tablet 820x1180 / 1180x820 with nothing cut off; and
the count-link-send flow **by touch** on both tablet sizes.

**What it does NOT cover:** anything that spends AI money (it never presses an
AI button), a real phone in a hand, and how a screen feels. Those stay manual.

**It can never touch live.** The address must be staging or this machine
(`scripts/smokeTarget.ts`, tested), and `bidridge.com` is refused by name. It
uses its own staging account, names every bid it makes `CI smoke …`, archives
them at the end, and sweeps any a crashed run left behind before it starts.

**Known faults are carried as expected failures, never skipped**
(`KNOWN_FAULTS` in `e2e/smoke/screens.spec.ts`, `test.fail`): visible on every
run, and red ("expected to fail, but passed") the day they are fixed, so the
entry comes out. **The list is empty today.** On its first day it found four —
the Dashboard, bid and Proposal headers running off a 390px phone, and the
sidebar covering the full-screen panel's "← Plan" on an upright tablet — and
all four were fixed by Track B's device work the same day, each one reported
by this mechanism.

### Setting it up — the owner's steps, once

The password never goes into the repo, a file, or a log. It lives in your
password manager and in GitHub's encrypted secrets, which print as `***`.

**A. Make the staging test account**

1. Open a **private** browser window and go to `https://staging.bidridge.com`.
2. Type the **staging password** (the yellow page) and press Enter.
3. On the sign-in page, click **Create account**.
4. Name: `CI smoke`. Email: an address you control that is used for nothing
   else — a Gmail plus-address works (`yourname+bidridge-smoke@gmail.com`).
5. Password: let your password manager **generate** one (long, with a symbol).
   Save it there as **"BidRidge staging — smoke test"**, with the email.
6. Click **Create account**. You can close the window at the welcome screen —
   the test finishes first-run itself. **Never create this account on live.**

**B. Give GitHub the three secrets**

1. Go to `https://github.com/Jnicoara/BidRender`.
2. Click **Settings** (top bar) → in the left column **Secrets and variables**
   → **Actions**.
3. On the **Secrets** tab, click **New repository secret**.
4. Name `SMOKE_EMAIL`; Secret: the account's email. Click **Add secret**.
5. **New repository secret** again: name `SMOKE_PASSWORD`; Secret: the
   account's password. **Add secret**.
6. **New repository secret** again: name `SMOKE_STAGING_PASSWORD`; Secret: the
   staging password from step A2. **Add secret**.

Until all three exist, the smoke job prints a warning ("NOT RUN: the … secrets
are not all set") and passes, so a missing setup is visible but never blocks a
merge. After step B, the next green push to `local-dev` runs it.

**C. Check the first run** — **Actions** tab → **Gate** → the newest run on
`local-dev` → the **smoke** job. Green means done. If the very first step
(`sign in the smoke account`) fails, its message says which of the three was
refused; re-enter that secret (a secret cannot be read back, only replaced).

**Pausing staging deploys** while you recheck by hand: **Settings → Secrets and
variables → Actions → Variables → New repository variable**, name
`STAGING_AUTODEPLOY`, value `off`. Delete it (or set `on`) to resume.

**Running it locally:** put a LOCAL account in `.env.test.local` (git-ignored:
`SMOKE_BASE_URL=http://127.0.0.1:<port>`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`),
start a server on that port, then `pnpm smoke`. A production build
(`pnpm build && pnpm start`) is the closer match to staging — the new-version
bar only exists in a build.

**Artifacts never carry a credential in the clear.** The repo is public, so
anyone can download a run's artifacts. Playwright TRACES record every request
with headers and bodies — the passwords and the session.

> **Changed 2026-10-09.** This said "traces off, do not turn them on in CI".
> Flow test 5 then failed once with a screenshot as the only evidence, and the
> cause (the click armed the WRONG count — a server answer, invisible in a
> picture) took a session to find. So a FAILED test now keeps a trace
> (`trace: "retain-on-failure"`), and the Gate SEALS it before upload:
> `openssl` AES-256 with the passphrase **`SMOKE_STAGING_PASSWORD` followed
> directly by `SMOKE_PASSWORD`** (no space). Anyone able to open it already
> holds every credential inside it. The upload matches `*.png` and
> `*.trace.enc` only, so a trace the seal step missed is never uploaded.
> Video stays off.

**Opening a sealed trace** — download the run's `smoke-failures` artifact,
then, with both passwords from your password manager:

```bash
read -rs -p "staging password then smoke password, no space: " TRACE_KEY; export TRACE_KEY; echo
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:TRACE_KEY \
  -in trace.trace.enc -out trace.zip
unset TRACE_KEY
npx playwright show-trace trace.zip
```

The decrypted `trace.zip` holds the session and both passwords: open it, then
delete it. Never attach it to an issue or commit it.
