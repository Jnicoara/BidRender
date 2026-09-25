/**
 * Company-wide bid pricing defaults: overhead, profit and the productivity
 * factor.
 *
 * ── Every control here says what it reaches ──────────────────────────────────
 * These are the settings with the widest blast radius in the app. One of them
 * changes what every future bid is priced at, and — because bids inherit rather
 * than copy — what every EXISTING bid that has not overridden it prices at too.
 * That second part is the one people do not expect, so each control says so at
 * the point of the edit rather than in a tooltip.
 *
 * What it does not change is any bid's snapshot. The materials, hours, rate and
 * modifier total a line was added with stay exactly as they were; these settings
 * sit on top of that arithmetic, not inside it. The note under the section says
 * as much, because "will this rewrite my finished bids?" is the first thing a
 * careful estimator will want to know.
 *
 * ── Values are stored as fractions, shown as percentages ─────────────────────
 * The engine and the columns work in fractions (0.10), because that is what the
 * arithmetic wants. Nobody types "0.1" for ten percent, so the conversion
 * happens at this boundary and nowhere else.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { CompanyDefaultNotice } from "@/components/CompanyDefaultNotice";
import { PercentKindInput } from "@/components/PercentKindInput";

/** Fraction (0.1) → percent string ("10"). Blank stays blank. */
const toPercent = (fraction: number | string | null | undefined) =>
  fraction == null ? "0" : String(Math.round(Number(fraction) * 10000) / 100);

/** Percent string ("10") → fraction (0.1). */
const toFraction = (percent: string) => (Number(percent) || 0) / 100;

export function BidPricingDefaultsSection() {
  const utils = trpc.useUtils();
  const { data: defaults } = trpc.bids.pricingDefaults.useQuery();

  const save = trpc.bids.setPricingDefaults.useMutation({
    onSuccess: () => {
      toast.success(
        "Company default saved — every new bid uses it from now on."
      );
      // Bids inherit rather than copy, so anything on screen showing a price
      // needs re-reading, not just this form.
      void utils.bids.pricingDefaults.invalidate();
      void utils.bids.dashboard.invalidate();
      void utils.bids.get.invalidate();
      // A new default markup changes what "Re-apply markup rules" would do on
      // every Draft bid, so the offer on each has to be re-measured.
      void utils.bids.markupReapplyPreview.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  // Local text state so a half-typed percentage is not sent on every keystroke.
  const [overheadPct, setOverheadPct] = useState("0");
  const [overheadFlat, setOverheadFlat] = useState("0");
  const [profitPct, setProfitPct] = useState("0");
  const [productivityPct, setProductivityPct] = useState("0");
  // Blank is "no company default" — a rule of nothing, not a rule of 0%.
  const [materialMarkupPct, setMaterialMarkupPct] = useState("");

  useEffect(() => {
    if (!defaults) return;
    setMaterialMarkupPct(
      defaults.materialMarkupPct === null
        ? ""
        : toPercent(defaults.materialMarkupPct)
    );
    const isPercentage = defaults.overheadMode === "percentage";
    setOverheadPct(isPercentage ? toPercent(defaults.overheadValue) : "0");
    setOverheadFlat(
      isPercentage ? "0" : String(Number(defaults.overheadValue))
    );
    setProfitPct(toPercent(defaults.profitValue));
    setProductivityPct(toPercent(defaults.productivityPct));
  }, [defaults]);

  if (!defaults) return null;

  const isPercentage = defaults.overheadMode === "percentage";

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Bid pricing defaults
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          What every bid is priced with unless that bid says otherwise. Changing
          one here moves every bid still set to follow it — finished bids keep
          the materials, hours and rates they were built from either way.
        </p>
      </div>

      {/* ── Material markup ──────────────────────────────────────────────────
          First, because it is the first step after direct cost: overhead and
          profit below are both added on top of marked-up material (D1,
          references/material-markup.md). The last level of the markup rules —
          a material's own markup, set on the Materials screen, wins over it.

          Its notice says something DIFFERENT from the others, on purpose. A
          line freezes its markup when it is added, so this does not move a
          bid that already exists; saying "every existing bid" here, as the
          overhead notice rightly does, would be false. */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <Label className="text-sm">Material markup</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Added to each line's material cost when it goes on a bid, unless the
            material has its own markup on the Materials screen. Leave it blank
            for no markup. Overhead and profit below are added on top of the
            marked-up material.
          </p>
        </div>

        <PercentKindInput
          kind="markup"
          value={materialMarkupPct}
          onChange={setMaterialMarkupPct}
          onBlur={() => {
            const next =
              materialMarkupPct.trim() === ""
                ? null
                : toFraction(materialMarkupPct);
            const current =
              defaults.materialMarkupPct === null
                ? null
                : Number(defaults.materialMarkupPct);
            if (next === current) return;
            save.mutate({ materialMarkupPct: next });
          }}
          onKeyDown={e => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          whenBlank="No company default — lines get no markup unless their material has one"
          ariaLabel="Default material markup"
          className="h-8 w-36 text-sm"
        />

        <CompanyDefaultNotice>
          This is your company default for lines added from now on. Lines
          already on a bid keep their markup — a Draft bid offers "Re-apply
          markup rules" when they differ.
        </CompanyDefaultNotice>
      </div>

      {/* ── Overhead ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-sm">Overhead</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Added to direct cost before profit.
            </p>
          </div>
          <Switch
            checked={defaults.overheadEnabled}
            onCheckedChange={enabled =>
              save.mutate({ overheadEnabled: enabled })
            }
            aria-label="Apply overhead by default"
          />
        </div>

        {defaults.overheadEnabled && (
          <div className="flex items-center gap-2">
            <Select
              value={defaults.overheadMode}
              onValueChange={mode =>
                save.mutate({
                  overheadMode: mode as "percentage" | "flat",
                  overheadValue: 0,
                })
              }
            >
              <SelectTrigger
                className="h-8 w-36 text-sm"
                aria-label="Overhead mode"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="flat">Flat amount</SelectItem>
              </SelectContent>
            </Select>

            {isPercentage ? (
              <div className="relative">
                <Input
                  value={overheadPct}
                  onChange={e => setOverheadPct(e.target.value)}
                  onFocus={selectOnFocus}
                  onBlur={() =>
                    save.mutate({ overheadValue: toFraction(overheadPct) })
                  }
                  onKeyDown={e => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  inputMode="decimal"
                  aria-label="Default overhead, percent of cost"
                  className="h-8 w-32 pr-[4.25rem] text-sm text-right"
                />
                {/* "of cost", not a bare "%": every percentage on this
                    screen says what it is a percentage OF. */}
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  % of cost
                </span>
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  $
                </span>
                <Input
                  value={overheadFlat}
                  onChange={e => setOverheadFlat(e.target.value)}
                  onFocus={selectOnFocus}
                  onBlur={() =>
                    save.mutate({ overheadValue: Number(overheadFlat) || 0 })
                  }
                  onKeyDown={e => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  inputMode="decimal"
                  aria-label="Default overhead amount"
                  className="h-8 w-28 pl-6 text-sm text-right"
                />
              </div>
            )}
          </div>
        )}

        <CompanyDefaultNotice>
          This is your company default — it affects every new bid going forward,
          and every existing bid still set to follow it.
        </CompanyDefaultNotice>
      </div>

      {/* ── Profit ───────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <Label className="text-sm">Profit</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Markup adds to cost; target margin is a share of the final price, so
            it prices higher at the same number.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={defaults.profitMethod}
            onValueChange={method =>
              save.mutate({ profitMethod: method as "markup" | "margin" })
            }
          >
            <SelectTrigger
              className="h-8 w-36 text-sm"
              aria-label="Profit method"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="markup">Markup %</SelectItem>
              <SelectItem value="margin">Target margin %</SelectItem>
            </SelectContent>
          </Select>

          {/* The word inside and the other number beside — markup and margin
              are different prices at the same number (Part 4). */}
          <PercentKindInput
            kind={defaults.profitMethod}
            value={profitPct}
            onChange={setProfitPct}
            onBlur={() => save.mutate({ profitValue: toFraction(profitPct) })}
            onKeyDown={e => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            ariaLabel="Default profit"
            className="h-8 w-36 text-sm"
          />
        </div>

        <CompanyDefaultNotice>
          This is your company default — it affects every new bid going forward,
          and every existing bid still set to follow it.
        </CompanyDefaultNotice>
      </div>

      {/* ── Productivity factor ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <Label className="text-sm">Productivity factor</Label>
          {/*
            Explained rather than presented as a bare percentage. It is the one
            setting here whose NAME does not tell you what it does, and a number
            with no explanation invites someone to treat it as another modifier.
          */}
          <p className="text-xs text-muted-foreground mt-0.5">
            Adjusts all labor hours up or down company-wide, for how your crews
            actually perform against the hours in your assemblies. Positive
            means the work takes longer than the book says; negative means your
            crews beat it. Leave it at 0% until you have real jobs to compare
            against.
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Applied last, after job-condition modifiers are added up — it is a
            separate step, not another modifier, and it never changes the hours
            stored on your assemblies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              value={productivityPct}
              onChange={e => setProductivityPct(e.target.value)}
              onFocus={selectOnFocus}
              onBlur={() =>
                save.mutate({ productivityPct: toFraction(productivityPct) })
              }
              onKeyDown={e => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              inputMode="decimal"
              aria-label="Company productivity factor percentage"
              className="h-8 w-28 pr-7 text-sm text-right"
            />
            <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          </div>
          <span className="text-xs text-muted-foreground">
            {Number(productivityPct) === 0
              ? "No adjustment"
              : Number(productivityPct) > 0
                ? `Every hour priced as ${(1 + toFraction(productivityPct)).toFixed(2)} hours`
                : `Every hour priced as ${(1 + toFraction(productivityPct)).toFixed(2)} hours`}
          </span>
        </div>

        <CompanyDefaultNotice>
          This is your company default — it affects every new bid going forward,
          and every existing bid still set to follow it.
        </CompanyDefaultNotice>
      </div>
    </section>
  );
}
