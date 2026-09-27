/**
 * How a traced run reads: its name, its colour and its line style.
 *
 * ── What these are defending ─────────────────────────────────────────────────
 * The complaint that produced all of it was "three runs on a sheet, all called
 * Run on Sheet 3, and I cannot tell which line is which". So the failures worth
 * catching are the ones that put two different runs into the same appearance,
 * or that let colour go back to meaning something it no longer means.
 */
import { describe, it, expect } from "vitest";
import { runDisplayName, runTypeSpec } from "@shared/takeoffCounts";
import {
  LEGACY_RUN_COLOR,
  MARK_COLORS,
  RUN_DASH,
  runAppearance,
  runTypeColor,
  runTypeColorOrder,
  runTypeColorsInUse,
  runTypeColorShiftsIf,
  type RunTypeColors,
} from "@shared/takeoffMarks";

/** A bid on which types 1–6 were used, in that order. */
const ON_BID: RunTypeColors = {
  order: [1, 2, 3, 4, 5, 6],
  sameAs: {},
  chosen: {},
};

describe("colours on ONE bid, by when each type was first used", () => {
  it("never repeats a colour among the first six types", () => {
    // 1 and 7 landed on the same colour when colour was hashed from the id —
    // two types on one sheet, drawn identically, is the fault this fixes.
    const colors: RunTypeColors = {
      order: [1, 7, 13, 19, 25, 31],
      sameAs: {},
      chosen: {},
    };
    const drawn = colors.order.map(id => runTypeColor(id, colors));
    expect(new Set(drawn).size).toBe(6);
  });

  it("hands them out in the order the types were first used", () => {
    const colors: RunTypeColors = { order: [42, 9], sameAs: {}, chosen: {} };
    expect(runTypeColor(42, colors)).toBe(MARK_COLORS[0]);
    expect(runTypeColor(9, colors)).toBe(MARK_COLORS[1]);
  });

  it("gives a type not yet on the bid the next colour it would get", () => {
    // What a run being traced with a new type is drawn in before its first
    // save reaches the order — the same colour it keeps afterwards.
    expect(runTypeColor(99, { order: [42, 9], sameAs: {}, chosen: {} })).toBe(
      MARK_COLORS[2]
    );
  });

  it("wraps after six, and says so rather than inventing a seventh", () => {
    const colors = { order: [1, 2, 3, 4, 5, 6, 7], sameAs: {}, chosen: {} };
    expect(runTypeColor(7, colors)).toBe(runTypeColor(1, colors));
  });

  it("orders types by the first run of each, not by type id", () => {
    expect(
      runTypeColorOrder([
        { id: 30, runTypeId: 5, isSuggestion: false },
        { id: 10, runTypeId: 8, isSuggestion: false },
        { id: 20, runTypeId: 5, isSuggestion: false },
        { id: 40, runTypeId: 2, isSuggestion: false },
      ])
    ).toEqual([8, 5, 2]);
  });

  it("does not let a suggestion or an untyped run take a colour", () => {
    // A suggestion nobody accepted is not a use of the type; an untyped run
    // keeps its legacy colour and has no type to order.
    expect(
      runTypeColorOrder([
        { id: 1, runTypeId: 4, isSuggestion: true },
        { id: 2, runTypeId: null, isSuggestion: false },
        { id: 3, runTypeId: 6, isSuggestion: false },
      ])
    ).toEqual([6]);
  });

  it("colours a leg by ITS type, which is usually the run's", () => {
    // A leg follows the leg it leaves unless it is given a type of its own
    // (addLeg), so legs usually match — and a leg that differs is a different
    // thing to buy, drawn as one. Selection lights the whole run either way.
    const colors = { order: [9, 4], sameAs: {}, chosen: {} };
    const leg = { runTypeId: 9, pathType: "conduit" as const };
    const other = { runTypeId: 4, pathType: "conduit" as const };
    expect(runAppearance(colors, leg).color).toBe(MARK_COLORS[0]);
    expect(runAppearance(colors, other).color).toBe(MARK_COLORS[1]);
  });

  it("gives a fork the colour of the shipped type its runs still name", () => {
    // Runs store shipped id 31; the company edited it, so the picker lists
    // fork 1667. Keyed by raw id the picker called 1667 "not on this bid"
    // beside blue lines of that type — seen on screen 2026-09-26.
    const colors: RunTypeColors = {
      order: [1667, 32],
      sameAs: { 31: 1667 },
      chosen: {},
    };
    expect(runTypeColor(31, colors)).toBe(MARK_COLORS[0]);
    expect(runTypeColor(1667, colors)).toBe(MARK_COLORS[0]);
    expect(
      runTypeColorOrder(
        [
          { id: 1, runTypeId: 31, isSuggestion: false },
          { id: 2, runTypeId: 32, isSuggestion: false },
          { id: 3, runTypeId: 1667, isSuggestion: false },
        ],
        id => colors.sameAs[id] ?? id
      )
    ).toEqual([1667, 32]);
  });
});

describe("a color somebody CHOSE for a type (Part B, owner 2026-09-27)", () => {
  const [blue, pink, violet, orange, cyan, red] = MARK_COLORS;

  it("wins over the automatic slot, on every bid", () => {
    const colors: RunTypeColors = {
      order: [1, 2],
      sameAs: {},
      chosen: { 1: cyan },
    };
    expect(runTypeColor(1, colors)).toBe(cyan);
  });

  it("follows the type even to a bid it has not been traced on", () => {
    // It is already decided, so the picker shows it — no "next free" guess.
    expect(runTypeColor(9, { order: [], sameAs: {}, chosen: { 9: red } })).toBe(
      red
    );
  });

  it("is skipped by the AUTOMATIC types on the same bid (answer 1)", () => {
    // Type 2 chose blue — the first slot. Types 1 and 3 are automatic, so they
    // take the colors left, in first-use order: pink, then violet.
    const colors: RunTypeColors = {
      order: [1, 2, 3],
      sameAs: {},
      chosen: { 2: blue },
    };
    expect(runTypeColor(2, colors)).toBe(blue);
    expect(runTypeColor(1, colors)).toBe(pink);
    expect(runTypeColor(3, colors)).toBe(violet);
    // And a type not yet on the bid would take the next one left.
    expect(runTypeColor(99, colors)).toBe(orange);
  });

  it("reserves nothing on a bid the choosing type is not on", () => {
    // "Other types on THAT bid" — a choice made for a type elsewhere does not
    // push this bid's automatic types around.
    const colors: RunTypeColors = {
      order: [1],
      sameAs: {},
      chosen: { 9: blue },
    };
    expect(runTypeColor(1, colors)).toBe(blue);
  });

  it("lets two types choose the same color (answer 2)", () => {
    const colors: RunTypeColors = {
      order: [1, 2],
      sameAs: {},
      chosen: { 1: pink, 2: pink },
    };
    expect(runTypeColor(1, colors)).toBe(pink);
    expect(runTypeColor(2, colors)).toBe(pink);
  });

  it("wraps over what is left, and over all six only when nothing is", () => {
    const allChosen: RunTypeColors = {
      order: [1, 2, 3, 4, 5, 6, 7],
      sameAs: {},
      chosen: { 1: blue, 2: pink, 3: violet, 4: orange, 5: cyan, 6: red },
    };
    // Every color is somebody's choice; the automatic seventh still gets one.
    expect(MARK_COLORS).toContain(runTypeColor(7, allChosen));
    const oneLeft: RunTypeColors = {
      order: [1, 2, 3, 4, 5, 6, 7],
      sameAs: {},
      chosen: { 1: blue, 2: pink, 3: violet, 4: orange, 5: cyan },
    };
    expect(runTypeColor(6, oneLeft)).toBe(red);
    expect(runTypeColor(7, oneLeft)).toBe(red);
  });

  it("falls back to automatic for a stored value outside the palette", () => {
    // A color the palette no longer holds is not drawn: nobody approved it.
    const colors: RunTypeColors = {
      order: [1],
      sameAs: {},
      chosen: { 1: "#123456" },
    };
    expect(runTypeColor(1, colors)).toBe(blue);
  });

  it("reaches runs that still name the shipped type, through the fork", () => {
    // Picking a color on shipped type 31 forks it to 1667; runs keep 31.
    const colors: RunTypeColors = {
      order: [1667],
      sameAs: { 31: 1667 },
      chosen: { 1667: orange },
    };
    expect(runTypeColor(31, colors)).toBe(orange);
    expect(runTypeColor(1667, colors)).toBe(orange);
  });
});

describe("'also used by' says who would share the color AFTER choosing it", () => {
  /*
    Found on screen 2026-09-27: picking violet for 1/2" EMT said "also used by
    12-2 MC cable" — which wore violet only because it was automatic, and
    rule 1 moves an automatic type off a chosen color. The warning described
    a clash that saving would remove. So the answer is computed as if the
    choice were already made.
  */
  const [blue, pink, violet] = MARK_COLORS;
  const labels = new Map([
    [1, "Homerun A"],
    [2, "Homerun B"],
    [3, "Branch"],
  ]);

  it("names a type that CHOSE the same color", () => {
    const colors: RunTypeColors = {
      order: [1, 2, 3],
      sameAs: {},
      chosen: { 2: pink },
    };
    expect(runTypeColorsInUse(colors, labels, 1).get(pink)).toEqual([
      "Homerun B",
    ]);
  });

  it("does not name an automatic type, because it would step aside", () => {
    // Today 3 (automatic) is violet. Choosing violet for 1 moves 3 on.
    const colors: RunTypeColors = {
      order: [1, 2, 3],
      sameAs: {},
      chosen: { 2: pink },
    };
    expect(runTypeColor(3, colors)).toBe(violet);
    expect(runTypeColorsInUse(colors, labels, 1).get(violet)).toEqual([]);
  });

  it("says which automatic types would change color, and to what", () => {
    const colors: RunTypeColors = {
      order: [1, 2, 3],
      sameAs: {},
      chosen: {},
    };
    // 1 is blue, 2 pink, 3 violet. Choosing pink for 1 leaves blue free:
    // 2 (automatic, first left) takes blue, 3 takes violet — unchanged.
    expect(runTypeColorShiftsIf(colors, labels, 1, pink)).toEqual([
      { label: "Homerun B", from: pink, to: blue },
    ]);
    // Automatic moves nobody that is not already where automatic puts them.
    expect(runTypeColorShiftsIf(colors, labels, 1, null)).toEqual([]);
  });
});

describe("what a run is called", () => {
  it("names it by its type and its two ends", () => {
    // The ends are stored as KEYS and resolved to labels — the fuller cases,
    // including a company's own type, are in server/takeoffVerticals.test.ts
    // beside the list that knows the names.
    expect(
      runDisplayName({
        runTypeLiveLabel: '3/4" EMT, 3 #12 + ground',
        startKind: "panel",
        endKind: "receptacle",
      })
    ).toBe('Panel → Receptacle, 3/4" EMT, 3 #12 + ground');
  });

  it("uses the type alone rather than half a sentence", () => {
    // "Panel → …" reads like a bug. One known end is not an answer.
    expect(
      runDisplayName({
        runTypeLiveLabel: "12-2 MC cable",
        startKind: "panel",
        endKind: null,
      })
    ).toBe("12-2 MC cable");
  });

  it("follows a renamed type, because the live label wins", () => {
    // The whole reason a run points at its type rather than copying it.
    expect(
      runDisplayName({
        runTypeLiveLabel: "Renamed",
        runTypeLabel: "What it was called when traced",
      })
    ).toBe("Renamed");
  });

  it("falls back to the snapshot when the type is gone", () => {
    expect(
      runDisplayName({
        runTypeLiveLabel: null,
        runTypeLabel: "12-3 MC cable",
      })
    ).toBe("12-3 MC cable");
  });

  it("falls back to the run's own name for anything traced before types", () => {
    expect(
      runDisplayName({
        runTypeLiveLabel: null,
        runTypeLabel: null,
        name: "Run on Sheet 3",
      })
    ).toBe("Run on Sheet 3");
  });
});

describe("what a run looks like", () => {
  it("carries its KIND in the line style, not in the colour", () => {
    // The swap this whole change is about: type is a permanent property and
    // belongs in a channel that cannot be reassigned.
    expect(RUN_DASH.conduit).toBeUndefined();
    expect(RUN_DASH.cable).toBeTruthy();
    expect(
      runAppearance(ON_BID, { runTypeId: 5, pathType: "conduit" }).dash
    ).toBe(RUN_DASH.conduit);
    expect(
      runAppearance(ON_BID, { runTypeId: 5, pathType: "cable" }).dash
    ).toBe(RUN_DASH.cable);
  });

  it("gives runs of ONE type one colour, whatever kind they are", () => {
    // Six homeruns sharing a colour is the useful fact. The colour comes from
    // the type, so it cannot vary run to run.
    const a = runAppearance(ON_BID, { runTypeId: 12, pathType: "conduit" });
    const b = runAppearance(ON_BID, { runTypeId: 12, pathType: "conduit" });
    expect(b.color).toBe(a.color);
  });

  it("gives different types different colours", () => {
    const colors = [1, 2, 3, 4, 5, 6].map(
      id => runAppearance(ON_BID, { runTypeId: id, pathType: "conduit" }).color
    );
    expect(new Set(colors).size).toBe(6);
  });

  it("shares one palette with the counted marks, on purpose", () => {
    // A run type and a counted group CAN land on the same colour, and that is
    // accepted rather than worked around: six colours cannot keep every pair
    // of things on a sheet apart, and a run is a line while a mark is a shape
    // with a dot in it — they are told apart before colour is consulted.
    //
    // Keying them apart by negating one was tried and removed: it holds only
    // where the id is not a multiple of the palette length, so it would have
    // been a guarantee that was true five times in six.
    for (const id of [1, 5, 12, 40]) {
      expect(MARK_COLORS).toContain(
        runAppearance(ON_BID, { runTypeId: id, pathType: "conduit" }).color
      );
    }
  });

  it("leaves an untyped run the colour it has always been", () => {
    // Nothing to group it by, so inventing a group colour would assert a
    // relationship that does not exist.
    expect(
      runAppearance(ON_BID, { runTypeId: null, pathType: "conduit" }).color
    ).toBe(LEGACY_RUN_COLOR.conduit);
    expect(
      runAppearance(ON_BID, { runTypeId: null, pathType: "cable" }).color
    ).toBe(LEGACY_RUN_COLOR.cable);
  });

  it("never colours a TYPED run in the old type colours", () => {
    // Those two now mean "this run has no type", so a typed run wearing one
    // would say something false.
    for (let id = 1; id <= 40; id++) {
      const { color } = runAppearance(ON_BID, {
        runTypeId: id,
        pathType: "conduit",
      });
      expect(color).not.toBe(LEGACY_RUN_COLOR.conduit);
      expect(color).not.toBe(LEGACY_RUN_COLOR.cable);
      expect(MARK_COLORS).toContain(color);
    }
  });
});

describe("what a run type is made of", () => {
  it("reads as the pipe and the wire in it", () => {
    expect(
      runTypeSpec({
        pathType: "conduit",
        racewayMaterialName: '3/4" EMT',
        conductorMaterialName: "#12 THHN",
        conductorCount: 3,
      })
    ).toBe('3/4" EMT · 3 x #12 THHN');
  });

  it("gives a cable its own name and no pipe", () => {
    // The cable IS the raceway; a cable type has no raceway link by design,
    // and offering one would be offering a field that must stay null.
    expect(
      runTypeSpec({
        pathType: "cable",
        racewayMaterialName: null,
        conductorMaterialName: "12-2 MC",
        conductorCount: 3,
      })
    ).toBe("12-2 MC");
  });

  it("returns null when nothing has been said, rather than something hopeful", () => {
    // This is the state the palette calls "cannot be priced". An empty string
    // or a guessed "EMT" would put a specification on screen that nobody chose.
    expect(
      runTypeSpec({
        pathType: "conduit",
        racewayMaterialName: null,
        conductorMaterialName: null,
        conductorCount: 3,
      })
    ).toBeNull();
  });

  it("never prints a count with no conductor after it", () => {
    // "3 x" with nothing following is not a fact about anything.
    expect(
      runTypeSpec({
        pathType: "conduit",
        racewayMaterialName: '1/2" EMT',
        conductorMaterialName: null,
        conductorCount: 4,
      })
    ).toBe('1/2" EMT');
  });

  it("drops a count that means nothing", () => {
    expect(
      runTypeSpec({
        pathType: "conduit",
        racewayMaterialName: null,
        conductorMaterialName: "#10 stranded",
        conductorCount: 0,
      })
    ).toBe("#10 stranded");
  });
});

describe("the ground on a run type's spec line", () => {
  /**
   * ── What these are defending ───────────────────────────────────────────────
   * The complaint that started the whole ground split: a type LABELLED
   * "1/2\" EMT, 2 #12 + ground" showed a spec line reading "3 x #12 THHN", so
   * the words and the number disagreed on the same row. Getting the number
   * right and then dropping the ground from the line would be the same
   * disagreement reversed.
   */
  const conduit = {
    pathType: "conduit" as const,
    racewayMaterialName: '3/4" EMT',
    conductorMaterialName: "#12 THHN",
    conductorCount: 3,
  };

  it("names the ground wire when the type says which one", () => {
    expect(
      runTypeSpec({
        ...conduit,
        groundMaterialName: "#12 bare copper",
        groundCount: 1,
      })
    ).toBe('3/4" EMT · 3 x #12 THHN + #12 bare copper');
  });

  it("counts two grounds, for an isolated-ground circuit", () => {
    expect(
      runTypeSpec({
        ...conduit,
        groundMaterialName: "#12 bare copper",
        groundCount: 2,
      })
    ).toBe('3/4" EMT · 3 x #12 THHN + 2 x #12 bare copper');
  });

  it("says there IS a ground when no wire has been named for it", () => {
    // Every shipped type is in this state: 0064 split the count and
    // deliberately invented no ground wire. Printing nothing here would put
    // "+ ground" in the label above a line that never mentions one.
    expect(
      runTypeSpec({ ...conduit, groundMaterialName: null, groundCount: 1 })
    ).toBe('3/4" EMT · 3 x #12 THHN + ground');
  });

  it("says nothing when the type carries no ground", () => {
    expect(
      runTypeSpec({ ...conduit, groundMaterialName: null, groundCount: 0 })
    ).toBe('3/4" EMT · 3 x #12 THHN');
  });

  it("says nothing when nobody has said either way", () => {
    // Null is "not set", and a spec line must not invent a ground from it —
    // the same rule the column and circuitWire follow.
    expect(
      runTypeSpec({ ...conduit, groundMaterialName: null, groundCount: null })
    ).toBe('3/4" EMT · 3 x #12 THHN');
  });

  it("leaves a cable alone — its ground is inside the jacket", () => {
    expect(
      runTypeSpec({
        pathType: "cable",
        racewayMaterialName: null,
        conductorMaterialName: "12-2 MC",
        conductorCount: 2,
        groundMaterialName: null,
        groundCount: 1,
      })
    ).toBe("12-2 MC");
  });
});
