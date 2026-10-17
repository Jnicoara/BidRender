/**
 * PRICE BRACKETS — the company material markup as rows ("$1–$10: 40%")
 * instead of one % (bid-methods-plan.md § 3, material-markup D2/D3). Under
 * Settings › Pricing › Material markup, behind ONE "More options" control:
 * most shops use one %, and the brackets are there when asked for
 * (CLAUDE.md § Customization available, but never in the way).
 *
 * Safe by default:
 *   - nothing prices from brackets until the company picks "Price brackets"
 *     (`materialMarkupMode`); saving rows alone changes no number;
 *   - the starter set fills the boxes and SAYS it is a starter — nothing
 *     applies until Save (D2: inert until the person chooses it);
 *   - an overlap is refused before Save (a price in two brackets has two
 *     markups), and the server refuses it too; a gap is said, not refused;
 *   - a line already on a bid keeps the markup it froze.
 *
 * A draft form with its own Save, so the boxes hold text
 * (`lib/bracketDraft.ts`) and take `selectOnFocus` (CLAUDE.md § Editing
 * fields, rule 1).
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/errorText";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkBrackets } from "@shared/markupBrackets";
import {
  STARTER_BRACKETS_DATE,
  STARTER_BRACKET_ROWS,
  bandsFromRows,
  rowsFromBands,
  type BracketRow,
} from "@/lib/bracketDraft";

export function MarkupBracketsEditor({
  mode,
  canEdit,
}: {
  /** `pricing_defaults.materialMarkupMode`; NULL is flat. */
  mode: "flat" | "brackets" | null;
  canEdit: boolean;
}) {
  const utils = trpc.useUtils();
  const saved = trpc.bids.markupBrackets.useQuery();
  const [open, setOpen] = useState(mode === "brackets");
  const [rows, setRows] = useState<BracketRow[] | null>(null);
  const [starter, setStarter] = useState(false);

  // The draft starts from what is stored, once it has arrived.
  useEffect(() => {
    if (rows === null && saved.data) setRows(rowsFromBands(saved.data.bands));
  }, [rows, saved.data]);

  const refresh = () => {
    void utils.bids.markupBrackets.invalidate();
    void utils.bids.pricingDefaults.invalidate();
    // Brackets in force are material markup "How do you bid?" counts.
    void utils.bids.howYouBid.invalidate();
    void utils.bids.markupReapplyPreview.invalidate();
  };
  const saveRows = trpc.bids.setMarkupBrackets.useMutation({
    onSuccess: r => {
      toast.success(
        r.saved === 0
          ? "Brackets cleared."
          : `${r.saved} bracket${r.saved === 1 ? "" : "s"} saved. Lines already on a bid keep their markup.`
      );
      setStarter(false);
      setRows(null);
      refresh();
    },
    onError: e => toast.error(errorText(e)),
  });
  const setMode = trpc.bids.setPricingDefaults.useMutation({
    onSuccess: (_r, v) =>
      toast.success(
        v.materialMarkupMode === "brackets"
          ? "New lines take their markup from your price brackets."
          : "New lines take your one company markup %."
      ),
    onError: e => toast.error(errorText(e)),
    onSettled: refresh,
  });

  const draft = useMemo(() => (rows ? bandsFromRows(rows) : null), [rows]);
  const check = draft?.ok ? checkBrackets(draft.bands) : null;
  const unchanged =
    !!saved.data &&
    !!rows &&
    JSON.stringify(rows) === JSON.stringify(rowsFromBands(saved.data.bands));
  const usingBrackets = mode === "brackets";

  const edit = (i: number, patch: Partial<BracketRow>) =>
    setRows(rs => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2" data-testid="markup-brackets">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        More options — price brackets
        {usingBrackets && (
          <span className="ml-1 rounded border border-border px-1 text-[10px]">
            in use
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Company markup shape"
          >
            {(
              [
                ["flat", "One %"],
                ["brackets", "Price brackets"],
              ] as const
            ).map(([m, label]) => {
              const on = (mode ?? "flat") === m;
              return (
                <Button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  size="sm"
                  variant={on ? "default" : "outline"}
                  className="h-7 text-xs"
                  disabled={!canEdit || setMode.isPending}
                  onClick={() =>
                    !on && setMode.mutate({ materialMarkupMode: m })
                  }
                >
                  {label}
                </Button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {usingBrackets
              ? "New lines take the markup of the bracket their price falls in. A bracket reads the purchase price — a 500 ft spool is one $200 purchase, not 500 forty-cent ones. A material's own markup and a category markup still come first."
              : "Brackets you save here price nothing until you pick Price brackets."}
          </p>

          {rows === null ? null : (
            <>
              {rows.length > 0 && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 text-[11px] text-muted-foreground">
                    <span>From $</span>
                    <span>To $ (blank = and over)</span>
                    <span>% markup</span>
                    <span className="w-7" />
                  </div>
                  {rows.map((r, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5"
                    >
                      <Input
                        inputMode="decimal"
                        className="h-8 text-sm"
                        aria-label={`Bracket ${i + 1} from`}
                        value={r.from}
                        disabled={!canEdit}
                        onFocus={selectOnFocus}
                        onChange={e => edit(i, { from: e.target.value })}
                      />
                      <Input
                        inputMode="decimal"
                        className="h-8 text-sm"
                        aria-label={`Bracket ${i + 1} to`}
                        placeholder="no top"
                        value={r.to}
                        disabled={!canEdit}
                        onFocus={selectOnFocus}
                        onChange={e => edit(i, { to: e.target.value })}
                      />
                      <Input
                        inputMode="decimal"
                        className="h-8 text-sm"
                        aria-label={`Bracket ${i + 1} % markup`}
                        value={r.pct}
                        disabled={!canEdit}
                        onFocus={selectOnFocus}
                        onChange={e => edit(i, { pct: e.target.value })}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-7"
                        aria-label={`Remove bracket ${i + 1}`}
                        disabled={!canEdit}
                        onClick={() =>
                          setRows(rs => rs!.filter((_r, j) => j !== i))
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {starter && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Starter — verify against your own work (
                  {STARTER_BRACKETS_DATE}
                  ). Nothing applies until you save.
                </p>
              )}
              {draft && !draft.ok && (
                <p className="text-[11px] text-destructive" role="alert">
                  {draft.message}
                </p>
              )}
              {check?.problems.map(p => (
                <p
                  key={p}
                  className="text-[11px] text-destructive"
                  role="alert"
                >
                  {p}
                </p>
              ))}
              {rows.length > 0 &&
                check?.gaps.map(g => (
                  <p key={g} className="text-[11px] text-muted-foreground">
                    {g}
                  </p>
                ))}

              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => {
                      const last = rows[rows.length - 1];
                      setRows([
                        ...rows,
                        { from: last?.to ?? "0", to: "", pct: "" },
                      ]);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add a bracket
                  </Button>
                  {rows.length === 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setRows([...STARTER_BRACKET_ROWS]);
                        setStarter(true);
                      }}
                    >
                      Start from the starter brackets
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={
                      unchanged ||
                      saveRows.isPending ||
                      !draft?.ok ||
                      (check?.problems.length ?? 0) > 0
                    }
                    onClick={() =>
                      draft?.ok && saveRows.mutate({ bands: draft.bands })
                    }
                  >
                    Save brackets
                  </Button>
                  {!unchanged && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        setStarter(false);
                        setRows(rowsFromBands(saved.data?.bands ?? []));
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
