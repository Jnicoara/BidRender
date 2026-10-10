/**
 * "Fix these" on the bid's warning strips walks the "Fix this line" panel
 * one flagged line at a time (never-stuck-plan.md, gap 11's last sentence).
 */
import { describe, expect, it } from "vitest";
import {
  nextInWalk,
  startWalk,
  walkCount,
  walkLineId,
  walkPosition,
  type FixWalkItem,
} from "./fixWalk";
import { NO_GAPS, type LineFixGaps } from "@shared/lineFix";

const item = (
  id: number,
  gaps: Partial<LineFixGaps>,
  notPriced = false
): FixWalkItem => ({ id, gaps: { ...NO_GAPS, ...gaps }, notPriced });

// Screen order: 30 sits above 10 on purpose, so an id sort would show.
const lines = [
  item(30, { hours: true }),
  item(20, { parts: true }),
  item(10, { hours: true, rate: true }),
  item(40, {}, true), // hand-priced and blank: not priced, nothing to open
  item(50, { material: true }, true),
];

describe("which lines a strip's 'Fix these' visits", () => {
  it("only the lines that strip counts, in screen order", () => {
    expect(startWalk("hours", lines)?.ids).toEqual([30, 10]);
    expect(startWalk("parts", lines)?.ids).toEqual([20]);
    expect(startWalk("rate", lines)?.ids).toEqual([10]);
  });

  it("'not priced' walks only the lines the panel can open on", () => {
    expect(startWalk("notPriced", lines)?.ids).toEqual([50]);
    expect(walkCount("notPriced", lines)).toBe(1);
  });

  it("no line to visit: no walk, and the button hides", () => {
    expect(startWalk("runHours", lines)).toBeNull();
    expect(walkCount("runHours", lines)).toBe(0);
  });

  it("opens on the first line and says where it is", () => {
    const walk = startWalk("hours", lines)!;
    expect(walkLineId(walk)).toBe(30);
    expect(walkPosition(walk)).toBe("Line 1 of 2");
  });
});

describe("moving on after a save or a Skip", () => {
  it("opens the next line, then ends", () => {
    const first = startWalk("hours", lines)!;
    const second = nextInWalk(first, lines)!;
    expect(walkLineId(second)).toBe(10);
    expect(walkPosition(second)).toBe("Line 2 of 2");
    expect(nextInWalk(second, lines)).toBeNull();
  });

  it("passes over a line a save already fixed further down", () => {
    const walk = startWalk("hours", lines)!;
    // "Update 1 other line?" fixed line 10's hours too.
    const after = lines.map(l => (l.id === 10 ? item(10, { rate: true }) : l));
    expect(nextInWalk(walk, after)).toBeNull();
  });

  it("passes over a line that left the bid", () => {
    const walk = startWalk("hours", lines)!;
    expect(
      nextInWalk(
        walk,
        lines.filter(l => l.id !== 10)
      )
    ).toBeNull();
  });

  it("never comes back round to a skipped line", () => {
    const walk = startWalk("hours", lines)!;
    const second = nextInWalk(walk, lines)!;
    // Line 30 was skipped and still has its gap.
    expect(nextInWalk(second, lines)).toBeNull();
  });
});
