# If Manus disappeared tomorrow

What to stand up somewhere else, in what order, and where each setting comes
from.

**This file lives in GitHub on purpose.** A recovery plan stored only inside the
thing that failed is not a plan. GitHub is a separate account from Manus, and
the backup bucket is a third — losing any one of the three still leaves this
document and the data readable.

---

## 0. What you already have, and what you don't

| Thing                             | Where it lives                | Survives Manus going away  |
| --------------------------------- | ----------------------------- | -------------------------- |
| All the source code               | GitHub — `Jnicoara/BidRender` | Yes                        |
| Every table (bids, pricing, crew) | Cloudflare R2, nightly        | Yes                        |
| Uploaded plan PDFs and logos      | Cloudflare R2, nightly        | Yes, as far as it can read |
| Login accounts                    | **Manus OAuth only**          | **No — must be rebuilt**   |
| The four Forge/OAuth credentials  | Manus environment settings    | No — replaced, not moved   |

The honest summary: **your data is recoverable, your login system is not.**
Everything below is ordered around that.

---

## 1. Order of operations

Do these in order. Each one is useless without the one before it.

### Step 1 — Get the data out of R2 (do this first, always)

R2 is independent of Manus and you hold its credentials. Nothing else matters if
this fails, so prove it before touching anything else.

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
some stored files were unreadable — see § 4 there. Given every plan PDF to date
is a test file, a `partial` restore is very likely complete for anything that
matters.

### Step 2 — A MySQL server

Any provider. The dump restores with foreign key checks disabled and includes
drizzle's own migration ledger, so the restored database does not look
unmigrated and does not invite anyone to re-run migrations over live data.

Set `DATABASE_URL` to the new server. Restore per `references/backups.md` § 7.

### Step 3 — Object storage for plans and logos

Anything S3-compatible, including R2 itself. This is the piece with real code
attached: `server/storage.ts` talks to Forge's presign endpoints, not to S3
directly.

Two functions change — `storagePresignPut` and `storageGetSignedUrl` — to sign
against the new bucket instead of asking Forge to. `server/_core/storageProxy.ts`
keeps working as-is; it only redirects to whatever URL those produce.

The signed-token scheme in front of it (`server/storageTokens.ts`) is ours, not
Manus's, and carries over unchanged.

**The bucket needs a CORS rule or plan uploads fail** — `references/deploying.md`
§ 9 has the shape.

### Step 4 — A login system

**This is the big one, and there is no shortcut.** Auth is OAuth-only against
Manus. `users.passwordHash` exists in the schema and nothing wires it up.

What has to be replaced: `server/_core/oauth.ts` and `sdk.authenticateRequest`
in `server/_core/sdk.ts`. Everything downstream — the three tRPC tiers, company
scope, capabilities — reads a resolved user and does not care where it came
from, so the blast radius is smaller than it looks.

Existing accounts are matched by `openId`. Whatever replaces OAuth has to
produce a stable per-person id and write it there, or people come back as new
accounts with none of their bids.

### Step 5 — Somewhere to run it

Node 20+, `pnpm build`, `pnpm start`. The server is a single Express process
serving the built client statically. No container orchestration required.

### Step 6 — The scheduled jobs

Two, both currently registered on the Manus platform and both lost with it:

| Job            | Was       | Handler                            |
| -------------- | --------- | ---------------------------------- |
| Nightly backup | 02:00 UTC | `/api/scheduled/backupToR2`        |
| Archive purge  | 03:30 UTC | `/api/scheduled/purgeArchivedBids` |

Any scheduler that can POST a URL will do. **Keep the backup before the purge** —
the purge permanently deletes bids whose 30 days are up, so backing up first
means the night's copy still holds what the purge is about to remove.
`server/scheduledBackup.test.ts` asserts that ordering.

The handlers authenticate with `sdk.authenticateRequest` and require
`user.isCron`, so whatever replaces OAuth has to be able to mint that too.

---

## 2. Where each setting comes from

Everything the server reads. None of it is in the repo; all of it has to be
recreated.

| Variable                                                              | Comes from                              | Without it                                                            |
| --------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`                                                        | Your new MySQL host                     | Nothing works                                                         |
| `JWT_SECRET`                                                          | **Invent one. Keep it safe.**           | No logins **and** no plan sheets or logos — it signs storage URLs too |
| `OAUTH_SERVER_URL`                                                    | Your new login system                   | No sign-in at all                                                     |
| `VITE_APP_ID`                                                         | Your new login system                   | Sessions are rejected with a blank-field error in the log             |
| `BUILT_IN_FORGE_API_URL` / `..._API_KEY`                              | Manus — **gone**                        | AI helper and alias suggester go quiet. Both degrade gracefully       |
| `OWNER_OPEN_ID`                                                       | Your own id in the new system           | Owner-tier features stay invisible                                    |
| `R2_ACCOUNT_ID` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_BUCKET` | Cloudflare — **you already hold these** | No backups                                                            |
| `NAVIGATION_MODEL` / `PLAN_COPILOT_MODEL`                             | Optional overrides                      | Defaults apply                                                        |

Two traps worth knowing before you hit them:

- **Never prefix any secret with `VITE_`.** Vite bakes every `VITE_*` variable
  into the browser bundle, so it gets published to every visitor.
  `server/backup.test.ts` asserts this for the R2 keys.
- **A missing gateway key reports `OPENAI_API_KEY is not configured`.** That
  message is wrong — there is no OpenAI dependency anywhere in this app. The
  variable it actually wants is `BUILT_IN_FORGE_API_KEY`. It has already sent one
  investigation down the wrong path.

---

## 3. What you could run on day one

If the priority is getting back to writing bids rather than a perfect
restoration, this is the shortest path to a working tool:

1. Restore the database (steps 1–2). **This is the whole business** — bids,
   pricing, materials, assemblies, labor rates, clients, proposals.
2. Stand it up with a single hard-coded account instead of OAuth (step 4 is by
   far the longest job; a one-user stopgap is hours, not weeks).
3. Skip object storage at first. Everything except plan takeoff works without
   it, and plans can be re-uploaded.
4. Add the crons last. A missing backup cron means backups are manual, which is
   survivable for a week; a missing purge cron means archived bids simply
   accumulate, which is harmless.

The estimating tool works at step 2. Steps 3 and 4 restore the rest.

---

## 4. Keep this true

This document is worth exactly as much as its accuracy. Re-read it whenever
`server/_core/` changes, a new environment variable appears, or a scheduled job
is added — and confirm at least once that a backup actually restores
(`references/backups.md` § 6), because a restore nobody has ever performed is a
hypothesis, not a plan.
