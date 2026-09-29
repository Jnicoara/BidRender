/**
 * THE APP AT THE CATALOG LIMIT — `CATALOG_ROW_LIMIT` shipped rows.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * The limit in `server/seed/materials/types.ts` is a tripwire. No database
 * column, index, seed step or screen stops at it, so raising it is a one-line
 * change that proves nothing on its own. What actually gets slower as the
 * catalog grows is what this file measures, AT the limit, so raising the
 * number re-runs the proof at the new size:
 *
 *   1. SEARCH. `materials.list` sends the whole catalog to the browser and
 *      every keystroke in a material search box runs smartSearch plus
 *      rankMaterialHits over all of it, on the main thread. The cost is
 *      linear in rows, and the first letter typed is the worst case.
 *   2. LOADING. `getLibraryMaterials` reads the whole catalog unpaged for
 *      `materials.list` and the bid screens, and the response goes out as
 *      superjson with no compression in the Express server.
 *   3. THE PRICING SHEET. `pricing/buildPricingSheet.mts` and
 *      `pricing/writeWorkbook.cjs`, run as they are run by hand, on a catalog
 *      of this size.
 *
 * ── The padding is deliberately the hard case ───────────────────────────────
 * The catalog is the shipped one topped up with brand-prefixed copies of its
 * own rows ("Square D QO 20A Single-Pole breaker"), because brand variants are
 * the growth the limit's comment expects, and a copy shares EVERY word of its
 * original — the most ties and the most matches per keystroke that a row can
 * produce. Random names would match almost nothing and flatter the numbers.
 *
 * ── Budgets are generous on purpose ──────────────────────────────────────────
 * Timing on a shared machine is noisy, and a test that fails on a busy day
 * gets its budget raised without being read. So each budget sits well above
 * what was measured (the numbers are written beside it) and at a line that
 * means something to a user: CLAUDE.md § Responsiveness puts "feels instant"
 * at about 300ms.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { materials } from "../drizzle/schema";
import { mysqlConnection } from "./databaseConnection";
import { BASELINE_MATERIALS } from "./seed/materials";
import {
  CATALOG_ROW_LIMIT,
  type BaselineMaterial,
} from "./seed/materials/types";
import { smartSearchCorrected } from "../client/src/lib/smartSearch";
import { familySizes, rankMaterialHits } from "../shared/materialSearchRank";
import { commonnessPoints } from "../shared/materialCommonness";

// Spawning the pricing builder and filling a company's library take seconds.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const hasDb = Boolean(process.env.DATABASE_URL);

const BRANDS = [
  "Square D QO",
  "Square D Homeline",
  "Eaton BR",
  "Eaton CH",
  "Siemens QP",
  "GE THQL",
];

/** The shipped catalog, topped up to `size` with brand-prefixed copies. */
function scaledCatalog(size: number): BaselineMaterial[] {
  const out: BaselineMaterial[] = [...BASELINE_MATERIALS];
  for (let k = 0; out.length < size; k++) {
    const original = BASELINE_MATERIALS[k % BASELINE_MATERIALS.length];
    const brand =
      BRANDS[Math.floor(k / BASELINE_MATERIALS.length) % BRANDS.length];
    out.push({ ...original, name: `${brand} ${original.name}` });
  }
  return out;
}

/** Every prefix of each query, as a person types it. */
const TYPED = [
  "romex",
  "1/2 emt connector",
  "20a single pole breaker",
  "recepticle",
  "brakr",
  "c body",
  "4 square box",
  "thhn 12",
  "gfci",
  "3/4 pvc 90",
].flatMap(word =>
  Array.from({ length: word.length }, (_, i) => word.slice(0, i + 1))
);

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

describe(`search at ${CATALOG_ROW_LIMIT} rows`, () => {
  const catalog = scaledCatalog(CATALOG_ROW_LIMIT);
  const rows = catalog.map((m, i) => ({ id: i + 1, ...m }));

  it("is the size it claims to be", () => {
    expect(rows).toHaveLength(CATALOG_ROW_LIMIT);
    expect(new Set(rows.map(r => r.name)).size).toBe(CATALOG_ROW_LIMIT);
  });

  it("answers every keystroke the way the search box does, inside budget", () => {
    // useMaterialSearch, step for step: the rows mapped once, then
    // smartSearchCorrected and rankMaterialHits per keystroke, at the two
    // depths the screens ask for (MaterialPicker 80, the Materials screen 500).
    const prepStart = performance.now();
    const searchable = rows.map(r => ({
      id: String(r.id),
      description: r.name,
      searchAliases: r.searchAliases ?? null,
    }));
    const byId = new Map(rows.map(r => [String(r.id), r]));
    const families = familySizes(rows);
    const prep = performance.now() - prepStart;
    const now = new Date("2026-09-28T12:00:00Z");

    const search = (query: string, depth: number) => {
      const { results, searchedQuery } = smartSearchCorrected(
        searchable,
        query,
        depth
      );
      return rankMaterialHits(
        results.map(hit => ({ row: byId.get(hit.item.id)!, score: hit.score })),
        searchedQuery,
        {
          families,
          commonness: row => commonnessPoints(row.name, undefined, now),
        }
      );
    };

    const times: number[] = [];
    for (const depth of [80, 500]) {
      for (const query of TYPED) {
        const start = performance.now();
        search(query, depth);
        times.push(performance.now() - start);
      }
    }
    times.sort((a, b) => a - b);
    const median = percentile(times, 0.5);
    const p95 = percentile(times, 0.95);
    console.log(
      `[catalogScale] search at ${CATALOG_ROW_LIMIT}: prep ${prep.toFixed(1)} ms, ` +
        `${times.length} keystrokes, median ${median.toFixed(1)} ms, ` +
        `p95 ${p95.toFixed(1)} ms, worst ${times[times.length - 1].toFixed(1)} ms`
    );

    // Still finds things, at scale: a padded catalog that broke ranking would
    // pass every timing below by returning nothing quickly.
    expect(search("c body", 80)[0].name).toMatch(/ C conduit body$/);
    expect(search("romex", 80)[0].name).toMatch(/NM-B/);
    expect(search("recepticle", 80).length).toBeGreaterThan(0);

    expect(prep).toBeLessThan(BUDGET.prepMs);
    expect(median).toBeLessThan(BUDGET.medianKeystrokeMs);
    expect(p95).toBeLessThan(BUDGET.p95KeystrokeMs);
  });
});

const repo = path.resolve(import.meta.dirname, "..");
const tsx = path.join(repo, "node_modules", "tsx", "dist", "cli.mjs");

/** The company whose library is read. Only exists in the scratch database. */
const COMPANY = 6303;

/**
 * A database of this file's own, dropped afterwards, holding a copy of
 * `materials` and nothing else — which is all `getLibraryMaterials` reads.
 *
 * NOT the shared test database: padding that to 3,000 rows races
 * `server/backup.test.ts`, which dumps every table and compares counts, and
 * the first version of this file made it fail (todo.md, "Flaky tests").
 * The `bidrender_%` grant covers the name.
 */
const SCRATCH = "bidrender_catalogscale_test";

describe.skipIf(!hasDb)(`loading a ${CATALOG_ROW_LIMIT}-row library`, () => {
  let admin: Pool | null = null;
  let scratchUrl = "";
  let shippedRows = 0;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    const shared = url.pathname.slice(1);
    if (!/^\w+$/.test(shared)) throw new Error(`odd database name: ${shared}`);
    url.pathname = `/${SCRATCH}`;
    scratchUrl = url.toString();

    admin = createPool(mysqlConnection(process.env.DATABASE_URL!));
    await admin.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
    await admin.query(
      `CREATE DATABASE \`${SCRATCH}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await admin.query(
      `CREATE TABLE \`${SCRATCH}\`.materials LIKE \`${shared}\`.materials`
    );
    // The shipped rows as the shared test database holds them — read, never
    // written — then the company's own rows to make up the difference.
    const [copied] = await admin.query(
      `INSERT INTO \`${SCRATCH}\`.materials
         SELECT * FROM \`${shared}\`.materials
         WHERE userId IS NULL AND isActive = 1`
    );
    shippedRows = (copied as { affectedRows: number }).affectedRows;

    const scratchPool = createPool(mysqlConnection(scratchUrl));
    const scratch = drizzle(scratchPool);
    const own = scaledCatalog(CATALOG_ROW_LIMIT + shippedRows)
      .slice(BASELINE_MATERIALS.length)
      .slice(0, CATALOG_ROW_LIMIT - shippedRows)
      .map(m => ({
        name: m.name,
        unitOfSale: m.unitOfSale,
        costPerUnit: m.costPerUnit,
        category: m.category,
        searchAliases: m.searchAliases,
        description: m.description ?? null,
        userId: COMPANY,
      }));
    for (let i = 0; i < own.length; i += 100) {
      await scratch.insert(materials).values(own.slice(i, i + 100));
    }
    await scratchPool.end();
  });

  afterAll(async () => {
    await admin?.query(`DROP DATABASE IF EXISTS \`${SCRATCH}\``);
    await admin?.end();
  });

  it("reads the whole library, and what goes over the wire, inside budget", () => {
    // The real getLibraryMaterials, in a child process whose DATABASE_URL is
    // the scratch database — see scripts/catalogLoadProbe.mts for why a child.
    const run = spawnSync(
      process.execPath,
      [
        tsx,
        path.join(repo, "scripts", "catalogLoadProbe.mts"),
        String(COMPANY),
      ],
      {
        env: { ...process.env, DATABASE_URL: scratchUrl },
        encoding: "utf8",
        cwd: repo,
      }
    );
    expect(run.status, run.stderr).toBe(0);
    const probe = JSON.parse(run.stdout.trim().split("\n").pop()!) as {
      rows: number;
      revivedRows: number;
      readMs: number;
      bytes: number;
      gzippedBytes: number;
      parseMs: number;
    };
    console.log(
      `[catalogScale] getLibraryMaterials at ${probe.rows} ` +
        `(${shippedRows} shipped + own): median ${probe.readMs.toFixed(1)} ms, ` +
        `response ${(probe.bytes / 1024).toFixed(0)} KB ` +
        `(${(probe.gzippedBytes / 1024).toFixed(0)} KB gzipped), ` +
        `parsed in ${probe.parseMs.toFixed(1)} ms`
    );

    expect(shippedRows).toBeGreaterThan(0);
    expect(probe.rows).toBe(CATALOG_ROW_LIMIT);
    expect(probe.revivedRows).toBe(CATALOG_ROW_LIMIT);
    expect(probe.readMs).toBeLessThan(BUDGET.libraryReadMs);
    expect(probe.bytes).toBeLessThan(BUDGET.responseBytes);
    expect(probe.parseMs).toBeLessThan(BUDGET.parseMs);
  });
});

describe(`the pricing sheet at ${CATALOG_ROW_LIMIT} rows`, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-scale-"));
  const catalog = scaledCatalog(CATALOG_ROW_LIMIT);
  const env = {
    ...process.env,
    PRICING_CATALOG_JSON: path.join(out, "catalog.json"),
    PRICING_OUT_DIR: out,
  };
  fs.writeFileSync(env.PRICING_CATALOG_JSON, JSON.stringify(catalog));

  afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

  it("builds, with every catalog row once and its note carried", () => {
    const start = performance.now();
    const run = spawnSync(
      process.execPath,
      [tsx, path.join(repo, "pricing", "buildPricingSheet.mts")],
      { env, encoding: "utf8", cwd: repo }
    );
    const took = performance.now() - start;
    expect(run.status, run.stderr).toBe(0);

    const { generic } = JSON.parse(
      fs.readFileSync(path.join(out, "rows.json"), "utf8")
    ) as { generic: { name: string; notes?: string }[] };
    console.log(
      `[catalogScale] pricing sheet from ${catalog.length} rows: ` +
        `${generic.length} generic rows in ${(took / 1000).toFixed(1)} s`
    );

    const byName = new Map<string, number>();
    for (const row of generic) {
      byName.set(row.name, (byName.get(row.name) ?? 0) + 1);
    }
    const missing = catalog.filter(m => byName.get(m.name) !== 1);
    expect(missing.map(m => m.name)).toEqual([]);

    const notes = new Map(generic.map(row => [row.name, row.notes]));
    const unnoted = catalog.filter(
      m => m.description && notes.get(m.name) !== m.description
    );
    expect(unnoted.map(m => m.name)).toEqual([]);
  });

  /*
    The workbook needs exceljs, which is NOT a dependency on purpose
    (writeWorkbook.cjs says why). So this runs only where it can be found —
    run the suite with NODE_PATH pointing at a scratch install to include it.
    Skipped is not passed: say so when reporting a run that skipped it.
  */
  const exceljs = (() => {
    try {
      return createRequire(import.meta.url).resolve("exceljs", {
        paths: (process.env.NODE_PATH ?? "").split(path.delimiter),
      });
    } catch {
      return null;
    }
  })();

  it.skipIf(!exceljs)("writes the workbook from those rows", () => {
    const xlsx = path.join(out, "sheet.xlsx");
    const run = spawnSync(
      process.execPath,
      [path.join(repo, "pricing", "writeWorkbook.cjs"), xlsx],
      { env, encoding: "utf8", cwd: repo }
    );
    expect(run.status, run.stderr).toBe(0);
    expect(fs.statSync(xlsx).size).toBeGreaterThan(0);
    console.log(`[catalogScale] workbook: ${run.stdout.trim()}`);
  });
});

/**
 * Where the budgets sit, against what was measured at 3,000 rows on
 * 2026-09-28 (a desktop dev machine, this file run alone, three runs). Each
 * sits several times above the measurement, at a line a user would notice.
 *
 * A field laptop is slower than the machine these came from, and search runs
 * on the browser's main thread — so the keystroke numbers are the ones to
 * watch. If p95 ever nears its budget, the fix is to move search off the
 * main thread or onto the server, not to raise the budget.
 */
const BUDGET = {
  /** Mapping the rows and reading family sizes, once per list. Measured 8–9. */
  prepMs: 200,
  /** Measured 9–12 ms. */
  medianKeystrokeMs: 60,
  /** Measured 82–100 ms; worst single keystroke 129–176 ms, a first letter. */
  p95KeystrokeMs: 300,
  /** Local MySQL, so network time is NOT in this. Measured 37–53 ms. */
  libraryReadMs: 1_000,
  /**
   * The raw superjson body: 2,124 KB, about 725 bytes a row, so ~1 MB at
   * today's 1,455. Live traffic goes through Cloudflare, which compresses it
   * (Content-Encoding: br, checked on bidridge.com 2026-09-28) to ~115 KB —
   * the Express server itself does NOT compress, so a host without that edge
   * would send the full size. The budget catches a row growing, e.g. a wide
   * new column on materials.
   */
  responseBytes: 3_000_000,
  /** superjson.parse of that body, as the browser does. Measured 40–62 ms. */
  parseMs: 300,
};
