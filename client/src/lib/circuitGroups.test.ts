/**
 * Circuits grouped from device tags (@/lib/circuitGroups). Each case is a
 * shape measured on UNCC E111 against the owner's 243 hand marks, drawn by
 * hand here because the sheet itself is a git-ignored test set.
 */
import { describe, expect, it } from "vitest";
import {
  groupByCircuit,
  panelLabels,
  readPanelSpots,
  rememberPanelSpot,
  type CircuitDevice,
} from "./circuitGroups";
import type { HomerunWord } from "./homeruns";
import type { PanelSchedule } from "./panelSchedules";

function word(text: string, x0: number, cy: number): HomerunWord {
  const w = text.length * 5;
  return { text, x0, x1: x0 + w, cx: x0 + w / 2, cy, height: 9.6 };
}
/** "2B - 14" as UNCC prints it: three words. */
function tag(panel: string, n: string, x0: number, cy: number) {
  return [word(panel, x0, cy), word("-", x0 + 11, cy), word(n, x0 + 17, cy)];
}
let nextId = 1;
const dev = (name: string, x: number, y: number): CircuitDevice => ({
  id: nextId++,
  name,
  x,
  y,
});
const DUPLEX = "DUPLEX RECEPTACLE";
const DATA = "DATA OUTLET";

const panel2B: PanelSchedule = {
  name: "2B",
  existing: true,
  supply: null,
  mains: null,
  mainsAmps: null,
  fedFrom: null,
  connectedKva: null,
  demandKva: null,
  circuits: [1, 2, 14].map(number => ({
    number,
    breaker: "20/1",
    amps: 20,
    poles: 1,
    wire: "12",
    description: `REC ${number}`,
    loadKva: null,
  })),
  at: { x: 0, y: 0 },
};

/** Many lone duplexes, each with its own tag: what makes DUPLEX "circuited". */
function loneDuplexes(n: number, circuit: string) {
  const words: HomerunWord[] = [];
  const devices: CircuitDevice[] = [];
  for (let i = 0; i < n; i++) {
    words.push(...tag("2B", circuit, 1000 + i * 100, 2000));
    // 8 pt past the tag's right edge: well inside TIE_REACH.
    devices.push(dev(DUPLEX, 1030 + i * 100, 2000));
  }
  return { words, devices };
}

describe("grouping marks by the tag beside them", () => {
  it("groups each device under its tag, one tag one device", () => {
    const a = dev(DUPLEX, 40, 10);
    const b = dev(DUPLEX, 240, 10);
    const r = groupByCircuit({
      words: [...tag("2B", "1", 0, 10), ...tag("2B", "1", 200, 10)],
      devices: [a, b],
      panels: [panel2B],
      placed: {},
    });
    expect(r.circuits.map(c => [c.key, c.devices.map(d => d.id)])).toEqual([
      ["2B-1", [a.id, b.id]],
    ]);
  });

  it("gives the tag to the duplex, not the data outlet drawn beside it", () => {
    // UNCC: a duplex and a data outlet 9 pt apart at one spot, the data
    // outlet a hair nearer the tag. Pure nearest gave 2B-2 three data
    // outlets; data outlets are never tagged on their own.
    const lone = loneDuplexes(4, "1");
    // Data outlet 14 pt from the tag, duplex 18.3 pt: one spot (within 8).
    const spotDuplex = dev(DUPLEX, 40, 18);
    const spotData = dev(DATA, 36, 10);
    const farData = [
      dev(DATA, 500, 500),
      dev(DATA, 600, 600),
      dev(DATA, 700, 700),
    ];
    const r = groupByCircuit({
      words: [...lone.words, ...tag("2B", "2", 0, 10)],
      devices: [...lone.devices, spotDuplex, spotData, ...farData],
      panels: [panel2B],
      placed: {},
    });
    const c2 = r.circuits.find(c => c.key === "2B-2")!;
    expect(c2.devices.map(d => d.name)).toEqual([DUPLEX]);
  });

  it("flags untagged marks only of an item that is circuited here", () => {
    const lone = loneDuplexes(3, "1");
    const untaggedDuplex = dev(DUPLEX, 3000, 3000);
    const data = [dev(DATA, 10, 500), dev(DATA, 10, 600)];
    const r = groupByCircuit({
      words: lone.words,
      devices: [...lone.devices, untaggedDuplex, ...data],
      panels: [panel2B],
      placed: {},
    });
    expect(r.untagged.map(d => d.id)).toEqual([untaggedDuplex.id]);
    expect(r.notCircuited).toEqual([{ name: DATA, count: 2 }]);
  });

  it("lists a tag with no mark in reach rather than stretching to one", () => {
    const r = groupByCircuit({
      words: tag("2B", "14", 0, 10),
      devices: [dev(DUPLEX, 80, 10)], // 46 pt away: past TIE_REACH
      panels: [panel2B],
      placed: {},
    });
    expect(r.circuits).toEqual([]);
    expect(r.unmatchedTags.map(t => t.text)).toEqual(["2B - 14"]);
  });
});

describe("the schedule", () => {
  it("flags a tag whose circuit is not on a schedule that WAS read", () => {
    const r = groupByCircuit({
      words: tag("2B", "41", 0, 10),
      devices: [dev(DUPLEX, 40, 10)],
      panels: [panel2B],
      placed: {},
    });
    expect(r.circuits[0].offSchedule).toBe(true);
  });

  it("does not flag a panel nobody's schedule was read for", () => {
    const r = groupByCircuit({
      words: tag("3LP", "41", 0, 10),
      devices: [dev(DUPLEX, 45, 10)],
      panels: [panel2B],
      placed: {},
    });
    expect(r.circuits[0].offSchedule).toBe(false);
    expect(r.circuits[0].schedule.kind).toBe("noSchedule");
    expect(r.panels).toEqual([{ name: "3LP", spot: null, read: false }]);
  });
});

describe("the device closest to the panel", () => {
  it("is measured at right angles, the way a homerun runs", () => {
    // Straight-line, `diag` is nearer (≈141 vs 150); right-angle, `row` is
    // (150 vs 200). The fixture's two legs differ on purpose.
    const diag = dev(DUPLEX, 140, 140);
    const row = dev(DUPLEX, 190, 40);
    const r = groupByCircuit({
      words: [...tag("2B", "1", 100, 140), ...tag("2B", "1", 150, 40)],
      devices: [diag, row],
      panels: [panel2B],
      placed: { "2B": { x: 40, y: 40 } },
    });
    expect(r.circuits[0].closest?.device.id).toBe(row.id);
    expect(r.circuits[0].closest?.distance).toBe(150);
  });

  it("is not named without a panel spot — never a guessed one", () => {
    const r = groupByCircuit({
      words: tag("2B", "1", 0, 10),
      devices: [dev(DUPLEX, 40, 10)],
      panels: [panel2B],
      placed: {},
    });
    expect(r.circuits[0].closest).toBeNull();
  });

  it("takes the spot from a 'PANEL 2B' label on the sheet", () => {
    const r = groupByCircuit({
      words: [
        ...tag("2B", "1", 0, 10),
        word("PANEL", 300, 300),
        word("2B", 330, 300),
      ],
      devices: [dev(DUPLEX, 40, 10)],
      panels: [panel2B],
      placed: {},
    });
    expect(r.panels[0].spot?.source).toBe("label");
  });

  it("does not read FED FROM PANEL 2HA as panel 2HA's spot", () => {
    expect(
      panelLabels([
        word("FED", 0, 10),
        word("FROM", 20, 10),
        word("PANEL", 45, 10),
        word("2HA", 75, 10),
      ])
    ).toEqual([]);
  });
});

describe("a placed panel, kept in this browser", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it("is remembered per plan page, and removable", () => {
    const s = memory();
    rememberPanelSpot(s, 7, 5, "2B", { x: 1, y: 2 });
    expect(readPanelSpots(s, 7, 5)).toEqual({ "2B": { x: 1, y: 2 } });
    expect(readPanelSpots(s, 7, 6)).toEqual({});
    rememberPanelSpot(s, 7, 5, "2B", null);
    expect(readPanelSpots(s, 7, 5)).toEqual({});
  });

  it("reads as not placed when storage is broken or throws", () => {
    expect(readPanelSpots({ getItem: () => "{not json" }, 1, 1)).toEqual({});
    expect(
      readPanelSpots(
        {
          getItem: () => {
            throw new Error("blocked");
          },
        },
        1,
        1
      )
    ).toEqual({});
  });
});
