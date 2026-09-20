# The DigitalOcean database

Where the app's data lives now, how it got there, and what proved it worked.

**No values in this file, ever** — the repo is public. Hostnames, passwords and
certificates live in `.env.digitalocean`, which is gitignored. Setting names and
instructions only.

---

## 1. What was built

|                           |                                                                    |
| ------------------------- | ------------------------------------------------------------------ |
| Provider                  | DigitalOcean Managed MySQL                                         |
| Version                   | 8.4.8                                                              |
| Region                    | San Francisco (SFO3)                                               |
| Database                  | `bidrender`                                                        |
| Character set / collation | `utf8mb4` / `utf8mb4_unicode_ci`                                   |
| Admin login               | `doadmin` — used for the load and for permissions, nothing else    |
| App login                 | `bidrender_app` — what the app itself will use                     |
| Encryption                | Required. TLS 1.3, verified against DigitalOcean's own certificate |

The cluster and the empty `bidrender` database were created by hand in the
DigitalOcean control panel. This load never creates or drops a database.

## 2. The rule this load followed: build from the migrations, never restore a dump

`references/deploying.md` § 5 explains why, and it decided the whole method: the
Manus database is **missing 5 foreign keys and 9 indexes**, because migration
0004 failed partway on TiDB in July and was marked applied by hand. A dump
carries the table definitions AND drizzle's record of which migrations ran, so
restoring one would have copied those gaps here permanently, with nothing to
report it.

So the tables were built by running the 44 migrations against an empty database,
and only the **data** was taken from the backup. The result has all **87**
foreign keys, not 82.

## 3. How the load was done, in order

1. **Checked the database was empty.** 0 tables. Confirmed before anything else.
2. **Set the collation:** `ALTER DATABASE bidrender CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci`.
   The server's own default is `utf8mb4_0900_ai_ci`, but the data was written
   under `utf8mb4_unicode_ci`. Matching them means a table created later by a
   future migration cannot end up mismatched — a database holding both throws
   "Illegal mix of collations" the moment a query compares text across two
   tables.
3. **Built the tables:** `pnpm tsx scripts/migrate.mts`, with `DATABASE_URL`
   pointing at the cluster and `DATABASE_CA_CERT` set. All 44 migrations as of
   that date applied, producing 49 tables. Both numbers are a snapshot of the
   load, not the current state — compare `__drizzle_migrations` on the cluster
   against `drizzle/meta/_journal.json` for where it actually stands.
4. **Loaded data only** from the backup — the INSERT statements, and nothing
   else. Skipped: 49 `DROP TABLE`, 49 `CREATE TABLE`, the session settings, and
   the one INSERT into `__drizzle_migrations` (the migration runner writes its
   own ledger — copying the old one would have been a lie about this database's
   history). Loaded with foreign key checks off, then back on.
5. **Reset the owner's labor rate to $0**, matching the decision that starter
   content ships unpriced. It arrives from the backup at $43.
6. **Checked every foreign key for orphan rows** — child rows pointing at a
   parent that no longer exists. The old database did not enforce all of its
   links, so this could not be assumed.
7. **Narrowed the app login's permissions** (§ 6).

## 4. Which backup, and why

**`2026-09-15T04-21-13Z`** from `r2://bidsoftware/helixbid` — 49 tables, 1,821
rows. This is the cleaned copy: two real accounts, the 629-item starter
catalogue, JJ's 1,056-item price list, and no bids.

The alternative was `2026-08-19T20-26-50Z`, the last backup of the live Manus
database: 49 tables, 16,586 rows. It was compared row by row first, and what it
held beyond the clean copy was **73 test accounts**, 4,240 test bids, 9,631 test
bid lines, 15 empty test bids belonging to the owner, one sample bid and sample
client the app generates on request, and 21 rows of "Test Item" in the retired
`master_*` tables. Nothing the owner had built: no priced materials, no
assemblies of their own, no real clients. Both backups had identical company
settings, pricing defaults and labor rates, and the same 629-item catalogue —
compared name by name, with zero differences either way.

Five of that backup's ten plan PDFs were not in the bucket at all: Manus storage
refused them with a 403, which is why that run is marked `partial`.

Both backups remain in Cloudflare R2. Nothing deletes them.

## 5. What proved it worked

| Check                               | Result                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Tables                              | 49 in the backup, 49 here                                                         |
| Row counts, table by table          | 49 of 49 match                                                                    |
| Total rows                          | 1,821 in the backup, 1,821 here                                                   |
| Foreign keys                        | 87 present                                                                        |
| Orphan rows                         | none — every link points at something real                                        |
| Reading as `bidrender_app`          | connected over TLS 1.3; read users, materials, labor_rates, assemblies, companies |
| `bidrender_app` creating a database | refused, as it should be                                                          |

The 1,821 total is made of 1,777 data rows loaded from the backup plus the 44
ledger rows the migration runner wrote itself.

## 6. What `bidrender_app` may do

- **`ALL PRIVILEGES` on `bidrender` only** — full read and write on this one
  database.
- **`USAGE` everywhere else**, which means the right to log in and nothing more.
  It cannot read or write any other database, and cannot create one.
- **The right to grant powers to other accounts was removed.**

**Two privileges could not be removed, and this is a platform limit, not an
oversight.** DigitalOcean grants `REPLICATION_APPLIER` and `ROLE_ADMIN` to every
user it creates, and refuses `doadmin` permission to revoke them:

```
REVOKE REPLICATION_APPLIER ON *.* FROM ...
  -> Access denied for AuthId `doadmin`@`%` to database 'mysql'
```

Neither gives access to another database's data. `ROLE_ADMIN` is the one worth
knowing about: it concerns granting and revoking roles. If it ever needs to go,
it is a DigitalOcean control-panel or support question, not something that can
be fixed from here.

## 7. Connecting to it

Three settings, named in `references/environment.md`:

| Setting            | What it is                                                          |
| ------------------ | ------------------------------------------------------------------- |
| `DATABASE_URL`     | The cluster address and the app login                               |
| `DATABASE_CA_CERT` | DigitalOcean's certificate — the text, or a path to the `.crt` file |
| `JWT_SECRET`       | Unrelated to the database, but the app will not start without it    |

**The certificate is not optional.** DigitalOcean refuses unencrypted
connections and signs its own certificate, which Node does not trust by default.
`server/databaseConnection.ts` is the single place a connection is built; with
the certificate set the connection is encrypted **and** the server verified.
There is deliberately no option to encrypt without checking who answered.

The load itself used `.env.digitalocean` (gitignored) for the admin login and
the certificate path. That file is for setup work, not for running the app.

## 8. The rules this server enforces, and how many connections it allows

DigitalOcean runs MySQL stricter than a default install, and stricter than the
Manus database the app grew up on. Its `sql_mode` is:

```
REAL_AS_FLOAT, PIPES_AS_CONCAT, ANSI_QUOTES, IGNORE_SPACE, ONLY_FULL_GROUP_BY,
ANSI, STRICT_ALL_TABLES, NO_ZERO_IN_DATE, NO_ZERO_DATE,
ERROR_FOR_DIVISION_BY_ZERO, NO_ENGINE_SUBSTITUTION
```

plus `sql_require_primary_key = ON`. Two of those change what SQL MEANS rather
than merely tightening it:

- **`ANSI_QUOTES`** — a double-quoted word is a COLUMN NAME, not text. SQL must
  quote names with backticks and text with single quotes.
- **`PIPES_AS_CONCAT`** — `||` joins text instead of meaning "or".

**The development machine mirrors this list** (`my.ini` on the laptop), so
anything these rules break surfaces there instead of on the live site. That is
not theoretical: it caught a real bug — the nightly backup asked the server to
describe each table and copied the answer down, which under `ANSI_QUOTES` came
back double-quoted, producing a file its own restore instructions could not
read. Fixed in v5.125; `server/backup.test.ts` now pins the quoting.

Note the server's own default collation is `utf8mb4_0900_ai_ci` while this
database is `utf8mb4_unicode_ci` (§ 3). That is deliberate and consistent —
every table here was created under the database default.

**Connections.** The app opens a pool of up to **10** per running copy
(`server/db.ts`, mysql2 defaults; extra requests queue rather than fail).
Migrations take one more and a backup run takes two, so a single copy of the app
peaks at about thirteen. DigitalOcean allows roughly 75 connections on the 1 GiB
plan, 150 on 2 GiB and 400 on 4 GiB, so even the smallest plan has room for
several copies. To cap it without touching code, add `connectionLimit=5` to the
database address.

## 9. What this did NOT do

- **Manus and the live site were not touched.** Not read, not changed. The data
  came from the Cloudflare backup, which is independent of Manus.
- **No app code was changed**, and the app is not pointed at this database yet.
  That is a later step.
- **Stored files were not migrated.** Plan PDFs and company logos still live in
  Manus storage; replacing it is its own job (`references/environment.md` § 6).
  The cleaned backup had no stored files, so nothing here refers to one.
- **The old database is still running.** Nothing was switched over.
