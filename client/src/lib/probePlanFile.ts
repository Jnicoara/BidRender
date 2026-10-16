/**
 * Can pdf.js open this file? Asked BEFORE an upload starts
 * (hard-PDF drill, 2026-10-16), in the sheet reader's worker, so a
 * password-protected or damaged set is refused with words that say what to
 * do — not uploaded, attached and then shown as "could not be opened".
 *
 * FAILS OPEN: anything but a clear file problem (a slow disk, a worker that
 * cannot start, an error this does not recognise) lets the upload go ahead.
 * The viewer still reports what it finds; this only stops the cases it is
 * sure of, because refusing a good plan set is worse than attaching a bad one.
 */
import { planFileProblem, type PlanFileProblem } from "./planFailure";

export type PlanFileProbe =
  | { ok: true; pageCount: number | null }
  | { ok: false; problem: PlanFileProblem; message: string };

/** The decision, from what the worker said (pure, so it is tested). */
export function probeVerdict(
  reply:
    | { type: "probed"; pageCount: number }
    | { type: "probeFailed"; message: string }
    | null
): PlanFileProbe {
  if (!reply) return { ok: true, pageCount: null };
  if (reply.type === "probed") return { ok: true, pageCount: reply.pageCount };
  const problem = planFileProblem(reply.message);
  return problem
    ? { ok: false, problem, message: reply.message }
    : { ok: true, pageCount: null };
}

/** Ask the worker; give up (and let the upload go) after `timeoutMs`. */
export function probePlanFile(
  file: File,
  timeoutMs = 20_000
): Promise<PlanFileProbe> {
  return new Promise(resolve => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/sheetReader.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch {
      resolve(probeVerdict(null));
      return;
    }
    const done = (verdict: PlanFileProbe) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(verdict);
    };
    const timer = setTimeout(() => done(probeVerdict(null)), timeoutMs);
    worker.onmessage = e => {
      const m = e.data;
      if (m?.type === "probed" || m?.type === "probeFailed")
        done(probeVerdict(m));
    };
    worker.onerror = () => done(probeVerdict(null));
    worker.postMessage({ type: "probe", file });
  });
}
