/**
 * An AI call is a button. No effect may start one.
 *
 * CLAUDE.md § "AI features — two standing rules": no AI feature may fire from
 * a page load, a sheet opening, a tab change or any other effect. The plan
 * viewer broke that until 2026-09-29 with "Read each sheet as I open it", an
 * opt-in switch whose `useEffect` read the sheet on screen, and billed for it,
 * the moment a sheet was opened. It was removed rather than defaulted off.
 *
 * vitest cannot render a React component here (vitest.config.ts covers
 * `client/src/lib`, not components), so this reads the SOURCE: every
 * `useEffect(...)` in `client/src` is cut out by matching its parentheses, and
 * none may contain a call that starts a plan reading. A grep measures the
 * pattern typed, so the list below names every way the reading is reachable
 * from the page: the page's `runReader` wrapper, the `readSheet` mutation it
 * calls, and the tRPC procedure itself.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const CLIENT = resolve(import.meta.dirname, "../client/src");

/** Calls that spend a plan-reader call. */
const READER_CALLS = [
  /\brunReader\s*\(/,
  /\breadSheet\s*\.\s*mutate(Async)?\s*\(/,
  /\bplanCopilot\s*\.\s*read\b/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [full]
      : [];
  });
}

/**
 * The text of every `useEffect( … )` call, found by matching parentheses.
 * Strings and comments are not parsed, which is fine for a check that only
 * ever has to find MORE text inside an effect than is really there: a stray
 * bracket in a string can widen a slice, never hide a call inside it.
 */
function effectBodies(source: string): string[] {
  const bodies: string[] = [];
  const opener = /\buseEffect\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    let depth = 0;
    let end = source.length;
    for (let i = match.index + match[0].length - 1; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    bodies.push(source.slice(match.index, end));
  }
  return bodies;
}

const files = sourceFiles(CLIENT);

describe("an AI call is a button, never an effect", () => {
  it("finds the client source it is meant to scan", () => {
    // A scan of nothing passes everything. The plan viewer is where the
    // reader lives, so it must be in the set.
    expect(files.some(f => f.endsWith("TakeoffPage.tsx"))).toBe(true);
  });

  it("no useEffect in client/src starts a plan reading", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const body of effectBodies(source)) {
        for (const call of READER_CALLS) {
          if (call.test(body)) {
            const line = source
              .slice(0, source.indexOf(body))
              .split("\n").length;
            offenders.push(`${relative(CLIENT, file)}:${line} ${call}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nothing reads the retired auto-read preference", () => {
    // The key may still sit in browsers that turned the switch on. Nothing may
    // act on it: reading it back is how the feature would quietly return.
    const readers = files.filter(file =>
      /getItem\(\s*["']helixbid\.planReader\.autoRead["']/.test(
        readFileSync(file, "utf8")
      )
    );
    expect(readers.map(f => relative(CLIENT, f))).toEqual([]);
  });
});
