/**
 * Sending a large plan set to R2 in pieces, and picking it up after a failure.
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 * Ask the server to start an upload, then repeat: ask which pieces R2 already
 * has, send the ones it does not, a few at a time, retrying each on its own.
 * When nothing is left, ask the server to stitch them together.
 *
 * Every piece goes straight from the browser to R2. This code never talks to
 * our own server about anything but permission, which is why the size of the
 * file has no bearing on what our server has to handle.
 *
 * ── Resuming is asking R2, every time ────────────────────────────────────────
 * The list of what is already there is fetched from storage at the START of
 * every attempt, including the first. That is one extra round trip, and it buys
 * the property that matters: there is no local belief about what was sent that
 * could be wrong. A piece that half-arrived is simply not in R2's list and is
 * sent again.
 *
 * ── Retrying, and what is NOT retried ────────────────────────────────────────
 * A piece is retried a few times with a growing wait, because on a site
 * connection a single failed piece is ordinary and re-sending 16MB is cheap.
 * What is never retried automatically is a refusal — a 403 on a signed url
 * means the url is wrong or expired, and hammering it produces the same answer
 * more slowly. Those surface so the outer layer can sign fresh urls or stop.
 *
 * ── Being offline is a pause, not a failure ──────────────────────────────────
 * When the browser says there is no network, the uploader waits for it to come
 * back rather than burning its retries against a connection that is not there.
 * This is what makes "turn the Wi-Fi off and on again" work with nothing to
 * click: the pieces in flight fail, the queue notices it is offline, and it
 * resumes when the network returns.
 */
import { looksStalled } from "@shared/uploadSpeed";
import {
  UPLOAD_CONCURRENCY,
  planParts,
  partRange,
  remainingPartNumbers,
  uploadedBytes,
  type PartPlan,
} from "@shared/multipartPlan";

/** How many times one piece is re-sent before the upload gives up on it. */
const PART_ATTEMPTS = 4;

/** Growing wait between attempts, in milliseconds. */
const RETRY_BACKOFF_MS = [1000, 3000, 8000];

/** How long to wait for the network before giving up on being offline. */
const OFFLINE_PATIENCE_MS = 5 * 60 * 1000;

/**
 * How many pieces are signed in one request.
 *
 * Must not exceed the server's own cap (MAX_PARTS_PER_SIGN_REQUEST), which is
 * what actually enforces it; this is the client keeping its side of the deal.
 */
const SIGN_BATCH = 32;

export type UploadedPart = { partNumber: number; etag: string };

/** What the uploader needs from the outside world, so tests can supply it. */
export type MultipartTransport = {
  /** Signed urls for these pieces. Batched by the caller. */
  signParts(
    partNumbers: number[]
  ): Promise<{ partNumber: number; url: string }[]>;
  /** What R2 already holds. */
  listParts(): Promise<UploadedPart[]>;
  /** Stitch the pieces together. */
  complete(parts: UploadedPart[]): Promise<void>;
};

export type MultipartProgress = {
  /** Total bytes confirmed in R2, including pieces from a previous attempt. */
  bytesSent: number;
  /** Pieces confirmed, and how many there are altogether. */
  partsDone: number;
  partCount: number;
  /** Set while waiting for the network to come back. */
  paused: boolean;
  /**
   * Nothing has moved for a while, though the browser still claims a network.
   *
   * Distinct from `paused`, which is the browser admitting it is offline —
   * something Windows can take most of a minute to do. In that gap this is the
   * only honest thing the row can say. It changes what is DISPLAYED and
   * nothing else: the upload carries on, pieces still retrying on their own.
   */
  stalled: boolean;
  /** Which attempt a piece is on, when it is being retried. */
  retrying: number | null;
};

export type MultipartOptions = {
  file: Blob;
  byteSize: number;
  partSize: number;
  transport: MultipartTransport;
  onProgress: (progress: MultipartProgress) => void;
  /** Aborts the whole upload. Pieces in flight are cancelled. */
  signal?: AbortSignal;
  /** Swapped out in tests — real ones send to R2. */
  sendPart?: SendPart;
  /** Swapped out in tests so a backoff does not really wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Swapped out in tests. Whether the browser thinks it has a network. */
  isOnline?: () => boolean;
  /** Swapped out in tests. Resolves when the network comes back. */
  waitForOnline?: (signal?: AbortSignal) => Promise<void>;
  /** How many pieces are in the air at once. Defaults to UPLOAD_CONCURRENCY. */
  concurrency?: number;
  /** Swapped out in tests, so silence can be simulated without waiting. */
  now?: () => number;
  /**
   * Starts the watchdog that notices silence; returns a function to stop it.
   *
   * Injected rather than calling setInterval directly so a test can drive it
   * by hand — the whole point of this watchdog is what happens during ten
   * seconds of nothing, which is not something to sit through in a test.
   */
  startStallWatch?: (tick: () => void) => () => void;
};

export type SendPart = (args: {
  url: string;
  body: Blob;
  signal?: AbortSignal;
  onBytes: (delta: number) => void;
}) => Promise<string>;

/** An upload failure that says whether sending the same bytes again could work. */
export class PartUploadError extends Error {
  constructor(
    message: string,
    readonly partNumber: number,
    readonly status: number | null,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "PartUploadError";
  }
}

const defaultSleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Re-report progress every second, whether or not anything happened.
 *
 * A row that only updates when bytes arrive cannot show that no bytes are
 * arriving, which is the one thing it most needs to be able to say. One timer
 * for the whole upload, cleared when it ends.
 */
const defaultStallWatch = (tick: () => void) => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
};

const defaultIsOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

function defaultWaitForOnline(signal?: AbortSignal): Promise<void> {
  if (defaultIsOnline()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      window.removeEventListener("online", done);
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      window.removeEventListener("online", done);
      clearTimeout(timer);
      reject(new Error("Upload cancelled."));
    };
    const timer = setTimeout(done, OFFLINE_PATIENCE_MS);
    window.addEventListener("online", done);
    signal?.addEventListener("abort", onAbort);
  });
}

/**
 * Send one piece with XMLHttpRequest.
 *
 * XHR rather than fetch because fetch cannot report upload progress, and a
 * 16MB piece on a slow connection takes long enough that a progress bar which
 * only moves when a whole piece lands would look stuck.
 *
 * The ETag it returns is R2's receipt for those bytes. Completing the upload
 * needs every one of them, so a missing ETag is a failure even though the
 * transfer itself succeeded — which is what a bucket without `ExposeHeaders:
 * ETag` in its CORS rule looks like from in here, and is worth saying rather
 * than failing later with something vaguer.
 */
const xhrSendPart: SendPart = ({ url, body, signal, onBytes }) =>
  new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort);
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.open("PUT", url, true);

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      onBytes(event.loaded - lastLoaded);
      lastLoaded = event.loaded;
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status < 200 || xhr.status >= 300) {
        // Give back the bytes this attempt had claimed: the piece did not land,
        // so a retry must not double-count them.
        onBytes(-lastLoaded);
        reject(
          new PartUploadError(
            `Storage refused a piece of the file (HTTP ${xhr.status}).`,
            0,
            xhr.status,
            // 5xx and 429 are worth another go; a 4xx refusal is not.
            xhr.status >= 500 || xhr.status === 429
          )
        );
        return;
      }
      const etag = xhr.getResponseHeader("ETag");
      if (!etag) {
        reject(
          new PartUploadError(
            "Storage accepted a piece but did not return its ETag, so the " +
              "file cannot be reassembled. The bucket's CORS rule needs to " +
              "expose the ETag header.",
            0,
            xhr.status,
            false
          )
        );
        return;
      }
      resolve(etag);
    };

    xhr.onerror = () => {
      cleanup();
      onBytes(-lastLoaded);
      reject(
        new PartUploadError(
          "A piece of the file could not be sent.",
          0,
          null,
          true
        )
      );
    };

    xhr.onabort = () => {
      cleanup();
      onBytes(-lastLoaded);
      reject(new PartUploadError("Upload cancelled.", 0, null, false));
    };

    xhr.send(body);
  });

/**
 * Send a file in pieces, resuming whatever is already there.
 *
 * Returns when the finished object exists in R2. Throws if it does not — there
 * is no partial success, because a half-assembled plan is not a plan.
 */
export async function uploadInParts(
  options: MultipartOptions
): Promise<PartPlan> {
  const {
    file,
    byteSize,
    partSize,
    transport,
    onProgress,
    signal,
    sendPart = xhrSendPart,
    sleep = defaultSleep,
    isOnline = defaultIsOnline,
    waitForOnline = defaultWaitForOnline,
    concurrency = UPLOAD_CONCURRENCY,
    now = () => Date.now(),
    startStallWatch = defaultStallWatch,
  } = options;

  const plan = planParts(byteSize, partSize);

  // What R2 already has. Asked every time, including the first attempt: it is
  // the only account of what happened that was actually present.
  const existing = await transport.listParts();
  const done = new Map<number, string>(
    existing.map(p => [p.partNumber, p.etag])
  );

  let bytes = uploadedBytes(plan, Array.from(done.keys()), byteSize);
  let paused = false;
  let retrying: number | null = null;
  let lastMovementAt = now();

  const report = () =>
    onProgress({
      bytesSent: Math.min(bytes, byteSize),
      partsDone: done.size,
      partCount: plan.partCount,
      paused,
      // Silence only counts while the upload is actually meant to be moving.
      // While paused the row already says the network is gone, and saying it
      // twice in two different ways is worse than saying it once.
      stalled: !paused && looksStalled(lastMovementAt, now()),
      retrying,
    });

  /** Any byte in either direction is proof the connection is alive. */
  const moved = () => {
    lastMovementAt = now();
  };

  report();

  // Re-report on a timer as well as on movement. Without this, an upload that
  // goes completely silent produces no events at all — and a row that only
  // updates when something happens can never show that nothing is happening.
  const stopStallWatch = startStallWatch(() => report());

  try {
    const queue = remainingPartNumbers(plan, Array.from(done.keys()));

    /** Send one piece, retrying it on its own. */
    const sendOne = async (partNumber: number, url: string) => {
      for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
        if (signal?.aborted)
          throw new PartUploadError(
            "Upload cancelled.",
            partNumber,
            null,
            false
          );

        if (!isOnline()) {
          paused = true;
          report();
          await waitForOnline(signal);
          paused = false;
          report();
        }

        try {
          const { start, end } = partRange(partNumber, plan, byteSize);
          const etag = await sendPart({
            url,
            body: file.slice(start, end),
            signal,
            onBytes: delta => {
              bytes += delta;
              moved();
              report();
            },
          });
          done.set(partNumber, etag);
          retrying = null;
          moved();
          report();
          return;
        } catch (raw) {
          const error = raw as PartUploadError;
          const last = attempt === PART_ATTEMPTS;
          if (!error.retryable || last) {
            // Re-thrown carrying the piece number, which the bare transport
            // error does not know.
            throw new PartUploadError(
              error.message,
              partNumber,
              error.status ?? null,
              error.retryable ?? false
            );
          }
          retrying = attempt + 1;
          // A failure is not silence — something came back. The row should show
          // "retrying", which is informative, rather than "connection lost".
          moved();
          report();
          await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? 8000);
        }
      }
    };

    /**
     * Work through the queue a group at a time: sign the whole group in one
     * request, then send its pieces with a fixed number in the air.
     *
     * Grouped rather than signing each piece as it comes up, because signing is a
     * round trip to our server and doing one per 16MB piece would put a stall
     * between every piece on a fast connection. Grouped rather than signing
     * everything at the start, because a 2GB set takes long enough that urls
     * signed at the beginning would be working from a stale clock by the end.
     */
    for (let from = 0; from < queue.length; from += SIGN_BATCH) {
      if (signal?.aborted) break;
      const group = queue.slice(from, from + SIGN_BATCH);
      const signed = await transport.signParts(group);
      const urls = new Map(signed.map(s => [s.partNumber, s.url]));

      let cursor = 0;
      // Each worker takes the next number rather than a slice given up front, so
      // one slow piece does not leave a worker idle at the end of the group.
      const takeNext = () => (cursor < group.length ? group[cursor++] : null);

      const worker = async () => {
        for (;;) {
          if (signal?.aborted) return;
          const partNumber = takeNext();
          if (partNumber === null) return;
          const url = urls.get(partNumber);
          if (!url) {
            throw new PartUploadError(
              "The server did not return a place to send a piece of the file.",
              partNumber,
              null,
              false
            );
          }
          await sendOne(partNumber, url);
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(concurrency, group.length) }, () =>
          worker()
        )
      );
    }

    if (signal?.aborted) {
      throw new PartUploadError("Upload cancelled.", 0, null, false);
    }

    if (done.size !== plan.partCount) {
      throw new PartUploadError(
        `Only ${done.size} of ${plan.partCount} pieces of the file reached storage.`,
        0,
        null,
        true
      );
    }

    await transport.complete(
      Array.from(done.entries())
        .map(([partNumber, etag]) => ({ partNumber, etag }))
        .sort((a, b) => a.partNumber - b.partNumber)
    );

    return plan;
  } finally {
    // However this ends — finished, cancelled or thrown — the timer stops. A
    // surviving interval would keep reporting progress for an upload that is
    // over, on a row that has already gone.
    stopStallWatch();
  }
}
