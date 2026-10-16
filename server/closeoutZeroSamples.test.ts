/**
 * A close-out line at 0 actual hours is not evidence (break-it, 2026-10-15).
 *
 * Until that night the close-out form recorded every line LEFT BLANK as 0
 * hours, so saved data holds zeros nobody meant. Three of them made the
 * hour suggestion offer to set the assembly to 0 h — which "apply" writes.
 * Red before the fix: the suggestion came back at 0.
 */
import { describe, expect, it } from "vitest";
import { suggestHours } from "../shared/closeout";

describe("suggestHours and 0-hour close-out lines", () => {
  it("never learns from a 0, so three blank lines suggest nothing", () => {
    const blanks = [1, 2, 3].map(() => ({ estimatedHours: 4, actualHours: 0 }));
    expect(suggestHours(1, blanks)).toBe(null);
  });

  it("still learns from the real samples beside them", () => {
    const samples = [
      { estimatedHours: 4, actualHours: 6 },
      { estimatedHours: 4, actualHours: 6 },
      { estimatedHours: 4, actualHours: 6 },
      { estimatedHours: 4, actualHours: 0 },
    ];
    const s = suggestHours(1, samples);
    expect(s?.sampleSize).toBe(3);
    expect(s?.suggestedHours).toBe(1.5);
  });
});
