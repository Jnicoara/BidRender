/**
 * The speed and time-left an estimator reads while a plan set goes up.
 *
 * ── Why these numbers are worth pinning ──────────────────────────────────────
 * They are what someone uses to decide whether to keep waiting. A figure that
 * is stale, or that keeps reporting the speed of five minutes ago after the
 * connection has died, does not merely look wrong — it is the reason a healthy
 * upload gets cancelled at 80%, or a dead one is waited on for ten minutes.
 *
 * Every case below is a list of numbers, because the whole module was written
 * to take its readings as arguments rather than read a clock.
 */
import { describe, it, expect } from "vitest";
import {
  SPEED_WINDOW_MS,
  STALL_HINT_MS,
  bytesPerSecond,
  looksStalled,
  formatSpeed,
  formatTimeRemaining,
  secondsRemaining,
  trimSamples,
} from "@shared/uploadSpeed";

const MB = 1024 * 1024;

describe("measuring speed", () => {
  it("says nothing until there is something to measure", () => {
    // Not zero: 0 B/s is a stopped upload, and showing that in the first
    // half-second of a healthy one is what makes people cancel.
    expect(bytesPerSecond([])).toBeNull();
    expect(bytesPerSecond([{ at: 0, bytes: 0 }])).toBeNull();
  });

  it("divides the bytes moved by the time taken", () => {
    expect(
      bytesPerSecond([
        { at: 0, bytes: 0 },
        { at: 2000, bytes: 20 * MB },
      ])
    ).toBe(10 * MB);
  });

  /**
   * The behaviour a running total cannot produce: when the connection dies,
   * the figure has to fall. A whole-run average would keep reporting the
   * speed of the healthy minutes for a long time afterwards.
   */
  it("falls to zero when nothing is moving", () => {
    expect(
      bytesPerSecond([
        { at: 0, bytes: 10 * MB },
        { at: 4000, bytes: 10 * MB },
      ])
    ).toBe(0);
  });

  it("reports the recent rate, not the average since the start", () => {
    // Crawled for a long time, then sped up. The figure should describe now.
    const samples = [
      { at: 60_000, bytes: 10 * MB },
      { at: 62_000, bytes: 30 * MB },
    ];
    expect(bytesPerSecond(samples)).toBe(10 * MB);
  });

  it("never reports a negative speed", () => {
    // A resumed upload can restate a lower total for a moment.
    expect(
      bytesPerSecond([
        { at: 0, bytes: 30 * MB },
        { at: 1000, bytes: 10 * MB },
      ])
    ).toBe(0);
  });

  it("says nothing when two readings share a moment", () => {
    expect(
      bytesPerSecond([
        { at: 1000, bytes: 0 },
        { at: 1000, bytes: 5 * MB },
      ])
    ).toBeNull();
  });
});

describe("keeping only recent readings", () => {
  const samples = [
    { at: 0, bytes: 0 },
    { at: 2000, bytes: 10 * MB },
    { at: 4000, bytes: 20 * MB },
    { at: 6000, bytes: 30 * MB },
  ];

  it("drops what has fallen out of the window", () => {
    const kept = trimSamples(samples, 9000, SPEED_WINDOW_MS);
    expect(kept.map(s => s.at)).toEqual([2000, 4000, 6000]);
  });

  /**
   * One sample from before the window is deliberately kept — it is the far end
   * of the measurement. Without it, a quiet spell would leave a single reading
   * and the speed would read as UNKNOWN at exactly the moment it should read
   * as slow.
   */
  it("keeps one reading from before the window, so there is still a span", () => {
    const kept = trimSamples(samples, 11_000, SPEED_WINDOW_MS);
    expect(kept.length).toBeGreaterThanOrEqual(2);
    expect(bytesPerSecond(kept)).not.toBeNull();
  });

  it("leaves everything alone when it is all recent", () => {
    expect(trimSamples(samples, 6000, SPEED_WINDOW_MS)).toHaveLength(4);
  });

  it("copes with nothing recorded yet", () => {
    expect(trimSamples([], 1000)).toEqual([]);
  });
});

describe("how long is left", () => {
  it("divides what is left by the current speed", () => {
    expect(secondsRemaining(10 * MB, 50 * MB, 150 * MB)).toBe(10);
  });

  /**
   * No estimate rather than a wrong one. An upload moving at nothing has no
   * finish time, and "Infinity" or "about 5000 hours" on screen is worse than
   * the row simply saying it is paused.
   */
  it("gives no answer when nothing is moving", () => {
    expect(secondsRemaining(0, 50 * MB, 150 * MB)).toBeNull();
    expect(secondsRemaining(null, 50 * MB, 150 * MB)).toBeNull();
  });

  it("is zero once everything has been sent", () => {
    expect(secondsRemaining(10 * MB, 150 * MB, 150 * MB)).toBe(0);
  });
});

describe("how it reads on screen", () => {
  it("prints a speed in the unit that suits it", () => {
    expect(formatSpeed(8.4 * MB)).toBe("8.4 MB/s");
    expect(formatSpeed(400 * 1024)).toBe("400 KB/s");
    expect(formatSpeed(90)).toBe("90 B/s");
  });

  it("prints nothing rather than a zero it does not know", () => {
    expect(formatSpeed(null)).toBe("");
  });

  /**
   * Rounded up, and vaguely. A countdown to the second invites watching and is
   * always wrong; rounding down produces the bar that sits at "1 second
   * remaining" for a minute.
   */
  it("rounds time up and keeps the language loose", () => {
    expect(formatTimeRemaining(5)).toBe("almost done");
    expect(formatTimeRemaining(42)).toBe("about 50 seconds");
    expect(formatTimeRemaining(75)).toBe("about a minute");
    expect(formatTimeRemaining(200)).toBe("about 4 minutes");
  });

  it("switches to hours for a very large set on a slow line", () => {
    expect(formatTimeRemaining(3600)).toBe("about 1 hour");
    expect(formatTimeRemaining(5400)).toBe("about 1h 30m");
  });

  it("prints nothing when there is no estimate", () => {
    expect(formatTimeRemaining(null)).toBe("");
  });
});

describe("noticing that nothing is moving", () => {
  /**
   * Why this exists at all: `navigator.onLine` is far too slow to be the only
   * signal. Windows can take most of a minute to admit a Wi-Fi connection has
   * gone, and until it does the browser insists it is online while every byte
   * goes nowhere. What the estimator sees in that gap is a live-looking yellow
   * bar that has stopped — indistinguishable from the app having hung.
   */
  it("says nothing during a healthy upload", () => {
    expect(looksStalled(1000, 1000 + 3000)).toBe(false);
  });

  it("speaks up after ten seconds of complete silence", () => {
    expect(looksStalled(1000, 1000 + STALL_HINT_MS)).toBe(true);
    expect(looksStalled(1000, 1000 + 30_000)).toBe(true);
  });

  /**
   * A piece is 16MB, and on a slow connection one legitimately takes a while
   * to produce its first progress event. Shorter than ten seconds and the row
   * would cry wolf on exactly the connections this is meant to help.
   */
  it("holds its tongue just before the threshold", () => {
    expect(looksStalled(1000, 1000 + STALL_HINT_MS - 1)).toBe(false);
  });

  it("is ten seconds", () => {
    expect(STALL_HINT_MS).toBe(10_000);
  });
});
