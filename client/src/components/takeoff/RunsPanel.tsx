/**
 * RunsPanel — what has been traced, and what it comes to.
 *
 * Fills the pane phase 2a reserved. Conduit and wire are shown as SEPARATE
 * lines on every run, never summed together, because they are separate
 * purchases and the whole point of this phase is that they do not get
 * conflated: one pipe, however many circuits go down it, and a full length of
 * wire for every conductor of every circuit.
 *
 * Circuit rows follow CLAUDE.md § Editing fields via InlineNumberField —
 * conductor counts are exactly the sort of number someone types down a column.
 */
import { markAppearance, markPath } from "@shared/takeoffMarks";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Check,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CableIcon, ConduitIcon } from "@/components/takeoff/runIcons";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InlineNumberField } from "@/components/InlineNumberField";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { runAppearance } from "@shared/takeoffMarks";
import type { RunQuantities } from "@shared/takeoffQuantities";

export type PanelRun = {
  id: number;
  name: string;
  /** What it IS — type and ends as one sentence. See runDisplayName. */
  displayName?: string;
  /** What it IS, alone. The top line of the row. */
  typeName?: string;
  /**
   * What it is MADE OF — `3/4" EMT · 3 x #12 THHN`. Null when the type names
   * no materials, which is a real state and says so in its own words.
   */
  spec?: string | null;
  /** Where it GOES, or null if both ends are not answered. The second line. */
  endsName?: string | null;
  /** Which kind of run — what its colour groups on. Null before types. */
  runTypeId: number | null;
  pathType: "conduit" | "cable";
  status: "draft" | "committed";
  isSuggestion: boolean;
  circuits: {
    id: number;
    name: string;
    /** INSULATED conductors. The ground is its own number since 0063. */
    conductorCount: number;
    /**
     * Grounds, RAW: null means nobody has said, and the row shows that rather
     * than a zero. 0063 left none of these null, but a circuit added before
     * the panel learned to ask still can be — and "no ground" is a decision
     * while "not said" is not.
     */
    groundCount: number | null;
  }[];
  quantities: RunQuantities | null;
  /** What is at each end. Undefined only for a suggestion the AI proposed. */
  ends?: {
    startKind: string | null;
    endKind: string | null;
    startHeightInches: number | null;
    endHeightInches: number | null;
    distributionHeightInches: number | null;
    startStampId: number | null;
    endStampId: number | null;
  };
  scaleChangedSinceTraced: boolean;
  /** Where the run starts, so a click can jump the viewer to it. */
  firstPoint: { x: number; y: number } | null;
};

const feet = (value: number) =>
  `${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ft`;

/**
 * What a new circuit starts as: two conductors and a ground.
 *
 * ── It used to be a bare 3, and that stopped being right ───────────────────
 * Three was "2 and a ground" while one column counted both. After 0063 split
 * them, a bare 3 means THREE UNGROUNDED CONDUCTORS — the same wire footage, and
 * a description of something nobody wires. Typing a lighting circuit would have
 * produced a row reading "3 cond. 0 gnd.".
 *
 * So the default moved rather than the number: the footage is unchanged at
 * three wires, and what the row SAYS is now what an electrician would say.
 * Named here rather than written twice, because the Enter key and the Add
 * button are two call sites and a default that disagrees with itself is worse
 * than either value.
 */
const NEW_CIRCUIT = { conductors: 2, grounds: 1 } as const;

/** Guards the subtraction below from floating-point dust like 1239.9999998. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Two decimals, always, so a column of sums lines up while being added. */
const exact = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * A footage that SHOWS ITS ARITHMETIC: `87.40 + 8.50 = 95.90 ft`.
 *
 * The whole point of this phase is that vertical footage stops being
 * invisible, and `95.90 ft` with the drop folded in is exactly as invisible
 * as not counting it. "incl. 8.50 vertical" was the alternative and was
 * rejected: it still makes the reader do the subtraction to check it.
 *
 * When there is no vertical the sum is not shown, because `87.40 + 0.00 =
 * 87.40` is noise standing where a number goes. A run counting nothing
 * vertical says so in its own line instead — see the row below.
 */
function Footage({
  label,
  flat,
  vertical,
  total,
}: {
  label: React.ReactNode;
  flat: number;
  vertical: number;
  total: number;
}) {
  return (
    <div className="flex items-baseline justify-between text-xs gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-right">
        {vertical > 0 ? (
          <>
            <span className="text-muted-foreground/70">
              {exact(flat)} + {exact(vertical)} ={" "}
            </span>
            {exact(total)} ft
          </>
        ) : (
          feet(total)
        )}
      </span>
    </div>
  );
}

/** The traced share of a run's wire: every circuit's flat feet. */
function wireFlat(run: PanelRun): number {
  const total = (run.quantities?.wireByCircuit ?? []).reduce(
    (sum, circuit) => sum + circuit.flatFeet,
    0
  );
  return Math.round(total * 100) / 100;
}

/** The vertical share: the run's drops, once per conductor of every circuit. */
function wireVertical(run: PanelRun): number {
  const total = (run.quantities?.wireByCircuit ?? []).reduce(
    (sum, circuit) => sum + circuit.verticalFeet,
    0
  );
  return Math.round(total * 100) / 100;
}

/**
 * The bare copper, across every circuit on this run.
 *
 * ── Why the split shows HERE and not on each circuit row ───────────────────
 * A circuit row is already a name, two counts and a footage in 384 pixels, and
 * the question "how much of WHICH wire" is a purchasing question — it is asked
 * when ordering, against the run, not while typing conductor counts.
 *
 * Shown only when there IS bare copper: `200.00 + 0.00 = 200.00` is noise
 * standing where a number goes, the same reasoning the vertical line follows.
 */
function wireGround(run: PanelRun): number {
  const total = (run.quantities?.wireByCircuit ?? []).reduce(
    (sum, circuit) => sum + circuit.groundFeet,
    0
  );
  return Math.round(total * 100) / 100;
}

/**
 * Why this run counts no vertical footage, in the estimator's words.
 *
 * Four different situations with four different fixes, and a blank would
 * make them one. "Nothing to add" and "nobody said" are not the same state,
 * and only one of them is finished.
 */
function verticalsMissingReason(run: PanelRun): string {
  const verticals = run.quantities?.verticals;
  if (!verticals) return "not set";
  const reasons = [verticals.start, verticals.end]
    .filter(end => !end.counted)
    .map(end => (end.counted ? null : end.reason));
  if (reasons.includes("no-distribution-height"))
    return "no run height set for this job";
  if (reasons.includes("height-not-set"))
    return "no height set for one of these types";
  if (reasons.includes("no-kind")) return "not set — say what is at each end";
  return "none — this run stays at run height";
}

/** Stamped assemblies, grouped, as the list shows them. */
/**
 * What a count's relationship to the bid is — the bridge, as this panel needs
 * it.
 *
 * ── Why the count here is the BID's and not the panel's ─────────────────────
 * This panel shows one SHEET. A count can be marked across five of them, and
 * the bid line takes all of them. So the send control has to say the whole
 * number — "Send 14 to bid" while the sheet in front of you shows 5 — or the
 * estimator reasonably believes they are sending what they can see.
 */
export type GroupBridgeState = {
  /** Every mark on the BID, across every sheet. Not this sheet's tally. */
  bidCount: number;
  /** Already a line. The quantity follows the marks from here on. */
  onBid: boolean;
  /** Can go over now. False covers "no price" and "not built yet" alike. */
  sendable: boolean;
};

export type PanelStampGroup = {
  /** Which count this is. Decides the swatch, and the key. */
  groupId: number | null;
  assemblyId: number | null;
  name: string;
  count: number;
  stamps: {
    id: number;
    x: number;
    y: number;
    /** Keeps an assembly-backed swatch on its category shape. */
    assemblyCategory?: string | null;
  }[];
};

export function RunsPanel({
  runs,
  totals,
  selectedRunId,
  onSelectRun,
  onRemoveRun,
  onCommitRun,
  onAcceptSuggestion,
  onAddCircuit,
  onUpdateCircuit,
  onRemoveCircuit,
  stampGroups,
  bridge,
  waitingToSend,
  countedWithNoPrice,
  onSendToBid,
  sendingGroupId,
  onJumpTo,
  onRemoveStamp,
  legend,
  renderRunEnds,
  renderRunType,
}: {
  runs: PanelRun[];
  /** Counted stamps, grouped by assembly. Quantities are derived, not typed. */
  stampGroups: PanelStampGroup[];
  /** Each count's relationship to the bid, by group id. */
  bridge?: ReadonlyMap<number, GroupBridgeState>;
  /**
   * How many counts are priced, marked, and not yet on the bid.
   *
   * Undefined while the bid's counts are still loading, which is different
   * from 0 and reads differently — see the footer.
   */
  /** Counts that are marked but unpriced, so they can never cross. */
  countedWithNoPrice?: number;
  waitingToSend?: number;
  onSendToBid?: (groupId: number) => void;
  /** The count currently crossing, so its own control can say so. */
  sendingGroupId?: number | null;
  /** Move the viewer to a mark on the drawing and highlight it. */
  onJumpTo: (at: { x: number; y: number }) => void;
  onRemoveStamp: (id: number) => void;
  /** The legend panel, rendered beneath the list. */
  legend?: React.ReactNode;
  /**
   * The ends editor for the open run. A render prop for the same reason
   * `legend` is one: this panel takes data and gives back clicks, and the
   * ends editor needs queries and mutations of its own.
   */
  renderRunEnds?: (run: PanelRun) => React.ReactNode;
  /**
   * The control that says what this run IS — D3(b), changing it after tracing.
   *
   * A render prop for the same reason `renderRunEnds` is one: the picker it
   * opens belongs to the takeoff screen, and this panel stays a panel that
   * shows runs rather than one that knows about palettes.
   */
  renderRunType?: (run: PanelRun) => React.ReactNode;
  totals:
    | {
        conduitFeet: number;
        cableFeet: number;
        wireFeet: number;
        conduitVerticalFeet: number;
        cableVerticalFeet: number;
        wireVerticalFeet: number;
        unmeasurableCount: number;
        flatOnlyCount: number;
      }
    | undefined;
  selectedRunId: number | null;
  onSelectRun: (id: number | null) => void;
  onRemoveRun: (id: number) => void;
  onCommitRun: (id: number) => void;
  onAcceptSuggestion: (id: number) => void;
  onAddCircuit: (
    runId: number,
    name: string,
    conductorCount: number,
    groundCount: number
  ) => void;
  onUpdateCircuit: (
    id: number,
    patch: { conductorCount?: number; groundCount?: number }
  ) => void;
  onRemoveCircuit: (id: number) => void;
}) {
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [circuitName, setCircuitName] = useState("");

  return (
    <div className="h-full flex flex-col bg-card border-l border-border min-h-0">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          <Zap className="w-3 h-3" /> Counted items
          <span className="ml-auto normal-case tracking-normal">
            {stampGroups.reduce((n, g) => n + g.count, 0) + runs.length}
          </span>
        </div>
      </div>

      {/*
        ONE scroll region, holding the list AND the legend beneath it.

        The legend used to sit outside this, as a plain flex child between the
        scrolling list and the pinned totals — no shrink-0, no scroller, and
        therefore no way to be shorter than its own contents. With the reader
        panel, the layer checklist and a legend of captured symbols stacked
        inside it, that is easily taller than the pane, and everything after
        it gets pushed out of the bottom of the window: the bid totals cut in
        half, the footage numbers gone entirely, and nothing on screen saying
        there was more.

        Putting it INSIDE the scroller rather than giving it a second one of
        its own is deliberate. Two stacked scroll areas in a 400px column means
        a wheel that does different things two inches apart, and a legend you
        can only reach by first scrolling something else to the bottom.
      */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Stamped assemblies first: an estimator drops dozens per sheet and
            traces a handful of runs, so the thing they are actively adding to
            stays where they can watch it climb. */}
        {stampGroups.map(group => (
          <div
            key={group.groupId ?? group.assemblyId ?? group.name}
            className="border-b border-border px-3 py-2 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              {/*
                The swatch IS the legend. It draws the same shape in the same
                colour as the marks on the drawing, from the same function —
                a panel that showed a yellow circle for every count would be
                worse than no swatch at all, because it would assert a sameness
                that the drawing contradicts.

                Fixed at 20px here rather than clamped: this one is on the
                screen, not on the paper, so it has no zoom to fight.
              */}
              {(() => {
                const { shape, color } = markAppearance({
                  groupId: group.groupId,
                  assemblyId: group.assemblyId,
                  assemblyCategory: group.stamps[0]?.assemblyCategory ?? null,
                });
                return (
                  <svg
                    width={20}
                    height={20}
                    viewBox="0 0 20 20"
                    className="shrink-0"
                    aria-hidden="true"
                  >
                    <path
                      d={markPath(shape, 10, 10, 8)}
                      fill={color}
                      fillOpacity={0.22}
                      stroke={color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  </svg>
                );
              })()}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{group.name}</p>
                <p className="text-[0.7rem] text-muted-foreground">
                  {group.count} placed
                </p>
              </div>
              <span className="font-mono text-sm tabular-nums">
                {group.count}
              </span>
            </div>
            {/*
              Where this count stands with the bid.

              Three states and three different things worth saying, all of them
              words rather than colour: it is over, it can go over, or there is
              nothing to say here and the row stays quiet. A level 1 count falls
              in the third — its whole promise is a quiet count, and a nudge
              toward the bid on the drawing screen breaks that promise on the
              screen where it was made. The footer and the bid's own strip
              carry the summary instead.
            */}
            {(() => {
              const state =
                group.groupId === null ? undefined : bridge?.get(group.groupId);
              if (!state) return null;
              if (state.onBid) {
                return (
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">
                    On the bid — the line follows these marks
                  </p>
                );
              }
              if (!state.sendable || !onSendToBid) return null;
              const busy = sendingGroupId === group.groupId;
              return (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSendToBid(group.groupId as number)}
                  className="mt-1 text-[0.7rem] underline underline-offset-2 text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  {/*
                    The BID's count, not this sheet's. A count marked across
                    five sheets sends all of them, and a control reading "Send 5
                    to bid" beside a panel showing five of fourteen would be
                    telling the truth about the wrong number.
                  */}
                  {busy ? "Sending…" : `Send ${state.bidCount} to bid`}
                </button>
              );
            })()}
            {/* Walk the instances: each chip jumps the viewer to that mark. */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {group.stamps.map((placed, index) => (
                <button
                  key={placed.id}
                  onClick={() => onJumpTo({ x: placed.x, y: placed.y })}
                  className="px-1.5 py-0.5 rounded text-[0.65rem] font-mono bg-muted hover:bg-[#F5C518]/20 hover:text-[#F5C518] transition-colors"
                  title="Show this one on the drawing"
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/*
          Where the takeoff stands with the bid — one line, in one place.

          ── Why it is here and not a badge on the drawing ──────────────────
          Level 1's promise is a quiet count. A marker nagging toward the bid on
          the sheet itself would break that promise on the screen where it was
          made, so the summary lives in a list somebody reads rather than on the
          work they are doing.

          ── Why it says something at zero instead of disappearing ──────────
          A line that appears and vanishes as counts cross is movement in the
          corner of the eye during the most repetitive action on the screen.
          Same position, same weight, same colour, different words — so it can
          be read when wanted and ignored when not. It is drawn whenever there
          is any count at all, because before that there is genuinely nothing to
          report.

          ── Why there are THREE states and not two ─────────────────────────
          Found by looking at a real bid, after the tests passed. With only
          "waiting" and "all sent", a job whose only count is unpriced read as
          **"Every priced count is on the bid."** — vacuously true, because
          there were no priced counts, and it sounds exactly like a finished
          takeoff while money is missing from the bid entirely. That is the
          reading § 5f calls the worse of the two failures, produced by copy
          that was literally correct.

          So an unpriced count gets said out loud here. It is a line in a list
          somebody opens, which is what § 5f permits; what stays forbidden is a
          badge on the drawing, where level 1's promise of a quiet count was
          made.
        */}
        {stampGroups.length > 0 && waitingToSend !== undefined ? (
          <p className="px-3 py-2 text-[0.7rem] text-muted-foreground border-b border-border">
            {waitingToSend > 0
              ? `${waitingToSend} count${waitingToSend === 1 ? " is" : "s are"} not on the bid yet.`
              : countedWithNoPrice
                ? `${countedWithNoPrice} count${countedWithNoPrice === 1 ? " has" : "s have"} no price, so ${countedWithNoPrice === 1 ? "it cannot" : "they cannot"} go on the bid.`
                : "Every priced count is on the bid."}
          </p>
        ) : null}

        {runs.length === 0 && stampGroups.length === 0 ? (
          <div className="p-6 text-center">
            <Zap className="w-7 h-7 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">
              Nothing counted yet
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1.5">
              Mark an assembly onto the plan, or trace a conduit or cable run.
              Everything you place appears here as you go.
            </p>
          </div>
        ) : (
          runs.map(run => {
            const isSelected = run.id === selectedRunId;
            return (
              <div
                key={run.id}
                className={cn(
                  "border-b border-border px-3 py-2.5 cursor-pointer transition-colors",
                  isSelected ? "bg-[#F5C518]/5" : "hover:bg-muted/40"
                )}
                onClick={() => {
                  onSelectRun(isSelected ? null : run.id);
                  const first = run.firstPoint;
                  if (first) onJumpTo(first);
                }}
              >
                <div className="flex items-start gap-2">
                  {/*
                    The same two icons the tool buttons use — imported from
                    runIcons so they cannot drift apart again. This row used a
                    lightning bolt for conduit, which says "electrical": not
                    information inside an electrical estimating app, and not
                    what the button that produced the row looked like.
                  */}
                  {/*
                    In the run's OWN colour, which is the row's answer to "which
                    of these lines is this?". The icon used to be conduit yellow
                    or cable emerald, matching how the lines were drawn then;
                    now colour means which TYPE, so the row reads its colour
                    from the same function the line does. See runIcons.
                  */}
                  {run.pathType === "conduit" ? (
                    <ConduitIcon
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: runAppearance(run).color }}
                    />
                  ) : (
                    <CableIcon
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: runAppearance(run).color }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    {/*
                      Two lines, and which fact goes on top is the decision.

                      What it IS, not what the app called it when it was drawn:
                      three rows reading "Run on Sheet 3" was the complaint, and
                      the type and the two ends answer it without anybody typing
                      a name. But as ONE line the sentence overran this column
                      and dropped the type off the end — so a 12-2 and a 12-3
                      cable read the same, which is a different wire and a
                      different number. The type is what prices the run, so it
                      goes on top and truncates last. See runNameParts.
                    */}
                    <p className="text-sm truncate">
                      {run.typeName ?? run.displayName ?? run.name}
                    </p>
                    {run.endsName && (
                      <p className="text-xs text-muted-foreground truncate">
                        {run.endsName}
                      </p>
                    )}
                    {/*
                      What it is made of, under what it is called.

                      The row said what a run was NAMED and never what it was,
                      so "1/2in EMT" and a type somebody typed in a hurry read
                      identically — and the one that cannot price anything is
                      the one worth spotting. A type with no materials says so
                      here rather than leaving the line blank, because blank
                      reads as "nothing to say" and this is the opposite.

                      ── Unless it would just repeat the line above ───────────
                      A CABLE's specification is the cable itself, and its type
                      is usually named after it — so the row rendered
                      "12-2 MC cable" and then "12-2 MC cable" again, which is
                      not information, it is furniture. Seen on screen, not in
                      the diff.

                      Suppressed as a REPEAT rather than by path type: a conduit
                      type named exactly after its pipe would read the same way,
                      and the test is what the two lines SAY rather than what
                      kind of run they belong to.
                    */}
                    {(() => {
                      const named = run.typeName ?? run.displayName ?? run.name;
                      if (run.spec === named) return null;
                      return (
                        <p
                          className={cn(
                            "text-[0.7rem] truncate",
                            run.spec
                              ? "text-muted-foreground"
                              : "text-[#F5C518]/80"
                          )}
                        >
                          {run.spec ??
                            "No materials on this type — cannot be priced"}
                        </p>
                      );
                    })()}
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      {run.isSuggestion && (
                        <Badge
                          variant="outline"
                          className="text-[0.65rem] px-1.5 py-0 border-[#F5C518]/40 text-[#F5C518]"
                        >
                          <Sparkles className="w-2.5 h-2.5 mr-1" /> Suggested
                        </Badge>
                      )}
                      {run.status === "draft" && !run.isSuggestion && (
                        <Badge
                          variant="outline"
                          className="text-[0.65rem] px-1.5 py-0 text-muted-foreground"
                        >
                          Draft
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={e => {
                      e.stopPropagation();
                      onRemoveRun(run.id);
                    }}
                    aria-label={`Delete ${run.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                {/* A run that cannot be measured says so instead of showing 0 */}
                {run.quantities === null ? (
                  <p className="text-xs text-[#F5C518] mt-1.5 flex items-start gap-1.5">
                    <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                    Flat length not measurable — no scale on this sheet, so this
                    run is not in the totals.
                  </p>
                ) : (
                  <div className="mt-1.5 space-y-0.5">
                    {/* Conduit and wire kept visually separate: they are two
                      different purchases measured along one line. */}
                    {run.quantities.conduitFeet !== null && (
                      <Footage
                        label="Conduit"
                        flat={run.quantities.runFeet}
                        vertical={run.quantities.verticalFeet}
                        total={run.quantities.conduitFeet}
                      />
                    )}
                    {run.quantities.cableFeet !== null && (
                      <Footage
                        label="Cable"
                        flat={run.quantities.runFeet}
                        vertical={run.quantities.verticalFeet}
                        total={run.quantities.cableFeet}
                      />
                    )}
                    {run.pathType === "conduit" && (
                      <Footage
                        label={
                          <>
                            Wire
                            <span className="text-muted-foreground/60">
                              {" "}
                              ({run.circuits.length}{" "}
                              {run.circuits.length === 1
                                ? "circuit"
                                : "circuits"}
                              )
                            </span>
                          </>
                        }
                        flat={wireFlat(run)}
                        vertical={wireVertical(run)}
                        total={run.quantities.totalWireFeet}
                      />
                    )}
                    {/*
                      The bare copper, on its own line, and only when there is
                      some.

                      Wire and ground are SEPARATE PURCHASES — bare copper
                      cannot be ordered as THHN — which is the entire reason the
                      ground got its own column. A single wire figure answers
                      "how much" and cannot answer "how much of which", and the
                      supplier list is about to ask exactly that.

                      Shown only when it is non-zero, like the vertical line
                      above: a bare figure of 0.00 ft is noise standing where a
                      number goes.
                    */}
                    {run.pathType === "conduit" && wireGround(run) > 0 && (
                      <div className="flex items-baseline justify-between text-xs gap-2 pl-3">
                        <span className="text-muted-foreground/70 shrink-0">
                          of which bare ground
                        </span>
                        <span className="font-mono text-right text-muted-foreground/70">
                          {feet(wireGround(run))}
                        </span>
                      </div>
                    )}

                    {/*
                      The zero has to shout. An unset height makes a total
                      quietly low and nothing on screen says so — the same
                      argument § 2.3 makes about an unset allowance. A blank
                      where a drop belongs is indistinguishable from a run
                      that genuinely has none.
                    */}
                    {run.quantities.verticalFeet === 0 && (
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-muted-foreground">Verticals</span>
                        <span className="text-[0.7rem] text-[#F5C518]">
                          {verticalsMissingReason(run)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {run.scaleChangedSinceTraced && (
                  <p className="text-[0.7rem] text-[#F5C518] mt-1">
                    The sheet's scale changed since this was traced — check the
                    length.
                  </p>
                )}

                {/*
                  What is at each end, and the verticals they produce. Shown
                  only on the open run: nine controls on every row is a panel
                  people stop reading.
                */}
                {isSelected && renderRunType && !run.isSuggestion && (
                  <div
                    className="mt-2 pt-2 border-t border-border/60"
                    onClick={e => e.stopPropagation()}
                  >
                    {renderRunType(run)}
                  </div>
                )}

                {isSelected && renderRunEnds && !run.isSuggestion && (
                  <div onClick={e => e.stopPropagation()}>
                    {renderRunEnds(run)}
                  </div>
                )}

                {/* Circuits, only for conduit and only when this run is open */}
                {isSelected && run.pathType === "conduit" && (
                  <div
                    className="mt-2 pt-2 border-t border-border/60 space-y-1.5"
                    onClick={e => e.stopPropagation()}
                  >
                    {run.circuits.map(circuit => (
                      <div
                        key={circuit.id}
                        className="flex items-center gap-1.5"
                      >
                        <span className="text-xs flex-1 min-w-0 truncate">
                          {circuit.name}
                        </span>
                        <InlineNumberField
                          value={circuit.conductorCount}
                          onSave={next =>
                            onUpdateCircuit(circuit.id, {
                              conductorCount: next,
                            })
                          }
                          rules={{ min: 1, max: 60 }}
                          className="h-6 w-12 text-xs"
                          ariaLabel={`Conductors for ${circuit.name}`}
                        />
                        <span className="text-[0.7rem] text-muted-foreground">
                          cond.
                        </span>
                        {/*
                          The ground, and the reason it is nullable here.

                          This is the first place a person types a ground on a
                          REAL run rather than on a type, and "no ground on this
                          circuit" is a decision while "nobody has said" is not.
                          0063 left none of these null, but a circuit written
                          before the panel could ask still can be — and a zero
                          standing in for silence is the failure rule 6 exists
                          for, in the field that decides how much bare copper
                          gets bought.
                        */}
                        <InlineNumberField
                          value={circuit.groundCount}
                          whenUnset={{ placeholder: "?" }}
                          onSave={next =>
                            onUpdateCircuit(circuit.id, { groundCount: next })
                          }
                          rules={{ min: 0, max: 10 }}
                          className="h-6 w-10 text-xs"
                          ariaLabel={`Grounds for ${circuit.name}`}
                        />
                        <span className="text-[0.7rem] text-muted-foreground">
                          gnd.
                        </span>
                        <span className="text-[0.7rem] font-mono text-muted-foreground w-16 text-right">
                          {run.quantities
                            ? feet(
                                run.quantities.wireByCircuit.find(
                                  w => w.name === circuit.name
                                )?.feet ?? 0
                              )
                            : "—"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveCircuit(circuit.id)}
                          aria-label={`Remove ${circuit.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}

                    {addingTo === run.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={circuitName}
                          onChange={e => setCircuitName(e.target.value)}
                          onFocus={selectOnFocus}
                          onKeyDown={e => {
                            if (e.key === "Enter" && circuitName.trim()) {
                              onAddCircuit(
                                run.id,
                                circuitName.trim(),
                                NEW_CIRCUIT.conductors,
                                NEW_CIRCUIT.grounds
                              );
                              setCircuitName("");
                            }
                            if (e.key === "Escape") {
                              setAddingTo(null);
                              setCircuitName("");
                            }
                          }}
                          placeholder="Ckt 12"
                          className="h-6 text-xs flex-1"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            if (!circuitName.trim()) return;
                            onAddCircuit(
                              run.id,
                              circuitName.trim(),
                              NEW_CIRCUIT.conductors,
                              NEW_CIRCUIT.grounds
                            );
                            setCircuitName("");
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 text-xs text-muted-foreground"
                        onClick={() => setAddingTo(run.id)}
                      >
                        <Plus className="w-3 h-3" /> Add a circuit to this run
                      </Button>
                    )}

                    <p className="text-[0.7rem] text-muted-foreground/70">
                      Each circuit pulls its own full length of wire down this
                      one conduit.
                    </p>
                  </div>
                )}

                {isSelected && (run.status === "draft" || run.isSuggestion) && (
                  <div
                    className="mt-2 flex items-center gap-1.5"
                    onClick={e => e.stopPropagation()}
                  >
                    {run.isSuggestion ? (
                      <Button
                        size="sm"
                        className="h-6 gap-1 text-xs"
                        onClick={() => onAcceptSuggestion(run.id)}
                      >
                        <Check className="w-3 h-3" /> Accept this route
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-6 gap-1 text-xs"
                        onClick={() => onCommitRun(run.id)}
                      >
                        <Check className="w-3 h-3" /> Finish run
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {legend}
      </div>

      {/*
        Bid totals. Conduit, cable and wire never merge into one number.

        Pinned below the scroller and NEVER inside it: this is the number the
        panel exists to show, and a total you have to go looking for is a total
        that gets read off stale. shrink-0 is what keeps its last row whole.
      */}
      {totals && (
        <div className="border-t border-border px-3 py-2.5 shrink-0 space-y-1">
          <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-1">
            This bid, all sheets
          </div>
          <Footage
            label="Conduit"
            flat={round2(totals.conduitFeet - totals.conduitVerticalFeet)}
            vertical={totals.conduitVerticalFeet}
            total={totals.conduitFeet}
          />
          <Footage
            label="Cable"
            flat={round2(totals.cableFeet - totals.cableVerticalFeet)}
            vertical={totals.cableVerticalFeet}
            total={totals.cableFeet}
          />
          <Footage
            label="Wire"
            flat={round2(totals.wireFeet - totals.wireVerticalFeet)}
            vertical={totals.wireVerticalFeet}
            total={totals.wireFeet}
          />

          {/*
            THE ZERO HAS TO SHOUT.

            § 2.3 makes the argument about an unset allowance and it applies
            here unchanged: an unpriced material shouts, because it renders as
            $0 and a screen filters to it. An unset HEIGHT whispers — it makes
            a total quietly a little low and nothing says so. On a commercial
            job the missing footage is a large share of the total, and a bid
            that is under is the mistake that gets won.
          */}
          {totals.flatOnlyCount > 0 && (
            <p className="text-[0.7rem] text-[#F5C518] pt-1 flex items-start gap-1.5">
              <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
              {totals.conduitVerticalFeet === 0 &&
              totals.cableVerticalFeet === 0 &&
              totals.wireVerticalFeet === 0
                ? `No vertical footage is in these numbers. ${totals.flatOnlyCount} run${totals.flatOnlyCount === 1 ? " is" : "s are"} counted flat only.`
                : `${totals.flatOnlyCount} run${totals.flatOnlyCount === 1 ? " is" : "s are"} counted flat only — no drop or rise on ${totals.flatOnlyCount === 1 ? "it" : "them"}.`}
            </p>
          )}
          {totals.unmeasurableCount > 0 && (
            <p className="text-[0.7rem] text-[#F5C518] pt-1 flex items-start gap-1.5">
              <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
              {totals.unmeasurableCount} run
              {totals.unmeasurableCount === 1 ? " is" : "s are"} not in these
              totals — their sheets have no usable scale.
            </p>
          )}
          <p className="text-[0.7rem] text-muted-foreground/70 pt-1">
            Finished runs only. Drafts and suggestions are not counted.
          </p>
        </div>
      )}
    </div>
  );
}
