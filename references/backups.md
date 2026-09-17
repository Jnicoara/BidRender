# Backups

An export of everything — every table and every uploaded file — to Cloudflare
R2, deliberately independent of the app's own hosting.

---

## 1. Why this exists

`references/deploying.md` § 8 lists the outside services this app cannot run
without. Two of them hold everything that matters: the database, and the bucket
holding every plan PDF and every company logo. Losing access to either account
loses one half of the business, and the plan files are the half that cannot be
rebuilt from anywhere else.

This tool copies both into a **third** place — a separate bucket, reached with
separate credentials — so no single account holds the only copy.

Both halves read from Cloudflare directly: the database over `DATABASE_URL`, and
plan files straight out of the `bidrender-plans` bucket using a read-only key.
**There is no fallback path, and that is deliberate** — see § 2.

**Plan files stream through; they are never assembled in memory.** The backup
used to pull each file fully into memory before uploading it, which was
invisible at 20MB a plan and untenable once the app started accepting 2GB: a
nightly job that allocates 2GB on a small instance gets killed, and a backup
that gets killed is no backup. Measured on a real 400MB object, the process
grew by **9MB**. See `server/backup/planFileSource.ts`.

## 1a. The three R2 tokens, and why there are three

| Token                 | Scope                              | Used by                   |
| --------------------- | ---------------------------------- | ------------------------- |
| `R2_*`                | `bidsoftware`, Object Read & Write | the backup, writing       |
| `R2_PLANS_*`          | `bidrender-plans`, Read & Write    | the app: uploads, viewer  |
| `R2_PLANS_READONLY_*` | `bidrender-plans`, **Read only**   | the backup, reading plans |

**Why not one token for the copy.** A server-side bucket-to-bucket copy — bytes
never touching our machine — needs one credential with read on the source and
write on the destination. An R2 token's permission level applies to the whole
token, not per bucket, so that credential would be Read & Write on
`bidrender-plans`: the backup job holding write access to every contractor's
plans. Two tokens instead, streaming down with one and up with the other. The
cost is bandwidth and time through the backup host. What it buys is that a leak
of the copying credential lets someone READ plans but never alter or destroy
one.

**`R2_PLANS_*` must never gain access to the backups.** It signs URLs a
browser touches, which makes it the most exposed secret in the system.

`pnpm tsx scripts/checkPlansReadOnly.mts` proves the read-only token can read
plans, cannot write or delete them, and cannot see `bidsoftware` — because
"Object Read only, one bucket" is a claim made in a dashboard, and a token
accidentally created Read & Write would work perfectly while carrying far more
authority than intended.

## 2. Configuration

Server-side only, in `.env.production.local` (which is gitignored):

```bash
# Where the backup goes
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=bidsoftware

# Reading plan files to copy. Object Read ONLY, bidrender-plans only.
# The bucket and endpoint come from the R2_PLANS_* values the app already has.
R2_PLANS_READONLY_ACCESS_KEY_ID=...
R2_PLANS_READONLY_SECRET_ACCESS_KEY=...
```

**Without the read-only pair the backup refuses to start.** Not "skips the
files", not "warns and carries on" — it stops before doing anything and names
the two settings to fix.

That is deliberate, and it is the more useful behaviour by some distance. There
used to be a fallback that read plan files the long way round through the old
platform; it went with that platform in v5.141. The tempting replacement was to
carry on and list every unreadable drawing under "warnings" — which produces a
backup that reports success every night with every contractor's plans missing
from it, discovered on the day somebody needs one back. **A loud failure tonight
is cheaper than a quiet useless backup for a month.**

**The bucket is `bidsoftware`.** This said `bidrender-backups` for a while,
which is not a bucket — it is the name someone gave an API token. The backups
have always been in `bidsoftware`, and `R2_BACKUP_PREFIX` puts them under
`helixbid/` inside it (both names are older than the product's, and both stay
for the same reason: that is where the existing backups are).

**Which file these live in matters, and it is easy to get wrong.** The values
are kept in `.env.production.local`, but `scripts/backup.mts` loads `.env` —
so running it with no further ceremony reports the configuration as missing
when it is merely elsewhere. Point the command at the right file rather than
keeping a second copy of the credentials:

```bash
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/backup.mts
```

Optional:

| Variable           | Default                                      |
| ------------------ | -------------------------------------------- |
| `R2_ENDPOINT`      | `https://<account>.r2.cloudflarestorage.com` |
| `R2_BACKUP_PREFIX` | `helixbid`                                   |

**No `VITE_` prefix on any of them, ever.** Vite inlines every `VITE_*` variable
into the client bundle at build time, so a secret named that way is published to
every visitor. Same rule as the LLM gateway key. `server/backup.test.ts` asserts
it.

Create the R2 token with **Object Read & Write** on that one bucket. It does not
need account-level permissions.

## 3. Running it

```bash
pnpm tsx scripts/backup.mts
```

This is the trigger to reach for. It needs `DATABASE_URL` and the four R2
values, and nothing else — no login, no session, no deployed app, and no request
timeout sitting over a job that legitimately takes minutes. **On the day this
matters, the app being up is not a safe assumption.**

Exit code is 0 only on a completely clean run. Any failed file, any error, is 1.
**Deliberately stricter than the nightly cron** — see § 4 Outcomes. A person who
typed the command wants the strict answer; a retry loop does not.

There is also an admin-only route — `backup.run` and `backup.status`
(`server/routers/backupRouter.ts`) — for taking one from a phone, and for
answering "is this even configured?" without a terminal. A large backup may
outlast the HTTP request; that is expected, and the CLI is the answer.

## 4. Running it automatically

**Live since 2026-09-17.** Before that every backup in the bucket was taken by
hand, because the scheduler had never been set up — first on Manus, where the
route did not exist in the deployed build, and then on DigitalOcean, where the
app was running but nothing was knocking on it.

The nightly job is **two pieces that ship separately** (`CLAUDE.md` § Scheduled
work), and they are deployed by different means to different places:

1. **The handler, inside the app** — `server/scheduled/backupToR2.ts`, mounted
   at `/api/scheduled/backupToR2`. It ships with the app like any other code.
2. **The Cloudflare Worker** — `workers/cron/`, deployed separately with
   `wrangler` from a local checkout. It holds the same `CRON_SECRET` and POSTs
   to the handler on a timer.

The Worker lives outside the app deliberately. The app's instances are stopped
and replaced by the host, so a timer running inside one dies with it and takes
the guarantee along. Something outside has to do the asking.

### Deploying the Worker

```bash
cd workers/cron
npx wrangler deploy                    # 1. create the Worker
npx wrangler secret put CRON_SECRET    # 2. then give it the secret
```

**That order, not the other way round.** A secret cannot attach to a Worker that
does not exist yet — `wrangler secret put` run first has nothing to attach to and
stops to ask whether to create one, which a non-interactive shell cannot answer.
The gap between the two commands is harmless: a Worker with no secret refuses to
call the app and says so loudly, rather than calling it with a blank password.

`CRON_SECRET` must be **byte-identical** to the app's. Prove it rather than
assuming it — POST to the handler by hand with the value you are about to use
(§ 3) and check you get a `200`. The app's refusal is deliberately identical to
every other refusal, so a mismatched secret fails silently and forever.

> **`.env` and `.env.production.local` hold DIFFERENT values of `CRON_SECRET`.**
> That is correct — one is this machine, one is the live site — and it is the
> easy mistake. The production value is the one in `.env.production.local`.

**The subdomain trap is written up in `workers/cron/wrangler.toml`.** Read that
comment before deploying to a fresh Cloudflare account. The short version: the
account needs a workers.dev subdomain before Cloudflare will attach any timer,
registering one is an **interactive prompt that a non-interactive shell declines
on its own every time**, and with `workers_dev = false` the deploy half-succeeds
— the Worker uploads, the schedule silently does not attach, and it looks
perfectly healthy while never running. **Verify the triggers, never "deploy
succeeded."**

### The schedule

Both jobs, five fields, UTC — standard cron, **no seconds field**:

| Job    | Cron          | Pacific (summer / winter) | Retries |
| ------ | ------------- | ------------------------- | ------- |
| Backup | `0 9 * * *`   | 2:00am / 1:00am           | 3       |
| Purge  | `30 10 * * *` | 3:30am / 2:30am           | 1       |

Two Pacific columns because UTC does not observe daylight saving and Pacific
does. The UTC times never move; the local hour they land on shifts an hour
earlier each November and back each March. Both stay overnight either way, which
is the only thing that was wanted — nobody is estimating at 1am.

### Why daily, and why the purge stays 90 minutes behind

Daily, because the data is one contractor's working day; an hourly export of the
same few thousand rows is cost without benefit.

The **order** is the load-bearing part, not the absolute times. `purgeArchivedBids`
permanently destroys bids whose 30-day archive has closed. Backing up **first**
means the night's export still contains what the purge is about to remove, so a
purge that fires on the wrong row stays recoverable for a day. Reverse the order
and the backup faithfully records the deletion.

`server/scheduledBackup.test.ts` asserts the ordering AND that
`workers/cron/wrangler.toml` still agrees with `BACKUP_CRON` / `PURGE_CRON` in
the code. TOML cannot import from TypeScript, so the times are restated in two
places; a drifted schedule fires at the wrong time and nothing anywhere reports
it. **Moving either job means moving both, in both places, keeping the purge
second.**

### Checking it actually ran

Cloudflare dashboard → **Compute (Workers)** → `bidrender-cron` → **Settings →
Triggers → Cron Triggers → Past events**. A good night logs
`[cron] backup: ok (200)`. A failure shows red there, because the Worker throws
rather than swallowing the error.

**The answer to trust is the app's own health check, not that page.** Cloudflare
can only report failures it knows about; it cannot report a schedule that was
deleted, or was never attached in the first place. `backup.health` asks the
bucket when a backup last actually succeeded, and the Dashboard warns the owner
after two quiet days — which catches all of it, including the half-successful
deploy above. See § 8.

### Environment

**Nothing changes in `.env.production.local`.** That file is local-only and is
never read by the deployed app. These must exist in the **deployed environment**
on DigitalOcean:

```
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
R2_PLANS_READONLY_ACCESS_KEY_ID, R2_PLANS_READONLY_SECRET_ACCESS_KEY
CRON_SECRET
```

The `R2_PLANS_READONLY_*` pair is what lets the backup read plan files out of
the other bucket — see § 1a. Without it the backup **refuses to start** rather
than quietly dumping the database alone.

### Retries

Cloudflare retries a `5xx` up to three times (30s, then 2 minutes). A full
backup is not cheap, so a
retry first checks the bucket: if a **successful** backup already exists for
today it returns 200 having done nothing — and a `partial` run counts, since its
dump is complete. A failed or half-finished run leaves no such manifest, so the
retry does the work — which is what a retry is
for. If the bucket cannot be read at all, it backs up rather than skipping: a
duplicate is harmless, a skipped night is not.

### Outcomes

A run ends in one of three states, and the difference is whether trying again
could help.

| Status    | Means                                                         | Cron gets | Retried |
| --------- | ------------------------------------------------------------- | --------- | ------- |
| `clean`   | Database and every stored file copied                         | `200`     | —       |
| `partial` | Database dumped and uploaded; some stored files unreadable    | `200`     | **No**  |
| `failed`  | Dump, upload, file listing or manifest failed; R2 unreachable | `500`     | Yes     |

`partial` is not success. The stored files are the half that cannot be rebuilt
from anywhere else (§ 1), so the run records every unreadable key in the
manifest, prints them, warns in the log, and `ok` stays false.

It is not `failed` either, because that would be wrong about the only thing the
status is used for operationally. A storage `403` is deterministic — still a
`403` ninety seconds later — so a `500` buys three full database dumps a night,
the same refusals each time, and a nightly alert nobody can act on. An alert
that fires every night is one nobody reads, which is how the real failure gets
missed.

A `partial` run also satisfies the retry guard above: its dump is already whole,
so re-running would re-dump the database to collect the identical refusals.

A genuine failure is still loud in three places at once — a `500` so the Worker
retries and marks the run red under its Cron Triggers past events, the full
summary in the server log,
and a manifest recording the failure beside the data in the bucket.

## 5. What lands in the bucket

```
<prefix>/<timestamp>/manifest.json      what ran, what it found, what failed
<prefix>/<timestamp>/database.sql.gz    every table, gzipped
<prefix>/<timestamp>/files/<key>        every uploaded file, at its storage key
```

Timestamped rather than overwritten, so a backup taken after something has
already gone wrong cannot destroy the good one before it.

The manifest carries the same failures the terminal printed, so the record of
what went wrong sits beside the data rather than in a window someone closed.

## 6. Proving a backup actually works

A backup that has been written but never read back is a hypothesis.

```bash
DOTENV_CONFIG_PATH=.env.production.local \
VERIFY_DATABASE_URL=mysql://root:password@localhost:3306/mysql \
pnpm tsx scripts/verifyBackup.mts            # newest run
pnpm tsx scripts/verifyBackup.mts 2026-08-14T06-12-33Z   # a specific one
```

It downloads what is **actually in the bucket** — not what we think was
uploaded — restores it into a scratch schema, and compares the result against
the manifest that run wrote about itself. Exit 0 only on a clean match.

```
Backup VERIFIED — 2026-08-14T06-12-33Z restores cleanly
  manifest says: 37 tables, 2266 rows
  restored:      37 tables, 2266 rows
```

`VERIFY_DATABASE_URL` is **required and separate**, and the script refuses to
run if it equals `DATABASE_URL`. Restoring a production backup on top of
production is how a backup tool becomes an outage. Point it at a local MySQL;
the scratch schema is created fresh and dropped afterwards.

Run this after the first backup against a new bucket, and any time
`server/backup/` changes. `server/backup.test.ts` proves the verifier can
actually fail: it takes a real backup, corrupts the SQL inside the gzip the way
the JSON bug did, and requires rejection. A checker that cannot fail is theatre.

## 7. Restoring

```bash
gunzip -c database.sql.gz | mysql -u USER -p DBNAME
```

The dump sets `FOREIGN_KEY_CHECKS = 0` around itself, so table order does not
matter. It includes `__drizzle_migrations`, so a restored database knows which
migrations have run and does not invite anyone to re-run them over live data.

**A dump has to be readable on a server that is not the one that wrote it**, and
that is easy to get wrong in ways nothing notices until the day it matters:

- **Names must be in backticks, never double quotes.** The header restores under
  `SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO'`, which does not include `ANSI_QUOTES` —
  so a dump written by a server that DOES have it (DigitalOcean, by default)
  would come back double-quoted and fail to load. `dumpDatabase` pins its own
  session before reading, and `server/backup.test.ts` fails if that stops being
  true.
- **Nothing that carries an owner**: no views, triggers, stored procedures,
  functions, events, or `DEFINER` lines. A `DEFINER` naming a user the new
  server has never heard of stops a restore dead. This dump writes tables and
  rows only, so there is nothing to strip.
- Both backups taken from the old Manus database were checked against MySQL 8.4
  for all of the above, plus MyISAM tables, zero dates, `utf8mb3`, fulltext and
  spatial indexes and generated columns — all clean. The only Manus-specific
  marks are `/*T![clustered_index] …*/` comments, which MySQL ignores because
  they begin `/*T` rather than `/*!`.

Files restore by uploading `files/<key>` back to whatever storage the app is
using, at the same key. The keys in the database are unchanged by a restore, so
they line up as long as the object keys are preserved.

## 8. The failure this design is most afraid of

A backup nobody finds out is broken until the day the original is gone.

Two things follow from that. **Nothing fails silently:** a file that cannot be
fetched is recorded and the run is marked failed, rather than being skipped
quietly; the destination is checked _before_ anything is read, so a bad
credential costs a second rather than an hour. And **the tables come from the
database, not from `drizzle/schema.ts`** — enumerating from the TypeScript
schema would back up exactly the tables somebody remembered to declare, and
silently miss `__drizzle_migrations` and anything a hand-written migration made.

`server/backup.test.ts` restores the dump into a scratch schema and compares it
table for table and row for row. That test is not optional garnish: the first
version of this tool produced a dump of exactly the right shape that **no MySQL
server would load**, because mysql2 parses JSON columns into JavaScript arrays
and the driver's escaper expands an array into a comma-separated value list.
`takeoff_runs.points` is a JSON array, so every dump of a database with a traced
run was corrupt. Every other test passed. Only the restore caught it.

If you change anything in `server/backup/`, run that test.

## 9. Not built yet

- **Retention.** Nothing deletes old backups. For now that is the safe
  direction; revisit before the bucket becomes expensive.
- **Restore automation.** Restoring is the documented manual sequence in § 7.
  Verifying that a backup _can_ be restored is automated (§ 5); actually
  putting one back is deliberately a human decision.
