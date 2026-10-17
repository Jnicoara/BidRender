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
import {
  commitNumericEdit,
  commitPercentEdit,
  parseTypedPercent,
} from "@/lib/inlineEdit";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { hourlyCostOf, resolveLaborRate } from "@shared/laborRateLookup";
import { CompanyDefaultNotice } from "@/components/CompanyDefaultNotice";
import { PercentKindInput } from "@/components/PercentKindInput";
import { errorText } from "@/lib/errorText";
import { LoadFailed } from "@/components/LoadFailed";

/** Fraction (0.1) → percent string ("10"). Blank stays blank. */
const toPercent = (fraction: number | string | null | undefined) =>
  fraction == null ? "0" : String(Math.round(Number(fraction) * 10000) / 100);

/** Percent string ("10", "10%") → fraction (0.1); NaN when unreadable. */
const toFraction = (percent: string) => parseTypedPercent(percent) / 100;

export function BidPricingDefaultsSection() {
  const utils = trpc.useUtils();
  const defaultsQuery = trpc.bids.pricingDefaults.useQuery();
  const defaults = defaultsQuery.data;

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
    // A refused save puts every box back to what is stored, so nothing
    // unsaved is left on screen looking saved.
    onError: e => {
      toast.error(errorText(e));
      if (defaults) showStored(defaults);
    },
  });

  // Local text state so a half-typed percentage is not sent on every keystroke.
  const [overheadPct, setOverheadPct] = useState("0");
  const [overheadFlat, setOverheadFlat] = useState("0");
  const [profitPct, setProfitPct] = useState("0");
  const [productivityPct, setProductivityPct] = useState("0");
  // Blank is "no company default" — a rule of nothing, not a rule of 0%.
  const [materialMarkupPct, setMaterialMarkupPct] = useState("");

  const showStored = (d: NonNullable<typeof defaults>) => {
    setMaterialMarkupPct(
      d.materialMarkupPct === null ? "" : toPercent(d.materialMarkupPct)
    );
    const isPercentage = d.overheadMode === "percentage";
    setOverheadPct(isPercentage ? toPercent(d.overheadValue) : "0");
    setOverheadFlat(isPercentage ? "0" : String(Number(d.overheadValue)));
    setProfitPct(toPercent(d.profitValue));
    setProductivityPct(toPercent(d.productivityPct));
  };

  useEffect(() => {
    if (defaults) showStored(defaults);
    // showStored only calls setters; the stored row is what matters.
  }, [defaults]);

  /**
   * Leaving a box: save what it reads as — or, when it reads as nothing
   * (blank, "1,5", a typo), say so and put the stored number back. Never a 0
   * nobody typed (commitPercentEdit), and no "saved" for a value that did not
   * move.
   */
  const commitPct = (
    text: string,
    storedFraction: number | string,
    reset: (text: string) => void,
    send: (fraction: number) => void
  ) => {
    const outcome = commitPercentEdit(text, Number(storedFraction));
    if (outcome.action === "save") return send(outcome.value);
    if (outcome.action === "revert")
      toast.error("Type a percentage — for example 15. Nothing was changed.");
    reset(toPercent(storedFraction));
  };

  // Not blank: a section that failed to load says so (drill, 2026-10-15).
  if (!defaults)
    return defaultsQuery.isError ? (
      <LoadFailed
        what="your pricing settings"
        onRetry={() => void defaultsQuery.refetch()}
      />
    ) : null;

  const isPercentage = defaults.overheadMode === "percentage";

  return (
    <section className="grid gap-4 xl:grid-cols-2 xl:items-start">
      <div className="xl:col-span-2">
        <h3 className="text-sm font-semibold text-foreground">
          Bid pricing defaults
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          What every bid is priced with unless that bid says otherwise. Changing
          one here moves every Draft bid that follows it. A bid that has left
          Draft keeps the numbers it had then, and every bid keeps the
          materials, hours and rates it was built from either way.
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
            // Blank is a real answer here — no company markup — so only a
            // blank box clears it; anything else must read as a percentage.
            if (materialMarkupPct.trim() === "") {
              if (defaults.materialMarkupPct !== null)
                save.mutate({ materialMarkupPct: null });
              return;
            }
            if (defaults.materialMarkupPct === null) {
              const next = toFraction(materialMarkupPct);
              if (Number.isFinite(next))
                return save.mutate({ materialMarkupPct: next });
              toast.error(
                "Type a percentage — for example 15. Nothing was changed."
              );
              return setMaterialMarkupPct("");
            }
            commitPct(
              materialMarkupPct,
              defaults.materialMarkupPct,
              setMaterialMarkupPct,
              value => save.mutate({ materialMarkupPct: value })
            );
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
                    commitPct(
                      overheadPct,
                      defaults.overheadValue,
                      setOverheadPct,
                      value => save.mutate({ overheadValue: value })
                    )
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
                  onBlur={() => {
                    const outcome = commitNumericEdit(
                      overheadFlat,
                      Number(defaults.overheadValue),
                      { min: 0 }
                    );
                    if (outcome.action === "save")
                      return save.mutate({ overheadValue: outcome.value });
                    if (outcome.action === "revert")
                      toast.error(
                        "Type an amount — for example 250. Nothing was changed."
                      );
                    setOverheadFlat(String(Number(defaults.overheadValue)));
                  }}
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
          and every Draft bid still set to follow it.
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
            onBlur={() =>
              commitPct(profitPct, defaults.profitValue, setProfitPct, value =>
                save.mutate({ profitValue: value })
              )
            }
            onKeyDown={e => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            ariaLabel="Default profit"
            className="h-8 w-36 text-sm"
          />
        </div>

        <CompanyDefaultNotice>
          This is your company default — it affects every new bid going forward,
          and every Draft bid still set to follow it.
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
                commitPct(
                  productivityPct,
                  defaults.productivityPct,
                  setProductivityPct,
                  value => save.mutate({ productivityPct: value })
                )
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
            {/* From what the box READS as — nothing while it reads as nothing,
                rather than "No adjustment" for a box that would not save. */}
            {!Number.isFinite(toFraction(productivityPct))
              ? ""
              : toFraction(productivityPct) === 0
                ? "No adjustment"
                : `Every hour priced as ${(1 + toFraction(productivityPct)).toFixed(2)} hours`}
          </span>
        </div>

        <CompanyDefaultNotice>
          This is your company default — it affects every new bid going forward,
          and every Draft bid still set to follow it.
        </CompanyDefaultNotice>
      </div>

      {/* ── Labor rate for traced runs ───────────────────────────────────── */}
      <RunLaborRate
        value={defaults.defaultLaborRateId ?? null}
        onPick={id => save.mutate({ defaultLaborRateId: id })}
      />
    </section>
  );
}

/**
 * Which labor role prices the hours on TRACED RUNS — the conduit, wire and
 * fittings sent from the Plans screen (`pricing_defaults.defaultLaborRateId`).
 * Nothing could set it before 2026-10-16, so every run line froze at $0 an
 * hour. Unset is said in amber, with what it costs, never shown as a blank.
 * A line freezes its rate when it is sent: picking here moves runs sent from
 * now on, not ones already on a bid.
 *
 * A new company starts on the shipped Journeyman (owner, N4, 2026-10-16),
 * tagged "Example rate" until the shop types its own. The pick is resolved
 * through `resolveLaborRate`, as the server prices it: editing a shipped
 * role FORKS it, and a plain `find` on the stored id then showed "Not set"
 * while runs were priced at the fork's rate (found 2026-10-16).
 */
function RunLaborRate({
  value,
  onPick,
}: {
  value: number | null;
  onPick: (id: number | null) => void;
}) {
  const { data: rates } = trpc.laborRates.list.useQuery();
  const picked = resolveLaborRate(rates ?? [], value) ?? null;
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <Label htmlFor="run-labor-rate" className="text-sm">
          Labor rate for traced runs
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          The role whose hourly rate prices the hours on conduit, wire and
          fittings you trace on the plans. It applies to runs sent from now on;
          runs already on a bid keep the rate they were sent with.
        </p>
      </div>
      <select
        id="run-labor-rate"
        value={picked?.id ?? ""}
        onChange={e =>
          onPick(e.target.value === "" ? null : Number(e.target.value))
        }
        className="h-8 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Not set</option>
        {(rates ?? []).map(r => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {!picked ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Not set — the hours on traced runs are priced at $0 an hour.
        </p>
      ) : !(hourlyCostOf(picked) > 0) ? (
        // Picked, but the role itself has no rate: just as $0 as unset, and
        // it said nothing (found on screen 2026-10-16, a Journeyman at $0).
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {picked.name} has no rate yet — the hours on traced runs are priced at
          $0 an hour. Give it a rate in Labor rates, or pick another role.
        </p>
      ) : picked.isExampleRate ? (
        <p className="text-xs text-sky-600 dark:text-sky-400">
          Example rate ${Number(picked.hourlyCost).toFixed(2)} an hour —
          BidRidge's number, not yours. Set {picked.name}'s rate in Labor rates,
          or pick another role.
        </p>
      ) : null}
    </div>
  );
}
