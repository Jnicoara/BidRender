/**
 * THE `teeBody` ROLE (0096) — added to the database before anything uses it.
 *
 * Track A ships the enum value ahead of the Track C code that counts T bodies
 * at a tee (references/materials-track-c-plan.md § 4). Two things must hold in
 * the window between the two:
 *
 *   1. The list in `drizzle/schema.ts` is the list the migration wrote, in the
 *      same order. An enum stores an INDEX, so a value inserted anywhere but
 *      the end would re-label every stored line after it — silently.
 *   2. The role is accepted and inert. `sendToBid` validates `role` against
 *      `RUN_MATERIAL_ROLES`, so from 0096 on it accepts "teeBody"; it must
 *      write nothing, because nothing yet knows how many T bodies a run has.
 *
 * When the wiring ships, (2) is expected to change — replace it with the real
 * count, do not delete it.
 *
 * Fixture id 8797 is distinct from every other suite (they run in parallel).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  RUN_MATERIAL_ROLES,
  bidLineItems,
  bidPdfs,
  bids,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 8797;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-tee-body-${USER}`, role: "user" },
  } as unknown as TrpcContext);

describe("the runMaterialRole enum", () => {
  /** The value list a migration's MODIFY gives `runMaterialRole`. */
  const rolesIn = (file: string) => {
    const sql = readFileSync(
      path.resolve(import.meta.dirname, `../drizzle/${file}`),
      "utf8"
    );
    const match = sql.match(/`runMaterialRole` enum\(([^)]*)\)/);
    expect(match, file).not.toBeNull();
    return match![1].split(",").map(v => v.trim().replace(/'/g, ""));
  };

  it("in schema.ts is exactly the NEWEST migration's list (0118, locknut and bushing appended)", () => {
    expect([...RUN_MATERIAL_ROLES]).toEqual(
      rolesIn("0118_locknut_bushing_roles.sql")
    );
  });

  it("only ever APPENDS: 0096's list, teeBody last, is still its opening run", () => {
    // Reordering an enum rewrites what stored rows mean; appending cannot.
    const at0096 = rolesIn("0096_tee_body_role.sql");
    expect(at0096[at0096.length - 1]).toBe("teeBody");
    expect(RUN_MATERIAL_ROLES.slice(0, at0096.length)).toEqual(at0096);
  });
});

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database.insert(users).values({
      id: USER,
      openId: `test-tee-body-${USER}`,
      name: "Tee body fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
});

withDb("sending a run type's teeBody row before the wiring exists", () => {
  it("is accepted and writes no line", async () => {
    const emt = (await caller().materials.list()).find(
      m => m.name === '1/2" EMT'
    );
    if (!emt) throw new Error('No material named 1/2" EMT');
    const type = await caller().takeoffRunTypes.create({
      label: `EMT tee body ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      racewayMaterialId: emt.id,
    });

    const bid = (await caller().bids.create({
      name: `Tee body ${Date.now()}${Math.random()}`,
      trades: ["electrical"],
    }))!;
    const database = (await getDb())!;
    const [pdf] = await database.insert(bidPdfs).values({
      bidId: bid.id,
      userId: USER,
      filename: "E1.pdf",
      storageKey: `test/${bid.id}/e1.pdf`,
      byteSize: 1024,
      pageCount: 1,
      sortOrder: 0,
    });
    await caller().bidPdfs.ensureSheets({
      bidPdfId: pdf.insertId,
      pageCount: 1,
      outline: [],
    });
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
    await caller().bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: `1/4" = 1'-0"`,
    });
    // 40 ft at 1/4" = 1'-0" (18 page points a foot).
    await caller().takeoffRuns.save({
      bidId: bid.id,
      sheetId: sheet.id,
      name: "Homerun",
      pathType: "conduit",
      runTypeId: type.id,
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: 40 * 18, y: 0 },
      ],
    });

    const result = await caller().takeoffRunTypes.sendToBid({
      bidId: bid.id,
      runTypeId: type.id,
      role: "teeBody",
    });
    expect(result.sent).toEqual([]);
    expect(result.updated).toEqual([]);

    const lines = await database
      .select()
      .from(bidLineItems)
      .where(eq(bidLineItems.bidId, bid.id));
    expect(lines).toEqual([]);

    // The control: the same fixture, sent WITHOUT the filter, does put lines
    // on the bid — so the empty result above is the role, not the fixture.
    const all = await caller().takeoffRunTypes.sendToBid({
      bidId: bid.id,
      runTypeId: type.id,
    });
    expect(all.sent).toContain("raceway");
  });
});
