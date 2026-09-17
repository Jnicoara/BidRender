/**
 * LaborRatesPage — the Foundation labor-rate catalog (Library § Labor Rates).
 *
 * Roles are free text and fully user-extensible; the starter set is only a
 * starting point and is labelled as such on screen. Fork-on-edit works exactly
 * as it does on the Materials screen — editing a starter quietly gives the user
 * their own copy, and the row's id changes underneath us when that happens.
 *
 * ── Salary roles ─────────────────────────────────────────────────────────────
 * A salaried role stores annual salary and working hours, never a computed
 * rate. The effective hourly figure shown here comes from effectiveHourlyRate
 * in @shared/pricing — the same function the server and the bid math use, so
 * the number on this screen cannot disagree with the number in a bid.
 *
 * ── Responsiveness (CLAUDE.md § Responsiveness) ──────────────────────────────
 * Edits apply optimistically and save behind the UI; there is no spinner on a
 * save. The list is deliberately NOT paginated: a contractor's roster of roles
 * is bounded at a couple of dozen by the nature of an org chart, so windowing
 * would add machinery with nothing to window.
 */
import { useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { ScopeFilter } from "@/components/library/LibraryControls";
import {
  filterByScope,
  scopeCounts,
  type LibraryScope,
} from "@/lib/libraryScope";
import {
  Check,
  HardHat,
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
import { DEFAULT_ANNUAL_HOURS, effectiveHourlyRate } from "@shared/pricing";
import { countNeedingRate, needsRate } from "@shared/laborRatePricing";
import { money, moneyWhole } from "@/lib/money";

// ─── Types & helpers ──────────────────────────────────────────────────────────

type RateType = "hourly" | "salary";

type LaborRate = {
  id: number;
  userId: number | null;
  baselineId: number | null;
  name: string;
  rateType: RateType;
  hourlyCost: string;
  annualSalary: string | null;
  annualHours: string | null;
  effectiveHourlyRate: number;
  rateError?: string;
};

/** Mirrors the bounds the router enforces. */
const MAX_HOURLY = 999999.9999;
const MAX_SALARY = 9999999999.99;
const MAX_ANNUAL_HOURS = 8760;

const hours = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 0 });

type Draft = {
  name: string;
  rateType: RateType;
  hourlyCost: string;
  annualSalary: string;
  annualHours: string;
};

const emptyDraft: Draft = {
  name: "",
  rateType: "hourly",
  hourlyCost: "",
  annualSalary: "",
  annualHours: String(DEFAULT_ANNUAL_HOURS),
};

const draftFrom = (rate: LaborRate): Draft => ({
  name: rate.name,
  rateType: rate.rateType,
  hourlyCost: String(Number(rate.hourlyCost)),
  annualSalary:
    rate.annualSalary != null ? String(Number(rate.annualSalary)) : "",
  annualHours:
    rate.annualHours != null
      ? String(Number(rate.annualHours))
      : String(DEFAULT_ANNUAL_HOURS),
});

/** Shared validation for the add form and inline edits. */
function validateDraft(draft: Draft): string | null {
  if (!draft.name.trim()) return "Give the role a name.";

  if (draft.rateType === "hourly") {
    const rate = Number(draft.hourlyCost);
    if (draft.hourlyCost.trim() === "" || Number.isNaN(rate))
      return "Enter an hourly rate.";
    if (rate < 0) return "An hourly rate cannot be negative.";
    if (rate > MAX_HOURLY) return "That hourly rate is too large.";
    return null;
  }

  const salary = Number(draft.annualSalary);
  if (draft.annualSalary.trim() === "" || Number.isNaN(salary))
    return "Enter an annual salary.";
  if (salary < 0) return "A salary cannot be negative.";
  if (salary > MAX_SALARY) return "That salary is too large.";

  const working = Number(draft.annualHours);
  if (draft.annualHours.trim() === "" || Number.isNaN(working))
    return "Enter the working hours per year.";
  // Zero hours is a division by zero, not a free employee.
  if (working <= 0) return "Working hours per year must be greater than zero.";
  if (working > MAX_ANNUAL_HOURS)
    return `There are only ${MAX_ANNUAL_HOURS} hours in a year.`;
  return null;
}

/** What a draft would cost per hour. Same math as the server, via @shared. */
function draftHourlyRate(draft: Draft): number | null {
  try {
    if (draft.rateType === "hourly") {
      const rate = Number(draft.hourlyCost);
      return Number.isFinite(rate) ? rate : null;
    }
    return effectiveHourlyRate(
      Number(draft.annualSalary),
      Number(draft.annualHours)
    );
  } catch {
    return null;
  }
}

// ─── Origin badge ─────────────────────────────────────────────────────────────

function OriginBadge({ rate }: { rate: LaborRate }) {
  if (rate.userId === null) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Starter
      </Badge>
    );
  }
  if (rate.baselineId != null) {
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

// ─── Rate editor (shared by add form and inline edit) ─────────────────────────

function RateFields({
  draft,
  onChange,
  autoFocusName,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  autoFocusName?: boolean;
}) {
  const preview = draftHourlyRate(draft);

  return (
    <>
      <Input
        value={draft.name}
        onChange={e => onChange({ ...draft, name: e.target.value })}
        className="h-8 flex-1 min-w-[10rem] text-sm"
        placeholder="Role name"
        autoFocus={autoFocusName}
      />

      <Select
        value={draft.rateType}
        onValueChange={value =>
          onChange({ ...draft, rateType: value as RateType })
        }
      >
        <SelectTrigger className="h-8 w-28 text-sm" aria-label="Rate type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hourly">Hourly</SelectItem>
          <SelectItem value="salary">Salary</SelectItem>
        </SelectContent>
      </Select>

      {draft.rateType === "hourly" ? (
        <div className="flex items-center gap-1.5">
          <Input
            value={draft.hourlyCost}
            onChange={e => onChange({ ...draft, hourlyCost: e.target.value })}
            className="h-8 w-24 text-sm text-right"
            inputMode="decimal"
            onFocus={selectOnFocus}
            placeholder="0.00"
            aria-label="Hourly rate"
          />
          <span className="text-xs text-muted-foreground">/hr</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            value={draft.annualSalary}
            onChange={e => onChange({ ...draft, annualSalary: e.target.value })}
            className="h-8 w-28 text-sm text-right"
            inputMode="decimal"
            onFocus={selectOnFocus}
            placeholder="60000"
            aria-label="Annual salary"
          />
          <span className="text-xs text-muted-foreground">/yr ÷</span>
          <Input
            value={draft.annualHours}
            onChange={e => onChange({ ...draft, annualHours: e.target.value })}
            className="h-8 w-20 text-sm text-right"
            inputMode="decimal"
            placeholder={String(DEFAULT_ANNUAL_HOURS)}
            onFocus={selectOnFocus}
            aria-label="Working hours per year"
          />
          <span className="text-xs text-muted-foreground">h</span>
          {preview !== null && (
            <span className="text-xs font-mono text-[#F5C518] whitespace-nowrap">
              = {money(preview)}/hr
            </span>
          )}
        </div>
      )}
    </>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function LaborRateRow({
  rate,
  onSave,
  onRevert,
  onRemove,
}: {
  rate: LaborRate;
  onSave: (id: number, draft: Draft) => void;
  onRevert: (rate: LaborRate) => void;
  onRemove: (rate: LaborRate) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = () => {
    const problem = validateDraft(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    // Fire and forget — the row updates from cache immediately.
    onSave(rate.id, draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border last:border-0 bg-muted/20">
        <RateFields draft={draft} onChange={setDraft} autoFocusName />
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

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{rate.name}</span>
          <OriginBadge rate={rate} />
        </div>
        {rate.rateType === "salary" && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {rate.annualSalary != null && moneyWhole(Number(rate.annualSalary))}
            /yr
            {rate.annualHours != null && (
              <> ÷ {hours(Number(rate.annualHours))} h</>
            )}
          </div>
        )}
      </div>

      <span className="text-xs text-muted-foreground w-14 shrink-0 capitalize">
        {rate.rateType}
      </span>

      {/* The rate column doubles as the prompt, exactly as the Materials cost
          column does — and with more riding on it. A starter role ships at $0
          and "$0.00/hr" reads as a real rate of nothing, which prices the
          labor on every line of every bid at zero while still looking like a
          finished number. */}
      <span className="text-sm font-mono w-28 text-right shrink-0">
        {rate.rateError ? (
          <span className="text-destructive text-xs font-sans">Set hours</span>
        ) : needsRate(rate) ? (
          <span
            className="text-xs font-sans font-medium text-[#F5C518]"
            title="No rate yet — this prices every hour on every bid at nothing until you set one."
          >
            Needs rate
          </span>
        ) : (
          <>
            {money(rate.effectiveHourlyRate)}
            <span className="text-muted-foreground">/hr</span>
          </>
        )}
      </span>

      <div className="flex items-center gap-0.5 w-28 justify-end shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          onClick={() => {
            setDraft(draftFrom(rate));
            setEditing(true);
          }}
          title={rate.userId === null ? "Edit — creates your own copy" : "Edit"}
          aria-label={`Edit ${rate.name}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>

        {rate.baselineId != null && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            onClick={() => onRevert(rate)}
            title="Undo your changes and restore the starter values"
            aria-label={`Revert ${rate.name}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}

        {rate.userId !== null &&
          (confirmRemove ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => {
                setConfirmRemove(false);
                onRemove(rate);
              }}
            >
              Sure?
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              onClick={() => {
                setConfirmRemove(true);
                window.setTimeout(() => setConfirmRemove(false), 3000);
              }}
              title="Remove from your library"
              aria-label={`Remove ${rate.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LaborRatesPage() {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);

  const utils = trpc.useUtils();
  const { data: rates = [], isLoading } = trpc.laborRates.list.useQuery();
  const [scope, setScope] = useState<LibraryScope>("all");
  /** Scope is a view filter only — labor rates have no archive of their own. */
  // (scope is applied in `visible` below, alongside the search filter)

  /**
   * Optimistic write helper. Snapshots the list, applies `apply` to the cache
   * immediately, and hands back a rollback for onError. Every mutation below
   * uses it, so no save ever blocks the UI on a round trip.
   */
  const optimistic = useCallback(
    async (apply: (rows: LaborRate[]) => LaborRate[]) => {
      await utils.laborRates.list.cancel();
      const previous = utils.laborRates.list.getData();
      utils.laborRates.list.setData(
        undefined,
        old => apply((old ?? []) as LaborRate[]) as typeof old
      );
      return { previous };
    },
    [utils]
  );

  const rollback = useCallback(
    (
      context: { previous?: unknown } | undefined,
      error: { message: string }
    ) => {
      if (context?.previous !== undefined) {
        utils.laborRates.list.setData(undefined, context.previous as never);
      }
      toast.error(error.message);
    },
    [utils]
  );

  const settle = useCallback(() => {
    void utils.laborRates.list.invalidate();
  }, [utils]);

  const updateRate = trpc.laborRates.update.useMutation({
    onMutate: async vars =>
      optimistic(rows =>
        rows.map(row => {
          if (row.id !== vars.id) return row;
          const next: LaborRate = {
            ...row,
            name: vars.name ?? row.name,
            rateType: (vars.rateType ?? row.rateType) as RateType,
            hourlyCost:
              vars.hourlyCost != null
                ? String(vars.hourlyCost)
                : row.hourlyCost,
            annualSalary:
              vars.annualSalary != null
                ? String(vars.annualSalary)
                : row.annualSalary,
            annualHours:
              vars.annualHours != null
                ? String(vars.annualHours)
                : row.annualHours,
          };
          // Recompute the derived rate locally so the row never shows a stale
          // number for the instant before the server answers.
          next.effectiveHourlyRate =
            next.rateType === "hourly"
              ? Number(next.hourlyCost)
              : (() => {
                  try {
                    return effectiveHourlyRate(
                      Number(next.annualSalary ?? 0),
                      Number(next.annualHours ?? 0)
                    );
                  } catch {
                    return 0;
                  }
                })();
          return next;
        })
      ),
    onError: (error, _vars, context) => rollback(context, error),
    onSuccess: result => {
      if (result?.forked)
        toast.success("Saved as your own copy — the starter is unchanged.");
    },
    onSettled: settle,
  });

  const revertRate = trpc.laborRates.revert.useMutation({
    onError: (error, _vars, context) => rollback(context as never, error),
    onSuccess: () => toast.success("Restored the starter values"),
    onSettled: settle,
  });

  const removeRate = trpc.laborRates.remove.useMutation({
    onMutate: async vars =>
      optimistic(rows => rows.filter(row => row.id !== vars.id)),
    onError: (error, _vars, context) => rollback(context, error),
    onSettled: settle,
  });

  const createRate = trpc.laborRates.create.useMutation({
    onError: (error, _vars, context) => rollback(context as never, error),
    onSettled: settle,
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Scope before search, so the count on the filter matches what shows.
    const inScope = filterByScope(rates as LaborRate[], scope);
    if (!q) return inScope;
    return inScope.filter(r => r.name.toLowerCase().includes(q));
  }, [rates, query, scope]);

  const handleSave = useCallback(
    (id: number, draft: Draft) => {
      updateRate.mutate({
        id,
        name: draft.name.trim(),
        rateType: draft.rateType,
        ...(draft.rateType === "hourly"
          ? { hourlyCost: Number(draft.hourlyCost) }
          : {
              annualSalary: Number(draft.annualSalary),
              annualHours: Number(draft.annualHours),
            }),
      });
    },
    [updateRate]
  );

  const handleCreate = useCallback(() => {
    const problem = validateDraft(newDraft);
    if (problem) {
      toast.error(problem);
      return;
    }
    createRate.mutate({
      name: newDraft.name.trim(),
      rateType: newDraft.rateType,
      ...(newDraft.rateType === "hourly"
        ? { hourlyCost: Number(newDraft.hourlyCost) }
        : {
            annualSalary: Number(newDraft.annualSalary),
            annualHours: Number(newDraft.annualHours),
          }),
    });
    toast.success(`Added "${newDraft.name.trim()}"`);
    setNewDraft(emptyDraft);
    setAdding(false);
  }, [createRate, newDraft]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <HardHat className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Labor rates</h1>
            <p className="text-xs text-muted-foreground">
              What each role costs you per hour. Starter rates are placeholders,
              not market data — replace them with your own.
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs shrink-0"
            onClick={() => setAdding(v => !v)}
          >
            <Plus className="w-3.5 h-3.5" /> Add role
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search roles…"
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

        {adding && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <RateFields
                draft={newDraft}
                onChange={setNewDraft}
                autoFocusName
              />
              <div className="flex items-center gap-1 ml-auto">
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
          </div>
        )}

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            <span className="flex-1">Role</span>
            <span className="w-14 shrink-0">Type</span>
            <span className="w-28 text-right shrink-0">Effective rate</span>
            <span className="w-28 shrink-0" />
          </div>

          {isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading roles…
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {query ? (
                <>No roles match “{query}”.</>
              ) : (
                <>No roles yet. Add your first one to get started.</>
              )}
            </div>
          ) : (
            visible.map(rate => (
              <LaborRateRow
                key={rate.id}
                rate={rate}
                onSave={handleSave}
                onRevert={r => revertRate.mutate({ id: r.id })}
                onRemove={r => removeRate.mutate({ id: r.id })}
              />
            ))
          )}
        </div>

        <p className={cn("text-xs text-muted-foreground mt-2")}>
          Salaried roles are converted to an hourly cost using the working hours
          you enter — the default 2,080 is a full payroll year, but billable
          hours are usually lower. Editing a starter role gives you your own
          copy; the original stays untouched and can be restored any time.
        </p>
      </div>
    </div>
  );
}
