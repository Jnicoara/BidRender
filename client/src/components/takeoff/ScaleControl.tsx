/**
 * ScaleControl — what this sheet is drawn at, and how to change it.
 *
 * ── Always visible, always editable ──────────────────────────────────────────
 * The scale sits in the viewer's toolbar rather than behind a settings menu,
 * for two reasons the brief is explicit about: a detected scale must never be
 * applied where the user cannot see it, and setting one by hand is not a
 * fallback for when detection fails — it is the primary path, permanently
 * available whether or not anything was detected.
 *
 * ── Three states, each saying something different ────────────────────────────
 *   set + detected — "1/4" = 1'-0"" with a Detected badge. Read off the sheet
 *                    with high confidence, and labelled so nobody mistakes it
 *                    for something they chose.
 *   set + manual   — the same, with no badge. The user's own answer.
 *   not set        — plain grey, saying "Set scale" and nothing more. It is
 *                    only a problem on a sheet somebody wants to measure, and
 *                    on a specifications or legend sheet there is nothing to
 *                    measure at all. A warning shown where there is no
 *                    problem is a warning people learn to scroll past.
 *
 * The amber and the triangle come back the moment a measuring tool is
 * reached for — `wanted` — because that is the moment the missing scale is
 * actually in the way. See TakeoffPage: hovering, focusing or clicking a
 * gated trace button raises it, as does starting a two-point measure.
 *
 * When detection found something it was not sure enough to apply, that reading
 * is offered as a one-click suggestion. Faster than typing, and it cannot be
 * mistaken for a fact the app established.
 *
 * Follows CLAUDE.md § Editing fields for the custom entry: select-on-focus,
 * commit on Enter and blur, Escape reverts, and a green flash only on a real
 * write.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { Check, Ruler, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  COMMON_SCALES,
  describeScale,
  parseScaleText,
} from "@shared/planScale";
import { compareToStandardScales } from "@shared/planCalibration";

const FLASH_MS = 1100;

export type ScaleSheet = {
  id: number;
  name: string;
  scaleRatio: number | null;
  scaleText: string | null;
  scaleSource: "detected" | "manual" | "none";
  detectedScaleText: string | null;
  /** NULL until somebody confirms the scale against a second distance. */
  scaleCheckedAt?: Date | string | null;
};

export function ScaleControl({
  sheet,
  onSet,
  onClear,
  onMeasure,
  onCheck,
  notToScale,
  wanted,
}: {
  sheet: ScaleSheet;
  onSet: (scaleText: string) => Promise<unknown>;
  onClear: () => void;
  /**
   * Start setting the scale by MEASURING a known dimension.
   *
   * ── One control, two ways in ─────────────────────────────────────────────
   * "Calibrate" used to be its own button in the toolbar, beside this one, for
   * the same job — two controls with different names and different icons,
   * neither of which said it was an alternative to the other. They are one
   * question with two answers: what is this sheet drawn at, and do you want to
   * type it or measure it.
   */
  onMeasure: () => void;
  /** Check the scale already set, against a second known dimension. */
  onCheck: () => void;
  /** The sheet states NOT TO SCALE — worth saying rather than nagging. */
  notToScale?: boolean;
  /**
   * A measuring tool is being reached for, so a missing scale is in the way
   * RIGHT NOW. Only then does this go amber and grow a warning triangle.
   */
  wanted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const isSet = sheet.scaleRatio !== null;

  /*
    The scale in plain words, from the RATIO rather than the stored text.

    Calibration stores `1:64.015002`, because that number is what is true and
    rounding it would throw away the accuracy just bought. It is also
    unreadable: it sat in this toolbar on a real job and nobody could tell at a
    glance that the sheet was at 3/16". `describeScale` changes the label and
    never the ratio — see its own note for where it refuses to name a scale.
  */
  const label = isSet ? describeScale(Number(sheet.scaleRatio)) : null;

  /**
   * Off-standard, said where it STAYS said.
   *
   * This warning already existed inside the calibrate panel, where it appears
   * for the few seconds before Apply is pressed and then is gone for ever. A
   * scale is wrong for the whole life of the sheet, so the warning belongs
   * where the scale is — here.
   *
   * It is a prompt to look, never a verdict: a printed set genuinely is off
   * standard sometimes, and the calibrated ratio is then the truth about the
   * paper. See compareToStandardScales.
   */
  const standard =
    sheet.scaleRatio === null
      ? null
      : compareToStandardScales(Number(sheet.scaleRatio), COMMON_SCALES);
  const offStandard = standard?.worthMentioning === true;

  /**
   * A scale nobody has checked, which is a different worry from an odd one.
   *
   * ── Why a TYPED scale needs this as much as a measured one ───────────────
   * Picking `1/8" = 1'-0"` from the list is only true if the PDF is at its
   * true print size. A half-size set reads half length with nothing looking
   * wrong: the ratio is standard, the arithmetic is exact, and every number is
   * quietly half. There is no signal in the file to catch that — only a second
   * measurement does.
   *
   * So the badge stays up until somebody checks — and the badge, plus the
   * link beside it, is the WHOLE of the nudge. Picking a scale used to open
   * the check overlay itself; see `commit` for why that was wrong.
   */
  const unchecked = isSet && !sheet.scaleCheckedAt;

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    []
  );

  const showFlash = () => {
    setFlash(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), FLASH_MS);
  };

  /**
   * ── SETTING A SCALE SETS IT. Nothing else. ─────────────────────────────────
   *
   * Both of these used to open the check overlay the moment a scale was saved.
   * The intent was good and the behaviour was wrong in two ways at once
   * (reported 2026-09-24): it answered a question nobody asked, and the panel
   * it opened landed over the middle of the drawing — exactly where the first
   * point of a trace has to go. Setting a scale is usually the step BEFORE
   * doing something, so hijacking it costs a dismissal every single time.
   *
   * **This supersedes the "strongly recommend measuring after picking" rule**
   * written into this file on 2026-09-21. The reasoning behind it still holds —
   * a typed scale is only true if the print is at full size — but the way to
   * act on it is the `not checked` chip and a link beside it. Encourage, never
   * hijack.
   */
  const commit = async () => {
    const text = draft.trim();
    if (!text) {
      setDraft("");
      return;
    }
    const parsed = parseScaleText(text);
    // Invalid reverts rather than erroring — there is nowhere here to put a
    // message, and leaving a bad draft on screen is how someone comes to
    // believe they set a scale they did not.
    if (!parsed) {
      setDraft("");
      return;
    }
    if (parsed.text === sheet.scaleText) {
      setDraft("");
      return;
    }
    await onSet(text);
    setDraft("");
    showFlash();
    setOpen(false);
  };

  /** Take a scale from the list. Saves, closes, and stops there. */
  const pick = async (text: string) => {
    await onSet(text);
    showFlash();
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Popover
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) setDraft("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 gap-1.5 text-xs transition-colors",
              flash &&
                "border border-emerald-500 bg-emerald-500/10 text-emerald-300",
              !isSet && !flash && !wanted && "text-muted-foreground",
              !isSet &&
                !flash &&
                wanted &&
                "text-[#F5C518] hover:text-[#F5C518]"
            )}
            title={
              isSet
                ? offStandard
                  ? `The scale this sheet is drawn at. It is ${Math.abs(standard!.percentOff).toFixed(0)}% off the nearest standard scale (${standard!.nearestText}) — worth a check. Click to change it.`
                  : "The scale this sheet is drawn at — click to change it"
                : wanted
                  ? "Measuring needs a scale — click to set one for this sheet"
                  : "No scale set. Counting works without one; only measuring needs it."
            }
          >
            <Ruler className="w-3.5 h-3.5" />
            {isSet ? (
              <span className="flex items-center gap-1">
                {offStandard && (
                  <TriangleAlert className="w-3 h-3 text-orange-400" />
                )}
                <span className="font-mono">{label}</span>
                {/*
                  Quieter than the off-standard triangle on purpose. "Not
                  checked" is the ordinary state of a scale somebody just set —
                  it is a nudge, not an alarm, and an alarm on every sheet is
                  one nobody reads by Thursday.
                */}
                {unchecked && (
                  <span className="text-[0.65rem] text-muted-foreground">
                    · not checked
                  </span>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                {wanted && <TriangleAlert className="w-3 h-3" />}
                {notToScale ? "Not to scale" : "Set scale"}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        {/*
          No exit animation. Both measure buttons close this and hand the
          drawing straight to a two-click tool — a dropdown fading out over the
          spot the first click is aimed at is a dropdown still in the way.

          ── Quick first: TYPE or PICK, at the top ─────────────────────────────
          Reordered 2026-09-24. Measuring used to lead, with a paragraph under
          it, then "or", then the field, then the list — so the fast path was
          at the bottom of a tall box. Setting a scale should take one click
          when the sheet states it: the field is first (and takes focus), the
          standard list is right under it, and picking or typing saves and
          closes. Nothing else opens.

          Measuring is still here, smaller and lower, and so is the check. The
          reason measuring once led — it does not depend on the print being at
          true size — is what the "not checked" nudge is for.
        */}
        <PopoverContent
          align="start"
          className="w-72 p-3 space-y-2.5 data-[state=closed]:animate-none!"
        >
          <div className="flex items-baseline gap-2">
            <span
              className="text-sm font-medium truncate"
              title="Stored for this sheet alone — other sheets in the same PDF keep their own."
            >
              Scale for {sheet.name}
            </span>
          </div>

          <div className="space-y-1">
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onFocus={selectOnFocus}
              onBlur={() => void commit()}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraft("");
                  setOpen(false);
                }
              }}
              placeholder={`Type a scale — 1/4" = 1'-0"`}
              className="h-8 text-sm font-mono"
              aria-label={`Type a scale for ${sheet.name}`}
            />
            {/*
              These are FORMATS, not alternative scales. It once read "Also
              reads 1" = 20' and 1:100" under a field showing 1/4" = 1'-0",
              which landed as three different scales being offered.
            */}
            <p className="text-[0.65rem] text-muted-foreground">
              Any form works:{" "}
              <span className="font-mono">1/4&quot; = 1&apos;-0&quot;</span>,{" "}
              <span className="font-mono">1&quot; = 20&apos;</span>,{" "}
              <span className="font-mono">1:100</span>
            </p>
          </div>

          {/* A reading found but not trusted enough to apply. One click to
              accept, and plainly labelled as something read off the sheet. */}
          {!isSet && sheet.detectedScaleText && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-full gap-1.5 text-xs border-[#F5C518]/40"
              onClick={() => pick(sheet.detectedScaleText!)}
              title="This sheet mentions it, but not clearly enough to use it without asking"
            >
              <Check className="w-3 h-3" /> Use{" "}
              <span className="font-mono">{sheet.detectedScaleText}</span>
              <span className="text-muted-foreground">— on the sheet</span>
            </Button>
          )}

          <div className="max-h-44 overflow-y-auto grid grid-cols-2 gap-1">
            {COMMON_SCALES.map(scale => (
              <button
                key={scale.text}
                onClick={() => pick(scale.text)}
                className={cn(
                  "text-left px-2 py-1 rounded text-xs font-mono transition-colors",
                  sheet.scaleRatio === scale.ratio
                    ? "bg-[#F5C518]/15 text-[#F5C518]"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {scale.text}
              </button>
            ))}
          </div>

          {notToScale && !isSet && (
            <p className="text-[0.7rem] text-muted-foreground">
              This sheet is marked{" "}
              <span className="text-foreground">not to scale</span>. Set one
              only if you intend to measure against it anyway.
            </p>
          )}

          <div className="border-t border-border pt-2 space-y-1.5">
            {/*
              What the scale in force IS, in one or two quiet lines. The exact
              ratio stays reachable because it is what every measurement uses,
              and hiding it would make a 0.5% snap impossible to notice.
            */}
            {isSet && (
              <p className="text-[0.7rem] text-muted-foreground">
                1&quot; of paper ={" "}
                <span className="font-mono text-foreground">
                  {(Number(sheet.scaleRatio) / 12).toFixed(2)} ft
                </span>
                {sheet.scaleText && sheet.scaleText !== label && (
                  <>
                    {" "}
                    · stored as{" "}
                    <span className="font-mono">{sheet.scaleText}</span>
                  </>
                )}
                {sheet.scaleCheckedAt && (
                  <span className="text-emerald-400"> · checked</span>
                )}
              </p>
            )}

            {/*
              Off-standard, NOT phrased as an error: a set scaled in printing,
              a misread dimension and a drawing genuinely at an odd scale all
              produce it, and only one is a mistake.
            */}
            {offStandard && standard && (
              <p className="text-[0.7rem] text-orange-300 flex items-start gap-1.5">
                <TriangleAlert className="w-3 h-3 shrink-0 mt-0.5" />
                <span>
                  {Math.abs(standard.percentOff).toFixed(0)}%{" "}
                  {standard.percentOff > 0 ? "above" : "below"}{" "}
                  <span className="font-mono">{standard.nearestText}</span>. A
                  printed set often is — worth a look if you measured it.
                </span>
              </p>
            )}

            {/*
              A typed scale is only true if the PDF is at its true print size;
              a half-size set reads half length with nothing looking wrong. One
              line saying so, and the check beside it.
            */}
            {unchecked && (
              <p className="text-[0.7rem] text-muted-foreground">
                Not checked — a half-size print reads half length.
              </p>
            )}

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setOpen(false);
                  onMeasure();
                }}
                title="Click the two ends of a distance you know. Works on a sheet that states no scale, or one printed at the wrong size."
              >
                <Ruler className="w-3 h-3" /> Measure it
              </Button>
              {unchecked && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 gap-1.5 text-xs text-[#F5C518] hover:text-[#F5C518]"
                  onClick={() => {
                    setOpen(false);
                    onCheck();
                  }}
                  title="Measure one known dimension to confirm this scale"
                >
                  <Check className="w-3 h-3" /> Check it
                </Button>
              )}
              {isSet && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 gap-1.5 text-xs text-muted-foreground ml-auto"
                  onClick={() => {
                    onClear();
                    setOpen(false);
                  }}
                >
                  <X className="w-3 h-3" /> Clear
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/*
        ── The whole nudge: a chip that says so, and one link ─────────────────
        Outside the popover, so acting on it costs one click rather than three,
        and outside the trigger so it does not open the popover on the way
        past. This is what REPLACED the overlay that used to open itself the
        moment a scale was saved — see `commit`. Encourage, never hijack.
      */}
      {unchecked && (
        <button
          type="button"
          onClick={onCheck}
          className="text-[0.7rem] text-[#F5C518] underline underline-offset-2 hover:text-[#F5C518]/80 shrink-0"
          title="Measure one known dimension to confirm this scale"
        >
          Check it
        </button>
      )}

      {/* Labelled, so a scale the app read is never mistaken for one chosen. */}
      {isSet && sheet.scaleSource === "detected" && (
        <Badge
          variant="outline"
          className="text-[0.65rem] px-1.5 py-0 border-border text-muted-foreground"
          title="Read from this sheet — check it before measuring"
        >
          Detected
        </Badge>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {flash ? `Scale for ${sheet.name} saved` : ""}
      </span>
    </div>
  );
}
