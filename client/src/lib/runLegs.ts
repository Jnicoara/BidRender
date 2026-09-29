/**
 * How the runs panel lays out a run of several legs (D20).
 *
 * The panel lists ROWS, and a branched run is several rows. This puts each
 * run's legs together under it, numbers them, says how each one begins, adds
 * up the run's total, and says whether each leg carries the same circuits as
 * the first — "same as main" until somebody says otherwise (answer 2).
 *
 * Pure and in `client/src/lib` so the suite can reach it: the total and the
 * "same circuits" answer are numbers and claims on a screen, and a claim with
 * no test is an instruction (CLAUDE.md § prefer a forcing function).
 */

export type LegRow = {
  id: number;
  parentRunId?: number | null;
  startTee?: { id: number } | null;
  circuits: readonly {
    name: string;
    conductorCount: number;
    groundCount: number | null;
    separateGround: boolean;
  }[];
  /**
   * INSTALLED footage — the run's length as laid, flat and vertical, the same
   * figure the header showed before extras existed. Not bought: a run's
   * length does not grow because a percentage was bought to cover it.
   */
  quantities: {
    conduitInstalledFeet: number | null;
    cableInstalledFeet: number | null;
  } | null;
};

export type LegPlace = {
  rootId: number;
  /** 1-based, in the order the legs were made. */
  index: number;
  /** Legs in this run. 1 is a plain run, and the panel shows no grouping. */
  count: number;
  /**
   * How this leg begins. The first leg is the run's own start; "branch" is
   * any leg starting on a tee — the main past a tee as well as the branch
   * leaving it, which the panel therefore calls "from a tee".
   */
  startsAs: "first" | "branch" | "separate";
  /** Pipe or cable in the whole run; NULL if any leg cannot be measured. */
  runTotalFeet: number | null;
  /** Same circuits as the first leg. Always true on the first leg. */
  sameCircuitsAsFirst: boolean;
};

const circuitsKey = (circuits: LegRow["circuits"]) =>
  JSON.stringify(
    circuits
      .map(c => [c.name, c.conductorCount, c.groundCount, c.separateGround])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  );

/**
 * The rows in panel order — each run where its root first appeared, its legs
 * right after it by id — with each row's place in its run.
 */
export function layoutLegs<T extends LegRow>(
  rows: readonly T[]
): { row: T; place: LegPlace }[] {
  const rootOf = (r: LegRow) => r.parentRunId ?? r.id;
  const groups = new Map<number, T[]>();
  const order: number[] = [];
  for (const row of rows) {
    const root = rootOf(row);
    if (!groups.has(root)) {
      groups.set(root, []);
      order.push(root);
    }
    groups.get(root)!.push(row);
  }

  const out: { row: T; place: LegPlace }[] = [];
  for (const root of order) {
    const legs = [...groups.get(root)!].sort((a, b) => {
      // The root first, then legs in the order they were made.
      if (a.id === root) return -1;
      if (b.id === root) return 1;
      return a.id - b.id;
    });
    let total: number | null = 0;
    for (const leg of legs) {
      const feet = leg.quantities
        ? (leg.quantities.conduitInstalledFeet ??
          leg.quantities.cableInstalledFeet)
        : null;
      total = total === null || feet === null ? null : total + feet;
    }
    const firstKey = circuitsKey(legs[0].circuits);
    legs.forEach((row, i) => {
      out.push({
        row,
        place: {
          rootId: root,
          index: i + 1,
          count: legs.length,
          startsAs: i === 0 ? "first" : row.startTee ? "branch" : "separate",
          runTotalFeet: total === null ? null : Math.round(total * 100) / 100,
          sameCircuitsAsFirst: circuitsKey(row.circuits) === firstKey,
        },
      });
    });
  }
  return out;
}
