/**
 * "Profit not set" / "Overhead not set" on a bid (owner, 2026-10-16).
 *
 * A company that never opened Settings › Pricing has profit and overhead
 * stored as 0 — the shipped fallback (`server/db.ts`
 * FALLBACK_PRICING_DEFAULTS), not anybody's choice — and every bid that
 * follows it adds nothing for either, while looking complete. The bid says
 * so in amber, with a button to Settings › Pricing, as Settings does for an
 * unset labor rate for traced runs. A LABEL ONLY: it reads the settings the
 * bid already priced with and changes no number.
 *
 * ── Which bids ──────────────────────────────────────────────────────────────
 * Only a group the bid takes FROM THE COMPANY (`profitSource` /
 * `overheadSource` "company"). A value typed on the bid itself, 0 included,
 * is somebody's decision and is never flagged.
 *
 * ── A typed 0 is a decision (N5, 0164, owner 2026-10-16) ─────────────────────
 * Until 0164 `pricing_defaults` kept no record of whether a 0 was typed or
 * never set, so a shop that deliberately runs 0% saw the label too. Now a
 * Settings save stamps `profitSetAt` / `overheadSetAt`, and a group the
 * company has SET is never flagged, whatever its value. The stamps are a
 * REQUIRED argument, so no caller can forget them and fall back to "every
 * 0 is unset". A company that typed 0 before 0164 has no stamp and sees the
 * label until it saves that group once.
 */
import type { ResolvedPricingSettings } from "./pricing";

export type MarginsNotSet = { profit: boolean; overhead: boolean };

/** When the company last saved each group in Settings; null = never. */
export type CompanyMarginsSetAt = {
  profitSetAt: Date | string | null;
  overheadSetAt: Date | string | null;
};

export function marginsNotSet(
  settings: Pick<
    ResolvedPricingSettings,
    "profit" | "overhead" | "profitSource" | "overheadSource"
  >,
  company: CompanyMarginsSetAt
): MarginsNotSet {
  return {
    profit:
      settings.profitSource === "company" &&
      company.profitSetAt === null &&
      settings.profit.value === 0,
    overhead:
      settings.overheadSource === "company" &&
      company.overheadSetAt === null &&
      (!settings.overhead.enabled || settings.overhead.value === 0),
  };
}

/** The strip's sentence, or null when there is nothing to say. */
export function marginsNotSetSentence(m: MarginsNotSet): string | null {
  if (m.profit && m.overhead)
    return "Profit and overhead not set — this bid adds nothing for either. Your company default for both is 0 because nobody has set them.";
  if (m.profit)
    return "Profit not set — this bid adds no profit. Your company default is 0 because nobody has set it.";
  if (m.overhead)
    return "Overhead not set — this bid adds no overhead. Your company default is 0 because nobody has set it.";
  return null;
}
