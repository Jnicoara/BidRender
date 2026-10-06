/**
 * Which words on a sheet sit inside a box the estimator dragged, in reading
 * order — the arithmetic behind the plan viewer's "Copy text" tool.
 *
 * Here rather than in the component because vitest reaches `client/src/lib`
 * and cannot reach a React component (CLAUDE.md: a rule with no red to go to
 * is an instruction). Everything that decides WHAT gets copied is in this file.
 *
 * ── Boxes from the raw transform, not from `positionedItems` ────────────────
 * `shared/sheetPageText.ts` keeps a `vert` flag for the title-block reader but
 * not which WAY sideways text runs, so it cannot place a box on it. Plans are
 * full of rotated notes, and a box computed the wrong way round selects the
 * wrong words with nothing to say so. So each word's four corners are taken
 * through the text item's own transform and then the page viewport's — any
 * rotation, either direction, lands where it is drawn.
 *
 * ── Words, not whole items and not single letters ────────────────────────────
 * A pdf.js item is often a whole phrase ("PROVIDE 20A CKT TO RTU-2"), so
 * picking whole items copies far more than the box held. Characters would be
 * finer, but their positions are ESTIMATED — width shared out evenly across
 * the letters, which a proportional font does not do — so a box edge through
 * a word would cut it at a guessed letter. A word is picked when its centre is
 * in the box: an edge can only ever include or leave out whole words.
 *
 * ── Coordinates ──────────────────────────────────────────────────────────────
 * Output is in PAGE POINTS as displayed: the scale-1 viewport, rotation
 * applied, origin top-left — the space every overlay on the takeoff screen
 * works in (see `screenToPagePoints`).
 */

/** The slice of a pdf.js text item this reads. */
export type RawTextItem = {
  str: string;
  /** pdf.js text matrix: [a, b, c, d, e, f]. */
  transform: number[];
  /** Advance width in PDF user units, along the text direction. */
  width: number;
};

export type PageTextLayer = {
  items: RawTextItem[];
  /** The scale-1 viewport's affine transform, `viewport.transform`. */
  viewportTransform: number[];
};

export type PagePoint = { x: number; y: number };

export type WordBox = {
  text: string;
  /** Which item it came from — words of one item were separated by spaces. */
  item: number;
  /** Axis-aligned bounds on the displayed page. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Centre, which decides whether a box picks it. */
  cx: number;
  cy: number;
  /** Reading direction on the displayed page, a unit vector. */
  dx: number;
  dy: number;
  /** Glyph height on the displayed page, for line grouping. */
  height: number;
};

function apply(m: number[], x: number, y: number): PagePoint {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** True when the page has no text to copy — a scan. */
export function hasText(layer: PageTextLayer): boolean {
  return layer.items.some(item => item.str.trim().length > 0);
}

/** Every word on the page, boxed where it is drawn. */
export function wordBoxes(layer: PageTextLayer): WordBox[] {
  const vt = layer.viewportTransform;
  const out: WordBox[] = [];

  layer.items.forEach((item, index) => {
    const t = item.transform;
    const str = item.str;
    if (!str.trim() || !t || t.length < 6 || str.length === 0) return;

    // Text space: the item runs along (a, b), glyphs stand along (c, d).
    const runLength = Math.hypot(t[0], t[1]);
    if (runLength === 0) return;
    const along = { x: t[0] / runLength, y: t[1] / runLength };
    const up = { x: t[2], y: t[3] };
    const width = item.width > 0 ? item.width : runLength * str.length * 0.5;

    const origin = apply(vt, t[4], t[5]);
    const tip = apply(vt, t[4] + along.x, t[5] + along.y);
    const dirLen = Math.hypot(tip.x - origin.x, tip.y - origin.y) || 1;
    const dx = (tip.x - origin.x) / dirLen;
    const dy = (tip.y - origin.y) / dirLen;
    const top = apply(vt, t[4] + up.x, t[5] + up.y);
    const height = Math.hypot(top.x - origin.x, top.y - origin.y);

    const re = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(str)) !== null) {
      const f0 = match.index / str.length;
      const f1 = (match.index + match[0].length) / str.length;
      const corners = [
        [f0, 0],
        [f1, 0],
        [f0, 1],
        [f1, 1],
      ].map(([f, b]) =>
        apply(
          vt,
          t[4] + along.x * width * f + up.x * b,
          t[5] + along.y * width * f + up.y * b
        )
      );
      const xs = corners.map(p => p.x);
      const ys = corners.map(p => p.y);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      out.push({
        text: match[0],
        item: index,
        x0,
        y0,
        x1,
        y1,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        dx,
        dy,
        height,
      });
    }
  });
  return out;
}

export type PageRect = { x: number; y: number; width: number; height: number };

/** The words whose centre is inside the box. The box may be dragged any way. */
export function wordsInBox(words: WordBox[], box: PageRect): WordBox[] {
  const left = Math.min(box.x, box.x + box.width);
  const right = Math.max(box.x, box.x + box.width);
  const topY = Math.min(box.y, box.y + box.height);
  const bottom = Math.max(box.y, box.y + box.height);
  return words.filter(
    w => w.cx >= left && w.cx <= right && w.cy >= topY && w.cy <= bottom
  );
}

/** Reading direction snapped to one of four: 0 right, 1 down, 2 left, 3 up. */
function quadrant(w: WordBox): number {
  if (Math.abs(w.dx) >= Math.abs(w.dy)) return w.dx >= 0 ? 0 : 2;
  return w.dy >= 0 ? 1 : 3;
}

/**
 * The picked words as text, in reading order.
 *
 * Words are put in the frame of their own reading direction — `u` along it,
 * `v` across it towards the next line — so a note rotated a quarter turn reads
 * top line first exactly like a level one. Lines break where `v` jumps by more
 * than half a glyph height. Level text comes first, then the others.
 */
export function wordsToText(words: WordBox[]): string {
  const byDirection = new Map<number, WordBox[]>();
  for (const w of words) {
    const q = quadrant(w);
    const list = byDirection.get(q) ?? [];
    list.push(w);
    byDirection.set(q, list);
  }

  const blocks: string[] = [];
  for (const q of [0, 1, 3, 2]) {
    const group = byDirection.get(q);
    if (!group) continue;
    const d = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ][q];
    // Across the reading direction, towards the following line.
    const n = { x: -d.y, y: d.x };
    const framed = group.map(w => ({
      w,
      u: w.cx * d.x + w.cy * d.y,
      halfU:
        (Math.abs(d.x) * (w.x1 - w.x0) + Math.abs(d.y) * (w.y1 - w.y0)) / 2,
      v: w.cx * n.x + w.cy * n.y,
    }));
    framed.sort((a, b) => a.v - b.v);

    const lines: (typeof framed)[] = [];
    for (const f of framed) {
      const line = lines[lines.length - 1];
      const tolerance = Math.max(f.w.height, 1) * 0.5;
      if (line && Math.abs(f.v - line[0].v) <= tolerance) line.push(f);
      else lines.push([f]);
    }

    for (const line of lines) {
      line.sort((a, b) => a.u - b.u);
      let text = "";
      line.forEach((f, i) => {
        if (i === 0) {
          text = f.w.text;
          return;
        }
        const prev = line[i - 1];
        // Words of one item were separated by whitespace in the PDF. Across
        // items, a real gap is a space; items that touch are one word split
        // by the drawing program (it happens mid-part-number).
        const gap = f.u - f.halfU - (prev.u + prev.halfU);
        const sameItem = f.w.item === prev.w.item;
        const spaced = sameItem || gap > Math.max(f.w.height, 1) * 0.15;
        text += (spaced ? " " : "") + f.w.text;
      });
      blocks.push(text);
    }
  }
  return blocks.join("\n");
}
