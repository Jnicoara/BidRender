# Q-DB1 — the server stays stuck after the database comes back

Track A, 2026-10-15, on `track-a-night`. Found by Track C's failure drill
(`references/stress-results.md` "Third round" on `track-c`; `track-c-handoff.md`
"FOR TRACK A … Q-DB1").

## 1. The fault

A query sent into a network blackhole leaves its pooled connection waiting
for a reply forever. Ten of those (mysql2's default pool size) and every later
read queues behind them: the server stops reading the database **for good**,
even after the database is back, until a restart — or until Linux gives up on
the half-open sockets (~15 minutes). The real-world trigger is a database
failover or a dropped network path. `/api/version` touches no database, so it
kept answering 200 throughout: a health check pointed at it calls a dead
server healthy.

mysql2's per-query `timeout` does not fix it — it reports an error but leaves
the connection waiting for the old reply, and the pool hands that connection
out again out of step (C's finding; consistent with mysql2's code).

## 2. The fix — BUILT, code only, no migration

- **`server/dbDeadline.ts`** — `withQueryDeadline(pool, ms)`. A query that has
  not answered within the limit **destroys its connection** (mysql2's
  `destroy()` removes it from the pool, so the next caller gets a fresh one)
  and fails with `DatabaseDeadlineError`, whose message says so.
  - `pool.query` / `pool.execute` run on a connection taken here, so the stuck
    one is known. **The limit covers getting the connection too**: the first
    test run showed that while the database is unreachable the pool also
    tries to OPEN connections, and that wait sat outside a query-only limit
    until mysql2's 10 s connect timeout. A connection that arrives after the
    deadline is destroyed when it arrives.
  - Connections from `pool.getConnection()` (transactions, named locks) get the
    same limit per query. A later `release()` on a destroyed connection is a
    no-op in mysql2 (read in `lib/base/pool.js` / `pool_connection.js`), so
    drizzle's transaction cleanup is safe.
  - **30 s** default, `DB_QUERY_DEADLINE_MS` overrides. A browser read gives
    up at 20 s, so a query past 30 s answers nobody. The nightly backup and
    the migration scripts open their OWN connections (`server/backup/`,
    `scripts/migrate.mts`), so their long reads are untouched. The longest
    intentional wait on the pool is `GET_LOCK(…, 10)`.
- **`server/appPool.ts`** — `createAppPool(url, deadlineMs)`: the one place
  the pool is built (TLS → deadline → per-request timing). `db.ts` uses it, and
  so does the test, so they cannot build it differently.
- **`GET /api/health`** (`server/health.ts`, mounted in `_core/index.ts`, open
  through the staging gate like `/api/version`): `SELECT 1` with its own 3 s
  limit → 200 `{"database":"ok"}` or 503 `{"database":"unreachable"}`. No error
  text, no host. Answers in 3 s even when every pooled connection is stuck.

## 3. App Platform's health check — the owner's step, NOT done

Which path App Platform checks is not written down anywhere in `references/`
(C's note; searched again: `deploying.md` has no health-check entry), and it
is live infrastructure. Recommendation, after this code is live:

1. DigitalOcean → the app → Settings → the web component → Health checks:
   read what it uses today and write it into `deploying.md`.
2. Point it at **`/api/health`**, with a failure threshold generous enough
   that a short database blip does not restart instances (for example several
   consecutive failures, not one). Check DigitalOcean's current options for
   readiness vs liveness — a liveness failure restarts the instance, which is
   what clears a wedged server; a readiness failure only takes it out of
   rotation.
3. Expect, and say in `deploying.md`: during a real database outage, a
   liveness check on `/api/health` restarts instances too. Harmless — the app
   cannot serve without its database — but visible in Activity.

With the code fix alone the server recovers by itself within ~the deadline
plus mysql2's 10 s connect timeout; the health check is the second net.

## 4. Proof

`server/dbDeadline.test.ts` puts a TCP proxy between the app's pool
(`createAppPool`, deadline 500 ms) and the test database, swallows every byte,
fires 12 reads (more than the pool's 10), then lets bytes through again:

|                                           | Without the deadline (factory edited, reverted) | With it                                        |
| ----------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| 12 reads into the hang                    | never answer (race gives up at 5 s)             | all fail with `DatabaseDeadlineError`          |
| A read after the database is back         | none; the next test's connection times out      | answers (~0.5 s for the whole test)            |
| A transaction-style connection that hangs | —                                               | destroyed, `release()` safe, pool answers next |

`server/health.test.ts` (3): 200 when it answers; 503 with no detail when it
errors; 503 within its own limit when it never answers.

Related files run together (`dbDeadline`, `health`, `databaseConnection`,
`slowRequests`, `stagingGate`, `seedLock`, `personalCompanyRace`,
`sourceHygiene`): 57/57, three times. **One earlier combined run had
`personalCompanyRace` fail once at 77 ms**; its message was not captured, and
16 further runs (3 alone, 3 combined, 10 with `dbDeadline`) were all green.
Recorded rather than dismissed — if it recurs, capture the message.

**Gate 38741709348 went red on this test** (13:30 UTC): under the full
suite's load in CI, the first read after the hang hit the test's 500 ms
deadline — a pool slot was still held by a connection whose handshake was
swallowed during the hang. The test asked the wrong question ("does the very
first read win"); it now asks "does a read succeed within 15 s, asking every
200 ms", which is what recovery means for a server whose requests keep
arriving. Still red without the deadline (reads never answer), green with it
3× alone and beside five heavy DB files (101/101).
