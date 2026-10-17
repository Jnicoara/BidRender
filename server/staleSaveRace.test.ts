/**
 * SAVES RACING FROM THE SAME OPENED VERSION — one wins, the rest are refused,
 * on every library editor that sends `openedAt` (server/staleSave.ts).
 *
 * Found by the stress harness (server/stressManyUsers.test.ts, 2026-10-16):
 * 24 saves of one assembly from screens opened on the same version all
 * succeeded, so the last one silently undid the other 23 — the stale-save
 * guard read `updatedAt` and wrote later, and every racer read the old
 * version. Here six saves race per editor, every run, in the everyday Gate.
 *
 * Fixture user 9928.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  assemblies,
  clients,
  kits,
  laborRates,
  materials,
  modifiers,
} from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  duplexAssembly,
  freshUser,
  own,
  rate,
  type Caller,
} from "./bidBuilders.testHelper";

const USER = 9928;
const RACERS = 6;
const hasDb = Boolean(process.env.DATABASE_URL);
if (hasDb) dropFixtureUsersAfterAll([USER]);

type Table =
  | typeof assemblies
  | typeof kits
  | typeof clients
  | typeof laborRates
  | typeof materials
  | typeof modifiers;

async function savedVersion(table: Table, id: number): Promise<Date> {
  const database = (await getDb())!;
  const [row] = await database
    .select({ updatedAt: table.updatedAt })
    .from(table)
    .where(eq(table.id, id));
  return row.updatedAt;
}

async function race(
  save: (i: number) => Promise<unknown>
): Promise<{ saved: number; refused: number; other: string[] }> {
  const results = await Promise.allSettled(
    Array.from({ length: RACERS }, (_, i) => save(i))
  );
  const other: string[] = [];
  let saved = 0;
  let refused = 0;
  for (const r of results) {
    if (r.status === "fulfilled") saved++;
    else if ((r.reason as { code?: string }).code === "CONFLICT") refused++;
    else other.push(String((r.reason as Error).message));
  }
  return { saved, refused, other };
}

describe.skipIf(!hasDb)("saves racing from one opened version", () => {
  let c: Caller;
  const ids = {
    assembly: 0,
    kit: 0,
    client: 0,
    rate: 0,
    material: 0,
    modifier: 0,
  };
  const opened: Record<keyof typeof ids, Date> = {} as never;

  beforeAll(async () => {
    await freshUser(USER);
    c = as(USER);
    ids.rate = await rate(c, "Race journeyman", 60);
    ids.assembly = (await duplexAssembly(c, ids.rate)).id;
    ids.kit = (await c.kits.create({
      name: "Race kit",
      items: [{ assemblyId: ids.assembly, qty: 1 }],
    }))!.id;
    ids.client = (await c.clients.create({ name: "Race client" }))!.id;
    ids.material = await own(c, "Race part", 2);
    ids.modifier = (await c.modifiers.create({
      name: "Race condition",
      laborAdjustmentPct: 0.1,
    }))!.id;
    opened.assembly = await savedVersion(assemblies, ids.assembly);
    opened.kit = await savedVersion(kits, ids.kit);
    opened.client = await savedVersion(clients, ids.client);
    opened.rate = await savedVersion(laborRates, ids.rate);
    opened.material = await savedVersion(materials, ids.material);
    opened.modifier = await savedVersion(modifiers, ids.modifier);
    // Past the second every row was saved in, so the winner writes a newer one.
    await new Promise(r => setTimeout(r, 1100));
  }, 60_000);

  it("assembly", async () => {
    const r = await race(i =>
      c.assemblies.update({
        id: ids.assembly,
        name: `Race duplex ${i}`,
        openedAt: opened.assembly,
      })
    );
    expect(r).toEqual({ saved: 1, refused: RACERS - 1, other: [] });
  });

  it("kit", async () => {
    const r = await race(i =>
      c.kits.update({
        id: ids.kit,
        name: `Race kit ${i}`,
        openedAt: opened.kit,
      })
    );
    expect(r).toEqual({ saved: 1, refused: RACERS - 1, other: [] });
  });

  it("client", async () => {
    const r = await race(i =>
      c.clients.update({
        id: ids.client,
        name: `Race client ${i}`,
        openedAt: opened.client,
      })
    );
    expect(r).toEqual({ saved: 1, refused: RACERS - 1, other: [] });
  });

  it("labor rate", async () => {
    const r = await race(i =>
      c.laborRates.update({
        id: ids.rate,
        name: `Race journeyman ${i}`,
        openedAt: opened.rate,
      })
    );
    expect(r).toEqual({ saved: 1, refused: RACERS - 1, other: [] });
  });

  it("material", async () => {
    const r = await race(i =>
      c.materials.update({
        id: ids.material,
        name: `Race part ${i}`,
        openedAt: opened.material,
      })
    );
    expect(r).toEqual({ saved: 1, refused: RACERS - 1, other: [] });
  });

  it("modifier", async () => {
    const r = await race(i =>
      c.modifiers.update({
        id: ids.modifier,
        name: `Race condition ${i}`,
        openedAt: opened.modifier,
      })
    );
    expect(r).toEqual({ saved: 1, refused: RACERS - 1, other: [] });
  });

  // A second apart: the version is whole seconds, and the save's own write
  // sets it to "now", so two saves inside one second share a version — the
  // limit staleEdit.ts already states, and todo.md records (2026-10-16).
  it("one save at a time still works: each from the version the last one left", async () => {
    const tick = () => new Promise(r => setTimeout(r, 1100));
    const first = await savedVersion(clients, ids.client);
    await tick();
    await c.clients.update({ id: ids.client, name: "Solo 1", openedAt: first });
    const second = await savedVersion(clients, ids.client);
    await tick();
    expect(second.getTime()).toBeGreaterThan(first.getTime());
    await c.clients.update({
      id: ids.client,
      name: "Solo 2",
      openedAt: second,
    });
    // And the first screen, opened before both, is refused.
    await expect(
      c.clients.update({ id: ids.client, name: "Stale", openedAt: first })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
