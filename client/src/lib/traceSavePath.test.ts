/**
 * The cursor never becomes a point of a run.
 *
 * While tracing, TraceLayer holds the cursor (`hover`, snapped as
 * `hoverSnap`) to draw the preview segment and the "Next" label. The run's
 * points — what every save sends — change ONLY through `onPointsChange`. So
 * if no `onPointsChange(...)` call reads the cursor, the preview segment
 * cannot reach a saved run, a bid line or a total.
 *
 * A source guard because there is no other red to go to: vitest does not
 * render components (CLAUDE.md). The server half is
 * server/previewNeverSaved.test.ts; the pill is traceReadout.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../components/takeoff/TraceLayer.tsx"),
  "utf8"
);

/** The full argument text of every `onPointsChange(...)` call. */
function pointsChangeCalls(src: string): string[] {
  const out: string[] = [];
  const re = /onPointsChange\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}

describe("the run's points never take the cursor", () => {
  const calls = pointsChangeCalls(source);

  it("finds the calls it is guarding", () => {
    // Undo-last-point (key, Backspace, button) and the click that adds one.
    // If this count changes, read the new call before trusting the next test.
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it("no call reads the cursor", () => {
    for (const args of calls) expect(args).not.toMatch(/\bhover/);
  });

  it("the click adds the point resolved from the PRESS, not the cursor", () => {
    expect(calls.some(a => /\[\.\.\.points, next\]/.test(a))).toBe(true);
  });
});
