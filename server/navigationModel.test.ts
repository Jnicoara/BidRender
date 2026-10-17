/**
 * Is the navigation helper pointed at a model the gateway actually has?
 *
 * ── The failure this exists to stop ──────────────────────────────────────────
 * A wrong model id does not throw at startup, does not fail a type check and
 * does not show the user an error. The request is simply rejected, the helper
 * returns its "I'm not sure" fallback, and the feature looks like it works and
 * never answers. It shipped that way once already — pointed at an OpenAI id, on
 * an app that otherwise only talks to Claude — and nothing anywhere caught it.
 *
 * So the id is checked against the live list rather than against a hardcoded
 * copy of it. A hardcoded copy would only ever assert that two constants in
 * this repo agree with each other, which is the thing that was already true
 * while the id was wrong.
 *
 * ── Why it skips instead of failing without a key ────────────────────────────
 * The lookup needs ANTHROPIC_API_KEY (`anthropicModelExists`, a free lookup,
 * never a call). Until 2026-10-16 it asked the Manus gateway's model list,
 * which needed BUILT_IN_FORGE_API_KEY — set nowhere, so this guard had been
 * skipped everywhere since the move. Local checkouts and CI often do
 * not have a key, and a test that fails there would be turned off within a week —
 * at which point it stops guarding anything. Skipping keeps it honest: it is
 * silent where it cannot know, and definitive wherever a credential exists,
 * which includes any environment the feature could actually run in.
 */
import { describe, it, expect } from "vitest";
import { anthropicModelExists } from "./llm/anthropic";
import { NAVIGATION_MODEL } from "./routers/navigationRouter";

const hasKey = !!process.env.ANTHROPIC_API_KEY?.trim();

describe("navigation helper model", () => {
  it("is a Claude model", () => {
    // One vendor. The alias suggester already uses Claude and the co-pilot
    // will; a second provider for a feature this small buys nothing and costs
    // a set of credentials to manage. This assertion is cheap and runs
    // everywhere, unlike the live check below.
    expect(NAVIGATION_MODEL.toLowerCase()).toContain("claude");
  });

  it("is a Haiku-class model, not a heavier tier", () => {
    // Deciding "which of eleven screens" is lookup, not reasoning. If this ever
    // needs to change, it should be a deliberate edit with a reason, not a
    // silent upgrade that multiplies the cost of a help feature.
    expect(NAVIGATION_MODEL.toLowerCase()).toContain("haiku");
  });

  it.skipIf(!hasKey)("exists for this Anthropic key", async () => {
    expect(
      await anthropicModelExists(NAVIGATION_MODEL),
      `NAVIGATION_MODEL "${NAVIGATION_MODEL}" is not a model Anthropic knows for this key.`
    ).toBe(true);
  });

  it.skipIf(!hasKey)(
    "a made-up id is refused (the check can fail)",
    async () => {
      // Separate from the check above so a failure says which problem it is:
      // the id being wrong, or the lookup itself not working (a wrong key, no
      // network). A lookup that answered "yes" to anything would pass the check
      // above while guarding nothing.
      expect(await anthropicModelExists("claude-no-such-model-0000")).toBe(
        false
      );
    }
  );
});
