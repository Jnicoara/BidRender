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
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BookOpen, Link2, Link2Off, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssemblySearchList } from "./AssemblySearchList";

export type SymbolEntry = {
  id: number;
  label: string;
  assemblyId: number | null;
  thumbnail: string | null;
  isLinked: boolean;
};

export type PickableAssembly = { id: number; name: string; category: string };

export function LegendPanel({
  symbols,
  assemblies,
  activeAssemblyId,
  capturing,
  onStartCapture,
  onCancelCapture,
  onLink,
  onUnlink,
  onRemove,
  onUseSymbol,
  onCountSymbol,
}: {
  symbols: SymbolEntry[];
  assemblies: PickableAssembly[];
  /** Which assembly the stamp tool currently holds, so the list can show it. */
  activeAssemblyId: number | null;
  /** True while the user is dragging a box over the legend. */
  capturing: boolean;
  onStartCapture: () => void;
  onCancelCapture: () => void;
  onLink: (symbolId: number, assemblyId: number) => void;
  onUnlink: (symbolId: number) => void;
  onRemove: (symbolId: number) => void;
  /** Load a linked symbol's assembly into the stamp tool. */
  onUseSymbol: (symbol: SymbolEntry) => void;
  /** Count an UNLINKED symbol as a plain count under its own name. */
  onCountSymbol: (symbol: SymbolEntry) => void;
}) {
  /** The symbol whose "which assembly?" question is open. */
  const [linking, setLinking] = useState<SymbolEntry | null>(null);

  return (
    <div className="border-t border-border shrink-0">
      <div className="px-3 py-2 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        <BookOpen className="w-3 h-3" /> Legend
        <span className="ml-auto normal-case tracking-normal">
          {symbols.length}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-5 px-1.5 text-[0.7rem]",
            capturing && "text-[#F5C518]"
          )}
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
        <p className="px-3 pb-2 text-[0.7rem] text-[#F5C518]">
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
                symbol.assemblyId !== null &&
                  symbol.assemblyId === activeAssemblyId &&
                  "bg-[#F5C518]/10"
              )}
              title={
                symbol.isLinked
                  ? "Count this assembly"
                  : `Count “${symbol.label}” — no assembly needed`
              }
              onClick={() => {
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
                <p className="text-xs truncate">{symbol.label}</p>
                <p className="text-[0.7rem] text-muted-foreground flex items-center gap-1">
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

              {!symbol.isLinked && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 px-1.5 shrink-0 text-[0.7rem] text-muted-foreground hover:text-foreground"
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
          <p className="text-[0.7rem] text-muted-foreground">
            From then on, clicking this symbol counts that assembly — on this
            job and every job after it. A count you already made by name stays
            as it is; link it from its card.
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
