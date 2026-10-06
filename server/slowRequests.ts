/**
 * A request that takes over 5 s leaves ONE log line saying where the time went.
 *
 * ── Why (Track A, 2026-10-06) ─────────────────────────────────────────────────
 * Staging stalled twice in one day — a read batch that never answered (smoke
 * flow 9, blank Plans for 60 s) and a write that took over 20 s (flow 10) —
 * and nothing could say why. The database was measured clean afterwards (0
 * slow queries in 20 days, 40 ms longest lock wait), so the time went
 * somewhere else, and DigitalOcean's Runtime Logs are wiped by every deploy.
 * This makes the NEXT stall leave its own evidence, in the line itself.
 *
 * ── What the line says ───────────────────────────────────────────────────────
 *   [slow] GET /api/trpc/bids.get,bidPdfs.list 7421 ms (200) — database 6900 ms
 *   over 42 queries, longest 6800 ms, waiting for a connection 0 ms; other
 *   521 ms; event loop 12% busy
 *
 * - "database" is WALL time with at least one query in flight, not a sum:
 *   one batch runs its procedures together, and summing overlapping queries
 *   would report more database time than the request took.
 * - "waiting for a connection" is the pool being empty — every connection
 *   busy elsewhere. It is part of the database figure.
 * - "event loop N% busy" is how much of the request's time this process spent
 *   running JavaScript. Near 100% means the app itself was the bottleneck
 *   (CPU or a long synchronous step); near 0% with little database time means
 *   it was waiting on something else — the network, a stalled socket.
 * - "client gave up" means the browser closed the request before an answer
 *   (since 2026-10-06 a read gives up at 20 s — @/lib/queryDeadline).
 *
 * ── No private data ──────────────────────────────────────────────────────────
 * Method, route and numbers only. Never a query string (tRPC puts the INPUT
 * there), a body, a header, a user, or SQL. Routes are reduced by
 * `routeLabel`: a stored-file address carries a signed token and a file name,
 * so only its first segment is kept.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";

/** 5 s; `SLOW_REQUEST_MS` overrides it, e.g. 1 to see every request's line. */
export const SLOW_REQUEST_MS =
  Number(process.env.SLOW_REQUEST_MS) > 0
    ? Number(process.env.SLOW_REQUEST_MS)
    : 5_000;

/** What one request spent, filled in by the pool wrapper as it goes. */
export type RequestTiming = {
  queries: number;
  longestQueryMs: number;
  /** Wall time with at least one query in flight. */
  databaseMs: number;
  connectionWaitMs: number;
  inFlight: number;
  inFlightSince: number;
};

const current = new AsyncLocalStorage<RequestTiming>();

export function newRequestTiming(): RequestTiming {
  return {
    queries: 0,
    longestQueryMs: 0,
    databaseMs: 0,
    connectionWaitMs: 0,
    inFlight: 0,
    inFlightSince: 0,
  };
}

/**
 * Time one database step against the request it belongs to, if any. A
 * "query" counts toward queries and the longest; a "wait" (for a pooled
 * connection) counts toward the connection wait. Both are database time.
 */
export async function timeQuery<T>(
  run: () => Promise<T>,
  timing: RequestTiming | undefined = current.getStore(),
  now: () => number = performance.now.bind(performance),
  kind: "query" | "wait" = "query"
): Promise<T> {
  if (!timing) return run();
  const start = now();
  if (timing.inFlight === 0) timing.inFlightSince = start;
  timing.inFlight += 1;
  try {
    return await run();
  } finally {
    const end = now();
    if (kind === "query") {
      timing.queries += 1;
      timing.longestQueryMs = Math.max(timing.longestQueryMs, end - start);
    } else {
      timing.connectionWaitMs += end - start;
    }
    timing.inFlight -= 1;
    if (timing.inFlight === 0) timing.databaseMs += end - timing.inFlightSince;
  }
}

function timeConnectionWait<T>(run: () => Promise<T>): Promise<T> {
  return timeQuery(run, current.getStore(), undefined, "wait");
}

type Queryable = {
  query: (...args: never[]) => Promise<unknown>;
  execute: (...args: never[]) => Promise<unknown>;
};

function wrapQueryable<T extends Queryable>(target: T): T {
  const query = target.query.bind(target);
  const execute = target.execute.bind(target);
  target.query = ((...args: never[]) =>
    timeQuery(() => query(...args))) as T["query"];
  target.execute = ((...args: never[]) =>
    timeQuery(() => execute(...args))) as T["execute"];
  return target;
}

/**
 * Wrap a mysql2/promise pool so every query drizzle sends through it — and
 * through a connection taken from it for a transaction — is timed against
 * the request that caused it. Outside a request (seeding, cron) it costs one
 * `getStore()` and records nothing.
 */
export function timePool<
  P extends Queryable & { getConnection: () => Promise<Queryable> },
>(pool: P): P {
  wrapQueryable(pool);
  const getConnection = pool.getConnection.bind(pool);
  pool.getConnection = (() =>
    timeConnectionWait(getConnection).then(
      wrapQueryable
    )) as P["getConnection"];
  return pool;
}

/**
 * The route as it may be logged. tRPC procedure names are kept (they say
 * WHICH read was slow); everything else keeps its first segment or two,
 * because a stored-file address holds a signed token and a file name.
 */
export function routeLabel(path: string): string {
  const trpc = path.match(/^\/api\/trpc\/([\w.,]+)$/);
  if (trpc) return `/api/trpc/${trpc[1]}`;
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "api") {
    const rest = parts.slice(1, 2).filter(p => /^[\w-]+$/.test(p));
    return `/api/${rest.join("/")}${parts.length > 2 ? "/…" : ""}`;
  }
  if (parts.length === 0) return "/";
  const first = /^[\w-]+$/.test(parts[0]) ? parts[0] : "…";
  return `/${first}${parts.length > 1 ? "/…" : ""}`;
}

/** The one line, from numbers only. */
export function slowRequestLine(input: {
  method: string;
  route: string;
  totalMs: number;
  status: number | null;
  timing: RequestTiming;
  eventLoopBusy: number;
}): string {
  const { timing } = input;
  const ms = (n: number) => `${Math.round(n)} ms`;
  const outcome =
    input.status === null ? "client gave up" : String(input.status);
  const other = Math.max(0, input.totalMs - timing.databaseMs);
  const database =
    timing.queries === 0
      ? "no database queries"
      : `database ${ms(timing.databaseMs)} over ${timing.queries} ${
          timing.queries === 1 ? "query" : "queries"
        }, longest ${ms(timing.longestQueryMs)}, waiting for a connection ${ms(
          timing.connectionWaitMs
        )}`;
  return `[slow] ${input.method} ${input.route} ${ms(input.totalMs)} (${outcome}) — ${database}; other ${ms(
    other
  )}; event loop ${Math.round(input.eventLoopBusy * 100)}% busy`;
}

/** Express middleware: install FIRST, so the whole request is measured. */
export function slowRequestLogger(
  thresholdMs: number = SLOW_REQUEST_MS,
  log: (line: string) => void = line => console.warn(line)
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timing = newRequestTiming();
    const start = performance.now();
    // Taken NOW: a mounted handler rewrites req.url, so by 'finish' a tRPC
    // call's path reads "/auth.me" rather than "/api/trpc/auth.me" (seen on
    // the first real run, 2026-10-06: every tRPC line said "GET /…").
    const route = routeLabel(req.path);
    const loopAtStart = performance.eventLoopUtilization();
    let logged = false;
    const done = (finished: boolean) => {
      if (logged) return;
      logged = true;
      const totalMs = performance.now() - start;
      if (totalMs < thresholdMs) return;
      log(
        slowRequestLine({
          method: req.method,
          route,
          totalMs,
          status: finished ? res.statusCode : null,
          timing,
          eventLoopBusy:
            performance.eventLoopUtilization(loopAtStart).utilization,
        })
      );
    };
    res.on("finish", () => done(true));
    res.on("close", () => done(res.writableFinished));
    current.run(timing, next);
  };
}
