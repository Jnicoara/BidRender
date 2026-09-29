/**
 * Bends and pull points for the RUNS on one sheet — what the drawing marks
 * and what the run panel says under each row.
 *
 * The bid gets its counts per run TYPE, through `fittingRowsByRunType`. This
 * is the same arithmetic per RUN, for the screen: where each proposal sits,
 * which were answered, and the sentence saying why. Both read
 * `shared/runBends.ts`; neither re-derives anything.
 *
 * ── Loaded once per sheet, then pure per run ────────────────────────────────
 * `bendContextForRuns` does the queries — the company settings, the stored
 * answers, and each type's raceway rule — so `runBendsFor` is arithmetic over
 * rows already in hand, like `groupRunFootage`.
 */
import {
  bendMergeFeetForOverrides,
  bendMethodFor,
  pullPointKindFor,
} from "../shared/runFittingMaterials";
import {
  MERGE_WITHIN_FEET,
  describeRunBends,
  endDropOf,
  legBends,
  walkPullPoints,
  type BendMethod,
  type BendSettings,
  type PullPointAnswer,
  type PullPointKind,
} from "../shared/runBends";
import { resolveMaterial } from "../shared/materialLookup";
import { resolveRunType } from "../shared/runTypeLookup";
import type { RunVerticals } from "../shared/takeoffHeights";
import type { TraceMode } from "../shared/traceMode";
import * as db from "./db";

export type BendContext = {
  settings: BendSettings;
  answers: ReadonlyMap<number, readonly PullPointAnswer[]>;
  /** By the run type id the RUNS store. */
  byType: ReadonlyMap<number, TypeBends>;
};

/** What the panel needs of one run type. */
type TypeBends = {
  method: BendMethod;
  suggestedKind: PullPointKind;
  /**
   * How close same-direction turns must be to merge into one bend — wider
   * than 3 ft when the type's 90 or 45 is a sweep. Required, so this path
   * and the bid's (`fittingRowsByRunType`) cannot quietly disagree about
   * how many bends one trace has. `bendMergeFeetForOverrides`.
   */
  mergeWithinFeet: number;
};

export async function bendContextForRuns(
  runs: readonly { id: number; runTypeId: number | null; pathType: string }[],
  userId: number
): Promise<BendContext> {
  const conduit = runs.filter(run => run.pathType === "conduit");
  const [settings, answers, palette] = await Promise.all([
    db.getBendSettings(userId),
    db.getPullPointAnswersForRuns(
      conduit.map(run => run.id),
      userId
    ),
    conduit.some(run => run.runTypeId !== null)
      ? db.getRunTypesFor(userId, true)
      : Promise.resolve([]),
  ]);

  const typeIds = Array.from(
    new Set(
      conduit
        .map(run => run.runTypeId)
        .filter((id): id is number => id !== null)
    )
  );
  const types = typeIds.map(storedId => ({
    storedId,
    type: resolveRunType(palette, storedId),
  }));
  // The raceway, plus the rows the 90 and 45 are pointed at: a sweep there
  // widens the type's bend-merge distance.
  const materialIds = types
    .flatMap(({ type }) => [
      type?.racewayMaterialId ?? null,
      type?.elbow90MaterialId ?? null,
      type?.elbow45MaterialId ?? null,
    ])
    .filter((id): id is number => id !== null);
  const materials = materialIds.length
    ? await db.getMaterialsByIds(Array.from(new Set(materialIds)), userId)
    : [];
  const nameOf = (id: number | null | undefined): string | null =>
    id == null ? null : (resolveMaterial(materials, id)?.name ?? null);
  const raceways = types.map(({ storedId, type }) => ({
    storedId,
    mergeWithinFeet: bendMergeFeetForOverrides(
      nameOf(type?.elbow90MaterialId),
      nameOf(type?.elbow45MaterialId)
    ),
    raceway:
      type?.racewayMaterialId == null
        ? undefined
        : resolveMaterial(materials, type.racewayMaterialId),
  }));
  const shippedName = await db.shippedNamesOf(raceways.map(r => r.raceway));

  const byType = new Map<number, TypeBends>();
  for (const { storedId, raceway, mergeWithinFeet } of raceways) {
    const baseline = shippedName(raceway);
    const own = raceway?.name ?? null;
    byType.set(storedId, {
      method: bendMethodFor(baseline, own, settings.factoryElbowFrom),
      suggestedKind: pullPointKindFor(baseline, own, settings.pullBoxFrom),
      mergeWithinFeet,
    });
  }
  return { settings, answers, byType };
}

/** One run's bends, shaped for the screen. Listed field by field on purpose. */
export function runBendsFor(
  run: {
    id: number;
    runTypeId: number | null;
    points: { x: number; y: number }[] | null;
    /** A quantity trace proposes no pull points (D21, answer 1). */
    traceMode: TraceMode | null;
  },
  verticals: RunVerticals,
  feetPerPoint: number | null,
  context: BendContext
) {
  const quantity = run.traceMode === "quantity";
  const leg = {
    id: String(run.id),
    points: run.points ?? [],
    feetPerPoint,
    startDrop: endDropOf(verticals.start),
    endDrop: endDropOf(verticals.end),
    // Kept in their table while in quantity mode, and read again on a switch
    // back to route — never deleted (D21, answer 5).
    answers: quantity ? [] : (context.answers.get(run.id) ?? []),
  };
  const limit = context.settings.pullPointLimit;
  const type =
    run.runTypeId === null ? undefined : context.byType.get(run.runTypeId);
  // An untyped run has no sweep to go on: the flat distance.
  const bends = legBends(leg, type?.mergeWithinFeet ?? MERGE_WITHIN_FEET);
  const walk = walkPullPoints(leg, quantity ? Infinity : limit, bends.bends);
  // An untyped run, or one whose raceway cannot be read, is offered a box:
  // with no size to go on, the bigger part is the safer thing to propose.
  const suggestedKind: PullPointKind = type?.suggestedKind ?? "pullBox";
  const { summary, overLimit } = describeRunBends(bends, walk, limit);
  return {
    limit,
    summary,
    overLimit,
    proposals: walk.proposals.map(p => ({
      place: p.place,
      x: p.point.x,
      y: p.point.y,
      degrees: p.degrees,
      suggestedKind,
      answer: p.answer
        ? { id: p.answer.id, status: p.answer.status, kind: p.answer.kind }
        : null,
    })),
    accepted: walk.accepted.map(a => ({
      place: a.place,
      x: a.point.x,
      y: a.point.y,
      answerId: a.answer.id,
      kind: a.answer.kind,
    })),
  };
}
