/**
 * The plan co-pilot's reading rules, without a model and without a database.
 *
 * Everything that decides what a user is OFFERED lives in shared/ and is pure,
 * which is the point of putting it there: the cases worth pinning are the ugly
 * ones — a smudged mark, a symbol nobody has linked, a reply that is half
 * nonsense — and none of them are reachable by asking a real model nicely.
 *
 * The load-bearing assertion in this file is the third confidence tier. Two
 * tiers is the easy design and the wrong one: it has no way to say "I could not
 * read this", so it says "22% sure it's a receptacle" instead, and that lands in
 * the same list as the ones that are right, one click from a quantity on a bid.
 */
import { describe, it, expect } from "vitest";
import {
  classifyConfidence,
  canPropose,
  HIGH_CONFIDENCE_FLOOR,
  LOW_CONFIDENCE_FLOOR,
  CONFIDENCE_TIERS,
} from "../shared/copilotConfidence";
import {
  COPILOT_ACTIONS,
  MODEL_INVOCABLE_ACTIONS,
  canPerform,
  resolveCopilotAction,
} from "../shared/copilotActions";
import {
  buildFindings,
  dedupe,
  isAcceptable,
  summariseFindings,
  MERGE_RADIUS_POINTS,
  type LegendSymbol,
} from "../shared/copilotDetection";
import { extractPlanIssuer, planSourceKey } from "../shared/planSource";
import { CONFIDENCE_TIER_VALUES } from "../drizzle/schema";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LINKED: LegendSymbol = {
  id: 1,
  label: "Duplex receptacle",
  lookupKey: "duplex receptacle",
  assemblyId: 100,
  assemblyName: "Duplex recep, 20A",
};
const ALSO_LINKED: LegendSymbol = {
  id: 2,
  label: "Single pole switch",
  lookupKey: "single pole switch",
  assemblyId: 101,
  assemblyName: "Switch, single pole",
};
/** Captured off a legend but never linked — the "which assembly?" state. */
const UNLINKED: LegendSymbol = {
  id: 3,
  label: "Floor box",
  lookupKey: "floor box",
  assemblyId: null,
  assemblyName: null,
};

const SYMBOLS = [LINKED, ALSO_LINKED, UNLINKED];

const PAGE = { pageWidthPoints: 1000, pageHeightPoints: 800 };

const context = (over: Partial<Parameters<typeof buildFindings>[1]> = {}) => ({
  symbols: SYMBOLS,
  ...PAGE,
  ...over,
});

// ── Confidence tiering ───────────────────────────────────────────────────────

describe("confidence tiering", () => {
  const solid = {
    score: 0.92,
    legible: true,
    hasPosition: true,
    linkedToAssembly: true,
  };

  it("calls a clean match on a linked symbol high confidence", () => {
    expect(classifyConfidence(solid).tier).toBe("high");
  });

  it("keeps a middling score on a linked symbol at low, not high", () => {
    const verdict = classifyConfidence({ ...solid, score: 0.6 });
    expect(verdict.tier).toBe("low");
    expect(verdict.score).toBe(0.6);
  });

  it("never lets an unlinked symbol reach high, however sure the model is", () => {
    // The whole reason symbol meaning comes from the user's legend: if nothing
    // says what this mark means, certainty about its SHAPE is not certainty
    // about what to stamp.
    const verdict = classifyConfidence({
      ...solid,
      score: 0.99,
      linkedToAssembly: false,
    });
    expect(verdict.tier).toBe("low");
    expect(verdict.reason).toMatch(/link/i);
  });

  it("puts the high/low boundary exactly at the floor", () => {
    expect(
      classifyConfidence({ ...solid, score: HIGH_CONFIDENCE_FLOOR }).tier
    ).toBe("high");
    expect(
      classifyConfidence({ ...solid, score: HIGH_CONFIDENCE_FLOOR - 0.0001 })
        .tier
    ).toBe("low");
  });
});

describe("the unreadable tier — no silent guessing", () => {
  const base = {
    score: 0.9,
    legible: true,
    hasPosition: true,
    linkedToAssembly: true,
  };

  it("treats 'I cannot make it out' as unreadable even at a high score", () => {
    // The failure this whole tier exists to prevent: a model that says it
    // cannot read the mark and then quotes a number anyway.
    const verdict = classifyConfidence({ ...base, legible: false });
    expect(verdict.tier).toBe("unreadable");
  });

  it("does NOT downgrade a below-floor score into a low-confidence proposal", () => {
    const verdict = classifyConfidence({
      ...base,
      score: LOW_CONFIDENCE_FLOOR - 0.01,
    });
    expect(verdict.tier).toBe("unreadable");
    expect(verdict.tier).not.toBe("low");
  });

  it("refuses a reading with no usable score rather than assuming one", () => {
    for (const score of [null, undefined, NaN, Infinity, -0.5, 1.4]) {
      expect(classifyConfidence({ ...base, score }).tier).toBe("unreadable");
    }
  });

  it("refuses a finding that could not be placed on the sheet", () => {
    // A count with nowhere to point cannot be checked against the drawing, and
    // an unverifiable count is one that should not reach a bid.
    expect(classifyConfidence({ ...base, hasPosition: false }).tier).toBe(
      "unreadable"
    );
  });

  it("proposes nothing for an unreadable finding", () => {
    expect(canPropose("unreadable")).toBe(false);
    expect(canPropose("high")).toBe(true);
    expect(canPropose("low")).toBe(true);
  });
});

// ── The allowed-action list ──────────────────────────────────────────────────

describe("the allowed-action list is the guardrail", () => {
  it("requires confirmation on every action that writes", () => {
    // The invariant the whole config exists to hold. A new row that writes
    // without confirmation must fail here — and in fact fails earlier, at
    // import time, which is why this test asserts the shape rather than
    // expecting a throw.
    for (const action of COPILOT_ACTIONS) {
      if (action.writes) expect(action.requiresConfirmation).toBe(true);
    }
  });

  it("never offers a writing action to the model", () => {
    for (const action of MODEL_INVOCABLE_ACTIONS) {
      expect(action.writes).toBe(false);
    }
  });

  it("has no action at all that puts an unreadable mark on the bid", () => {
    // The rule the third tier exists to make enforceable, asserted over the
    // whole table rather than over the one action that happens to write today.
    for (const action of COPILOT_ACTIONS) {
      if (action.placesWork) {
        expect(action.allowedConfidence).not.toContain("unreadable");
      }
    }
    expect(COPILOT_ACTIONS.some(a => a.placesWork)).toBe(true);
  });

  it("still lets a user correct an unreadable mark", () => {
    // The escape hatch, and why the rule attaches to placesWork rather than to
    // writes: telling the app that a smudge is really a floor box is exactly
    // how an illegible mark stops being a dead end.
    expect(
      resolveCopilotAction("record_correction")!.allowedConfidence
    ).toContain("unreadable");
    expect(
      canPerform({
        actionId: "record_correction",
        confirmed: true,
        confidence: "unreadable",
      }).allowed
    ).toBe(true);
  });

  it("marks anything that places work as writing, and requiring confirmation", () => {
    for (const action of COPILOT_ACTIONS) {
      if (action.placesWork) {
        expect(action.writes).toBe(true);
        expect(action.requiresConfirmation).toBe(true);
      }
    }
  });

  it("refuses an action the model invented", () => {
    const verdict = canPerform({
      actionId: "delete_every_bid",
      confirmed: true,
      fromModel: true,
    });
    expect(verdict.allowed).toBe(false);
  });

  it("refuses a writing action asked for by the model, even confirmed", () => {
    // Belt and braces: confirm_stamps is not in the model's enum at all, so
    // this is unreachable through the prompt. It is still refused here, because
    // "unreachable" is a property of today's schema and this is a rule.
    const verdict = canPerform({
      actionId: "confirm_stamps",
      confirmed: true,
      fromModel: true,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason).toMatch(
      /only be started by the user/i
    );
  });

  it("refuses a write that nobody confirmed", () => {
    const verdict = canPerform({
      actionId: "confirm_stamps",
      confirmed: false,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason).toMatch(
      /confirmation/i
    );
  });

  it("refuses to stamp an unreadable finding even with a confirmation", () => {
    const verdict = canPerform({
      actionId: "confirm_stamps",
      confirmed: true,
      confidence: "unreadable",
    });
    expect(verdict.allowed).toBe(false);
  });

  it("allows a confirmed stamp of a readable finding", () => {
    for (const confidence of ["high", "low"] as const) {
      expect(
        canPerform({ actionId: "confirm_stamps", confirmed: true, confidence })
          .allowed
      ).toBe(true);
    }
  });
});

// ── Raw model output → findings ──────────────────────────────────────────────

describe("building findings from a reply", () => {
  it("resolves a label to the assembly the user's legend links it to", () => {
    const [finding] = buildFindings(
      [{ symbol: "Duplex receptacle", x: 0.5, y: 0.25, confidence: 0.9 }],
      context()
    );
    expect(finding.assemblyId).toBe(100);
    expect(finding.assemblyName).toBe("Duplex recep, 20A");
    expect(finding.confidence).toBe("high");
  });

  it("converts 0–1 positions into PDF page points", () => {
    const [finding] = buildFindings(
      [{ symbol: "Duplex receptacle", x: 0.5, y: 0.25, confidence: 0.9 }],
      context()
    );
    expect(finding.x).toBe(500);
    expect(finding.y).toBe(200);
  });

  it("offers a symbol nobody has linked at low confidence, for linking", () => {
    // Exactly the existing manual flow, not a second one.
    const [finding] = buildFindings(
      [{ symbol: "Floor box", x: 0.2, y: 0.2, confidence: 0.95 }],
      context()
    );
    expect(finding.confidence).toBe("low");
    expect(finding.needsLink).toBe(true);
    expect(finding.assemblyId).toBeNull();
    expect(isAcceptable(finding)).toBe(false);
  });

  it("treats a symbol not in the legend as unlinked rather than inventing one", () => {
    const [finding] = buildFindings(
      [{ symbol: "Quad recep w/ USB", x: 0.4, y: 0.4, confidence: 0.88 }],
      context()
    );
    expect(finding.symbolLinkId).toBeNull();
    expect(finding.assemblyId).toBeNull();
    expect(finding.confidence).toBe("low");
  });

  it("strips the assembly off an unreadable finding entirely", () => {
    // Even when the label resolves cleanly. An unreadable mark proposes
    // nothing — not a hedged version of the thing it might have been.
    const [finding] = buildFindings(
      [
        {
          symbol: "Duplex receptacle",
          x: 0.5,
          y: 0.5,
          confidence: 0.95,
          legible: false,
        },
      ],
      context()
    );
    expect(finding.confidence).toBe("unreadable");
    expect(finding.assemblyId).toBeNull();
    expect(finding.assemblyName).toBeNull();
    expect(isAcceptable(finding)).toBe(false);
  });

  it("merges two detections of one mark instead of doubling the quantity", () => {
    const findings = buildFindings(
      [
        { symbol: "Duplex receptacle", x: 0.5, y: 0.5, confidence: 0.8 },
        { symbol: "Duplex receptacle", x: 0.5002, y: 0.5001, confidence: 0.95 },
      ],
      context()
    );
    expect(findings).toHaveLength(1);
    // The survivor is the more confident one, so merging never lowers what the
    // user is shown.
    expect(findings[0].score).toBe(0.95);
  });

  it("keeps two genuinely separate devices apart", () => {
    const findings = buildFindings(
      [
        { symbol: "Duplex receptacle", x: 0.2, y: 0.2, confidence: 0.9 },
        { symbol: "Duplex receptacle", x: 0.8, y: 0.8, confidence: 0.9 },
      ],
      context()
    );
    expect(findings).toHaveLength(2);
  });

  it("does not merge different symbols that happen to sit together", () => {
    // A switch drawn beside a receptacle is two devices, not one seen twice.
    const findings = buildFindings(
      [
        { symbol: "Duplex receptacle", x: 0.5, y: 0.5, confidence: 0.9 },
        { symbol: "Single pole switch", x: 0.5, y: 0.5, confidence: 0.9 },
      ],
      context()
    );
    expect(findings).toHaveLength(2);
  });

  it("sorts confident work first and the manual-review flags last", () => {
    const findings = buildFindings(
      [
        { symbol: "??", x: 0.1, y: 0.1, confidence: 0.2 },
        { symbol: "Floor box", x: 0.2, y: 0.2, confidence: 0.9 },
        { symbol: "Duplex receptacle", x: 0.3, y: 0.3, confidence: 0.95 },
      ],
      context()
    );
    expect(findings.map(f => f.confidence)).toEqual([
      "high",
      "low",
      "unreadable",
    ]);
  });
});

// ── Messy input ──────────────────────────────────────────────────────────────

describe("a messy, low-quality reply degrades instead of misleading", () => {
  /**
   * The kind of thing that actually comes back from a scanned fax of a plan:
   * some good rows, some with coordinates off the page, some with the score as
   * a string, some with nothing in them at all, and some outright garbage.
   */
  const MESSY = [
    { symbol: "Duplex receptacle", x: 0.31, y: 0.44, confidence: 0.93 },
    // A number as a string — a formatting slip, not an unreadable mark.
    { symbol: "Single pole switch", x: "0.62", y: "0.18", confidence: "0.81" },
    // Off the page. Refused rather than clamped to the edge.
    { symbol: "Duplex receptacle", x: 1.7, y: -0.3, confidence: 0.9 },
    // Said it could not read it.
    {
      symbol: "smudge",
      x: 0.5,
      y: 0.5,
      confidence: 0.4,
      legible: false,
      note: "ink blot",
    },
    // Score below the floor.
    { symbol: "maybe a switch?", x: 0.7, y: 0.7, confidence: 0.11 },
    // Nothing to name, nowhere to point.
    {},
    // Not an object at all.
    "receptacle x12",
    null,
    42,
    // Confidence as prose.
    { symbol: "Duplex receptacle", x: 0.9, y: 0.9, confidence: "very sure" },
  ];

  it("returns findings rather than throwing", () => {
    expect(() => buildFindings(MESSY, context())).not.toThrow();
  });

  it("keeps the readable rows and reads the numeric strings", () => {
    const findings = buildFindings(MESSY, context());
    const switchFinding = findings.find(
      f => f.rawLabel === "Single pole switch"
    )!;
    expect(switchFinding.confidence).toBe("high");
    expect(switchFinding.x).toBeCloseTo(620, 4);
  });

  it("flags every unusable row for manual review rather than dropping it silently", () => {
    // A dropped detection is invisible; a flagged one tells the user there is
    // something at that spot the app could not read.
    const findings = buildFindings(MESSY, context());
    const flagged = findings.filter(f => f.confidence === "unreadable");
    expect(flagged.map(f => f.rawLabel).sort()).toEqual([
      "Duplex receptacle", // off-page coordinates
      "Duplex receptacle", // confidence as prose
      "maybe a switch?",
      "smudge",
    ]);
  });

  it("proposes nothing that a user could accept from an unusable row", () => {
    const findings = buildFindings(MESSY, context());
    for (const finding of findings.filter(f => f.confidence === "unreadable")) {
      expect(finding.assemblyId).toBeNull();
      expect(isAcceptable(finding)).toBe(false);
    }
  });

  it("drops only the rows with nothing to say at all", () => {
    // {}, a bare string, null and 42 — a flag pointing at nowhere is noise a
    // user cannot act on.
    const findings = buildFindings(MESSY, context());
    expect(findings).toHaveLength(MESSY.length - 4);
  });

  it("survives a reply that is not a list", () => {
    for (const junk of [null, undefined, {}, "items", 7]) {
      expect(buildFindings(junk, context())).toEqual([]);
    }
  });

  it("carries the model's note through on a flagged mark", () => {
    const findings = buildFindings(MESSY, context());
    expect(findings.find(f => f.rawLabel === "smudge")!.note).toBe("ink blot");
  });

  it("counts the tiers for the panel header", () => {
    const counts = summariseFindings(buildFindings(MESSY, context()));
    expect(counts.high).toBe(2);
    expect(counts.unreadable).toBe(4);
    expect(counts.acceptable).toBe(2);
  });

  it("caps a model that has lost the plot", () => {
    // Three thousand copies of one detection, each far enough apart to survive
    // deduping. The cap is what stops one bad reply flooding a sheet.
    const runaway = Array.from({ length: 3000 }, (_, i) => ({
      symbol: "Duplex receptacle",
      x: (i % 900) / 1000 + 0.05,
      y: Math.floor(i / 900) / 100 + 0.05,
      confidence: 0.9,
    }));
    expect(buildFindings(runaway, context()).length).toBeLessThanOrEqual(400);
  });
});

// ── Personalization: corrections are applied, and are per source ─────────────

describe("remembered corrections steer the next reading", () => {
  it("re-points a misread label at the symbol the user chose", () => {
    const [finding] = buildFindings(
      [{ symbol: "DUP RECP", x: 0.4, y: 0.4, confidence: 0.8 }],
      context({
        corrections: [
          { rawLabel: "dup recp", symbolLinkId: LINKED.id, timesApplied: 1 },
        ],
      })
    );
    expect(finding.assemblyId).toBe(100);
    expect(finding.fromCorrection).toBe(true);
    // Correcting the meaning does not by itself make it certain — the score
    // still decides the tier.
    expect(finding.confidence).toBe("high");
  });

  it("prefers the correction the user has made most often", () => {
    const [finding] = buildFindings(
      [{ symbol: "SW", x: 0.4, y: 0.4, confidence: 0.9 }],
      context({
        corrections: [
          { rawLabel: "sw", symbolLinkId: LINKED.id, timesApplied: 1 },
          { rawLabel: "SW", symbolLinkId: ALSO_LINKED.id, timesApplied: 6 },
        ],
      })
    );
    expect(finding.assemblyId).toBe(101);
  });

  it("stays inert when the corrected symbol has since been deleted", () => {
    // A stale correction must not fail the whole reading, just stop applying.
    const [finding] = buildFindings(
      [{ symbol: "Duplex receptacle", x: 0.4, y: 0.4, confidence: 0.9 }],
      context({
        corrections: [
          {
            rawLabel: "Duplex receptacle",
            symbolLinkId: 9999,
            timesApplied: 3,
          },
        ],
      })
    );
    expect(finding.assemblyId).toBe(100);
    expect(finding.fromCorrection).toBe(false);
  });

  it("does nothing for a label it was not taught", () => {
    const [finding] = buildFindings(
      [{ symbol: "GFI", x: 0.4, y: 0.4, confidence: 0.9 }],
      context({
        corrections: [
          { rawLabel: "dup recp", symbolLinkId: LINKED.id, timesApplied: 4 },
        ],
      })
    );
    expect(finding.fromCorrection).toBe(false);
    expect(finding.assemblyId).toBeNull();
  });
});

// ── Which plan set a correction belongs to ───────────────────────────────────

describe("plan source keys", () => {
  it("reads a labelled architect off a title block", () => {
    expect(
      extractPlanIssuer(
        'SHEET E-101\nARCHITECT: Halsted & Pike Architects\nSCALE: 1/4"'
      )
    ).toBe("Halsted & Pike Architects");
  });

  it("finds a firm-shaped name with no label", () => {
    expect(
      extractPlanIssuer("GENERAL NOTES\nMeridian Design Group\n1234 Elm St")
    ).toBe("Meridian Design Group");
  });

  it("does not turn ordinary sheet text into an architect", () => {
    expect(
      extractPlanIssuer(
        "PANEL SCHEDULE\nLIGHTING PLAN\nFIRST FLOOR\nNOT TO SCALE"
      )
    ).toBeNull();
    expect(extractPlanIssuer("")).toBeNull();
    expect(extractPlanIssuer(null)).toBeNull();
  });

  it("ignores a label nobody filled in", () => {
    expect(extractPlanIssuer("ARCHITECT: ___\nENGINEER: 12")).toBeNull();
  });

  it("files two sheets of one plan set under the same key", () => {
    // The point of stripping sheet numbers and revisions: E-101 and E-102 of
    // the same submission are one source, or a correction never gets reused.
    expect(planSourceKey({ filename: "Oakwood Commons E-101 Rev3.pdf" })).toBe(
      planSourceKey({ filename: "Oakwood Commons E-102.pdf" })
    );
  });

  it("prefers the firm over the filename when both are known", () => {
    const key = planSourceKey({
      issuer: "Halsted & Pike Architects",
      filename: "randomly-named-download.pdf",
    });
    expect(key.startsWith("firm:")).toBe(true);
  });

  it("normalises spacing and case the way symbol lookups do", () => {
    expect(planSourceKey({ issuer: "Halsted  &  PIKE  Architects" })).toBe(
      planSourceKey({ issuer: "halsted & pike architects" })
    );
  });

  it("returns a named unknown rather than a blank key", () => {
    // A blank key would silently pool every unidentifiable plan set together,
    // which is worse than not matching at all.
    expect(planSourceKey({})).toBe("unknown");
    expect(planSourceKey({ issuer: "", filename: "" })).toBe("unknown");
  });
});

// ── The two tier lists must not drift ────────────────────────────────────────

describe("schema and shared agree on the tiers", () => {
  it("lists the same three tiers on both sides", () => {
    // drizzle/schema.ts restates the tiers because drizzle-kit reads it without
    // the app's imports. That restatement is only safe if something checks it.
    expect([...CONFIDENCE_TIER_VALUES]).toEqual([...CONFIDENCE_TIERS]);
  });
});

// ── Dedupe radius ────────────────────────────────────────────────────────────

describe("the merge radius", () => {
  const at = (x: number, y: number) => ({
    key: `${x}`,
    rawLabel: "Duplex receptacle",
    symbolLinkId: 1,
    symbolLabel: "Duplex receptacle",
    assemblyId: 100,
    assemblyName: "Duplex recep, 20A",
    confidence: "high" as const,
    score: 0.9,
    reason: "",
    x,
    y,
    needsLink: false,
    fromCorrection: false,
    note: null,
  });

  it("merges just inside the radius and keeps just outside it", () => {
    expect(dedupe([at(0, 0), at(MERGE_RADIUS_POINTS - 0.1, 0)])).toHaveLength(
      1
    );
    expect(dedupe([at(0, 0), at(MERGE_RADIUS_POINTS + 0.1, 0)])).toHaveLength(
      2
    );
  });
});
