/**
 * The extra companies the signup race left behind — found, checked empty, and
 * (only when asked) removed.
 *
 * Live user 3036 got companies #4–#8 in one second on 2026-10-14
 * (references/signup-race-plan.md). The race is fixed in
 * `createPersonalCompany`; this is the one-off repair for what it already
 * made. The owner decides whether it runs (next-live-release-plan.md,
 * "Night prep 2026-10-14").
 *
 * An owner's LOWEST-id company is the one they work in (`findMembership`
 * falls back to the oldest membership), so it is always kept. Every other
 * company they own is a candidate, and is removable only if it holds
 * NOTHING except its own owner membership:
 *
 *   - `company_members`: exactly one row — this owner, role owner;
 *   - every OTHER column with a foreign key into `companies.id`: zero rows.
 *     Read from information_schema, not listed here, so a table added later
 *     cannot be missed — same choice as the seed's duplicate repair (db.ts);
 *   - `users.activeCompanyId` (not a foreign key): nobody points at it.
 *
 * Data rows are keyed on the owner's user id, not the company, so removing an
 * empty company moves no bid, material or plan. A candidate that fails any
 * check is reported with the reason and never removed.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type RaceCompany = {
  companyId: number;
  removable: boolean;
  /** Why not, when not removable. Empty when removable. */
  reasons: string[];
};

type Executor = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function rows<T>(db: Executor, query: string): Promise<T[]> {
  const [result] = (await db.execute(sql.raw(query))) as unknown as [
    T[],
    unknown,
  ];
  return result;
}

/** Every company this owner owns except their lowest-id one, each checked. */
export async function checkRaceCompanies(
  ownerUserId: number,
  db?: Executor
): Promise<{ kept: number | null; candidates: RaceCompany[] }> {
  const exec = db ?? (await getDb());
  if (!exec) throw new Error("No database (DATABASE_URL)");
  const owner = Number(ownerUserId);

  const owned = await rows<{ id: number }>(
    exec,
    `SELECT id FROM companies WHERE ownerUserId = ${owner} ORDER BY id`
  );
  if (owned.length === 0) return { kept: null, candidates: [] };
  const [kept, ...others] = owned.map(r => Number(r.id));

  const pointers = await rows<{ tableName: string; columnName: string }>(
    exec,
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = 'companies'
        AND REFERENCED_COLUMN_NAME = 'id'`
  );

  const candidates: RaceCompany[] = [];
  for (const companyId of others) {
    const reasons: string[] = [];
    for (const p of pointers) {
      const [{ n }] = await rows<{ n: number }>(
        exec,
        `SELECT COUNT(*) AS n FROM \`${p.tableName}\` WHERE \`${p.columnName}\` = ${companyId}`
      );
      if (p.tableName === "company_members" && p.columnName === "companyId") {
        const [{ mine }] = await rows<{ mine: number }>(
          exec,
          `SELECT COUNT(*) AS mine FROM company_members
            WHERE companyId = ${companyId} AND userId = ${owner} AND role = 'owner'`
        );
        if (Number(n) !== 1 || Number(mine) !== 1)
          reasons.push(
            `company_members: ${n} row(s), ${mine} of them this owner's owner row (want exactly 1 and 1)`
          );
      } else if (Number(n) > 0) {
        reasons.push(`${p.tableName}.${p.columnName}: ${n} row(s)`);
      }
    }
    const [{ active }] = await rows<{ active: number }>(
      exec,
      `SELECT COUNT(*) AS active FROM users WHERE activeCompanyId = ${companyId}`
    );
    if (Number(active) > 0)
      reasons.push(`users.activeCompanyId: ${active} user(s) point at it`);
    candidates.push({ companyId, removable: reasons.length === 0, reasons });
  }
  return { kept, candidates };
}

/**
 * Remove exactly `expectedIds`, in one transaction, re-checking inside it.
 *
 * Refuses — removing nothing — unless the removable candidates found NOW are
 * exactly `expectedIds`: a mismatch means the plan is stale or the database is
 * not in the state it was when somebody read the dry run, and those want
 * opposite responses, so it stops rather than guessing.
 */
export async function removeRaceCompanies(
  ownerUserId: number,
  expectedIds: number[]
): Promise<{ removed: number[] }> {
  const db = await getDb();
  if (!db) throw new Error("No database (DATABASE_URL)");
  const want = [...expectedIds].map(Number).sort((a, b) => a - b);
  return db.transaction(async tx => {
    const exec = tx as unknown as Executor;
    const { candidates } = await checkRaceCompanies(ownerUserId, exec);
    const found = candidates
      .filter(c => c.removable)
      .map(c => c.companyId)
      .sort((a, b) => a - b);
    if (
      found.length !== want.length ||
      found.some((id, i) => id !== want[i]) ||
      candidates.some(c => want.includes(c.companyId) && !c.removable)
    ) {
      throw new Error(
        `Refused: expected to remove [${want.join(", ")}], but the removable ones now are [${found.join(", ")}]. Nothing removed.`
      );
    }
    const list = want.join(", ");
    await exec.execute(
      sql.raw(`DELETE FROM company_members WHERE companyId IN (${list})`)
    );
    await exec.execute(sql.raw(`DELETE FROM companies WHERE id IN (${list})`));
    return { removed: want };
  });
}
