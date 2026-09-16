# Every setting the app needs

Names and sources only. **No values in this file, ever** — the repo is public.

Read alongside `references/disaster-recovery.md`, which covers the order to
rebuild things in. This one answers the narrower question: what has to be set,
where each value comes from today, and which ones have to be regenerated on a
new host.

---

## The one-line version

Of the settings below, the **Cloudflare R2 ones survive a move** (they are
yours, not Manus's), **five have to be regenerated** on any new host, and the
rest are either optional or derived from the choices you make. The one that
catches people out is `JWT_SECRET`, which signs two different things.

---

## 1. Required — the app will not work without these

| Name                    | Where the value comes from today | On a new host                                            |
| ----------------------- | -------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`          | Manus environment settings       | **Regenerate.** Your new MySQL host issues it.           |
| `JWT_SECRET`            | Manus environment settings       | **Keep or regenerate — see the warning below.**          |
| `OAUTH_SERVER_URL`      | Manus environment settings       | **Regenerate.** Points at whatever replaces Manus login. |
| `VITE_APP_ID`           | Manus environment settings       | **Regenerate.** Identifies the app to the login system.  |
| `VITE_OAUTH_PORTAL_URL` | Manus environment settings       | **Regenerate.** The browser-facing half of login.        |

> **`JWT_SECRET` signs sessions AND file URLs.** It is not only the login
> cookie. Stored-file links carry a signed, expiring token in the path
> (`server/storageTokens.ts`) because the proxy would otherwise serve any object
> to any caller. An environment missing it cannot log anyone in **and** cannot
> serve a plan sheet or a logo.
>
> Consequence for a migration: **changing it signs everyone out and invalidates
> every file URL already handed out.** Neither is data loss — sessions are
> re-made by logging in, URLs are re-minted on the next page load — but do it
> deliberately rather than by accident.

> **`VITE_OAUTH_PORTAL_URL` missing crashes the whole app, not just login.**
> `getLoginUrl` builds a `new URL()` from it inside `AuthGuard`, which is a
> whole-app error boundary. You get a red `Invalid URL` page and no route renders
> at all. It looks like a broken build; it is a missing variable.

## 2. Manus-specific — these do not move

| Name                     | Where the value comes from today | On a new host                                                            |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------ |
| `BUILT_IN_FORGE_API_URL` | Manus environment settings       | **Gone.** Replace with your own object storage — see § 5.                |
| `BUILT_IN_FORGE_API_KEY` | Manus environment settings       | **Gone.** Same.                                                          |
| `OWNER_OPEN_ID`          | Manus environment settings       | **Regenerate.** Your own user id in whatever login system replaces this. |

These two Forge values do double duty — object storage **and** the LLM gateway
behind the navigation helper and the alias suggester. Losing them takes both.
The AI features degrade quietly and on purpose; storage does not.

> **A missing gateway key reports `OPENAI_API_KEY is not configured`.** That
> message is wrong. There is no OpenAI dependency anywhere in this app; the
> variable it actually wants is `BUILT_IN_FORGE_API_KEY`. It has already sent one
> investigation down the wrong path.

## 3. Cloudflare R2 — yours already, and the ones that matter most

Two buckets, two tokens, and they must stay two. See § 3.1 for why.

### Backups — bucket `bidsoftware`

| Name                            | Where the value comes from today | On a new host  |
| ------------------------------- | -------------------------------- | -------------- |
| `R2_ACCOUNT_ID`                 | Cloudflare dashboard → R2        | **Unchanged.** |
| `R2_ACCESS_KEY_ID`              | Cloudflare R2 API token          | **Unchanged.** |
| `R2_SECRET_ACCESS_KEY`          | Cloudflare R2 API token          | **Unchanged.** |
| `R2_BUCKET`                     | Cloudflare — the bucket name     | **Unchanged.** |
| `R2_ENDPOINT` _(optional)_      | Defaults from the account id     | Unchanged.     |
| `R2_BACKUP_PREFIX` _(optional)_ | Defaults to `helixbid`           | Unchanged.     |

> **Replaced on 2026-09-15.** The secret was exposed in a screenshot. A new
> token was issued and both older tokens were deleted, so the previous values
> no longer authenticate anywhere. `R2_ACCOUNT_ID` and `R2_BUCKET` did not
> change — only the key pair did.
>
> Replacing them broke no automatic backup, because there was never one to
> break. The nightly handler shipped four days after the last commit that
> reached Manus, so the deployed site has no route for a cron to call and the
> job has never run. **Every backup was taken by hand, and stays that way until
> the new host is running** (`references/backups.md` § 4).

### Plan files — bucket `bidrender-plans`

New on 2026-09-15, for the move off Manus storage. Nothing reads these yet;
they are slots for the R2 storage backend.

| Name                         | Where the value comes from   | On a new host     |
| ---------------------------- | ---------------------------- | ----------------- |
| `R2_PLANS_ACCOUNT_ID`        | Cloudflare dashboard → R2    | **Unchanged.**    |
| `R2_PLANS_ACCESS_KEY_ID`     | Cloudflare R2 API token      | **Unchanged.**    |
| `R2_PLANS_SECRET_ACCESS_KEY` | Cloudflare R2 API token      | **Unchanged.**    |
| `R2_PLANS_BUCKET`            | Cloudflare — the bucket name | `bidrender-plans` |
| `R2_PLANS_ENDPOINT`          | Derived from the account id  | **Unchanged.**    |

### 3.1 Why the two are separate, and must stay separate

Same Cloudflare account, **different buckets and different tokens**. The plans
token signs URLs a browser touches; the backup token must never be anywhere
near one. If the plans key leaks, the backups have to still be untouchable —
which is only true if they are a different credential.

Both are scoped to a single bucket with **Object Read & Write**, and neither
has account-level permission. Verified on 2026-09-15: the plans key cannot
reach `bidsoftware`, and the backup key cannot reach `bidrender-plans`. Both
answer `AccessDenied`. Re-check that after reissuing either one.

**These are the keys to your own data.** They belong to your Cloudflare
account, not Manus, and they carry over untouched. Keep them somewhere that
survives losing any single provider — a backup you cannot open is not a backup.

## 4. Optional and operational

| Name                                      | Purpose                                                                              | Notes                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `NODE_ENV`                                | `production` switches to serving the built client                                    | Set by `pnpm start`.                                                                |
| `PORT`                                    | Listen port                                                                          | Defaults to 3000, and takes the next free one if busy.                              |
| `NAVIGATION_MODEL`                        | Overrides the model behind the "where do I…?" helper                                 | Leave unset unless the gateway renames a model.                                     |
| `PLAN_COPILOT_MODEL`                      | Same, for the plan reader                                                            | Same.                                                                               |
| `VERIFY_DATABASE_URL`                     | Scratch database to restore a backup INTO                                            | **Never the live one.** `verifyBackup.mts` refuses if it equals `DATABASE_URL`.     |
| `DOTENV_CONFIG_PATH`                      | Which env file a command loads                                                       | How `.env.production.local` gets used deliberately rather than by accident.         |
| `VITE_ANALYTICS_ENDPOINT` / `_WEBSITE_ID` | Template analytics tags in `client/index.html`                                       | Unused by the app itself; safe to drop on a new host.                               |
| `LOCAL_STORAGE_DIR`                       | Keep plan PDFs and logos in this folder instead of cloud storage                     | Local runs only, e.g. `.local-storage`. Leave unset on a real host.                 |
| `DISABLE_AI_FEATURES`                     | `true` switches off the plan reader, alias suggestions and the "where do I…?" helper | They answer "switched off" instead of failing, and the plan reader panel is hidden. |
| `DISABLE_SCHEDULED_JOBS`                  | `true` leaves the nightly backup and archive purge unmounted                         | For a machine the platform scheduler cannot reach.                                  |
| `DATABASE_CA_CERT`                        | The CA certificate that proves the database server is the real one                   | **Required on DigitalOcean.** See § 5. Unset locally.                               |

## 5. `DATABASE_CA_CERT` — the database's certificate

A managed database (DigitalOcean, PlanetScale, RDS) refuses an unencrypted
connection, and proves it is the real server with a certificate signed by its
own authority rather than one Node already trusts. `DATABASE_CA_CERT` is that
certificate.

**Where to get it:** DigitalOcean control panel → Databases → your cluster →
Overview → Connection details → **Download CA certificate**
(`ca-certificate.crt`).

**Where to put it:**

| Running                                     | File                            | Value                                                |
| ------------------------------------------- | ------------------------------- | ---------------------------------------------------- |
| On the host                                 | The host's environment settings | Paste the whole certificate text                     |
| Backups from this laptop against production | `.env.production.local`         | Paste the text, or the path to the downloaded `.crt` |
| Local development                           | Nowhere — leave it unset        | A local MySQL needs no certificate                   |

Either form works and nothing says which you used: a value starting
`-----BEGIN CERTIFICATE-----` is the certificate itself, anything else is
treated as a file path. Line breaks written as `\n` inside an env file are
turned back into real ones.

**It is used by everything that opens a database connection** —
`server/databaseConnection.ts` is the single place, called from `server/db.ts`
(the app), `scripts/migrate.mts` (migrations) and the three backup helpers.

**There is no "encrypt but don't check" option, on purpose.** Skipping the
identity check is the half of TLS that stops someone in the middle of the
connection reading every bid and password hash going past. Either the
certificate is configured and the server is verified, or no encryption is
requested at all.

**If the database URL asks for encryption and this is unset**, the connection
fails immediately and names this setting. DigitalOcean's URL ends in
`?ssl-mode=REQUIRED`; that parameter is removed before mysql2 sees it, because
mysql2 does not understand it, ignores it, and would connect unencrypted — which
the server then refuses with an error that says nothing about the real cause.

## 6. What replacing Forge storage actually means

Not a variable swap. `server/storage.ts` asks Forge to presign an S3 operation
rather than talking to S3 itself, so two functions change to sign against your
own bucket: `storagePresignPut` and `storageGetSignedUrl`.

Everything in front of them carries over unchanged — `server/_core/storageProxy.ts`
only redirects to whatever URL those return, and the signed-token scheme in
`server/storageTokens.ts` is ours, not Manus's.

The new bucket needs a CORS rule permitting `PUT` from the app's origin, or plan
uploads fail with nothing useful in the log. `references/deploying.md` § 9 has
the shape.

---

## Which file holds what, locally

| File                    | Read by                                     | Contains                                       |
| ----------------------- | ------------------------------------------- | ---------------------------------------------- |
| `.env`                  | `pnpm dev`, `pnpm test`, everything default | **Local development only.**                    |
| `.env.production.local` | Only an explicit `DOTENV_CONFIG_PATH`       | Production database + Forge + R2, for backups. |

Both are gitignored and neither is tracked.

> **Never put the production `DATABASE_URL` in `.env`.** `pnpm test` reads `.env`
> and the tests are not mocked — they create and delete real rows. Production
> belongs only in `.env.production.local`, which nothing loads unless a command
> names it. That separation is the whole reason two files exist.

---

## Keeping this honest

Every name here was read out of the source, not remembered. To regenerate the
list after a change:

```bash
grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*|import\.meta\.env\.[A-Z_][A-Z0-9_]*" \
  --include=*.ts --include=*.tsx --include=*.mts \
  server/ client/ shared/ scripts/ | sed -E 's/.*env\.//' | sort -u
```

The R2 names will not appear in that sweep — `server/backup/config.ts` reads them
through an injected `env` object so the tests can supply their own. They are
listed in `REQUIRED_VARS` there.
