/**
 * The build stamp's words.
 *
 * ── What these are defending ─────────────────────────────────────────────────
 * This is the label a deploy is confirmed against, so the failure that matters
 * is not an ugly string — it is a label that looks like a pass when nothing
 * shipped. Two of those are possible and both are tested here: a missing stamp
 * must never render as something that could be mistaken for a build, and a
 * stamp that cannot be parsed must say so rather than falling back to "dev",
 * which on a production sidebar reads as "nothing is deployed".
 */
import { describe, it, expect } from "vitest";
import {
  buildAgeLabel,
  buildStampLabel,
  DEV_BUILD_LABEL,
} from "@shared/buildStamp";

const at = (iso: string) => new Date(iso);

describe("buildStampLabel", () => {
  it("names the commit and the time, in UTC, with the date", () => {
    expect(
      buildStampLabel({
        builtAt: "2026-09-18T14:22:09.000Z",
        commit: "4f2a91c",
      })
    ).toBe("4f2a91c · 18 Sep 14:22 UTC");
  });

  it("drops the commit cleanly when git could not answer", () => {
    // No leading separator left behind — the build writes "" for an absent SHA.
    expect(
      buildStampLabel({ builtAt: "2026-09-18T14:22:09.000Z", commit: null })
    ).toBe("18 Sep 14:22 UTC");
  });

  it("says it is running from source rather than inventing a build", () => {
    expect(buildStampLabel({ builtAt: null, commit: null })).toBe(
      DEV_BUILD_LABEL
    );
  });

  it("reports an unreadable stamp as unreadable, never as dev", () => {
    // "dev" on a deployed sidebar would be read as "the deploy did not take",
    // which is a different and much more alarming thing than a broken string.
    const label = buildStampLabel({ builtAt: "not a date", commit: "4f2a91c" });
    expect(label).toContain("unreadable");
    expect(label).not.toBe(DEV_BUILD_LABEL);
  });
});

describe("buildAgeLabel — the question a deploy check is actually asking", () => {
  const stamp = { builtAt: "2026-09-18T14:00:00.000Z", commit: "4f2a91c" };

  it("counts minutes, then hours, then days", () => {
    expect(buildAgeLabel(stamp, at("2026-09-18T14:00:30.000Z"))).toBe(
      "less than a minute ago"
    );
    expect(buildAgeLabel(stamp, at("2026-09-18T14:01:00.000Z"))).toBe(
      "1 minute ago"
    );
    expect(buildAgeLabel(stamp, at("2026-09-18T14:04:00.000Z"))).toBe(
      "4 minutes ago"
    );
    expect(buildAgeLabel(stamp, at("2026-09-18T15:30:00.000Z"))).toBe(
      "1 hour ago"
    );
    expect(buildAgeLabel(stamp, at("2026-09-19T20:00:00.000Z"))).toBe(
      "1 day ago"
    );
    expect(buildAgeLabel(stamp, at("2026-09-21T14:00:00.000Z"))).toBe(
      "3 days ago"
    );
  });

  it("says so rather than showing a negative age when clocks disagree", () => {
    expect(buildAgeLabel(stamp, at("2026-09-18T13:50:00.000Z"))).toBe(
      "in the future — check the clocks"
    );
  });

  it("has no age to give when running from source", () => {
    expect(
      buildAgeLabel({ builtAt: null, commit: null }, new Date())
    ).toBeNull();
  });
});
