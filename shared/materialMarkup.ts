/**
 * Material markup — which rule applies to a part, and what a bid line stores.
 *
 * The design and every decision behind it: references/material-markup.md.
 * Read that before changing the ORDER below; it was decided, not arrived at.
 *
 * ── One mechanism, checked in order ──────────────────────────────────────────
 *
 *   1. item override    this one material
 *   2. quoted line      a supplier-quoted package line (D4 — slot only)
 *   3. category         the material's category
 *   4. price band       the part's PACK price (D3 — slot only until Piece 2)
 *   5. company default  everything else
 *
 * The first level that HAS a rule wins. Nothing matching is a real answer —
 * 0%, "no markup rule set" — never a guess.
 *
 * ── A level with no data says "no rule", it does not invent one ─────────────
 * The quoted-line level needs a line type that does not exist yet, and the
 * band level needs a pack price that `materials` does not carry yet. Both are
 * wired into the order now so that adding them later is filling a slot, not
 * re-deciding the order — and until then they return nothing, so a part falls
 * through to the level below exactly as if they were absent.
 *
 * Pure: no database, no I/O. The server loads the rules and the materials;
 * this decides.
 */

// ─── The order ────────────────────────────────────────────────────────────────

export const MARKUP_RULE_ORDER = [
  "item",
  "quoted",
  "category",
  "band",
  "company",
] as const;

export type MarkupLevel = (typeof MARKUP_RULE_ORDER)[number];

/** Largest markup a rule may carry: 1000%. Past that it is a typo. */
export const MAX_MARKUP_PCT = 10;

/** Throws unless `pct` is a usable markup fraction (0.35 = 35%). */
export function assertMarkupPct(pct: number, label = "Markup"): void {
  if (typeof pct !== "number" || !Number.isFinite(pct)) {
    throw new Error(`${label} must be a finite number, received: ${pct}`);
  }
  // Negative is a discount, and a discount is not a markup rule: it would
  // price material below what it costs with nothing on screen saying so.
  if (pct < 0 || pct > MAX_MARKUP_PCT) {
    throw new Error(
      `${label} must be between 0% and ${MAX_MARKUP_PCT * 100}%, received: ${pct * 100}%`
    );
  }
}

// ─── Rules ────────────────────────────────────────────────────────────────────

/** One price band (Piece 2). Bounds are on the PACK price (D3), min inclusive. */
export type PriceBand = {
  minPrice: number;
  /** Exclusive. Null is "and up". */
  maxPrice: number | null;
  pct: number;
};

export type MarkupRuleSet = {
  /** Item overrides, keyed by `materialItemKey` — a shipped row and its forks share one. */
  items: ReadonlyMap<number, number>;
  /** D4. The quoted-line markup. Null until quoted lines exist. */
  quotedLinePct: number | null;
  /** Keyed by the category name as stored on the material. */
  categories: ReadonlyMap<string, number>;
  /** Piece 2. Empty until then. */
  bands: readonly PriceBand[];
  /** Null means the company has not set one — which is "no rule", not 0%. */
  companyDefault: number | null;
};

export const NO_MARKUP_RULES: MarkupRuleSet = {
  items: new Map(),
  quotedLinePct: null,
  categories: new Map(),
  bands: [],
  companyDefault: null,
};

/**
 * The key an item override is stored under.
 *
 * Editing a shipped material FORKS it: the company gets a new row whose
 * `baselineId` points at the shipped one. An override keyed by the raw id
 * would stop matching the moment somebody fixed a price, and the markup would
 * silently fall to the category or the default. Keying by the shipped id
 * keeps one item one item, whichever row the bid happened to read.
 */
export function materialItemKey(material: {
  id: number;
  baselineId: number | null;
}): number {
  return material.baselineId ?? material.id;
}

// ─── Parts ────────────────────────────────────────────────────────────────────

/** One material inside a line, as the rules see it. */
export type MarkupPart = {
  materialId: number | null;
  itemKey: number | null;
  category: string | null;
  /** D3. The pack / purchase price. Null until pack sizes exist (Piece 2). */
  packPrice: number | null;
  /**
   * This part's cost inside ONE unit of the line — cost per unit × qty in the
   * recipe. Only its proportion matters: it weights the blend when an
   * assembly's parts match different rules.
   */
  cost: number;
};

export type PartMarkup = {
  pct: number;
  level: MarkupLevel | "none";
  /** What the line says, e.g. "from Wire & Cable category". */
  label: string;
};

function bandFor(bands: readonly PriceBand[], price: number) {
  return bands.find(
    band =>
      price >= band.minPrice &&
      (band.maxPrice === null || price < band.maxPrice)
  );
}

function money(n: number): string {
  return n % 1 === 0 ? `$${n.toLocaleString("en-US")}` : `$${n.toFixed(2)}`;
}

function bandLabel(band: PriceBand): string {
  return band.maxPrice === null
    ? `over ${money(band.minPrice)} price band`
    : band.minPrice === 0
      ? `under ${money(band.maxPrice)} price band`
      : `${money(band.minPrice)}–${money(band.maxPrice)} price band`;
}

/** Walk the order for one part. The first level with a rule wins. */
export function resolvePartMarkup(
  part: Omit<MarkupPart, "cost" | "materialId">,
  rules: MarkupRuleSet,
  context: { quotedLine: boolean } = { quotedLine: false }
): PartMarkup {
  for (const level of MARKUP_RULE_ORDER) {
    switch (level) {
      case "item": {
        if (part.itemKey === null) break;
        const pct = rules.items.get(part.itemKey);
        if (pct !== undefined)
          return { pct, level, label: "from item override" };
        break;
      }
      case "quoted": {
        if (!context.quotedLine || rules.quotedLinePct === null) break;
        return {
          pct: rules.quotedLinePct,
          level,
          label: "from quoted-line markup",
        };
      }
      case "category": {
        if (part.category === null) break;
        const pct = rules.categories.get(part.category);
        if (pct !== undefined)
          return { pct, level, label: `from ${part.category} category` };
        break;
      }
      case "band": {
        if (part.packPrice === null) break;
        const band = bandFor(rules.bands, part.packPrice);
        if (band)
          return { pct: band.pct, level, label: `from ${bandLabel(band)}` };
        break;
      }
      case "company": {
        if (rules.companyDefault === null) break;
        return {
          pct: rules.companyDefault,
          level,
          label: "from company default",
        };
      }
    }
  }
  return { pct: 0, level: "none", label: "no markup rule set" };
}

// ─── A line ───────────────────────────────────────────────────────────────────

/**
 * What a bid line stores beside its markup percentage.
 *
 * `parts` is the composition the rules ran on — the material ids and their
 * cost weights at the moment the line's cost was frozen. "Re-apply rules" runs
 * the CURRENT rules over THESE parts, so the blend stays weighted by the same
 * recipe the frozen cost came from rather than by whatever the assembly holds
 * today.
 */
export type LineMarkupSource = {
  level: MarkupLevel | "none" | "mixed";
  label: string;
  parts: Array<{ materialId: number | null; cost: number }>;
};

/** Stored to six decimals — the column is decimal(10,6). */
function roundPct(pct: number): number {
  return Math.round(pct * 1e6) / 1e6;
}

/**
 * Resolve every part and blend them into one line percentage.
 *
 * A line with NO parts — a price typed by hand, which enters as material money
 * (references/plan-viewer-overhaul.md § 5f) — is resolved as one anonymous
 * part: no item, no category, so it takes the company default if there is one.
 *
 * The blend is weighted by each part's cost, so a line's markup in dollars is
 * the sum of what each part would have carried on its own. Parts with no cost
 * weigh nothing; if EVERY part is unpriced the line's material costs nothing
 * and the percentage only matters as a label, so it is the plain average.
 */
export function resolveLineMarkup(
  parts: readonly MarkupPart[],
  rules: MarkupRuleSet,
  context: { quotedLine: boolean } = { quotedLine: false }
): { pct: number; source: LineMarkupSource } {
  if (parts.length === 0) {
    const one = resolvePartMarkup(
      { itemKey: null, category: null, packPrice: null },
      rules,
      context
    );
    return {
      pct: roundPct(one.pct),
      source: { level: one.level, label: one.label, parts: [] },
    };
  }

  const resolved = parts.map(part => ({
    part,
    markup: resolvePartMarkup(part, rules, context),
  }));

  const totalCost = resolved.reduce((s, r) => s + Math.max(0, r.part.cost), 0);
  const pct =
    totalCost > 0
      ? resolved.reduce(
          (s, r) => s + Math.max(0, r.part.cost) * r.markup.pct,
          0
        ) / totalCost
      : resolved.reduce((s, r) => s + r.markup.pct, 0) / resolved.length;

  const labels = new Map<string, number>();
  for (const r of resolved)
    labels.set(r.markup.label, (labels.get(r.markup.label) ?? 0) + 1);

  const storedParts = parts.map(p => ({
    materialId: p.materialId,
    cost: p.cost,
  }));

  if (labels.size === 1) {
    const only = resolved[0].markup;
    return {
      pct: roundPct(pct),
      source: { level: only.level, label: only.label, parts: storedParts },
    };
  }

  // Most common first, so the headline is what most of the line did.
  const summary = Array.from(labels, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map(({ label, count }) => `${count} ${label}`)
    .join(", ");
  return {
    pct: roundPct(pct),
    source: { level: "mixed", label: `Mixed — ${summary}`, parts: storedParts },
  };
}

// ─── Reading a stored line ────────────────────────────────────────────────────

/** What a line added before markup rules existed says about itself. */
export const LEGACY_MARKUP_LABEL = "added before markup rules — no markup";

/**
 * The fraction a stored line prices with.
 *
 * NULL is a line added before markup rules existed and prices as 0% — which
 * is what makes the migration additive: every such line reads exactly as it
 * always did. See references/material-markup.md § How it is stored.
 */
export function storedMarkupPct(
  value: string | number | null | undefined
): number {
  if (value === null || value === undefined) return 0;
  const pct = Number(value);
  return Number.isFinite(pct) ? pct : 0;
}

/** The sentence under a line: how much, and where it came from. */
export function describeLineMarkup(line: {
  snapshotMarkupPct: string | number | null;
  snapshotMarkupSource: LineMarkupSource | null;
}): string {
  if (line.snapshotMarkupPct === null) return LEGACY_MARKUP_LABEL;
  const pct = storedMarkupPct(line.snapshotMarkupPct);
  const label = line.snapshotMarkupSource?.label ?? "markup";
  if (line.snapshotMarkupSource?.level === "none") return label;
  return `${formatPct(pct)} markup ${label}`;
}

/** 0.35 → "35%", 0.287345 → "28.73%". Never more than two decimals on screen. */
export function formatPct(fraction: number): string {
  const pct = Math.round(fraction * 100 * 100) / 100;
  return `${pct}%`;
}

/**
 * Why a bid may NOT have its markup re-applied, or null when it may.
 *
 * DRAFT only, and not with its quantities locked. An Active bid has been sent:
 * its price is what somebody was quoted, and a company-wide rule change
 * reaching it is exactly the silent re-pricing the snapshot exists to stop
 * (ASSEMBLIES_PLAN.md § PROJECT ESTIMATES — a submitted bid is fully frozen).
 * Won and Lost are history. A locked bid is one somebody deliberately froze.
 *
 * Lives here, not in the router, so the suite can pin it — and the server
 * refuses with it, so hiding the button is not the only thing in the way.
 */
export function markupReapplyRefusal(bid: {
  status: string;
  quantitiesLockedAt: Date | string | null;
}): string | null {
  if (bid.status !== "Draft")
    return `This bid is ${bid.status}, so its prices are frozen. Markup rules are re-applied only on a Draft bid.`;
  if (bid.quantitiesLockedAt !== null)
    return "This bid is locked, so its prices are frozen. Unlock it to re-apply markup rules.";
  return null;
}

/** Whether re-applying today's rules would change what a line stores. */
export function markupDiffers(
  stored: string | number | null,
  next: number
): boolean {
  if (stored === null) return next !== 0;
  return Math.abs(storedMarkupPct(stored) - next) > 5e-7;
}
