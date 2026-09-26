/**
 * What the job actually took, beside what the bid said it would.
 *
 * ── Collapsed until asked for ────────────────────────────────────────────────
 * Closing out is optional and most bids never will be, so this sits shut and
 * says one line about what it is. An open form on every bid would imply the
 * app wants something the contractor has not agreed to give it — and the moment
 * this feels like paperwork, nobody fills it in and the productivity data never
 * arrives.
 *
 * ── Two ways to answer, because two kinds of contractor ──────────────────────
 * A total is what most people have: the job took 23 hours. The per-assembly
 * breakdown is for someone who tracks that way, and it is the one that feeds
 * per-assembly suggestions — so the form says so rather than leaving the
 * difference to be discovered.
 *
 * ── The comparison is the payoff, so it leads ────────────────────────────────
 * Once hours are in, the variance is the first thing on screen, with the
 * implied productivity factor beside it as a reading rather than a button.
 * Applying it would move every bid still inheriting the company default, which
 * CLAUDE.md is explicit is a decision a person makes on the Settings screen.
 */
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { useCompany } from "@/hooks/useCompany";
import type { CloseoutMode } from "@shared/closeout";

const hrs = (n: number) =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} h`;

const pct = (n: number | null) =>
  n === null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;

const TONE = {
  over: "text-amber-400",
  under: "text-emerald-400",
  onTarget: "text-muted-foreground",
} as const;

export function CloseoutPanel({ bidId }: { bidId: number }) {
  const utils = trpc.useUtils();
  const access = useCompany();
  const canEdit = access.can("bids.edit");

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CloseoutMode>("total");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [lineHours, setLineHours] = useState<Record<number, string>>({});

  /**
   * Fetched whether or not the panel is open.
   *
   * Gating this on `open` seemed thriftier and made the collapsed header a lie:
   * it could not say "recorded" or show the variance until somebody had already
   * opened it, so the one line that tells a contractor at a glance how the job
   * went never appeared until after they had gone looking. One small query per
   * bid screen is the right trade.
   */
  const query = trpc.closeout.get.useQuery({ bidId });
  const data = query.data;

  // Seed the form from whatever is already recorded, once it arrives.
  useEffect(() => {
    if (!data?.closeout) return;
    setMode(data.closeout.mode as CloseoutMode);
    setTotal(
      data.closeout.totalActualHours === null
        ? ""
        : String(Number(data.closeout.totalActualHours))
    );
    setNotes(data.closeout.notes ?? "");
  }, [data?.closeout]);

  /**
   * Put the recorded per-assembly hours back into the form.
   *
   * Without this a recorded per-assembly close-out came back with every field
   * blank, so "Update close-out" submitted nothing and refused. Keyed by the
   * close-out line's own id, which is exact — matching on assembly id would
   * collide the moment a bid carries the same assembly on two lines, which is
   * ordinary (twelve of the same downlight across two floors).
   */
  useEffect(() => {
    if (!data?.lines?.length) return;
    setLineHours(prev => {
      if (Object.keys(prev).length > 0) return prev; // never clobber typing
      const seeded: Record<number, string> = {};
      for (const line of data.lines) {
        seeded[line.id] = String(Number(line.actualHours));
      }
      return seeded;
    });
  }, [data?.lines]);

  const save = trpc.closeout.save.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result => {
      void utils.closeout.get.invalidate({ bidId });
      void utils.closeout.suggestions.invalidate();
      toast.success(
        result.suggestionsChanged > 0
          ? "Close-out saved. There is a suggestion waiting in your Assemblies library."
          : "Close-out saved."
      );
    },
  });

  const remove = trpc.closeout.remove.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: () => {
      void utils.closeout.get.invalidate({ bidId });
      void utils.closeout.suggestions.invalidate();
      setTotal("");
      setNotes("");
      toast.success("Close-out removed.");
    },
  });

  /**
   * The rows the per-assembly form is built from.
   *
   * Two sources, and which one wins matters:
   *
   *   RECORDED lines, when there are any. Editing a close-out means editing
   *   what was written down, so the form shows those figures and their own
   *   ids — a close-out is a measurement, and re-deriving its rows from a bid
   *   that has since gained a line would quietly change what is being
   *   corrected.
   *
   *   The live ESTIMATE otherwise. That covers a first close-out and, just as
   *   importantly, switching a total-mode close-out to per-assembly — which
   *   was impossible while the estimate stopped being sent once anything was
   *   recorded.
   */
  const formLines = useMemo(() => {
    const recorded = data?.lines ?? [];
    if (recorded.length > 0) {
      return recorded.map(line => ({
        key: line.id,
        assemblyId: line.assemblyId,
        assemblyName: line.assemblyName,
        qty: Number(line.qty),
        estimatedHours: Number(line.estimatedHours),
      }));
    }
    return (data?.estimate?.lines ?? []).map(line => ({
      key: line.bidLineItemId,
      assemblyId: line.assemblyId,
      assemblyName: line.assemblyName,
      qty: line.qty,
      estimatedHours: line.estimatedHours,
    }));
  }, [data?.lines, data?.estimate?.lines]);

  /**
   * Enter walks down the column; on the last row it records.
   *
   * This is the flow CLAUDE.md § Editing fields describes — "Enter keeps focus
   * ... so a column of figures can be typed straight down" — applied to the one
   * screen where a contractor types a column of figures. Without it, twenty-four
   * assemblies meant twenty-four trips to the mouse, which is most of why
   * breaking a job down took two minutes instead of twenty seconds.
   *
   * The last row submits rather than trapping focus, because there is nowhere
   * left to go and reaching for the button is the thing being removed.
   */
  const onLineKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = document.querySelector<HTMLInputElement>(
      `[data-closeout-line="${index + 1}"]`
    );
    if (next) {
      next.focus();
      next.select();
      return;
    }
    submit();
  };

  const submit = () => {
    if (mode === "total") {
      const parsed = Number(total);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Enter the hours the job took.");
        return;
      }
      save.mutate({
        bidId,
        mode: "total",
        totalActualHours: parsed,
        notes: notes.trim() || null,
      });
      return;
    }

    const lines = formLines
      .map(line => ({
        assemblyId: line.assemblyId,
        assemblyName: line.assemblyName,
        qty: line.qty,
        estimatedHours: line.estimatedHours,
        actualHours: Number(lineHours[line.key] ?? ""),
      }))
      .filter(line => Number.isFinite(line.actualHours));

    if (lines.length === 0) {
      toast.error("Enter hours against at least one assembly.");
      return;
    }
    save.mutate({
      bidId,
      mode: "byAssembly",
      lines,
      notes: notes.trim() || null,
    });
  };

  const recorded = data?.closeout ?? null;
  const variance = data?.variance ?? null;

  const summary = useMemo(() => {
    if (!recorded || !variance) return "Record what the job actually took.";
    return `${hrs(variance.actualHours)} against ${hrs(variance.estimatedHours)} estimated`;
  }, [recorded, variance]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <ClipboardCheck
          className={cn(
            "w-4 h-4 shrink-0",
            recorded ? "text-emerald-400" : "text-muted-foreground"
          )}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">
            Job close-out
            {recorded && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                recorded
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground truncate">
            {summary}
          </span>
        </span>
        {recorded && variance && (
          <span
            className={cn(
              "text-sm font-mono shrink-0",
              TONE[variance.direction]
            )}
          >
            {pct(variance.deltaPct)}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-4">
          {query.isLoading ? (
            <div className="h-16 rounded bg-muted/40 animate-pulse" />
          ) : (
            <>
              {/* ── The comparison, once there is one ── */}
              {recorded && variance && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                    <span>
                      <span className="text-muted-foreground">Estimated </span>
                      <span className="font-mono">
                        {hrs(variance.estimatedHours)}
                      </span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Actual </span>
                      <span className="font-mono">
                        {hrs(variance.actualHours)}
                      </span>
                    </span>
                    <span className={TONE[variance.direction]}>
                      {variance.direction === "over" ? (
                        <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
                      ) : variance.direction === "under" ? (
                        <TrendingDown className="w-3.5 h-3.5 inline mr-1" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                      )}
                      <span className="font-mono">
                        {variance.deltaHours > 0 ? "+" : ""}
                        {hrs(variance.deltaHours)} ({pct(variance.deltaPct)})
                      </span>
                    </span>
                  </div>

                  {data?.impliedProductivity !== null &&
                    data?.impliedProductivity !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        A productivity factor of{" "}
                        <span className="font-mono text-foreground">
                          {data.impliedProductivity > 0 ? "+" : ""}
                          {Math.round(data.impliedProductivity * 100)}%
                        </span>{" "}
                        would have made this estimate right. Shown as a reading
                        — changing the company factor in Settings moves every
                        bid still following it.
                      </p>
                    )}

                  {data!.lines.length > 0 && (
                    <table className="w-full text-xs mt-1">
                      <tbody>
                        {data!.lines.map(line => (
                          <tr
                            key={line.id}
                            className="border-t border-border/40"
                          >
                            <td className="py-1 pr-3">{line.assemblyName}</td>
                            <td className="py-1 text-right font-mono text-muted-foreground w-20">
                              {hrs(Number(line.estimatedHours))}
                            </td>
                            <td className="py-1 text-right font-mono w-20">
                              {hrs(Number(line.actualHours))}
                            </td>
                            <td
                              className={cn(
                                "py-1 text-right font-mono w-16",
                                TONE[line.variance.direction]
                              )}
                            >
                              {pct(line.variance.deltaPct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── The form ── */}
              {canEdit ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    {(["total", "byAssembly"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                          mode === m
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        {m === "total" ? "One total" : "By assembly"}
                      </button>
                    ))}
                    <span className="text-xs text-muted-foreground ml-2">
                      {mode === "total"
                        ? "The hours the whole job took."
                        : "Per assembly — this is what feeds suggestions."}
                    </span>
                  </div>

                  {mode === "total" ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground block">
                          Actual hours
                        </span>
                        {/*
                          Enter records it. The whole of this mode is one
                          number, and making somebody reach for the mouse after
                          typing it was the single biggest cost in a flow that
                          has to stay under a minute or contractors stop
                          logging actuals at all.
                        */}
                        <Input
                          value={total}
                          onChange={e => setTotal(e.target.value)}
                          onFocus={selectOnFocus}
                          onKeyDown={e => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            submit();
                          }}
                          inputMode="decimal"
                          placeholder="e.g. 23"
                          className="h-8 w-32 text-sm font-mono"
                        />
                      </label>
                      {data?.estimate && (
                        <span className="text-xs text-muted-foreground pb-2">
                          Estimated {hrs(data.estimate.totalHours)}
                          {/* Short by the lines that can't be priced; saving
                              refuses until they are fixed on the bid. */}
                          {data.estimate.unpriceableLines > 0 && (
                            <span className="text-red-500">
                              {" "}
                              · incomplete, {
                                data.estimate.unpriceableLines
                              }{" "}
                              line
                              {data.estimate.unpriceableLines === 1
                                ? ""
                                : "s"}{" "}
                              can't be priced
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {formLines.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          This bid has no assemblies to break down.
                        </p>
                      ) : (
                        formLines.map((line, index) => (
                          <div
                            key={line.key}
                            className="flex items-center gap-3 text-sm"
                          >
                            <span className="flex-1 min-w-0 truncate">
                              {line.assemblyName}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono w-20 text-right">
                              {hrs(line.estimatedHours)}
                            </span>
                            <Input
                              value={lineHours[line.key] ?? ""}
                              onChange={e =>
                                setLineHours(prev => ({
                                  ...prev,
                                  [line.key]: e.target.value,
                                }))
                              }
                              onFocus={selectOnFocus}
                              onKeyDown={e => onLineKeyDown(e, index)}
                              inputMode="decimal"
                              placeholder="actual"
                              className="h-7 w-24 text-sm font-mono"
                              data-closeout-line={index}
                              aria-label={`Actual hours for ${line.assemblyName}`}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  <label className="space-y-1 block">
                    <span className="text-xs text-muted-foreground">
                      Notes (why it went the way it did)
                    </span>
                    <Input
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      onKeyDown={e => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        submit();
                      }}
                      placeholder="Rain held us up on the Tuesday"
                      className="h-8 text-sm"
                    />
                  </label>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={save.isPending}
                      onClick={submit}
                    >
                      {recorded ? "Update close-out" : "Record close-out"}
                    </Button>
                    {recorded && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={() => remove.mutate({ bidId })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Your role can see the close-out but not record one.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
