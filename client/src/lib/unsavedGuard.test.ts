import { afterEach, describe, expect, it, vi } from "vitest";
import {
  answerLeave,
  askToLeave,
  hasUnsaved,
  isAskingToLeave,
  markUnsaved,
  sameToSave,
} from "./unsavedGuard";

const editor = Symbol("editor");

afterEach(() => {
  answerLeave(false);
  markUnsaved(editor, false);
});

describe("unsaved-work guard", () => {
  it("leaves at once when nothing is unsaved", () => {
    const leave = vi.fn();
    expect(askToLeave(leave)).toBe(true);
    expect(leave).toHaveBeenCalledOnce();
    expect(isAskingToLeave()).toBe(false);
  });

  it("holds the leave while work is unsaved, and Keep editing drops it", () => {
    markUnsaved(editor, true);
    const leave = vi.fn();
    expect(askToLeave(leave)).toBe(false);
    expect(leave).not.toHaveBeenCalled();
    expect(isAskingToLeave()).toBe(true);
    answerLeave(false);
    expect(leave).not.toHaveBeenCalled();
    expect(isAskingToLeave()).toBe(false);
    expect(hasUnsaved()).toBe(true);
  });

  it("Discard forgets the unsaved work and goes where was last asked", () => {
    markUnsaved(editor, true);
    const first = vi.fn();
    const second = vi.fn();
    askToLeave(first);
    askToLeave(second);
    answerLeave(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(hasUnsaved()).toBe(false);
  });

  it("a saved editor stops guarding", () => {
    markUnsaved(editor, true);
    markUnsaved(editor, false);
    const leave = vi.fn();
    expect(askToLeave(leave)).toBe(true);
    expect(leave).toHaveBeenCalledOnce();
  });

  it("compares what would be saved", () => {
    expect(sameToSave({ qty: 2, ids: [1] }, { qty: 2, ids: [1] })).toBe(true);
    expect(sameToSave({ qty: 2 }, { qty: 2.25 })).toBe(false);
  });
});
