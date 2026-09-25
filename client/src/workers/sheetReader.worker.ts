/**
 * Sheet reader — reads every page of a plan ONCE, for its sheet number, title
 * and text. references/plan-viewer-overhaul.md § 17.4, viewer piece 2.
 *
 * ── Its own worker, not a message on the renderer ────────────────────────────
 * Reading 500 pages is about a minute of work (measured: 56s, median 52ms a
 * page). On the renderer's single queue it would sit in front of the sharp
 * patch for the sheet being read, and the drawing would go soft for a minute
 * after every upload.
 *
 * ── From the uploader's own disk ─────────────────────────────────────────────
 * Given a `File`, pdf.js reads it through a byte-range transport over
 * `File.slice`, so nothing crosses the network and a 2GB set never has to be
 * held whole in memory. Reading every page's text touches nearly every byte of
 * the file (263.6MB of 270.4MB, measured), which is why this happens at upload,
 * where the bytes are local, and not in the viewer.
 *
 * Given a `url` instead — a plan attached before this existed — it reads over
 * byte ranges from storage, which for a whole-set read is effectively the
 * whole download. The client says so before starting one.
 *
 * Protocol:
 *   Main → Worker:  { type: 'read', file: File } | { type: 'read', url, byteSize }
 *   Worker → Main:  { type: 'started', pageCount }
 *                   { type: 'sources', labels: string[] | null,
 *                     bookmarks: { pageNumber, title }[] }
 *                   { type: 'pages', pages: ReadPage[] }        (in batches)
 *                   { type: 'titles', titles: (string | null)[] } (index = page - 1)
 *                   { type: 'done' } | { type: 'error', message }
 */
import * as pdfjs from "pdfjs-dist";
import {
  pdfRangeLoadOptions,
  PDF_RANGE_CHUNK_BYTES,
} from "@shared/pdfRangeLoading";
import {
  joinPageText,
  positionedItems,
  type PdfTextItem,
} from "@shared/sheetPageText";
import {
  readTitleBlockPage,
  readTitleBlockTitles,
  type TitleBlockPage,
} from "@shared/sheetTitleBlock";

// A real worker entry, as in pdfRenderer.worker.ts — pdfjs 5 refuses an empty
// workerSrc even from inside a worker.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/** How many pages go to the main thread at once. */
const BATCH = 25;

export type ReadPage = {
  pageNumber: number;
  text: string;
  hasTextLayer: boolean;
  /** A CONFIDENT number off the title block, or null. */
  titleBlockNumber: string | null;
};

/**
 * pdf.js reading a local file a piece at a time. `File.slice` is a view, not a
 * copy, so only the ranges pdf.js asks for are ever read into memory.
 */
class FileRangeTransport extends pdfjs.PDFDataRangeTransport {
  constructor(
    private readonly file: File,
    initial: Uint8Array
  ) {
    super(file.size, initial);
  }
  requestDataRange(begin: number, end: number) {
    void this.file
      .slice(begin, end)
      .arrayBuffer()
      .then(buffer => this.onDataRange(begin, new Uint8Array(buffer)));
  }
}

async function open(msg: {
  file?: File;
  url?: string;
  byteSize?: number | null;
}) {
  // No fonts are drawn here, so the page must not be asked to load any.
  const safe = { disableFontFace: true, verbosity: 0 } as const;
  if (msg.file) {
    const first = new Uint8Array(
      await msg.file
        .slice(0, Math.min(PDF_RANGE_CHUNK_BYTES, msg.file.size))
        .arrayBuffer()
    );
    return pdfjs.getDocument({
      range: new FileRangeTransport(msg.file, first),
      rangeChunkSize: PDF_RANGE_CHUNK_BYTES,
      disableAutoFetch: true,
      disableStream: true,
      ...safe,
    }).promise;
  }
  return pdfjs.getDocument({
    ...pdfRangeLoadOptions(msg.url!, msg.byteSize ?? null, self.location.href),
    ...safe,
  }).promise;
}

/** Every bookmark that resolves to a page, in outline order. */
async function bookmarksOf(doc: pdfjs.PDFDocumentProxy) {
  const out: { pageNumber: number; title: string }[] = [];
  const walk = async (items: any[] | null) => {
    if (!items) return;
    for (const item of items) {
      try {
        const dest =
          typeof item.dest === "string"
            ? await doc.getDestination(item.dest)
            : item.dest;
        if (Array.isArray(dest) && dest[0]) {
          const title = String(item.title ?? "").trim();
          if (title)
            out.push({
              pageNumber: (await doc.getPageIndex(dest[0])) + 1,
              title,
            });
        }
      } catch {
        // One unresolvable bookmark must not cost the rest.
      }
      await walk(item.items ?? null);
    }
  };
  await walk(await doc.getOutline().catch(() => null));
  return out;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "read") {
    self.postMessage({
      type: "error",
      message: `sheetReader.worker has no handler for "${msg?.type}"`,
    });
    return;
  }

  try {
    const doc = await open(msg);
    self.postMessage({ type: "started", pageCount: doc.numPages });

    self.postMessage({
      type: "sources",
      labels: await doc.getPageLabels().catch(() => null),
      bookmarks: await bookmarksOf(doc),
    });

    // Titles need every page first — the project name is told apart from a
    // title by repeating on every sheet — so the corners are kept until the end.
    const corners: TitleBlockPage[] = [];
    let batch: ReadPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      let read: ReadPage = {
        pageNumber,
        text: "",
        hasTextLayer: false,
        titleBlockNumber: null,
      };
      let corner: TitleBlockPage = {
        number: null,
        numberLine: null,
        zone: [],
        strip: [],
        height: 1,
      };
      try {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        // Marked-content markers carry no text; only the text items matter.
        const items = (await page.getTextContent()).items.filter(
          item => "str" in item
        ) as PdfTextItem[];
        const text = joinPageText(items);
        corner = readTitleBlockPage({
          width: viewport.width,
          height: viewport.height,
          items: positionedItems(items, viewport, page.rotate),
        });
        read = {
          pageNumber,
          text,
          hasTextLayer: text.trim().length > 0,
          titleBlockNumber: corner.number,
        };
        page.cleanup();
      } catch {
        // A page that will not give up its text is recorded as having none,
        // which is also what a scan looks like. Never a reason to stop.
      }
      corners.push(corner);
      batch.push(read);
      if (batch.length >= BATCH) {
        self.postMessage({ type: "pages", pages: batch });
        batch = [];
      }
    }
    if (batch.length > 0) self.postMessage({ type: "pages", pages: batch });

    self.postMessage({ type: "titles", titles: readTitleBlockTitles(corners) });
    self.postMessage({ type: "done" });
    await doc.destroy();
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
};
