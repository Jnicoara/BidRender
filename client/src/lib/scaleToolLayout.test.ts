/**
 * Two faults in the scale tool that live in component markup — 2026-09-25.
 *
 * vitest cannot render a component here (vitest.config.ts covers
 * client/src/lib, not React), so these read the source. That makes them
 * tripwires rather than proofs: they go red if the fault comes back by the
 * route it came the first time. The screen itself was checked by eye.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("the measured line wears the crosshair's colour", () => {
  const src = read("../components/takeoff/CalibrateLayer.tsx");
  // The JSX only: after `return (` of the component, where strokes are drawn.
  const drawing = src.slice(src.indexOf("<svg\n        ref={svgRef}"));

  it("draws no stroke in a fixed colour", () => {
    // It was stroke={SPAN_COLOR}, a fixed sky blue. Any literal colour on a
    // coloured stroke is the same fault, whatever it is called.
    expect(drawing).not.toMatch(/stroke=\{SPAN_COLOR\}/);
    expect(drawing).not.toMatch(/stroke="#(?!000")[0-9a-fA-F]{3,8}"/);
  });

  it("takes the colour from the person's crosshair setting", () => {
    expect(src).toContain("const ink = CROSSHAIR_COLORS[crosshairColor].hex");
    const lines = drawing.match(/<ShadowedLine[\s\S]*?\/>/g) ?? [];
    expect(lines.length).toBe(4); // rubber band, span, two end crosses
    for (const line of lines) expect(line).toContain("ink={ink}");
  });

  it("puts the crosshair's shadow under it", () => {
    expect(src).toContain("MEASURE_SHADOW_PASSES.map");
  });
});

describe('"Measure it" sits under the box, above the preset list', () => {
  const src = read("../components/takeoff/ScaleControl.tsx");
  const content = src.slice(src.indexOf("<PopoverContent"));
  const box = content.indexOf("Type a scale");
  const measure = content.indexOf("onMeasure();");
  const list = content.indexOf("COMMON_SCALES.map");

  it("comes after the typing box", () => {
    expect(box).toBeGreaterThan(-1);
    expect(measure).toBeGreaterThan(box);
  });

  it("comes before the list of presets", () => {
    // It was below the list — the last thing in the menu — for a day.
    expect(list).toBeGreaterThan(-1);
    expect(measure).toBeLessThan(list);
  });

  it("is offered once", () => {
    expect(content.split("onMeasure();").length - 1).toBe(1);
  });
});
