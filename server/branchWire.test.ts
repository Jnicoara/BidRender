/**
 * Who owns the wire between devices.
 *
 * ── What is worth testing, and what is not ───────────────────────────────────
 * The arithmetic is multiplication. What is worth testing is the OWNERSHIP:
 * that no foot is counted twice, that a retired whip cannot come back, and that
 * the job dial cannot reach measured footage. Every one of those failures
 * produces a total that looks finished — and the double count in particular is
 * two innocent line items, neither wrong on its face.
 */
import { describe, it, expect } from "vitest";
import {
  whipFeetOf,
  needsWhip,
  runWireOwnership,
  shouldAskAboutBranchWiring,
  totalBranchWireFeet,
  PANEL_KIND,
} from "../shared/branchWire";

describe("an unset whip is not a whip of zero", () => {
  it("reads NULL and undefined as unset", () => {
    expect(whipFeetOf(null)).toBeNull();
    expect(whipFeetOf(undefined)).toBeNull();
    expect(needsWhip(null)).toBe(true);
  });

  it("takes the decimal string the column stores", () => {
    expect(whipFeetOf("20.0000")).toBe(20);
    expect(needsWhip("20.0000")).toBe(false);
  });

  it("treats a DELIBERATE zero as answered", () => {
    /*
      A commercial fixture carrying no branch wire, because every run is traced,
      is a real answer and must go quiet. This is most of the reason the column
      is nullable rather than defaulting to zero.
    */
    expect(whipFeetOf(0)).toBe(0);
    expect(needsWhip(0)).toBe(false);
  });

  it("sends a broken value to the worklist rather than reading it as none", () => {
    // Understating a bid in silence is the one outcome worth refusing.
    expect(whipFeetOf(-5)).toBeNull();
    expect(whipFeetOf("nonsense")).toBeNull();
  });
});

describe("whose wire a traced run is", () => {
  it("a panel at either end is a homerun, and is never asked about", () => {
    // The definition of a homerun, and the majority of traced runs. A guard
    // that fired on these would teach people to read past it.
    expect(
      runWireOwnership({ startKind: PANEL_KIND, endKind: "receptacle" })
    ).toBe("homerun");
    expect(
      runWireOwnership({ startKind: "receptacle", endKind: PANEL_KIND })
    ).toBe("homerun");
    expect(
      shouldAskAboutBranchWiring({ startKind: PANEL_KIND, endKind: "switch" })
    ).toBe(false);
  });

  it("devices at BOTH ends is the ambiguous case, and it asks", () => {
    expect(
      runWireOwnership({ startKind: "receptacle", endKind: "receptacle" })
    ).toBe("unanswered");
    expect(
      shouldAskAboutBranchWiring({
        startKind: "ceiling-box",
        endKind: "switch",
      })
    ).toBe(true);
  });

  it("asks about a junction box, deliberately", () => {
    // In the field a J-box is often mid-branch. That is the case the guard is
    // for, so it is a device here rather than an exception.
    expect(
      shouldAskAboutBranchWiring({
        startKind: "junction-box-wall",
        endKind: "receptacle",
      })
    ).toBe(true);
  });

  it("does NOT treat an unanswered end as a device", () => {
    /*
      Null means nobody has said what is there, which is not the same as knowing
      it is a receptacle. Reading unknown as a device would fire the guard on
      every half-finished run on the sheet.
    */
    expect(runWireOwnership({ startKind: null, endKind: "receptacle" })).toBe(
      "homerun"
    );
    expect(shouldAskAboutBranchWiring({ startKind: null, endKind: null })).toBe(
      false
    );
  });

  it("does not treat 'carries on at run height' as a device either", () => {
    expect(
      runWireOwnership({ startKind: "distribution", endKind: "receptacle" })
    ).toBe("homerun");
  });

  it("THE RECORDED ANSWER WINS, so a settled question stays settled", () => {
    /*
      Re-deriving from the ends would un-answer the question the next time an
      end kind changed. Same refusal shouldSuggestStampLink makes about a stamp
      that is already claimed.
    */
    expect(
      runWireOwnership({
        startKind: "receptacle",
        endKind: "receptacle",
        branchWiring: false,
      })
    ).toBe("homerun");
    expect(
      runWireOwnership({
        startKind: PANEL_KIND,
        endKind: "receptacle",
        branchWiring: true,
      })
    ).toBe("branch");
  });
});

describe("NO FOOT IS COUNTED TWICE", () => {
  it("adds the devices' whips to the runs' homerun wire", () => {
    // 40 receptacles at 20 ft of whip, plus one traced 120 ft homerun.
    const totals = totalBranchWireFeet({
      devices: [{ count: 40, whipFeet: 20 }],
      runs: [{ wireFeet: 120, ownership: "homerun" }],
    });
    expect(totals.deviceFeet).toBe(800);
    expect(totals.runFeet).toBe(120);
    expect(totals.totalFeet).toBe(920);
  });

  it("EXCLUDES a run the estimator said is branch wiring", () => {
    /*
      The double count this whole module exists to prevent. The devices at both
      ends already carry this cable in their whips, so counting the traced path
      as well would bill the same wire twice — two innocent line items.
    */
    const totals = totalBranchWireFeet({
      devices: [{ count: 10, whipFeet: 20 }],
      runs: [
        { wireFeet: 120, ownership: "homerun" },
        { wireFeet: 65, ownership: "branch" },
      ],
    });
    expect(totals.runFeet).toBe(120);
    expect(totals.excludedRunCount).toBe(1);
    expect(totals.totalFeet).toBe(320);
  });

  it("COUNTS an unanswered run and reports it, rather than dropping it", () => {
    /*
      A traced run is measured work somebody drew across a drawing. Dropping it
      because a question is open loses footage silently — the failure that looks
      like a competitive bid. So it counts and the caveat travels, exactly as
      flatOnlyCount does for verticals.
    */
    const totals = totalBranchWireFeet({
      devices: [],
      runs: [{ wireFeet: 65, ownership: "unanswered" }],
    });
    expect(totals.runFeet).toBe(65);
    expect(totals.unansweredRunCount).toBe(1);
    expect(totals.excludedRunCount).toBe(0);
  });
});

describe("the whip retires PER DEVICE when a run routes it", () => {
  it("drops only the devices a routed run covers", () => {
    /*
      THE POINT OF PER-DEVICE RETIREMENT. Routing one circuit of 6 troffers must
      not zero the whip for the other 40 on the job. Per assembly it would.
    */
    const totals = totalBranchWireFeet({
      devices: [
        { count: 6, whipFeet: 10, routedByRunId: 77 },
        { count: 40, whipFeet: 10 },
      ],
      runs: [{ wireFeet: 210, ownership: "homerun" }],
    });
    expect(totals.deviceFeet).toBe(400);
    expect(totals.retiredWhipCount).toBe(6);
    expect(totals.unsetWhipCount).toBe(0);
  });

  it("does not report a retired device as unset — nothing is missing about it", () => {
    const totals = totalBranchWireFeet({
      devices: [{ count: 3, whipFeet: null, routedByRunId: 12 }],
      runs: [],
    });
    expect(totals.deviceFeet).toBe(0);
    expect(totals.retiredWhipCount).toBe(3);
    expect(totals.unsetWhipCount).toBe(0);
  });

  it("reports an unset whip so the total is not quietly short", () => {
    const totals = totalBranchWireFeet({
      devices: [
        { count: 5, whipFeet: 20 },
        { count: 8, whipFeet: null },
      ],
      runs: [],
    });
    expect(totals.deviceFeet).toBe(100);
    expect(totals.unsetWhipCount).toBe(8);
  });
});

describe("the job dial reaches the whip and nothing else", () => {
  it("scales the whips", () => {
    const totals = totalBranchWireFeet({
      devices: [{ count: 10, whipFeet: 20 }],
      runs: [],
      adjustPct: 0.15,
    });
    expect(totals.deviceFeet).toBe(230);
  });

  it("LEAVES TRACED FOOTAGE ALONE — measured length is not padded", () => {
    /*
      § 5a forbids the app quietly padding measured length, and this is the one
      function that applies the dial at all, so there is no path on which a
      caller can reach runFeet with it.
    */
    const totals = totalBranchWireFeet({
      devices: [{ count: 10, whipFeet: 20 }],
      runs: [{ wireFeet: 500, ownership: "homerun" }],
      adjustPct: 0.5,
    });
    expect(totals.deviceFeet).toBe(300);
    expect(totals.runFeet).toBe(500);
  });

  it("goes both ways — a tighter building is a real answer", () => {
    const totals = totalBranchWireFeet({
      devices: [{ count: 10, whipFeet: 20 }],
      runs: [],
      adjustPct: -0.25,
    });
    expect(totals.deviceFeet).toBe(150);
  });

  it("returns every number where it was when the dial is 0", () => {
    // Same property productivityPct has, and it is what makes the dial safe to
    // touch: it is applied at calculation time and written nowhere.
    const plain = totalBranchWireFeet({
      devices: [{ count: 7, whipFeet: 12.5 }],
      runs: [{ wireFeet: 40, ownership: "homerun" }],
    });
    const zeroed = totalBranchWireFeet({
      devices: [{ count: 7, whipFeet: 12.5 }],
      runs: [{ wireFeet: 40, ownership: "homerun" }],
      adjustPct: 0,
    });
    expect(zeroed).toEqual(plain);
  });

  it("never returns negative footage", () => {
    // Below -100% is not a tighter building, it is wire subtracted from
    // somebody else's count.
    const totals = totalBranchWireFeet({
      devices: [{ count: 10, whipFeet: 20 }],
      runs: [],
      adjustPct: -2,
    });
    expect(totals.deviceFeet).toBe(0);
  });
});
