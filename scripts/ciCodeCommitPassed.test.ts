/**
 * The Docs gate's verdict (scripts/ciCodeCommitPassed.mts): a notes push is
 * green ONLY when the code commit under it has a Gate run whose "Test suite"
 * step succeeded. The hole it closes (Track B, 2026-10-16): notes runs went
 * green over a code run that had been cancelled — or had failed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codeCommitVerdict, type RunEvidence } from "./ciCodeCommitPassed.mts";

const SHA = "8ebf6c2e00000000000000000000000000000000";
const run = (p: Partial<RunEvidence>): RunEvidence => ({
  runId: 1,
  workflow: "Gate",
  status: "completed",
  conclusion: "success",
  testSuite: "success",
  ...p,
});

describe("the Docs gate's verdict on the code commit underneath", () => {
  it("green only when a Gate run's Test suite step succeeded", () => {
    expect(codeCommitVerdict(SHA, [run({ runId: 7 })])).toEqual({
      ok: true,
      runId: 7,
    });
  });

  it("a CANCELLED code run is red — the hole B found", () => {
    const v = codeCommitVerdict(SHA, [
      run({ conclusion: "cancelled", testSuite: null }),
    ]);
    expect(v).toMatchObject({ ok: false, reason: "cancelled" });
  });

  it("a FAILED code run is red", () => {
    const v = codeCommitVerdict(SHA, [
      run({ conclusion: "failure", testSuite: "failure" }),
    ]);
    expect(v).toMatchObject({ ok: false, reason: "failed" });
  });

  it("a run still going is red, and says to wait", () => {
    const v = codeCommitVerdict(SHA, [
      run({ status: "in_progress", conclusion: null, testSuite: null }),
    ]);
    expect(v).toMatchObject({ ok: false, reason: "running" });
    if (!v.ok) expect(v.message).toMatch(/only after it finishes green/);
  });

  it("no Gate run at all is red", () => {
    expect(codeCommitVerdict(SHA, [])).toMatchObject({
      ok: false,
      reason: "never-ran",
    });
    // Another workflow's success does not count.
    expect(
      codeCommitVerdict(SHA, [run({ workflow: "Docs gate" })])
    ).toMatchObject({ ok: false, reason: "never-ran" });
  });

  it("a SEEN run (success without running the suite) does not count by itself", () => {
    const seen = run({ runId: 9, testSuite: "skipped" });
    expect(codeCommitVerdict(SHA, [seen])).toMatchObject({
      ok: false,
      reason: "failed",
    });
    // …but the full run it was SEEN from does, wherever it ran.
    expect(codeCommitVerdict(SHA, [seen, run({ runId: 4 })])).toEqual({
      ok: true,
      runId: 4,
    });
  });

  it("one cancelled run beside a passing one is green: the commit DID pass", () => {
    expect(
      codeCommitVerdict(SHA, [
        run({ runId: 1, conclusion: "cancelled", testSuite: null }),
        run({ runId: 2 }),
      ])
    ).toEqual({ ok: true, runId: 2 });
  });
});

describe("the two workflows stay apart (gate.yml / docs-gate.yml)", () => {
  const gate = readFileSync(".github/workflows/gate.yml", "utf8");
  const docs = readFileSync(".github/workflows/docs-gate.yml", "utf8");
  const list = (text: string, key: string) =>
    text.match(new RegExp(`^\\s*${key}: \\[(.*)\\]`, "m"))?.[1];

  it("a notes-only push starts the Docs gate and never the Gate: the same two patterns", () => {
    expect(list(gate, "paths-ignore")).toBe('"**.md", "references/**"');
    expect(list(docs, "paths")).toBe(list(gate, "paths-ignore"));
  });

  it("the Gate has no notes-only mode left that could go green by itself", () => {
    expect(gate).not.toMatch(/mode=docs|outputs\.mode == 'docs'/);
  });

  it("the Docs gate cannot cancel a Gate run, and checks the code commit", () => {
    expect(docs).toMatch(/group: docs-gate-/);
    expect(gate).toMatch(/group: gate-/);
    expect(docs).toMatch(/node scripts\/ciCodeCommitPassed\.mts/);
  });

  it("the step name the verdict reads is the one gate.yml runs the suite in", () => {
    expect(gate).toMatch(/- name: Test suite\n/);
  });
});
