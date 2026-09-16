/**
 * The endpoint that actually serves a stored file, and what it now refuses.
 *
 * ── The hole this closes ─────────────────────────────────────────────────────
 * `/manus-storage/*` presigned and redirected for ANY key from ANY caller, with
 * no session check at all. `bidPdfsRouter`'s header says that must never be the
 * case — "a storage key is guessable enough that 'you knew the id' must never
 * be the only thing between one contractor and another contractor's plans" —
 * and the tRPC routers did enforce it. The route serving the bytes did not, so
 * the guarantee ended exactly where it mattered.
 *
 * ── Order is the thing being asserted ────────────────────────────────────────
 * The token is verified BEFORE the storage backend is contacted. That is not a
 * detail: an unauthorised caller must not be able to make this server do work
 * on their behalf, and must learn nothing about whether a key exists.
 *
 * There are no Forge credentials outside deployed infrastructure, and that is
 * what makes the ordering observable here. A request that clears the token
 * check reaches the config check and answers 500 "Storage proxy not
 * configured"; one that fails it answers 403 without ever getting there. So
 * "did it reach storage" is directly readable from the status.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Express, Request, Response } from "express";
import { registerStorageProxy } from "./_core/storageProxy";
import { mintStorageToken, storageTokenExpiry } from "./storageTokens";

const KEY = "bid-plans/1/42/Electrical Plans_a1b2c3d4.pdf";
const NOW = new Date("2026-08-15T12:00:00Z");

/**
 * Say which backend is under test instead of inheriting the developer's.
 *
 * These cases are about the TOKEN, and every one of them is meant to be
 * answered before any store is contacted. Left to `.env`, the backend was
 * whatever the machine happened to be set up for — a laptop with
 * LOCAL_STORAGE_DIR set sent the valid-token case down the on-disk path, where
 * it failed on a stand-in response object that has no `sendFile`. The test was
 * reporting the machine, not the code.
 *
 * Pinned to Manus with no credentials, which is the state that makes the
 * ordering readable: clearing the token reaches the config check and answers
 * 500, failing it answers 403 without getting there.
 */
const saved: Record<string, string | undefined> = {};
const PINNED = [
  "PLAN_STORAGE",
  "LOCAL_STORAGE_DIR",
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
];

beforeEach(() => {
  for (const name of PINNED) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  process.env.PLAN_STORAGE = "manus";
});

afterEach(() => {
  for (const name of PINNED) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

/** Capture the handler the proxy registers, without standing up a server. */
function proxyHandler() {
  const routes: Record<
    string,
    (req: Request, res: Response) => Promise<void> | void
  > = {};
  const app = {
    get(path: string, handler: (req: Request, res: Response) => Promise<void>) {
      routes[path] = handler;
    },
  } as unknown as Express;

  registerStorageProxy(app);

  const path = "/manus-storage/:token/*";
  const handler = routes[path];
  if (!handler) {
    throw new Error(
      `The proxy no longer registers ${path}. If the route shape changed, this test has to change with it.`
    );
  }
  return handler;
}

function fakeResponse() {
  const recorded: { status: number; body: unknown; redirectedTo?: string } = {
    status: 0,
    body: null,
  };
  const res = {
    status(code: number) {
      recorded.status = code;
      return this;
    },
    send(body: unknown) {
      recorded.body = body;
      return this;
    },
    set() {
      return this;
    },
    redirect(_code: number, url: string) {
      recorded.status = 307;
      recorded.redirectedTo = url;
      return this;
    },
  } as unknown as Response;
  return { res, recorded };
}

const request = (token: string, key: string) =>
  ({ params: { token, 0: key } }) as unknown as Request;

describe("serving a stored file", () => {
  /**
   * Clearing the token check is visible as "tried to reach storage".
   *
   * 500 is the local answer, because there is no Forge configuration outside
   * deployed infrastructure. What matters is that it is not 403.
   */
  const REACHED_STORAGE = 500;

  it("lets a valid token through to storage", async () => {
    const handler = proxyHandler();
    const { res, recorded } = fakeResponse();
    await handler(request(mintStorageToken(KEY, new Date()), KEY), res);
    expect(recorded.status).toBe(REACHED_STORAGE);
  });

  it("refuses a token minted for a different key", async () => {
    // The attack the signature exists to stop: hold one valid URL, edit the
    // path, read somebody else's plan.
    const handler = proxyHandler();
    const { res, recorded } = fakeResponse();
    await handler(
      request(
        mintStorageToken(KEY, new Date()),
        "bid-plans/9/1/Someone Elses Plans_deadbeef.pdf"
      ),
      res
    );
    expect(recorded.status).toBe(403);
  });

  it("refuses an expired token", async () => {
    const handler = proxyHandler();
    const { res, recorded } = fakeResponse();
    // Minted against a clock far enough back that its window has closed.
    const stale = mintStorageToken(KEY, new Date(NOW.getTime() - 86_400_000));
    await handler(request(stale, KEY), res);
    expect(recorded.status).toBe(403);
    expect(String(recorded.body)).toMatch(/not valid|expired/i);
  });

  it("refuses a pre-token URL, rather than serving it", async () => {
    /**
     * The regression that matters most. A key always has at least two
     * segments, so an old `/manus-storage/bid-plans/1/42/E1.pdf` still matches
     * this route with "bid-plans" read as the token. It must fail — if this
     * ever returns anything but 403, every previously issued link is a working
     * unauthenticated URL again.
     */
    const handler = proxyHandler();
    const { res, recorded } = fakeResponse();
    await handler(request("bid-plans", "1/42/E1.pdf"), res);
    expect(recorded.status).toBe(403);
  });

  it("refuses a forged expiry", async () => {
    const handler = proxyHandler();
    const { res, recorded } = fakeResponse();
    const real = mintStorageToken(KEY, new Date());
    const sig = real.slice(real.indexOf(".") + 1);
    const far = storageTokenExpiry(new Date()) + 365 * 24 * 60 * 60 * 1000;
    await handler(request(`${far}.${sig}`, KEY), res);
    expect(recorded.status).toBe(403);
  });

  it("asks for a key before anything else", async () => {
    const handler = proxyHandler();
    const { res, recorded } = fakeResponse();
    await handler(request(mintStorageToken(KEY, new Date()), ""), res);
    expect(recorded.status).toBe(400);
  });

  it("never contacts storage for a caller it refused", async () => {
    // The ordering, stated as its own assertion: a refusal is answered without
    // the storage backend being consulted, so an unauthorised caller cannot
    // make this server do work or probe which keys exist.
    const handler = proxyHandler();
    const { res, recorded } = fakeResponse();
    await handler(request("not-a-token", KEY), res);
    expect(recorded.status).toBe(403);
    expect(recorded.status).not.toBe(REACHED_STORAGE);
    expect(recorded.redirectedTo).toBeUndefined();
  });
});
