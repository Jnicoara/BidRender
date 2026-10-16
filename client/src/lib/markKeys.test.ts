/**
 * A resent batch counts once — but a NEW mark after a reload or in a second
 * tab must never be taken for a resend (client/src/lib/markKeys.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { markKey, newMarkSession } from "./markKeys";

describe("the key a mark is sent with", () => {
  it("is the same for the same mark in one page load (so a resend is caught)", () => {
    const s = newMarkSession();
    expect(markKey(s, -1)).toBe(markKey(s, -1));
  });

  it("differs between two page loads for the same queue number", () => {
    // Both queues start at -1: sent bare, the second tab's first mark would
    // be dropped as a replay of the first tab's.
    expect(markKey(newMarkSession(), -1)).not.toBe(
      markKey(newMarkSession(), -1)
    );
  });

  it("fits the server's 64-character limit", () => {
    expect(markKey(newMarkSession(), -123456).length).toBeLessThanOrEqual(64);
  });

  it("is what the Plans screen sends — never the bare queue number", () => {
    const src = readFileSync(
      new URL("../pages/TakeoffPage.tsx", import.meta.url),
      "utf8"
    );
    expect(src).toContain("keys: batch.map(m => markKey(MARK_SESSION, m.key))");
    expect(src).not.toMatch(/keys: batch\.map\(m => m\.key\)/);
  });
});
