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

1. **Pre-flight** — § 3 above.
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

## 9. Storage needs a CORS rule, and without it no plan uploads

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
