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
import { FAMILY_SHAPE, deviceFamily, type DeviceFamily } from "./deviceFamily";
import {
  MARK_COLORS,
  MARK_SHAPES,
  MARK_SHAPE_NAME,
  isMarkColor,
  type MarkColor,
  type MarkShape,
} from "./takeoffMarks";

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

/**
 * A look somebody CHOSE, as stored (`markShape`, `markLetter`, `markColor` on
 * `takeoff_groups`, `symbol_links` and `assemblies`, migrations 0099–0101).
 * NULL is automatic. A value the code no longer knows — a shape or colour
 * since dropped from the palette, a letter that is not a letter — reads as
 * automatic too, so a palette change never needs a migration.
 */
export type PinLook = {
  shape?: string | null;
  letter?: string | null;
  color?: string | null;
};

export type PinCount = {
  id: number;
  label: string;
  /** The linked assembly's name, for the default letter and family. */
  assemblyName?: string | null;
  /** The linked assembly's category — the family's last default. */
  assemblyCategory?: string | null;
  /**
   * Looks chosen at each level (pin plan § 6, § 11.4). `count` is this job
   * only; `symbol` is the captured legend item, every job; `assembly` is the
   * library assembly, every job, and a DEFAULT — it bumps when two counts on
   * a bid share it, where a count or symbol choice never does.
   */
  chosen?: {
    count?: PinLook | null;
    symbol?: PinLook | null;
    assembly?: PinLook | null;
  };
};

/** Where each part of a pin's look came from — the editor says it. */
export type LookSource = "count" | "symbol" | "assembly" | "automatic";

/** A chosen letter, tidied — or null when it is not one a pin can carry. */
export function cleanLetter(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const tidy = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9.]{0,3}$/.test(tidy) ? tidy : null;
}

function cleanShape(value: string | null | undefined): MarkShape | null {
  return (MARK_SHAPES as readonly string[]).includes(value ?? "")
    ? (value as MarkShape)
    : null;
}

function cleanColor(value: string | null | undefined): MarkColor | null {
  return isMarkColor(value) ? value : null;
}

/**
 * Everything a count's pins look like. Shape comes from the count's device
 * family (shared/deviceFamily.ts) — its OWN name first — so two items on one
 * assembly can differ in shape as well as letter and colour.
 */
export type PinStyle = {
  letter: string;
  color: MarkColor;
  shape: MarkShape;
  /**
   * The family the shape came from — also what says whether a run meets this
   * device at the wall or in the middle (shared/connectPoint.ts), so the pin
   * and the connect point can never disagree about what a device is.
   */
  family: DeviceFamily;
  /** Where the shape, letter and colour each came from. */
  source: { shape: LookSource; letter: LookSource; color: LookSource };
  /**
   * Other counts on this bid wearing the SAME chosen letter. A count- or
   * symbol-level letter is never renumbered (§ 11.4): a clash is shown, and
   * the estimator changes one. Empty when there is none.
   */
  clashesWith: number[];
};

/*
 * ── BUILT 2026-10-05 (Track B), on migrations 0098–0101 ─────────────────────
 * 1. CHOSEN looks, resolved below: precedence count → symbol → assembly →
 *    automatic (plan § 11.4). A count- or symbol-level letter is placed before
 *    the tags and never bumped (a clash is flagged in `clashesWith`); an
 *    assembly-level letter or colour is a default and bumps like an automatic
 *    one. A chosen colour wins and the automatic ones step around it — the
 *    `runTypeColor` rule for runs.
 *
 *    THE SHAPE CAN BE CHOSEN TOO. § 11.4 said "the shape stays the family's,
 *    always"; the owner asked on 2026-10-05 for shape, letter and colour per
 *    count, so a chosen shape wins and the family's is the automatic one. The
 *    plan says so where § 11.4 is.
 * 2. MARK STATUS is per MARK, so it is not in this per-count map:
 *    `markAppearance` (shared/takeoffMarks.ts) takes the stamp's status, and
 *    what a status may COST is shared/markStatus.ts.
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
  const letterSource = new Map<number, LookSource>();
  const used = new Set<string>();

  /** The first level that chose a valid value, and which level it was. */
  const firm = <T>(
    count: PinCount,
    clean: (v: string | null | undefined) => T | null,
    key: keyof PinLook
  ): { value: T; source: "count" | "symbol" } | null => {
    const c = clean(count.chosen?.count?.[key]);
    if (c !== null) return { value: c, source: "count" };
    const s = clean(count.chosen?.symbol?.[key]);
    if (s !== null) return { value: s, source: "symbol" };
    return null;
  };

  const place = (count: PinCount, base: string, source: LookSource) => {
    const code = used.has(base) ? bump(base, used) : base;
    used.add(code);
    letters.set(count.id, code);
    letterSource.set(count.id, source);
  };

  // A letter somebody chose for this count or its symbol: first, and never
  // renumbered — two of them that collide are SHOWN, not silently fixed.
  const firmLetterOwners = new Map<string, number[]>();
  for (const count of byFirstUse) {
    const chosen = firm(count, cleanLetter, "letter");
    if (!chosen) continue;
    letters.set(count.id, chosen.value);
    letterSource.set(count.id, chosen.source);
    used.add(chosen.value);
    firmLetterOwners.set(chosen.value, [
      ...(firmLetterOwners.get(chosen.value) ?? []),
      count.id,
    ]);
  }
  // Tags next: a drawing prints them, so nothing automatic may take one.
  for (const count of byFirstUse) {
    if (letters.has(count.id)) continue;
    const tag = fixtureTag(count.label);
    if (tag) place(count, tag, "automatic");
  }
  for (const count of byFirstUse) {
    if (letters.has(count.id)) continue;
    // An assembly's letter is a DEFAULT for every count of it, so it bumps.
    const fromAssembly = cleanLetter(count.chosen?.assembly?.letter);
    place(
      count,
      fromAssembly ??
        tableLetter(count.label) ??
        tableLetter(count.assemblyName) ??
        initial(count.label),
      fromAssembly ? "assembly" : "automatic"
    );
  }

  // Colours. A count/symbol choice wins outright; an assembly's colour goes to
  // the first count of it that is free to take it (a default, so the second
  // steps aside); the rest take what is left, in first-use order.
  const colors = new Map<number, { color: MarkColor; source: LookSource }>();
  const reserved = new Set<MarkColor>();
  for (const count of byFirstUse) {
    const chosen = firm(count, cleanColor, "color");
    if (!chosen) continue;
    colors.set(count.id, { color: chosen.value, source: chosen.source });
    reserved.add(chosen.value);
  }
  for (const count of byFirstUse) {
    if (colors.has(count.id)) continue;
    const fromAssembly = cleanColor(count.chosen?.assembly?.color);
    if (fromAssembly && !reserved.has(fromAssembly)) {
      colors.set(count.id, { color: fromAssembly, source: "assembly" });
      reserved.add(fromAssembly);
    }
  }
  const free = MARK_COLORS.filter(c => !reserved.has(c));
  const palette = free.length > 0 ? free : [...MARK_COLORS];
  let k = 0;
  for (const count of byFirstUse) {
    if (colors.has(count.id)) continue;
    colors.set(count.id, {
      color: palette[k++ % palette.length],
      source: "automatic",
    });
  }

  const styles = new Map<number, PinStyle>();
  for (const count of byFirstUse) {
    const family = deviceFamily(count);
    const shape =
      firm(count, cleanShape, "shape") ??
      (cleanShape(count.chosen?.assembly?.shape)
        ? {
            value: cleanShape(count.chosen?.assembly?.shape)!,
            source: "assembly" as const,
          }
        : null);
    const letter = letters.get(count.id) ?? initial(count.label);
    const color = colors.get(count.id)!;
    styles.set(count.id, {
      letter,
      color: color.color,
      shape: shape?.value ?? FAMILY_SHAPE[family],
      family,
      source: {
        shape: shape?.source ?? "automatic",
        letter: letterSource.get(count.id) ?? "automatic",
        color: color.source,
      },
      clashesWith: (firmLetterOwners.get(letter) ?? []).filter(
        id => id !== count.id
      ),
    });
  }
  return styles;
}

/**
 * A pin in plain words — "S3 diamond", "R wide rectangle" — for the takeoff
 * CSV's "Pin" column (pin plan decision 11), so a row in the file can be
 * matched to a marked-up screen. Code and shape only: no glyph, and no
 * colour, which a black-and-white printout of the file cannot show either.
 */
export function pinCode(style: Pick<PinStyle, "letter" | "shape">): string {
  return `${style.letter} ${MARK_SHAPE_NAME[style.shape].toLowerCase()}`;
}
