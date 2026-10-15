/**
 * THE BASELINE SCREEN'S READS, against the real database
 * (baseline-screen-plan.md § 1, § 11; server/routers/starterLibraryRouter.ts).
 *
 * The rule: the starter screen opens for a finished starter session and for
 * nothing else, and it shows the SHARED starter only — never a company's row.
 * Each guard is asserted on its own, so taking any one out turns a test red:
 *
 *   - every route refuses no session, a password-only session, and a
 *     company login's session (a route on the public builder fails this);
 *   - the lists hold no company row (drop `userId IS NULL` and they do);
 *   - one assembly by id refuses a company's assembly;
 *   - an hour nobody set arrives as NULL, never 0.
 *
 * Fixture: company user 9171 with one material and one assembly of its own;
 * starter editors made per run, `starter-lib-test-*@example.com`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import {
  assemblies,
  laborRates,
  materials,
  starterChangeBatches,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { createStarterEditor } from "./starterEditor/store";
import { STARTER_COOKIE, signStarterToken } from "./starterEditor/session";
import { starterLibraryRouter } from "./routers/starterLibraryRouter";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const COMPANY_USER = 9171;
const COMPANY_OPEN_ID = `test-starter-lib-company-${COMPANY_USER}`;
const COMPANY_PART = "starter-lib-test company's own part";
const COMPANY_ASSEMBLY = "starter-lib-test company's own assembly";
const KEY_HEX = "6b".repeat(32);

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

function caller(cookies: Record<string, string> = {}) {
  const ctx = {
    user: null,
    req: {
      protocol: "https",
      ip: "10.9.71.1",
      headers: {
        cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
    },
    res: { cookie: () => {}, clearCookie: () => {} },
  } as unknown as TrpcContext;
  return appRouter.createCaller(ctx);
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "no error";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

/** Every route on the router, so a route added later is covered here. */
const ROUTES = Object.keys(starterLibraryRouter._def.procedures);

function callRoute(api: ReturnType<typeof caller>, route: string) {
  const lib = api.starterLibrary as unknown as Record<
    string,
    (input?: unknown) => Promise<unknown>
  >;
  return lib[route](route === "assembly" ? { id: 1 } : undefined);
}

let editorUserId = 0;
let companyAssemblyId = 0;

async function cleanUp() {
  const db = (await getDb())!;
  await db.delete(users).where(eq(users.id, COMPANY_USER));
  await db
    .delete(users)
    .where(like(users.email, "starter-lib-test-%@example.com"));
}

withDb("the baseline screen's reads", () => {
  dropFixtureUsersAfterAll([COMPANY_USER]);

  beforeAll(async () => {
    process.env.STARTER_TOTP_KEY = KEY_HEX;
    await cleanUp();
    const db = (await getDb())!;
    await db.insert(users).values({
      id: COMPANY_USER,
      openId: COMPANY_OPEN_ID,
      name: "Company login",
      email: `starter-lib-company-${COMPANY_USER}@example.com`,
      loginMethod: "email",
      role: "admin",
    });
    await db.insert(materials).values({
      userId: COMPANY_USER,
      name: COMPANY_PART,
      costPerUnit: "1.2500",
    });
    const [made] = await db
      .insert(assemblies)
      .values({
        userId: COMPANY_USER,
        name: COMPANY_ASSEMBLY,
        category: "Devices",
      })
      .$returningId();
    companyAssemblyId = made.id;
    const editor = await createStarterEditor(
      {
        email: `starter-lib-test-${process.pid}@example.com`,
        name: "Starter lib test",
        password: "Starter-Lib-Passw0rd!",
      },
      Buffer.from(KEY_HEX, "hex")
    );
    editorUserId = editor.userId;
  });

  afterAll(async () => {
    await cleanUp();
    delete process.env.STARTER_TOTP_KEY;
  });

  async function starterCookie(stage: "password" | "done") {
    const now = Date.now();
    const { token } = await signStarterToken(
      { userId: editorUserId, stage, authAt: now },
      now,
      ENV.cookieSecret
    );
    return { [STARTER_COOKIE]: token };
  }

  it("has routes to check at all", () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(5);
  });

  it("every route refuses no session, a password-only one and a company login", async () => {
    const companyToken = await sdk.createSessionToken(COMPANY_OPEN_ID, {
      name: "x",
    });
    const sessions: Record<string, Record<string, string>> = {
      none: {},
      passwordOnly: await starterCookie("password"),
      company: { [COOKIE_NAME]: companyToken },
    };
    const outcomes: Record<string, string> = {};
    for (const [kind, cookies] of Object.entries(sessions))
      for (const route of ROUTES)
        outcomes[`${kind} ${route}`] = await codeOf(
          callRoute(caller(cookies), route)
        );
    expect(Object.values(outcomes).length).toBe(ROUTES.length * 3);
    for (const [call, code] of Object.entries(outcomes))
      expect({ call, code }).toEqual({ call, code: "UNAUTHORIZED" });
  });

  it("lists the shared starter and no company's rows", async () => {
    const api = caller(await starterCookie("done"));
    const db = (await getDb())!;
    const list = await api.starterLibrary.materials();
    expect(list.some(m => m.name === COMPANY_PART)).toBe(false);
    const shared = await db
      .select({ id: materials.id })
      .from(materials)
      .where(and(isNull(materials.userId), eq(materials.isActive, true)));
    expect(list.length).toBe(shared.length);

    const recipes = await api.starterLibrary.assemblies();
    expect(recipes.some(a => a.name === COMPANY_ASSEMBLY)).toBe(false);
  });

  it("refuses a company's assembly by id, and opens a shared one", async () => {
    const api = caller(await starterCookie("done"));
    expect(
      await codeOf(api.starterLibrary.assembly({ id: companyAssemblyId }))
    ).toBe("NOT_FOUND");
    const [first] = await api.starterLibrary.assemblies();
    if (first) {
      const one = await api.starterLibrary.assembly({ id: first.id });
      expect(one.id).toBe(first.id);
    }
  });

  it("previewEdit's counts are what applyEdit does; the log shows it; undo puts it back (plan test 14)", async () => {
    const api = caller(await starterCookie("done"));
    const db = (await getDb())!;
    const [probe] = await db
      .insert(materials)
      .values({
        name: `starter-lib-test preview probe ${Date.now()}`,
        unitOfSale: "each",
        costPerUnit: "2.0000",
        category: "Receptacles",
        trade: "electrical",
      })
      .$returningId();
    const batchIds: number[] = [];
    try {
      const edit = {
        kind: "field" as const,
        table: "materials" as const,
        rowId: probe.id,
        field: "costPerUnit",
        newValue: "2.5",
      };
      const preview = await api.starterLibrary.previewEdit(edit);
      expect(preview.reach).toBe("offer");
      expect(preview.pins).toBeGreaterThan(0);
      expect(preview.offered).toBe(preview.pins);
      expect(preview.newValue).toBe("2.5000");
      // The preview wrote nothing: the row and the forks are as they were.
      const [still] = await db
        .select()
        .from(materials)
        .where(eq(materials.id, probe.id));
      expect(still.costPerUnit).toBe("2.0000");
      expect(
        await db
          .select({ id: materials.id })
          .from(materials)
          .where(eq(materials.baselineId, probe.id))
      ).toHaveLength(0);

      const applied = await api.starterLibrary.applyEdit(edit);
      batchIds.push(applied.batchId!);
      expect(applied.applied[0].pins).toBe(preview.pins);

      // A finding field reaches everyone and pins nobody.
      const words = await api.starterLibrary.previewEdit({
        ...edit,
        field: "searchAliases",
        newValue: "probe words",
      });
      expect(words).toMatchObject({ reach: "everyone", pins: 0 });

      // A unit is refused with the reason, not a 500.
      expect(
        await codeOf(
          api.starterLibrary.previewEdit({
            ...edit,
            field: "unitOfSale",
            newValue: "foot",
          })
        )
      ).toBe("BAD_REQUEST");

      const log = await api.starterLibrary.changeLog({
        limit: 10,
        includeSeed: false,
      });
      const entry = log.find(b => b.batchId === applied.batchId)!;
      expect(entry.editorName).toBe("Starter lib test");
      expect(entry.changes[0]).toMatchObject({
        table: "materials",
        field: "costPerUnit",
        oldValue: "2.0000",
        newValue: "2.5000",
        pins: preview.pins,
        undoneByChangeId: null,
      });

      const undoPreview = await api.starterLibrary.undoBatch({
        batchId: applied.batchId!,
        preview: true,
      });
      expect(undoPreview.undoable).toEqual([entry.changes[0].changeId]);
      const undone = await api.starterLibrary.undoBatch({
        batchId: applied.batchId!,
        preview: false,
      });
      batchIds.push(undone.result!.batchId!);
      const [back] = await db
        .select()
        .from(materials)
        .where(eq(materials.id, probe.id));
      expect(back.costPerUnit).toBe("2.0000");
      const after = await api.starterLibrary.changeLog({
        limit: 10,
        includeSeed: false,
      });
      expect(
        after.find(b => b.batchId === applied.batchId)!.changes[0]
          .undoneByChangeId
      ).not.toBeNull();
    } finally {
      if (batchIds.length)
        await db
          .delete(starterChangeBatches)
          .where(inArray(starterChangeBatches.id, batchIds));
      await db.delete(materials).where(eq(materials.baselineId, probe.id));
      await db.delete(materials).where(eq(materials.id, probe.id));
    }
  });

  it("a rate edit writes the wage AND the rate it makes, as one batch", async () => {
    const api = caller(await starterCookie("done"));
    const db = (await getDb())!;
    const [probe] = await db
      .insert(laborRates)
      .values({
        name: `starter-lib-test rate probe ${Date.now()}`,
        rateType: "hourly",
        hourlyCost: "56.4000",
        baseWage: "40.0000",
        payrollTaxPct: "0.1000",
        workersCompPct: "0.0700",
        insurancePct: "0.0400",
        benefitsPct: "0.2000",
        isExampleRate: true,
      })
      .$returningId();
    const batchIds: number[] = [];
    try {
      const preview = await api.starterLibrary.rateEdit({
        rowId: probe.id,
        field: "baseWage",
        value: 45,
        preview: true,
      });
      expect(preview.preview!.lines.map(l => [l.field, l.newValue])).toEqual([
        ["baseWage", "45.0000"],
        ["hourlyCost", "63.4500"],
      ]);
      // Typing the rate itself is refused on a broken-down rate.
      expect(
        await codeOf(
          api.starterLibrary.rateEdit({
            rowId: probe.id,
            field: "hourlyCost",
            value: 70,
            preview: true,
          })
        )
      ).toBe("BAD_REQUEST");
      const saved = await api.starterLibrary.rateEdit({
        rowId: probe.id,
        field: "baseWage",
        value: 45,
        preview: false,
      });
      batchIds.push(saved.applied!.batchId!);
      expect(saved.applied!.applied).toHaveLength(2);
      const [row] = await db
        .select()
        .from(laborRates)
        .where(eq(laborRates.id, probe.id));
      expect([row.baseWage, row.hourlyCost, row.isExampleRate]).toEqual([
        "45.0000",
        "63.4500",
        true,
      ]);
    } finally {
      if (batchIds.length)
        await db
          .delete(starterChangeBatches)
          .where(inArray(starterChangeBatches.id, batchIds));
      await db.delete(laborRates).where(eq(laborRates.baselineId, probe.id));
      await db.delete(laborRates).where(eq(laborRates.id, probe.id));
    }
  });

  it("an hour nobody set arrives as NULL, never 0", async () => {
    const api = caller(await starterCookie("done"));
    const db = (await getDb())!;
    const unset = await db
      .select({ id: materials.id })
      .from(materials)
      .where(
        and(
          isNull(materials.userId),
          eq(materials.isActive, true),
          isNull(materials.laborHours)
        )
      );
    const list = await api.starterLibrary.materials();
    const shownUnset = list.filter(m => m.laborHours === null);
    expect(shownUnset.length).toBe(unset.length);
    // The comparison above is empty-equals-empty on a catalog with every
    // hour set; say so rather than pass on nothing.
    expect(unset.length).toBeGreaterThan(0);
  });
});
