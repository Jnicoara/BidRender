/**
 * The colours and number formats the analytics screen draws with.
 *
 * ── Why the brand yellow is not in here ──────────────────────────────────────
 * #F5C518 is the app's accent and it is on the nav, the active tab and the
 * primary button. It is deliberately absent as a DATA colour: against the light
 * theme's white card it measures 1.63:1, well under the 3:1 a mark needs, so a
 * 2px yellow trend line is close to invisible for half the app's users. It
 * stays on chrome, where it sits on a dark bar and works.
 *
 * ── Every colour below was validated, not chosen by eye ──────────────────────
 * Checked against both surfaces the app has — the light card (#FFFFFF) and the
 * dark one (#1A1D27) — for the lightness band, the chroma floor, contrast, and
 * separation under simulated protanopia and deuteranopia. The won/lost pair is
 * the one that matters: red and green is the classic pair that collapses for a
 * colourblind reader, and these two steps hold ΔE 10.1 apart under deuteranopia
 * in both modes, comfortably over the 8 the check asks for.
 *
 * The one deliberate exception is PENDING, which is a low-chroma grey and would
 * fail a check meant for identity colours. That is the point: "still out" is the
 * ABSENCE of an outcome rather than a third outcome, and it should recede behind
 * the two real ones. It is never the only channel — every segment carrying it is
 * in the legend and in the table view.
 */

/** Won / lost / still out. Status colours, never reused as "series 3". */
export const OUTCOME_COLORS = {
  won: "#0F9D77",
  lost: "#E02424",
  pending: "#64748B",
} as const;

/**
 * A plain measure plotted over time — the win-rate line, revenue.
 *
 * One hue, because these charts carry one series and their identity comes from
 * the title rather than from a legend.
 */
export const MEASURE_COLOR = "#2A78D6";

/** Recessive chart furniture. One step off the surface, never competing. */
export const GRID_COLOR = "var(--border)";
export const AXIS_TEXT = "var(--muted-foreground)";

// ─── Numbers ──────────────────────────────────────────────────────────────────

/**
 * Money short enough for an axis tick — $0, $12K, $4.2M.
 *
 * Axis ticks only. A figure someone might read out loud, or check against their
 * books, is written in full by `moneyWhole`.
 */
export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

/**
 * A fraction as a percentage, or an em dash when there is nothing to show.
 *
 * Null is a real answer everywhere in this feature — no decided bids, no
 * revenue to take a margin of — and it has to render as visibly absent rather
 * than as 0%, which is a completely different and much bleaker claim.
 */
export function percent(value: number | null, decimals = 0): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/** The same, with an explicit sign — for a difference against a target. */
export function signedPercent(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted = `${(Math.abs(value) * 100).toFixed(decimals)}%`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/** Hours, to one decimal, comma'd. */
export function hours(value: number): string {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })} h`;
}

/**
 * Which way a variance should read.
 *
 * Deliberately takes `higherIsBetter`, because the two figures on this screen
 * point opposite ways: a margin above its estimate is good news, and hours above
 * their estimate is bad news. Hard-coding "up is green" would colour half the
 * screen backwards.
 */
export function varianceTone(
  value: number | null,
  higherIsBetter: boolean
): "good" | "bad" | "neutral" {
  if (value === null || value === 0) return "neutral";
  const good = higherIsBetter ? value > 0 : value < 0;
  return good ? "good" : "bad";
}

// ─── Date ranges the presets produce ──────────────────────────────────────────

export type RangePreset = "12m" | "24m" | "ytd" | "all";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Turn a preset into the window and slicing the server wants.
 *
 * `earliest` is the company's oldest bid, which the server returns precisely so
 * "all time" does not have to be guessed at — asking for the year 1970 would
 * make the chart draw fifty empty years.
 */
export function rangeForPreset(
  preset: RangePreset,
  now: Date,
  earliest: string | null
): { from: string; to: string; granularity: "month" | "quarter" } {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  if (preset === "ytd") {
    return {
      from: iso(new Date(Date.UTC(to.getUTCFullYear(), 0, 1))),
      to: iso(to),
      granularity: "month",
    };
  }
  if (preset === "24m") {
    return {
      from: iso(
        new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 23, 1))
      ),
      to: iso(to),
      // Twenty-four monthly columns is a forest. Quarters keep it readable.
      granularity: "quarter",
    };
  }
  if (preset === "all") {
    const start =
      earliest ?? iso(new Date(Date.UTC(to.getUTCFullYear(), 0, 1)));
    // Quarters once the history is long enough that months would not fit.
    const months = monthsBetween(new Date(`${start}T00:00:00Z`), to);
    return {
      from: start,
      to: iso(to),
      granularity: months > 18 ? "quarter" : "month",
    };
  }
  return {
    from: iso(
      new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1))
    ),
    to: iso(to),
    granularity: "month",
  };
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

export const RANGE_LABELS: Record<RangePreset, string> = {
  "12m": "Last 12 months",
  "24m": "Last 2 years",
  ytd: "Year to date",
  all: "All time",
};
