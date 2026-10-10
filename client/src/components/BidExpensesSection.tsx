/**
 * Flat charges on a bid — the body of "Additional expenses" on the bid screen
 * and of "Job costs" on Quick bid. ONE component in both places, so the two
 * cannot drift (CLAUDE.md § "Copying a layout does not copy the behaviour").
 * The frame around it — a collapsible panel there, "More options" here — is
 * the caller's.
 *
 * ── Pick from the list, or type a one-off ────────────────────────────────────
 * Both halves work the same way and both make the one-off the equal of the
 * saved entry. A permit that is $340 on this job and never again must be as
 * easy to add as one that is always $180, and adding it must leave nothing
 * behind — a saved "$340 permit" is a wrong number waiting to be picked up on
 * a future bid by somebody being efficient.
 *
 * "Save to my list" is offered afterwards for the case where the one-off turns
 * out to be worth keeping. That way round is safe; the other way round is not.
 *
 * ── Job cost tiles (quick-bid-plan.md § 6) ───────────────────────────────────
 * Permit, lift rental, dumpster, drive time: small calculators that add ONE
 * ordinary one-off charge. The rules — blank is never $0, drive time is a flat
 * cost and never hours — are in `@/lib/jobCostTiles`, where the suite reaches
 * them.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BookmarkPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { money } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { hourlyCostOf, resolveLaborRate } from "@shared/laborRateLookup";
import {
  computeJobCost,
  initialTileInputs,
  JOB_COST_TILES,
  type JobCostTileKey,
  tileByKey,
} from "@/lib/jobCostTiles";

const PICK_NONE = "__none__";

export function BidExpensesSection({
  bidId,
  openTile,
  onTileClosed,
}: {
  bidId: number;
  /**
   * A tile to open now, with its first box focused — Quick bid's search box
   * sets this when Enter lands on "Permit — job cost". Changing it re-opens.
   */
  openTile?: { key: JobCostTileKey; nonce: number } | null;
  /** Called when a tile closes (added or Escape), so focus can go back. */
  onTileClosed?: () => void;
}) {
  const utils = trpc.useUtils();
  const coarse = useCoarsePointer();

  const savedExpenses = trpc.bidExtras.expenses.list.useQuery();
  const onBidExpenses = trpc.bidExtras.expenses.onBid.useQuery({ bidId });
  // Drive time opens on the company's default labor rate, the same one a
  // traced run's lines are priced at (server/db.ts, resolveLaborRate).
  const { data: pricingDefaults } = trpc.bids.pricingDefaults.useQuery();
  const { data: rates = [] } = trpc.laborRates.list.useQuery();
  const defaultRateRow = resolveLaborRate(
    rates,
    pricingDefaults?.defaultLaborRateId ?? null
  );
  const defaultRate = defaultRateRow ? hourlyCostOf(defaultRateRow) : null;

  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseTaxable, setExpenseTaxable] = useState(false);
  const [expenseMarkedUp, setExpenseMarkedUp] = useState(false);

  const [tile, setTile] = useState<JobCostTileKey | null>(null);
  const [tileInputs, setTileInputs] = useState<Record<string, string>>({});
  const [tileError, setTileError] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /**
   * Move to a box. NOW when it is already on screen — moving on with Enter
   * inside an open tile — because a fast typist's next keys arrive before
   * the next frame and would land in the box just left (measured: "2 Enter
   * 450" typed as days 2450). After a frame only when the tile is opening
   * and the box is not rendered yet.
   */
  const focusField = (key: string, afterRender = false) => {
    const go = () => {
      const el = fieldRefs.current[key];
      el?.focus();
      el?.select();
    };
    if (afterRender) requestAnimationFrame(go);
    else go();
  };

  const openTileNow = (key: JobCostTileKey) => {
    setTile(key);
    setTileInputs(initialTileInputs(key, defaultRate));
    setTileError(null);
    focusField(tileByKey(key).fields[0].key, true);
  };

  const closeTile = () => {
    setTile(null);
    setTileInputs({});
    setTileError(null);
    onTileClosed?.();
  };

  // Opened from outside (Quick bid's search). Keyed on the nonce so the same
  // tile asked for twice opens twice.
  useEffect(() => {
    if (openTile) openTileNow(openTile.key);
  }, [openTile?.nonce]);

  const refresh = () => {
    void utils.bidExtras.expenses.onBid.invalidate({ bidId });
    void utils.bidExtras.expenses.list.invalidate();
    // The rollup and the document both change when a charge does.
    void utils.bids.get.invalidate({ id: bidId });
    void utils.proposals.document.invalidate({ bidId });
    // Every charge is a figure under Misc in "For your quote app".
    void utils.quoteApp.get.invalidate({ bidId });
  };

  const onError = (e: { message: string }) => toast.error(e.message);

  const addExpense = trpc.bidExtras.expenses.addToBid.useMutation({
    onError,
    onSettled: refresh,
  });
  const updateExpense = trpc.bidExtras.expenses.updateOnBid.useMutation({
    onError,
    onSettled: refresh,
  });
  const removeExpense = trpc.bidExtras.expenses.removeFromBid.useMutation({
    onError,
    onSettled: refresh,
  });
  const saveExpense = trpc.bidExtras.expenses.saveToLibrary.useMutation({
    onSuccess: r =>
      toast.success(
        r.alreadySaved ? "Already on your list." : "Saved to your list."
      ),
    onError,
    onSettled: refresh,
  });

  const expenses = onBidExpenses.data ?? [];
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  const submitExpense = () => {
    const amount = Number(expenseAmount);
    if (!expenseName.trim() || !Number.isFinite(amount) || amount < 0) return;
    addExpense.mutate({
      bidId,
      name: expenseName.trim(),
      amount,
      taxable: expenseTaxable,
      markedUp: expenseMarkedUp,
    });
    setExpenseName("");
    setExpenseAmount("");
    setExpenseTaxable(false);
    setExpenseMarkedUp(false);
  };

  const submitTile = () => {
    if (!tile) return;
    const result = computeJobCost(tile, tileInputs);
    if (!result.ok) {
      setTileError(result.message);
      focusField(result.field);
      return;
    }
    addExpense.mutate(
      {
        bidId,
        name: result.name,
        amount: result.amount,
        taxable: expenseTaxable,
        markedUp: expenseMarkedUp,
      },
      {
        onSuccess: () =>
          toast.success(
            `Added ${result.name} — ${result.working ? `${result.working} = ` : ""}${money(result.amount)}`
          ),
      }
    );
    setExpenseTaxable(false);
    setExpenseMarkedUp(false);
    closeTile();
  };

  const activeTile = tile ? tileByKey(tile) : null;
  const preview = tile ? computeJobCost(tile, tileInputs) : null;
  const box = coarse ? "h-11" : "h-8";

  return (
    <div className="space-y-3">
      {expensesTotal > 0 && (
        <div className="flex items-center justify-end">
          <span className="font-mono text-sm">{money(expensesTotal)}</span>
        </div>
      )}

      {expenses.length > 0 && (
        <div className="space-y-1">
          {expenses.map(row => (
            <div key={row.id} className="flex items-center gap-2 group text-sm">
              <span className="flex-1 min-w-0">
                <span className="block truncate">{row.name}</span>
                {/* The two switches, per charge, editable in place. Shown as
                    words rather than icons because "taxed" and "marked up"
                    are the kind of thing an estimator wants to read back at
                    a glance before sending. */}
                <span className="flex items-center gap-3 mt-0.5">
                  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={row.taxable}
                      onCheckedChange={next =>
                        updateExpense.mutate({
                          bidId,
                          id: row.id,
                          taxable: next === true,
                        })
                      }
                      aria-label={`${row.name} is taxable`}
                      className="h-3 w-3"
                    />
                    Taxable
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={row.markedUp}
                      onCheckedChange={next =>
                        updateExpense.mutate({
                          bidId,
                          id: row.id,
                          markedUp: next === true,
                        })
                      }
                      aria-label={`${row.name} is marked up`}
                      className="h-3 w-3"
                    />
                    Marked up
                  </label>
                </span>
              </span>
              <span className="font-mono text-sm shrink-0 self-start">
                {money(row.amount)}
              </span>
              {/* Only a one-off can be saved — an entry that came FROM the
                  list has nowhere to go. */}
              {row.expenseItemId === null && (
                <button
                  className="shrink-0 p-1 rounded text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-muted transition-all"
                  onClick={() => saveExpense.mutate({ bidId, id: row.id })}
                  aria-label={`Save ${row.name} to my list`}
                  title="Save to my list for next time"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                className="shrink-0 p-1 rounded text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive hover:bg-muted transition-all"
                onClick={() => removeExpense.mutate({ bidId, id: row.id })}
                aria-label={`Remove ${row.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* The four job costs nearly every job has. A tap opens a small
          calculator; it adds nothing until its boxes are filled. */}
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Job costs"
      >
        {JOB_COST_TILES.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => (tile === t.key ? closeTile() : openTileNow(t.key))}
            aria-pressed={tile === t.key}
            className={cn(
              "px-2.5 rounded-md text-xs border transition-colors",
              coarse ? "h-11" : "h-7",
              tile === t.key
                ? "border-[#F5C518] bg-[#F5C518]/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <Plus className="inline w-3 h-3 mr-1 -mt-0.5" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTile && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            {activeTile.fields.map((field, index) => (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {field.label}
                </span>
                <Input
                  ref={el => {
                    fieldRefs.current[field.key] = el;
                  }}
                  value={tileInputs[field.key] ?? ""}
                  onChange={e => {
                    setTileInputs(prev => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }));
                    setTileError(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // Enter on a box with more boxes after it moves on; on
                      // the last one it adds — or says which box is missing.
                      const next = activeTile.fields[index + 1];
                      if (next && !(tileInputs[next.key] ?? "").trim())
                        focusField(next.key);
                      else submitTile();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      closeTile();
                    }
                  }}
                  onFocus={selectOnFocus}
                  inputMode="decimal"
                  placeholder={field.placeholder}
                  aria-label={`${activeTile.label}: ${field.label}`}
                  className={cn(box, "w-28 text-sm text-right")}
                />
              </label>
            ))}
            <Button
              size="sm"
              className={cn(box, "shrink-0")}
              onClick={submitTile}
              aria-label={`Add ${activeTile.label}`}
            >
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn(box, "shrink-0 text-muted-foreground")}
              onClick={closeTile}
            >
              Cancel
            </Button>
          </div>
          <p
            className={cn(
              "text-xs",
              tileError ? "text-[#F5C518]" : "text-muted-foreground"
            )}
            aria-live="polite"
          >
            {tileError
              ? tileError
              : preview?.ok
                ? `${preview.working ? `${preview.working} = ` : ""}${money(preview.amount)} — added as one charge.`
                : tile === "drive"
                  ? defaultRate !== null && defaultRate > 0
                    ? "A flat cost, not labor hours: no modifiers or productivity apply. The rate is your default labor rate — change it for this job if you like."
                    : "A flat cost, not labor hours. No default labor rate is set — type one here."
                  : "Type the numbers, then Enter."}
          </p>
        </div>
      )}

      {(savedExpenses.data ?? []).length > 0 && (
        <Select
          value={PICK_NONE}
          onValueChange={value => {
            if (value === PICK_NONE) return;
            addExpense.mutate({ bidId, itemId: Number(value) });
          }}
        >
          <SelectTrigger
            className="h-8 text-sm"
            aria-label="Add a saved expense"
          >
            <SelectValue placeholder="Add from your list…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PICK_NONE}>Add from your list…</SelectItem>
            {(savedExpenses.data ?? []).map(item => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.name} — {money(item.amount)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={expenseName}
          onChange={e => setExpenseName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submitExpense()}
          className={cn(box, "flex-1 min-w-0 text-sm")}
          placeholder="One-off charge — e.g. Permit fee"
          aria-label="Expense name"
        />
        <Input
          value={expenseAmount}
          onChange={e => setExpenseAmount(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submitExpense()}
          onFocus={selectOnFocus}
          inputMode="decimal"
          className={cn(box, "w-24 text-sm text-right")}
          placeholder="0.00"
          aria-label="Expense amount"
        />
        <Button
          size="sm"
          variant="outline"
          className={cn(box, coarse ? "w-11" : "w-8", "p-0 shrink-0")}
          onClick={submitExpense}
          aria-label="Add expense"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Both off by default — a charge nobody thinks about stays a flat,
          untaxed pass-through, which is what it was before these existed.
          They apply to the next charge added, a job cost tile included. */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <Checkbox
            checked={expenseTaxable}
            onCheckedChange={next => setExpenseTaxable(next === true)}
            aria-label="New charge is taxable"
          />
          Taxable
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <Checkbox
            checked={expenseMarkedUp}
            onCheckedChange={next => setExpenseMarkedUp(next === true)}
            aria-label="New charge is marked up"
          />
          Marked up
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        <strong>Taxable</strong> puts the amount in the sales tax base.{" "}
        <strong>Marked up</strong> applies your overhead and profit to it. They
        are independent, and both start off. Typing a charge here does not save
        it to your list.
      </p>
    </div>
  );
}
