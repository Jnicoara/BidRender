/**
 * Turn `pricing/materials-review-rows.json` into `pricing/materials-review.xlsx`
 * — the owner's materials review sheet (references/materials-review-sheet-plan.md).
 *
 *   npx tsx pricing/buildMaterialsReview.mts
 *   NODE_PATH=<scratch>/node_modules node pricing/writeMaterialsReview.cjs
 *
 * exceljs is not a dependency of this repo, on purpose — install it in a
 * scratch folder, as pricing/writeWorkbook.cjs explains.
 *
 * Only the YELLOW columns are typed in. Everything else is read-only text or a
 * formula: the final name, the warnings and the Counts tab follow the marks as
 * they are made, so nobody has to remember to check.
 */
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const OUT = process.argv[2] || path.join(HERE, "materials-review.xlsx");
const data = JSON.parse(
  fs.readFileSync(path.join(HERE, "materials-review-rows.json"), "utf8")
);

/*
  DECISIONS ALREADY MADE (pricing/materials-review-marks.json), applied over
  the generated defaults so a regenerated sheet keeps them. Every mark must
  find its row: one that matches nothing is reported and fails the run,
  because a decision that silently does not apply is the worst outcome of a
  review sheet.
*/
const MARKS_FILE = path.join(HERE, "materials-review-marks.json");
const marks = fs.existsSync(MARKS_FILE)
  ? JSON.parse(fs.readFileSync(MARKS_FILE, "utf8"))
  : { duplicates: {}, questions: {}, questionNotes: {}, missing: {} };
const usedMarks = new Set();
const markFor = (kind, key) => {
  const value = (marks[kind] || {})[key];
  if (value !== undefined) usedMarks.add(`${kind}:${key}`);
  return value;
};

const YELLOW = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2B3" },
};
const GREY_TEXT = { color: { argb: "FF6B6B6B" } };
const HEADER = { bold: true, color: { argb: "FFFFFFFF" } };
const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF333333" },
};
const RED_FILL = {
  type: "pattern",
  pattern: "solid",
  bgColor: { argb: "FFF8B4B4" },
};

const REVIEW_DECISIONS = [
  "Keep proposed",
  "Keep",
  "Rename",
  "Cut",
  "Add",
  "Your call",
];
const MISSING_DECISIONS = ["Add", "Skip"];

function header(sheet, columns) {
  sheet.columns = columns;
  const row = sheet.getRow(1);
  row.font = HEADER;
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 30;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function dropdown(cell, values) {
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`"${values.join(",")}"`],
    showErrorMessage: true,
    errorTitle: "Pick from the list",
    error: `One of: ${values.join(", ")}`,
  };
}

const wb = new ExcelJS.Workbook();
wb.creator = "BidRidge (Track A)";
wb.created = new Date(data.generatedAt);

// ── Tab 1: Read me ───────────────────────────────────────────────────────────
const readMe = wb.addWorksheet("Read me");
readMe.getColumn(1).width = 110;
const shipped = data.review.filter(r => r.status === "Shipped").length;
const added = data.review.length - shipped;
[
  ["Materials review — rename, keep, cut, missing", { bold: true, size: 14 }],
  [
    `Generated ${data.generatedAt.slice(0, 10)} from the shipped catalog: ${shipped} materials, plus ${added} new rows waiting to be added.`,
  ],
  [""],
  [
    "HOW TO MARK IT — only the YELLOW columns are yours to type in.",
    { bold: true },
  ],
  [
    "1. Review tab: the Decision column is already filled in. Most rows need nothing from you. Change it only where you disagree.",
  ],
  [
    "     Keep proposed = take the new name shown.   Keep = keep today's name.   Rename = type your own name in 'Your name'.",
  ],
  [
    "     Cut = we stop shipping it.   Add = a new row goes into the catalog.   Your call = an open question decides it — pick one.",
  ],
  [
    "2. Missing tab: things the catalog lacks. 'Typical job' rows are pre-filled Add (change to Skip if not wanted); size gaps and starter parts are blank — mark Add or Skip. Add your own rows at the bottom.",
  ],
  [
    "3. Possible duplicates tab: pairs that look like one part under two names. Pick Same - keep A, Same - keep B, or Not the same.",
  ],
  [
    "     'Same - keep A' cuts B; anything that used B (a starter assembly, a run type) is moved to A. Bids already priced keep what they have.",
  ],
  [
    "4. Questions tab: five naming questions, each with our recommendation. Answer each one.",
  ],
  [
    "5. Counts tab: totals as you mark, and the warnings that must be 0 before the names can freeze.",
  ],
  [""],
  [
    "WHAT A CUT DOES: the material disappears from every list and search. Bids that already use it keep it, unchanged. Nothing is deleted.",
    { bold: true },
  ],
  [
    "A cut on a row a starter assembly or run type uses is flagged red: say in Note which material replaces it in those recipes.",
  ],
  [
    "WHAT A RENAME DOES: same material, new name. Old names still find it in search. Bids, assemblies and counts keep pointing at it.",
  ],
  [""],
  [
    "WHEN YOU HAND IT BACK: we check it (two rows with the same final name, cuts with no replacement, blanks), then the names FREEZE.",
  ],
  [
    "After that a name changes only through the rename list, never by editing the catalog.",
  ],
  [""],
  [
    "Not on this sheet: the 519 brand variants for panels and breakers — their own pass, after the names freeze.",
  ],
].forEach(([text, font], i) => {
  const cell = readMe.getCell(i + 1, 1);
  cell.value = text;
  if (font) cell.font = font;
  cell.alignment = { wrapText: true };
});

// ── Tab 2: Review ────────────────────────────────────────────────────────────
const review = wb.addWorksheet("Review");
header(review, [
  { header: "#", key: "n", width: 6 },
  { header: "Category", key: "category", width: 20 },
  { header: "Type", key: "type", width: 24 },
  { header: "Current name", key: "current", width: 36 },
  { header: "Proposed name", key: "proposed", width: 38 },
  // Wide enough for the longest reason: at 30 it ran into "Used by" and
  // read as "…spelled out 2 run types" (seen 2026-10-07).
  { header: "Why", key: "why", width: 52 },
  { header: "Used by", key: "usedBy", width: 20 },
  { header: "Status", key: "status", width: 22 },
  { header: "Decision", key: "decision", width: 15 },
  { header: "Your name", key: "yourName", width: 30 },
  { header: "Note", key: "note", width: 30 },
  { header: "Final name (follows your marks)", key: "final", width: 38 },
  { header: "Check", key: "check", width: 34 },
  { header: "Uses", key: "uses", width: 6 },
  { header: "Question", key: "question", width: 9 },
]);
const last = data.review.length + 1;
// A duplicate pair marked "Same - keep X" makes the OTHER row a Cut here
// too, so the two tabs never disagree (a dropped new row is simply never
// added; a dropped shipped row is retired and its uses move to the kept one).
const droppedFor = new Map();
for (const [key, [decision]] of Object.entries(marks.duplicates || {})) {
  const [a, b] = key.split("|");
  if (decision === "Same - keep A") droppedFor.set(b, a);
  if (decision === "Same - keep B") droppedFor.set(a, b);
}
data.review.forEach((r, i) => {
  const n = i + 2;
  const key = r.current || r.proposed;
  const keptAs = droppedFor.get(key);
  // A direct Review mark (the owner's row-by-row call) wins over both.
  const direct = markFor("review", key);
  const row = review.addRow({
    n: i + 1,
    category: r.category,
    type: r.type,
    current: r.current,
    proposed: r.proposed,
    why: r.why,
    usedBy: r.usedBy,
    status: r.status,
    decision: direct ? direct[0] : keptAs ? "Cut" : r.decision,
    yourName: "",
    note: direct
      ? direct[1]
      : keptAs
        ? `Same part as "${keptAs}" (Possible duplicates tab) — anything using this moves to it.`
        : r.question
          ? `Decided by ${r.question} (Questions tab)`
          : "",
    uses: r.usedByCount,
    question: r.question,
  });
  row.getCell("final").value = {
    formula: `IF(I${n}="Cut","",IF(I${n}="Your call","(decide)",IF(I${n}="Rename",J${n},IF(I${n}="Keep",IF(D${n}="",E${n},D${n}),IF(E${n}="(unchanged)",D${n},E${n})))))`,
  };
  row.getCell("check").value = {
    formula: `IF(AND(I${n}="Cut",N${n}>0,K${n}=""),"USED: say what replaces it (Note)",IF(AND(I${n}="Rename",J${n}=""),"type the new name",IF(AND(L${n}<>"",L${n}<>"(decide)",COUNTIF($L$2:$L$${last},L${n})>1),"SAME FINAL NAME AS ANOTHER ROW","")))`,
  };
  for (const key of ["decision", "yourName", "note"])
    row.getCell(key).fill = YELLOW;
  dropdown(row.getCell("decision"), REVIEW_DECISIONS);
  for (const key of ["final", "check", "uses", "question"])
    row.getCell(key).font = GREY_TEXT;
});
review.autoFilter = { from: "A1", to: `O${last}` };
review.addConditionalFormatting({
  ref: `M2:M${last}`,
  rules: [
    { type: "expression", formulae: [`LEN(M2)>0`], style: { fill: RED_FILL } },
  ],
});

// ── Tab 3: Missing ───────────────────────────────────────────────────────────
const missing = wb.addWorksheet("Missing");
header(missing, [
  { header: "Source", key: "source", width: 13 },
  { header: "Category", key: "category", width: 24 },
  { header: "Item", key: "item", width: 42 },
  { header: "Why it is listed", key: "detail", width: 90 },
  { header: "Decision", key: "decision", width: 12 },
  { header: "Your name", key: "yourName", width: 30 },
  { header: "Note", key: "note", width: 30 },
]);
const missingRows = [
  ...data.missing,
  // Rows the owner asked for by name, after the generated ones.
  ...(marks.extraMissing || []).map(x => ({
    source: "Owner",
    category: x.category,
    item: x.item,
    detail: x.detail,
    prefill: x.decision,
  })),
  ...Array.from({ length: 25 }, () => ({
    source: "Your row",
    category: "",
    item: "",
    detail: "",
  })),
];
missingRows.forEach(r => {
  // A mark wins; then the generator's pre-fill (typical-job "Add"); then the
  // marks file's default for a blank found row. "Your row" lines stay blank.
  const mark = r.source === "Your row" ? undefined : markFor("missing", r.item);
  const fallback =
    r.source !== "Your row" && !r.prefill ? marks.missingDefault : undefined;
  const [decision, note] = mark ||
    (r.prefill ? [r.prefill, ""] : fallback) || ["", ""];
  const row = missing.addRow({
    source: r.source,
    category: r.category,
    item: r.item,
    detail: r.detail,
    decision,
    yourName: "",
    note,
  });
  for (const key of ["decision", "yourName", "note"])
    row.getCell(key).fill = YELLOW;
  // Wrapped: the longest reason ran under Decision (seen 2026-10-07).
  row.getCell("detail").alignment = { wrapText: true, vertical: "top" };
  if (r.source === "Your row") {
    row.getCell("category").fill = YELLOW;
    row.getCell("item").fill = YELLOW;
  }
  dropdown(row.getCell("decision"), MISSING_DECISIONS);
});
missing.autoFilter = { from: "A1", to: `G${missingRows.length + 1}` };

// ── Tab: Possible duplicates ─────────────────────────────────────────────────
const DUPLICATE_DECISIONS = ["Same - keep A", "Same - keep B", "Not the same"];
const dups = wb.addWorksheet("Possible duplicates");
header(dups, [
  { header: "A", key: "a", width: 36 },
  { header: "A is", key: "aStatus", width: 22 },
  { header: "A used by", key: "aUses", width: 16 },
  { header: "B", key: "b", width: 36 },
  { header: "B is", key: "bStatus", width: 22 },
  { header: "B used by", key: "bUses", width: 16 },
  { header: "Why they look the same", key: "why", width: 60 },
  { header: "Decision", key: "decision", width: 16 },
  { header: "Note", key: "note", width: 30 },
]);
data.duplicates.forEach(d => {
  const [decision, note] = markFor("duplicates", `${d.a}|${d.b}`) || ["", ""];
  const row = dups.addRow({ ...d, decision, note });
  row.getCell("decision").fill = YELLOW;
  row.getCell("note").fill = YELLOW;
  dropdown(row.getCell("decision"), DUPLICATE_DECISIONS);
});
dups.addRow({});
const dupNote = dups.addRow({
  a: `How these were found: ${data.duplicates.length} pair(s) from ${data.review.length} rows, matched on size, type, material and key words with spellings folded (1-pole = single pole = 1P; set screw = SS; CU = copper) and search words — and kept apart when a key word differs (set screw vs compression, 1-pole vs 2-pole, copper vs aluminum, EMT vs PVC, a different size or amperage).`,
});
dupNote.getCell("a").alignment = { wrapText: true, vertical: "top" };
dups.mergeCells(`A${dupNote.number}:I${dupNote.number}`);
dupNote.height = 45;

// ── Tab 4: Questions ─────────────────────────────────────────────────────────
const questions = wb.addWorksheet("Questions");
header(questions, [
  { header: "#", key: "id", width: 6 },
  { header: "Question", key: "question", width: 90 },
  { header: "Recommended", key: "recommended", width: 16 },
  { header: "Your answer", key: "answer", width: 16 },
  { header: "Note", key: "note", width: 40 },
]);
data.questions.forEach(q => {
  const row = questions.addRow({
    ...q,
    answer: markFor("questions", q.id) || "",
    note: markFor("questionNotes", q.id) || "",
  });
  row.getCell("question").alignment = { wrapText: true, vertical: "top" };
  row.height = 45;
  row.getCell("answer").fill = YELLOW;
  row.getCell("note").fill = YELLOW;
  dropdown(row.getCell("answer"), ["Yes", "No", "See note"]);
});

// ── Tab 5: Counts ────────────────────────────────────────────────────────────
const counts = wb.addWorksheet("Counts");
const categories = Array.from(new Set(data.review.map(r => r.category)));
header(counts, [
  { header: "Category", key: "category", width: 26 },
  ...REVIEW_DECISIONS.map(d => ({ header: d, key: d, width: 14 })),
]);
const R = `Review!$B$2:$B$${last}`;
const D = `Review!$I$2:$I$${last}`;
categories.forEach(category => {
  const row = counts.addRow({ category });
  REVIEW_DECISIONS.forEach((d, j) => {
    row.getCell(j + 2).value = {
      formula: `COUNTIFS(${R},$A${row.number},${D},"${d}")`,
    };
  });
});
const totalRow = counts.addRow({ category: "Total" });
totalRow.font = { bold: true };
REVIEW_DECISIONS.forEach((d, j) => {
  totalRow.getCell(j + 2).value = { formula: `COUNTIF(${D},"${d}")` };
});
counts.addRow({});
const warn = (label, formula) => {
  const row = counts.addRow({ category: label });
  row.getCell(2).value = { formula };
  row.font = { bold: true };
  counts.addConditionalFormatting({
    ref: `B${row.number}`,
    rules: [
      {
        type: "expression",
        formulae: [`B${row.number}>0`],
        style: { fill: RED_FILL },
      },
    ],
  });
};
warn(
  "Rows with the same final name (must be 0)",
  `COUNTIF(Review!$M$2:$M$${last},"SAME FINAL NAME*")`
);
warn(
  "Cuts a starter still uses, no replacement named (must be 0)",
  `COUNTIF(Review!$M$2:$M$${last},"USED*")`
);
warn("Rows still 'Your call' (must be 0)", `COUNTIF(${D},"Your call")`);
warn(
  "Possible duplicates not decided (must be 0)",
  // COUNTIF "?*", not COUNTA: an unmarked cell holds "" and COUNTA counts
  // it as filled — the warning read 0 before anything was marked (seen in
  // Excel, 2026-10-07).
  `${data.duplicates.length}-COUNTIF('Possible duplicates'!$H$2:$H$${data.duplicates.length + 1},"?*")`
);

const unmatched = [];
for (const kind of [
  "duplicates",
  "questions",
  "questionNotes",
  "missing",
  "review",
]) {
  for (const key of Object.keys(marks[kind] || {})) {
    if (!usedMarks.has(`${kind}:${key}`)) unmatched.push(`${kind}: ${key}`);
  }
}
if (unmatched.length) {
  console.error(
    `writeMaterialsReview: ${unmatched.length} mark(s) matched no row — nothing written:\n  ${unmatched.join("\n  ")}`
  );
  process.exit(1);
}

wb.xlsx.writeFile(OUT).then(() => {
  console.log(
    `wrote ${path.relative(process.cwd(), OUT)}: review ${data.review.length} rows, missing ${missingRows.length}, questions ${data.questions.length}`
  );
});
