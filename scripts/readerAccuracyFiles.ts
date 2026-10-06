/**
 * reader-accuracy/answer-key.json on disk — the picked types per sheet and
 * his verdicts on AI finds. Git-ignored with the rest of reader-accuracy/,
 * because it is this machine's test, like the hand count it corrects.
 *
 * A file that cannot be read STOPS the script, naming it, rather than being
 * treated as empty: the next verdict would then overwrite it, and losing an
 * afternoon of verdicts to a typo in a hand edit is worse than a refusal.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AnswerKeyFile } from "./readerAccuracyAnswerKey";

export const ANSWER_KEY_PATH = path.join("reader-accuracy", "answer-key.json");

export function readAnswerKeyFile(file = ANSWER_KEY_PATH): AnswerKeyFile {
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (typeof parsed === "object" && parsed !== null)
      return parsed as AnswerKeyFile;
  } catch (error) {
    throw new Error(
      `${file} could not be read (${error instanceof Error ? error.message : error}). ` +
        "Fix it or move it aside; nothing has been overwritten."
    );
  }
  return {};
}

/** Whole file at once, through a temporary name, so a crash cannot halve it. */
export function writeAnswerKeyFile(
  content: AnswerKeyFile,
  file = ANSWER_KEY_PATH
): void {
  const temp = `${file}.writing`;
  writeFileSync(temp, JSON.stringify(content, null, 2) + "\n");
  renameSync(temp, file);
}
