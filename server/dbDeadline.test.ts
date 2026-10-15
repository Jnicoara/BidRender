/**
 * Q-DB1, as a test: the database stops answering, comes back, and the app's
 * pool answers again WITHOUT a restart.
 *
 * Track C's drill (stress-results.md "Third round"): three rounds of 8 reads
 * into a hang (bytes lost) used up all 10 pooled connections, and every read
 * after the database came back timed out — for good. This puts a small TCP
 * proxy between the app's pool (`createAppPool`, the one the server uses) and
 * the test database, swallows every byte for a while, then lets them through
 * again.
 *
 * Without the deadline (dbDeadline.ts) the last read never answers: the race
 * below gives up at 5 s and the test fails.
 */
import { afterAll, describe, expect, it } from "vitest";
import net from "node:net";
import { createAppPool } from "./appPool";
import { DatabaseDeadlineError } from "./dbDeadline";

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

/** A proxy that forwards to the database, or swallows everything. */
function faultProxy(target: { host: string; port: number }) {
  let hang = false;
  const sockets = new Set<net.Socket>();
  const server = net.createServer(client => {
    const upstream = net.connect(target.port, target.host);
    sockets.add(client).add(upstream);
    client.on("data", chunk => {
      if (!hang) upstream.write(chunk);
    });
    upstream.on("data", chunk => {
      if (!hang) client.write(chunk);
    });
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("close", close).on("error", close);
    upstream.on("close", close).on("error", close);
  });
  return {
    listen: () =>
      new Promise<number>(resolve =>
        server.listen(0, "127.0.0.1", () =>
          resolve((server.address() as net.AddressInfo).port)
        )
      ),
    setHang: (value: boolean) => {
      hang = value;
    },
    close: () =>
      new Promise<void>(resolve => {
        sockets.forEach(s => s.destroy());
        server.close(() => resolve());
      }),
  };
}

/** The query's outcome, or "no answer" after `ms`. */
function within<T>(ms: number, work: Promise<T>) {
  return Promise.race([
    work.then(
      value => ({ answered: true as const, value }),
      error => ({ answered: true as const, error: error as Error })
    ),
    new Promise<{ answered: false }>(resolve =>
      setTimeout(() => resolve({ answered: false }), ms)
    ),
  ]);
}

describeDb("a database that stops answering, then comes back", () => {
  const url = new URL(process.env.DATABASE_URL ?? "mysql://x@127.0.0.1/x");
  const proxy = faultProxy({ host: url.hostname, port: Number(url.port) });
  let pool: ReturnType<typeof createAppPool> | null = null;

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await proxy.close();
  });

  it("answers again without a restart, and says why the stuck reads failed", async () => {
    const port = await proxy.listen();
    const viaProxy = new URL(url.toString());
    viaProxy.port = String(port);
    pool = createAppPool(viaProxy.toString(), 500);

    // Healthy first, so the pool really has connections to lose.
    expect(await pool.query("SELECT 1 AS ok")).toBeDefined();

    // The hang: 12 reads, more than the pool's 10 connections.
    proxy.setHang(true);
    const stuck = await Promise.all(
      Array.from({ length: 12 }, () => within(5_000, pool!.query("SELECT 1")))
    );
    expect(stuck.every(r => r.answered)).toBe(true);
    for (const r of stuck)
      if (r.answered)
        expect("error" in r && r.error).toBeInstanceOf(DatabaseDeadlineError);

    // The database is back. A fresh read must answer, through the same pool.
    proxy.setHang(false);
    // Up to ~10 s: a connection the pool began opening DURING the hang lost
    // its handshake and holds a slot until mysql2's connect timeout (10 s).
    // Without the deadline this never answers at all.
    const after = await within(15_000, pool.query("SELECT 1 AS ok"));
    expect(after.answered).toBe(true);
    expect("error" in after ? after.error : null).toBeNull();

    // And a transaction-style connection taken from the pool works too.
    const connection = await pool.getConnection();
    const [rows] = (await connection.query("SELECT 2 AS two")) as unknown as [
      Array<{ two: number }>,
    ];
    connection.release();
    expect(rows[0].two).toBe(2);
  }, 60_000);

  it("a connection taken from the pool is thrown away when it stops answering", async () => {
    const live = pool!;
    const connection = await live.getConnection();
    proxy.setHang(true);
    const r = await within(5_000, connection.query("SELECT 1"));
    proxy.setHang(false);
    expect(r.answered).toBe(true);
    expect("error" in r && r.error).toBeInstanceOf(DatabaseDeadlineError);
    connection.release(); // a no-op on a destroyed connection, and must not throw
    const after = await within(15_000, live.query("SELECT 3 AS three"));
    expect("value" in after).toBe(true);
  }, 60_000);
});
