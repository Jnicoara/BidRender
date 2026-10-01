import { describe, expect, it } from "vitest";
import {
  scoreReading,
  unmatchedLabels,
  type HandMark,
  type Suggestion,
} from "./readerAccuracyScore";

const R = 24; // a third of an inch, in points

const mark = (label: string, x: number, y: number): HandMark => ({
  label,
  x,
  y,
});
const guess = (
  label: string | null,
  x: number | null,
  y: number | null,
  unreadable = false
): Suggestion => ({ label, x, y, unreadable });

/** The invariant the table relies on. */
function addsUp(s: ReturnType<typeof scoreReading>) {
  expect(s.found + s.wrong + s.missed).toBe(s.byHand);
}

describe("scoreReading", () => {
  it("scores an EXISTING TO REMAIN mark as its symbol, since the AI is never asked which", () => {
    const s = scoreReading(
      [mark("DUPLEX RECEPTACLE - EXISTING TO REMAIN", 100, 200)],
      [guess("Duplex receptacle", 104, 203)],
      R
    );
    expect(s).toMatchObject({ found: 1, wrong: 0, missed: 0, extra: 0 });
    expect(
      unmatchedLabels(
        [mark("DUPLEX RECEPTACLE - EXISTING TO REMAIN", 0, 0)],
        ["Duplex receptacle"]
      )
    ).toEqual([]);
  });

  it("counts a right symbol in the right place as found", () => {
    const s = scoreReading(
      [mark("Duplex", 100, 200)],
      [guess("duplex ", 110, 205)],
      R
    );
    expect(s).toMatchObject({ found: 1, wrong: 0, missed: 0, extra: 0 });
    addsUp(s);
  });

  it("counts a wrong symbol in the right place as wrong, not found", () => {
    const s = scoreReading(
      [mark("Duplex", 100, 200)],
      [guess("GFCI", 100, 200)],
      R
    );
    expect(s).toMatchObject({ found: 0, wrong: 1, missed: 0, extra: 0 });
    addsUp(s);
  });

  it("lets the right symbol claim a mark before a closer wrong one", () => {
    const s = scoreReading(
      [mark("Duplex", 100, 200)],
      [guess("GFCI", 100, 200), guess("Duplex", 118, 200)],
      R
    );
    expect(s).toMatchObject({ found: 1, wrong: 0, extra: 1 });
    addsUp(s);
  });

  it("counts a suggestion just outside the radius as a miss plus an extra", () => {
    // Offset on the Y axis only, so a scorer that measured one axis would fail.
    const s = scoreReading(
      [mark("Duplex", 100, 200)],
      [guess("Duplex", 100, 200 + R + 0.01)],
      R
    );
    expect(s).toMatchObject({ found: 0, missed: 1, extra: 1 });
    addsUp(s);
  });

  it("uses a suggestion once: the same symbol reported twice is one extra", () => {
    const s = scoreReading(
      [mark("Duplex", 100, 200)],
      [guess("Duplex", 101, 200), guess("Duplex", 99, 200)],
      R
    );
    expect(s).toMatchObject({ found: 1, extra: 1 });
    addsUp(s);
  });

  it("pairs nearest-first across two close marks", () => {
    // Greedy in list order would give mark A the guess at 115 and strand B.
    const s = scoreReading(
      [mark("Duplex", 100, 0), mark("Duplex", 130, 0)],
      [guess("Duplex", 115, 0), guess("Duplex", 101, 0)],
      R
    );
    expect(s).toMatchObject({ found: 2, missed: 0, extra: 0 });
    addsUp(s);
  });

  it("a flag at a mark is still a miss, and is shown as flagged", () => {
    const s = scoreReading(
      [mark("Duplex", 100, 200)],
      [guess("", 100, 200, true)],
      R
    );
    expect(s).toMatchObject({
      found: 0,
      missed: 1,
      flagged: 1,
      extra: 0,
      flagsOnNothing: 0,
    });
    addsUp(s);
  });

  it("a flag on nothing is neither an extra nor a miss", () => {
    const s = scoreReading([], [guess("", 5, 5, true)], R);
    expect(s).toMatchObject({ extra: 0, flagsOnNothing: 1, byHand: 0 });
  });

  it("a readable suggestion with no position is an unplaced extra", () => {
    const s = scoreReading(
      [mark("Duplex", 100, 200)],
      [guess("Duplex", null, null)],
      R
    );
    expect(s).toMatchObject({ found: 0, missed: 1, extra: 1, unplaced: 1 });
    addsUp(s);
  });

  it("an unlabelled suggestion at a mark is a wrong symbol, never found", () => {
    const s = scoreReading([mark("Duplex", 0, 0)], [guess(null, 0, 0)], R);
    expect(s).toMatchObject({ found: 0, wrong: 1 });
    addsUp(s);
  });

  it("tallies by type", () => {
    const s = scoreReading(
      [mark("Duplex", 0, 0), mark("Duplex", 500, 0), mark("Quad", 0, 500)],
      [
        guess("Duplex", 0, 0),
        guess("Duplex", 0, 500),
        guess("Switch", 900, 900),
      ],
      R
    );
    expect(s.byType.get("duplex")).toEqual({
      byHand: 2,
      found: 1,
      wrong: 0,
      missed: 1,
      extra: 0,
    });
    expect(s.byType.get("quad")).toMatchObject({ byHand: 1, wrong: 1 });
    expect(s.byType.get("switch")).toMatchObject({ byHand: 0, extra: 1 });
    addsUp(s);
  });
});

describe("unmatchedLabels", () => {
  it("names hand-count labels the legend does not have, ignoring case and spacing", () => {
    expect(
      unmatchedLabels(
        [mark("Duplex", 0, 0), mark(" duplex", 1, 1), mark("Duplx", 2, 2)],
        ["DUPLEX", "Quad"]
      )
    ).toEqual(["Duplx"]);
  });
});
