/**
 * shared/sessionValidity.ts — when a session token still counts.
 *
 * The four cases are the whole rule. The two that matter most are the ones
 * that are easy to write backwards: a token with no issue time is FINE until a
 * reset happens, and REFUSED after one.
 */
import { describe, expect, it } from "vitest";
import { sessionCutoff, sessionStillValid } from "../shared/sessionValidity";

const at = (iso: string) => new Date(iso);
const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("sessionStillValid", () => {
  it("accepts every token while nothing has been reset", () => {
    expect(sessionStillValid(seconds("2026-01-01T00:00:00Z"), null)).toBe(true);
    // Signed before issue times existed: still fine — signing everybody out
    // for nothing is the wrong kind of safe.
    expect(sessionStillValid(null, null)).toBe(true);
  });

  it("refuses a token issued before the cutoff, and one with no issue time", () => {
    const cutoff = at("2026-09-29T20:00:00Z");
    expect(sessionStillValid(seconds("2026-09-29T19:59:59Z"), cutoff)).toBe(
      false
    );
    expect(sessionStillValid(null, cutoff)).toBe(false);
  });

  it("accepts a token issued at or after the cutoff", () => {
    const cutoff = at("2026-09-29T20:00:00Z");
    expect(sessionStillValid(seconds("2026-09-29T20:00:00Z"), cutoff)).toBe(
      true
    );
    expect(sessionStillValid(seconds("2026-09-29T20:00:01Z"), cutoff)).toBe(
      true
    );
  });

  it("lets the fresh session from the same second through", () => {
    // A password change at 20:00:00.750 issues this device a new token in the
    // same second; its iat is 20:00:00, and it must pass.
    const cutoff = sessionCutoff(at("2026-09-29T20:00:00.750Z"));
    expect(cutoff.toISOString()).toBe("2026-09-29T20:00:00.000Z");
    expect(sessionStillValid(seconds("2026-09-29T20:00:00.900Z"), cutoff)).toBe(
      true
    );
  });
});
