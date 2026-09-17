/**
 * The scheduler for BidRender's two nightly jobs.
 *
 * ── Why this lives outside the app ───────────────────────────────────────────
 * The app's instances are stopped and replaced by the host, so a timer inside
 * the app dies with the instance and takes the guarantee with it. Something
 * outside has to do the asking. This Worker is that something: it holds the
 * shared secret and POSTs to the app on a schedule.
 *
 * It deliberately knows nothing about backups or bids. It knows a URL, a
 * secret, and when to knock. Everything that could need judgement lives in the
 * app, where it can be tested.
 *
 * ── Deploying it ─────────────────────────────────────────────────────────────
 *     cd workers/cron
 *     npx wrangler secret put CRON_SECRET     # the same value the app has
 *     npx wrangler deploy
 *
 * APP_BASE_URL is set in wrangler.toml. CRON_SECRET is a secret, so it is set
 * with the command above and never written into a file.
 *
 * UNTIL THIS IS DEPLOYED, NEITHER JOB EVER RUNS. The app notices that on its
 * own — see `backup.health`, which measures how long it has been since a backup
 * actually succeeded rather than waiting to be told one failed. A schedule that
 * was never created reports nothing at all, which is exactly why being told is
 * not enough.
 */

/** Paths on the app. These must match server/scheduled/*.ts. */
const JOBS = {
  "0 9 * * *": {
    name: "backup",
    path: "/api/scheduled/backupToR2",
    /**
     * Retried, because a missed backup is a night with nothing saved and the
     * causes are usually transient — an instance restarting, a slow dump, R2
     * having a moment. The app makes this safe to retry: a run that already
     * succeeded today returns 200 having done nothing, so a retry after a
     * timeout cannot produce a second full export.
     */
    attempts: 3,
  },
  "30 10 * * *": {
    name: "purge",
    path: "/api/scheduled/purgeArchivedBids",
    /**
     * One attempt, on purpose. This job permanently deletes bids whose archive
     * window has closed, and missing a night costs nothing: the bids simply
     * stay another day and tomorrow's sweep takes them. Its whole design points
     * at "keeps too much", never "deletes too early", and retrying a deletion
     * against a server that may have half-finished is the wrong direction to
     * push it.
     */
    attempts: 1,
  },
};

/** Growing wait between attempts, in milliseconds. */
const BACKOFF_MS = [30_000, 120_000];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Knock once.
 *
 * Returns what happened rather than throwing, so the caller can decide whether
 * this particular failure is worth another attempt.
 */
async function callOnce(job, env) {
  const url = `${env.APP_BASE_URL.replace(/\/+$/, "")}${job.path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-cron-secret": env.CRON_SECRET,
      "content-type": "application/json",
    },
    body: "{}",
  });

  const body = await response.text().catch(() => "");
  return { status: response.status, body: body.slice(0, 500) };
}

/**
 * Run one job, retrying only what is worth retrying.
 *
 * A 5xx or a dead connection is the app having a bad moment — worth another go.
 * A 403 is the secret being wrong, and a 404 is the path being wrong; both give
 * the same answer every time, and retrying them turns one clear failure into
 * three identical ones spread over four minutes.
 */
async function runJob(job, env) {
  let last = null;

  for (let attempt = 1; attempt <= job.attempts; attempt++) {
    try {
      const result = await callOnce(job, env);
      if (result.status >= 200 && result.status < 300) {
        console.log(`[cron] ${job.name}: ok (${result.status})`);
        return { ok: true };
      }
      last = `HTTP ${result.status} ${result.body}`;
      if (result.status < 500 && result.status !== 429) {
        console.error(`[cron] ${job.name}: refused, not retrying — ${last}`);
        return { ok: false, reason: last };
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }

    console.warn(
      `[cron] ${job.name}: attempt ${attempt} of ${job.attempts} failed — ${last}`
    );
    if (attempt < job.attempts) await sleep(BACKOFF_MS[attempt - 1] ?? 120_000);
  }

  return { ok: false, reason: last ?? "unknown" };
}

export default {
  async scheduled(event, env, ctx) {
    const job = JOBS[event.cron];
    if (!job) {
      // A trigger in wrangler.toml with no job here. Loud, because the schedule
      // is firing and nothing is happening.
      console.error(`[cron] no job registered for "${event.cron}"`);
      throw new Error(`Unrecognised cron trigger: ${event.cron}`);
    }

    if (!env.CRON_SECRET || !env.APP_BASE_URL) {
      throw new Error(
        "CRON_SECRET or APP_BASE_URL is missing — run `wrangler secret put CRON_SECRET`."
      );
    }

    const result = await runJob(job, env);

    if (!result.ok) {
      /**
       * Thrown, not swallowed.
       *
       * A Worker that catches its own failure and returns quietly looks
       * perfectly healthy in Cloudflare's dashboard forever. Throwing marks the
       * invocation as errored, so the failure shows up under the Worker's Cron
       * Triggers → past events with the message below.
       *
       * That is the second place this is visible. The first, and the one that
       * catches the failures this Worker cannot report — including never having
       * been deployed — is the app's own backup health check.
       */
      throw new Error(
        `${job.name} failed after ${job.attempts} attempt(s): ${result.reason}`
      );
    }
  },
};
