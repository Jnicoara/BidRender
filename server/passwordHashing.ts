/**
 * PASSWORD HASHING OFF THE MAIN THREAD (Q-AUTH1, todo.md; Track C's sign-in
 * burst, `references/stress-results.md` on track-c).
 *
 * ── The fault ────────────────────────────────────────────────────────────────
 * `bcryptjs` is pure JavaScript and its "async" `hash`/`compare` split the work
 * into chunks scheduled with `process.nextTick`, which runs BEFORE timers and
 * I/O. So a cost-12 hash (~250 ms of CPU) still holds the event loop for its
 * whole length, and eleven sign-ins at once stalled every other request for
 * ~0.7 s on the production build: a bid read went from 42 ms to 701 ms.
 *
 * ── The fix ──────────────────────────────────────────────────────────────────
 * The same library, the same `$2a$`/`$2b$` hashes, run in a small pool of
 * worker threads. The main thread only posts a message and waits, so other
 * requests keep being answered while a hash runs. No stored hash changes and
 * no new dependency (option (b) in the todo; native `bcrypt` would have meant
 * a compiled module on App Platform's image).
 *
 * The worker is started from source text (`eval: true`) rather than a file,
 * because the server ships as ONE bundled file (`scripts/build.mts`) and a
 * worker file would need a second entry point kept in step with it. It loads
 * `bcryptjs` from the path resolved HERE, so it finds the same copy the
 * server would.
 *
 * There is no fallback to hashing on the main thread: a fallback nobody can
 * see being taken is how a fix quietly stops working. If the worker cannot
 * start, sign-in fails loudly, and the suite (`server/signInBurst.test.ts`)
 * and the staging smoke both sign in.
 */
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import os from "node:os";

const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const bcrypt = require(workerData.bcryptPath);
parentPort.on("message", job => {
  try {
    const result =
      job.op === "hash"
        ? bcrypt.hashSync(job.password, job.rounds)
        : bcrypt.compareSync(job.password, job.hash);
    parentPort.postMessage({ id: job.id, result });
  } catch (error) {
    parentPort.postMessage({ id: job.id, error: String(error && error.message || error) });
  }
});
`;

type Job = {
  id: number;
  message:
    | { op: "hash"; password: string; rounds: number }
    | { op: "compare"; password: string; hash: string };
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type Slot = { worker: Worker; job: Job | null };

/**
 * Up to four threads, never more than the machine has cores. A hash is pure
 * CPU, so threads beyond the core count only queue inside the OS instead of
 * here.
 */
export const POOL_SIZE = Math.max(
  1,
  Math.min(4, os.availableParallelism?.() ?? os.cpus().length)
);

const bcryptPath = createRequire(import.meta.url).resolve("bcryptjs");
const slots: Slot[] = [];
const queue: Job[] = [];
let nextId = 1;

function spawn(): Slot {
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: { bcryptPath },
  });
  const slot: Slot = { worker, job: null };
  // An idle pool must not keep a script alive after its work is done.
  worker.unref();
  worker.on(
    "message",
    (reply: { id: number; result?: unknown; error?: string }) => {
      const job = slot.job;
      if (!job || job.id !== reply.id) return;
      slot.job = null;
      worker.unref();
      if (reply.error !== undefined) job.reject(new Error(reply.error));
      else job.resolve(reply.result);
      drain();
    }
  );
  const fail = (error: Error) => {
    const index = slots.indexOf(slot);
    if (index >= 0) slots.splice(index, 1);
    const job = slot.job;
    slot.job = null;
    job?.reject(error);
    drain();
  };
  worker.on("error", fail);
  worker.on("exit", code => {
    if (slots.includes(slot))
      fail(new Error(`Password worker stopped (exit code ${code})`));
  });
  slots.push(slot);
  return slot;
}

function drain() {
  while (queue.length > 0) {
    let slot = slots.find(s => s.job === null);
    if (!slot && slots.length < POOL_SIZE) slot = spawn();
    if (!slot) return;
    const job = queue.shift()!;
    slot.job = job;
    slot.worker.ref();
    slot.worker.postMessage({ id: job.id, ...job.message });
  }
}

function run<T>(message: Job["message"]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      id: nextId++,
      message,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    drain();
  });
}

/** A bcrypt hash of `password` at `rounds`, made off the main thread. */
export function hashPassword(
  password: string,
  rounds: number
): Promise<string> {
  return run<string>({ op: "hash", password, rounds });
}

/** Whether `password` matches the stored bcrypt `hash`, checked off the main thread. */
export function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return run<boolean>({ op: "compare", password, hash });
}
