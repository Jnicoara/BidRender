import { describe, expect, it } from "vitest";
import {
  createScrollMemory,
  restoreTarget,
  shouldRestoreScroll,
} from "@/lib/scrollMemory";

describe("Back returns to the same place in the list", () => {
  it("restores only when coming back from a bid", () => {
    expect(shouldRestoreScroll("bids", "dashboard")).toBe(true);
    expect(shouldRestoreScroll("takeoff", "plans-index")).toBe(true);
    expect(shouldRestoreScroll("proposal", "bid-list")).toBe(true);
    // Opening a list from the menu starts at the top, as before.
    expect(shouldRestoreScroll("clients", "dashboard")).toBe(false);
    // Moving within one bid is not "coming back".
    expect(shouldRestoreScroll("bids", "takeoff")).toBe(false);
  });

  it("remembers by address, keeps the newest, and forgets the oldest", () => {
    const memory = createScrollMemory(2);
    memory.save("#/dashboard", 1259.4);
    memory.save("#/bids", 300);
    memory.save("#/plans", 80);
    expect(memory.get("#/dashboard")).toBeNull();
    expect(memory.get("#/bids")).toBe(300);
    expect(memory.get("#/plans")).toBe(80);
    memory.save("#/bids", -5);
    expect(memory.get("#/bids")).toBe(0);
  });

  it("waits for the rows, then goes exactly back — or to the end if the list shrank", () => {
    // 1259 saved, the list has only loaded 900 px of 807 visible: wait.
    expect(restoreTarget(1259, 900, 807, false)).toBeNull();
    // Rows arrived.
    expect(restoreTarget(1259, 2066, 807, false)).toBe(1259);
    // Waited long enough and the list is shorter now: its end, not past it.
    expect(restoreTarget(1259, 1500, 807, true)).toBe(693);
  });
});
