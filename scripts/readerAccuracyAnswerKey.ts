/**
 * The SMALLER ANSWER KEY for the reader-accuracy test, 2026-10-01.
 *
 * Pure: no database, no model, no files — the review script and the test
 * reach it alike. The scorer underneath (readerAccuracyScore.ts) is unchanged
 * in its rules; this decides WHAT it is asked to score.
 *
 * ── Only the types he picked, per sheet ──────────────────────────────────────
 * The full count asked for every device on a sheet — dozens of types, hours a
 * sheet. Now each sheet is scored on 8–10 picked types (duplex, GFCI,
 * switches, light fixtures, junction boxes, data, fire alarm, and their
 * existing versions). Everything else is IGNORED, both ways: his marks of an
 * unpicked type are not scored, and an AI find of an unpicked type is not an
 * extra. Picked by default = the types he counted on that sheet, which is
 * what picking means in practice; `reader-accuracy/answer-key.json` can add a
 * picked type that has none on the sheet (so an AI find of it IS an extra)
 * or name the list outright.
 *
 * An AI find of an unpicked type that lands on one of his picked marks still
 * counts against the AI as WRONG SYMBOL — it looked at the device and named
 * it as something else. Away from his marks it is ignored.
 *
 * ── Data / telecom apart ─────────────────────────────────────────────────────
 * Scored as its own table, never added into the power totals: the AI's data
 * symbols are a different problem (tiny triangles, dense outlets) and one
 * number for both hides which one is good.
 *
 * ── Every extra listed, for a verdict ────────────────────────────────────────
 * An AI find with no hand mark near it is either the AI's mistake or a device
 * he missed. Only he can say which. Each one is listed with its spot; his
 * verdict is kept in the answer-key file and matched back on the next scoring
 * by sheet, type and place — never by index, which changes run to run.
 * "My miss" is fixed by placing the mark in the app, by hand, at the device:
 * writing the AI's position into the answer key would score the AI against
 * itself.
 */
import { labelKey, scoreReading } from "./readerAccuracyScore";
import type { HandMark, Score, Suggestion } from "./readerAccuracyScore";
import {
  existingToRemainName,
  splitExistingToRemain,
} from "../shared/existingToRemain";

export type Verdict = "ai-wrong" | "my-miss";

export type VerdictEntry = {
  /** `${pdf filename} p${page}`, the sheet's stable name in this file. */
  sheet: string;
  label: string;
  x: number;
  y: number;
  verdict: Verdict;
  /** When he said so, ISO. */
  at: string;
};

/** reader-accuracy/answer-key.json. Every field optional. */
export type AnswerKeyFile = {
  sheets?: Record<
    string,
    {
      /** Replaces the default (the types counted on the sheet). */
      picked?: string[];
      /** Added to the default. */
      alsoPicked?: string[];
      /** Picked types scored as data / telecom, replacing the word rule. */
      dataTelecom?: string[];
    }
  >;
  verdicts?: VerdictEntry[];
  /**
   * Names that are the SAME ITEM, one list per item, the hand count's name
   * first: `[["GFCI receptacle", "DUPLEX RECEPTACLE, GFCI", "GFCI"]]`.
   * Added 2026-10-01: the AI labels a find with the CAPTURED legend symbol's
   * name, and 10 of the owner's 15 counts are named differently from their
   * symbol — so a right answer scored as "wrong symbol". Nothing is renamed;
   * scoring reads every name in a list as the first one.
   */
  sameAs?: string[][];
};

/**
 * The name scoring uses for `label`: the first name of its "same as" list,
 * or the label itself. An "- EXISTING TO REMAIN" twin keeps its suffix, so it
 * still folds into its symbol the way `labelKey` already does.
 */
export function sameAsNamer(
  file: AnswerKeyFile | null
): (label: string | null) => string | null {
  const canonical = new Map<string, string>();
  for (const group of file?.sameAs ?? []) {
    const first = group.find(n => n.trim());
    if (!first) continue;
    for (const name of group) {
      const key = labelKey(name);
      // A name in two lists would make the answer depend on file order.
      const already = canonical.get(key);
      if (already !== undefined && labelKey(already) !== labelKey(first))
        throw new Error(
          `"${name}" is in two "same as" lists in answer-key.json — keep it in one.`
        );
      canonical.set(key, first.trim());
    }
  }
  return label => {
    if (label === null) return null;
    const { base, existing } = splitExistingToRemain(label);
    const mapped = canonical.get(labelKey(base));
    if (mapped === undefined) return label;
    return existing ? existingToRemainName(mapped) : mapped;
  };
}

export type SheetKey = {
  /** Normalised keys (labelKey) of every picked type, data included. */
  picked: Set<string>;
  /** Of those, the data / telecom ones. */
  data: Set<string>;
  /** For printing, one display name per key. */
  names: Map<string, string>;
};

/** The sheet's name in the answer-key file: stable across bids and runs. */
export function sheetKeyName(pdfFilename: string, pageNumber: number): string {
  return `${pdfFilename} p${pageNumber}`;
}

/**
 * Data and telecom by WORD, for when the file does not say. Whole words only:
 * "TELECOM CABINET" is telecom, "DATA OUTLET" is data, "TV" and "WAP" are
 * low voltage — and "DUPLEX" containing no such word is power. Fire alarm is
 * NOT here on purpose; it is scored with power, as asked.
 */
const DATA_WORDS =
  /\b(data|telecom|telecommunications?|tel|telephone|phone|voice|comm|communications?|network|lan|wap|wifi|wireless|access point|catv|tv|cctv|camera|card reader|intercom|av|audio ?visual|fiber|fibre|patch|rack)\b/i;

export function looksDataTelecom(label: string): boolean {
  return DATA_WORDS.test(splitExistingToRemain(label).base);
}

export function keyForSheet(
  sheetName: string,
  marks: readonly HandMark[],
  file: AnswerKeyFile | null
): SheetKey {
  const entry = file?.sheets?.[sheetName];
  const names = new Map<string, string>();
  const add = (label: string) => {
    const key = labelKey(label);
    if (key && !names.has(key))
      names.set(key, splitExistingToRemain(label).base);
  };
  if (entry?.picked) entry.picked.forEach(add);
  else marks.forEach(m => add(m.label));
  entry?.alsoPicked?.forEach(add);

  const picked = new Set(names.keys());
  const data = new Set<string>();
  if (entry?.dataTelecom) {
    for (const label of entry.dataTelecom) {
      const key = labelKey(label);
      if (picked.has(key)) data.add(key);
    }
  } else {
    names.forEach((name, key) => {
      if (looksDataTelecom(name)) data.add(key);
    });
  }
  return { picked, data, names };
}

export type Extra = {
  /** Index into the reading's suggestions. */
  index: number;
  label: string;
  x: number | null;
  y: number | null;
  group: "main" | "data";
};

export type SheetScore = {
  main: Score;
  data: Score;
  /** AI finds near none of his picked marks, of a picked type. */
  extras: Extra[];
  /** AI finds of unpicked types near none of his marks: not scored. */
  ignored: number;
  /** His marks of unpicked types: not scored. */
  marksNotPicked: number;
};

/**
 * Score one reading of one sheet against the smaller key.
 *
 * Main and data are scored apart. A suggestion of an unpicked or unknown type
 * may still be paired with a MAIN mark as a wrong symbol (see the header);
 * if nothing claims it, it is ignored rather than counted extra.
 */
export function scoreSheet(
  marks: readonly HandMark[],
  suggestions: readonly Suggestion[],
  radius: number,
  key: SheetKey
): SheetScore {
  const groupOf = (label: string | null) => {
    const k = labelKey(label);
    if (!key.picked.has(k)) return "other" as const;
    return key.data.has(k) ? ("data" as const) : ("main" as const);
  };

  const mainMarks = marks.filter(m => groupOf(m.label) === "main");
  const dataMarks = marks.filter(m => groupOf(m.label) === "data");
  const marksNotPicked = marks.length - mainMarks.length - dataMarks.length;

  const mainIdx: number[] = [];
  const dataIdx: number[] = [];
  const otherIdx: number[] = [];
  suggestions.forEach((s, i) => {
    const g = groupOf(s.label);
    (g === "main" ? mainIdx : g === "data" ? dataIdx : otherIdx).push(i);
  });

  // Main: its own suggestions, then the unpicked ones (wrong-symbol only).
  const mainPool = [...mainIdx, ...otherIdx];
  const mainRaw = scoreReading(
    mainMarks,
    mainPool.map(i => suggestions[i]),
    radius
  );
  const dataRaw = scoreReading(
    dataMarks,
    dataIdx.map(i => suggestions[i]),
    radius
  );

  const extras: Extra[] = [];
  let ignored = 0;
  let mainUnplaced = 0;
  for (const local of mainRaw.unmatched) {
    const index = mainPool[local];
    const s = suggestions[index];
    if (local >= mainIdx.length) {
      ignored += 1;
      continue;
    }
    if (s.x === null || s.y === null) mainUnplaced += 1;
    extras.push({ index, label: s.label ?? "", x: s.x, y: s.y, group: "main" });
  }
  for (const local of dataRaw.unmatched) {
    const index = dataIdx[local];
    const s = suggestions[index];
    extras.push({ index, label: s.label ?? "", x: s.x, y: s.y, group: "data" });
  }

  // Main's extras exclude the ignored ones; its byType loses their rows too.
  const mainExtras = extras.filter(e => e.group === "main");
  const byType = new Map(
    Array.from(mainRaw.byType).filter(([k]) => key.picked.has(k))
  );
  byType.forEach(t => (t.extra = 0));
  for (const e of mainExtras) {
    const t = byType.get(labelKey(e.label));
    if (t) t.extra += 1;
  }
  const main: Score = {
    ...mainRaw,
    extra: mainExtras.length,
    unplaced: mainUnplaced,
    unmatched: mainExtras.map(e => e.index),
    byType,
  };
  const data: Score = {
    ...dataRaw,
    unmatched: dataRaw.unmatched.map(i => dataIdx[i]),
  };
  return { main, data, extras, ignored, marksNotPicked };
}

/**
 * Record (or, with `verdict: null`, take back) his verdict on one spot.
 * Replaces any earlier verdict on the same spot rather than piling up, so
 * the file says what he thinks now. Returns a new file; the input is kept.
 */
export function setVerdict(
  file: AnswerKeyFile,
  spot: Omit<VerdictEntry, "verdict" | "at">,
  verdict: Verdict | null,
  radius: number,
  at: string
): AnswerKeyFile {
  const kept = (file.verdicts ?? []).filter(
    v =>
      !(
        v.sheet === spot.sheet &&
        labelKey(v.label) === labelKey(spot.label) &&
        Math.hypot(v.x - spot.x, v.y - spot.y) <= radius
      )
  );
  return {
    ...file,
    verdicts: verdict ? [...kept, { ...spot, verdict, at }] : kept,
  };
}

/**
 * His verdict on one extra, if he gave one: same sheet, same type, and
 * within `radius` — a re-run puts the same find a little elsewhere.
 */
export function verdictFor(
  sheet: string,
  extra: Pick<Extra, "label" | "x" | "y">,
  verdicts: readonly VerdictEntry[],
  radius: number
): VerdictEntry | null {
  if (extra.x === null || extra.y === null) return null;
  let best: VerdictEntry | null = null;
  let bestDistance = Infinity;
  for (const v of verdicts) {
    if (v.sheet !== sheet || labelKey(v.label) !== labelKey(extra.label))
      continue;
    const d = Math.hypot(v.x - extra.x, v.y - extra.y);
    // The latest verdict wins a tie: he changed his mind.
    if (d <= radius && d <= bestDistance) {
      best = v;
      bestDistance = d;
    }
  }
  return best;
}
