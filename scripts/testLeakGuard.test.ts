/**
 * The leak rule itself, without a database. Its live check — that it fails a
 * file which leaves a shared row — was made by forcing
 * `takeoffBridgeFlow.test.ts` to throw after its insert with its cleanup
 * removed: the guard failed THAT file, naming `assemblies #1810 "Fork flow
 * starter R3 …"` (2026-09-29, plan T2).
 */
import { describe, it, expect } from "vitest";
import {
  describeLeaks,
  leakedSharedRows,
  rowCountDelta,
  type SharedRow,
  type SharedTable,
} from "./testLeakGuard";

const row = (table: SharedTable, id: number, name: string): SharedRow => ({
  table,
  id,
  name,
});
const SHIPPED = new Map<SharedTable, Set<string>>([
  ["assemblies", new Set(["Duplex receptacle standard"])],
  ["materials", new Set(['4" square box'])],
]);

describe("a shared row a test file left behind", () => {
  it("is a new row whose name is not shipped", () => {
    const before = [row("assemblies", 1, "Duplex receptacle standard")];
    const after = [...before, row("assemblies", 9, "Fork flow starter R3 1")];
    expect(leakedSharedRows(before, after, SHIPPED)).toEqual([
      row("assemblies", 9, "Fork flow starter R3 1"),
    ]);
  });

  it("is never a row a seeder added under a shipped name", () => {
    const after = [row("materials", 5, '4" square box')];
    expect(leakedSharedRows([], after, SHIPPED)).toEqual([]);
  });

  it("is never a row that was there before the file ran", () => {
    const stray = row("assemblies", 3, "Old stray");
    expect(leakedSharedRows([stray], [stray], SHIPPED)).toEqual([]);
  });

  it("matches by table AND id — the same id in another table is new", () => {
    const before = [row("materials", 9, '4" square box')];
    const after = [...before, row("kits", 9, "A test kit")];
    expect(leakedSharedRows(before, after, SHIPPED)).toEqual([
      row("kits", 9, "A test kit"),
    ]);
  });

  it("says which file, which rows, and what to do", () => {
    const text = describeLeaks("server/x.test.ts", [row("kits", 9, "K")]);
    expect(text).toContain("server/x.test.ts left 1 SHARED row");
    expect(text).toContain('kits #9 "K"');
    expect(text).toContain("onTestFinished");
  });
});

describe("the per-file row-count measurement", () => {
  it("reports only the tables that moved", () => {
    expect(
      rowCountDelta(
        { bids: 10, users: 3, kits: 1 },
        { bids: 14, users: 4, kits: 1 }
      )
    ).toEqual({ bids: 4, users: 1 });
  });
});
