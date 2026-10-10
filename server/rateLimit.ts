/**
 * A fixed-window counter: at most `max` hits per key per `windowMs`.
 *
 * Moved here from `earlyAccessRouter.ts` when the password-reset form needed
 * the same thing, so there is one limiter rather than two that drift.
 *
 * ── Honest about what this is ───────────────────────────────────────────────
 * In-memory, so it is per instance, and a counter resets whenever an instance
 * is recycled — a determined script spread across time gets through. That is
 * accepted: the realistic threat to a public form is a bored bot hammering it,
 * which this stops completely, not a targeted attacker, whom nothing at this
 * layer would stop anyway. Each caller names its real backstop next to where
 * it uses this.
 *
 * `now` is a parameter so a window can be tested without waiting for it.
 */
export function createRateLimiter(options: { windowMs: number; max: number }) {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return function overLimit(key: string, now: number): boolean {
    const entry = attempts.get(key);
    if (!entry || now > entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + options.windowMs });
      // Opportunistic sweep, so the map cannot grow without bound on a
      // long-running instance. Cheap: it only walks on a fresh key.
      if (attempts.size > 5000) {
        attempts.forEach((value, existing) => {
          if (now > value.resetAt) attempts.delete(existing);
        });
      }
      return false;
    }
    entry.count += 1;
    return entry.count > options.max;
  };
}

/**
 * Counts FAILURES only, and is asked before the attempt, so a key that has
 * failed `max` times inside `windowMs` is refused even with the right answer —
 * until the window that began with its first failure ends. Sign-in uses it
 * (2026-10-09): a wrong password counts, a right one costs nothing, which
 * `createRateLimiter` cannot express because every call to it is a hit.
 *
 * Same honesty note as above: in-memory, per instance.
 */
export function createFailureLimiter(options: {
  windowMs: number;
  max: number;
}) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Milliseconds until `key` may try again; 0 when it may try now. */
    blockedFor(key: string, now: number): number {
      const entry = failures.get(key);
      if (!entry || now > entry.resetAt) return 0;
      return entry.count >= options.max ? entry.resetAt - now : 0;
    },
    /** Record one failure. True when this one reached the limit. */
    fail(key: string, now: number): boolean {
      const entry = failures.get(key);
      if (!entry || now > entry.resetAt) {
        failures.set(key, { count: 1, resetAt: now + options.windowMs });
        if (failures.size > 5000) {
          failures.forEach((value, existing) => {
            if (now > value.resetAt) failures.delete(existing);
          });
        }
        return options.max <= 1;
      }
      entry.count += 1;
      return entry.count === options.max;
    },
    /** Forget `key`'s failures (a right answer for that key). */
    clear(key: string): void {
      failures.delete(key);
    },
  };
}

/** Best-effort client identity for a limiter. Never stored. */
export function clientKey(req: {
  ip?: string;
  headers: Record<string, unknown>;
}): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : Array.isArray(forwarded)
        ? String(forwarded[0])
        : undefined;
  return first || req.ip || "unknown";
}
