import { describe, expect, it } from "vitest";
import {
  legSnapLabel,
  quantitySnap,
  resolveLegStart,
  snapToMark,
} from "./legSnap";

describe("a run never snaps to an UNCONFIRMED mark", () => {
  // The fault (todo.md, WRONG-NUMBER RISK): a snap copies the mark's spot into
  // the run, so a misplaced AI mark became a wrong length — up to ~10 ft at
  // 1/4" = 1'-0" on staging's E-100. Red before: every mark was a target.
  const unchecked = { id: 3, x: 600, y: 100, status: "unconfirmed" as const };

  it("does not snap to an unconfirmed mark in reach", () => {
    expect(snapToMark({ x: 601, y: 99 }, 5, [unchecked])).toBeNull();
  });

  it("takes a confirmed mark further away over a nearer unconfirmed one", () => {
    const confirmed = { id: 4, x: 604, y: 100, status: null };
    expect(
      snapToMark({ x: 601, y: 100 }, 5, [unchecked, confirmed])?.stamp.id
    ).toBe(4);
  });

  it("starts a leg where the click was, not on the unconfirmed mark", () => {
    expect(
      resolveLegStart({
        at: { x: 601, y: 99 },
        tolerance: 5,
        legs: [],
        stamps: [unchecked],
        free: false,
      })
    ).toEqual({ kind: "free", point: { x: 601, y: 99 } });
  });

  it("still snaps to every confirmed status, an existing device included", () => {
    for (const status of [
      null,
      "new",
      "existing",
      "remove",
      "relocate",
    ] as const) {
      expect(
        snapToMark({ x: 601, y: 99 }, 5, [{ id: 9, x: 600, y: 100, status }])
          ?.stamp.id,
        String(status)
      ).toBe(9);
    }
  });
});

// A main east along y=0, then south. Tolerance 5 page points.
const MAIN = {
  id: 1,
  points: [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
  ],
};
const OTHER_RUN_NOT_OFFERED = {
  id: 99,
  points: [
    { x: 0, y: 50 },
    { x: 400, y: 50 },
  ],
};

const snap = (
  at: { x: number; y: number },
  extra: Partial<Parameters<typeof resolveLegStart>[0]> = {}
) =>
  resolveLegStart({
    at,
    tolerance: 5,
    legs: [MAIN],
    stamps: [],
    free: false,
    ...extra,
  });

describe("where a new leg starts", () => {
  it("tees off along the run, ON the path rather than where the click landed", () => {
    expect(snap({ x: 150, y: 3 })).toEqual({
      kind: "tee",
      hostRunId: 1,
      point: { x: 150, y: 0 },
      where: "along",
      fitting: "box",
      stampId: null,
    });
  });

  it("lands exactly on a corner within reach — the box turns the pipe", () => {
    expect(snap({ x: 397, y: 4 })).toMatchObject({
      kind: "tee",
      where: "along",
      point: { x: 400, y: 0 },
    });
  });

  it("prefers an end of a leg over the path next to it", () => {
    expect(snap({ x: 398, y: 302 })).toMatchObject({
      kind: "tee",
      where: "end",
      point: { x: 400, y: 300 },
    });
  });

  it("prefers a mark over the leg it sits on — the mark is the box", () => {
    const s = snap(
      { x: 201, y: 2 },
      { stamps: [{ id: 7, x: 200, y: 1, status: null }] }
    );
    expect(s).toMatchObject({
      kind: "tee",
      fitting: "mark",
      stampId: 7,
      point: { x: 200, y: 0 },
    });
  });

  it("starts AT a mark that is not on the run", () => {
    expect(
      snap(
        { x: 601, y: 99 },
        { stamps: [{ id: 8, x: 600, y: 100, status: null }] }
      )
    ).toEqual({
      kind: "stamp",
      stampId: 8,
      point: { x: 600, y: 100 },
    });
  });

  it("is free off the run, and free anywhere with Alt", () => {
    expect(snap({ x: 150, y: 40 }).kind).toBe("free");
    expect(snap({ x: 150, y: 1 }, { free: true })).toEqual({
      kind: "free",
      point: { x: 150, y: 1 },
    });
  });

  it("never snaps onto a run it was not given", () => {
    // The caller passes THIS run's legs only; another run is just drawing.
    expect(snap({ x: 150, y: 51 }).kind).toBe("free");
    expect(
      snap({ x: 150, y: 51 }, { legs: [MAIN, OTHER_RUN_NOT_OFFERED] }).kind
    ).toBe("tee");
  });

  it("says in words what the click will do", () => {
    expect(legSnapLabel(snap({ x: 150, y: 3 }))).toBe(
      "Branch — box on the run here"
    );
    expect(legSnapLabel(snap({ x: 150, y: 40 }))).toBe(
      "New start — not joined to the run"
    );
  });
});

describe("the same snap on a quantity trace (D21)", () => {
  it("joins the trace with no tee, at the same snapped point", () => {
    const joined = quantitySnap(snap({ x: 150, y: 3 }));
    expect(joined).toEqual({
      kind: "free",
      point: { x: 150, y: 0 },
      joined: true,
    });
    expect(legSnapLabel(joined)).toBe("Joins the trace here — no box, no drop");
  });

  it("does not claim a mark, and leaves a free start alone", () => {
    const onMark = quantitySnap(
      snap(
        { x: 700, y: 700 },
        { stamps: [{ id: 5, x: 701, y: 700, status: null }] }
      )
    );
    expect(onMark).toEqual({ kind: "free", point: { x: 701, y: 700 } });
    const free = snap({ x: 900, y: 900 });
    expect(quantitySnap(free)).toBe(free);
  });
});
