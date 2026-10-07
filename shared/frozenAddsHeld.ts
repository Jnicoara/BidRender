/**
 * The frozen ADDS (pricing/frozen-names.json, 153 rows, 2026-10-07) that the
 * catalog does NOT ship, and why — and those shipped under a corrected name.
 *
 * Hand-written, unlike shared/frozenMaterialNames.ts. Every frozen add must be
 * shipped or listed here; server/frozenMaterialNames.test.ts fails otherwise,
 * so an add can be held, but never silently dropped.
 *
 * History: on the first pass 59 adds were held for the owner, because a
 * recorded decision or a test already spoke to them. The owner answered the
 * same day (second answers): 3-1/2" ships as a full size for EMT and PVC Sch
 * 40; 150A+ two-pole and main breakers ship; every wafer, canless and
 * CCT-disc size ships as its own item; "Wire mold for low voltage" is renamed;
 * the QO-only 60A/70A single-pole stay off.
 */

/** Frozen add name -> the name it ships under. */
export const FROZEN_ADDS_SHIPPED_AS: Readonly<Record<string, string>> = {
  // Q4 (owner, 2026-10-07): low-voltage cable states its metal at the end.
  "Cat6 plenum cable": "Cat6 plenum cable Copper",
  // The shipped riser strap's pattern, '2" riser strap' (duplicate pair the
  // owner settled "keep A").
  'Riser strap, 3"': '3" riser strap',
  // 3-1/2" ships as a whole family, named by the family's own pattern
  // (conduit.ts) — EMT connectors and couplings state their style, and every
  // body is "<size> <raceway> <shape> conduit body".
  '3-1/2" EMT connector': '3-1/2" EMT set-screw connector',
  '3-1/2" EMT coupling': '3-1/2" EMT set-screw coupling',
  'Conduit body, 3-1/2" LB': '3-1/2" EMT LB conduit body',
  // Canless wafers are one family, every size named alike (lighting.ts):
  // the 4" and 6" are "… canless wafer LED downlight".
  '2" canless LED downlight': '2" canless wafer LED downlight',
  '3" canless LED downlight': '3" canless wafer LED downlight',
  '8" canless LED downlight': '8" canless wafer LED downlight',
  // Owner, 2026-10-07: generic name first, the trade word beside it.
  "Wire mold for low voltage": "Surface raceway (wire mold), low voltage",
  // Owner's third answers, 2026-10-07: the variants carry "canless" so the
  // plain canless wafer leads a typed "6 wafer" (lighting.ts).
  ...Object.fromEntries(
    ['2"', '3"', '4"', '5"', '6"', '8"'].flatMap(size =>
      ["CCT selectable", "gimbal", "slim", "wet rated"].map(variant => [
        `${size} wafer LED downlight, ${variant}`,
        `${size} canless wafer LED downlight, ${variant}`,
      ])
    )
  ),
};

export type HeldAdd = {
  kind: "duplicate" | "declined";
  why: string;
};

const DUP_WEATHERHEAD: HeldAdd = {
  kind: "duplicate",
  why: 'Shipped in metal AND PVC at this size ("2" metal weatherhead", "2" PVC weatherhead").',
};
const DUP_SWEEP: HeldAdd = {
  kind: "duplicate",
  why: 'Shipped as "N" PVC Sch 40 90-degree sweep, 36" radius" (the sweep matrix).',
};
const QO_ONLY: HeldAdd = {
  kind: "declined",
  why: 'Owner, 2026-10-07: "NO: the QO-only 60A/70A single-pole (keep off)". A one-maker part is a brand variant (CLAUDE.md § Brands); power.ts keeps them on the pricing sheet.',
};

export const FROZEN_ADDS_NOT_SEEDED: Readonly<Record<string, HeldAdd>> = {
  'Weatherhead, 2"': DUP_WEATHERHEAD,
  'Weatherhead, 2-1/2"': DUP_WEATHERHEAD,
  'Weatherhead, 3"': DUP_WEATHERHEAD,
  'PVC sweep, 2" 36" radius': DUP_SWEEP,
  'PVC sweep, 3" 36" radius': DUP_SWEEP,
  'PVC sweep, 4" 36" radius': DUP_SWEEP,
  "Meter socket hub": {
    kind: "duplicate",
    why: 'Ships as "2" meter hub" — power.ts says so where it is defined.',
  },
  "T-bar box hanger": {
    kind: "duplicate",
    why: 'Ships as "Grid box bracket" (search words "t-bar ceiling box hanger"; boxes.ts names it the T-bar version).',
  },
  "60A Single-Pole breaker": QO_ONLY,
  "70A Single-Pole breaker": QO_ONLY,
};
