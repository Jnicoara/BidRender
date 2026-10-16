/**
 * NO COMPONENT IS DECLARED INSIDE ANOTHER COMPONENT.
 *
 * Found 2026-10-14 by e2e/smoke/newScreens.spec.ts: the first tap on Bids
 * after opening the app did nothing. `NavBtn` and `NavSection` were declared
 * inside BidRenderShell's render, so every shell re-render made each a NEW
 * component type, and React threw the whole menu away and rebuilt it — twice
 * in the first second after load (measured: at 936 and 1017 ms), and again on
 * any later re-render. A tap pressed on the old button and released on the
 * new one is no click at all. On a phone on a job site, where data arrives
 * seconds late, that window is seconds wide.
 *
 * A component test cannot run here (vitest covers client/src/lib, not React
 * components — CLAUDE.md), so this reads the source: no capitalised arrow
 * component or function declared at any indent, in any .tsx file. A
 * component that genuinely needs the enclosing scope takes it as props.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return name.endsWith(".tsx") ? [full] : [];
  });
}

/** `  const Row = ({` / `  const Panel = () =>` / `  function Panel(` — indented. */
const INNER_COMPONENT =
  /^\s+(?:(?:const|let)\s+[A-Z][A-Za-z0-9]*\s*=\s*\((?:\{|\)\s*=>)|function\s+[A-Z][A-Za-z0-9]*\s*\()/;

describe("components are declared at module level", () => {
  it("finds the client's .tsx files at all", () => {
    expect(tsxFiles(ROOT).length).toBeGreaterThan(50);
  });

  it("declares no component inside another", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(ROOT)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (INNER_COMPONENT.test(line))
            offenders.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("would catch the shape that lost the tap", () => {
    expect(INNER_COMPONENT.test("  const NavBtn = ({")).toBe(true);
    expect(INNER_COMPONENT.test("  const Panel = () => (")).toBe(true);
    expect(INNER_COMPONENT.test("    function Panel({ a }: P) {")).toBe(true);
    // Not components: a value, a hook result, module-level declarations.
    expect(INNER_COMPONENT.test("  const Icon = item.icon;")).toBe(false);
    expect(INNER_COMPONENT.test("  const W = (width - 2) / 3;")).toBe(false);
    expect(INNER_COMPONENT.test("const NavBtn = ({")).toBe(false);
  });
});
