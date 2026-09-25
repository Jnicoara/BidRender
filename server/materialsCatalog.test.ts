/**
 * The shipped catalog itself — its shape, its slang, and how it consolidates
 * against a database that already holds an older, smaller version of it.
 *
 * Split from materialsLibrary.test.ts, which covers the data layer's behaviour
 * (fork, revert, archive). This file is about the CONTENT: 600-odd rows that
 * nobody will ever re-read by eye, where a single mis-shelved item or a
 * cross-alias is invisible until an estimator's search quietly returns the
 * wrong thing. Most of these assertions loop over the whole catalog for exactly
 * that reason — they are the only reader it will ever get.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq, isNull, sql } from "drizzle-orm";
import {
  BASELINE_MATERIALS,
  RENAMED_BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/baselineMaterials";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { MATERIAL_CATEGORIES } from "../drizzle/schema";
import { materials } from "../drizzle/schema";
import {
  getDb,
  getLibraryMaterials,
  getMaterialById,
  forkMaterial,
  seedBaselineMaterials,
  updateMaterial,
} from "./db";
import { countNeedingPricing, needsPricing } from "../shared/materialPricing";
import { smartSearch } from "../client/src/lib/smartSearch";
import { wordsInName } from "../shared/aliasSuggestions";

const hasDb = !!process.env.DATABASE_URL;
const USER = 7373;

// ─── Shape — pure, no database ────────────────────────────────────────────────

describe("shipped catalog shape", () => {
  it("is the size the catalog was specified at", () => {
    // A floor and a ceiling rather than an exact number: adding a material is
    // routine, and a test that fails on every addition gets updated without
    // being read. Falling outside this range means something generated too
    // much or a whole family went missing.
    expect(BASELINE_MATERIALS.length).toBeGreaterThan(500);
    // Raised from 700 to 800 on 2026-09-25, when the lighting audit added 49
    // rows on purpose (tubes, lamps, promoted troffers/cans) and took the
    // catalog to ~708. Raised again to 1,250 the same day, when the unblocked
    // pricing-sheet rows moved in (~410 rows, taking it to ~1,120). Still a
    // ceiling: a generator that runs away blows through it, and so does
    // anything that doubles a family.
    expect(BASELINE_MATERIALS.length).toBeLessThan(1250);
  });

  it("has no duplicate names", () => {
    // Names are the seeder's match key. Two rows sharing one means the second
    // silently never gets inserted.
    const seen = new Map<string, number>();
    for (const m of BASELINE_MATERIALS)
      seen.set(m.name, (seen.get(m.name) ?? 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([name]) => name);
    expect(dupes, `duplicated: ${dupes.join(", ")}`).toEqual([]);
  });

  it("ships every row unpriced", () => {
    const priced = BASELINE_MATERIALS.filter(m => !needsPricing(m.costPerUnit));
    expect(
      priced.map(m => m.name),
      "shipped with a price"
    ).toEqual([]);
  });

  it("shelves every row in a real category", () => {
    const valid = new Set<string>(MATERIAL_CATEGORIES);
    for (const m of BASELINE_MATERIALS) {
      expect(
        valid.has(m.category),
        `${m.name} has category ${m.category}`
      ).toBe(true);
    }
  });

  it("fills every shelf it declares", () => {
    // An empty category renders as nothing and is dead weight in the picker.
    const used = new Set(BASELINE_MATERIALS.map(m => m.category));
    const empty = MATERIAL_CATEGORIES.filter(c => !used.has(c));
    expect(empty, `no materials filed under: ${empty.join(", ")}`).toEqual([]);
  });

  it("gives every material trade slang to be found by", () => {
    const bare = BASELINE_MATERIALS.filter(m => !m.searchAliases.trim());
    expect(
      bare.map(m => m.name),
      "no aliases"
    ).toEqual([]);
  });

  it("files low-voltage material under the low-voltage trade, and nothing else", () => {
    for (const m of BASELINE_MATERIALS) {
      const expected =
        m.category === "Low Voltage" ? "low-voltage" : "electrical";
      expect(m.trade ?? "electrical", `${m.name}`).toBe(expected);
    }
  });
});

// ─── Alias hygiene ────────────────────────────────────────────────────────────

describe("alias hygiene across the whole catalog", () => {
  it("never restates a word the material's own name already contains", () => {
    // An alias that repeats the name is dead weight: the name already matches,
    // at a higher tier than alias text can reach.
    const offenders: string[] = [];
    for (const m of BASELINE_MATERIALS) {
      const nameWords = wordsInName(m.name);
      const restated = m.searchAliases
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2 && nameWords.has(w));
      if (restated.length)
        offenders.push(`${m.name} restates: ${restated.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("never aliases one material to the full name of a different one", () => {
    // The rule that protects search. Aliasing "wall plate" onto a receptacle
    // makes the plate outrank the thing the user actually named, and nothing
    // on screen says why.
    const names = new Set(BASELINE_MATERIALS.map(m => m.name.toLowerCase()));
    const offenders: string[] = [];
    for (const m of BASELINE_MATERIALS) {
      const text = ` ${m.searchAliases.toLowerCase()} `;
      for (const other of names) {
        if (other === m.name.toLowerCase()) continue;
        if (text.includes(` ${other} `))
          offenders.push(`${m.name} -> "${other}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("sells the track and its heads as separate items", () => {
    // A section of track lights nothing on its own. A takeoff listing only
    // rail has priced the trim and forgotten the fixtures, which is most of
    // the money.
    const names = BASELINE_MATERIALS.map(m => m.name);
    expect(names).toContain("4 ft lighting track");
    expect(names).toContain("6 ft lighting track");
    expect(names).toContain("8 ft lighting track");
    expect(names).toContain("Track light head");
  });

  it("separates under-cabinet bars from tape sold by the foot", () => {
    const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
    for (const size of ['12"', '18"', '24"', '36"']) {
      const bar = byName.get(`${size} under-cabinet light bar`);
      expect(bar, `${size} bar missing`).toBeDefined();
      expect(bar!.unitOfSale).toBe("each");
    }
    // Tape is cut to the run, so it is taken off as footage. Pricing a reel as
    // a unit, or a bar by the foot, is wrong by an order of magnitude.
    expect(byName.get("LED tape light")?.unitOfSale).toBe("foot");
  });

  it("ships exactly two wafer sizes, with no duplicate 6 inch row", () => {
    const wafers = BASELINE_MATERIALS.filter(m => m.name.includes("wafer")).map(
      m => m.name
    );
    expect(wafers).toEqual([
      '4" wafer LED downlight',
      '5"/6" wafer LED downlight',
    ]);
  });

  it("stocks a fuse for every fused disconnect amperage", () => {
    const fused = BASELINE_MATERIALS.filter(m =>
      /^\d+A fused disconnect$/.test(m.name)
    ).map(m => m.name.match(/^(\d+)/)![1]);
    const fuses = BASELINE_MATERIALS.filter(m =>
      /cartridge fuse$/.test(m.name)
    ).map(m => m.name.match(/^(\d+)/)![1]);
    for (const amps of fused) {
      expect(
        fuses,
        `no ${amps}A fuse for the ${amps}A fused disconnect`
      ).toContain(amps);
    }
  });

  it("sizes crimp lugs by conductor range, not per gauge", () => {
    const lugs = BASELINE_MATERIALS.filter(m =>
      m.name.endsWith("crimp lug")
    ).map(m => m.name);
    expect(lugs).toEqual([
      "14-10 AWG crimp lug",
      "8-6 AWG crimp lug",
      "4-2 AWG crimp lug",
      "1-1/0 AWG crimp lug",
      "2/0-4/0 AWG crimp lug",
    ]);
  });

  it("never lists a retired name as a current material", () => {
    // Retiring and shipping the same name would have the seeder insert it and
    // deactivate it on every startup, flickering it in and out of the catalog.
    const current = new Set(BASELINE_MATERIALS.map(m => m.name));
    const clashes = RETIRED_BASELINE_MATERIALS.filter(name =>
      current.has(name)
    );
    expect(clashes).toEqual([]);
  });

  it("describes only what could genuinely be confused", () => {
    // Descriptions are meant to be sparse. If most rows carry one, they have
    // become boilerplate and stopped being read.
    const described = BASELINE_MATERIALS.filter(m => m.description).length;
    expect(described).toBeLessThan(BASELINE_MATERIALS.length / 2);
  });
});

// ─── Searchability ────────────────────────────────────────────────────────────

describe("searching the enlarged catalog", () => {
  const index = BASELINE_MATERIALS.map((m, i) => ({
    id: String(i),
    description: m.name,
    unit: m.unitOfSale,
    searchAliases: m.searchAliases,
  }));

  const search = (query: string, limit = 8) =>
    smartSearch(index, query, limit).map(
      hit => BASELINE_MATERIALS[Number(hit.id)].name
    );

  /** The queried term must appear somewhere in the top few hits. */
  const expectHit = (query: string, name: string, within = 8) => {
    const hits = search(query, within);
    expect(hits, `"${query}" did not surface ${name}`).toContain(name);
  };

  it("still finds the trade slang the original catalog was built around", () => {
    // These are the searches that mattered before the catalog grew twentyfold.
    // Growth is exactly what breaks them, so they are pinned.
    expectHit("1900", '4" square box');
    expectHit("gem box", "Single-gang box");
    expectHit("romex", "12-2 NM-B");
    expectHit("plug", "Duplex receptacle");
    expectHit("gfi", "GFCI receptacle");
    expectHit("marrette", "Wire nuts");
    expectHit("spring nut", "Strut channel nut");
    expectHit("thinwall", '1/2" EMT');
  });

  it("finds a size however the estimator types it", () => {
    // The three spellings of a fractional trade size are all load-bearing.
    for (const query of ['1-1/4" emt', "1 1/4 emt", "1.25 emt"]) {
      expectHit(query, '1-1/4" EMT');
    }
  });

  it("finds new families by their job-site names", () => {
    expectHit("greenfield", '1/2" flexible metal conduit');
    expectHit("sealtite", '1/2" liquidtight flexible conduit');
    expectHit("condulet", '1/2" EMT LB conduit body');
    expectHit("mcm", "500 kcmil THHN");
    // The 5"/6" wafer covers both trim openings, so "6 inch wafer" has to
    // reach it — there is deliberately no standalone 6" row to find.
    expectHit("wafer", '5"/6" wafer LED downlight');
    expectHit("6 wafer", '5"/6" wafer LED downlight');
    expectHit("bx", "12-2 MC cable");
    expectHit("acorn", "Ground rod clamp");
    expectHit("driven electrode", "Ground rod, 8 ft");
    expectHit("wago", "Lever wire connector, 2-port");
    expectHit("tapcon", "Masonry screw");
    expectHit("evse", "EV charger");
  });

  it("ranks the item a query names above anything merely aliased to it", () => {
    // The "recep" regression, re-pinned at the new scale: a device must not be
    // outranked by something that only mentions it in passing.
    expect(search("recep", 1)[0]).toBe("Duplex receptacle");
    expect(search("wall plate", 1)[0]).toBe("Wall plate");
    expect(search("ground rod", 1)[0]).toBe("Ground rod, 8 ft");
  });

  it("ranks a product above its own accessories", () => {
    // The same failure wearing different clothes, and the one the enlarged
    // catalog actually introduced: "Cable staple" carried a "romex" alias, so
    // searching "romex" returned the staple above the cable it holds. An
    // accessory may be findable by the thing it serves; it may not outrank it.
    expect(search("romex", 1)[0]).toMatch(/NM-B$/);
  });

  it("keeps solid and stranded 10 AWG distinguishable", () => {
    const hits = search("10 thhn", 4);
    expect(hits).toContain("#10 THHN");
    expect(hits).toContain("#10 THHN stranded");
  });

  it("does not let aluminum outrank copper for a copper query", () => {
    expect(search("#4 thhn", 1)[0]).toBe("#4 THHN");
  });
});

// ─── Pricing flag ─────────────────────────────────────────────────────────────

describe("needsPricing", () => {
  it("flags the shipped zero", () => {
    expect(needsPricing("0.0000")).toBe(true);
    expect(needsPricing(0)).toBe(true);
  });

  it("clears as soon as a real price is entered", () => {
    expect(needsPricing("1.2500")).toBe(false);
    expect(needsPricing(0.01)).toBe(false);
  });

  it("treats a missing or unreadable cost as still needing one", () => {
    // Better to over-report than to let a broken row pass as priced.
    expect(needsPricing(null)).toBe(true);
    expect(needsPricing(undefined)).toBe(true);
    expect(needsPricing("not a number")).toBe(true);
  });

  it("counts what is left to price", () => {
    expect(
      countNeedingPricing([
        { costPerUnit: "0.0000" },
        { costPerUnit: "2.5000" },
        { costPerUnit: "0" },
      ])
    ).toBe(2);
  });
});

// ─── Seeding and consolidation ────────────────────────────────────────────────

describe.skipIf(!hasDb)("seeding the catalog into a live database", () => {
  beforeAll(async () => {
    // Start from no forks for this user. An earlier run's fork would hide the
    // baseline it came from — mergeLibraryRows does that by design — and the
    // tests below would then be looking for a row that is deliberately absent.
    const db = await getDb();
    await db!.delete(materials).where(eq(materials.userId, USER));
    await seedBaselineMaterials();
  });

  /** Baselines read straight from the table: the merged list hides forks. */
  const baselineRows = async () => {
    const db = await getDb();
    return db!.select().from(materials).where(isNull(materials.userId));
  };

  const baselineNamed = async (name: string) => {
    const rows = await baselineRows();
    const row = rows.find(r => r.name === name);
    expect(row, `no baseline row named "${name}"`).toBeDefined();
    return row!;
  };

  it("inserts every material in the catalog", async () => {
    // Asserted by presence rather than by row count. A database that has been
    // through several rounds of this development may still hold a baseline row
    // whose name was later changed; that is a leftover to notice separately,
    // not a reason for "did everything get seeded" to fail.
    const present = new Set((await baselineRows()).map(r => r.name));
    const absent = BASELINE_MATERIALS.filter(m => !present.has(m.name)).map(
      m => m.name
    );
    expect(absent, `never inserted: ${absent.slice(0, 10).join(", ")}`).toEqual(
      []
    );
  });

  it("adds nothing on a second run", async () => {
    const db = await getDb();
    const count = async () => {
      const [row] = await db!
        .select({ n: sql<number>`count(*)` })
        .from(materials)
        .where(isNull(materials.userId));
      return Number(row.n);
    };
    const before = await count();
    await seedBaselineMaterials();
    expect(await count()).toBe(before);
  });

  it("leaves no duplicate names behind", async () => {
    const db = await getDb();
    const rows = await db!
      .select({ name: materials.name })
      .from(materials)
      .where(isNull(materials.userId));
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of rows) {
      if (seen.has(r.name)) dupes.push(r.name);
      seen.add(r.name);
    }
    expect(dupes).toEqual([]);
  });

  it("renames the reshaped rows in place rather than duplicating them", async () => {
    // The consolidation requirement: an item that is clearly the same thing
    // under a new name must keep its ROW, because assemblies, kits and takeoff
    // stamps all point at its id.
    const db = await getDb();
    for (const [from, to] of Object.entries(RENAMED_BASELINE_MATERIALS)) {
      const old = await db!
        .select()
        .from(materials)
        .where(eq(materials.name, from));
      expect(
        old.filter(r => r.userId === null),
        `"${from}" survived the rename`
      ).toEqual([]);

      const now = await db!
        .select()
        .from(materials)
        .where(eq(materials.name, to));
      expect(now.filter(r => r.userId === null).length, `"${to}" missing`).toBe(
        1
      );
    }
  });

  it("withdraws retired rows from the catalog without destroying them", async () => {
    // Retiring must not delete: assemblies, kits and takeoff stamps point at
    // material ids, and a bid priced from one of these last month still has to
    // resolve the part it was priced from. So the row survives, deactivated,
    // and simply stops appearing anywhere.
    const db = await getDb();
    const rows = await db!
      .select()
      .from(materials)
      .where(isNull(materials.userId));
    const byName = new Map(rows.map(r => [r.name, r]));

    for (const name of RETIRED_BASELINE_MATERIALS) {
      const row = byName.get(name);
      if (!row) continue; // never existed in this database — fine
      expect(row.isActive, `${name} is still active`).toBe(false);
    }

    // And none of them can be reached through the library any more.
    const visible = await getLibraryMaterials(USER);
    const leaked = visible.filter(m =>
      RETIRED_BASELINE_MATERIALS.includes(m.name)
    );
    expect(leaked.map(m => m.name)).toEqual([]);
  });

  it("drags every shipped row back to unpriced", async () => {
    // The old catalog carried plausible estimate prices. They are gone, and a
    // restart must not bring them back.
    const db = await getDb();
    const rows = await db!
      .select({ name: materials.name, costPerUnit: materials.costPerUnit })
      .from(materials)
      .where(isNull(materials.userId));
    const priced = rows.filter(r => !needsPricing(r.costPerUnit));
    expect(priced.map(r => r.name)).toEqual([]);
  });

  it("stamps the low-voltage trade onto low-voltage rows only", async () => {
    const db = await getDb();
    const rows = await db!
      .select({
        name: materials.name,
        trade: materials.trade,
        category: materials.category,
      })
      .from(materials)
      .where(isNull(materials.userId));
    for (const r of rows) {
      expect(r.trade, r.name).toBe(
        r.category === "Low Voltage" ? "low-voltage" : "electrical"
      );
    }
  });

  it("never overwrites a price the user set on their own copy", async () => {
    // The whole point of the zeroing pass is that it cannot reach user rows.
    const baseline = await baselineNamed('3/4" EMT');
    const forkId = await forkMaterial(baseline.id, USER);

    await updateMaterial(forkId, USER, { costPerUnit: "1.4400" });
    await seedBaselineMaterials();

    const fork = await getMaterialById(forkId, USER);
    expect(fork?.costPerUnit).toBe("1.4400");
    expect(needsPricing(fork?.costPerUnit)).toBe(false);
  });

  it("clears the needs-pricing flag once a real price is entered", async () => {
    // The behaviour the pricing workflow is specified around, end to end: a
    // flagged item, priced, stops being flagged and displays normally.
    const baseline = await baselineNamed("Wire nuts");
    expect(needsPricing(baseline.costPerUnit)).toBe(true);

    const before = countNeedingPricing(await getLibraryMaterials(USER));

    const forkId = await forkMaterial(baseline.id, USER);
    await updateMaterial(forkId, USER, { costPerUnit: "0.0800" });

    const priced = await getMaterialById(forkId, USER);
    expect(needsPricing(priced?.costPerUnit)).toBe(false);

    // And the worklist shrinks by exactly one: the fork supersedes the baseline
    // it came from rather than sitting alongside it, so the item leaves the
    // "needs pricing" filter instead of being counted twice.
    const after = await getLibraryMaterials(USER);
    expect(after.some(r => r.id === forkId)).toBe(true);
    expect(after.some(r => r.id === baseline.id)).toBe(false);
    expect(countNeedingPricing(after)).toBe(before - 1);
  });
});

/**
 * Breakers: the naming standard, the shelf split, and type coverage.
 *
 * The coverage half is not decoration. A catalog that ships only the AFCI/GFCI
 * combo forces an estimator either to mis-specify a bedroom circuit or to add
 * the row by hand on every job — and the second one silently rebuilds a private
 * catalog, which is the failure the whole one-list rule exists to stop.
 */
describe("breakers", () => {
  const breakers = () =>
    BASELINE_MATERIALS.filter(m => m.category === "Breakers");
  const named = (name: string) => BASELINE_MATERIALS.find(m => m.name === name);

  it("writes pole count the way a supply house does", () => {
    // "20/2" is how it is said; "20A 2-Pole" is how it is written and ordered.
    for (const amps of ["20", "30", "40", "50", "60", "70", "100"]) {
      expect(named(`${amps}A 2-Pole breaker`)).toBeDefined();
      expect(named(`${amps}/2 breaker`)).toBeUndefined();
    }
  });

  it("keeps the spoken forms searchable after the rename", () => {
    // Asserted through SEARCH, not by reading the alias string. `aliases()`
    // strips words the name already carries, and the name now contains
    // "2-Pole" — so "pole" is correctly absent from the aliases while still
    // being findable. Checking the string would have failed on a rule working
    // exactly as intended.
    const index = BASELINE_MATERIALS.map((m, i) => ({
      id: String(i),
      description: m.name,
      unit: m.unitOfSale,
      searchAliases: m.searchAliases,
    }));
    const find = (query: string) =>
      smartSearch(index, query, 8).map(
        hit => BASELINE_MATERIALS[Number(hit.id)].name
      );

    for (const term of [
      "20/2",
      "double pole",
      "two pole",
      "dp 20",
      "2 pole 20",
    ]) {
      expect(find(term), `"${term}" should still find it`).toContain(
        "20A 2-Pole breaker"
      );
    }
  });

  it("renames in place rather than adding a second row", () => {
    // Baseline rows are matched by name, so a text edit would have orphaned
    // every assembly pointing at the old one.
    for (const amps of ["20", "30", "40", "50", "60", "70", "100"]) {
      expect(RENAMED_BASELINE_MATERIALS[`${amps}/2 breaker`]).toBe(
        `${amps}A 2-Pole breaker`
      );
    }
  });

  it("ships the 3-pole run the pricing sheet lists", () => {
    // Added 2026-09-24. The pricing sheet carried these as NEW rows and the
    // seed had none, so a 3-phase job could not find a single one.
    for (const amps of [
      "15",
      "20",
      "25",
      "30",
      "35",
      "40",
      "45",
      "50",
      "60",
      "70",
      "80",
      "90",
      "100",
      "125",
      "150",
      "200",
    ]) {
      const m = named(`${amps}A 3-Pole breaker`);
      expect(m, `${amps}A 3-Pole breaker`).toBeDefined();
      expect(m!.category).toBe("Breakers");
      expect(m!.unitOfSale).toBe("each");
    }
  });

  it("finds 3-pole breakers by the spoken forms", () => {
    const index = BASELINE_MATERIALS.map((m, i) => ({
      id: String(i),
      description: m.name,
      unit: m.unitOfSale,
      searchAliases: m.searchAliases,
    }));
    const find = (query: string) =>
      smartSearch(index, query, 8).map(
        hit => BASELINE_MATERIALS[Number(hit.id)].name
      );
    // "90/3" is left out HERE on purpose: raw smartSearch ties it with every
    // "90-degree elbow" and cuts at eight. The ranked search every screen
    // uses puts the breaker first — materialSearchCommonness.test.ts.
    expect(find("45/3")).toContain("45A 3-Pole breaker");
    for (const term of ["three pole 90", "3p 90", "90 amp 3 pole"]) {
      expect(find(term), `"${term}" should find it`).toContain(
        "90A 3-Pole breaker"
      );
    }
  });

  it("states the pole count on every amp-rated breaker", () => {
    // Reversed 2026-09-24. This test used to be "leaves single-pole unmarked"
    // and pinned the bare "20A breaker" form. Now every breaker named by its
    // amperage says Single-Pole, 2-Pole or 3-Pole, and a one-pole breaker is
    // never written "1-Pole". Loops over the shelf rather than naming rows, so
    // a breaker added later without a pole count fails here.
    const amped = breakers().filter(m => /^\d+A /.test(m.name));
    expect(amped.length).toBeGreaterThan(0);
    for (const m of amped) {
      expect(m.name, `${m.name} has no pole count`).toMatch(
        / (Single|2|3)-Pole /
      );
      expect(m.name).not.toMatch(/1-Pole/);
    }
  });

  it("renames the single-pole rows in place", () => {
    const old = [
      "15A breaker",
      "20A breaker",
      "30A breaker",
      "15A AFCI breaker",
      "20A AFCI breaker",
      "15A GFCI breaker",
      "20A GFCI breaker",
      "15A AFCI/GFCI combo breaker",
      "20A AFCI/GFCI combo breaker",
    ];
    for (const from of old) {
      const to = RENAMED_BASELINE_MATERIALS[from];
      expect(to, `${from} is not in the rename map`).toBe(
        from.replace(/^(\d+A) /, "$1 Single-Pole ")
      );
      expect(named(to), `${to} is not shipped`).toBeDefined();
      expect(named(from), `${from} is still shipped`).toBeUndefined();
    }
  });

  it("still finds single-pole breakers by the old and spoken names", () => {
    // Through SEARCH, for the same reason as the two-pole case above: the
    // alias string is stripped of anything the name now says.
    const index = BASELINE_MATERIALS.map((m, i) => ({
      id: String(i),
      description: m.name,
      unit: m.unitOfSale,
      searchAliases: m.searchAliases,
    }));
    const find = (query: string) =>
      smartSearch(index, query, 8).map(
        hit => BASELINE_MATERIALS[Number(hit.id)].name
      );
    const cases: Array<[string, string]> = [
      ["20A breaker", "20A Single-Pole breaker"],
      ["20 amp breaker", "20A Single-Pole breaker"],
      ["single pole 20", "20A Single-Pole breaker"],
      ["1-pole 20", "20A Single-Pole breaker"],
      ["1 pole 20a", "20A Single-Pole breaker"],
      ["sp 20", "20A Single-Pole breaker"],
      ["20A AFCI breaker", "20A Single-Pole AFCI breaker"],
      ["15a gfci breaker", "15A Single-Pole GFCI breaker"],
      ["dual function 20", "20A Single-Pole AFCI/GFCI combo breaker"],
    ];
    for (const [query, expected] of cases) {
      expect(find(query), `"${query}" should find ${expected}`).toContain(
        expected
      );
    }
  });

  it("ships all three protected types, single-pole", () => {
    for (const type of ["AFCI", "GFCI", "AFCI/GFCI combo"]) {
      for (const amps of ["15", "20"]) {
        expect(
          named(`${amps}A Single-Pole ${type} breaker`),
          `${amps}A ${type} missing`
        ).toBeDefined();
      }
    }
  });

  it("ships all three protected types, two-pole", () => {
    // The gap that prompted this: only the single-pole combo existed, so a spa
    // (2-pole GFCI) had no row at all.
    const required = [
      "20A 2-Pole GFCI breaker",
      "30A 2-Pole GFCI breaker",
      "50A 2-Pole GFCI breaker",
      "60A 2-Pole GFCI breaker",
      "20A 2-Pole AFCI breaker",
      "30A 2-Pole AFCI breaker",
      "20A 2-Pole AFCI/GFCI combo breaker",
      "30A 2-Pole AFCI/GFCI combo breaker",
    ];
    for (const name of required) {
      expect(named(name), `${name} missing`).toBeDefined();
    }
  });

  it("gives every protected breaker its own trade slang", () => {
    for (const row of breakers().filter(m => /AFCI|GFCI/.test(m.name))) {
      const aliases = (row.searchAliases ?? "").toLowerCase();
      if (row.name.includes("AFCI")) expect(aliases).toContain("arc");
      if (row.name.includes("GFCI")) expect(aliases).toContain("gfi");
    }
  });
});

describe("the Panels / Breakers split", () => {
  const inCategory = (category: string) =>
    BASELINE_MATERIALS.filter(m => m.category === category).map(m => m.name);

  it("has no material left on the merged shelf", () => {
    expect(
      BASELINE_MATERIALS.filter(
        m => (m.category as string) === "Panels & Breakers"
      )
    ).toHaveLength(0);
  });

  it("puts every breaker on Breakers", () => {
    const strays = BASELINE_MATERIALS.filter(
      m => /breaker/i.test(m.name) && m.category !== "Breakers"
    );
    expect(strays.map(s => s.name)).toEqual([]);
  });

  it("puts panels, meter bases and disconnects on Panels", () => {
    const panels = inCategory("Panels");
    for (const name of [
      "200A main panel",
      "200A main-lug sub-panel",
      "200A meter base",
      "60A fused disconnect",
    ]) {
      expect(panels, `${name} should be on Panels`).toContain(name);
    }
  });

  it("keeps fuses with the disconnects they go in, not with breakers", () => {
    // A fuse goes in a fused disconnect, not a load center. Splitting the pair
    // across two shelves would separate two rows that are always bought together.
    expect(inCategory("Panels")).toContain("60A cartridge fuse");
    expect(inCategory("Breakers")).not.toContain("60A cartridge fuse");
  });
});

/**
 * Starter assemblies find their materials by EXACT name (seedBaselineAssemblies
 * in server/db.ts), and they do not read RENAMED_BASELINE_MATERIALS. So an
 * assembly line still naming a renamed spelling can never resolve, and the
 * seeder skips the whole assembly with nothing but a console warning.
 *
 * That is not hypothetical. "200A main panel furnish and install" named
 * "20/2 breaker" from the day that row became "20A 2-Pole breaker" until
 * 2026-09-24, and was missing from every database seeded in between. Nothing
 * failed, which is why this test exists.
 *
 * It asks the narrow question deliberately. Some starters wait on materials
 * that are not shipped yet and are skipped ON PURPOSE (assemblies.test.ts,
 * "only seeds assemblies whose materials all exist"), so "every line resolves"
 * would be the wrong rule. A line naming a spelling that was renamed away is
 * never on purpose.
 */
describe("starter assemblies", () => {
  it("never name a material by a spelling that was renamed away", () => {
    const stale = BASELINE_ASSEMBLIES.flatMap(spec =>
      spec.materials
        .filter(line => line.material in RENAMED_BASELINE_MATERIALS)
        .map(
          line =>
            `${spec.name}: "${line.material}" is now "${RENAMED_BASELINE_MATERIALS[line.material]}"`
        )
    );
    expect(stale).toEqual([]);
  });

  it("name only shipped breakers", () => {
    // Breakers are the rows this rename touched, and every one is shipped.
    const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));
    const unresolved = BASELINE_ASSEMBLIES.flatMap(spec =>
      spec.materials
        .filter(line => /breaker/i.test(line.material))
        .filter(line => !shipped.has(line.material))
        .map(line => `${spec.name}: "${line.material}"`)
    );
    expect(unresolved).toEqual([]);
  });
});
