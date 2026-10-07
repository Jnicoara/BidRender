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
import { ArrowDown, ArrowUp, Check, Minus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HeightFields } from "@/components/HeightFields";
import { availablePicks } from "@/lib/runEndPicks";
import { cn } from "@/lib/utils";
import {
  DISTRIBUTION_KIND,
  NOT_ANSWERED_LABEL,
  endKindLabel,
  formatElevation,
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

  /*
    What the closed picker reads — and the readout over the drawing reads the
    SAME function, so the two cannot come to disagree about what an end is
    called. The reasoning for the wording is on `endKindLabel`.
  */

  return (
    <Select
      value={value ?? NOT_ANSWERED}
      onValueChange={next => onChange(next === NOT_ANSWERED ? null : next)}
    >
      <SelectTrigger
        className={className ?? "h-7 w-40 text-xs"}
        aria-label={ariaLabel}
      >
        <SelectValue>{endKindLabel(value, types)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NOT_ANSWERED}>{NOT_ANSWERED_LABEL}</SelectItem>
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
  quantity = false,
}: {
  bidId: number;
  value: { startKind: string | null; endKind: string | null };
  onChange: (next: {
    startKind: string | null;
    endKind: string | null;
  }) => void;
  /**
   * A quantity trace (D21) has no ends to answer. The "to" picker stays,
   * relabelled, because it is what a proposed drop defaults to (answer 4) —
   * the same remembered value, so switching modes changes nothing about it.
   */
  quantity?: boolean;
}) {
  if (quantity)
    return (
      <div className="flex shrink-0 items-center gap-1.5 text-xs">
        <span className="text-muted-foreground whitespace-nowrap">
          Drops to
        </span>
        <EndKindSelect
          bidId={bidId}
          value={value.endKind}
          onChange={endKind => onChange({ ...value, endKind })}
          ariaLabel="What a proposed drop goes to"
          className="h-7 w-36 text-xs"
        />
      </div>
    );
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
        <span className="text-xs text-muted-foreground text-right">
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
/** A tee end, said rather than asked (D20). */
function TeeEnd() {
  return (
    <span className="h-6 flex-1 flex items-center text-xs text-muted-foreground">
      Branch tee — carries on at run height, no drop
    </span>
  );
}

export function RunEndsEditor({
  bidId,
  ends,
  verticals,
  suggestion,
  teeEnds = { start: false, end: false },
  onSave,
  endsElsewhere = false,
}: {
  bidId: number;
  /**
   * Save through the PAGE, never a mutation of this component's own. The one
   * this had refreshed `takeoffRuns` only, so the bid's lines, the Send
   * preview and the materials list kept the old drop on screen; the page's
   * save goes through @/lib/takeoffRefresh "runEnds" and onto the undo stack.
   */
  onSave: (patch: Partial<RunEndsValue>) => void;
  /**
   * The ends themselves are listed in `RunEndsSection` above, for every leg;
   * this then shows only this leg's link suggestion and its own run height.
   */
  endsElsewhere?: boolean;
  /**
   * Which ends sit on a branch tee (D20). A tee end carries on at run height
   * and belongs to no mark, so it gets a statement instead of a picker — the
   * server refuses a kind there, and a picker it refuses is a dead control.
   */
  teeEnds?: { start: boolean; end: boolean };
  ends: RunEndsValue;
  verticals: RunVerticals | null;
  /** A stamp sitting on this run's end that nothing has claimed yet. */
  suggestion: { stampId: number; label: string; typeKey: string | null } | null;
}) {
  const save = onSave;

  return (
    <div className="mt-2 pt-2 border-t border-border/60 space-y-2">
      {!endsElsewhere && (
        <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          Ends
        </div>
      )}

      {!endsElsewhere && verticals && (
        <div className="space-y-0.5">
          <VerticalLine vertical={verticals.start} which="start" />
          <VerticalLine vertical={verticals.end} which="end" />
        </div>
      )}

      {!endsElsewhere && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground w-8">From</span>
            {teeEnds.start ? (
              <TeeEnd />
            ) : (
              <EndKindSelect
                bidId={bidId}
                value={ends.startKind}
                onChange={startKind => save({ startKind })}
                ariaLabel="What this run starts at"
                className="h-6 flex-1 text-xs"
              />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground w-8">To</span>
            {teeEnds.end ? (
              <TeeEnd />
            ) : (
              <EndKindSelect
                bidId={bidId}
                value={ends.endKind}
                onChange={endKind => save({ endKind })}
                ariaLabel="What this run ends at"
                className="h-6 flex-1 text-xs"
              />
            )}
          </div>
        </>
      )}

      {/*
        The one-tap suggestion. The app proposes; the estimator accepts.

        What accepting does TODAY is link the stamp, which is what the
        double-count rule reads. It does NOT set the end's type: nothing links
        an assembly to a height type yet, and inferring "receptacle" from an
        assembly called "Duplex recep 20A" would be the guessing this whole
        feature refuses. When assemblies carry a height type (Phase 8), the
        same chip can offer both and the wording changes with it.
      */}
      {suggestion && !teeEnds.end && (
        <div className="flex items-start gap-2 rounded border border-[#38BDF8]/40 bg-[#38BDF8]/5 px-2 py-1.5">
          <span className="text-xs flex-1 min-w-0">
            <span className="font-medium">{suggestion.label}</span> is marked at
            this end. Link it and this run keeps the drop, so it cannot be
            counted twice.
          </span>
          <Button
            size="sm"
            className="h-6 px-2 text-xs"
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
      <RunsAtChoice />

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground">This run sits at</span>
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
          clearLabel="Follow the ceiling"
          // Empty here means a real height IS in effect — the ceiling at
          // each box: its height area, else the sheet's, else the job's
          // (shared/ceilingHeights.ts). This said "the job's run height"
          // until 2026-10-07, when that stopped being the whole answer.
          unsetLabel="the ceiling at each box"
          setLabel="Override"
        />
      </div>
    </div>
  );
}

/**
 * HOW THIS RUN GETS BETWEEN ITS BOXES (owner, 2026-10-07, case d):
 *   Through ceiling          up and down at every box — the drops counted
 *   Box to box, same height  along the wall — flat length, no drops
 *
 * The arithmetic is built and tested (`runsAt` in server/runVerticals.ts),
 * but the choice needs a place to be KEPT — `takeoff_runs.runsAt`, asked of
 * Track A (migrations-next-batch.md). Until it lands every run is through
 * the ceiling, and this says so rather than offering a switch that would
 * forget itself. Two large buttons, for a finger on a tablet.
 */
function RunsAtChoice() {
  return (
    <div className="space-y-1 pt-1">
      <div className="text-xs text-muted-foreground">
        Between its boxes this run goes
      </div>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup">
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11 text-xs whitespace-normal"
          role="radio"
          aria-checked
        >
          Through ceiling
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 text-xs whitespace-normal"
          role="radio"
          aria-checked={false}
          disabled
          title="Waiting for the next database update"
        >
          Box to box, same height
        </Button>
      </div>
      <div className="text-[0.7rem] text-muted-foreground">
        Box to box (no drops, flat length) arrives with the next database
        update; until then every run drops at its boxes.
      </div>
    </div>
  );
}

/**
 * What the server worked out about one end — read only, never part of a
 * save (vertical-drops-plan § 5).
 */
export type EndAbout = {
  /** Where the device height came from: "mark-typed", "count", "job"… */
  heightSource: string;
  /** Linked to a device marked existing — priced, and said (option C). */
  onExisting: boolean;
};

/** Words for a height that did not come from the type's own setting. */
export function heightSourceWords(source: string): string | null {
  switch (source) {
    case "mark-typed":
      return "this mark's height";
    case "mark-read":
      return "read from the plan";
    case "count":
      return "the count's height";
    default:
      return null;
  }
}

/** One end of one leg, as the Run ends section lists it. */
export type RunEndsLeg = {
  id: number;
  /** "Leg 2", or the run's name when it has one leg. */
  label: string;
  ends: RunEndsValue;
  about: { start: EndAbout; end: EndAbout };
  verticals: RunVerticals | null;
  teeEnds: { start: boolean; end: boolean };
  points: readonly { x: number; y: number }[];
};

/**
 * RUN ENDS — every end of every leg, in the run's card (owner, 2026-09-29).
 *
 * Opens with the run, on the plan or its card. Each open end gets one-tap
 * answers (@/lib/runEndPicks), each a kind the app ships, so the drop comes
 * from a height already set; the number is editable per end, and emptying it
 * goes back to the kind's height. A branch-tee end is said, not asked (D20).
 * Each end jumps the plan to it, and an end clicked on the plan is
 * highlighted here.
 *
 * Nothing new is stored — an end already has a kind and a height of its own —
 * so no migration. Saves go through the page (`onSave`): one refresh rule,
 * one undo stack.
 */
export function RunEndsSection({
  bidId,
  legs,
  onSave,
  onJumpTo,
  highlight,
  locked,
}: {
  bidId: number;
  legs: RunEndsLeg[];
  onSave: (runId: number, patch: Partial<RunEndsValue>) => void;
  onJumpTo: (point: { x: number; y: number }) => void;
  highlight: { runId: number; end: "start" | "end" } | null;
  locked: boolean;
}) {
  const { data } = trpc.takeoffHeights.forBid.useQuery({ bidId });
  const types = (data?.types ?? []).filter(row => row.isActive);
  const picks = availablePicks(new Set(types.map(t => t.typeKey)));
  const heightOf = (kind: string | null) =>
    kind === null
      ? null
      : (types.find(t => t.typeKey === kind)?.heightInches ?? null);

  return (
    <div className="mt-2 pt-2 border-t border-border/60 space-y-2">
      <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        Run ends
      </div>
      {locked && (
        <p className="text-xs text-muted-foreground">
          This bid's quantities are locked, so its ends cannot be changed.
        </p>
      )}
      {legs.map(leg =>
        (["start", "end"] as const).map(which => {
          const kind =
            which === "start" ? leg.ends.startKind : leg.ends.endKind;
          const own =
            which === "start"
              ? leg.ends.startHeightInches
              : leg.ends.endHeightInches;
          const vertical = leg.verticals?.[which] ?? null;
          const onTee = leg.teeEnds[which];
          const point =
            which === "start"
              ? leg.points[0]
              : leg.points[leg.points.length - 1];
          const lit = highlight?.runId === leg.id && highlight.end === which;
          const about = leg.about[which];
          const sourceWords = heightSourceWords(about.heightSource);
          const kindField = which === "start" ? "startKind" : "endKind";
          const heightField =
            which === "start" ? "startHeightInches" : "endHeightInches";
          const effective = own ?? heightOf(kind);
          return (
            <div
              key={`${leg.id}-${which}`}
              data-run-end={`${leg.id}-${which}`}
              className={cn(
                "rounded border px-2 py-1.5 space-y-1",
                lit ? "border-[#F5C518] bg-[#F5C518]/5" : "border-border/60"
              )}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:no-underline"
                  disabled={!point}
                  onClick={() => point && onJumpTo(point)}
                  title="Show this end on the plan"
                >
                  {leg.label} · {which}
                </button>
                {/*
                  AN END NOBODY ANSWERED IS AMBER (audit #6, 2026-10-06): it
                  counts no drop, and verticals are the big missed footage.
                  It was grey here while the same state on a count is amber
                  with a triangle (GroupDrop.tsx) — one fact, two weights.
                  "Carries on" and a tee are answers, so they stay grey.
                */}
                {!onTee && !vertical?.counted && kind !== DISTRIBUTION_KIND ? (
                  <span className="text-xs text-[#F5C518] text-right inline-flex items-center gap-1">
                    <TriangleAlert className="w-3 h-3 shrink-0" />
                    not set — no drop counted
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground text-right">
                    {onTee
                      ? "branch tee — no drop"
                      : vertical?.counted
                        ? `${vertical.direction === "drop" ? "Drop" : "Rise"} ${vertical.feet.toFixed(2)} ft${sourceWords ? ` · ${sourceWords}` : ""}`
                        : "no drop — carries on"}
                  </span>
                )}
              </div>
              {/*
                OPTION C (owner, 2026-10-05): an end on an EXISTING device
                prices its drop — new pipe to an old box is real work — and
                says so, with one click to leave it off. Leaving it off sets
                the end to "run height", which is already how an end says
                "no drop here", so nothing new is stored.
              */}
              {!onTee && about.onExisting && (
                <div className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs">
                  <span className="text-muted-foreground">
                    Ends on an existing device —{" "}
                    {vertical?.counted ? "drop priced." : "drop left off."}
                  </span>
                  {!locked && vertical?.counted && (
                    <button
                      type="button"
                      className="shrink-0 underline underline-offset-2 hover:text-foreground"
                      onClick={() =>
                        onSave(leg.id, {
                          [kindField]: DISTRIBUTION_KIND,
                          [heightField]: null,
                        })
                      }
                      title="No new pipe or wire down to this device. The end carries on at run height."
                    >
                      Leave it off
                    </button>
                  )}
                  {!locked &&
                    !vertical?.counted &&
                    kind === DISTRIBUTION_KIND && (
                      <button
                        type="button"
                        className="shrink-0 underline underline-offset-2 hover:text-foreground"
                        onClick={() =>
                          onSave(leg.id, {
                            [kindField]: null,
                            [heightField]: null,
                          })
                        }
                        title="Count the drop to this device again, at its count's height"
                      >
                        Price it
                      </button>
                    )}
                </div>
              )}
              {onTee ? (
                <TeeEnd />
              ) : (
                <>
                  <div className="flex flex-wrap gap-1">
                    {picks.map(pick => (
                      <button
                        key={pick.kind}
                        type="button"
                        disabled={locked}
                        aria-pressed={kind === pick.kind}
                        onClick={() =>
                          onSave(leg.id, {
                            [kindField]: pick.kind,
                            // A new kind takes ITS height, not the old override.
                            [heightField]: null,
                          })
                        }
                        className={cn(
                          "h-6 rounded-full border px-2 text-xs transition-colors disabled:opacity-50",
                          kind === pick.kind
                            ? "border-[#F5C518] bg-[var(--bp-yellow-dim)] text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {pick.label}
                      </button>
                    ))}
                    <EndKindSelect
                      bidId={bidId}
                      value={kind}
                      onChange={next =>
                        onSave(leg.id, {
                          [kindField]: next,
                          [heightField]: null,
                        })
                      }
                      ariaLabel={`Something else at the ${which} of ${leg.label}`}
                      className="h-6 w-28 text-xs"
                    />
                  </div>
                  {kind !== null && kind !== DISTRIBUTION_KIND && !locked && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Height here
                      </span>
                      <HeightFields
                        compact
                        value={own}
                        belowFloor={(effective ?? 0) < 0}
                        ariaPrefix={`Height at the ${which} of ${leg.label}`}
                        onSave={inches =>
                          onSave(leg.id, { [heightField]: inches })
                        }
                        onClear={
                          own !== null
                            ? () => onSave(leg.id, { [heightField]: null })
                            : undefined
                        }
                        clearLabel="Use the type's height"
                        // Empty means the kind's own height IS in effect.
                        unsetLabel={
                          effective === null
                            ? "not set — no drop counted"
                            : `the type's ${formatElevation(effective)}`
                        }
                        setLabel="This end only"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
