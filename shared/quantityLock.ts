/**
 * The quantity lock: the moment an estimator says "this bid is what I sent".
 *
 * ── The rule this exists to bend, once, on purpose ───────────────────────────
 * **The plans own what it is and how many. The bid owns what it costs.**
 * (shared/takeoffBridge.ts, and every line of it still holds.) A from-plans
 * line's quantity follows the marks for ever, which is exactly right while a
 * bid is being built — and wrong the day after it was sent to a customer, when
 * somebody opens the drawing to look at something and the number behind a
 * signed price moves.
 *
 * So the lock is a third state of ONE column, not a second column:
 *
 *   unlocked  →  a from-plans line reads the drawing, live      (`"drawing"`)
 *   locked    →  it reads `bid_line_items.qty`, which the lock wrote (`"locked"`)
 *   by hand   →  it always read `qty`, and always will          (`"typed"`)
 *
 * ── Why there is no second quantity column ───────────────────────────────────
 * A `lockedQty` beside `qty` is two numbers for one fact, and the first missed
 * write makes them disagree with nothing on screen to say which is right —
 * the failure the derived count was built to prevent
 * (shared/takeoffBridge.ts § "Why the quantity is DERIVED"). Locking WRITES the
 * drawing's answer into the column that was always there, and the timestamp
 * says to stop re-deriving it.
 *
 * ── Why it is never automatic ────────────────────────────────────────────────
 * Not on a status change, not on a proposal being printed, not on a due date
 * passing. A bid marked Won is often still being adjusted, and a lock the app
 * applied is a number frozen at an instant the app chose — the same reason
 * sending a count to the bid is a button rather than a side effect (§ 5f.0
 * OVERRIDE 2). One person, one deliberate act, reversible.
 *
 * ── What the lock does NOT touch, and the sentence every screen must carry ───
 * **Prices were already frozen, separately, when each line was added.** The
 * four snapshot columns are R4 and have nothing to do with this. An estimator
 * who reads "locked" and believes it is what stopped their costs moving will
 * unlock a bid expecting prices to refresh, and they will not. So the copy in
 * this file says so out loud, and it is tested.
 */

/** A line, as the lock needs it: does its quantity follow a drawing? */
export type LockableLine = {
  /** Set means the quantity is a count of marks. */
  takeoffGroupId: number | null;
  /** Set means the quantity is traced footage. */
  takeoffRunTypeId: number | null;
};

/**
 * Where a line's quantity comes from — the whole decision, in one function.
 *
 * Both the server chokepoint (`withPlanCounts` in server/db.ts) and all three
 * screens ask this rather than each re-deriving it from two nullable ids and a
 * timestamp. Three copies of "is this locked?" is three chances for one of them
 * to word a line as following the drawing while the number sits still, which is
 * a confidently wrong screen rather than a blank one (CLAUDE.md § A layout or
 * copy change is NOT verified).
 */
export type QuantitySource = "typed" | "drawing" | "locked";

export function followsDrawing(line: LockableLine): boolean {
  return line.takeoffGroupId !== null || line.takeoffRunTypeId !== null;
}

export function quantitySource(
  line: LockableLine,
  lockedAt: Date | null
): QuantitySource {
  if (!followsDrawing(line)) return "typed";
  return lockedAt === null ? "drawing" : "locked";
}

/**
 * A quantity that would move if the bid were unlocked.
 *
 * `from` is what the bid says now, `to` is what the drawing says today. Both
 * are rounded to the four decimals the column holds, so a line that is
 * genuinely unchanged cannot appear as a change because of a float tail.
 */
export type QuantityChange = {
  lineId: number;
  name: string;
  from: number;
  to: number;
};

/** A locked line, with both numbers — what the bid holds and what the plans say. */
export type LockedLine = LockableLine & {
  id: number;
  name: string;
  /** The frozen number on the bid. */
  lockedQty: number;
  /** What this line would read if the bid were unlocked right now. */
  drawingQty: number;
};

const to4 = (value: number) => Math.round(value * 10000) / 10000;

/**
 * What unlocking would change, in bid order.
 *
 * ── Why this is computed and not guessed at ──────────────────────────────────
 * "Unlock this bid?" with no numbers in it is a question nobody can answer:
 * the whole point of the lock is that the drawing has moved on since, and the
 * estimator cannot know by how much without going to look. CLAUDE.md §
 * "A number that can be measured should not be asserted" — so the confirmation
 * asks the drawing and prints the difference.
 *
 * An EMPTY result is a real and common answer: a bid locked an hour ago that
 * nobody has drawn on since. It is not a reason to skip the confirmation — the
 * estimator is still turning the following back on, and next week's marks will
 * move the line. It changes the words, not whether they are shown.
 */
export function unlockChanges(lines: readonly LockedLine[]): QuantityChange[] {
  const changes: QuantityChange[] = [];
  for (const line of lines) {
    if (!followsDrawing(line)) continue;
    const from = to4(line.lockedQty);
    const to = to4(line.drawingQty);
    if (from === to) continue;
    changes.push({ lineId: line.id, name: line.name, from, to });
  }
  return changes;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * A number the way a quantity should read: `14`, not `14.0000`, and `125.01`
 * kept as it is.
 *
 * The column is decimal(10,4), so every quantity arrives as a string with four
 * decimals on it. Printing that in a sentence about a count of receptacles
 * reads as a measurement nobody made.
 */
export function quantityText(value: number): string {
  return String(to4(value));
}

/**
 * The banner on a locked bid.
 *
 * Three facts, in the order somebody needs them: it is locked, when, and what
 * that means for the numbers in front of them — plus the sentence about prices,
 * which is here rather than in the component because it is the one line in this
 * feature that can be MISread into a wrong belief about R4.
 */
export function lockedBannerCopy(
  lockedAt: Date,
  followingLines: number
): { title: string; body: string } {
  return {
    title: `Quantities locked ${lockedAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`,
    body:
      followingLines > 0
        ? `${plural(followingLines, "line", "lines")} no longer follow${
            followingLines === 1 ? "s" : ""
          } your plans — ${
            followingLines === 1 ? "it holds" : "they hold"
          } the quantity the drawing said when you locked it. Marking, tracing and untracing change nothing here until you unlock. Prices are a separate thing and were already frozen on each line the day it was added.`
        : `Nothing on this bid takes its quantity from the plans, so the lock is holding nothing today. Anything you send from the plans while it is locked arrives frozen at the number it came over with. Prices are a separate thing and were already frozen on each line the day it was added.`,
  };
}

/** The quiet line offering the lock, on a bid whose quantities still follow. */
export function unlockedNoticeCopy(followingLines: number): string {
  return `${plural(followingLines, "line", "lines")} on this bid follow${
    followingLines === 1 ? "s" : ""
  } your plans and ${
    followingLines === 1 ? "changes" : "change"
  } when you mark or trace. Lock the quantities when this bid is what you sent.`;
}

/**
 * The confirmation in front of unlocking, which has to NAME what will change.
 *
 * ── Why the names and the numbers, rather than a count ───────────────────────
 * "7 lines may change" is a warning nobody can act on. "Exit sign LED: 14 → 16"
 * is a decision — the estimator recognises the count they added on purpose, or
 * they recognise a number they did not expect and cancel. Same reason
 * `doubleCountedAssemblies` returns names rather than a tally.
 *
 * ── Why it still confirms when nothing would move ────────────────────────────
 * See `unlockChanges`. The consequence being nil TODAY is not the same as there
 * being no consequence, and a confirmation that appears only sometimes teaches
 * people that unlocking is usually free.
 */
export function unlockConfirmCopy(changes: readonly QuantityChange[]): {
  title: string;
  body: string;
  /** One line per quantity that moves, already worded. Empty when none do. */
  changeLines: string[];
} {
  const changeLines = changes.map(
    change =>
      `${change.name}: ${quantityText(change.from)} → ${quantityText(change.to)}`
  );
  return {
    title: "Let these quantities follow the plans again?",
    body:
      changes.length > 0
        ? `${plural(
            changes.length,
            "quantity changes",
            "quantities change"
          )} the moment you unlock, because the plans have moved on since you locked this bid. The prices on every line stay exactly as they are — they were frozen when the line was added and unlocking does not touch them.`
        : "No quantity moves right now, because the plans say the same as the bid does. From here on, marking or tracing will change these lines again. The prices on every line stay exactly as they are — they were frozen when the line was added and unlocking does not touch them.",
    changeLines,
  };
}

/**
 * Why a typed quantity is refused, said differently depending on the lock.
 *
 * ── A message describing the OLD meaning is worse than no message ────────────
 * "Change it by marking on the Plans screen" is true of an unlocked bid and a
 * lie on a locked one — marking is exactly what will not change it. CLAUDE.md
 * § "a label describing the OLD meaning": a sentence that quietly restates the
 * previous behaviour beside a number carrying the new one reads as
 * confirmation. So the refusal is generated from the lock state, in the same
 * file that decides the lock state.
 */
export function typedQuantityRefusal(
  source: Exclude<QuantitySource, "typed">,
  qty: number
): string {
  if (source === "locked") {
    return (
      `This bid's quantities are locked, so this line is holding ${quantityText(qty)}. ` +
      `Unlock the bid to let it follow your plans again.`
    );
  }
  return (
    `This line counts ${quantityText(qty)} from your plans. ` +
    `Change it by marking or unmarking on the Plans screen.`
  );
}
