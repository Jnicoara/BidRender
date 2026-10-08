/**
 * EVERY RUN MUTATION CHECKS THE LOCK — read off the router's source, so a
 * new one cannot forget.
 *
 * `lockedEdits.test.ts` proves each refusal it knows about, one by one. That
 * is how `setLocation` stayed open until 2026-10-08: it was the one run edit
 * nobody had listed, so no test asked (never-stuck plan, gap 2). This asks the
 * question of every procedure in the file instead. A mutation that genuinely
 * must work on a locked bid goes in ALLOWED, with the reason beside it.
 *
 * It reads source text, so it proves a call is PRESENT in the body, not that
 * it runs first. The behaviour is `lockedEdits.test.ts`'s job.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  new URL("./routers/takeoffRunsRouter.ts", import.meta.url),
  "utf8"
);

/** Mutations allowed on a locked bid, each with why. None today. */
const ALLOWED: Record<string, string> = {};

function mutations(source: string): { name: string; body: string }[] {
  const starts = Array.from(source.matchAll(/^ {2}(\w+): procedure\b/gm));
  return starts
    .map((m, i) => ({
      name: m[1],
      body: source.slice(m.index, starts[i + 1]?.index ?? source.length),
    }))
    .filter(p => p.body.includes(".mutation("));
}

describe("every run mutation refuses a locked bid", () => {
  const found = mutations(SOURCE);

  it("finds the router's mutations (the pattern still matches the file)", () => {
    // If this drops, the router changed shape and the check below is
    // checking nothing — fix the pattern, do not lower the bar.
    expect(found.length).toBeGreaterThanOrEqual(20);
    expect(found.map(p => p.name)).toContain("setLocation");
  });

  it("each one calls refuseIfLocked or refuseIfRunLocked", () => {
    const missing = found
      .filter(p => !(p.name in ALLOWED))
      .filter(p => !/\brefuseIf(Run)?Locked\(/.test(p.body))
      .map(p => p.name);
    expect(missing).toEqual([]);
  });
});
