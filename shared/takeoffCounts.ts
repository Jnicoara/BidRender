/**
 * Turning stamps and traced runs into one list an estimator can read.
 *
 * ── Why counts are derived, never stored ─────────────────────────────────────
 * A stamp is one row per drop, so the quantity of an assembly is simply how
 * many rows there are. Storing a count alongside would give two sources of
 * truth for the same fact, and the moment a stamp is deleted from the drawing
 * without the count following, the list and the plan disagree — with nothing on
 * screen to say which is right. Counting here means they cannot diverge.
 *
 * ── One list, two kinds of thing ─────────────────────────────────────────────
 * Stamps are counted (12 receptacles) and runs are measured (30 ft of conduit).
 * They are genuinely different quantities and are kept as distinct entry types
 * rather than flattened into a single "amount" column, because a number without
 * its unit is how a footage ends up being ordered as a piece count.
 *
 * Both carry a location, which is what lets clicking a list row jump the viewer
 * to the mark on the drawing.
 */
import type { PagePoint } from "./takeoffGeometry";

/**
 * A stamp as the counter needs it.
 *
 * ── `name` is resolved before it gets here ───────────────────────────────────
 * From phase 6 a mark carries position and a pointer to its group; what it is
 * CALLED belongs to the group. The database layer resolves the two into one
 * string (`stampName` below) so this module stays a pure function over records
 * and never has to know that a label has two possible homes.
 */
export type StampRecord = {
  id: number;
  sheetId: number;
  /** The group this mark belongs to. Null only on pre-phase-6 rows. */
  groupId: number | null;
  /** The group's label, or the pre-phase-6 assembly snapshot. Never empty. */
  name: string;
  /** Provenance, still used to key pre-phase-6 marks. Null for a plain count. */
  assemblyId: number | null;
  x: number;
  y: number;
};

/**
 * What to call a mark, in the order the answer should be trusted.
 *
 * The group first, because it is the live fact and the only one a rename
 * updates. The stamp's snapshot second, for rows written before groups existed.
 * A placeholder last, so a row that somehow has neither shows as something a
 * person can click rather than as an empty line in the count.
 */
export function stampName(stamp: {
  groupLabel?: string | null;
  assemblyName?: string | null;
}): string {
  const label = stamp.groupLabel?.trim();
  if (label) return label;
  const snapshot = stamp.assemblyName?.trim();
  if (snapshot) return snapshot;
  return "Unnamed count";
}

/** A traced run as the counter needs it. */
export type RunRecord = {
  id: number;
  sheetId: number;
  name: string;
  pathType: "conduit" | "cable";
  points: PagePoint[];
  /** Null when the sheet could not be measured — see takeoffQuantities. */
  runFeet: number | null;
};

/** Many marks of one counted thing, gathered. */
export type CountedAssembly = {
  kind: "assembly";
  /** The group these belong to. Null only for pre-phase-6 marks. */
  groupId: number | null;
  /** Null for a plain count, or an assembly deleted since it was stamped. */
  assemblyId: number | null;
  name: string;
  /** How many were dropped. Derived from the stamps themselves. */
  count: number;
  /** Every instance, so the list can walk through them one at a time. */
  stamps: StampRecord[];
};

/** One traced run. */
export type CountedRun = {
  kind: "run";
  runId: number;
  name: string;
  pathType: "conduit" | "cable";
  /** Null when unmeasurable — shown as such, never as 0. */
  feet: number | null;
  /** Where to jump to: the run's first vertex. */
  at: PagePoint | null;
  sheetId: number;
};

export type CountedItem = CountedAssembly | CountedRun;

/**
 * Gather marks into the things they are counting.
 *
 * ── Three keys, in order, and the order is the history ───────────────────────
 * The GROUP where there is one, which from phase 6 is every mark placed. Two
 * groups may legitimately share a label — the router discourages it rather than
 * forbidding it, see drizzle/schema.ts — so the id is the identity and the
 * label is only what it is called.
 *
 * Then the two pre-phase-6 keys, unchanged, for marks placed before groups
 * existed and for any the backfill could not reach: the ASSEMBLY id where there
 * is one, and the NAME where there is not. A mark whose library assembly has
 * since been deleted keeps its snapshot name, and two such orphans of the same
 * name are the same thing to a person reading the list; keying them by their
 * null id would collapse every deleted assembly into one meaningless row.
 *
 * Order is by first appearance, so the list does not reshuffle as more stamps
 * land — a list that reorders itself while you are clicking is a list you
 * cannot keep your place in.
 */
export function groupStamps(stamps: StampRecord[]): CountedAssembly[] {
  const groups = new Map<string, CountedAssembly>();

  for (const stamp of stamps) {
    const key =
      stamp.groupId !== null
        ? `group:${stamp.groupId}`
        : stamp.assemblyId !== null
          ? `id:${stamp.assemblyId}`
          : `name:${stamp.name.trim().toLowerCase()}`;

    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.stamps.push(stamp);
      continue;
    }
    groups.set(key, {
      kind: "assembly",
      groupId: stamp.groupId,
      assemblyId: stamp.assemblyId,
      name: stamp.name,
      count: 1,
      stamps: [stamp],
    });
  }

  return Array.from(groups.values());
}

/** Runs as list entries, each pointing at its first vertex. */
export function runEntries(runs: RunRecord[]): CountedRun[] {
  return runs.map(run => ({
    kind: "run" as const,
    runId: run.id,
    name: run.name,
    pathType: run.pathType,
    feet: run.runFeet,
    at: run.points.length > 0 ? run.points[0] : null,
    sheetId: run.sheetId,
  }));
}

/**
 * The whole counted-items list: stamped assemblies first, then traced runs.
 *
 * Stamps lead because they are the higher-frequency action — an estimator
 * drops dozens per sheet and traces a handful of runs — so the thing they are
 * actively adding to stays at the top where they can watch it climb.
 */
export function buildCountedItems(
  stamps: StampRecord[],
  runs: RunRecord[]
): CountedItem[] {
  return [...groupStamps(stamps), ...runEntries(runs)];
}

/** Total pieces stamped, across every assembly. */
export function totalStampCount(stamps: StampRecord[]): number {
  return stamps.length;
}

/**
 * Where a stamp sits, as a point.
 *
 * Trivial, but it keeps the string→number conversion in one place: stamp
 * coordinates arrive from the database as decimal strings, and a `+` on one of
 * those concatenates rather than adds.
 */
export function stampPoint(stamp: {
  x: number | string;
  y: number | string;
}): PagePoint {
  return { x: Number(stamp.x), y: Number(stamp.y) };
}

/**
 * Which stamps sit within a boxed region — the legend-capture selection.
 *
 * Inclusive of the edges, and tolerant of a box dragged in any direction: a
 * user dragging up-and-left produces a negative width, and refusing that would
 * mean the tool only worked one way round.
 */
export function stampsInRegion(
  stamps: StampRecord[],
  region: { x: number; y: number; width: number; height: number }
): StampRecord[] {
  const left = Math.min(region.x, region.x + region.width);
  const right = Math.max(region.x, region.x + region.width);
  const top = Math.min(region.y, region.y + region.height);
  const bottom = Math.max(region.y, region.y + region.height);

  return stamps.filter(
    s => s.x >= left && s.x <= right && s.y >= top && s.y <= bottom
  );
}

/** Normalise a symbol label into the key its uniqueness is judged on. */
export function symbolLookupKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}
