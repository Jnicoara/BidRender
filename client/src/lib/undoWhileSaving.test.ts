/**
 * UNDO PRESSED WHILE A MARK IS STILL SAVING SAYS SO (todo.md, smoke step 10
 * findings, 2026-10-08).
 *
 * A mark's undo step is pushed only when the server confirms its ids. Before
 * this, Ctrl+Z inside that window did nothing — or took back an OLDER step —
 * with no word either way. Now every press of undo (keyboard, toolbar arrow,
 * card arrow, a toast's Undo) goes through `stepBack`, which asks
 * `stillSavingMessage` first, says "Still saving", takes nothing back, and
 * sends the queue.
 *
 * vitest cannot reach a React component, so the wiring half reads
 * TakeoffPage's source, as `notUndoableWired.test.ts` does.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { stillSavingMessage } from "./undoStack";

const src = readFileSync(
  new URL("../pages/TakeoffPage.tsx", import.meta.url),
  "utf8"
);

/** The body of `const stepBack = useCallback(…)`, up to its deps array. */
function stepBackBody(): string {
  const start = src.indexOf("const stepBack = useCallback(");
  expect(start, "stepBack exists").toBeGreaterThan(-1);
  const end = src.indexOf("\n  );\n", start);
  return src.slice(start, end);
}

describe("undo while a mark is still saving", () => {
  it("says so while any mark is in the queue, and nothing once it is empty", () => {
    expect(stillSavingMessage([{ sent: true }])).toBe(
      "Still saving — try again in a second."
    );
    expect(stillSavingMessage([{ sent: false }, { sent: true }])).toBe(
      "Still saving — try again in a second."
    );
    expect(stillSavingMessage([])).toBeNull();
  });

  it("a mark the server CONFIRMED is not still saving — its step is on the stack (2026-10-16)", () => {
    // The drawn copy waits for the sheet's list to come back; an Undo in
    // that window was refused, which is what made the tablet smoke flaky.
    expect(stillSavingMessage([{ sent: true, saved: true }])).toBeNull();
    // One confirmed and one still in flight: still saving.
    expect(
      stillSavingMessage([{ sent: true, saved: true }, { sent: true }])
    ).toBe("Still saving — try again in a second.");
  });

  it("the flush marks a batch saved right after pushing its step, before the list refetch", () => {
    const flush = src.slice(
      src.indexOf("const flushStamps = useCallback("),
      src.indexOf("flushStampsRef.current = flushStamps;")
    );
    const pushed = flush.indexOf("pushUndo({");
    const saved = flush.indexOf("{ ...m, saved: true }");
    const refetch = flush.indexOf("listForSheet.invalidate");
    expect(pushed).toBeGreaterThan(-1);
    expect(saved).toBeGreaterThan(pushed);
    expect(saved).toBeLessThan(refetch);
  });

  it("is asked by stepBack BEFORE any step is taken, and only for undo", () => {
    const body = stepBackBody();
    const asked = body.indexOf("stillSavingMessage(pendingStamps.current)");
    expect(asked, "stepBack asks about the mark queue").toBeGreaterThan(-1);
    // Before the step is chosen, so nothing is taken back while saving.
    expect(asked).toBeLessThan(body.indexOf("nextUndo(state)"));
    expect(asked).toBeLessThan(body.indexOf("runUndoOp(op)"));
    // Redo is not held up: a mark's step has no redo to race.
    expect(body).toMatch(
      /direction === "undo" \? stillSavingMessage\(pendingStamps\.current\) : null/
    );
  });

  it("tells the person, and sends the queue now rather than at its timer", () => {
    const body = stepBackBody();
    const branch = body.slice(
      body.indexOf("if (saving !== null) {"),
      body.indexOf("const notCovered")
    );
    expect(branch).toContain("toast.message(saving)");
    expect(branch).toContain("flushStampsRef.current()");
    expect(branch).toContain("return;");
    expect(src).toContain("flushStampsRef.current = flushStamps;");
  });

  it("every undo control goes through stepBack — none undoes on its own", () => {
    const presses = src.match(/stepBack\("undo"\)/g) ?? [];
    // Keyboard, toolbar arrow, count card arrow, a delete toast's Undo.
    expect(presses.length).toBeGreaterThanOrEqual(4);
    // The one place a step is TAKEN (the arrow's disabled check also reads
    // `nextUndo(undoState)`, which takes nothing).
    expect(src.match(/nextUndo\(state\)/g)?.length).toBe(1);
    expect(stepBackBody()).toContain("nextUndo(state)");
  });
});
