/**
 * NOTHING READS THE AI CORRECTION LOG — not a router, not a screen, not an
 * export — until a terms page says corrections may be used (todo.md, "A terms
 * page BEFORE any sharing"; ai-correction-log-plan.md § 6). A "quick admin
 * count" is a read, and so is a client call.
 *
 * So this reads the source: any file that names the table outside the list
 * below fails, and every entry says why it may. Same shape as
 * scopeDiscipline.test.ts — the default is "may not", the exceptions are
 * visible.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const ALLOWED: Record<string, string> = {
  "server/aiCorrections.ts": "The one door. It only writes.",
  "server/aiCorrections.test.ts": "Reads rows back to check what was written.",
  "server/aiCorrectionsNoReader.test.ts": "This file.",
  "server/backup/collectFiles.ts":
    "Backs up the crop files the log names. Storage, not sharing.",
  "server/backup.test.ts": "Checks the backup knows the crop column.",
  "server/crossCompanyAttack.test.ts":
    "Lists every company-owned table, to check none leaks across companies.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(path);
  }
  return out;
}

describe("the AI correction log is write-only", () => {
  it("no file outside the allowed list names the table", () => {
    const offenders = ["server", "client/src", "shared", "scripts"]
      .flatMap(dir => walk(resolve(ROOT, dir)))
      .map(path => relative(ROOT, path).replace(/\\/g, "/"))
      .filter(file => !(file in ALLOWED))
      .filter(file =>
        /aiCorrectionLog|ai_correction_log/.test(
          readFileSync(resolve(ROOT, file), "utf8")
        )
      );
    expect(offenders).toEqual([]);
  });
});
