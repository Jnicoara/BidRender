/**
 * EDITING THE STARTER — the edit dialog and the Change log tab on the
 * baseline screen (references/starter-offers-plan.md § 2.1, § 4 step 4;
 * owner Q5, Q6).
 *
 * One field per Confirm, and every Confirm is ONE batch: preview first —
 * "Old → New. Pins N shops… offers it to M" — measured by the server doing
 * the change and rolling it back, so what Confirm then does cannot differ.
 * The screen never writes a shared row any other way.
 */
import { useState } from "react";
import { History, Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  editFieldsFor,
  fromInputText,
  previewSentence,
  toInputText,
  type EditTable,
} from "@/lib/starterEdit";
import {
  fieldLabel,
  formatUpdateValue,
  type UpdateTable,
} from "@/lib/starterUpdates";

/** A field the rateEdit route takes. */
type RateField =
  | "baseWage"
  | "payrollTaxPct"
  | "workersCompPct"
  | "insurancePct"
  | "benefitsPct"
  | "hourlyCost"
  | "annualSalary"
  | "annualHours";

type Preview = {
  reach: "offer" | "everyone" | "unchanged";
  pins: number;
  offered: number;
  oldValue: unknown;
  newValue: unknown;
  lines: Array<{ field: string | null; oldValue: unknown; newValue: unknown }>;
};

function shops(n: number) {
  return n === 1 ? "1 shop" : `${n} shops`;
}

/** The small pencil on a starter row. */
export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      title="Change this starter item"
      aria-label="Change this starter item"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Pencil size={14} />
    </button>
  );
}

export function StarterEditDialog({
  table,
  rowId,
  itemName,
  current,
  onClose,
}: {
  table: EditTable;
  rowId: number;
  itemName: string;
  current: Record<string, unknown>;
  onClose: () => void;
}) {
  const fields = editFieldsFor(table, current);
  const [fieldName, setFieldName] = useState(fields[0].field);
  const f = fields.find(x => x.field === fieldName)!;
  const [text, setText] = useState(() => toInputText(f.unit, current[f.field]));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const utils = trpc.useUtils();
  const apply = trpc.starterLibrary.applyEdit.useMutation({
    onSuccess: r => {
      toast.success(
        r.batchId === null
          ? "Nothing changed — it already had that value."
          : `Saved. ${r.applied[0]?.pins ? `${shops(r.applied[0].pins)} pinned to the old value.` : ""}`
      );
      void utils.starterLibrary.invalidate();
      onClose();
    },
    onError: e => setProblem(e.message),
  });
  // A labor-rate figure: the part and the rate it makes, one batch.
  const rate = trpc.starterLibrary.rateEdit.useMutation();

  const pickField = (name: string) => {
    const next = fields.find(x => x.field === name)!;
    setFieldName(name);
    setText(toInputText(next.unit, current[name]));
    setPreview(null);
    setProblem(null);
  };

  const parsed = fromInputText(f, text);
  const edit =
    "value" in parsed
      ? {
          kind: "field" as const,
          table,
          rowId,
          field: f.field,
          newValue: parsed.value,
        }
      : null;

  const runPreview = async () => {
    if (!edit) {
      setProblem("error" in parsed ? parsed.error : null);
      return;
    }
    setChecking(true);
    setProblem(null);
    try {
      if (f.rate) {
        const r = await rate.mutateAsync({
          rowId,
          field: f.field as RateField,
          value: Number(edit.newValue),
          preview: true,
        });
        setPreview(r.preview);
      } else setPreview(await utils.starterLibrary.previewEdit.fetch(edit));
    } catch (e) {
      setPreview(null);
      setProblem((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const fmtField = (field: string | null, v: unknown) =>
    formatUpdateValue(table as UpdateTable, field ?? f.field, v);

  const confirm = async () => {
    if (!edit) return;
    if (!f.rate) {
      apply.mutate(edit);
      return;
    }
    try {
      const r = await rate.mutateAsync({
        rowId,
        field: f.field as RateField,
        value: Number(edit.newValue),
        preview: false,
      });
      const pins = r.applied?.applied.reduce((n, a) => n + a.pins, 0) ?? 0;
      toast.success(
        `Saved. ${pins ? `${shops(pins)} pinned to the old value.` : ""}`
      );
      void utils.starterLibrary.invalidate();
      onClose();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change “{itemName}”</DialogTitle>
          <DialogDescription>
            Shops that already use it are pinned to today’s value and offered
            the new one. New shops get the new one straight away.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {fields.map(x => (
            <button
              key={x.field}
              type="button"
              onClick={() => pickField(x.field)}
              aria-pressed={x.field === fieldName}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                x.field === fieldName
                  ? "border-[#F5C518] bg-[#F5C518]/10"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">
            {f.label}
            {f.unit === "percent"
              ? " (%)"
              : f.unit === "hours"
                ? " (hours)"
                : f.unit === "feet"
                  ? " (ft)"
                  : f.unit === "money"
                    ? " ($)"
                    : ""}
            {" · now "}
            {formatUpdateValue(table as UpdateTable, f.field, current[f.field])}
          </span>
          <Input
            value={text}
            onChange={e => {
              setText(e.target.value);
              setPreview(null);
              setProblem(null);
            }}
            onFocus={f.unit === "text" ? undefined : selectOnFocus}
            onKeyDown={e => {
              if (e.key === "Enter") void runPreview();
            }}
            inputMode={f.unit === "text" ? "text" : "decimal"}
            placeholder={f.blankable ? "blank = not set" : undefined}
            className="mt-1"
            autoFocus
          />
        </label>
        {problem && (
          <p className="whitespace-pre-line text-sm text-destructive">
            {problem}
          </p>
        )}
        {preview && (
          <div className="rounded-md border border-border p-3 text-sm">
            {preview.reach !== "unchanged" &&
              preview.lines.map((l, i) => (
                <p key={i} className="tabular-nums">
                  {preview.lines.length > 1 && (
                    <span className="text-muted-foreground">
                      {fieldLabel(table as UpdateTable, l.field ?? "")}:{" "}
                    </span>
                  )}
                  {fmtField(l.field, l.oldValue)} →{" "}
                  <span className="font-semibold">
                    {fmtField(l.field, l.newValue)}
                  </span>
                </p>
              ))}
            <p
              className={
                preview.reach === "unchanged"
                  ? ""
                  : "mt-1 text-xs text-muted-foreground"
              }
            >
              {previewSentence(preview)}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          {preview && preview.reach !== "unchanged" ? (
            <button
              type="button"
              disabled={apply.isPending || rate.isPending || !edit}
              onClick={() => void confirm()}
              className="rounded-md bg-[#F5C518] px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              Confirm
            </button>
          ) : (
            <button
              type="button"
              disabled={checking}
              onClick={() => void runPreview()}
              className="rounded-md bg-[#F5C518] px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {checking ? "Checking…" : "Preview"}
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {fieldLabel(table as UpdateTable, f.field)} ·{" "}
          {f.everyone ? "a finding field" : "an offer to existing shops"}
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ── Change log ──────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  screen: "Edited here",
  sheet: "Sheet upload",
  copy: "Copied from a company",
  seed: "Server start",
  undo: "Undo",
};

export function ChangeLogTab() {
  const [includeSeed, setIncludeSeed] = useState(false);
  const log = trpc.starterLibrary.changeLog.useQuery({
    limit: 50,
    includeSeed,
  });
  const utils = trpc.useUtils();
  const [undoing, setUndoing] = useState<{
    batchId: number;
    undoable: number[];
    notUndone: Array<{ changeId: number; why: string }>;
  } | null>(null);
  const undo = trpc.starterLibrary.undoBatch.useMutation({
    onError: e => toast.error(e.message),
  });

  const askUndo = async (batchId: number) => {
    try {
      const r = await undo.mutateAsync({ batchId, preview: true });
      setUndoing({ batchId, undoable: r.undoable, notUndone: r.notUndone });
    } catch {
      /* toast above */
    }
  };

  if (log.isLoading)
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  const batches = log.data ?? [];
  return (
    <div className="p-4 max-w-4xl">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          <History size={16} /> Change log
        </h2>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeSeed}
            onChange={e => setIncludeSeed(e.target.checked)}
          />
          Show server-start search-word updates
        </label>
      </div>
      {batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No changes yet. Every change to the starter shows here, with Undo.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {batches.map(b => {
            const allUndone = b.changes.every(c => c.undoneByChangeId !== null);
            return (
              <li key={b.batchId} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>{new Date(b.at).toLocaleString()}</span>
                  <span>{SOURCE_LABEL[b.source] ?? b.source}</span>
                  {b.editorName && <span>{b.editorName}</span>}
                  {allUndone ? (
                    <span className="ml-auto rounded border border-border px-1.5">
                      Undone
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={undo.isPending}
                      onClick={() => void askUndo(b.batchId)}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Undo2 size={12} /> Undo
                    </button>
                  )}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {b.changes.map(c => {
                    const t = (c.table ?? "materials") as UpdateTable;
                    return (
                      <li key={c.changeId} className="text-sm tabular-nums">
                        <span>{c.itemName}</span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {c.kind === "field"
                            ? fieldLabel(t, c.field ?? "")
                            : `${c.kind.replace("_", " ")} ${c.childName ?? ""}`}
                          {": "}
                        </span>
                        {c.kind === "field" || c.kind === "part_field" ? (
                          <>
                            {formatUpdateValue(t, c.field, c.oldValue)} →{" "}
                            {formatUpdateValue(t, c.field, c.newValue)}
                          </>
                        ) : null}
                        {c.pins > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            pinned {shops(c.pins)}
                          </span>
                        )}
                        {c.undoneByChangeId !== null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (undone)
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={undoing !== null}
        onOpenChange={o => !o && setUndoing(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Undo this change?</DialogTitle>
            <DialogDescription>
              The undo is a new change: shops that took the original are offered
              it back; shops that didn’t see nothing.
            </DialogDescription>
          </DialogHeader>
          {undoing && (
            <div className="text-sm space-y-1">
              <p>
                {undoing.undoable.length === 0
                  ? "Nothing here can be undone."
                  : `Puts back ${undoing.undoable.length === 1 ? "1 change" : `${undoing.undoable.length} changes`}.`}
              </p>
              {undoing.notUndone.map(n => (
                <p key={n.changeId} className="text-xs text-amber-400">
                  {n.why}
                </p>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setUndoing(null)}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                !undoing || undoing.undoable.length === 0 || undo.isPending
              }
              onClick={async () => {
                if (!undoing) return;
                try {
                  await undo.mutateAsync({
                    batchId: undoing.batchId,
                    preview: false,
                  });
                  toast.success("Undone.");
                } finally {
                  setUndoing(null);
                  void utils.starterLibrary.invalidate();
                }
              }}
              className="rounded-md bg-[#F5C518] px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              Undo
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
