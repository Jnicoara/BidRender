/**
 * Electrical — the launch trade, and the worked example of the config shape.
 *
 * Everything here is content. If a sentence needs a component changed to say
 * it, the component is wrong — see types.ts for why that seam matters.
 *
 * ── On the voice ────────────────────────────────────────────────────────────
 * Written for someone who prices work for a living and has been sold software
 * before. That rules out most of the vocabulary a landing page reaches for by
 * default — "streamline", "empower", "leverage", "seamless" — which is how a
 * page announces it was written by somebody who has never taken off a set of
 * prints. Every claim is one the app can be held to today.
 *
 * ── And on length ───────────────────────────────────────────────────────────
 * Short on purpose. The previous version had four sections of prose before the
 * signup; a contractor deciding whether this is worth their evening needs the
 * headline, three steps and a box to type into.
 */
import type { TradeContent } from "./types";

export const electrical: TradeContent = {
  id: "electrical",
  label: "Electrical",

  meta: {
    title: "BidRidge — Electrical Estimating Software Built By An Electrician",
    description:
      "Take off plans, price materials and labor from your own rates, and send a professional proposal the same day. Estimating software built by an electrician, for electricians.",
    // The hero screenshot doubles as the sharing preview. One real image of the
    // product beats a separately-made card that has to be kept in step with it.
    ogImage: "/brand/shot-bid.jpg",
    ogImageAlt:
      "A BidRidge bid priced out: line items with quantities and hours beside a total breaking down materials, labor, overhead and markup",
  },

  hero: {
    // Says what it does first, and folds in the one credibility claim worth
    // making — which is what let the whole credibility section be deleted.
    headline: "Electrical estimating, built by an electrician",
    subhead:
      "Count devices off the plans, price them from your own material costs and labor rates, and send the proposal the same day.",
    ctaLabel: "Get early access",
    shot: {
      // A real capture of the running app, not a mockup.
      src: "/brand/shot-bid.jpg",
      alt: "A BidRidge bid priced out: line items grouped by suite with quantities, hours and costs, beside a bid total breaking down materials, labor, overhead and markup to a final bid price",
      width: 1523,
      height: 784,
    },
  },

  howItWorks: {
    heading: "How it works",
    steps: [
      {
        title: "Trace the plans",
        body: "Load the PDF the architect sent, set the sheet's scale, and mark each device where it sits. The count builds as you go.",
        icon: "ruler",
      },
      {
        title: "Price it from your own numbers",
        body: "Every device is an assembly of materials and hours, costed against your rates rather than a catalog's idea of them.",
        icon: "calculator",
      },
      {
        title: "Send the proposal",
        body: "Your letterhead, the work included, one price. Out the same day, not next week.",
        icon: "fileText",
      },
    ],
    // All that survives of the old differentiator grid: the one claim the three
    // steps do not already make.
    closingLine:
      "Every figure traces back to a material cost, an hour count and a percentage you set — nothing is guessed, and nothing lands on a bid without you putting it there.",
  },

  cta: {
    heading: "Get early access",
    body: "Early access is open to a small group of electrical contractors putting it on real bids.",
    buttonLabel: "Request access",
    placeholder: "you@yourcompany.com",
    privacy:
      "We'll only use this to notify you when early access opens. No spam, no list sharing, unsubscribe any time.",
    success: "You're on the list. We'll be in touch when a spot opens.",
    alreadyOn: "You're already on the list — we'll be in touch.",
  },

  vocabulary: {
    tradespeople: "electricians",
  },
};
