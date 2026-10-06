/**
 * DROPS ON A QUANTITY TRACE — proposed, looked at, approved (D21, § 5o).
 *
 * The D19 shape: the app offers a drop at every real leg end, the drawing
 * marks each one, and nothing counts until a person answers. "Approve all"
 * answers the lot; tapping one — here or its marker on the drawing — opens
 * it to change its type or height, or to dismiss it.
 *
 * Every answer is an END KIND written through `takeoffRuns.answerDrops`, so
 * this component keeps no state about proposals at all: what it shows is
 * worked out from the rows every render, by the same function the drawing's
 * markers use (`quantityEndRows`).
 */
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HeightFields } from "@/components/HeightFields";
import { EndKindSelect } from "@/components/takeoff/runEnds";
import {
  describeProposals,
  proposeDrops,
  quantityEndRows,
  type LegEndName,
  type QuantityEndRow,
  type QuantityLeg,
} from "@shared/quantityDrops";
import {
  DISTRIBUTION_KIND,
  endKindLabel,
  formatElevation,
  type HeightRow,
} from "@shared/takeoffHeights";

export type DropAnswer = {
  runId: number;
  end: LegEndName;
  kind: string | null;
  heightInches?: number | null;
};

export type DropSelection = { legId: number; end: LegEndName } | null;

export function QuantityDropsReview({
  bidId,
  legs,
  toKind,
  onToKind,
  types,
  distributionInches,
  selected,
  onSelect,
  onJumpTo,
  onAnswer,
  busy,
}: {
  bidId: number;
  /** Every leg of ONE quantity trace, root first. */
  legs: QuantityLeg[];
  /** The trace toolbar's remembered "To" — what a drop is proposed as. */
  toKind: string | null;
  onToKind: (kind: string | null) => void;
  /** The job's merged heights list. */
  types: readonly HeightRow[];
  /** The job's run height in effect, or null when the gate is shut. */
  distributionInches: number | null;
  selected: DropSelection;
  onSelect: (next: DropSelection) => void;
  onJumpTo: (at: { x: number; y: number }) => void;
  onAnswer: (answers: DropAnswer[]) => void;
  busy: boolean;
}) {
  const heightOf = (kind: string) =>
    types.find(t => t.typeKey === kind)?.heightInches ?? null;
  const proposals = proposeDrops({
    legs,
    kind: toKind,
    distributionInches,
    heightOf,
  });
  const said = describeProposals(proposals);
  const rows = quantityEndRows({
    legs,
    kind: toKind,
    distributionInches,
    heightOf,
  }).filter(row => row.state !== "joined");
  const joined = quantityEndRows({
    legs,
    kind: null,
    distributionInches,
    heightOf,
  }).filter(row => row.state === "joined").length;
  const open = rows.filter(row => row.state === "open").length;
  const legIndex = new Map(legs.map((leg, i) => [leg.id, i + 1]));
  const approvedFeet = round2(
    rows
      .filter(row => row.state === "approved")
      .reduce(
        (sum, row) => sum + (row.vertical?.counted ? row.vertical.feet : 0),
        0
      )
  );
  const approvedCount = rows.filter(row => row.state === "approved").length;
  const proposing = toKind !== null && toKind !== DISTRIBUTION_KIND;

  const where = (row: QuantityEndRow) =>
    legs.length > 1
      ? `Leg ${legIndex.get(row.legId)} ${row.end}`
      : row.end === "start"
        ? "Start"
        : "End";

  return (
    <div className="mt-2 pt-2 border-t border-border/60 space-y-2">
      <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        Drops
      </div>

      {/* What is in the numbers now, before anything is offered. */}
      <p className="text-xs text-muted-foreground">
        {approvedCount === 0
          ? "Flat footage only — no drops are counted on this trace yet."
          : `${approvedCount} drop${approvedCount === 1 ? "" : "s"} counted, ${approvedFeet.toFixed(2)} ft.`}
        {joined > 0 &&
          ` ${joined} leg end${joined === 1 ? " starts" : "s start"} on the trace — no drop there.`}
      </p>

      {open > 0 && (
        <div className="rounded border border-dashed border-[#F5C518]/60 bg-[#F5C518]/5 px-2 py-1.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Drops to</span>
            <EndKindSelect
              bidId={bidId}
              value={toKind}
              onChange={onToKind}
              ariaLabel="What a proposed drop goes to"
              className="h-6 flex-1 text-xs"
            />
          </div>
          <p className="text-xs">
            {proposing
              ? `Proposed: ${said.text}.`
              : `${open} leg end${open === 1 ? "" : "s"} could take a drop — pick what ${open === 1 ? "it goes" : "they go"} to.`}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={!proposing || busy}
              onClick={() =>
                onAnswer(
                  proposals.map(p => ({
                    runId: p.legId,
                    end: p.end,
                    kind: p.kind,
                  }))
                )
              }
            >
              Approve all {open}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={busy}
              onClick={() =>
                onAnswer(
                  rows
                    .filter(row => row.state === "open")
                    .map(row => ({
                      runId: row.legId,
                      end: row.end,
                      kind: DISTRIBUTION_KIND,
                    }))
                )
              }
            >
              No drops
            </Button>
          </div>
        </div>
      )}

      {/* Each end: tap to look at it on the drawing and change it. */}
      <div className="space-y-0.5">
        {rows.map(row => {
          const isOpen =
            selected?.legId === row.legId && selected.end === row.end;
          return (
            <div key={`${row.legId}:${row.end}`}>
              <button
                type="button"
                className={cn(
                  "w-full flex items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left text-xs",
                  isOpen ? "bg-[#F5C518]/10" : "hover:bg-muted/40"
                )}
                onClick={() => {
                  onSelect(isOpen ? null : { legId: row.legId, end: row.end });
                  onJumpTo(row.point);
                }}
              >
                <span className="text-muted-foreground truncate">
                  {where(row)} ·{" "}
                  {row.state === "approved"
                    ? endKindLabel(row.kind, types)
                    : row.state === "dismissed"
                      ? "no drop"
                      : "proposed"}
                </span>
                <span
                  className={cn(
                    "font-mono shrink-0",
                    row.state === "open" && "text-[#F5C518]",
                    row.state === "dismissed" && "text-muted-foreground/60"
                  )}
                >
                  {footage(row)}
                </span>
              </button>
              {isOpen && (
                <DropEditor
                  bidId={bidId}
                  row={row}
                  toKind={proposing ? toKind : null}
                  busy={busy}
                  onAnswer={answer =>
                    onAnswer([{ runId: row.legId, end: row.end, ...answer }])
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One end, opened: its type, its own height, and approve / dismiss / undo. */
function DropEditor({
  bidId,
  row,
  toKind,
  busy,
  onAnswer,
}: {
  bidId: number;
  row: QuantityEndRow;
  toKind: string | null;
  busy: boolean;
  onAnswer: (answer: {
    kind: string | null;
    heightInches?: number | null;
  }) => void;
}) {
  // What a height typed here applies to: the stored kind, else the proposal.
  const kind = row.state === "approved" ? row.kind : toKind;
  /*
    Opened from its MARKER, this sits somewhere down a long panel — and an
    editor that opens off-screen reads as a tap that did nothing. Seen on
    screen 2026-09-26. "nearest" moves nothing when it is already in view.
  */
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <div
      ref={ref}
      className="ml-1 mt-1 mb-1.5 space-y-1.5 border-l border-border/60 pl-2"
    >
      {/*
        A PROPOSED drop shows the kind it is proposed as, and says it is
        proposed. It used to show "Not set" — true of what is stored, and
        contradicting the row above, which names the proposal and prices its
        footage. Nothing is written until Approve, or until a different kind
        is picked here (picking IS approving). A dismissed drop has no kind.
      */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground w-10">To</span>
        <EndKindSelect
          bidId={bidId}
          value={
            row.state === "approved"
              ? row.kind
              : row.state === "open"
                ? toKind
                : null
          }
          // Picking a device here IS approving it; "Not set" takes it back.
          onChange={next => onAnswer({ kind: next })}
          ariaLabel="What this drop goes to"
          className="h-6 flex-1 text-xs"
        />
        {row.state === "open" && toKind !== null && (
          <span className="text-xs text-[#F5C518] shrink-0">proposed</span>
        )}
      </div>
      {kind !== null && row.state !== "dismissed" && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            This one sits at
          </span>
          <HeightFields
            compact
            value={row.heightInches}
            belowFloor={false}
            ariaPrefix="This drop's own height"
            // A height on an OPEN end answers it too, as the kind shown.
            onSave={inches => onAnswer({ kind, heightInches: inches })}
            onClear={
              row.heightInches !== null
                ? () => onAnswer({ kind, heightInches: null })
                : undefined
            }
            clearLabel="Follow the type"
            unsetLabel="the type's height"
            setLabel="Override"
          />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        {row.state === "open" && (
          <>
            <Button
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={toKind === null || busy}
              onClick={() => onAnswer({ kind: toKind })}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={busy}
              onClick={() => onAnswer({ kind: DISTRIBUTION_KIND })}
            >
              No drop here
            </Button>
          </>
        )}
        {row.state !== "open" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            disabled={busy}
            // Back to NULL: proposed again, like any end nobody has answered.
            onClick={() => onAnswer({ kind: null, heightInches: null })}
          >
            Take back
          </Button>
        )}
      </div>
    </div>
  );
}

/** A row's number: counted feet, or why there is none — never a bare zero. */
function footage(row: QuantityEndRow): string {
  if (row.state === "dismissed") return "—";
  const v = row.vertical;
  if (!v) return "pick a type";
  if (v.counted)
    return `${formatElevation(Math.abs(v.distributionInches - v.endInches))} · ${v.feet.toFixed(2)} ft`;
  switch (v.reason) {
    case "no-distribution-height":
      return "no run height";
    case "height-not-set":
      return "no height";
    case "level":
      return "at run height";
    default:
      return "not set";
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
