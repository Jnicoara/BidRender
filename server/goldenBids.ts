/**
 * GOLDEN BIDS — every number a handful of fixture bids show, pinned.
 *
 * `server/goldenBids.test.ts` builds each fixture bid through the real routers
 * on the test database, reads `bids.get` — what the bid screen shows — and
 * compares every line and every total with `server/fixtures/goldenBids.json`.
 * Any number that moves fails the Gate, naming the bid, the line and the
 * field, with the old and the new value.
 *
 * ── Changing a number ON PURPOSE ─────────────────────────────────────────────
 *
 *     GOLDEN_UPDATE_REASON="why the numbers moved" \
 *       pnpm vitest run server/goldenBids.test.ts
 *
 * rewrites the file and appends `{ date, reason, hash, changed }` to its
 * `history`. The newest entry's `hash` must be the hash of the bids in the
 * file, so a number edited by hand — without a run, and so without a reason —
 * fails too. CI refuses to update (`CI` is set there): an update is a decision
 * somebody makes at a desk, never something a build does to get itself green.
 *
 * ── What is compared ─────────────────────────────────────────────────────────
 * Every field the golden file holds. A field the code ADDS later is not a
 * changed number and does not fail (a new total on the screen should not stop
 * unrelated work); a field the golden file holds that the code no longer
 * returns does fail, because a number vanishing is a change.
 *
 * These numbers are what the code COMPUTED on the day they were written. They
 * have not been checked with a calculator yet: `references/golden-bids-to-check.md`
 * is that list, and each bid says `checked` until somebody has.
 *
 * Pure — no database — so the comparison itself is tested
 * (`server/goldenBidsCompare.test.ts`).
 */
import { createHash } from "node:crypto";

export const NOT_CHECKED = "computed, NOT hand-checked yet";

export type GoldenValue = number | string | boolean | null;

export type GoldenLine = {
  /** Stable label: name, then [role/run role/scope] — what the diff names. */
  key: string;
  fields: Record<string, GoldenValue>;
};

export type GoldenBid = {
  key: string;
  title: string;
  covers: string[];
  checked: string;
  lines: GoldenLine[];
  totals: Record<string, GoldenValue>;
};

export type GoldenHistoryEntry = {
  date: string;
  reason: string;
  hash: string;
  changed: string[];
};

export type GoldenFile = {
  about: string;
  history: GoldenHistoryEntry[];
  bids: GoldenBid[];
};

/** Six decimals: below every money and hours precision the app stores. */
export function roundGolden(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Flatten an object into `a.b.c` → leaf. Numbers are rounded; numeric strings
 * (decimal columns arrive as "12.5000") become numbers, so "1.50" and "1.5"
 * are one value. Arrays are indexed. Anything else that is not a leaf is
 * dropped.
 */
export function flattenGolden(
  value: unknown,
  prefix = "",
  out: Record<string, GoldenValue> = {}
): Record<string, GoldenValue> {
  if (value === null || value === undefined) {
    if (prefix) out[prefix] = null;
    return out;
  }
  if (typeof value === "number") {
    out[prefix] = Number.isFinite(value) ? roundGolden(value) : String(value);
    return out;
  }
  if (typeof value === "string") {
    out[prefix] = /^-?\d+(\.\d+)?$/.test(value)
      ? roundGolden(Number(value))
      : value;
    return out;
  }
  if (typeof value === "boolean") {
    out[prefix] = value;
    return out;
  }
  if (value instanceof Date) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => flattenGolden(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      flattenGolden(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

export type GoldenDiff = {
  bid: string;
  where: string;
  field: string;
  was: GoldenValue | "(missing)";
  now: GoldenValue | "(missing)";
};

function same(a: GoldenValue, b: GoldenValue): boolean {
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) < 1e-9;
  return a === b;
}

function compareFields(
  bid: string,
  where: string,
  golden: Record<string, GoldenValue>,
  actual: Record<string, GoldenValue>,
  out: GoldenDiff[]
) {
  for (const [field, was] of Object.entries(golden)) {
    if (!(field in actual)) {
      out.push({ bid, where, field, was, now: "(missing)" });
      continue;
    }
    const now = actual[field];
    if (!same(was, now)) out.push({ bid, where, field, was, now });
  }
}

/**
 * Every difference between the golden bids and today's. Lines are matched by
 * key; a line on one side only is a difference of its own.
 */
export function compareGoldenBids(
  golden: readonly GoldenBid[],
  actual: readonly GoldenBid[]
): GoldenDiff[] {
  const diffs: GoldenDiff[] = [];
  const actualByKey = new Map(actual.map(b => [b.key, b]));
  for (const g of golden) {
    const a = actualByKey.get(g.key);
    if (!a) {
      diffs.push({
        bid: g.key,
        where: "bid",
        field: "(whole bid)",
        was: g.title,
        now: "(missing)",
      });
      continue;
    }
    compareFields(g.key, "totals", g.totals, a.totals, diffs);
    const lines = new Map(a.lines.map(l => [l.key, l]));
    for (const gl of g.lines) {
      const al = lines.get(gl.key);
      if (!al) {
        diffs.push({
          bid: g.key,
          where: `line "${gl.key}"`,
          field: "(whole line)",
          was: "on the bid",
          now: "(missing)",
        });
        continue;
      }
      compareFields(g.key, `line "${gl.key}"`, gl.fields, al.fields, diffs);
    }
    const goldenKeys = new Set(g.lines.map(l => l.key));
    for (const al of a.lines)
      if (!goldenKeys.has(al.key))
        diffs.push({
          bid: g.key,
          where: `line "${al.key}"`,
          field: "(whole line)",
          was: "(missing)",
          now: "on the bid",
        });
  }
  for (const a of actual)
    if (!golden.some(g => g.key === a.key))
      diffs.push({
        bid: a.key,
        where: "bid",
        field: "(whole bid)",
        was: "(missing)",
        now: a.title,
      });
  return diffs;
}

/** One line per difference, for a failing test's message. */
export function describeGoldenDiffs(diffs: readonly GoldenDiff[]): string {
  return diffs
    .map(d => `${d.bid} · ${d.where} · ${d.field}: ${d.was} → ${d.now}`)
    .join("\n");
}

/**
 * The hash the newest history entry must carry. Over the bids only — the
 * history and the `checked` notes can change without touching a number.
 */
export function goldenHash(bids: readonly GoldenBid[]): string {
  const numbersOnly = bids.map(b => ({
    key: b.key,
    lines: b.lines,
    totals: b.totals,
  }));
  return createHash("sha256")
    .update(JSON.stringify(numbersOnly))
    .digest("hex")
    .slice(0, 16);
}

/**
 * The file after an update on purpose. A bid's `checked` note is kept when
 * its numbers did not move, and reset to NOT_CHECKED when they did — a hand
 * check of the old numbers says nothing about the new ones.
 */
export function updatedGoldenFile(
  previous: GoldenFile | null,
  actual: readonly GoldenBid[],
  reason: string,
  date: string
): GoldenFile {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A golden update needs a reason.");
  const diffs = previous ? compareGoldenBids(previous.bids, actual) : [];
  const changed = previous
    ? Array.from(new Set(diffs.map(d => d.bid)))
    : actual.map(b => b.key);
  const bids = actual.map(b => {
    const before = previous?.bids.find(p => p.key === b.key);
    const moved = !before || changed.includes(b.key);
    return { ...b, checked: moved ? NOT_CHECKED : before.checked };
  });
  return {
    about: previous?.about ?? "",
    history: [
      ...(previous?.history ?? []),
      { date, reason: trimmed, hash: goldenHash(bids), changed },
    ],
    bids,
  };
}

/** Why the file on disk cannot be trusted, or null when it can. */
export function goldenFileProblem(file: GoldenFile): string | null {
  const last = file.history[file.history.length - 1];
  if (!last) return "The golden file has no history entry.";
  if (!last.reason.trim()) return "The newest golden update has no reason.";
  if (last.hash !== goldenHash(file.bids))
    return (
      "The golden numbers were edited without an update run: the newest " +
      "history entry's hash does not match the bids. Re-run with " +
      'GOLDEN_UPDATE_REASON="…" instead of editing the file.'
    );
  return null;
}
