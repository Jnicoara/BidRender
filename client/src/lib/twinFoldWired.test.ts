/**
 * NO NEW "- EXISTING TO REMAIN" TWINS, AND THE OLD ONES ARE FLAGGED ON THE
 * BID (shared/twinFold.ts; owner, 2026-10-10).
 *
 * vitest cannot reach a React component, so this reads source. The server
 * half — what the fold moves, that a locked bid moves nothing, that the line
 * is never removed — is `server/twinFold.test.ts`.
 *
 * Red on the code before: "Count as existing" in Find all matching put a NEW
 * mark on a twin count (made through `groupForAssembly` when only the twin
 * assembly existed), so the device priced as new the moment the twin was
 * sent; and the bid screen said nothing about a twin line at all.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

/** The body of `const name = useCallback(` up to its dependency list. */
function callback(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = useCallback(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf("\n  );", start));
}

describe("Count as existing sets the status on the same count", () => {
  const takeoff = read("../pages/TakeoffPage.tsx");
  const body = callback(takeoff, "confirmFoundExisting");

  it("places the marks on the searched count, as existing", () => {
    expect(body).toContain("findSession.group,");
    expect(body).toContain('"existing"');
  });

  it("never makes or uses a twin count", () => {
    expect(body).not.toContain("groupForAssembly");
    expect(takeoff).not.toContain("existingToRemainName");
  });

  it("queueMarksFor sends the status it is given", () => {
    expect(callback(takeoff, "queueMarksFor")).toContain(
      "status: status ?? placingStatus"
    );
  });
});

describe("the bid screen flags a twin line and offers the fix there", () => {
  const bids = read("../pages/BidsPage.tsx");

  it("reads the flags from the shared rule", () => {
    expect(bids).toContain(
      "twinLineFlags(lines, bid.quantitiesLockedAt !== null)"
    );
  });

  it("offers the fold for a line priced as new, and remove for the rest", () => {
    expect(bids).toContain("foldTwin.mutate({ id: flag.groupId! })");
    expect(bids).toContain("removeLine.mutate({ bidId, id: flag.lineId })");
  });

  it("tells the Plans screen its counts and marks moved", () => {
    // Since 2026-10-10 the fold and its Undo live in ONE hook, shared with
    // the Plans screen's status bar; the bid screen calls it.
    const hook = read("../hooks/useFoldTwin.ts");
    expect(bids).toContain("useFoldTwin(bidId, refresh)");
    expect(hook).toContain("utils.takeoffGroups.invalidate()");
    expect(hook).toContain("utils.takeoffStamps.invalidate()");
  });
});
