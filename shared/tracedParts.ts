/**
 * A PART "FROM THE TRACED RUN" — how much of it an assembly line prices.
 *
 * references/per-foot-items-plan.md § 3d. GR2 (200A underground service) and
 * GR5 (detached garage feeder) carry parts whose length is a trench's, not a
 * fixed figure. Each such part says where its quantity comes from (M3,
 * `assembly_materials.qtySource`):
 *
 *   fixed               today's meaning; NULL reads as this
 *   traced              from a traced run — nothing traced is NOT PRICED.
 *                       Underground tape.
 *   traced_or_default   from a traced run — nothing traced is the part's own
 *                       quantity, labelled "default length" (owner,
 *                       2026-10-08, decision 6). GR2's 10 ft of 2" PVC.
 *
 * ── One line, never two ──────────────────────────────────────────────────────
 * When a traced run COVERS the part, the run-type line holds the feet and the
 * money, and the assembly line prices none of it. Otherwise the same tape
 * would be bought once by the trench and again by GR2.
 *
 * ── Order: traced, then typed, then default ──────────────────────────────────
 * Traced always wins over a typed length, and typed over the default, so a
 * length can never be counted twice. A typed answer the trace overrides is
 * KEPT and reported, so taking the run away brings it back.
 *
 * ── Not wired yet ────────────────────────────────────────────────────────────
 * Pure. Its inputs come from M3 (`qtySource`) and M4 (`snapshotTracedParts`,
 * `tracedPartAnswers`), which Track A is building; nothing reads it until
 * those land, and the bid-screen half waits for Track B's gap 11.
 */

export const QTY_SOURCES = ["fixed", "traced", "traced_or_default"] as const;
export type QtySource = (typeof QTY_SOURCES)[number];

/** A stored value that is one of the three, or NULL for `fixed`. */
export function qtySourceOf(value: unknown): QtySource {
  return (QTY_SOURCES as readonly unknown[]).includes(value)
    ? (value as QtySource)
    : "fixed";
}

/**
 * Whether a traced run on this bid covers the part.
 *
 *   covered       some run type carrying this material measured > 0 ft
 *   unmeasurable  one does, but none of its runs could be measured
 *   none          nothing traced carries it
 */
export type TracedCoverage =
  | { state: "covered"; feet: number }
  | { state: "unmeasurable" }
  | { state: "none" };

/** One run type on the bid, as coverage needs it. */
export type CoverageCandidate = {
  /**
   * The material's LINEAGE — `baselineMaterialId ?? id` — so a company's fork
   * of the tape still matches a starter that names the shipped row.
   */
  materialLineage: number;
  /** Measured feet of that material on the type (raceway or extra). */
  feet: number;
  unmeasurableCount: number;
};

/**
 * Coverage of one part by the run types on a bid. A fitting that "follows
 * the pipe" (GR2's elbow and connectors) is covered by the PIPE's lineage —
 * the caller passes that one, not the fitting's own.
 */
export function tracedCoverage(
  materialLineage: number,
  candidates: readonly CoverageCandidate[]
): TracedCoverage {
  const matching = candidates.filter(
    c => c.materialLineage === materialLineage
  );
  const feet = round2(
    matching.reduce((sum, c) => sum + Math.max(0, c.feet), 0)
  );
  if (feet > 0) return { state: "covered", feet };
  if (matching.some(c => c.unmeasurableCount > 0))
    return { state: "unmeasurable" };
  return { state: "none" };
}

/** The estimator's answer on THIS line (M4, `tracedPartAnswers`). */
export type TracedPartAnswer = { feet: number } | { notOnJob: true } | null;

/**
 * What the assembly line does with one part.
 *
 *   priceQty      what the LINE prices: qty × the frozen unit cost. NULL is
 *                 not priced. 0 is priced at nothing on purpose.
 *   notPriced     counts in the bid's "+ N not priced"
 *   source        which rule decided it, for the label
 *   replacedFeet  a typed length the trace overrides, kept to show
 */
export type TracedPartQty = {
  source: "fixed" | "traced" | "typed" | "default" | "notOnJob" | "notPriced";
  priceQty: number | null;
  notPriced: boolean;
  /** Feet from the trace, when covered — shown, priced on the run-type line. */
  tracedFeet: number | null;
  replacedFeet: number | null;
  why: string;
};

export function tracedPartQty(input: {
  source: QtySource;
  /** For the sentence: `2" PVC Sch 40`. */
  name: string;
  /**
   * The part's own quantity, frozen on the line (M4 `defaultQty`). Read for
   * `fixed` and `traced_or_default`; NULL for a `traced` part.
   */
  defaultQty: number | null;
  coverage: TracedCoverage;
  answer: TracedPartAnswer;
}): TracedPartQty {
  const { source, name, defaultQty, coverage, answer } = input;
  const typed = answer && "feet" in answer ? answer.feet : null;

  if (source === "fixed") {
    return {
      source: "fixed",
      priceQty: defaultQty,
      notPriced: false,
      tracedFeet: null,
      replacedFeet: null,
      why: `${name}: ${trim(defaultQty ?? 0)}`,
    };
  }

  if (coverage.state === "covered") {
    return {
      source: "traced",
      priceQty: 0,
      notPriced: false,
      tracedFeet: coverage.feet,
      replacedFeet: typed,
      why:
        `${name}: ${trim(coverage.feet)} ft, from the traced run — priced on its run line` +
        (typed !== null ? ` (replaces ${trim(typed)} ft typed)` : ""),
    };
  }

  if (answer && "notOnJob" in answer) {
    return {
      source: "notOnJob",
      priceQty: 0,
      notPriced: false,
      tracedFeet: null,
      replacedFeet: null,
      why: `${name}: not on this job`,
    };
  }

  if (typed !== null) {
    return {
      source: "typed",
      priceQty: typed,
      notPriced: false,
      tracedFeet: null,
      replacedFeet: null,
      why: `${name}: ${trim(typed)} ft, typed`,
    };
  }

  const reason =
    coverage.state === "unmeasurable"
      ? "the run's sheet has no scale"
      : "no run traced";

  if (source === "traced_or_default" && defaultQty !== null) {
    return {
      source: "default",
      priceQty: defaultQty,
      notPriced: false,
      tracedFeet: null,
      replacedFeet: null,
      why: `${name}: ${trim(defaultQty)} ft, default length — ${reason}`,
    };
  }

  // `traced`, or a `traced_or_default` with no default frozen: never a guess.
  return {
    source: "notPriced",
    priceQty: null,
    notPriced: true,
    tracedFeet: null,
    replacedFeet: null,
    why: `+ ${name} not priced — ${reason}`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function trim(value: number): string {
  return String(round2(value));
}
