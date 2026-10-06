/**
 * CAD LAYERS (PDF optional content groups) — what they are worth, measured
 * first: references/code-first-ceiling.md § c.
 *
 * Weld 1 keeps its layers and tags its drawing with them: on E-200, 92% of
 * the line work is the architect's background (A-BLOCK alone is 66,530 of
 * 96,540 segments), the demolition plan is its own layer (E-POWR-D, 96% in
 * plan B) and existing devices are on E-POWR-E. Matching on the electrical
 * layers alone found the same 44 of 46 hand marks with the same wrong finds,
 * 14x faster. UNCC DECLARES 158 layers and tags nothing with them; scans have
 * none. So this is a bonus a file may give, never something to rely on:
 * with no usable electrical layer, everything is exactly as before.
 *
 * Pure, so the rules have tests; the worker and the scripts call it.
 */
import type { VectorGeometry } from "./vectorGeometry";

export type LayerRole = "demolition" | "existing" | "new" | "other";

/**
 * pdf.js's optional-content config (`doc.getOptionalContentConfig()`), as
 * id -> layer name for `extractVectorGeometry`.
 */
export function layerIdsFrom(config: Iterable<[string, unknown]>) {
  return new Map(
    Array.from(config).map(([id, group]) => [
      id,
      String((group as { name?: unknown } | null)?.name ?? id),
    ])
  );
}

/**
 * Fewer electrical segments than this and the layers are not really used —
 * a stray block on an E- layer is not a sheet drawn by layer. E-200 has
 * about 3,100.
 */
export const MIN_ELECTRICAL_SEGMENTS = 50;

/**
 * What a layer holds, from its name. An xref prefix ("Base|E-POWR") is
 * dropped. Electrical is an E- discipline layer that is not text or the
 * title block; within it, a -D / DEMO part is demolition and an -E / EXIST
 * part is existing. Names the rule does not know are "other" — never
 * guessed into electrical.
 */
export function layerRole(name: string): LayerRole {
  const base = (name.split("|").pop() ?? name).trim().toUpperCase();
  const parts = base.split(/[-_ ]+/);
  if (parts[0] !== "E" || parts.length < 2) return "other";
  const rest = parts.slice(1);
  if (rest.some(p => /^(ANNO|TEXT|TXT|TTLB|TITLE|NOTE|NOTES|DIMS?)$/.test(p)))
    return "other";
  if (rest.some(p => /^(D|DEMO|DEMOL|DEMOLITION|RMV|REMOVE)$/.test(p)))
    return "demolition";
  if (rest.some(p => /^(E|EX|EXST|EXIST|EXISTING)$/.test(p))) return "existing";
  return "new";
}

const isElectrical = (role: LayerRole) => role !== "other";

/**
 * The geometry Find all matching should search: only the electrical
 * layers' line work when the file really draws by layer, otherwise the
 * geometry unchanged. The kept segments keep their layer, so a find can
 * still say which layer it was drawn on.
 */
export function electricalView(geo: VectorGeometry): VectorGeometry {
  const { layer, layerNames } = geo;
  if (!layer || !layerNames?.length) return geo;
  const roles = layerNames.map(layerRole);
  const keep: number[] = [];
  for (let i = 0; i < layer.length; i++) {
    const l = layer[i];
    if (l >= 0 && isElectrical(roles[l])) keep.push(i);
  }
  if (keep.length < MIN_ELECTRICAL_SEGMENTS) return geo;
  const segs = new Float32Array(keep.length * 4);
  const lightness = new Uint8Array(keep.length);
  const filled = new Uint8Array(keep.length);
  const kept = new Int16Array(keep.length);
  keep.forEach((i, k) => {
    segs.set(geo.segs.subarray(i * 4, i * 4 + 4), k * 4);
    lightness[k] = geo.lightness[i];
    filled[k] = geo.filled[i];
    kept[k] = layer[i];
  });
  return { ...geo, segs, lightness, filled, layer: kept, layerNames };
}

/**
 * The layer a find is drawn on, by most line length among its own
 * segments, with that layer's role — or null with no layer information.
 */
export function drawnOn(
  geo: VectorGeometry,
  segments: ReadonlySet<number>
): { name: string; role: LayerRole } | null {
  const { layer, layerNames } = geo;
  if (!layer || !layerNames?.length) return null;
  const length = new Map<number, number>();
  segments.forEach(i => {
    const l = layer[i];
    if (l < 0) return;
    const len = Math.hypot(
      geo.segs[i * 4 + 2] - geo.segs[i * 4],
      geo.segs[i * 4 + 3] - geo.segs[i * 4 + 1]
    );
    length.set(l, (length.get(l) ?? 0) + len);
  });
  let best = -1;
  let most = 0;
  length.forEach((len, l) => {
    if (len > most) {
      most = len;
      best = l;
    }
  });
  if (best < 0) return null;
  const name = layerNames[best];
  return { name, role: layerRole(name) };
}
