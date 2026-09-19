/**
 * How a counted mark looks: shape, colour, and size at a zoom.
 *
 * ── What these are defending ─────────────────────────────────────────────────
 * The whole feature is "tell these marks apart", so the failures that matter
 * are the ones that make two different counts look the same, or make one count
 * look like two. Neither is visible in a screenshot of a drawing with three
 * marks on it — they show up on a sheet with forty, in front of a customer.
 *
 * The size clamp is tested against the numbers measured in the running app,
 * which are recorded in shared/takeoffMarks.ts. A clamp that is arithmetically
 * right and disagrees with the screen is the thing to catch.
 */
import { describe, it, expect } from "vitest";
import {
  MARK_COLORS,
  MARK_MAX_PX,
  MARK_MIN_PX,
  MARK_SHAPES,
  RESERVED_COLORS,
  colorFor,
  markAppearance,
  markPath,
  markRadiusInOverlay,
  markScreenDiameter,
  markStrokeInOverlay,
  shapeFor,
} from "@shared/takeoffMarks";

describe("shape", () => {
  it("gives each library category a shape that never moves", () => {
    // An estimator who learns "triangles are lighting" keeps that across jobs,
    // so these are a contract rather than an implementation detail.
    expect(shapeFor({ id: 1, assemblyCategory: "Lighting" })).toBe("triangle");
    expect(shapeFor({ id: 999, assemblyCategory: "Lighting" })).toBe(
      "triangle"
    );
    expect(shapeFor({ id: 1, assemblyCategory: "Panels" })).toBe("square");
  });

  it("gives a count with no category a shape anyway", () => {
    // Level 1's whole point: it has no assembly and no category, and it still
    // has to be tellable from its neighbour.
    const shape = shapeFor({ id: 42, assemblyCategory: null });
    expect(MARK_SHAPES).toContain(shape);
  });

  it("gives the same count the same shape every time it is asked", () => {
    // Stability is the feature. A shape that changed between sessions would
    // make yesterday's drawing unreadable today.
    const once = shapeFor({ id: 57, assemblyCategory: null });
    const twice = shapeFor({ id: 57, assemblyCategory: null });
    expect(twice).toBe(once);
  });

  it("does not hand consecutive counts the same shape", () => {
    // Groups are made one after another, so consecutive ids are the common
    // case, not an edge case — and two counts made in a row are exactly the
    // two most likely to be side by side on the sheet.
    const shapes = [1, 2, 3, 4, 5].map(id =>
      shapeFor({ id, assemblyCategory: null })
    );
    expect(new Set(shapes).size).toBe(5);
  });
});

describe("colour", () => {
  it("never uses a colour this drawing has already spoken for", () => {
    // Conduit yellow is the one that shipped and the one that caused this: a
    // field of marks in the same yellow as a traced conduit run.
    for (const reserved of RESERVED_COLORS) {
      expect(MARK_COLORS).not.toContain(reserved);
    }
  });

  it("does not hand consecutive counts the same colour", () => {
    const colors = [1, 2, 3, 4, 5, 6].map(id => colorFor({ id }));
    expect(new Set(colors).size).toBe(6);
  });

  it("is stable for one count", () => {
    expect(colorFor({ id: 57 })).toBe(colorFor({ id: 57 }));
  });
});

describe("appearance of one mark", () => {
  it("reads from the group, so every mark of a count matches", () => {
    const a = markAppearance({
      groupId: 12,
      assemblyId: null,
      assemblyCategory: null,
    });
    const b = markAppearance({
      groupId: 12,
      assemblyId: 999,
      assemblyCategory: null,
    });
    // Same group, same look — whatever else differs between the two rows.
    expect(b).toEqual(a);
  });

  it("falls back to the assembly for a mark placed before groups existed", () => {
    const first = markAppearance({
      groupId: null,
      assemblyId: 8,
      assemblyCategory: null,
    });
    const second = markAppearance({
      groupId: null,
      assemblyId: 8,
      assemblyCategory: null,
    });
    expect(second).toEqual(first);
  });

  it("keeps a group and an assembly of the same number apart", () => {
    // The fallback key is negated for exactly this: group 8 and assembly 8 are
    // different things and must not be drawn as the same thing.
    const byGroup = markAppearance({
      groupId: 8,
      assemblyId: null,
      assemblyCategory: null,
    });
    const byAssembly = markAppearance({
      groupId: null,
      assemblyId: 8,
      assemblyCategory: null,
    });
    expect(byAssembly).not.toEqual(byGroup);
  });
});

describe("size — measured against the running app", () => {
  it("holds a mark readable when the whole sheet is on screen", () => {
    // 19% measured 3.8px before the clamp: smaller than a full stop, and the
    // reason nobody could see what had been counted.
    expect(markScreenDiameter(0.19)).toBe(MARK_MIN_PX);
  });

  it("stops a mark swallowing the symbol it marks when zoomed in", () => {
    // MAX_ZOOM is 8, which measured out past 150px.
    expect(markScreenDiameter(8)).toBe(MARK_MAX_PX);
  });

  it("tracks the drawing between the two stops", () => {
    // In the middle it grows with the paper, which is what makes it feel stuck
    // to the symbol rather than floating over it.
    expect(markScreenDiameter(1)).toBe(20);
    expect(markScreenDiameter(0.6)).toBeCloseTo(12, 5);
  });

  it("survives a zoom that is not a number", () => {
    // A view can be mid-reset, and a NaN radius renders nothing at all — a
    // drawing that silently loses its marks is worse than an ugly one.
    expect(markScreenDiameter(Number.NaN)).toBe(MARK_MIN_PX);
    expect(markScreenDiameter(0)).toBe(MARK_MIN_PX);
    expect(markScreenDiameter(-2)).toBe(MARK_MIN_PX);
    expect(Number.isFinite(markRadiusInOverlay(Number.NaN))).toBe(true);
    expect(Number.isFinite(markStrokeInOverlay(0))).toBe(true);
  });

  it("divides the zoom back out, so the clamp survives the transform", () => {
    // The overlay is inside the zoom transform. What is drawn gets multiplied
    // by `zoom` on the way to the screen, so the radius must be the screen
    // size divided by it — and the round trip must land back on the clamp.
    for (const zoom of [0.05, 0.19, 0.5, 1, 2, 4, 8]) {
      const onScreen = markRadiusInOverlay(zoom) * 2 * zoom;
      expect(onScreen).toBeCloseTo(markScreenDiameter(zoom), 5);
      expect(onScreen).toBeGreaterThanOrEqual(MARK_MIN_PX - 1e-9);
      expect(onScreen).toBeLessThanOrEqual(MARK_MAX_PX + 1e-9);
    }
  });
});

describe("the shapes themselves", () => {
  it("draws every shape as a closed path around the same centre", () => {
    for (const shape of MARK_SHAPES) {
      const d = markPath(shape, 100, 50, 10);
      expect(d.startsWith("M ")).toBe(true);
      expect(d.length).toBeGreaterThan(10);
      expect(d).not.toContain("NaN");
    }
  });

  it("keeps every shape inside the same circle, so none reads as bigger", () => {
    // Circumradius for all of them. A square drawn to the same WIDTH as a
    // circle looks half again as large, which would read as a difference in
    // importance rather than in kind.
    const r = 10;
    for (const shape of MARK_SHAPES) {
      if (shape === "circle") continue;
      const numbers = markPath(shape, 0, 0, r)
        .replace(/[MLZ]/g, " ")
        .trim()
        .split(/[\s]+/)
        .map(Number)
        .filter(n => Number.isFinite(n));
      for (let i = 0; i < numbers.length; i += 2) {
        const distance = Math.hypot(numbers[i], numbers[i + 1]);
        expect(distance).toBeCloseTo(r, 1);
      }
    }
  });

  it("makes a square and a diamond different paths", () => {
    // They are the same polygon at different rotations, and if the rotation
    // were dropped they would be one shape wearing two names.
    expect(markPath("square", 0, 0, 10)).not.toBe(
      markPath("diamond", 0, 0, 10)
    );
  });
});
