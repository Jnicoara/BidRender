/**
 * The cover swaps on the shipped starters (references/cover-plates-audit.md
 * § 3; owner, 2026-10-08) — what each starter's cover lines WERE, and what
 * they are now.
 *
 * The recipes in `baselineAssemblies.ts` / `starterAssemblies.ts` already hold
 * the new lines; that is what a NEW database seeds. This table exists for the
 * databases seeded BEFORE, because the seeder never edits a starter that
 * already exists: `server/starterCoverRepair.ts` reads `was` to recognise an
 * untouched old recipe and swaps it, and nothing else.
 *
 * - The generic `Wall plate` becomes a typed plate: duplex receptacles get a
 *   duplex plate, switches a toggle plate, and GFCI / AFCI / USB / dimmer /
 *   sensor / timer / fan-control devices a decorator plate. Nylon throughout
 *   (stainless per recipe is the owner's call, todo.md).
 * - Single receptacles (RS17, CS5) get a single-receptacle plate; the
 *   twist-locks (CS6–8) a single-receptacle raised cover, not a duplex one.
 * - RS1 / RS2 / RS13 / MS12 had no cover and get one. RS13's in-use cover
 *   "if outdoor" is NOT added: the starter does not say it is outdoors.
 * - DV34 was done earlier, as its own change; it is not here.
 *
 * A pair is matched by position: `was[i]` becomes `now[i]` on the same line,
 * and any `now` line past the end of `was` is added. Every `was` line is a
 * line that shipped; every `now` line is in the seed recipe —
 * `server/starterCoverSwaps.test.ts` holds both to that.
 */
import { p, type BaselineAssemblyMaterial } from "./assemblyRecipe";

export type StarterCoverSwap = {
  /** The plan row (DV1, RS17…). */
  ref: string;
  /** The cover lines as shipped before 2026-10-08. */
  was: BaselineAssemblyMaterial[];
  /** The cover lines the seed recipe holds now. */
  now: BaselineAssemblyMaterial[];
};

const plate = p("wall-plate", 1);
const duplex = p("1-gang-wall-plate-duplex-nylon", 1);
const toggle = p("1-gang-wall-plate-toggle-nylon", 1);
const decorator = p("1-gang-wall-plate-decorator-nylon", 1);

const swap = (
  refs: string[],
  was: BaselineAssemblyMaterial[],
  now: BaselineAssemblyMaterial[]
) => refs.map(ref => ({ ref, was, now }));

export const STARTER_COVER_SWAPS: StarterCoverSwap[] = [
  // Duplex receptacles (and the switch/receptacle combo, which takes a
  // duplex plate).
  ...swap(
    [
      "DV1",
      "DV3",
      "DV6",
      "DV7",
      "DV12",
      "DV20",
      "DV23",
      "DV24",
      "DV25",
      "DR16",
      "DR19",
    ],
    [plate],
    [duplex]
  ),
  // Decorator-style devices.
  ...swap(
    [
      "DV2",
      "DV5",
      "DV9",
      "DV10",
      "DV15",
      "DV18",
      "DV19",
      "DV21",
      "DV29",
      "DV31",
      "DR17",
      "DR18",
      "GR6",
      "GR7",
      "CS4",
      "RS8",
    ],
    [plate],
    [decorator]
  ),
  // Toggle switches, the key switch included.
  ...swap(
    ["DV4", "DV13", "DV14", "DV26", "DV27", "DV28", "GR1"],
    [plate],
    [toggle]
  ),
  // Disposal: a receptacle box and a switch box, two plates.
  ...swap(["RS5"], [p("wall-plate", 2)], [duplex, toggle]),
  // Multi-gang.
  ...swap(
    ["DV11", "DV22"],
    [p("2-gang-wall-plate", 1)],
    [p("2-gang-wall-plate-duplex-duplex-nylon", 1)]
  ),
  ...swap(
    ["DV16"],
    [p("2-gang-wall-plate", 1)],
    [p("2-gang-wall-plate-toggle-toggle-nylon", 1)]
  ),
  ...swap(
    ["DV17"],
    [p("3-gang-wall-plate", 1)],
    [p("3-gang-wall-plate-toggle-toggle-toggle-nylon", 1)]
  ),
  // A single receptacle behind a duplex-shaped plate.
  ...swap(
    ["RS17", "CS5"],
    [plate],
    [p("1-gang-wall-plate-single-receptacle-nylon", 1)]
  ),
  // Twist-locks behind a DUPLEX raised cover.
  ...swap(
    ["CS6", "CS7", "CS8"],
    [p("4in-square-raised-cover-duplex", 1)],
    [p("4in-square-raised-cover-single-receptacle", 1)]
  ),
  // No cover at all.
  ...swap(
    ["RS1", "RS2"],
    [],
    [p("1-gang-wall-plate-30a-50a-power-receptacle-nylon", 1)]
  ),
  ...swap(
    ["RS13"],
    [],
    [p("4-11-16in-square-raised-cover-30a-50a-power-receptacle", 1)]
  ),
  ...swap(["MS12"], [], [duplex]),
];

/**
 * A starter's recipe as it shipped BEFORE the cover swap — its seed recipe
 * with the swap undone line for line (`now[i]` back to `was[i]`, any extra
 * `now` line dropped). The same recipe for a starter with no swap. What the
 * repair looks for on an old database, and what a test accepts there.
 */
export function wasRecipe(
  ref: string,
  materials: readonly BaselineAssemblyMaterial[]
): BaselineAssemblyMaterial[] {
  const swap = STARTER_COVER_SWAPS.find(s => s.ref === ref);
  if (!swap) return [...materials];
  const out: BaselineAssemblyMaterial[] = [];
  for (const line of materials) {
    const i = swap.now.findIndex(
      n => n.part === line.part && n.qty === line.qty
    );
    if (i === -1) out.push(line);
    else if (i < swap.was.length) out.push(swap.was[i]);
  }
  return out;
}
