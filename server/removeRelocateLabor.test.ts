/**
 * REMOVE and RELOCATE labor on the bid (owner, 2026-10-05;
 * references/remove-relocate-labor-plan.md, shared/roleLines.ts).
 *
 *   - a count with 3 new, 2 remove and 1 relocate marks sends THREE lines:
 *     install 3 (material + labor), remove 2 and relocate 1 (labor only);
 *   - hours: the count's per-bid override wins, else the assembly's, else
 *     NOT SET — "Not priced", never $0;
 *   - the lines follow the marks live; a later change to the hours never
 *     moves a line already sent;
 *   - a second send has nothing to add and is refused;
 *   - a role line refuses a typed material price ("only NEW marks price
 *     material").
 *
 * Fixture user 9431 is this file's own.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { assemblies, bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  laborRoleHours,
  laborRoleNote,
  laborRolesToAdd,
  roleHoursStripText,
  roleLinesWithoutHours,
  setHoursLabel,
} from "../shared/roleLines";
import { missingEntryCounts } from "../shared/handPricedLines";
import { lineNotPriced } from "../shared/lineNotPriced";

describe("the rules (shared/roleLines.ts)", () => {
  it("hours: the count's override, else the assembly's, else not set", () => {
    expect(
      laborRoleHours({ groupOverride: "0.4", assemblyHours: "0.25" })
    ).toBe("0.4000");
    expect(laborRoleHours({ groupOverride: null, assemblyHours: "0.25" })).toBe(
      "0.2500"
    );
    expect(laborRoleHours({ groupOverride: null, assemblyHours: null })).toBe(
      null
    );
    // 0 is a real answer at either level.
    expect(laborRoleHours({ groupOverride: "0", assemblyHours: "0.25" })).toBe(
      "0.0000"
    );
  });

  it("adds a line only for a kind with marks and no line yet", () => {
    expect(laborRolesToAdd({ remove: 2, relocate: 0 }, new Set())).toEqual([
      "remove",
    ]);
    expect(
      laborRolesToAdd({ remove: 2, relocate: 1 }, new Set(["remove"]))
    ).toEqual(["relocate"]);
    expect(laborRolesToAdd({ remove: 0, relocate: 0 }, new Set())).toEqual([]);
  });

  it("a role line with no hours is NOT PRICED, whatever its $0 material says", () => {
    const roleLine = {
      qty: 2,
      assemblyId: null,
      takeoffRunTypeId: null,
      runMaterialRole: null,
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: null,
      snapshotLaborOnly: true,
      lineRole: "remove",
    };
    expect(lineNotPriced(roleLine, 0)).toBe(true);
    expect(lineNotPriced({ ...roleLine, snapshotLaborHours: "0.25" }, 30)).toBe(
      false
    );
    // The same line read as an install line would have passed as priced —
    // which is exactly the silent $0 this rule exists to stop.
    expect(lineNotPriced({ ...roleLine, lineRole: "install" }, 0)).toBe(false);
  });

  it("the count card says what is missing and offers the fix", () => {
    expect(laborRoleNote({ role: "remove", marks: 2, onBid: false })).toEqual({
      text: "2 remove — labor not on the bid yet",
      fix: "add",
    });
    expect(laborRoleNote({ role: "relocate", marks: 0, onBid: false })).toBe(
      null
    );
  });

  /*
    The bid's warning strip (2026-10-10). A role line's material is a frozen
    0 and its gap is the HOURS, so it must not be counted under the
    hand-priced "type it on the line" advice — it gets its own entry, by
    kind, whose fix-it is "Set remove hours".
  */
  const roleLine = (
    id: number,
    lineRole: string,
    snapshotLaborHours: string | null
  ) => ({
    id,
    lineRole,
    assemblyId: null,
    takeoffRunTypeId: null,
    snapshotMaterialCost: "0",
    snapshotLaborHours,
  });

  it("the strip counts role lines with no hours by kind, never as hand-priced blanks", () => {
    const lines = [
      roleLine(1, "remove", null),
      roleLine(2, "relocate", null),
      roleLine(3, "remove", null),
      roleLine(4, "remove", "0.25"),
      roleLine(5, "install", null),
    ];
    expect(roleLinesWithoutHours(lines)).toEqual({
      remove: [1, 3],
      relocate: [2],
    });
    // Only the install line (a free count) is a hand-priced blank.
    expect(missingEntryCounts(lines)).toEqual({ noPrice: 0, noHours: 1 });
  });

  it("the strip says hours, with the fix named for the kind — not a price", () => {
    expect(roleHoursStripText("remove", 1)).toBe(
      "1 remove line has no hours — its labor is not in the total above."
    );
    expect(roleHoursStripText("relocate", 2)).toBe(
      "2 relocate lines have no hours — their labor is not in the total above."
    );
    expect(setHoursLabel("remove")).toBe("Set remove hours");
    expect(setHoursLabel("relocate")).toBe("Set relocate hours");
  });
});

const USER = 9431;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-remove-relocate-${USER}`, role: "user" },
  } as unknown as TrpcContext);

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
      openId: `test-remove-relocate-${USER}`,
      name: "Remove relocate fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
});

async function bidWithSheet() {
  const bid = (await caller().bids.create({
    name: `Remove relocate ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E.pdf",
    storageKey: `test/${bid.id}/e.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({ bidPdfId: pdf.insertId, pageCount: 1 });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });
  return { bidId: bid.id, sheetId: sheet.id };
}

const at = (n: number, y: number) =>
  Array.from({ length: n }, (_, i) => ({ x: 3000 + i * 400, y }));

/** A company assembly with 0.25 h remove, relocate NOT SET, and its count. */
async function countWithMarks(bidId: number, sheetId: number) {
  const made = (await caller().assemblies.create({
    name: `Duplex ${Date.now()}${Math.random()}`,
    category: "Devices",
    baseLaborHours: 0.5,
  }))!;
  await caller().assemblies.update({ id: made.id, removeLaborHours: 0.25 });
  const group = await caller().takeoffGroups.forAssembly({
    bidId,
    assemblyId: made.id,
  });
  if (!("id" in group)) throw new Error("expected one count");
  const groupId = group.id as number;
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId,
    at: at(3, 3000),
  });
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId,
    at: at(2, 6000),
    status: "remove",
  });
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId,
    at: at(1, 9000),
    status: "relocate",
  });
  return { assemblyId: made.id, groupId };
}

const role = <T extends { lineRole: string }>(lines: readonly T[], r: string) =>
  lines.find(line => line.lineRole === r)!;

describe.skipIf(!hasDb)("remove and relocate labor through the routers", () => {
  it("sends one line per kind: install 3, remove 2, relocate 1 — labor only, not-set hours not priced", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const { groupId } = await countWithMarks(bidId, sheetId);

    const sent = await caller().takeoffGroups.sendToBid({ id: groupId });
    expect(sent.addedLaborRoles).toEqual(["remove", "relocate"]);

    const bid = await caller().bids.get({ id: bidId });
    expect(bid.lines).toHaveLength(3);
    const install = role(bid.lines, "install");
    const remove = role(bid.lines, "remove");
    const relocate = role(bid.lines, "relocate");

    expect(Number(install.qty)).toBe(3);
    expect(Number(remove.qty)).toBe(2);
    expect(Number(relocate.qty)).toBe(1);

    // Labor only: no assembly link, a typed-0 material, ticked labor-only.
    for (const line of [remove, relocate]) {
      expect(line.assemblyId).toBeNull();
      expect(line.snapshotMaterialCost).toBe("0.0000");
      expect(line.snapshotLaborOnly).toBe(true);
    }
    expect(remove.name).toMatch(/^Remove /);
    expect(remove.snapshotLaborHours).toBe("0.2500");
    // Relocate hours NOT SET: "not priced", never $0 of labor priced.
    expect(relocate.snapshotLaborHours).toBeNull();
    expect(lineNotPriced({ ...relocate, qty: relocate.qty }, 0)).toBe(true);
  });

  it("the count's own hours win over the assembly's", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const { groupId } = await countWithMarks(bidId, sheetId);
    await caller().takeoffGroups.setLaborRoleHours({
      id: groupId,
      role: "remove",
      hours: 0.4,
    });
    await caller().takeoffGroups.sendToBid({ id: groupId });
    const bid = await caller().bids.get({ id: bidId });
    expect(role(bid.lines, "remove").snapshotLaborHours).toBe("0.4000");
  });

  it("follows the marks live, and later hours never move a sent line", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const { assemblyId, groupId } = await countWithMarks(bidId, sheetId);
    await caller().takeoffGroups.sendToBid({ id: groupId });

    // One more removal on the drawing: the remove line follows it.
    const marks = await caller().takeoffStamps.listForSheet({ sheetId });
    const aNew = marks.find(m => m.status === null)!;
    await caller().takeoffStamps.setStatus({
      bidId,
      ids: [aNew.id],
      status: "remove",
    });
    // The assembly's remove hours change after the send...
    await caller().assemblies.update({ id: assemblyId, removeLaborHours: 1 });

    const bid = await caller().bids.get({ id: bidId });
    expect(Number(role(bid.lines, "install").qty)).toBe(2);
    expect(Number(role(bid.lines, "remove").qty)).toBe(3);
    // ...and the sent line keeps what it froze.
    expect(role(bid.lines, "remove").snapshotLaborHours).toBe("0.2500");
  });

  it("a second send has nothing to add and is refused; a role line takes no price", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const { groupId } = await countWithMarks(bidId, sheetId);
    await caller().takeoffGroups.sendToBid({ id: groupId });
    await expect(
      caller().takeoffGroups.sendToBid({ id: groupId })
    ).rejects.toThrow();

    const bid = await caller().bids.get({ id: bidId });
    const relocate = role(bid.lines, "relocate");
    await expect(
      caller().bids.updateLine({ bidId, id: relocate.id, materialCost: 10 })
    ).rejects.toThrow(/labor only/);
    // Its fix-it: hours typed on the line.
    await caller().bids.updateLine({ bidId, id: relocate.id, laborHours: 0.5 });
    const after = await caller().bids.get({ id: bidId });
    expect(role(after.lines, "relocate").snapshotLaborHours).toBe("0.5000");
  });

  it("a count with ONLY removals can still send them, and its new marks later", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const made = (await caller().assemblies.create({
      name: `Demo only ${Date.now()}${Math.random()}`,
      category: "Devices",
      baseLaborHours: 0.5,
    }))!;
    const group = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId: made.id,
    });
    const groupId = (group as { id: number }).id;
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId,
      at: at(4, 3000),
      status: "remove",
    });
    await caller().takeoffGroups.sendToBid({ id: groupId });
    let bid = await caller().bids.get({ id: bidId });
    expect(bid.lines.map(l => l.lineRole)).toEqual(["remove"]);

    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId,
      at: at(2, 6000),
    });
    await caller().takeoffGroups.sendToBid({ id: groupId });
    bid = await caller().bids.get({ id: bidId });
    expect(Number(role(bid.lines, "install").qty)).toBe(2);
    expect(Number(role(bid.lines, "remove").qty)).toBe(4);
  });
});
