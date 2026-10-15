/**
 * The baseline screen's edit boxes (client/src/lib/starterEdit.ts): a typed
 * value becomes the stored one exactly. Each of these is a wrong number on
 * every new shop's bids if it slips.
 */
import { describe, expect, it } from "vitest";
import {
  STARTER_EDIT_FIELDS,
  fromInputText,
  previewSentence,
  toInputText,
  type EditField,
} from "./starterEdit";
import { STARTER_FIELDS } from "@shared/starterChange";

const field = (table: keyof typeof STARTER_EDIT_FIELDS, name: string) =>
  STARTER_EDIT_FIELDS[table].find(f => f.field === name) as EditField;

describe("typed value → stored value", () => {
  it("a waste % typed as 10 is stored as 0.1, and shown back as 10", () => {
    const f = field("runTypes", "wireExtraPct");
    expect(fromInputText(f, "10")).toEqual({ value: 0.1 });
    expect(fromInputText(f, "10%")).toEqual({ value: 0.1 });
    expect(toInputText("percent", "0.1000")).toBe("10");
  });

  it("an emptied hours box is not set, never 0; a required one refuses", () => {
    expect(fromInputText(field("materials", "laborHours"), "")).toEqual({
      value: null,
    });
    expect(fromInputText(field("materials", "costPerUnit"), "")).toMatchObject({
      error: expect.any(String),
    });
    expect(fromInputText(field("materials", "laborHours"), "0")).toEqual({
      value: 0,
    });
  });

  it("a price may be typed with a $ and commas; text stays text", () => {
    expect(
      fromInputText(field("materials", "costPerUnit"), "$1,250.5")
    ).toEqual({ value: 1250.5 });
    expect(fromInputText(field("materials", "name"), "  Box ")).toEqual({
      value: "Box",
    });
  });

  it("refuses words, negatives and a fraction of a conductor", () => {
    expect(
      fromInputText(field("materials", "costPerUnit"), "abc")
    ).toHaveProperty("error");
    expect(
      fromInputText(field("materials", "costPerUnit"), "-1")
    ).toHaveProperty("error");
    expect(
      fromInputText(field("runTypes", "conductorCount"), "2.5")
    ).toHaveProperty("error");
  });

  it("every box is a field the server lets the screen change, of the kind it says", () => {
    const table = {
      materials: "materials",
      assemblies: "assemblies",
      runTypes: "runTypes",
    } as const;
    for (const [t, fields] of Object.entries(STARTER_EDIT_FIELDS) as [
      keyof typeof table,
      EditField[],
    ][])
      for (const f of fields)
        expect([t, f.field, STARTER_FIELDS[table[t]][f.field]]).toEqual([
          t,
          f.field,
          f.everyone ? "everyone" : "offer",
        ]);
  });
});

describe("what the preview says", () => {
  it("says each count plainly, including zero", () => {
    expect(previewSentence({ reach: "offer", pins: 71, offered: 71 })).toBe(
      "Pins 71 shops to today's value first; offers it to 71 shops. New shops get it straight away."
    );
    expect(previewSentence({ reach: "offer", pins: 0, offered: 1 })).toBe(
      "Every shop already has its own copy, so none needs pinning; offers it to 1 shop. New shops get it straight away."
    );
    expect(previewSentence({ reach: "everyone", pins: 0, offered: 0 })).toMatch(
      /Changes no number/
    );
  });
});
