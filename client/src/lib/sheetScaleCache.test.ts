/**
 * "Right after a check, the scale still says not checked" — 2026-09-25.
 *
 * Two faults, both reproduced in the running app before the fix:
 *
 *  1. The chip changed only when a REFETCH landed, a round trip after the
 *     save. Holding that refetch showed a confirmed check reading "not
 *     checked" (and a re-set scale still reading checked) for as long as the
 *     GET took.
 *  2. The measuring layer read its mode once, on mount. "Check it" clicked
 *     while "Measure it" was open left it measuring, so the estimator's check
 *     re-set the scale instead — clearing the check it was meant to record.
 *
 * The pure half is tested directly. TakeoffPage is a component and out of
 * this suite's reach (vitest.config.ts), so its wiring is held by reading the
 * source — tripwires for the fault coming back by the route it came.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { withSavedSheet, withSheetChecked } from "./sheetScaleCache";

type Row = { id: number; name: string; scaleCheckedAt: Date | string | null };
const sheets: Row[] = [
  { id: 1, name: "E0.01", scaleCheckedAt: null },
  { id: 2, name: "E1.01", scaleCheckedAt: null },
];
const AT = new Date("2026-09-25T05:00:00Z");

describe("the chip's data changes with the save, not a round trip later", () => {
  it("marks exactly the confirmed sheet checked, at once", () => {
    const next = withSheetChecked(sheets, 2, AT)!;
    expect(next[1].scaleCheckedAt).toBe(AT);
    expect(next[0].scaleCheckedAt).toBeNull();
    // A new array and a new row, so React Query and React both see a change.
    expect(next).not.toBe(sheets);
    expect(next[1]).not.toBe(sheets[1]);
    expect(next[0]).toBe(sheets[0]);
  });

  it("takes the server's saved row as the truth", () => {
    const saved: Row = {
      id: 1,
      name: "E0.01",
      scaleCheckedAt: "2026-09-25T05:00:03Z",
    };
    const next = withSavedSheet(sheets, saved)!;
    expect(next[0]).toBe(saved);
    expect(next[1]).toBe(sheets[1]);
  });

  it("puts a re-set scale back to NOT checked straight away", () => {
    // The mirror of the reported fault: a re-set clears the check on the
    // server, and the chip must not keep showing the old one.
    const checked = withSheetChecked(sheets, 1, AT)!;
    const reset: Row = { ...checked[0], scaleCheckedAt: null };
    expect(withSavedSheet(checked, reset)![0].scaleCheckedAt).toBeNull();
  });

  it("leaves an unloaded list alone rather than inventing one", () => {
    expect(withSheetChecked(undefined, 1, AT)).toBeUndefined();
    expect(withSavedSheet<Row>(undefined, sheets[0])).toBeUndefined();
  });
});

describe("TakeoffPage wires it in", () => {
  const src = readFileSync(
    new URL("../pages/TakeoffPage.tsx", import.meta.url),
    "utf8"
  );
  const block = (name: string) => {
    // To the mutation's own closing line (two-space indent), not the first
    // "});" inside it — `sheets.cancel({ … });` has one.
    const start = src.indexOf(`const ${name} = trpc.`);
    expect(start, name).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf("\n  });\n", start));
  };

  it("marks the sheet checked optimistically when a confirm starts", () => {
    const confirm = block("confirmSheetScale");
    expect(confirm).toContain("onMutate");
    expect(confirm).toContain("withSheetChecked(");
    // ...and puts it back if the save fails.
    expect(confirm).toMatch(/onError[\s\S]*context\.snapshot/);
  });

  it("writes every scale save's returned row into the list", () => {
    for (const name of [
      "setSheetScale",
      "confirmSheetScale",
      "clearSheetScale",
    ])
      expect(block(name), name).toContain("writeSavedSheet(sheet)");
  });

  it("cancels an in-flight sheets fetch before writing", () => {
    // Without this, a GET that read the row before the save lands after the
    // write and restores the stale value.
    const helper = src.slice(src.indexOf("const writeSavedSheet"));
    expect(helper.indexOf("sheets.cancel(")).toBeGreaterThan(-1);
    expect(helper.indexOf("sheets.cancel(")).toBeLessThan(
      helper.indexOf("sheets.setData(")
    );
    const confirm = block("confirmSheetScale");
    expect(confirm.indexOf("sheets.cancel(")).toBeLessThan(
      confirm.indexOf("sheets.setData(")
    );
  });

  it("refreshes the traced lengths whenever the sheets refresh", () => {
    // A scale change re-prices every run on the sheet; the footage panel kept
    // the old scale's lengths until a reload (115.74 ft shown, 111.12 true).
    const helper = src.slice(
      src.indexOf("const refreshSheets = () => {"),
      src.indexOf("\n  };\n", src.indexOf("const refreshSheets = () => {"))
    );
    expect(helper).toContain("refreshRuns()");
  });

  it("starts a fresh measuring layer for every Measure it / Check it", () => {
    expect(src).toMatch(/<CalibrateLayer[\s\S]{0,120}key=\{calibrateSession\}/);
    expect(src).toContain("setCalibrateSession(n => n + 1)");
    // One door in, so no path can open the layer without a new session.
    expect(src.match(/setCalibrating\(true\)/g)).toHaveLength(1);
    expect(src).toContain('onMeasure={() => startCalibrating("set")}');
    expect(src).toContain('onCheck={() => startCalibrating("check")}');
  });
});
