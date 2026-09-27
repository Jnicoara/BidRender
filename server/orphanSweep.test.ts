/**
 * The refusals of the orphan sweep. Deleting by absence is only safe when the
 * list of what is present can be trusted, so these are the cases where it
 * cannot.
 */
import { describe, expect, it } from "vitest";
import {
  ORPHAN_MIN_AGE_DAYS,
  planOrphanSweep,
  type StoredObject,
} from "./orphanSweep";

const NOW = new Date("2026-09-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const object = (key: string, ageDays: number): StoredObject => ({
  key,
  size: 100,
  modified: new Date(NOW.getTime() - ageDays * DAY),
  store: "r2",
});

describe("planOrphanSweep", () => {
  it("finds an old file nothing names, and only that", () => {
    const plan = planOrphanSweep({
      objects: [object("a", 30), object("b", 30), object("c", 30)],
      namedKeys: new Set(["a", "b"]),
      now: NOW,
    });
    expect(plan.ok && plan.orphans.map(o => o.key)).toEqual(["c"]);
  });

  it("leaves a new file alone — it may be an upload not yet attached", () => {
    const plan = planOrphanSweep({
      objects: [
        object("a", 30),
        object("b", 30),
        object("fresh", ORPHAN_MIN_AGE_DAYS - 1),
      ],
      namedKeys: new Set(["a", "b"]),
      now: NOW,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.orphans).toEqual([]);
    expect(plan.tooNew.map(o => o.key)).toEqual(["fresh"]);
  });

  it("refuses when the database names nothing — a wrong DATABASE_URL", () => {
    const plan = planOrphanSweep({
      objects: [object("a", 30)],
      namedKeys: new Set(),
      now: NOW,
    });
    expect(plan.ok).toBe(false);
  });

  it("refuses when most files look orphaned", () => {
    const plan = planOrphanSweep({
      objects: [object("a", 30), object("b", 30), object("c", 30)],
      namedKeys: new Set(["a", "unrelated"]),
      now: NOW,
    });
    expect(plan.ok).toBe(false);
  });

  it("lifts the share refusal only when told, and never the empty one", () => {
    const objects = [object("a", 30), object("b", 30), object("c", 30)];
    const majority = planOrphanSweep({
      objects,
      namedKeys: new Set(["a"]),
      now: NOW,
      allowMajority: true,
    });
    expect(majority.ok && majority.orphans.map(o => o.key)).toEqual(["b", "c"]);

    const empty = planOrphanSweep({
      objects,
      namedKeys: new Set(),
      now: NOW,
      allowMajority: true,
    });
    expect(empty.ok).toBe(false);
  });

  it("has nothing to do on an empty store", () => {
    const plan = planOrphanSweep({
      objects: [],
      namedKeys: new Set(),
      now: NOW,
    });
    expect(plan.ok && plan.orphans).toEqual([]);
  });
});
