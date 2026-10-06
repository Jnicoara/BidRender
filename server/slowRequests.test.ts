import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";
import {
  newRequestTiming,
  routeLabel,
  slowRequestLine,
  slowRequestLogger,
  timePool,
  timeQuery,
} from "./slowRequests";

/** A clock the test moves by hand. */
function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

/** A promise the test settles by hand. */
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
}

describe("database time for one request", () => {
  it("is WALL time with a query in flight, not the sum of overlapping queries", async () => {
    // One tRPC batch runs its procedures together: two 100 ms queries side
    // by side are 100 ms of database, not 200.
    const timing = newRequestTiming();
    const c = clock();
    const a = deferred();
    const b = deferred();
    const first = timeQuery(() => a.promise, timing, c.now);
    const second = timeQuery(() => b.promise, timing, c.now);
    c.advance(100);
    a.resolve();
    b.resolve();
    await Promise.all([first, second]);
    expect(timing.databaseMs).toBe(100);
    expect(timing.queries).toBe(2);
    expect(timing.longestQueryMs).toBe(100);
  });

  it("adds separate stretches, and leaves the gaps between them as other time", async () => {
    const timing = newRequestTiming();
    const c = clock();
    const a = deferred();
    const first = timeQuery(() => a.promise, timing, c.now);
    c.advance(30);
    a.resolve();
    await first;
    c.advance(500); // not the database
    const b = deferred();
    const second = timeQuery(() => b.promise, timing, c.now);
    c.advance(20);
    b.resolve();
    await second;
    expect(timing.databaseMs).toBe(50);
  });

  it("counts waiting for a pooled connection as database time, not as a query", async () => {
    const timing = newRequestTiming();
    const c = clock();
    const wait = deferred();
    const got = timeQuery(() => wait.promise, timing, c.now, "wait");
    c.advance(4000);
    wait.resolve();
    await got;
    expect(timing.connectionWaitMs).toBe(4000);
    expect(timing.databaseMs).toBe(4000);
    expect(timing.queries).toBe(0);
  });

  it("records nothing outside a request (seeding, cron)", async () => {
    await expect(timeQuery(async () => 7, undefined)).resolves.toBe(7);
  });
});

describe("the pool wrapper", () => {
  it("still returns what the pool returns, through query, execute and a taken connection", async () => {
    const connection = {
      query: async () => ["conn-query"],
      execute: async () => ["conn-execute"],
    };
    const pool = timePool({
      query: async () => ["pool-query"],
      execute: async () => ["pool-execute"],
      getConnection: async () => connection,
    });
    expect(await pool.query()).toEqual(["pool-query"]);
    expect(await pool.execute()).toEqual(["pool-execute"]);
    const taken = await pool.getConnection();
    expect(await taken.query()).toEqual(["conn-query"]);
    expect(await taken.execute()).toEqual(["conn-execute"]);
  });
});

describe("what may be logged as the route", () => {
  it("keeps tRPC procedure names — they say which read was slow", () => {
    expect(routeLabel("/api/trpc/bids.get,bidPdfs.list")).toBe(
      "/api/trpc/bids.get,bidPdfs.list"
    );
  });

  it("never keeps a stored file's signed token or its file name", () => {
    const label = routeLabel(
      "/manus-storage/1791325800000.jTVNC7P36Gtn/bid-plans/1/135/Smith residence.pdf"
    );
    expect(label).toBe("/manus-storage/…");
  });

  it("keeps only the first segment under /api", () => {
    expect(routeLabel("/api/scheduled/purgeArchivedBids")).toBe(
      "/api/scheduled/…"
    );
    expect(routeLabel("/api/version")).toBe("/api/version");
  });
});

describe("the line", () => {
  it("says where the time went", () => {
    const timing = {
      ...newRequestTiming(),
      queries: 42,
      longestQueryMs: 6800,
      databaseMs: 6900,
      connectionWaitMs: 0,
    };
    expect(
      slowRequestLine({
        method: "GET",
        route: "/api/trpc/bids.get",
        totalMs: 7421,
        status: 200,
        timing,
        eventLoopBusy: 0.12,
      })
    ).toBe(
      "[slow] GET /api/trpc/bids.get 7421 ms (200) — database 6900 ms over 42 queries, longest 6800 ms, waiting for a connection 0 ms; other 521 ms; event loop 12% busy"
    );
  });
});

/** A request/response pair the middleware can be driven with. */
function exchange(path: string, query: string) {
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableFinished: false,
  });
  const req = { method: "GET", path, url: `${path}?${query}` };
  return {
    req: req as unknown as Request,
    res: res as unknown as Response & EventEmitter,
  };
}

describe("the middleware", () => {
  it("logs a slow request once, with no query string — that is where tRPC puts the input", async () => {
    const lines: string[] = [];
    const { req, res } = exchange(
      "/api/trpc/bids.get",
      "input=%7B%22name%22%3A%22Smith%22%7D"
    );
    const next: NextFunction = () => {};
    slowRequestLogger(0, line => lines.push(line))(req, res, next);
    res.emit("finish");
    res.emit("close");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\[slow\] GET \/api\/trpc\/bids\.get \d+ ms \(200\)/
    );
    expect(lines[0]).not.toMatch(/input|Smith/);
  });

  it("names the route as it ARRIVED — a mounted handler rewrites the path before it answers", () => {
    // Seen on the first real run: Express strips "/api/trpc" for the tRPC
    // handler, so reading the path at 'finish' gave "/auth.me" -> "GET /…".
    const lines: string[] = [];
    const { req, res } = exchange("/api/trpc/auth.me", "");
    slowRequestLogger(0, line => lines.push(line))(req, res, () => {});
    (req as unknown as { path: string }).path = "/auth.me";
    res.emit("finish");
    expect(lines[0]).toMatch(/^\[slow\] GET \/api\/trpc\/auth\.me /);
  });

  it("says when the browser gave up before an answer", () => {
    const lines: string[] = [];
    const { req, res } = exchange("/api/trpc/bids.get", "");
    slowRequestLogger(0, line => lines.push(line))(req, res, () => {});
    res.emit("close");
    expect(lines[0]).toContain("(client gave up)");
  });

  it("says nothing about a fast request", () => {
    const lines: string[] = [];
    const { req, res } = exchange("/api/trpc/bids.get", "");
    slowRequestLogger(60_000, line => lines.push(line))(req, res, () => {});
    res.emit("finish");
    expect(lines).toEqual([]);
  });

  it("times the database work the request causes", async () => {
    const lines: string[] = [];
    const pool = timePool({
      query: async () => [],
      execute: async () => [],
      getConnection: async () => ({
        query: async () => [],
        execute: async () => [],
      }),
    });
    const { req, res } = exchange("/api/trpc/bids.get", "");
    let work: Promise<unknown> = Promise.resolve();
    slowRequestLogger(0, line => lines.push(line))(req, res, () => {
      work = (async () => {
        await pool.query();
        const conn = await pool.getConnection();
        await conn.execute();
      })();
    });
    await work;
    res.emit("finish");
    expect(lines[0]).toMatch(/over 2 queries/);
  });
});
