import { describe, expect, it } from "vitest";
import { legSnapLabel, resolveLegStart } from "./legSnap";

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
    const s = snap({ x: 201, y: 2 }, { stamps: [{ id: 7, x: 200, y: 1 }] });
    expect(s).toMatchObject({
      kind: "tee",
      fitting: "mark",
      stampId: 7,
      point: { x: 200, y: 0 },
    });
  });

  it("starts AT a mark that is not on the run", () => {
    expect(
      snap({ x: 601, y: 99 }, { stamps: [{ id: 8, x: 600, y: 100 }] })
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
