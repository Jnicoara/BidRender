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
import {
  NEW_FILL_OPACITY,
  letterFit,
  markAppearance,
  markPath,
} from "@shared/takeoffMarks";
import type { PinStyle } from "@shared/pinLetters";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  AssemblySearchList,
  type SearchableAssembly,
} from "./AssemblySearchList";
import { layoutLegs } from "@/lib/runLegs";
import { PANEL_TAB_LABELS, sheetLine, type PanelTab } from "@/lib/panelTabs";
import { cn } from "@/lib/utils";
import { money } from "@/lib/money";
import {
  Check,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UndoSubject } from "@/lib/undoStack";
import {
  emptiedCardIndex,
  type EmptiedCountCard,
} from "@/lib/emptiedCountCard";

/**
 * A card's undo arrow. Always drawn, so the card does not change shape as the
 * stack moves; enabled only when the newest step on the bid is about this
 * card, and its tooltip names that step.
 */
function CardUndo({
  subject,
  cardUndo,
  onCardUndo,
}: {
  subject: UndoSubject;
  cardUndo?: (subject: UndoSubject) => { label: string } | null;
  onCardUndo?: () => void;
}) {
  if (!cardUndo || !onCardUndo) return null;
  const step = cardUndo(subject);
  const title = step
    ? `Undo: ${step.label}`
    : "Nothing to undo here — the last change was somewhere else";
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 w-6 p-0 shrink-0 text-muted-foreground"
      disabled={!step}
      onClick={e => {
        e.stopPropagation();
        onCardUndo();
      }}
      title={title}
      aria-label={title}
    >
      <Undo2 className="w-3 h-3" />
    </Button>
  );
}
/**
 * The swatch IS the legend. It draws the same shape, colour and letter as the
 * marks on the drawing, from the same function and the same per-bid map — a
 * panel that showed a yellow circle for every count would be worse than no
 * swatch at all, because it would assert a sameness the drawing contradicts.
 * One component for the live card and the emptied one, so they cannot drift.
 *
 * Fixed at 20px rather than clamped: this one is on the screen, not on the
 * paper, so it has no zoom to fight.
 */
function CountSwatch({
  groupId,
  assemblyId,
  assemblyCategory,
  pins,
  className,
}: {
  groupId: number | null;
  assemblyId: number | null;
  assemblyCategory: string | null;
  pins?: ReadonlyMap<number, PinStyle>;
  className?: string;
}) {
  const { shape, color, letter } = markAppearance(
    { groupId, assemblyId, assemblyCategory },
    pins
  );
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <path
        d={markPath(shape, 10, 10, 8)}
        fill={color}
        fillOpacity={NEW_FILL_OPACITY}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {letter && (
        <text
          x={10}
          y={10 + letterFit(shape, 8, letter).dy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={letterFit(shape, 8, letter).size}
          fontWeight={700}
          className="fill-foreground"
        >
          {letter}
        </text>
      )}
    </svg>
  );
}

/**
 * A count card whose last mark on this sheet was just deleted. Same swatch,
 * same name and same undo arrow as the live card, in the same place, so the
 * way back is where the delete was (@/lib/emptiedCountCard). It goes as soon
 * as anything newer happens.
 */
function EmptiedCountRow({
  card,
  pins,
  cardUndo,
  onCardUndo,
}: {
  card: EmptiedCountCard;
  pins?: ReadonlyMap<number, PinStyle>;
  cardUndo?: (subject: UndoSubject) => { label: string } | null;
  onCardUndo?: () => void;
}) {
  return (
    <div className="border-b border-border px-3 py-2 bg-muted/30">
      <div className="flex items-center gap-2">
        <CountSwatch
          groupId={card.groupId}
          assemblyId={card.assemblyId}
          assemblyCategory={card.assemblyCategory}
          pins={pins}
          className="opacity-50"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate text-muted-foreground">{card.label}</p>
          <p className="text-xs text-muted-foreground">
            None left on this sheet — undo puts them back
          </p>
        </div>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          0
        </span>
        <CardUndo
          subject={{ kind: "count", id: card.groupId }}
          cardUndo={cardUndo}
          onCardUndo={onCardUndo}
        />
      </div>
    </div>
  );
}
import {
  CableIcon,
  ConduitIcon,
  RunTypeSwatch,
} from "@/components/takeoff/runIcons";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InlineNumberField } from "@/components/InlineNumberField";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  groundSentence,
  newCircuitFor,
  nextCircuitName,
  typeCarriesWire,
  suggestAfter,
} from "@/lib/runCircuits";
import { runAppearance, type RunTypeColors } from "@shared/takeoffMarks";
import {
  carriesNoExtra,
  type RunQuantities,
  type totalQuantities,
} from "@shared/takeoffQuantities";
import type { ResolvedExtra } from "@shared/runExtras";
import {
  GroupDrop,
  type GroupDropInfo,
  type GroupDropPatch,
} from "@/components/takeoff/GroupDrop";

/** A run's own extra and makeup, as the panel sends it. Omitted = unchanged. */
export type RunExtrasPatch = {
  conduitExtraPct?: number | null;
  wireExtraPct?: number | null;
  makeupDeviceInches?: number | null;
  makeupPanelInches?: number | null;
  makeupByKindInches?: Record<string, number> | null;
};
import { verticalsNotice } from "@shared/takeoffHeights";
import { unmatchedKindWords, type FittingKind } from "@shared/runFittings";
import { fittingRowSpeaks } from "@shared/runFittingMaterials";
import type { TraceMode } from "@shared/traceMode";
import type { RunTotalsLeftOut } from "@shared/runOnBid";
import {
  statusSplitText,
  unpricedStatusNote,
  type StatusSplit,
} from "@shared/markStatus";

/**
 * One run's bends and pull points, as the server works them out
 * (`server/runBendDetail.ts`). Proposals are never stored; `answer` is the
 * person's decision where one was made.
 */
export type RunBendsView = {
  limit: number;
  summary: string | null;
  overLimit: string[];
  proposals: {
    place: "corner" | "end-drop";
    x: number;
    y: number;
    degrees: number;
    suggestedKind: "lb" | "pullBox";
    answer: {
      id: number;
      status: "accepted" | "dismissed";
      kind: "lb" | "pullBox";
    } | null;
  }[];
  accepted: {
    place: "corner" | "end-drop";
    x: number;
    y: number;
    answerId: number;
    kind: "lb" | "pullBox";
  }[];
};

/** What answering a pull point sends. The spot is the proposal's own. */
export type PullPointAnswerInput = {
  runId: number;
  place: "corner" | "end-drop";
  x: number;
  y: number;
  kind: "lb" | "pullBox";
  status: "accepted" | "dismissed";
};

/**
 * The open run's bends: what the drawing adds up to, and each pull point to
 * accept, switch, dismiss or take back.
 *
 * NOTHING here adds a part on its own. A proposal is a question with its
 * reason beside it — "450° since the last pull point" — and only a button a
 * person presses stores an answer (owner, 2026-09-26: never add one silently).
 */
function RunPullPoints({
  run,
  bends,
  onAnswer,
  onUndo,
  busy,
}: {
  run: { id: number };
  bends: RunBendsView;
  onAnswer: (answer: PullPointAnswerInput) => void;
  onUndo: (answerId: number) => void;
  busy: boolean;
}) {
  const where = (place: "corner" | "end-drop") =>
    place === "end-drop" ? "at the top of the drop" : "at this corner";
  const button = "h-6 px-2 text-xs";
  return (
    <div className="mt-2 pt-2 border-t border-border/60 space-y-1.5">
      {bends.summary && (
        <p className="text-xs text-muted-foreground leading-snug">
          {bends.summary}
        </p>
      )}
      {bends.overLimit.map(line => (
        <p key={line} className="text-xs text-warning leading-snug">
          {line}
        </p>
      ))}

      {bends.proposals
        .filter(p => p.answer === null)
        .map(p => {
          const other = p.suggestedKind === "lb" ? "pullBox" : "lb";
          const spot = {
            runId: run.id,
            place: p.place,
            x: p.x,
            y: p.y,
          };
          return (
            <div
              key={`${p.place}:${p.x}:${p.y}`}
              className="rounded border border-dashed border-[#F5C518]/60 px-2 py-1.5 space-y-1"
            >
              <p className="text-xs leading-snug">
                <span className="text-[#F5C518] font-medium">
                  Pull point proposed
                </span>{" "}
                {where(p.place)} — {p.degrees}° since the last one, past the{" "}
                {bends.limit}° limit.
              </p>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    onAnswer({
                      ...spot,
                      kind: p.suggestedKind,
                      status: "accepted",
                    })
                  }
                >
                  {p.suggestedKind === "lb" ? "Add an LB" : "Add a pull box"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    onAnswer({ ...spot, kind: other, status: "accepted" })
                  }
                >
                  {other === "lb" ? "An LB instead" : "A pull box instead"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    onAnswer({
                      ...spot,
                      kind: p.suggestedKind,
                      status: "dismissed",
                    })
                  }
                >
                  No, pull through
                </Button>
              </div>
            </div>
          );
        })}

      {bends.accepted.map(a => (
        <div
          key={`accepted-${a.answerId}`}
          className="flex items-center justify-between gap-2"
        >
          <p className="text-xs leading-snug">
            {a.kind === "lb" ? "LB" : "Pull box"} added {where(a.place)}.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className={button}
            disabled={busy}
            onClick={() => onUndo(a.answerId)}
          >
            {/* Not "Undo": that word is the toolbar's stack, and this only
                takes back this one answer (plan § 1.2 g, audit #26). */}
            Take back
          </Button>
        </div>
      ))}

      {bends.proposals
        .filter(p => p.answer?.status === "dismissed")
        .map(p => (
          <div
            key={`dismissed-${p.answer!.id}`}
            className="flex items-center justify-between gap-2"
          >
            <p className="text-xs text-muted-foreground leading-snug">
              Pull point dismissed {where(p.place)}.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className={button}
              disabled={busy}
              onClick={() => onUndo(p.answer!.id)}
            >
              Take back
            </Button>
          </div>
        ))}
    </div>
  );
}

export type PanelRun = {
  id: number;
  name: string;
  /** Bends and pull points on a conduit run; null on cable. */
  bends?: RunBendsView | null;
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
  /** Whose wire this run is (D18). Derived on the server, never here. */
  wireOwnership?: "homerun" | "branch" | "unanswered";
  /** What the estimator said. NULL means the question is still open. */
  branchWiring?: boolean | null;
  /** Which kind of run — what its colour groups on. Null before types. */
  runTypeId: number | null;
  /**
   * What the run's TYPE says one circuit of it pulls — the starting point for
   * a circuit added here. Null on a run with no type, and either count may be
   * null on a type that does not say. See `newCircuitFor`.
   *
   * Deliberately NOT what the run stores: a type's counts are a default the
   * editor offers, and a run's wire comes only from circuits that exist. That
   * distinction is what `server/runToBidWire.test.ts` asserts at the point it
   * would otherwise be forgotten.
   */
  typeDefaults?: {
    conductorCount: number | null;
    groundCount: number | null;
  } | null;
  /**
   * The bid would price this run's wire and there is none — from the
   * server, through shared/runNoWire.ts, so the row and the bid agree.
   */
  noWire?: boolean;
  /**
   * A circuit here would be wire with no material (an underground trench or
   * an empty pipe whose type names no wire), so the circuit editor offers
   * "Pick the wire" instead — the server refuses the circuit. From the
   * server, shared/runNoWire.ts `circuitNeedsPickedWire`.
   */
  pickWireToAdd?: boolean;
  /** Ends that may be double-click stubs, to check (shared/runBends.ts). */
  stubsToReview?: {
    end: "start" | "end";
    vertex: number;
    segmentPoints: number;
    degrees: number;
    point: { x: number; y: number };
  }[];
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
    /**
     * This circuit runs its OWN ground instead of sharing the pipe's (0072).
     *
     * Resolved, not raw: NULL and false both mean sharing, and the control is
     * a two-state toggle. Nothing is lost by collapsing them, unlike
     * `groundCount` above where null is genuinely not zero.
     */
    separateGround: boolean;
  }[];
  quantities: RunQuantities | null;
  /**
   * A length the estimator typed, in inches (§ 4c). Null is "measured from the
   * drawing". Optional only so a caller that never edits lengths need not
   * pass it; the Takeoff screen always does.
   */
  typedLengthInches?: number | null;
  /**
   * This run's own extra and makeup, and what it inherits without them —
   * `extrasViewForRunRow` on the server. Optional for the same reason as the
   * typed length; the Takeoff screen always sends it.
   */
  extras?: {
    own: {
      conduitExtraPct: number | null;
      wireExtraPct: number | null;
      makeupDeviceInches: number | null;
      makeupPanelInches: number | null;
      makeupByKindInches: Record<string, number> | null;
    };
    inherited: {
      conduitExtraPct: ResolvedExtra;
      wireExtraPct: ResolvedExtra;
      makeupDeviceInches: ResolvedExtra;
      makeupPanelInches: ResolvedExtra;
    };
  };
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
  /** Branch legs (D20): the run this row is a leg of; NULL on a root. */
  parentRunId?: number | null;
  /** The tee each end sits on, if any. */
  startTee?: { id: number } | null;
  endTee?: { id: number } | null;
  /**
   * Route or quantity (D21). A quantity trace shows no circuits, no ends and
   * no D18 question; its wire comes from the type and its drops are proposed.
   */
  traceMode: TraceMode;
  /** Through the ceiling or box to box (0131), NULL already read as ceiling. */
  runsAt: "ceiling" | "boxToBox";
};

const feet = (value: number) =>
  `${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ft`;

/** Guards the subtraction below from floating-point dust like 1239.9999998. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Two decimals, always, so a column of sums lines up while being added. */
const exact = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * "2 runs have no type — 48 ft of conduit is not on the bid. …"
 *
 * In `feet`, the figures' own format, so the footage reads "30 ft" under a
 * "70 ft" rather than "30.00 ft" — seen on screen 2026-09-27.
 */
function noTypeSentence(noType: RunTotalsLeftOut["noType"]): string {
  const runs = `${noType.count} run${noType.count === 1 ? " has" : "s have"} no type`;
  const parts = [
    noType.conduitFeet > 0 ? `${feet(noType.conduitFeet)} of conduit` : null,
    noType.cableFeet > 0 ? `${feet(noType.cableFeet)} of cable` : null,
  ].filter(Boolean);
  const what =
    parts.length > 0
      ? `${parts.join(" and ")} ${parts.length === 1 ? "is" : "are"} not on the bid`
      : `${noType.count === 1 ? "it is" : "they are"} not on the bid`;
  return `${runs} — ${what}. Give each run a type to price it.`;
}

/**
 * "No wire (empty pipe)" — a spare, a sleeve, a trench for a future pull.
 * An answer, so it is said as plainly as picking a wire, never hidden as the
 * lesser choice (2026-10-08).
 */
function EmptyPipeButton({ onEmptyPipe }: { onEmptyPipe: () => void }) {
  return (
    <button
      className="underline text-muted-foreground hover:text-foreground"
      onClick={e => {
        e.stopPropagation();
        onEmptyPipe();
      }}
    >
      No wire (empty pipe)
    </button>
  );
}

/**
 * The two answers to a run whose TYPE does not say its wire — the shipped
 * underground types, by design (per-foot-items-plan.md § 3b). Picking opens
 * the run's "Made of" editor on its wire; either way the run moves to a type
 * that says so and keeps its tape (`takeoffRuns.respecify`).
 */
function NoWireAnswers({
  onPickWire,
  onEmptyPipe,
}: {
  onPickWire: () => void;
  onEmptyPipe: () => void;
}) {
  return (
    <>
      <button
        className="underline text-warning hover:text-foreground"
        onClick={e => {
          e.stopPropagation();
          onPickWire();
        }}
      >
        Pick the wire
      </button>
      <EmptyPipeButton onEmptyPipe={onEmptyPipe} />
    </>
  );
}

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
  typed = false,
  extra = 0,
  makeup = 0,
}: {
  label: React.ReactNode;
  flat: number;
  vertical: number;
  /** What gets BOUGHT — every term below added up. */
  total: number;
  /**
   * The flat share was TYPED by the estimator, not traced (§ 4c). Said on the
   * line itself — "60.00 typed + 8.50 = 68.50 ft" — because a number somebody
   * supplied and one the app measured are different kinds of fact, and this
   * line is where an estimator checks where every foot came from.
   */
  typed?: boolean;
  /**
   * EXTRA and MAKEUP (§ 5j), each its own named term: "112.00 + 8.50 vertical
   * + 5.60 extra = 126.10 ft". A total with them folded in is as invisible as
   * not counting them. Zero terms are dropped — `+ 0.00 extra` is noise where
   * a number goes; "nobody set this" is said by the run row instead.
   *
   * When extra is present a second line says where the LABOUR is: extra is
   * material only and makeup is installed (owner, 2026-09-28, Q5), so the
   * hours are on flat + vertical + makeup and the reader can see that number.
   */
  extra?: number;
  makeup?: number;
}) {
  const word = typed ? (
    <span className="font-sans text-sky-600 dark:text-sky-400"> typed</span>
  ) : null;
  const padded = extra > 0 || makeup > 0;
  const installed = total - extra;
  return (
    <div className="text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground shrink-0">{label}</span>
        <span className="font-mono text-right">
          {padded ? (
            <>
              <span className="text-muted-foreground/70">
                {exact(flat)}
                {word}
                {vertical > 0 && <> + {exact(vertical)} vertical</>}
                {extra > 0 && <> + {exact(extra)} extra</>}
                {makeup > 0 && <> + {exact(makeup)} makeup</>} ={" "}
              </span>
              {exact(total)} ft
            </>
          ) : vertical > 0 ? (
            <>
              <span className="text-muted-foreground/70">
                {exact(flat)}
                {word} + {exact(vertical)} ={" "}
              </span>
              {exact(total)} ft
            </>
          ) : (
            <>
              {feet(total)}
              {word}
            </>
          )}
        </span>
      </div>
      {/* Short on each line; the WHY is said once under the totals and on
          hover. Repeating "extra is material only" on every line was noise
          (seen on screen, 2026-09-29). */}
      {extra > 0 && (
        <div
          className="text-right text-xs text-muted-foreground/80"
          title="Extra is bought but not installed, so it carries no install hours. Makeup is installed and does."
        >
          labor on {exact(installed)} ft
        </div>
      )}
    </div>
  );
}

/**
 * The typed-length box on a run row — § 4c, "draw the path, type the length".
 *
 * Three states, and the words differ in each because the situation does:
 *
 *   - NO SCALE on the sheet: the box is the only way this run gets a number,
 *     so it is always shown, under the notice saying the run is not counted.
 *   - TYPED: the box shows what was typed, and what the drawn line measures
 *     beside it on a scaled sheet — so a slipped key (600 for 60) is one glance
 *     away — with a way back to the drawing.
 *   - TRACED on a scaled sheet: one quiet link, because typing over a good
 *     measurement is the exception.
 *
 * Decimal FEET, through `InlineNumberField`, so it follows every rule in
 * CLAUDE.md § Editing fields without a second implementation of them. The
 * label says the length is FLAT (owner, 2026-09-28, Q6): drops and extra go
 * on top, so typing the whole pull here would count the drops twice.
 */
function TypedLength({
  run,
  onSet,
}: {
  run: PanelRun;
  onSet: (runId: number, inches: number | null) => void;
}) {
  const typedInches = run.typedLengthInches ?? null;
  const drawn = run.quantities?.drawnFeet ?? null;
  const [open, setOpen] = useState(false);
  const noScale = run.quantities === null && typedInches === null;
  const shown = noScale || typedInches !== null || open;

  if (!shown) {
    return (
      <button
        className="mt-1 text-xs text-muted-foreground underline hover:text-foreground"
        onClick={e => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Type a length instead
      </button>
    );
  }

  return (
    <div className="mt-1.5 space-y-0.5" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="text-muted-foreground shrink-0">
          Length along the drawing
        </span>
        <InlineNumberField
          value={typedInches === null ? null : typedInches / 12}
          whenUnset={{ placeholder: "type ft" }}
          rules={{ min: 0.01, max: 10_000, epsilon: 1e-4 }}
          onSave={feet => onSet(run.id, feet * 12)}
          onClear={() => onSet(run.id, null)}
          ariaLabel="Typed length of this run, in feet"
          suffix="ft"
          className="w-24"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Flat length only — drops and extra are added on top.
        {typedInches !== null && drawn !== null && (
          <> The drawn line measures {exact(drawn)} ft.</>
        )}
        {typedInches !== null && drawn !== null && (
          <>
            {" "}
            <button
              className="underline hover:text-foreground"
              onClick={() => onSet(run.id, null)}
            >
              Use the drawn length
            </button>
          </>
        )}
      </p>
    </div>
  );
}

/** Where an inherited extra comes from, in the words a placeholder needs. */
function inheritedText(resolved: ResolvedExtra, format: (n: number) => string) {
  if (resolved.value === null) return "not set";
  const from =
    resolved.source === "type"
      ? "type"
      : resolved.source === "company"
        ? "company"
        : "starter";
  return `${from} ${format(resolved.value)}`;
}
// Bare numbers: the field's own suffix ("%", "in") names the unit, and a
// second one in the placeholder read "starter 5% %" (seen on screen).
const pctLabel = (f: number) => String(Math.round(f * 10000) / 100);
const inLabel = (n: number) => String(n);

/**
 * THIS RUN'S own extra and makeup — the nearest level of the chain (owner,
 * 2026-09-28: every value at every level). Behind one link on the open run,
 * because a run that differs from its type is the exception; open by itself
 * when this run already differs, and says so with a one-click reset (§ 2.5).
 *
 * Self-saving fields: each placeholder names what applies when it is empty —
 * "type 10%", "company 5%", "not set" — never a zero (CLAUDE.md § Editing
 * fields, rule 6). A typed 0 is "none on this run", an answer.
 */
function RunExtrasEditor({
  run,
  customHeightTypes,
  onSet,
}: {
  run: PanelRun & { extras: NonNullable<PanelRun["extras"]> };
  customHeightTypes: readonly { typeKey: string; label: string }[];
  onSet: (runId: number, patch: RunExtrasPatch) => void;
}) {
  const { own, inherited } = run.extras;
  const differs =
    own.conduitExtraPct !== null ||
    own.wireExtraPct !== null ||
    own.makeupDeviceInches !== null ||
    own.makeupPanelInches !== null ||
    (own.makeupByKindInches !== null &&
      Object.keys(own.makeupByKindInches).length > 0);
  const [open, setOpen] = useState(false);

  if (!open && !differs) {
    return (
      <button
        className="mt-1 block text-xs text-muted-foreground underline hover:text-foreground"
        onClick={e => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Extra and makeup for this run
      </button>
    );
  }

  const row = (
    label: string,
    value: number | null,
    placeholder: string,
    suffix: string,
    max: number,
    save: (v: number | null) => void
  ) => (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <InlineNumberField
        value={value}
        whenUnset={{ placeholder }}
        rules={{ min: 0, max }}
        onSave={v => save(v)}
        onClear={() => save(null)}
        ariaLabel={`${label} for this run`}
        suffix={suffix}
        className="w-24"
      />
    </div>
  );
  const pct = (v: number | null) =>
    v === null ? null : Math.round(v * 10000) / 100;

  return (
    <div className="mt-1.5 space-y-0.5" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          Extra and makeup{differs ? " — differs from its type" : ""}
        </span>
        {differs && (
          <button
            className="underline text-muted-foreground hover:text-foreground"
            onClick={() =>
              onSet(run.id, {
                conduitExtraPct: null,
                wireExtraPct: null,
                makeupDeviceInches: null,
                makeupPanelInches: null,
                makeupByKindInches: null,
              })
            }
          >
            Follow the type
          </button>
        )}
      </div>
      {run.pathType === "conduit" &&
        row(
          "Conduit extra",
          pct(own.conduitExtraPct),
          inheritedText(inherited.conduitExtraPct, pctLabel),
          "%",
          100,
          v => onSet(run.id, { conduitExtraPct: v === null ? null : v / 100 })
        )}
      {row(
        run.pathType === "cable" ? "Cable extra" : "Wire extra",
        pct(own.wireExtraPct),
        inheritedText(inherited.wireExtraPct, pctLabel),
        "%",
        100,
        v => onSet(run.id, { wireExtraPct: v === null ? null : v / 100 })
      )}
      {row(
        "Makeup at a box",
        own.makeupDeviceInches,
        inheritedText(inherited.makeupDeviceInches, inLabel),
        "in",
        240,
        v =>
          onSet(run.id, {
            makeupDeviceInches: v === null ? null : Math.round(v),
          })
      )}
      {row(
        "Makeup at a panel",
        own.makeupPanelInches,
        inheritedText(inherited.makeupPanelInches, inLabel),
        "in",
        240,
        v =>
          onSet(run.id, {
            makeupPanelInches: v === null ? null : Math.round(v),
          })
      )}
      {customHeightTypes.map(t =>
        row(
          `Makeup at ${t.label}`,
          own.makeupByKindInches?.[t.typeKey] ?? null,
          "type or company",
          "in",
          240,
          v => {
            const next = { ...(own.makeupByKindInches ?? {}) };
            if (v === null) delete next[t.typeKey];
            else next[t.typeKey] = Math.round(v);
            onSet(run.id, {
              makeupByKindInches: Object.keys(next).length > 0 ? next : null,
            });
          }
        )
      )}
    </div>
  );
}

/**
 * The traced and vertical shares of a run's wire.
 *
 * ── These added up the circuit rows, and that stopped being the whole run ───
 * Since 2026-09-24 the shared ground belongs to the run rather than to any
 * circuit, so summing the rows left it out of both — and the `flat + vertical
 * = total` line below would have printed its own arithmetic failing, because
 * `totalWireFeet` still counts it. The split is computed where the shared
 * ground is known and read from there.
 */
function wireFlat(run: PanelRun): number {
  return run.quantities?.wireFlatFeet ?? 0;
}

function wireVertical(run: PanelRun): number {
  return run.quantities?.wireVerticalFeet ?? 0;
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
 *
 * ── The run's own figure, not a sum over its circuits ───────────────────────
 * This summed `wireByCircuit[].groundFeet` until 2026-09-24. The shared ground
 * belongs to the RUN now — it is pulled once for the pipe — so that sum reads
 * zero on an ordinary run and this line would simply have vanished from a
 * screen whose whole job is saying how much of which wire to buy.
 */
function wireGround(run: PanelRun): number {
  return run.quantities?.groundBoughtFeet ?? 0;
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
  /**
   * Counted by name, with no assembly behind it (kinds `plain` and `typed`).
   * The card then offers "Link assembly" — legend plan § 8a. Optional so a
   * caller that never offers linking need not say.
   */
  byNameOnly?: boolean;
};

export type PanelStampGroup = {
  /** Which count this is. Decides the swatch, and the key. */
  groupId: number | null;
  assemblyId: number | null;
  name: string;
  /** NEW marks — priced (shared/markStatus.ts). */
  count: number;
  /** Every mark on this sheet, whatever its status. */
  placed: number;
  /** How many of each status, for the words on the card. */
  split: StatusSplit;
  stamps: {
    id: number;
    x: number;
    y: number;
    /** Keeps an assembly-backed swatch on its category shape. */
    assemblyCategory?: string | null;
  }[];
};

/**
 * What one run type would put on the bid: one row per material (D18, § 5f.2).
 *
 * Pipe, wire and ground are three purchases at three prices, so they are three
 * rows. A cable type has one — the cable IS the raceway. An empty conduit run
 * for future use has one too, and that is a real thing to bid.
 */
export type RunTypeBridgeRow = {
  /** `extra` is a per-foot extra on the type, like underground tape (0135). */
  role: "raceway" | "conductor" | "ground" | "extra";
  /** Which extra, on an `extra` row; 0 on the others. */
  extraKey: number;
  /** How an extra's feet were reached; null on the others. */
  why: string | null;
  /** `why` without "N ft of <name>:" — what this row shows under itself. */
  how: string | null;
  materialName: string | null;
  feet: number;
  onBid: boolean;
  /** `ok` or a named refusal with a sentence a person can act on. */
  sendable: { ok: true } | { ok: false; reason: string; message: string };
  /** What Send-again would change on the line already on the bid. */
  resend: ResendPreview;
};

/**
 * What Send-again will do to a line already on the bid — `shared/resendLine.ts`,
 * the same plan the send applies. Null when it changes nothing but quantity,
 * and always null on a locked bid.
 */
export type ResendPreview =
  | { kind: "swap"; text: string }
  /** What Send fills in on a line that has none: a price, hours, or both. */
  | { kind: "refill"; price: number | null; hours: number | null }
  | null;

/**
 * One fitting a traced conduit type wants on the bid — counted from the runs,
 * never typed (`shared/runFittings.ts`). `why` is the sentence that says how
 * the number was reached, and the panel never shows the number without it.
 */
export type RunTypeBridgeFitting = {
  role: FittingKind;
  status: "counted" | "included" | "unknown";
  qty: number;
  atLeast: boolean;
  why: string;
  materialName: string | null;
  /** Why no material was matched, in words — null when one was. */
  materialProblem: string | null;
  /** False for a matched material at $0; null when nothing matched. */
  priced: boolean | null;
  onBid: boolean;
  sendable: { ok: true } | { ok: false; reason: string; message: string };
  resend: ResendPreview;
};

/** The sentence the panel shows for a pending Send-again change. */
function resendSentence(resend: NonNullable<ResendPreview>): string {
  if (resend.kind === "swap") return `On Send: ${resend.text}`;
  const parts = [
    resend.price !== null ? `price filled in at ${money(resend.price)}` : null,
    resend.hours !== null ? `labor filled in at ${resend.hours} h each` : null,
  ].filter((part): part is string => part !== null);
  return `On Send: ${parts.join(", ")}`;
}

/**
 * "Couplings", "90° bends" — shown only where no part matched (a matched row
 * shows the part's own name), so it reads as the server's unmatched lines do.
 */
function fittingLabel(role: FittingKind): string {
  const many = unmatchedKindWords(role).many;
  return many.charAt(0).toUpperCase() + many.slice(1);
}

export type RunTypeBridgeEntry = {
  runTypeId: number;
  label: string;
  /** For the swatch: the line style this type is drawn in. */
  pathType: "conduit" | "cable";
  rows: RunTypeBridgeRow[];
  /**
   * Every conduit fitting on a conduit type; on a cable type, the box and
   * cover at its tees (`cableTeeRows`) and, on MC, its connectors and straps
   * (`cableRunRows`) — both since 2026-09-29.
   */
  fittings: RunTypeBridgeFitting[];
  /** Runs of this type nobody has answered the branch-wiring question for. */
  unansweredCount: number;
  /**
   * Runs answered branch wiring. Their wire is left out; on a conduit type
   * their pipe still counts (runTypeFootageCore.ts).
   */
  branchCount: number;
  /** Runs on a sheet with no scale, so not in these numbers at all. */
  unmeasurableCount: number;
  /**
   * Of the pipe (or cable) above, the feet from QUANTITY traces (D21). One
   * bid line either way; this is the split, never a second amount.
   */
  quantityFeet: number;
};

/**
 * "This sheet: 3 marks · 6 items · 358 ft of runs" — the panel's pinned line,
 * and on the phone the bar under the drawing too. ONE component for both, so
 * the two can never count differently (CLAUDE.md § Copying a layout does not
 * copy the behaviour).
 */
export function ThisSheetLine({
  stampGroups,
  runs,
  className,
}: {
  stampGroups: readonly { placed: number }[];
  runs: readonly {
    runTypeId: number | null;
    isSuggestion: boolean;
    quantities: { runFeet: number } | null;
  }[];
  className?: string;
}) {
  return (
    <p className={className}>
      {sheetLine({
        counts: stampGroups,
        runs: runs.map(r => ({
          runTypeId: r.runTypeId,
          isSuggestion: r.isSuggestion,
          feet: r.quantities?.runFeet ?? null,
        })),
      })}
    </p>
  );
}

export function RunsPanel({
  runs,
  totals,
  onSetTraceMode,
  dropsReadout,
  selectedRunId,
  onSelectRun,
  onRemoveRun,
  onDeleteCountMarks,
  onDeleteCount,
  onOpenPartialEnds,
  cardUndo,
  onCardUndo,
  emptiedCount = null,
  onCommitRun,
  onAcceptSuggestion,
  onPickWire,
  onEmptyPipe,
  onAddCircuit,
  onUpdateCircuit,
  onRemoveCircuit,
  stampGroups,
  bridge,
  waitingToSend,
  countedWithNoPrice,
  onSendToBid,
  linkAssemblies,
  onLinkAssembly,
  sendingGroupId,
  onJumpTo,
  onRemoveStamp,
  legend,
  layers,
  reader,
  summary,
  tab,
  tabs,
  onTab,
  warnedTabs,
  phone = false,
  onSheetsSlot,
  focusGroupId,
  renderRunEnds,
  renderRunType,
  onAnswerBranchWiring,
  onSetTypedLength,
  onSetRunExtras,
  customHeightTypes = [],
  groupDrops,
  onSetGroupDrop,
  dropHeightTypes = [],
  dropRunTypes = [],
  runTypeBridge,
  onSendRunType,
  sendingRunTypeId,
  quantitiesLocked = false,
  onAnswerPullPoint,
  onUndoPullPoint,
  pullPointBusy = false,
  onAddLeg,
  runColors,
  pins,
  hideOtherRuns,
  onToggleHideOtherRuns,
  lookEditor,
}: {
  runs: PanelRun[];
  /**
   * Each count's letter and first-use colour on this bid — the SAME map the
   * drawing reads (shared/pinLetters.ts), so a card's swatch is its pins.
   */
  pins?: ReadonlyMap<number, PinStyle>;
  /**
   * Wraps a count's swatch in the pin-look editor (PinLookEditor), or
   * returns it unchanged. A render prop so the save lives with the page's
   * other mutations and its refresh helper.
   */
  lookEditor?: (
    groupId: number,
    name: string,
    swatch: React.ReactNode
  ) => React.ReactNode;
  /** Which colour each run type gets on this bid — `takeoffRuns.typeColors`. */
  runColors: RunTypeColors;
  /**
   * "Hide other runs" (T14) — the drawing shows only the selected run. The
   * switch sits on the selected run, because that is what it is about.
   */
  hideOtherRuns: boolean;
  onToggleHideOtherRuns: () => void;
  /**
   * Start tracing another leg of this run (D20) — a branch off it, or a
   * separate stretch of it. Optional: without it the panel offers none.
   */
  onAddLeg?: (run: PanelRun) => void;
  /**
   * Accept or dismiss a proposed pull point, and take an answer back. Optional
   * like the branch-wiring answer: a caller that cannot store one shows the
   * sentence and no dead buttons.
   */
  onAnswerPullPoint?: (answer: PullPointAnswerInput) => void;
  onUndoPullPoint?: (answerId: number) => void;
  pullPointBusy?: boolean;
  /**
   * Answer "whose wire is this run?" — true branch, false homerun, null to put
   * the question back. Optional so a caller that cannot answer simply does not
   * show the question rather than showing a dead control.
   */
  onAnswerBranchWiring?: (runId: number, answer: boolean | null) => void;
  /**
   * Type a run's flat length, or clear it back to the drawing (§ 4c).
   * Inches; null clears. Optional: without it the panel offers no length box.
   */
  onSetTypedLength?: (runId: number, inches: number | null) => void;
  /**
   * Change a run's own extra and makeup (held-migrations plan § 1). Optional:
   * without it the panel offers none.
   */
  onSetRunExtras?: (runId: number, patch: RunExtrasPatch) => void;
  /** The company's own height types, for per-type makeup on a run. */
  customHeightTypes?: readonly { typeKey: string; label: string }[];
  /**
   * Each counted group's drop (held-migrations plan § 3), from
   * `takeoffGroups.list`, keyed by group id. Optional: without it and
   * `onSetGroupDrop` the rows offer no drop.
   */
  groupDrops?: ReadonlyMap<number, GroupDropInfo>;
  onSetGroupDrop?: (groupId: number, patch: GroupDropPatch) => void;
  /** What a drop can go to, and be made of. */
  dropHeightTypes?: readonly {
    typeKey: string;
    label: string;
    heightInches: number | null;
  }[];
  dropRunTypes?: readonly { id: number; label: string; pathType: string }[];
  /** What each traced type would put on the bid. Undefined while loading. */
  runTypeBridge?: RunTypeBridgeEntry[];
  onSendRunType?: (runTypeId: number) => void;
  sendingRunTypeId?: number | null;
  /** Counted stamps, grouped by assembly. Quantities are derived, not typed. */
  stampGroups: PanelStampGroup[];
  /** Each count's relationship to the bid, by group id. */
  bridge?: ReadonlyMap<number, GroupBridgeState>;
  /**
   * Whether the bid's quantities are frozen (shared/quantityLock.ts).
   *
   * It changes what every "on the bid" line in this panel MEANS, so it is one
   * prop read in three places rather than three separate booleans. Defaulted to
   * false so a caller that does not know yet shows the ordinary wording — which
   * is the right guess on the overwhelming majority of bids, and is corrected by
   * the query landing rather than by a flicker.
   */
  quantitiesLocked?: boolean;
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
  /**
   * The library, for "Link assembly" on a count made by name (§ 8a). Both
   * this and `onLinkAssembly` must be given for the control to appear.
   */
  linkAssemblies?: SearchableAssembly[];
  onLinkAssembly?: (groupId: number, assemblyId: number) => void;
  /** The count currently crossing, so its own control can say so. */
  sendingGroupId?: number | null;
  /** Move the viewer to a mark on the drawing and highlight it. */
  onJumpTo: (at: { x: number; y: number }) => void;
  onRemoveStamp: (id: number) => void;
  /** The Legend tab: captured symbols. */
  legend?: React.ReactNode;
  /**
   * The Layers filter, pinned under "This sheet" on every tab (owner,
   * 2026-10-06: "move Layers higher"). It filters marks AND runs, so it
   * belongs above the tabs rather than inside one of them.
   */
  layers?: React.ReactNode;
  /** The Reader tab's content, when the reader exists (§ 1 rule 6). */
  reader?: React.ReactNode;
  /**
   * Which tab is open, and the ones offered. Held by the page, not here,
   * because selecting on the DRAWING opens a tab (§ 1 rule 4) and the
   * drawing is not in this component.
   */
  tab: PanelTab;
  tabs: readonly PanelTab[];
  onTab: (tab: PanelTab) => void;
  /** Tabs with something in them that needs a look (§ 1 rule 5). */
  warnedTabs: ReadonlySet<PanelTab>;
  /** The phone layout: finger-sized tabs (plan § 3). */
  phone?: boolean;
  /** The element the phone's Sheets tab lends to the sheet list. */
  onSheetsSlot?: (el: HTMLElement | null) => void;
  /** The count whose marks were just selected on the drawing, to show. */
  focusGroupId?: number | null;
  /**
   * The whole-set summary (TakeoffSummaryPanel), where the one grey "N counts
   * are not on the bid yet" line used to be. A node, like `legend`: it owns
   * its query and the Send all mutation.
   */
  summary?: React.ReactNode;
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
  /**
   * The bid's totals, typed AS WHAT PRODUCES THEM rather than re-listed here.
   *
   * ── It was a hand-written shape, and it had already gone stale ────────────
   * Eight fields copied out of `totalQuantities`'s return. `wireGroundFeet`
   * was added to that return and never arrived here, so the panel could not
   * have shown the bare copper even if somebody wrote the line — the field was
   * not on the type. Nothing failed; a number simply had no way in.
   *
   * That is the "hand-listed fields go stale" trap from CLAUDE.md, in the
   * direction that does not announce itself. Restating a return type is not
   * the explicit-mapping rule in that file — that rule is about which fields a
   * screen CHOOSES to render, and this component still chooses. It is about
   * what it is allowed to see.
   */
  totals:
    | (ReturnType<typeof totalQuantities> & {
        /** Quantity traces on the bid (D21): how many, and ends with no drop. */
        quantity?: { traceCount: number; openEnds: number };
        /** What the bid does not price, said under the figures. */
        leftOut?: RunTotalsLeftOut;
        /** What drops from marks leave out (held-migrations plan § 3). */
        markDropNotes?: {
          noTypeGroups: number;
          noHeightGroups: number;
          mayDoubleCount: number;
          notPricedDrops: number;
        };
      })
    | undefined;
  /** Switch a run between route and quantity (D21) — root and legs. */
  onSetTraceMode?: (runId: number, mode: TraceMode) => void;
  /**
   * The bid's drops readout (D21, answer 6), placed after the traced footage
   * it explains. A slot rather than a query here: this panel is per SHEET and
   * the readout is per BID.
   */
  dropsReadout?: React.ReactNode;
  selectedRunId: number | null;
  onSelectRun: (id: number | null) => void;
  onRemoveRun: (id: number) => void;
  /**
   * A count card's trash: delete that count's marks on THIS sheet. The count
   * itself stays, and its bid line follows. More than one asks first.
   */
  onDeleteCountMarks?: (marks: { id: number; name: string }[]) => void;
  /** Delete the whole count, every sheet — the page asks first. */
  onDeleteCount?: (groupId: number) => void;
  /** "Set ends": open the first run with one end not counted. */
  onOpenPartialEnds?: () => void;
  /**
   * A card's own undo arrow (@/lib/undoStack `undoForSubject`): the step it
   * would take back, named, or null when the newest step is not about it.
   */
  cardUndo?: (subject: UndoSubject) => { label: string } | null;
  onCardUndo?: () => void;
  /**
   * The count whose last mark on this sheet was just deleted, kept in its
   * place with its undo arrow (@/lib/emptiedCountCard). Null otherwise.
   */
  emptiedCount?: EmptiedCountCard | null;
  onCommitRun: (id: number) => void;
  onAcceptSuggestion: (id: number) => void;
  /**
   * The two answers to "no wire" when the run's TYPE does not say its wire
   * (an underground trench, 2026-10-08): open the run's "Made of" editor on
   * its wire, or make it an empty pipe. Both go through
   * `takeoffRuns.respecify` — one run, its type's tape kept.
   */
  onPickWire: (runId: number) => void;
  onEmptyPipe: (runId: number) => void;
  onAddCircuit: (
    runId: number,
    name: string,
    conductorCount: number,
    groundCount: number
  ) => void;
  onUpdateCircuit: (
    id: number,
    patch: {
      conductorCount?: number;
      groundCount?: number;
      separateGround?: boolean;
    }
  ) => void;
  onRemoveCircuit: (id: number) => void;
}) {
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [circuitName, setCircuitName] = useState("");
  /** The count whose "which assembly?" search is open, if any. */
  const [linkingGroupId, setLinkingGroupId] = useState<number | null>(null);

  /*
    BRING THE SELECTION INTO VIEW (§ 1 rule 4). Opening the Runs tab for a
    run picked on the drawing is not enough when its row is 1,700px down the
    list under the traced footage — measured on the fixture, 2026-09-30. Only
    when the row is out of view, so a row clicked in the panel itself does
    not jump. `scrollTop` rather than scrollIntoView: it moves this scroller
    only, never the page around it.
  */
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const selector =
      tab === "runs" && selectedRunId !== null
        ? `[data-run-row="${selectedRunId}"]`
        : tab === "counts" && focusGroupId != null
          ? `[data-count-card="${focusGroupId}"]`
          : null;
    if (!selector) return;
    const row = scroller.querySelector<HTMLElement>(selector);
    if (!row) return;
    const view = scroller.getBoundingClientRect();
    const at = row.getBoundingClientRect();
    if (at.top >= view.top && at.top < view.bottom - 40) return;
    scroller.scrollTop += at.top - view.top;
  }, [tab, selectedRunId, focusGroupId]);
  const emptiedAt = emptiedCardIndex(stampGroups.length, emptiedCount);

  /**
   * Add one circuit and stay ready for the next one.
   *
   * ONE function rather than a body on the Enter key and another on the Add
   * button. They were two call sites passing the same pair of constants, and
   * this is now three things — the counts from the run's type, the name, and
   * the suggestion for the one after — which is three chances for the two
   * paths to disagree about what a circuit starts as.
   */
  const addOneCircuit = (run: PanelRun, name: string) => {
    const start = newCircuitFor(run.typeDefaults ?? null);
    onAddCircuit(run.id, name, start.conductors, start.grounds);
    setCircuitName(suggestAfter(name, run.circuits));
  };

  return (
    <div className="h-full flex flex-col bg-card border-l border-border min-h-0">
      {/*
        TABS — one box at a time (references/track-b-phone-and-readability-plan.md
        § 1). A strip that scrolls sideways if it ever runs out of width; it
        never wraps to two rows. A tab with a warning inside it carries the
        mark on the tab itself, because a warning in a closed tab is unseen.
      */}
      <div
        role="tablist"
        aria-label="Plan panel"
        // A swipeable strip on purpose, never a page that scrolls sideways
        // (the device audit exempts exactly this attribute).
        data-sideways-ok
        // No visible scrollbar: on a desktop browser at phone width it drew
        // a 14px bar under the tabs (seen 2026-09-30); the strip still swipes.
        className="flex shrink-0 overflow-x-auto border-b border-border [scrollbar-width:none]"
      >
        {tabs.map(t => {
          const active = t === tab;
          const warned = warnedTabs.has(t);
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(t)}
              title={
                warned ? `${PANEL_TAB_LABELS[t]} — needs a look` : undefined
              }
              /*
                NO `transition-colors`, on purpose. It was here first, and in
                a background tab a transition never advances, so the strip
                held the PREVIOUS tab's underline over the new tab's content
                — seen on screen 2026-09-30. Which tab is open must never be
                one frame behind.
              */
              className={cn(
                // px-1.5, not more: all five must fit the panel's 280px
                // minimum, or Totals — the tab most likely to carry the
                // warning mark — is the one scrolled out of sight. A
                // finger's 44px on the phone (takeoff-spec ground rule 2).
                //
                // `phone` is every touch layout, the upright tablet included
                // — a 312px panel with touch-sized text. There px-2.5 made
                // the five tabs 331px, and Legend sat 20px off the screen's
                // edge (measured 2026-10-08; `pnpm device:audit` now fails on
                // it as `cutTabs`). Padding is only the MINIMUM — flex-1
                // spreads the tabs over the strip anyway — so px-1 there.
                "flex-1 min-w-fit flex items-center justify-center gap-1 px-1.5 text-xs border-b-2 whitespace-nowrap",
                phone ? "h-11 text-sm px-1" : "h-9",
                active
                  ? "border-[#F5C518] text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {PANEL_TAB_LABELS[t]}
              {warned && (
                <TriangleAlert
                  className="w-3 h-3 text-warning shrink-0"
                  aria-label="needs a look"
                />
              )}
            </button>
          );
        })}
      </div>

      {/*
        PINNED, above every tab and never scrolling (§ 1 rule 3, answer 6).
        It replaced "Counted items 9", which added this sheet's marks to its
        runs and so counted nothing.
      */}
      <div className="px-3 py-1.5 border-b border-border shrink-0 text-xs">
        <ThisSheetLine
          stampGroups={stampGroups}
          runs={runs}
          className="text-foreground"
        />
        {quantitiesLocked && (
          <p className="text-muted-foreground mt-0.5">
            This bid's quantities are locked, so its plans cannot be marked,
            traced, changed or sent to it. Unlock it on the bid first.
          </p>
        )}
      </div>

      {/*
        LAYERS, pinned with the line above (2026-10-06). It sat at the top of
        the Legend tab, the fourth of five, so a filter that hides marks and
        runs on EVERY tab could only be reached, or seen to be on, from one.
      */}
      {layers}

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
      <div ref={scrollerRef} className="flex-1 overflow-y-auto min-h-0">
        {/*
          THE PHONE'S SHEETS TAB: the left panel's own sheet list, portalled
          here (SidePanel `phone.as === "portal"`). Full height, so the list's
          own scroller is the one scroll area and this one has nothing to do.
        */}
        {tab === "sheets" && (
          <div ref={onSheetsSlot} className="h-full flex flex-col min-h-0" />
        )}
        {/* Stamped assemblies first: an estimator drops dozens per sheet and
            traces a handful of runs, so the thing they are actively adding to
            stays where they can watch it climb. */}
        {tab === "counts" &&
          stampGroups.length === 0 &&
          !(emptiedAt === 0 && emptiedCount) && (
            <div className="p-6 text-center">
              <Zap className="w-7 h-7 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                Nothing counted on this sheet yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1.5">
                Pick something to count from Count in the toolbar, or click a
                symbol on the Legend tab, then click on the drawing.
              </p>
            </div>
          )}
        {tab === "counts" &&
          stampGroups.map((group, cardIndex) => (
            <Fragment key={group.groupId ?? group.assemblyId ?? group.name}>
              {emptiedAt === cardIndex && emptiedCount && (
                <EmptiedCountRow
                  card={emptiedCount}
                  pins={pins}
                  cardUndo={cardUndo}
                  onCardUndo={onCardUndo}
                />
              )}
              <div
                data-count-card={group.groupId ?? undefined}
                className="border-b border-border px-3 py-2 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {/* The swatch IS the legend — see CountSwatch. Opens the
                      look editor where there is one. */}
                  {(() => {
                    const swatch = (
                      <CountSwatch
                        groupId={group.groupId}
                        assemblyId={group.assemblyId}
                        assemblyCategory={
                          group.stamps[0]?.assemblyCategory ?? null
                        }
                        pins={pins}
                      />
                    );
                    return lookEditor && group.groupId !== null
                      ? lookEditor(group.groupId, group.name, swatch)
                      : swatch;
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{group.name}</p>
                    {/*
                      The split in WORDS (pin plan § 7): a pin's fill does not
                      survive a printout, and the number beside this is the
                      NEW marks only — the ones that are priced.
                    */}
                    <p className="text-xs">
                      {statusSplitText(group.split) ?? `${group.placed} placed`}
                    </p>
                    {unpricedStatusNote(group.split) && (
                      <p className="text-[0.7rem] text-amber-600 dark:text-amber-400">
                        {unpricedStatusNote(group.split)}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {group.count}
                  </span>
                  {/* Undo and trash, as on a run card (owner, 2026-09-29). */}
                  {group.groupId !== null && (
                    <CardUndo
                      subject={{ kind: "count", id: group.groupId }}
                      cardUndo={cardUndo}
                      onCardUndo={onCardUndo}
                    />
                  )}
                  {onDeleteCountMarks && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={quantitiesLocked || group.stamps.length === 0}
                      onClick={() =>
                        onDeleteCountMarks(
                          group.stamps.map(s => ({
                            id: s.id,
                            name: group.name,
                          }))
                        )
                      }
                      title={
                        quantitiesLocked
                          ? "This bid's quantities are locked — unlock them on the bid to delete."
                          : `Delete the ${group.placed} ${group.name} ${group.placed === 1 ? "mark" : "marks"} on this sheet — the count stays`
                      }
                      aria-label={`Delete ${group.name} marks on this sheet`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                {/*
              Where this count stands with the bid.

              Three states and three different things worth saying, all of them
              words rather than colour: it is over, it can go over, or there is
              nothing to say here and the row stays quiet.

              A free count (level 1) CAN go over since 2026-09-25 — unpriced,
              with the price typed on the bid line — so it gets the same quiet
              "Send N to bid" link as an assembly count. A link in the list, not
              a badge on the drawing, which is what level 1's promise of a quiet
              count actually forbids.
            */}
                {(() => {
                  const state =
                    group.groupId === null
                      ? undefined
                      : bridge?.get(group.groupId);
                  if (!state) return null;
                  if (state.onBid) {
                    return (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {/*
                      LOCKED IS SAID HERE, not left to the bid screen.

                      This is the screen somebody is standing on while they
                      place marks, and "the line follows these marks" is a
                      promise that is false the moment the bid is frozen. A
                      sentence that quietly restates the old behaviour beside
                      work somebody is doing right now reads as confirmation —
                      they would place fourteen and never wonder why the total
                      did not move. CLAUDE.md § a label describing the OLD
                      meaning.
                    */}
                        {quantitiesLocked
                          ? "On the bid — locked"
                          : "On the bid — the line follows these marks"}
                      </p>
                    );
                  }
                  // No Send on a locked bid: the server refuses it (lockGuard),
                  // and the locked notice below says why.
                  if (quantitiesLocked) return null;
                  const busy = sendingGroupId === group.groupId;
                  const canSend = state.sendable && onSendToBid;
                  /*
                  LINK AN ASSEMBLY, any time (legend plan § 8a). Offered on a
                  count made by name and not yet on the bid — the server
                  refuses one on the bid, whose line was priced there. Not a
                  nag: one quiet word beside Send, never a badge.
                */
                  const canLink =
                    state.byNameOnly && linkAssemblies && onLinkAssembly;
                  if (!canSend && !canLink) return null;
                  return (
                    <div className="mt-1 flex items-center gap-3">
                      {canSend && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onSendToBid(group.groupId as number)}
                          className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground disabled:opacity-60"
                        >
                          {/*
                        The BID's count, not this sheet's. A count marked across
                        five sheets sends all of them, and a control reading "Send 5
                        to bid" beside a panel showing five of fourteen would be
                        telling the truth about the wrong number.
                      */}
                          {busy ? "Sending…" : `Send ${state.bidCount} to bid`}
                        </button>
                      )}
                      {canLink && (
                        <button
                          type="button"
                          onClick={() =>
                            setLinkingGroupId(id =>
                              id === group.groupId ? null : group.groupId
                            )
                          }
                          className="inline-flex items-center gap-1 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                          title="Choose the assembly this count is — every mark is kept"
                        >
                          <Link2 className="w-3 h-3" /> Link assembly…
                        </button>
                      )}
                    </div>
                  );
                })()}
                {linkingGroupId !== null &&
                  linkingGroupId === group.groupId &&
                  linkAssemblies &&
                  onLinkAssembly && (
                    <div className="mt-1.5 rounded border border-border bg-muted/20 p-2 space-y-1.5">
                      <p className="text-xs text-muted-foreground">
                        Which assembly is “{group.name}”? Every mark is kept and
                        counts it from now on.
                      </p>
                      <AssemblySearchList
                        assemblies={linkAssemblies}
                        onPick={assembly => {
                          onLinkAssembly(group.groupId as number, assembly.id);
                          setLinkingGroupId(null);
                        }}
                        onCancel={() => setLinkingGroupId(null)}
                      />
                    </div>
                  )}
                {/* The drop to each of these devices (held-migrations plan § 3):
                set once on the count, shown once set. */}
                {group.groupId !== null &&
                  groupDrops?.get(group.groupId) &&
                  onSetGroupDrop && (
                    <GroupDrop
                      info={groupDrops.get(group.groupId)!}
                      heightTypes={dropHeightTypes}
                      runTypes={dropRunTypes}
                      locked={quantitiesLocked}
                      onSet={patch =>
                        onSetGroupDrop(group.groupId as number, patch)
                      }
                    />
                  )}
                {/* Walk the instances: each chip jumps the viewer to that mark. */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {group.stamps.map((placed, index) => (
                    <button
                      key={placed.id}
                      onClick={() => onJumpTo({ x: placed.x, y: placed.y })}
                      className="px-1.5 py-0.5 rounded text-xs font-mono bg-muted hover:bg-[#F5C518]/20 hover:text-[#F5C518] transition-colors"
                      title="Show this one on the drawing"
                    >
                      {index + 1}
                    </button>
                  ))}
                  {/*
                  The WHOLE count — every mark on every sheet (plan § 1.2
                  c′). Words, not a second bin beside the first: two bins on
                  one card, one for this sheet and one for all of them, is a
                  coin toss. It asks first and names what goes.
                */}
                  {onDeleteCount &&
                    group.groupId !== null &&
                    !quantitiesLocked &&
                    !bridge?.get(group.groupId)?.onBid && (
                      <button
                        type="button"
                        onClick={() => onDeleteCount(group.groupId as number)}
                        className="ml-auto text-xs text-muted-foreground hover:text-destructive underline-offset-2 hover:underline"
                        title="Delete this count and its marks on every sheet — asks first"
                      >
                        Delete count…
                      </button>
                    )}
                </div>
              </div>
            </Fragment>
          ))}
        {tab === "counts" &&
          emptiedAt === stampGroups.length &&
          emptiedCount && (
            <EmptiedCountRow
              card={emptiedCount}
              pins={pins}
              cardUndo={cardUndo}
              onCardUndo={onCardUndo}
            />
          )}

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
        {/*
          A frozen bid, said once, where the summary already lives.

          Drawn whenever the bid is locked rather than only when something is
          counted: somebody tracing a run on a locked bid needs it as much as
          somebody marking one, and this is the panel both of them have open. It
          does NOT go on the drawing — level 1's promise of a quiet count, and
          § 5f, which forbids a badge on the sheet.
        */}
        {tab !== "totals" ? null : summary ? (
          summary
        ) : stampGroups.length > 0 && waitingToSend !== undefined ? (
          <p className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            {waitingToSend > 0
              ? `${waitingToSend} count${waitingToSend === 1 ? " is" : "s are"} not on the bid yet.`
              : countedWithNoPrice
                ? `${countedWithNoPrice} count${countedWithNoPrice === 1 ? "'s" : "s'"} library assembly is gone, so ${countedWithNoPrice === 1 ? "it cannot" : "they cannot"} go on the bid.`
                : "Every count is on the bid."}
          </p>
        ) : null}

        {/*
          TRACED FOOTAGE, AND WHAT IT WOULD PUT ON THE BID.

          Grouped by TYPE rather than by run, because six homeruns of 1/2" EMT
          across four sheets are ONE purchase — § 5f.2 rejects a line per traced
          path by name. Each type shows its rows because a type is not one
          quantity: pipe, wire and ground are three things somebody orders
          separately at three prices.

          ── Refusals are shown, not hidden behind a disabled button ──────────
          A row that cannot cross says why, in words: "this type does not say
          what this is" is something an estimator can act on, and a greyed-out
          control with no explanation is not. Same reasoning as the counted
          groups above, where an unpriced count is said out loud rather than
          quietly dropped from the total.

          ── It never hides footage it cannot send ───────────────────────────
          A half-specified type still shows its feet. The measurement is real
          work somebody did; what is missing is only the name to order it under.
        */}
        {tab === "runs" && runTypeBridge && runTypeBridge.length > 0 && (
          <div className="border-b border-border">
            <div className="px-3 pt-2.5 pb-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
              Traced footage
            </div>
            {runTypeBridge.map(entry => {
              const sendable = [...entry.rows, ...entry.fittings].filter(
                row => row.sendable.ok && !row.onBid
              );
              const onBidCount = [...entry.rows, ...entry.fittings].filter(
                row => row.onBid
              ).length;
              /*
                Lines already on the bid that Send-again would CHANGE — a
                swapped part or a filled-in price. Counted into the button, or
                a style change would leave nothing to press.
              */
              const toUpdate = [...entry.rows, ...entry.fittings].filter(
                row => row.onBid && row.resend !== null
              ).length;
              const busy = sendingRunTypeId === entry.runTypeId;
              return (
                <div key={entry.runTypeId} className="px-3 pb-2.5">
                  {/* The type's swatch, so this block — and the route /
                      quantity split under it — names its lines on sight. */}
                  <p className="flex items-center gap-1.5 text-sm font-medium min-w-0">
                    <RunTypeSwatch
                      runTypeId={entry.runTypeId}
                      pathType={entry.pathType}
                      colors={runColors}
                    />
                    <span className="truncate">{entry.label}</span>
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {entry.rows.map(row => (
                      <div key={`${row.role}:${row.extraKey}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "text-sm truncate",
                              row.materialName === null && "text-warning"
                            )}
                          >
                            {row.materialName ?? "Not said what this is"}
                          </span>
                          <span className="text-sm font-mono tabular-nums shrink-0">
                            {row.feet} ft
                          </span>
                        </div>
                        {/* An extra says how its feet were reached — tape
                            follows the flat length, not the risers — the
                            way every fitting below carries its sentence. */}
                        {/* The short form: the row above already says
                            what and how many (2026-10-08). */}
                        {(row.how ?? row.why) && (
                          <p className="text-xs text-muted-foreground leading-snug">
                            {row.how ?? row.why}
                          </p>
                        )}
                        {row.resend && (
                          <p className="text-xs text-warning leading-snug">
                            {resendSentence(row.resend)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/*
                    THE FITTINGS, each with the sentence that produced it.

                    A bare "9" beside a coupling is the silent number this
                    feature is not allowed to show — the estimator has to be
                    able to check it against the drawing. So the sentence sits
                    under every row, including the ones with nothing to send
                    ("belled end — sticks join without couplings"), because
                    those are the ones a reader would otherwise think were
                    forgotten.

                    "Not priced" rather than a price: a matched row at $0 is
                    one nobody has priced, and a zero here would read as a
                    fitting that costs nothing.
                  */}
                  {/*
                    ROUTE AND QUANTITY, ONE LINE (D21, answer 3). The same pipe
                    to buy, so one bid line — and said how it splits, so a
                    reader checking a quantity trace can find its share. Only
                    when there is one: a type traced only as routes has
                    nothing to split.
                  */}
                  {entry.quantityFeet > 0 &&
                    (() => {
                      // The pipe; on a cable type, the cable — its only row.
                      const pipe =
                        entry.rows.find(r => r.role === "raceway") ??
                        entry.rows[0];
                      const total = pipe?.feet ?? entry.quantityFeet;
                      const route =
                        Math.round((total - entry.quantityFeet) * 100) / 100;
                      // NAMED: under the last wire row, an unnamed split read
                      // as that row's (seen on screen 2026-09-26).
                      const what = pipe?.materialName ?? "Footage";
                      return (
                        <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                          {route > 0
                            ? `${what}: ${feet(route)} from routes + ${feet(entry.quantityFeet)} from quantity traces`
                            : `${what}: all ${feet(entry.quantityFeet)} from quantity traces`}
                        </p>
                      );
                    })()}

                  {entry.fittings.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {/* Bend rows with nothing to say are left out — the same
                          rule Send uses for what it reports (fittingRowSpeaks);
                          an unanswered pull point is flagged on its run. */}
                      {entry.fittings.filter(fittingRowSpeaks).map(fitting => (
                        <div key={fitting.role}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "text-sm truncate",
                                fitting.materialName === null &&
                                  fitting.status === "counted" &&
                                  fitting.qty > 0 &&
                                  "text-warning"
                              )}
                            >
                              {fitting.materialName ??
                                fittingLabel(fitting.role)}
                            </span>
                            <span className="flex items-baseline gap-1.5 shrink-0">
                              {fitting.priced === false && (
                                <span className="text-xs text-warning">
                                  Not priced
                                </span>
                              )}
                              <span className="text-sm font-mono tabular-nums">
                                {fitting.status === "counted"
                                  ? (fitting.atLeast ? "≥ " : "") + fitting.qty
                                  : "—"}
                              </span>
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground/80 leading-snug">
                            {fitting.why}
                          </p>
                          {/*
                            What Send-again will do to the line already on the
                            bid — a swapped part or a filled-in price — said
                            BEFORE the button is pressed, in amber because it
                            changes money on the bid.
                          */}
                          {fitting.resend && (
                            <p className="text-xs text-warning leading-snug">
                              {resendSentence(fitting.resend)}
                            </p>
                          )}
                          {fitting.materialProblem &&
                            fitting.status === "counted" &&
                            fitting.qty > 0 && (
                              <p className="text-xs text-warning leading-snug">
                                {fitting.materialProblem}
                              </p>
                            )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Why a row cannot cross, in words, once per reason. */}
                  {Array.from(
                    new Set(
                      entry.rows
                        .filter(row => !row.onBid && !row.sendable.ok)
                        .map(row =>
                          row.sendable.ok ? "" : row.sendable.message
                        )
                    )
                  ).map(message => (
                    <p
                      key={message}
                      className="mt-1 text-xs text-muted-foreground"
                    >
                      {message}
                    </p>
                  ))}

                  {/*
                    Why a number is smaller than the drawing looks. Each says a
                    different true thing and none of them is the others: work
                    the devices already carry, a question still open, and a
                    sheet with no scale.
                  */}
                  {/*
                    On a conduit type only the WIRE is left out: no device
                    carries pipe, so the pipe stays (runTypeFootageCore.ts).
                    Saying "not in this" of the whole run there would be the
                    old meaning, which dropped the pipe too.
                  */}
                  {entry.branchCount > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.branchCount} run
                      {entry.branchCount === 1 ? " is" : "s are"} branch wiring
                      your devices already include, so{" "}
                      {entry.pathType === "conduit"
                        ? (entry.branchCount === 1 ? "its" : "their") +
                          " wire is not in this. The conduit is."
                        : (entry.branchCount === 1 ? "it is" : "they are") +
                          " not in this."}
                    </p>
                  )}
                  {entry.unansweredCount > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.unansweredCount} run
                      {entry.unansweredCount === 1 ? " has" : "s have"} devices
                      at both ends and{" "}
                      {entry.unansweredCount === 1 ? "is" : "are"} counted here
                      until you say otherwise.
                    </p>
                  )}
                  {entry.unmeasurableCount > 0 && (
                    <p className="mt-1 text-xs text-warning">
                      {entry.unmeasurableCount} run
                      {entry.unmeasurableCount === 1 ? " is" : "s are"} on a
                      sheet with no scale, so not counted at all.
                    </p>
                  )}

                  {/*
                    SAY WHAT IS ON THE BID WHENEVER ANYTHING IS.

                    This read `every` until 2026-09-21, which meant a type whose
                    pipe had crossed and whose wire had no footage said nothing
                    at all: the send link vanished and no confirmation replaced
                    it, so the only way to know it had worked was to go and look
                    at the bid. Found by pressing the button and reading the
                    row, not from the diff.
                  */}
                  {onBidCount > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {onBidCount} on the bid
                      {quantitiesLocked ? (
                        <> — locked</>
                      ) : (
                        <>
                          {" "}
                          — the{" "}
                          {onBidCount === 1
                            ? "line follows"
                            : "lines follow"}{" "}
                          the drawing
                        </>
                      )}
                    </p>
                  )}
                  {(sendable.length > 0 || toUpdate > 0) &&
                  onSendRunType &&
                  !quantitiesLocked ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSendRunType(entry.runTypeId)}
                      className="mt-1 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground disabled:opacity-60"
                    >
                      {busy
                        ? "Sending…"
                        : [
                            sendable.length > 0
                              ? `Send ${sendable.length} line${sendable.length === 1 ? "" : "s"} to bid`
                              : null,
                            toUpdate > 0
                              ? `${sendable.length > 0 ? "update" : "Update"} ${toUpdate} on the bid`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {tab === "totals" && dropsReadout}

        {tab !== "runs" ? null : runs.length === 0 ? (
          <div className="p-6 text-center">
            <Zap className="w-7 h-7 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">
              No runs on this sheet yet
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1.5">
              Trace a conduit or cable run on the drawing. Each one appears here
              as you go, with what it puts on the bid.
            </p>
          </div>
        ) : (
          layoutLegs(runs).map(({ row: run, place }) => {
            const isSelected = run.id === selectedRunId;
            /*
              BRANCH LEGS (D20). A run of several legs gets a header — the
              leg count and the run's total, which is the sum of the legs and
              nothing else (the jump between legs is not pipe) — and its legs
              are indented under it, each saying how it begins. A plain run
              looks exactly as it always has.
            */
            const multi = place.count > 1;
            const header = multi && place.index === 1 && (
              <div
                key={`legs-${place.rootId}`}
                className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-1.5"
              >
                <span className="text-xs text-muted-foreground">
                  {place.count} legs · run total{" "}
                  <span className="font-mono text-foreground">
                    {place.runTotalFeet === null
                      ? "not measurable"
                      : feet(place.runTotalFeet)}
                  </span>
                </span>
                {onAddLeg && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => onAddLeg(run)}
                  >
                    Add leg
                  </Button>
                )}
              </div>
            );
            return (
              <Fragment key={run.id}>
                {header}
                <div
                  data-run-row={run.id}
                  className={cn(
                    "border-b border-border px-3 py-2.5 cursor-pointer transition-colors",
                    multi && "pl-6",
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
                        style={{ color: runAppearance(runColors, run).color }}
                      />
                    ) : (
                      <CableIcon
                        className="w-3.5 h-3.5 mt-0.5 shrink-0"
                        style={{ color: runAppearance(runColors, run).color }}
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
                        A quantity trace's legs have no tees and no circuits
                        of their own (D21), so the route wording — "from a
                        tee", "circuits differ" — would describe things that
                        are not there. Just the leg.
                      */}
                      {multi && run.traceMode === "quantity" && (
                        <p className="text-xs text-muted-foreground truncate">
                          Leg {place.index}
                        </p>
                      )}
                      {multi && run.traceMode !== "quantity" && (
                        <p className="text-xs text-muted-foreground truncate">
                          Leg {place.index}
                          {place.startsAs === "branch"
                            ? // Not "branch": the main's continuation past a
                              // tee starts there too, and nothing stored tells
                              // the two apart. "From a tee" is true of both.
                              " · from a tee"
                            : place.startsAs === "separate"
                              ? " · separate start, not joined"
                              : ""}
                          {place.index > 1 &&
                            (place.sameCircuitsAsFirst ? (
                              " · same circuits as leg 1"
                            ) : (
                              <span className="text-warning">
                                {" "}
                                · circuits differ from leg 1
                              </span>
                            ))}
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
                        const named =
                          run.typeName ?? run.displayName ?? run.name;
                        if (run.spec === named) return null;
                        return (
                          <p
                            className={cn(
                              "text-xs truncate",
                              run.spec
                                ? "text-muted-foreground"
                                : "text-warning"
                            )}
                          >
                            {run.spec ??
                              "No materials on this type — cannot be priced"}
                          </p>
                        );
                      })()}
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {/*
                          Said on the row, once per run, because it changes how
                          every number under it is read: flat, one bucket, no
                          ends. On the first leg only, like the leg header.
                        */}
                        {run.traceMode === "quantity" && place.index === 1 && (
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0 text-muted-foreground"
                            title="Flat footage of this type — no ends, no circuits. Drops are proposed, never assumed."
                          >
                            Quantity
                          </Badge>
                        )}
                        {run.isSuggestion && (
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0 border-[#F5C518]/40 text-[#F5C518]"
                          >
                            <Sparkles className="w-2.5 h-2.5 mr-1" /> Suggested
                          </Badge>
                        )}
                        {run.status === "draft" && !run.isSuggestion && (
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0 text-muted-foreground"
                          >
                            Draft
                          </Badge>
                        )}
                        {/*
                        A proposal waiting on an answer, said on the CLOSED row
                        too: the controls live in the open run, and a question
                        nobody can see from the list is one nobody answers.
                        Dashed like the marker on the drawing.
                      */}
                        {(() => {
                          const waiting =
                            run.bends?.proposals.filter(p => p.answer === null)
                              .length ?? 0;
                          return waiting > 0 ? (
                            <Badge
                              variant="outline"
                              className="text-xs px-1.5 py-0 border-dashed border-[#F5C518]/60 text-[#F5C518]"
                            >
                              {waiting === 1
                                ? "Pull point to review"
                                : `${waiting} pull points to review`}
                            </Badge>
                          ) : null;
                        })()}
                        {/*
                        A plain run, open: the way to give it a branch. A run
                        that already has legs offers this on its header.
                      */}
                        {!multi &&
                          isSelected &&
                          onAddLeg &&
                          !run.isSuggestion && (
                            <button
                              className="text-xs underline text-muted-foreground hover:text-foreground"
                              onClick={e => {
                                e.stopPropagation();
                                onAddLeg(run);
                              }}
                            >
                              Add leg
                            </button>
                          )}
                      </div>
                    </div>
                    {/* One undo arrow per run, on its first row: every
                        leg's steps are the run's (D20). */}
                    {(!multi || place.index === 1) && (
                      <CardUndo
                        subject={{
                          kind: "run",
                          id: run.parentRunId ?? run.id,
                        }}
                        cardUndo={cardUndo}
                        onCardUndo={onCardUndo}
                      />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={e => {
                        e.stopPropagation();
                        onRemoveRun(run.id);
                      }}
                      /*
                      On a run of legs, the FIRST leg's bin deletes the whole
                      run — the root carries it all — and says so. Any other
                      leg's deletes that leg alone.
                    */
                      aria-label={
                        multi
                          ? place.index === 1
                            ? `Delete the whole run, all ${place.count} legs`
                            : `Delete leg ${place.index}`
                          : `Delete ${run.name}`
                      }
                      title={
                        multi
                          ? place.index === 1
                            ? `Delete the whole run — all ${place.count} legs`
                            : `Delete leg ${place.index} only`
                          : undefined
                      }
                      /*
                        A locked bid refuses a run delete (server); the bin
                        says so by being off, rather than offering a click
                        that will only be refused (plan § 1.2 row d).
                      */
                      disabled={quantitiesLocked}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  {/*
                  WHOSE WIRE IS THIS? ASKED, NEVER DECIDED (D18).

                  Devices carry the branch wiring between each other and a
                  traced run is the homerun back to the panel. A run with a
                  panel at one end is settled and is never asked about — a
                  warning that fires on correct work is as bad as silence, and
                  those are most runs. Devices at BOTH ends is genuinely
                  ambiguous, and only a person can close it.

                  It does NOT refuse and it does not exclude anything on its
                  own: the footage counts until somebody says otherwise,
                  because a traced run is measured work somebody drew and
                  dropping it over an open question loses footage silently.

                  Shown only while the question is open. Once answered the row
                  goes quiet — re-asking is how a confirmed answer gets
                  un-confirmed.
                */}
                  {run.wireOwnership === "unanswered" &&
                    onAnswerBranchWiring && (
                      <div className="mt-1.5 rounded border border-border/60 bg-muted/20 px-2 py-1.5">
                        <p className="text-xs text-muted-foreground">
                          Devices at both ends — is this the branch wiring your
                          devices already include?
                        </p>
                        {/* Wraps: side by side they ran 50px past a 280px
                            panel, hiding "No" (measured 2026-09-30). */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={e => {
                              e.stopPropagation();
                              onAnswerBranchWiring(run.id, true);
                            }}
                          >
                            Yes — don't count it twice
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={e => {
                              e.stopPropagation();
                              onAnswerBranchWiring(run.id, false);
                            }}
                          >
                            No — it's a homerun
                          </Button>
                        </div>
                      </div>
                    )}

                  {/*
                  Answered "branch", so the devices own it. Said out loud rather
                  than the row quietly showing less, and reversible in one tap —
                  an answer nobody can change is a trap, not a decision.
                */}
                  {run.branchWiring === true &&
                    run.traceMode !== "quantity" && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {run.pathType === "conduit"
                          ? "Branch wiring — your devices already include this wire, so it is not counted again. The conduit still is."
                          : "Branch wiring — your devices already include this cable, so it is not counted again."}{" "}
                        {onAnswerBranchWiring && (
                          <button
                            className="underline hover:text-foreground"
                            onClick={e => {
                              e.stopPropagation();
                              onAnswerBranchWiring(run.id, null);
                            }}
                          >
                            Change
                          </button>
                        )}
                      </p>
                    )}

                  {/* A run that cannot be measured says so instead of showing 0 */}
                  {run.quantities === null ? (
                    <>
                      <p className="text-xs text-warning bg-warning/10 rounded px-2 py-1 mt-1.5 flex items-start gap-1.5">
                        <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                        {onSetTypedLength
                          ? "No scale on this sheet, so this run is not in the totals. Type its length to count it."
                          : "Flat length not measurable — no scale on this sheet, so this run is not in the totals."}
                      </p>
                      {onSetTypedLength && (
                        <TypedLength run={run} onSet={onSetTypedLength} />
                      )}
                    </>
                  ) : (
                    <div className="mt-1.5 space-y-0.5">
                      {/* Conduit and wire kept visually separate: they are two
                      different purchases measured along one line. */}
                      {run.quantities.conduitBoughtFeet !== null && (
                        <Footage
                          label="Conduit"
                          flat={run.quantities.runFeet}
                          vertical={run.quantities.verticalFeet}
                          extra={run.quantities.conduitExtraFeet}
                          total={run.quantities.conduitBoughtFeet}
                          typed={run.quantities.lengthSource === "typed"}
                        />
                      )}
                      {run.quantities.cableBoughtFeet !== null && (
                        <Footage
                          label="Cable"
                          flat={run.quantities.runFeet}
                          vertical={run.quantities.verticalFeet}
                          extra={run.quantities.wireExtraFeet}
                          makeup={run.quantities.makeupFeet}
                          total={run.quantities.cableBoughtFeet}
                          typed={run.quantities.lengthSource === "typed"}
                        />
                      )}
                      {/* An extra nobody set whispers (§ 2.3), so the row
                          says it — the totals count these as well. */}
                      {carriesNoExtra(run.quantities) && (
                        <p className="text-xs text-muted-foreground">
                          No extra set — Settings › Heights & extra, or this
                          run's own below.
                        </p>
                      )}
                      {/*
                      WIRE, OR THE REASON THERE IS NONE.

                      A newly traced run has no circuits — the type's
                      conductor count is a default the editor offers, not
                      something copied onto the run at save
                      (server/runToBidWire.test.ts asserts exactly this). So
                      the common state of a fresh conduit run is zero wire,
                      and it used to render as `Wire (0 circuits) 0.00 ft`:
                      a measurement-shaped zero for something nobody measured,
                      standing in a column of real footages. CLAUDE.md
                      § "UNSET is not zero" — a length is the case where a
                      zero reads as a considered answer.

                      An EMPTY PIPE IS A REAL ANSWER, though, so this is a
                      statement and an offer rather than a warning: a sleeve, a
                      spare, a future pull. Amber here would fire on correct
                      work, which the branch-wiring guard above refuses to do
                      for the same reason.
                    */}
                      {/*
                        A QUANTITY trace's wire is its TYPE's (D21): one
                        circuit of the type's conductors, read live, with no
                        circuit rows to add or edit. So no "Add wires" — the
                        way to change it is the type — and a type that says
                        no wire says so rather than showing a zero.
                      */}
                      {run.pathType === "conduit" &&
                        run.traceMode === "quantity" &&
                        (run.quantities.wireBoughtFeet > 0 ? (
                          <Footage
                            label={
                              <>
                                Wire
                                <span className="text-muted-foreground/60">
                                  {" "}
                                  (from the type)
                                </span>
                              </>
                            }
                            flat={wireFlat(run)}
                            vertical={wireVertical(run)}
                            extra={run.quantities.wireExtraFeet}
                            makeup={run.quantities.makeupFeet}
                            total={run.quantities.wireBoughtFeet}
                            typed={run.quantities.lengthSource === "typed"}
                          />
                        ) : (
                          <div
                            className={cn(
                              "flex items-baseline justify-between text-xs gap-2",
                              run.noWire && "flex-wrap justify-start gap-y-1"
                            )}
                          >
                            {/* Amber for the same reason as the route row
                                below. No "use the type's wire" — the type has
                                none to offer — so the answers are the two
                                that fit: pick the wire, or say it is an empty
                                pipe (2026-10-08; it used to offer nothing). */}
                            <span
                              className={cn(
                                "shrink-0",
                                run.noWire
                                  ? "text-warning flex items-center gap-1 basis-full"
                                  : "text-muted-foreground"
                              )}
                            >
                              {run.noWire && (
                                <TriangleAlert className="w-3 h-3" />
                              )}
                              {run.noWire
                                ? "Pick the wire for this run"
                                : "Wires in this pipe"}
                            </span>
                            {run.noWire ? (
                              <span className="flex items-baseline gap-2">
                                <NoWireAnswers
                                  onPickWire={() => onPickWire(run.id)}
                                  onEmptyPipe={() => onEmptyPipe(run.id)}
                                />
                              </span>
                            ) : (
                              <span className="font-mono text-muted-foreground/70">
                                {run.typeDefaults?.conductorCount === 0
                                  ? "empty pipe"
                                  : "the type says no wire"}
                              </span>
                            )}
                          </div>
                        ))}
                      {run.pathType === "conduit" &&
                        run.traceMode !== "quantity" &&
                        (run.circuits.length === 0 ? (
                          <div
                            className={cn(
                              "flex items-baseline justify-between text-xs gap-2",
                              // The warning takes its own line and the two
                              // fixes sit under it: side by side in a 400px
                              // panel the one-tap wrapped in two (seen on
                              // screen, 2026-09-29).
                              run.noWire && "flex-wrap justify-start gap-y-1"
                            )}
                          >
                            {/*
                              AMBER when the bid would price this run's wire
                              and there is none (shared/runNoWire.ts). It used
                              to be a grey "none", which read as a quiet fact
                              rather than as pipe going on the bid empty. Grey
                              stays for a run whose wire is left out on
                              purpose (branch wiring, no type).
                            */}
                            <span
                              className={cn(
                                "shrink-0",
                                run.noWire
                                  ? "text-warning flex items-center gap-1 basis-full"
                                  : "text-muted-foreground"
                              )}
                            >
                              {run.noWire ? (
                                <>
                                  <TriangleAlert className="w-3 h-3" />
                                  {typeCarriesWire(run.typeDefaults ?? null)
                                    ? "No wire on the bid for this pipe"
                                    : "Pick the wire for this run"}
                                </>
                              ) : (
                                "Wires in this pipe"
                              )}
                            </span>
                            <span className="flex items-baseline gap-2">
                              {!run.noWire && (
                                <span className="font-mono text-muted-foreground/70">
                                  {run.typeDefaults?.conductorCount === 0
                                    ? "empty pipe"
                                    : "none"}
                                </span>
                              )}
                              {/*
                                The one-tap fix (owner, 2026-09-29): the type's
                                own wire as one circuit. Offered, never done by
                                itself — no silent default — and only when the
                                type says what wire it carries.
                              */}
                              {run.noWire &&
                                typeCarriesWire(run.typeDefaults ?? null) && (
                                  <button
                                    className="underline text-warning hover:text-foreground"
                                    onClick={e => {
                                      e.stopPropagation();
                                      addOneCircuit(
                                        run,
                                        nextCircuitName(run.circuits)
                                      );
                                    }}
                                  >
                                    Use the run type's wire
                                  </button>
                                )}
                              {/*
                                A type that does not say its wire (an
                                underground trench, by design) has nothing for
                                "Add wires" to price: the circuit it added
                                carried no material and stopped at "cannot go
                                on the bid". So that type is answered by
                                picking the wire instead (2026-10-08).
                              */}
                              {run.noWire &&
                              !typeCarriesWire(run.typeDefaults ?? null) ? (
                                <NoWireAnswers
                                  onPickWire={() => onPickWire(run.id)}
                                  onEmptyPipe={() => onEmptyPipe(run.id)}
                                />
                              ) : (
                                <>
                                  <button
                                    className="underline text-muted-foreground hover:text-foreground"
                                    onClick={e => {
                                      e.stopPropagation();
                                      // Opens the run, because the circuit rows
                                      // this is about only exist on an open one.
                                      onSelectRun(run.id);
                                      setAddingTo(run.id);
                                      setCircuitName(
                                        nextCircuitName(run.circuits)
                                      );
                                    }}
                                  >
                                    Add wires
                                  </button>
                                  {run.noWire && (
                                    <EmptyPipeButton
                                      onEmptyPipe={() => onEmptyPipe(run.id)}
                                    />
                                  )}
                                </>
                              )}
                            </span>
                          </div>
                        ) : (
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
                            extra={run.quantities.wireExtraFeet}
                            makeup={run.quantities.makeupFeet}
                            total={run.quantities.wireBoughtFeet}
                            typed={run.quantities.lengthSource === "typed"}
                          />
                        ))}
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
                        The run's own length and extras come AFTER every
                        footage line, never between them: placed after the
                        conduit line they split the arithmetic in two, and the
                        wire line read as belonging to the editor (seen on
                        screen, 2026-09-29).

                        A typed run always says so; the offer to type one over
                        a good measurement waits until the run is opened.
                      */}
                      {onSetTypedLength &&
                        (isSelected || run.typedLengthInches != null) && (
                          <TypedLength run={run} onSet={onSetTypedLength} />
                        )}
                      {onSetRunExtras && isSelected && run.extras && (
                        <RunExtrasEditor
                          run={{ ...run, extras: run.extras }}
                          customHeightTypes={customHeightTypes}
                          onSet={onSetRunExtras}
                        />
                      )}

                      {/*
                        A possible double-click stub that bought an elbow
                        (owner, 2026-09-29): LISTED for the estimator to
                        check, never changed — the points are theirs. Amber,
                        because if it is a stub the elbow on the bid is one
                        nobody drew. shared/runBends.ts `stubsToReview`.
                      */}
                      {(run.stubsToReview ?? []).map(stub => (
                        <div
                          key={`${stub.end}-${stub.vertex}`}
                          className="flex items-start gap-1.5 text-xs text-warning"
                        >
                          <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                          <span className="flex-1">
                            Check this elbow: the run&apos;s {stub.end} is a
                            very short segment that turns{" "}
                            {Math.round(stub.degrees)}°. It may be a slipped
                            double-click rather than a corner.
                          </span>
                          <button
                            className="underline shrink-0 hover:text-foreground"
                            onClick={e => {
                              e.stopPropagation();
                              onJumpTo(stub.point);
                            }}
                          >
                            Show
                          </button>
                        </div>
                      ))}
                      {/*
                      An incomplete total has to shout, and a HALF total is
                      incomplete. An unset height makes a run quietly low and
                      nothing on screen says so — the same argument § 2.3 makes
                      about an unset allowance — and being wrong by half is
                      less visible than being wrong by all of it, not more
                      acceptable.

                      Driven by which ENDS counted rather than by whether the
                      figure is zero. The old condition asked `verticalFeet ===
                      0`, so a run with one end counted and one refused sailed
                      past it showing half a drop.

                      And it says this on the ROW, at the level the number is
                      read. The per-end reason exists in the ENDS block of an
                      opened run, in grey — which is a reason nobody reads,
                      because it needs you to already suspect the run you are
                      about to open.
                    */}
                      {verticalsNotice(run.quantities?.verticals) && (
                        <div className="flex items-baseline text-xs gap-2">
                          <span className="text-muted-foreground shrink-0">
                            Verticals
                          </span>
                          {/*
                          LEFT, where every other value in this panel is right.

                          The rows above it hold numbers, and a number is read
                          from its last digit, so they are right-aligned to a
                          common edge. This is a SENTENCE. Right-aligning it
                          wrapped "…at the / start" with the location orphaned
                          on a line of its own — and the location is the half
                          that says where to go. Seen on screen, 2026-09-20;
                          the markup was copied from the row above it, which is
                          the "copying a layout does not copy the behaviour"
                          trap in CLAUDE.md arriving as typography.
                        */}
                          <span className="text-xs text-warning text-left">
                            {verticalsNotice(run.quantities?.verticals)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {run.scaleChangedSinceTraced && (
                    <p className="text-xs text-warning mt-1">
                      The sheet's scale changed since this was traced — check
                      the length.
                    </p>
                  )}

                  {/*
                  What is at each end, and the verticals they produce. Shown
                  only on the open run: nine controls on every row is a panel
                  people stop reading.
                */}
                  {/*
                    HIDE OTHER RUNS (T14). On the open run, because the
                    switch is about it; it stays on as you pick another run,
                    and the drawing shows everything again the moment nothing
                    is selected. Only offered when there IS another run.
                  */}
                  {isSelected &&
                    runs.some(
                      other =>
                        (other.parentRunId ?? other.id) !==
                        (run.parentRunId ?? run.id)
                    ) && (
                      <button
                        type="button"
                        className="mt-1.5 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                        aria-pressed={hideOtherRuns}
                        onClick={e => {
                          e.stopPropagation();
                          onToggleHideOtherRuns();
                        }}
                      >
                        {hideOtherRuns
                          ? "Show all runs on the drawing"
                          : "Hide other runs on the drawing"}
                      </button>
                    )}

                  {isSelected && renderRunType && !run.isSuggestion && (
                    <div
                      className="mt-2 pt-2 border-t border-border/60"
                      onClick={e => e.stopPropagation()}
                    >
                      {renderRunType(run)}
                    </div>
                  )}

                  {/*
                    ROUTE OR QUANTITY, and the way across (D21, answer 5).
                    Both directions, nothing deleted — so the sentence says
                    what the other side will do rather than warning about a
                    loss that does not happen.
                  */}
                  {isSelected && onSetTraceMode && !run.isSuggestion && (
                    <p
                      className="mt-2 text-xs text-muted-foreground"
                      onClick={e => e.stopPropagation()}
                    >
                      {run.traceMode === "quantity"
                        ? "Quantity trace — flat footage of this type, no ends or circuits. "
                        : "Route — ends, drops and circuits. "}
                      <button
                        type="button"
                        className="underline hover:text-foreground"
                        onClick={() =>
                          onSetTraceMode(
                            run.id,
                            run.traceMode === "quantity" ? "route" : "quantity"
                          )
                        }
                        title={
                          run.traceMode === "quantity"
                            ? "Its ends become questions again, and each leg gets the type's wires as a circuit. Nothing is deleted."
                            : "Its ends, circuits and answers are kept and set aside, and come back if you switch again."
                        }
                      >
                        {run.traceMode === "quantity"
                          ? "Make it a route"
                          : "Count as quantity"}
                      </button>
                    </p>
                  )}

                  {isSelected && renderRunEnds && !run.isSuggestion && (
                    <div onClick={e => e.stopPropagation()}>
                      {renderRunEnds(run)}
                    </div>
                  )}

                  {/* Bends and pull points, after the ends that produce the
                    drops they count. */}
                  {isSelected &&
                    run.bends &&
                    !run.isSuggestion &&
                    onAnswerPullPoint &&
                    onUndoPullPoint && (
                      <div onClick={e => e.stopPropagation()}>
                        <RunPullPoints
                          run={run}
                          bends={run.bends}
                          onAnswer={onAnswerPullPoint}
                          onUndo={onUndoPullPoint}
                          busy={pullPointBusy}
                        />
                      </div>
                    )}

                  {/* Circuits, only for conduit and only when this run is open.
                    Not on a quantity trace, whose wire is its type's (D21). */}
                  {isSelected &&
                    run.pathType === "conduit" &&
                    run.traceMode !== "quantity" && (
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
                            <span className="text-xs text-muted-foreground">
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
                                onUpdateCircuit(circuit.id, {
                                  groundCount: next,
                                })
                              }
                              rules={{ min: 0, max: 10 }}
                              className="h-6 w-10 text-xs"
                              ariaLabel={`Grounds for ${circuit.name}`}
                            />
                            {/*
                          SHARED OR ITS OWN — a toggle, not a checkbox buried
                          in a dialog, because it moves a wire quantity.

                          Sharing is the default and is what almost every
                          circuit does, so the shared state is quiet. "Own" is
                          the exception and says so, in the accent colour, at
                          the point where the run's ground line will change.
                        */}
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateCircuit(circuit.id, {
                                  separateGround: !circuit.separateGround,
                                })
                              }
                              className={cn(
                                "text-xs rounded px-1 py-0.5 border transition-colors",
                                circuit.separateGround
                                  ? "border-[#F5C518]/60 text-[#F5C518]"
                                  : // Dotted underline at rest, because at this size a
                                    // bare word beside "cond." reads as a label
                                    // and nobody would find the isolated-ground
                                    // option. It changes a wire quantity, so it
                                    // has to look like something you can press.
                                    "border-transparent text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:text-foreground hover:border-border"
                              )}
                              title={
                                circuit.separateGround
                                  ? "This circuit pulls its own ground. Click to share the run's."
                                  : "This circuit shares the run's ground. Click to give it its own."
                              }
                              aria-pressed={circuit.separateGround}
                              aria-label={`Ground for ${circuit.name}: ${
                                circuit.separateGround ? "its own" : "shared"
                              }`}
                            >
                              {circuit.separateGround ? "own gnd." : "gnd."}
                            </button>
                            <span className="text-xs font-mono text-muted-foreground w-16 text-right">
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
                                  addOneCircuit(run, circuitName.trim());
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
                                addOneCircuit(run, circuitName.trim());
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        ) : run.pickWireToAdd ? (
                          /*
                            The same answer as the run's no-wire line: a type
                            that names no wire on purpose (a trench, an empty
                            pipe) has nothing for a circuit to price, and the
                            server refuses one (takeoffRuns.addCircuit). So
                            the wire is picked instead — or the pipe is said
                            to be empty.
                          */
                          <div className="text-xs space-y-0.5 [&_button]:whitespace-nowrap">
                            <p className="text-muted-foreground">
                              {run.typeDefaults?.conductorCount === 0
                                ? "Empty pipe."
                                : "This run's type names no wire."}
                            </p>
                            <div className="flex flex-wrap gap-x-3">
                              {run.typeDefaults?.conductorCount === 0 ? (
                                <button
                                  className="underline text-muted-foreground hover:text-foreground"
                                  onClick={() => onPickWire(run.id)}
                                >
                                  Pick the wire
                                </button>
                              ) : (
                                <NoWireAnswers
                                  onPickWire={() => onPickWire(run.id)}
                                  onEmptyPipe={() => onEmptyPipe(run.id)}
                                />
                              )}
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 text-xs text-muted-foreground"
                            onClick={() => {
                              setAddingTo(run.id);
                              setCircuitName(nextCircuitName(run.circuits));
                            }}
                          >
                            <Plus className="w-3 h-3" />{" "}
                            {run.circuits.length === 0
                              ? "Add wires to this run"
                              : "Add another circuit"}
                          </Button>
                        )}

                        {/*
                      WHAT THE GROUND ACTUALLY COMES TO, said out loud.

                      The sharing rule is invisible from the circuit rows: two
                      circuits each showing a ground come to ONE ground in the
                      pipe, and an estimator reading two rows would reasonably
                      expect two. So the run states its own answer, with the
                      footage beside it, at the point where changing a toggle
                      changes it.

                      Derived from `run.quantities`, which is the same figure
                      the bid takes — not recomputed here, so the line and the
                      bid cannot disagree.
                    */}
                        {run.circuits.length > 0 && run.quantities && (
                          <div className="flex items-baseline justify-between text-xs gap-2 pt-0.5">
                            <span className="text-muted-foreground/70">
                              {groundSentence(
                                run.quantities.grounds,
                                run.circuits.filter(c => !c.separateGround)
                                  .length
                              )}
                            </span>
                            <span className="font-mono text-muted-foreground/70 shrink-0">
                              {feet(run.quantities.groundBoughtFeet)}
                            </span>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground/70">
                          {/*
                        BOTH RULES, because they are now different and the
                        line above states the one that surprises people.

                        This used to say only that each circuit pulls its own
                        wire, which was the whole story while every circuit
                        also pulled its own ground. Standing on its own under
                        "1 ground shared by 2 circuits" it reads as a
                        contradiction — so it says which is which.
                      */}
                          {run.circuits.length === 0
                            ? "No wires in this pipe yet — an empty conduit counts pipe and no wire."
                            : "Each circuit pulls its own wire down this one conduit. They share one ground, sized to the largest — unless you give one its own."}
                        </p>
                      </div>
                    )}

                  {isSelected &&
                    (run.status === "draft" || run.isSuggestion) && (
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
              </Fragment>
            );
          })
        )}

        {tab === "legend" && legend}
        {tab === "reader" && reader}

        {/*
        Bid totals. Conduit, cable and wire never merge into one number.

        **This said "pinned below the scroller and NEVER inside it" until
        2026-09-30**, because a total you have to go looking for gets read off
        stale. The tabs (references/track-b-phone-and-readability-plan.md § 1)
        move it into the Totals tab, and keep the reason with two guards
        instead: the tab carries a warning mark whenever anything is not on
        the bid, and the pinned "This sheet" line above every tab is the
        figure that moves while you work.
      */}
        {tab === "totals" && totals && (
          <div className="border-t border-border px-3 py-2.5 space-y-1">
            <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-1">
              This bid, all sheets
            </div>
            {/* Bought, with every term that went into it — the flat share is
              the remainder, so the four always add up on screen. */}
            <Footage
              label="Conduit"
              flat={round2(
                totals.conduitBoughtFeet -
                  totals.conduitVerticalFeet -
                  totals.conduitExtraFeet
              )}
              vertical={totals.conduitVerticalFeet}
              extra={totals.conduitExtraFeet}
              total={totals.conduitBoughtFeet}
            />
            <Footage
              label="Cable"
              flat={round2(
                totals.cableBoughtFeet -
                  totals.cableVerticalFeet -
                  totals.cableExtraFeet -
                  totals.cableMakeupFeet
              )}
              vertical={totals.cableVerticalFeet}
              extra={totals.cableExtraFeet}
              makeup={totals.cableMakeupFeet}
              total={totals.cableBoughtFeet}
            />
            <Footage
              label="Wire"
              flat={round2(
                totals.wireBoughtFeet -
                  totals.wireVerticalFeet -
                  totals.wireExtraFeet -
                  totals.wireMakeupFeet
              )}
              vertical={totals.wireVerticalFeet}
              extra={totals.wireExtraFeet}
              makeup={totals.wireMakeupFeet}
              total={totals.wireBoughtFeet}
            />
            {/* Drops from marks (§ 3): what they add, and what is not counted
              for them — fittings (Q8), a count with no run type or height,
              and marks near an unlinked run end that may count twice. */}
            {totals.markDropCount > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                Includes {totals.markDropCount} drop
                {totals.markDropCount === 1 ? "" : "s"} to counted devices (
                {totals.markDropFeet.toFixed(2)} ft). Connectors and elbows for
                them are not counted.
              </p>
            )}
            {/* Homeruns (homerun plan § 10): in the figures above, as the
              bid line has them. Their bends ARE counted since 2026-10-07
              (owner): one at each counted drop, plus the bid's extra bends
              per homerun for corners — this said "elbows are not" before. */}
            {totals.homerunCount > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                Includes {totals.homerunCount} homerun
                {totals.homerunCount === 1 ? "" : "s"} (
                {totals.homerunFeet.toFixed(2)} ft of run and drops, before
                routing, waste and makeup). Their couplings, connectors, straps
                and bends are counted: a bend at each drop, plus the bid's extra
                bends per homerun for corners.
              </p>
            )}
            {/*
              NO DROP MATERIAL, counted as NOT PRICED (owner, 2026-10-07):
              how many drops, and why, beside the totals they are missing
              from — a sentence about items alone hid the size of it.
            */}
            {(totals.markDropNotes?.notPricedDrops ?? 0) > 0 && (
              <p className="mt-1 text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1.5">
                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                {totals.markDropNotes?.notPricedDrops} drop
                {totals.markDropNotes?.notPricedDrops === 1 ? "" : "s"} not
                priced — drop material not set on{" "}
                {totals.markDropNotes?.noTypeGroups} counted item
                {totals.markDropNotes?.noTypeGroups === 1 ? "" : "s"}. Not in
                these totals.
              </p>
            )}
            {(totals.markDropNotes?.noHeightGroups ?? 0) > 0 && (
              <p className="mt-1 text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1.5">
                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                {totals.markDropNotes?.noHeightGroups} counted item
                {totals.markDropNotes?.noHeightGroups === 1
                  ? " asks"
                  : "s ask"}{" "}
                for a drop that is not counted — see the item for why.
              </p>
            )}
            {(totals.markDropNotes?.mayDoubleCount ?? 0) > 0 && (
              <p className="mt-1 text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1.5">
                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                {totals.markDropNotes?.mayDoubleCount} marked device
                {totals.markDropNotes?.mayDoubleCount === 1 ? "" : "s"} near a
                run's end may have its drop counted twice.
              </p>
            )}
            {totals.conduitExtraFeet +
              totals.cableExtraFeet +
              totals.wireExtraFeet >
              0 && (
              <p className="text-xs text-muted-foreground pt-1">
                Extra is bought, not installed — labor is on the installed feet.
              </p>
            )}
            {totals.noExtraCount > 0 && (
              <p className="mt-1 text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1.5">
                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                {totals.noExtraCount} run
                {totals.noExtraCount === 1 ? " carries" : "s carry"} no extra —
                none is set. Set it in Settings › Heights & extra.
              </p>
            )}

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
              <p className="mt-1 text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1.5">
                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                {totals.conduitVerticalFeet === 0 &&
                totals.cableVerticalFeet === 0 &&
                totals.wireVerticalFeet === 0
                  ? `No vertical footage is in these numbers. ${totals.flatOnlyCount} run${totals.flatOnlyCount === 1 ? " is" : "s are"} counted flat only.`
                  : `${totals.flatOnlyCount} run${totals.flatOnlyCount === 1 ? " is" : "s are"} counted flat only — no drop or rise on ${totals.flatOnlyCount === 1 ? "it" : "them"}.`}
              </p>
            )}
            {/*
            QUANTITY TRACES (D21) — flat by choice, so not in the line above,
            and said here in its own words: none of their drops are in these
            numbers until approved. Only while ends are waiting; once every
            end is answered there is nothing left out to say.
          */}
            {(totals.quantity?.openEnds ?? 0) > 0 && (
              <p className="mt-1 text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1.5">
                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                {`Quantity traces are flat footage only — no drops are in these numbers for ${totals.quantity!.openEnds} leg end${totals.quantity!.openEnds === 1 ? "" : "s"}. Open a quantity trace to add them.`}
              </p>
            )}
            {/*
            THE HALF-COUNTED RUN, WHICH IS THE WORSE OF THE TWO.

            The line above says a number is missing its drops entirely. This
            one says the number you are reading INCLUDES some drops and is
            still short — and it is more alarming precisely because it looks
            finished. A total with no verticals at all is visibly unstarted; a
            total with half of them is a plausible figure that loses a job.

            Its own sentence rather than a widened count, because the two
            situations need opposite actions and a single number covering both
            could not say which one to take.
          */}
            {/*
            A BUTTON since 2026-09-29 (owner): the sentence said what was
            wrong and left the estimator to go and find the run. It opens the
            first such run's Run ends section; the number stays, because it is
            what says how much is missing.
          */}
            {totals.partialVerticalCount > 0 &&
              (onOpenPartialEnds ? (
                <button
                  type="button"
                  onClick={onOpenPartialEnds}
                  className="mt-1 w-full text-left text-xs text-warning flex items-start gap-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 hover:bg-warning/20"
                >
                  <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium underline underline-offset-2">
                      Set ends
                    </span>
                    {` — ${totals.partialVerticalCount} run${totals.partialVerticalCount === 1 ? " has" : "s have"} only one end counted, so ${totals.partialVerticalCount === 1 ? "its" : "their"} drops are short.`}
                  </span>
                </button>
              ) : (
                <p className="mt-1 text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1.5">
                  <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                  {`${totals.partialVerticalCount} run${totals.partialVerticalCount === 1 ? " has" : "s have"} only one end counted — ${totals.partialVerticalCount === 1 ? "its" : "their"} drops are short by whatever is missing.`}
                </p>
              ))}
            {totals.unmeasurableCount > 0 && (
              <p className="mt-1 text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1.5">
                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                {totals.unmeasurableCount} run
                {totals.unmeasurableCount === 1 ? " is" : "s are"} not in these
                totals — no usable scale on the sheet. Type{" "}
                {totals.unmeasurableCount === 1
                  ? "its length"
                  : "their lengths"}{" "}
                in the run to count{" "}
                {totals.unmeasurableCount === 1 ? "it" : "them"}.
              </p>
            )}
            {/*
            Typed lengths ARE in the figures above (§ 4c), and this says so:
            a number an estimator supplied and one the app measured are
            different kinds of fact. Plain, not amber — typing is an answer.
          */}
            {totals.typedCount > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                {totals.typedCount} run
                {totals.typedCount === 1
                  ? " has a length"
                  : "s have lengths"}{" "}
                typed by hand rather than measured off the drawing.
              </p>
            )}
            {/*
            WHAT THE BID PRICES, AND WHAT IT DOES NOT (owner, 2026-09-27).

            These figures used to be finished runs only while the bid priced
            drafts too, so the two disagreed and the caption was the only
            thing saying so. Now both come from shared/runOnBid.ts. What is
            left out is said here with its FEET where it has any: "2 runs
            have no type" sends somebody hunting; the footage tells them
            whether it matters. Amber for no type, because it is footage
            missing from a bid; plain for branch wiring, because that one is
            the estimator's own answer working as intended.
          */}
            {(totals.leftOut?.noType.count ?? 0) > 0 && (
              <p className="mt-1 text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1.5">
                <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
                {noTypeSentence(totals.leftOut!.noType)}
              </p>
            )}
            {(totals.leftOut?.branch.count ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                {totals.leftOut!.branch.count} run
                {totals.leftOut!.branch.count === 1 ? " is" : "s are"} branch
                wiring — the devices already include that wire, so it is not
                counted here. Conduit still is.
              </p>
            )}
            <p className="text-xs text-muted-foreground/70 pt-1">
              What the bid prices, all sheets.
              {(totals.leftOut?.draftCount ?? 0) > 0 &&
                ` Includes ${totals.leftOut!.draftCount} run${totals.leftOut!.draftCount === 1 ? "" : "s"} not finished yet.`}{" "}
              Suggestions are not counted.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
