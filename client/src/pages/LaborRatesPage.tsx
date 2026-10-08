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
import {
  EXAMPLE_RATE_WHY,
  focusOnOpen,
  NEEDS_WHY,
  type NeedsField,
} from "@/lib/needsFix";
import {
  EXAMPLE_BURDEN,
  loadedRate,
  readParts,
  type LoadedParts,
} from "@shared/loadedRate";

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
  /** BidRidge's example loaded rate, not the shop's (0134). */
  isExampleRate?: boolean | null;
  /** The loaded rate's parts; all NULL = not broken down (0134). */
  baseWage?: string | null;
  payrollTaxPct?: string | null;
  workersCompPct?: string | null;
  insurancePct?: string | null;
  benefitsPct?: string | null;
};

/** Mirrors the bounds the router enforces. */
const MAX_HOURLY = 999999.9999;
const MAX_SALARY = 9999999999.99;
const MAX_ANNUAL_HOURS = 8760;

const hours = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * A loaded rate typed as its parts (0134): wage, then each burden as a
 * PERCENT the way people say it ("10"), stored as a fraction (0.10).
 */
type BreakdownDraft = {
  baseWage: string;
  payrollTaxPct: string;
  workersCompPct: string;
  insurancePct: string;
  benefitsPct: string;
};

const BURDEN_FIELDS = [
  ["payrollTaxPct", "Payroll tax"],
  ["workersCompPct", "Workers' comp"],
  ["insurancePct", "Insurance"],
  ["benefitsPct", "Benefits"],
] as const;

type Draft = {
  name: string;
  rateType: RateType;
  hourlyCost: string;
  annualSalary: string;
  annualHours: string;
  /** Null = the hourly rate is typed as one number. */
  breakdown: BreakdownDraft | null;
};

const emptyDraft: Draft = {
  name: "",
  rateType: "hourly",
  hourlyCost: "",
  annualSalary: "",
  annualHours: String(DEFAULT_ANNUAL_HOURS),
  breakdown: null,
};

const pctText = (fraction: number) =>
  String(Math.round(fraction * 10000) / 100);

const breakdownDraftFrom = (rate: LaborRate): BreakdownDraft | null => {
  const parts = readParts({
    baseWage: rate.baseWage ?? null,
    payrollTaxPct: rate.payrollTaxPct ?? null,
    workersCompPct: rate.workersCompPct ?? null,
    insurancePct: rate.insurancePct ?? null,
    benefitsPct: rate.benefitsPct ?? null,
  });
  if (!parts) return null;
  return {
    baseWage: String(parts.baseWage),
    payrollTaxPct: pctText(parts.payrollTaxPct),
    workersCompPct: pctText(parts.workersCompPct),
    insurancePct: pctText(parts.insurancePct),
    benefitsPct: pctText(parts.benefitsPct),
  };
};

/** The typed parts as numbers (burdens as fractions), or null if any is bad. */
function breakdownParts(b: BreakdownDraft): LoadedParts | null {
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const wage = num(b.baseWage);
  const pcts = BURDEN_FIELDS.map(([key]) => num(b[key]) / 100);
  if (!Number.isFinite(wage) || wage < 0 || wage > MAX_HOURLY) return null;
  if (pcts.some(p => !Number.isFinite(p) || p < 0 || p > 2)) return null;
  return {
    baseWage: wage,
    payrollTaxPct: pcts[0],
    workersCompPct: pcts[1],
    insurancePct: pcts[2],
    benefitsPct: pcts[3],
  };
}

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
  breakdown: rate.rateType === "hourly" ? breakdownDraftFrom(rate) : null,
});

/** Shared validation for the add form and inline edits. */
function validateDraft(draft: Draft): string | null {
  if (!draft.name.trim()) return "Give the role a name.";

  if (draft.rateType === "hourly" && draft.breakdown) {
    return breakdownParts(draft.breakdown)
      ? null
      : "Enter a wage, and each percentage from 0 to 200.";
  }
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
    if (draft.rateType === "hourly" && draft.breakdown) {
      const parts = breakdownParts(draft.breakdown);
      return parts ? loadedRate(parts) : null;
    }
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
  allowBreakdown,
  openedFor = null,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  autoFocusName?: boolean;
  /** Edit only — `create` takes one number; break it down after. */
  allowBreakdown?: boolean;
  /**
   * The warning that opened this editor, if one did: the cursor lands in the
   * number it named — the rate (or salary), or the yearly hours a salaried
   * role needs (@/lib/needsFix).
   */
  openedFor?: NeedsField | null;
}) {
  const preview = draftHourlyRate(draft);
  const b = draft.breakdown;

  return (
    <>
      <Input
        value={draft.name}
        onChange={e => onChange({ ...draft, name: e.target.value })}
        className="h-8 flex-1 min-w-[10rem] text-sm"
        placeholder="Role name"
        autoFocus={autoFocusName && focusOnOpen(openedFor, "name")}
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

      {draft.rateType === "hourly" && b ? (
        /* Wage + burden = loaded (0134). The loaded rate is what every bid
           uses; the parts are how the shop arrives at it. */
        <div className="basis-full flex flex-wrap items-center gap-1.5">
          <Input
            value={b.baseWage}
            onChange={e =>
              onChange({
                ...draft,
                breakdown: { ...b, baseWage: e.target.value },
              })
            }
            className="h-8 w-20 text-sm text-right"
            inputMode="decimal"
            onFocus={selectOnFocus}
            placeholder="0.00"
            aria-label="Base wage per hour"
            /*
              A rate built from a wage — every shipped example rate is — opens
              in this breakdown, so "the rate" a warning names is the wage.
              Without this, Example rate opened the editor with the cursor
              nowhere (measured on staging, 2026-10-08: focus = BODY).
            */
            autoFocus={focusOnOpen(openedFor, "rate")}
          />
          <span className="text-xs text-muted-foreground">wage</span>
          {BURDEN_FIELDS.map(([key, label]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">+</span>
              <Input
                value={b[key]}
                onChange={e =>
                  onChange({
                    ...draft,
                    breakdown: { ...b, [key]: e.target.value },
                  })
                }
                className="h-8 w-14 text-sm text-right"
                inputMode="decimal"
                onFocus={selectOnFocus}
                aria-label={`${label} percent`}
              />
              <span className="text-xs text-muted-foreground">
                % {label.toLowerCase()}
              </span>
            </span>
          ))}
          <span className="text-xs font-mono text-[#F5C518] whitespace-nowrap">
            = {preview !== null ? `${money(preview)}/hr` : "—"}
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() =>
              onChange({
                ...draft,
                breakdown: null,
                hourlyCost:
                  preview !== null ? String(preview) : draft.hourlyCost,
              })
            }
          >
            Type one number
          </button>
        </div>
      ) : draft.rateType === "hourly" ? (
        <div className="flex items-center gap-1.5">
          <Input
            value={draft.hourlyCost}
            onChange={e => onChange({ ...draft, hourlyCost: e.target.value })}
            className="h-8 w-24 text-sm text-right"
            inputMode="decimal"
            onFocus={selectOnFocus}
            placeholder="0.00"
            aria-label="Hourly rate"
            autoFocus={focusOnOpen(openedFor, "rate")}
          />
          <span className="text-xs text-muted-foreground">/hr</span>
          {allowBreakdown && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline whitespace-nowrap"
              title="Wage + payroll tax + workers' comp + insurance + benefits = your loaded rate"
              onClick={() =>
                onChange({
                  ...draft,
                  breakdown: {
                    baseWage: "",
                    payrollTaxPct: pctText(EXAMPLE_BURDEN.payrollTaxPct),
                    workersCompPct: pctText(EXAMPLE_BURDEN.workersCompPct),
                    insurancePct: pctText(EXAMPLE_BURDEN.insurancePct),
                    benefitsPct: pctText(EXAMPLE_BURDEN.benefitsPct),
                  },
                })
              }
            >
              Build from wage
            </button>
          )}
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
            autoFocus={focusOnOpen(openedFor, "rate")}
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
            autoFocus={focusOnOpen(openedFor, "hours")}
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
  /**
   * The warning that opened the editor and what it said, so the editor can
   * land on that number and show the reason as visible text — it used to be
   * a hover-only tooltip on the label (@/lib/needsFix).
   */
  const [openedFor, setOpenedFor] = useState<{
    field: NeedsField;
    why: string;
  } | null>(null);
  const openEditor = (opened: { field: NeedsField; why: string } | null) => {
    setDraft(draftFrom(rate));
    setOpenedFor(opened);
    setEditing(true);
  };
  const parts =
    rate.rateType === "hourly"
      ? readParts({
          baseWage: rate.baseWage ?? null,
          payrollTaxPct: rate.payrollTaxPct ?? null,
          workersCompPct: rate.workersCompPct ?? null,
          insurancePct: rate.insurancePct ?? null,
          benefitsPct: rate.benefitsPct ?? null,
        })
      : null;

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
        <RateFields
          draft={draft}
          onChange={setDraft}
          autoFocusName
          allowBreakdown
          openedFor={openedFor?.field ?? null}
        />
        {openedFor && (
          <p className="basis-full text-xs text-[#F5C518]" role="note">
            {openedFor.why}
          </p>
        )}
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
    PHONES GET A CARD, NOT A SQUEEZED ROW (device audit, 2026-10-01).

    The fixed columns — type, rate, actions — are nearly as wide as a 390px
    phone on their own, so the role name was squeezed to nothing and its badge
    was drawn on top of the type. Below md the row wraps instead: the name
    takes a whole first line and may wrap, and type, rate and buttons share the
    line under it. From md up every class below resolves to the old row.
  */
  return (
    <div className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1.5 md:gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group">
      <div className="basis-full md:flex-1 min-w-0">
        <div className="flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-1 md:gap-2">
          <span className="text-sm font-medium break-words min-w-0 md:truncate">
            {rate.name}
          </span>
          <OriginBadge rate={rate} />
        </div>
        {parts && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {money(parts.baseWage)} wage + {pctText(parts.payrollTaxPct)}%
            payroll tax + {pctText(parts.workersCompPct)}% comp +{" "}
            {pctText(parts.insurancePct)}% insurance +{" "}
            {pctText(parts.benefitsPct)}% benefits
          </div>
        )}
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

      <span className="text-xs text-muted-foreground md:w-14 shrink-0 capitalize">
        {rate.rateType}
      </span>

      {/* The rate column doubles as the prompt, exactly as the Materials cost
          column does — and with more riding on it. A starter role ships at $0
          and "$0.00/hr" reads as a real rate of nothing, which prices the
          labor on every line of every bid at zero while still looking like a
          finished number. */}
      <span className="text-sm font-mono md:w-28 text-right shrink-0">
        {rate.rateError ? (
          // Each label here is the way to fix what it names (@/lib/needsFix).
          <button
            type="button"
            onClick={() =>
              openEditor({ field: "hours", why: String(rate.rateError) })
            }
            className="text-destructive text-xs font-sans underline decoration-dotted underline-offset-2 hover:decoration-solid"
            aria-label={`Set working hours for ${rate.name}`}
          >
            Set hours
          </button>
        ) : rate.isExampleRate ? (
          /* Checked BEFORE needsRate, which also says yes to an example
             (so first run keeps asking) — but here the number is real and
             in use on bids, so it shows, tagged as BidRidge's. */
          <span className="inline-flex flex-col items-end">
            <span>
              {money(rate.effectiveHourlyRate)}
              <span className="text-muted-foreground">/hr</span>
            </span>
            <button
              type="button"
              onClick={() =>
                openEditor({ field: "rate", why: EXAMPLE_RATE_WHY })
              }
              className="rounded border border-sky-500/40 px-1 text-[10px] leading-4 font-sans text-sky-400 whitespace-nowrap hover:bg-sky-500/10"
              aria-label={`Set your own rate for ${rate.name}`}
            >
              Example rate
            </button>
          </span>
        ) : needsRate(rate) ? (
          <button
            type="button"
            onClick={() => openEditor({ field: "rate", why: NEEDS_WHY.rate })}
            className="text-xs font-sans font-medium text-[#F5C518] underline decoration-dotted underline-offset-2 hover:decoration-solid"
            aria-label={`Set a rate for ${rate.name}`}
          >
            Needs rate
          </button>
        ) : (
          <>
            {money(rate.effectiveHourlyRate)}
            <span className="text-muted-foreground">/hr</span>
          </>
        )}
      </span>

      <div className="flex items-center gap-0.5 ml-auto md:ml-0 md:w-28 justify-end shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          onClick={() => openEditor(null)}
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
            hourlyCost: vars.breakdown
              ? String(loadedRate(vars.breakdown))
              : vars.hourlyCost != null
                ? String(vars.hourlyCost)
                : row.hourlyCost,
            // The parts as sent; the example flag is left to the server,
            // which knows whether anything actually changed (onSettled).
            ...(vars.breakdown !== undefined
              ? {
                  baseWage: vars.breakdown && String(vars.breakdown.baseWage),
                  payrollTaxPct:
                    vars.breakdown && String(vars.breakdown.payrollTaxPct),
                  workersCompPct:
                    vars.breakdown && String(vars.breakdown.workersCompPct),
                  insurancePct:
                    vars.breakdown && String(vars.breakdown.insurancePct),
                  benefitsPct:
                    vars.breakdown && String(vars.breakdown.benefitsPct),
                }
              : {}),
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
      const parts =
        draft.rateType === "hourly" && draft.breakdown
          ? breakdownParts(draft.breakdown)
          : null;
      updateRate.mutate({
        id,
        name: draft.name.trim(),
        rateType: draft.rateType,
        // Parts when built from a wage; otherwise null, so parts that no
        // longer explain the number are not left beside it (the router
        // compares, so an untouched example stays an example).
        ...(parts
          ? { breakdown: parts }
          : draft.rateType === "hourly"
            ? { hourlyCost: Number(draft.hourlyCost), breakdown: null }
            : {
                annualSalary: Number(draft.annualSalary),
                annualHours: Number(draft.annualHours),
                breakdown: null,
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
      <div className="page-header border-b border-border px-6 py-4">
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
          {/* Column heads — not on a phone, where each row is a card and
              there are no columns for them to head (see the row above). */}
          <div className="hidden md:flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
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
