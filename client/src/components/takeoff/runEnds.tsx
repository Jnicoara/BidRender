/**
 * What is at each end of a run — picked, never guessed.
 *
 * ── The app asks; it does not infer ──────────────────────────────────────────
 * A run's drop is worked out from what sits at its ends, and the app never
 * decides that from a stamp that happens to be nearby. Snapping to the closest
 * mark is right most of the time and silently wrong the rest, and a wrong
 * vertical is invisible: the total is simply bigger, which is what an estimator
 * expects verticals to make it. So the estimator says, and the one-tap
 * suggestion below is the app proposing rather than deciding (§ 5c).
 *
 * ── Sticky, because nobody answers eighty questions ──────────────────────────
 * Forty runs is eighty ends. The pickers stay where they were left, exactly
 * like the stamp tool stays armed with an assembly, so thirty homeruns is ONE
 * decision. What gets copied onto each run is the KIND; the height stays a live
 * setting, so changing a company height still re-prices every run using it.
 *
 * ── "Start" defaults to carrying on at run height, and that is a defence ─────
 * Trace panel → junction box, then junction box → receptacle, and if the box is
 * named at both ends the app adds a drop INTO it and a rise back OUT of it.
 * When the pipe actually carries straight on at ceiling height that is four
 * feet of pipe per box that does not exist — eighty feet on a job with twenty
 * boxes, in the wrong direction. Defaulting the start to "continues at run
 * height" makes the safe answer the one you get by not thinking about it.
 *
 * ── One picker, two places ───────────────────────────────────────────────────
 * The toolbar pair and the per-run editor use the SAME select. Two similar
 * pickers in two files drift, and the drift here would show up as a wrong
 * number rather than a broken screen — see CLAUDE.md § Copying a layout.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HeightFields } from "@/components/HeightFields";
import {
  DISTRIBUTION_KIND,
  DISTRIBUTION_LABEL,
  formatElevation,
  heightTypeLabel,
} from "@shared/takeoffHeights";
import type { EndVertical, RunVerticals } from "@shared/takeoffHeights";

/** The sentinel the Select uses for "nobody has said" — "" is not allowed. */
const NOT_ANSWERED = "__none__";

export type RunEndsValue = {
  startKind: string | null;
  endKind: string | null;
  startHeightInches: number | null;
  endHeightInches: number | null;
  distributionHeightInches: number | null;
  startStampId: number | null;
  endStampId: number | null;
};

/**
 * One end's picker: not answered, carries on at run height, or a device.
 *
 * Retired types are left out — they cannot be chosen again — but a run already
 * pointing at one keeps resolving it, which is the whole point of retiring
 * rather than deleting.
 */
export function EndKindSelect({
  bidId,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  bidId: number;
  value: string | null;
  onChange: (kind: string | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  const { data } = trpc.takeoffHeights.forBid.useQuery({ bidId });
  const types = (data?.types ?? []).filter(row => row.isActive);

  /**
   * What the closed picker reads.
   *
   * Deliberately shorter than the option it stands for. The open list has room
   * to say "Continues at run height" and to put each type's height beside it,
   * which is what makes the choice; the closed trigger is 36 units wide in a
   * toolbar and truncates both to uselessness — "Continues at run…" and
   * "Receptacle — 1'…" tell you nothing you did not already know.
   */
  const closedLabel = () => {
    if (value === null) return "Not set";
    if (value === DISTRIBUTION_KIND) return DISTRIBUTION_LABEL;
    return heightTypeLabel(value, types) ?? value;
  };

  return (
    <Select
      value={value ?? NOT_ANSWERED}
      onValueChange={next => onChange(next === NOT_ANSWERED ? null : next)}
    >
      <SelectTrigger
        className={className ?? "h-7 w-40 text-xs"}
        aria-label={ariaLabel}
      >
        <SelectValue>{closedLabel()}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NOT_ANSWERED}>Not set</SelectItem>
        <SelectItem value={DISTRIBUTION_KIND}>
          Continues at run height
        </SelectItem>
        {types.map(row => (
          <SelectItem key={row.typeKey} value={row.typeKey}>
            {row.label}
            {row.heightInches !== null
              ? ` — ${formatElevation(row.heightInches)}`
              : " — no height set"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The sticky pair on the trace toolbar.
 *
 * These are not saved to a run until a run is finished, and changing them
 * afterwards does not reach back and rewrite runs already traced.
 */
export function TraceEndsPickers({
  bidId,
  value,
  onChange,
}: {
  bidId: number;
  value: { startKind: string | null; endKind: string | null };
  onChange: (next: {
    startKind: string | null;
    endKind: string | null;
  }) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">From</span>
      <EndKindSelect
        bidId={bidId}
        value={value.startKind}
        onChange={startKind => onChange({ ...value, startKind })}
        ariaLabel="What this run starts at"
        className="h-7 w-36 text-xs"
      />
      <span className="text-muted-foreground">to</span>
      <EndKindSelect
        bidId={bidId}
        value={value.endKind}
        onChange={endKind => onChange({ ...value, endKind })}
        ariaLabel="What this run ends at"
        className="h-7 w-36 text-xs"
      />
    </div>
  );
}

/** One end's line in the run breakdown: the answer, or why there is none. */
function VerticalLine({
  vertical,
  which,
}: {
  vertical: EndVertical;
  which: "start" | "end";
}) {
  const where = which === "start" ? "start" : "end";

  if (!vertical.counted) {
    const words: Record<string, string> = {
      "no-kind": "not set — say what is here and its drop is counted",
      "no-distribution-height": "no run height set for this job",
      "height-not-set": "no height set for this type",
      level: "none, continues at run height",
    };
    return (
      <div className="flex items-baseline justify-between text-xs gap-2">
        <span className="text-muted-foreground flex items-center gap-1">
          <Minus className="w-3 h-3" />
          At the {where}
        </span>
        <span className="text-[0.7rem] text-muted-foreground text-right">
          {words[vertical.reason]}
        </span>
      </div>
    );
  }

  const Icon = vertical.direction === "drop" ? ArrowDown : ArrowUp;
  return (
    <div className="flex items-baseline justify-between text-xs gap-2">
      <span className="text-muted-foreground flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {vertical.direction === "drop" ? "Drop" : "Rise"} at the {where}
        <span className="text-muted-foreground/60 font-mono">
          {formatElevation(vertical.distributionInches)} →{" "}
          {formatElevation(vertical.endInches)}
        </span>
      </span>
      <span className="font-mono">{vertical.feet.toFixed(2)} ft</span>
    </div>
  );
}

/**
 * The per-run editor: what is at each end, and this run's own overrides.
 *
 * Lives behind the selected run in the panel rather than on every row — nine
 * controls on a run is too many, and a crowded panel is one people stop
 * reading (§ 6).
 */
export function RunEndsEditor({
  bidId,
  runId,
  ends,
  verticals,
  suggestion,
}: {
  bidId: number;
  runId: number;
  ends: RunEndsValue;
  verticals: RunVerticals | null;
  /** A stamp sitting on this run's end that nothing has claimed yet. */
  suggestion: { stampId: number; label: string; typeKey: string | null } | null;
}) {
  const utils = trpc.useUtils();
  const setEnds = trpc.takeoffRuns.setEnds.useMutation({
    onSuccess: () => {
      void utils.takeoffRuns.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const save = (patch: Partial<RunEndsValue>) =>
    setEnds.mutate({ id: runId, ...patch });

  return (
    <div className="mt-2 pt-2 border-t border-border/60 space-y-2">
      <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        Ends
      </div>

      {verticals && (
        <div className="space-y-0.5">
          <VerticalLine vertical={verticals.start} which="start" />
          <VerticalLine vertical={verticals.end} which="end" />
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-[0.7rem] text-muted-foreground w-8">From</span>
        <EndKindSelect
          bidId={bidId}
          value={ends.startKind}
          onChange={startKind => save({ startKind })}
          ariaLabel="What this run starts at"
          className="h-6 flex-1 text-xs"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[0.7rem] text-muted-foreground w-8">To</span>
        <EndKindSelect
          bidId={bidId}
          value={ends.endKind}
          onChange={endKind => save({ endKind })}
          ariaLabel="What this run ends at"
          className="h-6 flex-1 text-xs"
        />
      </div>

      {/*
        The one-tap suggestion. The app proposes; the estimator accepts.

        What accepting does TODAY is link the stamp, which is what the
        double-count rule reads. It does NOT set the end's type: nothing links
        an assembly to a height type yet, and inferring "receptacle" from an
        assembly called "Duplex recep 20A" would be the guessing this whole
        feature refuses. When assemblies carry a height type (Phase 8), the
        same chip can offer both and the wording changes with it.
      */}
      {suggestion && (
        <div className="flex items-start gap-2 rounded border border-[#38BDF8]/40 bg-[#38BDF8]/5 px-2 py-1.5">
          <span className="text-[0.7rem] flex-1 min-w-0">
            <span className="font-medium">{suggestion.label}</span> is marked at
            this end. Link it and this run keeps the drop, so it cannot be
            counted twice.
          </span>
          <Button
            size="sm"
            className="h-6 px-2 text-[0.7rem]"
            onClick={() =>
              save({
                endStampId: suggestion.stampId,
                ...(suggestion.typeKey ? { endKind: suggestion.typeKey } : {}),
              })
            }
          >
            <Check className="w-3 h-3 mr-1" />
            Link
          </Button>
        </div>
      )}

      {/*
        This run does not sit where the rest of the job does. Kept last and
        unlabelled-until-used, because it is the exception rather than the
        routine — the sliders are for the run that differs (§ 2.5).
      */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[0.7rem] text-muted-foreground">
          This run sits at
        </span>
        <HeightFields
          compact
          value={ends.distributionHeightInches}
          belowFloor={false}
          ariaPrefix="This run's own run height"
          onSave={inches => save({ distributionHeightInches: inches })}
          onClear={
            ends.distributionHeightInches !== null
              ? () => save({ distributionHeightInches: null })
              : undefined
          }
          clearLabel="Follow the job"
          // Empty here means "follows the job", and a real height IS in
          // effect. "Not set" would read as "nothing applies to this run".
          unsetLabel="the job's run height"
          setLabel="Override"
        />
      </div>
    </div>
  );
}
