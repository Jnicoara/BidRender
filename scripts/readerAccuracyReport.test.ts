import { describe, expect, it } from "vitest";
import {
  buildReport,
  formatReport,
  type Reading,
} from "./readerAccuracyReport";

const R = 24;
const reading = (over: Partial<Reading>): Reading => ({
  sheet: "Weld 1.pdf p5",
  sheetLabel: "Weld 1.pdf p5 E-200",
  pdfId: 7,
  page: 5,
  line: "(a) Today",
  run: 1,
  marks: [
    { label: "Duplex", x: 0, y: 0 },
    { label: "Data outlet", x: 500, y: 0 },
  ],
  suggestions: [],
  ...over,
});

describe("the report against the smaller key", () => {
  it("lists one spot once, however many readings found it", () => {
    const extra = { label: "Duplex", x: 300, y: 300, unreadable: false };
    const r = buildReport(
      [
        reading({ suggestions: [extra] }),
        reading({ run: 2, suggestions: [{ ...extra, x: 305 }] }),
        reading({ line: "(c) Zoomed in", suggestions: [extra] }),
      ],
      null,
      R
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].seenIn).toEqual([
      "(a) Today run 1",
      "(a) Today run 2",
      "(c) Zoomed in run 1",
    ]);
  });

  it("counts his verdicts against each reading's extras", () => {
    const r = buildReport(
      [
        reading({
          suggestions: [
            { label: "Duplex", x: 300, y: 300, unreadable: false },
            { label: "Duplex", x: 900, y: 900, unreadable: false },
          ],
        }),
      ],
      {
        verdicts: [
          {
            sheet: "Weld 1.pdf p5",
            label: "DUPLEX",
            x: 302,
            y: 299,
            verdict: "ai-wrong",
            at: "2026-10-01T00:00:00Z",
          },
        ],
      },
      R
    );
    expect(r.main[0].perRun[0]).toMatchObject({
      byHand: 1,
      missed: 1,
      extra: 2,
      aiWrong: 1,
      myMiss: 0,
    });
    expect(r.items.map(i => i.verdict?.verdict ?? null)).toEqual([
      "ai-wrong",
      null,
    ]);
  });

  it("scores the AI's legend-symbol name as the hand count's item through 'same as'", () => {
    // The AI names a find by the captured symbol ("DUPLEX RECEPTACLE, GFCI");
    // the hand count is "GFCI receptacle". Without the list: wrong symbol.
    const readings = [
      reading({
        marks: [
          { label: "GFCI receptacle", x: 0, y: 0 },
          { label: "GFCI receptacle - EXISTING TO REMAIN", x: 300, y: 0 },
        ],
        suggestions: [
          { label: "DUPLEX RECEPTACLE, GFCI", x: 2, y: 1, unreadable: false },
          { label: "GFCI", x: 301, y: 0, unreadable: false },
        ],
      }),
    ];
    const without = buildReport(readings, null, R);
    expect(without.main[0].perRun[0]).toMatchObject({ found: 0, wrong: 2 });
    const withList = buildReport(
      readings,
      { sameAs: [["GFCI receptacle", "DUPLEX RECEPTACLE, GFCI", "GFCI"]] },
      R
    );
    expect(withList.main[0].perRun[0]).toMatchObject({
      byHand: 2,
      found: 2,
      wrong: 0,
      extra: 0,
    });
  });

  it("refuses a name in two 'same as' lists rather than pick one by order", () => {
    expect(() =>
      buildReport(
        [reading({})],
        {
          sameAs: [
            ["A", "B"],
            ["C", "b"],
          ],
        },
        R
      )
    ).toThrow(/two "same as" lists/);
  });

  it("keeps data in its own table and prints both", () => {
    const r = buildReport(
      [
        reading({
          suggestions: [
            { label: "Duplex", x: 1, y: 1, unreadable: false },
            { label: "Data outlet", x: 501, y: 0, unreadable: false },
          ],
        }),
      ],
      null,
      R
    );
    expect(r.main[0].perRun[0]).toMatchObject({ byHand: 1, found: 1 });
    expect(r.data[0].perRun[0]).toMatchObject({ byHand: 1, found: 1 });
    const text = formatReport(r).join("\n");
    expect(text).toMatch(/power, lighting/);
    expect(text).toMatch(/data \/ telecom/);
  });
});
