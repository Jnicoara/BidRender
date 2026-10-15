/**
 * "WHERE DO I…?" — a help search that needs no AI and no network.
 *
 * Part of guide mode (client/src/lib/guide.ts). A short list of the questions
 * a contractor actually asks, each answered in one sentence with the screen
 * it is done on. Local and instant on purpose: CLAUDE.md's AI rules say
 * manual mode is the product and an AI call is a button — so the help that
 * answers "where is it" must work with AI switched off, offline on a job
 * site, and for free. The Dashboard's AI "Find it" box stays as the
 * fallback for what this list does not know.
 *
 * Words are matched loosely (start of a word, any order) against the
 * question and the extra words people type for it — "romex" for wire,
 * "dollar" for price. Every `path` is a real address: `helpTopics.test.ts`
 * resolves each one through the app's own router.
 */

export type HelpTopic = {
  question: string;
  answer: string;
  /** The app address to open, without the leading "#". */
  path: string;
  /** The words a person types for this that the question does not say. */
  words: string;
};

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    question: "Upload a drawing set",
    answer:
      "Plans › Upload a plan. A PDF up to 2 GB; it starts a bid named after the file.",
    path: "/plans",
    words: "pdf drawings prints blueprint set sheets file add plans",
  },
  {
    question: "Set the scale on a sheet",
    answer:
      "Open the bid's plans, then Set scale on the sheet — pick it off the title block, like 1/8\" = 1'-0\".",
    path: "/plans",
    words: "scale calibrate measure feet inches title block",
  },
  {
    question: "Count devices on the plans",
    answer:
      "Open the bid's plans, pick a symbol off the legend, then tap each one on the sheet.",
    path: "/plans",
    words:
      "count takeoff mark tap symbol legend receptacle outlet duplex light fixture switch",
  },
  {
    question: "Trace a conduit or cable run",
    answer:
      "Open the bid's plans and pick Conduit or Cable, then click box to box. Footage, fittings and wire are added for you.",
    path: "/plans",
    words: "run conduit pipe emt cable romex mc wire footage homerun trace",
  },
  {
    question: "Count a job by hand, without drawings",
    answer:
      "Dashboard › Quick bid — type what you need and the count. No drawings needed.",
    path: "/dashboard",
    words: "quick bid manual hand no plans without drawings",
  },
  {
    question: "Find a bid",
    answer: "Bids — search by job name, client or address.",
    path: "/bids",
    words: "search job list open bid find",
  },
  {
    question: "Print or send a proposal",
    answer:
      "Open the bid, then Send › Proposal. Print it or save a PDF from there.",
    path: "/bids",
    words: "print pdf proposal quote send customer email",
  },
  {
    question: "Bring back something I deleted",
    answer:
      "Recently deleted — every archived bid, material, assembly and client, with Restore.",
    path: "/trash",
    words: "undo delete deleted archive archived restore trash recover",
  },
  {
    question: "Set my labor rates",
    answer:
      "Labor rates — what an hour costs for each role. It prices every hour on every bid.",
    path: "/library/labor-rates",
    words:
      "labor rate hourly wage pay journeyman apprentice foreman cost per hour",
  },
  {
    question: "Change a material's price",
    answer:
      "Materials — find it, click the pencil, type your price. Bids already built keep the price they had.",
    path: "/library/materials",
    words: "price cost dollar material wire box supply house update",
  },
  {
    question: "Price by the roll or box",
    answer:
      "Materials › edit › More options › Bought by the pack — then type the roll or box price.",
    path: "/library/materials",
    words: "pack roll box bundle spool reel 250 500 price per foot",
  },
  {
    question: "See what a price used to be",
    answer: "Materials › edit › More options › Price history.",
    path: "/library/materials",
    words: "price history old previous change who changed",
  },
  {
    question: "Put in my supplier's prices",
    // Not "import": the price-list import is hidden until it has a preview
    // and an undo (client/src/lib/priceListImport.ts) — an answer naming a
    // button that is not there is worse than none.
    answer:
      "Materials › Supplier pricing — type the supply house's price beside each item you buy.",
    path: "/library/materials?view=pricing",
    words:
      "supplier supply house import upload price list platt csv spreadsheet",
  },
  {
    question: "Build an assembly",
    answer:
      "Assemblies › New — the parts and labor for one thing you install, priced once.",
    path: "/library/assemblies",
    words: "assembly recipe parts device install unit",
  },
  {
    question: "Make a kit",
    answer: "Assemblies › Kits — several assemblies that go in together.",
    path: "/library/assemblies?view=kits",
    words: "kit package bundle group assemblies",
  },
  {
    question: "Add extra labor for a hard job",
    answer:
      "Assemblies › Modifiers — job conditions like height, occupied space or rework that add to the hours.",
    path: "/library/assemblies?view=modifiers",
    words:
      "modifier condition difficult height lift occupied extra hours percent",
  },
  {
    question: "Change overhead and profit",
    answer:
      "Settings › Pricing — your company's overhead, profit and crew speed. A single bid can override them.",
    path: "/settings/pricing",
    words: "overhead profit margin markup percent company default",
  },
  {
    question: "Set mounting heights",
    answer:
      "Settings › Heights & extra — device and ceiling heights, and the extra footage you add.",
    path: "/settings/heights",
    words: "height mounting ceiling drop vertical aff extra waste makeup",
  },
  {
    question: "Put my logo on proposals",
    answer:
      "Settings › Branding — logo, company name, license number, address and phone.",
    path: "/settings/branding",
    words: "logo letterhead company name license address phone branding",
  },
  {
    question: "Set sales tax",
    answer: "Settings › Sales tax — your tax areas and what is taxable.",
    path: "/settings/tax",
    words: "tax sales rate area county state",
  },
  {
    question: "Change how a proposal looks",
    answer:
      "Settings › Proposal — layout, color, terms and how long the price stands.",
    path: "/settings/proposal",
    words: "proposal layout look terms conditions color valid days",
  },
  {
    question: "Turn the guide or tips off",
    answer:
      "Settings › Display — guide mode, the bid step bar and other screen preferences.",
    path: "/settings/display",
    words: "guide tips help turn off hide step bar display",
  },
  {
    question: "Change my password",
    answer: "Settings › Account.",
    path: "/settings/account",
    words: "password login sign in account email",
  },
  {
    question: "Add someone to my crew",
    answer:
      "Crew — invite an estimator or a viewer with a code, and set what they can do.",
    path: "/team",
    words: "crew invite add user employee estimator viewer team seat role",
  },
  {
    question: "Keep track of customers",
    answer: "Clients — who the work is for, with their bids.",
    path: "/clients",
    words: "client customer contractor gc owner contact",
  },
  {
    question: "See my win rate",
    answer:
      "Performance — how many bids you won and what finished jobs actually made.",
    path: "/analytics",
    words: "win rate performance won lost profit report numbers",
  },
];

const IGNORED = new Set([
  "a",
  "an",
  "the",
  "i",
  "my",
  "do",
  "how",
  "where",
  "to",
  "is",
  "can",
  "of",
  "on",
  "for",
  "in",
  "it",
  "and",
  "or",
  "what",
  "set",
  "change",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9/'"]+/g, " ")
    .split(" ")
    .filter(w => w && !IGNORED.has(w));
}

/**
 * Edits between two words — insert, delete, change, or swap two neighbours
 * ("pirce" is one from "price") — giving up past `max`. Short words only:
 * help words are a dozen letters at most, so the full table is cheap.
 */
function editsWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d.push([i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length] <= max;
}

/**
 * A typed word one slip away from a word in the topic — "matrials",
 * "pirce". Only for words of 4+ letters (one edit for 4–6, two for 7+):
 * below that, one edit turns most words into other real words.
 */
function nearMiss(typed: string, candidates: string[]): boolean {
  if (typed.length < 4) return false;
  const max = typed.length >= 7 ? 2 : 1;
  return candidates.some(w => w.length >= 4 && editsWithin(typed, w, max));
}

/**
 * The topics for a typed question, best first, at most `limit`. Each word
 * typed scores where it matches the START of a word in the question (2) or
 * the extra words (1). A word one slip away scores just under the exact
 * hit in the same place (1.5 in the question, 0.5 in the extra words), so a
 * typo still lands on the topic that NAMES the thing. A topic every typed
 * word hits ranks above one that only some do. Nothing typed, or nothing
 * matched, is an empty list.
 */
export function searchHelp(query: string, limit = 5): HelpTopic[] {
  const typed = words(query);
  if (typed.length === 0) return [];
  const scored = HELP_TOPICS.map((topic, index) => {
    const q = words(topic.question);
    const extra = words(topic.words);
    let score = 0;
    let hits = 0;
    for (const t of typed) {
      let s = 0;
      if (q.some(w => w.startsWith(t))) s = 2;
      else if (extra.some(w => w.startsWith(t))) s = 1;
      else if (nearMiss(t, q)) s = 1.5;
      else if (nearMiss(t, extra)) s = 0.5;
      score += s;
      if (s > 0) hits++;
    }
    return { topic, index, score: score + (hits === typed.length ? 10 : 0) };
  }).filter(s => s.score > 0);
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map(s => s.topic);
}
