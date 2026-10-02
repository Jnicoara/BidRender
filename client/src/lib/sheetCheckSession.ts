/**
 * What the "Check sheet" panel shows, decided here where the suite can reach
 * it (@/lib/sheetCheck finds; this sorts what was found into what a person
 * acts on). 2026-10-01.
 *
 * Nothing here changes a mark. Every line is a suggestion, and the panel's
 * buttons are the only way any of it reaches the bid.
 *
 * ── Where the legend lives until it has a table ─────────────────────────────
 * A check needs the legend's symbol BOXES, which "Whole legend" measures and
 * nothing stores (`symbol_links` keeps a picture and a name, no box). Until
 * the table asked of Track A exists (`symbol_looks`, todo.md), the boxes from
 * the last "Whole legend" on a plan set are kept in this browser tab's
 * sessionStorage. Lost with the tab, which is the honest failure: the panel
 * then says to read the legend again, and nothing is guessed.
 */
import type {
  MarkCheck,
  SheetCheckResult,
  Spot,
  VariantGroup,
} from "./sheetCheck";
import type { MatchBox } from "./findMatching";

export type SessionLegendRow = {
  name: string;
  symbol: MatchBox;
  /** The legend's own picture of the symbol, as read. For the AI tie-break. */
  picture: string | null;
};

export type SessionLegend = {
  bidId: number;
  docId: number;
  page: number;
  sheetName: string;
  rows: SessionLegendRow[];
  /** Count name (lower case) -> legend item, from "Compare with". */
  picks: Record<string, string>;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const legendKey = (bidId: number, docId: number) =>
  `bidridge:sheet-legend:${bidId}:${docId}`;

/** Never throws: a blocked store just means there is no legend to check with. */
export function loadSessionLegend(
  store: Store | null,
  bidId: number,
  docId: number
): SessionLegend | null {
  try {
    const raw = store?.getItem(legendKey(bidId, docId));
    if (!raw) return null;
    const v = JSON.parse(raw) as SessionLegend;
    if (v.bidId !== bidId || v.docId !== docId || !Array.isArray(v.rows))
      return null;
    return { ...v, picks: v.picks ?? {} };
  } catch {
    return null;
  }
}

/**
 * Keep the legend for this plan set. When the pictures make it too big for
 * the store, it is kept without them (the check still runs; only the AI
 * tie-break, which needs the pictures, is then not offered). Returns what was
 * kept, or null when nothing could be.
 */
export function saveSessionLegend(
  store: Store | null,
  legend: SessionLegend
): "all" | "noPictures" | null {
  if (!store) return null;
  const key = legendKey(legend.bidId, legend.docId);
  try {
    store.setItem(key, JSON.stringify(legend));
    return "all";
  } catch {
    try {
      store.setItem(
        key,
        JSON.stringify({
          ...legend,
          rows: legend.rows.map(r => ({ ...r, picture: null })),
        })
      );
      return "noPictures";
    } catch {
      return null;
    }
  }
}

// ── The panel's lists ────────────────────────────────────────────────────────

export type MarkIssue = {
  markId: number;
  x: number;
  y: number;
  count: string;
  kind: "different" | "unsure" | "nothing";
  /** One plain sentence. */
  says: string;
  /** For "different": the legend item drawn there. */
  suggest: string | null;
};

export type CountSummary = {
  count: string;
  item: string | null;
  marks: number;
  matches: number;
  issues: number;
};

export type UnmarkedSpot = {
  spotId: number;
  x: number;
  y: number;
  /** clear: code knows; tie: two or more fit; same: drawn the same on the legend. */
  kind: "clear" | "tie" | "same";
  items: string[];
  /** "the USB beside it" when a tie was settled by words. */
  byWords: string | null;
};

const short = (s: string, n = 48) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

function issueOf(
  c: MarkCheck,
  mark: { id: number; x: number; y: number; count: string }
): MarkIssue | null {
  const base = { markId: mark.id, x: mark.x, y: mark.y, count: mark.count };
  switch (c.kind) {
    case "different":
      return {
        ...base,
        kind: "different",
        says: `Looks different — the drawing shows ${short(c.suggest)}`,
        suggest: c.suggest,
      };
    case "unsure":
      return {
        ...base,
        kind: "unsure",
        says:
          c.items.length > 1
            ? `Unsure — could be ${c.items.map(i => short(i, 28)).join(" or ")}`
            : `Unsure — ${c.reasons[0] ?? "only part of the symbol fits"}`,
        suggest: null,
      };
    case "nothing":
      return {
        ...base,
        kind: "nothing",
        says: "Nothing from the legend is drawn under this mark",
        suggest: null,
      };
    default:
      return null;
  }
}

/**
 * The estimator's marks that disagree with the drawing, and a line per count.
 * A mark that is drawn the same as two other legend items ("unsure" between
 * looks that are identical on the legend) is NOT an issue — no picture can
 * say which, so listing every one would bury the real ones (UNCC E111: 66
 * data outlets).
 */
export function markReport(result: SheetCheckResult): {
  issues: MarkIssue[];
  counts: CountSummary[];
} {
  const sameAt = new Set(
    result.spots
      .filter(s => s.decision.kind === "tie" && s.decision.sameOnLegend)
      .map(s => s.markId)
      .filter((id): id is number => id !== null)
  );
  const byId = new Map(result.marks.map(m => [m.id, m] as const));
  const issues: MarkIssue[] = [];
  const counts = new Map<string, CountSummary>();
  result.checks.forEach(c => {
    const mark = byId.get(c.markId);
    if (!mark) return;
    const sum = counts.get(mark.count) ?? {
      count: mark.count,
      item: mark.item,
      marks: 0,
      matches: 0,
      issues: 0,
    };
    sum.marks++;
    const sameLook =
      c.kind === "unsure" && sameAt.has(c.markId) && mark.item !== null;
    if (c.kind === "matches" || sameLook) sum.matches++;
    else {
      const issue = c.kind === "noLook" ? null : issueOf(c, mark);
      if (issue) {
        issues.push(issue);
        sum.issues++;
      }
    }
    counts.set(mark.count, sum);
  });
  const order = { different: 0, unsure: 1, nothing: 2 };
  issues.sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      a.count.localeCompare(b.count) ||
      a.y - b.y ||
      a.x - b.x
  );
  return {
    issues,
    counts: Array.from(counts.values()).sort((a, b) =>
      a.count.localeCompare(b.count)
    ),
  };
}

/** Legend symbols drawn where there is no mark: each one UNCONFIRMED. */
export function unmarkedSpots(spots: readonly Spot[]): UnmarkedSpot[] {
  return spots
    .filter(s => s.markId === null && s.decision.kind !== "unsure")
    .map(s => {
      const d = s.decision;
      if (d.kind === "clear")
        return {
          spotId: s.id,
          x: s.x,
          y: s.y,
          kind: "clear" as const,
          items: [d.item],
          byWords: d.byWords ?? null,
        };
      const tie = d as Extract<typeof d, { kind: "tie" }>;
      return {
        spotId: s.id,
        x: s.x,
        y: s.y,
        kind: tie.sameOnLegend ? ("same" as const) : ("tie" as const),
        items: tie.items,
        byWords: null,
      };
    })
    .sort((a, b) => a.items[0].localeCompare(b.items[0]) || a.y - b.y);
}

/** The AI tie-break's batch limit (server/tieBreak.ts TIE_BREAK_MAX_CROPS). */
export const TIE_BREAK_BATCH = 12;

/**
 * What may be sent to the AI tie-break: ties only, never a tie between looks
 * drawn the same on the legend, never an item with no legend picture, and
 * at most one batch. Items are numbered from 1 in the order first met.
 */
export function tieBreakBatch(
  spots: readonly UnmarkedSpot[],
  rows: readonly SessionLegendRow[]
): {
  items: { id: number; name: string; picture: string }[];
  crops: {
    id: number;
    spotId: number;
    x: number;
    y: number;
    itemIds: number[];
  }[];
} {
  const picture = new Map(
    rows
      .filter((r): r is SessionLegendRow & { picture: string } =>
        Boolean(r.picture)
      )
      .map(r => [r.name, r.picture] as const)
  );
  const items: { id: number; name: string; picture: string }[] = [];
  const idOf = (name: string) => {
    const have = items.find(i => i.name === name);
    if (have) return have.id;
    const id = items.length + 1;
    items.push({ id, name, picture: picture.get(name)! });
    return id;
  };
  const crops: {
    id: number;
    spotId: number;
    x: number;
    y: number;
    itemIds: number[];
  }[] = [];
  for (const s of spots) {
    if (crops.length >= TIE_BREAK_BATCH) break;
    if (s.kind !== "tie") continue;
    if (!s.items.every(n => picture.has(n))) continue;
    crops.push({
      id: crops.length + 1,
      spotId: s.spotId,
      x: s.x,
      y: s.y,
      itemIds: s.items.slice(0, 6).map(idOf),
    });
  }
  return { items, crops };
}

/** A variant group's name on screen. */
export function variantLabel(g: VariantGroup): string {
  const look =
    g.look === 0
      ? "can't tell the symbol"
      : g.lookName
        ? `drawn as ${short(g.lookName, 32)}`
        : `look ${g.look}`;
  return g.beside ? `${look}, ${g.beside} beside it` : look;
}

/**
 * A count's name from a legend row: the row up to its first full stop, at
 * most 60 characters. "CONVENIENCE RECEPTACLE, 120V, NEMA 5-20R DUPLEX. MOUNT
 * 18" AFF…" is a sentence of instructions; the count only needs what it is.
 */
export function countNameFromLegend(item: string): string {
  const first = item.split(/\.(\s|$)/)[0].trim() || item.trim();
  return first.length > 60 ? `${first.slice(0, 59).trimEnd()}…` : first;
}
