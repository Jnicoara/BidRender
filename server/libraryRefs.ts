/**
 * A REFERENCE TO A LIBRARY ROW MUST NAME ONE THIS COMPANY CAN SEE.
 *
 * Security sweep, 2026-10-14 (`references/security-sweep.md`). An assembly
 * line, a kit item, a run type's raceway slot and a captured symbol each
 * STORE the id of a library row. Until this file, the routes that wrote them
 * took the id as sent. Two consequences, both found by
 * `server/crossCompanyAttack.test.ts`:
 *
 *   • READ. The reply to `assemblies.create` lists the recipe it just saved,
 *     joined to each material's name and PRICE — so naming another company's
 *     material id returned that company's price for it. Walking the ids
 *     walked a competitor's price book.
 *   • WRITE. The saved row then points across companies for good, so every
 *     later read through it (pricing a kit, a run type's footage) reads the
 *     other company's row.
 *
 * Visible means: this company's own row, or a shared starter row (`userId`
 * NULL). Archived rows count — an archived row is still the company's, and a
 * recipe may legitimately still point at one.
 *
 * Refused with NOT_FOUND, the same answer as an id that does not exist, so
 * the refusal says nothing about whether the other company's row is real.
 */
import { TRPCError } from "@trpc/server";
import { and, inArray, isNull, or, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  assemblies,
  kits,
  laborRates,
  laborSteps,
  materials,
  modifiers,
} from "../drizzle/schema";

const TABLES = {
  materials: { table: materials, word: "material" },
  assemblies: { table: assemblies, word: "assembly" },
  laborRates: { table: laborRates, word: "labor rate" },
  modifiers: { table: modifiers, word: "modifier" },
  laborSteps: { table: laborSteps, word: "work step" },
  kits: { table: kits, word: "kit" },
} as const;

export type LibraryRefs = Partial<
  Record<keyof typeof TABLES, ReadonlyArray<number | null | undefined>>
>;

/** The ids in `ids` that are NOT this company's own row or a shared one. */
export async function foreignLibraryIds(
  kind: keyof typeof TABLES,
  ids: ReadonlyArray<number | null | undefined>,
  userId: number
): Promise<number[]> {
  const wanted = Array.from(
    new Set(ids.filter((id): id is number => typeof id === "number"))
  );
  if (wanted.length === 0) return [];
  const database = await getDb();
  if (!database) throw new Error("DB unavailable");
  const { table } = TABLES[kind];
  const visible = await database
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        inArray(table.id, wanted),
        or(eq(table.userId, userId), isNull(table.userId))
      )
    );
  const seen = new Set(visible.map(row => row.id));
  return wanted.filter(id => !seen.has(id));
}

/** Throws NOT_FOUND naming the first kind with an id the company cannot see. */
export async function requireLibraryRefs(
  userId: number,
  refs: LibraryRefs
): Promise<void> {
  for (const kind of Object.keys(refs) as (keyof typeof TABLES)[]) {
    const foreign = await foreignLibraryIds(kind, refs[kind] ?? [], userId);
    if (foreign.length > 0)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `That ${TABLES[kind].word} isn't in your library.`,
      });
  }
}
