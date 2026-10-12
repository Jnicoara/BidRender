/**
 * "WHO DOES THIS?" ON A BID LINE IS WIRED TO EVERYTHING IT MOVES (0146;
 * scope-tags-plan.md step 3).
 *
 * vitest cannot reach a React component, so this reads source. The server
 * half — the money, the lock, the copies, Undo — is
 * `server/lineScopePricing.test.ts` and `server/lineScopeSet.test.ts`.
 *
 * What it pins is the failure CLAUDE.md § "a screen showing yesterday's
 * answer" is about: a tag moves the bid's totals, its materials list, its
 * drops and its proposal, and a query the hook does not let go of states the
 * old number confidently.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("useSetLineScope", () => {
  const hook = read("../hooks/useSetLineScope.ts");

  it.each([
    "utils.bids.get.invalidate",
    "utils.materialsList.get.invalidate",
    "utils.takeoffRuns.drops.invalidate",
    "utils.proposals.document.invalidate",
    "utils.bids.list.invalidate",
  ])("lets go of %s after a change", call => {
    expect(hook).toContain(call);
  });

  it("goes through the screen's one refresh helper too", () => {
    expect(hook).toMatch(/refreshAll = \(\) => \{\s*refresh\(\);/);
  });

  it("offers Undo that sends back each line's previous tag", () => {
    expect(hook).toContain('label: "Undo"');
    expect(hook).toContain("changes: result.previous");
  });
});

describe("the bid screen", () => {
  const page = read("../pages/BidsPage.tsx");
  const menu = read("../components/bid/LineScopeMenu.tsx");

  it("uses the shared hook, through its refresh helper", () => {
    expect(page).toContain("useSetLineScope(bidId, refresh)");
  });

  it("shows the menu and the chip, told whether the bid is locked", () => {
    expect(page).toMatch(
      /<LineScopeMenuButton[\s\S]{0,80}locked=\{bid\.quantitiesLockedAt !== null\}/
    );
    expect(page).toMatch(
      /<LineScopeChip[\s\S]{0,80}locked=\{bid\.quantitiesLockedAt !== null\}/
    );
  });

  it("hides the menu on a locked bid, and says why on the chip", () => {
    expect(menu).toMatch(/if \(locked\) return null;/);
    expect(menu).toContain("unlock it to change who does this");
  });

  it("shows no chip on We install or not said", () => {
    expect(menu).toMatch(/if \(scope === "install"\) return null;/);
  });
});
