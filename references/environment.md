# Every setting the app needs

Names and sources only. **No values in this file, ever** — the repo is public.

Read alongside `references/disaster-recovery.md`, which covers the order to
rebuild things in. This one answers the narrower question: what has to be set,
where each value comes from today, and which ones have to be regenerated on a
new host.

---

## The one-line version

Of the sixteen settings below, **four survive a move** (they are yours, not
Manus's), **five have to be regenerated** on any new host, and the rest are
either optional or derived from the choices you make. The one that catches
people out is `JWT_SECRET`, which signs two different things.

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

## 3. Backups — yours already, and the ones that matter most

| Name                            | Where the value comes from today | On a new host  |
| ------------------------------- | -------------------------------- | -------------- |
| `R2_ACCOUNT_ID`                 | Cloudflare dashboard → R2        | **Unchanged.** |
| `R2_ACCESS_KEY_ID`              | Cloudflare R2 API token          | **Unchanged.** |
| `R2_SECRET_ACCESS_KEY`          | Cloudflare R2 API token          | **Unchanged.** |
| `R2_BUCKET`                     | Cloudflare — the bucket name     | **Unchanged.** |
| `R2_ENDPOINT` _(optional)_      | Defaults from the account id     | Unchanged.     |
| `R2_BACKUP_PREFIX` _(optional)_ | Defaults to `helixbid`           | Unchanged.     |

**These four are the keys to your own backups.** They belong to your Cloudflare
account, not Manus, and they carry over untouched. Keep them somewhere that
survives losing any single provider — a backup you cannot open is not a backup.

The token needs **Object Read & Write** on that one bucket. It does not need
account-level permissions.

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

## 5. What replacing Forge storage actually means

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
