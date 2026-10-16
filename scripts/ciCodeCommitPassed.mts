/**
 * THE DOCS GATE'S ONE QUESTION (owner, 2026-10-16): did the CODE commit under
 * this notes push really pass its full test suite?
 *
 * Until 2026-10-16 a notes-only push ran a "DOCS" mode inside the Gate that
 * went green on its own, whatever had happened to the code beneath it — and
 * on a track branch that notes push CANCELLED the code run still in
 * progress. So a branch could show green over code no full run had ever
 * finished (found by Track B: `quantitiesIgnoreDeletedPlans` red for a day
 * under green notes runs). Now notes pushes never start the Gate
 * (`paths-ignore` in gate.yml) and run .github/workflows/docs-gate.yml, which
 * asks this script and goes RED unless a Gate run on the code commit has a
 * "Test suite" step that SUCCEEDED. Cancelled, failed, still running or
 * never run are all red, each saying which.
 *
 *   node --experimental-strip-types scripts/ciCodeCommitPassed.mts <sha>
 *   (env GITHUB_TOKEN, GITHUB_REPOSITORY; exits 1 on any verdict but "ok")
 *
 * Only the pure `codeCommitVerdict` is tested
 * (scripts/ciCodeCommitPassed.test.ts); the fetch below just gathers the
 * evidence for it.
 */

/** One workflow run on the commit, as the verdict needs it. */
export type RunEvidence = {
  runId: number;
  workflow: string;
  /** queued / in_progress / completed */
  status: string;
  /** success / failure / cancelled / … ; null while running */
  conclusion: string | null;
  /** The "Test suite" step's conclusion in its test job; null if none ran. */
  testSuite: string | null;
};

export type Verdict =
  | { ok: true; runId: number }
  | {
      ok: false;
      reason: "running" | "cancelled" | "failed" | "never-ran";
      message: string;
    };

/** The step whose success means the full suite passed. gate.yml names it. */
export const TEST_SUITE_STEP = "Test suite";

export function codeCommitVerdict(
  sha: string,
  runs: readonly RunEvidence[],
  workflow = "Gate"
): Verdict {
  const gate = runs.filter(r => r.workflow === workflow);
  // A SEEN run is a success without running the suite, so only the step
  // counts — in ANY run on this commit, on any branch.
  const passed = gate.find(r => r.testSuite === "success");
  if (passed) return { ok: true, runId: passed.runId };
  const short = sha.slice(0, 8);
  const running = gate.find(r => r.status !== "completed");
  if (running)
    return {
      ok: false,
      reason: "running",
      message: `The code commit ${short} is still being tested (Gate run ${running.runId}). Push notes only after it finishes green, then re-run this job.`,
    };
  if (
    gate.some(r => r.conclusion === "cancelled" || r.testSuite === "cancelled")
  )
    return {
      ok: false,
      reason: "cancelled",
      message: `The code commit ${short}'s Gate run was CANCELLED before its suite passed. Re-run that Gate run; this notes run stays red until it is green.`,
    };
  if (gate.length > 0)
    return {
      ok: false,
      reason: "failed",
      message: `The code commit ${short} did NOT pass its full suite. Fix the code; notes cannot make it green.`,
    };
  return {
    ok: false,
    reason: "never-ran",
    message: `No Gate run exists for the code commit ${short}. Push the code (or re-run its Gate) before notes.`,
  };
}

// ── CLI: gather the evidence from the GitHub API ───────────────────────────
async function main(sha: string) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN");
  const api = async (path: string) => {
    const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
    return res.json();
  };
  const list = (await api(`actions/runs?head_sha=${sha}&per_page=100`)) as {
    workflow_runs: {
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
    }[];
  };
  const runs: RunEvidence[] = [];
  for (const r of list.workflow_runs) {
    let testSuite: string | null = null;
    if (r.name === "Gate") {
      const jobs = (await api(`actions/runs/${r.id}/jobs`)) as {
        jobs: {
          name: string;
          steps?: { name: string; conclusion: string | null }[];
        }[];
      };
      const step = jobs.jobs
        .find(j => j.name === "test")
        ?.steps?.find(s => s.name === TEST_SUITE_STEP);
      testSuite = step?.conclusion ?? null;
    }
    runs.push({
      runId: r.id,
      workflow: r.name,
      status: r.status,
      conclusion: r.conclusion,
      testSuite,
    });
  }
  const v = codeCommitVerdict(sha, runs);
  if (v.ok) {
    console.log(
      `ok: the code commit ${sha.slice(0, 8)} passed its full suite (Gate run ${v.runId}).`
    );
    return;
  }
  console.log(`::error::${v.message}`);
  process.exit(1);
}

const arg = process.argv[2];
// Not a top-level await: the suite imports this file, and the main tsconfig
// does not allow one. A thrown API error must still end the job red.
if (arg && /^[0-9a-f]{7,40}$/.test(arg))
  main(arg).catch(error => {
    console.log(`::error::${String(error)}`);
    process.exit(1);
  });
