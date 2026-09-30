/**
 * Delete with a snapshot, and put a snapshot back — the server half of undo on
 * the Plans screen (Track B plan, Part 3).
 *
 * ── Same ids, or nothing ─────────────────────────────────────────────────────
 * A restore re-inserts every row with the id it had. MySQL never hands a
 * deleted auto-increment id to a new row: measured 2026-09-29 on 8.0.46,
 * deleting the highest mark (12304) and inserting a fresh one gave 12305, and
 * the explicit re-insert of 12304 then went in. So every link that pointed at
 * a restored row points at it again.
 *
 * ── What a restore refuses, and why it refuses rather than guesses ───────────
 * An undo is a claim that the drawing goes back to exactly how it was. When it
 * cannot — the count those marks belonged to is gone, a mark a run ended on is
 * gone, the run was edited after the delete — putting back part of it would
 * leave a drawing nobody ever had, with numbers to match. So it refuses with a
 * sentence and the screen drops the step.
 *
 * ── A run is restored as its whole NETWORK ───────────────────────────────────
 * Deleting one leg can re-join the two pieces either side of a tee
 * (`db.removeLeg`), which rewrites a surviving row. So a run delete snapshots
 * the root and every leg, tee, circuit and pull-point answer BEFORE, and
 * fingerprints what is left AFTER. Restoring checks the network still matches
 * that fingerprint, then replaces it with the snapshot.
 */
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import superjson from "superjson";
import {
  planCopilotFindings,
  takeoffGroups,
  takeoffPullPoints,
  takeoffRunCircuits,
  takeoffRunTees,
  takeoffRuns,
  takeoffStamps,
  type TakeoffPullPoint,
  type TakeoffRun,
  type TakeoffRunCircuit,
  type TakeoffRunTee,
  type TakeoffStamp,
  type TakeoffGroup,
} from "../drizzle/schema";
import { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function database(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db;
}

function refuse(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

/** MySQL's "a foreign key points at a row that is not there" (1452). */
function isMissingParent(error: unknown): boolean {
  const e = error as { errno?: number; cause?: { errno?: number } };
  return e?.errno === 1452 || e?.cause?.errno === 1452;
}

// ── Marks ────────────────────────────────────────────────────────────────────

export type StampSnapshot = {
  stamps: TakeoffStamp[];
  /** Every link the delete cleared (`ON DELETE SET NULL`), to put back. */
  runStarts: { runId: number; stampId: number }[];
  runEnds: { runId: number; stampId: number }[];
  tees: { teeId: number; stampId: number }[];
  findings: { findingId: number; stampId: number }[];
};

export const EMPTY_STAMP_SNAPSHOT: StampSnapshot = {
  stamps: [],
  runStarts: [],
  runEnds: [],
  tees: [],
  findings: [],
};

async function snapshotStampsIn(
  tx: Tx,
  ids: readonly number[],
  userId: number
): Promise<StampSnapshot> {
  if (ids.length === 0) return EMPTY_STAMP_SNAPSHOT;
  const list = [...ids];
  const stamps = await tx
    .select()
    .from(takeoffStamps)
    .where(
      and(inArray(takeoffStamps.id, list), eq(takeoffStamps.userId, userId))
    )
    .orderBy(asc(takeoffStamps.id));
  if (stamps.length === 0) return EMPTY_STAMP_SNAPSHOT;
  const found = stamps.map(s => s.id);
  const runs = await tx
    .select({
      id: takeoffRuns.id,
      startStampId: takeoffRuns.startStampId,
      endStampId: takeoffRuns.endStampId,
    })
    .from(takeoffRuns)
    .where(
      and(
        eq(takeoffRuns.userId, userId),
        or(
          inArray(takeoffRuns.startStampId, found),
          inArray(takeoffRuns.endStampId, found)
        )
      )
    );
  const inSet = (id: number | null): id is number =>
    id !== null && found.includes(id);
  const tees = await tx
    .select({ id: takeoffRunTees.id, stampId: takeoffRunTees.stampId })
    .from(takeoffRunTees)
    .where(
      and(
        eq(takeoffRunTees.userId, userId),
        inArray(takeoffRunTees.stampId, found)
      )
    );
  const findings = await tx
    .select({
      id: planCopilotFindings.id,
      stampId: planCopilotFindings.stampId,
    })
    .from(planCopilotFindings)
    .where(
      and(
        eq(planCopilotFindings.userId, userId),
        inArray(planCopilotFindings.stampId, found)
      )
    );
  return {
    stamps,
    runStarts: runs
      .filter(r => inSet(r.startStampId))
      .map(r => ({ runId: r.id, stampId: r.startStampId! })),
    runEnds: runs
      .filter(r => inSet(r.endStampId))
      .map(r => ({ runId: r.id, stampId: r.endStampId! })),
    tees: tees
      .filter(t => inSet(t.stampId))
      .map(t => ({ teeId: t.id, stampId: t.stampId! })),
    findings: findings
      .filter(f => inSet(f.stampId))
      .map(f => ({ findingId: f.id, stampId: f.stampId! })),
  };
}

/** Delete these marks, and return exactly what went with every link to them. */
export async function deleteStampsWithSnapshot(
  ids: readonly number[],
  userId: number
): Promise<{ removed: number; snapshot: StampSnapshot }> {
  const db = await database();
  return db.transaction(async tx => {
    const snapshot = await snapshotStampsIn(tx, ids, userId);
    if (snapshot.stamps.length === 0) return { removed: 0, snapshot };
    const [result] = await tx.delete(takeoffStamps).where(
      and(
        inArray(
          takeoffStamps.id,
          snapshot.stamps.map(s => s.id)
        ),
        eq(takeoffStamps.userId, userId)
      )
    );
    return { removed: result.affectedRows, snapshot };
  });
}

async function restoreStampsIn(
  tx: Tx,
  snapshot: StampSnapshot,
  userId: number
): Promise<number> {
  const ids = snapshot.stamps.map(s => s.id);
  if (ids.length === 0) return 0;
  const [already] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(takeoffStamps)
    .where(inArray(takeoffStamps.id, ids));
  if (Number(already?.n ?? 0) > 0)
    refuse("Those marks are already on the sheet.");

  const groupIds = Array.from(
    new Set(
      snapshot.stamps.map(s => s.groupId).filter((g): g is number => g !== null)
    )
  );
  if (groupIds.length > 0) {
    const groups = await tx
      .select({ id: takeoffGroups.id })
      .from(takeoffGroups)
      .where(
        and(
          inArray(takeoffGroups.id, groupIds),
          eq(takeoffGroups.userId, userId)
        )
      );
    if (groups.length !== groupIds.length)
      refuse(
        "The count those marks belonged to has been deleted since, so they cannot be put back."
      );
  }

  try {
    await tx.insert(takeoffStamps).values(snapshot.stamps);
  } catch (error) {
    if (isMissingParent(error))
      refuse(
        "The sheet those marks were on has been removed since, so they cannot be put back."
      );
    throw error;
  }

  // Links: only where the row is still there and nothing else took the slot.
  for (const l of snapshot.runStarts)
    await tx
      .update(takeoffRuns)
      .set({ startStampId: l.stampId })
      .where(
        and(
          eq(takeoffRuns.id, l.runId),
          eq(takeoffRuns.userId, userId),
          isNull(takeoffRuns.startStampId)
        )
      );
  for (const l of snapshot.runEnds)
    await tx
      .update(takeoffRuns)
      .set({ endStampId: l.stampId })
      .where(
        and(
          eq(takeoffRuns.id, l.runId),
          eq(takeoffRuns.userId, userId),
          isNull(takeoffRuns.endStampId)
        )
      );
  for (const l of snapshot.tees)
    await tx
      .update(takeoffRunTees)
      .set({ stampId: l.stampId })
      .where(
        and(
          eq(takeoffRunTees.id, l.teeId),
          eq(takeoffRunTees.userId, userId),
          isNull(takeoffRunTees.stampId)
        )
      );
  for (const l of snapshot.findings)
    await tx
      .update(planCopilotFindings)
      .set({ stampId: l.stampId })
      .where(
        and(
          eq(planCopilotFindings.id, l.findingId),
          eq(planCopilotFindings.userId, userId),
          isNull(planCopilotFindings.stampId)
        )
      );
  return ids.length;
}

// ── A whole count ────────────────────────────────────────────────────────────

/**
 * A count and every mark in it, on every sheet — what "Delete count" loses.
 * Only marks reference a count (`takeoff_stamps.groupId`, cascade; a bid line
 * is RESTRICT and refused before this), so the row plus its marks is all of it.
 */
export type GroupSnapshot = { group: TakeoffGroup; marks: StampSnapshot };

/** Delete a count and its marks, and return exactly what went. */
export async function deleteGroupWithSnapshot(
  groupId: number,
  userId: number
): Promise<{ removed: number; snapshot: GroupSnapshot } | null> {
  const db = await database();
  return db.transaction(async tx => {
    const [group] = await tx
      .select()
      .from(takeoffGroups)
      .where(
        and(eq(takeoffGroups.id, groupId), eq(takeoffGroups.userId, userId))
      )
      .limit(1);
    if (!group) return null;
    const ids = (
      await tx
        .select({ id: takeoffStamps.id })
        .from(takeoffStamps)
        .where(
          and(
            eq(takeoffStamps.groupId, groupId),
            eq(takeoffStamps.userId, userId)
          )
        )
    ).map(r => r.id);
    const marks = await snapshotStampsIn(tx, ids, userId);
    // The marks go with the row, by the foreign key's cascade.
    await tx
      .delete(takeoffGroups)
      .where(
        and(eq(takeoffGroups.id, groupId), eq(takeoffGroups.userId, userId))
      );
    return { removed: marks.stamps.length, snapshot: { group, marks } };
  });
}

/** Put a deleted count back — same id, same marks, links re-attached. */
export async function restoreGroup(
  snapshot: GroupSnapshot,
  userId: number
): Promise<number> {
  if (snapshot.group.userId !== userId)
    refuse("That undo step is not valid here.");
  const db = await database();
  return db.transaction(async tx => {
    const [already] = await tx
      .select({ id: takeoffGroups.id })
      .from(takeoffGroups)
      .where(eq(takeoffGroups.id, snapshot.group.id))
      .limit(1);
    if (already) refuse("That count is already back.");
    // Two counts with one name on one bid is what `create` refuses; a count
    // started since under the same name would make one here.
    const [sameName] = await tx
      .select({ id: takeoffGroups.id })
      .from(takeoffGroups)
      .where(
        and(
          eq(takeoffGroups.bidId, snapshot.group.bidId),
          eq(takeoffGroups.label, snapshot.group.label)
        )
      )
      .limit(1);
    if (sameName)
      refuse(
        `A count called "${snapshot.group.label}" has been started since, so this one cannot be put back beside it.`
      );
    try {
      await tx.insert(takeoffGroups).values(snapshot.group);
    } catch (error) {
      if (isMissingParent(error))
        refuse(
          "The bid or assembly that count belonged to has gone since, so it cannot be put back."
        );
      throw error;
    }
    return restoreStampsIn(tx, snapshot.marks, userId);
  });
}

/** Put deleted marks back, same ids, links re-attached. All or nothing. */
export async function restoreStamps(
  snapshot: StampSnapshot,
  userId: number
): Promise<number> {
  const db = await database();
  return db.transaction(tx => restoreStampsIn(tx, snapshot, userId));
}

/**
 * The ids a placement wrote, or none if they cannot all be confirmed.
 *
 * Every id must be a mark in this bid, sheet and count; one that is not means
 * another insert interleaved and the arithmetic in `createStampsReturningIds`
 * named a mark this placement did not make.
 */
export async function confirmPlacedIds(
  ids: readonly number[],
  where: { userId: number; sheetId: number; groupId: number }
): Promise<number[]> {
  if (ids.length === 0) return [];
  const db = await database();
  const rows = await db
    .select({ id: takeoffStamps.id })
    .from(takeoffStamps)
    .where(
      and(
        inArray(takeoffStamps.id, [...ids]),
        eq(takeoffStamps.userId, where.userId),
        // By SHEET, which names the bid; not a bid-wide read, so it has no
        // business in quantitiesIgnoreDeletedPlans' list of them.
        eq(takeoffStamps.sheetId, where.sheetId),
        eq(takeoffStamps.groupId, where.groupId)
      )
    );
  return rows.length === ids.length ? [...ids] : [];
}

/** The bids a snapshot of marks belongs to, for the lock check. */
export function bidsOfStamps(snapshot: StampSnapshot): number[] {
  return Array.from(new Set(snapshot.stamps.map(s => s.bidId)));
}

// ── Run networks ─────────────────────────────────────────────────────────────

export type NetworkRows = {
  runs: TakeoffRun[];
  tees: TakeoffRunTee[];
  circuits: TakeoffRunCircuit[];
  pullPoints: TakeoffPullPoint[];
};

export type NetworkSnapshot = NetworkRows & {
  rootId: number;
  bidId: number;
  /** Fingerprint of the network as the delete LEFT it. */
  after: string;
};

async function networkRows(
  tx: Tx | Db,
  rootId: number,
  userId: number
): Promise<NetworkRows> {
  const runs = await tx
    .select()
    .from(takeoffRuns)
    .where(
      and(
        eq(takeoffRuns.userId, userId),
        or(eq(takeoffRuns.id, rootId), eq(takeoffRuns.parentRunId, rootId))
      )
    )
    .orderBy(asc(takeoffRuns.id));
  // The root first: every leg's parentRunId points at it.
  runs.sort(
    (a, b) => Number(a.parentRunId !== null) - Number(b.parentRunId !== null)
  );
  const runIds = runs.map(r => r.id);
  if (runIds.length === 0)
    return { runs, tees: [], circuits: [], pullPoints: [] };
  const [tees, circuits, pullPoints] = await Promise.all([
    tx
      .select()
      .from(takeoffRunTees)
      .where(
        and(
          eq(takeoffRunTees.rootRunId, rootId),
          eq(takeoffRunTees.userId, userId)
        )
      )
      .orderBy(asc(takeoffRunTees.id)),
    tx
      .select()
      .from(takeoffRunCircuits)
      .where(inArray(takeoffRunCircuits.runId, runIds))
      .orderBy(asc(takeoffRunCircuits.id)),
    tx
      .select()
      .from(takeoffPullPoints)
      .where(inArray(takeoffPullPoints.runId, runIds))
      .orderBy(asc(takeoffPullPoints.id)),
  ]);
  return { runs, tees, circuits, pullPoints };
}

/**
 * Changes whenever the CONTENT of any row of the network does.
 *
 * Timestamps are left out on purpose. Undoing a mark delete re-links a run's
 * end to the mark, which touches the run's row without changing what it is;
 * with `updatedAt` in here, that would make the NEXT undo on the stack (the
 * run's own restore) refuse as "changed since" when nothing about it had.
 */
export function fingerprint(rows: NetworkRows): string {
  const strip = <T extends { createdAt: Date; updatedAt: Date }>(row: T) => {
    const { createdAt: _c, updatedAt: _u, ...rest } = row;
    return rest;
  };
  return createHash("sha256")
    .update(
      superjson.stringify({
        runs: rows.runs.map(strip),
        tees: rows.tees.map(strip),
        circuits: rows.circuits.map(strip),
        pullPoints: rows.pullPoints.map(strip),
      })
    )
    .digest("base64url");
}

/** The root a run row belongs to. */
function rootOf(run: Pick<TakeoffRun, "id" | "parentRunId">): number {
  return run.parentRunId ?? run.id;
}

/**
 * Snapshot the network, run `change`, and fingerprint what it left.
 *
 * `change` is the real edit — `db.removeLeg` for a delete, a points update
 * for a drag — passed in so its rules stay in one place. The snapshot is what
 * `restoreNetwork` puts back.
 */
export async function withNetworkSnapshot<R>(
  run: Pick<TakeoffRun, "id" | "parentRunId" | "bidId">,
  userId: number,
  change: () => Promise<R>
): Promise<{ result: R; snapshot: NetworkSnapshot }> {
  const db = await database();
  const rootId = rootOf(run);
  const before = await networkRows(db, rootId, userId);
  const result = await change();
  const after = await networkRows(db, rootId, userId);
  return {
    result,
    snapshot: {
      ...before,
      rootId,
      bidId: run.bidId,
      after: fingerprint(after),
    },
  };
}

async function insertNetwork(tx: Tx, rows: NetworkRows): Promise<void> {
  if (rows.runs.length === 0) return;
  // Tees point at the root and runs point at tees, so runs go in first with
  // their tee ends empty, then the tees, then the ends are put back.
  await tx
    .insert(takeoffRuns)
    .values(rows.runs.map(r => ({ ...r, startTeeId: null, endTeeId: null })));
  if (rows.tees.length > 0) await tx.insert(takeoffRunTees).values(rows.tees);
  for (const r of rows.runs)
    if (r.startTeeId !== null || r.endTeeId !== null)
      await tx
        .update(takeoffRuns)
        .set({
          startTeeId: r.startTeeId,
          endTeeId: r.endTeeId,
          updatedAt: r.updatedAt,
        })
        .where(eq(takeoffRuns.id, r.id));
  if (rows.circuits.length > 0)
    await tx.insert(takeoffRunCircuits).values(rows.circuits);
  if (rows.pullPoints.length > 0)
    await tx.insert(takeoffPullPoints).values(rows.pullPoints);
}

async function restoreNetworkIn(
  tx: Tx,
  snapshot: NetworkSnapshot,
  userId: number
): Promise<void> {
  const now = await networkRows(tx, snapshot.rootId, userId);
  if (fingerprint(now) !== snapshot.after)
    refuse(
      "That run has been changed since it was deleted, so it cannot be put back as it was."
    );

  const stampIds = Array.from(
    new Set(
      [
        ...snapshot.runs.flatMap(r => [r.startStampId, r.endStampId]),
        ...snapshot.tees.map(t => t.stampId),
      ].filter((id): id is number => id !== null)
    )
  );
  if (stampIds.length > 0) {
    const present = await tx
      .select({ id: takeoffStamps.id })
      .from(takeoffStamps)
      .where(inArray(takeoffStamps.id, stampIds));
    if (present.length !== stampIds.length)
      refuse(
        "A mark that run ended on has been deleted since, so the run cannot be put back as it was."
      );
  }

  // Whatever the delete left (the other side of a tee, re-joined) goes, and
  // the network as it was comes back whole.
  await tx
    .delete(takeoffRuns)
    .where(
      and(eq(takeoffRuns.id, snapshot.rootId), eq(takeoffRuns.userId, userId))
    );
  try {
    await insertNetwork(tx, snapshot);
  } catch (error) {
    if (isMissingParent(error))
      refuse(
        "Something that run depended on — its sheet or its type — has been removed since, so it cannot be put back."
      );
    throw error;
  }
}

/** Put a deleted run (or leg) back exactly as it was before the delete. */
export async function restoreNetwork(
  snapshot: NetworkSnapshot,
  userId: number
): Promise<void> {
  const db = await database();
  await db.transaction(tx => restoreNetworkIn(tx, snapshot, userId));
}

// ── A whole sheet ────────────────────────────────────────────────────────────

export type SheetSnapshot = {
  sheetId: number;
  bidId: number;
  stamps: StampSnapshot;
  networks: NetworkSnapshot[];
};

/** Every run network with a row on this sheet, by root id. */
async function rootsOnSheet(
  tx: Tx | Db,
  sheetId: number,
  userId: number
): Promise<number[]> {
  const rows = await tx
    .select({ id: takeoffRuns.id, parentRunId: takeoffRuns.parentRunId })
    .from(takeoffRuns)
    .where(
      and(eq(takeoffRuns.sheetId, sheetId), eq(takeoffRuns.userId, userId))
    );
  return Array.from(new Set(rows.map(rootOf))).sort((a, b) => a - b);
}

async function stampIdsOnSheet(
  tx: Tx | Db,
  sheetId: number,
  userId: number
): Promise<number[]> {
  const rows = await tx
    .select({ id: takeoffStamps.id })
    .from(takeoffStamps)
    .where(
      and(eq(takeoffStamps.sheetId, sheetId), eq(takeoffStamps.userId, userId))
    );
  return rows.map(r => r.id);
}

/** What a clear would remove, counted from the rows — for the question. */
export async function previewSheetClear(
  sheetId: number,
  userId: number
): Promise<{
  runs: number;
  runsWithLegs: number;
  marks: number;
  counts: number;
  /** Counts whose every mark on the bid is on this sheet: they go to 0. */
  countsLeftEmpty: number;
}> {
  const db = await database();
  const roots = await rootsOnSheet(db, sheetId, userId);
  let runsWithLegs = 0;
  for (const root of roots) {
    const rows = await networkRows(db, root, userId);
    if (rows.runs.length > 1) runsWithLegs++;
  }
  const marks = await db
    .select({ groupId: takeoffStamps.groupId, bidId: takeoffStamps.bidId })
    .from(takeoffStamps)
    .where(
      and(eq(takeoffStamps.sheetId, sheetId), eq(takeoffStamps.userId, userId))
    );
  const groupIds = Array.from(
    new Set(marks.map(m => m.groupId).filter((g): g is number => g !== null))
  );
  let countsLeftEmpty = 0;
  if (groupIds.length > 0) {
    const elsewhere = await db
      .select({ groupId: takeoffStamps.groupId })
      .from(takeoffStamps)
      .where(
        and(
          inArray(takeoffStamps.groupId, groupIds),
          eq(takeoffStamps.userId, userId),
          sql`${takeoffStamps.sheetId} <> ${sheetId}`
        )
      )
      .groupBy(takeoffStamps.groupId);
    countsLeftEmpty = groupIds.length - elsewhere.length;
  }
  return {
    runs: roots.length,
    runsWithLegs,
    marks: marks.length,
    counts: groupIds.length,
    countsLeftEmpty,
  };
}

/**
 * Remove every mark and every run on a sheet, in ONE transaction, and return
 * exactly what went. Keeps the sheet, its scale, the counts themselves (they
 * are bid-wide) and legend captures (they belong to the company).
 */
export async function clearSheetWithSnapshot(
  sheet: { id: number; bidId: number },
  userId: number
): Promise<{
  removedRuns: number;
  removedMarks: number;
  snapshot: SheetSnapshot;
}> {
  const db = await database();
  return db.transaction(async tx => {
    const roots = await rootsOnSheet(tx, sheet.id, userId);
    const networks: NetworkSnapshot[] = [];
    const empty = fingerprint({
      runs: [],
      tees: [],
      circuits: [],
      pullPoints: [],
    });
    for (const rootId of roots) {
      const rows = await networkRows(tx, rootId, userId);
      networks.push({ ...rows, rootId, bidId: sheet.bidId, after: empty });
    }
    const stamps = await snapshotStampsIn(
      tx,
      await stampIdsOnSheet(tx, sheet.id, userId),
      userId
    );
    if (roots.length > 0)
      await tx
        .delete(takeoffRuns)
        .where(
          and(inArray(takeoffRuns.id, roots), eq(takeoffRuns.userId, userId))
        );
    if (stamps.stamps.length > 0)
      await tx.delete(takeoffStamps).where(
        and(
          inArray(
            takeoffStamps.id,
            stamps.stamps.map(s => s.id)
          ),
          eq(takeoffStamps.userId, userId)
        )
      );
    return {
      removedRuns: roots.length,
      removedMarks: stamps.stamps.length,
      snapshot: { sheetId: sheet.id, bidId: sheet.bidId, stamps, networks },
    };
  });
}

/**
 * Put a cleared sheet back in one step: the marks first (runs end on them),
 * then every run network. All or nothing — a sheet half put back is a
 * drawing nobody had.
 */
export async function restoreSheet(
  snapshot: SheetSnapshot,
  userId: number
): Promise<void> {
  const db = await database();
  await db.transaction(async tx => {
    await restoreStampsIn(tx, snapshot.stamps, userId);
    for (const network of snapshot.networks)
      await restoreNetworkIn(tx, network, userId);
  });
}
