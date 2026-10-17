/**
 * The AI correction log — the ONE door that writes `ai_correction_log`
 * (0108). Every time somebody accepts, dismisses, re-labels, deletes,
 * re-counts or tags a mark the plan reader proposed, one row goes here.
 *
 * Plan: `ai-correction-log-plan.md` (branch a-plans) and
 * `references/stage-4-safety-plan.md` § 3. The rules it follows:
 *
 * - **Never in the way of the edit.** Called AFTER the edit has returned,
 *   not awaited by the response, not in the edit's transaction; every
 *   failure is a `console.warn` naming the action and ids — never a label,
 *   which can name a project. A lost log row costs data, never the user's
 *   work. `server/aiCorrections.test.ts` makes the insert throw and checks
 *   the delete still happened.
 * - **Nothing reads it.** No router query, no screen, no export: a terms page
 *   has to exist before even the anonymised half is shared (todo.md).
 *   `server/aiCorrectionsNoReader.test.ts` fails if any other file names the
 *   table.
 * - **This file does the anonymising**, so no call site can forget to strip
 *   something: the shared half carries a category, never a company's
 *   assembly name; a month, never a time; a sheet's letter, never its
 *   number or title.
 * - **A company that has said no logs nothing** — see `loggingOn`.
 *
 * The cut-out picture of the symbol (plan § 5) needs the browser, which has
 * the drawn page; that client half lives on the Plans screen and is not
 * built yet, so every row says `cropStatus = "unavailable"` rather than
 * leaving the picture silently absent (todo.md).
 */
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  aiCorrectionLog,
  assemblies,
  bidPdfSheetIdentity,
  bidPdfSheets,
  planCopilotFindings,
  planCopilotRuns,
  takeoffStamps,
  type AI_CORRECTION_ACTIONS,
  type PlanCopilotFinding,
} from "../drizzle/schema";
import { getDb } from "./db";

export type AiCorrectionAction = (typeof AI_CORRECTION_ACTIONS)[number];

/** One correction, as a call site knows it. */
export type AiCorrectionEvent = {
  action: AiCorrectionAction;
  findingId: number;
  /** The mark, when there is one (a dismissed proposal never had one). */
  stampId?: number | null;
  /** What the user changed it to (location, symbolLinkId, assemblyId…). */
  userValue?: Record<string, unknown> | null;
  /** The assembly the user chose instead, for its name and category. */
  userAssemblyId?: number | null;
  /**
   * What the AI said, when the edit has already overwritten it on the
   * finding (`planCopilot.correct`). Otherwise the finding's row is read.
   */
  aiSaid?: Pick<
    PlanCopilotFinding,
    "assemblyId" | "assemblyName" | "confidence" | "score"
  >;
};

/** Who did it: the company the rows belong to, and the person. */
export type AiCorrectionWho = { dataUserId: number; actorUserId: number };

type Row = typeof aiCorrectionLog.$inferInsert;

/** "DUPLEX  Recept" → "duplex recept", cut to 40 (owner Q4, 2026-09-29). */
export function normaliseLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40);
}

/** "E2.01" → "E", "FP-1" → "FP"; nothing that is not a leading letter run. */
export function sheetDiscipline(sheetNumber: string | null): string | null {
  const m = /^[A-Za-z]{1,8}/.exec((sheetNumber ?? "").trim());
  return m ? m[0].toUpperCase() : null;
}

/** YYYY-MM in UTC: exact times across rows can re-identify a company. */
export function monthOf(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** Random, and not derivable from any other id (plan § 4). */
function newShareId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Whether this company's corrections are logged.
 *
 * The Settings opt-out needs a column (`companies.aiCorrectionLogOffAt`),
 * drafted for Track A in `references/track-a-handoff.md`; track branches
 * cannot touch `drizzle/`. Until it exists nobody CAN say no, so this
 * answers yes — and the opt-out is built on `c-ai-log-optout`, waiting on
 * that migration, which must land with this file before the first outside
 * invite.
 */
async function loggingOn(_dataUserId: number): Promise<boolean> {
  return true;
}

async function insertRows(rows: Row[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(aiCorrectionLog).values(rows);
}

let writeRows: (rows: Row[]) => Promise<void> = insertRows;

/** Tests only: make the write fail, to prove the edit does not care. */
export function setAiCorrectionWriterForTests(
  writer: ((rows: Row[]) => Promise<void>) | null
): void {
  writeRows = writer ?? insertRows;
}

const inFlight = new Set<Promise<void>>();

/** Tests only: wait for every log write started so far. */
export async function settleAiCorrections(): Promise<void> {
  await Promise.all(Array.from(inFlight));
}

/**
 * Log these corrections. Returns at once; the write happens behind the
 * response and can never throw to the caller.
 */
export function logAiCorrections(
  who: AiCorrectionWho,
  events: readonly AiCorrectionEvent[] | Promise<readonly AiCorrectionEvent[]>,
  now: Date = new Date()
): void {
  if (Array.isArray(events) && events.length === 0) return;
  const work = Promise.resolve(events).then(list =>
    list.length === 0
      ? undefined
      : buildAndWrite(who, list, now).catch(error => {
          console.warn(
            `[aiCorrections] not logged: ${list[0].action} x${list.length}, ` +
              `company ${who.dataUserId}, findings ${list
                .map(e => e.findingId)
                .slice(0, 10)
                .join(",")}: ${
                error instanceof Error ? error.message : "error"
              }`
          );
        })
  );
  inFlight.add(work);
  void work.finally(() => inFlight.delete(work));
}

async function buildAndWrite(
  who: AiCorrectionWho,
  events: readonly AiCorrectionEvent[],
  now: Date
): Promise<void> {
  if (!(await loggingOn(who.dataUserId))) return;
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Scoped by company: a finding id from another company finds nothing and
  // logs nothing, so no row can name a finding this company does not own.
  const findingIds = Array.from(new Set(events.map(e => e.findingId)));
  const findings = await db
    .select({
      id: planCopilotFindings.id,
      rawLabel: planCopilotFindings.rawLabel,
      assemblyId: planCopilotFindings.assemblyId,
      assemblyName: planCopilotFindings.assemblyName,
      confidence: planCopilotFindings.confidence,
      score: planCopilotFindings.score,
      x: planCopilotFindings.x,
      y: planCopilotFindings.y,
      model: planCopilotRuns.model,
      bidId: planCopilotRuns.bidId,
      sheetId: planCopilotRuns.sheetId,
    })
    .from(planCopilotFindings)
    .innerJoin(
      planCopilotRuns,
      eq(planCopilotRuns.id, planCopilotFindings.runId)
    )
    .where(
      and(
        inArray(planCopilotFindings.id, findingIds),
        eq(planCopilotFindings.userId, who.dataUserId)
      )
    );
  if (findings.length === 0) return;
  const byFinding = new Map(findings.map(f => [f.id, f]));

  const assemblyIds = Array.from(
    new Set(
      [
        ...findings.map(f => f.assemblyId),
        ...events.map(e => e.aiSaid?.assemblyId ?? null),
        ...events.map(e => e.userAssemblyId ?? null),
      ].filter((id): id is number => id !== null)
    )
  );
  const assemblyRows =
    assemblyIds.length === 0
      ? []
      : await db
          .select({
            id: assemblies.id,
            name: assemblies.name,
            category: assemblies.category,
            trade: assemblies.trade,
          })
          .from(assemblies)
          .where(
            and(
              inArray(assemblies.id, assemblyIds),
              eq(assemblies.userId, who.dataUserId)
            )
          );
  const assemblyById = new Map(assemblyRows.map(a => [a.id, a]));

  const sheetIds = Array.from(new Set(findings.map(f => f.sheetId)));
  const sheetRows = await db
    .select({
      id: bidPdfSheets.id,
      sheetNumber: bidPdfSheetIdentity.sheetNumber,
    })
    .from(bidPdfSheets)
    .leftJoin(
      bidPdfSheetIdentity,
      and(
        eq(bidPdfSheetIdentity.bidPdfId, bidPdfSheets.bidPdfId),
        eq(bidPdfSheetIdentity.pageNumber, bidPdfSheets.pageNumber)
      )
    )
    .where(
      and(
        inArray(bidPdfSheets.id, sheetIds),
        eq(bidPdfSheets.userId, who.dataUserId)
      )
    );
  const disciplineBySheet = new Map(
    sheetRows.map(s => [s.id, sheetDiscipline(s.sheetNumber ?? null)])
  );

  const rows: Row[] = [];
  for (const event of events) {
    const found = byFinding.get(event.findingId);
    if (!found) continue;
    const f = event.aiSaid ? { ...found, ...event.aiSaid } : found;
    const aiAssembly =
      f.assemblyId !== null ? assemblyById.get(f.assemblyId) : undefined;
    const userAssembly =
      event.userAssemblyId != null
        ? assemblyById.get(event.userAssemblyId)
        : undefined;
    rows.push({
      // Identified half
      dataUserId: who.dataUserId,
      actorUserId: who.actorUserId,
      bidId: f.bidId,
      sheetId: f.sheetId,
      findingId: f.id,
      stampId: event.stampId ?? null,
      aiLabel: f.rawLabel,
      aiAssemblyName: f.assemblyName ?? aiAssembly?.name ?? null,
      userAssemblyName: userAssembly?.name ?? null,
      x: f.x,
      y: f.y,
      userValue: event.userValue ?? null,
      // Anonymised half
      shareId: newShareId(),
      action: event.action,
      model: f.model,
      tier: f.confidence,
      score: f.score,
      labelNormalised: normaliseLabel(f.rawLabel),
      aiKind: aiAssembly?.category ?? null,
      userKind: userAssembly?.category ?? null,
      trade: userAssembly?.trade ?? aiAssembly?.trade ?? null,
      sheetDiscipline: disciplineBySheet.get(f.sheetId) ?? null,
      month: monthOf(now),
      cropStatus: "unavailable",
    });
  }
  if (rows.length > 0) await writeRows(rows);
}

/**
 * The AI findings pointing at these marks, read BEFORE an edit that keeps
 * the marks (a delete's snapshot already lists them). Never throws: a failed
 * read means "no log row", never "no edit".
 */
export async function findingsForStamps(
  stampIds: readonly number[],
  dataUserId: number
): Promise<{ findingId: number; stampId: number }[]> {
  if (stampIds.length === 0) return [];
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        findingId: planCopilotFindings.id,
        stampId: planCopilotFindings.stampId,
      })
      .from(planCopilotFindings)
      .where(
        and(
          inArray(planCopilotFindings.stampId, Array.from(stampIds)),
          eq(planCopilotFindings.userId, dataUserId)
        )
      );
    return rows.flatMap(r =>
      r.stampId === null ? [] : [{ findingId: r.findingId, stampId: r.stampId }]
    );
  } catch (error) {
    console.warn(
      `[aiCorrections] context not read for ${stampIds.length} mark(s): ${
        error instanceof Error ? error.message : "error"
      }`
    );
    return [];
  }
}

/** The same, for every mark of one count on one sheet. Never throws. */
export async function findingsForGroupOnSheet(
  sheetId: number,
  groupId: number,
  dataUserId: number
): Promise<{ findingId: number; stampId: number }[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const stamps = await db
      .select({ id: takeoffStamps.id })
      .from(takeoffStamps)
      .where(
        and(
          eq(takeoffStamps.sheetId, sheetId),
          eq(takeoffStamps.groupId, groupId),
          eq(takeoffStamps.userId, dataUserId)
        )
      );
    return findingsForStamps(
      stamps.map(s => s.id),
      dataUserId
    );
  } catch (error) {
    console.warn(
      `[aiCorrections] context not read for count ${groupId}: ${
        error instanceof Error ? error.message : "error"
      }`
    );
    return [];
  }
}
