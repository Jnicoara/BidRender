/**
 * What one foot of a run type is made of.
 *
 * ── What is worth testing here, and what is not ──────────────────────────────
 * The arithmetic belongs to `componentLabor` and is tested next door. What is
 * tested here is the part that can be WRONG rather than merely broken: whether
 * a foot of cable is one foot of one thing or three, and whether a count or a
 * material nobody has supplied can slip through as a zero. Both produce a
 * number that looks finished — one three times too high, one quietly low — and
 * neither shows on screen as anything but a total.
 */
import { describe, it, expect } from "vitest";
import {
  runTypeComponentsPerFoot,
  laborPerFootForRunType,
  laborPerFootSentence,
} from "../shared/runTypeLabor";

describe("a conduit foot is pipe once and every conductor the full way", () => {
  it("adds the pipe, the conductors and the ground", () => {
    /*
      3/4" EMT at 0.04 h/ft, 3 #12 THHN at 0.0055 h per conductor-foot, and a
      bare ground at 0.004: 0.04 + 3(0.0055) + 0.004 = 0.0605 h per foot.
    */
    const labor = laborPerFootForRunType({
      pathType: "conduit",
      racewayMaterialId: 1,
      racewayLaborHours: 0.04,
      conductorMaterialId: 2,
      conductorLaborHours: 0.0055,
      conductorCount: 3,
      groundMaterialId: 3,
      groundLaborHours: 0.004,
      groundCount: 1,
    });
    expect(labor.hours).toBe(0.0605);
    expect(labor.unsetCount).toBe(0);
    expect(labor.complete).toBe(true);
  });

  it("moves when the conductor count does, which is what D17(b) was for", () => {
    /*
      The benefit the superseded option was picked to buy, got here for free.
      Changing 2 #12 to 3 #12 moves the labour by itself rather than leaving a
      type reading "3 #12" priced as if it were two.
    */
    const of = (conductorCount: number) =>
      laborPerFootForRunType({
        pathType: "conduit",
        racewayMaterialId: 1,
        racewayLaborHours: 0.04,
        conductorMaterialId: 2,
        conductorLaborHours: 0.01,
        conductorCount,
      }).hours;
    expect(of(2)).toBe(0.06);
    expect(of(3)).toBe(0.07);
  });

  it("prices an empty raceway as pipe alone, with nothing missing", () => {
    // A spare conduit is a real thing to trace, not a half-filled-in type.
    const labor = laborPerFootForRunType({
      pathType: "conduit",
      racewayMaterialId: 1,
      racewayLaborHours: 0.04,
    });
    expect(labor.hours).toBe(0.04);
    expect(labor.complete).toBe(true);
  });
});

describe("A CABLE IS ONE FOOT OF ONE THING", () => {
  it("does not multiply by what is inside the jacket", () => {
    /*
      THE TRAP THIS FILE EXISTS FOR. A 12-2 MC stores two conductors and one
      ground because that is what is in the jacket, and you still install one
      foot of cable per foot of run. Multiplying would bill it at 3x — a
      plausible-looking number, wrong in the direction nobody queries.
    */
    const labor = laborPerFootForRunType({
      pathType: "cable",
      conductorMaterialId: 2,
      conductorLaborHours: 0.03,
      conductorCount: 2,
      groundCount: 1,
    });
    expect(labor.hours).toBe(0.03);
    expect(runTypeComponentsPerFoot({ pathType: "cable" })).toHaveLength(1);
  });

  it("gives a cable's ground no line of its own", () => {
    /*
      It is inside the jacket and already paid for by the cable's own hours —
      the same rule the materials list states for footage. A ground line here
      would count the same ground twice, and would also report the type as
      incomplete for a wire nobody needs to name.
    */
    const labor = laborPerFootForRunType({
      pathType: "cable",
      conductorMaterialId: 2,
      conductorLaborHours: 0.03,
      groundMaterialId: 9,
      groundLaborHours: 0.004,
      groundCount: 1,
    });
    expect(labor.hours).toBe(0.03);
    expect(labor.complete).toBe(true);
  });
});

describe("nothing missing is ever read as zero", () => {
  it("counts a named conductor with no stated count as unset, not none", () => {
    /*
      The wire is named, so it IS in this run; how much of it is unanswered.
      Zero would price the pull at nothing and read as complete.
    */
    const labor = laborPerFootForRunType({
      pathType: "conduit",
      racewayMaterialId: 1,
      racewayLaborHours: 0.04,
      conductorMaterialId: 2,
      conductorLaborHours: 0.0055,
      conductorCount: null,
    });
    expect(labor.hours).toBe(0.04);
    expect(labor.unsetCount).toBe(1);
    expect(labor.complete).toBe(false);
  });

  it("counts a ground the type HAS but cannot name", () => {
    /*
      A type can say it carries a ground without saying which. Reading only the
      material link would drop that ground from the hours in silence.

      This test used to claim it described every shipped type. It does not:
      asked of the running app on 2026-09-20, both shipped conduit types name
      "#12 bare copper, solid". The state is still reachable — a half-filled-in
      type, or the backfilled "Conduit" row — which is why the case is here.
    */
    const labor = laborPerFootForRunType({
      pathType: "conduit",
      racewayMaterialId: 1,
      racewayLaborHours: 0.04,
      conductorMaterialId: 2,
      conductorLaborHours: 0.0055,
      conductorCount: 2,
      groundMaterialId: null,
      groundCount: 1,
    });
    expect(labor.hours).toBe(0.051);
    expect(labor.unsetCount).toBe(1);
  });

  it("counts an unnamed raceway on a conduit type — a pipe run has pipe", () => {
    const labor = laborPerFootForRunType({ pathType: "conduit" });
    expect(labor.hours).toBe(0);
    expect(labor.unsetCount).toBe(1);
    expect(labor.complete).toBe(false);
  });

  it("reports a wholly unspecified type as 0 h SHORT, never as 0 h", () => {
    /*
      CLAUDE.md § rule 6: money-unset renders 0 and shouts, MEASUREMENT-unset
      must never render as a considered zero. The pair of fields is what lets a
      screen tell "no hours" from "no hours yet".
    */
    const labor = laborPerFootForRunType({
      pathType: "conduit",
      conductorMaterialId: 2,
      conductorCount: 3,
      groundCount: 1,
    });
    expect(labor.hours).toBe(0);
    expect(labor.unsetCount).toBe(3);
  });

  it("treats a DELIBERATE zero ground count as answered", () => {
    // Zero is a real answer — this type carries no ground — and must go quiet,
    // which is most of the reason the column is nullable at all.
    const labor = laborPerFootForRunType({
      pathType: "conduit",
      racewayMaterialId: 1,
      racewayLaborHours: 0.04,
      conductorMaterialId: 2,
      conductorLaborHours: 0.01,
      conductorCount: 2,
      groundCount: 0,
    });
    expect(labor.hours).toBe(0.06);
    expect(labor.complete).toBe(true);
    expect(
      runTypeComponentsPerFoot({
        pathType: "conduit",
        racewayMaterialId: 1,
        conductorMaterialId: 2,
        conductorCount: 2,
        groundCount: 0,
      })
    ).toHaveLength(2);
  });

  it("does not let a broken count impersonate a decision", () => {
    // A negative or NaN stored count is unstated, not zero: a bad row must not
    // be able to say "this type carries no ground" on the estimator's behalf.
    const labor = laborPerFootForRunType({
      pathType: "conduit",
      racewayMaterialId: 1,
      racewayLaborHours: 0.04,
      conductorMaterialId: 2,
      conductorLaborHours: 0.01,
      conductorCount: -3,
    });
    expect(labor.hours).toBe(0.04);
    expect(labor.unsetCount).toBe(1);
  });

  it("takes the decimal STRING the column stores, not just a number", () => {
    // decimal(10,4) arrives over tRPC as a string; a type that only worked on
    // numbers would report every real row as unset.
    const labor = laborPerFootForRunType({
      pathType: "conduit",
      racewayMaterialId: 1,
      racewayLaborHours: "0.0400",
      conductorMaterialId: 2,
      conductorLaborHours: "0.0055",
      conductorCount: 3,
    });
    expect(labor.hours).toBe(0.0565);
    expect(labor.complete).toBe(true);
  });
});

describe("the sentence a screen shows", () => {
  const costed = {
    pathType: "conduit" as const,
    racewayMaterialId: 1,
    racewayLaborHours: 0.04,
    conductorMaterialId: 2,
    conductorLaborHours: 0.0055,
    conductorCount: 3,
    groundMaterialId: 3,
    groundLaborHours: 0.004,
    groundCount: 1,
  };

  it("states the figure when nothing is missing", () => {
    expect(laborPerFootSentence(costed)).toBe("0.0605 h per ft");
  });

  it("keeps four decimals, because that is what the column stores", () => {
    // A fixed two would print this as 0.01, and a real rate as 0.
    expect(
      laborPerFootSentence({
        pathType: "cable",
        conductorMaterialId: 2,
        conductorLaborHours: 0.0125,
      })
    ).toBe("0.0125 h per ft");
  });

  it("NEVER states a partial figure without what it is short by", () => {
    /*
      The whole reason this function exists. `0.04 h per ft` on its own is a
      confident number for a type whose wire nobody has costed, and it reads
      exactly like a finished one.
    */
    const sentence = laborPerFootSentence({
      ...costed,
      conductorLaborHours: null,
      groundLaborHours: null,
    });
    expect(sentence).toBe("0.04 h per ft so far — 2 of 3 have no labor unit");
    expect(sentence).not.toBe("0.04 h per ft");
  });

  it("agrees with itself about one", () => {
    expect(laborPerFootSentence({ ...costed, conductorLaborHours: null })).toBe(
      "0.044 h per ft so far — 1 of 3 has no labor unit"
    );
  });

  it("says what an uncosted type actually does instead of showing 0", () => {
    // CLAUDE.md § rule 6 again: a MEASUREMENT nobody has set must not render as
    // a considered zero, and "0 h per ft" would read as free labor.
    expect(laborPerFootSentence({ pathType: "conduit" })).toBe(
      "No labor units yet — priced at material only"
    );
  });

  it("does NOT nag about a deliberate zero", () => {
    /*
      Someone who has said every part of this takes no time has answered the
      question. Treating that as missing re-opens a settled decision, which is
      the same mistake as a warning that fires on correct work.
    */
    expect(
      laborPerFootSentence({
        pathType: "cable",
        conductorMaterialId: 2,
        conductorLaborHours: 0,
      })
    ).toBe("0 h per ft");
  });
});
