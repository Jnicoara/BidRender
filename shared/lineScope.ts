/**
 * WHO DOES A BID LINE'S WORK — the scope tag (0146,
 * references/scope-tags-plan.md § 2).
 *
 * One module decides what each tag does to a line. Everything that prices,
 * lists or prints a line reads it here; nothing re-derives it from the raw
 * column — and the SQL copy in server/db.ts (`lineScopeSql`) says the same
 * three things, kept in step by `server/lineScopePricing.test.ts`.
 *
 * | Tag        | Material money | Labor money | Materials list    | Drops |
 * | ---------- | -------------- | ----------- | ----------------- | ----- |
 * | NULL       | as today       | as today    | buy               | kept  |
 * | install    | as today       | as today    | buy               | kept  |
 * | ofci       | 0              | as today    | owner furnished   | kept  |
 * | by_others  | 0              | 0           | off               | off   |
 * | excluded   | 0              | 0           | off               | off   |
 *
 * ── NULL is "not said", and prices exactly as We install ─────────────────────
 * Every line from before 0146 is NULL and must price as it always did ("a
 * little high beats low"). `install` differs from NULL only in that somebody
 * ANSWERED — a "Who does this?" prompt stops asking. So `scopeOf` folds NULL
 * into `install` for every money question, and only the prompt matcher asks
 * whether a line has been answered at all.
 *
 * ── A tag moves a number only when somebody picks it ─────────────────────────
 * Nothing sets a tag on its own: no default on an assembly (owner Q6), no
 * inference from a name. A tag is a person's answer, on one bid, with Undo.
 */
import { LINE_SCOPE_TAGS } from "../drizzle/schema";

export type LineScope = (typeof LINE_SCOPE_TAGS)[number];
export const LINE_SCOPES = LINE_SCOPE_TAGS;

/**
 * The line shape the rule needs. `scopeTag` is REQUIRED — the forcing
 * function `StampRecord.status` uses: a mapping that forgets it does not
 * compile, rather than quietly pricing a By others line as ours.
 */
export type ScopedLine = { scopeTag: LineScope | null };

export function isLineScope(value: unknown): value is LineScope {
  return (LINE_SCOPE_TAGS as readonly unknown[]).includes(value);
}

/** The tag that decides the money: NULL (not said) reads as We install. */
export function scopeOf(line: ScopedLine): LineScope {
  return line.scopeTag ?? "install";
}

/** Whether the line's MATERIAL is in the price. Only ours to buy is. */
export function scopePricesMaterial(line: ScopedLine): boolean {
  return scopeOf(line) === "install";
}

/** Whether the line's LABOR is in the price. Owner-furnished: we still install. */
export function scopePricesLabor(line: ScopedLine): boolean {
  const scope = scopeOf(line);
  return scope === "install" || scope === "ofci";
}

/**
 * The line is not ours at all — By others or Excluded. It prices nothing,
 * never reads "not priced" (nothing on it is ours to price), and comes off
 * the materials list and the drops (owner, 2026-10-10, Q10).
 */
export function scopeIsOffBid(line: ScopedLine): boolean {
  return !scopePricesLabor(line);
}

/** Where the line goes on the materials list. */
export function scopeOnMaterialsList(
  line: ScopedLine
): "buy" | "ownerFurnished" | "off" {
  const scope = scopeOf(line);
  if (scope === "install") return "buy";
  if (scope === "ofci") return "ownerFurnished";
  return "off";
}

/**
 * Whether the count's drops stay on the bid. Owner-furnished keeps them —
 * we still wire it (owner Q3); By others and Excluded take them off (Q10).
 */
export function scopeKeepsDrops(line: ScopedLine): boolean {
  return scopePricesLabor(line);
}

/** The screen word for a tag. NULL is We install, said by nothing (no chip). */
export function scopeLabel(scope: LineScope): string {
  switch (scope) {
    case "install":
      return "We install";
    case "ofci":
      return "Owner furnishes, we install";
    case "by_others":
      return "By others";
    case "excluded":
      return "Excluded";
  }
}

/**
 * The tags a line may take. A remove / relocate line (`lineRole`) is labor
 * only already, so "Owner furnishes" means nothing on it (plan § 2, Q4).
 * Every other line — assembly, count, typed, wire and conduit (Q12) — takes
 * all four.
 */
export function scopeChoicesFor(line: {
  lineRole: string | null;
}): readonly LineScope[] {
  return line.lineRole === "remove" || line.lineRole === "relocate"
    ? ["install", "by_others", "excluded"]
    : LINE_SCOPES;
}
