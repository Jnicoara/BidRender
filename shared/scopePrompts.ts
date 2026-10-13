/**
 * "WHO DOES THIS?" — the eight shipped prompts (scope-tags-plan.md step 6a;
 * owner Q9: ship them, editable later). A prompt names a kind of work whose
 * scope is often split on a job — light fixtures, permits, trenching — and
 * lists the bid lines that look like it and nobody has answered yet.
 *
 * ── It asks, it never answers ───────────────────────────────────────────────
 * A match is a QUESTION, shown in the bid's "Who does what" card. Nothing is
 * tagged until a person picks a chip, which is the line menu's own call with
 * Undo (`useSetLineScope`). So a loose match costs a question, never a number
 * (plan § 5: step 6 moves no number).
 *
 * ── Only lines nobody has answered ──────────────────────────────────────────
 * `scopeTag` NULL is "not said"; `install` is "somebody said we install", and
 * that is exactly what stops a prompt asking again (plan § 2). This is the
 * one place that tells the two apart — every money rule folds them together
 * (`scopeOf`, shared/lineScope.ts).
 *
 * ── Words, not substrings ───────────────────────────────────────────────────
 * "light" would catch "light switch"; "range" sits inside "arrange". So a
 * line's NAME is split into words and a match is a whole word or a whole run
 * of words, a trailing plural "s" ignored on both sides. `notWords` take a
 * line back out — "Time clock and lighting contactor" is in the Lighting
 * category and is not a light fixture.
 *
 * ── Why appliances and EV chargers leave out circuits and receptacles ───────
 * The plan names the UNIT ("EV charger units"): the thing an owner may buy.
 * A line called "EV charger circuit, 48A" or "Dryer receptacle, 30A" is our
 * wiring to it, and asking "owner furnishes?" about it invites a tag that
 * would take our own wire off the price. Recorded in the plan (step 6a).
 *
 * 6b turns this constant into the seed of an editable list (S2).
 */
import type { LineScope } from "./lineScope";

export type ScopePrompt = {
  /** Stable id; 6b's seed rows will carry it. */
  key: string;
  /** What the card says: "Light fixtures". */
  label: string;
  /** Assembly categories that match on their own (`ASSEMBLY_CATEGORIES`). */
  categories: readonly string[];
  /** Whole words or runs of words in the line's name. */
  words: readonly string[];
  /** Words that take a line back out, whatever matched it. */
  notWords: readonly string[];
};

const OUR_WIRING = [
  "circuit",
  "receptacle",
  "connection",
  "whip",
  "disconnect",
  "conduit",
  "stub",
  "outlet",
];

export const SHIPPED_SCOPE_PROMPTS: readonly ScopePrompt[] = [
  {
    key: "light-fixtures",
    label: "Light fixtures",
    categories: ["Lighting"],
    words: [
      "fixture",
      "light fixture",
      "luminaire",
      "troffer",
      "downlight",
      "high bay",
      "low bay",
      "wall pack",
      "wallpack",
      "strip light",
      "led strip",
      "wraparound",
      "vapor tight",
      "exit sign",
      "emergency light",
      "can light",
      "recessed can",
      "pendant",
      "chandelier",
      "sconce",
      "flood light",
      "floodlight",
      "pole light",
      "track light",
      "bollard light",
    ],
    notWords: [
      "contactor",
      "time clock",
      "photocell",
      "sensor",
      "switch",
      "dimmer",
      "transformer",
      "fan",
    ],
  },
  {
    key: "appliances",
    label: "Appliances",
    categories: [],
    words: [
      "appliance",
      "range",
      "oven",
      "cooktop",
      "dishwasher",
      "disposal",
      "microwave",
      "refrigerator",
      "fridge",
      "freezer",
      "washer",
      "dryer",
      "water heater",
      "range hood",
    ],
    notWords: OUR_WIRING,
  },
  {
    key: "low-voltage",
    label: "Low voltage / data",
    categories: [],
    words: [
      "data",
      "cat6",
      "cat 6",
      "cat5e",
      "network",
      "ethernet",
      "low voltage",
      "telephone",
      "phone",
      "coax",
      "cable tv",
      "speaker",
      "camera",
      "access point",
      "intercom",
      "access control",
      "card reader",
      "doorbell",
      "patch panel",
      "structured media",
    ],
    notWords: ["fire alarm", "strobe", "smoke"],
  },
  {
    key: "fire-alarm",
    label: "Fire alarm devices",
    categories: [],
    words: [
      "fire alarm",
      "smoke detector",
      "heat detector",
      "duct detector",
      "pull station",
      "horn",
      "strobe",
      "facp",
      "co detector",
      "carbon monoxide",
    ],
    notWords: [],
  },
  {
    key: "hvac-controls",
    label: "HVAC control wiring",
    categories: [],
    words: [
      "thermostat",
      "tstat",
      "t stat",
      "hvac control",
      "control wiring",
      "temperature control",
    ],
    notWords: [],
  },
  {
    key: "ev-chargers",
    label: "EV charger units",
    categories: [],
    words: ["ev charger", "evse", "car charger", "wall connector"],
    notWords: OUR_WIRING,
  },
  {
    key: "permits",
    label: "Permits",
    categories: [],
    words: ["permit", "permit fee", "inspection fee"],
    notWords: [],
  },
  {
    key: "trench-patch-paint",
    label: "Trenching, patching, painting",
    categories: [],
    words: [
      "trench",
      "trenching",
      "excavation",
      "backfill",
      "patch",
      "patching",
      "paint",
      "painting",
      "drywall repair",
      "saw cut",
      "sawcut",
      "core drill",
      "coring",
      "asphalt",
    ],
    // A patch PANEL is network gear, not a wall repair.
    notWords: ["patch panel", "patch cord"],
  },
];

/** The line shape the matcher reads. `scopeTag` and the category REQUIRED. */
export type PromptLine = {
  id: number;
  name: string;
  scopeTag: LineScope | null;
  /** The category of the assembly the line came from; null for any other. */
  assemblyCategory: string | null;
};

/** "Fixtures," → ["fixture"]: lower case, words only, a plural "s" dropped. */
export function nameWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(w =>
      w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w
    );
}

/** Whether `phrase` appears in `words` as a whole run of words. */
function hasRun(words: readonly string[], phrase: string): boolean {
  const run = nameWords(phrase);
  if (run.length === 0) return false;
  for (let i = 0; i + run.length <= words.length; i++)
    if (run.every((w, j) => words[i + j] === w)) return true;
  return false;
}

/** Whether one prompt asks about this line (answered or not). */
export function promptMatchesLine(
  prompt: ScopePrompt,
  line: Pick<PromptLine, "name" | "assemblyCategory">
): boolean {
  const words = nameWords(line.name);
  if (prompt.notWords.some(w => hasRun(words, w))) return false;
  if (
    line.assemblyCategory !== null &&
    prompt.categories.includes(line.assemblyCategory)
  )
    return true;
  return prompt.words.some(w => hasRun(words, w));
}

/**
 * The prompts with something to ask on this bid, in the shipped order, each
 * with the lines it asks about. Only lines nobody has answered (`scopeTag`
 * NULL). A line may sit under two prompts; answering it once clears both.
 */
export function matchScopePrompts<L extends PromptLine>(
  lines: readonly L[],
  prompts: readonly ScopePrompt[] = SHIPPED_SCOPE_PROMPTS
): { prompt: ScopePrompt; lines: L[] }[] {
  const open = lines.filter(line => line.scopeTag === null);
  return prompts
    .map(prompt => ({
      prompt,
      lines: open.filter(line => promptMatchesLine(prompt, line)),
    }))
    .filter(match => match.lines.length > 0);
}

/**
 * Whether the card shows the prompts at all: never on a locked bid (its
 * numbers must not move, owner Q1), never once "Don't ask on this bid" was
 * picked (S3, owner Q10), and only when one has something to ask.
 */
export function showScopePrompts(bid: {
  locked: boolean;
  dismissedAt: Date | string | null;
  matches: number;
}): boolean {
  return !bid.locked && bid.dismissedAt === null && bid.matches > 0;
}
