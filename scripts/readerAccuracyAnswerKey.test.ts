import { describe, expect, it } from "vitest";
import {
  keyForSheet,
  looksDataTelecom,
  scoreSheet,
  setVerdict,
  verdictFor,
  type VerdictEntry,
} from "./readerAccuracyAnswerKey";
import type { HandMark, Suggestion } from "./readerAccuracyScore";

const R = 24;
const mark = (label: string, x: number, y: number): HandMark => ({
  label,
  x,
  y,
});
const guess = (
  label: string | null,
  x: number | null,
  y: number | null
): Suggestion => ({ label, x, y, unreadable: false });

describe("which types a sheet is scored on", () => {
  const marks = [
    mark("DUPLEX RECEPTACLE", 0, 0),
    mark("DUPLEX RECEPTACLE - EXISTING TO REMAIN", 50, 0),
    mark("TELECOM CABINET, FLUSH MOUNT", 100, 0),
  ];

  it("defaults to the types he counted, existing folded into its symbol", () => {
    const key = keyForSheet("Weld 1.pdf p5", marks, null);
    expect(Array.from(key.picked).sort()).toEqual([
      "duplex receptacle",
      "telecom cabinet, flush mount",
    ]);
    expect(Array.from(key.data)).toEqual(["telecom cabinet, flush mount"]);
  });

  it("takes an added type with none on the sheet, so an AI find of it is an extra", () => {
    const key = keyForSheet("Weld 1.pdf p5", marks, {
      sheets: { "Weld 1.pdf p5": { alsoPicked: ["GFCI receptacle"] } },
    });
    expect(key.picked.has("gfci receptacle")).toBe(true);
  });

  it("lets the file override the data rule", () => {
    const key = keyForSheet("S", marks, {
      sheets: { S: { dataTelecom: [] } },
    });
    expect(key.data.size).toBe(0);
  });

  it("puts fire alarm with power, and data words with data, by whole word", () => {
    expect(looksDataTelecom("FIRE ALARM HORN/STROBE")).toBe(false);
    expect(looksDataTelecom("DATA OUTLET")).toBe(true);
    expect(looksDataTelecom("WIRELESS ACCESS POINT")).toBe(true);
    // "tel" inside a word is not telecom.
    expect(looksDataTelecom("HOTEL ROOM SWITCH")).toBe(false);
  });
});

describe("scoring against the smaller key", () => {
  const key = keyForSheet(
    "S",
    [mark("Duplex", 0, 0), mark("Data outlet", 500, 0)],
    null
  );

  it("ignores an AI find of an unpicked type away from his marks", () => {
    const s = scoreSheet(
      [mark("Duplex", 0, 0), mark("Data outlet", 500, 0)],
      [guess("Duplex", 2, 1), guess("Exit sign", 900, 900)],
      R,
      key
    );
    expect(s.main).toMatchObject({ found: 1, extra: 0 });
    expect(s.ignored).toBe(1);
    expect(s.extras).toEqual([]);
  });

  it("still calls an unpicked name on his mark a wrong symbol", () => {
    const s = scoreSheet(
      [mark("Duplex", 0, 0)],
      [guess("Exit sign", 3, 3)],
      R,
      key
    );
    expect(s.main).toMatchObject({ found: 0, wrong: 1, missed: 0, extra: 0 });
    expect(s.ignored).toBe(0);
  });

  it("scores data apart from power, and lists each extra with its group", () => {
    const s = scoreSheet(
      [mark("Duplex", 0, 0), mark("Data outlet", 500, 0)],
      [
        guess("Duplex", 1, 0),
        guess("Duplex", 300, 300),
        guess("Data outlet", 700, 0),
      ],
      R,
      key
    );
    expect(s.main).toMatchObject({ byHand: 1, found: 1, extra: 1 });
    expect(s.data).toMatchObject({ byHand: 1, found: 0, missed: 1, extra: 1 });
    expect(s.extras.map(e => [e.index, e.group])).toEqual([
      [1, "main"],
      [2, "data"],
    ]);
  });

  it("does not score his marks of a type the file left out", () => {
    const narrow = keyForSheet("S", [], {
      sheets: { S: { picked: ["Duplex"] } },
    });
    const s = scoreSheet(
      [mark("Duplex", 0, 0), mark("Junction box", 100, 100)],
      [guess("Duplex", 0, 0)],
      R,
      narrow
    );
    expect(s.marksNotPicked).toBe(1);
    expect(s.main.byHand).toBe(1);
    expect(s.main.missed).toBe(0);
  });
});

describe("his verdicts, matched back to a later run", () => {
  const v = (over: Partial<VerdictEntry>): VerdictEntry => ({
    sheet: "S",
    label: "Duplex",
    x: 100,
    y: 100,
    verdict: "ai-wrong",
    at: "2026-10-01T00:00:00Z",
    ...over,
  });

  it("finds the verdict for the same find a little elsewhere", () => {
    expect(
      verdictFor("S", { label: "duplex", x: 110, y: 104 }, [v({})], R)
    ).toMatchObject({ verdict: "ai-wrong" });
  });

  it("does not carry a verdict to another sheet, type or place", () => {
    for (const other of [
      v({ sheet: "T" }),
      v({ label: "GFCI" }),
      v({ x: 200 }),
    ])
      expect(
        verdictFor("S", { label: "Duplex", x: 100, y: 100 }, [other], R)
      ).toBeNull();
  });

  it("replaces his earlier verdict on a spot, and takes one back with null", () => {
    const spot = { sheet: "S", label: "Duplex", x: 100, y: 100 };
    let file = setVerdict({}, spot, "ai-wrong", R, "t1");
    file = setVerdict(file, { ...spot, x: 104 }, "my-miss", R, "t2");
    expect(file.verdicts).toEqual([
      { ...spot, x: 104, verdict: "my-miss", at: "t2" },
    ]);
    // Another spot of the same type is left alone.
    file = setVerdict(file, { ...spot, x: 400 }, "ai-wrong", R, "t3");
    file = setVerdict(file, spot, null, R, "t4");
    expect(file.verdicts?.map(v => v.x)).toEqual([400]);
  });

  it("takes the latest when he changed his mind at the same spot", () => {
    const got = verdictFor(
      "S",
      { label: "Duplex", x: 100, y: 100 },
      [v({ verdict: "ai-wrong" }), v({ verdict: "my-miss" })],
      R
    );
    expect(got?.verdict).toBe("my-miss");
  });
});
