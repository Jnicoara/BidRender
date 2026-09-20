/**
 * LaborRateQuickEdit — change a role's rate without leaving the screen.
 *
 * ── This edits the SHARED rate, not a per-assembly override ──────────────────
 * There is deliberately no such thing as an assembly-specific rate. A role has
 * one rate, used everywhere it is referenced, and this control edits that one
 * record — the same row the Labor Rates screen shows. Building a private copy
 * per assembly is what the app's fork-not-multiply approach exists to avoid:
 * it would mean the same role costing different amounts in different recipes,
 * with no way to tell which was right.
 *
 * Because that is easy to misread, the panel says so in plain words before the
 * field, and names how many assemblies are affected when it knows.
 *
 * ── What it does NOT touch ───────────────────────────────────────────────────
 * Bids that already snapshotted a cost. Those froze their rate when the line
 * was added and are unaffected by anything here — which is the whole point of
 * snapshotting, and is covered by its own tests.
 *
 * Follows CLAUDE.md § Editing fields via InlineNumberField: select-on-focus,
 * Enter/blur save, Escape revert, save flash — and, because this is a panel
 * rather than a row, rule 5: Enter saves AND closes, so finishing the edit
 * takes one key rather than a key plus a click somewhere else.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Pencil, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { InlineNumberField } from "@/components/InlineNumberField";
import { DEFAULT_ANNUAL_HOURS } from "@shared/pricing";
import { money } from "@/lib/money";

export type QuickEditableRate = {
  id: number;
  /** Set when this role is the user's fork of a starter. */
  baselineId: number | null;
  name: string;
  rateType: "hourly" | "salary";
  hourlyCost: string;
  annualSalary: string | null;
  annualHours: string | null;
  effectiveHourlyRate: number;
};

export function LaborRateQuickEdit({
  rate,
  onSaved,
}: {
  rate: QuickEditableRate;
  /** Called after a successful save, so the caller can refetch what it shows. */
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  /** Assemblies pointing at this role — the blast radius, stated up front. */
  const { data: assemblies = [] } = trpc.assemblies.list.useQuery(undefined, {
    enabled: open,
  });
  const usedBy = assemblies.filter(
    a => a.laborRateId === rate.id || a.laborRateId === rate.baselineId
  ).length;

  const update = trpc.laborRates.update.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: result => {
      toast.success(
        result?.forked
          ? `Saved as your own copy of ${rate.name} — every assembly using it now prices at the new rate.`
          : `${rate.name} updated everywhere it is used.`
      );
      void utils.laborRates.list.invalidate();
      void utils.assemblies.list.invalidate();
      onSaved?.();
    },
  });

  const isSalary = rate.rateType === "salary";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title={`Edit the ${rate.name} rate — shared across your whole library`}
          aria-label={`Edit ${rate.name} rate`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 space-y-3">
        <div>
          <div className="text-sm font-medium">
            Editing the {rate.name} rate
          </div>
          <div className="flex items-start gap-1.5 mt-1 text-xs text-[#F5C518]">
            <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              This is the one shared rate for {rate.name}, used across your
              whole library — not a rate for this assembly alone.
            </span>
          </div>
        </div>

        {isSalary ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground w-20 shrink-0">
                Salary
              </span>
              {/* No onDismiss: closing here would strand the user outside a
                  panel they had not finished — hours is still below. */}
              {/*
                  `whenUnset="zero"` rather than `?? 0`, and the difference is
                  that this one is a statement. Money follows the unpriced-
                  material convention: a salary nobody has entered shows $0 and
                  shouts, where a blank would read as "not applicable".
                */}
              <InlineNumberField
                value={
                  rate.annualSalary === null ? null : Number(rate.annualSalary)
                }
                whenUnset="zero"
                onSave={annualSalary =>
                  update.mutate({ id: rate.id, annualSalary })
                }
                rules={{ min: 0 }}
                className="h-8 w-32 text-sm"
                ariaLabel={`${rate.name} annual salary`}
                suffix="/yr"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground w-20 shrink-0">
                Hours/yr
              </span>
              <InlineNumberField
                value={Number(rate.annualHours ?? DEFAULT_ANNUAL_HOURS)}
                onSave={annualHours =>
                  update.mutate({ id: rate.id, annualHours })
                }
                rules={{ min: 0.01, max: 8760 }}
                className="h-8 w-32 text-sm"
                ariaLabel={`${rate.name} working hours per year`}
                suffix="h"
                onDismiss={() => setOpen(false)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Works out to{" "}
              <span className="font-mono text-foreground">
                {money(rate.effectiveHourlyRate)}/hr
              </span>
              .
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground w-20 shrink-0">
              Rate
            </span>
            <InlineNumberField
              value={Number(rate.hourlyCost)}
              onSave={hourlyCost => update.mutate({ id: rate.id, hourlyCost })}
              rules={{ min: 0 }}
              className="h-8 w-32 text-sm"
              ariaLabel={`${rate.name} hourly rate`}
              suffix="/hr"
              onDismiss={() => setOpen(false)}
            />
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {usedBy > 0
            ? `${usedBy} assembl${usedBy === 1 ? "y uses" : "ies use"} this role and will reprice.`
            : "No assemblies use this role yet."}{" "}
          Bids that already have lines keep the rate they were priced at.
        </p>
      </PopoverContent>
    </Popover>
  );
}
