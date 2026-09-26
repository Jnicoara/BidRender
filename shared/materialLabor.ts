/**
 * Labor units on materials, and the one function allowed to decide whose hours
 * price a line.
 *
 * ── Two jobs, deliberately in one file ───────────────────────────────────────
 * Finding the rows nobody has set, and deciding what prices. They live together
 * because they are the two halves of the same risk: hours that are missing, and
 * hours that get counted twice.
 *
 * ── A MISSING HOUR IS WORSE THAN A MISSING PRICE ─────────────────────────────
 * `shared/materialPricing.ts` flags every unpriced material and the Materials
 * screen filters to exactly those. This needs the same treatment and needs it
 * more, and the asymmetry is worth stating because it decides how loud the flag
 * has to be:
 *
 *   - a price that is not set understates ONE line by the cost of one part;
 *   - an hour that is not set is multiplied by the labor rate on EVERY line
 *     that touches that material, on every bid, for as long as it is unset.
 *
 * CLAUDE.md makes the same argument about the labor RATE — "an unpriced
 * material understates one line, while the rate multiplies every line at once"
 * — and a labor unit sits on the same side of it.
 *
 * ── Why NULL here where money uses zero ──────────────────────────────────────
 * `needsPricing` reads a zero `costPerUnit` as unpriced, and its reasoning is
 * good: a zero cannot drift out of step with itself the way a separate
 * "has been priced" flag would. That argument does not carry over, because it
 * rests on $0 never being a real answer for a part you buy.
 *
 * **Zero hours is a real answer.** Wire nuts add no time of their own when they
 * are made up as part of terminating a device; a pull string costs nothing to
 * leave in a pipe you are already running. So NULL and 0 have to mean different
 * things, which is CLAUDE.md § rule 6 — money-unset renders 0 and shouts,
 * MEASUREMENT-unset must never render as 0.
 *
 * NULL is not the `pricedAt` column `materialPricing` rejects. That would be a
 * second fact maintained alongside the number. This is the number's own
 * absence, and it cannot disagree with itself.
 */

/** Hours per unit of sale, as the column stores it or as tRPC hands it over. */
export type LaborUnit = string | number | null | undefined;

/**
 * The most hours a single labor unit may carry — per unit of sale, or per
 * field bend. Shared so the editor refuses exactly what the server refuses.
 */
export const MAX_LABOR_UNIT_HOURS = 12;

/**
 * The labor unit as a number, or NULL when nobody has set one.
 *
 * A non-numeric value is a broken row and comes back NULL, so it lands in the
 * same worklist as an unset one rather than passing silently as zero hours —
 * which is the one outcome that would price work at nothing without saying so.
 */
export function laborUnitHours(value: LaborUnit): number | null {
  if (value == null) return null;
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours)) return null;
  return hours;
}

/**
 * True when this material still needs the user's own labor unit.
 *
 * ── A deliberate zero is NOT flagged, and that is the difference from price ──
 * `needsPricing` keeps flagging a genuinely-free material for ever, and says so
 * as an accepted cost. Here the user can settle the question: typing 0 means
 * "this really does add no time" and the row goes quiet. That is only possible
 * because the column is nullable, and it is most of the reason it is.
 */
export function needsLaborUnit(value: LaborUnit): boolean {
  return laborUnitHours(value) === null;
}

/** How many of these still need a labor unit. Drives the filter's count. */
export function countNeedingLaborUnit(
  materials: readonly { laborHours: LaborUnit }[]
): number {
  return materials.reduce(
    (n, m) => (needsLaborUnit(m.laborHours) ? n + 1 : n),
    0
  );
}

// ── What one component line contributes ──────────────────────────────────────
/**
 * One line of a recipe: a material, how many, and this recipe's own override.
 *
 * Takes the ROW rather than destructured fields, for the reason CLAUDE.md gives
 * about `circuitWire`: a mapping with nothing to destructure has nothing to
 * forget, and a field that goes missing on the way into an arithmetic function
 * does not announce itself — it is a smaller number on a bid.
 */
export type ComponentLine = {
  qty: string | number;
  /** The material's own default. */
  laborHours: LaborUnit;
  /** This recipe's disagreement with it. NULL means follow the material. */
  overrideLaborHours?: LaborUnit;
};

/**
 * Hours for ONE unit of this component, override first, then the material.
 *
 * NULL when neither is set — not zero. A caller that flattened this to zero
 * would report a recipe as fully costed while part of it had never been
 * answered for, which is the failure this whole module exists to make visible.
 */
export function componentLaborUnit(line: ComponentLine): number | null {
  const override = laborUnitHours(line.overrideLaborHours);
  if (override !== null) return override;
  return laborUnitHours(line.laborHours);
}

/** The components' own hours, and how much of the recipe is unanswered. */
export type ComponentLabor = {
  /** Sum of unit hours × qty, over the lines that HAVE a unit. */
  hours: number;
  /** Lines with no unit anywhere. The sum above is short by these. */
  unsetCount: number;
};

/**
 * What a recipe's parts add up to.
 *
 * `unsetCount` travels with the number and is not optional, because a sum with
 * three unanswered lines in it looks exactly like a complete one. Every caller
 * has to receive the caveat even if it chooses not to show it.
 */
export function componentLabor(
  lines: readonly ComponentLine[]
): ComponentLabor {
  let hours = 0;
  let unsetCount = 0;
  for (const line of lines) {
    const unit = componentLaborUnit(line);
    if (unit === null) {
      unsetCount++;
      continue;
    }
    const qty = typeof line.qty === "number" ? line.qty : Number(line.qty);
    if (!Number.isFinite(qty)) {
      unsetCount++;
      continue;
    }
    hours += unit * qty;
  }
  return { hours: round4(hours), unsetCount };
}

// ── The ownership rule ───────────────────────────────────────────────────────
/**
 * THE TYPED NUMBER ON AN ASSEMBLY PRICES. ALWAYS. THE PARTS NEVER ADD TO IT.
 *
 * ── Why this is a function and not a sentence in a comment ───────────────────
 * Hours can now live in two places — on an assembly, and on each of its
 * components — and two places is two chances to add the same work twice. The
 * rule that stops it is one line long and would survive exactly until somebody
 * editing a pricing path wrote the obvious thing.
 *
 * So it is shaped like `totalVerticalFeet` in `shared/takeoffHeights.ts`, which
 * solves the same problem for run and stamp verticals: **decide ownership
 * before summing anything**, in one function, and return the two figures under
 * names that make adding them together read as the mistake it is.
 *
 * ── Why the parts must not win, in the estimator's words ─────────────────────
 * A duplex rough-in is 0.45 h because that is what doing the whole thing at
 * once takes — laying out, boxing, pulling, making up and trimming as one
 * operation. Summing box + device + plate + wire + nuts describes somebody
 * doing five unrelated jobs, and throws away the efficiency being claimed.
 * The typed number IS the claim.
 *
 * ── The cross-check is information, never a correction ───────────────────────
 * `componentHours` goes on the screen beside the typed number — "your parts add
 * to 0.62, you typed 0.45" — always visible and never styled as a warning. The
 * gap is the efficiency. A screen that nags toward closing it is arguing with
 * the model, and would teach the estimator to make their honest number worse.
 */
export type AssemblyLabor = {
  /** What prices. The typed number, plus the assembly's own overhead hours. */
  pricedHours: number;
  /** The parts' own total. SHOWN beside `pricedHours`, never added to it. */
  crossCheckHours: number;
  /** Components with no labor unit anywhere — `crossCheckHours` is short. */
  crossCheckUnsetCount: number;
};

export function laborForAssembly(input: {
  /** `assemblies.baseLaborHours` — entered by hand, and the whole answer. */
  typedHours: number;
  /** `assemblies.overheadLaborHours` — setup and trip time, also by hand. */
  overheadHours?: number;
  components: readonly ComponentLine[];
}): AssemblyLabor {
  const components = componentLabor(input.components);
  return {
    // Nothing from `components` reaches this line, and that is the guard.
    pricedHours: round4(input.typedHours + (input.overheadHours ?? 0)),
    crossCheckHours: components.hours,
    crossCheckUnsetCount: components.unsetCount,
  };
}

/**
 * A TRACED RUN has no typed number, so here the materials ARE the answer.
 *
 * ── Why the opposite rule is right on a run ──────────────────────────────────
 * An assembly is a named operation somebody costed as a whole. A run is not: it
 * is however many feet the drawing turned out to be, of a type assembled from a
 * raceway and some conductors. There is no "doing it all at once" figure to
 * claim, so the parts are the only honest source — and reading them means one
 * number, maintained once, prices both a run and an assembly that uses the same
 * material. See `references/takeoff-spec.md` D17.
 *
 * `unsetCount` matters more here than anywhere: a run whose pipe has a labor
 * unit and whose wire does not reports a confident, low number. Same shape as
 * the half-counted vertical, and it gets surfaced the same way.
 */
export function laborForRun(
  materials: readonly ComponentLine[]
): ComponentLabor {
  return componentLabor(materials);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
