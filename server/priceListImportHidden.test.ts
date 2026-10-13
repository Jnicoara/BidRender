/**
 * "Import price list" stays hidden until it can tell per M from per foot.
 *
 * @/lib/priceListImport says why: "$480.00/M" saves as $480 per foot, with no
 * preview and no undo. vitest cannot render a component here (vitest.config.ts
 * covers `client/src/lib`, not pages), so this reads the SOURCE, the same way
 * server/aiCallsAreButtons.test.ts does.
 *
 * What it searches for, so the gap between the question and the answer is
 * visible: the one thing that opens the dialog, `setImportOpen(true)`, and
 * the tRPC procedure `materials.importPrices`. A second button wired some
 * other way (a new state name, a menu item calling the mutation directly)
 * would get past the first check and is caught by the second, which pins the
 * procedure to the one page that gates it.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { PRICE_LIST_IMPORT_SHOWN } from "../client/src/lib/priceListImport";

const CLIENT = resolve(import.meta.dirname, "../client/src");
const PAGE = resolve(CLIENT, "pages/MaterialDatabasePage.tsx");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [full]
      : [];
  });
}

describe("supplier price-list import is hidden", () => {
  it("is switched off", () => {
    expect(PRICE_LIST_IMPORT_SHOWN).toBe(false);
  });

  it("its only opener sits inside the PRICE_LIST_IMPORT_SHOWN gate", () => {
    const src = readFileSync(PAGE, "utf8");
    // Array.from, not a spread: tsconfig has no `target` yet.
    const openers = Array.from(src.matchAll(/setImportOpen\(\s*true\s*\)/g));
    expect(openers).toHaveLength(1);
    const gate = src.indexOf("{PRICE_LIST_IMPORT_SHOWN && (");
    expect(gate).toBeGreaterThan(-1);
    // The gated block ends at the first `)}` closing it; the opener is inside.
    const end = src.indexOf(")}", gate);
    const at = openers[0].index!;
    expect(at).toBeGreaterThan(gate);
    expect(at).toBeLessThan(end);
  });

  it("no other screen calls materials.importPrices", () => {
    const callers = sourceFiles(CLIENT)
      .filter(f =>
        // `trpc.` so a comment naming the procedure is not a caller.
        /\btrpc\s*\.\s*materials\s*\.\s*importPrices\b/.test(
          readFileSync(f, "utf8")
        )
      )
      .map(f => relative(CLIENT, f).replace(/\\/g, "/"));
    expect(callers).toEqual(["pages/MaterialDatabasePage.tsx"]);
  });

  it("the labor-sheet import beside it is still shown, ungated", () => {
    const src = readFileSync(PAGE, "utf8");
    const labor = src.indexOf("setLaborOpen(true)");
    expect(labor).toBeGreaterThan(-1);
    const gate = src.indexOf("{PRICE_LIST_IMPORT_SHOWN && (");
    expect(labor).toBeGreaterThan(src.indexOf(")}", gate));
  });
});
