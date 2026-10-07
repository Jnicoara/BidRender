/**
 * POSSIBLE DUPLICATES — pairs of materials that are probably one part under
 * two names. For the owner's review sheet (owner, 2026-10-07): it PROPOSES
 * pairs; a person decides "Same — keep A / Same — keep B / Not the same".
 * Nothing here merges, renames or cuts anything.
 *
 * ── How a pair is found ──────────────────────────────────────────────────────
 * Each name is reduced to a SIGNATURE: lower case, punctuation gone, every
 * spelling of one idea folded to one word (single pole / single-pole / 1P /
 * SP → "1pole"; set screw / SS → "setscrew"; CU → "copper"; GFI → "gfci"…),
 * and its SIZE read the same way (`#12`, `1/2"`, `20A`, `4 ft` …). Two rows
 * pair when:
 *
 *   1. their signatures are the same words (order ignored) — the strongest
 *      case: "Breaker 20A 1P" and "20A Single-Pole breaker";
 *   2. same size, and each name's words are all in the OTHER row's name or
 *      search words (aliases) — the catalog's own slang says they are one
 *      thing; or
 *   3. same size, and the longer name adds only QUALIFIERS to the shorter
 *      ("standard", "commercial", "spec grade"…) — never a word that could
 *      name a different part; or
 *   4. the same words, and one name states MORE of the size than the other
 *      (a diameter beside a length) while every size of the shorter is in
 *      the longer; or
 *   5. a NEW (waiting) row with no size and a shipped row with the same
 *      words and a size.
 *
 * ── What keeps two different parts apart ─────────────────────────────────────
 * A CONFLICT group is a set of words of which a part has at most one: set
 * screw vs compression, 1-pole vs 2-pole, copper vs aluminum, EMT vs PVC vs
 * rigid, indoor vs weatherproof, and any two different sizes or amperages.
 * If two rows hold DIFFERENT words from one group, they are never paired,
 * however alike the rest reads. Missing a duplicate costs one review row;
 * pairing two different parts invites a cut that loses a part — so the
 * groups lean toward keeping things apart.
 */

/** Spellings of one idea, folded to the first word of each list. */
const SYNONYMS: [string, string[]][] = [
  ["1pole", ["single-pole", "single pole", "1-pole", "1 pole", "1p", "sp"]],
  ["2pole", ["double-pole", "double pole", "2-pole", "2 pole", "2p", "dp"]],
  ["3pole", ["three-pole", "three pole", "3-pole", "3 pole", "3p"]],
  ["setscrew", ["set-screw", "set screw", "ss"]],
  ["compression", ["comp", "compression-type"]],
  ["copper", ["cu", "copper"]],
  ["aluminum", ["al", "aluminium", "alum"]],
  ["gfci", ["gfi", "gfci"]],
  ["afci", ["afci", "arc-fault", "arc fault"]],
  ["receptacle", ["recep", "receptacle", "outlet"]],
  [
    "weatherproof",
    ["wp", "weather-proof", "weatherproof", "weather resistant", "wr"],
  ],
  ["galvanized", ["galv", "galvanized"]],
  ["connector", ["conn", "connector"]],
  ["coupling", ["cplg", "coupling"]],
  ["4square", ['4" square', "4 square", "4in square", "1900"]],
  ["box", ["box", "bx"]],
  ["with", ["w/", "with"]],
  // Two trade names for one fixture (owner review, 2026-10-07: the waiting
  // `4" canless LED downlight` is the shipped `4" wafer LED downlight`).
  ["wafer", ["canless", "wafer"]],
];

/** At most one of each group per part. Different members = different parts. */
const CONFLICTS: string[][] = [
  ["1pole", "2pole", "3pole"],
  ["setscrew", "compression", "raintight", "insulated"],
  ["copper", "aluminum"],
  [
    "emt",
    "pvc",
    "rigid",
    "imc",
    "fmc",
    "lfmc",
    "lfnc",
    "flex",
    "liquidtight",
    "ent",
  ],
  ["solid", "stranded"],
  ["indoor", "weatherproof", "outdoor"],
  ["gfci", "afci", "dual", "standard"],
  ["90", "45", "lb", "ll", "lr", "t", "c"],
  [
    "connector",
    "coupling",
    "elbow",
    "strap",
    "bushing",
    "locknut",
    "body",
    "nipple",
    "adapter",
  ],
  ["sch40", "sch80", "40", "80"],
  ["fused", "nonfused", "non-fused"],
  ["nm-b", "mc", "uf-b", "ser", "seu", "thhn", "xhhw", "use-2", "urd"],
  [
    "white",
    "black",
    "red",
    "blue",
    "green",
    "ivory",
    "almond",
    "gray",
    "grey",
    "brown",
  ],
  ["1-gang", "2-gang", "3-gang", "4-gang", "single-gang", "double-gang"],
  ["round", "square", "octagon", "handy"],
  ["plate", "receptacle", "switch", "dimmer", "cover"],
];
const CONFLICT_OF = new Map<string, number>();
CONFLICTS.forEach((group, i) => group.forEach(w => CONFLICT_OF.set(w, i)));

/** Words that qualify rather than name a different part (rule 3 only). */
const QUALIFIERS = new Set([
  "standard",
  "std",
  "commercial",
  "residential",
  "spec",
  "grade",
  "heavy",
  "duty",
  "type",
  "style",
  "kit",
  "assembly",
  "each",
  "ea",
  "new",
  "work",
  "construction",
  "listed",
  "ul",
  "general",
  "purpose",
]);

// "x" joins two dimensions — `3/4" x 10 ft` — and names nothing itself.
const FILLER = new Set(["the", "a", "an", "and", "for", "of", "to", "in", "x"]);

function fold(text: string): string {
  let s = ` ${text.toLowerCase()} `;
  for (const [to, from] of SYNONYMS) {
    for (const f of from) {
      const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      s = s.replace(new RegExp(`(?<=[\\s(,/])${escaped}(?=[\\s),/])`, "g"), to);
    }
  }
  return s;
}

/** The size tokens a name carries: #12, 1/2", 20A, 4 ft, 250 kcmil, 12/2 … */
const SIZE_PATTERNS = [
  /#\s?\d+(?:\/0)?/g, // wire gauge
  /\b\d+(?:-\d+\/\d+|\/\d+)?"/g, // trade size / inches
  /\b\d+(?:\/\d+)?-?\d*\s?a\b/g, // amps: 20a, 15/20a
  /\b\d+(?:\.\d+)?\s?(?:ft|')/g, // feet
  /\b\d+\s?kcmil\b/g,
  /\b\d+(?:\/\d+)?\s?kva\b/g,
  /\b\d+[-/]\d+(?:[-/]\d+)*\b/g, // conductor sets 12-2, 4/0-4/0-2/0, aughts 1/0
  /\b\d+\s?(?:v|w|hp|mm)\b/g,
];

/**
 * The sizes a name carries, and the text left once they are taken out. Each
 * pattern takes what it matched OUT before the next looks, so `1-1/4"` is one
 * trade size and not also a conductor set "1-1/4" — and the REST is cut by
 * the same patterns, so "10 ft" leaves no "10" and "ft" behind as words (it
 * did: "Ground rod, 10 ft" read as the words "10 ft ground rod", 2026-10-07).
 */
function splitSizes(text: string): { sizes: string[]; rest: string } {
  const out: string[] = [];
  let rest = text;
  for (const p of SIZE_PATTERNS) {
    for (const m of rest.match(p) ?? []) out.push(m.replace(/\s+/g, ""));
    rest = rest.replace(p, " ");
  }
  // Repeats KEPT: `1-5/8" x 1-5/8"` strut is two sizes, not one — as a set it
  // read as a subset of `1-5/8" x 13/16"` and paired different channels.
  return { sizes: out.sort(), rest };
}

/** The size tokens a name carries: #12, 1/2", 20A, 4 ft, 250 kcmil, 12/2 … */
export function sizeTokens(name: string): string[] {
  return splitSizes(name.toLowerCase()).sizes;
}

export type Signature = { words: string[]; sizes: string[] };

export function signature(name: string): Signature {
  const sizes = sizeTokens(name);
  // Folded first (so `4" square` becomes one word), then cut by the size
  // patterns themselves — never by the size STRINGS, which lose their spaces.
  const s = splitSizes(fold(name)).rest;
  const words = s
    .replace(/["#()]/g, " ")
    .split(/[\s,;/]+/)
    .map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9-]+$/g, ""))
    .filter(w => w && !FILLER.has(w));
  return { words: Array.from(new Set(words)).sort(), sizes };
}

function conflicts(a: string[], b: string[]): string | null {
  const bByGroup = new Map<number, string>();
  for (const w of b) {
    const g = CONFLICT_OF.get(w);
    if (g !== undefined) bByGroup.set(g, w);
  }
  for (const w of a) {
    const g = CONFLICT_OF.get(w);
    if (g === undefined) continue;
    const other = bByGroup.get(g);
    if (other && other !== w) return `${w} vs ${other}`;
  }
  return null;
}

export type DuplicateCandidate = {
  name: string;
  aliases?: string;
  /** A row waiting to be ADDED (not shipped yet) — see rule 5. */
  isNew?: boolean;
};

export type DuplicatePair = {
  a: string;
  b: string;
  why: string;
};

/**
 * Every likely-duplicate pair, each pair once, A before B in the input order.
 * O(n²) over ~1,700 names — a few hundred milliseconds, run by hand.
 */
export function findPossibleDuplicates(
  rows: readonly DuplicateCandidate[]
): DuplicatePair[] {
  const sigs = rows.map(r => ({ ...r, sig: signature(r.name) }));
  // Aliases are SPACE-separated words (CLAUDE.md § Materials), so they are
  // compared as words, folded like names: "single pole" in an alias list
  // covers a name's "1pole".
  const aliasWords = rows.map(r => new Set(signature(r.aliases ?? "").words));
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      const A = sigs[i];
      const B = sigs[j];
      if (A.name === B.name) continue;
      const sameSizes = A.sig.sizes.join("|") === B.sig.sizes.join("|");
      const sameWords = A.sig.words.join(" ") === B.sig.words.join(" ");

      // 4. the same words, and one name only STATES MORE of the size — a
      //    diameter the other leaves out: "Ground rod, 10 ft" and "Ground
      //    rod, 3/4" x 10 ft" (missed until the owner caught it, 2026-10-07).
      //    Every size of the shorter must be in the longer; a different size
      //    anywhere is a different part.
      // 5. a NEW row that names no size, against a shipped row with the
      //    same words and a size: the new row is probably the shipped part
      //    written loosely ("Mast roof flashing" / `2" mast roof flashing`).
      //    New rows only — shipped "Duplex receptacle" and "20A duplex
      //    receptacle" are two real parts.
      if (
        sameWords &&
        A.sig.words.length > 0 &&
        !!A.isNew !== !!B.isNew &&
        (A.sig.sizes.length === 0) !== (B.sig.sizes.length === 0)
      ) {
        const sized = A.sig.sizes.length ? A : B;
        pairs.push({
          a: A.name,
          b: B.name,
          why: `same words; the new row names no size, the shipped one is ${sized.sig.sizes.join(", ")}`,
        });
        continue;
      }

      if (!sameSizes && sameWords && A.sig.words.length > 0) {
        const [few, more] =
          A.sig.sizes.length <= B.sig.sizes.length
            ? [A.sig.sizes, B.sig.sizes]
            : [B.sig.sizes, A.sig.sizes];
        // A multiset subset: each size of the shorter, as many times as it
        // appears, is in the longer — and the longer states strictly more.
        const left = [...more];
        const contained = few.every(s => {
          const at = left.indexOf(s);
          if (at < 0) return false;
          left.splice(at, 1);
          return true;
        });
        if (few.length > 0 && few.length < more.length && contained) {
          const extra = left;
          pairs.push({
            a: A.name,
            b: B.name,
            why: `same words and size; one name also states ${extra.join(", ")}`,
          });
        }
        continue;
      }
      if (!sameSizes) continue;
      const clash = conflicts(A.sig.words, B.sig.words);
      if (clash) continue;

      // 1. the same words, spelled or ordered differently
      if (A.sig.words.join(" ") === B.sig.words.join(" ")) {
        pairs.push({
          a: A.name,
          b: B.name,
          why: `same size and the same words${
            A.sig.sizes.length ? ` (${A.sig.sizes.join(", ")})` : ""
          }, spelled or ordered differently`,
        });
        continue;
      }

      // 2. each name is covered by the OTHER row's name plus search words —
      //    the catalog's own slang already says they are one thing.
      const covers = (words: string[], k: number) =>
        words.length >= 2 &&
        words.every(w => sigs[k].sig.words.includes(w) || aliasWords[k].has(w));
      // Not when one name is the other plus words: "Attic fan" and "Attic fan
      // thermostat" cover each other through slang and are two parts (seen
      // 2026-10-07). A word-subset pair is rule 3's to judge.
      const subset = (x: string[], y: string[]) => x.every(w => y.includes(w));
      const nested =
        subset(A.sig.words, B.sig.words) || subset(B.sig.words, A.sig.words);
      if (!nested && covers(A.sig.words, j) && covers(B.sig.words, i)) {
        pairs.push({
          a: A.name,
          b: B.name,
          why: "same size; each name's words are in the other's name or search words",
        });
        continue;
      }

      // 3. nearly the same words: the longer adds qualifiers only
      const [short, long] =
        A.sig.words.length <= B.sig.words.length
          ? [A.sig.words, B.sig.words]
          : [B.sig.words, A.sig.words];
      if (short.length < 2) continue;
      if (!short.every(w => long.includes(w))) continue;
      // ONLY qualifiers may be extra. Measured 2026-10-07: allowing one
      // meaningful extra word paired 190 rows that are different parts —
      // a conduit and its connector, a box and a deep box, a breaker and
      // its AFCI twin. One more word usually IS a different part.
      const extra = long.filter(w => !short.includes(w));
      const meaningful = extra.filter(w => !QUALIFIERS.has(w));
      if (extra.length > 0 && meaningful.length === 0) {
        pairs.push({
          a: A.name,
          b: B.name,
          why: `same size; one name adds only "${extra.join(" ")}"`,
        });
      }
    }
  }
  return pairs;
}
