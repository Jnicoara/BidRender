# Deploying HelixBid

Reference for the deploy sequence summarised in `CLAUDE.md` § Deploying.

---

## 1. The one fact that explains everything

**GitHub is not connected to the live site.** There is no CI, no GitHub Actions
workflow, no Dockerfile, no cloud build config, and `origin` is the only remote.
Nothing observes a push.

The live site runs from the **Manus project's own copy** of this repo, deployed
by a human pressing **Deploy** in the Manus UI. Getting code live is therefore
two separate acts: push it to GitHub, then go make Manus pull it.

| Action                                         | Effect on the live site              |
| ---------------------------------------------- | ------------------------------------ |
| `git push origin main`                         | None.                                |
| Commit in the local checkout                   | None.                                |
| Manus session: `git pull origin main` + Deploy | This is the only thing that deploys. |

## 2. Direction of travel — GitHub → Manus, never the reverse

The local checkout plus GitHub is the source of truth. Manus is a deployment
target that pulls.

This is a rule rather than a preference because the repo has already diverged
once. The project began inside Manus — that is what the 197 `Checkpoint:`
commits are — and the last of them is `ff469cb` (2026-08-10). Work then moved to
a local checkout driven by Claude Code, which pushes to GitHub and nothing else.
51 commits later the live site was still serving the pre-`ff469cb` build. No
error was raised at any point, because from each side's perspective nothing was
wrong.

Editing directly in the Manus workspace re-opens the same gap from the other
end. If it happens anyway, **push that work to GitHub first**, then deploy — do
not merge GitHub into the Manus copy and leave the two reconciled only there.

## 3. Pre-flight: has Manus got anything GitHub hasn't?

Run this in the Manus sandbox **before** pulling. It is the whole safety check.

```bash
git status --porcelain          # uncommitted edits — expect empty
git log origin/main..HEAD       # local-only commits — expect empty
git stash list                  # stashed work — expect empty
git fetch origin && git log HEAD..origin/main --oneline | wc -l   # how far behind
```

Interpretation:

- **All empty except the last** → clean. Manus has nothing unique; pulling is
  lossless. Proceed.
- **Anything in the first three** → **stop.** That is work that exists only in
  Manus. Push it to GitHub (`git push origin HEAD:a-rescue-branch`) and sort out
  the merge before deploying. A `git pull` or checkout here can bury it.

Also worth capturing before you touch anything, so "what was live" is answerable
later:

```bash
git rev-parse --short HEAD      # the commit the Manus copy is sitting on
git log -1 --format='%ad %s'    # and what it was
```

## 4. Deploy sequence

1. **Pre-flight** — § 3 above. Do not skip it; it is the only thing standing
   between an unpushed change and permanent loss.
2. **`git pull origin main`** — the bridge that does not otherwise exist.
3. **`pnpm install`** — only if `package.json` / the lockfile moved.
4. **`pnpm db:push`** — apply pending migrations. **Before deploying, not
   after.**
5. **Save a checkpoint** in Manus.
6. **Deploy.**
7. **Verify** — § 6.
8. **Register any new scheduled job** — § 7.

## 5. Migrations are the sharp edge

`pnpm db:push` is step 4 rather than an afterthought because a skipped migration
**does not fail loudly**. The server starts, serves pages, and renders wrong
data. `.claude/skills/run-helixbid/SKILL.md` documents the symptoms in detail:
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

## 6. Verifying a deploy actually took

A deploy that silently didn't take looks identical to one that did, so check
something that could only be true of the new build:

- **The navigation helper** (Dashboard → "Ask where to find something") is the
  cheapest probe. It exercises `BUILT_IN_FORGE_API_KEY`, which exists **only on
  deployed infrastructure** — it is absent from every local `.env`, so this
  feature can never be verified on a dev machine. If it returns a screen and a
  button, the platform wiring is intact.
- **The version tag** in the sidebar footer (hover to reveal) reads
  `APP_VERSION` from `shared/version.ts`. If it shows an older number than the
  one on `main`, the deploy did not take.
- **A schema-dependent screen** — Materials grouped into categories, with "1900"
  and "gem box" returning hits. Proves step 4 ran.

## 7. Scheduled jobs need a second, manual step

Deploying a handler under `/api/scheduled/` does **not** schedule it. The cron
is created once, from a Manus sandbox terminal, **after** the site is deployed —
a dev machine is unreachable from the platform, so this cannot be done from a
local checkout.

The exact command for each job lives in that job's own header comment. The
working example is `server/scheduled/purgeArchivedBids.ts` (the 30-day archive
purge, `0 30 3 * * *`, six fields with seconds first, UTC).

`references/periodic-updates.md` is the full reference for the cron system.
`CLAUDE.md` § Scheduled work explains why failure here points at "keeps too
much" rather than "deletes too early".

## 8. Platform services the app cannot run without

Relevant when anyone proposes hosting this elsewhere. Four Manus services are
load-bearing:

| Service          | Env / endpoint                                                         | What breaks without it                                                                                    |
| ---------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| OAuth login      | `OAUTH_SERVER_URL`                                                     | All sign-in. Auth is OAuth-only; no password flow is wired up despite `passwordHash` existing on `users`. |
| LLM gateway      | `BUILT_IN_FORGE_API_KEY` / `BUILT_IN_FORGE_API_URL` → `forge.manus.im` | The navigation helper and the material alias suggester. Both degrade gracefully, so this fails quietly.   |
| S3 presign proxy | `server/_core/storage.ts`, `storageProxy.ts`                           | Plan PDF upload and cross-device sync.                                                                    |
| Cron             | Manus platform scheduler                                               | The archive purge (§ 7).                                                                                  |

Leaving Manus means replacing all four, including building a login system.
It is not a configuration change.

**`JWT_SECRET` now serves files as well as sessions.** Storage URLs carry a
signed, expiring token in the path (`server/storageTokens.ts`) because the
proxy would otherwise hand any stored object to any caller. The same secret
signs both, so an environment missing it does not merely fail to log people in
— it cannot serve a plan sheet or a logo either, and says so rather than
serving them unsigned.

**Gotcha:** when the gateway key is missing, the platform's own error message
reads `OPENAI_API_KEY is not configured` (`server/_core/llm.ts`). That string is
mislabelled — the variable it actually wants is `BUILT_IN_FORGE_API_KEY`, and
the app has no OpenAI dependency of any kind. It has sent one investigation down
the wrong path already.

## 9. Storage needs a CORS rule, and without it no plan uploads

**This is a live issue.** Plan PDF upload fails for every file at every size,
having transferred zero bytes, because the storage bucket does not publish a
CORS rule for the site's origin.

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

The bucket behind `BUILT_IN_FORGE_API_URL` needs a rule permitting the deployed
origin to PUT, and exposing nothing it does not need to:

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

This is a Manus-side setting. It is not in this repo, there is no file here that
can change it, and it cannot be tested from a local checkout — the storage
credentials exist only on deployed infrastructure.

### Until it is configured

`server/planUpload.ts` is a fallback: the browser POSTs the file to
`/api/plan-upload` on our own origin, which cannot be refused by a bucket
policy, and the server forwards the bytes on. The client tries the direct PUT
first and only falls back when it is blocked, so **the moment the CORS rule is
added the app returns to the direct path on its own** with nothing to switch
back.

The fallback is capped at 25MB (`PROXY_UPLOAD_MAX_BYTES`) because it goes
through the platform's request body limit — the very ceiling the direct upload
was built to avoid. So while CORS is unconfigured, plan sets over 25MB cannot be
attached at all, and the app says so in those words rather than claiming the
file is too large.

### Verifying the fix

Attach a plan of any size after changing the bucket policy. If it uploads with
the progress bar moving from 0%, the direct path is working. A quicker probe
needing no large file: upload a company logo in Settings § Branding, which uses
the same presign-and-PUT mechanism.
