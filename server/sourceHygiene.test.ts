/**
 * NO SOURCE FILE MAY CONTAIN A CONTROL CHARACTER OR A MANGLED ESCAPE.
 *
 * ── Why this exists, and it is not hypothetical ──────────────────────────────
 * On 2026-09-21 three separate edits were garbled by being applied through
 * shell text replacement instead of an editor. Every one of them was silent,
 * and two of them passed a check that was garbled in the same way:
 *
 *   1. `\b` in a regex became a literal BACKSPACE (0x08). Invisible in terminal
 *      output, invisible in a diff, and it turned a word-boundary match into a
 *      match on a control character that can never appear in a name.
 *   2. `\\d` lost a backslash and became `d`, so a digit class matched the
 *      letter d.
 *   3. `q.split(/\s+/)` became `q.split(/s+/)` — splitting a query on the
 *      LETTER "s". Single words without an "s" were unaffected, so "wire"
 *      returned 51 results either way while "sealtite", "gem box" and
 *      "1/2 emt" returned nothing at all. It shipped for twenty minutes.
 *
 * The third is the one that makes this a test rather than a note. The
 * verification written to catch it — `s.includes("q.split(/\\s+/)")` typed into
 * a shell one-liner — was mangled by the same mechanism, so it searched for the
 * broken text and reported success. **A check that travels through the same
 * pipe as the bug cannot catch the bug.** This file is read by vitest off disk,
 * which is a different pipe.
 *
 * ── What it looks for ────────────────────────────────────────────────────────
 * Control characters are the definite case: no legitimate source file here has
 * one outside of tab and newline.
 *
 * The regex literals below are the probabilistic case, and they are listed
 * individually rather than guessed at. `/s+/`, `/d+/`, `/w+/` and friends are
 * legal JavaScript and mean something — they are simply never what anybody
 * intends, and each is exactly one lost backslash away from something people
 * write constantly.
 *
 * ── What it CANNOT catch, said plainly ───────────────────────────────────────
 * A lost backslash that produces a still-plausible regex. `/\./` becoming `/./`
 * is a real mangling and reads as ordinary code. So this is a net under one
 * class of accident, not a guarantee — which is why CLAUDE.md § "Edit code with
 * the edit tool" states the rule as well. The rule prevents; this catches.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/** Where hand-written source lives. Everything else is generated or vendored. */
const SCANNED_DIRS = [
  "client/src",
  "server",
  "shared",
  "scripts",
  "drizzle",
  "workers",
  "pricing",
];

/** Plus these, because a garbled rule in a doc misleads for just as long. */
const SCANNED_ROOT_FILES = ["CLAUDE.md", "todo.md", "CHANGELOG.md"];

const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".cjs",
  ".mjs",
  ".css",
  ".md",
  ".sql",
  ".toml",
]);

/** Generated, vendored, or a snapshot nothing hand-edits. */
const SKIPPED = new Set(["node_modules", "dist", ".git", "meta", "coverage"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // A directory that does not exist yet is not a failure.
  }
  for (const entry of entries) {
    if (SKIPPED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCANNED_DIRS) walk(path.join(ROOT, dir), files);
  for (const name of SCANNED_ROOT_FILES) {
    const full = path.join(ROOT, name);
    if (fs.existsSync(full)) files.push(full);
  }
  return files;
}

/**
 * Anything outside printable text, except tab, newline and carriage return.
 *
 * CR is excluded deliberately: `drizzle-kit` writes its migrations with CRLF on
 * Windows, and nine of them carry it today. That is a line-ending question,
 * already settled by `.gitattributes`, and folding it in here would bury the
 * signal this test exists for under generated files nobody hand-edits.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/**
 * A file may hold control characters on purpose, and one does.
 *
 * `pdfUpload.test.ts` checks that a renamed `.docx` is rejected, which means
 * writing the ZIP magic number `PK` followed by 0x03 0x04 — the actual bytes a
 * real file starts with. Testing that with anything else would be testing
 * something else.
 *
 * So the escape hatch is a marker the file itself carries, rather than a list
 * here: the reason then sits next to the bytes, where the next person reading
 * them is standing. Grep for the marker to find every one.
 */
const ALLOW_MARKER = "source-hygiene: control characters are deliberate";

/**
 * Regex literals that are legal, meaningful, and never what anybody meant.
 *
 * Each is one lost backslash from something common. Written as source text to
 * search for rather than as regexes, so this file cannot be broken by the very
 * thing it is checking for.
 */
const MANGLED_ESCAPES = [
  "/s+/",
  "/s*/",
  "/d+/",
  "/d*/",
  "/w+/",
  "/w*/",
  "/(^| )b",
  "split(/s/)",
];

const relative = (file: string) =>
  path.relative(ROOT, file).replace(/\\/g, "/");

describe("source files are free of garbled characters", () => {
  const files = sourceFiles();

  it("finds files to check at all", () => {
    // A walk that silently matched nothing would make every test below pass.
    // See CLAUDE.md § "Measuring the wrong thing looks exactly like measuring".
    expect(files.length).toBeGreaterThan(200);
  });

  it("contains no control characters", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (text.includes(ALLOW_MARKER)) continue;
      const match = CONTROL_CHARACTER.exec(text);
      if (!match) continue;
      const line = text.slice(0, match.index).split("\n").length;
      const code = match[0].charCodeAt(0).toString(16).padStart(2, "0");
      offenders.push(`${relative(file)}:${line} contains 0x${code}`);
    }
    expect(offenders).toEqual([]);
  });

  it("contains no Unicode replacement characters", () => {
    /*
      U+FFFD is what an encoding round-trip leaves behind. It renders as a
      question mark in a box and is easy to read straight past in a comment.

      Built from its code point rather than written out, because writing it out
      put a real one in THIS file — which is how the first run of this test
      failed on itself.
    */
    const replacement = String.fromCharCode(0xfffd);
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const at = text.indexOf(replacement);
      if (at === -1) continue;
      offenders.push(
        `${relative(file)}:${text.slice(0, at).split("\n").length} contains U+FFFD`
      );
    }
    expect(offenders).toEqual([]);
  });

  it("contains no regex literal that is a lost backslash", () => {
    /*
      CODE only — prose is allowed to quote the broken form, and has to be.
      CLAUDE.md § "Edit code with the edit tool" prints `q.split(/s+/)` in the
      table of what landed on disk, which is the whole value of that table.
      Scanning it here would force the one document explaining this mistake to
      describe it without showing it.
    */
    const offenders: string[] = [];
    for (const file of files) {
      if (path.extname(file) === ".md") continue;
      // This file names the patterns in order to look for them.
      if (relative(file) === "server/sourceHygiene.test.ts") continue;
      const text = fs.readFileSync(file, "utf8");
      for (const pattern of MANGLED_ESCAPES) {
        const at = text.indexOf(pattern);
        if (at === -1) continue;
        const line = text.slice(0, at).split("\n").length;
        offenders.push(`${relative(file)}:${line} has ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
