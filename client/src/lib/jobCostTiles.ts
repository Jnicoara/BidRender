/**
 * Job costs — the four flat charges a job nearly always has and a count
 * never produces: permit, lift rental, dumpster, drive time
 * (references/quick-bid-plan.md § 6; owner answers § 12).
 *
 * A tile is a small calculator that writes ONE ordinary `bid_expenses` row:
 * a frozen flat amount, exactly like a charge typed by hand. So it needs no
 * new pricing path — the rollup already adds expenses.
 *
 * ── Drive time is a flat COST, not labor hours (owner, Q6) ──────────────────
 * trips × hours per trip × rate, worked out here and frozen as an amount. It
 * never becomes hours on the bid, so job-condition modifiers, a room's
 * difficulty and the productivity factor never touch it: it is not install
 * labor.
 *
 * ── Blank is never $0 ───────────────────────────────────────────────────────
 * A tile adds nothing until every box holds a number above zero. A blank
 * rate in particular is refused with its own message rather than multiplied
 * through as 0 — "no rate" and "free" are different answers (CLAUDE.md
 * § Editing fields, rule 6, the money convention on a bid).
 *
 * Kept in lib, not in the component, so the suite can reach it.
 */

export type JobCostTileKey = "permit" | "lift" | "dumpster" | "drive";

export type JobCostField = {
  key: string;
  /** What the box is called, for the label and the aria-label. */
  label: string;
  /** Shown inside the empty box. */
  placeholder: string;
};

export type JobCostTile = {
  key: JobCostTileKey;
  /** Also the name the charge is saved under, so the proposal prints it. */
  label: string;
  fields: readonly JobCostField[];
  /** Words people type for it, beyond the label's own. */
  aliases: readonly string[];
};

export const JOB_COST_TILES: readonly JobCostTile[] = [
  {
    key: "permit",
    label: "Permit",
    fields: [{ key: "amount", label: "Permit amount", placeholder: "$" }],
    aliases: ["permits", "inspection", "fee"],
  },
  {
    key: "lift",
    label: "Lift rental",
    fields: [
      { key: "days", label: "Days", placeholder: "days" },
      { key: "ratePerDay", label: "Rate per day", placeholder: "$ / day" },
    ],
    aliases: ["lift", "scissor", "boom", "rental", "manlift"],
  },
  {
    key: "dumpster",
    label: "Dumpster",
    fields: [{ key: "amount", label: "Dumpster amount", placeholder: "$" }],
    aliases: ["roll off", "rolloff", "trash", "debris", "haul"],
  },
  {
    key: "drive",
    label: "Drive time",
    fields: [
      { key: "trips", label: "Trips", placeholder: "trips" },
      { key: "hoursPerTrip", label: "Hours per trip", placeholder: "h / trip" },
      { key: "rate", label: "Rate per hour", placeholder: "$ / h" },
    ],
    aliases: ["drive", "travel", "trips", "windshield"],
  },
];

/** The largest charge the server accepts (bidExtrasRouter `amountSchema`). */
export const MAX_JOB_COST = 1_000_000;

export type JobCostResult =
  | {
      ok: true;
      name: string;
      amount: number;
      /** The arithmetic in words, e.g. "6 trips × 1.5 h × $85.00/h". */
      working: string | null;
    }
  | {
      ok: false;
      /** The first box that needs attention, so the screen can focus it. */
      field: string;
      message: string;
    };

const roundCents = (n: number) => Math.round(n * 100) / 100;

const dollars = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A trimmed number, or why it is not one. Blank, zero and below are all refused. */
function readPositive(
  raw: string | undefined
): { ok: true; value: number } | { ok: false; blank: boolean } {
  const text = (raw ?? "").trim().replace(/[$,]/g, "");
  if (text === "") return { ok: false, blank: true };
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, blank: false };
  return { ok: true, value };
}

const plain = (n: number) => String(Math.round(n * 10000) / 10000);

export function tileByKey(key: JobCostTileKey): JobCostTile {
  const tile = JOB_COST_TILES.find(t => t.key === key);
  if (!tile) throw new Error(`Unknown job cost tile: ${key}`);
  return tile;
}

/**
 * What a tile would add, or the first reason it cannot.
 *
 * Nothing here ever returns `ok` with an amount of 0.
 */
export function computeJobCost(
  key: JobCostTileKey,
  inputs: Readonly<Record<string, string>>
): JobCostResult {
  const tile = tileByKey(key);
  const values: Record<string, number> = {};
  for (const field of tile.fields) {
    const read = readPositive(inputs[field.key]);
    if (!read.ok) {
      // The rate gets its own words: a missing rate is the one blank that
      // would otherwise quietly turn drive time into nothing.
      const message =
        key === "drive" && field.key === "rate" && read.blank
          ? "No labor rate — type one, or set a default rate in Settings."
          : read.blank
            ? `Type the ${field.label.toLowerCase()}.`
            : `${field.label} must be a number above zero.`;
      return { ok: false, field: field.key, message };
    }
    values[field.key] = read.value;
  }

  let amount: number;
  let working: string | null;
  switch (key) {
    case "permit":
    case "dumpster":
      amount = values.amount;
      working = null;
      break;
    case "lift":
      amount = values.days * values.ratePerDay;
      working = `${plain(values.days)} day${values.days === 1 ? "" : "s"} × ${dollars(values.ratePerDay)}/day`;
      break;
    case "drive":
      amount = values.trips * values.hoursPerTrip * values.rate;
      working = `${plain(values.trips)} trip${values.trips === 1 ? "" : "s"} × ${plain(values.hoursPerTrip)} h × ${dollars(values.rate)}/h`;
      break;
  }

  amount = roundCents(amount);
  if (amount <= 0) {
    // Only reachable by rounding: 0.001 × 1 rounds to $0.00.
    return {
      ok: false,
      field: tile.fields[0].key,
      message: "That works out to $0.00 — check the numbers.",
    };
  }
  if (amount > MAX_JOB_COST) {
    return {
      ok: false,
      field: tile.fields[0].key,
      message: `That is over ${dollars(MAX_JOB_COST)} — check the numbers.`,
    };
  }
  return { ok: true, name: tile.label, amount, working };
}

/**
 * Tiles a search box query names, for the type → Enter loop. A word of the
 * query must START a word of the tile's label or aliases, so "per" finds
 * Permit and "dump" finds Dumpster, while "e" or "time" alone on a longer
 * query does not drag every tile in.
 */
export function matchJobCostTiles(query: string): JobCostTile[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return JOB_COST_TILES.filter(tile => {
    const vocabulary = [tile.label, ...tile.aliases]
      .join(" ")
      .toLowerCase()
      .split(/\s+/);
    return words.every(
      word => word.length >= 3 && vocabulary.some(v => v.startsWith(word))
    );
  });
}

/** The starting values a tile opens with. Only drive time has one: the rate. */
export function initialTileInputs(
  key: JobCostTileKey,
  defaultRate: number | null
): Record<string, string> {
  if (key === "drive" && defaultRate !== null && defaultRate > 0)
    return { rate: String(roundCents(defaultRate)) };
  return {};
}
