/**
 * "WHO DOES THIS?" — which lines each shipped prompt asks about
 * (shared/scopePrompts.ts; scope-tags-plan.md step 6a).
 *
 * Each rule is its own case, so removing it turns one red:
 *   - a line somebody answered (`install` included) is never asked again;
 *   - words are whole words: "light" alone, "range" inside "arrange";
 *   - `notWords` take a line back out (a contactor in Lighting, a circuit);
 *   - the category matches on its own (a troffer never says "fixture");
 *   - a locked bid or a dismissed one shows nothing.
 * Plus the shipped starter assemblies run through it, so a prompt that
 * catches our own wiring shows up here rather than on a bid.
 */
import { describe, expect, it } from "vitest";
import {
  SHIPPED_SCOPE_PROMPTS,
  matchScopePrompts,
  nameWords,
  promptMatchesLine,
  showScopePrompts,
  type PromptLine,
} from "@shared/scopePrompts";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";

const prompt = (key: string) => SHIPPED_SCOPE_PROMPTS.find(p => p.key === key)!;
let nextId = 1;
const line = (name: string, more: Partial<PromptLine> = {}): PromptLine => ({
  id: nextId++,
  name,
  scopeTag: null,
  assemblyCategory: null,
  ...more,
});
const asks = (key: string, name: string, category: string | null = null) =>
  promptMatchesLine(prompt(key), { name, assemblyCategory: category });

describe("the shipped prompts", () => {
  it("are the plan's eight, each with a unique key", () => {
    expect(SHIPPED_SCOPE_PROMPTS.map(p => p.label)).toEqual([
      "Light fixtures",
      "Appliances",
      "Low voltage / data",
      "Fire alarm devices",
      "HVAC control wiring",
      "EV charger units",
      "Permits",
      "Trenching, patching, painting",
    ]);
    const keys = SHIPPED_SCOPE_PROMPTS.map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("matching a line", () => {
  it("never asks about a line somebody answered, We install included", () => {
    const open = line("Light fixture type A");
    const answered = line("Light fixture type B", { scopeTag: "install" });
    const tagged = line("Light fixture type C", { scopeTag: "ofci" });
    const [match] = matchScopePrompts([open, answered, tagged]);
    expect(match.prompt.key).toBe("light-fixtures");
    expect(match.lines.map(l => l.id)).toEqual([open.id]);
  });

  it("matches whole words and plurals, not pieces of words", () => {
    expect(asks("light-fixtures", "12 light fixtures")).toBe(true);
    expect(asks("light-fixtures", "Light switch")).toBe(false);
    expect(asks("appliances", "Range")).toBe(true);
    expect(asks("appliances", "Arrange panel schedule")).toBe(false);
    expect(asks("permits", "Electrical permits")).toBe(true);
    expect(nameWords("Fixtures, 2x4")).toEqual(["fixture", "2x4"]);
    expect(nameWords("Glass")).toEqual(["glass"]);
  });

  it("matches a category on its own", () => {
    expect(asks("light-fixtures", "2x4 LED troffer, lay-in", "Lighting")).toBe(
      true
    );
    expect(asks("light-fixtures", "Bollard", "Lighting")).toBe(true);
    expect(asks("light-fixtures", "Bollard", "Devices")).toBe(false);
  });

  it("lets notWords take a line back out", () => {
    expect(
      asks("light-fixtures", "Time clock and lighting contactor", "Lighting")
    ).toBe(false);
    expect(asks("ev-chargers", "EV charger circuit, 48A hardwired")).toBe(
      false
    );
    expect(asks("ev-chargers", "Level 2 EV charger")).toBe(true);
    expect(asks("appliances", "Dryer receptacle, 30A")).toBe(false);
    expect(asks("trench-patch-paint", "Network patch panel, 24-port")).toBe(
      false
    );
    expect(asks("low-voltage", "Network patch panel, 24-port")).toBe(true);
    expect(asks("low-voltage", "Fire alarm smoke detector (system)")).toBe(
      false
    );
    expect(asks("fire-alarm", "Fire alarm smoke detector (system)")).toBe(true);
  });

  it("lists a line under every prompt that asks about it", () => {
    const both = line("Trench and patch for EV charger");
    const keys = matchScopePrompts([both]).map(m => m.prompt.key);
    expect(keys).toEqual(["ev-chargers", "trench-patch-paint"]);
  });
});

describe("when the card shows prompts", () => {
  it("never on a locked bid, never once dismissed, never with nothing to ask", () => {
    const base = { locked: false, dismissedAt: null, matches: 2 };
    expect(showScopePrompts(base)).toBe(true);
    expect(showScopePrompts({ ...base, locked: true })).toBe(false);
    expect(showScopePrompts({ ...base, dismissedAt: new Date() })).toBe(false);
    expect(showScopePrompts({ ...base, matches: 0 })).toBe(false);
  });
});

describe("against the shipped starter assemblies", () => {
  const starters = BASELINE_ASSEMBLIES.map(a =>
    line(a.name, { assemblyCategory: a.category })
  );
  const askedBy = (key: string) =>
    matchScopePrompts(starters)
      .find(m => m.prompt.key === key)
      ?.lines.map(l => l.name) ?? [];

  it("asks about fixtures, and not the controls filed beside them", () => {
    const fixtures = askedBy("light-fixtures");
    expect(fixtures).toContain("2x4 LED troffer, lay-in");
    expect(fixtures).toContain("Exit sign");
    expect(fixtures).not.toContain("Time clock and lighting contactor");
    expect(fixtures.some(n => /fan\b/i.test(n))).toBe(false);
  });

  it("never asks the unit prompts about our own circuits", () => {
    for (const key of ["appliances", "ev-chargers"])
      for (const name of askedBy(key))
        expect({
          key,
          name,
          wiring: /circuit|receptacle|connection/i.test(name),
        }).toEqual({ key, name, wiring: false });
  });
});
