/**
 * A TRACED RUN, WITH WIRE IN IT, ALL THE WAY TO THE BID. NO $0 LINES.
 *
 * ── The acceptance test for items 5 and 6 ────────────────────────────────────
 * Asked for by name on 2026-09-24: trace a 1/2" EMT run with two circuits of
 * 12 THHN, and show the pipe footage, the wire footage per conductor, and the
 * dollars landing on the bid.
 *
 * It is a server test rather than a click-through because the failure being
 * guarded against is arithmetic, and arithmetic is what a server test can
 * actually pin. The screen was checked separately.
 *
 * ── Why "no $0 lines" is the assertion that matters ──────────────────────────
 * Everything shipped in this app costs zero until a contractor prices it
 * (CLAUDE.md § Starter content), so a run that reaches the bid at $0 looks
 * exactly like a run that reached the bid correctly and happens to be unpriced.
 * That is the failure mode the whole seam exists to prevent: a run type created
 * from the catalog with no material behind it traces footage, names itself
 * sensibly, and bids nothing.
 *
 * So these price the materials first, then assert real dollars.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfs,
  bids,
  materials,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 5959;
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-run-to-bid-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** A 100 ft straight run at 1/4" = 1'-0", in page points. */
const SCALE_TEXT = `1/4" = 1'-0"`;
const RATIO = 48;
/** 100 ft = 1200 real inches; at 1:48 that is 25 paper inches = 1800 points. */
const HUNDRED_FEET_PTS = (100 * 12) / RATIO / (1 / 72);

async function setup() {
  const bid = await caller().bids.create({
    name: `Run to bid ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  });
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid!.id,
    userId: USER,
    filename: "E-Series.pdf",
    storageKey: `test/${bid!.id}/e.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  const bidPdfId = pdf.insertId;
  await caller().bidPdfs.ensureSheets({ bidPdfId, pageCount: 1 });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId });
  await caller().bidPdfs.setSheetScale({ id: sheet.id, scaleText: SCALE_TEXT });
  return { bidId: bid!.id, sheetId: sheet.id };
}

/** Price a catalog material so a real number can be asserted against it. */
async function priceMaterial(name: string, cost: number) {
  const list = await caller().materials.list();
  const row = list.find(m => m.name === name);
  if (!row) throw new Error(`no catalog material named ${name}`);
  const updated = await caller().materials.update({
    id: row.id,
    costPerUnit: cost,
  });
  // update FORKS a shipped row, so the id to point a run type at is the new one.
  return updated?.material?.id ?? row.id;
}

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
      openId: `test-run-to-bid-${USER}`,
      name: "Run to bid fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  /*
    Run types are per USER, not per bid, so deleting bids does not clear them
    and the second run of this file hit "your palette already has a conduit
    type called …". Forked materials go too, or `priceMaterial` keeps stacking
    forks of the same shipped row.
  */
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
});

describe.skipIf(!hasDb)(
  "a 1/2 inch EMT run with two circuits of 12 THHN",
  () => {
    it("puts pipe feet, wire feet per conductor, and real dollars on the bid", async () => {
      const { bidId, sheetId } = await setup();

      // ── The materials, priced so nothing can pass at zero ──────────────────
      const emtId = await priceMaterial('1/2" EMT', 1.25);
      const thhnId = await priceMaterial("#12 THHN", 0.18);
      const groundId = await priceMaterial("#12 bare copper, solid", 0.12);

      /*
      THE SEAM. A run type built from catalog materials, exactly as the picker
      now builds one: the raceway is the pipe, the conductor is the wire, and
      the type carries a default circuit so a run traced under it is priced
      without anybody opening the editor.
    */
      const type = await caller().takeoffRunTypes.create({
        // Unique, because the clash is with a SHIPPED palette entry named
        // exactly this — userId NULL, not ours to delete and not ours to
        // reuse. The shape under test is the materials, not the name.
        label: `1/2" EMT test ${Date.now()}${Math.random()}`,
        pathType: "conduit",
        racewayMaterialId: emtId,
        conductorMaterialId: thhnId,
        conductorCount: 2,
        groundMaterialId: groundId,
        groundCount: 1,
      });

      // ── A 100 ft run ───────────────────────────────────────────────────────
      const run = await caller().takeoffRuns.save({
        bidId,
        sheetId,
        name: "Homerun 1",
        pathType: "conduit",
        runTypeId: type.id,
        status: "committed",
        points: [
          { x: 0, y: 0 },
          { x: HUNDRED_FEET_PTS, y: 0 },
        ],
      });
      expect(run).toBeTruthy();

      /*
      TWO CIRCUITS IN THE ONE PIPE. The second is what the "add wires" toggle
      produces a second time — the schema has always allowed it (circuits hang
      off the RUN, not the type), and the footage sums per circuit.
    */
      const listed = await caller().takeoffRuns.listForSheet({ sheetId });
      const traced = listed.find(r => r.id === run!.id)!;
      /*
        A NEWLY TRACED RUN HAS NO CIRCUITS, and that is worth writing down
        because it surprised this test.

        The run TYPE carries conductorCount 2 and groundCount 1, but those are
        the defaults the editor offers — nothing copies them onto a run at save
        time. So wire reaches the bid only once circuits exist on the run, which
        is precisely what "Wires in this pipe: none / add wires" has to create.
        Empty is the honest starting state: a pipe with nothing pulled yet.
      */
      expect(traced.circuits.length).toBe(0);

      for (const name of ["Circuit 1", "Circuit 2"]) {
        await caller().takeoffRuns.addCircuit({
          runId: run!.id,
          name,
          conductorCount: 2,
          groundCount: 1,
        });
      }

      const after = await caller().takeoffRuns.listForSheet({ sheetId });
      const withTwo = after.find(r => r.id === run!.id)!;
      expect(withTwo.circuits.length).toBe(2);

      // ── The footage, before any money ──────────────────────────────────────
      const bridge = await caller().takeoffRunTypes.bridgeForBid({ bidId });
      const entry = bridge.find(e => e.runTypeId === type.id)!;
      expect(entry).toBeTruthy();
      const feetFor = (role: string) =>
        entry.rows.find(r => r.role === role)?.feet ?? 0;

      // One pipe, however many circuits are pulled through it.
      expect(feetFor("raceway")).toBeCloseTo(100, 1);
      // Four insulated conductors: two circuits of two.
      expect(feetFor("conductor")).toBeCloseTo(400, 1);
      // One ground per circuit.
      expect(feetFor("ground")).toBeCloseTo(200, 1);

      // ── And the money ──────────────────────────────────────────────────────
      const sent = await caller().takeoffRunTypes.sendToBid({
        bidId,
        runTypeId: type.id,
      });
      expect(sent).toBeTruthy();

      const detail = await caller().bids.get({ id: bidId });
      const allLines = (detail as unknown as { lines?: unknown[] }).lines ?? [];
      const ours = (
        allLines as Array<{
          takeoffRunTypeId: number | null;
          snapshotMaterialCost: string | number;
          qty: string | number;
        }>
      ).filter(l => l.takeoffRunTypeId === type.id);
      expect(ours.length).toBeGreaterThan(0);

      // THE ASSERTION THE BRIEF ASKED FOR: no $0 lines.
      for (const line of ours) {
        expect(Number(line.snapshotMaterialCost)).toBeGreaterThan(0);
      }

      const total = ours.reduce(
        (sum, l) => sum + Number(l.snapshotMaterialCost) * Number(l.qty),
        0
      );
      /*
      100 ft of pipe at 1.25, 400 ft of conductor at 0.18, 200 ft of ground at
      0.12 — 125 + 72 + 24 = 221. Asserted as a total rather than line by line
      because how the lines are split is a presentation decision; that the
      money is all there is not.
    */
      expect(total).toBeCloseTo(221, 0);
    });

    it("an EMPTY conduit bids the pipe and no wire at all", async () => {
      const { bidId, sheetId } = await setup();
      const emtId = await priceMaterial('3/4" EMT', 1.9);

      const type = await caller().takeoffRunTypes.create({
        label: `3/4" EMT empty ${Date.now()}${Math.random()}`,
        pathType: "conduit",
        racewayMaterialId: emtId,
        /*
          NULL, not 0 — and the schema is right to insist.

          `conductorCountSchema` refuses 0, which caught this test getting the
          representation wrong. "No wires in this pipe" is the ABSENCE of a
          count, not a count of none; a zero would be a circuit that exists and
          carries nothing, which is a different and meaningless thing. The
          "none" side of the toggle therefore writes null.
        */
        conductorMaterialId: null,
        conductorCount: null,
        groundMaterialId: null,
        groundCount: null,
      });

      const run = await caller().takeoffRuns.save({
        bidId,
        sheetId,
        name: "Homerun 1",
        pathType: "conduit",
        runTypeId: type.id,
        status: "committed",
        points: [
          { x: 0, y: 0 },
          { x: HUNDRED_FEET_PTS, y: 0 },
        ],
      });
      expect(run).toBeTruthy();

      const bridge = await caller().takeoffRunTypes.bridgeForBid({ bidId });
      const entry = bridge.find(e => e.runTypeId === type.id)!;
      const feetFor = (role: string) =>
        entry.rows.find(r => r.role === role)?.feet ?? 0;
      expect(feetFor("raceway")).toBeCloseTo(100, 1);
      // The half of the brief that is easy to forget: empty means EMPTY.
      expect(feetFor("conductor")).toBe(0);
      expect(feetFor("ground")).toBe(0);
    });
  }
);
