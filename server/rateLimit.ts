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

/**
 * Best-effort client identity for a limiter. Never stored.
 *
 * ── Where the address comes from: `CLIENT_IP_FROM` (A-S12, 2026-10-15) ───────
 * Unset (or `first-forwarded`): the FIRST `X-Forwarded-For` entry — today's
 * behaviour, unchanged. That entry is whatever the CLIENT wrote, so a script
 * sending a fresh value per request dodges every per-sender limit (Track C's
 * security sweep, A-S12). Per-address limits and sign-up's overall ceiling
 * still hold.
 *
 * The fix depends on what sits in front of the app, which nobody has looked
 * at yet on a live request:
 *   `last-forwarded` — the LAST entry, i.e. the one our own front proxy
 *                      appended. Right only if exactly one proxy we trust
 *                      appends to the header; behind TWO (Cloudflare in front
 *                      of DigitalOcean) the last entry is the inner proxy, and
 *                      every visitor would share one key.
 *   `header:<name>`  — a header the platform sets and overwrites itself
 *                      (for example `header:do-connecting-ip`, if
 *                      DigitalOcean sends it).
 * Choose after reading one live request's headers (references/
 * security-parked-a.md). An unknown value falls back to the default rather
 * than refusing to start — a typo must not lock sign-in.
 */
export function clientKey(
  req: {
    ip?: string;
    headers: Record<string, unknown>;
  },
  source: string | undefined = process.env.CLIENT_IP_FROM
): string {
  const one = (value: unknown): string | undefined =>
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.map(String).join(",")
        : undefined;
  if (source?.startsWith("header:")) {
    const named = one(req.headers[source.slice("header:".length).toLowerCase()])
      ?.split(",")[0]
      ?.trim();
    return named || req.ip || "unknown";
  }
  const entries = (one(req.headers["x-forwarded-for"]) ?? "")
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);
  const picked =
    source === "last-forwarded" ? entries[entries.length - 1] : entries[0];
  return picked || req.ip || "unknown";
}
