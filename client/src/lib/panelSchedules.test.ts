import { describe, expect, it } from "vitest";
import { readSchedules, type ScheduleWord } from "./panelSchedules";

/*
  A page in UNCC E003's layout, built from its measured coordinates (the
  real sheet is not in the repo): two panel tables sharing ONE header row,
  896 pt apart, each with its summary block and its "PANEL 2x" title under
  it — and a "FED FROM PANEL 2HA" line that names a DIFFERENT panel.
*/
const w = (text: string, cx: number, cy: number, height = 6): ScheduleWord => ({
  text,
  cx,
  cy,
  height,
});

function panelTable(
  dx: number,
  rows: number,
  title: ScheduleWord[],
  spareRow = -1
): ScheduleWord[] {
  const out: ScheduleWord[] = [
    // header
    ...(
      [
        ["LOAD", 174],
        ["(KVA)", 195],
        ["COND", 414],
        ["GRND", 446],
        ["WIRE", 477],
        ["BRKR", 515],
        ["CKT.", 548],
        ["CKT.", 594],
        ["BRKR", 627],
        ["WIRE", 665],
        ["GRND", 696],
        ["COND", 728],
        ["LOAD", 944],
        ["(KVA)", 965],
      ] as const
    ).map(([t, x]) => w(t, x + dx, 109)),
    ...(
      [
        ["A", 154],
        ["B", 186],
        ["C", 218],
        ["NO.", 548],
        ["NO.", 594],
        ["A", 924],
        ["B", 956],
        ["C", 987],
      ] as const
    ).map(([t, x]) => w(t, x + dx, 122)),
  ];
  for (let k = 0; k < rows; k++) {
    const y = 134 + 13 * k;
    const spare = k === spareRow;
    out.push(
      // odd side: load in phase C, right beside where the description starts
      w("0.7", 227 + dx, y),
      w("REC", 265 + dx, y),
      w("-", 280 + dx, y),
      w("COR.", 300 + dx, y),
      w("213,", 320 + dx, y),
      w("12", 477 + dx, y),
      w("20/1", 515 + dx, y),
      w(String(2 * k + 1), 548 + dx, y),
      w(String(2 * k + 2), 594 + dx, y),
      w(spare ? "." : "20/1", 627 + dx, y),
      w(spare ? "." : "12", 665 + dx, y),
      // Even side: the first word sits 156 pt past CKT., as UNCC 2B's
      // "REC - CORR, 213" does — seen on screen cut to "- CORR, 213".
      ...(spare ? [] : [w("REC", 750 + dx, y)]),
      w(spare ? "SPARE" : "LIGHTING", 775 + dx, y),
      w(spare ? "0.0" : "0.4", 932 + dx, y)
    );
  }
  const y0 = 134 + 13 * rows + 20;
  out.push(
    ...["SUPPLY:", "208/120V,", "3-PH,", "4W"].map((t, i) =>
      w(t, [156, 194, 228, 248][i] + dx, y0)
    ),
    w("B=", 486 + dx, y0),
    ...["MAINS:", "225", "AMP", "MAIN", "LUGS", "ONLY"].map((t, i) =>
      w(t, [155, 180, 199, 220, 245, 270][i] + dx, y0 + 13)
    ),
    w("C=", 485 + dx, y0 + 13),
    ...["FED", "FROM", "PANEL", "2HA", "via", "250", "A", "FEEDER"].map(
      (t, i) => w(t, [157, 178, 203, 226, 245, 262, 275, 300][i] + dx, y0 + 26)
    ),
    ...[
      ["TOTAL", 574],
      ["CONNECTED", 612],
      ["LOAD", 648],
      ["62.6", 703],
      ["KVA", 724],
      ["TOTAL", 841],
      ["NEC", 866],
      ["DEMAND", 893],
      ["LOAD:", 925],
      ["40.7", 963],
      ["KVA", 983],
    ].map(([t, x]) => w(t as string, (x as number) + dx, y0 + 39)),
    ...title.map(t => ({ ...t, cx: t.cx + dx, cy: y0 + 57 }))
  );
  return out;
}

const PAGE = [
  ...panelTable(
    0,
    21,
    [w("EXISTING", 179, 0, 9), w("PANEL", 250, 0, 9), w("2B", 293, 0, 9)],
    20
  ),
  ...panelTable(896, 21, [w("PANEL", 250, 0, 9), w("LP-1", 293, 0, 9)]),
];

describe("readSchedules — panels", () => {
  const { panels } = readSchedules(PAGE);

  it("reads both tables on one header row, 42 of 42 circuits each", () => {
    expect(panels).toHaveLength(2);
    for (const p of panels)
      expect(p.circuits.map(c => c.number)).toEqual(
        Array.from({ length: 42 }, (_, k) => k + 1)
      );
  });

  it("names each panel from its title, not from FED FROM", () => {
    expect(panels.map(p => p.name)).toEqual(["2B", "LP-1"]);
    expect(panels.map(p => p.existing)).toEqual([true, false]);
  });

  it("reads breaker, wire, description and load on both sides", () => {
    const [one, two] = panels[0].circuits;
    expect(one).toEqual({
      number: 1,
      breaker: "20/1",
      amps: 20,
      poles: 1,
      wire: "12",
      // The 0.7 load sits in phase column C, right beside the text: a load,
      // never part of the description.
      description: "REC - COR. 213,",
      loadKva: 0.7,
    });
    expect(two).toMatchObject({
      number: 2,
      amps: 20,
      description: "REC LIGHTING",
      loadKva: 0.4,
    });
  });

  it("an empty cell reads as nothing, not as a dot", () => {
    const spare = panels[0].circuits.find(c => c.number === 42)!;
    expect(spare).toMatchObject({
      breaker: null,
      amps: null,
      wire: null,
      description: "SPARE",
      loadKva: 0,
    });
  });

  it("reads the summary block", () => {
    expect(panels[0]).toMatchObject({
      supply: "208/120V, 3-PH, 4W",
      mains: "225 AMP MAIN LUGS ONLY",
      mainsAmps: 225,
      fedFrom: "PANEL 2HA via 250 A FEEDER",
      connectedKva: 62.6,
      demandKva: 40.7,
    });
  });

  it("says so when the name is not in the text", () => {
    const { panels } = readSchedules(panelTable(0, 3, []));
    expect(panels).toHaveLength(1);
    expect(panels[0].name).toBeNull();
  });
});

describe("readSchedules — fixtures", () => {
  // UNCC E004's layout: the mark starts a fixture; its text wraps below.
  const rows: ScheduleWord[] = [
    w("LIGHTING", 2280, 392),
    w("FIXTURE", 2375, 392),
    w("SCHEDULE", 2471, 392),
    ...(
      [
        ["TYPE", 2007],
        ["DESCRIPTION", 2196],
        ["QTY", 2376],
        ["TYPE", 2446],
        ["WATTS", 2523],
        ["QTY", 2563],
        ["TYPE", 2626],
        ["WATTS", 2695],
        ["WATTS", 2744],
      ] as const
    ).map(([t, x]) => w(t, x, 430)),
    w("A1", 2007, 456),
    w("LED", 2042, 456),
    w("TROFFER.", 2263, 456),
    w("AR", 2376, 456),
    w("ELECTRONIC", 2626, 456),
    w("26.3", 2695, 456),
    w("26.3", 2743, 456),
    w("B.O.D", 2088, 466),
    w("LITHONIA", 2137, 466),
    w("DIMMING", 2606, 466),
    w("C1", 2007, 560),
    w("DOWNLIGHT", 2135, 560),
    w("24.7", 2743, 560),
    w("UC", 2008, 573),
    w("STRIP", 2140, 573),
    w("2W/FT", 2744, 573),
    // Far below: another part of the sheet, not the table.
    w("Z9", 2007, 1200),
    w("SEAL", 2140, 1200),
  ];
  const { fixtures } = readSchedules(rows);

  it("reads every type, its wrapped description and its watts", () => {
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].title).toBe("LIGHTING FIXTURE SCHEDULE");
    expect(fixtures[0].fixtures).toEqual([
      {
        mark: "A1",
        description: "LED TROFFER. B.O.D LITHONIA",
        watts: "26.3",
      },
    ]);
  });
});

describe("readSchedules — fixtures, contiguous rows", () => {
  it("keeps reading while rows run on, and stops at a gap", () => {
    const rows: ScheduleWord[] = [
      w("TYPE", 100, 50),
      w("DESCRIPTION", 200, 50),
      w("QTY", 300, 50),
      w("WATTS", 400, 50),
      w("A1", 100, 70),
      w("TROFFER", 200, 70),
      w("30", 400, 70),
      w("C1", 100, 82),
      w("DOWNLIGHT", 200, 82),
      w("15", 400, 82),
      w("X1", 100, 300),
      w("NOTE", 200, 300),
    ];
    expect(
      readSchedules(rows).fixtures[0].fixtures.map(f => [f.mark, f.watts])
    ).toEqual([
      ["A1", "30"],
      ["C1", "15"],
    ]);
  });
});

describe("readSchedules — nothing to read", () => {
  it("a sheet with no schedule reads none", () => {
    expect(
      readSchedules([w("GENERAL", 100, 100), w("NOTES", 160, 100)])
    ).toEqual({ panels: [], fixtures: [] });
  });
});
