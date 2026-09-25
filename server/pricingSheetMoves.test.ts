/**
 * The record of pricing-sheet rows that moved into the catalog under another
 * name (`pricing/movedFromSheet.ts`) must agree with the catalog itself.
 *
 * The sheet builder refuses to run on a bad entry, but it only runs when
 * somebody regenerates the sheet. This runs on every test pass, so a later
 * rename or retirement of a shipped row cannot quietly strand an entry — which
 * would bring the old sheet row back as NEW beside its shipped self, and get
 * the same part priced twice.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_MATERIALS } from "./seed/materials";
import {
  MERGED_FROM_SHEET,
  RENAMED_FROM_SHEET,
} from "../pricing/movedFromSheet";

const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));

describe("pricing-sheet rows moved into the catalog", () => {
  it("points every entry at a row the catalog ships", () => {
    const stranded = Object.entries({
      ...MERGED_FROM_SHEET,
      ...RENAMED_FROM_SHEET,
    })
      .filter(([, to]) => !shipped.has(to))
      .map(([from, to]) => `${from} -> ${to}`);
    expect(stranded).toEqual([]);
  });

  it("never lists a shipped name as the sheet's old wording", () => {
    // If the old wording is itself shipped, there are two rows for one part.
    const both = Object.keys({
      ...MERGED_FROM_SHEET,
      ...RENAMED_FROM_SHEET,
    }).filter(from => shipped.has(from));
    expect(both).toEqual([]);
  });

  it("files each sheet row under one kind only", () => {
    const overlap = Object.keys(MERGED_FROM_SHEET).filter(
      from => from in RENAMED_FROM_SHEET
    );
    expect(overlap).toEqual([]);
  });
});
