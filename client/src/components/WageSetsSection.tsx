/**
 * PREVAILING WAGE SETS on the Labor rates screen (bid-methods-plan.md § 5).
 *
 * Behind ONE "More options" control, because most shops never bid a public
 * job — and open on its own once the shop has a set, because a shop's own
 * work is never folded away (CLAUDE.md § Customization, rule 2).
 *
 * A set is one wage determination: name, WD number, the day it was set
 * (re-check due six months later, a reminder rather than a block — Q12),
 * "fringe paid as cash" (Q15, off by default), and a row per
 * classification with base wage and fringe typed apart and the role it
 * stands in for. A draft form with its own Save (`lib/wageSetDraft.ts`): a
 * blank wage is refused by name, never saved as $0.
 *
 * Saving a set moves no number. A bid chooses one under its Pricing
 * settings, and says there what it does and does not change.
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/errorText";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localDay, type WageClassification } from "@shared/prevailingWage";
import {
  CLASSIFICATION_LABEL,
  draftFromSet,
  emptyWageSet,
  payloadFromDraft,
  type WageSetDraft,
} from "@/lib/wageSetDraft";

const selectClass =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

export function WageSetsSection() {
  const utils = trpc.useUtils();
  const canEdit = useCompany().can("pricing.edit");
  const today = localDay(new Date());
  const sets = trpc.wageSets.list.useQuery({ today });
  const roles = trpc.laborRates.list.useQuery();
  const [openPick, setOpenPick] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<{
    id: number | null;
    draft: WageSetDraft;
  } | null>(null);

  const refresh = () => {
    void utils.wageSets.list.invalidate();
    // A bid's wage panel reads the same set.
    void utils.bids.wageForBid.invalidate();
  };
  const save = trpc.wageSets.save.useMutation({
    onSuccess: () => {
      toast.success("Wage set saved. No bid's price changed.");
      setEditing(null);
      refresh();
    },
    onError: e => toast.error(errorText(e)),
  });
  const archive = trpc.wageSets.archive.useMutation({
    onSuccess: (_r, v) =>
      toast.success(
        v.archived
          ? "Wage set archived. Bids already using it keep it."
          : "Wage set back in the list."
      ),
    onError: e => toast.error(errorText(e)),
    onSettled: refresh,
  });

  const list = sets.data ?? [];
  const open = openPick ?? list.length > 0;
  const roleName = (id: number | null) =>
    id === null
      ? "No role picked"
      : ((roles.data ?? []).find(r => r.id === id)?.name ?? "A removed role");

  const setDraft = (patch: Partial<WageSetDraft>) =>
    setEditing(e => e && { ...e, draft: { ...e.draft, ...patch } });
  const setRow = (i: number, patch: Partial<WageSetDraft["rates"][number]>) =>
    setEditing(
      e =>
        e && {
          ...e,
          draft: {
            ...e.draft,
            rates: e.draft.rates.map((r, j) =>
              j === i ? { ...r, ...patch } : r
            ),
          },
        }
    );

  return (
    <div className="mt-6" data-testid="wage-sets">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpenPick(!open)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        More options — prevailing wage sets
        {list.length > 0 && (
          <span className="ml-1 text-muted-foreground">({list.length})</span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            For public work: save each wage determination once — base wage and
            fringe per classification — and pick it on the bid. Re-check one six
            months after it was set.
          </p>

          {list.map(s => (
            <div
              key={s.id}
              className="rounded-lg border border-border p-3 space-y-2"
            >
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.wageDeterminationNumber
                      ? `WD ${s.wageDeterminationNumber} · `
                      : ""}
                    set {s.dateSet} · re-check {s.recheckDue}
                    {s.fringePaidAsCash ? " · fringe paid as cash" : ""}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        setEditing({ id: s.id, draft: draftFromSet(s) })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={archive.isPending}
                      onClick={() =>
                        archive.mutate({ id: s.id, archived: true })
                      }
                    >
                      Archive
                    </Button>
                  </div>
                )}
              </div>
              {s.reminder && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {s.reminder}
                </p>
              )}
              <ul className="text-xs space-y-0.5">
                {s.rates.map(r => (
                  <li key={r.id} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-muted-foreground">
                      ${Number(r.baseWage).toFixed(2)} + $
                      {Number(r.fringe).toFixed(2)} fringe ·{" "}
                      {roleName(r.laborRateId)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {editing ? (
            <WageSetEditor
              draft={editing.draft}
              roles={(roles.data ?? []).map(r => ({ id: r.id, name: r.name }))}
              saving={save.isPending}
              onField={setDraft}
              onRow={setRow}
              onAddRow={c =>
                setDraft({
                  rates: [
                    ...editing.draft.rates,
                    {
                      classification: c,
                      label: CLASSIFICATION_LABEL[c],
                      laborRateId: null,
                      baseWage: "",
                      fringe: "",
                    },
                  ],
                })
              }
              onRemoveRow={i =>
                setDraft({
                  rates: editing.draft.rates.filter((_r, j) => j !== i),
                })
              }
              onCancel={() => setEditing(null)}
              onSave={() => {
                const p = payloadFromDraft(editing.draft);
                if (!p.ok) return toast.error(p.message);
                save.mutate({ id: editing.id, ...p.set });
              }}
            />
          ) : (
            canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() =>
                  setEditing({ id: null, draft: emptyWageSet(today) })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add a wage set
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function WageSetEditor({
  draft,
  roles,
  saving,
  onField,
  onRow,
  onAddRow,
  onRemoveRow,
  onCancel,
  onSave,
}: {
  draft: WageSetDraft;
  roles: Array<{ id: number; name: string }>;
  saving: boolean;
  onField: (patch: Partial<WageSetDraft>) => void;
  onRow: (i: number, patch: Partial<WageSetDraft["rates"][number]>) => void;
  onAddRow: (c: WageClassification) => void;
  onRemoveRow: (i: number) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-[#F5C518]/40 p-3 space-y-3"
      data-testid="wage-set-editor"
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-[11px] text-muted-foreground space-y-1">
          <span>Name</span>
          <Input
            className="h-8 text-sm"
            value={draft.name}
            placeholder="Pierce County public works 2026"
            onChange={e => onField({ name: e.target.value })}
          />
        </label>
        <label className="text-[11px] text-muted-foreground space-y-1">
          <span>Wage determination no.</span>
          <Input
            className="h-8 text-sm"
            value={draft.wageDeterminationNumber}
            onChange={e => onField({ wageDeterminationNumber: e.target.value })}
          />
        </label>
        <label className="text-[11px] text-muted-foreground space-y-1">
          <span>Date set</span>
          <Input
            type="date"
            className="h-8 text-sm"
            value={draft.dateSet}
            onChange={e => onField({ dateSet: e.target.value })}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={draft.fringePaidAsCash}
          onChange={e => onField({ fringePaidAsCash: e.target.checked })}
        />
        Fringe paid as cash wages (payroll tax then applies to it)
      </label>

      <div className="space-y-2">
        {draft.rates.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-1.5 rounded-md border border-border p-2 sm:grid-cols-[1fr_1fr_1fr_0.7fr_0.7fr_auto] sm:items-end"
          >
            <label className="text-[11px] text-muted-foreground space-y-1">
              <span>Classification</span>
              <select
                className={selectClass}
                value={r.classification}
                onChange={e =>
                  onRow(i, {
                    classification: e.target.value as WageClassification,
                  })
                }
              >
                {(
                  Object.keys(CLASSIFICATION_LABEL) as WageClassification[]
                ).map(c => (
                  <option key={c} value={c}>
                    {CLASSIFICATION_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground space-y-1">
              <span>Label</span>
              <Input
                className="h-8 text-sm"
                value={r.label}
                onChange={e => onRow(i, { label: e.target.value })}
              />
            </label>
            <label className="text-[11px] text-muted-foreground space-y-1">
              <span>Stands in for</span>
              <select
                className={selectClass}
                value={r.laborRateId ?? ""}
                onChange={e =>
                  onRow(i, {
                    laborRateId:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">Pick a role</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground space-y-1">
              <span>Base $/h</span>
              <Input
                inputMode="decimal"
                className="h-8 text-sm"
                value={r.baseWage}
                onFocus={selectOnFocus}
                onChange={e => onRow(i, { baseWage: e.target.value })}
              />
            </label>
            <label className="text-[11px] text-muted-foreground space-y-1">
              <span>Fringe $/h</span>
              <Input
                inputMode="decimal"
                className="h-8 text-sm"
                value={r.fringe}
                onFocus={selectOnFocus}
                onChange={e => onRow(i, { fringe: e.target.value })}
              />
            </label>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 justify-self-end"
              aria-label={`Remove ${r.label}`}
              onClick={() => onRemoveRow(i)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() => onAddRow("other")}
        >
          <Plus className="h-3.5 w-3.5" /> Add a classification
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          disabled={saving}
          onClick={onSave}
        >
          Save wage set
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
