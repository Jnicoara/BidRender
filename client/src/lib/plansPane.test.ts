import { describe, expect, it } from "vitest";
import { plansPane } from "./plansPane";

describe("the Plans pane", () => {
  it("never offers the upload box for a list that failed to load", () => {
    // The fault: a failed list arrived as [] and drew "Drop plan PDFs here".
    expect(plansPane({ isLoading: false, isError: true, count: 0 })).toBe(
      "failed"
    );
  });

  it("offers the upload box only for a list that loaded and is empty", () => {
    expect(plansPane({ isLoading: false, isError: false, count: 0 })).toBe(
      "empty"
    );
  });

  it("waits while the first answer is on its way", () => {
    expect(plansPane({ isLoading: true, isError: false, count: 0 })).toBe(
      "loading"
    );
  });

  it("keeps plans on screen when a later refresh fails", () => {
    expect(plansPane({ isLoading: false, isError: true, count: 2 })).toBe(
      "plans"
    );
  });
});
