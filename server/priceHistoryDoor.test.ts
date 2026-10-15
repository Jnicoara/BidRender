/**
 * THE PRICE DOOR — no company price changes unrecorded
 * (references/price-history-plan.md § 3.1, test 7).
 *
 * Two halves, because one could be walked around:
 *
 * 1. TYPES. `db.updateMaterial` / `createMaterial` do not accept
 *    `costPerUnit` or `packPrice` at all (`costPerUnit?: never`), only a
 *    `PricedWrite` that carries why. Every caller in the app is held to it
 *    by `pnpm check` — that is what made the routers, the import and "save
 *    line as assembly" pass a reason when this was built.
 * 2. THIS SCAN, for the writes that skip those two functions entirely: every
 *    `.update(materials)` / `.insert(materials)` (or raw SQL on the table) in
 *    server code must sit in a function named below, with the reason it
 *    cannot change a company's price unrecorded. A new one anywhere goes red.
 *
 * Searched by the table being written, which cannot be spelled another way —
 * not by a call shape (CLAUDE.md § "A grep is a measurement").
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

/** file → function → why it may write `materials` directly. */
const ALLOWED: Record<string, Record<string, string>> = {
  "server/db.ts": {
    setLifecycle: "archive / restore: status and archivedAt only",
    createMaterial: "THE DOOR: records a price above 0",
    updateMaterial: "THE DOOR: records a changed price",
    forkMaterial:
      "a copy of the shipped row — the company's price does not change (no row, § 2)",
    revertMaterialToBaseline: "records the price going back, as the door does",
    seedBaselineMaterialsFrom: "inserts SHIPPED rows (userId NULL)",
    reactivateBaselineMaterials: "shared rows, isActive only",
    stampMaterialTrade: "shared rows, trade only",
  },
};

/** Where a generic `.update(table)` may reach `materials` (shared rows, logged). */
const GENERIC_WRITERS = new Set(["server/starterChanges.ts"]);

function serverFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory())
      return name === "node_modules" ? [] : serverFiles(full);
    return /\.m?ts$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
  });
}

/** The name of the function a character offset sits in. */
function enclosingFunction(text: string, offset: number): string {
  const before = text.slice(0, offset);
  const re = /(?:^|\n)(?:export )?(?:async )?function\s+([A-Za-z0-9_]+)/g;
  let last = "(top level)";
  for (let m = re.exec(before); m !== null; m = re.exec(before)) last = m[1];
  return last;
}

const WRITE = new RegExp(
  [
    String.raw`\.update\(materials\)`,
    String.raw`\.insert\(materials\)`,
    String.raw`UPDATE\s+\x60?materials\x60?\s`,
    String.raw`INSERT\s+INTO\s+\x60?materials\x60?[\s(]`,
  ].join("|"),
  "g"
);

describe("the material price door", () => {
  const found: { file: string; fn: string }[] = [];
  for (const full of serverFiles(join(ROOT, "server"))) {
    const file = relative(ROOT, full).replace(/\\/g, "/");
    const text = readFileSync(full, "utf8");
    WRITE.lastIndex = 0;
    for (let m = WRITE.exec(text); m !== null; m = WRITE.exec(text))
      found.push({ file, fn: enclosingFunction(text, m.index) });
  }

  it("finds the writes it is guarding (the scan is not blind)", () => {
    // If this ever drops to nothing, the pattern stopped matching the code,
    // and every assertion below would pass vacuously.
    expect(found.some(w => w.fn === "updateMaterial")).toBe(true);
    expect(found.some(w => w.fn === "createMaterial")).toBe(true);
  });

  it("every direct write to materials is in a function that cannot change a company price unrecorded", () => {
    const unexplained = found.filter(w => !ALLOWED[w.file]?.[w.fn]);
    expect(
      unexplained,
      "A new write to `materials`: send a price through db.updateMaterial / createMaterial (a PricedWrite), or add the function to ALLOWED with why it cannot change a company's price."
    ).toEqual([]);
  });

  it("names no function that no longer writes (the list is not stale)", () => {
    for (const [file, fns] of Object.entries(ALLOWED))
      for (const fn of Object.keys(fns))
        expect(
          found.some(w => w.file === file && w.fn === fn),
          `${file} ${fn} is allowed but writes nothing — take it off the list`
        ).toBe(true);
  });

  it("only starterChanges writes a table it was handed (shared rows, logged in starter_changes)", () => {
    for (const full of serverFiles(join(ROOT, "server"))) {
      const file = relative(ROOT, full).replace(/\\/g, "/");
      if (GENERIC_WRITERS.has(file)) continue;
      const text = readFileSync(full, "utf8");
      // `.update(table)` / `.update(t)` — a table chosen at run time.
      expect(
        /\.update\((?:table|t)\)/.test(text),
        `${file} updates a table chosen at run time; if it can be \`materials\`, it must go through the door.`
      ).toBe(false);
    }
  });
});
