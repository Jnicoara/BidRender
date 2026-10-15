/**
 * client/src/lib/markRetry.ts — marks that could not be sent are retried on
 * their own; a server's refusal is not (failure drill, 2026-10-15).
 */
import { describe, expect, it } from "vitest";
import {
  isNetworkFailure,
  markRetryDelay,
  unsavedMarksMessage,
} from "./markRetry";

describe("which failures are worth sending again", () => {
  it("a dropped connection is", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(
      isNetworkFailure({
        message: "NetworkError when attempting to fetch resource.",
      })
    ).toBe(true);
    expect(isNetworkFailure({ message: "Load failed", data: null })).toBe(true);
  });

  it("an answer from the server is not — it said no, and it will say no again", () => {
    expect(
      isNetworkFailure({
        message: "This bid's quantities are locked",
        data: { code: "BAD_REQUEST" },
      })
    ).toBe(false);
    expect(
      isNetworkFailure({
        message: "Failed to fetch",
        data: { code: "NOT_FOUND" },
      })
    ).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
    expect(isNetworkFailure({ message: "Count not found" })).toBe(false);
  });
});

describe("how often", () => {
  it("backs off to every 30 s, never a tight loop", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(markRetryDelay)).toEqual([
      2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });
});

describe("what it says while they wait", () => {
  it("names the count, says they are kept, and what not to do", () => {
    expect(unsavedMarksMessage(1)).toMatch(/^1 mark is not saved yet/);
    expect(unsavedMarksMessage(10)).toMatch(/^10 marks are not saved yet/);
    expect(unsavedMarksMessage(10)).toMatch(/kept on this device/);
  });
});
