/**
 * The reader-accuracy REPORT against the smaller answer key: the tables and
 * the list of AI finds to review. Pure — the AI run (readerAccuracy.mts) and
 * the no-cost re-score (readerAccuracyReview.mts) both build their output
 * here, so the two can never print different numbers for the same readings.
 *
 * Rules: readerAccuracyAnswerKey.ts. Matching: readerAccuracyScore.ts.
 */
import {
  keyForSheet,
  scoreSheet,
  verdictFor,
  type AnswerKeyFile,
  type VerdictEntry,
} from "./readerAccuracyAnswerKey";
import { labelKey } from "./readerAccuracyScore";
import type { HandMark, Score, Suggestion } from "./readerAccuracyScore";

/** The four ways a sheet is read; the plan's names for them. */
export const METHOD_NAMES = {
  a: "(a) Today",
  b: "(b) Legend first",
  c: "(c) Zoomed in",
  d: "(d) Legend + zoomed",
} as const;

/** A table row's name: the method, plus how positions were asked if both were. */
export function lineName(
  method: keyof typeof METHOD_NAMES,
  positions: string,
  bothPositionModes: boolean
): string {
  return bothPositionModes
    ? `${METHOD_NAMES[method]}, ${positions}`
    : METHOD_NAMES[method];
}

/** One reading of one sheet, with the hand count it is scored against. */
export type Reading = {
  /** The answer-key file's name for the sheet: `${file} p${page}`. */
  sheet: string;
  /** For people: file, page and the sheet's title. */
  sheetLabel: string;
  pdfId: number;
  page: number;
  /** The table row it belongs to, e.g. "(a) Today". */
  line: string;
  run: number;
  marks: HandMark[];
  suggestions: Suggestion[];
};

/** One spot to review: an AI find of a picked type with no hand mark near. */
export type ReviewItem = {
  id: string;
  sheet: string;
  sheetLabel: string;
  pdfId: number;
  page: number;
  label: string;
  group: "main" | "data";
  x: number;
  y: number;
  /** Which readings made this find, e.g. "(a) Today run 1". */
  seenIn: string[];
  verdict: VerdictEntry | null;
};

type Tally = {
  byHand: number;
  found: number;
  wrong: number;
  missed: number;
  extra: number;
  /** Of the extras, how many he has called the AI's mistake. */
  aiWrong: number;
  /** Of the extras, how many he has called his own miss, not yet marked. */
  myMiss: number;
};

export type ReportRow = { line: string; perRun: Tally[] };

export type Report = {
  main: ReportRow[];
  data: ReportRow[];
  items: ReviewItem[];
  /** AI finds of unpicked types away from his marks, all readings. */
  ignored: number;
  /** His marks of types not picked, per sheet (first reading of each). */
  marksNotPicked: Map<string, number>;
  /** The picked types per sheet, data marked, for printing. */
  picked: Map<string, { name: string; data: boolean }[]>;
};

const empty = (): Tally => ({
  byHand: 0,
  found: 0,
  wrong: 0,
  missed: 0,
  extra: 0,
  aiWrong: 0,
  myMiss: 0,
});

export function buildReport(
  readings: readonly Reading[],
  file: AnswerKeyFile | null,
  radius: number
): Report {
  const verdicts = file?.verdicts ?? [];
  const lines = Array.from(new Set(readings.map(r => r.line)));
  const runs = Math.max(1, ...readings.map(r => r.run));
  const rows = (): ReportRow[] =>
    lines.map(line => ({
      line,
      perRun: Array.from({ length: runs }, empty),
    }));
  const main = rows();
  const data = rows();
  const items: ReviewItem[] = [];
  const marksNotPicked = new Map<string, number>();
  const picked = new Map<string, { name: string; data: boolean }[]>();
  let ignored = 0;

  for (const r of readings) {
    const key = keyForSheet(r.sheet, r.marks, file);
    if (!picked.has(r.sheet))
      picked.set(
        r.sheet,
        Array.from(key.names).map(([k, name]) => ({
          name,
          data: key.data.has(k),
        }))
      );
    const s = scoreSheet(r.marks, r.suggestions, radius, key);
    ignored += s.ignored;
    if (!marksNotPicked.has(r.sheet))
      marksNotPicked.set(r.sheet, s.marksNotPicked);

    const add = (target: ReportRow[], score: Score, group: "main" | "data") => {
      const t = target.find(x => x.line === r.line)!.perRun[r.run - 1];
      t.byHand += score.byHand;
      t.found += score.found;
      t.wrong += score.wrong;
      t.missed += score.missed;
      t.extra += score.extra;
      for (const e of s.extras) {
        if (e.group !== group) continue;
        const v = verdictFor(r.sheet, e, verdicts, radius);
        if (v?.verdict === "ai-wrong") t.aiWrong += 1;
        if (v?.verdict === "my-miss") t.myMiss += 1;
      }
    };
    add(main, s.main, "main");
    add(data, s.data, "data");

    // One review item per spot, however many readings found it.
    for (const e of s.extras) {
      if (e.x === null || e.y === null) continue;
      const seen = `${r.line} run ${r.run}`;
      const same = items.find(
        i =>
          i.sheet === r.sheet &&
          labelKey(i.label) === labelKey(e.label) &&
          Math.hypot(i.x - (e.x as number), i.y - (e.y as number)) <= radius
      );
      if (same) {
        if (!same.seenIn.includes(seen)) same.seenIn.push(seen);
        continue;
      }
      items.push({
        id: `${r.pdfId}-${r.page}-${items.length + 1}`,
        sheet: r.sheet,
        sheetLabel: r.sheetLabel,
        pdfId: r.pdfId,
        page: r.page,
        label: e.label,
        group: e.group,
        x: e.x,
        y: e.y,
        seenIn: [seen],
        verdict: verdictFor(r.sheet, e, verdicts, radius),
      });
    }
  }

  // Most-agreed first: a find every reading made is the likeliest real miss.
  items.sort(
    (a, b) =>
      a.sheet.localeCompare(b.sheet) ||
      b.seenIn.length - a.seenIn.length ||
      a.y - b.y
  );
  return { main, data, items, ignored, marksNotPicked, picked };
}

/** Markdown tables, one per group, values per run joined with " / ". */
export function formatReport(report: Report): string[] {
  const out: string[] = [];
  const table = (title: string, rows: ReportRow[]) => {
    if (rows.every(r => r.perRun.every(t => t.byHand === 0 && t.extra === 0))) {
      out.push(`\n══ ${title} ══\n  (nothing picked of this kind)`);
      return;
    }
    out.push(`\n══ ${title} ══`);
    out.push(
      "| Method | By hand | Found | Wrong symbol | Missed | Extra | of which AI wrong | of which my miss |"
    );
    out.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of rows) {
      const cell = (k: keyof Tally) => row.perRun.map(t => t[k]).join(" / ");
      out.push(
        `| ${row.line} | ${row.perRun[0].byHand} | ${cell("found")} | ${cell("wrong")} | ` +
          `${cell("missed")} | ${cell("extra")} | ${cell("aiWrong")} | ${cell("myMiss")} |`
      );
    }
  };
  table("Picked types — power, lighting, devices, fire alarm", report.main);
  table("Picked types — data / telecom (scored apart)", report.data);
  const open = report.items.filter(i => i.verdict === null).length;
  const myMiss = report.items.filter(
    i => i.verdict?.verdict === "my-miss"
  ).length;
  out.push(
    `\nAI finds not in your count: ${report.items.length} spot(s) — ` +
      `${open} not reviewed yet` +
      (myMiss ? `, ${myMiss} you called your miss (place those marks)` : "") +
      "."
  );
  out.push(
    `Not scored: ${report.ignored} AI find(s) of types you did not pick; ` +
      Array.from(report.marksNotPicked)
        .map(([sheet, n]) => `${n} of your marks on ${sheet}`)
        .join(", ") +
      " of unpicked types."
  );
  return out;
}
