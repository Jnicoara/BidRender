/**
 * KitsPage — bundles of assemblies (Library § Kits).
 *
 * A kit is a shortcut: "Bedroom package" saves counting four receptacles, a
 * switch and a light on every bedroom of every job.
 *
 * ── Scope, deliberately narrow ───────────────────────────────────────────────
 *  • Assemblies only, one level deep. No kits inside kits, no raw materials.
 *  • Quantities are typed in from the estimator's own judgement. Nothing here
 *    derives a count from room dimensions or code spacing — that is a separate
 *    and much larger feature, and is not what this screen does.
 *
 * ── No new math ──────────────────────────────────────────────────────────────
 * The cost panel comes from kits.price, which runs each contained assembly
 * through the same calculateLineItem/sumDirectCost a bid rolls up with. A kit
 * total and the same assemblies added to a bid by hand therefore agree.
 *
 * Standing rules: quantities use InlineNumberField (select-on-focus, Enter/blur
 * save, Escape revert, save flash); the list is not paginated because a kit
 * library is hand-curated and stays small.
 */
import { useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import {
  Archive as ArchiveIcon,
  ArrowLeft,
  Check,
  Copy as CopyIcon,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  ScopeFilter,
  ViewTabs,
  type LibraryView,
} from "@/components/library/LibraryControls";
import {
  ArchiveItemDialog,
  DeleteForeverDialog,
  type PendingItem,
} from "@/components/library/LibraryRemovalDialogs";
import {
  filterByScope,
  scopeCounts,
  type LibraryScope,
} from "@/lib/libraryScope";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { smartSearch } from "@/lib/smartSearch";
import { money } from "@/lib/money";

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

type KitItem = {
  assemblyId: number;
  qty: number;
  name: string;
  category: string;
};

function OriginBadge({
  kit,
}: {
  kit: { userId: number | null; baselineId: number | null };
}) {
  if (kit.userId === null) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Starter
      </Badge>
    );
  }
  if (kit.baselineId != null) {
    return (
      <Badge
        variant="outline"
        className="text-xs bg-[#F5C518]/15 text-[#F5C518] border-[#F5C518]/30"
      >
        Your copy
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      Yours
    </Badge>
  );
}

// ─── Kit builder ──────────────────────────────────────────────────────────────

function KitBuilder({
  kitId,
  onBack,
}: {
  kitId: number | null;
  onBack: () => void;
}) {
  const isNew = kitId === null;
  const utils = trpc.useUtils();

  const detailQuery = trpc.kits.get.useQuery(
    { id: kitId ?? 0 },
    { enabled: !isNew }
  );
  const priceQuery = trpc.kits.price.useQuery(
    { id: kitId ?? 0 },
    { enabled: !isNew }
  );
  const { data: assemblies = [] } = trpc.assemblies.list.useQuery();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<KitItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  // Load the saved kit into the draft once, then leave the draft alone.
  const loaded = detailQuery.data;
  if (!isNew && loaded && items === null) {
    setName(loaded.name);
    setDescription(loaded.description ?? "");
    setItems(
      loaded.items.map(i => ({
        assemblyId: i.assemblyId,
        qty: Number(i.qty),
        name: i.name,
        category: i.category,
      }))
    );
  }
  const draftItems = items ?? [];

  const refresh = useCallback(() => {
    void utils.kits.list.invalidate();
    if (kitId !== null) {
      void utils.kits.get.invalidate({ id: kitId });
      void utils.kits.price.invalidate({ id: kitId });
    }
  }, [utils, kitId]);

  const createKit = trpc.kits.create.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      toast.success("Kit created");
      onBack();
    },
    onSettled: refresh,
  });

  const updateKit = trpc.kits.update.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: result => {
      toast.success(
        result?.forked
          ? "Saved as your own copy — the starter is unchanged."
          : "Kit saved"
      );
      onBack();
    },
    onSettled: refresh,
  });

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
    if (!query.trim()) return [];
    const chosen = new Set(draftItems.map(i => i.assemblyId));
    const hits = smartSearch(searchable, query, 8);
    const byId = new Map(assemblies.map(a => [a.id, a]));
    return hits
      .map(hit => byId.get(Number(hit.id)))
      .filter(
        (a): a is NonNullable<typeof a> => Boolean(a) && !chosen.has(a!.id)
      );
  }, [query, searchable, assemblies, draftItems]);

  const addAssembly = (assembly: {
    id: number;
    name: string;
    category: string;
  }) => {
    setItems(current => [
      ...(current ?? []),
      {
        assemblyId: assembly.id,
        qty: 1,
        name: assembly.name,
        category: assembly.category,
      },
    ]);
    setQuery("");
    setHighlight(0);
  };

  const save = () => {
    if (!name.trim()) {
      toast.error("Give the kit a name.");
      return;
    }
    if (draftItems.some(i => !(i.qty >= 0))) {
      toast.error("Every item needs a quantity of 0 or more.");
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      items: draftItems.map(i => ({ assemblyId: i.assemblyId, qty: i.qty })),
    };
    if (isNew) createKit.mutate(payload);
    else updateKit.mutate({ id: kitId!, ...payload });
  };

  const isStarter = loaded?.userId === null;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={onBack}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kits
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {isNew ? "New kit" : name || "Kit"}
            </h1>
            {isStarter && (
              <p className="text-xs text-muted-foreground">
                Starter kit — saving gives you your own copy and leaves the
                original alone.
              </p>
            )}
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={save}>
            <Check className="w-3.5 h-3.5" /> Save kit
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem] max-w-5xl">
          <div className="space-y-4 min-w-0">
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Kit name — e.g. Bedroom package"
                className="h-9 text-sm"
                autoFocus={isNew}
              />
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What this covers (optional)"
                className="h-8 text-sm"
              />
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={query}
                    onChange={e => {
                      setQuery(e.target.value);
                      setHighlight(0);
                    }}
                    onKeyDown={e => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlight(h => Math.min(h + 1, results.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlight(h => Math.max(h - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const chosen = results[highlight];
                        if (chosen) addAssembly(chosen);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setQuery("");
                      }
                    }}
                    placeholder="Add an assembly to this kit…"
                    className="h-8 pl-9 text-sm"
                    aria-label="Search assemblies to add"
                  />
                </div>
                {results.length > 0 && (
                  <div className="mt-2 rounded-lg border border-border overflow-hidden">
                    {results.map((assembly, index) => (
                      <button
                        key={assembly.id}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => addAssembly(assembly)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-b border-border last:border-0",
                          index === highlight
                            ? "bg-[#F5C518]/10"
                            : "hover:bg-muted/40"
                        )}
                      >
                        <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{assembly.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {assembly.category}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {draftItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing in this kit yet. Search above to add assemblies.
                </div>
              ) : (
                draftItems.map((item, index) => (
                  <div
                    key={item.assemblyId}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group"
                  >
                    <span className="flex-1 min-w-0 text-sm truncate">
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {item.category}
                    </span>
                    <Input
                      value={String(item.qty)}
                      onChange={e => {
                        const qty = Number(e.target.value);
                        setItems(current =>
                          (current ?? []).map((it, i) =>
                            i === index
                              ? { ...it, qty: Number.isNaN(qty) ? 0 : qty }
                              : it
                          )
                        );
                      }}
                      className="h-7 w-20 text-sm text-right"
                      inputMode="decimal"
                      onFocus={selectOnFocus}
                      aria-label={`Quantity of ${item.name}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setItems(current =>
                          (current ?? []).filter((_, i) => i !== index)
                        )
                      }
                      aria-label={`Remove ${item.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Quantities are yours to set from experience — nothing here works
              them out from room size or spacing rules.
            </p>
          </div>

          <div className="lg:sticky lg:top-0 h-fit">
            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Kit cost
              </div>
              {isNew ? (
                <p className="text-xs text-muted-foreground">
                  Save the kit to see what it costs.
                </p>
              ) : priceQuery.data ? (
                <>
                  <div className="flex items-baseline justify-between gap-3 py-1">
                    <span className="text-xs text-muted-foreground">
                      Materials
                    </span>
                    <span className="font-mono text-sm">
                      {money(priceQuery.data.totals.materialCost)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-1">
                    <span className="text-xs text-muted-foreground">
                      Labor ({round(priceQuery.data.totals.totalLaborHours, 2)}{" "}
                      h)
                    </span>
                    <span className="font-mono text-sm">
                      {money(priceQuery.data.totals.laborCost)}
                    </span>
                  </div>
                  <div className="border-t border-border my-2" />
                  <div className="flex items-baseline justify-between gap-3 py-1">
                    <span className="text-xs font-medium">Direct cost</span>
                    <span className="font-mono text-sm text-[#F5C518]">
                      {money(priceQuery.data.totals.directCost)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2">
                    Live from today's library. Costs freeze only when the kit is
                    added to a bid.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Pricing…</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

export default function KitsPage() {
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [view, setView] = useState<LibraryView>("active");
  const [scope, setScope] = useState<LibraryScope>("all");
  const [pendingArchive, setPendingArchive] = useState<PendingItem | null>(
    null
  );
  const [pendingDelete, setPendingDelete] = useState<PendingItem | null>(null);

  const utils = trpc.useUtils();
  const { data: kits = [], isLoading } = trpc.kits.list.useQuery({
    status: view,
  });
  const { data: archivedRows = [] } = trpc.kits.list.useQuery({
    status: "archived",
  });

  const refresh = useCallback(() => {
    void utils.kits.list.invalidate();
  }, [utils]);

  // Scope before anything else, so the count on the filter matches what shows.
  const visibleKits = useMemo(() => filterByScope(kits, scope), [kits, scope]);

  const duplicateKit = trpc.kits.duplicate.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: copy => {
      if (!copy) return;
      toast.success(`Created "${copy.name}" — an independent copy.`);
      setOpenId(copy.id);
    },
    onSettled: refresh,
  });

  const revertKit = trpc.kits.revert.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => toast.success("Restored the starter kit"),
    onSettled: refresh,
  });

  const archiveKit = trpc.kits.archive.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () =>
      toast.success("Archived — restore it any time from the Archived tab"),
    onSettled: refresh,
  });

  const restoreKit = trpc.kits.restore.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => toast.success("Back in the working list."),
    onSettled: refresh,
  });

  const deleteKitForever = trpc.kits.deleteForever.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => toast.success("Deleted permanently."),
    onSettled: refresh,
  });

  if (creating)
    return <KitBuilder kitId={null} onBack={() => setCreating(false)} />;
  if (openId !== null)
    return <KitBuilder kitId={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Kits</h1>
            <p className="text-xs text-muted-foreground">
              Bundles of assemblies at set quantities — add a whole room to a
              bid in one go.
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs shrink-0"
            onClick={() => setCreating(true)}
          >
            <Plus className="w-3.5 h-3.5" /> New kit
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <LibraryTabs group="assemblies" current="kits" />
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <ViewTabs
            view={view}
            onChange={setView}
            archivedCount={archivedRows.length}
          />
          <ScopeFilter
            scope={scope}
            onChange={setScope}
            counts={scopeCounts(kits)}
          />
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden max-w-4xl">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            <span className="flex-1">Kit</span>
            <span className="w-24 shrink-0" />
          </div>

          {isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading kits…
            </div>
          ) : visibleKits.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {view === "archived"
                ? "Nothing archived. Removing a kit from the working list puts it here."
                : scope === "mine"
                  ? "You have not created or customised any kits yet."
                  : "No kits yet. Build one to bundle the assemblies you repeat."}
            </div>
          ) : (
            visibleKits.map(kit => (
              <div
                key={kit.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group"
              >
                <button
                  onClick={() => setOpenId(kit.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {kit.name}
                    </span>
                    <OriginBadge kit={kit} />
                  </div>
                  {kit.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {kit.description}
                    </div>
                  )}
                </button>

                <div className="flex items-center gap-0.5 w-24 justify-end shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    onClick={() => setOpenId(kit.id)}
                    aria-label={`Edit ${kit.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    onClick={() =>
                      setDuplicating({ id: kit.id, name: `${kit.name} (copy)` })
                    }
                    title="Duplicate — a separate kit, not linked to this one"
                    aria-label={`Duplicate ${kit.name}`}
                  >
                    <CopyIcon className="w-3.5 h-3.5" />
                  </Button>
                  {kit.baselineId != null && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      onClick={() => revertKit.mutate({ id: kit.id })}
                      title="Undo your changes and restore the starter"
                      aria-label={`Revert ${kit.name}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {view === "archived" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => restoreKit.mutate({ id: kit.id })}
                        aria-label={`Restore ${kit.name}`}
                      >
                        <RotateCcw className="w-3 h-3" /> Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setPendingDelete({ id: kit.id, name: kit.name })
                        }
                        title="Delete permanently — cannot be undone"
                        aria-label={`Delete ${kit.name} forever`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    /* Offered on starters too — archiving one forks it first,
                       so the shared row is untouched. */
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setPendingArchive({ id: kit.id, name: kit.name })
                      }
                      title="Archive — out of the working list, restorable any time"
                      aria-label={`Archive ${kit.name}`}
                    >
                      <ArchiveIcon className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-2 max-w-4xl">
          Adding a kit to a bid drops in its assemblies as ordinary line items,
          each with its costs frozen at that moment and each editable afterwards
          — so one room being different is just an edit to that line.
        </p>
      </div>

      <AlertDialog
        open={duplicating !== null}
        onOpenChange={open => !open && setDuplicating(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate kit</AlertDialogTitle>
            <AlertDialogDescription>
              This makes a separate kit with the same contents. It is not linked
              to the original — editing either one leaves the other alone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={duplicating?.name ?? ""}
            onChange={e =>
              setDuplicating(d => d && { ...d, name: e.target.value })
            }
            onFocus={selectOnFocus}
            onKeyDown={e => {
              if (e.key !== "Enter" || !duplicating?.name.trim()) return;
              e.preventDefault();
              duplicateKit.mutate({
                id: duplicating.id,
                name: duplicating.name.trim(),
              });
              setDuplicating(null);
            }}
            className="h-9 text-sm"
            aria-label="Name for the duplicate kit"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!duplicating?.name.trim()) {
                  toast.error("Give the copy a name.");
                  return;
                }
                duplicateKit.mutate({
                  id: duplicating.id,
                  name: duplicating.name.trim(),
                });
                setDuplicating(null);
              }}
            >
              Duplicate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ArchiveItemDialog
        pending={pendingArchive}
        noun="kit"
        stillUsedNote="Bids that already used it are untouched — a kit's items land as ordinary line items with their own frozen costs."
        onClose={() => setPendingArchive(null)}
        onConfirm={id => archiveKit.mutate({ id })}
      />
      <DeleteForeverDialog
        pending={pendingDelete}
        noun="kit"
        keepsNote="Bids that already used it keep the line items it produced."
        onClose={() => setPendingDelete(null)}
        onConfirm={id => deleteKitForever.mutate({ id })}
      />
    </div>
  );
}
