/**
 * RENAMING A STARTER ASSEMBLY (todo.md "Build a starter RENAME path", owner
 * 2026-10-07). The seeder matches starters by NAME, so before
 * RENAMED_BASELINE_ASSEMBLIES a renamed seed entry inserted a SECOND shared
 * row and stranded the old one, which every bid line, kit and fork points at.
 *
 *   - a start never inserts the new name beside the old row;
 *   - the rename is PROPOSED on the old row's id (an offer, Q17), applied by
 *     a person through `starterDrift.mts --apply` — never by the start;
 *   - where both names already exist, nothing is proposed: two rows are
 *     never merged by a start (the same rule as materials).
 *
 * A probe map and probe names, so the shipped starters are not touched.
 */
import { afterAll, describe, expect, it } from "vitest";
import { and, inArray, isNull } from "drizzle-orm";
import { getDb, seedBaselineAssemblies } from "./db";
import { seedProposal } from "./seedProposal";
import { assemblies } from "../drizzle/schema";
import {
  BASELINE_ASSEMBLIES,
  RENAMED_BASELINE_ASSEMBLIES,
} from "./seed/baselineAssemblies";
import type { BaselineAssembly } from "./seed/assemblyRecipe";

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const OLD = 'Rename probe can new construction, 4"';
const NEW = 'Rename probe 4" can light, new construction';
const BOTH_OLD = "Rename probe both, old";
const BOTH_NEW = "Rename probe both, new";
const NAMES = [OLD, NEW, BOTH_OLD, BOTH_NEW];

const probe = (name: string): BaselineAssembly => ({
  ref: "TEST",
  name,
  category: "Lighting",
  projectType: "both",
  baseLaborHours: 1,
  materials: [],
});

describe("the shipped rename map", () => {
  it("points every old name at a starter the seed ships, in one hop", () => {
    const shipped = new Set(BASELINE_ASSEMBLIES.map(a => a.name));
    for (const [from, to] of Object.entries(RENAMED_BASELINE_ASSEMBLIES)) {
      expect(shipped.has(to), `${from} -> ${to}`).toBe(true);
      expect(shipped.has(from), `${from} still shipped`).toBe(false);
      expect(RENAMED_BASELINE_ASSEMBLIES[to], `${to} chains`).toBeUndefined();
    }
  });
});

withDb("a renamed starter assembly", () => {
  const sharedRows = async () =>
    (await getDb())!
      .select({ id: assemblies.id, name: assemblies.name })
      .from(assemblies)
      .where(and(isNull(assemblies.userId), inArray(assemblies.name, NAMES)));

  afterAll(async () => {
    await (await getDb())!
      .delete(assemblies)
      .where(and(isNull(assemblies.userId), inArray(assemblies.name, NAMES)));
  });

  it("a start keeps the old row and inserts nothing; the rename is proposed on its id", async () => {
    const db = (await getDb())!;
    const [made] = await db.insert(assemblies).values({
      userId: null,
      name: OLD,
      category: "Lighting",
      baseLaborHours: "1.0000",
    });
    const renames = { [OLD]: NEW };
    await seedBaselineAssemblies([probe(NEW)], renames);
    await seedBaselineAssemblies([probe(NEW)], renames);
    expect((await sharedRows()).map(r => r.name)).toEqual([OLD]);

    const proposal = await seedProposal({
      materials: [],
      assemblies: [probe(NEW)],
      assemblyRenames: renames,
    });
    const rename = proposal.changes.find(
      c => c.rowId === made.insertId && "field" in c && c.field === "name"
    );
    expect(rename).toMatchObject({ newValue: NEW });
  });

  it("where both names exist, nothing is proposed — a start never merges two rows", async () => {
    const db = (await getDb())!;
    await db.insert(assemblies).values([
      {
        userId: null,
        name: BOTH_OLD,
        category: "Lighting",
        baseLaborHours: "1.0000",
      },
      {
        userId: null,
        name: BOTH_NEW,
        category: "Lighting",
        baseLaborHours: "1.0000",
      },
    ]);
    const proposal = await seedProposal({
      materials: [],
      assemblies: [probe(BOTH_NEW)],
      assemblyRenames: { [BOTH_OLD]: BOTH_NEW },
    });
    const ids = (await sharedRows())
      .filter(r => r.name === BOTH_OLD || r.name === BOTH_NEW)
      .map(r => r.id);
    expect(
      proposal.changes.some(
        c => ids.includes(c.rowId) && "field" in c && c.field === "name"
      )
    ).toBe(false);
  });
});
