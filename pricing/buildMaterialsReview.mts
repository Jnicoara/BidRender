/**
 * Build the owner's materials REVIEW sheet — rename, keep, cut, missing.
 *
 *   npx tsx pricing/buildMaterialsReview.mts      # writes materials-review-rows.json
 *   NODE_PATH=<scratch>/node_modules node pricing/writeMaterialsReview.cjs
 *
 * Layout OK'd by the owner 2026-10-07 (references/materials-review-sheet-plan.md).
 * Reads the REAL shipped catalog every time, so the sheet cannot drift from
 * what ships. Proposed names come from `proposeMaterialName`
 * (shared/materialNaming.ts) — the one function the rename commit will use.
 *
 * Writes nothing to the catalog. The read-back (to come) turns the marked
 * sheet into the frozen name list.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE_MATERIALS } from "../server/seed/materials/index";
import { BASELINE_ASSEMBLIES } from "../server/seed/baselineAssemblies";
import { BASELINE_RUN_TYPES } from "../server/seed/baselineRunTypes";
import { starterPartName } from "../server/seed/starterParts";
import {
  normaliseNewName,
  proposeMaterialName,
} from "../shared/materialNaming";
import { compareMaterials } from "../shared/materialOrder";
import {
  CONDUCTOR_SIZES,
  TRADE_SIZE_ORDER,
  materialTypeName,
} from "../shared/materialSizeOrder";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── Who uses each material: shipped starters and run types (from the seed) ──
const starterUses = new Map<string, Set<string>>();
for (const assembly of BASELINE_ASSEMBLIES) {
  for (const line of assembly.materials) {
    const name = starterPartName(line.part);
    if (!starterUses.has(name)) starterUses.set(name, new Set());
    starterUses.get(name)!.add(assembly.name);
  }
}
const runTypeUses = new Map<string, number>();
for (const runType of BASELINE_RUN_TYPES) {
  for (const name of [
    runType.racewayMaterialName,
    runType.conductorMaterialName,
    runType.groundMaterialName,
  ]) {
    if (name) runTypeUses.set(name, (runTypeUses.get(name) ?? 0) + 1);
  }
}
function usedBy(name: string): { text: string; count: number } {
  const starters = starterUses.get(name)?.size ?? 0;
  const runTypes = runTypeUses.get(name) ?? 0;
  const parts = [
    starters ? `${starters} starter${starters === 1 ? "" : "s"}` : "",
    runTypes ? `${runTypes} run type${runTypes === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return { text: parts.join(", ") || "—", count: starters + runTypes };
}

// ── Tab 2: Review — every shipped row, then the new rows waiting ──────────────
type ReviewRow = {
  category: string;
  type: string;
  current: string;
  proposed: string;
  why: string;
  usedBy: string;
  usedByCount: number;
  status: string;
  decision: string;
  question: string;
};

const shipped: ReviewRow[] = [...BASELINE_MATERIALS]
  .sort(compareMaterials)
  .map(m => {
    const p = proposeMaterialName(m);
    const changed = p.proposed !== m.name;
    const use = usedBy(m.name);
    return {
      category: m.category ?? "",
      type: materialTypeName(m.name) ?? "",
      current: m.name,
      proposed: changed ? p.proposed : "(unchanged)",
      why: p.why ?? "",
      usedBy: use.text,
      usedByCount: use.count,
      status: "Shipped",
      decision: p.openQuestion
        ? "Your call"
        : changed
          ? "Keep proposed"
          : "Keep",
      question: p.openQuestion ?? "",
    };
  });

const catalogNames = new Set(BASELINE_MATERIALS.map(m => m.name));
const pricingRows = JSON.parse(
  fs.readFileSync(path.join(HERE, "rows.json"), "utf8")
) as {
  generic: { name: string; category: string; isNew?: boolean }[];
};
const waiting: ReviewRow[] = pricingRows.generic
  .filter(r => r.isNew && !catalogNames.has(r.name))
  .map(r => ({ ...r, name: normaliseNewName(r.name) }))
  .sort(compareMaterials)
  .map(r => ({
    category: r.category,
    type: materialTypeName(r.name) ?? "",
    current: "",
    proposed: r.name,
    why: "new row (pricing sheet)",
    usedBy: usedBy(r.name).text,
    usedByCount: usedBy(r.name).count,
    status: "New — not in catalog yet",
    decision: "Add",
    question: "",
  }));

// ── Tab 3: Missing — starter parts the catalog lacks, and size gaps ───────────
type MissingRow = {
  source: string;
  category: string;
  item: string;
  detail: string;
};

const missing: MissingRow[] = [];
for (const assembly of BASELINE_ASSEMBLIES) {
  for (const part of assembly.missingParts ?? []) {
    missing.push({
      source: "Starter",
      category: "",
      item: normaliseNewName(part),
      detail: `needed by "${assembly.name}" (${assembly.ref ?? "starter"}), which is held until it exists`,
    });
  }
}

/** A family's sizes by the app's own size tables; gaps between its ends. */
const SIZE_TABLES: { label: string; sizes: readonly string[]; read: RegExp }[] =
  [
    {
      label: "trade size",
      sizes: TRADE_SIZE_ORDER,
      read: /^(\d+(?:-\d+\/\d+|\/\d+)?")\s/,
    },
    {
      label: "wire size",
      sizes: CONDUCTOR_SIZES,
      read: /^#(\d+(?:\/0)?)\s/,
    },
  ];
const newNames = new Set(waiting.map(w => w.proposed));
const families = new Map<string, { category: string; names: string[] }>();
for (const m of BASELINE_MATERIALS) {
  const type = materialTypeName(m.name);
  if (!type) continue;
  const key = `${m.category}|${type}`;
  if (!families.has(key))
    families.set(key, { category: m.category ?? "", names: [] });
  families.get(key)!.names.push(m.name);
}
families.forEach(({ category, names }, key) => {
  const type = key.split("|")[1];
  for (const table of SIZE_TABLES) {
    const at = names
      .map(n => n.match(table.read)?.[1])
      .filter((s): s is string => !!s)
      .map(s => table.sizes.indexOf(s))
      .filter(i => i >= 0);
    if (at.length < 2) continue;
    const have = new Set(at);
    // Named like its family WILL be named: a neighbour's PROPOSED name with
    // the size swapped, so a gap in "#N XHHW AL" reads "#3 XHHW Aluminum".
    const neighbour = names.find(n => table.read.test(n))!;
    const neighbourSize = neighbour.match(table.read)![1];
    const neighbourProposed = proposeMaterialName(
      BASELINE_MATERIALS.find(m => m.name === neighbour)!
    ).proposed;
    for (let i = Math.min(...at) + 1; i < Math.max(...at); i++) {
      if (have.has(i)) continue;
      const size = table.sizes[i];
      const item = neighbourProposed.startsWith(
        table.label === "wire size" ? `#${neighbourSize} ` : `${neighbourSize} `
      )
        ? neighbourProposed.replace(neighbourSize, size)
        : table.label === "wire size"
          ? `#${size} ${type}`
          : `${size} ${type}`;
      if (newNames.has(item)) continue; // already waiting on the Review tab
      missing.push({
        source: "Size gap",
        category,
        item,
        detail: `${type} comes in sizes either side of ${table.label === "wire size" ? "#" : ""}${size}`,
      });
    }
  }
});

// ── Tab 4: Questions — the open naming questions, asked once ─────────────────
const questions = [
  {
    id: "Q2",
    question:
      "SER cable: keep the full conductor set (e.g. 4/0-4/0-4/0-2/0) in the description and as a search word, with a check that no two SER rows share size + metal? And keep the two 3-conductor rows' full names?",
    recommended: "Yes",
  },
  {
    id: "Q2d",
    question:
      '"3/4 MC cable Copper" (a #3 four-wire) reads like 3/4 inch. Write it "#3/4 MC cable Copper" instead?',
    recommended: "Yes, #3/4",
  },
  {
    id: "Q3",
    question:
      "Once shipped prices are no longer $0: should a bid line priced from an example price SAY so on the bid and the quote, until you change that material's price?",
    recommended: "Yes",
  },
  {
    id: "Q4",
    question:
      'Add "Copper" to the end of low-voltage cable names (not fiber)? Copper-clad (CCA) rows only if wanted.',
    recommended: "Yes",
  },
  {
    id: "Q5",
    question:
      "Hide the supplier-import button until its review screen (with undo) exists? Today an import writes at once and cannot be undone except by hand.",
    recommended: "Yes",
  },
];

const out = {
  generatedAt: new Date().toISOString(),
  review: [...shipped, ...waiting],
  missing,
  questions,
};
fs.writeFileSync(
  path.join(HERE, "materials-review-rows.json"),
  JSON.stringify(out, null, 1)
);
const changed = shipped.filter(r => r.proposed !== "(unchanged)").length;
console.log(
  `review: ${shipped.length} shipped (${changed} with a proposed name, ${shipped.filter(r => r.decision === "Your call").length} your call), ${waiting.length} new; missing: ${missing.length}; questions: ${questions.length}`
);
