import { describe, expect, it } from "vitest";
import { isMissingBid, plansPane, retryUnlessMissing } from "./plansPane";

describe("a bid that is not there", () => {
  const notFound = { data: { code: "NOT_FOUND" } };
  const dropped = { data: null, message: "Failed to fetch" };

  it("says so, not that the plans could not load", () => {
    expect(
      plansPane({ isLoading: false, isError: true, count: 0, missing: true })
    ).toBe("missing");
  });

  it("is read from the server's code, and a dropped connection is not it", () => {
    expect(isMissingBid(notFound)).toBe(true);
    expect(isMissingBid(dropped)).toBe(false);
    expect(isMissingBid(new Error("Bid not found."))).toBe(false);
    expect(isMissingBid(null)).toBe(false);
  });

  it("is not retried; a dropped connection still is", () => {
    expect(retryUnlessMissing(0, notFound)).toBe(false);
    expect(retryUnlessMissing(0, dropped)).toBe(true);
    expect(retryUnlessMissing(3, dropped)).toBe(false);
  });
});

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

  it("shows the plans, not the upload box, while a first set previews from this machine", () => {
    expect(
      plansPane({
        isLoading: false,
        isError: false,
        count: 0,
        previewing: true,
      })
    ).toBe("plans");
  });
});
