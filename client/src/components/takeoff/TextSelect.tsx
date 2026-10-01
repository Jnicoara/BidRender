/**
 * "Copy text" — drag a box on the sheet, get the words inside it to copy, and
 * look them up in the catalog in one click.
 *
 * ── Its own tool, and it claims its own drag ─────────────────────────────────
 * A drag on the sheet already means "pan", and with a tool armed it can mean
 * "box a symbol". So this is a separate layer shown only while the tool is
 * picked up, and it calls `stopPropagation` on the pointer down — the same one
 * line SymbolCaptureLayer uses, for the same reason (see the note there): the
 * viewport pans on a plain left-drag, and a React event bubbles to it. The
 * guard is written here rather than argued for in a comment.
 *
 * Right-, middle- and space-drag still pan: the viewport takes those in the
 * capture phase, so they never reach this layer.
 *
 * ── A scan says so, before anyone drags ──────────────────────────────────────
 * The page's text is read when the tool is picked up. A sheet with none is a
 * scanned image, and the bar says that straight away — rather than letting the
 * estimator drag a box and get nothing back with no reason given.
 *
 * ── The text layer can be wrong ──────────────────────────────────────────────
 * An OCR'd scan HAS text, and it can read DUPLEX as "DUEX"
 * (references/plan-viewer-overhaul.md § 13.8). The app cannot reliably tell an
 * OCR layer from real text, so the result always says where it came from and
 * is an editable box: what gets copied is what the estimator can see.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Search, TextSelect as TextSelectIcon, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { crosshairCursorStyle } from "@/lib/crosshairCursor";
import { useCrosshairColor, useCrosshairSize } from "@/hooks/useCrosshairColor";
import {
  hasText,
  wordBoxes,
  wordsInBox,
  wordsToText,
  type PageTextLayer,
  type WordBox,
} from "@/lib/textSelection";
import {
  useMaterialSearch,
  type SearchableCatalogRow,
} from "@/hooks/useMaterialSearch";
import { SearchCorrectionNote } from "@/components/SearchCorrectionNote";

type LayerState =
  | { status: "loading" }
  | { status: "ready"; words: WordBox[] }
  | { status: "scanned" }
  | { status: "failed" };

type CatalogRow = SearchableCatalogRow & { unitOfSale?: string | null };

/** How many catalog matches the result card shows. */
const MATCHES_SHOWN = 5;

export function TextSelectLayer({
  width,
  height,
  renderScale,
  sheetKey,
  loadTextLayer,
  chromeTarget,
  catalog,
  onClose,
}: {
  width: number;
  height: number;
  renderScale: number;
  /** Changes when the sheet does, so its text is read again. */
  sheetKey: string;
  loadTextLayer: () => Promise<PageTextLayer>;
  chromeTarget: HTMLElement | null;
  catalog: CatalogRow[];
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [crosshairColor] = useCrosshairColor();
  const [crosshairSize] = useCrosshairSize();
  const [layer, setLayer] = useState<LayerState>({ status: "loading" });
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  /** The last box dragged, kept on screen with the text it found. */
  const [picked, setPicked] = useState<{
    box: { x: number; y: number; width: number; height: number };
    text: string;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [searching, setSearching] = useState(false);

  // Read the page once per sheet. The loader is a new function every render,
  // so the sheet key — not the function — decides when to read again.
  const loadRef = useRef(loadTextLayer);
  loadRef.current = loadTextLayer;
  useEffect(() => {
    let cancelled = false;
    setLayer({ status: "loading" });
    setPicked(null);
    loadRef
      .current()
      .then(result => {
        if (cancelled) return;
        setLayer(
          hasText(result)
            ? { status: "ready", words: wordBoxes(result) }
            : { status: "scanned" }
        );
      })
      .catch(() => {
        if (!cancelled) setLayer({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [sheetKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Typing in the result box: Escape leaves the box, not the tool.
      const typing =
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement;
      e.preventDefault();
      e.stopPropagation();
      if (typing) (e.target as HTMLElement).blur();
      else if (picked) setPicked(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, picked]);

  const toPage = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : width / rect.width;
    const scaleY = rect.height === 0 ? 1 : height / rect.height;
    return {
      x: ((e.clientX - rect.left) * scaleX) / renderScale,
      y: ((e.clientY - rect.top) * scaleY) / renderScale,
    };
  };

  const dragBox =
    start && current
      ? {
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y),
        }
      : null;
  const shownBox = dragBox ?? picked?.box ?? null;

  const finishDrag = () => {
    if (!dragBox) return;
    setStart(null);
    setCurrent(null);
    // A click, not a drag: nothing to read, and not worth a message.
    if (dragBox.width < 2 && dragBox.height < 2) return;
    const text =
      layer.status === "ready"
        ? wordsToText(wordsInBox(layer.words, dragBox))
        : "";
    setPicked({ box: dragBox, text });
    setDraft(text);
    setSearching(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Copied.");
    } catch {
      // A browser can refuse the clipboard (no secure context, or denied).
      // The text is selected in the box, so a Ctrl+C still works.
      toast.error("The browser would not allow copying — press Ctrl+C.");
    }
  };

  const status = (() => {
    switch (layer.status) {
      case "loading":
        return "Reading this sheet's text…";
      case "scanned":
        return "This sheet is a scanned image — there is no text on it to copy.";
      case "failed":
        return "This sheet's text could not be read.";
      case "ready":
        return "Drag a box around the words you want";
    }
  })();

  const bar = (
    <div className="absolute left-1/2 top-2 -translate-x-1/2 max-w-[calc(100%-1rem)] pointer-events-auto">
      <div
        className="flex items-center gap-2 h-8 pl-2.5 pr-1 rounded-full border border-border bg-card/95 shadow-lg text-xs whitespace-nowrap"
        role="status"
        aria-live="polite"
      >
        <TextSelectIcon className="w-3.5 h-3.5 shrink-0 text-[#F5C518]" />
        <span className="font-medium">Copy text</span>
        <span className="text-muted-foreground">·</span>
        <span
          className={cn(
            "truncate",
            (layer.status === "scanned" || layer.status === "failed") &&
              "text-[#F5C518]"
          )}
        >
          {status}
        </span>
        <span className="text-[0.65rem] text-muted-foreground">Esc</span>
        <button
          type="button"
          className="h-6 w-6 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={onClose}
          aria-label="Put down Copy text"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const card = picked ? (
    <ResultCard
      text={picked.text}
      draft={draft}
      onDraft={setDraft}
      onCopy={() => void copy()}
      searching={searching}
      onSearch={() => setSearching(s => !s)}
      catalog={catalog}
      onDismiss={() => setPicked(null)}
    />
  ) : null;

  const chrome = (
    <>
      {bar}
      {card}
    </>
  );

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 w-full h-full z-10"
        style={crosshairCursorStyle(crosshairColor, crosshairSize)}
        onPointerDown={e => {
          if (e.button !== 0) return;
          // Claims the drag from the viewport's pan. See the header.
          e.stopPropagation();
          const at = toPage(e);
          if (!at) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* the drag still works, it just stops at the edge */
          }
          setStart(at);
          setCurrent(at);
        }}
        onPointerMove={e => {
          if (start) setCurrent(toPage(e));
        }}
        onPointerUp={finishDrag}
      >
        {shownBox && shownBox.width > 0 && shownBox.height > 0 && (
          <rect
            x={shownBox.x * renderScale}
            y={shownBox.y * renderScale}
            width={shownBox.width * renderScale}
            height={shownBox.height * renderScale}
            fill="#F5C518"
            fillOpacity={0.12}
            stroke="#F5C518"
            strokeWidth={2}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {chromeTarget ? createPortal(chrome, chromeTarget) : chrome}
    </>
  );
}

function ResultCard({
  text,
  draft,
  onDraft,
  onCopy,
  searching,
  onSearch,
  catalog,
  onDismiss,
}: {
  text: string;
  draft: string;
  onDraft: (value: string) => void;
  onCopy: () => void;
  searching: boolean;
  onSearch: () => void;
  catalog: CatalogRow[];
  onDismiss: () => void;
}) {
  const search = useMaterialSearch(catalog);
  const query = draft.replace(/\s+/g, " ").trim();
  const results = useMemo(
    () => (searching && query ? search(query, MATCHES_SHOWN) : null),
    [searching, query, search]
  );
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // Selected on arrival, so Ctrl+C works even if the clipboard is refused.
  useEffect(() => {
    areaRef.current?.select();
  }, [text]);

  return (
    <div className="absolute left-1/2 top-12 -translate-x-1/2 w-[22rem] max-w-[calc(100%-1rem)] pointer-events-auto rounded-lg border border-border bg-card/95 shadow-xl p-2.5 space-y-2 text-xs">
      {text === "" ? (
        <p className="text-muted-foreground">
          No text inside that box. Try a slightly bigger one — a word is picked
          when its middle is inside.
        </p>
      ) : (
        <>
          <textarea
            ref={areaRef}
            value={draft}
            onChange={e => onDraft(e.target.value)}
            rows={Math.min(6, Math.max(2, draft.split("\n").length))}
            className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
            aria-label="Text from the sheet"
          />
          <p className="text-[0.7rem] text-muted-foreground">
            Read from the sheet&apos;s text layer. Check it against the drawing.
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={onCopy}
              disabled={draft.trim() === ""}
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn("h-7 gap-1.5 text-xs", searching && "bg-muted")}
              onClick={onSearch}
              disabled={query === ""}
              aria-pressed={searching}
            >
              <Search className="w-3.5 h-3.5" /> Search catalog
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 ml-auto text-xs text-muted-foreground"
              onClick={onDismiss}
            >
              Done
            </Button>
          </div>
        </>
      )}
      {results && (
        <div className="border-t border-border pt-2 space-y-1">
          <SearchCorrectionNote correctedQuery={results.correctedQuery} />
          {results.rows.length === 0 ? (
            <p className="text-muted-foreground">
              Nothing in the catalog matches “{query}”.
            </p>
          ) : (
            <ul className="space-y-0.5" aria-label="Catalog matches">
              {results.rows.map(row => (
                <li key={row.id} className="flex items-baseline gap-2">
                  <span className="flex-1 min-w-0 truncate" title={row.name}>
                    {row.name}
                  </span>
                  {row.category && (
                    <span className="text-[0.65rem] text-muted-foreground shrink-0">
                      {row.category}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
