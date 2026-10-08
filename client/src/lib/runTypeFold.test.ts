/**
 * The run-type picker's ONE fold (references/per-foot-items-plan.md § 3b):
 * the shipped underground types sit behind it; a shop's own types and every
 * search hit never do.
 */
import { describe, expect, it } from "vitest";
import { foldRunTypes } from "./runTypeFold";
import { undergroundRunTypeLabel } from "@shared/undergroundRunTypes";

const emt = { id: 1, isShipped: true, label: '1/2" EMT, 2 #12 + ground' };
const wiremold = {
  id: 2,
  isShipped: true,
  label: "700 series surface raceway, 2 #12 + ground",
};
const ug = ['1/2"', '3/4"', '1"', '2"'].map((size, i) => ({
  id: 10 + i,
  isShipped: true,
  label: undergroundRunTypeLabel(size),
}));
/** A shop's fork of the 2" one: the same label, but theirs. */
const theirs = {
  id: 99,
  isShipped: false,
  label: undergroundRunTypeLabel('2"'),
};

describe("foldRunTypes", () => {
  it("shows ours that are common and folds our underground ones", () => {
    const fold = foldRunTypes([emt, wiremold, ...ug], "", 8, null);
    expect(fold.shown).toEqual([emt, wiremold]);
    expect(fold.folded).toEqual(ug);
    expect(fold.openAtStart).toBe(false);
  });

  it("never folds a shop's own type, even one named like ours", () => {
    const fold = foldRunTypes([emt, theirs, ...ug], "", 8, null);
    expect(fold.shown).toEqual([emt, theirs]);
    expect(fold.folded).toEqual(ug);
  });

  it("folds nothing while searching — a match is never hidden", () => {
    const fold = foldRunTypes([emt, ...ug], "pvc", 8, null);
    expect(fold.shown).toEqual([]);
    expect(fold.folded).toEqual([]);
  });

  it("caps only the unfolded rows, so the fold cannot crowd them out", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: 100 + i,
      isShipped: false,
      label: `Type ${i}`,
    }));
    const fold = foldRunTypes([...ug, ...many], "", 8, null);
    expect(fold.shown).toHaveLength(8);
    expect(fold.folded).toEqual(ug);
  });

  it("lists the folded types by SIZE, not alphabetically", () => {
    // The palette arrives alphabetical, which files 1-1/2" before 1-1/4"
    // and 3-1/2" before 3" — seen on screen 2026-10-08.
    const sizes = ['1-1/2"', '1-1/4"', '1"', '3-1/2"', '3"', '1/2"'];
    const alphabetical = sizes
      .map((size, i) => ({
        id: 50 + i,
        isShipped: true,
        label: undergroundRunTypeLabel(size),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    expect(
      foldRunTypes(alphabetical, "", 8, null).folded.map(t => t.label)
    ).toEqual(
      ['1/2"', '1"', '1-1/4"', '1-1/2"', '3"', '3-1/2"'].map(
        undergroundRunTypeLabel
      )
    );
  });

  it("starts open when the armed type is behind it, and closed otherwise", () => {
    expect(foldRunTypes([emt, ...ug], "", 8, ug[2].id).openAtStart).toBe(true);
    expect(foldRunTypes([emt, ...ug], "", 8, emt.id).openAtStart).toBe(false);
  });
});
