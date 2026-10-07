/**
 * A DEVICE WITH NO HEIGHT USES ITS TYPE'S DEFAULT (owner, 2026-10-07).
 *
 * A device's height TYPE came only from its count's "Each drops to", which
 * starts unanswered — so on UNCC E111 every homerun leaving a device whose
 * count nobody had answered rose from nowhere: no up-drop, no bend, a short
 * pipe. The shop's receptacle height existed; the device just never said it
 * was a receptacle.
 *
 * Now an ITEM says what it mounts at, once, in the library
 * (`assemblies.mountHeightTypeKey`, vertical-drops-plan § 7 col 2), and every
 * count of it on every job takes the shop's height for that type. The count's
 * own answer still wins. Each `it` below is red on the code before this:
 * nothing read the column.
 *
 * Bid: 1/4" = 1'-0", run height 10'-0", panel 6'-0". The device leaves 40 ft
 * from the panel; a receptacle (shipped 18") rises 8.5 ft.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  bidPdfs,
  bids,
  takeoffGroups,
  takeoffMountingHeights,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9961;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-mount-kind-${USER}`, role: "user" },
  } as unknown as TrpcContext);

const ft = (feet: number) => feet * 18;

/** A count of two devices, linked to `assemblyId`, its drop unanswered. */
async function aBid(assemblyId: number) {
  const bid = (await caller().bids.create({
    name: `Mount kind ${Date.now()}${Math.random()}`,
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
  await caller().takeoffHeights.setBidDistribution({
    bidId: bid.id,
    inches: 120,
  });
  await caller().takeoffHeights.setBidHeight({
    bidId: bid.id,
    typeKey: "panel",
    inches: 72,
  });
  const group = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Duplex",
  });
  await database
    .update(takeoffGroups)
    .set({ kind: "assembly", assemblyId })
    .where(eq(takeoffGroups.id, group.id));
  await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId: sheet.id,
    groupId: group.id,
    at: [{ x: ft(40), y: ft(10) }],
  });
  const [mark] = await caller().takeoffStamps.listForSheet({
    sheetId: sheet.id,
  });
  await caller().homeruns.syncSheet({
    bidId: bid.id,
    sheetId: sheet.id,
    circuits: [{ panel: "2B", circuits: [1], leavingStampId: mark.id }],
  });
  await caller().homeruns.placePanel({
    bidId: bid.id,
    panel: "2B",
    spot: { sheetId: sheet.id, x: 0, y: ft(10) },
  });
  return { bidId: bid.id, sheetId: sheet.id, groupId: group.id, mark: mark.id };
}

async function ownAssembly(mountHeightTypeKey: string | null) {
  const made = await caller().assemblies.create({
    name: `Test duplex ${Date.now()}${Math.random()}`,
    category: "Devices",
    baseLaborHours: null,
    mountHeightTypeKey,
  });
  return made!.id;
}

async function homerun(bidId: number) {
  const { rows } = await caller().homeruns.forBid({ bidId });
  const f = rows[0].footage;
  if (f.state !== "computed") throw new Error(`not computed: ${f.state}`);
  return { pieces: f.pieces, source: rows[0].deviceHeightSource };
}

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
      openId: `test-mount-kind-${USER}`,
      name: "Mount kind fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
  await database
    .delete(takeoffMountingHeights)
    .where(eq(takeoffMountingHeights.userId, USER));
});

describeDb(
  "a homerun rises from the shop's height for its device's type",
  () => {
    it("an item that says nothing: no up-drop, and the row says why", async () => {
      const { bidId } = await aBid(await ownAssembly(null));
      const h = await homerun(bidId);
      expect(h.pieces.upDrop).toMatchObject({
        counted: false,
        reason: "no-kind",
      });
      // 40 run + 4 down at the panel; the 8.5 ft up is missing.
      expect(h.pieces.installedFt).toBeCloseTo(44, 6);
      expect(h.source).toBeNull();
    });

    it('Mounts at: Receptacle — rises 8.5 ft from the shipped 18", said as a default', async () => {
      const { bidId } = await aBid(await ownAssembly("receptacle"));
      const h = await homerun(bidId);
      expect(h.pieces.upDrop).toMatchObject({ counted: true, feet: 8.5 });
      expect(h.pieces.installedFt).toBeCloseTo(52.5, 6);
      expect(h.source).toBe("shipped");
    });

    it("the shop's own receptacle height re-prices it, with no edit to the bid", async () => {
      const { bidId } = await aBid(await ownAssembly("receptacle"));
      await caller().takeoffHeights.setCompanyHeight({
        typeKey: "receptacle",
        inches: 12,
      });
      const h = await homerun(bidId);
      expect(h.pieces.upDrop).toMatchObject({ counted: true, feet: 9 });
      expect(h.source).toBe("company");
    });

    it("the count's own answer still wins over the item's", async () => {
      const { bidId, groupId } = await aBid(await ownAssembly("receptacle"));
      await caller().takeoffGroups.setDrop({ id: groupId, dropKind: "switch" });
      // Switch 4'-0": 10'-0" − 4'-0" = 6 ft.
      expect((await homerun(bidId)).pieces.upDrop).toMatchObject({ feet: 6 });
    });

    it("one device's own height beats the type's, and is not called a default", async () => {
      const { bidId, mark } = await aBid(await ownAssembly("receptacle"));
      await caller().takeoffStamps.setHeight({
        bidId,
        ids: [mark],
        inches: 54,
        source: "typed",
      });
      const h = await homerun(bidId);
      // 10'-0" − 4'-6" = 5.5 ft.
      expect(h.pieces.upDrop).toMatchObject({ counted: true, feet: 5.5 });
      expect(h.source).toBe("mark-typed");
    });

    it("a SHIPPED item forks on edit, and a count on the shipped id reads the fork", async () => {
      const shipped = (await caller().assemblies.list()).find(
        a => a.userId === null
      )!;
      const { bidId } = await aBid(shipped.id);
      const saved = await caller().assemblies.update({
        id: shipped.id,
        mountHeightTypeKey: "receptacle",
      });
      expect(saved!.assembly!.id).not.toBe(shipped.id);
      expect((await homerun(bidId)).pieces.upDrop).toMatchObject({
        counted: true,
        feet: 8.5,
      });
    });

    it("refuses a type this company does not have", async () => {
      await expect(ownAssembly("no-such-type")).rejects.toThrow(
        /not one of your height types/
      );
      const id = await ownAssembly(null);
      await expect(
        caller().assemblies.update({ id, mountHeightTypeKey: "no-such-type" })
      ).rejects.toThrow(/not one of your height types/);
    });
  }
);

describeDb("a run end on the device drops to the item's type", () => {
  it("a run ending on the mark: 8.5 ft once the item says Receptacle", async () => {
    const assemblyId = await ownAssembly(null);
    const { bidId, sheetId, mark } = await aBid(assemblyId);
    const run = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "To the duplex",
      pathType: "conduit",
      status: "committed",
      startKind: "distribution",
      points: [
        { x: ft(40), y: ft(30) },
        { x: ft(40), y: ft(10) },
      ],
    });
    await caller().takeoffRuns.setEnds({ id: run.id, endStampId: mark });
    // The run's own reading of its end (this fixture run has no type, so it
    // puts nothing on the bid and the drops readout leaves it out).
    const endFeet = async () => {
      const row = (await caller().takeoffRuns.listForSheet({ sheetId })).find(
        r => r.id === run.id
      )!;
      const end = row.quantities?.verticals?.end;
      return end?.counted ? end.feet : 0;
    };
    expect(await endFeet()).toBe(0);
    await caller().assemblies.update({
      id: assemblyId,
      mountHeightTypeKey: "receptacle",
    });
    expect(await endFeet()).toBe(8.5);
  });
});
