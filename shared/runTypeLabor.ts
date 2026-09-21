/**
 * What ONE FOOT of a run type is made of, and therefore what it costs in hours.
 *
 * ── The decision this implements ─────────────────────────────────────────────
 * `ASSEMBLIES_PLAN.md` § "Run types read the same number", and D17 in
 * `references/takeoff-spec.md` as REVISED on 2026-09-20: a traced run's labour
 * comes from the same material rows everything else reads — pipe hours off the
 * raceway, wire hours off the conductor times the conductor count — and nothing
 * is typed on the run type. D17 first picked two hand-entered numbers and was
 * superseded within the hour, because all three of its options existed only
 * under the belief that materials could not carry hours. They can; the column
 * was decided, built, and lost in a rewrite. See `shared/materialLabor.ts`.
 *
 * So there is no second figure to maintain. Re-pricing #12 THHN's labour once
 * moves every run and every assembly that touches it.
 *
 * ── Why PER FOOT, and why that is a property of the TYPE ─────────────────────
 * A type is a definition — "3/4in EMT, 3 #12" — and is the same on every job.
 * A run is however many feet the drawing turned out to be. Splitting them here
 * means the palette can say what a foot costs before anything is traced, and
 * the bridge to a bid (R2, unbuilt) multiplies by the measured length.
 *
 * **A run's own circuits may differ from its type's counts, and that is by
 * design** — § 2.1 is emphatic that a particular run may carry two circuits in
 * one pipe and the app must never decide that for the estimator. So this is the
 * TYPE's figure. Anything pricing an actual run reads that run's circuits, the
 * way `quantitiesForRun` already does for footage, and the two are different
 * numbers on purpose.
 *
 * ── The arithmetic is not done here, deliberately ────────────────────────────
 * This file decides only WHAT IS IN a foot. Turning that into hours is
 * `laborForRun`, the same function an assembly's cross-check goes through, so
 * the rule about a missing hour never being read as zero is enforced in one
 * place rather than restated here. See `shared/materialLabor.ts`.
 */
import {
  laborForRun,
  type ComponentLabor,
  type ComponentLine,
  type LaborUnit,
} from "./materialLabor";

/**
 * A run type as this file needs it: the three material slots, their labour
 * units, and the counts.
 *
 * Structural rather than the Drizzle row, so the client can pass what the
 * router sent it without either side owning a schema import.
 */
export type RunTypeSpec = {
  pathType: "conduit" | "cable";
  /** The pipe. Always null on a cable — the cable IS the raceway. */
  racewayMaterialId?: number | null;
  racewayLaborHours?: LaborUnit;
  /** The conductor on a conduit type; the CABLE ITSELF on a cable type. */
  conductorMaterialId?: number | null;
  conductorLaborHours?: LaborUnit;
  /** Insulated conductors in one circuit. NULL is "not said", never zero. */
  conductorCount?: number | null;
  /** The ground wire. Null on every shipped type — see `groundCount`. */
  groundMaterialId?: number | null;
  groundLaborHours?: LaborUnit;
  /** Grounds in one circuit. NULL is "not said". */
  groundCount?: number | null;
};

/**
 * A count the type has actually stated, or null for "nobody has said".
 *
 * A negative or non-finite stored value is treated as unstated rather than
 * clamped to zero: zero is a real answer here — "this type carries no ground" —
 * and a broken row must not be able to impersonate a decision.
 */
function statedCount(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

/**
 * The quantity for a line whose count the type has not stated.
 *
 * NaN, and that is not a trick: `componentLabor` already refuses a non-finite
 * quantity and puts the line in `unsetCount`, which is exactly the outcome
 * wanted — the hours are short by this line and the caller is told so. Reusing
 * that guard beats adding a second, parallel notion of "unknown" that could
 * disagree with it.
 *
 * The alternative, defaulting to zero, is the failure this whole area exists to
 * prevent: a type reading "EMT with wire in it" priced as if the wire installed
 * itself, with nothing on screen to say the number was a guess.
 */
const COUNT_NOT_STATED = Number.NaN;

/**
 * Whether a line is part of this type at all.
 *
 * Claimed by EITHER a named material or a positive count, and the second half
 * is the one that matters: a type can say it carries a ground without saying
 * WHICH, and reading only the material link would drop that ground from the
 * hours in silence — the "confident, low number" this module is written
 * against. Claimed with no material named, the line lands in `unsetCount`
 * instead, and the palette says so.
 *
 * ── The example this used to give was measured and was WRONG ────────────────
 * It said every shipped conduit type is in that state, citing the note in
 * `runTypeSpec` that 0064 split the count out and invented no ground wire.
 * Asked of the running app on 2026-09-20, both shipped conduit types name
 * "#12 bare copper, solid" (`server/seed/baselineRunTypes.ts`); it is the CABLE
 * rows that carry a ground with no wire, and a cable gets no ground line here
 * at all. The rule stands on its own — a user can make such a type, and the
 * backfilled "Conduit" row is unspecified throughout — but the justification
 * was inherited from a comment rather than checked. CLAUDE.md § "A number that
 * can be measured should not be asserted".
 */
function isClaimed(
  materialId: number | null | undefined,
  count: number | null
): boolean {
  return (materialId ?? null) !== null || (count !== null && count > 0);
}

/**
 * What one foot of this type consists of.
 *
 * ── A CABLE IS ONE FOOT OF ONE THING, AND THE COUNT MUST NOT MULTIPLY IT ─────
 * This is the trap in the whole file. A cable type stores what is inside the
 * jacket — a 12-2 MC is two conductors and one ground — and you still buy and
 * install ONE foot of cable per foot of run. Multiplying by the count would
 * bill a 12-2 MC at three times its labour, and it would look entirely
 * plausible on screen.
 *
 * `runTypeSpec` in `shared/takeoffCounts.ts` refuses to PRINT a cable's count
 * for the same reason, and the note there points back here. A conduit is the
 * opposite: the pipe is bought once and every conductor is pulled the full
 * length, which is the rule `wireFeetByCircuit` already applies to footage.
 *
 * ── A cable's ground is inside the jacket too ────────────────────────────────
 * So it gets no line of its own, matching the materials list, which says in as
 * many words that a cable's ground "is inside the cable and is already in the
 * Cable figure". Giving it one here would count the same ground twice.
 */
export function runTypeComponentsPerFoot(
  type: RunTypeSpec
): readonly ComponentLine[] {
  const conductorCount = statedCount(type.conductorCount);
  const groundCount = statedCount(type.groundCount);

  if (type.pathType === "cable") {
    return [
      {
        // One foot of cable per foot of run. Never times anything.
        qty: 1,
        laborHours: type.conductorLaborHours,
      },
    ];
  }

  const lines: ComponentLine[] = [
    // The pipe, once per foot. A conduit run has a raceway by definition, so
    // this line is always claimed — an unnamed one is missing, not absent.
    { qty: 1, laborHours: type.racewayLaborHours },
  ];

  if (isClaimed(type.conductorMaterialId, conductorCount)) {
    lines.push({
      qty: conductorCount ?? COUNT_NOT_STATED,
      laborHours: type.conductorLaborHours,
    });
  }
  if (isClaimed(type.groundMaterialId, groundCount)) {
    lines.push({
      qty: groundCount ?? COUNT_NOT_STATED,
      laborHours: type.groundLaborHours,
    });
  }
  return lines;
}

/** Hours to install one foot of this type, and what the figure is short by. */
export type RunTypeLabor = ComponentLabor & {
  /**
   * True when every claimed line has both a material and an hour.
   *
   * Sugar over `unsetCount === 0`, named so a screen reads as what it means.
   * Note that a type with NO hours anywhere is `hours: 0` with `unsetCount`
   * above zero — never a quiet zero, which is CLAUDE.md § rule 6: a MEASUREMENT
   * that nobody has set must not render as a considered zero.
   */
  complete: boolean;
};

/**
 * Hours per foot for this type, from its materials' own labour units.
 *
 * `unsetCount` travels with the number because it has to: a type whose pipe is
 * costed and whose wire is not returns a confident, low figure that looks
 * exactly like a complete one. Same shape as the half-counted vertical, and it
 * gets surfaced the same way.
 */
export function laborPerFootForRunType(type: RunTypeSpec): RunTypeLabor {
  const labor = laborForRun(runTypeComponentsPerFoot(type));
  return { ...labor, complete: labor.unsetCount === 0 };
}

/**
 * The hours line a screen shows under a run type, or null when there is
 * nothing honest to say.
 *
 * ── Why the sentence is built here and not in the component ──────────────────
 * The same reason `runTypeSpec` lives in `shared/takeoffCounts.ts`: the palette
 * row and the editor form show this, and two copies of the wording is two
 * chances to describe an incomplete figure as a finished one. `vitest` can
 * reach `shared/` and cannot reach a React component, so putting the decision
 * here is what gives it something that can go red — CLAUDE.md § "prefer a
 * forcing function to a reminder".
 *
 * ── The four states, because each says a different true thing ────────────────
 *
 *   costed, some hours    "0.0605 h per ft"
 *   costed, all zero      "0 h per ft"            a deliberate answer, kept
 *   partly costed         "0.04 h per ft so far — 1 of 3 has no labor unit"
 *   nothing costed        "No labor units yet — priced at material only"
 *
 * The third is the one that matters. A partly costed type returns a confident,
 * low number that looks exactly like a finished one, which is the same shape as
 * a half-counted vertical — so the figure never appears without what it is
 * short by. Dropping the caveat and printing `0.04 h per ft` would be the
 * wrong-number-shaped failure this whole area is written against.
 *
 * A deliberate zero is NOT a warning. Someone who has said every part of this
 * type takes no time has answered the question, and nagging them re-opens it.
 */
export function laborPerFootSentence(type: RunTypeSpec): string {
  const labor = laborPerFootForRunType(type);
  const total = runTypeComponentsPerFoot(type).length;
  const hours = trimHours(labor.hours);

  if (labor.complete) return `${hours} h per ft`;
  if (labor.hours <= 0) return "No labor units yet — priced at material only";
  const verb = labor.unsetCount === 1 ? "has" : "have";
  return `${hours} h per ft so far — ${labor.unsetCount} of ${total} ${verb} no labor unit`;
}

/**
 * Four decimals at most, trailing zeros dropped.
 *
 * Four because that is what the column stores — `decimal(10,4)` — so nothing
 * shown here is rounder than what was typed. Per-foot hours are small enough
 * that a fixed two would print several real rates as `0.01` or, worse, as `0`.
 */
function trimHours(hours: number): string {
  return String(Math.round(hours * 10000) / 10000);
}
