import { describe, expect, it } from "vitest";
import { draftFromSet, emptyWageSet, payloadFromDraft } from "./wageSetDraft";

describe("wage set draft", () => {
  it("a new set starts with the three usual rows and NO wages", () => {
    const d = emptyWageSet("2026-10-16");
    expect(d.rates.map(r => r.classification)).toEqual([
      "journeyman",
      "apprentice",
      "trainee",
    ]);
    expect(d.rates.every(r => r.baseWage === "" && r.fringe === "")).toBe(true);
    expect(d.fringePaidAsCash).toBe(false);
  });

  it("a blank wage is refused by name, never saved as $0", () => {
    const d = { ...emptyWageSet("2026-10-16"), name: "County 2026" };
    expect(payloadFromDraft(d)).toEqual({
      ok: false,
      message: "Journeyman: type the base wage per hour.",
    });
  });

  it("reads what a person types and round-trips a stored set", () => {
    const d = {
      ...emptyWageSet("2026-10-16"),
      name: " County 2026 ",
      wageDeterminationNumber: "",
      rates: [
        {
          classification: "journeyman" as const,
          label: "Inside wireman",
          laborRateId: 4,
          baseWage: "$52.10",
          fringe: "18",
        },
      ],
    };
    const p = payloadFromDraft(d);
    expect(p).toEqual({
      ok: true,
      set: {
        name: "County 2026",
        wageDeterminationNumber: null,
        dateSet: "2026-10-16",
        fringePaidAsCash: false,
        rates: [
          {
            classification: "journeyman",
            label: "Inside wireman",
            laborRateId: 4,
            baseWage: 52.1,
            fringe: 18,
          },
        ],
      },
    });
    if (!p.ok) return;
    const back = draftFromSet({
      ...p.set,
      rates: p.set.rates.map(r => ({
        ...r,
        baseWage: r.baseWage.toFixed(4),
        fringe: r.fringe.toFixed(4),
      })),
    });
    expect(back.rates[0]).toMatchObject({ baseWage: "52.1", fringe: "18" });
  });
});
