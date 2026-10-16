/**
 * The per-bid sales tax overrides.
 *
 * ── Why a bid can always override ────────────────────────────────────────────
 * The rate normally comes from matching the job address against the tax areas
 * in Settings. That match is text-based, the areas are only as complete as the
 * user has made them, and exemptions are ordinary — a government job, a
 * reseller, a customer with a certificate. An automatic tax with no way to
 * correct it would be a way to send a wrong number to a customer with no
 * recourse, which for sales tax means the wrong amount of money collected.
 *
 * So there are three escapes, and the panel presents them in the order they
 * take effect: exempt beats a typed rate, which beats a chosen area, which
 * beats the address match.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseTypedPercent } from "@/lib/inlineEdit";
import { selectOnFocus } from "@/lib/selectOnFocus";

/** Matches bids.update's tax fields. */
export type BidTaxPatch = {
  taxExempt?: boolean;
  taxExemptReason?: string | null;
  taxJurisdictionId?: number | null;
  taxRateOverridePct?: number | null;
};

const AUTOMATIC = "__automatic__";

export function BidTaxControls({
  bidId,
  exempt,
  exemptReason,
  jurisdictionId,
  rateOverridePct,
  onChange,
}: {
  bidId: number;
  exempt: boolean;
  exemptReason: string | null;
  jurisdictionId: number | null;
  rateOverridePct: number | null;
  onChange: (patch: BidTaxPatch) => void;
}) {
  const areas = trpc.salesTax.list.useQuery();
  const [open, setOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState(
    rateOverridePct === null ? "" : String(rateOverridePct)
  );
  const [reasonDraft, setReasonDraft] = useState(exemptReason ?? "");

  const commitRate = () => {
    const trimmed = rateDraft.trim();
    if (trimmed === "") {
      // Cleared means "go back to matching", which is different from 0.
      if (rateOverridePct !== null) onChange({ taxRateOverridePct: null });
      return;
    }
    // "6.25%" is 6.25 (it quietly reverted), "0x10" is not 16.
    const value = parseTypedPercent(trimmed);
    if (!Number.isFinite(value) || value < 0 || value > 25) {
      // Invalid reverts rather than erroring — an inline field has nowhere to
      // put a message (CLAUDE.md § Editing fields).
      setRateDraft(rateOverridePct === null ? "" : String(rateOverridePct));
      return;
    }
    if (value !== rateOverridePct) onChange({ taxRateOverridePct: value });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Tax on this bid
        </div>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setOpen(v => !v)}
        >
          {open ? "Hide" : "Change"}
        </button>
      </div>

      {/* Exemption is outside the fold: it is the commonest override, and the
          one whose state most needs to be visible without digging. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm">Tax exempt</div>
          <div className="text-xs text-muted-foreground">
            No tax on this bid, whatever the rate would be.
          </div>
        </div>
        <Switch
          checked={exempt}
          onCheckedChange={next => onChange({ taxExempt: next })}
          aria-label="Tax exempt"
        />
      </div>

      {exempt && (
        <div className="space-y-1">
          <Input
            value={reasonDraft}
            onChange={e => setReasonDraft(e.target.value)}
            onBlur={() => {
              const next = reasonDraft.trim() || null;
              if (next !== exemptReason) onChange({ taxExemptReason: next });
            }}
            onKeyDown={e => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setReasonDraft(exemptReason ?? "");
                e.currentTarget.blur();
              }
            }}
            className="h-8 text-sm"
            placeholder="Why — e.g. State agency, certificate E-4471"
            aria-label="Exemption reason"
          />
          {/* Printed on the proposal, so the document explains itself — and
              it is the first thing asked for in an audit. */}
          <p className="text-xs text-muted-foreground">
            Shown on the proposal beside the $0 tax line.
          </p>
        </div>
      )}

      {open && !exempt && (
        <div className="space-y-3 pt-1 border-t border-border">
          <div className="space-y-1.5 pt-3">
            <div className="text-sm">Tax area</div>
            <Select
              value={
                jurisdictionId === null ? AUTOMATIC : String(jurisdictionId)
              }
              onValueChange={value =>
                onChange({
                  taxJurisdictionId: value === AUTOMATIC ? null : Number(value),
                })
              }
            >
              <SelectTrigger className="h-8 text-sm" aria-label="Tax area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTOMATIC}>From the job address</SelectItem>
                {(areas.data ?? []).map(area => (
                  <SelectItem key={area.id} value={String(area.id)}>
                    {area.name} — {area.combinedRatePct}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="text-sm">Or type a rate</div>
            <div className="flex items-center gap-2">
              <Input
                value={rateDraft}
                onChange={e => setRateDraft(e.target.value)}
                onFocus={selectOnFocus}
                onBlur={commitRate}
                onKeyDown={e => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setRateDraft(
                      rateOverridePct === null ? "" : String(rateOverridePct)
                    );
                    e.currentTarget.blur();
                  }
                }}
                inputMode="decimal"
                className="h-8 w-28 text-sm text-right"
                placeholder="—"
                aria-label="Tax rate for this bid"
              />
              <span className="text-xs text-muted-foreground">%</span>
              {rateOverridePct !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => {
                    setRateDraft("");
                    onChange({ taxRateOverridePct: null });
                  }}
                >
                  Use the area instead
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Overrides the area above. Leave blank to use it; enter 0 for a
              deliberate zero rate.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
