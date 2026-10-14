import { describe, expect, it } from "vitest";
import { partChangedByLine, partChangedStripText } from "./partChanged";

/*
  F12 (baseline-screen-plan.md § 9): a run line whose type now names a
  different part says so on the bid. The SWAP decision is the server's
  (`resendPlans`, the plan Send again applies); this only matches it to lines.
*/
const bridge = [
  {
    runTypeId: 7,
    rows: [
      { role: "raceway", extraKey: 0, resend: null },
      {
        role: "extra",
        extraKey: 2,
        resend: { kind: "swap", text: "tape A → tape B, 120" },
      },
    ],
    fittings: [
      {
        role: "coupling",
        resend: {
          kind: "swap",
          text: "set-screw coupling → compression coupling, 9",
        },
      },
      // A refill is not a changed part.
      { role: "strap", resend: { kind: "refill" } },
    ],
  },
];

const line = (
  id: number,
  runMaterialRole: string | null,
  extra = 0,
  over: Partial<{
    takeoffRunTypeId: number | null;
    archivedAt: Date | null;
  }> = {}
) => ({
  id,
  takeoffRunTypeId: 7,
  runMaterialRole,
  runExtraKey: extra,
  archivedAt: null,
  ...over,
});

describe("part changed — Send again (F12)", () => {
  it("names the swap on the line it belongs to, by role and extra", () => {
    const out = partChangedByLine(bridge, [
      line(1, "raceway"),
      line(2, "coupling"),
      line(3, "strap"),
      line(4, "extra", 2),
    ]);
    expect(Array.from(out.entries())).toEqual([
      [2, "set-screw coupling → compression coupling, 9"],
      [4, "tape A → tape B, 120"],
    ]);
  });

  it("ignores an archived line, a line of another type, and a non-run line", () => {
    const out = partChangedByLine(bridge, [
      line(1, "coupling", 0, { archivedAt: new Date() }),
      line(2, "coupling", 0, { takeoffRunTypeId: 8 }),
      line(3, null, 0, { takeoffRunTypeId: null }),
    ]);
    expect(out.size).toBe(0);
  });

  it("says how many in the strip", () => {
    expect(partChangedStripText(1)).toMatch(/^1 run line's part has changed/);
    expect(partChangedStripText(3)).toMatch(/^3 run lines' parts have changed/);
  });
});
