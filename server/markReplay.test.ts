/**
 * A BATCH OF MARKS SENT TWICE COUNTS ONCE (counting deep test, "offline then
 * back online", 2026-10-15 night).
 *
 * The Plans screen sends clicks in batches. When a send FAILS the marks go
 * back to unsent and ride the next flush (TakeoffPage `flushStamps`). If the
 * failure was a lost ANSWER — the connection dropped after the server wrote
 * the rows — that resend wrote every mark a second time: a receptacle count
 * of 3 became 6, with nothing on screen to say so.
 *
 * Each queued mark already carries a key on the screen. `takeoffStamps.drop`
 * now takes those keys and places each key once. A batch without keys — an
 * older screen, the crash-recovery queue — behaves exactly as before.
 *
 * Since 0168 the database holds the key (`takeoff_stamps.clientKey`, unique
 * per bid), so this holds across a server restart, on a second instance and
 * for two sends racing each other. Until then it was an in-memory map
 * (`server/markReplay.ts`, deleted with 0168) that a restart emptied.
 *
 * Fixture user 9914.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  at,
  bidWithSheet,
  freshUser,
  own,
  rate,
} from "./bidBuilders.testHelper";

const USER = 9914;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("a resent batch of marks", () => {
  let bidId = 0;
  let sheetId = 0;
  let groupId = 0;

  beforeAll(async () => {
    await freshUser(USER);
    const c = as(USER);
    ({ bidId, sheetId } = await bidWithSheet(c, USER, "Replay"));
    const rateId = await rate(c, "Replay journeyman", 50);
    const part = await own(c, "Replay receptacle", 2, 0.2);
    const assembly = (await c.assemblies.create({
      name: "Replay receptacle, complete",
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.2,
      laborRateId: rateId,
      materials: [{ materialId: part, qty: 1 }],
      modifierIds: [],
    }))!;
    const g = await c.takeoffGroups.forAssembly({
      bidId,
      assemblyId: assembly.id,
    });
    if (!("id" in g)) throw new Error("expected one count");
    groupId = g.id as number;
  }, 60_000);

  const marks = async () =>
    (await as(USER).takeoffStamps.listForSheet({ sheetId })).length;

  it("the same keyed batch twice places the marks once, and gives back the same ids", async () => {
    const c = as(USER);
    const batch = {
      bidId,
      sheetId,
      groupId,
      at: at(3, 3000),
      keys: ["k-1", "k-2", "k-3"],
    };
    const first = await c.takeoffStamps.drop(batch);
    const again = await c.takeoffStamps.drop(batch);
    expect(await marks()).toBe(3);
    expect(again.ids).toEqual(first.ids);
  });

  it("a resend with new clicks behind it places only the new ones", async () => {
    const c = as(USER);
    await c.takeoffStamps.drop({
      bidId,
      sheetId,
      groupId,
      at: [...at(3, 3000).slice(2), { x: 9000, y: 9000 }],
      keys: ["k-3", "k-4"],
    });
    expect(await marks()).toBe(4);
  });

  it("the bid line follows: 4 receptacles, not 6 or 7", async () => {
    const c = as(USER);
    const { lineId } = await c.takeoffGroups.sendToBid({ id: groupId });
    const line = (await c.bids.get({ id: bidId })).lines.find(
      l => l.id === lineId
    )!;
    expect(Number(line.qty)).toBe(4);
    // Hand math: 4 × ($2.00 + 0.2 h × $50) = 4 × $12.00 = $48.00.
    expect(line.breakdown?.directCost).toBe(48);
  });

  it("a batch with no keys (older screen, crash recovery) works as before", async () => {
    const c = as(USER);
    await c.takeoffStamps.drop({
      bidId,
      sheetId,
      groupId,
      at: [{ x: 100, y: 100 }],
    });
    expect(await marks()).toBe(5);
  });

  it("two sends of one batch AT ONCE (the resend racing the first send) place it once", async () => {
    const c = as(USER);
    const batch = {
      bidId,
      sheetId,
      groupId,
      at: at(3, 6000),
      keys: ["race-1", "race-2", "race-3"],
    };
    const [a, b] = await Promise.all([
      c.takeoffStamps.drop(batch),
      c.takeoffStamps.drop(batch),
    ]);
    expect(await marks()).toBe(8);
    expect(a.ids).toEqual(b.ids);
    expect(a.dropped + b.dropped).toBe(3);
  });

  it("the same key on ANOTHER bid is another mark", async () => {
    const c = as(USER);
    const other = await bidWithSheet(c, USER, "Replay other");
    const otherCount = await c.takeoffGroups.forAssembly({
      bidId: other.bidId,
      assemblyId: (await c.assemblies.list()).find(
        a => a.name === "Replay receptacle, complete"
      )!.id,
    });
    if (!("id" in otherCount)) throw new Error("expected one count");
    await c.takeoffStamps.drop({
      bidId: other.bidId,
      sheetId: other.sheetId,
      groupId: otherCount.id as number,
      at: at(1, 3000),
      keys: ["k-1"],
    });
    expect(
      (await c.takeoffStamps.listForSheet({ sheetId: other.sheetId })).length
    ).toBe(1);
    expect(await marks()).toBe(8);
  });

  it("keys must match the clicks one for one", async () => {
    await expect(
      as(USER).takeoffStamps.drop({
        bidId,
        sheetId,
        groupId,
        at: at(2, 5000),
        keys: ["only-one"],
      })
    ).rejects.toThrow();
  });
});
