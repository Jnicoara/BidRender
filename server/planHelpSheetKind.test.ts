/**
 * PLAN-READING HELP, step 3 — "What is this sheet?"
 * (shared/planHelp/sheetKind.ts; references/plan-reading-help-plan.md § 4).
 *
 * The titles below were READ FROM THE DATABASE (bid_pdf_sheet_identity on
 * the Track B database, 2026-10-13), not typed from memory — CLAUDE.md § "a
 * number that can be measured". Old Blueridge has no stored titles at all,
 * which is itself a case: no title, no line.
 *
 * Content rules, each with a red to go to:
 *   - no digit anywhere in a card (§ 9 Q6: no hours, no prices);
 *   - every kind has a card, and only one per trade;
 *   - a drawing word in a title that is not a plan does not make it one.
 */
import { describe, expect, it } from "vitest";
import {
  SHEET_KINDS,
  SHEET_KINDS_REVIEW,
  SHEET_KIND_CARDS,
  sheetKindCard,
  sheetKinds,
} from "../shared/planHelp/sheetKind";

describe("sheetKinds — real titles from the sets on hand", () => {
  it.each([
    // weld1 (E-001 … E-200)
    ["INDEX, LEGEND AND NOTES", ["notes"]],
    ["ELECTRICAL SPECIFICATION", ["notes"]],
    ["ELECTRICAL ONE-LINE AND SCHEDULES", ["oneLine"]],
    ["LIGHTING PLAN", ["lighting"]],
    ["POWER PLAN", ["power"]],
    // weld2
    ["ELECTRICAL LEGEND AND SHEET INDEX", ["notes"]],
    ["ELECTRICAL SINGLE-LINE DIAGRAM", ["oneLine"]],
    ["PANELBOARD SCHEDULES", ["panelSchedule"]],
    ["FIRST LEVEL DEMOLITION PLAN", ["demolition"]],
    ["SECOND LEVEL POWER PLAN", ["power"]],
    ["THIRD LEVEL LIGHTING PLAN", ["lighting"]],
    ["LIGHTING CONTROL DETAILS", ["details"]],
    // uncc (E111 among them)
    ["ELECTRICAL SYMBOLS AND NOTES", ["notes"]],
    ["EXISTING POWER RISER DIAGRAM", ["oneLine"]],
    ["ELECTRICAL SCHEDULES AND DETAILS", ["details"]],
    ["LIGHTING FIXTURE SCHEDULE AND DETAILS", ["fixtureSchedule", "details"]],
    ["LEVEL 2 FLOOR PLAN -POWER & SPECIAL SYSTEMS", ["power", "systems"]],
    ["LEVEL 2 FLOOR PLAN -LIGHTING", ["lighting"]],
    ["LEVEL 2 FLOOR PLANS -DEMOLITION", ["demolition"]],
    // the large set
    ["LEVEL 1 & 2 LIGHTING DEMO PLAN", ["demolition", "lighting"]],
    ["LIGHTING PLAN & LUMINAIRE SCHEDULE", ["lighting", "fixtureSchedule"]],
    [
      "GENERAL NOTES, FIXTURE SCHEDULE, & SHEET INDEX",
      ["notes", "fixtureSchedule"],
    ],
    ["RISER DIAGRAM & SCHEDULES", ["oneLine"]],
    ["OVERALL - POWER & SYSTEMS PLAN - ELECTRICAL", ["power", "systems"]],
    ["1017 & 1029 BREBEUF ROAD SITE PHOTOMETRIC PLAN", ["site", "lighting"]],
    ["1017 & 1029 BREBEUF ROAD SITE DETAILS", ["details"]],
    ["ELECTRICAL LEGEND & SPECIFICATIONS", ["notes"]],
    ["Illumination Plan", ["lighting"]],
    // the plan's own two
    ["POWER AND SIGNAL PLAN", ["power", "systems"]],
    ["LIGHTING DEMOLITION", ["demolition", "lighting"]],
  ])("%s", (title, kinds) => {
    expect(sheetKinds(title)).toEqual(kinds);
  });

  it.each([
    "ELECTRICAL COVER SHEET",
    "CODE ANALYSIS",
    "PLANS",
    "REFLECTED CEILING PLANS",
    "Civil Cover Sheet",
    "Sheet 1",
    "",
  ])("says nothing for %j — no guess", title => {
    expect(sheetKinds(title)).toEqual([]);
  });

  it("says nothing with no title at all (Old Blueridge stores none)", () => {
    expect(sheetKinds(null)).toEqual([]);
    expect(sheetKinds(undefined)).toEqual([]);
  });

  it("a drawing word alone still names the drawing", () => {
    expect(sheetKinds("E-101 LIGHTING")).toEqual(["lighting"]);
  });
});

describe("the cards", () => {
  it("are marked as a draft for the owner's review (Q5)", () => {
    expect(SHEET_KINDS_REVIEW.status).toBe("draft");
  });

  it("cover every kind, once per trade", () => {
    for (const kind of SHEET_KINDS)
      expect(
        SHEET_KIND_CARDS.filter(
          c => c.kind === kind && c.trade === "electrical"
        ),
        kind
      ).toHaveLength(1);
    expect(sheetKindCard("lighting")?.label).toBe("Lighting plan");
  });

  it("carry no number anywhere — no hours, no prices (§ 9 Q6)", () => {
    const withDigits = SHEET_KIND_CARDS.flatMap(c =>
      [c.label, c.hint, ...c.whatToDo, ...c.watchFor].filter(t =>
        /[0-9$%]/.test(t)
      )
    );
    expect(withDigits).toEqual([]);
  });

  it("every card says something to do and something to watch for", () => {
    const thin = SHEET_KIND_CARDS.filter(
      c =>
        !c.label.trim() ||
        !c.hint.trim() ||
        c.whatToDo.length === 0 ||
        c.watchFor.length === 0
    );
    expect(thin.map(c => c.kind)).toEqual([]);
  });
});
