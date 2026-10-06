/**
 * CIRCUITS ON A SHEET, grouped from the devices' own circuit tags — by
 * code, no AI. Read-only: nothing here is priced or saved.
 *
 * Most plans do NOT draw homeruns (owner, 2026-10-06). Each device carries
 * its circuit tag — UNCC's "2B - 14" — and the estimator routes every
 * circuit back to its panel. So this groups the sheet's marks by the tag
 * beside them, ties each circuit to the panel schedule read off the set,
 * and names the device CLOSEST to the panel: where that circuit's homerun
 * would leave from (references/homerun-footage-plan.md). The drawn-homerun
 * reader (@/lib/homeruns) is the rare case.
 *
 * ── Rules, measured on UNCC E111 against the owner's 243 hand marks ───────
 * - A tag belongs to the NEAREST mark within TIE_REACH of it — the rule that
 *   tied labels to devices in references/code-first-ceiling.md § b. One tag,
 *   one device; when two tags want one device the nearer keeps it.
 * - A mark with no tag is flagged only when its ITEM is circuited somewhere
 *   on this sheet. An item none of whose marks carries a tag (data outlets:
 *   low voltage, never on a panel) is listed once as "no circuit tags", not
 *   flagged mark by mark — 73 flags for something that is right is noise.
 * - Closeness to the panel is RIGHT-ANGLE distance (|dx| + |dy|), the path a
 *   homerun is measured along (homerun-footage-plan.md § 3).
 * - The panel's spot: a "PANEL 2B" label on this sheet, else one the user
 *   placed. E111 has no label — its panels are drawn on ED111, at another
 *   scale — so there it waits for a tap. Never guessed.
 */
import {
  readCircuitTags,
  tieToSchedule,
  type CircuitTag,
  type HomerunTie,
  type HomerunWord,
} from "./homeruns";
import type { PanelSchedule } from "./panelSchedules";

/** A mark on the sheet, page points. */
export type CircuitDevice = { id: number; x: number; y: number; name: string };

export type PanelSpot = { x: number; y: number; source: "label" | "placed" };

/** Page points a tag may sit from its device. */
export const TIE_REACH = 24;

export type CircuitGroup = {
  /** "2B-14", "2B-36,38". */
  key: string;
  panel: string;
  circuits: number[];
  devices: CircuitDevice[];
  /** The tag each device was tied by, same order as `devices`. */
  tags: CircuitTag[];
  /** The schedule's rows, or that the set has no schedule for the panel. */
  schedule: HomerunTie;
  /** Some circuit number is not on a panel schedule that WAS read. */
  offSchedule: boolean;
  /** Nearest device to the panel, right-angle; null without a panel spot. */
  closest: { device: CircuitDevice; distance: number } | null;
};

export type CircuitReport = {
  circuits: CircuitGroup[];
  /** Marks of a circuited item with no tag beside them. */
  untagged: CircuitDevice[];
  /** Items with marks here and no tag on any of them. */
  notCircuited: { name: string; count: number }[];
  /** Tags with no mark in reach — a device not counted yet, or a far label. */
  unmatchedTags: CircuitTag[];
  /** Panels the circuits name, with where each sits (null = not known). */
  panels: { name: string; spot: PanelSpot | null; read: boolean }[];
};

/**
 * "PANEL 2B" printed on the sheet, the panel's own label. Not "FED FROM
 * PANEL 2HA" (that names the panel upstream), and not a schedule's title:
 * a schedule sheet's titles are found by @/lib/panelSchedules instead.
 */
export function panelLabels(
  words: readonly HomerunWord[]
): { name: string; x: number; y: number }[] {
  const out: { name: string; x: number; y: number }[] = [];
  const sorted = [...words].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  sorted.forEach((w, i) => {
    if (!/^PANEL$/i.test(w.text)) return;
    const next = sorted[i + 1];
    const prev = sorted[i - 1];
    if (!next || Math.abs(next.cy - w.cy) > 2 || next.x0 - w.x1 > w.height)
      return;
    if (prev && /^FROM$/i.test(prev.text) && Math.abs(prev.cy - w.cy) <= 2)
      return;
    if (!/^[A-Z0-9][A-Z0-9-]{0,7}$/i.test(next.text)) return;
    out.push({ name: next.text, x: (w.x0 + next.x1) / 2, y: w.cy });
  });
  return out;
}

/** Marks this close to a tag's nearest count as one spot (page points). */
export const SHARED_SPOT = 8;
/** Share of an item's marks tagged on their own, to count it circuited. */
export const CIRCUITED = 0.3;

/**
 * How often each item is the UNAMBIGUOUS nearest of a tag — nearer than
 * any other mark by half again — per mark of that item. Measured on UNCC
 * E111: USB duplex 38/38, GFCI 4/4, duplex 65/108, junction box 8/20, but
 * data outlet 7/73. A data outlet is low voltage and never on a panel; its
 * few wins are spots where it sits beside a receptacle that IS tagged.
 */
export function itemScores(
  devices: readonly CircuitDevice[],
  near: readonly { d: number; dist: number }[][]
): Map<string, number> {
  const marks = new Map<string, number>();
  const wins = new Map<string, number>();
  for (const dev of devices)
    marks.set(dev.name, (marks.get(dev.name) ?? 0) + 1);
  for (const cands of near) {
    if (!cands.length) continue;
    const [first, second] = cands;
    if (second && second.dist < 1.5 * Math.max(first.dist, 1)) continue;
    const name = devices[first.d].name;
    wins.set(name, (wins.get(name) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  marks.forEach((n, name) => out.set(name, (wins.get(name) ?? 0) / n));
  return out;
}

const keyOf = (t: Pick<CircuitTag, "panel" | "circuits">) =>
  `${t.panel}-${t.circuits.join(",")}`;

const toBox = (x: number, y: number, b: CircuitTag["box"]) =>
  Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));

export function groupByCircuit(input: {
  words: readonly HomerunWord[];
  devices: readonly CircuitDevice[];
  panels: readonly PanelSchedule[];
  /** Spots the user placed, by panel name. */
  placed: Readonly<Record<string, { x: number; y: number }>>;
}): CircuitReport {
  const tags = readCircuitTags(input.words);
  const labels = panelLabels(input.words);

  const near = tags.map(tag =>
    input.devices
      .map((dev, d) => ({ d, dist: toBox(dev.x, dev.y, tag.box) }))
      .filter(c => c.dist <= TIE_REACH)
      .sort((a, b) => a.dist - b.dist)
  );
  const score = itemScores(input.devices, near);

  /*
    Each tag's preference: among the marks within SHARED_SPOT of its nearest
    — one spot drawn as two symbols, a duplex beside a data outlet — the
    item most often tagged on its own goes first; the rest by distance.
    Tags take their first free choice, the tag nearest its device first.
  */
  const prefs = near.map(cands => {
    const spot = new Set(
      cands.filter(c => c.dist <= cands[0].dist + SHARED_SPOT).map(c => c.d)
    );
    const s = (d: number) =>
      spot.has(d) ? -score.get(input.devices[d].name)! : 1;
    return [...cands].sort((a, b) => s(a.d) - s(b.d) || a.dist - b.dist);
  });
  const tagOf = new Map<number, number>(); // device -> tag
  const deviceOf = new Map<number, number>(); // tag -> device
  const order = prefs
    .map((p, t) => ({ t, first: near[t][0]?.dist ?? Infinity }))
    .filter(o => o.first !== Infinity)
    .sort((a, b) => a.first - b.first);
  for (const { t } of order) {
    const choice = prefs[t].find(c => !tagOf.has(c.d));
    if (!choice) continue;
    tagOf.set(choice.d, t);
    deviceOf.set(t, choice.d);
  }

  const spotOf = (panel: string): PanelSpot | null => {
    const label = labels.find(
      l => l.name.toUpperCase() === panel.toUpperCase()
    );
    if (label) return { x: label.x, y: label.y, source: "label" };
    const placed = input.placed[panel];
    return placed ? { ...placed, source: "placed" } : null;
  };

  const groups = new Map<string, CircuitGroup>();
  tags.forEach((tag, t) => {
    const d = deviceOf.get(t);
    if (d === undefined) return;
    const key = keyOf(tag);
    let g = groups.get(key);
    if (!g) {
      const schedule = tieToSchedule(tag, input.panels);
      g = {
        key,
        panel: tag.panel,
        circuits: tag.circuits,
        devices: [],
        tags: [],
        schedule,
        offSchedule:
          schedule.kind === "panel" &&
          schedule.circuits.some(c => c.circuit === null),
        closest: null,
      };
      groups.set(key, g);
    }
    g.devices.push(input.devices[d]);
    g.tags.push(tag);
  });
  for (const g of Array.from(groups.values())) {
    const spot = spotOf(g.panel);
    if (!spot) continue;
    for (const device of g.devices) {
      const distance =
        Math.abs(device.x - spot.x) + Math.abs(device.y - spot.y);
      if (!g.closest || distance < g.closest.distance)
        g.closest = { device, distance };
    }
  }

  // Untagged marks: only for items that are circuited on this sheet.
  const circuitedNames = new Set(
    Array.from(score)
      .filter(([, s]) => s >= CIRCUITED)
      .map(([name]) => name)
  );
  const untagged = input.devices.filter(
    (dev, d) => !tagOf.has(d) && circuitedNames.has(dev.name)
  );
  const notCircuitedCount = new Map<string, number>();
  for (const dev of input.devices)
    if (!circuitedNames.has(dev.name))
      notCircuitedCount.set(
        dev.name,
        (notCircuitedCount.get(dev.name) ?? 0) + 1
      );

  const circuits = Array.from(groups.values()).sort(
    (a, b) =>
      a.panel.localeCompare(b.panel) ||
      a.circuits[0] - b.circuits[0] ||
      a.key.localeCompare(b.key)
  );
  const panelNames = Array.from(new Set(circuits.map(c => c.panel))).sort();
  return {
    circuits,
    untagged,
    notCircuited: Array.from(notCircuitedCount, ([name, count]) => ({
      name,
      count,
    })),
    unmatchedTags: tags.filter((_, t) => !deviceOf.has(t)),
    panels: panelNames.map(name => ({
      name,
      spot: spotOf(name),
      read: input.panels.some(
        p => p.name !== null && p.name.toUpperCase() === name.toUpperCase()
      ),
    })),
  };
}

/*
  WHERE A PANEL SITS, when the sheet does not say. Kept in this browser,
  per plan page, for want of a column (todo.md, "Circuits on a sheet":
  `bid_panels` plan location). Failing toward "not placed": a browser that
  has not seen the tap shows "Place panel 2B" again, and no closest device —
  never a spot nobody chose.
*/
const SPOT_KEY = "bidridge:panel-spots:";

type SpotStore = Record<string, { x: number; y: number }>;

export function readPanelSpots(
  storage: Pick<Storage, "getItem"> | null,
  docId: number,
  page: number
): SpotStore {
  try {
    const raw = storage?.getItem(`${SPOT_KEY}${docId}:${page}`);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const out: SpotStore = {};
    if (parsed && typeof parsed === "object")
      for (const [name, v] of Object.entries(
        parsed as Record<string, unknown>
      )) {
        const p = v as { x?: unknown; y?: unknown } | null;
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y))
          out[name] = { x: Number(p.x), y: Number(p.y) };
      }
    return out;
  } catch {
    return {};
  }
}

export function rememberPanelSpot(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  docId: number,
  page: number,
  panel: string,
  spot: { x: number; y: number } | null
): SpotStore {
  const spots = readPanelSpots(storage, docId, page);
  if (spot) spots[panel] = { x: spot.x, y: spot.y };
  else delete spots[panel];
  try {
    storage?.setItem(`${SPOT_KEY}${docId}:${page}`, JSON.stringify(spots));
  } catch {
    /* not remembered: shows as not placed after a reload — the safe side */
  }
  return spots;
}
