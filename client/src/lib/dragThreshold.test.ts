import { describe, expect, it, vi } from "vitest";
import {
  DRAG_THRESHOLD_PX,
  pastDragThreshold,
  swallowNextClick,
} from "./dragThreshold";

/*
  Node's EventTarget has no capture phase: listeners run in the order they
  were added. In the app the swallow is a CAPTURE listener on the window,
  which runs before any listener on the page, so here it is added first —
  the order the browser gives it. `onPage` stands for the mark's select.
*/
describe("the click after a real pan", () => {
  const click = () => new Event("click", { cancelable: true });

  it("is eaten — so a pan never selects what it started on", () => {
    const target = new EventTarget();
    const onPage = vi.fn();
    swallowNextClick(target);
    target.addEventListener("click", onPage);
    const first = click();
    target.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(onPage).not.toHaveBeenCalled();
  });

  it("only the one: the next click is an ordinary click", () => {
    const target = new EventTarget();
    const onPage = vi.fn();
    swallowNextClick(target);
    target.addEventListener("click", onPage);
    target.dispatchEvent(click());
    target.dispatchEvent(click());
    expect(onPage).toHaveBeenCalledTimes(1);
  });

  it("and only for a moment: a click long after is not eaten", () => {
    vi.useFakeTimers();
    try {
      const target = new EventTarget();
      const selected = vi.fn();
      target.addEventListener("click", selected);
      swallowNextClick(target, 400);
      vi.advanceTimersByTime(401);
      target.dispatchEvent(click());
      expect(selected).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("when a press becomes a drag", () => {
  const start = { x: 100, y: 100 };

  it("a wobble under the threshold is still a click", () => {
    expect(pastDragThreshold(start, { x: 101, y: 101 })).toBe(false);
    expect(pastDragThreshold(start, { x: 103, y: 100 })).toBe(false);
    expect(pastDragThreshold(start, start)).toBe(false);
  });

  it("moving the threshold, in any direction, is a drag", () => {
    expect(
      pastDragThreshold(start, { x: 100 + DRAG_THRESHOLD_PX, y: 100 })
    ).toBe(true);
    expect(pastDragThreshold(start, { x: 97, y: 97 })).toBe(true);
    expect(pastDragThreshold(start, { x: 100, y: 60 })).toBe(true);
  });
});
