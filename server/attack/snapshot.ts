/**
 * THE WHOLE DATABASE, BEFORE AND AFTER ONE ATTACK — and whose rows moved.
 *
 * Used by `server/crossCompanyAttack.test.ts`. An attack that "worked" does
 * not always return anything: a delete of somebody else's bid answers
 * `{ success: true }` and the only evidence is a row that is gone. So the
 * oracle is the database itself: every row of every table, read before and
 * after, and every difference classified by OWNER.
 *
 * ── How a row's owner is decided ──────────────────────────────────────────────
 * From the schema the database actually has (information_schema), not from a
 * list somebody keeps: a row with `userId` belongs to that user; a row
 * without one belongs to whoever owns the row its foreign keys point at,
 * repeated until nothing changes. `companies` belong to `ownerUserId`, a
 * `users` row to itself. A row with `userId` NULL in a library table is the
 * SHARED starter — owned by every company, so no company may change it.
 */
import { createConnection, type Connection } from "mysql2/promise";

type Row = Record<string, unknown>;
export type Snapshot = Map<string, Map<string, Row>>;
type Fk = { table: string; column: string; parent: string };

/** Tables nobody's attack can be judged on: bookkeeping that moves by itself. */
const IGNORED = new Set(["__drizzle_migrations", "ai_service_status"]);

export class Db {
  private constructor(
    private conn: Connection,
    readonly tables: Map<string, { columns: string[]; pk: string[] }>,
    readonly fks: Fk[]
  ) {}

  static async open(url: string): Promise<Db> {
    const conn = await createConnection(url);
    const schema = new URL(url).pathname.replace(/^\//, "");
    const [cols] = (await conn.query(
      `SELECT table_name AS t, column_name AS c, column_key AS k
         FROM information_schema.columns WHERE table_schema = ?
        ORDER BY table_name, ordinal_position`,
      [schema]
    )) as unknown as [{ t: string; c: string; k: string }[]];
    const tables = new Map<string, { columns: string[]; pk: string[] }>();
    for (const { t, c, k } of cols as { t: string; c: string; k: string }[]) {
      if (IGNORED.has(t)) continue;
      const entry = tables.get(t) ?? { columns: [], pk: [] };
      entry.columns.push(c);
      if (k === "PRI") entry.pk.push(c);
      tables.set(t, entry);
    }
    const [fkRows] = (await conn.query(
      `SELECT table_name AS t, column_name AS c, referenced_table_name AS r
         FROM information_schema.key_column_usage
        WHERE table_schema = ? AND referenced_table_name IS NOT NULL`,
      [schema]
    )) as unknown as [{ t: string; c: string; r: string }[]];
    const fks = fkRows.map(f => ({ table: f.t, column: f.c, parent: f.r }));
    return new Db(conn, tables, fks);
  }

  async close() {
    await this.conn.end();
  }

  async snapshot(): Promise<Snapshot> {
    const snap: Snapshot = new Map();
    for (const [table, { pk }] of Array.from(this.tables)) {
      const [rows] = (await this.conn.query(
        `SELECT * FROM \`${table}\``
      )) as unknown as [Row[]];
      const byKey = new Map<string, Row>();
      for (const row of Array.from(rows)) {
        const key = pk.length
          ? pk.map(c => String(row[c])).join("|")
          : JSON.stringify(row);
        byKey.set(key, row);
      }
      snap.set(table, byKey);
    }
    return snap;
  }

  async query(sql: string, params: unknown[] = []) {
    const [rows] = await this.conn.query(sql, params);
    return rows as Row[];
  }
}

/**
 * Owner of every row: a user id, "shared" (the starter, userId NULL in a
 * table that has the column), or undefined (global bookkeeping with no owner).
 */
export function owners(db: Db, snap: Snapshot): Map<string, number | "shared"> {
  const owner = new Map<string, number | "shared">();
  const key = (table: string, id: unknown) => `${table}#${String(id)}`;
  for (const [table, rows] of Array.from(snap)) {
    const { columns } = db.tables.get(table)!;
    for (const [pk, row] of Array.from(rows)) {
      const k = key(table, pk);
      if (table === "users") owner.set(k, Number(row.id));
      else if (table === "companies") owner.set(k, Number(row.ownerUserId));
      else if (columns.includes("userId"))
        owner.set(k, row.userId == null ? "shared" : Number(row.userId));
      else if (columns.includes("dataUserId") && row.dataUserId != null)
        owner.set(k, Number(row.dataUserId));
      else if (columns.includes("companyUserId") && row.companyUserId != null)
        owner.set(k, Number(row.companyUserId));
      else if (
        columns.includes("companyOwnerUserId") &&
        row.companyOwnerUserId != null
      )
        owner.set(k, Number(row.companyOwnerUserId));
    }
  }
  // Rows with no owner column inherit from a parent, to a fixed point.
  // A company parent outranks a shared one: a kit holding a starter assembly
  // is the company's kit row, not a starter row.
  const inherited = new Set<string>();
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const fk of db.fks) {
      const rows = snap.get(fk.table);
      if (!rows) continue;
      for (const [pk, row] of Array.from(rows)) {
        const k = key(fk.table, pk);
        const current = owner.get(k);
        if (current !== undefined && !inherited.has(k)) continue;
        if (typeof current === "number") continue;
        const parentOwner = owner.get(key(fk.parent, row[fk.column]));
        if (parentOwner === undefined || parentOwner === current) continue;
        if (current === "shared" && parentOwner === "shared") continue;
        owner.set(k, parentOwner);
        inherited.add(k);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return owner;
}

export type Finding = {
  table: string;
  key: string;
  change: "added" | "changed" | "removed";
  why: string;
  before?: Row;
  after?: Row;
};

/**
 * What moved between two snapshots that the ATTACKER had no right to move.
 *
 * `attacker` is the set of user ids whose rows the caller may change
 * (themselves, and — for a stranger — their own company's owner, which is
 * themselves). A change to any other owner's row, a change to a shared row,
 * and a NEW row that points at somebody else's row are findings.
 */
export function judge(
  db: Db,
  before: Snapshot,
  after: Snapshot,
  attacker: ReadonlySet<number>
): Finding[] {
  const ownBefore = owners(db, before);
  const ownAfter = owners(db, after);
  const findings: Finding[] = [];
  const mine = (o: number | "shared" | undefined) =>
    typeof o === "number" && attacker.has(o);
  for (const [table, rowsAfter] of Array.from(after)) {
    const rowsBefore = before.get(table) ?? new Map();
    for (const [pk, row] of Array.from(rowsAfter)) {
      const k = `${table}#${pk}`;
      const old = rowsBefore.get(pk);
      if (!old) {
        // New. Fine when it is the attacker's and points only at what the
        // attacker owns or what is shared.
        const o = ownAfter.get(k);
        if (o !== undefined && !mine(o)) {
          findings.push({
            table,
            key: pk,
            change: "added",
            why: `new row owned by ${o}`,
            after: row,
          });
          continue;
        }
        for (const fk of db.fks.filter(f => f.table === table)) {
          const value = row[fk.column];
          if (value == null) continue;
          const parent = ownAfter.get(`${fk.parent}#${value}`);
          if (parent !== undefined && parent !== "shared" && !mine(parent))
            findings.push({
              table,
              key: pk,
              change: "added",
              why: `${fk.column} points at ${fk.parent} ${String(value)} owned by ${parent}`,
              after: row,
            });
        }
        continue;
      }
      if (JSON.stringify(old) === JSON.stringify(row)) continue;
      const o = ownBefore.get(k);
      if (mine(o)) {
        // Their own row — but it must not be re-pointed at somebody else's.
        for (const fk of db.fks.filter(f => f.table === table)) {
          const value = row[fk.column];
          if (value == null || value === old[fk.column]) continue;
          const parent = ownAfter.get(`${fk.parent}#${value}`);
          if (parent !== undefined && parent !== "shared" && !mine(parent))
            findings.push({
              table,
              key: pk,
              change: "changed",
              why: `own row re-pointed: ${fk.column} -> ${fk.parent} ${String(value)} owned by ${parent}`,
              before: old,
              after: row,
            });
        }
        continue;
      }
      findings.push({
        table,
        key: pk,
        change: "changed",
        why: `row owned by ${String(o)}`,
        before: old,
        after: row,
      });
    }
    for (const [pk, row] of Array.from(rowsBefore)) {
      if (rowsAfter.has(pk)) continue;
      const o = ownBefore.get(`${table}#${pk}`);
      if (mine(o)) continue;
      findings.push({
        table,
        key: pk,
        change: "removed",
        why: `row owned by ${String(o)}`,
        before: row,
      });
    }
  }
  return findings;
}

/** The ids each user owns per table — the attacker's target list. */
export function idsOwnedBy(
  db: Db,
  snap: Snapshot,
  user: number
): Record<string, number[]> {
  const own = owners(db, snap);
  const out: Record<string, number[]> = {};
  for (const [table, rows] of Array.from(snap)) {
    const { pk } = db.tables.get(table)!;
    if (pk.length !== 1 || pk[0] !== "id") continue;
    for (const [key] of Array.from(rows))
      if (own.get(`${table}#${key}`) === user)
        (out[table] ??= []).push(Number(key));
  }
  for (const ids of Object.values(out)) ids.sort((a, b) => b - a);
  return out;
}
