/**
 * A part "from the traced run" (per-foot-items-plan.md § 3d, § 8): GR2's
 * pipe falls back to its own 10 ft labelled "default length", the tape is
 * NOT PRICED with nothing traced, and traced beats typed beats default.
 */
import { describe, expect, it } from "vitest";
import {
  qtySourceOf,
  tracedCoverage,
  tracedPartQty,
  type TracedCoverage,
} from "../shared/tracedParts";
import { PLANNED_STARTER_ASSEMBLIES } from "./seed/starterAssemblies";

const NONE: TracedCoverage = { state: "none" };

/** GR2's 2" PVC, read from the shipped recipe rather than restated. */
const GR2_PIPE_FEET = (() => {
  const gr2 = PLANNED_STARTER_ASSEMBLIES.find(
    a => a.name === "Service upgrade 200A, underground"
  );
  const pipe = gr2?.materials.find(m => m.part === "2in-pvc-sch-40");
  if (!pipe) throw new Error('GR2 or its 2" PVC is gone from the starters');
  return pipe.qty;
})();

const pipe = (
  coverage: TracedCoverage,
  answer: Parameters<typeof tracedPartQty>[0]["answer"] = null
) =>
  tracedPartQty({
    source: "traced_or_default",
    name: '2" PVC Sch 40',
    defaultQty: GR2_PIPE_FEET,
    coverage,
    answer,
  });

const tape = (
  coverage: TracedCoverage,
  answer: Parameters<typeof tracedPartQty>[0]["answer"] = null
) =>
  tracedPartQty({
    source: "traced",
    name: "tape",
    defaultQty: null,
    coverage,
    answer,
  });

describe("no trench traced", () => {
  it("prices GR2's pipe at its own 10 ft, labelled default length", () => {
    expect(GR2_PIPE_FEET).toBe(10);
    expect(pipe(NONE)).toMatchObject({
      source: "default",
      priceQty: 10,
      notPriced: false,
      why: '2" PVC Sch 40: 10 ft, default length — no run traced',
    });
  });

  it("leaves the tape NOT PRICED — never 1 ft, never $0", () => {
    expect(tape(NONE)).toMatchObject({
      source: "notPriced",
      priceQty: null,
      notPriced: true,
      why: "+ tape not priced — no run traced",
    });
  });

  it("names the missing scale when the run cannot be measured", () => {
    const unmeasured: TracedCoverage = { state: "unmeasurable" };
    expect(pipe(unmeasured)).toMatchObject({ source: "default", priceQty: 10 });
    expect(pipe(unmeasured).why).toContain("the run's sheet has no scale");
    expect(tape(unmeasured).why).toContain("the run's sheet has no scale");
  });

  it("is not priced if a default-length part somehow has no default frozen", () => {
    const got = tracedPartQty({
      source: "traced_or_default",
      name: "pipe",
      defaultQty: null,
      coverage: NONE,
      answer: null,
    });
    expect(got).toMatchObject({ priceQty: null, notPriced: true });
  });
});

describe("one line, not two", () => {
  it("prices nothing on the assembly line when a run covers the part", () => {
    const covered: TracedCoverage = { state: "covered", feet: 52 };
    expect(pipe(covered)).toMatchObject({
      source: "traced",
      priceQty: 0,
      tracedFeet: 52,
      notPriced: false,
    });
    expect(tape(covered)).toMatchObject({ source: "traced", priceQty: 0 });
  });
});

describe("traced beats typed beats default", () => {
  it("typed replaces the default", () => {
    expect(pipe(NONE, { feet: 40 })).toMatchObject({
      source: "typed",
      priceQty: 40,
    });
  });

  it("traced replaces typed and keeps the typed figure to show", () => {
    const got = pipe({ state: "covered", feet: 52 }, { feet: 40 });
    expect(got).toMatchObject({
      source: "traced",
      priceQty: 0,
      replacedFeet: 40,
    });
    expect(got.why).toContain("replaces 40 ft typed");
  });

  it("taking the run away brings the typed figure back", () => {
    expect(pipe(NONE, { feet: 40 })).toMatchObject({ priceQty: 40 });
  });

  it("a typed tape clears its not-priced", () => {
    expect(tape(NONE, { feet: 35 })).toMatchObject({
      source: "typed",
      priceQty: 35,
      notPriced: false,
    });
  });
});

describe("not on this job", () => {
  it("prices 0 and is not counted as not priced", () => {
    expect(tape(NONE, { notOnJob: true })).toMatchObject({
      source: "notOnJob",
      priceQty: 0,
      notPriced: false,
    });
  });

  it("undoing it brings the not-priced back", () => {
    expect(tape(NONE, null).notPriced).toBe(true);
  });
});

describe("fixed parts are today's behaviour", () => {
  it("prices the part's own quantity, whatever is traced", () => {
    const got = tracedPartQty({
      source: "fixed",
      name: "Ground rod",
      defaultQty: 2,
      coverage: { state: "covered", feet: 99 },
      answer: null,
    });
    expect(got).toMatchObject({ source: "fixed", priceQty: 2 });
  });

  it("reads a NULL or unknown stored source as fixed", () => {
    expect(qtySourceOf(null)).toBe("fixed");
    expect(qtySourceOf("bogus")).toBe("fixed");
    expect(qtySourceOf("traced_or_default")).toBe("traced_or_default");
  });
});

describe("coverage", () => {
  const TAPE_LINEAGE = 501;
  const PIPE_LINEAGE = 502;

  it("is covered when a type carrying the material measured feet", () => {
    expect(
      tracedCoverage(TAPE_LINEAGE, [
        { materialLineage: TAPE_LINEAGE, feet: 30, unmeasurableCount: 0 },
        { materialLineage: TAPE_LINEAGE, feet: 22.5, unmeasurableCount: 1 },
        { materialLineage: PIPE_LINEAGE, feet: 99, unmeasurableCount: 0 },
      ])
    ).toEqual({ state: "covered", feet: 52.5 });
  });

  it("is unmeasurable when the only matching runs have no scale", () => {
    expect(
      tracedCoverage(TAPE_LINEAGE, [
        { materialLineage: TAPE_LINEAGE, feet: 0, unmeasurableCount: 2 },
      ])
    ).toEqual({ state: "unmeasurable" });
  });

  it("is none when nothing traced carries it", () => {
    expect(
      tracedCoverage(TAPE_LINEAGE, [
        { materialLineage: PIPE_LINEAGE, feet: 40, unmeasurableCount: 0 },
      ])
    ).toEqual({ state: "none" });
  });
});
