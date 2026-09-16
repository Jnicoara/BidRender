/**
 * The daily allowance, and the sentence someone reads at the end of it.
 *
 * ── What the limit is actually for ───────────────────────────────────────────
 * Not fair use. A loop — a retry that retries, a component re-reading on every
 * render — spends a thousand calls in a minute, at night, and nobody finds out
 * until the invoice. The numbers below are set to clear the heaviest genuine
 * day and still stop that within about a minute.
 *
 * Which is why the generous-side cases are asserted as carefully as the
 * refusals: a limit that gets in the way of real work is one people route
 * around, and then it protects nothing.
 */
import { describe, it, expect } from "vitest";
import {
  DAILY_LIMITS,
  FEATURE_GROUP,
  checkDailyLimit,
  usageDay,
  type AiFeature,
} from "../shared/aiLimits";

describe("which allowance a call spends", () => {
  it("puts reading a sheet and asking about one on the same budget", () => {
    // They cost about the same and serve the same task, so one number covers
    // both rather than two that each have to be guessed at.
    expect(FEATURE_GROUP["plan-read"]).toBe("plan-reader");
    expect(FEATURE_GROUP["plan-ask"]).toBe("plan-reader");
  });

  it("keeps the cheap features on their own, much looser budget", () => {
    // A fortieth of the cost. One shared allowance would have to be set for
    // the expensive case and would then be absurdly tight for these.
    expect(FEATURE_GROUP.navigation).toBe("assistant");
    expect(FEATURE_GROUP["material-aliases"]).toBe("assistant");
    expect(DAILY_LIMITS.assistant).toBeGreaterThan(DAILY_LIMITS["plan-reader"]);
  });

  it("has a group for every feature", () => {
    // A feature added without a group would land on `undefined`, and
    // `limits[undefined]` is NaN — which compares false against everything, so
    // the limit would silently never trigger.
    const features: AiFeature[] = [
      "plan-read",
      "plan-ask",
      "navigation",
      "material-aliases",
    ];
    for (const f of features) {
      expect(FEATURE_GROUP[f], f).toBeTruthy();
      expect(DAILY_LIMITS[FEATURE_GROUP[f]]).toBeGreaterThan(0);
    }
  });
});

describe("clearing a real day of work", () => {
  /**
   * The bar the limit has to clear. A 60-sheet set read end to end is 60
   * calls; two large sets in a day is 120; follow-up questions and re-reads
   * after corrections push it toward 150.
   */
  it("lets someone read two large sets in one day", () => {
    expect(checkDailyLimit("plan-read", 120).allowed).toBe(true);
  });

  it("counts down so the remaining figure is usable", () => {
    const check = checkDailyLimit("plan-read", 100);
    expect(check.allowed).toBe(true);
    if (!check.allowed) return;
    expect(check.remaining).toBe(DAILY_LIMITS["plan-reader"] - 100);
  });

  it("allows the very last call, not one fewer", () => {
    // An off-by-one here silently shortens the allowance by one sheet.
    const last = DAILY_LIMITS["plan-reader"] - 1;
    expect(checkDailyLimit("plan-read", last).allowed).toBe(true);
    expect(checkDailyLimit("plan-read", last + 1).allowed).toBe(false);
  });
});

describe("what someone is told at the end of it", () => {
  const refusal = checkDailyLimit("plan-read", DAILY_LIMITS["plan-reader"]);

  it("refuses once the allowance is gone", () => {
    expect(refusal.allowed).toBe(false);
  });

  it("names the number, so it is checkable", () => {
    if (refusal.allowed) throw new Error("expected a refusal");
    expect(refusal.message).toContain(String(DAILY_LIMITS["plan-reader"]));
  });

  it("says when it comes back", () => {
    if (refusal.allowed) throw new Error("expected a refusal");
    expect(refusal.message).toMatch(/resets/i);
  });

  /**
   * The part that matters most. A limit message that reads as "the app is
   * broken" costs more in trust and support than the calls it saved, so it has
   * to say what still works — and for this app that is everything, because the
   * plan reader was only ever a shortcut past counting by hand.
   */
  it("says what still works", () => {
    if (refusal.allowed) throw new Error("expected a refusal");
    expect(refusal.message).toMatch(/still|normal|nothing else/i);
  });

  it("does not blame the user", () => {
    if (refusal.allowed) throw new Error("expected a refusal");
    expect(refusal.message).not.toMatch(
      /too many|excessive|abuse|slow down|limit exceeded/i
    );
  });

  it("gives the assistant its own wording", () => {
    const other = checkDailyLimit("navigation", DAILY_LIMITS.assistant);
    if (other.allowed) throw new Error("expected a refusal");
    expect(other.message).toMatch(/help assistant/i);
    expect(other.message).not.toMatch(/sheets/i);
  });
});

describe("which day a call counts against", () => {
  it("is the UTC date", () => {
    expect(usageDay(new Date("2026-09-16T23:59:59Z"))).toBe("2026-09-16");
    expect(usageDay(new Date("2026-09-17T00:00:01Z"))).toBe("2026-09-17");
  });

  it("does not shift with the machine's timezone", () => {
    // The counter is stored, so its meaning cannot depend on where the server
    // happens to be running, or it would change under a redeploy.
    expect(usageDay(new Date("2026-09-17T07:30:00Z"))).toBe("2026-09-17");
  });
});
