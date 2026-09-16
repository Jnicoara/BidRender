# Backups

An export of everything — every table and every uploaded file — to Cloudflare
R2, deliberately independent of Manus.

---

## 1. Why this exists

`references/deploying.md` § 8 lists four Manus services this app cannot run
without. One of them holds every plan PDF and every company logo. If access to
that account ends, the database might be recoverable and the files would not be.

This tool copies both somewhere Manus has no involvement in. It reads through
Manus — that is where the files are, and there is no other way to reach them —
but it writes to a bucket reachable with nothing but four credentials and the
public internet.

**The read path is the deadline.** Once a backup is in R2 it is independent; up
until then it depends on Manus access still working. That asymmetry is the whole
reason to run this sooner rather than later.

## 2. Configuration

Four variables, server-side only, `.env` (which is gitignored):

```bash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=bidsoftware
```

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

> **The nightly backup has never run, and is not being set up on Manus.**
>
> Not "stopped running" — never started. The handler arrived in `f87d67b` on
> 2026-08-14, four days after `ff469cb` (2026-08-10), which is the last commit
> that ever reached Manus. The deployed site has no `/api/scheduled/backupToR2`
> route for a cron to call, so the registration command below was never run
> against a build that could answer it.
>
> The R2 credentials were replaced on 2026-09-15 and the old token deleted.
> That changed nothing here: there was no automatic run to break. Manus is
> being left, so neither the secret nor the cron is being fixed there.
>
> **Every backup in the bucket was taken by hand, and that is the arrangement
> until the new host is running.** Use the § 3 command, and run it before
> anything destructive. It is the safe direction for the failure to point —
> backups must be taken deliberately, rather than appearing to happen and not
> happening — but it is only safe while somebody remembers. Registering the
> cron on the new host is the step that ends it.
>
> **Check what your newest backup actually contains before trusting it.** As of
> 2026-09-15 the most recent run is database-only: it was taken against the
> DigitalOcean database, and the plan PDFs are still behind Manus, so it holds
> no files at all. The most recent backup containing plan files is
> 2026-08-19, and its status is `partial`. A run that reports `clean` is
> telling you it hit no errors, not that it captured everything you assume.

The nightly cron is **two pieces that ship separately** (`CLAUDE.md` §
Scheduled work). The handler is in the code:
`server/scheduled/backupToR2.ts`, mounted at `/api/scheduled/backupToR2`.

The rest of this section describes registering it **on Manus**, and is kept as
the worked example of the shape — a handler in the app, a cron created on the
platform after deploy. The commands themselves are Manus-specific and will not
be run again.

The cron itself is created **once, on the Manus platform, from a sandbox
terminal, after the site is deployed** — a dev machine is unreachable from the
platform, so this cannot be done from a local checkout:

```bash
manus-heartbeat create \
  --name nightly-backup-to-r2 \
  --cron "0 0 2 * * *" \
  --path /api/scheduled/backupToR2 \
  --description "Export every table and stored file to Cloudflare R2"
```

Six fields, seconds first, UTC. **Until that command is run, nothing is backed
up automatically** — the manual trigger keeps working throughout, which is the
safe direction for the failure to point.

### Environment

**Nothing changes in `.env.production.local`.** That file is local-only and is
never read by the deployed app. The four R2 variables must exist in the
**deployed environment**, set through Manus:

```
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
```

`DATABASE_URL`, `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` are
already there — they are what the app runs on.

Check before registering the cron, from a sandbox terminal:

```bash
node -e "console.log(['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'].filter(k=>!process.env[k]))"
```

An empty array means it is ready. Anything listed is missing, and every
scheduled run will fail loudly until it is set.

### Why 02:00, and why daily

Daily, because the data is one contractor's working day; an hourly export of
the same few thousand rows is cost without benefit.

02:00 specifically, because `purgeArchivedBids` runs at **03:30** and
permanently destroys bids whose 30-day archive has closed. Backing up first
means the night's export still contains what the purge is about to remove, so a
purge that fires on the wrong row stays recoverable for a day. Reverse the order
and the backup faithfully records the deletion. `server/scheduledBackup.test.ts`
asserts the ordering, so it cannot drift.

### Retries

The platform retries a `5xx` up to three times. A full backup is not cheap, so a
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

A genuine failure is still loud in three places at once — a `500` so the platform
retries and its Investigate flow shows it, the full summary in the server log,
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
