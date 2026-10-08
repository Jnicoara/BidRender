/**
 * NO DEVICE-TO-PANEL PATH IS DRAWN (owner, 2026-10-07 — patent option A,
 * references/homerun-patent-notes.md).
 *
 * The Circuits layer used to draw a dashed one-corner right-angle line from a
 * circuit's leaving device to its panel, for display only. The owner chose to
 * remove it: selecting a circuit rings its devices and marks the panel, and
 * draws NO path between them. The homerun's length never came from that line
 * (`shared/homerunFootage.ts` — its own tests pin the arithmetic, unchanged).
 *
 * A React component is out of this suite's reach (vitest.config.ts), so the
 * guard reads the SOURCE of `CircuitLayer`, comments stripped, and fails if
 * any element that draws a line between two points is back in it. Red before
 * 2026-10-07: the layer held a <polyline>.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FILE = path.resolve(
  __dirname,
  "../client/src/components/takeoff/CircuitsView.tsx"
);

/** The body of `CircuitLayer`, from its declaration to the next export. */
function circuitLayerSource(): string {
  const source = readFileSync(FILE, "utf8");
  const start = source.indexOf("export function CircuitLayer(");
  expect(start, "CircuitLayer must still exist").toBeGreaterThan(-1);
  const next = source.indexOf("\nexport ", start + 1);
  const body = source.slice(start, next === -1 ? undefined : next);
  // Comments may NAME the elements (the note saying why there is none).
  return body
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the Circuits layer draws no path from a device to its panel", () => {
  it("has no line, polyline, polygon or path element", () => {
    const code = circuitLayerSource();
    expect(code).not.toMatch(/<(polyline|line|polygon|path)\b/);
  });

  it("still rings the devices and marks the panel", () => {
    const code = circuitLayerSource();
    expect(code).toMatch(/<circle\b/);
    expect(code).toMatch(/<rect\b/);
  });
});
