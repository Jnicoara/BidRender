/**
 * Turning tokens into a figure someone can act on.
 *
 * The number this produces appears on an admin screen, where it looks more
 * authoritative than it is — it comes from a local copy of published rates. So
 * the cases below pin two things: that the arithmetic is right, and that an
 * unknown model reports ZERO rather than a plausible guess, because a visible
 * zero prompts someone to add the rate and a wrong number does not.
 */
import { describe, it, expect } from "vitest";
import {
  MICROS_PER_DOLLAR,
  MODEL_RATES,
  costMicros,
  formatMicros,
  unknownModel,
} from "../shared/aiPricing";
import { PLAN_COPILOT_MODEL } from "./routers/planCopilotRouter";
import { NAVIGATION_MODEL } from "./routers/navigationRouter";
import { MATERIAL_ALIAS_MODEL } from "./routers/materialsRouter";

describe("the rates on file", () => {
  /**
   * The failure this catches: a model swap that leaves the spend report
   * silently recording zero for every call. The three ids the app actually
   * sends must each have a rate.
   */
  it("covers every model the app is configured to call", () => {
    for (const model of [
      PLAN_COPILOT_MODEL,
      NAVIGATION_MODEL,
      MATERIAL_ALIAS_MODEL,
    ]) {
      expect(MODEL_RATES[model], `no rate on file for ${model}`).toBeTruthy();
    }
  });

  it("prices output above input, as every model does", () => {
    for (const [model, rate] of Object.entries(MODEL_RATES)) {
      expect(rate.outputPerMTok, model).toBeGreaterThan(rate.inputPerMTok);
    }
  });
});

describe("working out a cost", () => {
  it("matches the published price for a plan reading", () => {
    // Sonnet 5 at $2/$10 per million: 7,300 in + 1,840 out.
    // 7300/1e6*2 + 1840/1e6*10 = 0.0146 + 0.0184 = 0.033
    const micros = costMicros("claude-sonnet-5", {
      inputTokens: 7300,
      outputTokens: 1840,
    });
    expect(micros).toBe(33_000);
    expect(micros / MICROS_PER_DOLLAR).toBeCloseTo(0.033, 4);
  });

  it("matches the published price for a help-assistant question", () => {
    // Haiku 4.5 at $1/$5: 1,500 in + 200 out = 0.0015 + 0.001 = 0.0025
    expect(
      costMicros("claude-haiku-4-5-20251001", {
        inputTokens: 1500,
        outputTokens: 200,
      })
    ).toBe(2_500);
  });

  it("is zero for a call that used nothing", () => {
    expect(
      costMicros("claude-sonnet-5", { inputTokens: 0, outputTokens: 0 })
    ).toBe(0);
  });

  /**
   * Zero, not a guess. A made-up rate makes the admin screen confidently
   * wrong; a zero beside a call count that is plainly not zero is a visible
   * prompt to add the rate — which is what `unknownModel` turns into a log line.
   */
  it("reports zero, and says so, for a model with no rate", () => {
    expect(
      costMicros("some-model-nobody-added", {
        inputTokens: 5000,
        outputTokens: 5000,
      })
    ).toBe(0);
    expect(unknownModel("some-model-nobody-added")).toBe(true);
    expect(unknownModel("claude-sonnet-5")).toBe(false);
  });

  it("keeps a single cheap call as a whole number", () => {
    // The reason for micro-dollars: in cents this would round to zero, and a
    // month of them would total zero.
    const micros = costMicros("claude-haiku-4-5-20251001", {
      inputTokens: 250,
      outputTokens: 400,
    });
    expect(micros).toBeGreaterThan(0);
    expect(Number.isInteger(micros)).toBe(true);
  });

  it("sums exactly over a month of calls", () => {
    // Integers, so no drift. This is the property floats would lose.
    const one = costMicros("claude-haiku-4-5-20251001", {
      inputTokens: 250,
      outputTokens: 400,
    });
    let running = 0;
    for (let i = 0; i < 1000; i++) running += one;
    expect(running).toBe(one * 1000);
  });

  /**
   * The worst case the output cap allows, which is the number the cap was
   * chosen against: 4,000 output tokens on a sheet reading.
   */
  it("prices the worst case a sheet reading can reach", () => {
    const micros = costMicros("claude-sonnet-5", {
      inputTokens: 7300,
      outputTokens: 4000,
    });
    // 0.0146 + 0.04 = 0.0546 — about five and a half cents.
    expect(micros / MICROS_PER_DOLLAR).toBeCloseTo(0.0546, 4);
  });
});

describe("how it reads on screen", () => {
  it("shows enough decimals that a single call is not $0.00", () => {
    expect(formatMicros(2_500)).toBe("$0.0025");
  });

  it("shortens as the figure grows", () => {
    expect(formatMicros(33_000)).toBe("$0.033");
    expect(formatMicros(4_120_000)).toBe("$4.12");
  });

  it("prints a plain zero rather than $0.0000", () => {
    expect(formatMicros(0)).toBe("$0");
  });
});
