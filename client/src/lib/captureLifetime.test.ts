/**
 * client/src/lib/captureLifetime.ts — "Name this symbol" goes when the person
 * picks up another tool or changes sheet (touch check, 2026-10-15).
 */
import { describe, expect, it } from "vitest";
import { captureOutlived } from "./captureLifetime";

const idle = { tracing: false, countArmed: false, sheetId: 7 };

describe("when a waiting capture is dropped", () => {
  it("stays while the person is still on its sheet with no other tool", () => {
    expect(captureOutlived({ sheetId: 7 }, idle)).toBe(false);
    expect(captureOutlived(null, { ...idle, tracing: true })).toBe(false);
  });

  it("goes when a trace starts or a count is picked up", () => {
    expect(captureOutlived({ sheetId: 7 }, { ...idle, tracing: true })).toBe(
      true
    );
    expect(captureOutlived({ sheetId: 7 }, { ...idle, countArmed: true })).toBe(
      true
    );
  });

  it("goes when the sheet it was boxed on is no longer the one shown", () => {
    expect(captureOutlived({ sheetId: 7 }, { ...idle, sheetId: 8 })).toBe(true);
    // A box on a sheet with no row yet has nothing to compare: it stays.
    expect(
      captureOutlived({ sheetId: undefined }, { ...idle, sheetId: 8 })
    ).toBe(false);
  });
});
