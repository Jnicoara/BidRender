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
} from "@shared/takeoffMarks";

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
    expect(runAppearance({ runTypeId: 5, pathType: "conduit" }).dash).toBe(
      RUN_DASH.conduit
    );
    expect(runAppearance({ runTypeId: 5, pathType: "cable" }).dash).toBe(
      RUN_DASH.cable
    );
  });

  it("gives runs of ONE type one colour, whatever kind they are", () => {
    // Six homeruns sharing a colour is the useful fact. The colour comes from
    // the type, so it cannot vary run to run.
    const a = runAppearance({ runTypeId: 12, pathType: "conduit" });
    const b = runAppearance({ runTypeId: 12, pathType: "conduit" });
    expect(b.color).toBe(a.color);
  });

  it("gives different types different colours", () => {
    const colors = [1, 2, 3, 4, 5, 6].map(
      id => runAppearance({ runTypeId: id, pathType: "conduit" }).color
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
        runAppearance({ runTypeId: id, pathType: "conduit" }).color
      );
    }
  });

  it("leaves an untyped run the colour it has always been", () => {
    // Nothing to group it by, so inventing a group colour would assert a
    // relationship that does not exist.
    expect(runAppearance({ runTypeId: null, pathType: "conduit" }).color).toBe(
      LEGACY_RUN_COLOR.conduit
    );
    expect(runAppearance({ runTypeId: null, pathType: "cable" }).color).toBe(
      LEGACY_RUN_COLOR.cable
    );
  });

  it("never colours a TYPED run in the old type colours", () => {
    // Those two now mean "this run has no type", so a typed run wearing one
    // would say something false.
    for (let id = 1; id <= 40; id++) {
      const { color } = runAppearance({ runTypeId: id, pathType: "conduit" });
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
