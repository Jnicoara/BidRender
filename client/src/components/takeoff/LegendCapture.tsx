/**
 * "Capture whole legend" — box the legend once, get every symbol.
 *
 * The reading is `readLegend` (client/src/lib/legendRead.ts): names from the
 * PDF's own text, each symbol from the drawing just left of its name, and each
 * name lined up with the user's assemblies. No AI. This file only does what a
 * test cannot: render the box, sample its pixels, cut the pictures, and show
 * the list.
 *
 * ── One render for the whole box ─────────────────────────────────────────────
 * The box is drawn ONCE from the PDF, at 400 px per inch or what fits 16 MP
 * (`legendRenderScale`), and both the ink map and every picture come from that
 * one image. Rendering each symbol separately would redraw the page once per
 * symbol. Pictures are encoded by `encodeCapture`, the same as single Capture.
 *
 * ── What it will not do ──────────────────────────────────────────────────────
 * It never saves over a symbol already captured: those rows are shown, say so,
 * and cannot be ticked. Saving goes through the same `captureSymbol` as single
 * Capture, which never replaces a stored link or picture either. It touches no
 * count and no mark.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { readLegend, type Rect } from "@/lib/legendRead";
import { inkBoundsFrom, inkMapFromPixels, ruleFrom } from "@/lib/legendInkMap";
import type { PageTextLayer } from "@/lib/textSelection";
import { legendRenderScale, normaliseCaptureBox } from "@shared/symbolCapture";
import { symbolLookupKey } from "@shared/takeoffCounts";
import { encodeCapture } from "./SymbolCapture";

/** Draws a page region from the PDF and says what it actually drew. */
export type LegendRenderer = (
  rect: Rect,
  scale: number
) => Promise<{ bitmap: ImageBitmap; scale: number; rect: Rect }>;

export type LegendDraftRow = {
  read: string;
  /** The library's spelling when one matched, else the words as read. */
  name: string;
  match: "exact" | "words" | "none";
  picture: string | null;
  alreadyCaptured: boolean;
  ticked: boolean;
};

export type WholeLegend =
  | { kind: "rows"; rows: LegendDraftRow[] }
  | { kind: "no-text" }
  | { kind: "unreadable" }
  | { kind: "no-rows" };

export async function readWholeLegend(opts: {
  box: Rect;
  renderRegion: LegendRenderer;
  loadTextLayer: () => Promise<PageTextLayer>;
  library: readonly string[];
  captured: readonly string[];
}): Promise<WholeLegend> {
  const box = normaliseCaptureBox(opts.box);
  const layer = await opts.loadTextLayer();
  const scale = legendRenderScale(box);
  if (!(scale > 0)) return { kind: "no-rows" };

  const { bitmap, scale: drawn, rect } = await opts.renderRegion(box, scale);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { kind: "no-rows" };
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const map = inkMapFromPixels(
      pixels,
      canvas.width,
      canvas.height,
      { x: rect.x, y: rect.y },
      drawn
    );

    const reading = readLegend({
      layer,
      box,
      ink: inkBoundsFrom(map),
      rule: ruleFrom(map),
      library: opts.library,
      captured: opts.captured,
    });
    if (reading.kind !== "rows") return reading;

    const rows = reading.rows.map(row => ({
      read: row.read,
      name: row.name,
      match: row.match,
      alreadyCaptured: row.alreadyCaptured,
      ticked: row.ticked,
      picture: encodeCapture(
        canvas,
        (row.symbol.x - rect.x) * drawn,
        (row.symbol.y - rect.y) * drawn,
        row.symbol.width * drawn,
        row.symbol.height * drawn
      ),
    }));
    return { kind: "rows", rows };
  } finally {
    bitmap.close();
  }
}

type Draft = LegendDraftRow & { draft: string };

/**
 * The list: picture, name, tick. Rows that line up with an assembly come
 * first and ticked; the rest sit behind ONE "show" control (CLAUDE.md,
 * "Customization available, but never in the way").
 */
export function LegendCaptureForm({
  state,
  library,
  captured,
  chromeTarget,
  saving,
  onSave,
  onCancel,
}: {
  /** null while the legend is still being read. */
  state: WholeLegend | null;
  library: readonly string[];
  captured: readonly string[];
  chromeTarget: HTMLElement | null;
  /** "Saving 3 of 47" while saving, else null. */
  saving: string | null;
  onSave: (rows: { name: string; picture: string | null }[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Draft[]>([]);
  const [showRest, setShowRest] = useState(false);

  useEffect(() => {
    setRows(
      state?.kind === "rows"
        ? state.rows.map(r => ({ ...r, draft: r.name }))
        : []
    );
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, saving]);

  const libraryKeys = useMemo(
    () => new Set(library.map(symbolLookupKey)),
    [library]
  );
  const capturedKeys = useMemo(
    () => new Set(captured.map(symbolLookupKey)),
    [captured]
  );
  /** What a row would collide with if saved under its current name. */
  const statusOf = (r: Draft) => {
    const key = symbolLookupKey(r.draft);
    if (!key) return { text: "Needs a name", tone: "warn" as const };
    if (capturedKeys.has(key)) {
      return {
        text: "Already in your legend — left as it is",
        tone: "muted" as const,
      };
    }
    if (libraryKeys.has(key)) {
      return {
        text:
          r.draft === r.name && r.match === "words"
            ? `Matches your assembly · read as “${clip(r.read)}”`
            : "Matches your assembly",
        tone: "ok" as const,
      };
    }
    return {
      text: `Not in your library · read as “${clip(r.read)}”`,
      tone: "warn" as const,
    };
  };
  const blocked = (r: Draft) =>
    !symbolLookupKey(r.draft) || capturedKeys.has(symbolLookupKey(r.draft));

  const shown = rows.filter(r => r.match !== "none" || r.alreadyCaptured);
  const rest = rows.filter(r => r.match === "none" && !r.alreadyCaptured);
  const toSave = rows.filter(r => r.ticked && !blocked(r));

  const update = (i: number, patch: Partial<Draft>) =>
    setRows(all => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const rowView = (r: Draft) => {
    const i = rows.indexOf(r);
    const status = statusOf(r);
    const off = blocked(r);
    return (
      <div
        key={i}
        className="flex items-start gap-2 px-3 py-1.5 border-t border-border/50"
      >
        <input
          type="checkbox"
          className="mt-3 h-3.5 w-3.5 shrink-0 accent-[#F5C518]"
          checked={r.ticked && !off}
          disabled={off || Boolean(saving)}
          onChange={e => update(i, { ticked: e.target.checked })}
          aria-label={`Save ${r.draft}`}
        />
        {r.picture ? (
          <img
            src={r.picture}
            alt=""
            className="w-10 h-10 object-contain rounded bg-white shrink-0 border border-border"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-muted shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <Input
            value={r.draft}
            list="legend-capture-library"
            onChange={e => update(i, { draft: e.target.value })}
            onFocus={selectOnFocus}
            disabled={Boolean(saving)}
            className="h-7 text-xs"
            aria-label="Symbol name"
          />
          <p
            className={
              "text-[0.7rem] mt-0.5 truncate " +
              (status.tone === "ok"
                ? "text-muted-foreground"
                : status.tone === "warn"
                  ? "text-[#F5C518]"
                  : "text-muted-foreground italic")
            }
            title={r.read}
          >
            {status.text}
          </p>
        </div>
      </div>
    );
  };

  let body: React.ReactNode;
  if (state === null) {
    body = (
      <p className="px-3 py-4 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the legend…
      </p>
    );
  } else if (state.kind === "no-text" || state.kind === "unreadable") {
    // One message for both: a scanned legend with no text, and one whose
    // scanned text is too garbled to trust. Nothing is listed — no partial
    // or guessed names (owner, 2026-09-30).
    body = (
      <p className="px-3 py-3 text-xs" role="status">
        This legend can't be read — it is a scanned picture, so the symbol names
        are not in the drawing as text. Capture the symbols by hand: press{" "}
        <span className="font-medium">+ Capture</span> and box them one at a
        time.
      </p>
    );
  } else if (state.kind === "no-rows") {
    body = (
      <p className="px-3 py-3 text-xs" role="status">
        No symbols with names beside them were found in that box. Draw the box
        around the legend's symbols and their descriptions, or use{" "}
        <span className="font-medium">+ Capture</span> for one symbol at a time.
      </p>
    );
  } else {
    body = (
      <>
        <div className="flex-1 min-h-0 overflow-y-auto border-b border-border/50">
          {shown.map(rowView)}
          {rest.length > 0 && (
            <>
              <button
                className="w-full text-left px-3 py-1.5 border-t border-border/50 text-[0.7rem] text-muted-foreground hover:bg-muted/40"
                onClick={() => setShowRest(v => !v)}
              >
                {showRest ? "Hide" : "Show"} {rest.length} row
                {rest.length === 1 ? "" : "s"} not in your library
              </button>
              {showRest && rest.map(rowView)}
            </>
          )}
        </div>
      </>
    );
  }

  const card = (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[26rem] max-w-[calc(100%-1rem)] max-h-[calc(100%-1.5rem)] flex flex-col pointer-events-auto rounded-xl border border-border bg-card/98 shadow-xl">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <p className="text-sm font-medium">
          {state?.kind === "rows"
            ? `Legend — ${state.rows.length} symbol${state.rows.length === 1 ? "" : "s"} found`
            : "Capture whole legend"}
        </p>
        {state?.kind === "rows" && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Ticked rows match your assemblies by name. Untick what you do not
            need, fix a name if it is wrong, then save.
          </p>
        )}
      </div>
      {body}
      <datalist id="legend-capture-library">
        {library.map(n => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="flex items-center gap-1.5 p-3 shrink-0">
        {state?.kind === "rows" && (
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs flex-1"
            disabled={toSave.length === 0 || Boolean(saving)}
            onClick={() =>
              onSave(
                toSave.map(r => ({ name: r.draft.trim(), picture: r.picture }))
              )
            }
          >
            <Check className="w-3 h-3" />{" "}
            {saving ??
              `Save ${toSave.length} symbol${toSave.length === 1 ? "" : "s"}`}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          disabled={Boolean(saving)}
          onClick={onCancel}
        >
          <X className="w-3 h-3" />{" "}
          {state?.kind === "rows" ? "Cancel" : "Close"}
        </Button>
      </div>
    </div>
  );

  return chromeTarget ? createPortal(card, chromeTarget) : card;
}

function clip(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}
