/**
 * TWO PEOPLE, ONE ASSEMBLY (break-it, 2026-10-15 night; shared/staleEdit.ts).
 *
 * The editor saves its whole form. Seen on screen: A changed a quantity to 4
 * and saved; B, who had opened the assembly before that, renamed it and
 * saved — and the quantity went back to 1, with B told "Assembly saved."
 *
 * Through the real router against the test database. Red before the guard:
 * B's save went through and A's 4 was gone.
 *
 * The column keeps whole seconds, so each save here waits past a second
 * boundary — two saves inside one second are the documented gap.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  kits,
  laborRates,
  materials,
  modifiers,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { STALE_EDIT_MESSAGE, savedSinceOpened } from "../shared/staleEdit";

const USER = 9878;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-stale-edit-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function newPart(input: { name: string; costPerUnit: number }) {
  return (await caller().materials.create(input))!;
}

async function newAssembly(
  input: Parameters<ReturnType<typeof caller>["assemblies"]["create"]>[0]
) {
  return (await caller().assemblies.create(input))!;
}

const nextSecond = () => new Promise(resolve => setTimeout(resolve, 1100));

describe("savedSinceOpened", () => {
  it("compares in whole seconds, the column's precision", () => {
    const at = new Date("2026-10-15T22:00:00.000Z");
    expect(savedSinceOpened(at, new Date("2026-10-15T22:00:00.900Z"))).toBe(
      false
    );
    expect(savedSinceOpened(at, new Date("2026-10-15T21:59:59.000Z"))).toBe(
      true
    );
  });

  it("never refuses a caller that did not say when it opened", () => {
    expect(savedSinceOpened(new Date(), undefined)).toBe(false);
    expect(savedSinceOpened(new Date(), null)).toBe(false);
  });
});

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id: USER,
      openId: `test-stale-edit-${USER}`,
      name: "Stale edit fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(kits).where(eq(kits.userId, USER));
  await database.delete(laborRates).where(eq(laborRates.userId, USER));
  await database.delete(modifiers).where(eq(modifiers.userId, USER));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
});

withDb("an assembly saved by two editors", () => {
  it("refuses the save from a screen opened before the other save, and keeps the other's change", async () => {
    const part = await newPart({
      name: `Stale edit part ${Date.now()}`,
      costPerUnit: 2,
    });
    const created = await newAssembly({
      name: `Stale edit ${Date.now()}`,
      category: "General",
      baseLaborHours: 1,
      materials: [{ materialId: part.id, qty: 1 }],
    });
    // Both open it.
    const opened = (await caller().assemblies.get({ id: created.id }))!;
    const openedAt = opened.updatedAt;
    await nextSecond();

    // A changes the quantity and saves.
    await caller().assemblies.update({
      id: created.id,
      openedAt,
      materials: [{ materialId: part.id, qty: 4, isBranchWhip: false }],
    });
    await nextSecond();

    // B, still on the screen opened before that, renames and saves.
    await expect(
      caller().assemblies.update({
        id: created.id,
        openedAt,
        name: "Renamed by B",
        materials: [{ materialId: part.id, qty: 1, isBranchWhip: false }],
      })
    ).rejects.toThrow(STALE_EDIT_MESSAGE);

    const now = (await caller().assemblies.get({ id: created.id }))!;
    expect(now.name, "B's rename did not land").toBe(opened.name);
    expect(
      now.materials.map(m => Number(m.qty)),
      "A's quantity is kept"
    ).toEqual([4]);
  });

  it("lets the same editor save twice: its own save moves what it opened with", async () => {
    const created = await newAssembly({
      name: `Stale edit twice ${Date.now()}`,
      category: "General",
      baseLaborHours: 1,
      materials: [],
    });
    const opened = (await caller().assemblies.get({ id: created.id }))!;
    await nextSecond();
    const first = await caller().assemblies.update({
      id: created.id,
      openedAt: opened.updatedAt,
      name: "First save",
    });
    await nextSecond();
    await caller().assemblies.update({
      id: created.id,
      openedAt: first.assembly!.updatedAt,
      name: "Second save",
    });
    expect((await caller().assemblies.get({ id: created.id }))!.name).toBe(
      "Second save"
    );
  });

  it("a recipe-only save still counts as a save", async () => {
    const part = await newPart({
      name: `Stale edit recipe ${Date.now()}`,
      costPerUnit: 1,
    });
    const created = await newAssembly({
      name: `Stale edit recipe ${Date.now()}`,
      category: "General",
      baseLaborHours: 1,
      materials: [],
    });
    const opened = (await caller().assemblies.get({ id: created.id }))!;
    await nextSecond();
    // Only the child rows change — the assembly row itself does not.
    await caller().assemblies.update({
      id: created.id,
      materials: [{ materialId: part.id, qty: 2, isBranchWhip: false }],
    });
    await nextSecond();
    await expect(
      caller().assemblies.update({
        id: created.id,
        openedAt: opened.updatedAt,
        name: "Stale",
      })
    ).rejects.toThrow(STALE_EDIT_MESSAGE);
  });
});

withDb("a kit saved by two editors", () => {
  it("refuses the save from a screen opened before the other save", async () => {
    const assembly = await newAssembly({
      name: `Stale kit asm ${Date.now()}`,
      category: "General",
      baseLaborHours: 1,
      materials: [],
    });
    const kit = (await caller().kits.create({
      name: `Stale kit ${Date.now()}`,
      items: [{ assemblyId: assembly.id, qty: 1 }],
    }))!;
    const opened = (await caller().kits.get({ id: kit.id }))!;
    await nextSecond();
    // A: 1 -> 4, saved.
    await caller().kits.update({
      id: kit.id,
      openedAt: opened.updatedAt,
      items: [{ assemblyId: assembly.id, qty: 4 }],
    });
    await nextSecond();
    // B, from the screen opened before: renames, with the old quantity.
    await expect(
      caller().kits.update({
        id: kit.id,
        openedAt: opened.updatedAt,
        name: "Renamed by B",
        items: [{ assemblyId: assembly.id, qty: 1 }],
      })
    ).rejects.toThrow(STALE_EDIT_MESSAGE);
    const now = (await caller().kits.get({ id: kit.id }))!;
    expect(
      now.items.map(i => Number(i.qty)),
      "A's quantity is kept"
    ).toEqual([4]);
  });
});

withDb("a material saved by two editors", () => {
  it("refuses the save from a screen opened before the other save, and keeps the other's price", async () => {
    const part = await newPart({
      name: `Stale material ${Date.now()}`,
      costPerUnit: 2,
    });
    const [opened] = (await caller().materials.list()).filter(
      m => m.id === part.id
    );
    await nextSecond();
    // A: price 2 -> 5, saved.
    await caller().materials.update({
      id: part.id,
      openedAt: opened.updatedAt,
      costPerUnit: 5,
    });
    await nextSecond();
    // B, from the editor opened before: renames, sending the old price.
    await expect(
      caller().materials.update({
        id: part.id,
        openedAt: opened.updatedAt,
        name: `${part.name} renamed`,
        costPerUnit: 2,
      })
    ).rejects.toThrow(STALE_EDIT_MESSAGE);
    const [now] = (await caller().materials.list()).filter(
      m => m.id === part.id
    );
    expect(Number(now.costPerUnit), "A's price is kept").toBe(5);
  });
});

withDb("a labor rate and a modifier saved by two editors", () => {
  it("refuses the older screen's save of a labor rate, keeping the other's rate", async () => {
    const rate = (await caller().laborRates.create({
      name: `Stale rate ${Date.now()}`,
      rateType: "hourly",
      hourlyCost: 40,
    }))!;
    const opened = (await caller().laborRates.list()).find(
      r => r.id === rate.id
    )!;
    await nextSecond();
    await caller().laborRates.update({
      id: rate.id,
      openedAt: opened.updatedAt,
      hourlyCost: 55,
    });
    await nextSecond();
    await expect(
      caller().laborRates.update({
        id: rate.id,
        openedAt: opened.updatedAt,
        name: "Renamed by B",
        hourlyCost: 40,
      })
    ).rejects.toThrow(STALE_EDIT_MESSAGE);
    const now = (await caller().laborRates.list()).find(r => r.id === rate.id)!;
    expect(Number(now.hourlyCost), "A's rate is kept").toBe(55);
  });

  it("refuses the older screen's save of a modifier, keeping the other's percent", async () => {
    const modifier = (await caller().modifiers.create({
      name: `Stale modifier ${Date.now()}`,
      laborAdjustmentPct: 0.1,
    }))!;
    const opened = (await caller().modifiers.list({ status: "active" })).find(
      m => m.id === modifier.id
    )!;
    await nextSecond();
    await caller().modifiers.update({
      id: modifier.id,
      openedAt: opened.updatedAt,
      laborAdjustmentPct: 0.25,
    });
    await nextSecond();
    await expect(
      caller().modifiers.update({
        id: modifier.id,
        openedAt: opened.updatedAt,
        name: "Renamed by B",
        laborAdjustmentPct: 0.1,
      })
    ).rejects.toThrow(STALE_EDIT_MESSAGE);
    const now = (await caller().modifiers.list({ status: "active" })).find(
      m => m.id === modifier.id
    )!;
    expect(now.laborAdjustmentPctValue, "A's percent is kept").toBeCloseTo(
      0.25
    );
  });
});
