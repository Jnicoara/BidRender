/**
 * ON-SCREEN WORDS USE AMERICAN SPELLING — "color", never "colour".
 *
 * ── Why a test and not a note ────────────────────────────────────────────────
 * Owner, 2026-09-27: the app uses American spelling, and every word a person
 * reads must say "color". Code comments may say what they like. That split is
 * exactly the kind a reviewer misses — a grep for the word finds hundreds of
 * comment lines and the one label hiding among them — and the audit that
 * produced this found seven on-screen strings, two of them written the day
 * before by the person who then audited them.
 *
 * ── What it reads, and why it cannot be fooled by a comment ──────────────────
 * Each file is PARSED (the TypeScript compiler, which the app already ships
 * with), and only the nodes a person can see are checked: string literals,
 * template text, and JSX text. Comments are not nodes, so a comment can never
 * trip it, and a string cannot hide from it by sitting next to one.
 *
 * ── What it does not cover, said plainly ─────────────────────────────────────
 * An identifier (`accentColor`, `RunTypeColors`) is not on screen and is not
 * checked. A string that is data rather than words — a CSS class, a key —
 * would be checked too; none needs the British spelling today, and one that
 * ever does can be allowed by name below with its reason.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "..");
const SCANNED_DIRS = ["client/src", "shared", "server"];
const SKIPPED = new Set(["node_modules", "dist", ".git", "meta", "coverage"]);

/** British spellings of words the app shows. One pattern per word. */
const BRITISH = [/colour/i];

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIPPED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    // Tests are not shown to anybody; their strings may quote the old word.
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(full);
  }
  return out;
}

/** Every piece of visible text in a source file, with its line. */
export function visibleText(
  fileName: string,
  source: string
): { line: number; text: string }[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const found: { line: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      found.push({
        line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        text: node.text,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("the scanner reads text, never comments", () => {
  it("finds the word in a string, a template and JSX text", () => {
    const src = [
      'const a = "Accent colour";',
      "const b = `the ${x} colour`;",
      "const c = <p>Pick a colour</p>;",
    ].join("\n");
    const hits = visibleText("x.tsx", src).filter(t => /colour/.test(t.text));
    expect(hits.map(h => h.line)).toEqual([1, 2, 3]);
  });

  it("ignores the word in every kind of comment", () => {
    const src = [
      "// a colour here",
      "/* and a colour here */",
      "const c = <p>{/* colour in JSX */}Pick a color</p>;",
    ].join("\n");
    expect(
      visibleText("x.tsx", src).filter(t => /colour/i.test(t.text))
    ).toEqual([]);
  });
});

describe("American spelling on screen", () => {
  it("no string or JSX text in the app says 'colour'", () => {
    const offenders: string[] = [];
    for (const dir of SCANNED_DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const source = fs.readFileSync(file, "utf8");
        if (!BRITISH.some(re => re.test(source))) continue;
        for (const { line, text } of visibleText(file, source)) {
          if (BRITISH.some(re => re.test(text)))
            offenders.push(
              `${path.relative(ROOT, file)}:${line}  ${JSON.stringify(text.trim().slice(0, 80))}`
            );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
