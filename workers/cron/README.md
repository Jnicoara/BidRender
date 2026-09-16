# BidRender cron worker

Calls the app's two scheduled jobs on a timer. The app cannot schedule itself —
its instances are stopped and replaced, so an in-process timer dies with them.

| Job                | When (UTC)   | Local                        | Retries |
| ------------------ | ------------ | ---------------------------- | ------- |
| Backup             | `0 2 * * *`  | 7pm Pacific, previous day    | 3       |
| Archived-bid purge | `30 3 * * *` | 8:30pm Pacific, previous day | 1       |

The purge runs _after_ the backup on purpose: it permanently deletes bids, and
going second means the night's backup still contains what it is about to remove.

## Deploying

```bash
cd workers/cron
# 1. Point it at the app
#    edit APP_BASE_URL in wrangler.toml
# 2. Give it the same secret the app has
npx wrangler secret put CRON_SECRET
# 3. Ship it
npx wrangler deploy
```

`CRON_SECRET` must be byte-identical to the app's. It is stored by Cloudflare,
never in this repo.

## Checking it works

- **Right now:** `npx wrangler dev --test-scheduled`, then
  `curl "http://localhost:8787/__scheduled?cron=0+2+*+*+*"`.
- **Afterwards:** Cloudflare dashboard → Workers → `bidrender-cron` → Cron
  Triggers → past events. A failed run shows there because the Worker throws
  rather than swallowing the error.
- **The one that matters:** the app's own backup health check. It measures how
  long it has been since a backup actually succeeded, so it catches the failure
  this Worker cannot report — never having been deployed at all.
