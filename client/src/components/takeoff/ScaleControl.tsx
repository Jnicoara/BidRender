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
import { COMMON_SCALES, parseScaleText } from "@shared/planScale";

const FLASH_MS = 1100;

export type ScaleSheet = {
  id: number;
  name: string;
  scaleRatio: number | null;
  scaleText: string | null;
  scaleSource: "detected" | "manual" | "none";
  detectedScaleText: string | null;
};

export function ScaleControl({
  sheet,
  onSet,
  onClear,
  notToScale,
  wanted,
}: {
  sheet: ScaleSheet;
  onSet: (scaleText: string) => void;
  onClear: () => void;
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

  /** Commit the typed scale. Unreadable or unchanged input writes nothing. */
  const commit = () => {
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
    onSet(text);
    setDraft("");
    showFlash();
    setOpen(false);
  };

  const pick = (text: string) => {
    onSet(text);
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
                ? "The scale this sheet is drawn at — click to change it"
                : wanted
                  ? "Measuring needs a scale — click to set one for this sheet"
                  : "No scale set. Counting works without one; only measuring needs it."
            }
          >
            <Ruler className="w-3.5 h-3.5" />
            {isSet ? (
              <span className="font-mono">{sheet.scaleText}</span>
            ) : (
              <span className="flex items-center gap-1">
                {wanted && <TriangleAlert className="w-3 h-3" />}
                {notToScale ? "Not to scale" : "Set scale"}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-72 space-y-3">
          <div>
            <div className="text-sm font-medium">Scale for {sheet.name}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Stored for this sheet alone — other sheets in the same PDF keep
              their own.
            </p>
          </div>

          {/* A reading found but not trusted enough to apply. One click to
              accept, and plainly labelled as something read off the sheet. */}
          {!isSet && sheet.detectedScaleText && (
            <div className="rounded-lg border border-[#F5C518]/40 bg-[#F5C518]/5 p-2.5">
              <p className="text-xs text-muted-foreground">
                This sheet mentions{" "}
                <span className="font-mono text-foreground">
                  {sheet.detectedScaleText}
                </span>
                , but not clearly enough to use it without asking.
              </p>
              <Button
                size="sm"
                className="h-7 mt-2 w-full gap-1.5 text-xs"
                onClick={() => pick(sheet.detectedScaleText!)}
              >
                <Check className="w-3 h-3" /> Use {sheet.detectedScaleText}
              </Button>
            </div>
          )}

          {notToScale && !isSet && (
            <p className="text-xs text-muted-foreground">
              This sheet is marked{" "}
              <span className="text-foreground">not to scale</span>. Set one
              only if you intend to measure against it anyway.
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Type a scale
            </label>
            <Input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onFocus={selectOnFocus}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraft("");
                  setOpen(false);
                }
              }}
              placeholder={`1/4" = 1'-0"`}
              className="h-8 text-sm font-mono"
              aria-label={`Scale for ${sheet.name}`}
            />
            <p className="text-[0.7rem] text-muted-foreground">
              Also reads <span className="font-mono">1" = 20'</span> and{" "}
              <span className="font-mono">1:100</span>.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Or pick a common one
            </label>
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
          </div>

          {isSet && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full gap-1.5 text-xs text-muted-foreground"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              <X className="w-3 h-3" /> Clear the scale
            </Button>
          )}
        </PopoverContent>
      </Popover>

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
