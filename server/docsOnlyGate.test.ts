/**
 * A push that changes only documentation still runs every test that READS
 * documentation.
 *
 * The Gate (.github/workflows/gate.yml, "DOCS") skips the full suite when a
 * push changes nothing but `*.md` files and references/, and runs only the
 * test files listed in .github/docs-only-tests.txt. That list is a fact about
 * the code the day it was written, so this test re-derives it: any test file
 * that reads files AND names a `.md` path in a string on a code line must be
 * listed. Without it, a new test that checks a doc would pass on the day it
 * was added and then never run on the pushes that change that doc.
 *
 * What it searches for, since a search measures the pattern typed: a quoted
 * literal ending `.md` (`"CLAUDE.md"`, `".md"`, `"…/plan.md"`) on a line that
 * is not a comment, in a test file that calls readFileSync, readdirSync or
 * `new URL(`. Over-inclusive on purpose — an extra listed file costs seconds.
 * It would miss a path assembled without the literal (`"plan" + ext`); none
 * exists today (2026-10-14: exactly the three listed besides this one).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LIST = join(ROOT, ".github", "docs-only-tests.txt");
const SCANNED = ["server", "client/src", "shared", "scripts"];
const SKIPPED = new Set(["node_modules", "dist", ".git", "coverage"]);

function testFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    if (SKIPPED.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return testFiles(full);
    return /\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function readsDocs(source: string): boolean {
  if (!/readFileSync|readdirSync|new URL\(/.test(source)) return false;
  return source
    .split("\n")
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .some(line => /["'`][^"'`\n]*\.md["'`]/.test(line));
}

const listed = readFileSync(LIST, "utf8")
  .split("\n")
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"));

describe("the Gate's docs-only test list", () => {
  it("lists every test that reads a documentation file", () => {
    const found = SCANNED.flatMap(dir => testFiles(join(ROOT, dir)))
      .filter(file => readsDocs(readFileSync(file, "utf8")))
      .map(file => relative(ROOT, file).split("\\").join("/"));
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found.filter(file => !listed.includes(file))).toEqual([]);
  });

  it("names only files that exist, and includes itself", () => {
    expect(listed.filter(file => !existsSync(join(ROOT, file)))).toEqual([]);
    expect(listed).toContain("server/docsOnlyGate.test.ts");
  });
});
