/**
 * THE LABOR-UNIT SHEET IMPORT, against real rows (materials.importLaborSheet).
 *
 * The plan itself is tested in laborImport.test.ts. This holds what only a
 * database shows:
 *   - the preview (apply: false) writes NOTHING;
 *   - Apply writes the hours onto the company's FORK, never the shared row;
 *   - only hours move — the price and the name on the fork are untouched;
 *   - a blank MY HOURS leaves the material exactly as it was;
 *   - an assembly's hours land on its fork too.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { assemblies, materials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9383;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-labor-import-${USER}`, role: "user" },
  } as unknown as TrpcContext);

const TAB = "\t";
const sheet = (rows: string[][]) =>
  [["ID", "Name", "Unit", "MY HOURS", "ANCHOR", "SUGGESTED", "Notes"], ...rows]
    .map(r => r.join(TAB))
    .join("\n");

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  const [existing] = await database!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await database!.insert(users).values({
      id: USER,
      openId: `test-labor-import-${USER}`,
      name: "Labor import fixture",
    });
});

async function shipped(name: string) {
  const database = await getDb();
  const [row] = await database!
    .select()
    .from(materials)
    .where(and(eq(materials.name, name), isNull(materials.userId)))
    .limit(1);
  return row;
}

async function mine(baselineId: number) {
  const database = await getDb();
  const [row] = await database!
    .select()
    .from(materials)
    .where(
      and(eq(materials.baselineId, baselineId), eq(materials.userId, USER))
    )
    .limit(1);
  return row ?? null;
}

describe.skipIf(!hasDb)("importing the labor-unit sheet", () => {
  it("previews without writing, then writes only hours, on a fork", async () => {
    const emt = await shipped('1/2" EMT');
    const thhn = await shipped("#12 THHN");
    expect(emt && thhn).toBeTruthy();
    const text = sheet([
      [String(emt.id), emt.name, "per 100 ft", "4.5", "yes", "", ""],
      [String(emt.id), emt.name, "per field bend", "0.15", "", "", ""],
      // Blank MY HOURS: must not be touched, let alone set to 0.
      [String(thhn.id), thhn.name, "per 100 ft", "", "", "0.8", ""],
    ]);

    const preview = await caller().materials.importLaborSheet({
      text,
      apply: false,
    });
    expect(preview.kind).toBe("materials");
    if (preview.kind !== "materials") return;
    expect(preview.plan.changes).toHaveLength(2);
    expect(preview.plan.blank).toBe(1);
    expect(preview.applied).toBe(0);
    expect(await mine(emt.id)).toBeNull(); // nothing written, nothing forked

    const applied = await caller().materials.importLaborSheet({
      text,
      apply: true,
    });
    expect(applied.applied).toBe(2);

    const fork = await mine(emt.id);
    expect(fork).not.toBeNull();
    expect(Number(fork!.laborHours)).toBe(0.045);
    expect(Number(fork!.fieldBendLaborHours)).toBe(0.15);
    // Only hours moved.
    expect(fork!.name).toBe(emt.name);
    expect(fork!.costPerUnit).toBe(emt.costPerUnit);
    // The shared row is untouched, so no other company sees these hours.
    const after = await shipped('1/2" EMT');
    expect(after.laborHours).toBe(emt.laborHours);
    // The blank row: no fork, no hours.
    expect(await mine(thhn.id)).toBeNull();
  });

  it("puts assembly hours on the company's copy of a starter", async () => {
    const database = await getDb();
    const [starter] = await database!
      .select()
      .from(assemblies)
      .where(
        and(eq(assemblies.name, "GFCI receptacle"), isNull(assemblies.userId))
      )
      .limit(1);
    expect(starter).toBeTruthy();
    const result = await caller().materials.importLaborSheet({
      text: [
        "Assembly ID\tAssembly\tMY HOURS\tNotes",
        `${starter.id}\t${starter.name}\t1.1\t`,
      ].join("\n"),
      apply: true,
    });
    expect(result.kind).toBe("assemblies");
    expect(result.applied).toBe(1);
    const [copy] = await database!
      .select()
      .from(assemblies)
      .where(
        and(eq(assemblies.baselineId, starter.id), eq(assemblies.userId, USER))
      )
      .limit(1);
    expect(Number(copy.baseLaborHours)).toBe(1.1);
    const [still] = await database!
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, starter.id));
    expect(still.baseLaborHours).toBe(starter.baseLaborHours);
  });
});
