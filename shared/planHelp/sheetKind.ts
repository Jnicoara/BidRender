/**
 * "What is this sheet?" — the sheet-kind line and its card
 * (references/plan-reading-help-plan.md § 4; step 3 of § 7).
 *
 * ── DRAFT — NEEDS THE OWNER'S REVIEW BEFORE BETA (§ 9 Q5) ───────────────────
 * The card words were drafted by Track B on 2026-10-13, under the same rule
 * as the abbreviation and symbol lists: B drafts, the owner reads every line
 * before a beta user sees it. `SHEET_KINDS_REVIEW` says where it stands.
 *
 * ── How a kind is recognised ────────────────────────────────────────────────
 * From the sheet's TITLE only — the one the sheet list already shows
 * (shared/sheetIdentity.ts `sheetDisplay`), so a title the person corrected
 * flows straight through. Nothing is stored (§ 9 Q4). An unrecognised title
 * gives no kind, and the screen then shows nothing rather than "Unknown".
 *
 * The plan allowed the sheet NUMBER to break a tie. It is not used: the
 * rules below never tie (every kind found is ordered), and numbering differs
 * from firm to firm — `E1` is lighting on one set and power on the next — so
 * a number deciding anything would be a guess in a confident voice.
 *
 * ── A title with several kinds lists them ALL ───────────────────────────────
 * "LIGHTING PLAN & LUMINAIRE SCHEDULE" is a lighting plan AND a fixture
 * schedule. The first leads the line; the card lists the rest. Never guess
 * one and hide the other. Which one leads:
 *
 *   1. Demolition, always — it changes what every mark on the sheet means.
 *   2. On a PLAN ("... PLAN", "... PLANS"), the drawing kinds (lighting,
 *      power, systems, site), in the order the title says them.
 *   3. Everything else, in the order the title says it.
 *
 * And a drawing word in a title that is NOT a plan, beside another kind,
 * does not count: "LIGHTING CONTROL DETAILS" is details, "EXISTING POWER
 * RISER DIAGRAM" is a one-line — neither has fixtures or receptacles to
 * count, and a card saying "count receptacles" there would send somebody
 * looking for things that are not drawn. Alone ("E-101 LIGHTING") it still
 * counts.
 *
 * ── Rules for the card words ────────────────────────────────────────────────
 * - **Words, never numbers** (§ 9 Q6): no hours, no prices, no digits at all.
 *   `server/planHelpSheetKind.test.ts` fails on a digit.
 * - Keyed by `trade` from day one (CLAUDE.md § Project). Plumbing is a new
 *   entry with its own words, no code.
 */
import type { TradeId } from "../trades";

export const SHEET_KINDS_REVIEW = {
  status: "draft" as "draft" | "reviewed",
  note: "Draft - needs the owner's review before beta (plan-reading-help-plan.md § 9 Q5).",
};

export const SHEET_KINDS = [
  "notes",
  "lighting",
  "power",
  "panelSchedule",
  "oneLine",
  "fixtureSchedule",
  "demolition",
  "details",
  "site",
  "systems",
] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

/** The kinds that are drawings of the building to count on. */
const DRAWING_KINDS: ReadonlySet<SheetKind> = new Set<SheetKind>([
  "lighting",
  "power",
  "systems",
  "site",
]);

/**
 * The title words for each kind. Matched case-insensitively, as whole words.
 * A longer phrase is listed BEFORE a shorter one inside the same kind only
 * for readability — any match counts, and the earliest position wins.
 */
const TITLE_WORDS: Record<SheetKind, RegExp> = {
  notes:
    /\b(GENERAL NOTES|NOTES|LEGEND|SYMBOLS?|ABBREVIATIONS|SPECIFICATIONS?)\b/i,
  lighting: /\b(LIGHTING|ILLUMINATION|PHOTOMETRIC)\b/i,
  power: /\b(POWER|RECEPTACLES?|DEVICES?)\b/i,
  panelSchedule: /\b(PANEL ?SCHEDULES?|PANELBOARD SCHEDULES?|PANELBOARDS?)\b/i,
  oneLine: /\b(ONE[- ]?LINE|SINGLE[- ]?LINE|RISER)\b/i,
  fixtureSchedule:
    /\b((LIGHTING )?FIXTURE SCHEDULES?|LUMINAIRE SCHEDULES?|LIGHTING SCHEDULES?)\b/i,
  demolition: /\b(DEMOLITION|DEMO)\b/i,
  details: /\b(DETAILS?)\b/i,
  site: /\b(SITE)\b/i,
  systems:
    /\b(FIRE ALARM|SPECIAL SYSTEMS|SYSTEMS|SIGNAL|LOW[- ]VOLTAGE|DATA|COMMUNICATIONS?|TECHNOLOGY|SECURITY|TELECOM(MUNICATIONS)?)\b/i,
};

/** "... PLAN" / "... PLANS" — a drawing of the building, not a list or a diagram. */
const PLAN_WORD = /\bPLANS?\b/i;

/**
 * Every kind the title names, the one that leads first (see the header).
 * Empty for a title that says nothing recognisable — never a guess.
 */
export function sheetKinds(title: string | null | undefined): SheetKind[] {
  if (!title?.trim()) return [];
  let found = SHEET_KINDS.map(kind => ({
    kind,
    at: title.search(TITLE_WORDS[kind]),
  })).filter(f => f.at >= 0);

  // A fixture schedule's "LIGHTING" is not a lighting plan's.
  if (found.some(f => f.kind === "fixtureSchedule")) {
    const withoutSchedules = title.replace(
      new RegExp(TITLE_WORDS.fixtureSchedule.source, "gi"),
      " "
    );
    found = found.filter(
      f => f.kind !== "lighting" || TITLE_WORDS.lighting.test(withoutSchedules)
    );
  }

  // A demolition sheet is a drawing of the building too ("LIGHTING
  // DEMOLITION"), so it does not make the drawing words drop out.
  const plan = PLAN_WORD.test(title);
  const notDrawn = (k: SheetKind) =>
    !DRAWING_KINDS.has(k) && k !== "demolition";
  if (!plan && found.some(f => notDrawn(f.kind)))
    found = found.filter(f => !DRAWING_KINDS.has(f.kind));

  const rank = (f: { kind: SheetKind }) =>
    f.kind === "demolition" ? 0 : plan && DRAWING_KINDS.has(f.kind) ? 1 : 2;
  return found
    .sort((a, b) => rank(a) - rank(b) || a.at - b.at)
    .map(f => f.kind);
}

export type SheetKindCard = {
  trade: TradeId;
  kind: SheetKind;
  /** The card's heading and the line's first words: "Lighting plan". */
  label: string;
  /** After the dot on the line under the sheet name: "count fixtures and switches". */
  hint: string;
  /** What to do on a sheet like this, a few short lines. Words only. */
  whatToDo: string[];
  /** The things on a sheet like this that change a count. Words only. */
  watchFor: string[];
};

export const SHEET_KIND_CARDS: SheetKindCard[] = [
  {
    trade: "electrical",
    kind: "notes",
    label: "Notes and legend",
    hint: "read this first",
    whatToDo: [
      "Read it before counting anything. A note here can change the count on every other sheet — “all kitchen receptacles GFCI”, “a disconnect at each unit”.",
      "If it has a symbol legend, set your legend from it (Legend tab), so your counts match how this set draws things.",
      "Usually nothing to count on the sheet itself.",
    ],
    watchFor: [
      "TYP and UON — a note that applies to every one like it.",
      "Who furnishes what (OFCI, NIC, by others) — it takes items off your bid, or leaves the labor on it and the material off.",
    ],
  },
  {
    trade: "electrical",
    kind: "lighting",
    label: "Lighting plan",
    hint: "count fixtures and switches",
    whatToDo: [
      "Count fixtures by their type tag (A, B, EM…) — one count per tag, named from the fixture schedule.",
      "Count switches, dimmers and sensors.",
      "Switch legs and home runs are runs: trace them or measure them.",
    ],
    watchFor: [
      "Emergency and night-light fixtures, often a shaded or tagged version of an ordinary one.",
      "Exit signs, and fixtures shown only on the reflected ceiling plan.",
    ],
  },
  {
    trade: "electrical",
    kind: "power",
    label: "Power plan",
    hint: "count devices, trace home runs",
    whatToDo: [
      "Count receptacles by kind — duplex, GFCI, weatherproof, quad, floor.",
      "Count equipment connections: motors, water heaters, HVAC units, anything with a disconnect.",
      "Trace or measure home runs and the runs between devices.",
    ],
    watchFor: [
      "A height written beside a device (AFF) — it changes the box and the wire.",
      "(E) for existing and (R) for relocate — not new work.",
    ],
  },
  {
    trade: "electrical",
    kind: "panelSchedule",
    label: "Panel schedule",
    hint: "breakers, panel sizes, feeders",
    whatToDo: [
      "Breakers: count them by size and number of poles, panel by panel.",
      "Each panel's size, main breaker or main lugs only (MLO), and what feeds it.",
      "Nothing here is on the floor plan — lengths come from the plans.",
    ],
    watchFor: [
      "Spaces and spares — a spare is a breaker to buy, a space is not.",
      "Existing panels with only a few new breakers in them.",
    ],
  },
  {
    trade: "electrical",
    kind: "oneLine",
    label: "One-line / riser",
    hint: "what feeds what",
    whatToDo: [
      "Feeders and gear: what feeds what, and the wire and conduit size of each feeder.",
      "Count the gear: panels, transformers, disconnects, meters.",
      "Lengths come from the floor plans, not from here — a one-line is not drawn to scale.",
    ],
    watchFor: [
      "Existing gear drawn beside new — only the new is yours to buy.",
      "Who provides the service and the transformer (often the utility).",
    ],
  },
  {
    trade: "electrical",
    kind: "fixtureSchedule",
    label: "Fixture schedule",
    hint: "what each fixture tag is",
    whatToDo: [
      "What each fixture tag is: type, lamp, mounting, sometimes the maker.",
      "Use it to name your fixture counts on the lighting plans.",
      "Usually nothing to count on the sheet itself.",
    ],
    watchFor: [
      "Fixtures furnished by the owner (OFCI) — labor only.",
      "Mounting: recessed, surface, pendant or pole changes the parts.",
    ],
  },
  {
    trade: "electrical",
    kind: "demolition",
    label: "Demolition plan",
    hint: "what comes out",
    whatToDo: [
      "What comes out: count the removals here, and anything to be relocated.",
      "Set this sheet to Demo in the sheet’s menu (… then More options) and new marks start as Remove.",
      "Items to stay are often drawn here too — they are not removals.",
    ],
    watchFor: [
      "“Remove back to source” — the wire and conduit come out too, not just the device.",
      "(R) relocate — it comes out here and goes back in on the new plan.",
    ],
  },
  {
    trade: "electrical",
    kind: "details",
    label: "Details",
    hint: "how things are installed",
    whatToDo: [
      "How things are installed: mounting, supports, connections.",
      "Rarely anything to count — but a detail can add parts to every one of something (a bracket, a box extension, a seal).",
    ],
    watchFor: [
      "TYP on a detail — it applies to every one like it.",
      "Which plan the detail is called out from.",
    ],
  },
  {
    trade: "electrical",
    kind: "site",
    label: "Site plan",
    hint: "outside work",
    whatToDo: [
      "Outside work: poles, site lighting, trenches, feeders between buildings.",
      "Trenches and long runs are measured by the foot — check the scale before tracing.",
      "Count poles, pole bases and pull boxes.",
    ],
    watchFor: [
      "Who digs the trench and who backfills it.",
      "Utility work drawn on the same sheet that is not yours.",
    ],
  },
  {
    trade: "electrical",
    kind: "systems",
    label: "Systems plan",
    hint: "fire alarm, data, low voltage",
    whatToDo: [
      "Fire alarm, data, phone, security, low voltage — count the devices by kind.",
      "Check who does it: often a separate contractor, with the electrician providing boxes and conduit only.",
    ],
    watchFor: [
      "“Box and pipe only” notes — the device and wire are by others.",
      "Devices on the ceiling plan as well as the walls.",
    ],
  },
];

/** The card for a kind, for this trade. */
export function sheetKindCard(
  kind: SheetKind,
  trade: TradeId = "electrical"
): SheetKindCard | null {
  return (
    SHEET_KIND_CARDS.find(c => c.kind === kind && c.trade === trade) ?? null
  );
}
