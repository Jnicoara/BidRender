/**
 * The contract between the marketing page and a trade.
 *
 * ── The seam ────────────────────────────────────────────────────────────────
 * BidRidge is electrical-first by sequencing, not electrical-only by design
 * (CLAUDE.md § Project): a plumbing or HVAC launch is meant to be content plus
 * an unlock, not a refactor. The landing page has to be able to make the same
 * promise, and a page with "electrician" typed into its headline cannot.
 *
 * So everything a plumber would say differently lives here, and everything
 * structural — section order, layout, the brand, the signup mechanics — lives
 * in the components and is identical across trades. Adding a trade is a file
 * next to electrical.ts and a line in index.ts. It is never a component edit,
 * and client/src/lib/tradeContent.test.ts fails if that stops being true.
 *
 * ── Deliberately small ──────────────────────────────────────────────────────
 * This type used to carry a problem section, a differentiator grid and a
 * credibility block. They are gone. The page is a headline, three steps and a
 * signup, because that is what the rest of BidRidge looks like — dense screens
 * with restrained chrome — and a marketing page with six sections of cards did
 * not look like the product it was selling.
 *
 * The one survivor of what was cut is `closingLine`: a single sentence at the
 * end of the steps carrying the thing the differentiator grid existed to say.
 * If a future trade has nothing worth saying there, leave it out.
 */

import type { TradeId } from "@shared/trades";

/**
 * A product screenshot.
 *
 * `src` points at a real capture of the running app. There is no stock-photo
 * fallback and there should not be: it is the only image on the page, and a
 * hard-hat-and-clipboard photo tells a contractor the opposite of what the
 * screenshot does.
 */
export type TradeShot = {
  src: string;
  /** Alt text describing what the screen actually shows. */
  alt: string;
  /** Intrinsic size, so the browser reserves space and nothing jumps. */
  width: number;
  height: number;
};

/**
 * Icons a step may name.
 *
 * A config names a key; it never imports a component. That keeps a content file
 * from being able to break the render, and it is the same closed-set instinct
 * used by the navigation helper and the co-pilot's action list — choose between
 * options, never construct one.
 *
 * Deliberately short. If a trade needs a symbol this cannot express, add one
 * entry here; that is a shared-chrome decision, and the only thing about a new
 * trade that should touch code.
 */
export const STEP_ICONS = [
  "ruler",
  "calculator",
  "fileText",
  "layers",
  "gauge",
  "zap",
] as const;

export type StepIconKey = (typeof STEP_ICONS)[number];

/**
 * One step of the three: an icon, a title and a single sentence.
 *
 * The icon is content rather than chrome because it describes the step, and a
 * plumbing "trace the plans" may well want a different one.
 */
export type TradeStep = {
  title: string;
  body: string;
  icon: StepIconKey;
};

export type TradeContent = {
  /**
   * Stable id, and the SAME string the data model stores.
   *
   * `shared/trades.ts` is the registry both sides read: this id is what lands
   * in `assemblies.trade`, `materials.trade` and `early_access_signups.tradeId`
   * for the trade this page sells. It used to be only a comment saying so,
   * which is not a connection — client/src/lib/tradeContent.test.ts now checks
   * that every shipped trade here is one the registry names, so a landing page
   * cannot advertise a trade no row can be tagged with.
   */
  id: TradeId;
  /** What this trade is called, capitalised — "Electrical". */
  label: string;

  /** Search and link-preview text. */
  meta: {
    /** The <title>. Leads with what the product does; the name does not explain itself. */
    title: string;
    /** ~155 characters, written for a person scanning results. */
    description: string;
    /** Absolute-from-root path to the sharing preview image. */
    ogImage: string;
    ogImageAlt: string;
  };

  hero: {
    /**
     * One line saying what the app does.
     *
     * Not the product name on its own — "BidRidge" tells a first-time visitor
     * nothing, and someone who bounces off this line never learns what was on
     * offer.
     */
    headline: string;
    /** ONE sentence on the mechanics. Not a paragraph. */
    subhead: string;
    /** The single button. There is no second call to action on this page. */
    ctaLabel: string;
    shot: TradeShot;
  };

  howItWorks: {
    heading: string;
    /** Exactly three. The test enforces it — four steps is the old page creeping back. */
    steps: [TradeStep, TradeStep, TradeStep];
    /**
     * One closing sentence, or omitted.
     *
     * All that is kept of the differentiator and credibility sections. It earns
     * its place only if it says something the three steps do not.
     */
    closingLine?: string;
  };

  cta: {
    heading: string;
    /** One short line. */
    body: string;
    buttonLabel: string;
    placeholder: string;
    /** What the address will and will not be used for. Sits with the field. */
    privacy: string;
    /** Shown after a successful signup. */
    success: string;
    /** Shown when the address is already on the list — not an error. */
    alreadyOn: string;
  };

  /**
   * The words this trade uses for its own people.
   *
   * Kept apart from the prose so the shared footer can say "electricians"
   * without any component knowing that word.
   */
  vocabulary: {
    /** "electricians" — plural, lower case. */
    tradespeople: string;
  };
};
