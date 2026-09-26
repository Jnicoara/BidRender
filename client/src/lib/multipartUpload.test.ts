/**
 * Sending a plan set in pieces, and what happens when the connection misbehaves.
 *
 * ── Why this can be tested at all ────────────────────────────────────────────
 * The uploader takes its transport, its clock-waiting and its idea of being
 * online as arguments. So a dropped connection, a stalled piece, a refusal and
 * a resume are all just functions that behave badly on cue, and none of the
 * cases below needs a network or a large file.
 *
 * The one thing that genuinely cannot be faked — that the file R2 assembles is
 * byte-for-byte the one that was picked — is checked by hand against the real
 * bucket with a real several-hundred-megabyte PDF.
 */
import { describe, it, expect, vi } from "vitest";
import {
  PartUploadError,
  uploadInParts,
  type MultipartTransport,
  type SendPart,
  type UploadedPart,
} from "./multipartUpload";

const MiB = 1024 * 1024;

/** A file of `size` bytes whose every byte is known, so slices can be checked. */
function fakeFile(size: number): Blob {
  return new Blob([new Uint8Array(size)]);
}

/**
 * A stand-in for R2 that actually remembers what it was given.
 *
 * Remembering matters: most of what is being tested is "does it ask storage
 * what it already has, and does it then send exactly the rest", which a
 * transport that just returns success cannot show.
 */
function fakeStorage(options: { alreadyHave?: number[] } = {}) {
  const received = new Map<number, string>(
    (options.alreadyHave ?? []).map(n => [n, `"etag-${n}"`])
  );
  let completedWith: UploadedPart[] | null = null;
  const signed: number[][] = [];

  const transport: MultipartTransport = {
    signParts: async partNumbers => {
      signed.push([...partNumbers]);
      return partNumbers.map(partNumber => ({
        partNumber,
        url: `https://bucket.example/part/${partNumber}`,
      }));
    },
    listParts: async () =>
      Array.from(received.entries())
        .map(([partNumber, etag]) => ({ partNumber, etag }))
        .sort((a, b) => a.partNumber - b.partNumber),
    complete: async parts => {
      completedWith = parts;
    },
  };

  return {
    transport,
    received,
    signed,
    get completedWith() {
      return completedWith;
    },
  };
}

/** A sender that always works, recording which pieces it carried. */
function goodSender(storage: ReturnType<typeof fakeStorage>) {
  const sent: { partNumber: number; bytes: number }[] = [];
  const send: SendPart = async ({ url, body, onBytes }) => {
    const partNumber = Number(url.split("/").pop());
    onBytes(body.size);
    sent.push({ partNumber, bytes: body.size });
    storage.received.set(partNumber, `"etag-${partNumber}"`);
    return `"etag-${partNumber}"`;
  };
  return { send, sent };
}

const noSleep = async () => {};
const alwaysOnline = () => true;

const run = (over: Partial<Parameters<typeof uploadInParts>[0]>) =>
  uploadInParts({
    file: fakeFile(40 * MiB),
    byteSize: 40 * MiB,
    partSize: 16 * MiB,
    transport: fakeStorage().transport,
    onProgress: () => {},
    sleep: noSleep,
    isOnline: alwaysOnline,
    waitForOnline: async () => {},
    ...over,
  });

describe("a straightforward upload", () => {
  it("sends every piece and stitches them together", async () => {
    const storage = fakeStorage();
    const sender = goodSender(storage);

    await run({ transport: storage.transport, sendPart: sender.send });

    expect(sender.sent.map(s => s.partNumber).sort()).toEqual([1, 2, 3]);
    expect(storage.completedWith).toEqual([
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' },
    ]);
  });

  it("sends the receipts in piece order, whatever order they finished in", async () => {
    // Storage assembles the file in the order it is given, so an out-of-order
    // list produces a scrambled PDF rather than an error. Pieces finish in
    // whatever order the network allows, so this cannot be left to luck.
    const storage = fakeStorage();
    const send: SendPart = async ({ url, body, onBytes }) => {
      const partNumber = Number(url.split("/").pop());
      // Later pieces finish first.
      await new Promise(r => setTimeout(r, (4 - partNumber) * 5));
      onBytes(body.size);
      return `"etag-${partNumber}"`;
    };

    await run({ transport: storage.transport, sendPart: send });

    expect(storage.completedWith?.map(p => p.partNumber)).toEqual([1, 2, 3]);
  });

  it("cuts the last piece short rather than padding it", async () => {
    const storage = fakeStorage();
    const sender = goodSender(storage);

    await run({ transport: storage.transport, sendPart: sender.send });

    const total = sender.sent.reduce((sum, s) => sum + s.bytes, 0);
    expect(total).toBe(40 * MiB);
    expect(sender.sent.find(s => s.partNumber === 3)?.bytes).toBe(8 * MiB);
  });

  it("reports progress that ends at the size of the file", async () => {
    const storage = fakeStorage();
    const sender = goodSender(storage);
    const seen: number[] = [];

    await run({
      transport: storage.transport,
      sendPart: sender.send,
      onProgress: p => seen.push(p.bytesSent),
    });

    expect(seen[seen.length - 1]).toBe(40 * MiB);
    expect(Math.max(...seen)).toBeLessThanOrEqual(40 * MiB);
  });
});

describe("resuming", () => {
  /**
   * The headline behaviour: what storage already holds is not sent again.
   */
  it("sends only the pieces storage does not have", async () => {
    const storage = fakeStorage({ alreadyHave: [1, 3] });
    const sender = goodSender(storage);

    await run({ transport: storage.transport, sendPart: sender.send });

    expect(sender.sent.map(s => s.partNumber)).toEqual([2]);
  });

  it("still completes with every piece, not just the resent one", async () => {
    const storage = fakeStorage({ alreadyHave: [1, 3] });
    const sender = goodSender(storage);

    await run({ transport: storage.transport, sendPart: sender.send });

    expect(storage.completedWith?.map(p => p.partNumber)).toEqual([1, 2, 3]);
  });

  it("starts the progress bar where the last attempt stopped", async () => {
    const storage = fakeStorage({ alreadyHave: [1, 2] });
    const sender = goodSender(storage);
    const first: number[] = [];

    await run({
      transport: storage.transport,
      sendPart: sender.send,
      onProgress: p => first.push(p.bytesSent),
    });

    // The very first reading already accounts for the two pieces in storage,
    // so a resumed upload does not appear to begin again from nothing.
    expect(first[0]).toBe(32 * MiB);
  });

  it("asks storage what it has before sending anything", async () => {
    const storage = fakeStorage({ alreadyHave: [1, 2, 3] });
    const sender = goodSender(storage);

    await run({ transport: storage.transport, sendPart: sender.send });

    // Everything was already there, so nothing was sent — and it still
    // completed, because the file is whole.
    expect(sender.sent).toEqual([]);
    expect(storage.completedWith?.map(p => p.partNumber)).toEqual([1, 2, 3]);
  });
});

describe("when a piece fails", () => {
  it("retries it and carries on", async () => {
    const storage = fakeStorage();
    let failuresLeft = 2;
    const send: SendPart = async ({ url, body, onBytes }) => {
      const partNumber = Number(url.split("/").pop());
      if (partNumber === 2 && failuresLeft > 0) {
        failuresLeft--;
        throw new PartUploadError("connection reset", 0, null, true);
      }
      onBytes(body.size);
      return `"etag-${partNumber}"`;
    };

    await run({ transport: storage.transport, sendPart: send });

    expect(storage.completedWith?.map(p => p.partNumber)).toEqual([1, 2, 3]);
  });

  it("gives up after enough attempts rather than retrying forever", async () => {
    const storage = fakeStorage();
    const send = vi.fn<SendPart>(async () => {
      throw new PartUploadError("connection reset", 0, null, true);
    });

    await expect(
      run({ transport: storage.transport, sendPart: send })
    ).rejects.toThrow(/connection reset/);
    // Four attempts on the first piece before the whole thing fails.
    expect(send.mock.calls.length).toBeLessThanOrEqual(4 * 3);
  });

  /**
   * A refusal is not a flaky connection. Re-sending gets the same answer more
   * slowly, and hides the real cause behind three extra waits.
   */
  it("does not retry a refusal", async () => {
    const storage = fakeStorage();
    const send = vi.fn<SendPart>(async () => {
      throw new PartUploadError("Storage refused", 0, 403, false);
    });

    // One piece, so the count is unambiguous. With several, each is tried once
    // on its own and three refusals would read as a retry that did not happen.
    await expect(
      uploadInParts({
        file: fakeFile(8 * MiB),
        byteSize: 8 * MiB,
        partSize: 16 * MiB,
        transport: storage.transport,
        sendPart: send,
        onProgress: () => {},
        sleep: noSleep,
        isOnline: alwaysOnline,
        waitForOnline: async () => {},
      })
    ).rejects.toThrow(/refused/i);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("says which piece failed", async () => {
    const storage = fakeStorage();
    const send: SendPart = async ({ url, body, onBytes }) => {
      const partNumber = Number(url.split("/").pop());
      if (partNumber === 2) {
        throw new PartUploadError("nope", 0, 403, false);
      }
      onBytes(body.size);
      return `"etag-${partNumber}"`;
    };

    const error = await run({
      transport: storage.transport,
      sendPart: send,
    }).catch(e => e as PartUploadError);

    expect(error).toBeInstanceOf(PartUploadError);
    expect((error as PartUploadError).partNumber).toBe(2);
  });

  /**
   * A failed attempt must hand back the bytes it had claimed. Otherwise a
   * piece that dies at 90% and is retried counts those bytes twice, and the
   * bar sails past 100% — which makes every other number on the row suspect.
   */
  it("does not count the bytes of an attempt that failed", async () => {
    const storage = fakeStorage();
    let failed = false;
    const send: SendPart = async ({ url, body, onBytes }) => {
      const partNumber = Number(url.split("/").pop());
      if (partNumber === 1 && !failed) {
        failed = true;
        onBytes(body.size * 0.9);
        onBytes(-body.size * 0.9); // what the real sender does on failure
        throw new PartUploadError("dropped", 0, null, true);
      }
      onBytes(body.size);
      return `"etag-${partNumber}"`;
    };

    const seen: number[] = [];
    await run({
      transport: storage.transport,
      sendPart: send,
      onProgress: p => seen.push(p.bytesSent),
    });

    expect(Math.max(...seen)).toBe(40 * MiB);
  });

  it("explains a missing ETag rather than failing vaguely later", async () => {
    // What a bucket without ExposeHeaders: ETag looks like from in here. The
    // transfer succeeds and the upload is still impossible to complete.
    const storage = fakeStorage();
    const send: SendPart = async () => {
      throw new PartUploadError(
        "Storage accepted a piece but did not return its ETag, so the file " +
          "cannot be reassembled. The bucket's CORS rule needs to expose the " +
          "ETag header.",
        0,
        200,
        false
      );
    };

    await expect(
      run({ transport: storage.transport, sendPart: send })
    ).rejects.toThrow(/ETag/);
  });
});

describe("when the network goes away", () => {
  /**
   * The Wi-Fi-off test, as a function. Being offline must not burn the piece's
   * retries against a connection that is not there, and must not be reported
   * as a failure — nothing is wrong and nothing has been lost.
   */
  it("waits for the network instead of failing", async () => {
    const storage = fakeStorage();
    const sender = goodSender(storage);
    let online = false;
    const waitForOnline = vi.fn(async () => {
      online = true;
    });

    const paused: boolean[] = [];
    await run({
      transport: storage.transport,
      sendPart: sender.send,
      isOnline: () => online,
      waitForOnline,
      onProgress: p => paused.push(p.paused),
    });

    expect(waitForOnline).toHaveBeenCalled();
    expect(paused).toContain(true);
    // And it finished, once the network came back.
    expect(storage.completedWith?.map(p => p.partNumber)).toEqual([1, 2, 3]);
  });

  it("stops saying it is paused once the network is back", async () => {
    const storage = fakeStorage();
    const sender = goodSender(storage);
    let online = false;

    const paused: boolean[] = [];
    await run({
      transport: storage.transport,
      sendPart: sender.send,
      isOnline: () => online,
      waitForOnline: async () => {
        online = true;
      },
      onProgress: p => paused.push(p.paused),
    });

    expect(paused[paused.length - 1]).toBe(false);
  });
});

describe("cancelling", () => {
  it("stops, and does not complete a half-sent file", async () => {
    const storage = fakeStorage();
    const controller = new AbortController();
    const send: SendPart = async ({ url, body, onBytes }) => {
      const partNumber = Number(url.split("/").pop());
      controller.abort();
      onBytes(body.size);
      return `"etag-${partNumber}"`;
    };

    await expect(
      run({
        transport: storage.transport,
        sendPart: send,
        signal: controller.signal,
      })
    ).rejects.toThrow(/cancelled/i);

    // The thing that must never happen: a file assembled from some of its
    // pieces, which would attach and then not open.
    expect(storage.completedWith).toBeNull();
  });
});

describe("signing", () => {
  it("asks for pieces in batches rather than one request each", async () => {
    // 64 pieces at 16MB. One signing round trip per piece would put a stall
    // between every piece on a fast connection.
    const storage = fakeStorage();
    const sender = goodSender(storage);

    await uploadInParts({
      file: fakeFile(1024 * MiB),
      byteSize: 1024 * MiB,
      partSize: 16 * MiB,
      transport: storage.transport,
      sendPart: sender.send,
      onProgress: () => {},
      sleep: noSleep,
      isOnline: alwaysOnline,
      waitForOnline: async () => {},
    });

    expect(sender.sent.length).toBe(64);
    // Two batches of 32, not 64 separate requests.
    expect(storage.signed.length).toBe(2);
    expect(storage.signed[0].length).toBe(32);
  });

  it("only asks for the pieces it still needs", async () => {
    const storage = fakeStorage({ alreadyHave: [1, 2] });
    const sender = goodSender(storage);

    await run({ transport: storage.transport, sendPart: sender.send });

    expect(storage.signed).toEqual([[3]]);
  });
});

describe("when the connection dies but the browser has not noticed", () => {
  /**
   * The gap this covers: Windows can take most of a minute to admit a Wi-Fi
   * connection has gone. `isOnline` keeps saying yes, so the offline pause
   * never triggers, and without this the row would show a live yellow bar that
   * simply stopped — which reads as the app having hung.
   *
   * The clock and the watchdog are both injected, so ten seconds of silence is
   * a number here rather than ten seconds of waiting.
   */
  function frozenSender() {
    let release: (() => void) | null = null;
    const send: SendPart = () =>
      new Promise<string>(resolve => {
        release = () => resolve('"etag-1"');
      });
    return { send, release: () => release?.() };
  }

  it("reports stalled after ten seconds of silence, while still online", async () => {
    const storage = fakeStorage();
    const sender = frozenSender();
    let clock = 0;
    /*
      On an object rather than a `let`: the watch is handed over inside a
      callback, which TypeScript's flow analysis cannot see, so a `let` still
      read as `null` below and `tick?.()` narrowed to `never`. A property is
      read at its declared type.
    */
    const stall: { tick: (() => void) | null } = { tick: null };
    const seen: { stalled: boolean; paused: boolean }[] = [];

    const running = uploadInParts({
      file: fakeFile(8 * MiB),
      byteSize: 8 * MiB,
      partSize: 16 * MiB,
      transport: storage.transport,
      sendPart: sender.send,
      onProgress: p => seen.push({ stalled: p.stalled, paused: p.paused }),
      sleep: noSleep,
      isOnline: () => true, // the browser insists all is well
      waitForOnline: async () => {},
      now: () => clock,
      startStallWatch: t => {
        stall.tick = t;
        return () => {};
      },
    });

    await new Promise(r => setTimeout(r, 0));
    clock = 11_000; // eleven seconds of nothing
    // Stricter than the `tick?.()` it replaces, which did nothing at all if
    // the watch had never started — the failure then surfaced as a bare
    // `stalled` mismatch two lines down, with no reason attached.
    if (!stall.tick)
      throw new Error("uploadInParts never started its stall watch");
    stall.tick();

    const last = seen[seen.length - 1];
    expect(last.stalled).toBe(true);
    // Not "paused": nothing has said the machine is offline, and claiming it
    // had would be inventing a fact.
    expect(last.paused).toBe(false);

    sender.release();
    await running;
  });

  it("goes quiet again as soon as bytes move", async () => {
    const storage = fakeStorage();
    let clock = 0;
    let tick: (() => void) | null = null;
    const seen: boolean[] = [];

    await uploadInParts({
      file: fakeFile(8 * MiB),
      byteSize: 8 * MiB,
      partSize: 16 * MiB,
      transport: storage.transport,
      sendPart: async ({ body, onBytes }) => {
        clock = 11_000;
        tick?.(); // silent for eleven seconds…
        clock = 11_500;
        onBytes(body.size); // …then a byte arrives
        return '"etag-1"';
      },
      onProgress: p => seen.push(p.stalled),
      sleep: noSleep,
      isOnline: alwaysOnline,
      waitForOnline: async () => {},
      now: () => clock,
      startStallWatch: t => {
        tick = t;
        return () => {};
      },
    });

    expect(seen).toContain(true);
    expect(seen[seen.length - 1]).toBe(false);
  });

  it("stops its timer however the upload ends", async () => {
    const storage = fakeStorage();
    const sender = goodSender(storage);
    let stopped = false;

    await run({
      transport: storage.transport,
      sendPart: sender.send,
      startStallWatch: () => () => {
        stopped = true;
      },
    });

    // A surviving interval would keep reporting progress for an upload that is
    // over, on a row that has already gone.
    expect(stopped).toBe(true);
  });

  it("stops its timer when the upload fails too", async () => {
    const storage = fakeStorage();
    let stopped = false;

    await expect(
      run({
        transport: storage.transport,
        sendPart: async () => {
          throw new PartUploadError("nope", 0, 403, false);
        },
        startStallWatch: () => () => {
          stopped = true;
        },
      })
    ).rejects.toThrow();

    expect(stopped).toBe(true);
  });
});

describe("how many pieces go at once", () => {
  it("can be told, and never exceeds the pieces available", async () => {
    const storage = fakeStorage();
    let inFlight = 0;
    let peak = 0;

    await uploadInParts({
      file: fakeFile(160 * MiB),
      byteSize: 160 * MiB,
      partSize: 16 * MiB,
      concurrency: 6,
      transport: storage.transport,
      sendPart: async ({ url, body, onBytes }) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise(r => setTimeout(r, 5));
        onBytes(body.size);
        inFlight--;
        return `"etag-${Number(url.split("/").pop())}"`;
      },
      onProgress: () => {},
      sleep: noSleep,
      isOnline: alwaysOnline,
      waitForOnline: async () => {},
    });

    expect(peak).toBe(6);
  });
});
