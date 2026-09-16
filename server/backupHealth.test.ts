/**
 * Noticing that the backups have stopped.
 *
 * ── The failure this exists to catch ─────────────────────────────────────────
 * Not "the backup failed" — that one announces itself. The one that matters is
 * a schedule that was never registered, or that quietly stopped: nothing fails,
 * so nothing is reported, and the backups simply end. Months later somebody
 * needs one.
 *
 * So the question is "when did a backup last actually succeed?", which has the
 * same answer for a failed run, a cron that never fired, a deleted schedule and
 * an unreachable bucket — correctly, because they have the same consequence.
 */
import { describe, it, expect } from "vitest";
import {
  BACKUP_STALE_AFTER_MS,
  allRunIds,
  assessBackupHealth,
  runIdTime,
} from "./backup/history";

const NOW = new Date("2026-09-20T09:00:00Z");
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-");

describe("reading the time out of a run id", () => {
  it("understands the id the backup writes", () => {
    expect(runIdTime("2026-08-14T02-00-05Z")?.toISOString()).toBe(
      "2026-08-14T02:00:05.000Z"
    );
  });

  it("returns nothing for something that is not a run id", () => {
    for (const junk of ["", "manifest.json", "2026-08-14", "not-a-run"]) {
      expect(runIdTime(junk)).toBeNull();
    }
  });
});

describe("picking runs out of a bucket listing", () => {
  it("finds run ids from their manifests, newest first", () => {
    expect(
      allRunIds([
        "2026-08-14T02-00-05Z/manifest.json",
        "2026-08-14T02-00-05Z/tables/bids.json",
        "2026-08-15T02-00-01Z/manifest.json",
      ])
    ).toEqual(["2026-08-15T02-00-01Z", "2026-08-14T02-00-05Z"]);
  });

  it("ignores anything that is not a run's manifest", () => {
    expect(allRunIds(["notes.txt", "a/b/manifest.json"])).toEqual([]);
  });
});

describe("deciding whether to say something", () => {
  it("stays quiet after last night's backup", () => {
    const health = assessBackupHealth([hoursAgo(7)], NOW);
    expect(health.stale).toBe(false);
    expect(health.message).toBeNull();
  });

  /**
   * One missed night is one retry away, and a warning that fires on it is a
   * warning people learn to scroll past. Two consecutive misses is a pattern.
   */
  it("stays quiet after a single missed night", () => {
    expect(assessBackupHealth([hoursAgo(31)], NOW).stale).toBe(false);
  });

  it("speaks up after two days of nothing", () => {
    const health = assessBackupHealth([hoursAgo(50)], NOW);
    expect(health.stale).toBe(true);
    expect(health.message).toMatch(/2 days ago/);
  });

  it("switches at the threshold, not before it", () => {
    const justInside = new Date(NOW.getTime() - BACKUP_STALE_AFTER_MS + 1000);
    const justOutside = new Date(NOW.getTime() - BACKUP_STALE_AFTER_MS - 1000);
    const idFor = (d: Date) =>
      d
        .toISOString()
        .replace(/\.\d+Z$/, "Z")
        .replace(/:/g, "-");
    expect(assessBackupHealth([idFor(justInside)], NOW).stale).toBe(false);
    expect(assessBackupHealth([idFor(justOutside)], NOW).stale).toBe(true);
  });

  /**
   * The worst case, and the one a failure-reporting design cannot see at all:
   * a bucket that has never received a good backup. Nothing failed, because
   * nothing ever ran.
   */
  it("says so when no backup has ever worked", () => {
    const health = assessBackupHealth([], NOW);
    expect(health.stale).toBe(true);
    expect(health.lastGoodAt).toBeNull();
    expect(health.message).toMatch(/never|nothing is being saved/i);
  });

  it("goes by the newest run, whatever order they arrive in", () => {
    const health = assessBackupHealth(
      [hoursAgo(90), hoursAgo(5), hoursAgo(50)],
      NOW
    );
    expect(health.stale).toBe(false);
  });

  it("ignores ids it cannot read a time out of", () => {
    expect(assessBackupHealth(["rubbish", hoursAgo(5)], NOW).stale).toBe(false);
    expect(assessBackupHealth(["rubbish"], NOW).stale).toBe(true);
  });

  it("reports the run it judged, so the message can be checked", () => {
    const id = hoursAgo(5);
    expect(assessBackupHealth([id], NOW).lastGoodRunId).toBe(id);
  });
});
