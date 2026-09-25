/**
 * THE HOTSPOT IS THE CENTRE OF THE CROSSHAIR. Measured, not assumed.
 *
 * A cursor hotspot off by a pixel or two puts every point on a sheet in the
 * wrong place — every trace vertex, every mark, and both ends of a calibration,
 * which then multiplies the error into every other measurement on the sheet.
 * It is also completely invisible: the cursor looks right, the click looks
 * right, and the numbers are wrong by a constant nobody can see.
 *
 * So these assert the geometry rather than trusting the arithmetic in the
 * module. `crosshairInk` walks the same arm definition the SVG is built from
 * and reports which pixels are painted; the centroid and the bounding box of
 * that ink both have to land on the declared hotspot.
 *
 * ── At EVERY size ────────────────────────────────────────────────────────────
 * Added 2026-09-25 with the Small / Medium / Large setting. The geometry block
 * runs once per size, because a centring rule that holds at 24px says nothing
 * about 36px — an odd size at any one of them would put that size's clicks
 * half a pixel off, and only that size's.
 */
import { describe, it, expect } from "vitest";
import {
  CROSSHAIR_CENTRE,
  CROSSHAIR_SIZE,
  CROSSHAIR_COLORS,
  CROSSHAIR_SIZES,
  DEFAULT_CROSSHAIR_COLOR,
  DEFAULT_CROSSHAIR_SIZE,
  asCrosshairColor,
  asCrosshairSize,
  type CrosshairColor,
  type CrosshairSize,
  crosshairArms,
  crosshairCentre,
  crosshairCursorStyle,
  crosshairCursorValue,
  crosshairInk,
  crosshairPx,
  crosshairSvg,
} from "./crosshairCursor";

const SIZES = Object.keys(CROSSHAIR_SIZES) as CrosshairSize[];

/**
 * Every painted pixel, as GEOMETRIC coordinates — the centre of each pixel.
 *
 * ── The +0.5 is the whole correction ─────────────────────────────────────────
 * The first version of this file measured pixel INDICES, which made a cursor
 * that was half a pixel off report a clean, symmetric, exactly-centred pass. A
 * CSS hotspot is a coordinate; pixel index 12 occupies 12.0 to 13.0 and its
 * centre is 12.5. Comparing an index against a coordinate is comparing two
 * different units, and it hid a real offset of half a CSS pixel — one whole
 * device pixel at 2x — for three days.
 */
function inkPixels(size: CrosshairSize): Array<{ x: number; y: number }> {
  const grid = crosshairInk(size);
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x]) out.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return out;
}

for (const size of SIZES) {
  const C = crosshairCentre(size);
  const PX = crosshairPx(size);

  describe(`the ${size} crosshair is centred on its hotspot`, () => {
    it("paints something at all", () => {
      // A measurement of nothing centres perfectly on everything.
      expect(inkPixels(size).length).toBeGreaterThan(20);
    });

    it("has a bounding box symmetric about the hotspot", () => {
      const pixels = inkPixels(size);
      const xs = pixels.map(p => p.x);
      const ys = pixels.map(p => p.y);
      expect(C - Math.min(...xs)).toBe(Math.max(...xs) - C);
      expect(C - Math.min(...ys)).toBe(Math.max(...ys) - C);
    });

    it("has its centroid exactly on the hotspot", () => {
      const pixels = inkPixels(size);
      const meanX = pixels.reduce((s, p) => s + p.x, 0) / pixels.length;
      const meanY = pixels.reduce((s, p) => s + p.y, 0) / pixels.length;
      expect(meanX).toBeCloseTo(C, 10);
      expect(meanY).toBeCloseTo(C, 10);
    });

    it("keeps the ARMS off the aimed-at pixel", () => {
      // The arms stop short so they never cover the target. What sits there
      // is the dot, which is a different thing and is asserted below.
      expect(crosshairInk(size)[C][C]).toBe(false);
    });

    it("uses an EVEN size, so the geometric centre is a whole number", () => {
      /*
        The correction of 2026-09-24. An odd size gives a single centre pixel,
        whose CENTRE is at .5 — unreachable by an integer hotspot, so the
        cursor sat half a pixel off its own click point.
      */
      expect(PX % 2).toBe(0);
      expect(C).toBe(PX / 2);
      expect(Number.isInteger(C)).toBe(true);
    });

    it("marks the exact point with a small dot", () => {
      /*
        Added 2026-09-24. The open gap lost the spot: four arms converging on
        emptiness makes the eye INFER a centre, and on a busy sheet the gap
        fills with linework. The dot sits on the hotspot, ring then core.
      */
      const circles =
        crosshairSvg("yellow", size).match(/<circle[^>]*>/g) ?? [];
      expect(circles).toHaveLength(2);
      for (const circle of circles) {
        expect(circle).toContain(`cx="${C}"`);
        expect(circle).toContain(`cy="${C}"`);
      }
      expect(circles[0]).toContain("#FFFFFF");
      expect(circles[1]).toContain("#111827");
      // The same small dot at every size: the target does not grow.
      const radii = circles.map(c => Number(/r="([\d.]+)"/.exec(c)![1]));
      expect(radii).toEqual([1.6, 0.6]);
    });

    it("keeps every arm inside the image", () => {
      // An arm running past the edge is silently clipped, and clipping one
      // side and not the other is how a centred cursor stops being centred.
      for (const [x1, y1, x2, y2] of crosshairArms(size)) {
        for (const v of [x1, y1, x2, y2]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(PX);
        }
      }
    });

    it("declares that same centre as the hotspot, with a fallback", () => {
      const value = crosshairCursorValue("yellow", size);
      expect(value).toContain(`) ${C} ${C},`);
      expect(value.trimEnd().endsWith("crosshair")).toBe(true);
      expect(crosshairCursorStyle("yellow", size).cursor).toBe(value);
    });

    it("keeps the lines thin: 2px, whatever the size", () => {
      expect(crosshairSvg("yellow", size)).toContain('stroke-width="2"');
    });
  });
}

describe("crosshair size", () => {
  /*
    Asked for 2026-09-25: arms about 1.5x longer by default, lines still thin,
    centre still exact. Medium is the new default; Small is the old cursor.
  */
  /** How far the right-hand arm reaches from the centre. */
  const reach = (s: CrosshairSize) =>
    crosshairArms(s)[1][2] - crosshairCentre(s);

  it("defaults to Medium, which reaches 1.5x as far as the old cursor", () => {
    expect(DEFAULT_CROSSHAIR_SIZE).toBe("medium");
    expect(reach("medium") / reach("small")).toBe(1.5);
    expect(CROSSHAIR_SIZE).toBe(crosshairPx("medium"));
    expect(CROSSHAIR_CENTRE).toBe(crosshairCentre("medium"));
  });

  it("keeps Small exactly the cursor that shipped before", () => {
    expect(crosshairPx("small")).toBe(24);
    expect(crosshairArms("small")).toEqual([
      [0, 12, 9, 12],
      [15, 12, 24, 12],
      [12, 0, 12, 9],
      [12, 15, 12, 24],
    ]);
  });

  it("grows in order and stays within what a browser accepts", () => {
    expect(crosshairPx("small")).toBeLessThan(crosshairPx("medium"));
    expect(crosshairPx("medium")).toBeLessThan(crosshairPx("large"));
    // Browsers refuse cursor images over 128px; well under it.
    expect(crosshairPx("large")).toBeLessThanOrEqual(64);
  });

  it("changes only the reach: the same gap round the centre at every size", () => {
    for (const s of SIZES) {
      const c = crosshairCentre(s);
      const [, , nearLeft] = crosshairArms(s)[0];
      expect(c - nearLeft).toBe(3);
    }
  });

  it("reads an unknown stored size as the default", () => {
    expect(asCrosshairSize("large")).toBe("large");
    expect(asCrosshairSize("huge")).toBe("medium");
    expect(asCrosshairSize(undefined)).toBe("medium");
  });
});

describe("the cursor value a browser is given", () => {
  it("is a url() with an inline SVG, needing no network", () => {
    const value = crosshairCursorValue();
    expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
    /*
      A cursor that has to be FETCHED can be late, which is the fault this
      replaces. So: no external reference.

      Checked by stripping the SVG namespace first. The naive version of this
      test — "does not contain http" — failed on `xmlns="http://www.w3.org/
      2000/svg"`, which is an identifier and is never fetched. The test was
      wrong, not the cursor.
    */
    const withoutNamespace = decodeURIComponent(value).replace(
      /xmlns="[^"]*"/g,
      ""
    );
    expect(withoutNamespace).not.toContain("http");
  });

  it("escapes the SVG so the url cannot be broken by its own markup", () => {
    for (const s of SIZES) {
      const value = crosshairCursorValue("yellow", s);
      expect(value).not.toContain("<");
      expect(value).not.toContain(">");
      expect(value).not.toContain("#");
    }
  });

  it("stays small enough to be accepted", () => {
    // Browsers cap cursor images; well under any limit, and worth knowing if
    // the artwork ever grows.
    for (const s of SIZES)
      expect(crosshairCursorValue("yellow", s).length).toBeLessThan(4000);
  });
});

describe("the crosshair reads on white paper and on black linework", () => {
  it("draws the arms in ONE colour, with no outline", () => {
    // Reversed 2026-09-24: the dark 1px outline made the pointer two-tone.
    // One stroke pass in the chosen colour, 2px wide (an even-sized image puts
    // the centre on a pixel BOUNDARY, so the stroke straddles it), lifted off
    // white paper by a faint soft shadow rather than a drawn edge.
    const svg = crosshairSvg();
    expect(svg).toContain('stroke="#F5C518" stroke-width="2"');
    expect(svg.match(/stroke="/g)).toHaveLength(1);
    expect(svg).not.toContain('#111827" stroke-width');
    expect(svg).toContain("feDropShadow");
  });

  /*
    REVERSED 2026-09-24. This file used to assert the cursor was NOT yellow,
    because yellow is the colour of a mark. On screen, the light halo that
    replaced it read as a glowing white box on dark areas, and the owner chose
    brand yellow — plus a per-person setting for anyone whose sheets are dense
    with yellow marks.
  */
  it("is brand yellow by default", () => {
    expect(DEFAULT_CROSSHAIR_COLOR).toBe("yellow");
    expect(crosshairSvg()).toContain("#F5C518");
  });

  it("draws each offered colour, and only the geometry-free parts change", () => {
    const base = crosshairSvg("yellow");
    for (const key of Object.keys(CROSSHAIR_COLORS) as CrosshairColor[]) {
      const svg = crosshairSvg(key);
      expect(svg).toContain(`stroke="${CROSSHAIR_COLORS[key].hex}"`);
      // Swapping the colour back must give the default image exactly — so the
      // colour is the ONLY thing a setting can move.
      expect(svg.replace(CROSSHAIR_COLORS[key].hex, "#F5C518")).toBe(base);
      expect(crosshairCursorValue(key)).toContain(
        `) ${CROSSHAIR_CENTRE} ${CROSSHAIR_CENTRE},`
      );
    }
  });

  it("reads an unknown stored colour as the default", () => {
    expect(asCrosshairColor("cyan")).toBe("cyan");
    expect(asCrosshairColor("chartreuse")).toBe("yellow");
    expect(asCrosshairColor(null)).toBe("yellow");
  });
});
