/**
 * THE PLANS SCREEN KEEPS THE PROMISES @/lib/undoStack MAKES (Gap 4a / 4c,
 * 2026-10-08).
 *
 * `NOT_UNDOABLE` names the changes undo does not cover, and `RunEditCall`
 * the run edits that ARE undo steps. Both are only true if TakeoffPage
 * records them — and vitest cannot reach a React component, so this reads
 * its source. A kind nobody notes would leave undo quietly taking back the
 * step before that change, which is the fault Gap 4a fixed; a run edit
 * nobody pushes is a step the arrow never offers.
 *
 * The third check is the one that guards the FUTURE: every mutation on the
 * screen that edits a run, a mark, a count or a sheet either makes an undo
 * step or says it cannot be undone — or is listed below with the reason it
 * is neither. A new run edit added without deciding fails here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NOT_UNDOABLE, type RunEditCall } from "./undoStack";

const src = readFileSync(
  new URL("../pages/TakeoffPage.tsx", import.meta.url),
  "utf8"
);

/** A record, so a proc added to RunEditCall and not here will not compile. */
const RUN_EDIT_PROCS: Record<RunEditCall["proc"], true> = {
  setRunType: true,
  respecify: true,
  setTypedLength: true,
  addCircuit: true,
  updateCircuit: true,
  removeCircuit: true,
  addLeg: true,
};

/**
 * Each `const x = trpc.<router>.<proc>.useMutation({ … });` on the screen,
 * with its options block. Hooks with NO options are the undo's own calls.
 */
function mutationsWithOptions() {
  const found: { name: string; proc: string; body: string }[] = [];
  const head =
    /const (\w+) = trpc\.(takeoffRuns|takeoffStamps|takeoffGroups|takeoffSheet|bidPdfs)\.(\w+)\.useMutation\(\{/g;
  for (const m of Array.from(src.matchAll(head))) {
    // The block runs to the first line that closes the call.
    const start = m.index! + m[0].length;
    const end = src.indexOf("\n  });", start);
    found.push({
      name: m[1],
      proc: `${m[2]}.${m[3]}`,
      body: src.slice(start, end),
    });
  }
  return found;
}

/**
 * Mutations decided somewhere this scan cannot see, or that are neither an
 * undo step nor a change to note — and why. A reason is required: an entry
 * here is a decision, not an escape hatch.
 */
const NEITHER: Record<string, string> = {
  "takeoffStamps.drop":
    "the batch flush pushes 'N marks placed' after mutateAsync",
  "takeoffRuns.save":
    "a draft save while tracing; commitRun pushes 'run finished'",
  "takeoffStamps.renameSymbol": "noted in afterSymbolRename, its onSuccess",
  "takeoffStamps.resetSymbolName": "noted in afterSymbolRename, its onSuccess",
  "bidPdfs.setPageCount": "upload bookkeeping, not a person's change",
  "bidPdfs.ensureSheets": "creates the sheet rows a plan already has",
  "bidPdfs.detectSheetScale": "a reading, written only when confirmed",
  "bidPdfs.confirmSheetScale":
    "confirms a reading; setSheetScale is the change",
  "takeoffGroups.forAssembly": "finds or makes the count a tool arms",
  "takeoffGroups.create": "an empty count; its marks are the step",
  "takeoffStamps.checkLookAlikes": "a question, writes nothing",
};

describe("the Plans screen records what undo covers and what it does not", () => {
  it("notes every change undo does not cover", () => {
    for (const key of Object.keys(NOT_UNDOABLE)) {
      expect(src, key).toContain(`notUndoable("${key}")`);
    }
  });

  it("pushes a step for every run edit undo covers", () => {
    for (const proc of Object.keys(RUN_EDIT_PROCS)) {
      expect(src, proc).toMatch(
        new RegExp(`pushRunEdit\\([^;]*proc: "${proc}", input \\}`)
      );
      // And the undo's own sender knows how to send it again (redo).
      expect(src, proc).toContain(`case "${proc}":`);
    }
  });

  it("leaves no run, mark, count or sheet mutation undecided", () => {
    const undecided = mutationsWithOptions()
      .filter(
        m =>
          !/pushUndo\(|pushRunEdit\(|notUndoable\(|deletedToast\(/.test(m.body)
      )
      .map(m => m.proc)
      .filter(proc => !(proc in NEITHER));
    expect(undecided).toEqual([]);
  });

  it("lists only mutations the screen really has, and none it already decides", () => {
    const seen = mutationsWithOptions();
    for (const proc of Object.keys(NEITHER)) {
      const m = seen.filter(x => x.proc === proc);
      expect(m.length, proc).toBeGreaterThan(0);
    }
  });

  it("scans something — a regex that matches nothing passes everything", () => {
    const names = mutationsWithOptions().map(m => m.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "setRunTypeFor",
        "setTypedLength",
        "addCircuit",
        "addLeg",
        "setMarkHeight",
        "renameSheet",
      ])
    );
  });
});
