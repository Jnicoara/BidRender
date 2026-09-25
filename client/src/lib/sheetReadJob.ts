/**
 * One run of the sheet reader for one plan: start the worker, turn what it
 * finds into batches (lib/sheetReadBatches.ts), and send them in order.
 *
 * ── Sends are strictly one after another ─────────────────────────────────────
 * The title batch must land after the page batches it refines, and a batch
 * that fails stops the run instead of letting later ones through with a gap
 * behind them. What was sent stays sent: leaving halfway keeps every page
 * already read, and the sheet list offers to read the rest.
 */
import {
  pageBatch,
  sourcesByPage,
  titleBatch,
  type PageSources,
} from "@/lib/sheetReadBatches";

export type SheetReadProgress =
  | { state: "reading"; read: number; total: number | null }
  | { state: "done"; read: number; total: number }
  | { state: "failed"; message: string };

export type SheetReadSource =
  | { file: File }
  | { url: string; byteSize: number | null };

/** Whatever the server accepts — `bidPdfs.recordSheetReads`'s input pages. */
export type SendPages = (pages: unknown[]) => Promise<void>;

export function startSheetRead({
  source,
  send,
  onProgress,
  onBatchSaved,
}: {
  source: SheetReadSource;
  send: SendPages;
  onProgress: (progress: SheetReadProgress) => void;
  /** After each batch is saved — where the caller refreshes its queries. */
  onBatchSaved: () => void;
}): { cancel: () => void } {
  const worker = new Worker(
    new URL("../workers/sheetReader.worker.ts", import.meta.url),
    { type: "module" }
  );
  let sources: Map<number, PageSources> = new Map();
  let total: number | null = null;
  let read = 0;
  let stopped = false;
  let chain: Promise<void> = Promise.resolve();

  const stop = () => {
    stopped = true;
    worker.terminate();
  };
  const fail = (message: string) => {
    if (stopped) return;
    stop();
    console.warn("[sheets] reading sheet numbers stopped:", message);
    onProgress({ state: "failed", message });
  };
  /** Queue a send behind every earlier one. */
  const queue = (pages: unknown[], after?: () => void) => {
    chain = chain.then(async () => {
      if (stopped || pages.length === 0) return;
      try {
        // The server takes at most 100 pages a call; a title batch for a
        // 500-sheet set is one entry per sheet.
        for (let i = 0; i < pages.length; i += 100) {
          if (stopped) return;
          await send(pages.slice(i, i + 100));
        }
        after?.();
        onBatchSaved();
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    });
  };

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    // pdfjs posts its own handshake from the nested worker; not ours.
    if (!msg || typeof msg.type !== "string" || stopped) return;
    switch (msg.type) {
      case "started":
        total = msg.pageCount;
        onProgress({ state: "reading", read: 0, total });
        return;
      case "sources":
        sources = sourcesByPage(msg.labels, msg.bookmarks);
        return;
      case "pages": {
        const batch = pageBatch(msg.pages, sources);
        queue(batch, () => {
          read += batch.length;
          onProgress({ state: "reading", read, total });
        });
        return;
      }
      case "titles":
        queue(titleBatch(msg.titles, sources));
        return;
      case "done":
        chain = chain.then(() => {
          if (stopped) return;
          stop();
          onProgress({ state: "done", read, total: total ?? read });
        });
        return;
      case "error":
        fail(msg.message);
        return;
    }
  };
  worker.onerror = e => fail(e.message || "The sheet reader could not start.");

  worker.postMessage(
    "file" in source
      ? { type: "read", file: source.file }
      : { type: "read", url: source.url, byteSize: source.byteSize }
  );
  return { cancel: stop };
}
