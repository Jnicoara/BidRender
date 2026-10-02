/**
 * ModifiersPage — job-condition adjustments to labor hours (Library § Modifiers).
 *
 * ── The math is not here ─────────────────────────────────────────────────────
 * Modifiers ADD, they never compound: +12% height and +20% overtime is +32%,
 * not 1.12 × 1.20. This screen does not implement that — the live preview calls
 * applyModifiersToHours from @shared/pricing, the same function that prices a
 * real bid. If the rule ever changes it changes in one place.
 *
 * ── Removal is never destructive from the working list ───────────────────────
 * "Remove" archives. The Archived view can restore, and is the only place that
 * offers Delete Forever, behind an explicit confirmation. Archiving a STARTER
 * modifier forks it first (the shared row cannot be touched), which is why the
 * row id can change under an archive — hence the refetch.
 *
 * ── Responsiveness (CLAUDE.md § Responsiveness) ──────────────────────────────
 * Edits, archives and restores apply optimistically with no spinner. The list
 * is intentionally not paginated: the starter set is five and this is a list a
 * user curates by hand, so it stays small by design.
 */
import { useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { ScopeFilter } from "@/components/library/LibraryControls";
import {
  ArchiveItemDialog,
  type PendingItem,
} from "@/components/library/LibraryRemovalDialogs";
import {
  filterByScope,
  scopeCounts,
  type LibraryScope,
} from "@/lib/libraryScope";
import {
  Archive,
  ArchiveRestore,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
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
import { applyModifiersToHours } from "@shared/pricing";

// ─── Types & helpers ──────────────────────────────────────────────────────────

type Modifier = {
  id: number;
  userId: number | null;
  baselineId: number | null;
  name: string;
  laborAdjustmentPct: string;
  laborAdjustmentPctValue: number;
  status: "active" | "archived" | "deleted";
  archivedAt: Date | string | null;
};

/** Mirrors the router bounds: −100% to +1000%. */
const MIN_PCT = -100;
const MAX_PCT = 1000;

/** Hours used for the "what does this do" preview at the top of the list. */
const PREVIEW_BASE_HOURS = 10;

/** Stored fractional (0.12) ↔ displayed percent (12). */
const toPercent = (fraction: number) => fraction * 100;
const toFraction = (percent: number) => percent / 100;

const formatPct = (fraction: number) => {
  const pct = toPercent(fraction);
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
};

const formatArchivedAt = (value: Modifier["archivedAt"]) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

type Draft = { name: string; percent: string };
const emptyDraft: Draft = { name: "", percent: "" };

function validateDraft(draft: Draft): string | null {
  if (!draft.name.trim()) return "Give the modifier a name.";
  const percent = Number(draft.percent);
  if (draft.percent.trim() === "" || Number.isNaN(percent))
    return "Enter a percentage.";
  if (percent < MIN_PCT)
    return "A modifier cannot remove more than 100% of the labor.";
  if (percent > MAX_PCT) return `Keep the adjustment at or below ${MAX_PCT}%.`;
  return null;
}

// ─── Origin badge ─────────────────────────────────────────────────────────────

function OriginBadge({ modifier }: { modifier: Modifier }) {
  if (modifier.userId === null) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Starter
      </Badge>
    );
  }
  if (modifier.baselineId != null) {
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

// ─── Active row ───────────────────────────────────────────────────────────────

function ModifierRow({
  modifier,
  onSave,
  onRevert,
  onArchive,
}: {
  modifier: Modifier;
  onSave: (id: number, draft: Draft) => void;
  onRevert: (modifier: Modifier) => void;
  onArchive: (modifier: Modifier) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const save = () => {
    const problem = validateDraft(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    onSave(modifier.id, draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border last:border-0 bg-muted/20">
        <Input
          value={draft.name}
          onChange={e => setDraft({ ...draft, name: e.target.value })}
          className="h-8 flex-1 min-w-[12rem] text-sm"
          placeholder="Condition name"
          autoFocus
        />
        <div className="flex items-center gap-1.5">
          <Input
            value={draft.percent}
            onChange={e => setDraft({ ...draft, percent: e.target.value })}
            className="h-8 w-24 text-sm text-right"
            inputMode="decimal"
            onFocus={selectOnFocus}
            placeholder="12"
            aria-label="Labor adjustment percent"
          />
          <span className="text-xs text-muted-foreground">% labor</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={save}>
            <Check className="w-3 h-3" /> Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setEditing(false)}
          >
            <X className="w-3 h-3" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  /*
    PHONES GET CARDS, NOT A TABLE (device audit, 2026-10-01). The action
    buttons grow to 44px for a finger, more than their 6rem column holds,
    which squeezed every name to three letters ("Nig…"). Below `md` the name
    and badge take a full-width first line and may wrap; the percentage and
    the actions share the second, actions pushed right. Every `md:` class
    restores the one-line row, so tablet and laptop are unchanged.
  */
  return (
    <div className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 md:gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group">
      <div className="basis-full md:flex-1 min-w-0">
        <div className="flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-1 md:gap-2">
          <span className="text-sm font-medium min-w-0 break-words md:truncate">
            {modifier.name}
          </span>
          <OriginBadge modifier={modifier} />
        </div>
      </div>

      <span
        className={cn(
          "text-sm font-mono md:w-20 md:text-right shrink-0",
          modifier.laborAdjustmentPctValue < 0
            ? "text-emerald-400"
            : "text-foreground"
        )}
      >
        {formatPct(modifier.laborAdjustmentPctValue)}
      </span>

      <div className="flex items-center gap-0.5 ml-auto md:ml-0 md:w-24 justify-end shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          onClick={() => {
            setDraft({
              name: modifier.name,
              percent: String(toPercent(modifier.laborAdjustmentPctValue)),
            });
            setEditing(true);
          }}
          title={
            modifier.userId === null ? "Edit — creates your own copy" : "Edit"
          }
          aria-label={`Edit ${modifier.name}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>

        {modifier.baselineId != null && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            onClick={() => onRevert(modifier)}
            title="Undo your changes and restore the starter values"
            aria-label={`Revert ${modifier.name}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          onClick={() => onArchive(modifier)}
          title="Move to Archived — you can restore it later"
          aria-label={`Archive ${modifier.name}`}
        >
          <Archive className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Archived row ─────────────────────────────────────────────────────────────

function ArchivedRow({
  modifier,
  onRestore,
  onDeleteForever,
}: {
  modifier: Modifier;
  onRestore: (modifier: Modifier) => void;
  onDeleteForever: (modifier: Modifier) => void;
}) {
  const archivedOn = formatArchivedAt(modifier.archivedAt);

  return (
    // Same phone card as the active row above (device audit, 2026-10-01).
    <div className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 md:gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group">
      <div className="basis-full md:flex-1 min-w-0">
        <span className="text-sm font-medium break-words md:truncate text-muted-foreground">
          {modifier.name}
        </span>
        {archivedOn && (
          <div className="text-xs text-muted-foreground/70 mt-0.5">
            Archived {archivedOn}
          </div>
        )}
      </div>

      <span className="text-sm font-mono md:w-20 md:text-right shrink-0 text-muted-foreground">
        {formatPct(modifier.laborAdjustmentPctValue)}
      </span>

      <div className="flex items-center gap-1 ml-auto md:ml-0 md:w-52 justify-end shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          onClick={() => onRestore(modifier)}
        >
          <ArchiveRestore className="w-3.5 h-3.5" /> Restore
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => onDeleteForever(modifier)}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete Forever
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ModifiersPage() {
  const [view, setView] = useState<"active" | "archived">("active");
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [pendingDelete, setPendingDelete] = useState<Modifier | null>(null);

  const utils = trpc.useUtils();
  const activeQuery = trpc.modifiers.list.useQuery({ status: "active" });
  const archivedQuery = trpc.modifiers.list.useQuery({ status: "archived" });

  const activeAll = (activeQuery.data ?? []) as Modifier[];
  const [scope, setScope] = useState<LibraryScope>("all");
  const [pendingArchive, setPendingArchive] = useState<PendingItem | null>(
    null
  );
  const active = filterByScope(activeAll, scope);
  const archived = (archivedQuery.data ?? []) as Modifier[];

  /** Both lists move together — archiving takes a row from one to the other. */
  const refreshBoth = useCallback(() => {
    void utils.modifiers.list.invalidate();
  }, [utils]);

  const optimisticActive = useCallback(
    async (apply: (rows: Modifier[]) => Modifier[]) => {
      await utils.modifiers.list.cancel({ status: "active" });
      const previous = utils.modifiers.list.getData({ status: "active" });
      utils.modifiers.list.setData(
        { status: "active" },
        old => apply((old ?? []) as Modifier[]) as typeof old
      );
      return { previous };
    },
    [utils]
  );

  const rollbackActive = useCallback(
    (
      context: { previous?: unknown } | undefined,
      error: { message: string }
    ) => {
      if (context?.previous !== undefined) {
        utils.modifiers.list.setData(
          { status: "active" },
          context.previous as never
        );
      }
      toast.error(error.message);
    },
    [utils]
  );

  const updateModifier = trpc.modifiers.update.useMutation({
    onMutate: async vars =>
      optimisticActive(rows =>
        rows.map(row =>
          row.id === vars.id
            ? {
                ...row,
                name: vars.name ?? row.name,
                laborAdjustmentPctValue:
                  vars.laborAdjustmentPct ?? row.laborAdjustmentPctValue,
              }
            : row
        )
      ),
    onError: (error, _vars, context) => rollbackActive(context, error),
    onSuccess: result => {
      if (result?.forked)
        toast.success("Saved as your own copy — the starter is unchanged.");
    },
    onSettled: refreshBoth,
  });

  const createModifier = trpc.modifiers.create.useMutation({
    onError: error => toast.error(error.message),
    onSettled: refreshBoth,
  });

  const revertModifier = trpc.modifiers.revert.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => toast.success("Restored the starter values"),
    onSettled: refreshBoth,
  });

  const archiveModifier = trpc.modifiers.archive.useMutation({
    // Drop it from the active list straight away; the archived list refetches.
    onMutate: async vars =>
      optimisticActive(rows => rows.filter(row => row.id !== vars.id)),
    onError: (error, _vars, context) => rollbackActive(context, error),
    onSettled: refreshBoth,
  });

  const restoreModifier = trpc.modifiers.restore.useMutation({
    onError: error => toast.error(error.message),
    onSettled: refreshBoth,
  });

  const deleteForever = trpc.modifiers.deleteForever.useMutation({
    onError: error => toast.error(error.message),
    onSettled: refreshBoth,
  });

  /**
   * Combined effect of everything currently switched on, through the real
   * pricing function — this is the "they add, not compound" rule made visible.
   */
  const combined = useMemo(() => {
    return applyModifiersToHours(
      PREVIEW_BASE_HOURS,
      active.map(m => ({
        name: m.name,
        laborAdjustmentPct: m.laborAdjustmentPctValue,
      }))
    );
  }, [active]);

  const handleSave = useCallback(
    (id: number, draft: Draft) => {
      updateModifier.mutate({
        id,
        name: draft.name.trim(),
        laborAdjustmentPct: toFraction(Number(draft.percent)),
      });
    },
    [updateModifier]
  );

  const handleCreate = useCallback(() => {
    const problem = validateDraft(newDraft);
    if (problem) {
      toast.error(problem);
      return;
    }
    createModifier.mutate({
      name: newDraft.name.trim(),
      laborAdjustmentPct: toFraction(Number(newDraft.percent)),
    });
    toast.success(`Added "${newDraft.name.trim()}"`);
    setNewDraft(emptyDraft);
    setAdding(false);
  }, [createModifier, newDraft]);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    deleteForever.mutate({ id: pendingDelete.id });
    toast.success(`Deleted "${pendingDelete.name}" permanently`);
    setPendingDelete(null);
  }, [deleteForever, pendingDelete]);

  const isLoading =
    view === "active" ? activeQuery.isLoading : archivedQuery.isLoading;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="page-header border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Modifiers</h1>
            <p className="text-xs text-muted-foreground">
              Job conditions that change how long the work takes. Starter
              percentages are placeholders — tune them to your own crews.
            </p>
          </div>
          {view === "active" && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => setAdding(v => !v)}
            >
              <Plus className="w-3.5 h-3.5" /> Add modifier
            </Button>
          )}
        </div>

        {/* Which library section, then which list within it — outermost
            grouping first, so the two strips read as a hierarchy rather than
            as two rows of similar-looking buttons. */}
        <div className="mt-3">
          <LibraryTabs group="assemblies" current="modifiers" />
        </div>

        {/* View switch */}
        <div className="flex items-center gap-1">
          {(["active", "archived"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setView(tab)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize",
                view === tab
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {tab}
              <span className="ml-1.5 text-muted-foreground/70">
                {tab === "active" ? active.length : archived.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {view === "active" && (
          <>
            {/* Combined effect — the additive rule, shown rather than described */}
            {active.length > 0 && (
              <div className="rounded-xl border border-border bg-card px-4 py-3 mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs text-muted-foreground">
                  All {active.length} together on a {PREVIEW_BASE_HOURS}-hour
                  task:
                </span>
                <span className="text-sm font-mono text-[#F5C518]">
                  {PREVIEW_BASE_HOURS} h →{" "}
                  {Math.round(combined.hours * 100) / 100} h
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  ({formatPct(combined.modifierPct)})
                </span>
                <span className="text-xs text-muted-foreground/70 ml-auto">
                  Percentages add — they never compound.
                </span>
              </div>
            )}

            {adding && (
              <div className="rounded-xl border border-border bg-card px-4 py-3 mb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={newDraft.name}
                    onChange={e =>
                      setNewDraft({ ...newDraft, name: e.target.value })
                    }
                    className="h-8 flex-1 min-w-[12rem] text-sm"
                    placeholder="Condition name — e.g. Confined space"
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={newDraft.percent}
                      onChange={e =>
                        setNewDraft({ ...newDraft, percent: e.target.value })
                      }
                      className="h-8 w-24 text-sm text-right"
                      inputMode="decimal"
                      onFocus={selectOnFocus}
                      placeholder="12"
                      aria-label="Labor adjustment percent"
                    />
                    <span className="text-xs text-muted-foreground">
                      % labor
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleCreate}
                  >
                    <Check className="w-3 h-3" /> Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => {
                      setAdding(false);
                      setNewDraft(emptyDraft);
                    }}
                  >
                    <X className="w-3 h-3" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Column heads only from `md` up — phones get cards (see ModifierRow). */}
        <div className="rounded-xl border border-border bg-card overflow-hidden min-w-0">
          <div className="hidden md:flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            <span className="flex-1">Condition</span>
            <span className="w-20 text-right shrink-0">Labor</span>
            <span
              className={cn("shrink-0", view === "active" ? "w-24" : "w-52")}
            />
          </div>

          {isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading modifiers…
            </div>
          ) : view === "active" ? (
            active.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No modifiers in the working list. Add one, or restore something
                from Archived.
              </div>
            ) : (
              active.map(modifier => (
                <ModifierRow
                  key={modifier.id}
                  modifier={modifier}
                  onSave={handleSave}
                  onRevert={m => revertModifier.mutate({ id: m.id })}
                  onArchive={m => setPendingArchive({ id: m.id, name: m.name })}
                />
              ))
            )
          ) : archived.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing archived. Removing a modifier from the working list puts
              it here.
            </div>
          ) : (
            archived.map(modifier => (
              <ArchivedRow
                key={modifier.id}
                modifier={modifier}
                onRestore={m => restoreModifier.mutate({ id: m.id })}
                onDeleteForever={setPendingDelete}
              />
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {view === "active"
            ? "Removing a modifier archives it rather than deleting it — nothing is lost, and you can restore it from the Archived tab."
            : "Restoring puts a modifier back in the working list. Deleting forever cannot be undone."}
        </p>
      </div>

      {/* Delete Forever — the only destructive action, and it says so */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={open => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{pendingDelete?.name}” forever?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the modifier. It will not appear in the
              Archived list and <strong>cannot be undone</strong>. Bids that
              already used it keep the hours they were priced with.
              <br />
              <br />
              If you only want it out of the way, Restore it and archive it
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
