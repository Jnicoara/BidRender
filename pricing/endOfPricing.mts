/**
 * THE END-OF-PRICING JOB — every recorded name-review answer, as one change
 * list (owner's queue, 2026-10-16). DRY RUN ONLY.
 *
 *   pnpm tsx pricing/endOfPricing.mts            # dry run, local DB, read only
 *   pnpm tsx pricing/endOfPricing.mts --apply    # refuses (see below)
 *
 * Reads `pricing/end-of-pricing-answers.json` (each entry quotes the owner's
 * answer it comes from) and checks every change two ways:
 *
 *   1. against the CATALOG (`BASELINE_MATERIALS`): every row it names exists;
 *      a rename's new name is not already taken (case ignored — the database
 *      treats "A" and "a" as one name), no two renames land on one name, no
 *      rename chains onto another; a new row's name is new.
 *   2. against the LOCAL database, read only: the shipped row is there and
 *      active, and how many companies hold their own copy of it — those
 *      copies are never touched by a starter change (they get an offer).
 *
 * Then writes `pricing/end-of-pricing-dry-run.md`: the counts, every problem,
 * every OPEN answer (not clear enough to apply), what waits for the owner's
 * approval, the owner's decisions, every CHECK the owner made an answer
 * depend on, then the change list, review by review.
 *
 * ── 2026-10-16: the 16 OPEN answers are DECIDED ─────────────────────────────
 * Owner: "N3 = YES to all 16 of your picks". Each is a `decided` entry (the
 * pick, in words) followed by the ordinary changes it produces, which quote
 * it. Item 9, the 30 mud rings, is written with `pendingApproval: true`:
 * checked against the catalog like everything else, listed in its own
 * section for the owner to approve, and left out of the change list until
 * that flag comes off.
 *
 * ── Why --apply refuses ─────────────────────────────────────────────────────
 * Applying is the end-of-pricing LOAD: renames through
 * RENAMED_BASELINE_MATERIALS, retires, aliases and descriptions in the seed
 * files, new rows, starter edits — one commit, then `scripts/starterDrift.mts
 * --apply` on the release day (CLAUDE.md § "Where a priced catalog lands").
 * It waits for the owner's word and for the OPEN items below to be answered;
 * a script that half-applied 561 changes is not a dry run's job.
 *
 * Refuses a database that is not on this machine (scripts/databaseGuard.ts).
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { assertWritableDatabase, OVERRIDE_VAR } = await import(
  "../scripts/databaseGuard"
);
const { BASELINE_MATERIALS, RENAMED_BASELINE_MATERIALS } = await import(
  "../server/seed/materials"
);

if (process.argv.includes("--apply")) {
  console.error(
    "--apply is not built: the apply IS the end-of-pricing load, and it waits for the owner's go, the mud rings' approval and the CHECK items in pricing/end-of-pricing-dry-run.md."
  );
  process.exit(2);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
type Change = {
  kind: string;
  review?: string;
  q?: string;
  quote?: string;
  [k: string]: unknown;
};
const { changes } = JSON.parse(
  readFileSync(path.join(ROOT, "pricing/end-of-pricing-answers.json"), "utf8")
) as { changes: Change[] };

// ── 1. Against the catalog ──────────────────────────────────────────────────
const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
const lower = new Map(
  BASELINE_MATERIALS.map(m => [m.name.toLowerCase(), m.name])
);
const problems: string[] = [];
const where = (c: Change) =>
  `${path.basename(c.review ?? "?")} ${c.q ?? ""}`.trim();
const needRow = (c: Change, field: string) => {
  const n = c[field];
  if (typeof n !== "string") return;
  if (!byName.has(n))
    problems.push(`${where(c)}: "${n}" (${field}) is not a shipped name`);
};
const renameTargets = new Map<string, Change>();
const renameFroms = new Set(
  changes.filter(c => c.kind === "rename").map(c => c.from as string)
);
const addNames = new Map<string, Change>();
for (const c of changes) {
  switch (c.kind) {
    case "rename": {
      needRow(c, "from");
      const to = c.to as string;
      const taken = lower.get(to.toLowerCase());
      if (taken && taken !== c.from)
        problems.push(
          `${where(c)}: rename to "${to}" — already the name of "${taken}"`
        );
      const dup = renameTargets.get(to.toLowerCase());
      if (dup)
        problems.push(
          `${where(c)}: "${to}" is also the target of ${where(dup)}`
        );
      renameTargets.set(to.toLowerCase(), c);
      if (renameFroms.has(to))
        problems.push(`${where(c)}: rename chains — "${to}" is renamed again`);
      if (to in RENAMED_BASELINE_MATERIALS)
        problems.push(
          `${where(c)}: "${to}" is an OLD spelling in RENAMED_BASELINE_MATERIALS`
        );
      break;
    }
    case "hide":
      needRow(c, "name");
      if (c.foldInto) needRow(c, "foldInto");
      break;
    case "addAlias":
    case "removeAlias":
    case "describe":
    case "moveShelf":
    case "pack":
      needRow(c, "name");
      break;
    case "addRow": {
      const n = c.name as string;
      if (lower.has(n.toLowerCase()))
        problems.push(`${where(c)}: new row "${n}" already exists`);
      const dup = addNames.get(n.toLowerCase());
      if (dup)
        problems.push(
          `${where(c)}: new row "${n}" is also added by ${where(dup)}`
        );
      if (renameTargets.has(n.toLowerCase()))
        problems.push(`${where(c)}: new row "${n}" is also a rename target`);
      addNames.set(n.toLowerCase(), c);
      break;
    }
  }
}

// ── 2. Against the local database (read only) ───────────────────────────────
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
// The same guard every writing script passes — this one only reads, but it
// must never be pointed at a database off this machine.
assertWritableDatabase(url, {
  action: "dry-run the end-of-pricing job",
  env: { ...process.env, [OVERRIDE_VAR]: undefined },
});
const mysql = await import("mysql2/promise");
const conn = await mysql.createConnection(url);
const named = [
  ...new Set(
    changes.flatMap(c =>
      ["from", "name", "foldInto"]
        .map(f => c[f])
        .filter((v): v is string => typeof v === "string" && byName.has(v))
    )
  ),
];
type Fact = { id: number | null; active: boolean; forks: number };
const facts = new Map<string, Fact>();
for (const name of named) {
  const [rows] = (await conn.query(
    "SELECT id, isActive FROM materials WHERE userId IS NULL AND name = ? LIMIT 1",
    [name]
  )) as unknown as [{ id: number; isActive: number }[]];
  const row = rows[0];
  let forks = 0;
  if (row) {
    const [[f]] = (await conn.query(
      "SELECT COUNT(*) AS n FROM materials WHERE baselineId = ?",
      [row.id]
    )) as unknown as [[{ n: number }]];
    forks = Number(f.n);
  } else
    problems.push(`local DB: shipped row "${name}" is not in the database`);
  facts.set(name, {
    id: row?.id ?? null,
    active: row ? Boolean(row.isActive) : false,
    forks,
  });
}
const [dbInfo] = (await conn.query("SELECT DATABASE() AS db")) as unknown as [
  [{ db: string }],
];
await conn.end();

// ── The report ──────────────────────────────────────────────────────────────
// A change list is what the load would apply. Two kinds of entry are not in
// it: a "decided" record (the owner's answer to an OPEN item, 2026-10-16 —
// its changes follow it as ordinary entries) and anything still waiting for
// the owner's approval (`pendingApproval`: the 30 mud rings). Both are still
// checked against the catalog above, so a bad name shows up before approval.
const pending = changes.filter(c => c.pendingApproval === true);
const decidedList = changes.filter(c => c.kind === "decided");
const applied = changes.filter(
  c => c.pendingApproval !== true && c.kind !== "decided"
);
const count: Record<string, number> = {};
for (const c of applied) count[c.kind] = (count[c.kind] ?? 0) + 1;
const fact = (n: unknown) => {
  const f = typeof n === "string" ? facts.get(n) : undefined;
  return f
    ? `#${f.id}${f.active ? "" : " (retired)"}${f.forks ? `, ${f.forks} company cop${f.forks === 1 ? "y" : "ies"}` : ""}`
    : "";
};
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
const line = (c: Change): string => {
  switch (c.kind) {
    case "rename":
      return `rename | ${esc(c.from)} | ${esc(c.to)}${c.keepOldAsSearchWord ? " (old name kept as a search word)" : ""} | ${fact(c.from)}`;
    case "hide":
      return `hide | ${esc(c.name)} | ${c.foldInto ? `folded into ${esc(c.foldInto)}` : "retired"} | ${fact(c.name)}`;
    case "addAlias":
    case "removeAlias":
      return `${c.kind === "addAlias" ? "add search words" : "remove search words"} | ${esc(c.name)} | ${esc((c.words as string[]).join(", "))} | ${fact(c.name)}`;
    case "describe":
      return `describe | ${esc(c.name)} | ${esc(c.description)} | ${fact(c.name)}`;
    case "moveShelf":
      return `move shelf | ${esc(c.name)} | to ${esc(c.to)} | ${fact(c.name)}`;
    case "pack":
      return `pack | ${esc(c.name)} | ${esc(c.label)} (${esc(c.qty)}) | ${fact(c.name)}`;
    case "addRow":
      return `add row ${esc(c.ref)} | ${esc(c.name)} | ${esc(c.shelf)}, ${esc(c.unitOfSale)}${
        c.pack
          ? `, ${esc((c.pack as { label: string }).label)} (${esc((c.pack as { qty: number }).qty)})`
          : ""
      } | new`;
    case "starterEdit":
      return `starter edit | ${esc(c.starter)} | ${esc(c.change)} | `;
    default:
      return `${c.kind} | ${esc(c.what)} | | `;
  }
};

const reviews = [...new Set(applied.map(c => c.review ?? "?"))];
const open = changes.filter(c => c.kind === "open");
const pendingLine = (c: Change) =>
  c.kind === "rename"
    ? `- ${c.to} — **rename** of today's \`${c.from}\` (keeps its id and starters)`
    : `- ${c.name} — new row`;
const out: string[] = [
  "# End-of-pricing job — DRY RUN",
  "",
  `GENERATED by \`pricing/endOfPricing.mts\` on ${new Date().toISOString().slice(0, 10)}, against the LOCAL database \`${dbInfo[0].db}\`, read only. **Nothing was applied.** Source: \`pricing/end-of-pricing-answers.json\` (every recorded owner answer from the name reviews and the pack scan, each with its quote).`,
  "",
  `**${applied.length} changes:** ${Object.entries(count)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ")}. Not counted: ${pending.length} waiting for approval (below).`,
  "",
  `**Problems found: ${problems.length}.** If this is not 0, the load must not run: either an answer is stale or the catalog moved since the review. Stop and find out which before going on. A "not in the database" line is about the LOCAL copy, not the catalog: it can mean the local copy is older than the seed files.`,
  "",
  ...problems.map(p => `- ${p}`),
  "",
  "## OPEN — answers not clear enough to apply (owner)",
  "",
  ...(open.length
    ? open.map(c => `- **${where(c)}:** ${esc(c.what)}`)
    : ["None. All 16 were answered by the owner on 2026-10-16 (below)."]),
  "",
  `## WAITING FOR YOUR APPROVAL — the ${pending.length} mud rings (item 9)`,
  "",
  `${pending.filter(c => c.kind === "rename").length} are renames of the rows that exist today, so those rows keep their ids and every starter that uses them; ${pending.filter(c => c.kind === "addRow").length} are new. **A's proposal, for you to confirm: today's rows become the 1/2" raise** (5/8" is the other common choice; say if you want that instead). Not in the change list until you approve.`,
  "",
  ...pending.map(pendingLine),
  "",
  "## DECIDED 2026-10-16 — the 16 answers that were OPEN",
  "",
  'Owner: "N3 = YES to all 16 of your picks." Each pick\'s changes are in the review tables below, quoting it.',
  "",
  ...decidedList.map(
    c => `${c.pick}. **${where(c)}:** ${esc(c.what)} → ${esc(c.results)}`
  ),
  "",
  "## CHECK — conditions the owner made an answer depend on",
  "",
  ...changes
    .filter(c => c.kind === "check")
    .map(c => `- **${where(c)}:** ${esc(c.what)}`),
  "",
];
for (const r of reviews) {
  const list = applied.filter(
    c => (c.review ?? "?") === r && c.kind !== "open" && c.kind !== "check"
  );
  if (!list.length) continue;
  out.push(
    `## ${path.basename(r)} — ${list.length} changes`,
    "",
    "| Change | Row | After | Local DB |",
    "| --- | --- | --- | --- |"
  );
  for (const c of list) out.push(`| ${line(c)} |`);
  out.push("");
}
writeFileSync(
  path.join(ROOT, "pricing/end-of-pricing-dry-run.md"),
  out.join("\n")
);
console.log(
  `${applied.length} changes + ${pending.length} waiting for approval (${Object.entries(
    count
  )
    .map(([k, n]) => `${n} ${k}`)
    .join(
      ", "
    )}); ${problems.length} problems; ${facts.size} shipped rows looked up in ${dbInfo[0].db}. Wrote pricing/end-of-pricing-dry-run.md.`
);
process.exit(problems.length ? 1 : 0);
