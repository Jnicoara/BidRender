/** client/src/lib/helpTopics.ts — the guide's "Where do I…?" search. */
import { describe, expect, it } from "vitest";
import { HELP_TOPICS, searchHelp } from "./helpTopics";
import { pathToRoute } from "./appRoutes";

describe("help topics", () => {
  it("every answer points at a real screen, through the app's own router", () => {
    for (const topic of HELP_TOPICS) {
      const { route } = pathToRoute(topic.path);
      // An unknown address falls back to the Dashboard, so only the topics
      // that MEAN the Dashboard may land there.
      if (topic.path !== "/dashboard")
        expect({ path: topic.path, route }).not.toEqual({
          path: topic.path,
          route: "dashboard",
        });
    }
  });

  it("questions are unique", () => {
    const seen = new Set(HELP_TOPICS.map(t => t.question));
    expect(seen.size).toBe(HELP_TOPICS.length);
  });

  // What people actually type, and the one answer that must come first.
  const FIRST: [string, string][] = [
    ["labor rate", "Set my labor rates"],
    ["where do i change the hourly rate", "Set my labor rates"],
    ["logo", "Put my logo on proposals"],
    ["undo delete", "Bring back something I deleted"],
    ["restore", "Bring back something I deleted"],
    ["scale", "Set the scale on a sheet"],
    ["romex", "Trace a conduit or cable run"],
    ["invite", "Add someone to my crew"],
    ["sales tax", "Set sales tax"],
    ["markup", "Change overhead and profit"],
    ["roll price", "Price by the roll or box"],
    ["price history", "See what a price used to be"],
    ["count outlets", "Count devices on the plans"],
    ["no drawings", "Count a job by hand, without drawings"],
    ["upload pdf", "Upload a drawing set"],
    ["print", "Print or send a proposal"],
    ["platt", "Put in my supplier's prices"],
    ["password", "Change my password"],
    ["turn off tips", "Turn the guide or tips off"],
    ["win rate", "See my win rate"],
  ];
  it.each(FIRST)("%s → %s", (query, question) => {
    expect(searchHelp(query)[0]?.question).toBe(question);
  });

  it("returns nothing for nothing, and for words it does not know", () => {
    expect(searchHelp("")).toEqual([]);
    expect(searchHelp("   ")).toEqual([]);
    expect(searchHelp("where do i")).toEqual([]);
    expect(searchHelp("zzqx")).toEqual([]);
  });

  it("caps the list", () => {
    expect(searchHelp("price", 3).length).toBeLessThanOrEqual(3);
  });
});
