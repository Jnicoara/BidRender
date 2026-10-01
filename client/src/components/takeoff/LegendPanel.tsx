/**
 * LegendPanel — symbols captured off a legend, and what each one means.
 *
 * ── Click counts — linking is optional, and later ───────────────────────────
 * Box a symbol on the legend, name it, and it lands here. Clicking it starts
 * counting at once. A LINKED symbol counts its assembly; an UNLINKED one counts
 * a plain count under the symbol's name — no price, no parts, and nothing
 * asked first (legend plan § 8a).
 *
 * **Until 2026-09-30 the first click on an unlinked symbol asked which
 * assembly it matched, and nothing could be counted until it was answered.**
 * That is the toll gate CLAUDE.md § "As manual or as automated as the user
 * wants" rules out: a lighting fixture a supplier will price as a package has
 * no assembly to choose, and the question blocked the count. The link is now
 * its own control on the row, and a count made either way can be linked
 * later from its card in the counted list — every mark kept.
 *
 * Links are kept per USER rather than per bid, so a symbol linked on one set of
 * plans is already linked on the next. See the schema comment on symbol_links.
 *
 * ── Search is borrowed, not rebuilt ──────────────────────────────────────────
 * Choosing the assembly is AssemblySearchList, the same component a count's
 * "Link assembly" uses, ranked by the same smartSearch as the Assembly
 * Builder. A second search would rank differently and quietly disagree.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Link2,
  Link2Off,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { AssemblySearchList } from "./AssemblySearchList";

export type SymbolEntry = {
  id: number;
  /** The estimator's name — shown everywhere. */
  label: string;
  /**
   * The name it was captured under, when it has been renamed since; else
   * null. Still matched on (shared/takeoffCounts.ts, `SymbolNames`), and
   * lower-cased, because only its key is stored.
   */
  originalName: string | null;
  assemblyId: number | null;
  thumbnail: string | null;
  isLinked: boolean;
};

export type PickableAssembly = { id: number; name: string; category: string };

export function LegendPanel({
  symbols,
  assemblies,
  activeAssemblyId,
  activeSymbolId = null,
  capturing,
  onStartCapture,
  onCancelCapture,
  onLink,
  onUnlink,
  renameRefusal,
  onRename,
  onResetName,
  onRemove,
  onUseSymbol,
  onCountSymbol,
}: {
  symbols: SymbolEntry[];
  assemblies: PickableAssembly[];
  /** Which assembly the stamp tool currently holds, so the list can show it. */
  activeAssemblyId: number | null;
  /**
   * The symbol it was picked up from, when it was. Marks that row alone:
   * several symbols can share one assembly, each with its own count.
   */
  activeSymbolId?: number | null;
  /** True while the user is dragging a box over the legend. */
  capturing: boolean;
  onStartCapture: () => void;
  onCancelCapture: () => void;
  onLink: (symbolId: number, assemblyId: number) => void;
  onUnlink: (symbolId: number) => void;
  /**
   * Why a rename cannot happen here (a locked bid), or null. Said when the
   * pencil is pressed, not after the name is typed — a refusal after the
   * typing throws the typing away.
   */
  renameRefusal: string | null;
  onRename: (symbolId: number, label: string) => void;
  onResetName: (symbolId: number) => void;
  onRemove: (symbolId: number) => void;
  /** Load a linked symbol's assembly into the stamp tool. */
  onUseSymbol: (symbol: SymbolEntry) => void;
  /** Count an UNLINKED symbol as a plain count under its own name. */
  onCountSymbol: (symbol: SymbolEntry) => void;
}) {
  /** The symbol whose "which assembly?" question is open. */
  const [linking, setLinking] = useState<SymbolEntry | null>(null);
  /** The symbol whose name is being edited. */
  const [renamingId, setRenamingId] = useState<number | null>(null);

  return (
    <div className="border-t border-border shrink-0">
      <div className="px-3 py-2 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        <BookOpen className="w-3 h-3" /> Legend
        <span className="ml-auto normal-case tracking-normal text-xs">
          {symbols.length}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-5 px-1.5 text-xs", capturing && "text-[#F5C518]")}
          onClick={capturing ? onCancelCapture : onStartCapture}
        >
          {capturing ? (
            "Cancel"
          ) : (
            <>
              <Plus className="w-3 h-3 mr-1" /> Capture
            </>
          )}
        </Button>
      </div>

      {capturing && (
        <p className="px-3 pb-2 text-xs text-[#F5C518]">
          Drag a box around a symbol on the drawing's legend — the crop becomes
          its picture here.
        </p>
      )}

      {/* No scroll box of its own: the panel's tab is the one scroll area
          (track-b-phone-and-readability-plan.md § 1 rule 1). */}
      <div>
        {symbols.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            Capture a symbol from the plan's legend, then click it to start
            counting. Link it to an assembly whenever you like — once linked,
            one click counts that assembly, on this job and every job after it.
          </p>
        ) : (
          symbols.map(symbol => (
            <div
              key={symbol.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-1.5 border-t border-border/50 transition-colors cursor-pointer hover:bg-muted/40",
                (activeSymbolId !== null
                  ? symbol.id === activeSymbolId
                  : symbol.assemblyId !== null &&
                    symbol.assemblyId === activeAssemblyId) && "bg-[#F5C518]/10"
              )}
              title={
                symbol.isLinked
                  ? "Count this assembly"
                  : `Count “${symbol.label}” — no assembly needed`
              }
              onClick={() => {
                // A click inside the name being edited is not a count.
                if (renamingId === symbol.id) return;
                // Either way, straight into the mark tool (§ 8a). Linking is
                // the row's own control, never a gate on counting.
                if (symbol.isLinked) onUseSymbol(symbol);
                else onCountSymbol(symbol);
              }}
            >
              {symbol.thumbnail ? (
                <img
                  src={symbol.thumbnail}
                  alt=""
                  className="w-8 h-8 object-contain rounded bg-white shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-muted shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                {renamingId === symbol.id ? (
                  <SymbolNameEditor
                    symbol={symbol}
                    onSave={label => {
                      setRenamingId(null);
                      if (label !== symbol.label) onRename(symbol.id, label);
                    }}
                    onReset={() => {
                      setRenamingId(null);
                      onResetName(symbol.id);
                    }}
                    onCancel={() => setRenamingId(null)}
                  />
                ) : (
                  <p
                    className="text-xs truncate"
                    title={
                      symbol.originalName
                        ? `Captured as “${symbol.originalName}”`
                        : undefined
                    }
                  >
                    {symbol.label}
                  </p>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {symbol.isLinked ? (
                    <>
                      <Link2 className="w-2.5 h-2.5" />{" "}
                      {assemblies.find(a => a.id === symbol.assemblyId)?.name ??
                        "Linked"}
                    </>
                  ) : (
                    "Counts by name · no assembly"
                  )}
                </p>
              </div>

              {/* Always visible, unlike the hover controls: a phone has no
                  hover, and renaming is something done on a phone too. */}
              {renamingId !== symbol.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={e => {
                    e.stopPropagation();
                    if (renameRefusal) {
                      toast.error(renameRefusal);
                      return;
                    }
                    setLinking(null);
                    setRenamingId(symbol.id);
                  }}
                  title="Rename — the name read off the plan is kept for matching"
                  aria-label={`Rename ${symbol.label}`}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              )}
              {!symbol.isLinked && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={e => {
                    e.stopPropagation();
                    setLinking(linking?.id === symbol.id ? null : symbol);
                  }}
                  title="Link this symbol to an assembly, for this job and every job after it"
                  aria-label={`Link ${symbol.label} to an assembly`}
                >
                  <Link2 className="w-3 h-3 mr-0.5" /> Link
                </Button>
              )}
              {symbol.isLinked && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground"
                  onClick={e => {
                    e.stopPropagation();
                    onUnlink(symbol.id);
                  }}
                  title="Break this link"
                  aria-label={`Unlink ${symbol.label}`}
                >
                  <Link2Off className="w-3 h-3" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={e => {
                  e.stopPropagation();
                  onRemove(symbol.id);
                }}
                aria-label={`Remove ${symbol.label}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Which assembly — asked only when the Link control asks it. */}
      {linking && (
        <div className="border-t border-border p-3 space-y-2 bg-muted/20">
          <p className="text-xs font-medium">
            Which assembly does “{linking.label}” match?
          </p>
          <p className="text-xs text-muted-foreground">
            From then on, clicking this symbol counts that assembly — on this
            job and every job after it, under this symbol&rsquo;s own name. A
            count you already made under its name joins that assembly on the
            next click, every mark kept — unless it is already on the bid.
          </p>
          <AssemblySearchList
            assemblies={assemblies}
            onPick={assembly => {
              onLink(linking.id, assembly.id);
              setLinking(null);
            }}
            onCancel={() => setLinking(null)}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-full text-xs text-muted-foreground"
            onClick={() => setLinking(null)}
          >
            Not now
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The name, being edited in place. Enter or leaving the box saves; Escape
 * puts it back untouched. A blank name is not saved — it reverts — because a
 * symbol nobody can name is one nobody can find again.
 *
 * "Reset" appears only on a renamed symbol and restores the captured name.
 * It says which name it restores, lower-case and all: only the key of the
 * original is stored, so the capitals are gone (flagged for Track A).
 */
function SymbolNameEditor({
  symbol,
  onSave,
  onReset,
  onCancel,
}: {
  symbol: SymbolEntry;
  onSave: (label: string) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(symbol.label);
  // Enter and the blur that follows the box going away must save ONCE.
  const done = useRef(false);
  const box = useRef<HTMLInputElement | null>(null);

  // Opened with the name selected, so typing replaces it. Done here rather
  // than through `autoFocus` + onFocus: a focus() in a window that is not
  // the active one fires no focus event, and the old name stayed unselected.
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);

  const finish = (how: "save" | "cancel") => {
    if (done.current) return;
    done.current = true;
    const trimmed = draft.trim();
    if (how === "cancel" || !trimmed) onCancel();
    else onSave(trimmed);
  };

  return (
    <div onClick={e => e.stopPropagation()}>
      <Input
        ref={box}
        value={draft}
        maxLength={255}
        aria-label={`New name for ${symbol.label}`}
        className="h-6 px-1.5 text-xs"
        onChange={e => setDraft(e.target.value)}
        onFocus={selectOnFocus}
        onBlur={() => finish("save")}
        onKeyDown={e => {
          // The page's own keys (Escape puts a tool down, letters arm
          // shortcuts) must not see typing in a name.
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            finish("save");
          }
          if (e.key === "Escape") {
            e.preventDefault();
            finish("cancel");
          }
        }}
      />
      {symbol.originalName && (
        <button
          type="button"
          className="mt-0.5 flex items-center gap-1 text-[0.7rem] text-muted-foreground hover:text-foreground"
          // Keep the focus in the box, so its blur does not save the draft
          // a moment before the reset replaces it.
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            if (done.current) return;
            done.current = true;
            onReset();
          }}
        >
          <RotateCcw className="w-2.5 h-2.5" /> Reset to original “
          {symbol.originalName}”
        </button>
      )}
    </div>
  );
}
