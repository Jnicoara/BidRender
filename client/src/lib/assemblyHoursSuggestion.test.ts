/**
 * A NEW assembly's hours start NOT SET; the suggestion is only an offer
 * (owner, 2026-10-06) — client/src/lib/assemblyHoursSuggestion.ts.
 *
 * The editor used to open with the suggestion already in the box and
 * re-wrote it on every name change, so a save without looking stored a
 * figure nobody chose. Each case below goes red if that comes back.
 */
import { describe, it, expect } from "vitest";
import {
  hoursOffer,
  hoursToSave,
  newAssemblyHoursDraft,
  suggestedHoursDraft,
} from "./assemblyHoursSuggestion";
import { defaultLaborHoursFor } from "@shared/laborHourDefaults";

describe("a new assembly's hours", () => {
  it("open EMPTY — not set, not the suggestion", () => {
    expect(newAssemblyHoursDraft()).toBe("");
    expect(hoursToSave(newAssemblyHoursDraft())).toBeNull();
    expect(newAssemblyHoursDraft()).not.toBe(
      String(defaultLaborHoursFor("").hours)
    );
  });

  it("save as NOT SET when the box was left alone, whatever the name suggests", () => {
    const offer = hoursOffer("GFCI receptacle", "");
    expect(offer.canUse).toBe(true);
    // The suggestion exists…
    expect(offer.suggestion.hours).toBeGreaterThan(0);
    // …and is not what gets saved.
    expect(hoursToSave("")).toBeNull();
  });

  it("take the suggestion only through 'Use suggested'", () => {
    const offer = hoursOffer("GFCI receptacle", "");
    const filled = suggestedHoursDraft(offer);
    expect(filled).toBe(String(defaultLaborHoursFor("GFCI receptacle").hours));
    expect(hoursToSave(filled)).toBe(
      defaultLaborHoursFor("GFCI receptacle").hours
    );
    // Once used, the button has nothing left to do.
    expect(hoursOffer("GFCI receptacle", filled).canUse).toBe(false);
  });

  it("keep what the user typed — a typed 0 is an answer, not 'not set'", () => {
    expect(hoursToSave("0")).toBe(0);
    expect(hoursToSave("1.25")).toBe(1.25);
    expect(hoursOffer("GFCI receptacle", "1.25").canUse).toBe(true);
  });
});
