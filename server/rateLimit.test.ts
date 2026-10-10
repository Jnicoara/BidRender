/**
 * server/rateLimit.ts — shared by the early-access form and the password
 * reset forms since 2026-09-29. The clock is a parameter, so an hour's window
 * is tested without waiting an hour.
 */
import { describe, expect, it } from "vitest";
import {
  clientKey,
  createFailureLimiter,
  createRateLimiter,
} from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows max hits per window, refuses the next, and forgets after the window", () => {
    const over = createRateLimiter({ windowMs: 1000, max: 3 });
    expect([0, 1, 2].map(t => over("a", t))).toEqual([false, false, false]);
    expect(over("a", 3)).toBe(true);
    // Another key has its own count.
    expect(over("b", 3)).toBe(false);
    // Past the window, "a" starts again.
    expect(over("a", 1001)).toBe(false);
  });

  it("keeps separate limiters separate", () => {
    const one = createRateLimiter({ windowMs: 1000, max: 1 });
    const two = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(one("k", 0)).toBe(false);
    expect(one("k", 1)).toBe(true);
    expect(two("k", 1)).toBe(false);
  });
});

describe("clientKey", () => {
  it("takes the first forwarded address, then the socket address", () => {
    expect(
      clientKey({ headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } })
    ).toBe("1.2.3.4");
    expect(clientKey({ ip: "5.6.7.8", headers: {} })).toBe("5.6.7.8");
    expect(clientKey({ headers: {} })).toBe("unknown");
  });
});

describe("createFailureLimiter", () => {
  it("refuses after max failures, even before an attempt, until the window ends", () => {
    const limiter = createFailureLimiter({ windowMs: 1000, max: 3 });
    expect(limiter.blockedFor("a", 0)).toBe(0);
    expect([0, 1, 2].map(t => limiter.fail("a", t))).toEqual([
      false,
      false,
      true,
    ]);
    // The wait runs from the FIRST failure's window.
    expect(limiter.blockedFor("a", 400)).toBe(600);
    expect(limiter.blockedFor("b", 400)).toBe(0);
    expect(limiter.blockedFor("a", 1001)).toBe(0);
  });

  it("counts only failures, and clear forgets them", () => {
    const limiter = createFailureLimiter({ windowMs: 1000, max: 2 });
    limiter.fail("a", 0);
    // Asking is free: a hundred checks are not a failure.
    for (let t = 0; t < 100; t++) expect(limiter.blockedFor("a", t)).toBe(0);
    limiter.clear("a");
    expect(limiter.fail("a", 200)).toBe(false);
    expect(limiter.blockedFor("a", 200)).toBe(0);
  });
});
