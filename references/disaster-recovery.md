# If the hosting disappeared tomorrow

What to stand up somewhere else, in what order, and where each setting comes
from.

**This file lives in GitHub on purpose.** A recovery plan stored only inside the
thing that failed is not a plan. The app runs on DigitalOcean, the code is on
GitHub, and the backups are in Cloudflare R2 — three separate accounts, so
losing any one of them still leaves this document and the data readable.

> **Manus is no longer part of this.** The app was built there and left in
> September 2026; the storage backend went in v5.141 and the scheduler before
> it. Anything you find elsewhere in `references/` that tells you to open a
> Manus sandbox terminal is stale — `todo.md` § Manus removal tracks what is
> left. The one deliberate exception is the `/manus-storage` web address, which
> is baked into every stored file's database row and stays exactly as it is.

---

## 0. What you already have, and what you don't

| Thing                             | Where it lives                    | Survives the host going away            |
| --------------------------------- | --------------------------------- | --------------------------------------- |
| All the source code               | GitHub — `Jnicoara/BidRender`     | Yes                                     |
| Every table (bids, pricing, crew) | Cloudflare R2, nightly            | Yes                                     |
| Uploaded plan PDFs and logos      | Cloudflare R2, nightly            | Yes, as far as it can read              |
| The live plan files themselves    | Cloudflare R2 (`bidrender-plans`) | Yes — a different account from the host |
| Login accounts                    | Your own database, bcrypt         | Yes                                     |
| The database itself               | DigitalOcean MySQL                | Via the nightly backup only             |

**This used to say your login system was unrecoverable. It no longer is.** Sign-in
is email and password, hashed with bcrypt in your own `users` table
(`server/routers/authRouter.ts` — `signup`, `login`, `changePassword`), and it
restores with the database like any other row. The legacy Manus OAuth path still
exists in `server/_core/sdk.ts`, but nothing depends on it any more.

The honest summary: **everything that matters is recoverable, and the long pole
is now standing up a host and a database, not rebuilding authentication.**

---

## 1. Order of operations

Do these in order. Each one is useless without the one before it.

### Step 1 — Get the data out of R2 (do this first, always)

R2 is a separate account from the app's host and you hold its credentials.
Nothing else matters if this fails, so prove it before touching anything else.

```bash
# Newest backup in the bucket, restored into a scratch database and checked
# against its own manifest.
VERIFY_DATABASE_URL=mysql://root:password@localhost:3306/mysql \
pnpm tsx scripts/verifyBackup.mts
```

The bucket layout is in `references/backups.md` § 5. Each run is a timestamped
folder holding `database.sql.gz`, a `files/` tree, and a `manifest.json` saying
what that run managed and what it missed.

**Check the manifest's `status`.** `partial` means the database is whole and
some stored files were unreadable — see § 4 there. A run that reports `clean` is
telling you it hit no errors, not that it captured everything you assume.

### Step 2 — A MySQL server

Any provider. The dump restores with foreign key checks disabled and includes
drizzle's own migration ledger, so the restored database does not look
unmigrated and does not invite anyone to re-run migrations over live data.

Set `DATABASE_URL` to the new server. Restore per `references/backups.md` § 7.

**If you are building fresh rather than restoring**, build from the migrations —
`pnpm db:push` against an empty database — never by restoring an old provider's
schema. `references/database-digitalocean.md` explains why, and it is not
theoretical: the Manus database was missing five foreign keys and nine indexes
because one migration failed halfway and was ticked off by hand.

### Step 3 — Object storage for plans and logos

Anything S3-compatible, and R2 itself is the obvious answer since that is where
the files already are.

**This is much less work than it used to be.** `server/storage.ts` is a socket
with two backends behind it — a folder on the machine (`diskStorage.ts`) and
Cloudflare R2 (`r2Storage.ts`). Nothing above that file knows which is in use:
no router, no client code, no database column. A third backend is a matter of
implementing the same four operations, not teaching the app about storage.

Set `PLAN_STORAGE` to `disk` or `r2`. It is never inferred from credentials
appearing — where files live has to be something a person turned on — and the
app refuses to start rather than accepting an upload with nowhere to put it.

The signed-token scheme in front of it (`server/storageTokens.ts`) is ours and
carries over unchanged. `/manus-storage/<token>/<key>` remains the read route;
the name is historical and must not be changed, because it is written into
`bid_pdfs.url` and `projects.pdfUrl` for every file already stored.

**The bucket needs a CORS rule or plan uploads fall back to a capped path** —
`references/deploying.md` § 9 has the shape, including exposing `ETag`, without
which a large multi-part upload cannot be reassembled.

### Step 4 — Login

**No longer a rebuild.** Email-and-password sign-in lives in
`server/routers/authRouter.ts` and rides along with the restored database. New
host, same accounts, same passwords.

`JWT_SECRET` is the one that matters here, and it does double duty: it signs
session cookies **and** storage URLs. Change it and everyone is signed out and
no plan sheet or logo loads. Keep the existing value if you have it.

If you are standing up somewhere genuinely new and want the old OAuth path gone
as well, the accounts are matched by `openId`; anything replacing it must write
a stable per-person id there, or people return as new accounts with none of
their bids.

### Step 5 — Somewhere to run it

**Node 24** (pinned in `.nvmrc` and `package.json`), `pnpm build`, `pnpm start`.
The server is a single Express process serving the built client statically. No
container orchestration required.

Two things that cost a day the first time on DigitalOcean App Platform, both in
`references/deploying.md`: leave the platform's build command **empty** (a
custom one runs after build-only tools are deleted, so `vite` is gone), and in
production the app binds exactly the port it is given and stops if something
else holds it — it must not helpfully move to the next one, because the host
checks one specific port and the app would look healthy while the deploy failed.

### Step 6 — The scheduled jobs

Two, and they do **not** ride along with the app — they are a separate
Cloudflare Worker in `workers/cron/`, deployed with `wrangler` from a local
checkout.

| Job            | Cron          | Pacific (summer / winter) | Handler                            |
| -------------- | ------------- | ------------------------- | ---------------------------------- |
| Nightly backup | `0 9 * * *`   | 2:00am / 1:00am           | `/api/scheduled/backupToR2`        |
| Archive purge  | `30 10 * * *` | 3:30am / 2:30am           | `/api/scheduled/purgeArchivedBids` |

Five fields, UTC — standard cron, **no seconds field**.

```bash
cd workers/cron
npx wrangler deploy                    # 1. create the Worker
npx wrangler secret put CRON_SECRET    # 2. then give it the secret
```

That order: a secret cannot attach to a Worker that does not exist yet.

**Keep the backup before the purge.** The purge permanently deletes bids whose
30 days are up, so backing up first means the night's copy still holds what the
purge is about to remove. `server/scheduledBackup.test.ts` asserts the ordering.

Any scheduler that can POST a URL will do — there is nothing Cloudflare-specific
about the app's side. The handlers authenticate with a shared `CRON_SECRET`
compared in constant time (`server/cronAuth.ts`), and **refuse everything when
no secret is configured**, deliberately: the alternative is a bid-deleting
endpoint sitting open on the one host where the variable was missed.

**Verify the triggers attached rather than trusting "deploy succeeded"** — a
deploy can report success and leave the Worker with no timer, which looks
healthy and silently never runs. The trap is written up in
`workers/cron/wrangler.toml`.

---

## 2. Where each setting comes from

Everything the server reads. None of it is in the repo; all of it has to be
recreated.

| Variable                                                           | Comes from                           | Without it                                                                      |
| ------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                     | Your new MySQL host                  | Nothing works                                                                   |
| `DATABASE_CA_CERT`                                                 | The host's certificate               | Connection refused where TLS is enforced                                        |
| `JWT_SECRET`                                                       | **Keep the existing one.**           | Everyone signed out **and** no plan sheets or logos — it signs storage URLs too |
| `PLAN_STORAGE`                                                     | You decide: `disk` or `r2`           | Server refuses to start rather than accept files with nowhere to go             |
| `R2_PLANS_*` (4)                                                   | Cloudflare — the plans bucket        | No plan uploads or viewing                                                      |
| `R2_*` (4)                                                         | Cloudflare — the backup bucket       | No backups                                                                      |
| `R2_PLANS_READONLY_*` (2)                                          | Cloudflare — read-only on plans      | Backup **refuses to run** rather than saving the database alone                 |
| `CRON_SECRET`                                                      | Invent one; same value in the Worker | Both scheduled jobs refuse every trigger, including the real one                |
| `ANTHROPIC_API_KEY`                                                | Anthropic console                    | AI features go quiet. All three degrade gracefully                              |
| `OWNER_OPEN_ID`                                                    | Your own account id                  | Owner-tier features stay invisible                                              |
| `NAVIGATION_MODEL` / `PLAN_COPILOT_MODEL` / `MATERIAL_ALIAS_MODEL` | Optional overrides                   | Defaults apply                                                                  |

Legacy and no longer needed on a new host: `OAUTH_SERVER_URL`, `VITE_APP_ID`,
`BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`. They are still read by
`server/_core/env.ts` and removing them is tracked in `todo.md`.

Three traps worth knowing before you hit them:

- **Never prefix any secret with `VITE_`.** Vite bakes every `VITE_*` variable
  into the browser bundle, so it gets published to every visitor.
  `server/backup.test.ts` asserts this for the R2 keys.
- **The backup's R2 token and the app's plans token must stay separate.** An R2
  token's permission level applies to the whole token, not per bucket, so one
  credential that could read plans and write backups would also be able to
  destroy every contractor's drawings. Three tokens, on purpose —
  `references/backups.md` § 1a.
- **A missing AI key may still report `OPENAI_API_KEY is not configured`.** That
  message is wrong — there is no OpenAI dependency anywhere in this app. It
  comes from the old gateway shim. It has already sent one investigation down
  the wrong path.

---

## 3. What you could run on day one

If the priority is getting back to writing bids rather than a perfect
restoration, this is the shortest path to a working tool:

1. Restore the database (steps 1–2). **This is the whole business** — bids,
   pricing, materials, assemblies, labor rates, clients, proposals, and the
   login accounts along with them.
2. Stand it up on any Node 24 host with `JWT_SECRET` and `DATABASE_URL`. People
   sign in with the passwords they already have.
3. Point `PLAN_STORAGE` at the existing R2 plans bucket — the live files are
   still there, in a different account from whatever failed. If that is awkward,
   skip storage at first: everything except plan takeoff works without it.
4. Add the Worker last. A missing backup schedule means backups are manual,
   which is survivable for a week if somebody actually remembers; a missing
   purge means archived bids simply accumulate, which is harmless.

The estimating tool works at step 2. Steps 3 and 4 restore the rest.

---

## 4. Keep this true

This document is worth exactly as much as its accuracy. Re-read it whenever
`server/_core/` changes, a new environment variable appears, or a scheduled job
is added — and confirm at least once that a backup actually restores
(`references/backups.md` § 6), because a restore nobody has ever performed is a
hypothesis, not a plan.

**It went stale once already.** Between the move off Manus and 2026-09-17 this
file still said login was OAuth-only and unrecoverable, and that storage went
through a Manus presign endpoint — both false for weeks. On the day it is needed
nobody has time to discover that the recovery plan describes a system that no
longer exists.
