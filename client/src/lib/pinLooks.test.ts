/**
 * Chosen pin looks and mark-status looks (shared/pinLetters.ts,
 * shared/takeoffMarks.ts, shared/markStatus.ts, @/lib/pinCounts) — pin plan
 * § 6, § 7 and § 11.4. Red before 2026-10-05: nothing read a chosen look, and
 * every mark drew as new.
 */
import { describe, expect, it } from "vitest";
import { pinStylesForBid } from "@shared/pinLetters";
import {
  MARK_COLORS,
  markAppearance,
  markPaint,
  statusLook,
} from "@shared/takeoffMarks";
import {
  isPricedMark,
  statusSplit,
  statusSplitText,
  unpricedStatusNote,
} from "@shared/markStatus";
import { groupStamps } from "@shared/takeoffCounts";
import { pinCountsFor } from "./pinCounts";

const [BLUE, PINK, VIOLET, ORANGE] = MARK_COLORS;

describe("a chosen look wins, level by level", () => {
  it("count beats symbol beats assembly beats automatic — for each part separately", () => {
    const styles = pinStylesForBid([
      {
        id: 1,
        label: "Duplex receptacle",
        chosen: {
          count: { shape: "hexagon" },
          symbol: { shape: "square", letter: "DX" },
          assembly: { shape: "diamond", letter: "ZZ", color: ORANGE },
        },
      },
    ]);
    expect(styles.get(1)).toMatchObject({
      shape: "hexagon",
      letter: "DX",
      color: ORANGE,
      source: { shape: "count", letter: "symbol", color: "assembly" },
    });
  });

  it("is exactly the automatic look when nothing is chosen", () => {
    const style = pinStylesForBid([{ id: 1, label: "Duplex receptacle" }]).get(
      1
    );
    expect(style).toMatchObject({
      shape: "circle",
      letter: "R",
      color: BLUE,
      source: { shape: "automatic", letter: "automatic", color: "automatic" },
      clashesWith: [],
    });
  });

  it("reads a value the palette no longer holds as automatic", () => {
    const style = pinStylesForBid([
      {
        id: 1,
        label: "Duplex receptacle",
        chosen: { count: { shape: "star", letter: "!!", color: "#123456" } },
      },
    ]).get(1);
    expect(style).toMatchObject({ shape: "circle", letter: "R", color: BLUE });
  });
});

describe("letters: a count's or symbol's choice is never renumbered", () => {
  it("SHOWS a clash between two chosen letters instead of fixing it", () => {
    const styles = pinStylesForBid([
      { id: 1, label: "Linear 8ft", chosen: { symbol: { letter: "L" } } },
      { id: 2, label: "Linear 4ft", chosen: { symbol: { letter: "L" } } },
    ]);
    expect(styles.get(1)?.letter).toBe("L");
    expect(styles.get(2)?.letter).toBe("L");
    expect(styles.get(1)?.clashesWith).toEqual([2]);
    expect(styles.get(2)?.clashesWith).toEqual([1]);
  });

  it("bumps an ASSEMBLY letter, which is a default for every count of it", () => {
    const shared = { assembly: { letter: "L" } };
    const styles = pinStylesForBid([
      { id: 1, label: "Linear 8ft", chosen: shared },
      { id: 2, label: "Linear 4ft", chosen: shared },
    ]);
    expect([styles.get(1)?.letter, styles.get(2)?.letter]).toEqual(["L", "L2"]);
    expect(styles.get(2)?.clashesWith).toEqual([]);
  });

  it("an automatic letter steps around a chosen one", () => {
    const styles = pinStylesForBid([
      { id: 1, label: "Duplex receptacle" },
      { id: 2, label: "Kitchen", chosen: { count: { letter: "R" } } },
    ]);
    expect(styles.get(2)?.letter).toBe("R");
    expect(styles.get(1)?.letter).toBe("R2");
  });
});

describe("colours: chosen wins, the automatic ones step around it", () => {
  it("does not hand a chosen colour to an automatic count", () => {
    const styles = pinStylesForBid([
      { id: 1, label: "A" },
      { id: 2, label: "B", chosen: { count: { color: BLUE } } },
      { id: 3, label: "C" },
    ]);
    expect(styles.get(2)?.color).toBe(BLUE);
    expect(styles.get(1)?.color).toBe(PINK);
    expect(styles.get(3)?.color).toBe(VIOLET);
  });

  it("gives an assembly's colour to its first count only — the second steps aside", () => {
    const shared = { assembly: { color: ORANGE } };
    const styles = pinStylesForBid([
      { id: 1, label: "Linear 8ft", chosen: shared },
      { id: 2, label: "Linear 4ft", chosen: shared },
    ]);
    expect(styles.get(1)?.color).toBe(ORANGE);
    expect(styles.get(2)?.color).not.toBe(ORANGE);
  });
});

describe("where a count takes its look from (@/lib/pinCounts)", () => {
  it("reads the company's FORK of a shipped assembly, not the shipped row", () => {
    // setLook forks a shipped assembly; the count still points at the shipped
    // id. Reading that id would find a row with no look, and the choice would
    // vanish on reload.
    const [count] = pinCountsFor(
      [{ id: 7, label: "Kitchen", assemblyId: 100 }],
      [
        { id: 100, name: "Duplex", category: "Devices" },
        {
          id: 555,
          name: "Duplex",
          category: "Devices",
          baselineId: 100,
          markShape: "hexagon",
        },
      ],
      []
    );
    expect(count.chosen?.assembly?.shape).toBe("hexagon");
  });

  it("finds a renamed legend symbol by its captured key", () => {
    const [count] = pinCountsFor(
      [{ id: 7, label: "Linear type", assemblyId: null }],
      [],
      [
        {
          label: "Linear 8ft",
          lookupKey: "linear type",
          look: { letter: "LT" },
        },
      ]
    );
    expect(count.chosen?.symbol?.letter).toBe("LT");
  });
});

describe("a mark's status: drawn, counted, and said", () => {
  it("draws new filled, existing hollow, remove crossed, relocate badged", () => {
    expect(statusLook(null)).toMatchObject({
      filled: true,
      cross: false,
      arrow: false,
    });
    expect(statusLook("existing")).toMatchObject({
      filled: false,
      cross: false,
      arrow: false,
    });
    expect(statusLook("remove")).toMatchObject({ filled: false, cross: true });
    expect(statusLook("relocate")).toMatchObject({ filled: true, arrow: true });
    expect(
      markAppearance({ groupId: 1, assemblyId: null, status: "existing" })
        .status.filled
    ).toBe(false);
  });

  it("paints new and existing apart even with a letter on them", () => {
    // The fault (2026-10-05): new was a 0.22 tint and every letter sat on a
    // white halo, which filled the hollow pin back in — on screen the two
    // looked the same, and that difference decides what is priced.
    const color = "#22D3EE";
    const fresh = markPaint(statusLook(null), color);
    const existing = markPaint(statusLook("existing"), color);
    // Body: a fill strong enough to read past the letter, vs none at all.
    expect(fresh.fillOpacity).toBeGreaterThanOrEqual(0.45);
    expect(fresh.fillOpacity).toBeLessThan(1); // § 4: never blot the symbol
    expect(existing.fillOpacity).toBe(0);
    // Letter: on a hollow pin it must not bring a white patch with it.
    expect(existing.letterHalo).not.toBe("#ffffff");
    expect(existing.letterFill).toBe(color);
    expect(fresh.letterFill).not.toBe(existing.letterFill);
    // Outline: hollow is heavier, so it still reads as a ring with no letter.
    expect(existing.strokeScale).toBeGreaterThan(fresh.strokeScale);
    // Remove is hollow too; relocate is filled.
    expect(markPaint(statusLook("remove"), color).fillOpacity).toBe(0);
    expect(markPaint(statusLook("relocate"), color).fillOpacity).toBe(
      fresh.fillOpacity
    );
  });

  it("prices ONLY a new mark — NULL is new", () => {
    expect(isPricedMark({ status: null })).toBe(true);
    expect(isPricedMark({ status: "new" })).toBe(true);
    for (const s of ["existing", "remove", "relocate"])
      expect(isPricedMark({ status: s })).toBe(false);
  });

  it("counts new marks only, keeping every mark in placed and the split", () => {
    const mark = (id: number, status: string | null) => ({
      id,
      sheetId: 1,
      groupId: 9,
      assemblyId: null,
      name: "Duplex",
      x: 0,
      y: 0,
      status,
    });
    const [group] = groupStamps([
      mark(1, null),
      mark(2, "new"),
      mark(3, "existing"),
      mark(4, "remove"),
    ]);
    expect(group.count).toBe(2);
    expect(group.placed).toBe(4);
    expect(group.split).toEqual({
      new: 2,
      existing: 1,
      remove: 1,
      relocate: 0,
      unconfirmed: 0,
    });
  });

  it("draws an UNCONFIRMED mark dashed and hollow — never like existing", () => {
    expect(statusLook("unconfirmed")).toMatchObject({
      filled: false,
      dashed: true,
    });
    expect(statusLook("existing").dashed).toBe(false);
    expect(isPricedMark({ status: "unconfirmed" })).toBe(false);
  });

  it("says the split in words, and says what is left off the bid", () => {
    const split = statusSplit([
      ...Array(12).fill({ status: null }),
      ...Array(4).fill({ status: "existing" }),
      { status: "remove" },
    ]);
    expect(statusSplitText(split)).toBe("12 new · 4 existing · 1 remove");
    expect(unpricedStatusNote(split)).toBe(
      "4 existing — not priced. 1 remove — labor not on the bid"
    );
    // All new: nothing to say.
    expect(statusSplitText(statusSplit([{ status: null }]))).toBeNull();
    expect(unpricedStatusNote(statusSplit([{ status: null }]))).toBeNull();
  });
});
