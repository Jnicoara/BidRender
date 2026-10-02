/**
 * The LETTER on a count's pin, and its colour, per bid — computed, nothing
 * stored (references/track-b-count-pin-styles-plan.md §§ 3, 5, 11.4).
 *
 * ── Why a letter ─────────────────────────────────────────────────────────────
 * A letter survives a black-and-white print, colour blindness and a seventh
 * count, which shape and colour do not. It matters most where several items
 * share one assembly: each has its own count (shared/assemblyCounts.ts), but
 * the same assembly gave them the same category and so the same SHAPE, and
 * until this file the only thing telling three lights apart on a sheet was a
 * colour hashed from an id — which could repeat. Since 2026-10-01 the shape
 * comes from the count's own name too (shared/deviceFamily.ts), so a duplex
 * and a switch on one assembly differ in shape. Three lights are still three
 * squares, and their letters and colours tell them apart.
 *
 * ── Where a letter comes from, in order ─────────────────────────────────────
 *  1. The ITEM — the count's own name. A fixture tag in it wins: "Linear 8ft
 *     (A-7)" wears A7, which is what the drawing prints beside the symbol
 *     (count-by-tag-plan.md § 3 — a trailing "(…)" tag first, then a leading
 *     one like "A1 luminaire"). Else what the name says it is: "GFCI" → G.
 *  2. The ASSEMBLY, as a default — what the assembly's name says it is.
 *  3. The first letter of the count's name.
 *
 * A letter or colour CHOSEN on an item, assembly or count (pin plan § 6)
 * needs Track A's nine nullable style columns; until they land everything
 * here is the automatic answer, which is what § 5e requires anyway — a
 * feature nobody configures must work without being configured.
 *
 * ── Two counts on one bid never show the same letter ─────────────────────────
 * Per BID, not per sheet, so a count wears one letter on every sheet of the
 * job. When a second count would land on a letter already used, the later
 * one (by first use — the lower id keeps it) becomes R2, R3 — the way plans
 * already number fixture types. **A bump never lands on a code the default
 * table gives a meaning to**: a second single-pole count is S2, then S5, never
 * S3, because S3 is a 3-way switch on every plan. Tags are placed first, so an
 * automatic letter can never take a tag a drawing prints.
 *
 * ── Colour: first use per bid ───────────────────────────────────────────────
 * The six mark colours in order of first use, the run-type rule (T14). The
 * first six counts on a bid never share a colour; past six they repeat, and
 * the letter is what keeps them apart (pin plan § 5 — "colour narrows; the
 * letter decides").
 */
import { FAMILY_SHAPE, deviceFamily } from "./deviceFamily";
import { MARK_COLORS, type MarkColor, type MarkShape } from "./takeoffMarks";

/**
 * The default table (pin plan § 3), most specific first: "3-way switch" must
 * be S3 before "switch" makes it S, and "GFCI receptacle" G before R.
 * Matched on whole words of the lower-cased name.
 */
const DEFAULT_LETTERS: readonly (readonly [RegExp, string])[] = [
  // A safety switch is a disconnect, not a wall switch, so it sits above
  // `/\bswitch/` (pin plan decision 4 — it read S until 2026-10-01).
  [/\b(disconnect|safety switch|fused switch|non-fused|nonfused)/, "DS"],
  // Switches & controls
  [/\b(3[- ]?way|three[- ]way)\b/, "S3"],
  [/\b(4[- ]?way|four[- ]way)\b/, "S4"],
  [/\bdimmer/, "SD"],
  [/\b(occupancy|vacancy|occ sensor|motion sensor)\b/, "O"],
  [/\btimer\b/, "SK"],
  [/\bthermostat/, "T"],
  [/\bswitch/, "S"],
  // Data / telecom — above receptacles, because a "data outlet" or "TV
  // outlet" is not a receptacle (it read R until the screen check, 2026-10-01;
  // shared/deviceFamily.ts orders its words the same way).
  [/\b(data\/voice|voice\/data|combo)\b/, "DV"],
  [/\b(wap|wireless access|access point)\b/, "WA"],
  [/\b(tv|catv|coax)\b/, "TV"],
  [/\b(data|cat ?5e?|cat ?6a?)\b/, "D"],
  [/\b(voice|phone|telephone)\b/, "V"],
  // Receptacles & boxes
  [/\b(gfci|gfi)\b/, "G"],
  [/\b(quad|fourplex|double duplex)\b/, "Q"],
  [/\b(weatherproof|wp|in-use|in use)\b/, "W"],
  [/\busb\b/, "U"],
  [/\bisolated ground\b/, "I"],
  [/\b(floor box|floor recep\w*|floor outlet)\b/, "FB"],
  [/\b(240\s?v?|range|dryer|special purpose|welder)\b/, "P"],
  [/\b(junction|j-box|jbox|j box)\b/, "J"],
  [/\b(receptacle|recep|duplex|outlet|plug)s?\b/, "R"],
  // A lighting PANEL is a panelboard; an LED flat panel is a light.
  [/\b(lighting panel|panelboard|panel board|load ?center)\b/, "PN"],
  [/\b(flat panel|panel light)\b/, "L"],
  // Lighting
  [/\bexit\b/, "X"],
  [/\b(emergency|bug[- ]?eye|egress light)\b/, "E"],
  [
    /\b(light|lights|lighting|luminaire|fixture|troffer|linear|downlight|can light|recessed|pendant|sconce)\b/,
    "L",
  ],
  // Fire alarm
  [/\bsmoke/, "SM"],
  [/\bheat detector/, "H"],
  [/\b(horn|strobe)/, "HS"],
  [/\b(fire alarm|pull station)\b/, "F"],
  // Equipment
  [/\bpanel/, "PN"],
  [/\bmotor/, "M"],
  [/\b(rtu|ahu|mechanical|hvac|condenser|furnace)\b/, "ME"],
  // Security
  [/\bcamera/, "C"],
  [/\bcard reader/, "K"],
];

/** Every code the table gives a meaning to. A bump never produces one. */
export const RESERVED_LETTERS: ReadonlySet<string> = new Set(
  DEFAULT_LETTERS.map(([, code]) => code)
);

/** The longest letter a pin carries; a longer tag is not drawn as a tag. */
const MAX_TAG = 4;

/**
 * A fixture tag in a count's name, without its hyphen: "(A-7)" → "A7",
 * "A1 luminaire" → "A1", "Linear (F3a)" → "F3A". A trailing "(…)" first,
 * because that is how a tag split from a symbol is named (count-by-tag-plan
 * § 1); a leading one only when it has a digit, so "A light" is not a tag.
 */
export function fixtureTag(name: string): string | null {
  const tidy = (raw: string) => raw.replace(/[-\s.]/g, "").toUpperCase();
  const trailing = name.match(/\(([A-Za-z]{1,2}[-\s.]?\d{0,2}[A-Za-z]?)\)\s*$/);
  if (trailing) {
    const tag = tidy(trailing[1]);
    if (tag.length <= MAX_TAG) return tag;
  }
  const leading = name.match(/^([A-Za-z]{1,2}-?\d{1,2}[A-Za-z]?)\b/);
  if (leading) {
    const tag = tidy(leading[1]);
    if (tag.length <= MAX_TAG) return tag;
  }
  return null;
}

/** What the table calls a thing by its name, or null. */
export function tableLetter(name: string | null | undefined): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const [pattern, code] of DEFAULT_LETTERS)
    if (pattern.test(lower)) return code;
  return null;
}

/** The first letter of a name, as a last resort — "?" for a name with none. */
function initial(name: string): string {
  const match = name.match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "?";
}

export type PinCount = {
  id: number;
  label: string;
  /** The linked assembly's name, for the default letter and family. */
  assemblyName?: string | null;
  /** The linked assembly's category — the family's last default. */
  assemblyCategory?: string | null;
};

/**
 * Everything a count's pins look like. Shape comes from the count's device
 * family (shared/deviceFamily.ts) — its OWN name first — so two items on one
 * assembly can differ in shape as well as letter and colour.
 */
export type PinStyle = { letter: string; color: MarkColor; shape: MarkShape };

/*
 * ── NOT BUILT: chosen looks and mark status — where they plug in ────────────
 * Both wait for Track A's columns (pin plan § 12); see todo.md, "Pin styles,
 * step 2 and 3". Nothing below reads them yet, on purpose: a look the
 * database cannot store would vanish on reload, and a status look drawn
 * before the bid applies the status would show a price the bid is not using.
 *
 * 1. CHOSEN shape / letter / colour (`markShape`, `markLetter`, `markColor` on
 *    `takeoff_groups`, `symbol_links`, `assemblies`). Add them to `PinCount`
 *    as `chosen` and resolve here, precedence count → symbol → assembly →
 *    automatic (plan § 11.4): a COUNT- or SYMBOL-level letter is placed before
 *    the tags and never bumped (a clash is flagged, not renumbered); an
 *    ASSEMBLY-level letter is a default and bumps like an automatic one. A
 *    chosen colour wins and the automatic ones step around it — copy
 *    `runTypeColor` in shared/takeoffMarks.ts, which is that rule for runs.
 *    A stored value the code no longer knows (`isMarkColor`, `MARK_SHAPES`)
 *    reads as automatic.
 * 2. MARK STATUS (`takeoff_stamps.status`: new / existing / remove /
 *    relocate, NULL = new). Per MARK, not per count, so it does not belong in
 *    this per-count map: `markAppearance` gains the stamp's status and the
 *    overlay draws filled / hollow-solid / X / arrow badge (plan § 7).
 */

/** The next code after `base` that is neither used nor a table meaning. */
function bump(base: string, used: ReadonlySet<string>): string {
  // "A7" + 2 would read as A72; a base that already ends in a digit takes a dot.
  const join = /\d$/.test(base) ? "." : "";
  for (let n = 2; ; n++) {
    const code = `${base}${join}${n}`;
    if (!used.has(code) && !RESERVED_LETTERS.has(code)) return code;
  }
}

/**
 * Letter and colour for every count on one bid. Pass EVERY count on the bid,
 * not one sheet's, or the same count would wear different letters on
 * different sheets.
 */
export function pinStylesForBid(
  counts: readonly PinCount[]
): Map<number, PinStyle> {
  const byFirstUse = [...counts].sort((a, b) => a.id - b.id);
  const letters = new Map<number, string>();
  const used = new Set<string>();

  const place = (count: PinCount, base: string) => {
    const code = used.has(base) ? bump(base, used) : base;
    used.add(code);
    letters.set(count.id, code);
  };

  // Tags first: a drawing prints them, so nothing automatic may take one.
  for (const count of byFirstUse) {
    const tag = fixtureTag(count.label);
    if (tag) place(count, tag);
  }
  for (const count of byFirstUse) {
    if (letters.has(count.id)) continue;
    place(
      count,
      tableLetter(count.label) ??
        tableLetter(count.assemblyName) ??
        initial(count.label)
    );
  }

  const styles = new Map<number, PinStyle>();
  byFirstUse.forEach((count, i) =>
    styles.set(count.id, {
      letter: letters.get(count.id) ?? initial(count.label),
      color: MARK_COLORS[i % MARK_COLORS.length],
      shape: FAMILY_SHAPE[deviceFamily(count)],
    })
  );
  return styles;
}
