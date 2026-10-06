/**
 * A sheet's LINE WORK, read from the PDF's own drawing operations — for Find
 * all matching (@/lib/findMatching), 2026-10-01.
 *
 * Pure: it takes what pdf.js's `page.getOperatorList()` returns and the
 * scale-1 viewport's transform, and gives back straight segments in page
 * points (the space marks are stored in), each with how dark it is drawn and
 * whether it is filled. No pdf.js import, so the suite can feed it arrays.
 *
 * ── What it understands ──────────────────────────────────────────────────────
 * save / restore / transform (the current matrix), stroke and fill colours
 * (RGB, gray, CMYK, as pdf.js hands them: a "#rrggbb" string or numbers),
 * constructPath with pdf.js 5's packed path data (moveTo 0, lineTo 1,
 * curveTo 2, closePath 3 — `DrawOPS` in pdf.js, not exported, so written down
 * here and pinned by the test), and image paints, whose area is summed so a
 * SCAN can be told apart from a drawing.
 *
 * A curve is cut into CURVE_STEPS straight pieces. A clipping path (painted
 * with endPath) is not line work and is skipped.
 *
 * Measured on Weld 1 E-200 (2026-10-01): 79,725 operations, 33,700 paths,
 * about 0.4 s for pdf.js to build the list in node; 30,291 paths gray
 * (#808080, the architectural background) and 3,202 black (the electrical
 * work). Devices drawn as existing are BLACK on that set, tagged "(E)" in
 * text — so lightness alone does not mean existing, which is why the matcher
 * only FLAGS it.
 */

/** pdf.js 5 DrawOPS. Not exported by pdf.js; the test pins them. */
export const DRAW_OPS = {
  moveTo: 0,
  lineTo: 1,
  curveTo: 2,
  closePath: 3,
} as const;

/** The operator ids this reads, by name — pass pdf.js's `OPS`. */
export type OpsTable = Record<string, number>;

const CURVE_STEPS = 4;

export type VectorGeometry = {
  /** x1, y1, x2, y2 per segment, page points. */
  segs: Float32Array;
  /** 0 (black) … 255 (white): the lightness it is drawn in. */
  lightness: Uint8Array;
  /** 1 when the segment's path is filled, 0 when only stroked. */
  filled: Uint8Array;
  /** Painted image area as a share of the page, 0 … 1 (capped). */
  imageCoverage: number;
  /**
   * Picture pixels per page point of the LARGEST image painted, 0 with none.
   * A 300 dpi scan reads 4.17. The scan matcher's "too poor to match" test
   * is measured in these (@/lib/scanMatching): a symbol's size in the scan's
   * own pixels is known before anything is searched.
   */
  imagePixelsPerPoint: number;
  /**
   * The CAD layer (PDF optional content group) each segment was drawn on,
   * as an index into `layerNames`; -1 for none. Present only when the
   * caller passed the PDF's layer names (@/lib/cadLayers).
   */
  layer?: Int16Array;
  layerNames?: string[];
};

type Matrix = [number, number, number, number, number, number];

function multiply(m: Matrix, n: readonly number[]): Matrix {
  // pdf.js Util.transform(m, n): n applied first, then m.
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** 0 … 255 lightness of a colour as pdf.js hands it over. */
export function lightnessOf(args: readonly unknown[] | undefined): number {
  if (!args || args.length === 0) return 0;
  const first = args[0];
  let r: number;
  let g: number;
  let b: number;
  if (typeof first === "string" && /^#[0-9a-f]{6}$/i.test(first)) {
    r = parseInt(first.slice(1, 3), 16);
    g = parseInt(first.slice(3, 5), 16);
    b = parseInt(first.slice(5, 7), 16);
  } else if (args.length >= 4 && typeof args[3] === "number") {
    // CMYK, 0 … 1.
    const [c, m, y, k] = args as number[];
    r = 255 * (1 - c) * (1 - k);
    g = 255 * (1 - m) * (1 - k);
    b = 255 * (1 - y) * (1 - k);
  } else if (args.length >= 3 && typeof first === "number") {
    const [x, y, z] = args as number[];
    const scale = x > 1 || y > 1 || z > 1 ? 1 : 255;
    r = x * scale;
    g = y * scale;
    b = z * scale;
  } else if (typeof first === "number") {
    const scale = first > 1 ? 1 : 255;
    r = g = b = first * scale;
  } else {
    return 0;
  }
  return Math.max(
    0,
    Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b))
  );
}

export function extractVectorGeometry(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  ops: OpsTable,
  viewportTransform: readonly number[],
  pageWidth: number,
  pageHeight: number,
  /**
   * The PDF's layers, optional-content id -> name
   * (`doc.getOptionalContentConfig()`). Given, each segment records the
   * layer it was drawn on; omitted, nothing about layers is read.
   */
  layerIds?: ReadonlyMap<string, string>
): VectorGeometry {
  const vt = viewportTransform as unknown as Matrix;
  // Layers: names in first-seen order, and the open marked-content stack
  // (an OC entry carries its group's id; any other marked content is null).
  const layerNames: string[] = [];
  const layerIndex = new Map<string, number>();
  const marked: (number | null)[] = [];
  const layerOut: number[] = [];
  const currentLayer = () => {
    for (let k = marked.length - 1; k >= 0; k--)
      if (marked[k] !== null) return marked[k] as number;
    return -1;
  };
  const strokeOps = new Set(
    [
      "stroke",
      "closeStroke",
      "fillStroke",
      "eoFillStroke",
      "closeFillStroke",
      "closeEOFillStroke",
    ]
      .map(n => ops[n])
      .filter(n => n !== undefined)
  );
  const fillOps = new Set(
    [
      "fill",
      "eoFill",
      "fillStroke",
      "eoFillStroke",
      "closeFillStroke",
      "closeEOFillStroke",
    ]
      .map(n => ops[n])
      .filter(n => n !== undefined)
  );
  const imageOps = new Set(
    [
      "paintImageXObject",
      "paintInlineImageXObject",
      "paintImageMaskXObject",
      "paintJpegXObject",
    ]
      .map(n => ops[n])
      .filter(n => n !== undefined)
  );
  const strokeColourOps = new Set(
    [
      "setStrokeRGBColor",
      "setStrokeGray",
      "setStrokeCMYKColor",
      "setStrokeColor",
    ]
      .map(n => ops[n])
      .filter(n => n !== undefined)
  );
  const fillColourOps = new Set(
    ["setFillRGBColor", "setFillGray", "setFillCMYKColor", "setFillColor"]
      .map(n => ops[n])
      .filter(n => n !== undefined)
  );

  const out: number[] = [];
  const light: number[] = [];
  const filledOut: number[] = [];
  let imageArea = 0;
  let largestImage = 0;
  let imagePixelsPerPoint = 0;

  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let stroke = 0;
  let fill = 0;
  const stack: { ctm: Matrix; stroke: number; fill: number }[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[] | undefined;
    if (layerIds) {
      if (fn === ops.beginMarkedContentProps) {
        // pdf.js gives ["OC", { type: "OCG", id }] for a layer.
        const ref = args?.[1] as { id?: string } | string | undefined;
        const id = typeof ref === "string" ? ref : ref?.id;
        const name = args?.[0] === "OC" && id ? layerIds.get(id) : undefined;
        if (name === undefined) marked.push(null);
        else {
          let k = layerIndex.get(name);
          if (k === undefined) {
            k = layerNames.length;
            layerNames.push(name);
            layerIndex.set(name, k);
          }
          marked.push(k);
        }
        continue;
      }
      if (fn === ops.beginMarkedContent) {
        marked.push(null);
        continue;
      }
      if (fn === ops.endMarkedContent) {
        marked.pop();
        continue;
      }
    }
    if (fn === ops.save) stack.push({ ctm, stroke, fill });
    else if (fn === ops.restore) {
      const top = stack.pop();
      if (top) ({ ctm, stroke, fill } = top);
    } else if (fn === ops.transform && args)
      ctm = multiply(ctm, args as number[]);
    else if (strokeColourOps.has(fn)) stroke = lightnessOf(args);
    else if (fillColourOps.has(fn)) fill = lightnessOf(args);
    else if (imageOps.has(fn)) {
      // An image fills the unit square under the current matrix.
      const m = multiply(vt, ctm);
      const area = Math.abs(m[0] * m[3] - m[1] * m[2]);
      imageArea += area;
      // pdf.js hands an XObject image over as [objId, width, height].
      const pixelsWide = Number(args?.[1]);
      const pointsWide = Math.hypot(m[0], m[1]);
      if (area > largestImage && pixelsWide > 0 && pointsWide > 0) {
        largestImage = area;
        imagePixelsPerPoint = pixelsWide / pointsWide;
      }
    } else if (fn === ops.constructPath && args) {
      const paint = args[0] as number;
      const isStroke = strokeOps.has(paint);
      const isFill = fillOps.has(paint);
      if (!isStroke && !isFill) continue; // a clip, not line work
      const lightness = isStroke ? stroke : fill;
      const onLayer = layerIds ? currentLayer() : -1;
      const m = multiply(vt, ctm);
      const packed = args[1] as ArrayLike<ArrayLike<number> | null> | undefined;
      const data = packed?.[0];
      if (!data) continue;
      let cx = 0;
      let cy = 0;
      let sx = 0;
      let sy = 0;
      const at = (x: number, y: number): [number, number] => [
        m[0] * x + m[2] * y + m[4],
        m[1] * x + m[3] * y + m[5],
      ];
      const push = (x1: number, y1: number, x2: number, y2: number) => {
        if (x1 === x2 && y1 === y2) return;
        out.push(x1, y1, x2, y2);
        light.push(lightness);
        filledOut.push(isFill ? 1 : 0);
        layerOut.push(onLayer);
      };
      let j = 0;
      while (j < data.length) {
        const op = data[j++];
        if (op === DRAW_OPS.moveTo) {
          [cx, cy] = at(data[j], data[j + 1]);
          sx = cx;
          sy = cy;
          j += 2;
        } else if (op === DRAW_OPS.lineTo) {
          const [x, y] = at(data[j], data[j + 1]);
          push(cx, cy, x, y);
          cx = x;
          cy = y;
          j += 2;
        } else if (op === DRAW_OPS.curveTo) {
          const p1 = at(data[j], data[j + 1]);
          const p2 = at(data[j + 2], data[j + 3]);
          const p3 = at(data[j + 4], data[j + 5]);
          let px = cx;
          let py = cy;
          for (let s = 1; s <= CURVE_STEPS; s++) {
            const t = s / CURVE_STEPS;
            const u = 1 - t;
            const x =
              u * u * u * cx +
              3 * u * u * t * p1[0] +
              3 * u * t * t * p2[0] +
              t * t * t * p3[0];
            const y =
              u * u * u * cy +
              3 * u * u * t * p1[1] +
              3 * u * t * t * p2[1] +
              t * t * t * p3[1];
            push(px, py, x, y);
            px = x;
            py = y;
          }
          cx = p3[0];
          cy = p3[1];
          j += 6;
        } else if (op === DRAW_OPS.closePath) {
          push(cx, cy, sx, sy);
          cx = sx;
          cy = sy;
        } else {
          // An opcode this does not know: stop reading this path rather than
          // reading its numbers as the wrong thing.
          break;
        }
      }
    }
  }

  const pageArea = Math.max(1, pageWidth * pageHeight);
  return {
    segs: Float32Array.from(out),
    lightness: Uint8Array.from(light),
    filled: Uint8Array.from(filledOut),
    imageCoverage: Math.min(1, imageArea / pageArea),
    imagePixelsPerPoint,
    ...(layerIds ? { layer: Int16Array.from(layerOut), layerNames } : {}),
  };
}
