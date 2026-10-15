/**
 * STARTER UPDATES — what one shop is offered when BidRidge changes the shipped
 * starter, and what Accept, Ignore and un-ignore do
 * (references/starter-offers-plan.md §§ 2.3–2.5, 3a–3d; Track B 2026-10-14,
 * built from C's spec in baseline-screen-plan.md § 10a.3 with its fault fixed).
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 * `applyStarterChange` pins every existing shop to the old value (a copy of the
 * row) and logs the change. A shop's offers are those logged changes, read
 * against ITS copy:
 *
 *   - one offer per (row, field), or per (assembly, part) — never per change,
 *     and never hidden by `baselineVersion` (§ 3a; `collapseOffer`);
 *   - only changes made after the copy was (`version` above the copy's
 *     `baselineVersion`, which Accept leaves alone);
 *   - a shop with no copy reads the shared row, which already IS the latest:
 *     nothing to offer, no code.
 *
 * ── What Accept moves, and what it never does ───────────────────────────────
 * It writes BidRidge's latest value (and its Example tag, § 2.6) into the
 * shop's copy. Lines already on a bid keep their frozen snapshot; a bid that
 * left Draft has its quantities locked (`leaveDraft`). Only an unlocked Draft
 * that reads a re-counting field live moves, and the screen says how many
 * BEFORE Accept is pressed (`draftBidIds`, `recountsDrafts`).
 *
 * ── Who ─────────────────────────────────────────────────────────────────────
 * `ownerUserId` is the SHOP (`ctx.scope.dataUserId`); `actorUserId` is the
 * person, written as `answeredByUserId`. The router gates Accept / Ignore to
 * owner and admins (owner Q1).
 *
 * ── Not here ────────────────────────────────────────────────────────────────
 * A `starter_accepted` price-history row: nothing writes
 * `material_price_history` yet (0163 has no writer). Add it where that door is
 * built. Hide offers wait for `hideStarterItem`.
 */
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  assemblies,
  assemblyMaterials,
  assemblyModifiers,
  bids,
  materials,
  modifiers,
  starterChanges,
  starterOfferAnswers,
  takeoffGroups,
  takeoffRuns,
  takeoffRunTypes,
} from "../drizzle/schema";
import * as db from "./db";
import {
  PART_LINE_FIELDS,
  sameLine,
  starterColumnsOf,
  starterTableOf,
  tableFromName,
} from "./starterChanges";
import {
  STARTER_REFERENCES,
  collapseOffer,
  exampleTagAfter,
  exampleTagOf,
  recountsDrafts,
  sameStarterValue,
  starterFieldKind,
  type LoggedOfferChange,
  type OfferBucket,
  type StarterTable,
} from "../shared/starterChange";

// ─── Types ───────────────────────────────────────────────────────────────────

export type StarterOfferKind = "field" | "part" | "partField" | "modifier";

export type StarterOffer = {
  /** Stable id of the (row, field) or (assembly, part) this offer is about. */
  key: string;
  table: StarterTable;
  /** The shared row. */
  rowId: number;
  /** This shop's copy of it. */
  copyId: number;
  /** The copy's name (a run type's label). */
  itemName: string;
  kind: StarterOfferKind;
  /** The field, or a recipe line's field; null for a part or modifier. */
  field: string | null;
  /** The part (material or modifier) a recipe offer is about. */
  childRefId: number | null;
  childName: string | null;
  /** What the shop's copy holds now. A line is `{qty, …}` or null. */
  yours: unknown;
  /** What BidRidge held when the copy was made. */
  base: unknown;
  /** BidRidge's value now. */
  latest: unknown;
  /** The Example tag that comes with `latest`, for a tagged number. */
  latestExample: boolean | null;
  bucket: Exclude<OfferBucket, "nothing">;
  latestChangeId: number;
  /** Every change in this chain, oldest first (the steps, Q4 "show on tap"). */
  steps: Array<{ changeId: number; from: unknown; to: unknown; at: Date }>;
  unansweredIds: number[];
  /** "ignored": in the Ignored fold, not in the list or the count. */
  answer: "ignored" | null;
  changedAt: Date;
  recountsDrafts: boolean;
  /** The shop's unlocked Drafts that re-count on Accept. */
  draftBidIds: number[];
};

export type StarterOffersRead = {
  /** Listed and counted: the Dashboard's N is `offers.length`. */
  offers: StarterOffer[];
  /** The Ignored fold. */
  ignored: StarterOffer[];
};

export class StarterOfferRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StarterOfferRefused";
  }
}

// ─── Small helpers ───────────────────────────────────────────────────────────

async function database() {
  const handle = await db.getDb();
  if (!handle) throw new Error("DB unavailable");
  return handle;
}

type Wrapped = { v?: unknown; example?: unknown } | null;
const valueOf = (w: unknown): unknown =>
  w && typeof w === "object" && "v" in w ? (w as { v: unknown }).v : null;
const exampleOf = (w: unknown): boolean | null => {
  const e = (w as Wrapped)?.example;
  return typeof e === "boolean" ? e : null;
};

/** Live in a library: not archived, not retired. */
function isLive(row: Record<string, unknown>): boolean {
  if ("isActive" in row && row.isActive === false) return false;
  if ("status" in row && row.status != null && row.status !== "active")
    return false;
  return true;
}

/**
 * The shop's copy of a shared row: the one `resolveForkedRow` would answer
 * with — a live fork first, else any (shared/forkedRows.ts).
 */
function pickCopy<T extends Record<string, unknown>>(
  forks: T[]
): T | undefined {
  const live = forks.filter(isLive);
  const pool = live.length > 0 ? live : forks;
  return [...pool].sort((a, b) => (b.id as number) - (a.id as number))[0];
}

/** A recipe line as the log holds it. */
function lineOf(
  row:
    | { qty: string; overrideLaborHours: string | null; isBranchWhip: boolean }
    | undefined
) {
  if (!row) return null;
  return {
    qty: row.qty,
    overrideLaborHours: row.overrideLaborHours,
    isBranchWhip: row.isBranchWhip,
  };
}

function offerKey(c: typeof starterChanges.$inferSelect): {
  key: string;
  kind: StarterOfferKind;
} {
  const base = `${c.targetTable}:${c.targetRowId}`;
  if (c.kind === "field") return { key: `${base}:f:${c.field}`, kind: "field" };
  if (c.childTable === "assembly_modifiers")
    return { key: `${base}:mod:${c.childRefId}`, kind: "modifier" };
  if (c.kind === "part_field")
    return {
      key: `${base}:line:${c.childRefId}:${c.field}`,
      kind: "partField",
    };
  return { key: `${base}:line:${c.childRefId}`, kind: "part" };
}

// ─── The read ────────────────────────────────────────────────────────────────

type Chain = {
  key: string;
  kind: StarterOfferKind;
  table: StarterTable;
  rowId: number;
  field: string | null;
  childRefId: number | null;
  changes: Array<typeof starterChanges.$inferSelect>;
};

/**
 * Every offer for one shop, the Ignored fold beside it. ONE function: the
 * Dashboard's count is this list's length (plan § 3c), never a second query.
 */
export async function starterOffersFor(
  ownerUserId: number
): Promise<StarterOffersRead> {
  const handle = await database();
  const logged = await handle
    .select()
    .from(starterChanges)
    .where(
      inArray(starterChanges.kind, [
        "field",
        "part_add",
        "part_remove",
        "part_field",
      ])
    )
    .orderBy(asc(starterChanges.id));
  if (logged.length === 0) return { offers: [], ignored: [] };

  // Rows touched, per table.
  const rowsByTable = new Map<StarterTable, Set<number>>();
  for (const c of logged) {
    const table = tableFromName(c.targetTable);
    if (!table) continue;
    if (
      c.kind === "field" &&
      starterFieldKind(table, c.field ?? "") !== "offer"
    )
      continue;
    if (!rowsByTable.has(table)) rowsByTable.set(table, new Set());
    rowsByTable.get(table)!.add(c.targetRowId);
  }

  // This shop's copy of each touched row.
  const copies = new Map<string, Record<string, unknown>>();
  for (const [table, rowIds] of Array.from(rowsByTable)) {
    const cols = starterColumnsOf(table);
    const forks = (await handle
      .select()
      .from(starterTableOf(table))
      .where(
        and(
          eq(cols.userId, ownerUserId),
          inArray(cols.baselineId, Array.from(rowIds))
        )
      )) as Array<Record<string, unknown>>;
    const byBaseline = new Map<number, Array<Record<string, unknown>>>();
    for (const f of forks) {
      const b = f.baselineId as number;
      if (!byBaseline.has(b)) byBaseline.set(b, []);
      byBaseline.get(b)!.push(f);
    }
    for (const [b, list] of Array.from(byBaseline)) {
      const copy = pickCopy(list);
      if (copy) copies.set(`${table}:${b}`, copy);
    }
  }
  if (copies.size === 0) return { offers: [], ignored: [] };

  // The chains: changes after each copy was made, per field / part.
  const chains = new Map<string, Chain>();
  for (const c of logged) {
    const table = tableFromName(c.targetTable);
    if (!table) continue;
    if (
      c.kind === "field" &&
      starterFieldKind(table, c.field ?? "") !== "offer"
    )
      continue;
    const copy = copies.get(`${table}:${c.targetRowId}`);
    if (!copy) continue;
    const madeFrom = (copy.baselineVersion as number | null) ?? 0;
    if (c.version <= madeFrom) continue;
    const { key, kind } = offerKey(c);
    if (!chains.has(key))
      chains.set(key, {
        key,
        kind,
        table,
        rowId: c.targetRowId,
        field: kind === "part" || kind === "modifier" ? null : c.field,
        childRefId: c.childRefId,
        changes: [],
      });
    chains.get(key)!.changes.push(c);
  }
  if (chains.size === 0) return { offers: [], ignored: [] };

  // This shop's answers to those changes.
  const ids = Array.from(chains.values()).flatMap(ch =>
    ch.changes.map(c => c.id)
  );
  const answers = new Map<number, "accepted" | "ignored">();
  for (const a of await handle
    .select()
    .from(starterOfferAnswers)
    .where(
      and(
        eq(starterOfferAnswers.companyOwnerUserId, ownerUserId),
        inArray(starterOfferAnswers.changeId, ids)
      )
    ))
    answers.set(a.changeId, a.answer);

  // The copies' recipe lines and modifier links, for part offers.
  const asmCopyIds = Array.from(chains.values())
    .filter(ch => ch.kind !== "field")
    .map(ch => copies.get(`assemblies:${ch.rowId}`)?.id as number)
    .filter(id => id !== undefined);
  const lines = asmCopyIds.length
    ? await handle
        .select()
        .from(assemblyMaterials)
        .where(inArray(assemblyMaterials.assemblyId, asmCopyIds))
    : [];
  const links = asmCopyIds.length
    ? await handle
        .select()
        .from(assemblyModifiers)
        .where(inArray(assemblyModifiers.assemblyId, asmCopyIds))
    : [];
  // A part may be named by the shared id or by this shop's own copy of it.
  const partIdentity = await identities(
    ownerUserId,
    "materials",
    lines.map(l => l.materialId)
  );
  const modIdentity = await identities(
    ownerUserId,
    "modifiers",
    links.map(l => l.modifierId)
  );

  // Reference fields compare by the SHARED row they mean (a copy's fork id
  // and the shared id are one choice).
  const refIdentity = new Map<StarterTable, Map<number, number>>();
  for (const ch of Array.from(chains.values())) {
    if (ch.kind !== "field" || !ch.field) continue;
    const refTable = STARTER_REFERENCES[ch.table]?.[ch.field];
    if (!refTable) continue;
    const v = copies.get(`${ch.table}:${ch.rowId}`)?.[ch.field];
    if (typeof v !== "number") continue;
    if (!refIdentity.has(refTable)) refIdentity.set(refTable, new Map());
    refIdentity.get(refTable)!.set(v, v);
  }
  for (const [refTable, m] of Array.from(refIdentity)) {
    const found = await identities(ownerUserId, refTable, Array.from(m.keys()));
    refIdentity.set(refTable, found);
  }

  const childNames = await partNames(Array.from(chains.values()));

  const listed: StarterOffer[] = [];
  const ignored: StarterOffer[] = [];
  for (const ch of Array.from(chains.values())) {
    const copy = copies.get(`${ch.table}:${ch.rowId}`)!;
    let yours: unknown;
    let same: (a: unknown, b: unknown) => boolean = sameStarterValue;
    if (ch.kind === "field") {
      yours = copy[ch.field!];
      const refTable = STARTER_REFERENCES[ch.table]?.[ch.field!];
      if (refTable && typeof yours === "number")
        yours = refIdentity.get(refTable)?.get(yours) ?? yours;
    } else if (ch.kind === "modifier") {
      const present = links.some(
        l =>
          l.assemblyId === copy.id &&
          (modIdentity.get(l.modifierId) ?? l.modifierId) === ch.childRefId
      );
      yours = present ? true : null;
    } else {
      const line = lines.find(
        l =>
          l.assemblyId === copy.id &&
          (partIdentity.get(l.materialId) ?? l.materialId) === ch.childRefId
      );
      if (ch.kind === "part") {
        yours = lineOf(line);
        same = (a, b) => (a === null || b === null ? a === b : sameLine(a, b));
      } else {
        yours = line
          ? (line as Record<string, unknown>)[ch.field!]
          : // The shop removed this part: whatever BidRidge does to its
            // quantity is not "the old value" of anything the shop holds.
            { removed: true };
      }
    }
    const chain: LoggedOfferChange[] = ch.changes.map(c => ({
      id: c.id,
      oldValue: valueOf(c.oldValue),
      newValue: valueOf(c.newValue),
      answer: answers.get(c.id) ?? null,
    }));
    const collapsed = collapseOffer(chain, yours, same);
    if (!collapsed || collapsed.bucket === "nothing") continue;
    const last = ch.changes[ch.changes.length - 1];
    const offer: StarterOffer = {
      key: ch.key,
      table: ch.table,
      rowId: ch.rowId,
      copyId: copy.id as number,
      itemName: String(copy.name ?? copy.label ?? `#${ch.rowId}`),
      kind: ch.kind,
      field: ch.field,
      childRefId: ch.kind === "field" ? null : ch.childRefId,
      childName:
        ch.kind === "field"
          ? null
          : (childNames.get(
              `${ch.kind === "modifier" ? "m" : "p"}:${ch.childRefId}`
            ) ?? null),
      yours,
      base: collapsed.base,
      latest: collapsed.latest,
      latestExample: exampleOf(last.newValue),
      bucket: collapsed.bucket,
      latestChangeId: collapsed.latestChangeId,
      steps: ch.changes.map(c => ({
        changeId: c.id,
        from: valueOf(c.oldValue),
        to: valueOf(c.newValue),
        at: c.createdAt,
      })),
      unansweredIds: collapsed.unansweredIds,
      answer: collapsed.answer === "ignored" ? "ignored" : null,
      changedAt: last.createdAt,
      recountsDrafts:
        ch.kind === "field" && recountsDrafts(ch.table, ch.field ?? ""),
      draftBidIds: [],
    };
    (offer.answer === "ignored" ? ignored : listed).push(offer);
  }

  await attachDrafts(ownerUserId, [...listed, ...ignored]);
  const order = (a: StarterOffer, b: StarterOffer) =>
    b.latestChangeId - a.latestChangeId;
  return { offers: listed.sort(order), ignored: ignored.sort(order) };
}

/**
 * id → the SHARED id it stands for: a shop's own fork answers with its
 * `baselineId`; anything else with itself.
 */
async function identities(
  ownerUserId: number,
  table: StarterTable,
  ids: number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return out;
  const cols = starterColumnsOf(table);
  const rows = (await (await database())
    .select({ id: cols.id, userId: cols.userId, baselineId: cols.baselineId })
    .from(starterTableOf(table))
    .where(inArray(cols.id, unique))) as Array<{
    id: number;
    userId: number | null;
    baselineId: number | null;
  }>;
  for (const id of unique) out.set(id, id);
  for (const r of rows)
    if (r.userId === ownerUserId && r.baselineId !== null)
      out.set(r.id, r.baselineId);
  return out;
}

async function partNames(chains: Chain[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const matIds = chains
    .filter(c => c.kind === "part" || c.kind === "partField")
    .map(c => c.childRefId!)
    .filter(Boolean);
  const modIds = chains
    .filter(c => c.kind === "modifier")
    .map(c => c.childRefId!)
    .filter(Boolean);
  const handle = await database();
  if (matIds.length)
    for (const m of await handle
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(inArray(materials.id, Array.from(new Set(matIds)))))
      out.set(`p:${m.id}`, m.name);
  if (modIds.length)
    for (const m of await handle
      .select({ id: modifiers.id, name: modifiers.name })
      .from(modifiers)
      .where(inArray(modifiers.id, Array.from(new Set(modIds)))))
      out.set(`m:${m.id}`, m.name);
  return out;
}

// ─── Which Drafts re-count (§ 2.4) ───────────────────────────────────────────

/** The material columns a run type names (what its runs count). */
const RUN_TYPE_MATERIAL_COLUMNS = Object.keys(
  STARTER_REFERENCES.runTypes ?? {}
);

/**
 * The shop's UNLOCKED Drafts each re-counting offer would move, read the way
 * the takeoff reads them: a run's type is the one its stored id resolves to
 * (a shared id means this shop's live copy, if it has one); a material is
 * "this one" when it is the shared row or this shop's copy of it.
 */
async function attachDrafts(ownerUserId: number, offers: StarterOffer[]) {
  const wanted = offers.filter(o => o.recountsDrafts);
  if (wanted.length === 0) return;
  const handle = await database();
  const drafts = await handle
    .select({ id: bids.id })
    .from(bids)
    .where(
      and(
        eq(bids.userId, ownerUserId),
        eq(bids.status, "Draft"),
        isNull(bids.quantitiesLockedAt),
        isNull(bids.archivedAt)
      )
    );
  if (drafts.length === 0) return;
  const draftIds = drafts.map(d => d.id);

  const runs = await handle
    .select({ bidId: takeoffRuns.bidId, runTypeId: takeoffRuns.runTypeId })
    .from(takeoffRuns)
    .where(inArray(takeoffRuns.bidId, draftIds));
  const groups = await handle
    .select({
      bidId: takeoffGroups.bidId,
      assemblyId: takeoffGroups.assemblyId,
    })
    .from(takeoffGroups)
    .where(inArray(takeoffGroups.bidId, draftIds));

  // Each run's EFFECTIVE type: its stored row, or this shop's live copy of it.
  const storedTypeIds = Array.from(
    new Set(
      runs.map(r => r.runTypeId).filter((id): id is number => id !== null)
    )
  );
  const typeRows = storedTypeIds.length
    ? await handle
        .select()
        .from(takeoffRunTypes)
        .where(
          or(
            inArray(takeoffRunTypes.id, storedTypeIds),
            and(
              eq(takeoffRunTypes.userId, ownerUserId),
              inArray(takeoffRunTypes.baselineId, storedTypeIds)
            )
          )
        )
    : [];
  const effectiveType = new Map<number, (typeof typeRows)[number]>();
  for (const id of storedTypeIds) {
    const direct = typeRows.find(t => t.id === id);
    const fork =
      direct && direct.userId === null
        ? pickCopy(
            typeRows.filter(
              t => t.userId === ownerUserId && t.baselineId === id
            ) as unknown as Array<Record<string, unknown>>
          )
        : undefined;
    const row = (fork as (typeof typeRows)[number] | undefined) ?? direct;
    if (row) effectiveType.set(id, row);
  }

  /** The shared id and every id of this shop's copies of it. */
  const forksOf = async (table: StarterTable, sharedId: number) => {
    const cols = starterColumnsOf(table);
    const rows = (await handle
      .select({ id: cols.id })
      .from(starterTableOf(table))
      .where(
        and(eq(cols.userId, ownerUserId), eq(cols.baselineId, sharedId))
      )) as Array<{ id: number }>;
    return new Set([sharedId, ...rows.map(r => r.id)]);
  };

  for (const offer of wanted) {
    const hit = new Set<number>();
    if (offer.table === "runTypes") {
      const same = await forksOf("runTypes", offer.rowId);
      for (const r of runs) {
        const eff =
          r.runTypeId === null ? undefined : effectiveType.get(r.runTypeId);
        if (eff && (same.has(eff.id) || same.has(eff.baselineId ?? -1)))
          hit.add(r.bidId);
      }
    } else if (offer.table === "materials") {
      const same = await forksOf("materials", offer.rowId);
      for (const r of runs) {
        const eff =
          r.runTypeId === null ? undefined : effectiveType.get(r.runTypeId);
        if (!eff) continue;
        const row = eff as unknown as Record<string, unknown>;
        if (
          RUN_TYPE_MATERIAL_COLUMNS.some(col => {
            const v = row[col];
            return typeof v === "number" && same.has(v);
          })
        )
          hit.add(r.bidId);
      }
    } else if (offer.table === "assemblies") {
      const same = await forksOf("assemblies", offer.rowId);
      for (const g of groups)
        if (g.assemblyId !== null && same.has(g.assemblyId)) hit.add(g.bidId);
    }
    offer.draftBidIds = Array.from(hit).sort((a, b) => a - b);
  }
}

/** The Drafts an Accept of these offers re-counts, each counted once. */
export function draftsRecounted(offers: readonly StarterOffer[]): number[] {
  return Array.from(
    new Set(offers.flatMap(o => (o.recountsDrafts ? o.draftBidIds : [])))
  ).sort((a, b) => a - b);
}

// ─── Answers ─────────────────────────────────────────────────────────────────

export type OfferPick = { key: string; latestChangeId: number };

/** The picked offers, as they are NOW — or a refusal if any moved on. */
function picked(
  read: StarterOffersRead,
  picks: readonly OfferPick[],
  from: "offers" | "ignored" | "both"
): StarterOffer[] {
  const pool =
    from === "offers"
      ? read.offers
      : from === "ignored"
        ? read.ignored
        : [...read.offers, ...read.ignored];
  return picks.map(p => {
    const offer = pool.find(o => o.key === p.key);
    if (!offer)
      throw new StarterOfferRefused(
        "That update is no longer waiting — the list was out of date. Nothing was changed."
      );
    if (offer.latestChangeId !== p.latestChangeId)
      throw new StarterOfferRefused(
        `BidRidge changed "${offer.itemName}" again since you looked. Nothing was changed — check the new value first.`
      );
    return offer;
  });
}

async function answer(
  ownerUserId: number,
  actorUserId: number,
  changeIds: number[],
  value: "accepted" | "ignored"
) {
  if (changeIds.length === 0) return;
  await (
    await database()
  )
    .insert(starterOfferAnswers)
    .values(
      changeIds.map(changeId => ({
        companyOwnerUserId: ownerUserId,
        changeId,
        answer: value,
        answeredByUserId: actorUserId,
      }))
    )
    .onDuplicateKeyUpdate({
      set: {
        answer: value,
        answeredByUserId: actorUserId,
        answeredAt: sql`CURRENT_TIMESTAMP`,
      },
    });
}

/** Write one offer's latest value into the shop's copy. */
async function writeIntoCopy(ownerUserId: number, offer: StarterOffer) {
  const handle = await database();
  if (offer.kind === "field") {
    const table = offer.table;
    const cols = starterColumnsOf(table);
    const [copy] = (await handle
      .select()
      .from(starterTableOf(table))
      .where(and(eq(cols.id, offer.copyId), eq(cols.userId, ownerUserId)))
      .for("update")) as Array<Record<string, unknown>>;
    if (!copy) throw new StarterOfferRefused("Your copy of that item is gone.");
    const tag = exampleTagOf(table, offer.field!);
    const tagValue =
      tag === null
        ? null
        : (offer.latestExample ??
          exampleTagAfter(table, offer.field!, offer.latest, copy)?.value ??
          null);
    const set: Record<string, unknown> = { [offer.field!]: offer.latest };
    if (tag && tagValue !== null) set[tag] = tagValue;
    if ("updatedAt" in cols) set.updatedAt = new Date();
    await handle
      .update(starterTableOf(table))
      .set(set)
      .where(and(eq(cols.id, offer.copyId), eq(cols.userId, ownerUserId)));
    return;
  }

  // Recipes: the shop's copy of the assembly.
  const [asm] = await handle
    .select({ id: assemblies.id })
    .from(assemblies)
    .where(
      and(eq(assemblies.id, offer.copyId), eq(assemblies.userId, ownerUserId))
    );
  if (!asm)
    throw new StarterOfferRefused("Your copy of that assembly is gone.");
  const ref = offer.childRefId!;

  if (offer.kind === "modifier") {
    const mine = await handle
      .select()
      .from(assemblyModifiers)
      .where(eq(assemblyModifiers.assemblyId, asm.id));
    const ids = await identities(
      ownerUserId,
      "modifiers",
      mine.map(l => l.modifierId)
    );
    const present = mine.filter(
      l => (ids.get(l.modifierId) ?? l.modifierId) === ref
    );
    if (offer.latest === true && present.length === 0) {
      const last = Math.max(-1, ...mine.map(l => l.sortOrder ?? 0));
      await handle
        .insert(assemblyModifiers)
        .values({ assemblyId: asm.id, modifierId: ref, sortOrder: last + 1 });
    } else if (offer.latest !== true && present.length > 0) {
      await handle.delete(assemblyModifiers).where(
        inArray(
          assemblyModifiers.id,
          present.map(l => l.id)
        )
      );
    }
    return;
  }

  const mine = await handle
    .select()
    .from(assemblyMaterials)
    .where(eq(assemblyMaterials.assemblyId, asm.id));
  const ids = await identities(
    ownerUserId,
    "materials",
    mine.map(l => l.materialId)
  );
  const present = mine.filter(
    l => (ids.get(l.materialId) ?? l.materialId) === ref
  );

  if (offer.kind === "partField") {
    if (present.length !== 1)
      throw new StarterOfferRefused(
        `"${offer.childName ?? "That part"}" is not on your "${offer.itemName}" any more, so its quantity can't be updated. Nothing was changed.`
      );
    await handle
      .update(assemblyMaterials)
      .set({ [offer.field!]: offer.latest })
      .where(eq(assemblyMaterials.id, present[0].id));
    return;
  }

  // A whole part: added, removed, or replaced line.
  const line = offer.latest as Record<string, unknown> | null;
  if (line === null) {
    if (present.length > 0)
      await handle.delete(assemblyMaterials).where(
        inArray(
          assemblyMaterials.id,
          present.map(l => l.id)
        )
      );
    return;
  }
  const values: Record<string, unknown> = {};
  for (const f of PART_LINE_FIELDS) values[f] = line[f] ?? null;
  if (values.isBranchWhip === null) values.isBranchWhip = false;
  if (present.length > 0) {
    await handle
      .update(assemblyMaterials)
      .set(values)
      .where(eq(assemblyMaterials.id, present[0].id));
    return;
  }
  const last = Math.max(-1, ...mine.map(l => l.sortOrder ?? 0));
  await handle.insert(assemblyMaterials).values({
    assemblyId: asm.id,
    materialId: ref,
    qty: String(values.qty),
    overrideLaborHours: values.overrideLaborHours as string | null,
    isBranchWhip: values.isBranchWhip as boolean,
    sortOrder: last + 1,
  });
}

/**
 * Accept the picked offers, in ONE transaction: any refusal writes nothing.
 * `allowOwnValue` is the single-offer button on a row the shop changed
 * itself; "Accept all" never passes it (Q18), and an own-value row in its
 * list is refused rather than silently skipped.
 */
export async function acceptStarterOffers(input: {
  ownerUserId: number;
  actorUserId: number;
  picks: OfferPick[];
  allowOwnValue: boolean;
}): Promise<{ accepted: number; draftsRecounted: number[] }> {
  if (input.picks.length === 0) return { accepted: 0, draftsRecounted: [] };
  return db.inOneTransaction(async () => {
    const read = await starterOffersFor(input.ownerUserId);
    const offers = picked(read, input.picks, "both");
    for (const o of offers)
      if (o.bucket === "own-value" && !input.allowOwnValue)
        throw new StarterOfferRefused(
          `"${o.itemName}" holds your own value; accept it on its own. Nothing was changed.`
        );
    for (const o of offers) {
      await writeIntoCopy(input.ownerUserId, o);
      await answer(
        input.ownerUserId,
        input.actorUserId,
        o.steps.map(s => s.changeId),
        "accepted"
      );
    }
    return {
      accepted: offers.length,
      draftsRecounted: draftsRecounted(offers),
    };
  });
}

/** Ignore: an answer only. Nothing in the shop's library moves. */
export async function ignoreStarterOffers(input: {
  ownerUserId: number;
  actorUserId: number;
  picks: OfferPick[];
}): Promise<{ ignored: number }> {
  return db.inOneTransaction(async () => {
    const read = await starterOffersFor(input.ownerUserId);
    const offers = picked(read, input.picks, "offers");
    for (const o of offers)
      await answer(
        input.ownerUserId,
        input.actorUserId,
        o.unansweredIds,
        "ignored"
      );
    return { ignored: offers.length };
  });
}

/** Un-ignore: the ignored answers go, and the offer is back in the list. */
export async function unignoreStarterOffers(input: {
  ownerUserId: number;
  picks: OfferPick[];
}): Promise<{ restored: number }> {
  return db.inOneTransaction(async () => {
    const read = await starterOffersFor(input.ownerUserId);
    const offers = picked(read, input.picks, "ignored");
    const ids = offers.flatMap(o => o.steps.map(s => s.changeId));
    if (ids.length > 0)
      await (await database())
        .delete(starterOfferAnswers)
        .where(
          and(
            eq(starterOfferAnswers.companyOwnerUserId, input.ownerUserId),
            eq(starterOfferAnswers.answer, "ignored"),
            inArray(starterOfferAnswers.changeId, ids)
          )
        );
    return { restored: offers.length };
  });
}
