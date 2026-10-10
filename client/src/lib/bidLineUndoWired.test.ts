/**
 * EVERY SCREEN THAT REMOVES A BID LINE OFFERS UNDO (owner, 2026-09-30).
 *
 * vitest cannot reach a React component, so this reads source. The server half
 * — that Undo puts back the exact row, frozen prices included — is
 * `server/bidLineUndo.test.ts`. This half fails if a screen removes a line
 * through its own `removeLine` mutation instead of `useRemoveBidLine`, which
 * is how the bid screen and Quick bid both shipped with no way back.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

const HOOK = join(root, "hooks", "useRemoveBidLine.ts");

describe("removing a bid line always offers Undo", () => {
  it("removes lines only through useRemoveBidLine", () => {
    const direct = sources(root).filter(
      path =>
        path !== HOOK &&
        readFileSync(path, "utf8").includes("bids.removeLine.useMutation")
    );
    expect(direct).toEqual([]);
  });

  it("is used by the bid screen and Quick bid — the scan sees something", () => {
    for (const page of ["BidsPage.tsx", "QuickBidPage.tsx"])
      expect(readFileSync(join(root, "pages", page), "utf8"), page).toContain(
        "useRemoveBidLine(bidId, refresh)"
      );
  });

  it("whose toast puts the same line back through restoreLine", () => {
    const hook = readFileSync(HOOK, "utf8");
    expect(hook).toContain('label: "Undo"');
    expect(hook).toContain("restoreLine.mutate({ bidId, undo })");
  });
});
