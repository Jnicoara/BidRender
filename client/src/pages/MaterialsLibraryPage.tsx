/**
 * MaterialsLibraryPage — the Foundation material catalog (Library § Materials).
 *
 * Distinct from MaterialDatabasePage (/matdb), which is the supply-house price
 * list. This is the catalog assemblies are built from.
 *
 * Fork behaviour is intentionally invisible here: the row is edited by id and
 * the server decides whether that means editing the user's own copy or forking
 * a shipped baseline first. The only UI consequence is the toast that appears
 * the first time a starter material is edited, and the fact that the row's id
 * can change underneath us — hence the refetch after every mutation.
 */
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  Archive as ArchiveIcon,
  Boxes,
  Check,
  CircleDollarSign,
  Clock,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMaterialSearch } from "@/hooks/useMaterialSearch";
import { SearchCorrectionNote } from "@/components/SearchCorrectionNote";
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
import {
  AliasSuggestions,
  type AliasSuggestionResult,
} from "@/components/AliasSuggestions";
import { countNeedingPricing, needsPricing } from "@shared/materialPricing";
import {
  countNeedingLaborUnit,
  needsLaborUnit,
  laborUnitHours,
} from "@shared/materialLabor";
import {
  MATERIAL_CATEGORY_ORDER,
  groupByType,
  groupMaterialsByCategory,
  type MaterialCategoryName,
} from "@shared/materialOrder";
import { useVirtualizer } from "@tanstack/react-virtual";
import { unitCost } from "@/lib/money";
import { materialItemKey } from "@shared/materialMarkup";
import { PercentKindInput } from "@/components/PercentKindInput";

// ─── Types & helpers ──────────────────────────────────────────────────────────

/**
 * Shelves and their order come from @shared/materialOrder, which every screen
 * listing materials imports. This used to be a hand-copied array with a comment
 * asking the next person to keep it in step with the schema — which is how
 * "Panels & Breakers" survived here after the split, and how this screen and
 * Supplier Pricing ended up listing one catalog in two orders.
 */
const CATEGORIES = MATERIAL_CATEGORY_ORDER;

type Category = MaterialCategoryName;

type Material = {
  id: number;
  userId: number | null;
  baselineId: number | null;
  name: string;
  unitOfSale: "each" | "foot" | "box";
  costPerUnit: string;
  /**
   * The default labor unit: hours per unit of sale. NULL is "nobody has said",
   * and is NOT zero — a deliberate 0 means the part adds no time of its own.
   */
  laborHours: string | null;
  category: Category | null;
  /** Space-separated trade slang, fed to smartSearch. Editable inline. */
  searchAliases: string | null;
  /** Shown under the name where two rows could genuinely be confused. */
  description: string | null;
  /** The user's own note of the brand or part number they buy. */
  brandNote: string | null;
};

/**
 * Ask for alias suggestions for a draft. Shared by the add form and the inline
 * editor so both offer the same help, and so neither can throw at the component
 * — `AliasSuggestions` promises its button resolves to a list either way.
 */
type SuggestAliases = (
  name: string,
  category: Category | null,
  existing: string | null
) => Promise<AliasSuggestionResult>;

const UNITS: Material["unitOfSale"][] = ["each", "foot", "box"];

/**
 * Radix Select cannot hold an empty-string value, so "no category" travels
 * through the pickers as this sentinel and is converted at the edges.
 */
const NO_CATEGORY = "__none__";

/** decimal(10,4) — mirrors the bound the router enforces. */
const MAX_COST = 999999.9999;

const UNIT_LABEL: Record<Material["unitOfSale"], string> = {
  each: "each",
  foot: "per ft",
  box: "per box",
};

/**
 * One entry in the flattened, virtualised list — a shelf heading or a material.
 *
 * Headers are list items rather than wrappers so the whole screen is a single
 * indexable sequence; a virtualiser cannot window a nested structure.
 */
type ListItem =
  | { kind: "header"; label: string; count: number }
  /** The second level: a type within a shelf, e.g. THHN inside Wire & Cable. */
  | { kind: "typeHeader"; label: string; count: number }
  | { kind: "row"; material: Material };

type Draft = {
  name: string;
  unitOfSale: Material["unitOfSale"];
  costPerUnit: string;
  /**
   * Hours to install ONE unit of sale. Held as a STRING, like the cost.
   *
   * Empty means "unset", which is a different thing from "0" and is what the
   * flag and the filter look for. A draft that held 0 for empty would make it
   * impossible to ever put a material BACK to unanswered, which is the state
   * the whole nullable column exists to keep sayable.
   */
  laborHours: string;
  category: Category | null;
  /**
   * Per-item trade slang — the second alias layer.
   *
   * Collected here because a material added by hand previously got none at
   * all, which made it findable by generic trade words and invisible to the
   * specific ones every seeded material supports.
   */
  searchAliases: string;
  /**
   * The brand or part number this user actually buys.
   *
   * The shipped catalog is generic on purpose — "Wire nuts", never a specific
   * manufacturer's part — so this is where a user pins theirs down without the
   * shipped names having to pick a brand on everyone's behalf.
   */
  brandNote: string;
};

const emptyDraft: Draft = {
  name: "",
  unitOfSale: "each",
  costPerUnit: "",
  laborHours: "",
  category: null,
  searchAliases: "",
  brandNote: "",
};

/** Shared validation for both the add form and inline edits. */
function validateDraft(draft: Draft): string | null {
  if (!draft.name.trim()) return "Give the material a name.";
  const cost = Number(draft.costPerUnit);
  if (draft.costPerUnit.trim() === "" || Number.isNaN(cost))
    return "Enter a cost.";
  if (cost < 0) return "Cost cannot be negative.";
  if (cost > MAX_COST) return "That cost is too large.";
  return null;
}

// ─── Category picker ──────────────────────────────────────────────────────────

/** Shared by the add form and the inline editor so both offer the same shelves. */
function CategorySelect({
  value,
  onChange,
  className,
}: {
  value: Category | null;
  onChange: (value: Category | null) => void;
  className?: string;
}) {
  return (
    <Select
      value={value ?? NO_CATEGORY}
      onValueChange={next =>
        onChange(next === NO_CATEGORY ? null : (next as Category))
      }
    >
      <SelectTrigger
        className={cn("h-8 w-44 text-sm", className)}
        aria-label="Category"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CATEGORY}>
          <span className="text-muted-foreground">No category</span>
        </SelectItem>
        {CATEGORIES.map(category => (
          <SelectItem key={category} value={category}>
            {category}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Origin badge ─────────────────────────────────────────────────────────────

function OriginBadge({ material }: { material: Material }) {
  if (material.userId === null) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Starter
      </Badge>
    );
  }
  if (material.baselineId != null) {
    // "Your copy" rather than "Edited" on purpose: after a revert the row is
    // still the user's own fork, just holding starter content again. Labelling
    // by ownership is always true; labelling by edited-ness would go stale.
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

// ─── Editable row ─────────────────────────────────────────────────────────────

function MaterialRow({
  material,
  isBusy,
  showCategory,
  isArchived,
  onSave,
  onSuggestAliases,
  onRevert,
  onRemove,
  onRestore,
  onDeleteForever,
  markupOverride,
}: {
  material: Material;
  isBusy: boolean;
  /** True while searching, where the flat list has no section header to lean on. */
  showCategory: boolean;
  /** Rendering the Archived view — different actions, no inline editing. */
  isArchived?: boolean;
  onSave: (id: number, draft: Draft) => Promise<void>;
  onSuggestAliases: SuggestAliases;
  onRevert: (material: Material) => void;
  onRemove: (material: Material) => void;
  onRestore?: (material: Material) => void;
  onDeleteForever?: (material: Material) => void;
  /**
   * This material's own markup, as a fraction, or undefined when it has none
   * and the rules below it apply (category, then company default). The first
   * level of the markup rules — references/material-markup.md.
   */
  markupOverride?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  /*
    The markup is NOT part of the material draft, on purpose. Saving the draft
    edits the material, and editing a shipped one FORKS it — which stops it
    following the shipped catalog. An override lives in its own table and
    needs no fork, so it is saved on its own, and a Save that changed only the
    markup never touches the material row at all.
  */
  const [markupDraft, setMarkupDraft] = useState("");
  const [openedWith, setOpenedWith] = useState<Draft | null>(null);

  const utils = trpc.useUtils();
  const setOverride = trpc.bids.setItemMarkupOverride.useMutation({
    onSuccess: () => {
      void utils.bids.markupRules.invalidate();
      // A Draft bid's "Re-apply markup rules" offer counts on this.
      void utils.bids.markupReapplyPreview.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const startEditing = () => {
    setMarkupDraft(
      markupOverride === undefined
        ? ""
        : String(Math.round(markupOverride * 10000) / 100)
    );
    const opened: Draft = {
      name: material.name,
      unitOfSale: material.unitOfSale,
      costPerUnit: String(Number(material.costPerUnit)),
      // Empty string for unset, so an untouched material opens with a blank
      // box rather than a 0 nobody typed. See the Draft field's own note.
      laborHours:
        material.laborHours == null ? "" : String(Number(material.laborHours)),
      category: material.category,
      brandNote: material.brandNote ?? "",
      // Seeded from the row, so the field opens showing the slang the material
      // already carries. That is what makes it safe for the save to send this
      // key at all: an untouched editor sends back exactly what was there, so
      // editing a price still cannot wipe the aliases that make the row
      // findable — the protection moved from "never send it" to "always start
      // from the truth", and editing the terms is now possible either way.
      searchAliases: material.searchAliases ?? "",
    };
    setDraft(opened);
    setOpenedWith(opened);
    setEditing(true);
  };

  const save = async () => {
    const problem = validateDraft(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    const typedMarkup = markupDraft.trim();
    const nextMarkup = typedMarkup === "" ? null : Number(typedMarkup) / 100;
    if (nextMarkup !== null && !(nextMarkup >= 0 && nextMarkup <= 10)) {
      toast.error("Markup must be between 0% and 1000%.");
      return;
    }
    if (nextMarkup !== (markupOverride ?? null)) {
      await setOverride.mutateAsync({
        materialId: material.id,
        markupPct: nextMarkup,
      });
    }
    // Only when something ABOUT THE MATERIAL changed — see markupDraft above.
    if (JSON.stringify(draft) !== JSON.stringify(openedWith)) {
      await onSave(material.id, draft);
    }
    setEditing(false);
  };

  const unpriced = needsPricing(material.costPerUnit);
  const unhoured = needsLaborUnit(material.laborHours);

  if (editing) {
    return (
      <div className="px-4 py-3 border-b border-border last:border-0 bg-muted/20">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            className="h-8 flex-1 min-w-[12rem] text-sm"
            placeholder="Material name"
            autoFocus
          />
          <CategorySelect
            value={draft.category}
            onChange={category => setDraft({ ...draft, category })}
          />
          <Select
            value={draft.unitOfSale}
            onValueChange={value =>
              setDraft({
                ...draft,
                unitOfSale: value as Material["unitOfSale"],
              })
            }
          >
            <SelectTrigger className="h-8 w-28 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map(unit => (
                <SelectItem key={unit} value={unit}>
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={draft.costPerUnit}
            onChange={e => setDraft({ ...draft, costPerUnit: e.target.value })}
            className="h-8 w-28 text-sm text-right"
            inputMode="decimal"
            onFocus={selectOnFocus}
            placeholder="0.00"
          />
          {/*
            Hours per unit of sale, and the PLACEHOLDER is doing real work:
            "hours" rather than "0.00", because an empty box here means unset
            and a 0 shown in grey would read as the answer. CLAUDE.md § rule 6 —
            a measurement that nobody has set must never render as a zero.

            Not InlineNumberField: this row is a draft form with its own Save
            button, and that component saves as you type. The rule for a draft
            is to hold the null and render a blank with a placeholder.
          */}
          <Input
            value={draft.laborHours}
            onChange={e => setDraft({ ...draft, laborHours: e.target.value })}
            className="h-8 w-28 text-sm text-right"
            inputMode="decimal"
            onFocus={selectOnFocus}
            placeholder="hours"
            aria-label="Labor hours per unit"
            title="Hours to install one of these. Leave blank if you have not decided; 0 means it adds no time of its own."
          />
          {/*
            This material's OWN markup — the first markup rule, over its
            category and the company default. Blank means "no override", which
            is not 0%: the placeholder says what happens instead.
          */}
          <PercentKindInput
            kind="markup"
            value={markupDraft}
            onChange={setMarkupDraft}
            whenBlank="own markup: none"
            ariaLabel="This material's own markup"
            disabled={isBusy}
            className="h-8 w-32 text-sm"
          />
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={save}
              disabled={isBusy}
            >
              {isBusy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}{" "}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setEditing(false)}
              disabled={isBusy}
            >
              <X className="w-3 h-3" /> Cancel
            </Button>
          </div>
        </div>

        <div className="mt-2">
          <Input
            value={draft.brandNote}
            onChange={e => setDraft({ ...draft, brandNote: e.target.value })}
            onFocus={selectOnFocus}
            className="h-8 w-full text-sm"
            placeholder="Brand or part number you buy (optional)"
            aria-label="Brand or part number"
            disabled={isBusy}
          />
        </div>

        {/* Aliases are editable here for the same reason they are collected on
            the add form: they are the only thing that makes a material findable
            by what it is actually called. Until now they could be set once at
            creation and never corrected, which left a typo'd or missing term
            permanently wrong on a row the user could otherwise edit freely.
            Starter rows included — editing one forks it, so the fork carries
            the slang the user chose rather than the shipped list. */}
        <div className="mt-2">
          <AliasSuggestions
            value={draft.searchAliases}
            onChange={searchAliases => setDraft({ ...draft, searchAliases })}
            disabled={isBusy}
            onRequest={() =>
              onSuggestAliases(
                draft.name,
                draft.category,
                draft.searchAliases || null
              )
            }
          />
          <p className="text-[0.7rem] text-muted-foreground mt-1">
            What people type instead of the catalog name. Clearing this makes
            the material findable only by the words in its name.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{material.name}</span>
          <OriginBadge material={material} />
          {/* Only when this material has its own markup. Every other row
              follows the rules, and saying so on 700 rows says nothing. */}
          {markupOverride !== undefined && (
            <span
              className="shrink-0 text-[0.65rem] px-1.5 py-0.5 rounded border border-border text-muted-foreground"
              title="This material's own markup — used instead of its category or the company default."
            >
              {Math.round(markupOverride * 10000) / 100}% markup
            </span>
          )}
          {showCategory && (
            <span className="text-xs text-muted-foreground truncate">
              {material.category ?? "Uncategorized"}
            </span>
          )}
        </div>
        {(material.description || material.brandNote) && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {material.description}
            {material.description && material.brandNote && " · "}
            {material.brandNote}
          </div>
        )}
      </div>

      <span className="text-xs text-muted-foreground w-16 shrink-0">
        {UNIT_LABEL[material.unitOfSale]}
      </span>
      {/* The price column doubles as the prompt. A shipped row is $0 until the
          user prices it, and showing "$0.00" plainly would read as a real
          price of nothing — which is exactly the number that loses a job
          quietly. So an unpriced row says so instead of showing the zero. */}
      {unpriced ? (
        <span
          className="text-xs w-24 text-right shrink-0 font-medium text-[#F5C518]"
          title="No price yet — this material prices the job at nothing until you set one."
        >
          Needs price
        </span>
      ) : (
        <span className="text-sm font-mono w-24 text-right shrink-0">
          {unitCost(material.costPerUnit)}
        </span>
      )}

      {/*
        The LABOR column, saying "Needs hours" for the same reason the price
        column says "Needs price" — with one difference that matters.

        A blank here would read as "this part takes no time", which is a claim,
        and a wrong one on 629 rows at once. And an unset hour is worse than an
        unset price: a missing price understates ONE line by the cost of a
        part, while a missing hour is multiplied by the labor rate on every
        line that touches this material, on every bid, until somebody sets it.

        A DELIBERATE zero prints as "0 h" and stays quiet. That is the whole
        reason the column is nullable rather than defaulting to zero the way
        the price does: "wire nuts add no time of their own" is an answer
        somebody is allowed to give, and having given it they should not go on
        being asked for it.
      */}
      {unhoured ? (
        <span
          className="text-xs w-24 text-right shrink-0 font-medium text-[#F5C518]"
          title="No labor unit yet — work using this material carries no hours until you set one."
        >
          Needs hours
        </span>
      ) : (
        <span
          className="text-sm font-mono w-24 text-right shrink-0"
          /*
            No "per" here: UNIT_LABEL already carries it, and inconsistently —
            "each" but "per ft" and "per box". Written as "h per {label}" this
            read "0.04 h per per ft" on screen. Seen 2026-09-20, after it had
            typechecked clean; a doubled preposition is invisible to everything
            except looking at it.
          */
          title={`Labor: ${laborUnitHours(material.laborHours)} h ${UNIT_LABEL[material.unitOfSale]}`}
        >
          {laborUnitHours(material.laborHours)} h
        </span>
      )}

      <div className="flex items-center gap-0.5 w-28 justify-end shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          onClick={startEditing}
          disabled={isBusy}
          title={
            material.userId === null ? "Edit — creates your own copy" : "Edit"
          }
          aria-label={`Edit ${material.name}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>

        {material.baselineId != null && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            onClick={() => onRevert(material)}
            disabled={isBusy}
            title="Undo your changes and restore the starter version"
            aria-label={`Revert ${material.name}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}

        {/* Archived rows offer the way back and the way out; the working list
            offers Archive. The inline "Sure?" two-step this replaced is gone —
            the dialog says what actually happens, which "Sure?" never did. */}
        {isArchived ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => onRestore?.(material)}
              aria-label={`Restore ${material.name}`}
            >
              <RotateCcw className="w-3 h-3" /> Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDeleteForever?.(material)}
              title="Delete permanently — cannot be undone"
              aria-label={`Delete ${material.name} forever`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : (
          /* Offered on starters too. Archiving one forks it first, so the
             shared row is untouched and the id changes under us — which is why
             this screen refetches rather than patching the row it sent. */
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            onClick={() => onRemove(material)}
            disabled={isBusy}
            title="Archive — out of the working list, restorable any time"
            aria-label={`Archive ${material.name}`}
          >
            <ArchiveIcon className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MaterialsLibraryPage() {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [view, setView] = useState<LibraryView>("active");
  const [scope, setScope] = useState<LibraryScope>("all");

  /**
   * Item markup overrides, keyed the way the server matches them —
   * `materialItemKey`, so a starter and the company's fork of it find the
   * same override. One small query for the whole list: a company sets a
   * handful of these, not one per row.
   */
  const { data: markupRuleRows = [] } = trpc.bids.markupRules.useQuery();
  const itemOverrides = useMemo(
    () =>
      new Map(
        markupRuleRows
          .filter(r => r.kind === "item" && r.itemKey !== null)
          .map(r => [r.itemKey as number, Number(r.markupPct)])
      ),
    [markupRuleRows]
  );
  /**
   * Show only the rows still waiting for a real price.
   *
   * The shipped catalog is ~600 items at $0, which is a number nobody prices in
   * one sitting. This turns "my catalog is unpriced" from a vague state into a
   * worklist that visibly shrinks: switch it on, price what is in front of you,
   * and rows leave the list as you go.
   */
  const [onlyUnpriced, setOnlyUnpriced] = useState(false);
  /**
   * The same worklist idea for hours. SEPARATE from the pricing filter, not a
   * combined "needs attention", because they are two different jobs done at two
   * different times — pricing comes off a supplier quote, hours come out of the
   * estimator's own head or their NECA book — and merging them would produce a
   * list that can never be finished in one sitting.
   */
  const [onlyUnhoured, setOnlyUnhoured] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<PendingItem | null>(
    null
  );
  const [pendingDelete, setPendingDelete] = useState<PendingItem | null>(null);

  const {
    data: materials = [],
    isLoading,
    refetch,
  } = trpc.materials.list.useQuery({ status: view });
  const { data: archivedRows = [] } = trpc.materials.list.useQuery({
    status: "archived",
  });

  const onError = (e: { message: string }) => toast.error(e.message);
  const utils = trpc.useUtils();
  const refreshAll = () => {
    void utils.materials.list.invalidate();
    void refetch();
  };

  const createMaterial = trpc.materials.create.useMutation({ onError });
  const suggestAliases = trpc.materials.suggestAliases.useMutation();
  const updateMaterial = trpc.materials.update.useMutation({ onError });
  const revertMaterial = trpc.materials.revert.useMutation({ onError });

  const archiveMaterial = trpc.materials.archive.useMutation({
    onError,
    onSuccess: () => {
      toast.success("Archived — restore it any time from the Archived tab");
      refreshAll();
    },
  });
  const restoreMaterial = trpc.materials.restore.useMutation({
    onError,
    onSuccess: () => {
      toast.success("Back in the working list.");
      refreshAll();
    },
  });
  const deleteForever = trpc.materials.deleteForever.useMutation({
    onError,
    onSuccess: () => {
      toast.success("Deleted permanently.");
      refreshAll();
    },
  });

  const isBusy =
    createMaterial.isPending ||
    updateMaterial.isPending ||
    revertMaterial.isPending ||
    archiveMaterial.isPending;

  // The index, the ranking and this company's usage all live in the hook, so
  // this screen, the supplier-pricing view and the picker cannot disagree.
  //
  // searchAliases feeds the index's non-name text, which scores below the name
  // itself — enough to surface "Duplex receptacle" for "plug", never enough to
  // outrank an item the query actually names.
  //
  // `category` is deliberately NOT indexed. It reads like a free win, but every
  // item on a shelf inherits the shelf's words: indexing it made "panel" return
  // both breakers (category "Panels & Breakers") and "cover plate" return wire
  // nuts (category "Wall Plates & Misc"). The sections are already visible on
  // screen; the search box should match materials, not shelves.
  const search = useMaterialSearch(materials);

  /*
    The results follow the box a beat behind, never the other way round.

    Searching is now ~5–10 ms, but DRAWING a few hundred result rows is not,
    and a keystroke that waits for the list is a box that feels stuck. With
    a deferred copy of the query the box shows each letter at once and React
    renders the list at a lower priority — and throws that render away if
    another letter arrives first. Added 2026-09-25 with typo-tolerant search.
  */
  const searchQuery = useDeferredValue(query);
  const searching = searchQuery.trim().length > 0;

  // Run once per query; `visible` below filters it, and the correction note
  // reads what it searched for.
  const searched = useMemo(
    () => (searching ? search(searchQuery, 500) : null),
    [search, searchQuery, searching]
  );
  const correctedQuery = searched?.correctedQuery ?? null;

  const visible = useMemo(() => {
    // Scope first: "Mine" is about what you own, and applying it before the
    // search means the result count matches what the filter promised. The
    // pricing filter joins it for the same reason — both are "which rows am I
    // looking at", and search ranks whatever survives them.
    let inScope = filterByScope(materials, scope);
    if (onlyUnpriced)
      inScope = inScope.filter(m => needsPricing(m.costPerUnit));
    if (onlyUnhoured)
      inScope = inScope.filter(m => needsLaborUnit(m.laborHours));
    if (!searching) return inScope;
    /*
      Ranked by the shared rule (rankMaterialHits), exactly as the picker and
      the supplier-pricing view rank — CLAUDE.md is explicit that one catalog
      listed two ways is the same class of bug as two catalogs.

      ── Real scores now, where this used to say position, and why ───────────
      Until 2026-09-24 this passed each row's POSITION as its score, and said
      why: a version using real scores had been measured and thrown away,
      because real scores tie often and every tie then fell to a size
      comparison between unrelated families — "switch" led with a 3-way, "box"
      with cast boxes, "recep" with "20A duplex receptacle".

      That was right about what happened, and position was hiding the same
      fault instead of fixing it: a position breaks a tie by whatever order the
      rows arrived in, which here is alphabetical, and that is how "20A
      breaker" put the plain single-pole breaker 7th behind four 2-pole ones.
      The missing piece was a signal that MEANS something inside a tie —
      commonness (shared/materialCommonness.ts), from the shipped starter list
      and this company's own bids. With it, the three regressions above rank
      correctly, and the standard sweep's top result moved on 8 of 58 queries,
      each read and judged in the commit that made this change.
    */
    const inScopeIds = new Set(inScope.map(m => m.id));
    return (searched?.rows ?? []).filter(m => inScopeIds.has(m.id));
  }, [materials, searched, searching, scope, onlyUnpriced, onlyUnhoured]);

  const unpricedCount = useMemo(
    () => countNeedingPricing(materials),
    [materials]
  );

  const unhouredCount = useMemo(
    () => countNeedingLaborUnit(materials),
    [materials]
  );

  /**
   * Browsing shelves the catalog by category, in the declared order, with
   * Uncategorized last and empty sections dropped. Searching deliberately does
   * NOT group into shelves: sections would bury the best match under whichever
   * shelf it happens to sit on, so those results stay flat and each row prints
   * its own category instead.
   *
   * Flat is not unordered. Search results go through `rankMaterialHits` — the
   * product first, then its fittings, supports and consumables, and the most
   * common part first among equal matches — the same function MaterialPicker
   * and the supplier-pricing view use, so no two screens can disagree about
   * which row answers "wire".
   *
   * ── Within a shelf: Type, then Size — never alphabetically ───────────────
   * Rows arrive name-sorted from the server, which is the wrong order for
   * everything here: alphabetically, 1" EMT sits between 1/2" and 1-1/4", and
   * #1/0 THHN lands next to #1 rather than above it. Size alone is not enough
   * either — it interleaves the five conduit families at every trade size. The
   * whole rule lives in @shared/materialOrder and is used by every screen that
   * lists materials, so no two of them can disagree about the order.
   */
  const groups = useMemo(
    () => (searching ? [] : groupMaterialsByCategory(visible as Material[])),
    [visible, searching]
  );

  /**
   * The list flattened to one array of section headers and rows.
   *
   * Virtualisation needs a single indexable sequence, so the shelves are
   * flattened rather than nested — the header is just another row that happens
   * to render differently. When searching there are no headers at all, so the
   * same array carries both modes and the render below does not branch.
   */
  const listItems = useMemo((): ListItem[] => {
    if (searching) {
      return (visible as Material[]).map(material => ({
        kind: "row" as const,
        material,
      }));
    }
    return groups.flatMap(group => [
      {
        kind: "header" as const,
        label: group.label,
        count: group.items.length,
      },
      /**
       * The type level, from runs the sort has already produced. A run of one
       * carries no header and stays exactly where the sort put it, so a shelf
       * that does not divide into families reads as it always has.
       */
      ...groupByType(group.items).flatMap(section => [
        ...(section.typeLabel
          ? [
              {
                kind: "typeHeader" as const,
                label: section.typeLabel,
                count: section.items.length,
              },
            ]
          : []),
        ...section.items.map(material => ({ kind: "row" as const, material })),
      ]),
    ]);
  }, [groups, visible, searching]);

  /**
   * The page's own scroll container is the virtualiser's viewport.
   *
   * The alternative — giving the table its own inner scrollbar — would strand
   * the search box and filters above a second scrolling region, so the page
   * keeps one scrollbar and the list reports its offset within it via
   * scrollMargin.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => scrollRef.current,
    // A first guess only — every rendered row is measured, so a description or
    // an open editor corrects itself.
    estimateSize: index => {
      const kind = listItems[index]?.kind;
      if (kind === "header") return 30;
      if (kind === "typeHeader") return 26;
      return 57;
    },
    overscan: 10,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const handleSave = useCallback(
    async (id: number, draft: Draft) => {
      setBusyId(id);
      try {
        const result = await updateMaterial.mutateAsync({
          id,
          name: draft.name.trim(),
          unitOfSale: draft.unitOfSale,
          costPerUnit: Number(draft.costPerUnit),
          /*
            A BLANK BOX CLEARS IT BACK TO UNSET, and that is the point of the
            nullable column rather than an oversight to tidy into a zero.

            "Nobody has decided" and "this part adds no time of its own" are
            different answers with different consequences — the first should
            keep showing up in the Needs hours worklist and the second should
            not — so the estimator has to be able to get back to the first one
            after typing into the box by mistake.

            Sent unconditionally for the same reason the aliases are: omitting
            the key would leave the old value and make a deliberate clear look
            like it silently failed.
          */
          laborHours:
            draft.laborHours.trim() === "" ? null : Number(draft.laborHours),
          category: draft.category,
          // Sent unconditionally now the editor shows it: blank means the user
          // cleared the field, which is a real edit, where omitting the key
          // would quietly keep the old terms and make the clear look like it
          // failed.
          //
          // Cleared stores "" and NOT null, which matters more than it looks.
          // `backfillMaterialMetadata` (server/db.ts) refills any fork whose
          // aliases are NULL from its baseline on every startup — NULL there
          // means "predates the column, inherit it". Saving a deliberate clear
          // as NULL would put the starter's slang back the next time the server
          // booted, and search failures of that kind are invisible until someone
          // notices their results are wrong. Empty text says "the user says this
          // has none", and reads identically to NULL everywhere else: smartSearch
          // coalesces both to "".
          searchAliases: draft.searchAliases.trim(),
          brandNote: draft.brandNote.trim() || null,
        });
        if (result.forked) {
          toast.success(
            `Saved as your own copy — the starter "${result.material?.name}" is unchanged.`
          );
        } else {
          toast.success("Material updated");
        }
        await refetch();
      } catch {
        // onError already surfaced it
      } finally {
        setBusyId(null);
      }
    },
    [updateMaterial, refetch]
  );

  /**
   * Suggestions for whichever draft is asking — the add form or a row editor.
   *
   * Never rejects. `AliasSuggestions` documents its request as resolving to a
   * list whatever happens, and a failed suggestion is a missing convenience,
   * not a broken save: the free-text field beside it still works.
   */
  const requestAliasSuggestions = useCallback<SuggestAliases>(
    async (name, category, existing) => {
      if (!name.trim()) {
        toast.error(
          "Give the material a name first — suggestions come from it."
        );
        return { suggestions: [], available: true };
      }
      /*
        "Unavailable" is passed through, not folded into "no suggestions".
        The server answers `available: false` for AI switched off, no key, a
        refusal or a used-up allowance — and until 2026-09-25 this dropped it,
        so the panel read "No suggestions this time", word for word what a
        working model with nothing to add produces. That silence is why the
        feature went unverified for as long as it did. The panel now says
        which of the two it is (AliasSuggestions).
      */
      try {
        const result = await suggestAliases.mutateAsync({
          name: name.trim(),
          category,
          existing,
        });
        return { suggestions: result.suggestions, available: result.available };
      } catch {
        return { suggestions: [], available: false };
      }
    },
    [suggestAliases]
  );

  const handleRevert = useCallback(
    async (material: Material) => {
      setBusyId(material.id);
      try {
        await revertMaterial.mutateAsync({ id: material.id });
        toast.success("Restored the starter version");
        await refetch();
      } catch {
        /* handled by onError */
      } finally {
        setBusyId(null);
      }
    },
    [revertMaterial, refetch]
  );

  /** Asks first. The archive itself happens from the dialog's confirm. */
  const handleRemove = useCallback((material: Material) => {
    setPendingArchive({ id: material.id, name: material.name });
  }, []);

  const handleCreate = useCallback(async () => {
    const problem = validateDraft(newDraft);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      await createMaterial.mutateAsync({
        name: newDraft.name.trim(),
        unitOfSale: newDraft.unitOfSale,
        costPerUnit: Number(newDraft.costPerUnit),
        // A new material starts with no labor unit unless one was typed —
        // NULL, never 0, so it joins the Needs hours worklist rather than
        // claiming to take no time.
        laborHours:
          newDraft.laborHours.trim() === ""
            ? null
            : Number(newDraft.laborHours),
        category: newDraft.category,
        searchAliases: newDraft.searchAliases.trim() || null,
        brandNote: newDraft.brandNote.trim() || null,
      });
      toast.success(`Added "${newDraft.name.trim()}"`);
      setNewDraft(emptyDraft);
      setAdding(false);
      await refetch();
    } catch {
      /* handled by onError */
    }
  }, [createMaterial, newDraft, refetch]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Boxes className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Materials</h1>
            <p className="text-xs text-muted-foreground">
              The catalog your assemblies are built from. Starter materials ship
              with no price — put your own supplier pricing on the ones you use.
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs shrink-0"
            onClick={() => setAdding(v => !v)}
          >
            <Plus className="w-3.5 h-3.5" /> Add material
          </Button>
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
        <LibraryTabs group="materials" current="catalog" />
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search materials…"
            className="h-9 pl-9 text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <SearchCorrectionNote
          correctedQuery={correctedQuery}
          className="-mt-1.5 mb-3"
        />

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <ViewTabs
            view={view}
            onChange={setView}
            archivedCount={archivedRows.length}
          />
          <ScopeFilter
            scope={scope}
            onChange={setScope}
            counts={scopeCounts(materials)}
          />
          <Button
            size="sm"
            variant={onlyUnpriced ? "default" : "outline"}
            className="h-8 gap-1.5 text-xs"
            onClick={() => setOnlyUnpriced(v => !v)}
            aria-pressed={onlyUnpriced}
            title="Show only the materials still carrying the shipped $0"
          >
            <CircleDollarSign className="w-3.5 h-3.5" />
            Needs pricing
            <span
              className={cn(
                "tabular-nums",
                onlyUnpriced ? "opacity-80" : "text-muted-foreground"
              )}
            >
              {unpricedCount}
            </span>
          </Button>
          <Button
            size="sm"
            variant={onlyUnhoured ? "default" : "outline"}
            className="h-8 gap-1.5 text-xs"
            onClick={() => setOnlyUnhoured(v => !v)}
            aria-pressed={onlyUnhoured}
            title="Show only the materials with no labor unit set"
          >
            <Clock className="w-3.5 h-3.5" />
            Needs hours
            <span
              className={cn(
                "tabular-nums",
                onlyUnhoured ? "opacity-80" : "text-muted-foreground"
              )}
            >
              {unhouredCount}
            </span>
          </Button>
        </div>

        {onlyUnpriced && unpricedCount === 0 && (
          <p className="text-xs text-muted-foreground mb-3">
            Every material in your library has a price. Switch the filter off to
            see them all.
          </p>
        )}

        {onlyUnhoured && unhouredCount === 0 && (
          <p className="text-xs text-muted-foreground mb-3">
            Every material in your library has a labor unit. Switch the filter
            off to see them all.
          </p>
        )}

        {/* Add form */}
        {adding && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={newDraft.name}
                onChange={e =>
                  setNewDraft({ ...newDraft, name: e.target.value })
                }
                className="h-8 flex-1 min-w-[12rem] text-sm"
                placeholder="Material name"
                autoFocus
              />
              <CategorySelect
                value={newDraft.category}
                onChange={category => setNewDraft({ ...newDraft, category })}
              />
              <Select
                value={newDraft.unitOfSale}
                onValueChange={value =>
                  setNewDraft({
                    ...newDraft,
                    unitOfSale: value as Material["unitOfSale"],
                  })
                }
              >
                <SelectTrigger className="h-8 w-28 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map(unit => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={newDraft.costPerUnit}
                onChange={e =>
                  setNewDraft({ ...newDraft, costPerUnit: e.target.value })
                }
                className="h-8 w-28 text-sm text-right"
                inputMode="decimal"
                onFocus={selectOnFocus}
                placeholder="0.00"
              />
              {/* Blank is the honest default for a brand-new material: it has
                  no labor unit until somebody decides one, and the placeholder
                  says "hours" rather than showing a 0 that would read as it. */}
              <Input
                value={newDraft.laborHours}
                onChange={e =>
                  setNewDraft({ ...newDraft, laborHours: e.target.value })
                }
                className="h-8 w-28 text-sm text-right"
                inputMode="decimal"
                onFocus={selectOnFocus}
                placeholder="hours"
                aria-label="Labor hours per unit"
                title="Hours to install one of these. Leave blank if you have not decided; 0 means it adds no time of its own."
              />
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={handleCreate}
                disabled={createMaterial.isPending}
              >
                {createMaterial.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}{" "}
                Add
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

            {/* The second alias layer. A material added here used to get none
                at all, leaving it findable by generic trade words and
                invisible to the specific ones — the exact thing every seeded
                material carries. */}
            <div className="mt-2">
              <AliasSuggestions
                value={newDraft.searchAliases}
                onChange={searchAliases =>
                  setNewDraft({ ...newDraft, searchAliases })
                }
                disabled={createMaterial.isPending}
                onRequest={() =>
                  requestAliasSuggestions(
                    newDraft.name,
                    newDraft.category,
                    newDraft.searchAliases || null
                  )
                }
              />
              <p className="text-[0.7rem] text-muted-foreground mt-1">
                What people type instead of the catalog name — “spring nut”,
                “1900”, “gem box”. Optional, but it is what makes a material
                findable the way it is asked for.
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            <span className="flex-1">Material</span>
            <span className="w-16 shrink-0">Unit</span>
            <span className="w-24 text-right shrink-0">Cost</span>
            <span className="w-28 shrink-0" />
          </div>

          {isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading materials…
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {query ? (
                <>No materials match “{query}”.</>
              ) : (
                <>No materials yet. Add your first one to get started.</>
              )}
            </div>
          ) : (
            /*
             * Windowed, not rendered whole.
             *
             * The shipped catalog is ~615 rows and a user's own grows on top of
             * that. Every row carries an editor, a search index entry and half
             * a dozen buttons, so rendering the lot put thousands of nodes in
             * the DOM for the thirty an estimator can see — the screen was
             * usable at 29 materials and visibly slow at 600, which is the bug
             * this avoids rather than an optimisation for later.
             *
             * Heights are measured rather than assumed: a row grows when it has
             * a description and grows a lot when it is being edited, and a
             * fixed row height would make the scrollbar lie about where things
             * are.
             */
            <div
              ref={listRef}
              className="relative"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const item = listItems[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 w-full"
                    style={{
                      transform: `translateY(${
                        virtualRow.start - rowVirtualizer.options.scrollMargin
                      }px)`,
                    }}
                  >
                    {item.kind === "typeHeader" ? (
                      /*
                        The type heading. Deliberately quieter than the shelf
                        above it — indented, lower case, no background — so the
                        eye still reads the shelf first and the families as
                        subdivisions of it rather than as more shelves.
                      */
                      <div className="flex items-center gap-2 pl-8 pr-4 py-1 border-b border-border/40">
                        <span className="text-[11px] font-medium text-foreground/80">
                          {item.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60">
                          {item.count}
                        </span>
                      </div>
                    ) : item.kind === "header" ? (
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/40 border-b border-border">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {item.label}
                        </span>
                        <span className="text-xs text-muted-foreground/70">
                          {item.count}
                        </span>
                      </div>
                    ) : (
                      <MaterialRow
                        material={item.material}
                        isBusy={isBusy && busyId === item.material.id}
                        showCategory={searching}
                        onSave={handleSave}
                        onSuggestAliases={requestAliasSuggestions}
                        onRevert={handleRevert}
                        onRemove={handleRemove}
                        isArchived={view === "archived"}
                        onRestore={m => restoreMaterial.mutate({ id: m.id })}
                        onDeleteForever={m =>
                          setPendingDelete({ id: m.id, name: m.name })
                        }
                        markupOverride={itemOverrides.get(
                          materialItemKey(item.material)
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className={cn("text-xs text-muted-foreground mt-2")}>
          {view === "active"
            ? "Editing a starter material gives you your own copy — the original stays untouched, and you can restore it any time with the undo button. Removing one archives it rather than deleting it."
            : "Restoring puts a material back in the working list. Deleting forever cannot be undone."}
        </p>
      </div>

      <ArchiveItemDialog
        pending={pendingArchive}
        noun="material"
        stillUsedNote="Assemblies that already use it keep working — an archived material keeps its place in every recipe it is part of."
        onClose={() => setPendingArchive(null)}
        onConfirm={id => archiveMaterial.mutate({ id })}
      />
      <DeleteForeverDialog
        pending={pendingDelete}
        noun="material"
        keepsNote="Bids that already priced it keep the costs they were quoted at."
        onClose={() => setPendingDelete(null)}
        onConfirm={id => deleteForever.mutate({ id })}
      />
    </div>
  );
}
