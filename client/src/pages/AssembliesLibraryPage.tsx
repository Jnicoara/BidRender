/**
 * AssembliesLibraryPage — the Assembly Builder (Library § Assemblies).
 *
 * An assembly is a reusable recipe: materials + hours + a labor role + the
 * modifiers that apply. This screen is where the other three Library screens
 * come together, so it reads from all of them and owns none of their data.
 *
 * Distinct from the legacy AssemblyBuilderPage at /assemblies, which is built
 * on the old CATALOG/master_* tables and is being replaced outright.
 *
 * ── The cost preview does no math ────────────────────────────────────────────
 * Every number in the preview comes from calculateLineItem / calculateBidPrice
 * in @shared/pricing — the same functions the server prices with. Modifiers add
 * rather than compound, overhead lands before profit, and no profit method is
 * ever assumed: with none chosen the panel shows Direct Cost and says so,
 * rather than inventing a markup.
 *
 * ── Labor hours are placeholders ─────────────────────────────────────────────
 * A new assembly opens with a suggested figure from shared/laborHourDefaults —
 * never zero, which would price the work at nothing. While the value is still
 * untouched the field is captioned as a guess; the caption disappears once the
 * user edits it, because from then on it is their number.
 *
 * ── Responsiveness (CLAUDE.md § Responsiveness) ──────────────────────────────
 * Builder edits are local state, so typing and the preview are instant with no
 * round trip. List removals are optimistic. The assembly list is not paginated:
 * it is a hand-built catalog of recipes, bounded by curation. If it ever grows
 * into the thousands this is the screen to revisit first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { laborForAssembly } from "@shared/materialLabor";
import { LaborRateQuickEdit } from "@/components/LaborRateQuickEdit";
import { resolveLaborRate } from "@shared/laborRateLookup";
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
import {
  Archive as ArchiveIcon,
  ArrowLeft,
  Check,
  Copy as CopyIcon,
  Layers,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addAssemblyOverheadHours,
  calculateBidPrice,
  calculateLineItem,
} from "@shared/pricing";
import {
  defaultLaborHoursFor,
  isPlaceholderHours,
} from "@shared/laborHourDefaults";
import { HourSuggestions } from "@/components/HourSuggestions";
import { money } from "@/lib/money";
import {
  MaterialPicker,
  type PickableMaterial,
} from "@/components/MaterialPicker";

// ─── Types ────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Devices",
  "Lighting",
  "Panels",
  "Equipment Connections",
  "Low Voltage/EMS",
] as const;
type Category = (typeof CATEGORIES)[number];

const PROJECT_TYPES = ["residential", "commercial", "both"] as const;
type ProjectType = (typeof PROJECT_TYPES)[number];

/** Radix Select cannot hold an empty value; these stand in for "unset". */
const NO_PROJECT_TYPE = "__none__";
const NO_ROLE = "__none__";

type Assembly = {
  id: number;
  userId: number | null;
  baselineId: number | null;
  name: string;
  category: Category;
  trade: string;
  projectType: ProjectType | null;
  baseLaborHours: string;
  overheadLaborHours: string;
  laborRateId: number | null;
};

type MaterialLine = {
  materialId: number;
  qty: number;
  name: string;
  unitOfSale: "each" | "foot" | "box";
  costPerUnit: number;
  /**
   * The material's own labor unit, and this recipe's disagreement with it.
   *
   * Carried as the raw nullable values rather than a resolved number, because
   * WHICH one wins is decided in one place — `componentLaborUnit` — and a
   * screen resolving it for itself is how two parts of the app come to disagree
   * about the same recipe. NULL on both means nobody has said, which is not
   * zero and must not display as it.
   *
   * These feed the CROSS-CHECK only. They never touch what the assembly prices
   * at; see the note on the cross-check line itself.
   */
  laborHours: string | null;
  overrideLaborHours: string | null;
  /**
   * This line is the branch wire to the NEXT device (D18).
   *
   * Carried in the draft and sent on save. A save that dropped it would clear
   * every whip on the recipe — CLAUDE.md § rule 7, a form that cannot edit a
   * field must not clear it. Here the form CAN edit it, so it must round-trip.
   */
  isBranchWhip: boolean;
};

type Draft = {
  name: string;
  category: Category;
  trade: string;
  projectType: ProjectType | null;
  baseLaborHours: string;
  overheadLaborHours: string;
  laborRateId: number | null;
  materials: MaterialLine[];
  modifierIds: number[];
};

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const emptyDraft = (): Draft => ({
  name: "",
  category: "Devices",
  trade: "electrical",
  projectType: "both",
  baseLaborHours: String(defaultLaborHoursFor("").hours),
  // 0, always. There is no sensible default amount of setup time — it depends
  // entirely on the work — and a suggested figure here would be a number
  // nobody chose quietly inflating every new assembly.
  overheadLaborHours: "0",
  laborRateId: null,
  materials: [],
  modifierIds: [],
});

// ─── Origin badge ─────────────────────────────────────────────────────────────

function OriginBadge({ assembly }: { assembly: Assembly }) {
  if (assembly.userId === null) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Starter
      </Badge>
    );
  }
  if (assembly.baselineId != null) {
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

// ─── Cost preview ─────────────────────────────────────────────────────────────

type ProfitMethod = "markup" | "margin" | "none";

function CostPreview({
  draft,
  laborRate,
  modifierPcts,
}: {
  draft: Draft;
  laborRate: number;
  modifierPcts: Array<{ name: string; laborAdjustmentPct: number }>;
}) {
  const [overheadOn, setOverheadOn] = useState(false);
  const [overheadMode, setOverheadMode] = useState<"percentage" | "flat">(
    "percentage"
  );
  const [overheadValue, setOverheadValue] = useState("10");
  const [profitMethod, setProfitMethod] = useState<ProfitMethod>("none");
  const [profitValue, setProfitValue] = useState("20");

  const line = useMemo(() => {
    try {
      return calculateLineItem({
        materials: draft.materials.map(m => ({
          costPerUnit: m.costPerUnit,
          qty: m.qty,
        })),
        baseLaborHours: Number(draft.baseLaborHours) || 0,
        overheadLaborHours: Number(draft.overheadLaborHours) || 0,
        modifiers: modifierPcts,
        laborRate,
      });
    } catch {
      return null;
    }
  }, [
    draft.materials,
    draft.baseLaborHours,
    draft.overheadLaborHours,
    modifierPcts,
    laborRate,
  ]);

  const bid = useMemo(() => {
    if (!line || profitMethod === "none") return null;
    try {
      return calculateBidPrice({
        directCost: line.directCost,
        overhead: overheadOn
          ? {
              enabled: true,
              mode: overheadMode,
              value:
                overheadMode === "percentage"
                  ? (Number(overheadValue) || 0) / 100
                  : Number(overheadValue) || 0,
            }
          : { enabled: false },
        profit: {
          method: profitMethod,
          value: (Number(profitValue) || 0) / 100,
        },
      });
    } catch {
      return null;
    }
  }, [
    line,
    overheadOn,
    overheadMode,
    overheadValue,
    profitMethod,
    profitValue,
  ]);

  if (!line) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Enter valid hours and quantities to see a cost.
      </div>
    );
  }

  const Row = ({
    label,
    value,
    strong,
  }: {
    label: string;
    value: string;
    strong?: boolean;
  }) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className={cn(
          "text-xs",
          strong ? "text-foreground font-medium" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm",
          strong ? "text-[#F5C518]" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Cost preview
      </div>

      <Row
        label={`Materials (${draft.materials.length} lines)`}
        value={money(line.materialCost)}
      />
      <Row
        label={
          line.modifierPct !== 0
            ? `Labor ${round(line.baseHoursWithOverhead, 3)} h → ${round(line.adjustedLaborHours, 3)} h`
            : `Labor ${round(line.adjustedLaborHours, 3)} h`
        }
        value={money(line.laborCost)}
      />
      {/* Named where it lands, so an estimator reading the preview can see
          which part of the hours is setup rather than device work. */}
      {line.overheadLaborHours > 0 && (
        <div className="text-xs text-muted-foreground pl-1 pb-1">
          Includes {round(line.overheadLaborHours, 3)} h of assembly overhead,
          added before modifiers.
        </div>
      )}
      {line.modifierPct !== 0 && (
        <div className="text-xs text-muted-foreground pl-1 pb-1">
          {modifierPcts.length} modifier{modifierPcts.length === 1 ? "" : "s"},
          summed to {round(line.modifierPct * 100, 2)}% — percentages add, never
          compound.
        </div>
      )}
      {line.laborHoursClamped && (
        <div className="text-xs text-destructive pb-1">
          Modifiers total below −100%; hours clamped to zero. That is almost
          certainly wrong.
        </div>
      )}

      <div className="border-t border-border my-2" />
      <Row
        label="Direct cost"
        value={money(line.directCost)}
        strong={profitMethod === "none"}
      />

      {/* Overhead & profit — both optional, neither ever assumed */}
      <div className="border-t border-border mt-2 pt-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setOverheadOn(v => !v)}
            className={cn(
              "px-2 py-0.5 rounded text-xs border transition-colors",
              overheadOn
                ? "border-[#F5C518]/40 bg-[#F5C518]/10 text-[#F5C518]"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            Overhead {overheadOn ? "on" : "off"}
          </button>
          {overheadOn && (
            <>
              <Select
                value={overheadMode}
                onValueChange={v => setOverheadMode(v as "percentage" | "flat")}
              >
                <SelectTrigger className="h-7 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">%</SelectItem>
                  <SelectItem value="flat">Flat $</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={overheadValue}
                onChange={e => setOverheadValue(e.target.value)}
                className="h-7 w-20 text-xs text-right"
                inputMode="decimal"
                onFocus={selectOnFocus}
                aria-label="Overhead value"
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={profitMethod}
            onValueChange={v => setProfitMethod(v as ProfitMethod)}
          >
            <SelectTrigger
              className="h-7 w-36 text-xs"
              aria-label="Profit method"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No profit method</SelectItem>
              <SelectItem value="markup">Markup %</SelectItem>
              <SelectItem value="margin">Target margin %</SelectItem>
            </SelectContent>
          </Select>
          {profitMethod !== "none" && (
            <Input
              value={profitValue}
              onChange={e => setProfitValue(e.target.value)}
              className="h-7 w-20 text-xs text-right"
              inputMode="decimal"
              onFocus={selectOnFocus}
              aria-label="Profit value"
            />
          )}
        </div>
      </div>

      {bid ? (
        <div className="border-t border-border mt-2 pt-2">
          {overheadOn && (
            <Row label="Overhead" value={money(bid.overheadAmount)} />
          )}
          <Row
            label={profitMethod === "markup" ? "Markup" : "Target margin"}
            value={money(bid.profitAmount)}
          />
          <Row label="Bid price" value={money(bid.finalPrice)} strong />
        </div>
      ) : (
        <div className="text-xs text-muted-foreground pt-1">
          Pick a profit method to see a bid price — markup and target margin
          give different numbers, so it is never assumed for you.
        </div>
      )}
    </div>
  );
}

// ─── Builder ──────────────────────────────────────────────────────────────────

function AssemblyBuilder({
  initial,
  isStarter,
  canRevert,
  onCancel,
  onSave,
  onRevert,
}: {
  initial: Draft;
  isStarter: boolean;
  canRevert: boolean;
  onCancel: () => void;
  onSave: (draft: Draft) => void;
  onRevert: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  /** Tracks whether the user has typed in the hours box themselves. */
  const [hoursTouched, setHoursTouched] = useState(false);

  const { data: laborRates = [] } = trpc.laborRates.list.useQuery();
  const { data: modifiers = [] } = trpc.modifiers.list.useQuery({
    status: "active",
  });

  /**
   * The picker's own search box, so focus can be handed back to it.
   *
   * The search, the ranking and the keyboard now live in `MaterialPicker`;
   * what stays here is what happens to a material once it is chosen, which is
   * the half that is genuinely this screen's.
   */
  const materialSearchRef = useRef<HTMLInputElement>(null);
  /**
   * Set to the materialId just added so its quantity input can grab focus once
   * React has rendered the new row — the second half of the keyboard loop.
   */
  const [focusQtyFor, setFocusQtyFor] = useState<number | null>(null);

  const isNew = initial.name === "";

  // Suggest hours from the name while the user has not set them, so typing
  // "GFCI receptacle" lands on a sensible figure instead of the generic 0.5.
  useEffect(() => {
    if (!isNew || hoursTouched) return;
    const suggestion = defaultLaborHoursFor(draft.name);
    setDraft(d =>
      String(suggestion.hours) === d.baseLaborHours
        ? d
        : { ...d, baseLaborHours: String(suggestion.hours) }
    );
  }, [draft.name, hoursTouched, isNew]);

  const suggestion = useMemo(
    () => defaultLaborHoursFor(draft.name),
    [draft.name]
  );
  const showsPlaceholderHours =
    !hoursTouched &&
    isPlaceholderHours(draft.name, Number(draft.baseLaborHours));

  /**
   * What the parts come to, against what was typed.
   *
   * Goes through `laborForAssembly` rather than summing here, so this screen
   * and anything else that ever shows the pair read the same decision. The
   * `pricedHours` it returns is deliberately ignored: this component already
   * holds the typed number as a draft string, and the point of the shared
   * function is that the two figures are computed apart.
   */
  const crossCheck = useMemo(() => {
    const labor = laborForAssembly({
      typedHours: Number(draft.baseLaborHours) || 0,
      components: draft.materials.map(m => ({
        qty: m.qty,
        laborHours: m.laborHours,
        overrideLaborHours: m.overrideLaborHours,
      })),
    });
    return {
      hours: labor.crossCheckHours,
      unsetCount: labor.crossCheckUnsetCount,
      typed: Number(draft.baseLaborHours) || 0,
      /*
        Nothing to compare against is not a comparison. With no components, or
        with none of them costed, "your parts add to 0 h" reads as a claim that
        the work is free — the same wrong-number-shaped failure as an unset
        height rendering 0'-0".
      */
      shown:
        draft.materials.length > 0 &&
        labor.crossCheckUnsetCount < draft.materials.length,
    };
  }, [draft.baseLaborHours, draft.materials]);

  // resolveLaborRate, not a bare find: an assembly that referenced a starter
  // role keeps that id after the role is forked, and the fork is what it means.
  const selectedRate = resolveLaborRate(laborRates, draft.laborRateId);
  const laborRate = selectedRate?.effectiveHourlyRate ?? 0;

  // Re-point the draft at the fork once one exists. Without this the role
  // dropdown blanks out after a quick edit — its value is an id the list no
  // longer contains — and saving would persist the superseded reference.
  useEffect(() => {
    if (!selectedRate) return;
    if (selectedRate.id === draft.laborRateId) return;
    setDraft(d => ({ ...d, laborRateId: selectedRate.id }));
  }, [selectedRate, draft.laborRateId]);

  const appliedModifiers = useMemo(
    () =>
      modifiers
        .filter(m => draft.modifierIds.includes(m.id))
        .map(m => ({
          name: m.name,
          laborAdjustmentPct: m.laborAdjustmentPctValue,
        })),
    [modifiers, draft.modifierIds]
  );

  const addMaterial = (material: PickableMaterial) => {
    let already = false;
    setDraft(d => {
      if (d.materials.some(line => line.materialId === material.id)) {
        already = true;
        return d;
      }
      return {
        ...d,
        materials: [
          ...d.materials,
          {
            materialId: material.id,
            // Consumables carry a suggested count — you never fit one wire nut.
            // Still just a suggestion: the field focuses next, ready to change.
            qty: material.defaultQty != null ? Number(material.defaultQty) : 1,
            name: material.name,
            unitOfSale: material.unitOfSale as MaterialLine["unitOfSale"],
            costPerUnit: Number(material.costPerUnit),
            // A material just picked from the catalog brings its own unit and
            // no override — the recipe has not disagreed with anything yet.
            laborHours: material.laborHours ?? null,
            overrideLaborHours: null,
            // Nothing is branch wire until the estimator says it is. Guessing
            // from the category would mark the panel's feeder as a whip.
            isBranchWhip: false,
          },
        ],
      };
    });

    if (already) {
      toast.info(
        `"${material.name}" is already in this assembly — adjust its quantity instead.`
      );
      materialSearchRef.current?.focus();
      return;
    }

    // Hand the keyboard to the new row's quantity, which selects its own text.
    setFocusQtyFor(material.id);
  };

  // The second half of the keyboard loop is handled by `autoFocus` on the new
  // row's quantity input — see the material list below. An effect that hunted
  // for the node raced React's commit and lost; autoFocus fires on mount, which
  // is exactly the moment the row appears.

  const save = () => {
    if (!draft.name.trim()) {
      toast.error("Give the assembly a name.");
      return;
    }
    const hours = Number(draft.baseLaborHours);
    if (
      draft.baseLaborHours.trim() === "" ||
      Number.isNaN(hours) ||
      hours < 0
    ) {
      toast.error("Enter labor hours (0 or more).");
      return;
    }
    const overhead = Number(draft.overheadLaborHours);
    if (
      draft.overheadLaborHours.trim() === "" ||
      Number.isNaN(overhead) ||
      overhead < 0
    ) {
      toast.error("Assembly overhead must be 0 or more hours.");
      return;
    }
    if (draft.materials.some(line => !(line.qty >= 0))) {
      toast.error("Every material needs a quantity of 0 or more.");
      return;
    }
    onSave({ ...draft, name: draft.name.trim() });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={onCancel}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {isNew ? "New assembly" : draft.name || "Assembly"}
            </h1>
            {isStarter && (
              <p className="text-xs text-muted-foreground">
                This is a starter assembly — saving gives you your own copy and
                leaves the original alone.
              </p>
            )}
          </div>
          {canRevert && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              onClick={onRevert}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Revert
            </Button>
          )}
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={save}>
            <Check className="w-3.5 h-3.5" /> Save assembly
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4 min-w-0">
            {/* Identity */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <Input
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="Assembly name — e.g. Install 20A receptacle"
                className="h-9 text-sm"
                autoFocus={isNew}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={draft.category}
                  onValueChange={v =>
                    setDraft({ ...draft, category: v as Category })
                  }
                >
                  <SelectTrigger
                    className="h-8 w-52 text-sm"
                    aria-label="Category"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={draft.trade}
                  onChange={e => setDraft({ ...draft, trade: e.target.value })}
                  className="h-8 w-32 text-sm"
                  placeholder="Trade"
                  aria-label="Trade"
                />

                <Select
                  value={draft.projectType ?? NO_PROJECT_TYPE}
                  onValueChange={v =>
                    setDraft({
                      ...draft,
                      projectType:
                        v === NO_PROJECT_TYPE ? null : (v as ProjectType),
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8 w-36 text-sm"
                    aria-label="Project type"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT_TYPE}>
                      <span className="text-muted-foreground">
                        No project type
                      </span>
                    </SelectItem>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Category drives takeoff layers and is a fixed list. Project type
                only filters the library — it never splits it in two.
              </p>
            </div>

            {/* Materials */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <MaterialPicker
                  inputRef={materialSearchRef}
                  onChoose={addMaterial}
                  exclude={draft.materials.map(l => l.materialId)}
                  placeholder="Search materials to add — try “1900”, “romex”, “gem box”…"
                  ariaLabel="Search materials to add"
                  showQty
                />
              </div>

              {draft.materials.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No materials yet. Search above to add the parts this assembly
                  uses.
                </div>
              ) : (
                draft.materials.map((line, index) => (
                  <div
                    key={line.materialId}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group"
                  >
                    <span className="flex-1 min-w-0 text-sm truncate">
                      {line.name}
                    </span>
                    <Input
                      value={String(line.qty)}
                      onChange={e => {
                        const qty = Number(e.target.value);
                        setDraft(d => ({
                          ...d,
                          materials: d.materials.map((l, i) =>
                            i === index
                              ? { ...l, qty: Number.isNaN(qty) ? 0 : qty }
                              : l
                          ),
                        }));
                      }}
                      className="h-7 w-20 text-sm text-right"
                      inputMode="decimal"
                      onFocus={e => {
                        const el = e.currentTarget;
                        selectOnFocus(e);
                        // autoFocus fires during React's commit, which can land
                        // before the value is in the DOM — so the synchronous
                        // select finds nothing. Re-select a frame later for
                        // that path only, leaving ordinary focus untouched.
                        if (line.materialId === focusQtyFor) {
                          window.setTimeout(() => el.select(), 0);
                        }
                        setFocusQtyFor(null);
                      }}
                      data-qty-for={line.materialId}
                      // Mounts focused when this is the row just added, handing
                      // the keyboard straight to the quantity.
                      autoFocus={line.materialId === focusQtyFor}
                      onKeyDown={e => {
                        // Close the loop: Enter here hands the keyboard back to
                        // search, ready for the next material.
                        if (e.key === "Enter") {
                          e.preventDefault();
                          materialSearchRef.current?.focus();
                        }
                      }}
                      aria-label={`Quantity of ${line.name}`}
                    />
                    <span className="text-xs text-muted-foreground w-12 shrink-0">
                      {line.unitOfSale === "foot" ? "ft" : line.unitOfSale}
                    </span>
                    {/*
                      WHICH LINE IS THE WIRE TO THE NEXT DEVICE (D18).

                      A per-ROW control rather than one picker under the list,
                      because the data allows more than one marked line and a
                      single picker would silently drop the others on save —
                      rule 7 again. It maps one-to-one with what is stored, so
                      there is nothing it can fail to round-trip.

                      Quiet when off: an outline button that says what it would
                      do. Most rows are never marked, and a loud control on
                      every part of every recipe is the clutter § "Customization
                      available, but never in the way" is about.
                    */}
                    <Button
                      size="sm"
                      variant={line.isBranchWhip ? "secondary" : "ghost"}
                      className={cn(
                        "h-7 px-2 text-[0.7rem] shrink-0",
                        line.isBranchWhip
                          ? "text-foreground"
                          : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      )}
                      onClick={() =>
                        setDraft(d => ({
                          ...d,
                          materials: d.materials.map((l, i) =>
                            i === index
                              ? { ...l, isBranchWhip: !l.isBranchWhip }
                              : l
                          ),
                        }))
                      }
                      aria-pressed={line.isBranchWhip}
                      aria-label={`Mark ${line.name} as the branch wire to the next device`}
                      title="Branch wire — the cable this device carries to the next one"
                    >
                      Branch wire
                    </Button>
                    <span className="font-mono text-sm w-20 text-right shrink-0">
                      {money(line.costPerUnit * line.qty)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setDraft(d => ({
                          ...d,
                          materials: d.materials.filter((_, i) => i !== index),
                        }))
                      }
                      aria-label={`Remove ${line.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Labor */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Labor
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={
                    draft.laborRateId != null
                      ? String(draft.laborRateId)
                      : NO_ROLE
                  }
                  onValueChange={v =>
                    setDraft({
                      ...draft,
                      laborRateId: v === NO_ROLE ? null : Number(v),
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8 w-56 text-sm"
                    aria-label="Labor role"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE}>
                      <span className="text-muted-foreground">
                        No role picked
                      </span>
                    </SelectItem>
                    {laborRates.map(rate => (
                      <SelectItem key={rate.id} value={String(rate.id)}>
                        {rate.name} — {money(rate.effectiveHourlyRate)}/hr
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedRate && (
                  <LaborRateQuickEdit
                    rate={selectedRate as never}
                    onSaved={() => {
                      /* the query invalidation inside re-reads the rate */
                    }}
                  />
                )}

                <div className="flex items-center gap-1.5">
                  <Input
                    value={draft.baseLaborHours}
                    onChange={e => {
                      setHoursTouched(true);
                      setDraft({ ...draft, baseLaborHours: e.target.value });
                    }}
                    className="h-8 w-24 text-sm text-right"
                    inputMode="decimal"
                    onFocus={selectOnFocus}
                    aria-label="Base labor hours"
                  />
                  <span className="text-xs text-muted-foreground">
                    hours{suggestion.perUnit === "ft" ? " per ft" : ""}
                  </span>
                </div>
              </div>

              {/*
                THE CROSS-CHECK. INFORMATION, NEVER A CORRECTION.

                What the parts come to, beside what was typed. It is muted body
                text on purpose — not amber, not a warning, no icon — because
                **the gap is the point, not a mistake.** 0.45 typed against 0.62
                of parts is a 27% efficiency claim: doing the whole rough-in in
                one operation instead of five separate jobs. A screen that
                nagged toward closing that gap would be arguing with the model
                and would teach the estimator to make their honest number worse.
                See ASSEMBLIES_PLAN.md § "What must come with it".

                It NEVER changes what the assembly prices at. The typed number
                is the whole answer; `laborForAssembly` returns the two under
                names that make adding them read as the mistake it is.

                It is hidden only when there is genuinely nothing to compare —
                no components at all, or not one of them costed — because "your
                parts add to 0" is not a cross-check, it is a number pretending
                to be one.
              */}
              {crossCheck.shown && (
                <p className="text-xs text-muted-foreground">
                  Your parts add to {round(crossCheck.hours, 3)} h; you typed{" "}
                  {round(crossCheck.typed, 3)} h.
                  {crossCheck.unsetCount > 0 && (
                    <>
                      {" "}
                      {crossCheck.unsetCount} of {draft.materials.length} have
                      no labor unit set, so the parts total is short by whatever
                      those take.
                    </>
                  )}
                </p>
              )}

              {draft.laborRateId === null && (
                <p className="text-xs text-destructive">
                  No role picked — labor prices at $0 until you choose one.
                </p>
              )}

              {showsPlaceholderHours && (
                <p className="text-xs text-[#F5C518]">
                  {suggestion.hours} h is a starting placeholder (
                  {suggestion.basis}), not a verified labor unit. Replace it
                  with your own figure.
                </p>
              )}

              {/*
                Assembly overhead — explained, not left as a bare number.

                It gets the same treatment as the productivity factor in
                Settings, and for the same reason: the NAME does not tell you
                what it does, and an unexplained hours box invites someone to
                use it as a fudge factor. The text says what belongs in it, what
                does not, and where it lands in the arithmetic.
              */}
              <div className="border-t border-border pt-3 mt-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Assembly overhead</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={draft.overheadLaborHours}
                      onChange={e =>
                        setDraft({
                          ...draft,
                          overheadLaborHours: e.target.value,
                        })
                      }
                      className="h-8 w-24 text-sm text-right"
                      inputMode="decimal"
                      onFocus={selectOnFocus}
                      aria-label="Assembly overhead hours"
                    />
                    <span className="text-xs text-muted-foreground">hours</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Extra time for setup, testing or cleanup that is not tied to a
                  specific material — laying the job out, ringing it out at the
                  end, the trip. Leave it at 0 unless this assembly really
                  carries time the material lines above do not explain.
                </p>
                <p className="text-xs text-muted-foreground">
                  Added to the hours above before any modifiers are applied, so
                  job conditions scale it too. It is a fixed number of hours for
                  this one assembly — not a percentage, and nothing to do with
                  the company-wide productivity factor in Settings.
                </p>
                {Number(draft.overheadLaborHours) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {round(Number(draft.baseLaborHours) || 0, 3)} h +{" "}
                    {round(Number(draft.overheadLaborHours) || 0, 3)} h ={" "}
                    <span className="text-foreground font-medium">
                      {round(
                        (Number(draft.baseLaborHours) || 0) +
                          (Number(draft.overheadLaborHours) || 0),
                        3
                      )}{" "}
                      h
                    </span>{" "}
                    before modifiers.
                  </p>
                )}
              </div>
            </div>

            {/* Modifiers */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Modifiers that apply
              </div>
              {modifiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active modifiers. Add some on the Modifiers screen first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {modifiers.map(modifier => {
                    const on = draft.modifierIds.includes(modifier.id);
                    return (
                      <button
                        key={modifier.id}
                        onClick={() =>
                          setDraft(d => ({
                            ...d,
                            modifierIds: on
                              ? d.modifierIds.filter(id => id !== modifier.id)
                              : [...d.modifierIds, modifier.id],
                          }))
                        }
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs border transition-colors",
                          on
                            ? "border-[#F5C518]/40 bg-[#F5C518]/10 text-[#F5C518]"
                            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        )}
                      >
                        {modifier.name}{" "}
                        <span className="font-mono">
                          {modifier.laborAdjustmentPctValue > 0 ? "+" : ""}
                          {round(modifier.laborAdjustmentPctValue * 100, 2)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Live preview */}
          <div className="lg:sticky lg:top-0 h-fit">
            <CostPreview
              draft={draft}
              laborRate={laborRate}
              modifierPcts={appliedModifiers}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── List + page shell ────────────────────────────────────────────────────────

export default function AssembliesLibraryPage() {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  /** The assembly being duplicated, and the name proposed for the copy. */
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
  const { data: assemblies = [], isLoading } = trpc.assemblies.list.useQuery({
    status: view,
  });
  const { data: archivedRows = [] } = trpc.assemblies.list.useQuery({
    status: "archived",
  });
  const detailQuery = trpc.assemblies.get.useQuery(
    { id: editingId ?? 0 },
    { enabled: editingId !== null }
  );

  const refresh = useCallback(() => {
    void utils.assemblies.list.invalidate();
  }, [utils]);

  const createAssembly = trpc.assemblies.create.useMutation({
    onError: error => toast.error(error.message),
    onSettled: refresh,
  });

  const updateAssembly = trpc.assemblies.update.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: result => {
      if (result?.forked)
        toast.success("Saved as your own copy — the starter is unchanged.");
      else toast.success("Assembly saved");
    },
    onSettled: () => {
      refresh();
      if (editingId !== null)
        void utils.assemblies.get.invalidate({ id: editingId });
    },
  });

  const revertAssembly = trpc.assemblies.revert.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => toast.success("Restored the starter recipe"),
    onSettled: () => {
      refresh();
      if (editingId !== null)
        void utils.assemblies.get.invalidate({ id: editingId });
    },
  });

  const duplicateAssembly = trpc.assemblies.duplicate.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: copy => {
      if (!copy) return;
      toast.success(`Created "${copy.name}" — an independent copy.`);
      setEditingId(copy.id);
    },
    onSettled: refresh,
  });

  const archiveAssembly = trpc.assemblies.archive.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () =>
      toast.success("Archived — restore it any time from the Archived tab"),
    onSettled: refresh,
  });

  const restoreAssembly = trpc.assemblies.restore.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => toast.success("Back in the working list."),
    onSettled: refresh,
  });

  const deleteAssemblyForever = trpc.assemblies.deleteForever.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => toast.success("Deleted permanently."),
    onSettled: refresh,
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Scope before search, so the count on the filter matches what shows.
    const rows = filterByScope(assemblies as Assembly[], scope);
    if (!q) return rows;
    return rows.filter(
      a =>
        a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    );
  }, [assemblies, query, scope]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, Assembly[]>();
    for (const assembly of visible) {
      const bucket = byCategory.get(assembly.category);
      if (bucket) bucket.push(assembly);
      else byCategory.set(assembly.category, [assembly]);
    }
    return CATEGORIES.map(category => ({
      category,
      items: byCategory.get(category) ?? [],
    })).filter(group => group.items.length > 0);
  }, [visible]);

  // ── Builder mode ──
  if (creating) {
    return (
      <AssemblyBuilder
        initial={emptyDraft()}
        isStarter={false}
        canRevert={false}
        onCancel={() => setCreating(false)}
        onRevert={() => {}}
        onSave={draft => {
          createAssembly.mutate({
            name: draft.name,
            category: draft.category,
            trade: draft.trade,
            projectType: draft.projectType,
            baseLaborHours: Number(draft.baseLaborHours),
            overheadLaborHours: Number(draft.overheadLaborHours),
            laborRateId: draft.laborRateId,
            materials: draft.materials.map(m => ({
              materialId: m.materialId,
              qty: m.qty,
              // Round-trips, so saving a recipe cannot unmark its whips.
              isBranchWhip: m.isBranchWhip,
            })),
            modifierIds: draft.modifierIds,
          });
          toast.success(`Created "${draft.name}"`);
          setCreating(false);
        }}
      />
    );
  }

  if (editingId !== null) {
    const detail = detailQuery.data;
    if (!detail) {
      return (
        <div className="flex flex-col h-full bg-background items-center justify-center text-sm text-muted-foreground">
          Loading assembly…
        </div>
      );
    }
    const initial: Draft = {
      name: detail.name,
      category: detail.category as Category,
      trade: detail.trade,
      projectType: (detail.projectType as ProjectType | null) ?? null,
      baseLaborHours: String(Number(detail.baseLaborHours)),
      overheadLaborHours: String(Number(detail.overheadLaborHours)),
      laborRateId: detail.laborRateId,
      materials: detail.materials.map(m => ({
        materialId: m.materialId,
        qty: Number(m.qty),
        name: m.name,
        unitOfSale: m.unitOfSale,
        costPerUnit: Number(m.costPerUnit),
        laborHours: m.laborHours,
        overrideLaborHours: m.overrideLaborHours,
        isBranchWhip: m.isBranchWhip,
      })),
      modifierIds: detail.modifierIds,
    };
    return (
      <AssemblyBuilder
        key={detail.id}
        initial={initial}
        isStarter={detail.userId === null}
        canRevert={detail.baselineId != null && detail.userId !== null}
        onCancel={() => setEditingId(null)}
        onRevert={() => revertAssembly.mutate({ id: detail.id })}
        onSave={draft => {
          updateAssembly.mutate(
            {
              id: detail.id,
              name: draft.name,
              category: draft.category,
              trade: draft.trade,
              projectType: draft.projectType,
              baseLaborHours: Number(draft.baseLaborHours),
              overheadLaborHours: Number(draft.overheadLaborHours),
              laborRateId: draft.laborRateId,
              materials: draft.materials.map(m => ({
                materialId: m.materialId,
                qty: m.qty,
                // Round-trips, so saving a recipe cannot unmark its whips.
                isBranchWhip: m.isBranchWhip,
              })),
              modifierIds: draft.modifierIds,
            },
            {
              // Editing a starter forks it, and the fork has a different id —
              // follow it so the screen is editing the row that now holds the edit.
              onSuccess: result => {
                if (result?.assembly && result.assembly.id !== detail.id) {
                  setEditingId(result.assembly.id);
                }
              },
            }
          );
        }}
      />
    );
  }

  // ── List mode ──
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Assemblies</h1>
            <p className="text-xs text-muted-foreground">
              Reusable recipes combining materials, labor and job conditions.
              Starter recipes and their hours are placeholders — tune them to
              your own work.
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs shrink-0"
            onClick={() => setCreating(true)}
          >
            <Plus className="w-3.5 h-3.5" /> New assembly
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <LibraryTabs group="assemblies" current="assemblies" />
        {/* Above the list, because it proposes a change to something in it. */}
        <HourSuggestions />
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search assemblies…"
            className="h-9 pl-9 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <ViewTabs
            view={view}
            onChange={setView}
            archivedCount={archivedRows.length}
          />
          <ScopeFilter
            scope={scope}
            onChange={setScope}
            counts={scopeCounts(assemblies as Assembly[])}
          />
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            <span className="flex-1">Assembly</span>
            <span className="w-24 text-right shrink-0">Hours</span>
            <span className="w-20 shrink-0" />
          </div>

          {isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading assemblies…
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {query ? (
                <>No assemblies match “{query}”.</>
              ) : (
                <>No assemblies yet. Build your first one.</>
              )}
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.category}>
                <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/40 border-b border-border">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.category}
                  </span>
                  <span className="text-xs text-muted-foreground/70">
                    {group.items.length}
                  </span>
                </div>
                {group.items.map(assembly => (
                  <div
                    key={assembly.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group"
                  >
                    <button
                      onClick={() => setEditingId(assembly.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {assembly.name}
                        </span>
                        <OriginBadge assembly={assembly} />
                        {assembly.projectType &&
                          assembly.projectType !== "both" && (
                            <span className="text-xs text-muted-foreground capitalize">
                              {assembly.projectType}
                            </span>
                          )}
                      </div>
                    </button>

                    {/* The hours this assembly actually costs — material work
                        plus its own overhead. Showing the base alone would
                        disagree with what lands on a bid. */}
                    <span
                      className="font-mono text-sm w-24 text-right shrink-0"
                      title={
                        Number(assembly.overheadLaborHours) > 0
                          ? `${round(Number(assembly.baseLaborHours), 3)} h of work + ${round(Number(assembly.overheadLaborHours), 3)} h assembly overhead`
                          : undefined
                      }
                    >
                      {round(
                        addAssemblyOverheadHours(
                          Number(assembly.baseLaborHours),
                          Number(assembly.overheadLaborHours)
                        ),
                        3
                      )}{" "}
                      h
                    </span>

                    <div className="flex items-center gap-0.5 w-20 justify-end shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                        onClick={() => setEditingId(assembly.id)}
                        title={
                          assembly.userId === null
                            ? "Open — editing creates your own copy"
                            : "Open"
                        }
                        aria-label={`Edit ${assembly.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                        onClick={() =>
                          setDuplicating({
                            id: assembly.id,
                            name: `${assembly.name} (copy)`,
                          })
                        }
                        title="Duplicate — a separate assembly, not a copy of this one"
                        aria-label={`Duplicate ${assembly.name}`}
                      >
                        <CopyIcon className="w-3.5 h-3.5" />
                      </Button>
                      {view === "archived" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() =>
                              restoreAssembly.mutate({ id: assembly.id })
                            }
                            aria-label={`Restore ${assembly.name}`}
                          >
                            <RotateCcw className="w-3 h-3" /> Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setPendingDelete({
                                id: assembly.id,
                                name: assembly.name,
                              })
                            }
                            title="Delete permanently — cannot be undone"
                            aria-label={`Delete ${assembly.name} forever`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        /* Offered on starters too — archiving one forks it
                           first, so the shared row is untouched. */
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setPendingArchive({
                              id: assembly.id,
                              name: assembly.name,
                            })
                          }
                          title="Archive — out of the working list, restorable any time"
                          aria-label={`Archive ${assembly.name}`}
                        >
                          <ArchiveIcon className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Adding an assembly to a project snapshots its costs at that moment, so
          a submitted bid never changes because a material price moved later.
        </p>
      </div>

      {/* Naming the copy. A duplicate is a NEW assembly, so it needs its own name. */}
      <AlertDialog
        open={duplicating !== null}
        onOpenChange={open => !open && setDuplicating(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate assembly</AlertDialogTitle>
            <AlertDialogDescription>
              This makes a separate assembly with the same materials, labor and
              modifiers. It is not linked to the original — editing either one
              leaves the other alone.
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
              duplicateAssembly.mutate({
                id: duplicating.id,
                name: duplicating.name.trim(),
              });
              setDuplicating(null);
            }}
            className="h-9 text-sm"
            placeholder="Name for the copy"
            aria-label="Name for the duplicate"
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
                duplicateAssembly.mutate({
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
        noun="assembly"
        stillUsedNote="Bids that already use it are untouched — their line items froze their costs when they were added."
        onClose={() => setPendingArchive(null)}
        onConfirm={id => archiveAssembly.mutate({ id })}
      />
      <DeleteForeverDialog
        pending={pendingDelete}
        noun="assembly"
        keepsNote="Bids that already used it keep the costs they were priced with."
        onClose={() => setPendingDelete(null)}
        onConfirm={id => deleteAssemblyForever.mutate({ id })}
      />
    </div>
  );
}
