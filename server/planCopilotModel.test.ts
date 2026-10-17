/**
 * Is the plan reader pointed at a model the gateway actually has?
 *
 * The same guard as server/navigationModel.test.ts, for the same reason: a
 * wrong model id does not throw at startup, does not fail a type check and does
 * not show the user an error. Here it is slightly worse than it is for
 * navigation, because the reader's graceful failure is indistinguishable from a
 * sheet it genuinely could not read — "the plan reader could not be reached"
 * looks like an infrastructure hiccup, not like a typo that has been in the
 * repo for a month.
 *
 * A separate file rather than an addition to the navigation one, matching the
 * separation of the two features themselves: they run on different tiers, and a
 * failure here and a failure there need different answers.
 *
 * Skips without a key for the same reason navigationModel.test.ts does — a test
 * that fails on every local checkout gets switched off, and then guards nothing.
 */
import { describe, it, expect } from "vitest";
import { anthropicModelExists } from "./llm/anthropic";
import { PLAN_COPILOT_MODEL } from "./routers/planCopilotRouter";
import { NAVIGATION_MODEL } from "./routers/navigationRouter";

// Asked of Anthropic since 2026-10-16 (it asked the Manus gateway, whose key
// is set nowhere, so it had been skipped everywhere).
const hasKey = !!process.env.ANTHROPIC_API_KEY?.trim();

describe("plan co-pilot model", () => {
  it("is a Claude model", () => {
    expect(PLAN_COPILOT_MODEL.toLowerCase()).toContain("claude");
  });

  it("is not the fast tier the navigation helper runs on", () => {
    // Reading a dense electrical drawing is the case the heavier tier is
    // reserved for. Running it on the Haiku tier would produce a plan reader
    // wrong often enough to be worse than not having one, which is the
    // expensive kind of cheap.
    expect(PLAN_COPILOT_MODEL.toLowerCase()).not.toContain("haiku");
    expect(PLAN_COPILOT_MODEL).not.toBe(NAVIGATION_MODEL);
  });

  it.skipIf(!hasKey)(
    "exists for this Anthropic key, so it can look at an image",
    async () => {
      // The reader sends a rasterised page. A text-only model would reject
      // every request, and the router would record a `failed` run for each one
      // — the feature silently doing nothing, sheet after sheet. Every Claude
      // model from Sonnet 3 onwards accepts images, so a real Claude id is as
      // much as a lookup can tell us. The real proof is a read that comes back
      // with findings.
      expect(
        await anthropicModelExists(PLAN_COPILOT_MODEL),
        `PLAN_COPILOT_MODEL "${PLAN_COPILOT_MODEL}" is not a model Anthropic knows for this key.`
      ).toBe(true);
      expect(PLAN_COPILOT_MODEL.toLowerCase()).toContain("claude");
    }
  );
});
