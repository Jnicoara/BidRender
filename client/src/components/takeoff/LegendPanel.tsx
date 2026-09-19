/**
 * LegendPanel — symbols captured off a legend, and what each one means.
 *
 * ── The one-time question ────────────────────────────────────────────────────
 * Box a symbol on the legend, name it, and it lands here. The first click on an
 * unlinked symbol asks which assembly it matches; every click after that loads
 * that assembly straight into the stamp tool. That is the whole point — the
 * second job costs nothing to interpret.
 *
 * Links are kept per USER rather than per bid, so a symbol linked on one set of
 * plans is already linked on the next. See the schema comment on symbol_links.
 *
 * ── Search is borrowed, not rebuilt ──────────────────────────────────────────
 * Choosing the assembly uses the same smartSearch ranking the Assembly Builder
 * uses, over the same assemblies list. A second search implementation would
 * rank differently and quietly disagree with the rest of the app.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Check,
  Link2,
  Link2Off,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { smartSearch } from "@/lib/smartSearch";

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
}) {
  /** The symbol awaiting its one-time "which assembly?" answer. */
  const [linking, setLinking] = useState<SymbolEntry | null>(null);
  const [query, setQuery] = useState("");

  const searchable = useMemo(
    () =>
      assemblies.map(a => ({
        id: String(a.id),
        description: a.name,
        category: a.category,
      })),
    [assemblies]
  );

  const results = useMemo(() => {
    if (!query.trim()) return assemblies.slice(0, 8);
    const hits = smartSearch(searchable, query, 8);
    const byId = new Map(assemblies.map(a => [a.id, a]));
    return hits
      .map(hit => byId.get(Number(hit.id)))
      .filter((a): a is PickableAssembly => Boolean(a));
  }, [query, searchable, assemblies]);

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

      <div className="max-h-52 overflow-y-auto">
        {symbols.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            Capture a symbol from the plan's legend and link it to an assembly.
            Once linked, one click loads it into the mark tool — on this job and
            every job after it.
          </p>
        ) : (
          symbols.map(symbol => (
            <div
              key={symbol.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-1.5 border-t border-border/50 transition-colors",
                symbol.isLinked
                  ? "cursor-pointer hover:bg-muted/40"
                  : "bg-[#F5C518]/5",
                symbol.assemblyId !== null &&
                  symbol.assemblyId === activeAssemblyId &&
                  "bg-[#F5C518]/10"
              )}
              onClick={() => {
                // Linked: straight into the stamp tool. Unlinked: the one-time
                // question, asked once and never again for this symbol.
                if (symbol.isLinked) onUseSymbol(symbol);
                else {
                  setLinking(symbol);
                  setQuery("");
                }
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
                    <span className="text-[#F5C518]">
                      Not linked — click to choose
                    </span>
                  )}
                </p>
              </div>

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

      {/* The one-time question. Uses the Assembly Builder's own search. */}
      {linking && (
        <div className="border-t border-border p-3 space-y-2 bg-muted/20">
          <p className="text-xs font-medium">
            Which assembly does “{linking.label}” match?
          </p>
          <p className="text-[0.7rem] text-muted-foreground">
            Asked once. From then on, clicking this symbol loads that assembly
            straight into the mark tool — on this job and every job after it.
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") setLinking(null);
              }}
              placeholder="Search assemblies…"
              className="h-7 pl-7 text-xs"
              autoFocus
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {results.map(assembly => (
              <button
                key={assembly.id}
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-2"
                onClick={() => {
                  onLink(linking.id, assembly.id);
                  setLinking(null);
                }}
              >
                <Check className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate">{assembly.name}</span>
                <span className="text-[0.7rem] text-muted-foreground">
                  {assembly.category}
                </span>
              </button>
            ))}
            {results.length === 0 && (
              <p className="text-[0.7rem] text-muted-foreground px-2 py-2">
                Nothing matches “{query}”.
              </p>
            )}
          </div>
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
