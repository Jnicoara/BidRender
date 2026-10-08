import { describe, expect, it } from "vitest";
import { runEndWords } from "./runEndWords";
import { DISTRIBUTION_KIND, type EndVertical } from "@shared/takeoffHeights";

const notCounted = (
  reason: EndVertical extends infer V
    ? V extends { counted: false; reason: infer R }
      ? R
      : never
    : never
): EndVertical => ({ counted: false, kind: "receptacle", reason });

const words = (
  vertical: EndVertical | null,
  over: Partial<Parameters<typeof runEndWords>[0]> = {}
) =>
  runEndWords({
    vertical,
    kind: "receptacle",
    onTee: false,
    runsAt: "ceiling",
    ...over,
  });

describe("what a run end says in the Run ends list", () => {
  it("a box-to-box end is an answer: grey, and says box to box", () => {
    // Seen on screen 2026-10-07: amber "no height for this type" under a
    // receptacle end whose type HAS a height, because the run is box to box.
    expect(words(notCounted("level"), { runsAt: "boxToBox" })).toEqual({
      text: "box to box — no drop",
      warn: false,
    });
  });

  it("a device end level with the run is not a warning either", () => {
    expect(words(notCounted("level"))).toEqual({
      text: "level with the run — no drop",
      warn: false,
    });
  });

  it("warns, by its real reason, only when something is missing", () => {
    expect(words(notCounted("height-not-set"))).toEqual({
      text: "no height for this type — no drop counted",
      warn: true,
    });
    expect(words(notCounted("no-distribution-height"))).toEqual({
      text: "no run height for this job — no drop counted",
      warn: true,
    });
    expect(words(notCounted("no-kind"), { kind: null })).toEqual({
      text: "nothing there — no drop counted",
      warn: true,
    });
  });

  it("a tee and 'carries on' are answers; a counted drop is the caller's", () => {
    expect(words(null, { onTee: true })?.warn).toBe(false);
    expect(words(notCounted("level"), { kind: DISTRIBUTION_KIND })).toEqual({
      text: "no drop here",
      warn: false,
    });
    expect(
      words({
        counted: true,
        kind: "receptacle",
        direction: "drop",
        distributionInches: 120,
        endInches: 18,
        feet: 8.5,
      })
    ).toBeNull();
  });
});
