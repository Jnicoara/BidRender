/**
 * Flat charges on a bid, plus the scope panel beneath them.
 *
 * Includes and excludes used to live in here as a second flat list; they moved
 * to `ScopeNotesPanel`, which lays them out as the two columns the proposal
 * actually prints.
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
 */
import { useState } from "react";
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
import { ScopeNotesPanel } from "@/components/ScopeNotesPanel";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { money } from "@/lib/money";

const PICK_NONE = "__none__";

export function BidExtrasPanel({ bidId }: { bidId: number }) {
  const utils = trpc.useUtils();

  const savedExpenses = trpc.bidExtras.expenses.list.useQuery();
  const onBidExpenses = trpc.bidExtras.expenses.onBid.useQuery({ bidId });

  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseTaxable, setExpenseTaxable] = useState(false);
  const [expenseMarkedUp, setExpenseMarkedUp] = useState(false);

  const refresh = () => {
    void utils.bidExtras.expenses.onBid.invalidate({ bidId });
    void utils.bidExtras.expenses.list.invalidate();
    // The rollup and the document both change when a charge does.
    void utils.bids.get.invalidate({ id: bidId });
    void utils.proposals.document.invalidate({ bidId });
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

  return (
    <div className="space-y-4">
      {/* Shut until there is a reason to open it. The summary carries the
          count and the money, which is the whole of what a closed panel has to
          answer — an estimator checking a bid before sending wants to know
          whether there are charges on it, not to re-read the form. */}
      <CollapsiblePanel
        id="bid-expenses"
        title="Additional expenses"
        summary={
          expenses.length === 0
            ? "Permits, inspections, anything not in an assembly"
            : `${expenses.length} charge${expenses.length === 1 ? "" : "s"} · ${money(expensesTotal)}`
        }
      >
        {expensesTotal > 0 && (
          <div className="flex items-center justify-end">
            <span className="font-mono text-sm">{money(expensesTotal)}</span>
          </div>
        )}

        {expenses.length > 0 && (
          <div className="space-y-1">
            {expenses.map(row => (
              <div
                key={row.id}
                className="flex items-center gap-2 group text-sm"
              >
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
                    className="shrink-0 p-1 rounded text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all"
                    onClick={() => saveExpense.mutate({ bidId, id: row.id })}
                    aria-label={`Save ${row.name} to my list`}
                    title="Save to my list for next time"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  className="shrink-0 p-1 rounded text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-muted transition-all"
                  onClick={() => removeExpense.mutate({ bidId, id: row.id })}
                  aria-label={`Remove ${row.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
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
            className="h-8 flex-1 text-sm"
            placeholder="One-off charge — e.g. Permit fee"
            aria-label="Expense name"
          />
          <Input
            value={expenseAmount}
            onChange={e => setExpenseAmount(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitExpense()}
            onFocus={selectOnFocus}
            inputMode="decimal"
            className="h-8 w-24 text-sm text-right"
            placeholder="0.00"
            aria-label="Expense amount"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 shrink-0"
            onClick={submitExpense}
            aria-label="Add expense"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Both off by default — a charge nobody thinks about stays a flat,
            untaxed pass-through, which is what it was before these existed. */}
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
          <strong>Marked up</strong> applies your overhead and profit to it.
          They are independent, and both start off. Typing a charge here does
          not save it to your list.
        </p>
      </CollapsiblePanel>

      <ScopeNotesPanel bidId={bidId} />
    </div>
  );
}
