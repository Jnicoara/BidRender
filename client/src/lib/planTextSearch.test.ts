/**
 * Searching the drawings' text. The awkward inputs are real: pdf.js joins items
 * in drawing order with spaces, so `AD - 101` and `RP - 1` are how split
 * tokens arrive (references/plan-viewer-overhaul.md § 17.4).
 */
import { describe, expect, it } from "vitest";
import {
  findInText,
  likePattern,
  normaliseForSearch,
} from "@shared/planTextSearch";

describe("normaliseForSearch", () => {
  it("joins tokens split around - . / and ignores case", () => {
    expect(normaliseForSearch('PANEL  RP - 1 ,  1 / 2 " EMT')).toBe(
      'panel rp-1 , 1/2" emt'
    );
  });
});

describe("likePattern — the database's loose first pass", () => {
  it("keeps the letter-and-digit runs in order", () => {
    expect(likePattern("RP-1")).toBe("%RP%1%");
    expect(likePattern("fire alarm")).toBe("%fire%alarm%");
  });

  it("escapes wildcards somebody typed", () => {
    expect(likePattern("50_%")).toBe("%50%");
    expect(likePattern("a_b")).toBe("%a%b%");
  });

  it("gives nothing for a query with no letters or digits", () => {
    expect(likePattern("- / .")).toBeNull();
  });
});

describe("findInText — the exact second pass", () => {
  const page = "PANEL RP - 1 FEEDS LP-2. SEE RP-1 SCHEDULE. rp-1 spare.";

  it("finds a token however the drawing split it, and counts every one", () => {
    expect(findInText(page, "rp-1")?.count).toBe(3);
    expect(findInText(page, "RP - 1")?.count).toBe(3);
  });

  it("rejects the near-misses the loose pass let through", () => {
    // "%RP%2%" would keep this page; RP-2 is not on it.
    expect(findInText(page, "RP-2")).toBeNull();
  });

  it("cuts a snippet around the first hit", () => {
    const got = findInText(
      `${"x ".repeat(50)}LIGHTING CONTACTOR LC-1 ${"y ".repeat(50)}`,
      "lc-1"
    );
    expect(got?.snippet).toMatch(/^….*lighting contactor lc-1.*…$/);
  });

  it("does not search for a single character", () => {
    expect(findInText(page, "r")).toBeNull();
  });

  it("finds nothing in an empty page — a scan", () => {
    expect(findInText("", "panel")).toBeNull();
  });
});
